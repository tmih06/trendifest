import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import type { TopicDetail } from "../shared/intelligence.ts";
import { closeDb, getDb } from "../server/db.ts";
import {
  MAX_NODE_HISTORY,
  MIN_COMPARABLE_HOURS,
  TREND_WINDOW_HOURS,
  computeAttention,
  computeTrend,
} from "../server/social/topic-trend.ts";
import {
  buildTopicGroup,
  groupSpecificTopics,
  type TopicEvidence,
} from "../server/social/topics.ts";
import { TOPIC_DIM, TOPIC_MODEL } from "../server/social/topic-embedding.ts";
import {
  buildTrendMap,
  closeTrendMapWorker,
  refreshTopicIntelligence,
} from "../server/social/trend-map.ts";
import { getTopicDetail, loadTopicMembers } from "../server/social/topic-intelligence.ts";

/**
 * Measured topic history, stable identity and the durable detail read.
 *
 * Each case pins one rule that a naive implementation gets wrong: growth that is
 * really a migration, a rank movement compared against a five-minute-old sample,
 * a topic that loses its URL when its first record ages out, an edited post that
 * keeps contributing stale evidence, or an account counted five times because it
 * posted five times. Rows are inserted directly because the point is to test the
 * projection and storage rules, not the feed collector.
 *
 * These need a disposable database (`TRENDIFEST_TEST_DATABASE_URL`); without one
 * the suite is skipped so `bun test` stays runnable without Postgres.
 */

const TEST_URL = process.env.TRENDIFEST_TEST_DATABASE_URL ?? "";
const enabled = TEST_URL.length > 0;
if (enabled) process.env.TRENDIFEST_DATABASE_URL = TEST_URL;

const HOUR = 3_600_000;
const MINUTE = 60_000;
/** A unit vector along axis 0: any two records share one direction. */
const UNIT = `[${["1", ...Array<string>(TOPIC_DIM - 1).fill("0")].join(",")}]`;

interface SeedPost {
  id: string;
  title: string;
  body?: string;
  authorId?: string;
  source?: string;
  evidenceType?: "news" | "discussion";
  publisher?: string | null;
  publishedAt?: Date;
  firstCollectedAt?: Date;
  contentHash?: string;
  vectorHash?: string;
  topicId?: string | null;
  locked?: boolean;
  reviewId?: string | null;
  segments?: string[];
}

async function seedPost(options: SeedPost) {
  const db = await getDb();
  const publishedAt = options.publishedAt ?? new Date();
  const firstCollectedAt = options.firstCollectedAt ?? publishedAt;
  const hash = options.contentHash ?? `hash-${options.id}`;
  const source = options.source ?? "voz";
  await db`
    INSERT INTO posts (id, source, uri, author_id, author_handle, body, title, evidence_type,
                       publisher, lang, kind, permalink, published_at, time_kind, media,
                       content_hash, first_collected_at)
    VALUES (${options.id}, ${source}, ${options.id}, ${options.authorId ?? `${source}:${options.id}`},
            ${options.id}, ${options.body ?? options.title}, ${options.title},
            ${options.evidenceType ?? "discussion"}, ${options.publisher ?? null},
            ${["vi"]}::text[], ${options.evidenceType === "news" ? "link" : "text"},
            ${`https://voz.vn/t/${options.id}/`}, ${publishedAt},
            ${options.evidenceType === "news" ? "published" : "activity"}, '[]'::jsonb,
            ${hash}, ${firstCollectedAt})
  `;
  for (const segment of options.segments ?? [source]) {
    await db`
      INSERT INTO observations (post_id, segment_id, observed_at, via)
      VALUES (${options.id}, ${segment}, now(), 'test')
      ON CONFLICT (post_id, segment_id) DO UPDATE SET observed_at = EXCLUDED.observed_at
    `;
  }
  await db`
    INSERT INTO topic_embeddings (post_id, model, content_hash, vec)
    VALUES (${options.id}, ${TOPIC_MODEL}, ${options.vectorHash ?? hash}, ${UNIT}::vector)
  `;
  if (options.topicId) {
    await db`
      INSERT INTO topic_catalog (id, label) VALUES (${options.topicId}, ${options.topicId})
      ON CONFLICT (id) DO NOTHING
    `;
    await db`
      INSERT INTO topic_memberships (post_id, topic_id, content_hash, locked, review_id)
      VALUES (${options.id}, ${options.topicId}, ${options.vectorHash ?? hash},
              ${options.locked ?? false}, ${options.reviewId ?? null})
      ON CONFLICT (post_id) DO UPDATE SET topic_id = EXCLUDED.topic_id,
        content_hash = EXCLUDED.content_hash, locked = EXCLUDED.locked
    `;
  }
}

/** Rewrite the shared singleton so a case can state how old monitoring is. */
async function setMonitoringAge(hours: number) {
  const db = await getDb();
  await db`
    UPDATE topic_intelligence_state
    SET started_at = now() - ${hours} * interval '1 hour', last_refresh_at = NULL, last_error = NULL
  `;
}

async function clear() {
  const db = await getDb();
  await db`
    TRUNCATE topic_snapshots, topic_memberships, topic_review_decisions, topic_catalog,
             topic_embeddings, cluster_members, clusters, embeddings, metric_snapshots,
             observations, posts
    RESTART IDENTITY CASCADE
  `;
  // Restore the singleton to a fresh install rather than a deleted row, so later
  // suites see the same one-row state the migration produces.
  await db`
    INSERT INTO topic_intelligence_state(singleton, started_at, last_refresh_at, last_error)
    VALUES (true, now(), NULL, NULL)
    ON CONFLICT (singleton) DO UPDATE
      SET started_at = now(), last_refresh_at = NULL, last_error = NULL
  `;
}

function evidence(id: string, overrides: Partial<TopicEvidence> = {}): TopicEvidence {
  return {
    id,
    title: "OpenAI ra mắt GPT-5",
    text: "OpenAI ra mắt GPT-5 với khả năng suy luận",
    source: "voz",
    evidenceType: "discussion",
    publisher: null,
    authorId: `voz:${id}`,
    authorHandle: id,
    permalink: `https://voz.vn/t/${id}/`,
    kind: "text",
    timeKind: "published",
    mediaCount: 0,
    contentHash: `hash-${id}`,
    publishedAt: NOW,
    firstCollectedAt: NOW,
    observedAt: NOW,
    segments: ["voz"],
    vector: [1, 0, 0],
    ...overrides,
  };
}

const NOW = new Date("2026-11-05T12:00:00.000Z");

/** Complete hourly observations, including both comparison-window boundaries. */
function measuredHistory(rank = 8) {
  return Array.from({ length: 13 }, (_, index) => ({
    at: NOW.getTime() - (13 - index) * HOUR,
    potential: 40,
    rank,
    accounts: 1,
    publishers: 0,
    posts: 1,
    newsAttention: 0,
    communityMomentum: 29,
  }));
}

describe("measured trend rules", () => {
  test("bootstrap is baseline evidence; young monitoring has no known rank movement", () => {
    const startedAt = new Date(NOW.getTime() - 3 * HOUR);
    const recent = new Date(NOW.getTime() - HOUR);
    const group = buildTopicGroup([
      evidence("baseline", { firstCollectedAt: startedAt, publishedAt: startedAt }),
      evidence("new", { firstCollectedAt: recent, publishedAt: recent }),
    ]);
    const trend = computeTrend(group, { now: NOW, startedAt, rank: 1, history: [], hours: 168 });
    expect(trend.phase).toBe("insufficient_history");
    expect(trend.previousRank).toBeNull();
    expect(trend.rankChange).toBeNull();
    expect(trend.newAccounts).toBe(1);
    expect(trend.recentRecords).toBe(1);
    expect(trend.history).toEqual([]);
  });

  test("age, one six-hour sample, and an offline gap cannot establish comparable windows", () => {
    const group = buildTopicGroup([evidence("a")]);
    const startedAt = new Date(NOW.getTime() - 48 * HOUR);
    const hourly = measuredHistory();
    for (const history of [[], [hourly[7]!], hourly.filter((_, index) => index !== 6)]) {
      const trend = computeTrend(group, { now: NOW, startedAt, rank: 4, hours: 168, history });
      expect(trend.comparable).toBe(false);
      expect(trend.phase).toBe("insufficient_history");
      expect(trend.previousRank).toBeNull();
      expect(trend.rankChange).toBeNull();
    }
  });

  test("rank movement compares the actual six-hour observation, not the newest sample", () => {
    const history = measuredHistory(8);
    history.push({ ...history.at(-1)!, at: NOW.getTime() - 5 * MINUTE, rank: 2 });
    const trend = computeTrend(buildTopicGroup([evidence("a")]), {
      now: NOW,
      startedAt: new Date(NOW.getTime() - 48 * HOUR),
      rank: 3,
      hours: 168,
      history,
    });
    expect(trend.comparable).toBe(true);
    expect(trend.previousRank).toBe(8);
    expect(trend.rankChange).toBe(5);
    expect(trend.history.at(-1)!.at).toBe(new Date(NOW.getTime() - 5 * MINUTE).toISOString());
  });

  test("repeated publications count one independent account, while unknown actors never count", () => {
    const recent = new Date(NOW.getTime() - HOUR);
    const repeat = Array.from({ length: 4 }, (_, index) =>
      evidence(`repeat-${index}`, {
        authorId: "voz:same",
        firstCollectedAt: recent,
        publishedAt: recent,
      }),
    );
    const group = buildTopicGroup([
      ...repeat,
      evidence("other", { firstCollectedAt: recent, publishedAt: recent }),
      evidence("anonymous", {
        authorId: "voz:unknown",
        firstCollectedAt: recent,
        publishedAt: recent,
      }),
    ]);
    const trend = computeTrend(group, {
      now: NOW,
      startedAt: new Date(NOW.getTime() - 24 * HOUR),
      rank: 1,
      hours: 168,
      history: measuredHistory(),
    });
    expect(trend.newAccounts).toBe(2);
    expect(trend.newPublishers).toBe(0);
    expect(trend.recentRecords).toBe(6);
  });

  test("archive imports and activity-only forum bumps add breadth but cannot look like fresh growth", () => {
    const recent = new Date(NOW.getTime() - HOUR);
    const group = buildTopicGroup([
      evidence("archive", {
        source: "vnexpress",
        evidenceType: "news",
        publisher: "VnExpress",
        firstCollectedAt: recent,
        publishedAt: new Date(NOW.getTime() - 120 * HOUR),
      }),
      evidence("bump", { timeKind: "activity", firstCollectedAt: recent, publishedAt: recent }),
    ]);
    const trend = computeTrend(group, {
      now: NOW,
      startedAt: new Date(NOW.getTime() - 24 * HOUR),
      rank: 2,
      hours: 168,
      history: measuredHistory(),
    });
    expect(computeAttention(group).newsPublishers).toBe(1);
    expect(computeAttention(group).communityAccounts).toBe(1);
    expect(trend.newAccounts).toBe(0);
    expect(trend.newPublishers).toBe(0);
    expect(trend.newSources).toEqual([]);
    expect(trend.recentRecords).toBe(0);
    expect(trend.phase).toBe("fading");
  });

  test("accelerating, stable, and slowing independent support produce different phases", () => {
    for (const [prior, current, phase] of [
      [1, 2, "rising"],
      [1, 1, "sustained"],
      [2, 1, "fading"],
      [0, 0, "fading"],
    ] as const) {
      const members = [
        ...Array.from({ length: prior }, (_, index) =>
          evidence(`prior-${index}`, {
            firstCollectedAt: new Date(NOW.getTime() - 8 * HOUR),
            publishedAt: new Date(NOW.getTime() - 8 * HOUR),
          }),
        ),
        ...Array.from({ length: current }, (_, index) =>
          evidence(`new-${index}`, {
            firstCollectedAt: new Date(NOW.getTime() - HOUR),
            publishedAt: new Date(NOW.getTime() - HOUR),
          }),
        ),
      ];
      if (members.length === 0)
        members.push(
          evidence("old", {
            firstCollectedAt: new Date(NOW.getTime() - 20 * HOUR),
            publishedAt: new Date(NOW.getTime() - 20 * HOUR),
          }),
        );
      const trend = computeTrend(buildTopicGroup(members), {
        now: NOW,
        startedAt: new Date(NOW.getTime() - 48 * HOUR),
        rank: 5,
        hours: 168,
        history: measuredHistory(),
      });
      expect(trend.newAccounts).toBe(current);
      expect(trend.priorRecords).toBe(prior);
      expect(trend.phase).toBe(phase);
    }
  });

  test("news and community channels exclude duplicates and unknown identities", () => {
    const group = buildTopicGroup([
      evidence("news-1", {
        evidenceType: "news",
        publisher: "VnExpress",
        authorId: "vnexpress:unknown",
      }),
      evidence("news-2", {
        evidenceType: "news",
        publisher: "VnExpress",
        authorId: "vnexpress:unknown",
      }),
      evidence("chat-1", { authorId: "voz:one" }),
      evidence("chat-2", { authorId: "voz:unknown" }),
      evidence("news-unknown", { evidenceType: "news", publisher: null }),
    ]);
    const attention = computeAttention(group);
    expect(attention.newsPublishers).toBe(1);
    expect(attention.communityAccounts).toBe(1);
    expect(attention.news).toBeGreaterThan(0);
    expect(attention.community).toBeGreaterThan(0);
    expect(attention.news).toBeLessThan(100);
    expect(
      computeAttention(buildTopicGroup([evidence("anon", { authorId: "voz:unknown" })])).community,
    ).toBe(0);
  });

  test("bounded history preserves actual stored values and observation times", () => {
    const history = Array.from({ length: 40 }, (_, index) => ({
      ...measuredHistory()[0]!,
      at: NOW.getTime() - (40 - index) * HOUR,
      potential: 10 + index,
      rank: 100 - index,
    }));
    const trend = computeTrend(buildTopicGroup([evidence("a")]), {
      now: NOW,
      startedAt: new Date(NOW.getTime() - 72 * HOUR),
      rank: 2,
      hours: 168,
      history,
    });
    expect(trend.history).toEqual(
      history
        .slice(-MAX_NODE_HISTORY)
        .map((point) => ({ ...point, at: new Date(point.at).toISOString() })),
    );
  });
});

describe("automatic grouping identity", () => {
  test("grouping is deterministic and builds one topic per specific event", () => {
    const records = [
      evidence("x1", { authorId: "voz:x1" }),
      evidence("x2", {
        title: "GPT-5 chính thức được công bố",
        text: "GPT-5 đã chính thức được OpenAI công bố",
        authorId: "voz:x2",
      }),
    ];
    const groups = groupSpecificTopics(records);
    expect(groups.length).toBe(1);
    expect(groups[0]!.members.length).toBe(2);
    const again = groupSpecificTopics([...records].reverse());
    expect(again.map((group) => group.id)).toEqual(groups.map((group) => group.id));
  });
});

describe.skipIf(!enabled)("persisted topic intelligence", () => {
  beforeEach(clear);
  // Leave the scratch database exactly as this suite found it: no fabricated
  // history, no catalog rows, no posts for another suite to regroup.
  afterAll(async () => {
    await clear();
    await closeTrendMapWorker();
    await closeDb();
  });

  test("a cold corpus materializes honestly: no history, no invented audience", async () => {
    await seedPost({ id: "voz:gpt5-a", title: "OpenAI ra mắt GPT-5" });
    await seedPost({
      id: "voz:gpt5-b",
      title: "OpenAI ra mắt GPT-5",
      authorId: "voz:second",
    });

    const maps = await refreshTopicIntelligence();
    expect(maps.map((map) => map.hours).sort((a, b) => a - b)).toEqual([24, 72, 168]);
    const map = maps.find((item) => item.hours === 168)!;
    expect(map.nodes.length).toBe(1);
    const node = map.nodes[0]!;
    expect(node.id.startsWith("topic:")).toBe(true);
    expect(node.trend.phase).toBe("insufficient_history");
    expect(node.trend.previousRank).toBeNull();
    expect(node.trend.rankChange).toBeNull();
    expect(node.trend.history).toEqual([]);
    expect(node.attention.communityAccounts).toBe(2);
    expect(node.attention.newsPublishers).toBe(0);
    expect(map.intelligence.lastSnapshotAt).not.toBeNull();

    const db = await getDb();
    const snaps = (await db`
      SELECT rank, potential, posts FROM topic_snapshots WHERE hours = 168
    `) as unknown as Array<{ rank: number; potential: number; posts: number }>;
    expect(snaps.length).toBe(1);
    expect(snaps[0]!.rank).toBe(1);
    expect(snaps[0]!.potential).toBe(node.potential);
  });

  test("ranking is one global order even when the source floor chose the topic", async () => {
    // Small per-segment groups would have been ordered by source floor alone.
    await seedPost({ id: "voz:low-1", title: "Tuyển sinh lớp 10 tại Hà Nội", segments: ["voz"] });
    await seedPost({
      id: "voz:low-2",
      title: "Tuyển sinh lớp 10 tại Hà Nội",
      authorId: "voz:low-b",
      segments: ["voz"],
    });
    for (let index = 0; index < 3; index += 1) {
      await seedPost({
        id: `nguoi-viet:big-${index}`,
        title: "Cháy lớn ở chợ Kim Liên Hà Nội",
        evidenceType: "news",
        publisher: "Người Việt",
        source: "nguoi-viet",
        segments: ["nguoi-viet"],
      });
    }
    const [map] = (await refreshTopicIntelligence()).filter((item) => item.hours === 168);
    expect(map!.nodes.length).toBe(2);
    const potentials = map!.nodes.map((node) => node.potential);
    expect(potentials).toEqual([...potentials].sort((a, b) => b - a));
    for (const [index, node] of map!.nodes.entries()) {
      expect(node.trend.phase).toBe("insufficient_history");
      expect(node.id.length).toBeGreaterThan("topic:".length);
      expect(index === 0 || node.potential <= map!.nodes[index - 1]!.potential).toBe(true);
    }
  });

  test("a topic keeps its identity after its first record leaves the window", async () => {
    const old = new Date(Date.now() - 100 * HOUR);
    // The seed record is old enough to leave a 72-hour view but not the 168-hour one.
    await seedPost({ id: "voz:seed-record", title: "OpenAI ra mắt GPT-5", publishedAt: old });
    await seedPost({
      id: "voz:follow-up",
      title: "OpenAI ra mắt GPT-5",
      authorId: "voz:later",
      publishedAt: new Date(Date.now() - 2 * HOUR),
    });
    const wide = (await refreshTopicIntelligence()).find((item) => item.hours === 168)!;
    const firstId = wide.nodes[0]!.id;
    expect(wide.nodes[0]!.posts).toBe(2);

    const db = await getDb();
    await db`DELETE FROM posts WHERE id = 'voz:seed-record'`;
    const afterDelete = (await refreshTopicIntelligence()).find((item) => item.hours === 168)!;
    expect(afterDelete.nodes.length).toBe(1);
    // The membership of the surviving record still names the old topic, so the
    // id (and therefore bookmarks, watches and history) survives the departure.
    expect(afterDelete.nodes[0]!.id).toBe(firstId);
  });

  test("an edited post stops contributing instead of keeping stale evidence", async () => {
    await seedPost({ id: "voz:edited", title: "OpenAI ra mắt GPT-5" });
    await seedPost({ id: "voz:peer", title: "OpenAI ra mắt GPT-5", authorId: "voz:peer" });
    const [map] = (await refreshTopicIntelligence()).filter((item) => item.hours === 168);
    const topicId = map!.nodes[0]!.id;
    expect(map!.nodes[0]!.posts).toBe(2);

    const db = await getDb();
    // Text changed, vector not yet recomputed: the record must disappear until
    // it is re-embedded, never be shown under the old text.
    await db`
      UPDATE posts SET body = 'Nội dung đã sửa hoàn toàn khác', content_hash = 'hash-edited'
      WHERE id = 'voz:edited'
    `;
    const [staleMap] = (await refreshTopicIntelligence()).filter((item) => item.hours === 168);
    expect(staleMap!.nodes[0]!.id).toBe(topicId);
    expect(staleMap!.nodes[0]!.posts).toBe(1);
    const members = await loadTopicMembers(topicId, 87600);
    expect(members.map((member) => member.id)).toEqual(["voz:peer"]);

    await db`
      UPDATE topic_embeddings SET content_hash = 'hash-edited' WHERE post_id = 'voz:edited'
    `;
    const [restoredMap] = (await refreshTopicIntelligence()).filter((item) => item.hours === 168);
    expect(restoredMap!.nodes[0]!.posts).toBe(2);
  });

  test("repeated refreshes never rewrite assignment time of unchanged evidence", async () => {
    await seedPost({ id: "voz:stable", title: "OpenAI ra mắt GPT-5" });
    await seedPost({ id: "voz:stable-2", title: "OpenAI ra mắt GPT-5", authorId: "voz:s2" });
    await refreshTopicIntelligence();
    const db = await getDb();
    const [before] = (await db`
      SELECT assigned_at FROM topic_memberships WHERE post_id = 'voz:stable'
    `) as unknown as Array<{ assigned_at: Date }>;
    // A refresh in the very same minute exercises the upsert path twice: the
    // wait is a database round trip, not a timer that guesses at a duration.
    await db`SELECT pg_sleep(0.02)`;
    await refreshTopicIntelligence();
    const [after] = (await db`
      SELECT assigned_at FROM topic_memberships WHERE post_id = 'voz:stable'
    `) as unknown as Array<{ assigned_at: Date }>;
    expect(new Date(after!.assigned_at).getTime()).toBe(new Date(before!.assigned_at).getTime());
  });

  test("an unambiguous reviewed topic accepts fresh support without losing its lock", async () => {
    await seedPost({
      id: "voz:locked",
      title: "OpenAI ra mắt GPT-5",
      topicId: "topic:manual:aaaaaaaaaaaaaaaa",
      locked: true,
      reviewId: "review:test",
    });
    await seedPost({ id: "voz:auto-1", title: "OpenAI ra mắt GPT-5", authorId: "voz:a1" });
    await seedPost({ id: "voz:auto-2", title: "OpenAI ra mắt GPT-5", authorId: "voz:a2" });

    const [map] = (await refreshTopicIntelligence()).filter((item) => item.hours === 168);
    const ids = map!.nodes.map((node) => node.id);
    expect(ids).toContain("topic:manual:aaaaaaaaaaaaaaaa");
    const manual = map!.nodes.find((node) => node.id === "topic:manual:aaaaaaaaaaaaaaaa")!;
    expect(manual.posts).toBe(3);
    expect(map!.nodes.map((node) => node.id)).toEqual(["topic:manual:aaaaaaaaaaaaaaaa"]);

    // A refresh must not overwrite the lock or its assignment.
    const db = await getDb();
    const [row] = (await db`
      SELECT topic_id, locked FROM topic_memberships WHERE post_id = 'voz:locked'
    `) as unknown as Array<{ topic_id: string; locked: boolean }>;
    expect(row!.topic_id).toBe("topic:manual:aaaaaaaaaaaaaaaa");
    expect(row!.locked).toBe(true);
  });

  test("new evidence cannot bridge two human-separated same-event partitions", async () => {
    for (const partition of ["one", "two"]) {
      await seedPost({
        id: `voz:${partition}`,
        title: "OpenAI ra mắt GPT-5",
        topicId: `topic:manual:${partition}`,
        locked: true,
        reviewId: `review:${partition}`,
      });
    }
    await seedPost({ id: "voz:new", title: "OpenAI ra mắt GPT-5" });
    const map = (await refreshTopicIntelligence()).find((item) => item.hours === 168)!;
    expect(map.nodes).toHaveLength(3);
    expect(map.nodes.find((node) => node.id === "topic:manual:one")!.posts).toBe(1);
    expect(map.nodes.find((node) => node.id === "topic:manual:two")!.posts).toBe(1);
  });

  test("an edited reviewed record can be reassigned after its replacement vector is ready", async () => {
    await seedPost({
      id: "voz:revision",
      title: "OpenAI ra mắt GPT-5",
      topicId: "topic:manual:old",
      locked: true,
      reviewId: "review:old",
    });
    await refreshTopicIntelligence();
    const db = await getDb();
    await db`UPDATE posts SET title='Anthropic công bố Claude Sonnet 4', body='Anthropic công bố Claude Sonnet 4', content_hash='replacement' WHERE id='voz:revision'`;
    await db`UPDATE topic_embeddings SET content_hash='replacement' WHERE post_id='voz:revision'`;
    const map = (await refreshTopicIntelligence()).find((item) => item.hours === 168)!;
    expect(map.nodes).toHaveLength(1);
    expect(map.nodes[0]!.id).not.toBe("topic:manual:old");
    const [membership] =
      await db`SELECT content_hash,locked,review_id FROM topic_memberships WHERE post_id='voz:revision'`;
    expect(membership.content_hash).toBe("replacement");
    expect(membership.locked).toBe(false);
    expect(membership.review_id).toBeNull();
  });

  test("snapshot writes do not invalidate the map, membership writes do", async () => {
    await seedPost({ id: "voz:cache-1", title: "OpenAI ra mắt GPT-5" });
    await seedPost({ id: "voz:cache-2", title: "OpenAI ra mắt GPT-5", authorId: "voz:c2" });
    await refreshTopicIntelligence();
    const first = await buildTrendMap(168);
    const second = await buildTrendMap(168);
    // Same minute, same persisted inputs: the cached map is reused as-is.
    expect(second.generatedAt).toBe(first.generatedAt);

    const db = await getDb();
    // A review lock is a real input change and must be visible immediately.
    await db`UPDATE topic_memberships SET locked = false, topic_id = topic_id WHERE post_id = 'voz:cache-1'`;
    await seedPost({ id: "voz:cache-3", title: "OpenAI ra mắt GPT-5", authorId: "voz:c3" });
    // A discovered new record changes the corpus, so the next read rebuilds.
    const third = await buildTrendMap(168);
    expect(third.stats.posts).toBe(3);
  });

  test("detail is a real paginated timeline with distinct times and no fabricated history", async () => {
    await setMonitoringAge(30);
    const published = new Date(Date.now() - 10 * HOUR);
    await seedPost({
      id: "voz:news-detail",
      title: "OpenAI ra mắt GPT-5",
      evidenceType: "news",
      publisher: "VnExpress",
      source: "vnexpress",
      segments: ["vnexpress"],
      publishedAt: published,
    });
    await seedPost({
      id: "voz:detail-a",
      title: "OpenAI ra mắt GPT-5",
      authorId: "voz:da",
      publishedAt: new Date(Date.now() - 5 * HOUR),
      firstCollectedAt: new Date(Date.now() - 4 * HOUR),
    });
    await seedPost({
      id: "voz:detail-b",
      title: "OpenAI ra mắt GPT-5",
      authorId: "voz:db",
      publishedAt: new Date(Date.now() - 2 * HOUR),
      firstCollectedAt: new Date(Date.now() - HOUR),
    });

    const [map] = (await refreshTopicIntelligence()).filter((item) => item.hours === 168);
    const topicId = map!.nodes[0]!.id;

    const page = await getTopicDetail(topicId, 168, 0, 2);
    expect(page.topicId).toBe(topicId);
    expect(page.total).toBe(3);
    expect(page.records.length).toBe(2);
    // Source-time order, newest first, with collection and observation distinct.
    expect(page.records.map((record) => record.id)).toEqual(["voz:detail-b", "voz:detail-a"]);
    const news = page.records[0]!.evidenceType;
    expect(news).toBe("discussion");
    for (const record of page.records) {
      expect(record.sourceAt).not.toBe(record.firstCollectedAt);
      expect(record.timeKind).toBe("activity");
    }

    const second = await getTopicDetail(topicId, 168, 2, 2);
    expect(second.records.length).toBe(1);
    expect(second.records[0]!.evidenceType).toBe("news");
    expect(second.records[0]!.timeKind).toBe("published");
    expect(second.records[0]!.publisher).toBe("VnExpress");
    expect(second.records[0]!.sourceAt).toBe(published.toISOString());

    // Stored history is what was sampled; nothing is backfilled to look mature.
    expect(page.history.length).toBe(1);
    expect(page.history[0]!.rank).toBe(1);
    expect(page.entities.length).toBeGreaterThan(0);
    expect(page.review.lockedRecords).toBe(0);

    await expect(getTopicDetail("topic:does-not-exist", 168)).rejects.toMatchObject({
      status: 404,
      code: "not_found",
    });
    await expect(getTopicDetail(topicId, 0)).rejects.toMatchObject({ status: 400 });
    await expect(getTopicDetail(topicId, 168, 0, 5_000)).rejects.toMatchObject({ status: 400 });
  });

  test("a merged topic resolves to its target for detail and members", async () => {
    await seedPost({ id: "voz:m-1", title: "OpenAI ra mắt GPT-5", topicId: "topic:source" });
    await seedPost({
      id: "voz:m-2",
      title: "OpenAI ra mắt GPT-5",
      authorId: "voz:m2",
      topicId: "topic:source",
    });
    const db = await getDb();
    await db`INSERT INTO topic_catalog (id, label) VALUES ('topic:target', 'OpenAI GPT-5') ON CONFLICT DO NOTHING`;
    await db`UPDATE topic_catalog SET merged_into = 'topic:target' WHERE id = 'topic:source'`;

    const detail = await getTopicDetail("topic:source", 168);
    expect(detail.topicId).toBe("topic:target");
    expect(detail.label).toBe("OpenAI GPT-5");
    expect(detail.total).toBe(2);
    const members = await loadTopicMembers("topic:source", 87600);
    expect(members.map((member) => member.id).sort()).toEqual(["voz:m-1", "voz:m-2"]);
  });

  test("stale or deleted membership never reaches the review reader", async () => {
    await seedPost({
      id: "voz:live-member",
      title: "OpenAI ra mắt GPT-5",
      topicId: "topic:review",
    });
    await seedPost({
      id: "voz:stale-member",
      title: "OpenAI ra mắt GPT-5",
      topicId: "topic:review",
      contentHash: "hash-current",
      vectorHash: "hash-from-older-text",
    });
    await seedPost({
      id: "voz:deleted-member",
      title: "OpenAI ra mắt GPT-5",
      topicId: "topic:review",
    });
    const db = await getDb();
    await db`UPDATE posts SET deleted_at = now() WHERE id = 'voz:deleted-member'`;

    const members = await loadTopicMembers("topic:review", 87600);
    expect(members.map((member) => member.id)).toEqual(["voz:live-member"]);

    // `total` uses the same predicate as the page, so a pager cannot promise
    // rows the next page does not contain.
    const detail = await getTopicDetail("topic:review", 168, 0, 10);
    expect(detail.total).toBe(1);
    expect(detail.records.map((record) => record.id)).toEqual(["voz:live-member"]);
  });

  test("hourly snapshots upsert one row per bucket and retention is finite", async () => {
    await seedPost({ id: "voz:ret-1", title: "OpenAI ra mắt GPT-5" });
    await seedPost({ id: "voz:ret-2", title: "OpenAI ra mắt GPT-5", authorId: "voz:r2" });
    await refreshTopicIntelligence();
    await refreshTopicIntelligence();
    const db = await getDb();
    const [counts] = (await db`
      SELECT count(*)::int AS total, count(DISTINCT bucket_at)::int AS buckets
      FROM topic_snapshots WHERE hours = 168
    `) as unknown as Array<{ total: number; buckets: number }>;
    // Same hour, same topic: one observation, not one per refresh.
    expect(counts!.total).toBe(1);
    expect(counts!.buckets).toBe(1);

    // An old observation is pruned by the finite retention floor.
    await db`
      INSERT INTO topic_snapshots (topic_id, hours, bucket_at, observed_at, potential, rank, accounts,
                                   publishers, posts, news_attention, community_momentum, source_ids)
      SELECT id, 168, now() - interval '100 hours', now() - interval '100 hours', 10, 5, 1, 0, 1, 0, 0, '{}'
      FROM topic_catalog LIMIT 1
    `;
    await refreshTopicIntelligence();
    const [remaining] = (await db`
      SELECT count(*)::int AS total FROM topic_snapshots
      WHERE bucket_at < now() - interval '72 hours'
    `) as unknown as Array<{ total: number }>;
    expect(remaining!.total).toBe(0);
  });

  test("a comparable topic reports a real measured movement", async () => {
    const prior = new Date(Date.now() - 20 * HOUR);
    await seedPost({
      id: "voz:cmp-1",
      title: "OpenAI ra mắt GPT-5",
      publishedAt: prior,
      firstCollectedAt: prior,
    });
    await seedPost({
      id: "voz:cmp-2",
      title: "OpenAI ra mắt GPT-5",
      authorId: "voz:cmp2",
      publishedAt: prior,
      firstCollectedAt: prior,
    });
    await setMonitoringAge(MIN_COMPARABLE_HOURS + 12);
    const [first] = (await refreshTopicIntelligence()).filter((item) => item.hours === 168);
    const topicId = first!.nodes[0]!.id;

    const db = await getDb();
    // Full observations across both windows, not one backdated rank sample.
    await db`
      INSERT INTO topic_snapshots (topic_id, hours, bucket_at, observed_at, potential, rank, accounts,
                                   publishers, posts, news_attention, community_momentum, source_ids)
      SELECT ${topicId}, 168, date_trunc('hour', now() - n * interval '1 hour'),
             now() - n * interval '1 hour', 40, 9, 1, 0, 1, 0, 29, '{}'
      FROM generate_series(1, 13) AS n
      ON CONFLICT (topic_id, hours, bucket_at) DO UPDATE
      SET rank = 9, potential = 40, observed_at = EXCLUDED.observed_at
    `;
    await seedPost({
      id: "voz:cmp-3",
      title: "OpenAI ra mắt GPT-5",
      authorId: "vnexpress:unknown",
      source: "vnexpress",
      evidenceType: "news",
      publisher: "VnExpress",
      publishedAt: new Date(Date.now() - HOUR),
    });
    const [second] = (await refreshTopicIntelligence()).filter((item) => item.hours === 168);
    const node = second!.nodes.find((item) => item.id === topicId)!;
    expect(node.trend.comparable).toBe(true);
    expect(node.trend.previousRank).toBe(9);
    expect(node.trend.rankChange).toBe(8);
    expect(node.trend.newAccounts).toBe(0);
    expect(node.trend.newPublishers).toBe(1);
    expect(node.trend.phase).toBe("rising");
    expect(node.trend.history.length).toBeGreaterThanOrEqual(2);
    expect(node.trend.windowHours).toBe(TREND_WINDOW_HOURS);
  });

  test("review decisions and locks appear on the detail read", async () => {
    await seedPost({
      id: "voz:reviewed-1",
      title: "OpenAI ra mắt GPT-5",
      topicId: "topic:reviewed",
      locked: true,
      reviewId: "review:abc",
    });
    const db = await getDb();
    await db`
      INSERT INTO topic_review_decisions (id, operation, topic_ids, record_ids, target_id, note)
      VALUES ('review:abc', 'merge', ARRAY['topic:a', 'topic:reviewed'], ARRAY['voz:reviewed-1'],
              'topic:reviewed', 'Same launch event')
    `;
    const detail: TopicDetail = await getTopicDetail("topic:reviewed", 168);
    expect(detail.review.lockedRecords).toBe(1);
    expect(detail.review.decisions.length).toBe(1);
    expect(detail.review.decisions[0]!.operation).toBe("merge");
    expect(detail.review.decisions[0]!.note).toBe("Same launch event");
  });
});
