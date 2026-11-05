import type {
  TopicDetail,
  TopicEntity,
  TopicHistoryPoint,
  TopicTimelineRecord,
} from "../../shared/intelligence.ts";
import { extractTopicEntities } from "../../shared/entities.ts";
import { ApiFailure } from "../api-error.ts";
import { getDb } from "../db.ts";
import { TOPIC_DIM, TOPIC_MODEL } from "./topic-embedding.ts";
import {
  countLockedMembers,
  countTopicMembers,
  loadCatalog,
  loadSnapshots,
  loadTopicDecisions,
  loadTopicTimeline,
  resolveTopicId,
  topicChain,
} from "./topic-records.ts";
import { buildTrendMap, closeTrendMapWorker, refreshTopicIntelligence } from "./trend-map.ts";
import type { TopicSnapshotPoint } from "./topic-trend.ts";
import type { TopicEvidence } from "./topics.ts";

export { refreshTopicIntelligence, closeTrendMapWorker, buildTrendMap };

/** Detail reads may look back at the whole retained corpus (30 days). */
const MAX_DETAIL_HOURS = 720;
const MAX_DETAIL_LIMIT = 100;
const MAX_HISTORY_POINTS = 72;
/** A server-only guard may ask for every current member, at any age. */
const MAX_MEMBER_HOURS = 87_600;

function clampDetail(hours: number, offset: number, limit: number) {
  if (!Number.isFinite(hours) || hours < 1 || hours > MAX_DETAIL_HOURS) {
    throw new ApiFailure(400, "Window must be between 1 and 720 hours", "invalid_window");
  }
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new ApiFailure(400, "Offset must be a nonnegative integer", "invalid_page");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_DETAIL_LIMIT) {
    throw new ApiFailure(400, `Limit must be between 1 and ${MAX_DETAIL_LIMIT}`, "invalid_page");
  }
  return { hours: Math.round(hours), offset, limit };
}

/**
 * One topic's source-grounded detail: a bounded timeline in source-time order,
 * measured history, entities, and review state.
 *
 * A redirect resolves to its current topic, so a bookmark or a stored watch keeps
 * working after a merge. The timeline is read on demand — the map carries only
 * examples — and `total` uses the same predicate as the page, so the pager cannot
 * promise rows the next page will not contain.
 *
 * A brand-new installation has no catalog yet. Rather than answering 404 for a
 * topic that exists in the corpus, one bounded materialization runs and the
 * lookup is retried; after that a missing id is genuinely unknown.
 */
export async function getTopicDetail(
  topicId: string,
  hours = 168,
  offset = 0,
  limit = 40,
): Promise<TopicDetail> {
  const page = clampDetail(hours, offset, limit);
  const db = await getDb();
  let catalog = await loadCatalog(db);
  if (!catalog.has(topicId) && catalog.size === 0 && (await hasCollectedPosts(db))) {
    // Bootstrap only when nothing has ever been materialized. A populated
    // catalog that lacks this id is a real 404, not a synchronization problem.
    await refreshTopicIntelligence();
    catalog = await loadCatalog(db);
  }
  if (!catalog.has(topicId)) throw new ApiFailure(404, "Topic not found", "not_found");

  const resolvedId = resolveTopicId(catalog, topicId);
  const chain = topicChain(catalog, resolvedId);
  const [total, rows, decisions, lockedRecords, snaps] = await Promise.all([
    countTopicMembers(chain, page.hours),
    loadTopicTimeline(chain, page.hours, page.offset, page.limit),
    loadTopicDecisions(chain),
    countLockedMembers(chain),
    loadSnapshots(page.hours, Date.now() - page.hours * 3_600_000, [resolvedId]),
  ]);

  const records: TopicTimelineRecord[] = rows.map((row) => ({
    id: String(row.id),
    title: String(row.title ?? ""),
    excerpt: String(row.body ?? "").slice(0, 400),
    permalink: String(row.permalink),
    source: String(row.source),
    evidenceType: row.evidence_type === "news" ? "news" : "discussion",
    publisher: row.publisher ? String(row.publisher) : null,
    authorHandle: row.author_handle ? String(row.author_handle) : null,
    sourceAt: new Date(row.published_at).toISOString(),
    timeKind: row.time_kind === "published" ? "published" : "activity",
    firstCollectedAt: new Date(row.first_collected_at).toISOString(),
    lastObservedAt: new Date(row.last_observed_at).toISOString(),
  }));

  return {
    topicId: resolvedId,
    label: catalog.get(resolvedId)?.label ?? resolvedId,
    hours: page.hours,
    total,
    offset: page.offset,
    limit: page.limit,
    records,
    history: mergeHistory(snaps),
    entities: entitiesFor(rows),
    review: { lockedRecords, decisions },
  };
}

/** Cheap guard: an empty corpus has nothing to materialize, so it is a plain 404. */
async function hasCollectedPosts(db: Awaited<ReturnType<typeof getDb>>) {
  const [row] = (await db`
    SELECT EXISTS (SELECT 1 FROM posts WHERE deleted_at IS NULL) AS present
  `) as unknown as Array<{ present: boolean }>;
  return row?.present === true;
}

/**
 * Only this topic's own observations describe its historical rank. A merge does
 * not retroactively turn its former sources' separate ranks into one timeline.
 */
function mergeHistory(byTopic: Map<string, TopicSnapshotPoint[]>): TopicHistoryPoint[] {
  const merged = new Map<string, TopicHistoryPoint>();
  for (const points of byTopic.values()) {
    for (const point of points) {
      const at = new Date(point.at).toISOString();
      const candidate: TopicHistoryPoint = {
        at,
        potential: point.potential,
        rank: point.rank,
        accounts: point.accounts,
        publishers: point.publishers,
        posts: point.posts,
        newsAttention: point.newsAttention,
        communityMomentum: point.communityMomentum,
      };
      const existing = merged.get(at);
      if (!existing || candidate.potential > existing.potential) merged.set(at, candidate);
    }
  }
  return [...merged.values()].sort((a, b) => a.at.localeCompare(b.at)).slice(-MAX_HISTORY_POINTS);
}

/** Extract from the same stored titles the map used; nothing new is inferred. */
function entitiesFor(rows: Array<{ title: string; body: string }>): TopicEntity[] {
  const seen = new Map<string, TopicEntity>();
  for (const row of rows) {
    for (const entity of extractTopicEntities(row.title ?? "", (row.body ?? "").slice(0, 2_000))) {
      if (!seen.has(entity.id)) seen.set(entity.id, entity);
    }
  }
  return [...seen.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function parseVector(literal: string): number[] | null {
  const body = literal.startsWith("[") ? literal.slice(1, -1) : literal;
  if (!body) return null;
  const values = body.split(",").map(Number);
  if (values.length !== TOPIC_DIM) return null;
  for (const value of values) if (!Number.isFinite(value)) return null;
  return values;
}

/**
 * Server-only member evidence for the review guard: full records with vectors,
 * redirect-resolved, current and valid.
 *
 * A stale membership never appears. Its `content_hash` no longer matches the
 * post, so the text it was assigned for is gone; returning it would let a
 * reviewer reshape grouping using evidence that no longer exists. `hours` accepts
 * very large values so a guard asking for "every current member" is never
 * silently narrowed.
 */
export async function loadTopicMembers(topicId: string, hours = 168): Promise<TopicEvidence[]> {
  if (!Number.isFinite(hours) || hours < 1) {
    throw new ApiFailure(400, "Window must be at least one hour", "invalid_window");
  }
  const windowHours = Math.min(Math.round(hours), MAX_MEMBER_HOURS);
  const db = await getDb();
  const catalog = await loadCatalog(db);
  if (!catalog.has(topicId)) throw new ApiFailure(404, "Topic not found", "not_found");
  const chain = topicChain(catalog, resolveTopicId(catalog, topicId));
  const rows = (await db`
    SELECT p.id, p.title, p.body, p.source, p.evidence_type, p.publisher, p.author_id,
           p.author_handle, p.permalink, p.kind, p.time_kind, p.content_hash,
           p.published_at, p.first_collected_at,
           jsonb_array_length(p.media) AS media_count,
           t.vec::text AS vec,
           (SELECT max(o.observed_at) FROM observations o WHERE o.post_id = p.id) AS observed_at,
           (SELECT array_agg(DISTINCT o.segment_id) FROM observations o WHERE o.post_id = p.id) AS segments,
           (SELECT ms.likes FROM metric_snapshots ms WHERE ms.post_id = p.id) AS likes,
           (SELECT CASE WHEN ms.reposts IS NULL AND ms.quotes IS NULL THEN NULL
                        ELSE coalesce(ms.reposts, 0) + coalesce(ms.quotes, 0) END
              FROM metric_snapshots ms WHERE ms.post_id = p.id) AS shares
    FROM topic_memberships m
    JOIN posts p ON p.id = m.post_id
    JOIN topic_embeddings t ON t.post_id = p.id
      AND t.model = ${TOPIC_MODEL} AND t.content_hash = p.content_hash
    WHERE m.topic_id = ANY(${chain}::text[])
      AND m.content_hash = p.content_hash
      AND p.deleted_at IS NULL
      AND p.published_at > now() - ${`${windowHours} hours`}::interval
    ORDER BY p.first_collected_at ASC, p.id ASC
  `) as unknown as Array<{
    id: string;
    title: string;
    body: string;
    source: TopicEvidence["source"];
    evidence_type: TopicEvidence["evidenceType"];
    publisher: string | null;
    author_id: string;
    author_handle: string | null;
    permalink: string;
    kind: TopicEvidence["kind"];
    time_kind: TopicEvidence["timeKind"];
    content_hash: string;
    published_at: Date;
    first_collected_at: Date;
    media_count: number;
    vec: string;
    observed_at: Date | null;
    segments: string[] | null;
    likes: string | null;
    shares: string | null;
  }>;

  const members: TopicEvidence[] = [];
  for (const row of rows) {
    const vector = parseVector(row.vec);
    if (!vector) continue;
    members.push({
      id: String(row.id),
      title: String(row.title ?? ""),
      text: String(row.body ?? ""),
      source: row.source,
      evidenceType: row.evidence_type,
      publisher: row.publisher ? String(row.publisher) : null,
      authorId: String(row.author_id),
      authorHandle: row.author_handle ? String(row.author_handle) : null,
      permalink: String(row.permalink),
      kind: row.kind,
      timeKind: row.time_kind,
      mediaCount: Number(row.media_count ?? 0),
      contentHash: String(row.content_hash),
      publishedAt: new Date(row.published_at),
      firstCollectedAt: new Date(row.first_collected_at),
      observedAt: row.observed_at ? new Date(row.observed_at) : new Date(row.first_collected_at),
      segments: row.segments ?? [],
      vector,
      ...(row.likes === null ? {} : { likes: Number(row.likes) }),
      ...(row.shares === null ? {} : { shares: Number(row.shares) }),
    });
  }
  return members;
}
