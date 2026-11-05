import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { closeDb, getDb } from "../server/db.ts";
import { deletePost, expirePosts, ingestPost } from "../server/social/pipeline.ts";
import { postId, type SourcePost } from "../server/social/input.ts";
import {
  MAX_TOPIC_DOCUMENT_CHARS,
  topicDocumentText,
  TOPIC_DIM,
  TOPIC_MODEL,
} from "../server/social/topic-embedding.ts";
import {
  backfillTopicEmbeddings,
  countPendingTopicEmbeddings,
  persistTopicEmbedding,
} from "../server/social/topic-store.ts";

/**
 * These tests cover the contract that is invisible from a single happy path:
 * a bounded backfill converges without recomputing, a stale hash can never be
 * published as valid evidence, and a write racing an edit loses rather than
 * overwriting the newer text's vector.
 *
 * They need a database. `TRENDIFEST_TEST_DATABASE_URL` points at a disposable
 * database; without it the suite is skipped so `bun test` stays runnable.
 */

const TEST_URL = process.env.TRENDIFEST_TEST_DATABASE_URL ?? "";
const enabled = TEST_URL.length > 0;

if (enabled) process.env.TRENDIFEST_DATABASE_URL = TEST_URL;

const CAT_TEXT = "Con mèo làm rơi chiếc cốc thủy tinh từ trên bàn xuống sàn nhà.";
const FINANCE_TEXT = "Cuộc họp công bố kết quả kinh doanh quý này được chuyển sang chiều thứ Năm.";

function fixturePost(overrides: Partial<SourcePost> & { uri: string }): SourcePost {
  return {
    source: "voz",
    title: "",
    evidenceType: "discussion",
    publisher: null,
    authorId: "test-author",
    authorHandle: "test-author",
    text: CAT_TEXT,
    kind: "text",
    permalink: "https://voz.vn/t/topic.1/",
    publishedAt: new Date().toISOString(),
    timeKind: "activity",
    media: [],
    engagement: null,
    ...overrides,
  };
}

/** Rows that the grouping read would actually accept as valid evidence. */
async function validTopicRows(id: string) {
  const db = await getDb();
  return (await db`
    SELECT t.model, t.content_hash, vector_dims(t.vec) AS dims, t.vec::text AS vec
    FROM posts p
    JOIN topic_embeddings t ON t.post_id = p.id
    WHERE p.id = ${id} AND t.model = ${TOPIC_MODEL} AND t.content_hash = p.content_hash
  `) as unknown as Array<{ model: string; content_hash: string; dims: number; vec: string }>;
}

describe("topic document shape", () => {
  test("the document is capped so one long post cannot dominate inference", () => {
    const document = topicDocumentText("Tiêu đề", "x".repeat(MAX_TOPIC_DOCUMENT_CHARS * 2));
    expect(document.length).toBe(MAX_TOPIC_DOCUMENT_CHARS);
  });
});

describe.skipIf(!enabled)("topic embedding store", () => {
  beforeEach(async () => {
    const db = await getDb();
    // TRUNCATE ... CASCADE reaches topic_embeddings through its posts foreign key.
    await db`TRUNCATE cluster_members, clusters, embeddings, metric_snapshots, observations, posts RESTART IDENTITY CASCADE`;
  });
  afterAll(closeDb);

  test("backfill is bounded per call and never recomputes a valid vector", async () => {
    const db = await getDb();
    const texts = [CAT_TEXT, FINANCE_TEXT, "Buổi bình minh trên bến cảng rất yên tĩnh."];
    for (const [index, text] of texts.entries()) {
      const uri = `urn:topic:backfill:${index}`;
      await db`
        INSERT INTO posts (id, source, uri, author_id, body, kind, permalink,
                           published_at, content_hash, title)
        VALUES (${postId("voz", uri)}, 'voz', ${uri}, 'voz:seed',
                ${text}, 'text', 'https://voz.vn/t/backfill.1/', now(), ${`hash-${index}`}, '')
      `;
    }
    expect(await countPendingTopicEmbeddings()).toBe(3);

    const first = await backfillTopicEmbeddings(2);
    expect(first).toEqual({ embedded: 2, pending: 1 });

    const second = await backfillTopicEmbeddings(25);
    expect(second).toEqual({ embedded: 1, pending: 0 });

    const rows = (await db`
      SELECT vector_dims(vec) AS dims, model FROM topic_embeddings
    `) as unknown as Array<{ dims: number; model: string }>;
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.dims).toBe(TOPIC_DIM);
      expect(row.model).toBe(TOPIC_MODEL);
    }

    const before = (await db`
      SELECT created_at FROM topic_embeddings ORDER BY post_id
    `) as unknown as Array<{ created_at: Date }>;
    expect(await backfillTopicEmbeddings(10)).toEqual({ embedded: 0, pending: 0 });
    const after = (await db`
      SELECT created_at FROM topic_embeddings ORDER BY post_id
    `) as unknown as Array<{ created_at: Date }>;
    expect(after).toEqual(before);
  });

  test("a stale-hash row is never valid evidence and backfill replaces it", async () => {
    const db = await getDb();
    const id = postId("voz", "urn:topic:stale");
    await db`
      INSERT INTO posts (id, source, uri, author_id, body, kind, permalink,
                         published_at, content_hash, title)
      VALUES (${id}, 'voz', 'urn:topic:stale', 'voz:seed', ${CAT_TEXT}, 'text',
              'https://voz.vn/t/stale.1/', now(), 'current-hash', '')
    `;
    const ok = await persistTopicEmbedding({
      id,
      contentHash: "current-hash",
      title: "",
      body: CAT_TEXT,
    });
    expect(ok).toBe("embedded");
    // Simulate the upgrade path: a vector stored against text the post no
    // longer has. The equality join the map reads must reject it.
    await db`UPDATE posts SET content_hash = 'edited-hash' WHERE id = ${id}`;
    expect(await validTopicRows(id)).toHaveLength(0);
    expect(await countPendingTopicEmbeddings()).toBe(1);

    const repaired = await backfillTopicEmbeddings(25);
    expect(repaired).toEqual({ embedded: 1, pending: 0 });
    const [row] = await validTopicRows(id);
    expect(row?.content_hash).toBe("edited-hash");
    expect(row?.dims).toBe(TOPIC_DIM);
  });

  test("an unchanged redelivery reuses its vector and fills only a missing one", async () => {
    const db = await getDb();
    const post = fixturePost({ uri: "urn:topic:redelivery" });
    await ingestPost(post, "voz");
    const id = postId("voz", post.uri);
    const [before] = (await db`
      SELECT created_at, vec::text AS vec FROM topic_embeddings WHERE post_id = ${id}
    `) as unknown as Array<{ created_at: Date; vec: string }>;
    expect(before).toBeDefined();

    const duplicate = await ingestPost(post, "voz");
    expect(duplicate).toEqual({ duplicate: true, topicVector: "unchanged" });
    const [after] = (await db`
      SELECT created_at, vec::text AS vec FROM topic_embeddings WHERE post_id = ${id}
    `) as unknown as Array<{ created_at: Date; vec: string }>;
    expect(after?.created_at).toEqual(before!.created_at);
    expect(after?.vec).toBe(before!.vec);
    expect(await countPendingTopicEmbeddings()).toBe(0);

    // Repolling must not move the collection timestamp: it is the first time we
    // saw the record, not the last time we fetched it. Backdating the column
    // makes a rewrite detectable without depending on wall-clock timing.
    await db`UPDATE posts SET first_collected_at = now() - interval '5 days' WHERE id = ${id}`;
    const [firstCollected] = (await db`
      SELECT first_collected_at FROM posts WHERE id = ${id}
    `) as unknown as Array<{ first_collected_at: Date }>;
    await ingestPost(
      { ...post, engagement: { replies: 4, capturedAt: new Date().toISOString() } },
      "voz",
    );
    const [stillFirstCollected] = (await db`
      SELECT first_collected_at FROM posts WHERE id = ${id}
    `) as unknown as Array<{ first_collected_at: Date }>;
    expect(stillFirstCollected?.first_collected_at).toEqual(firstCollected!.first_collected_at);

    // The row can be absent for an old corpus row or an interrupted cycle; the
    // same redelivery must repair it instead of reporting a silent duplicate.
    await db`DELETE FROM topic_embeddings WHERE post_id = ${id}`;
    expect(await countPendingTopicEmbeddings()).toBe(1);
    const repaired = await ingestPost(post, "voz");
    expect(repaired).toEqual({ duplicate: true, topicVector: "embedded" });
    expect(await countPendingTopicEmbeddings()).toBe(0);
  });

  test("a write racing an edit is discarded instead of overwriting the new vector", async () => {
    const db = await getDb();
    const post = fixturePost({ uri: "urn:topic:race" });
    await ingestPost(post, "voz");
    const id = postId("voz", post.uri);
    const [original] = (await db`
      SELECT content_hash FROM posts WHERE id = ${id}
    `) as unknown as Array<{ content_hash: string }>;

    // The edited record lands first: new text, new hash, freshly computed vector.
    await ingestPost({ ...post, text: FINANCE_TEXT }, "voz");
    const [edited] = (await db`
      SELECT content_hash FROM posts WHERE id = ${id}
    `) as unknown as Array<{ content_hash: string }>;
    expect(edited?.content_hash).not.toBe(original?.content_hash);
    const beforeStale = await validTopicRows(id);
    expect(beforeStale).toHaveLength(1);
    expect(beforeStale[0]?.content_hash).toBe(edited!.content_hash);

    // A backfill that read the post before the edit now tries to write its
    // vector. The conditional write must lose, not replace the newer evidence.
    const stale = await persistTopicEmbedding({
      id,
      contentHash: original!.content_hash,
      title: "",
      body: CAT_TEXT,
    });
    expect(stale).toBe("superseded");
    const afterStale = await validTopicRows(id);
    expect(afterStale[0]?.content_hash).toBe(edited!.content_hash);
    expect(afterStale[0]?.vec).toBe(beforeStale[0]!.vec);
    expect(await countPendingTopicEmbeddings()).toBe(0);
  });

  test("concurrent backfill calls share one flight and never double-embed a row", async () => {
    const db = await getDb();
    for (const index of [0, 1]) {
      const uri = `urn:topic:flight:${index}`;
      await db`
        INSERT INTO posts (id, source, uri, author_id, body, kind, permalink,
                           published_at, content_hash, title)
        VALUES (${postId("voz", uri)}, 'voz', ${uri}, 'voz:seed',
                'Nội dung tiếng Việt đủ dài để mô hình tạo một véc tơ chủ đề.',
                'text', 'https://voz.vn/t/flight.1/', now(), ${`flight-${index}`}, '')
      `;
    }

    const results = await Promise.all([
      backfillTopicEmbeddings(2),
      backfillTopicEmbeddings(2),
      backfillTopicEmbeddings(2),
    ]);
    // Exactly one flight does the work; the others report the shared state
    // rather than starting competing inference passes. Their `pending` is a
    // snapshot taken while the owner is still running, so only the owner's
    // completion is asserted here.
    expect(results.reduce((total, item) => total + item.embedded, 0)).toBe(2);
    expect(await countPendingTopicEmbeddings()).toBe(0);

    const rows = (await db`
      SELECT post_id, count(*)::int AS n FROM topic_embeddings GROUP BY post_id
    `) as unknown as Array<{ n: number }>;
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.n === 1)).toBe(true);
  });

  test("takedown and expiry remove topic vectors through the same invalidation", async () => {
    const db = await getDb();
    const removed = fixturePost({ uri: "urn:topic:takedown" });
    const expired = fixturePost({ uri: "urn:topic:expired", text: FINANCE_TEXT });
    await ingestPost(removed, "voz");
    await ingestPost(expired, "voz");
    expect(await countPendingTopicEmbeddings()).toBe(0);

    await deletePost("voz", removed.uri);
    const removedId = postId("voz", removed.uri);
    expect(await db`SELECT 1 FROM topic_embeddings WHERE post_id = ${removedId}`).toHaveLength(0);
    expect(await validTopicRows(removedId)).toHaveLength(0);

    const expiredId = postId("voz", expired.uri);
    await db`UPDATE posts SET published_at = now() - interval '31 days' WHERE id = ${expiredId}`;
    expect(await expirePosts()).toBe(1);
    expect(await db`SELECT 1 FROM topic_embeddings WHERE post_id = ${expiredId}`).toHaveLength(0);
  });

  test("a news headline is stored with its publisher and never invents an author", async () => {
    const db = await getDb();
    const news = fixturePost({
      uri: "news:3490787",
      source: "nguoi-viet",
      evidenceType: "news",
      publisher: "Người Việt",
      title: "Nam sinh chào kiểu phát xít trên truyền hình Việt Nam",
      authorId: null,
      authorHandle: null,
      kind: "link",
      permalink:
        "https://www.nguoi-viet.com/viet-nam/nam-sinh-chao-kieu-phat-xit-tren-dai-truyen-hinh-viet-nam/",
      publishedAt: new Date(Date.now() - 3_600_000).toISOString(),
      timeKind: "published",
    });
    await ingestPost(news, "nguoi-viet");

    const id = postId("nguoi-viet", news.uri);
    const [row] = (await db`
      SELECT evidence_type, publisher, title, author_id FROM posts WHERE id = ${id}
    `) as unknown as Array<{
      evidence_type: string;
      publisher: string | null;
      title: string;
      author_id: string;
    }>;
    expect(row?.evidence_type).toBe("news");
    expect(row?.publisher).toBe("Người Việt");
    expect(row?.title).toBe("Nam sinh chào kiểu phát xít trên truyền hình Việt Nam");
    // The source-qualified placeholder is a storage key, not a person: grouping
    // must count news separately and never as a community author.
    expect(row?.author_id).toBe("nguoi-viet:unknown");
    expect(await validTopicRows(id)).toHaveLength(1);
  });
});
