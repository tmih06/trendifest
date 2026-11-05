import type { SQL } from "bun";
import type { TopicReviewDecision } from "../../shared/intelligence.ts";
import { getDb } from "../db.ts";
import { TOPIC_MODEL } from "./topic-embedding.ts";
import type { TopicSnapshotPoint } from "./topic-trend.ts";

/**
 * Persistence for measured topic intelligence.
 *
 * Three invariants shape every statement here:
 *
 * 1. A `topic_memberships` row is evidence only while its `content_hash` still
 *    matches the post. Nothing reads a row without that comparison, so an edit
 *    stops contributing immediately instead of retaining evidence for old text.
 * 2. `assigned_at` is when the assignment first happened. An unchanged post keeps
 *    its timestamp, because deltas and watches must derive from real first-seen
 *    evidence, never from how often a refresh ran.
 * 3. `topic_snapshots` stores sampled observations only. Retention is finite and
 *    no point is ever reconstructed from source publication dates.
 */

export interface CatalogEntry {
  id: string;
  label: string;
  mergedInto: string | null;
}

export interface IntelligenceState {
  startedAt: Date;
  lastRefreshAt: Date | null;
  lastError: string | null;
}

/** One assignment produced by a projection, before it is persisted. */
export interface MaterializedMember {
  postId: string;
  topicId: string;
  contentHash: string;
}

/** One topic's sampling of the window, in canonical global rank order. */
export interface MaterializedSnapshot {
  topicId: string;
  rank: number;
  potential: number;
  accounts: number;
  publishers: number;
  posts: number;
  newsAttention: number;
  communityMomentum: number;
  sourceIds: string[];
}

export interface MaterializationBatch {
  hours: number;
  /**
   * Only the widest window owns membership writes, label updates and redirect
   * bookkeeping. A smaller view legitimately omits records, so letting it rewrite
   * the catalog would drop evidence and move ids between time views. It may still
   * *register* a topic id it displays, insert-only, so no map can emit an id that
   * a detail link cannot open.
   */
  canonical: boolean;
  /** Fingerprint of the inputs the projection was computed from. */
  revision: string;
  bucketAt: Date;
  /** Actual projection observation time; the hour bucket is only a storage key. */
  observedAt: Date;
  catalog: Array<{ id: string; label: string }>;
  members: MaterializedMember[];
  snapshots: MaterializedSnapshot[];
}

export interface TimelineRow {
  id: string;
  title: string;
  body: string;
  source: string;
  evidence_type: string;
  publisher: string | null;
  author_handle: string | null;
  permalink: string;
  published_at: Date;
  time_kind: string;
  first_collected_at: Date;
  last_observed_at: Date;
}

/** Snapshots are observations, never history: keep a finite 72-hour floor. */
const SNAPSHOT_RETENTION_HOURS = 72;
/** Advisory namespace shared with the collector; review owns key 3. */
export const INTELLIGENCE_LOCK_NAMESPACE = 0x54524446;
const REFRESH_LOCK_KEY = 2;
const REVIEW_LOCK_KEY = 3;

/**
 * Membership is evidence only while it still describes the current record: the
 * post is live, the stored hash matches, an observation exists inside the
 * requested window, and a topic vector valid for that same text exists. Both
 * readers below apply exactly this predicate, so a member can never be
 * half-valid — visible in one place and missing from the other.
 */

/**
 * Fingerprint of everything a projection depends on.
 *
 * Deliberately excludes `assigned_at`, `last_seen_at` and every snapshot table:
 * bookkeeping timestamps change on each refresh and would invalidate the map
 * forever, while snapshot writes are results of a refresh, not inputs to it.
 * IDs are opaque byte identities: C collation avoids costly locale-aware
 * sorting of thousands of long source URLs without changing invalidation.
 */
export async function mutationRevision(sql: SQL): Promise<string> {
  const [row] = (await sql`
    SELECT concat_ws(':',
      (SELECT md5(coalesce(string_agg((id, xmin::text)::text, '' ORDER BY id COLLATE "C"), '')) FROM posts),
      (SELECT md5(coalesce(string_agg((post_id, xmin::text)::text, '' ORDER BY post_id COLLATE "C"), '')) FROM topic_embeddings),
      (SELECT md5(coalesce(string_agg((post_id, segment_id, xmin::text)::text, '' ORDER BY post_id COLLATE "C", segment_id COLLATE "C"), '')) FROM observations),
      (SELECT md5(coalesce(string_agg((post_id, xmin::text)::text, '' ORDER BY post_id COLLATE "C"), '')) FROM metric_snapshots),
      (SELECT md5(coalesce(string_agg((post_id, topic_id, content_hash, locked::text)::text, '' ORDER BY post_id COLLATE "C"), '')) FROM topic_memberships),
      (SELECT md5(coalesce(string_agg((id, label, coalesce(merged_into, ''))::text, '' ORDER BY id COLLATE "C"), '')) FROM topic_catalog),
      (SELECT md5(coalesce(string_agg((id, active::text, target_id)::text, '' ORDER BY id COLLATE "C"), '')) FROM topic_review_decisions)
    ) AS revision
  `) as unknown as Array<{ revision: string }>;
  if (!row) throw new Error("Could not read topic intelligence revision");
  return row.revision;
}

/**
 * The monitoring baseline. Migration inserts the singleton row, so a read is a
 * plain SELECT: writing on every read would take a row lock and emit WAL for a
 * value that did not change. The insert exists only as a repair for a database
 * migrated before the row existed.
 */
async function readStateRow(db: SQL) {
  const [row] = (await db`
    SELECT started_at, last_refresh_at, last_error FROM topic_intelligence_state
    WHERE singleton = true
  `) as unknown as Array<{
    started_at: Date;
    last_refresh_at: Date | null;
    last_error: string | null;
  }>;
  return row;
}

export async function loadIntelligenceState(sql?: SQL): Promise<IntelligenceState> {
  const db = sql ?? (await getDb());
  const existing = await readStateRow(db);
  const row =
    existing ??
    (
      (await db`
        INSERT INTO topic_intelligence_state(singleton) VALUES(true)
        ON CONFLICT (singleton) DO UPDATE SET singleton = EXCLUDED.singleton
        RETURNING started_at, last_refresh_at, last_error
      `) as unknown as Array<{
        started_at: Date;
        last_refresh_at: Date | null;
        last_error: string | null;
      }>
    )[0];
  return {
    startedAt: new Date(row?.started_at ?? new Date()),
    lastRefreshAt: row?.last_refresh_at ? new Date(row.last_refresh_at) : null,
    lastError: row?.last_error ?? null,
  };
}

/** Record why a refresh produced no observation, so the UI can say so. */
export async function recordRefreshError(message: string) {
  const db = await getDb();
  await db`
    UPDATE topic_intelligence_state SET last_error = ${message.slice(0, 500)}
    WHERE singleton = true
  `;
}

/** Every catalog row, for redirect resolution, labels and the detail read. */
export async function loadCatalog(sql?: SQL): Promise<Map<string, CatalogEntry>> {
  const db = sql ?? (await getDb());
  const rows = (await db`
    SELECT id, label, merged_into FROM topic_catalog
  `) as unknown as Array<{ id: string; label: string; merged_into: string | null }>;
  return new Map(
    rows.map((row) => [
      String(row.id),
      {
        id: String(row.id),
        label: String(row.label),
        mergedInto: row.merged_into ? String(row.merged_into) : null,
      },
    ]),
  );
}

/**
 * Follow `merged_into` to the current topic. A cycle cannot be produced by the
 * review module, but a malformed chain must terminate instead of hanging a read.
 */
export function resolveTopicId(catalog: Map<string, CatalogEntry>, topicId: string): string {
  let current = topicId;
  const seen = new Set<string>();
  while (!seen.has(current)) {
    seen.add(current);
    const entry = catalog.get(current);
    if (!entry || !entry.mergedInto) return current;
    current = entry.mergedInto;
  }
  return topicId;
}

/** Every id whose redirect chain ends at `topicId`, `topicId` included. */
export function topicChain(catalog: Map<string, CatalogEntry>, topicId: string): string[] {
  const chain = [topicId];
  for (const id of catalog.keys()) {
    if (id !== topicId && resolveTopicId(catalog, id) === topicId) chain.push(id);
  }
  return chain;
}

/** Stored points for one window, oldest first. */
export async function loadSnapshots(
  hours: number,
  sinceMs: number,
  topicIds?: readonly string[],
): Promise<Map<string, TopicSnapshotPoint[]>> {
  const db = await getDb();
  const since = new Date(sinceMs);
  const rows = (topicIds
    ? await db`
        SELECT topic_id, extract(epoch FROM observed_at) * 1000 AS at, potential, rank, accounts,
               publishers, posts, news_attention, community_momentum
        FROM topic_snapshots
        WHERE hours = ${hours} AND bucket_at >= ${since}::timestamptz - interval '1 hour' AND observed_at >= ${since}
          AND topic_id = ANY(${[...topicIds]}::text[])
        ORDER BY observed_at ASC
      `
    : await db`
        SELECT topic_id, extract(epoch FROM observed_at) * 1000 AS at, potential, rank, accounts,
               publishers, posts, news_attention, community_momentum
        FROM topic_snapshots
        WHERE hours = ${hours} AND bucket_at >= ${since}::timestamptz - interval '1 hour' AND observed_at >= ${since}
        ORDER BY observed_at ASC
      `) as unknown as Array<{
    topic_id: string;
    at: number;
    potential: number;
    rank: number;
    accounts: number;
    publishers: number;
    posts: number;
    news_attention: number;
    community_momentum: number;
  }>;
  const byTopic = new Map<string, TopicSnapshotPoint[]>();
  for (const row of rows) {
    const topicId = String(row.topic_id);
    const list = byTopic.get(topicId) ?? [];
    list.push({
      at: Math.round(Number(row.at)),
      potential: Number(row.potential),
      rank: Number(row.rank),
      accounts: Number(row.accounts),
      publishers: Number(row.publishers),
      posts: Number(row.posts),
      newsAttention: Number(row.news_attention),
      communityMomentum: Number(row.community_momentum),
    });
    byTopic.set(topicId, list);
  }
  return byTopic;
}

/**
 * Write one projection's assignments, catalog rows and observations.
 *
 * The whole thing is one short transaction under two advisory locks, so it can
 * neither interleave with a review nor with another process's refresh. The
 * revision check inside the lock is what makes a stale projection harmless: if a
 * review or a collector write landed while the worker was grouping, this write is
 * dropped and the next refresh starts from the new state.
 */
export async function persistMaterialization(
  batch: MaterializationBatch,
): Promise<"written" | "busy" | "superseded"> {
  const db = await getDb();
  return db.begin(async (tx) => {
    const [locked] = (await tx`
      SELECT pg_try_advisory_xact_lock(${INTELLIGENCE_LOCK_NAMESPACE}::int, ${REFRESH_LOCK_KEY}::int) AS acquired
    `) as unknown as Array<{ acquired: boolean }>;
    // Another process is materializing; its write is as fresh as ours.
    if (locked?.acquired !== true) return "busy";

    // Reviews own key 3. Taking it after key 2 fixes one order for both modules,
    // so their row locks can never form a cycle.
    await tx`SELECT pg_advisory_xact_lock(${INTELLIGENCE_LOCK_NAMESPACE}::int, ${REVIEW_LOCK_KEY}::int)`;

    if ((await mutationRevision(tx as unknown as SQL)) !== batch.revision) return "superseded";

    if (batch.catalog.length > 0) {
      const ids = batch.catalog.map((entry) => entry.id);
      const labels = batch.catalog.map((entry) => entry.label);
      if (batch.canonical) {
        await tx`
          INSERT INTO topic_catalog (id, label)
          SELECT * FROM unnest(${ids}::text[], ${labels}::text[])
          ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label
          WHERE topic_catalog.label IS DISTINCT FROM EXCLUDED.label
        `;
        await tx`
          UPDATE topic_catalog SET last_seen_at = now()
          WHERE id = ANY(${ids}::text[])
            AND last_seen_at < now() - interval '10 minutes'
        `;
      } else {
        // Insert-only: a narrower view never relabels or marks activity for a
        // topic whose label and lifetime belong to the canonical window.
        await tx`
          INSERT INTO topic_catalog (id, label)
          SELECT * FROM unnest(${ids}::text[], ${labels}::text[])
          ON CONFLICT (id) DO NOTHING
        `;
      }
    }

    if (batch.canonical) {
      if (batch.members.length > 0) {
        const postIds = batch.members.map((member) => member.postId);
        const topicIds = batch.members.map((member) => member.topicId);
        const hashes = batch.members.map((member) => member.contentHash);
        // A review applies to a content revision. Unchanged locked rows stay
        // authoritative; an edited, re-embedded record needs a new assignment,
        // not a permanent stale lock. The original decision remains in audit.
        await tx`
          INSERT INTO topic_memberships (post_id, topic_id, content_hash, locked, review_id, assigned_at)
          SELECT post_id, topic_id, content_hash, false, NULL, now()
          FROM unnest(${postIds}::text[], ${topicIds}::text[], ${hashes}::text[])
            AS incoming(post_id, topic_id, content_hash)
          ON CONFLICT (post_id) DO UPDATE SET
            topic_id = EXCLUDED.topic_id,
            content_hash = EXCLUDED.content_hash,
            assigned_at = now(), locked = false, review_id = NULL
          WHERE (topic_memberships.locked = false
                 OR topic_memberships.content_hash IS DISTINCT FROM EXCLUDED.content_hash)
            AND (topic_memberships.topic_id IS DISTINCT FROM EXCLUDED.topic_id
                 OR topic_memberships.content_hash IS DISTINCT FROM EXCLUDED.content_hash)
        `;
      }
    }

    if (batch.snapshots.length > 0) {
      const payload = JSON.stringify(
        batch.snapshots.map((snapshot) => ({
          topic_id: snapshot.topicId,
          hours: batch.hours,
          bucket_at: batch.bucketAt.toISOString(),
          observed_at: batch.observedAt.toISOString(),
          potential: snapshot.potential,
          rank: snapshot.rank,
          accounts: snapshot.accounts,
          publishers: snapshot.publishers,
          posts: snapshot.posts,
          news_attention: snapshot.newsAttention,
          community_momentum: snapshot.communityMomentum,
          source_ids: snapshot.sourceIds,
        })),
      );
      await tx`
        INSERT INTO topic_snapshots (topic_id, hours, bucket_at, observed_at, potential, rank, accounts,
                                     publishers, posts, news_attention, community_momentum, source_ids)
        SELECT topic_id, hours, bucket_at, observed_at, potential, rank, accounts, publishers, posts,
               news_attention, community_momentum, source_ids
        FROM jsonb_to_recordset(${payload}::text::jsonb) AS row(
          topic_id text, hours integer, bucket_at timestamptz, observed_at timestamptz, potential integer, rank integer,
          accounts integer, publishers integer, posts integer, news_attention integer,
          community_momentum integer, source_ids text[]
        )
        ON CONFLICT (topic_id, hours, bucket_at) DO UPDATE SET
          observed_at = EXCLUDED.observed_at,
          potential = EXCLUDED.potential, rank = EXCLUDED.rank,
          accounts = EXCLUDED.accounts, publishers = EXCLUDED.publishers,
          posts = EXCLUDED.posts, news_attention = EXCLUDED.news_attention,
          community_momentum = EXCLUDED.community_momentum,
          source_ids = EXCLUDED.source_ids
        WHERE topic_snapshots.observed_at < EXCLUDED.observed_at
      `;
      await tx`
        DELETE FROM topic_snapshots
        WHERE bucket_at < now() - ${`${SNAPSHOT_RETENTION_HOURS} hours`}::interval
      `;
    }

    if (batch.canonical) {
      await tx`
        UPDATE topic_intelligence_state SET last_refresh_at = now(), last_error = NULL
        WHERE singleton = true
      `;
    }
    return "written";
  }) as Promise<"written" | "busy" | "superseded">;
}

/** Valid members of a topic inside a window, counted by the timeline predicate. */
export async function countTopicMembers(topicIds: readonly string[], hours: number) {
  const db = await getDb();
  const [row] = (await db`
    SELECT count(*)::int AS total
    FROM topic_memberships m
    JOIN posts p ON p.id = m.post_id
    WHERE m.topic_id = ANY(${[...topicIds]}::text[])
      AND m.content_hash = p.content_hash
      AND p.deleted_at IS NULL
      AND p.published_at > now() - ${hours} * interval '1 hour'
      AND EXISTS (
        SELECT 1 FROM observations o
        WHERE o.post_id = p.id AND o.observed_at > now() - ${hours} * interval '1 hour'
      )
      AND EXISTS (
        SELECT 1 FROM topic_embeddings t
        WHERE t.post_id = p.id AND t.model = ${TOPIC_MODEL} AND t.content_hash = p.content_hash
      )
  `) as unknown as Array<{ total: number }>;
  return Number(row?.total ?? 0);
}

/**
 * One page of the timeline in source-time order.
 *
 * Source time (`published_at`) orders the page; when a record was collected and
 * last observed travel alongside it, so a thread bump can never be read as a new
 * publication. The page is bounded by the caller's validated limit.
 */
export async function loadTopicTimeline(
  topicIds: readonly string[],
  hours: number,
  offset: number,
  limit: number,
): Promise<TimelineRow[]> {
  const db = await getDb();
  return (await db`
    SELECT p.id, p.title, p.body, p.source, p.evidence_type, p.publisher, p.author_handle,
           p.permalink, p.published_at, p.time_kind, p.first_collected_at,
           (SELECT max(o.observed_at) FROM observations o WHERE o.post_id = p.id) AS last_observed_at
    FROM topic_memberships m
    JOIN posts p ON p.id = m.post_id
    WHERE m.topic_id = ANY(${[...topicIds]}::text[])
      AND m.content_hash = p.content_hash
      AND p.deleted_at IS NULL
      AND p.published_at > now() - ${hours} * interval '1 hour'
      AND EXISTS (
        SELECT 1 FROM observations o
        WHERE o.post_id = p.id AND o.observed_at > now() - ${hours} * interval '1 hour'
      )
      AND EXISTS (
        SELECT 1 FROM topic_embeddings t
        WHERE t.post_id = p.id AND t.model = ${TOPIC_MODEL} AND t.content_hash = p.content_hash
      )
    ORDER BY p.published_at DESC, p.id
    LIMIT ${limit} OFFSET ${offset}
  `) as unknown as TimelineRow[];
}

/** Decisions that touched any of these ids, newest first. */
export async function loadTopicDecisions(topicIds: readonly string[]) {
  const db = await getDb();
  const rows = (await db`
    SELECT id, operation, topic_ids, record_ids, target_id, note, created_at, active
    FROM topic_review_decisions
    WHERE target_id = ANY(${[...topicIds]}::text[])
       OR topic_ids && ${[...topicIds]}::text[]
    ORDER BY created_at DESC
    LIMIT 50
  `) as unknown as Array<{
    id: string;
    operation: "merge" | "split";
    topic_ids: string[];
    record_ids: string[];
    target_id: string;
    note: string;
    created_at: Date;
    active: boolean;
  }>;
  return rows.map((row): TopicReviewDecision => ({
    id: String(row.id),
    operation: row.operation,
    topicIds: (row.topic_ids ?? []).map(String),
    recordIds: (row.record_ids ?? []).map(String),
    targetId: String(row.target_id),
    note: String(row.note ?? ""),
    createdAt: new Date(row.created_at).toISOString(),
    active: row.active === true,
  }));
}

/** Locked, still-valid memberships: evidence a reviewer must not lose. */
export async function countLockedMembers(topicIds: readonly string[]) {
  const db = await getDb();
  const [row] = (await db`
    SELECT count(*)::int AS total
    FROM topic_memberships m
    JOIN posts p ON p.id = m.post_id
    WHERE m.topic_id = ANY(${[...topicIds]}::text[]) AND m.locked = true
      AND p.deleted_at IS NULL AND m.content_hash = p.content_hash
  `) as unknown as Array<{ total: number }>;
  return Number(row?.total ?? 0);
}
