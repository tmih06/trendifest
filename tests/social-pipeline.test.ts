import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { closeDb, getDb, toVectorLiteral } from "../server/db.ts";
import {
  CLUSTER_THRESHOLDS,
  deletePost,
  expirePosts,
  ingestPost,
  listClusters,
  searchAcrossSpaces,
  segmentCoverage,
  socialSignals,
} from "../server/social/pipeline.ts";
import type { Space } from "../server/db.ts";
import { postId, type SourcePost } from "../server/social/input.ts";
import { VIEWER_SEGMENTS } from "../shared/segments.ts";
/**
 * These tests exercise the collection invariants that are easy to regress and
 * expensive to notice: a post observed twice must not count as two posts, a
 * second segment must be a crossing, a delete must remove derived vectors, and a
 * failed segment must read as unknown rather than zero.
 *
 * They need a database. `TRENDIFEST_TEST_DATABASE_URL` points at a scratch
 * database whose collection tables are truncated for isolation; without it the
 * suite is skipped so `bun test` stays runnable without Postgres.
 */

const TEST_URL = process.env.TRENDIFEST_TEST_DATABASE_URL ?? "";
/** A 1024-dim unit vector, matching the padded embedding column. */
const PADDING_VECTOR = `[${["1", ...Array<string>(1023).fill("0")].join(",")}]`;

function cosine(a: number[], b: number[]) {
  let dot = 0;
  let aNorm = 0;
  let bNorm = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index]! * b[index]!;
    aNorm += a[index]! * a[index]!;
    bNorm += b[index]! * b[index]!;
  }
  return dot / Math.sqrt(aNorm * bNorm);
}
const enabled = TEST_URL.length > 0;

if (enabled) process.env.TRENDIFEST_DATABASE_URL = TEST_URL;

/** Real Vietnamese records exercise the acceptance gate before database/inference work. */
function fixturePost(overrides: Partial<SourcePost> & { uri: string }): SourcePost {
  return {
    source: "voz",
    title: "",
    evidenceType: "discussion",
    publisher: null,
    authorId: "test-author",
    authorHandle: "test-author",
    text: "Con mèo làm rơi chiếc cốc thủy tinh từ trên bàn xuống sàn nhà.",
    kind: "text",
    permalink: "https://voz.vn/t/test-thread.1/",
    publishedAt: new Date().toISOString(),
    timeKind: "activity",
    media: [],
    engagement: null,
    ...overrides,
  };
}

const CAT_TEXT = "Con mèo làm rơi chiếc cốc thủy tinh từ trên bàn xuống sàn nhà.";
const FINANCE_TEXT = "Cuộc họp công bố kết quả kinh doanh quý này được chuyển sang chiều thứ Năm.";

describe.skipIf(!enabled)("social collection pipeline", () => {
  beforeEach(async () => {
    const db = await getDb();
    await db`TRUNCATE cluster_members, clusters, embeddings, metric_snapshots, observations, posts RESTART IDENTITY CASCADE`;
  });
  afterAll(closeDb);

  test("stores accepted Vietnamese input with its actual collection context", async () => {
    await ingestPost(fixturePost({ uri: "urn:thread:one" }), "voz");
    const db = await getDb();
    const [stored] =
      await db`SELECT source, lang, body FROM posts WHERE id = ${postId("voz", "urn:thread:one")}`;
    expect(stored?.source).toBe("voz");
    expect(stored?.lang).toEqual(["vi"]);
    expect(stored?.body).toBe(CAT_TEXT);
    const signals = await socialSignals(72);
    expect(signals.stats.posts).toBe(1);
    expect(signals.stats.observations).toBe(1);
    expect(signals.stats.unvectorized).toBe(0);
  });

  test("redelivery preserves vectors and keeps only the latest measured counters", async () => {
    const post = fixturePost({
      uri: "urn:thread:duplicate",
      engagement: { replies: 3, capturedAt: new Date(Date.now() - 1000).toISOString() },
    });
    await ingestPost(post, "voz");
    const db = await getDb();
    const before =
      await db`SELECT created_at FROM embeddings WHERE post_id = ${postId("voz", post.uri)}`;
    await ingestPost(
      { ...post, engagement: { replies: 7, capturedAt: new Date().toISOString() } },
      "voz",
    );
    const after =
      await db`SELECT created_at FROM embeddings WHERE post_id = ${postId("voz", post.uri)}`;
    expect(after).toEqual(before);
    const metrics =
      await db`SELECT replies, likes FROM metric_snapshots WHERE post_id = ${postId("voz", post.uri)}`;
    expect(metrics).toHaveLength(1);
    expect(Number(metrics[0]?.replies)).toBe(7);
    expect(metrics[0]?.likes).toBeNull();
  });

  test("Vietnamese paraphrases join while unrelated content remains separate", async () => {
    await ingestPost(fixturePost({ uri: "urn:thread:cat-a" }), "voz");
    await ingestPost(
      fixturePost({
        uri: "urn:thread:cat-b",
        text: "Con mèo đẩy chiếc cốc thủy tinh trên bàn rơi xuống sàn nhà.",
      }),
      "voz",
    );
    await ingestPost(fixturePost({ uri: "urn:thread:finance", text: FINANCE_TEXT }), "voz");
    const clusters = await listClusters(20);
    const cat = clusters.find((cluster) =>
      cluster.examples.some((example) => example.text.includes("mèo")),
    );
    expect(cat?.size).toBe(2);
    expect(cat?.examples.every((example) => !example.text.includes("kinh doanh"))).toBe(true);
    expect(
      clusters.some((cluster) =>
        cluster.examples.some((example) => example.text.includes("kinh doanh")),
      ),
    ).toBe(true);
  });

  test("a source takedown removes vectors and cluster contributions", async () => {
    const uri = "urn:thread:deleted";
    await ingestPost(fixturePost({ uri }), "voz");
    await deletePost("voz", uri);
    const db = await getDb();
    const id = postId("voz", uri);
    const [post] = await db`SELECT deleted_at FROM posts WHERE id = ${id}`;
    expect(post?.deleted_at).not.toBeNull();
    expect(await db`SELECT 1 FROM embeddings WHERE post_id = ${id}`).toHaveLength(0);
    expect(await db`SELECT 1 FROM cluster_members WHERE post_id = ${id}`).toHaveLength(0);
    expect(
      (await listClusters()).some((cluster) =>
        cluster.examples.some((example) => example.uri === id),
      ),
    ).toBe(false);
  });

  test("copies on independent sources retain provenance and cross-context evidence", async () => {
    const text = "Cùng một câu chuyện hài hước đang được chia sẻ trong hai cộng đồng khác nhau.";
    await ingestPost(fixturePost({ uri: "same-native-id", authorId: "same-handle", text }), "voz");
    await ingestPost(
      fixturePost({
        uri: "same-native-id",
        source: "otofun",
        authorId: "same-handle",
        text,
        permalink: "https://www.otofun.net.vn/threads/test.1/",
      }),
      "otofun",
    );
    const clusters = await listClusters(20);
    const shared = clusters.find((cluster) =>
      cluster.examples.some((example) => example.text === text),
    );
    expect(shared?.size).toBe(2);
    expect(shared?.crossings).toBe(1);
    expect(shared?.segments.sort()).toEqual(["otofun", "voz"]);
    expect(new Set(shared?.examples.map((example) => example.source))).toEqual(
      new Set(["voz", "otofun"]),
    );
  });

  test("coverage includes an unobserved source without inventing posts", async () => {
    await ingestPost(fixturePost({ uri: "urn:thread:coverage" }), "voz");
    const coverage = await segmentCoverage(72);
    expect(coverage.find((row) => row.segmentId === "voz")?.posts).toBe(1);
    expect(coverage.find((row) => row.segmentId === "otofun")?.posts).toBe(0);
    expect(coverage.find((row) => row.segmentId === "otofun")?.lastObservedAt).toBeNull();
    expect(coverage.map((row) => row.segmentId).sort()).toEqual(
      VIEWER_SEGMENTS.map((segment) => segment.id).sort(),
    );
  });

  test("an edited record cannot keep its former semantic evidence", async () => {
    const post = fixturePost({ uri: "urn:thread:edited" });
    await ingestPost(post, "voz");
    await ingestPost({ ...post, text: FINANCE_TEXT }, "voz");
    const clusters = await listClusters(20);
    expect(clusters.flatMap((cluster) => cluster.examples).map((example) => example.text)).toEqual([
      FINANCE_TEXT,
    ]);
    await ingestPost(
      { ...post, text: "The best places to visit in Vietnam with your family this summer." },
      "voz",
    );
    const db = await getDb();
    expect(await db`SELECT 1 FROM posts WHERE id = ${postId("voz", post.uri)}`).toHaveLength(0);
    expect(await listClusters()).toHaveLength(0);
  });

  test("expiry removes stale records and vectors without removing fresh input", async () => {
    await ingestPost(fixturePost({ uri: "urn:thread:expired" }), "voz");
    await ingestPost(fixturePost({ uri: "urn:thread:fresh", text: FINANCE_TEXT }), "voz");
    const db = await getDb();
    const expired = postId("voz", "urn:thread:expired");
    await db`UPDATE posts SET published_at = now() - interval '31 days' WHERE id = ${expired}`;
    expect(await expirePosts()).toBe(1);
    expect(await db`SELECT 1 FROM posts WHERE id = ${expired}`).toHaveLength(0);
    expect(await db`SELECT 1 FROM embeddings WHERE post_id = ${expired}`).toHaveLength(0);
    expect(
      (await listClusters()).flatMap((cluster) => cluster.examples).map((example) => example.text),
    ).toEqual([FINANCE_TEXT]);
  });

  test("rank fusion retrieves the Vietnamese post matching the query", async () => {
    await ingestPost(fixturePost({ uri: "urn:thread:cat" }), "voz");
    await ingestPost(fixturePost({ uri: "urn:thread:business", text: FINANCE_TEXT }), "voz");
    const results = await searchAcrossSpaces("con mèo và chiếc cốc thủy tinh", 5);
    expect(results[0]?.uri).toBe(postId("voz", "urn:thread:cat"));
    expect(results[0]?.source).toBe("voz");
  });
});

describe("vector literal encoding", () => {
  test("normalizes to unit length and pads to the shared dimension", () => {
    const literal = toVectorLiteral([3, 4]);
    const values = literal
      .replace(/^\[|\]$/g, "")
      .split(",")
      .map(Number);
    expect(values).toHaveLength(1024);
    expect(values[0]).toBeCloseTo(0.6, 6);
    expect(values[1]).toBeCloseTo(0.8, 6);
    expect(values[2]).toBe(0);
  });

  test("an all-zero vector stays zero rather than producing NaN", () => {
    const literal = toVectorLiteral([0, 0, 0]);
    expect(literal).not.toContain("NaN");
    expect(literal.startsWith("[0,0,0,")).toBe(true);
  });
});

describe.skipIf(!enabled)("cluster linkage invariant", () => {
  /**
   * The invariant that single-link chaining broke twice: every member of a
   * cluster is at least JOIN_THRESHOLD from every other member. A running-mean
   * centroid alone allowed A~B~C chains where A and C were unrelated, producing
   * a 63-member cluster whose true minimum pairwise cosine was 0.558.
   */
  test("no cluster contains a pair below its space threshold", async () => {
    const db = await getDb();
    // Seed a genuine pair so the invariant is checked on a real multi-member
    // cluster rather than vacuously passing on singletons.
    await ingestPost(
      fixturePost({
        uri: "urn:thread:linkage-a",
        text: "Camera của chiếc điện thoại mới chụp ảnh ban đêm rất đẹp và rõ nét.",
      }),
      "voz",
    );
    await ingestPost(
      fixturePost({
        uri: "urn:thread:linkage-b",
        text: "Chiếc điện thoại mới chụp ảnh rất đẹp và rõ nét khi trời tối.",
      }),
      "voz",
    );

    const clusters = (await db`
      SELECT id, space FROM clusters WHERE member_count BETWEEN 2 AND 40
    `) as unknown as Array<{ id: string; space: Space }>;

    let checked = 0;
    for (const cluster of clusters) {
      const rows = (await db`
        SELECT e.vec::text AS vec FROM cluster_members m
        JOIN embeddings e ON e.post_id = m.post_id AND e.span = m.span
        WHERE m.cluster_id = ${cluster.id}
      `) as unknown as Array<{ vec: string }>;
      if (rows.length < 2) continue;

      const vectors = rows.map((row) =>
        row.vec
          .replace(/^\[|\]$/g, "")
          .split(",")
          .map(Number),
      );

      for (let i = 0; i < vectors.length; i += 1) {
        for (let j = i + 1; j < vectors.length; j += 1) {
          const similarity = cosine(vectors[i]!, vectors[j]!);
          // A tiny epsilon absorbs the six-decimal wire rounding.
          expect(similarity).toBeGreaterThanOrEqual(CLUSTER_THRESHOLDS[cluster.space] - 0.001);
        }
      }
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  });

  test("a third post far from one member does not chain into the pair", async () => {
    const db = await getDb();
    // This is the failure that produced the 63-member catch-all: B is close to
    // A, C is close to B, but A and C are unrelated. Complete linkage must
    // refuse C rather than let B bridge them.
    const pair = (await db`
      SELECT id FROM clusters WHERE member_count >= 2 ORDER BY member_count DESC LIMIT 1
    `) as unknown as Array<{ id: string }>;
    const before = pair[0]?.id;

    await ingestPost(fixturePost({ uri: "urn:thread:linkage-c", text: FINANCE_TEXT }), "voz");

    if (before) {
      const members = (await db`
        SELECT post_id FROM cluster_members WHERE cluster_id = ${before}
      `) as unknown as Array<{ post_id: string }>;
      expect(members.some((row) => row.post_id.endsWith("linkage-c"))).toBe(false);
    }
    expect(before).toBeDefined();
  });

  test("clusters are not dominated by one oversized catch-all", async () => {
    const db = await getDb();
    const [row] = (await db`
      SELECT coalesce(max(member_count), 0)::int AS largest,
             coalesce(sum(member_count), 0)::int AS total,
             count(*)::int AS clusters
      FROM clusters
    `) as unknown as Array<{ largest: number; total: number; clusters: number }>;

    // Guards against the drift failure where one cluster absorbed most posts.
    expect(Number(row?.largest ?? 0)).toBeLessThan(Number(row?.total ?? 1));
    expect(Number(row?.clusters ?? 0)).toBeGreaterThan(0);
  });
});

describe.skipIf(!enabled)("cluster retirement", () => {
  /**
   * The old cap path deleted *clusters*, and the foreign key cascaded their
   * memberships away. On a busy space the cap is hit constantly, so a post
   * could be vectorised and then lose the only cluster it ever belonged to —
   * the real corpus ended with 18k embedded posts in no cluster at all, and the
   * map showed a wall of single-member patterns. Retirement must archive.
   */
  test("retiring a cluster keeps its members instead of orphaning them", async () => {
    const db = await getDb();
    await db`TRUNCATE cluster_members, clusters, embeddings, metric_snapshots, observations, posts RESTART IDENTITY CASCADE`;

    const retiredUri = "urn:thread:retired";
    await db`
      INSERT INTO posts (id, source, uri, author_id, body, kind, permalink, published_at, content_hash)
      VALUES (${retiredUri}, 'voz', ${retiredUri}, 'voz:retire',
        'Một bài viết cần giữ lại bằng chứng thuộc về cụm nội dung.', 'text',
        'https://voz.vn/t/retire.5/', now(), 'retire')
    `;
    await db`
      INSERT INTO clusters (id, space, model, dim, centroid, member_count, first_seen_at, last_seen_at)
      VALUES ('retiring', 'text', 'test', 2, ${PADDING_VECTOR}::vector, 1,
        now() - interval '10 days', now() - interval '10 days')
    `;
    await db`
      INSERT INTO cluster_members (cluster_id, post_id, span, similarity)
      VALUES ('retiring', ${retiredUri}, 'body', 1)
    `;

    // Fill a space past the cap with clusters that are newer than the victim.
    for (let index = 0; index < 401; index += 1) {
      const uri = `urn:thread:cap:${index}`;
      await db`
        INSERT INTO posts (id, source, uri, author_id, body, kind, permalink, published_at, content_hash)
        VALUES (${uri}, 'voz', ${uri}, ${`voz:cap${index}`},
          'Nội dung thử nghiệm giới hạn số lượng cụm.', 'text', 'https://voz.vn/t/cap.6/', now(), ${uri})
      `;
      await db`
        INSERT INTO clusters (id, space, model, dim, centroid, member_count, first_seen_at, last_seen_at)
        VALUES (${`cap-${index}`}, 'text', 'test', 2,
          ${toVectorLiteral([Math.cos(index), Math.sin(index)])}::vector, 1, now(), now())
      `;
      await db`
        INSERT INTO cluster_members (cluster_id, post_id, span, similarity)
        VALUES (${`cap-${index}`}, ${uri}, 'body', 1)
      `;
    }

    // One more vector forces a retirement pass over the capped space.
    await ingestPost(
      fixturePost({
        uri: "urn:thread:retire-new",
        text: "Buổi bình minh trên bến cảng, những chiếc cần cẩu đang nâng các thùng hàng.",
      }),
      "voz",
    );

    const [row] = (await db`
      SELECT count(*)::int AS members FROM cluster_members WHERE cluster_id = 'retiring'
    `) as unknown as Array<{ members: number }>;
    expect(Number(row?.members)).toBe(1);

    const [archived] = (await db`
      SELECT count(*)::int AS n FROM clusters WHERE archived_at IS NOT NULL
    `) as unknown as Array<{ n: number }>;
    expect(Number(archived?.n)).toBeGreaterThan(0);
  });
});
