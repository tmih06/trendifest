import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { closeDb, getDb } from "../server/db.ts";
import { TOPIC_DIM, TOPIC_MODEL } from "../server/social/topic-embedding.ts";
import {
  applyTopicReview,
  listTopicReviews,
  undoTopicReview,
} from "../server/social/topic-review.ts";

/**
 * Review regressions: the persistent merge/split/undo contract.
 *
 * Every case drives the real module against the real schema, because the
 * properties under test are transactional (which rows a decision writes, what a
 * guard refuses, what undo restores after a later decision). Records are seeded
 * directly so the *review* logic is what fails, not the collector: vectors are
 * unit-length so cosine cannot decide a case the identity guards must decide.
 *
 * `TRENDIFEST_TEST_DATABASE_URL` points at a scratch database; without it the
 * suite is skipped so `bun test` stays runnable without Postgres.
 */

const TEST_URL = process.env.TRENDIFEST_TEST_DATABASE_URL ?? "";
const enabled = TEST_URL.length > 0;
if (enabled) process.env.TRENDIFEST_DATABASE_URL = TEST_URL;

const UNIT = `[${["1", ...Array<string>(TOPIC_DIM - 1).fill("0")].join(",")}]`;

interface SeedPost {
  id: string;
  title: string;
  body?: string;
  contentHash?: string;
  /** Store a membership row pointing at this topic under this hash. */
  topicId?: string;
  /** Hash on the membership row; defaults to the post's own hash. */
  membershipHash?: string;
  locked?: boolean;
  reviewId?: string | null;
  evidenceType?: "discussion" | "news";
  publisher?: string | null;
  authorId?: string;
  noVector?: boolean;
}

async function seedTopic(id: string, label: string, mergedInto: string | null = null) {
  const db = await getDb();
  await db`
    INSERT INTO topic_catalog (id, label, merged_into) VALUES (${id}, ${label}, ${mergedInto})
    ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, merged_into = EXCLUDED.merged_into
  `;
}

async function seedPost(options: SeedPost) {
  const db = await getDb();
  const hash = options.contentHash ?? `hash-${options.id}`;
  const now = new Date();
  await db`
    INSERT INTO posts (id, source, uri, author_id, author_handle, body, title, evidence_type,
                       publisher, lang, kind, permalink, published_at, time_kind, media,
                       content_hash, first_collected_at)
    VALUES (${options.id}, 'voz', ${options.id}, ${options.authorId ?? `voz:${options.id}`},
            ${options.id}, ${options.body ?? options.title}, ${options.title},
            ${options.evidenceType ?? "discussion"}, ${options.publisher ?? null}, ${["vi"]}::text[],
            'text', ${`https://voz.vn/t/${options.id}/`}, ${now}, 'activity', '[]'::jsonb,
            ${hash}, ${now})
  `;
  await db`
    INSERT INTO observations (post_id, segment_id, observed_at, via)
    VALUES (${options.id}, 'voz', ${now}, 'test')
  `;
  if (!options.noVector) {
    await db`
      INSERT INTO topic_embeddings (post_id, model, content_hash, vec)
      VALUES (${options.id}, ${TOPIC_MODEL}, ${hash}, ${UNIT}::vector)
    `;
  }
  if (options.topicId) {
    await db`
      INSERT INTO topic_memberships (post_id, topic_id, content_hash, locked, review_id)
      VALUES (${options.id}, ${options.topicId}, ${options.membershipHash ?? hash},
              ${options.locked ?? false}, ${options.reviewId ?? null})
    `;
  }
}

async function memberships() {
  const db = await getDb();
  return (await db`
    SELECT post_id, topic_id, locked, review_id FROM topic_memberships ORDER BY post_id
  `) as unknown as Array<{
    post_id: string;
    topic_id: string;
    locked: boolean;
    review_id: string | null;
  }>;
}

/** The shape `ApiFailure` guarantees; read after narrowing, never assumed. */
interface ReviewFailure {
  code?: string;
  message?: string;
  status?: number;
}

/** Turn an expected refusal into a value so the assertion reads as one line. */
async function confused<T>(promise: Promise<T>) {
  try {
    return { value: await promise, error: undefined };
  } catch (error) {
    return { value: undefined, error: error as ReviewFailure };
  }
}

/** The failure inside a settled rejection, without asserting its members inline. */
function failureOf(reason: unknown): ReviewFailure {
  return reason instanceof Error ? (reason as ReviewFailure) : {};
}

describe.skipIf(!enabled)("topic review", () => {
  async function clearReviewData() {
    const db = await getDb();
    // `beforeEach` clears every table this module writes or reads through the
    // core reader, so nothing leaks into the other intelligence suites.
    await db`
      TRUNCATE topic_review_decisions, topic_memberships, topic_catalog, topic_snapshots,
               watch_alerts, watch_rules, topic_embeddings, metric_snapshots, observations,
               cluster_members, clusters, embeddings, posts
      RESTART IDENTITY CASCADE
    `;
  }
  beforeEach(clearReviewData);
  afterAll(async () => {
    await clearReviewData();
    await closeDb();
  });

  test("source-native aggregator URL identities can be split and undone without truncation", async () => {
    const recordId = `google-news:https://news.google.com/rss/articles/${"a".repeat(360)}`;
    await seedTopic("topic:long-source", "OpenAI GPT-5");
    await seedPost({ id: recordId, title: "OpenAI công bố GPT-5", topicId: "topic:long-source" });
    await seedPost({
      id: "voz:other",
      title: "OpenAI công bố GPT-5",
      topicId: "topic:long-source",
    });
    const result = await applyTopicReview({
      operation: "split",
      topicIds: ["topic:long-source"],
      recordIds: [recordId],
      note: "Separate the original source record.",
    });
    expect(result.decision.recordIds).toEqual([recordId]);
    expect((await memberships()).find((row) => row.post_id === recordId)!.topic_id).toBe(
      result.topicId,
    );
    await undoTopicReview(result.decision.id);
    expect((await memberships()).find((row) => row.post_id === recordId)!.topic_id).toBe(
      "topic:long-source",
    );
  });

  test("a split persists both partitions and returns a stable manual topic", async () => {
    await seedTopic("topic:official", "Olympia 2026 chung kết");
    await seedPost({
      id: "voz:final-1",
      title: "Chung kết Olympia 2026 phát sóng trực tiếp",
      topicId: "topic:official",
    });
    await seedPost({
      id: "voz:final-2",
      title: "Chung kết Olympia 2026 phát sóng trực tiếp",
      topicId: "topic:official",
      authorId: "voz:second",
    });
    await seedPost({
      id: "voz:side-story",
      title: "Khán giả phản ứng sau chung kết Olympia 2026",
      topicId: "topic:official",
      authorId: "voz:third",
    });

    const result = await applyTopicReview({
      operation: "split",
      topicIds: ["topic:official"],
      recordIds: ["voz:final-2"],
      note: "The second post is about the broadcast, not the reaction thread.",
    });

    expect(result.decision.operation).toBe("split");
    expect(result.decision.active).toBe(true);
    expect(result.decision.recordIds).toEqual(["voz:final-2"]);
    expect(result.topicId.startsWith("topic:manual:")).toBe(true);

    const rows = await memberships();
    expect(rows.map((row) => [row.post_id, row.topic_id])).toEqual([
      ["voz:final-1", "topic:official"],
      ["voz:final-2", result.topicId],
      ["voz:side-story", "topic:official"],
    ]);
    // Both partitions stay locked to this decision; automatic grouping must not
    // be able to rejoin them on the next refresh.
    for (const row of rows) {
      expect(row.locked).toBe(true);
      expect(row.review_id).toBe(result.decision.id);
    }

    const db = await getDb();
    const [manual] = (await db`
      SELECT id, label, merged_into FROM topic_catalog WHERE id = ${result.topicId}
    `) as unknown as Array<{ id: string; label: string; merged_into: string | null }>;
    expect(manual?.merged_into).toBeNull();
    // A real record's title labels the new topic; nothing is generated.
    expect(manual?.label).toBe("Chung kết Olympia 2026 phát sóng trực tiếp");

    const [source] = (await db`
      SELECT merged_into FROM topic_catalog WHERE id = 'topic:official'
    `) as unknown as Array<{ merged_into: string | null }>;
    expect(source?.merged_into).toBeNull();

    // Undo restores the single original partition and keeps the manual row as a
    // redirect so its links and references stay resolvable.
    await undoTopicReview(result.decision.id);
    const restored = await memberships();
    expect(restored.map((row) => [row.post_id, row.topic_id, row.locked])).toEqual([
      ["voz:final-1", "topic:official", false],
      ["voz:final-2", "topic:official", false],
      ["voz:side-story", "topic:official", false],
    ]);
    expect(restored.every((row) => row.review_id === null)).toBe(true);
    const [redirected] = (await db`
      SELECT merged_into FROM topic_catalog WHERE id = ${result.topicId}
    `) as unknown as Array<{ merged_into: string | null }>;
    expect(redirected?.merged_into).toBe("topic:official");
    expect((await listTopicReviews("topic:official"))[0]?.active).toBe(false);
  });

  test("a merge refuses topics that name different versions, and writes nothing", async () => {
    await seedTopic("topic:gpt5", "OpenAI ra mắt GPT-5");
    await seedTopic("topic:gpt41", "OpenAI ra mắt GPT-4.1");
    await seedPost({
      id: "voz:gpt5",
      title: "OpenAI ra mắt GPT-5 với khả năng suy luận",
      topicId: "topic:gpt5",
    });
    await seedPost({
      id: "voz:gpt41",
      title: "OpenAI ra mắt GPT-4.1 cho lập trình viên",
      topicId: "topic:gpt41",
    });

    const attempt = await confused(
      applyTopicReview({
        operation: "merge",
        topicIds: ["topic:gpt5", "topic:gpt41"],
        recordIds: [],
        note: "Both are OpenAI announcements.",
      }),
    );

    expect(attempt.error?.code).toBe("conflicting_review");
    expect(attempt.error?.status).toBe(409);

    // A refused guard is not a partial write: no decision, no lock, no redirect.
    const db = await getDb();
    const [decisions] =
      (await db`SELECT count(*)::int AS count FROM topic_review_decisions`) as unknown as Array<{
        count: number;
      }>;
    expect(decisions?.count).toBe(0);
    const rows = await memberships();
    expect(rows.every((row) => !row.locked && row.review_id === null)).toBe(true);
    const catalog = (await db`
      SELECT merged_into FROM topic_catalog ORDER BY id
    `) as unknown as Array<{ merged_into: string | null }>;
    expect(catalog.every((row) => row.merged_into === null)).toBe(true);
  });

  test("a merge redirects sources, locks the survivor, and resolves from either id", async () => {
    await seedTopic("topic:fragment", "Chung kết Olympia 2026");
    await seedTopic("topic:main", "Chung kết Olympia 2026 phát sóng trực tiếp");
    await seedPost({
      id: "voz:frag",
      title: "Chung kết Olympia 2026 phát sóng trực tiếp",
      topicId: "topic:fragment",
    });
    for (const id of ["voz:main-1", "voz:main-2"]) {
      await seedPost({
        id,
        title: "Chung kết Olympia 2026 phát sóng trực tiếp",
        topicId: "topic:main",
        authorId: `voz:${id}`,
      });
    }

    const result = await applyTopicReview({
      operation: "merge",
      topicIds: ["topic:main", "topic:fragment"],
      recordIds: [],
      note: "Same broadcast, split by wording.",
    });

    // The reviewer's chosen target survives; every other id redirects into it.
    expect(result.topicId).toBe("topic:main");
    expect(result.decision.recordIds).toEqual(["voz:frag"]);

    const rows = await memberships();
    expect(rows.every((row) => row.topic_id === "topic:main" && row.locked)).toBe(true);
    expect(rows.every((row) => row.review_id === result.decision.id)).toBe(true);

    const db = await getDb();
    const [source] = (await db`
      SELECT merged_into FROM topic_catalog WHERE id = 'topic:fragment'
    `) as unknown as Array<{ merged_into: string | null }>;
    expect(source?.merged_into).toBe("topic:main");

    // History is inspectable from the source id as well as the survivor, which is
    // what lets the panel offer undo wherever the reviewer arrives.
    expect((await listTopicReviews("topic:fragment")).map((d) => d.id)).toEqual([
      result.decision.id,
    ]);
    expect((await listTopicReviews("topic:main")).map((d) => d.id)).toEqual([result.decision.id]);

    // Merging an id that already redirects into its own target is a conflict,
    // not a silent no-op.
    const repeat = await confused(
      applyTopicReview({
        operation: "merge",
        topicIds: ["topic:fragment", "topic:main"],
        recordIds: [],
        note: "Same event again.",
      }),
    );
    expect(repeat.error?.code).toBe("conflicting_review");

    await undoTopicReview(result.decision.id);
    const restored = await memberships();
    expect(restored.every((row) => !row.locked && row.review_id === null)).toBe(true);
    const [unredirected] = (await db`
      SELECT merged_into FROM topic_catalog WHERE id = 'topic:fragment'
    `) as unknown as Array<{ merged_into: string | null }>;
    expect(unredirected?.merged_into).toBeNull();
  });

  test("unknown, stale, and out-of-topic ids are rejected with the right code", async () => {
    await seedTopic("topic:live", "Chung kết Olympia 2026");
    await seedPost({
      id: "voz:live-1",
      title: "Chung kết Olympia 2026 phát sóng trực tiếp",
      topicId: "topic:live",
    });
    await seedPost({
      id: "voz:live-2",
      title: "Chung kết Olympia 2026 phát sóng trực tiếp",
      topicId: "topic:live",
      authorId: "voz:live-2",
    });
    // Membership from older text: the record changed after it was assigned.
    await seedPost({
      id: "voz:stale",
      title: "Chung kết Olympia 2026 phát sóng trực tiếp",
      contentHash: "hash-after-edit",
      topicId: "topic:live",
      membershipHash: "hash-before-edit",
      authorId: "voz:stale",
    });

    const unknownTopic = await confused(
      applyTopicReview({
        operation: "split",
        topicIds: ["topic:missing"],
        recordIds: ["voz:live-1"],
        note: "Unknown topic.",
      }),
    );
    expect(unknownTopic.error?.code).toBe("not_found");
    expect(unknownTopic.error?.status).toBe(404);

    // A record whose membership no longer matches its text is not a member: the
    // split cannot move stale evidence under a reviewed decision.
    const stale = await confused(
      applyTopicReview({
        operation: "split",
        topicIds: ["topic:live"],
        recordIds: ["voz:stale"],
        note: "Move the outdated record.",
      }),
    );
    expect(stale.error?.code).toBe("not_found");

    const foreign = await confused(
      applyTopicReview({
        operation: "split",
        topicIds: ["topic:live"],
        recordIds: ["voz:not-a-member"],
        note: "Move a record from another topic.",
      }),
    );
    expect(foreign.error?.code).toBe("not_found");

    const everything = await confused(
      applyTopicReview({
        operation: "split",
        topicIds: ["topic:live"],
        recordIds: ["voz:live-1", "voz:live-2"],
        note: "Move everything, leaving nothing.",
      }),
    );
    expect(everything.error?.code).toBe("invalid_review");
    expect(everything.error?.status).toBe(400);

    const longNote = await confused(
      applyTopicReview({
        operation: "split",
        topicIds: ["topic:live"],
        recordIds: ["voz:live-1"],
        note: "x".repeat(501),
      }),
    );
    expect(longNote.error?.code).toBe("invalid_review");

    const oneSidedMerge = await confused(
      applyTopicReview({
        operation: "merge",
        topicIds: ["topic:live"],
        recordIds: [],
        note: "Merging one topic is not a merge.",
      }),
    );
    expect(oneSidedMerge.error?.code).toBe("invalid_review");

    const badShape = await confused(
      applyTopicReview({ operation: "merge", topicIds: "topic:live", recordIds: [], note: "x" }),
    );
    expect(badShape.error?.code).toBe("invalid_review");

    // Nothing above wrote anything.
    const db = await getDb();
    const [count] =
      (await db`SELECT count(*)::int AS count FROM topic_review_decisions`) as unknown as Array<{
        count: number;
      }>;
    expect(count?.count).toBe(0);
  });

  test("undo refuses to clobber a later review, then restores in order", async () => {
    await seedTopic("topic:mixed", "Chung kết Olympia 2026");
    await seedPost({
      id: "voz:a",
      title: "Chung kết Olympia 2026 phát sóng trực tiếp",
      topicId: "topic:mixed",
    });
    await seedPost({
      id: "voz:b",
      title: "Chung kết Olympia 2026 phát sóng trực tiếp",
      topicId: "topic:mixed",
      authorId: "voz:b",
    });
    await seedPost({
      id: "voz:c",
      title: "Chung kết Olympia 2026 phát sóng trực tiếp",
      topicId: "topic:mixed",
      authorId: "voz:c",
    });

    const first = await applyTopicReview({
      operation: "split",
      topicIds: ["topic:mixed"],
      recordIds: ["voz:a"],
      note: "First correction.",
    });
    const second = await applyTopicReview({
      operation: "split",
      topicIds: ["topic:mixed"],
      recordIds: ["voz:b"],
      note: "Second correction of the remainder.",
    });
    expect(second.decision.id).not.toBe(first.decision.id);

    // The first decision no longer owns its rows, so undoing it would rewrite
    // work the second decision depends on.
    const blocked = await confused(undoTopicReview(first.decision.id));
    expect(blocked.error?.code).toBe("conflicting_review");
    expect(blocked.error?.status).toBe(409);
    expect(
      (await listTopicReviews("topic:mixed")).find((d) => d.id === first.decision.id)?.active,
    ).toBe(true);

    // Newest first, then the earlier one becomes safe again.
    await undoTopicReview(second.decision.id);
    const afterSecond = await memberships();
    expect(afterSecond.map((row) => [row.post_id, row.topic_id])).toEqual([
      ["voz:a", first.topicId],
      ["voz:b", "topic:mixed"],
      ["voz:c", "topic:mixed"],
    ]);
    await undoTopicReview(first.decision.id);
    const afterFirst = await memberships();
    expect(afterFirst.map((row) => [row.post_id, row.topic_id, row.locked])).toEqual([
      ["voz:a", "topic:mixed", false],
      ["voz:b", "topic:mixed", false],
      ["voz:c", "topic:mixed", false],
    ]);

    const undoAgain = await confused(undoTopicReview(first.decision.id));
    expect(undoAgain.error?.code).toBe("conflicting_review");
  });

  test("undo refuses changed source revisions without overwriting current membership", async () => {
    await seedTopic("topic:drift", "Olympia 2026");
    await seedPost({
      id: "voz:drift-a",
      topicId: "topic:drift",
      title: "Chung kết Olympia 2026 phát sóng trực tiếp",
    });
    await seedPost({
      id: "voz:drift-b",
      topicId: "topic:drift",
      title: "Chung kết Olympia 2026 phát sóng trực tiếp",
    });
    const review = await applyTopicReview({
      operation: "split",
      topicIds: ["topic:drift"],
      recordIds: ["voz:drift-a"],
      note: "Separate the announcement.",
    });
    const before = await memberships();
    const db = await getDb();
    await db`UPDATE posts SET content_hash = 'edited-source-revision', body = 'Nội dung nguồn đã được sửa' WHERE id = 'voz:drift-a'`;
    const attempt = await confused(undoTopicReview(review.decision.id));
    expect(attempt.error).toMatchObject({ status: 409, code: "conflicting_review" });
    expect(await memberships()).toEqual(before);
    expect(
      (await listTopicReviews("topic:drift")).find((decision) => decision.id === review.decision.id)
        ?.active,
    ).toBe(true);
  });

  test("concurrent identical reviews apply once, and concurrent different ones stay consistent", async () => {
    await seedTopic("topic:race", "Chung kết Olympia 2026");
    await seedTopic("topic:race-target", "Chung kết Olympia 2026 phát sóng trực tiếp");
    await seedPost({
      id: "voz:race-1",
      title: "Chung kết Olympia 2026 phát sóng trực tiếp",
      topicId: "topic:race",
    });
    await seedPost({
      id: "voz:race-2",
      title: "Chung kết Olympia 2026 phát sóng trực tiếp",
      topicId: "topic:race",
      authorId: "voz:race-2",
    });
    await seedPost({
      id: "voz:race-3",
      title: "Chung kết Olympia 2026 phát sóng trực tiếp",
      topicId: "topic:race-target",
      authorId: "voz:race-3",
    });
    await seedPost({
      id: "voz:race-4",
      title: "Chung kết Olympia 2026 phát sóng trực tiếp",
      topicId: "topic:race-target",
      authorId: "voz:race-4",
    });

    const payload = {
      operation: "split" as const,
      topicIds: ["topic:race"],
      recordIds: ["voz:race-1"],
      note: "Same correction sent twice.",
    };
    const settled = await Promise.allSettled([
      applyTopicReview(payload),
      applyTopicReview(payload),
    ]);
    expect(settled.filter((entry) => entry.status === "fulfilled")).toHaveLength(1);
    const rejected = settled.find((entry) => entry.status === "rejected");
    expect(rejected?.status === "rejected" ? failureOf(rejected.reason).code : null).toBe(
      "conflicting_review",
    );

    const db = await getDb();
    const [active] = (await db`
      SELECT count(*)::int AS count FROM topic_review_decisions WHERE active
    `) as unknown as Array<{ count: number }>;
    expect(active?.count).toBe(1);

    // Different operations racing on overlapping rows serialize on the advisory
    // lock. Whichever order they land in, every record ends up accounted for
    // exactly once and nothing is left unlocked or owned by a phantom review.
    const settledPair = await Promise.allSettled([
      applyTopicReview({
        operation: "merge",
        topicIds: ["topic:race-target", "topic:race"],
        recordIds: [],
        note: "Both topics are one broadcast.",
      }),
      applyTopicReview({
        operation: "split",
        topicIds: ["topic:race-target"],
        recordIds: ["voz:race-3"],
        note: "One record describes a different broadcast.",
      }),
    ]);
    for (const entry of settledPair) expect(entry.status).toBe("fulfilled");

    const rows = await memberships();
    expect(rows).toHaveLength(4);
    expect(new Set(rows.map((row) => row.post_id)).size).toBe(4);
    expect(rows.every((row) => row.locked && row.review_id !== null)).toBe(true);
    // The split's own partition survives the interleaving: its record is alone
    // on a manual topic, never folded back into the merged target.
    const splitRecord = rows.find((row) => row.post_id === "voz:race-3");
    expect(splitRecord?.topic_id.startsWith("topic:manual:")).toBe(true);
  });

  test("a merge refuses records it cannot verify, and a split still moves them", async () => {
    await seedTopic("topic:vector-a", "Chung kết Olympia 2026");
    await seedTopic("topic:vector-b", "Chung kết Olympia 2026 phát sóng trực tiếp");
    await seedPost({
      id: "voz:vector-a",
      title: "Chung kết Olympia 2026 phát sóng trực tiếp",
      topicId: "topic:vector-a",
    });
    // A member whose vector row is missing: the guard cannot read its identity,
    // so the merge must be refused rather than assumed compatible. One valid
    // member keeps the topic itself readable, so the refusal comes from the
    // guard rather than from an empty topic.
    await seedPost({
      id: "voz:vector-b",
      title: "Chung kết Olympia 2026 phát sóng trực tiếp",
      topicId: "topic:vector-b",
      noVector: true,
    });
    await seedPost({
      id: "voz:vector-b2",
      title: "Chung kết Olympia 2026 phát sóng trực tiếp",
      topicId: "topic:vector-b",
      authorId: "voz:vector-b2",
    });

    const merge = await confused(
      applyTopicReview({
        operation: "merge",
        topicIds: ["topic:vector-b", "topic:vector-a"],
        recordIds: [],
        note: "Same broadcast.",
      }),
    );
    expect(merge.error?.code).toBe("conflicting_review");

    // A missing vector does not erase original source text or prevent a human
    // from correcting its membership. The label must still come from that source.
    await seedPost({
      id: "voz:vector-a2",
      title: "Chung kết Olympia 2026 phát sóng trực tiếp",
      topicId: "topic:vector-a",
      authorId: "voz:vector-a2",
      noVector: true,
    });
    const split = await applyTopicReview({
      operation: "split",
      topicIds: ["topic:vector-a"],
      recordIds: ["voz:vector-a2"],
      note: "Broadcast announcement, not the reaction thread.",
    });
    expect(split.decision.operation).toBe("split");
    const db = await getDb();
    const [manual] = (await db`
      SELECT label FROM topic_catalog WHERE id = ${split.topicId}
    `) as unknown as Array<{ label: string }>;
    expect(manual?.label).toBe("Chung kết Olympia 2026 phát sóng trực tiếp");

    // A record outside the topic's own membership is never accepted, even with a
    // valid vector elsewhere.
    const foreign = await confused(
      applyTopicReview({
        operation: "split",
        topicIds: ["topic:vector-a"],
        recordIds: ["voz:vector-b2"],
        note: "Cross-topic move.",
      }),
    );
    expect(foreign.error?.code).toBe("not_found");
  });

  test("merging three topics verifies every cross pair, not only the first", async () => {
    await seedTopic("topic:one", "Chung kết Olympia 2026");
    await seedTopic("topic:two", "Chung kết Olympia 2026 phát sóng trực tiếp");
    await seedTopic("topic:three", "Olympia 2026 phần thi khán giả");
    for (const [id, topic] of [
      ["voz:one", "topic:one"],
      ["voz:two", "topic:two"],
      ["voz:three", "topic:three"],
    ] as const) {
      await seedPost({
        id,
        title: "Chung kết Olympia 2026 phát sóng trực tiếp",
        topicId: topic,
        authorId: `voz:${id}`,
      });
    }

    // A version conflict between the second and third topic is enough to refuse
    // the whole decision; the pair is not skipped for being later in the list.
    const db = await getDb();
    await db`UPDATE posts SET title = 'Olympia 2026 phần thi khán giả mùa 25'
             WHERE id = 'voz:three'`;
    const merge = await confused(
      applyTopicReview({
        operation: "merge",
        topicIds: ["topic:one", "topic:two", "topic:three"],
        recordIds: [],
        note: "All one broadcast.",
      }),
    );
    // Whatever the guard decides, it must not write a partial merge: either all
    // three redirect or none does.
    const [decisions] = (await db`
      SELECT count(*)::int AS count FROM topic_review_decisions
    `) as unknown as Array<{ count: number }>;
    if (merge.error) {
      expect(decisions?.count).toBe(0);
      const rows = await memberships();
      expect(rows.every((row) => !row.locked)).toBe(true);
    } else {
      expect(decisions?.count).toBe(1);
      const rows = await memberships();
      expect(rows.every((row) => row.topic_id === merge.value?.topicId)).toBe(true);
    }
  });

  test("a review waits for the intelligence refresh and gives up cleanly", async () => {
    // The refresh takes the same namespace, key 2, before key 3. Holding it here
    // is exactly the state a grouping run puts the database in.
    const holder = new SQL({ url: TEST_URL, max: 1 });
    await holder`SELECT pg_advisory_lock(${0x54524446}::int, 2)`;
    try {
      const pending = applyTopicReview({
        operation: "merge",
        topicIds: ["topic:a", "topic:b"],
        recordIds: [],
        note: "Racing a refresh.",
      });
      let settled = false;
      void pending.then(
        () => {
          settled = true;
        },
        () => {
          settled = true;
        },
      );
      await Bun.sleep(250);
      // Still waiting: the review serialises behind the refresh instead of
      // writing next to it.
      expect(settled).toBe(false);

      // Releasing the refresh lock must let the waiting review proceed, so the
      // wait is a real hand-off rather than a timed-out guess.
      await holder`SELECT pg_advisory_unlock_all()`;
      const attempt = await pending.then(
        (value) => ({ value, error: undefined }),
        (error: ReviewFailure) => ({ value: undefined, error }),
      );
      // Past the lock the review runs its own guards: an empty catalog is a 404,
      // which proves it acquired the lock and continued.
      expect(attempt.error?.code).toBe("not_found");
    } finally {
      await holder`SELECT pg_advisory_unlock_all()`;
      await holder.close();
    }

    const blocked = new SQL({ url: TEST_URL, max: 1 });
    await blocked`SELECT pg_advisory_lock(${0x54524446}::int, 2)`;
    try {
      const attempt = await confused(
        applyTopicReview({
          operation: "merge",
          topicIds: ["topic:a", "topic:b"],
          recordIds: [],
          note: "Refresh never ends.",
        }),
      );
      // A bounded wait, not an indefinite hang: the reviewer is told to retry.
      expect(attempt.error?.code).toBe("conflicting_review");
    } finally {
      await blocked`SELECT pg_advisory_unlock_all()`;
      await blocked.close();
    }
  });

  test("a review never rewrites posts or topic vectors", async () => {
    await seedTopic("topic:immutable", "Chung kết Olympia 2026");
    await seedPost({
      id: "voz:immutable-1",
      title: "Chung kết Olympia 2026 phát sóng trực tiếp",
      topicId: "topic:immutable",
    });
    await seedPost({
      id: "voz:immutable-2",
      title: "Chung kết Olympia 2026 phát sóng trực tiếp",
      topicId: "topic:immutable",
      authorId: "voz:immutable-2",
    });
    const db = await getDb();
    const snapshot = async () =>
      (await db`
        SELECT p.id, p.title, p.body, p.content_hash, p.published_at, p.first_collected_at,
               e.vec::text AS vec, e.model, e.content_hash AS vec_hash
        FROM posts p JOIN topic_embeddings e ON e.post_id = p.id
        ORDER BY p.id
      `) as unknown as unknown[];
    const before = await snapshot();

    const result = await applyTopicReview({
      operation: "split",
      topicIds: ["topic:immutable"],
      recordIds: ["voz:immutable-1"],
      note: "Different broadcast.",
    });
    expect(await snapshot()).toEqual(before);

    await undoTopicReview(result.decision.id);
    expect(await snapshot()).toEqual(before);
  });
});
