import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { closeDb, getDb } from "../server/db.ts";
import { buildTrendMap } from "../server/social/trend-map.ts";
import { TOPIC_DIM, TOPIC_MODEL } from "../server/social/topic-embedding.ts";
import { GROUPING_THRESHOLD } from "../server/social/topics.ts";

/**
 * Map-level regressions: the payload's shape and its accounting.
 *
 * These need a database because the map's whole job is to read stored records
 * and their topic vectors correctly — which rows join, which are pending, and
 * whether a vector from another model or from older text is ever used. Records
 * are inserted directly so each case is exact: a real E5 inference run here would
 * test the model, not the map's SQL and bookkeeping.
 *
 * `TRENDIFEST_TEST_DATABASE_URL` points at a scratch database; without it the
 * suite is skipped so `bun test` stays runnable without Postgres.
 */

const TEST_URL = process.env.TRENDIFEST_TEST_DATABASE_URL ?? "";
const enabled = TEST_URL.length > 0;
if (enabled) process.env.TRENDIFEST_DATABASE_URL = TEST_URL;

/** A unit vector along axis 0, so any two records share the same direction. */
const UNIT = `[${["1", ...Array<string>(TOPIC_DIM - 1).fill("0")].join(",")}]`;

interface SeedOptions {
  id: string;
  title: string;
  body: string;
  evidenceType?: "discussion" | "news";
  publisher?: string | null;
  authorId?: string;
  source?: string;
  segments?: string[];
  publishedAt?: Date;
  /** Hash to store on the post; defaults to a per-id value. */
  contentHash?: string;
  /** Vector model; invalid models must never be read. */
  model?: string;
  /** Hash stored on the vector row; a mismatch must read as pending. */
  vectorHash?: string;
  /** Insert no topic vector at all. */
  noVector?: boolean;
  permalink?: string;
}

async function seed(options: SeedOptions) {
  const db = await getDb();
  const publishedAt = options.publishedAt ?? new Date();
  const contentHash = options.contentHash ?? `hash-${options.id}`;
  const segments = options.segments ?? ["voz"];
  const source = options.source ?? "voz";
  await db`
    INSERT INTO posts (id, source, uri, author_id, author_handle, body, title, evidence_type,
                       publisher, lang, kind, permalink, published_at, time_kind, media,
                       content_hash, first_collected_at)
    VALUES (${options.id}, ${source}, ${options.id}, ${options.authorId ?? `${source}:${options.id}`},
            ${options.id}, ${options.body}, ${options.title}, ${options.evidenceType ?? "discussion"},
            ${options.publisher ?? null}, ${["vi"]}::text[], 'text',
            ${options.permalink ?? `https://voz.vn/t/${options.id}/`}, ${publishedAt}, 'activity',
            '[]'::jsonb, ${contentHash}, ${publishedAt})
  `;
  for (const segment of segments) {
    await db`
      INSERT INTO observations (post_id, segment_id, observed_at, via)
      VALUES (${options.id}, ${segment}, ${new Date()}, 'test')
    `;
  }
  if (!options.noVector) {
    await db`
      INSERT INTO topic_embeddings (post_id, model, content_hash, vec)
      VALUES (${options.id}, ${options.model ?? TOPIC_MODEL}, ${options.vectorHash ?? contentHash},
              ${UNIT}::vector)
    `;
  }
}

describe.skipIf(!enabled)("topic map payload", () => {
  beforeEach(async () => {
    const db = await getDb();
    await db`TRUNCATE topic_embeddings, cluster_members, clusters, embeddings, metric_snapshots, observations, posts RESTART IDENTITY CASCADE`;
  });
  afterAll(closeDb);

  test("nodes are specific topics with split evidence counts and no source hubs", async () => {
    await seed({
      id: "voz:gpt5-a",
      title: "OpenAI ra mắt GPT-5",
      body: "OpenAI ra mắt GPT-5 với khả năng suy luận nhiều bước",
      authorId: "voz:an",
    });
    await seed({
      id: "voz:gpt5-b",
      title: "GPT-5 chính thức được công bố",
      body: "GPT-5 đã chính thức được OpenAI công bố cho lập trình viên",
      authorId: "voz:binh",
    });
    await seed({
      id: "nguoi-viet:salute",
      title: "Nam sinh chào kiểu phát xít trên Đài Truyền Hình Việt Nam",
      body: "Nam sinh chào kiểu phát xít trên Đài Truyền Hình Việt Nam",
      evidenceType: "news",
      publisher: "Người Việt",
      source: "nguoi-viet",
      segments: ["nguoi-viet"],
      permalink: "https://www.nguoi-viet.com/viet-nam/nam-sinh-chao-kieu-phat-xit/",
    });

    const map = await buildTrendMap(168);

    expect(map.method.version).toBe(3);
    expect(map.method.topicModel).toBe(TOPIC_MODEL);
    expect(map.method.groupingThreshold).toBe(GROUPING_THRESHOLD);
    expect(map.stats.topics).toBe(map.nodes.length);
    expect(map.stats.posts).toBe(3);

    // Every node is a topic: no segment/source hub, no per-post node.
    for (const node of map.nodes) {
      expect(node.kind).toBe("topic");
      expect(node.id.startsWith("topic:")).toBe(true);
      expect(node.label.length).toBeGreaterThan(0);
      expect(node.examples.length).toBeLessThanOrEqual(3);
      expect(node.posts).toBe(node.discussionPosts + node.newsPosts);
      expect(node.radius).toBeGreaterThan(0);
    }

    // Community records and news report are counted separately, and a publisher
    // is never reported as an author.
    const merged = map.nodes.find((node) => node.discussionPosts === 2)!;
    expect(merged).toBeDefined();
    expect(merged.authors).toBe(2);
    expect(merged.newsPosts).toBe(0);
    expect(merged.publishers).toBe(0);

    const news = map.nodes.find((node) => node.newsPosts === 1)!;
    expect(news).toBeDefined();
    expect(news.authors).toBe(0);
    expect(news.publishers).toBe(1);
    expect(news.discussionPosts).toBe(0);

    // Displayed topics account for the displayed records, and each record is
    // counted once as either community discussion or a news report.
    expect(map.stats.discussionPosts + map.stats.newsPosts).toBe(
      map.nodes.reduce((total, node) => total + node.posts, 0),
    );
  });

  test("unmeasured reposts and quotes remain unknown rather than becoming zero", async () => {
    await seed({
      id: "voz:unknown-metrics",
      title: "OpenAI ra mắt GPT-5",
      body: "OpenAI ra mắt GPT-5 với khả năng suy luận",
    });
    const db = await getDb();
    await db`INSERT INTO metric_snapshots (post_id, captured_at, likes, reposts, quotes)
      VALUES ('voz:unknown-metrics', now(), NULL, NULL, NULL)`;
    const unknown = await buildTrendMap(24);
    expect(unknown.nodes[0]!.shares).toBeUndefined();
    expect(unknown.nodes[0]!.likes).toBeUndefined();
    await db`UPDATE metric_snapshots SET reposts = 0, quotes = 0 WHERE post_id = 'voz:unknown-metrics'`;
    expect((await buildTrendMap(24)).nodes[0]!.shares).toBe(0);
  });

  test("edges only join distinct existing topic nodes", async () => {
    for (const [index, body] of [
      "OpenAI ra mắt GPT-5 với khả năng suy luận nhiều bước",
      "OpenAI công bố GPT-5 cho lập trình viên",
      "Anthropic ra mắt Claude 4 mạnh hơn về lập trình",
    ].entries()) {
      await seed({ id: `voz:edge-${index}`, title: "", body, authorId: `voz:edge-${index}` });
    }
    const map = await buildTrendMap(24);
    const ids = new Set(map.nodes.map((node) => node.id));
    for (const edge of map.edges) {
      expect(edge.relation).toBe("related");
      expect(edge.source).not.toBe(edge.target);
      expect(ids.has(edge.source)).toBe(true);
      expect(ids.has(edge.target)).toBe(true);
      expect(edge.similarity).toBeGreaterThan(0);
      expect(edge.similarity).toBeLessThanOrEqual(1);
    }
    // An isolated topic is legitimate; what is forbidden is an edge to nothing.
    expect(map.edges.length).toBeLessThanOrEqual(map.nodes.length * 3);
  });

  test("a vector from another model or stale text is pending, never used", async () => {
    await seed({
      id: "voz:valid",
      title: "OpenAI ra mắt GPT-5",
      body: "OpenAI ra mắt GPT-5 hôm nay",
    });
    await seed({
      id: "voz:wrong-model",
      title: "Anthropic ra mắt Claude 4",
      body: "Anthropic ra mắt Claude 4 hôm nay",
      model: "Xenova/paraphrase-multilingual-MiniLM-L12-v2",
    });
    await seed({
      id: "voz:stale-hash",
      title: "Cháy lớn ở chợ Kim Liên",
      body: "Cháy lớn ở chợ Kim Liên, hàng hóa bị thiêu rụi",
      vectorHash: "hash-from-older-text",
    });
    await seed({
      id: "voz:no-vector",
      title: "VinFast ra mắt xe VF3",
      body: "VinFast ra mắt xe VF3 tại Hà Nội",
      noVector: true,
    });

    const map = await buildTrendMap(24);
    expect(map.stats.posts).toBe(1);
    expect(map.stats.pendingEmbeddings).toBe(3);
    const used = map.nodes.flatMap((node) => node.examples.map((example) => example.uri));
    expect(used).toContain("voz:valid");
    expect(used).not.toContain("voz:wrong-model");
    expect(used).not.toContain("voz:stale-hash");
    expect(used).not.toContain("voz:no-vector");
  });

  test("deleted, unobserved and out-of-window records never appear", async () => {
    await seed({
      id: "voz:live",
      title: "OpenAI ra mắt GPT-5",
      body: "OpenAI ra mắt GPT-5 hôm nay",
    });
    await seed({
      id: "voz:old",
      title: "Anthropic ra mắt Claude 4",
      body: "Anthropic ra mắt Claude 4",
      publishedAt: new Date(Date.now() - 40 * 24 * 3_600_000),
    });
    await seed({
      id: "voz:deleted",
      title: "VinFast ra mắt xe VF3",
      body: "VinFast ra mắt xe VF3 tại Hà Nội",
    });
    const db = await getDb();
    await db`UPDATE posts SET deleted_at = now() WHERE id = 'voz:deleted'`;
    await db`DELETE FROM observations WHERE post_id = 'voz:deleted'`;

    const map = await buildTrendMap(24);
    expect(map.stats.posts).toBe(1);
    const uris = map.nodes.flatMap((node) => node.examples.map((example) => example.uri));
    expect(uris).toEqual(["voz:live"]);
  });

  test("the payload stays bounded and carries no vectors", async () => {
    for (let index = 0; index < 30; index += 1) {
      await seed({
        id: `voz:bulk-${index}`,
        title: `Sự kiện số ${index + 1} tại Quảng Ninh`,
        body: `Sự kiện số ${index + 1} tại Quảng Ninh diễn ra trong ngày hôm nay`.repeat(20),
        authorId: `voz:bulk-${index}`,
      });
    }
    const map = await buildTrendMap(24);
    const serialized = JSON.stringify(map);
    expect(serialized).not.toContain(UNIT);
    expect(serialized.toLowerCase()).not.toContain('"vector"');
    for (const node of map.nodes) {
      for (const example of node.examples) {
        expect(example.text.length).toBeLessThanOrEqual(600);
      }
    }
    expect(map.nodes.length).toBeLessThanOrEqual(90);
  });

  test("old publication dates and observation logs cannot invent collection history", async () => {
    const db = await getDb();
    const publishedAt = new Date(Date.now() - 48 * 3_600_000);
    await seed({
      id: "voz:history",
      title: "OpenAI ra mắt GPT-5",
      body: "OpenAI ra mắt GPT-5 với khả năng suy luận",
      publishedAt,
    });
    // A migrated row has older source dates/logs, but no known first collection.
    await db`UPDATE posts SET first_collected_at = now() WHERE id = 'voz:history'`;
    await db`UPDATE observations SET observed_at = ${publishedAt} WHERE post_id = 'voz:history'`;
    const cold = await buildTrendMap(168);
    expect(cold.method.velocityComparable).toBe(false);
    expect(cold.nodes[0]!.score.velocity).toBe(0.5);
    expect(cold.nodes[0]!.examples[0]!.publishedAt).toBe(publishedAt.toISOString());
    expect(new Date(cold.nodes[0]!.firstSeenAt).getTime()).toBeGreaterThan(publishedAt.getTime());
    // Actual immutable collection history makes the growth windows comparable.
    await db`UPDATE posts SET first_collected_at = ${publishedAt} WHERE id = 'voz:history'`;
    expect((await buildTrendMap(168)).method.velocityComparable).toBe(true);
  });

  test("coverage is reported per collection context, not inferred from topics", async () => {
    await seed({
      id: "voz:cover",
      title: "OpenAI ra mắt GPT-5",
      body: "OpenAI ra mắt GPT-5 hôm nay",
    });
    const map = await buildTrendMap(24);
    expect(map.coverage.length).toBeGreaterThan(0);
    for (const row of map.coverage) {
      expect(row.posts).toBeGreaterThanOrEqual(0);
      expect(typeof row.segmentId).toBe("string");
    }
  });
});
