import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { closeDb, getDb, toVectorLiteral } from "../server/db.ts";
import {
  CLUSTER_THRESHOLDS,
  ingestTailEvent,
  listClusters,
  searchAcrossSpaces,
  segmentCoverage,
  socialSignals,
} from "../server/social/pipeline.ts";
import type { Space } from "../server/db.ts";
import { buildTrendMap } from "../server/social/trend-map.ts";
import { VIEWER_SEGMENTS } from "../shared/segments.ts";
import type { TailEvent } from "../server/social/bluesky.ts";

/**
 * These tests exercise the collection invariants that are easy to regress and
 * expensive to notice: a post observed twice must not count as two posts, a
 * second segment must be a crossing, a delete must remove derived vectors, and a
 * failed segment must read as unknown rather than zero.
 *
 * They need a database. `TRENDIFEST_TEST_DATABASE_URL` points at a scratch
 * database whose `public` schema is truncated per run; without it the suite is
 * skipped so `bun test` stays runnable without Postgres.
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

function event(overrides: Partial<TailEvent> & { uri: string }): TailEvent {
  return {
    operation: "create",
    did: "did:plc:test",
    rkey: overrides.uri.split("/").pop() ?? "rkey",
    seq: 1,
    time: "2026-11-03T00:00:00.000Z",
    record: { text: "placeholder", createdAt: "2026-11-03T00:00:00.000Z" },
    ...overrides,
  };
}

describe.skipIf(!enabled)("social collection pipeline", () => {
  beforeAll(async () => {
    const db = await getDb();
    await db`
      TRUNCATE cluster_members, clusters, embeddings, metric_snapshots, observations, posts
      RESTART IDENTITY CASCADE
    `;
  });

  afterAll(async () => {
    await closeDb();
  });

  test("stores a post and one observation for its segment", async () => {
    const result = await ingestTailEvent(
      event({
        uri: "at://did:plc:test/app.bsky.feed.post/one",
        record: {
          text: "a cat pushes a glass off the table",
          createdAt: "2026-11-03T00:00:00.000Z",
        },
      }),
    );
    expect(result).toEqual({ stored: true, vectors: expect.any(Number) });

    const signals = await socialSignals(72);
    expect(signals.stats.posts).toBe(1);
    expect(signals.stats.observations).toBe(1);
    expect(signals.stats.unvectorized).toBe(0);
  });

  test("redelivery is idempotent and does not re-embed", async () => {
    const db = await getDb();
    const before = await db`SELECT count(*)::int AS n FROM embeddings`;
    const again = await ingestTailEvent(
      event({
        uri: "at://did:plc:test/app.bsky.feed.post/one",
        record: {
          text: "a cat pushes a glass off the table",
          createdAt: "2026-11-03T00:00:00.000Z",
        },
      }),
    );
    const after = await db`SELECT count(*)::int AS n FROM embeddings`;

    expect(again).toEqual({ duplicate: true });
    // Jetstream is at-least-once, so the second delivery must add zero vectors.
    expect(Number(after[0]!.n)).toBe(Number(before[0]!.n));
  });

  test("similar text joins one cluster instead of creating siblings", async () => {
    await ingestTailEvent(
      event({
        uri: "at://did:plc:test/app.bsky.feed.post/two",
        record: {
          text: "a cat knocks a drinking glass off the desk",
          createdAt: "2026-11-03T00:01:00.000Z",
        },
      }),
    );

    const clusters = await listClusters(10);
    const textCluster = clusters.find((cluster) => cluster.kind === "text");
    expect(textCluster).toBeDefined();
    expect(textCluster!.size).toBeGreaterThanOrEqual(2);
    expect(textCluster!.cohesion).toBeGreaterThan(0);
  });

  test("unrelated text does not merge into an existing cluster", async () => {
    await ingestTailEvent(
      event({
        uri: "at://did:plc:test/app.bsky.feed.post/three",
        record: {
          text: "quarterly earnings call scheduled for thursday afternoon",
          createdAt: "2026-11-03T00:02:00.000Z",
        },
      }),
    );

    const clusters = await listClusters(20);
    const labels = clusters.map((cluster) => cluster.label.toLowerCase());
    expect(labels.some((label) => label.includes("quarterly earnings"))).toBe(true);
    // The finance sentence must not be absorbed by the cat cluster.
    const cat = clusters.find((cluster) => cluster.label.toLowerCase().includes("cat"));
    expect(cat?.examples.every((example) => !example.text.includes("quarterly"))).toBe(true);
  });

  test("a delete tombstones the post and drops its vectors", async () => {
    const db = await getDb();
    const uri = "at://did:plc:test/app.bsky.feed.post/one";
    await ingestTailEvent(event({ operation: "delete", uri, record: undefined }));

    const [post] = await db`SELECT deleted_at FROM posts WHERE id = ${uri}`;
    const vectors = await db`SELECT count(*)::int AS n FROM embeddings WHERE post_id = ${uri}`;
    const members = await db`SELECT count(*)::int AS n FROM cluster_members WHERE post_id = ${uri}`;

    expect(post?.deleted_at).not.toBeNull();
    expect(Number(vectors[0]!.n)).toBe(0);
    expect(Number(members[0]!.n)).toBe(0);
  });

  test("a post observed by two segments reports one crossing", async () => {
    const db = await getDb();
    const uri = "at://did:plc:test/app.bsky.feed.post/crossing";
    await ingestTailEvent(
      event({
        uri,
        record: {
          text: "the same joke appears in two entirely different communities",
          createdAt: "2026-11-03T00:03:00.000Z",
        },
      }),
    );
    // Simulate the second audience seeing the identical post.
    await db`
      INSERT INTO observations (post_id, segment_id, observed_at, via)
      VALUES (${uri}, ${"shitpost"}, now(), ${"feed"})
    `;

    const clusters = await listClusters(50);
    const target = clusters.find((cluster) =>
      cluster.examples.some((example) => example.text.includes("same joke")),
    );
    expect(target).toBeDefined();
    // Discover (whole-network) plus one collection segment is not adoption;
    // only collection segments count, so this stays at zero crossings.
    expect(target!.segments).not.toContain("discover");
    expect(target!.crossings).toBe(0);

    await db`
      INSERT INTO observations (post_id, segment_id, observed_at, via)
      VALUES (${uri}, ${"art"}, now(), ${"feed"})
    `;
    const after = await listClusters(50);
    const updated = after.find((cluster) => cluster.id === target!.id);
    expect(updated!.crossings).toBe(1);
    expect(updated!.segments.sort()).toEqual(["art", "shitpost"]);
  });

  test("coverage reports every segment, including ones with no posts", async () => {
    const coverage = await segmentCoverage(72);
    const shitpost = coverage.find((row) => row.segmentId === "shitpost");
    const film = coverage.find((row) => row.segmentId === "film");

    expect(shitpost?.posts).toBeGreaterThan(0);
    // Absence must be reported as zero for a segment that ran successfully...
    expect(film?.posts).toBe(0);
    expect(film?.lastObservedAt).toBeNull();
    // ...and the row still exists, so the client can show it rather than omit it.
    // Every catalog segment is reported, including ones with no posts.
    expect(coverage.length).toBe(VIEWER_SEGMENTS.length);
  });

  test("rank fusion returns a real post for a text query", async () => {
    const results = await searchAcrossSpaces("cat and a glass", 5);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.text.length).toBeGreaterThan(0);
    expect(results[0]!.score).toBeGreaterThan(0);
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
    await ingestTailEvent(
      event({
        uri: "at://did:plc:test/app.bsky.feed.post/linkage-a",
        record: {
          text: "the new phone camera is incredible in low light conditions",
          createdAt: "2026-11-03T00:10:00.000Z",
        },
      }),
    );
    await ingestTailEvent(
      event({
        uri: "at://did:plc:test/app.bsky.feed.post/linkage-b",
        record: {
          text: "this phone takes amazing photos at night",
          createdAt: "2026-11-03T00:11:00.000Z",
        },
      }),
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

    await ingestTailEvent(
      event({
        uri: "at://did:plc:test/app.bsky.feed.post/linkage-c",
        record: {
          text: "the quarterly earnings call was moved to thursday afternoon",
          createdAt: "2026-11-03T00:12:00.000Z",
        },
      }),
    );

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
        INSERT INTO posts (id, source, uri, author_did, body, kind, permalink, published_at, content_hash)
        VALUES (${`at://did:plc:bot/app.bsky.feed.post/burst-${index}`}, ${"bluesky"},
                ${`at://did:plc:bot/app.bsky.feed.post/burst-${index}`},
                ${"did:plc:bot"}, ${"counter bot repeating itself exactly"}, ${"text"},
                ${"https://bsky.app/profile/bot"}, now(), ${`burst-${index}`})
      `;
    }
    // Six different accounts post the same meme.
    for (let index = 0; index < 6; index += 1) {
      await db`
        INSERT INTO posts (id, source, uri, author_did, body, kind, permalink, published_at, content_hash)
        VALUES (${`at://did:plc:human${index}/app.bsky.feed.post/meme-${index}`}, ${"bluesky"},
                ${`at://did:plc:human${index}/app.bsky.feed.post/meme-${index}`},
                ${`did:plc:human${index}`}, ${"a genuinely shared joke format here"}, ${"text"},
                ${`https://bsky.app/profile/human${index}`}, now(), ${`meme-${index}`})
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
                ${`at://did:plc:bot/app.bsky.feed.post/burst-${index}`}, ${"body"}, 1)
      `;
      // The map joins observations, so a cluster with members but no observed
      // segment is invisible — a real invariant worth encoding here.
      await db`
        INSERT INTO observations (post_id, segment_id, observed_at, via)
        VALUES (${`at://did:plc:bot/app.bsky.feed.post/burst-${index}`}, ${"gaming"}, now(), ${"feed"})
      `;
      await db`
        INSERT INTO cluster_members (cluster_id, post_id, span, similarity)
        VALUES (${"00000000-0000-0000-0000-000000000002"},
                ${`at://did:plc:human${index}/app.bsky.feed.post/meme-${index}`}, ${"body"}, 1)
      `;
      await db`
        INSERT INTO observations (post_id, segment_id, observed_at, via)
        VALUES (${`at://did:plc:human${index}/app.bsky.feed.post/meme-${index}`}, ${"gaming"}, now(), ${"feed"})
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
  /**
   * The map used to take the global top N clusters, so the discovery pool — the
   * only segment that sees the whole network — took 30 of 40 slots and seven
   * niche hubs drew no patterns at all. That read as "nothing happens in
   * Science", which was false: its posts were clustered, just outranked.
   */
  test("a niche segment's pattern appears even when discover outranks it", async () => {
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
        const postId = `at://did:plc:${clusterId.slice(0, 6)}${index}/app.bsky.feed.post/x${index}`;
        await db`
          INSERT INTO posts (id, source, uri, author_did, body, kind, permalink, published_at, content_hash)
          VALUES (${postId}, ${"bluesky"}, ${postId}, ${`did:plc:${clusterId.slice(0, 6)}${index}`},
                  ${"a repeated pattern with enough text to cluster"}, ${"text"},
                  ${"https://bsky.app/profile/x"}, now(), ${postId})
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

    // Discover gets a large, high-scoring cluster.
    await seed("11111111-1111-1111-1111-111111111111", 30, "discover");
    // A niche segment gets one small cluster that would never win globally.
    await seed("22222222-2222-2222-2222-222222222222", 2, "shitpost");

    const map = await buildTrendMap(72);
    const sources = new Set(map.edges.map((edge) => edge.source));
    expect(sources.has("segment:discover")).toBe(true);
    // The whole point: the niche hub is represented despite losing on score.
    expect(sources.has("segment:shitpost")).toBe(true);
  });
});
