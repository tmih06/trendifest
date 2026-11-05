import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { TopicAttention, TopicEntity, TopicTrend } from "../shared/intelligence.ts";
import type { TrendMap, TrendMapNode } from "../shared/types.ts";
import { closeDb, getDb } from "../server/db.ts";
import {
  createWatchRule,
  deleteWatchRule,
  evaluateWatchAlerts,
  getWatchlists,
  markAlertRead,
  updateWatchRule,
} from "../server/social/watchlists.ts";

/**
 * Watch evaluation is the feature: the rules below encode every way a naive
 * "new post in topic" alert goes wrong. They insert records directly because
 * each case pins one documented rule exactly; running real feeds would test the
 * collector instead.
 *
 * These need a database. `TRENDIFEST_TEST_DATABASE_URL` points at a disposable
 * one; without it the suite is skipped so `bun test` stays runnable.
 */

const TEST_URL = process.env.TRENDIFEST_TEST_DATABASE_URL ?? "";
const enabled = TEST_URL.length > 0;
if (enabled) process.env.TRENDIFEST_DATABASE_URL = TEST_URL;

const MINUTE = 60_000;
const HOUR = 3_600_000;

/** Records use the actual collection clock; future records must not prove growth. */
const fresh = () => new Date();

/**
 * Suites share the scratch database, so every row this one writes carries its
 * own prefix and cleanup removes exactly those rows. Nothing here truncates
 * another suite's corpus or rewrites the shared intelligence state — the
 * bootstrap-guard case starts its own catalog row instead.
 */
const RUN = randomUUID().slice(0, 8);
const postId = (name: string) => `watchtest:${RUN}:${name}`;
/** Catalog ids stay unique per run, so a shared scratch database never collides. */
const T = (name: string) => `topic:watchtest-${RUN}-${name}`;

/** A node is all watch evaluation reads: id, label, potential, entityIds. */
function node(id: string, overrides: Partial<TrendMapNode> = {}): TrendMapNode {
  const trend: TopicTrend = {
    phase: "insufficient_history",
    comparable: false,
    windowHours: 6,
    previousRank: null,
    rankChange: null,
    newAccounts: 0,
    newPublishers: 0,
    newSources: [],
    recentRecords: 0,
    priorRecords: 0,
    history: [],
    reasons: [],
  };
  const attention: TopicAttention = {
    news: 0,
    community: 0,
    newsPublishers: 0,
    communityAccounts: 0,
  };
  return {
    id,
    kind: "topic",
    label: id,
    description: "",
    radius: 1,
    potential: 50,
    posts: 0,
    authors: 0,
    segments: [],
    score: {
      potential: 50,
      reach: 0,
      velocity: 0,
      spread: 0,
      persistence: 0,
      diversity: 0,
      confidence: 1,
      authors: 0,
      posts: 0,
    },
    discussionPosts: 0,
    newsPosts: 0,
    publishers: 0,
    mediaCount: 0,
    firstSeenAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    examples: [],
    trend,
    attention,
    entityIds: [],
    ...overrides,
  };
}

function map(nodes: TrendMapNode[], hours = 168): TrendMap {
  return {
    hours,
    generatedAt: new Date().toISOString(),
    nodes,
    edges: [],
    coverage: [],
    entities: [],
    intelligence: { startedAt: new Date().toISOString(), lastSnapshotAt: null, refreshing: false },
    stats: {
      posts: 0,
      topics: nodes.length,
      discussionPosts: 0,
      newsPosts: 0,
      pendingEmbeddings: 0,
      limited: false,
    },
    method: {
      version: 3,
      velocityWindowHours: 6,
      weights: {},
      topicModel: "test",
      groupingThreshold: 0.88,
      velocityComparable: false,
    },
  };
}

interface SeedOptions {
  id: string;
  topicId: string;
  evidenceType?: "news" | "discussion";
  /** Community author; news records use `publisher` instead. */
  authorId?: string;
  publisher?: string | null;
  source?: string;
  /** Source-reported time, distinct from collection time. */
  publishedAt?: Date;
  /** Fixtures can model real publication; forum activity must remain explicit. */
  timeKind?: "published" | "activity";
  /** When we first saw it; the only watermark that can create support. */
  firstCollectedAt?: Date;
  /** Stored membership hash; a mismatch makes the row stale evidence. */
  membershipHash?: string;
  deleted?: boolean;
}

/** One record plus its catalog membership, exactly as the refresh writes them. */
async function seed(options: SeedOptions) {
  const db = await getDb();
  const contentHash = `hash-${options.id}`;
  const evidenceType = options.evidenceType ?? "discussion";
  const publishedAt = options.publishedAt ?? new Date();
  const firstCollectedAt = options.firstCollectedAt ?? publishedAt;
  const source = options.source ?? (evidenceType === "news" ? "vnexpress" : "voz");
  const post = postId(options.id);
  await db`
    INSERT INTO topic_catalog (id, label)
    VALUES (${options.topicId}, ${options.topicId})
    ON CONFLICT (id) DO NOTHING
  `;
  await db`
    INSERT INTO posts (id, source, uri, author_id, author_handle, body, title, evidence_type,
                       publisher, lang, kind, permalink, published_at, time_kind, media,
                       content_hash, first_collected_at, deleted_at)
    VALUES (${post}, ${source}, ${post},
            ${options.authorId ?? `${source}:${post}`}, ${options.authorId ?? post},
            ${`body ${post}`}, ${`title ${post}`}, ${evidenceType},
            ${options.publisher ?? null}, ${["vi"]}::text[], 'text',
            ${`https://example.test/${post}`}, ${publishedAt},
            ${options.timeKind ?? "published"}, '[]'::jsonb, ${contentHash},
            ${firstCollectedAt}, ${options.deleted ? new Date() : null})
  `;
  await db`
    INSERT INTO topic_memberships (post_id, topic_id, content_hash)
    VALUES (${post}, ${options.topicId}, ${options.membershipHash ?? contentHash})
    ON CONFLICT (post_id) DO UPDATE SET
      topic_id = EXCLUDED.topic_id, content_hash = EXCLUDED.content_hash
  `;
}

/** Creation anchors the baseline at "now", so tests backdate to cross a threshold. */
async function backdateMinutes(watchId: string, minutes: number) {
  const db = await getDb();
  await db`
    UPDATE watch_rules SET
      created_at = now() - ${`${minutes} minutes`}::interval,
      evaluated_at = now() - ${`${minutes} minutes`}::interval,
      baseline = jsonb_set(
        baseline,
        '{watermark}',
        to_jsonb(now() - ${`${minutes} minutes`}::interval)
      )
    WHERE id = ${watchId}
  `;
}

async function clear() {
  const db = await getDb();
  await db`TRUNCATE watch_alerts, watch_rules RESTART IDENTITY CASCADE`;
  // Deleting our posts cascades their memberships. The prefix belongs to this
  // suite alone, so a run that failed mid-way still leaves nothing behind for
  // the next one.
  await db`DELETE FROM posts WHERE id LIKE 'watchtest:%'`;
  await db`DELETE FROM topic_catalog WHERE id LIKE 'topic:watchtest-%'`;
}

describe.skipIf(!enabled)("watch rules and alerts", () => {
  beforeEach(clear);
  // Leave the shared scratch database as this suite found it: no leftover rules,
  // alerts, posts or catalog rows for another suite to trip over.
  afterAll(async () => {
    await clear();
    await closeDb();
  });

  test("invalid watch contracts return semantic client errors", async () => {
    await assert.rejects(
      createWatchRule({ kind: "topic", targetId: T("a"), label: "A", minNewAccounts: 0 }),
      { status: 400, code: "invalid_watch" },
    );
    await assert.rejects(
      createWatchRule({ kind: "nope", targetId: T("a"), label: "A", minNewAccounts: 1 }),
      { status: 400, code: "invalid_watch" },
    );
    await assert.rejects(createWatchRule(null), {
      status: 400,
      code: "invalid_watch",
    });
    await assert.rejects(
      createWatchRule({
        kind: "topic",
        targetId: T("a"),
        label: "A",
        minNewPublishers: 1.5,
      }),
      { status: 400, code: "invalid_watch" },
    );
    await assert.rejects(
      createWatchRule({ kind: "topic", targetId: T("a"), label: "A", minNewPublishers: 101 }),
      { status: 400, code: "invalid_watch" },
    );
  });

  test("the initial baseline suppresses the existing corpus", async () => {
    // Everything was collected before the watch existed, exactly like the first
    // real corpus on upgrade.
    for (const index of [0, 1, 2]) {
      await seed({
        id: `news:old-${index}`,
        topicId: T("old"),
        evidenceType: "news",
        publisher: `publisher-${index}`,
        publishedAt: new Date(Date.now() - 2 * HOUR),
        firstCollectedAt: new Date(Date.now() - 2 * HOUR),
      });
    }
    const rule = await createWatchRule({
      kind: "topic",
      targetId: T("old"),
      label: "Old topic",
      minNewPublishers: 1,
    });

    await evaluateWatchAlerts([map([node(T("old"), { label: "Old topic", potential: 80 })])]);
    await evaluateWatchAlerts([map([node(T("old"), { label: "Old topic", potential: 80 })])]);

    const state = await getWatchlists();
    expect(state.alerts).toEqual([]);
    expect(state.unread).toBe(0);
    const stored = state.rules.find((entry) => entry.id === rule.id)!;
    // The watermark advanced, so a later evaluation cannot reconsider them.
    expect(Date.parse(stored.evaluatedAt!)).toBeGreaterThanOrEqual(Date.parse(rule.evaluatedAt!));
  });

  test("only genuinely new independent publishers alert, once", async () => {
    await seed({
      id: "news:baseline",
      topicId: T("launch"),
      evidenceType: "news",
      publisher: "VnExpress",
      publishedAt: new Date(Date.now() - 30 * MINUTE),
      firstCollectedAt: new Date(Date.now() - 30 * MINUTE),
    });
    const rule = await createWatchRule({
      kind: "topic",
      targetId: T("launch"),
      label: "Launch",
      minNewPublishers: 2,
      minPotential: 30,
    });
    await backdateMinutes(rule.id, 20);

    // One new publisher is below the threshold.
    await seed({
      id: "news:new-1",
      topicId: T("launch"),
      evidenceType: "news",
      publisher: "Tuoi Tre",
      publishedAt: fresh(),
      firstCollectedAt: fresh(),
    });
    const nodes = [node(T("launch"), { label: "Launch", potential: 70 })];
    await evaluateWatchAlerts([map(nodes)]);
    expect((await getWatchlists()).alerts).toEqual([]);

    // A repeat of the same publisher is still one publisher, not two.
    await seed({
      id: "news:new-1b",
      topicId: T("launch"),
      evidenceType: "news",
      publisher: "Tuoi Tre",
      publishedAt: fresh(),
      firstCollectedAt: fresh(),
    });
    await evaluateWatchAlerts([map(nodes)]);
    expect((await getWatchlists()).alerts).toEqual([]);

    // A second distinct publisher crosses the threshold exactly once.
    await seed({
      id: "news:new-2",
      topicId: T("launch"),
      evidenceType: "news",
      publisher: "Thanh Nien",
      publishedAt: fresh(),
      firstCollectedAt: fresh(),
    });
    await evaluateWatchAlerts([map(nodes)]);
    await evaluateWatchAlerts([map(nodes)]);

    const state = await getWatchlists();
    expect(state.alerts.length).toBe(1);
    const alert = state.alerts[0]!;
    expect(alert.watchId).toBe(rule.id);
    expect(alert.topicId).toBe(T("launch"));
    expect(alert.newPublishers).toBe(2);
    expect(alert.newAccounts).toBe(0);
    expect(alert.potential).toBe(70);
    expect(alert.reasons.join(" ")).toContain("news publishers reported the topic");

    // Same account/publisher repeats must not re-alert even with a fresh record.
    await seed({
      id: "news:new-3",
      topicId: T("launch"),
      evidenceType: "news",
      publisher: "Thanh Nien",
      publishedAt: fresh(),
      firstCollectedAt: fresh(),
    });
    await evaluateWatchAlerts([map(nodes)]);
    expect((await getWatchlists()).alerts.length).toBe(1);
  });

  test("same-account repeats are one independent identity", async () => {
    const rule = await createWatchRule({
      kind: "topic",
      targetId: T("chat"),
      label: "Chat",
      minNewAccounts: 2,
    });
    await backdateMinutes(rule.id, 20);
    const nodes = [node(T("chat"), { label: "Chat", potential: 55 })];
    for (const suffix of ["a", "b", "c"]) {
      await seed({
        id: `voz:repeat-${suffix}`,
        topicId: T("chat"),
        authorId: "voz:one-person",
        publishedAt: new Date(Date.now() - MINUTE),
        firstCollectedAt: new Date(Date.now() - MINUTE),
      });
    }
    await evaluateWatchAlerts([map(nodes)]);
    expect((await getWatchlists()).alerts).toEqual([]);

    await seed({
      id: "voz:second",
      topicId: T("chat"),
      authorId: "voz:someone-else",
      publishedAt: fresh(),
      firstCollectedAt: fresh(),
    });
    await evaluateWatchAlerts([map(nodes)]);
    const alerts = (await getWatchlists()).alerts;
    expect(alerts.length).toBe(1);
    expect(alerts[0]!.newAccounts).toBe(2);
  });

  test("stale publications and deleted or drifted memberships never count", async () => {
    const rule = await createWatchRule({
      kind: "topic",
      targetId: T("stale"),
      label: "Stale",
      minNewPublishers: 1,
    });
    await backdateMinutes(rule.id, 20);

    // First collected inside the watermark but published a week earlier: an
    // archive import, not fresh publication.
    await seed({
      id: "news:archive",
      topicId: T("stale"),
      evidenceType: "news",
      publisher: "Archive Daily",
      publishedAt: new Date(Date.now() - 7 * 24 * HOUR),
      firstCollectedAt: new Date(Date.now() - MINUTE),
    });
    // Deleted evidence is not evidence.
    await seed({
      id: "news:deleted",
      topicId: T("stale"),
      evidenceType: "news",
      publisher: "Deleted Weekly",
      publishedAt: fresh(),
      firstCollectedAt: fresh(),
      deleted: true,
    });
    // Membership hash no longer matches the record: locked stale text.
    await seed({
      id: "news:drifted",
      topicId: T("stale"),
      evidenceType: "news",
      publisher: "Drifted Post",
      publishedAt: fresh(),
      firstCollectedAt: fresh(),
      membershipHash: "hash-from-older-text",
    });

    await evaluateWatchAlerts([map([node(T("stale"), { label: "Stale", potential: 90 })])]);
    expect((await getWatchlists()).alerts).toEqual([]);
  });

  test("a forum bump that was already collected is not new support", async () => {
    const rule = await createWatchRule({
      kind: "topic",
      targetId: T("thread"),
      label: "Thread",
      minNewAccounts: 1,
    });
    await backdateMinutes(rule.id, 30);
    // The thread predates the watch. A new poll updates observations, never
    // first_collected_at, so the bump stays outside the watermark.
    await seed({
      id: "voz:thread-1",
      topicId: T("thread"),
      authorId: "voz:op",
      timeKind: "activity",
      publishedAt: new Date(Date.now() - 5 * HOUR),
      firstCollectedAt: new Date(Date.now() - 5 * HOUR),
    });
    const db = await getDb();
    await db`
      UPDATE posts SET published_at = now() - interval '1 minute'
      WHERE id = ${postId("voz:thread-1")}
    `;
    await evaluateWatchAlerts([map([node(T("thread"), { label: "Thread", potential: 60 })])]);
    expect((await getWatchlists()).alerts).toEqual([]);
  });

  test("a newly discovered forum activity timestamp is not verified new publication", async () => {
    const rule = await createWatchRule({
      kind: "topic",
      targetId: T("new-thread"),
      label: "Newly discovered thread",
      minNewAccounts: 1,
      minNewSources: 1,
    });
    await backdateMinutes(rule.id, 20);
    await seed({
      id: "voz:new-activity",
      topicId: T("new-thread"),
      authorId: "voz:new-account",
      timeKind: "activity",
      publishedAt: fresh(),
      firstCollectedAt: fresh(),
    });
    await evaluateWatchAlerts([map([node(T("new-thread"), { potential: 80 })])]);
    expect((await getWatchlists()).alerts).toEqual([]);
  });

  test("unknown accounts and missing publisher provenance do not become independent identities", async () => {
    const rule = await createWatchRule({
      kind: "topic",
      targetId: T("unknown"),
      label: "Unknown identities",
      minNewAccounts: 1,
      minNewPublishers: 1,
    });
    await backdateMinutes(rule.id, 20);
    await seed({
      id: "voz:unknown-author",
      topicId: T("unknown"),
      authorId: "voz:unknown",
      timeKind: "published",
      publishedAt: fresh(),
      firstCollectedAt: fresh(),
    });
    await seed({
      id: "news:unknown-publisher",
      topicId: T("unknown"),
      evidenceType: "news",
      publisher: null,
      source: "google-news",
      publishedAt: fresh(),
      firstCollectedAt: fresh(),
    });
    await evaluateWatchAlerts([map([node(T("unknown"), { potential: 80 })])]);
    expect((await getWatchlists()).alerts).toEqual([]);
  });

  test("an entity watch evaluates every matching visible topic, not just the first forty", async () => {
    const entityId = "organization:watchtest";
    const rule = await createWatchRule({
      kind: "entity",
      targetId: entityId,
      label: "All entity topics",
      minNewPublishers: 1,
    });
    await backdateMinutes(rule.id, 20);
    const nodes: TrendMapNode[] = [];
    for (let index = 0; index < 50; index += 1) {
      const id = T(`complete-${index}`);
      await seed({
        id: `news:complete-${index}`,
        topicId: id,
        evidenceType: "news",
        publisher: `Publisher ${index}`,
        publishedAt: fresh(),
        firstCollectedAt: fresh(),
      });
      nodes.push(node(id, { entityIds: [entityId], potential: 90 - index }));
    }
    await evaluateWatchAlerts([map(nodes)]);
    expect(new Set((await getWatchlists()).alerts.map((alert) => alert.topicId))).toEqual(
      new Set(nodes.map((entry) => entry.id)),
    );
  });

  test("concurrent creation preserves the rule bound", async () => {
    const db = await getDb();
    await db`
      INSERT INTO watch_rules(id, kind, target_id, label, min_new_accounts, min_new_publishers, min_new_sources, min_potential)
      SELECT ${`watch:cap-${RUN}-`} || n::text, 'topic', ${T("cap")}, 'Capacity boundary', 0, 1, 0, 0
      FROM generate_series(1, 99) AS n
    `;
    const outcomes = await Promise.allSettled([
      createWatchRule({
        kind: "topic",
        targetId: T("cap"),
        label: "First concurrent create",
        minNewPublishers: 1,
      }),
      createWatchRule({
        kind: "topic",
        targetId: T("cap"),
        label: "Second concurrent create",
        minNewPublishers: 1,
      }),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled").length).toBe(1);
    const rejected = outcomes.find((outcome) => outcome.status === "rejected");
    expect(rejected?.status === "rejected" ? rejected.reason : null).toMatchObject({
      status: 409,
      code: "rules_limit",
    });
    expect((await getWatchlists()).rules.length).toBe(100);
  });

  test("entity watches follow every matching topic and respect the potential floor", async () => {
    const entity: TopicEntity = {
      id: "entity:openai",
      kind: "organization",
      label: "OpenAI",
      aliases: ["Open AI"],
    };
    const rule = await createWatchRule({
      kind: "entity",
      targetId: entity.id,
      label: "OpenAI",
      minNewPublishers: 1,
      minPotential: 60,
    });
    await backdateMinutes(rule.id, 20);

    for (const suffix of ["a", "b"]) {
      await seed({
        id: `news:entity-${suffix}`,
        topicId: T(`openai-${suffix}`),
        evidenceType: "news",
        publisher: `Publisher ${suffix}`,
        publishedAt: new Date(Date.now() - MINUTE),
        firstCollectedAt: new Date(Date.now() - MINUTE),
      });
    }
    // Unrelated topic with a fresh publisher must never alert this watch.
    await seed({
      id: "news:other",
      topicId: T("other"),
      evidenceType: "news",
      publisher: "Other Publisher",
      publishedAt: fresh(),
      firstCollectedAt: fresh(),
    });

    await evaluateWatchAlerts([
      map([
        node(T("openai-a"), {
          label: "OpenAI ships a model",
          potential: 80,
          entityIds: [entity.id],
        }),
        node(T("openai-b"), {
          label: "OpenAI price change",
          potential: 45,
          entityIds: [entity.id],
        }),
        node(T("other"), { label: "Other", potential: 95, entityIds: ["entity:other"] }),
      ]),
    ]);

    const alerts = (await getWatchlists()).alerts;
    expect(alerts.length).toBe(1);
    expect(alerts[0]!.topicId).toBe(T("openai-a"));
    expect(alerts[0]!.topicLabel).toBe("OpenAI ships a model");
  });

  test("growth thresholds are independent, and the potential floor still gates them", async () => {
    const rule = await createWatchRule({
      kind: "topic",
      targetId: T("or"),
      label: "Or",
      // Accounts will fall short; one new source is enough on its own.
      minNewAccounts: 5,
      minNewSources: 1,
      minPotential: 60,
    });
    await backdateMinutes(rule.id, 20);
    for (const suffix of ["a", "b"]) {
      await seed({
        id: `voz:or-${suffix}`,
        topicId: T("or"),
        authorId: `voz:or-${suffix}`,
        source: suffix === "a" ? "voz" : "otofun",
        publishedAt: fresh(),
        firstCollectedAt: fresh(),
      });
    }

    // Two accounts is below five, but two distinct sources clear that dimension;
    // the potential floor is what blocks the first evaluation.
    await evaluateWatchAlerts([map([node(T("or"), { label: "Or", potential: 40 })])]);
    expect((await getWatchlists()).alerts).toEqual([]);

    await evaluateWatchAlerts([map([node(T("or"), { label: "Or", potential: 75 })])]);
    const alerts = (await getWatchlists()).alerts;
    expect(alerts.length).toBe(1);
    expect(alerts[0]!.newAccounts).toBe(2);
    expect(alerts[0]!.newSources.sort()).toEqual(["otofun", "voz"]);
  });

  test("concurrent evaluation is idempotent and loses no state", async () => {
    const rule = await createWatchRule({
      kind: "topic",
      targetId: T("race"),
      label: "Race",
      minNewPublishers: 1,
    });
    await backdateMinutes(rule.id, 20);
    await seed({
      id: "news:race",
      topicId: T("race"),
      evidenceType: "news",
      publisher: "Racing Post",
      publishedAt: fresh(),
      firstCollectedAt: fresh(),
    });
    const maps = [map([node(T("race"), { label: "Race", potential: 65 })])];
    await Promise.all([
      evaluateWatchAlerts(maps),
      evaluateWatchAlerts(maps),
      evaluateWatchAlerts(maps),
    ]);
    await evaluateWatchAlerts(maps);

    const alerts = (await getWatchlists()).alerts;
    expect(alerts.length).toBe(1);
    expect(alerts[0]!.newPublishers).toBe(1);
  });

  test("a disabled watch records nothing; resuming re-baselines instead of flooding", async () => {
    const rule = await createWatchRule({
      kind: "topic",
      targetId: T("paused"),
      label: "Paused",
      minNewPublishers: 1,
    });
    await updateWatchRule(rule.id, { enabled: false });
    await backdateMinutes(rule.id, 20);
    // Collected while the watch is paused: real evidence, but the reader was not
    // asking for it, so resuming must not replay it.
    await seed({
      id: "news:paused",
      topicId: T("paused"),
      evidenceType: "news",
      publisher: "While Paused",
      publishedAt: new Date(Date.now() - MINUTE),
      firstCollectedAt: new Date(Date.now() - MINUTE),
    });
    const maps = [map([node(T("paused"), { label: "Paused", potential: 70 })])];
    await evaluateWatchAlerts(maps);
    expect((await getWatchlists()).alerts).toEqual([]);

    const resumed = await updateWatchRule(rule.id, { enabled: true });
    expect(resumed.enabled).toBe(true);
    // Resuming restarts the baseline, so support collected while paused is quiet.
    expect(Date.parse(resumed.evaluatedAt!)).toBeGreaterThan(Date.now() - MINUTE);
    await evaluateWatchAlerts(maps);
    expect((await getWatchlists()).alerts).toEqual([]);
  });

  test("read state, unread count and deletion behave like server state", async () => {
    const rule = await createWatchRule({
      kind: "topic",
      targetId: T("read"),
      label: "Read state",
      minNewPublishers: 1,
    });
    await backdateMinutes(rule.id, 20);
    await seed({
      id: "news:read",
      topicId: T("read"),
      evidenceType: "news",
      publisher: "Readable Post",
      publishedAt: fresh(),
      firstCollectedAt: fresh(),
    });
    await evaluateWatchAlerts([map([node(T("read"), { label: "Read state", potential: 72 })])]);

    let state = await getWatchlists();
    expect(state.alerts.length).toBe(1);
    expect(state.unread).toBe(1);
    expect(state.alerts[0]!.readAt).toBeNull();

    await markAlertRead(state.alerts[0]!.id);
    state = await getWatchlists();
    expect(state.unread).toBe(0);
    expect(state.alerts[0]!.readAt).not.toBeNull();

    // Marking read is idempotent and keeps the original timestamp.
    const first = state.alerts[0]!.readAt;
    await markAlertRead(state.alerts[0]!.id);
    expect((await getWatchlists()).alerts[0]!.readAt).toBe(first);

    await deleteWatchRule(rule.id);
    state = await getWatchlists();
    expect(state.rules).toEqual([]);
    // Alerts cascade with their rule: a deleted watch leaves no orphan history.
    expect(state.alerts).toEqual([]);
    expect(state.unread).toBe(0);
    await assert.rejects(deleteWatchRule(rule.id), {
      status: 404,
      code: "not_found",
    });
    await assert.rejects(markAlertRead("alert:missing"), {
      status: 404,
      code: "not_found",
    });
  });

  test("a merged topic keeps watches working and reads the surviving label", async () => {
    const rule = await createWatchRule({
      kind: "topic",
      targetId: T("source"),
      label: "Source topic",
      minNewPublishers: 1,
    });
    await backdateMinutes(rule.id, 20);
    await seed({
      id: "news:merged",
      topicId: T("source"),
      evidenceType: "news",
      publisher: "Merge Daily",
      publishedAt: fresh(),
      firstCollectedAt: fresh(),
    });
    const db = await getDb();
    await db`
      INSERT INTO topic_catalog (id, label) VALUES (${T("target")}, 'Target topic')
      ON CONFLICT (id) DO NOTHING
    `;
    await db`UPDATE topic_catalog SET merged_into = ${T("target")} WHERE id = ${T("source")}`;

    await evaluateWatchAlerts([map([node(T("target"), { label: "Target topic", potential: 68 })])]);

    const state = await getWatchlists();
    expect(state.alerts.length).toBe(1);
    // The stored target is untouched, so undo restores the original watch.
    expect(state.rules.find((entry) => entry.id === rule.id)!.targetId).toBe(T("source"));
    expect(state.alerts[0]!.topicId).toBe(T("target"));
    expect(state.alerts[0]!.topicLabel).toBe("Target topic");
    await db`INSERT INTO topic_catalog(id,label) VALUES (${T("middle")}, 'Middle topic'), (${T("final")}, 'Final topic')`;
    await db`UPDATE topic_catalog SET merged_into = ${T("middle")} WHERE id = ${T("target")}`;
    await db`UPDATE topic_catalog SET merged_into = ${T("final")} WHERE id = ${T("middle")}`;
    const chained = await getWatchlists();
    expect(chained.alerts[0]!.topicId).toBe(T("final"));
    expect(chained.alerts[0]!.topicLabel).toBe("Final topic");
    expect(chained.rules.find((entry) => entry.id === rule.id)!.targetId).toBe(T("source"));
  });

  test("keyset history reaches older unread alerts across precise timestamp ties", async () => {
    const db = await getDb();

    const rule = await createWatchRule({
      kind: "topic",
      targetId: T("flood"),
      label: "Flood",
      minNewPublishers: 1,
    });
    for (let index = 0; index < 215; index += 1) {
      await db`
        INSERT INTO watch_alerts (id, watch_id, topic_id, topic_label, created_at,
                                  new_accounts, new_publishers, new_sources, potential,
                                  reasons, fingerprint)
        VALUES (${`alert:seed-${RUN}-${index}`}, ${rule.id}, ${T("flood")}, 'Flood',
                '2026-01-01 00:00:00.123456+00'::timestamptz, 0, 1, '{}'::text[], 60,
                '[]'::jsonb, ${`fingerprint-${RUN}-${index}`})
      `;
    }
    const state = await getWatchlists();
    // The list is bounded at 200; the badge still counts every unread notification.
    expect(state.alerts.length).toBe(200);
    expect(state.unread).toBe(215);
    expect(state.alertsNextCursor).not.toBeNull();
    const older = await getWatchlists(state.alertsNextCursor!);
    expect(older.alerts.length).toBe(15);
    expect(older.alertsNextCursor).toBeNull();
    expect(new Set([...state.alerts, ...older.alerts].map((alert) => alert.id)).size).toBe(215);
    await markAlertRead(older.alerts[0]!.id);
    const updated = await getWatchlists(state.alertsNextCursor!);
    expect(updated.unread).toBe(214);
    expect(updated.alerts.find((alert) => alert.id === older.alerts[0]!.id)!.readAt).not.toBeNull();
    await assert.rejects(getWatchlists("alert:missing"), {
      status: 400,
      code: "invalid_cursor",
    });
  });

  test("a pre-upgrade rule is raised to the intelligence baseline, not its own row", async () => {
    // A rule written before the baseline metadata existed: no mark, no watermark,
    // and a creation time earlier than the intelligence start. Everything in the
    // corpus predates the upgrade, so it must stay silent.
    const db = await getDb();
    const legacyId = `watch:watchtest-${RUN}-legacy`;
    await db`
      INSERT INTO watch_rules (id, kind, target_id, label, enabled, min_new_accounts,
                               min_new_publishers, min_new_sources, min_potential,
                               created_at, evaluated_at, baseline)
      VALUES (${legacyId}, 'topic', ${T("legacy")}, 'Legacy', true, 0, 1, 0, 0,
              now() - interval '2 days', NULL, '{}'::jsonb)
    `;
    // The record must be older than the intelligence baseline for the guard to
    // be the thing that suppresses it, not the rule's own watermark.
    const [stateRow] = (await db`
      SELECT started_at FROM topic_intelligence_state LIMIT 1
    `) as unknown as Array<{ started_at: Date | string }>;
    const baselineStart = new Date(stateRow?.started_at ?? Date.now() - HOUR);
    const preUpgrade = new Date(baselineStart.getTime() - HOUR);
    await seed({
      id: "news:legacy",
      topicId: T("legacy"),
      evidenceType: "news",
      publisher: "Pre-upgrade Daily",
      publishedAt: preUpgrade,
      firstCollectedAt: preUpgrade,
    });
    await evaluateWatchAlerts([map([node(T("legacy"), { label: "Legacy", potential: 90 })])]);
    expect((await getWatchlists()).alerts).toEqual([]);

    // Support collected after the baseline is genuinely new and does alert.
    await seed({
      id: "news:legacy-new",
      topicId: T("legacy"),
      evidenceType: "news",
      publisher: "Post-upgrade Daily",
      publishedAt: fresh(),
      firstCollectedAt: fresh(),
    });
    await evaluateWatchAlerts([map([node(T("legacy"), { label: "Legacy", potential: 90 })])]);
    const alerts = (await getWatchlists()).alerts;
    expect(alerts.length).toBe(1);
    expect(alerts[0]!.newPublishers).toBe(1);
  });

  test("a reviewed merge does not fabricate support from the source topic", async () => {
    // Old identities already existed in the source topic before the watch.
    await seed({
      id: "news:pre-existing",
      topicId: T("src"),
      evidenceType: "news",
      publisher: "Ancient Times",
      publishedAt: new Date(Date.now() - 3 * HOUR),
      firstCollectedAt: new Date(Date.now() - 3 * HOUR),
    });
    const rule = await createWatchRule({
      kind: "topic",
      targetId: T("dst"),
      label: "Destination",
      minNewPublishers: 1,
    });
    await backdateMinutes(rule.id, 20);
    const db = await getDb();
    await db`
      INSERT INTO topic_catalog (id, label) VALUES (${T("dst")}, 'Destination')
      ON CONFLICT (id) DO NOTHING
    `;
    await db`
      INSERT INTO topic_catalog (id, label) VALUES (${T("src")}, 'Source')
      ON CONFLICT (id) DO NOTHING
    `;
    // A merge redirects and keeps the memberships where they are.
    await db`UPDATE topic_catalog SET merged_into = ${T("dst")} WHERE id = ${T("src")}`;

    await evaluateWatchAlerts([map([node(T("dst"), { label: "Destination", potential: 88 })])]);
    expect((await getWatchlists()).alerts).toEqual([]);
  });
});
