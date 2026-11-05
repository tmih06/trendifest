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
import { buildTrendMap } from "../server/social/trend-map.ts";
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

describe.skipIf(!enabled)("trend map scoring", () => {
  /**
   * The score is a heuristic, but its ordering must respect the one property a
   * funder will check: independent authors outrank raw volume. The first
   * cluster measured in production had 64 posts from a single account, so a
   * post-count-driven score would rank a counter bot above real adoption.
   */
  test("a multi-author pattern outranks a single-account burst of the same size", async () => {
    const db = await getDb();
    await db`
      TRUNCATE cluster_members, clusters, embeddings, metric_snapshots, observations, posts
      RESTART IDENTITY CASCADE
    `;

    // One account posts six times about the same thing.
    for (let index = 0; index < 6; index += 1) {
      await db`
        INSERT INTO posts (id, source, uri, author_id, body, kind, permalink, published_at, content_hash)
        VALUES (${`urn:thread:burst-${index}`}, ${"voz"}, ${`urn:thread:burst-${index}`},
                ${"voz:bot"}, ${"Tài khoản tự động đăng lặp lại cùng một nội dung."}, ${"text"},
                ${"https://voz.vn/t/test-bot.1/"}, now(), ${`burst-${index}`})
      `;
    }
    // Six different accounts post the same meme.
    for (let index = 0; index < 6; index += 1) {
      await db`
        INSERT INTO posts (id, source, uri, author_id, body, kind, permalink, published_at, content_hash)
        VALUES (${`urn:thread:meme-${index}`}, ${"voz"}, ${`urn:thread:meme-${index}`},
                ${`voz:human${index}`}, ${"Một câu chuyện hài hước được nhiều người cùng chia sẻ."}, ${"text"},
                ${"https://voz.vn/t/test-meme.2/"}, now(), ${`meme-${index}`})
      `;
    }

    // Two clusters with identical member counts but different author counts.
    for (const clusterId of [
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000002",
    ] as const) {
      await db`
        INSERT INTO clusters (id, space, model, dim, centroid, member_count, first_seen_at, last_seen_at)
        VALUES (${clusterId}, ${"text"}, ${"test"}, ${4},
                ${PADDING_VECTOR}::vector, 6, now() - interval '2 hours', now())
      `;
    }
    for (let index = 0; index < 6; index += 1) {
      await db`
        INSERT INTO cluster_members (cluster_id, post_id, span, similarity)
        VALUES (${"00000000-0000-0000-0000-000000000001"},
                ${`urn:thread:burst-${index}`}, ${"body"}, 1)
      `;
      // The map joins observations, so a cluster with members but no observed
      // segment is invisible — a real invariant worth encoding here.
      await db`
        INSERT INTO observations (post_id, segment_id, observed_at, via)
        VALUES (${`urn:thread:burst-${index}`}, ${"voz"}, now(), ${"rss"})
      `;
      await db`
        INSERT INTO cluster_members (cluster_id, post_id, span, similarity)
        VALUES (${"00000000-0000-0000-0000-000000000002"},
                ${`urn:thread:meme-${index}`}, ${"body"}, 1)
      `;
      await db`
        INSERT INTO observations (post_id, segment_id, observed_at, via)
        VALUES (${`urn:thread:meme-${index}`}, ${"voz"}, now(), ${"rss"})
      `;
    }

    const map = await buildTrendMap(24);
    const patterns = map.nodes.filter((node) => node.kind === "pattern");
    const bot = patterns.find((node) => node.clusterId === "00000000-0000-0000-0000-000000000001");
    const humans = patterns.find(
      (node) => node.clusterId === "00000000-0000-0000-0000-000000000002",
    );

    expect(bot?.posts).toBe(6);
    expect(humans?.posts).toBe(6);
    expect(humans?.potential ?? 0).toBeGreaterThan(bot?.potential ?? 0);
    // Radius must follow the score, since size is the map's only encoding.
    expect(humans?.radius ?? 0).toBeGreaterThan(bot?.radius ?? 0);
  });

  test("velocity is neutral while history is too short to compare", async () => {
    const map = await buildTrendMap(24);
    expect(map.method.velocityComparable).toBe(false);
    const scores = map.nodes.flatMap((node) => (node.score ? [node.score.velocity] : []));
    expect(scores.length).toBeGreaterThan(0);
    // Neutral 0.5, never the 1.0 that "no prior window" used to imply.
    expect(scores.every((value) => value === 0.5)).toBe(true);
  });

  test("every node and edge id is unique", async () => {
    const map = await buildTrendMap(24);
    const ids = map.nodes.map((node) => node.id);
    const edgeIds = map.edges.map((edge) => edge.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(edgeIds).size).toBe(edgeIds.length);
    // A pattern must be reachable from the map, never orphaned off-graph.
    const targets = new Set(map.edges.map((edge) => edge.target));
    const orphans = map.nodes.filter((node) => node.kind === "pattern" && !targets.has(node.id));
    expect(orphans).toHaveLength(0);
  });
});

describe.skipIf(!enabled)("trend map stratification", () => {
  /** A quieter source must retain representation when another supplies a stronger cluster. */
  test("a quieter source's pattern appears alongside a higher-volume source", async () => {
    const db = await getDb();
    await db`
      TRUNCATE cluster_members, clusters, embeddings, metric_snapshots, observations, posts
      RESTART IDENTITY CASCADE
    `;

    /** Seed one cluster of `size` posts, one account each, in one segment. */
    const seed = async (clusterId: string, size: number, segment: string) => {
      await db`
        INSERT INTO clusters (id, space, model, dim, centroid, member_count, first_seen_at, last_seen_at)
        VALUES (${clusterId}, ${"text"}, ${"test"}, ${4}, ${PADDING_VECTOR}::vector,
                ${size}, now() - interval '2 hours', now())
      `;
      for (let index = 0; index < size; index += 1) {
        const postId = `urn:thread:${clusterId.slice(0, 6)}:${index}`;
        await db`
          INSERT INTO posts (id, source, uri, author_id, body, kind, permalink, published_at, content_hash)
          VALUES (${postId}, ${segment}, ${postId}, ${`${segment}:author-${index}`},
                  ${"Một mẫu thảo luận được chia sẻ trong cộng đồng tiếng Việt."}, ${"text"},
                  ${"https://voz.vn/t/test-source.3/"}, now(), ${postId})
        `;
        await db`
          INSERT INTO cluster_members (cluster_id, post_id, span, similarity)
          VALUES (${clusterId}, ${postId}, ${"body"}, 1)
        `;
        await db`
          INSERT INTO observations (post_id, segment_id, observed_at, via)
          VALUES (${postId}, ${segment}, now(), ${"feed"})
        `;
      }
    };

    await seed("11111111-1111-1111-1111-111111111111", 30, "voz");
    await seed("22222222-2222-2222-2222-222222222222", 2, "otofun");

    const map = await buildTrendMap(72);
    const sources = new Set(map.edges.map((edge) => edge.source));
    expect(sources.has("segment:voz")).toBe(true);
    expect(sources.has("segment:otofun")).toBe(true);
  });
});

describe.skipIf(!enabled)("pattern similarity graph", () => {
  test("links measured neighbors without crossing model spaces or exceeding the degree cap", async () => {
    const db = await getDb();
    await db`TRUNCATE cluster_members, clusters, embeddings, metric_snapshots, observations, posts RESTART IDENTITY CASCADE`;
    const belowThreshold = toVectorLiteral([0.74, Math.sqrt(1 - 0.74 ** 2)]);
    const fixtures = [
      { id: "near-a", space: "text", model: "same", dim: 2, vector: PADDING_VECTOR },
      { id: "near-b", space: "text", model: "same", dim: 2, vector: PADDING_VECTOR },
      { id: "near-c", space: "text", model: "same", dim: 2, vector: PADDING_VECTOR },
      { id: "near-d", space: "text", model: "same", dim: 2, vector: PADDING_VECTOR },
      { id: "near-e", space: "text", model: "same", dim: 2, vector: PADDING_VECTOR },
      { id: "weak", space: "text", model: "same", dim: 2, vector: belowThreshold },
      { id: "other-model", space: "text", model: "different", dim: 2, vector: PADDING_VECTOR },
      { id: "other-space", space: "image", model: "same", dim: 2, vector: PADDING_VECTOR },
      { id: "other-dim", space: "text", model: "same", dim: 3, vector: PADDING_VECTOR },
    ];
    for (const fixture of fixtures) {
      const uri = `urn:thread:similarity:${fixture.id}`;
      await db`
        INSERT INTO posts (id, source, uri, author_id, body, kind, permalink, published_at, content_hash)
        VALUES (${uri}, 'voz', ${uri}, ${`voz:${fixture.id}`},
          'Một mẫu thảo luận với đầy đủ nội dung để hiển thị trên bản đồ.', 'text',
          'https://voz.vn/t/example.4/', now(), ${fixture.id})
      `;
      await db`
        INSERT INTO clusters (id, space, model, dim, centroid, member_count, first_seen_at, last_seen_at)
        VALUES (${fixture.id}, ${fixture.space}, ${fixture.model}, ${fixture.dim},
          ${fixture.vector}::vector, 1, now(), now())
      `;
      await db`INSERT INTO cluster_members (cluster_id, post_id, span, similarity) VALUES (${fixture.id}, ${uri}, 'body', 1)`;
      await db`INSERT INTO observations (post_id, segment_id, observed_at, via) VALUES (${uri}, 'voz', now(), 'rss')`;
    }
    const map = await buildTrendMap(24);
    const links = map.edges.filter((edge) => edge.relation === "similarity");
    // Five close centroids would form ten links without the degree cap. The
    // deterministic cap admits six, excluding incompatible padded vectors.
    expect(links).toHaveLength(6);
    const degree = new Map<string, number>();
    for (const link of links) {
      expect(link.source).toStartWith("cluster:near-");
      expect(link.target).toStartWith("cluster:near-");
      expect(link.similarity).toBeCloseTo(1, 6);
      degree.set(link.source, (degree.get(link.source) ?? 0) + 1);
      degree.set(link.target, (degree.get(link.target) ?? 0) + 1);
    }
    expect([...degree.values()]).toEqual([3, 3, 3, 3]);
    expect(new Set(links.map((edge) => edge.id)).size).toBe(6);
    expect(map.edges.filter((edge) => edge.relation === "observed-in")).toHaveLength(
      fixtures.length,
    );
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
