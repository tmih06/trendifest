import { Worker } from "node:worker_threads";
import { VIEWER_SEGMENTS } from "../../shared/segments.ts";
import type { SegmentCoverage, TrendMap } from "../../shared/types.ts";
import { getDb } from "../db.ts";
import { segmentCoverage } from "./pipeline.ts";
import { TOPIC_DIM, TOPIC_MODEL } from "./topic-embedding.ts";
import { MAX_CANDIDATE_POSTS, type TopicProjectionInput } from "./topic-projection.ts";

const HOURS_DEFAULT = 168;
const MAX_CACHED_WINDOWS = 4;
const SNAPSHOT_INTERVAL_MS = 60_000;
const snapshots = new Map<string, Promise<TrendMap>>();
let snapshotDb: Awaited<ReturnType<typeof getDb>> | null = null;
let projectionWorker: Worker | null = null;
let nextProjectionId = 0;
const projections = new Map<
  number,
  {
    resolve: (map: TrendMap) => void;
    reject: (error: Error) => void;
  }
>();
type ProjectionReply = { id: number; map: TrendMap } | { id: number; error: string };

/** The worker owns only CPU work; it has no database connection or model. */
function workerForProjection() {
  if (projectionWorker) return projectionWorker;
  const worker = new Worker(new URL("./trend-map-worker.ts", import.meta.url));
  projectionWorker = worker;
  const fail = (error: Error) => {
    if (projectionWorker !== worker) return;
    projectionWorker = null;
    for (const pending of projections.values()) pending.reject(error);
    projections.clear();
    void worker.terminate();
  };
  worker.on("message", (message: ProjectionReply) => {
    const pending = projections.get(message.id);
    if (!pending) return;
    projections.delete(message.id);
    if (projections.size === 0) worker.unref();
    if ("error" in message) pending.reject(new Error(message.error));
    else pending.resolve(message.map);
  });
  worker.on("error", fail);
  worker.on("exit", (code) => fail(new Error(`Topic projection worker exited (${code})`)));
  worker.unref();
  return worker;
}

function project(input: TopicProjectionInput): Promise<TrendMap> {
  const worker = workerForProjection();
  const id = ++nextProjectionId;
  const pending = Promise.withResolvers<TrendMap>();
  projections.set(id, pending);
  // A pending promise alone does not keep Bun alive. CLI callers must finish
  // their projection, while an idle worker must not keep tests or scripts open.
  worker.ref();
  try {
    worker.postMessage({ id, input });
  } catch (error) {
    projections.delete(id);
    if (projections.size === 0) worker.unref();
    pending.reject(error);
  }
  return pending.promise;
}

/**
 * Tuple revisions detect edits, deletes, vector replacements, observation and
 * metric changes, not just a growing row count. Hash ordered identities with
 * xmin rather than a maximum/sum: an older concurrent transaction can commit
 * after a newer one without changing the maximum transaction id.
 */
async function mutationRevision(db: Awaited<ReturnType<typeof getDb>>) {
  const [row] = (await db`
    SELECT concat_ws(':',
      (SELECT md5(coalesce(string_agg((id, xmin::text)::text, '' ORDER BY id), '')) FROM posts),
      (SELECT md5(coalesce(string_agg((post_id, xmin::text)::text, '' ORDER BY post_id), '')) FROM topic_embeddings),
      (SELECT md5(coalesce(string_agg((post_id, segment_id, xmin::text)::text, '' ORDER BY post_id, segment_id), '')) FROM observations),
      (SELECT md5(coalesce(string_agg((post_id, xmin::text)::text, '' ORDER BY post_id), '')) FROM metric_snapshots)
    ) AS revision
  `) as unknown as Array<{ revision: string }>;
  if (!row) throw new Error("Could not read topic snapshot revision");
  return row.revision;
}

async function loadSnapshot(db: Awaited<ReturnType<typeof getDb>>, hours: number) {
  const adoptionIds = VIEWER_SEGMENTS.map((segment) => segment.id);
  const generatedAt = new Date().toISOString();
  const [rows, pendingRows, coverage, history] = (await Promise.all([
    db`
      SELECT p.id, p.title, p.body, p.source, p.evidence_type, p.publisher,
             p.author_id, p.author_handle, p.permalink, p.kind, p.time_kind,
             p.content_hash, p.published_at, p.first_collected_at,
             jsonb_array_length(p.media) AS media_count,
             t.vec::text AS vec,
             max(o.observed_at) AS observed_at,
             array_agg(DISTINCT o.segment_id) FILTER (WHERE o.segment_id IS NOT NULL) AS segments,
             (SELECT ms.likes FROM metric_snapshots ms WHERE ms.post_id = p.id) AS likes,
             (SELECT CASE WHEN ms.reposts IS NULL AND ms.quotes IS NULL THEN NULL
                          ELSE coalesce(ms.reposts, 0) + coalesce(ms.quotes, 0) END
                FROM metric_snapshots ms WHERE ms.post_id = p.id) AS shares
      FROM posts p
      JOIN topic_embeddings t ON t.post_id = p.id
        AND t.model = ${TOPIC_MODEL} AND t.content_hash = p.content_hash
      JOIN observations o ON o.post_id = p.id
      WHERE p.deleted_at IS NULL
        AND p.published_at > now() - ${`${hours} hours`}::interval
        AND o.observed_at > now() - ${`${hours} hours`}::interval
        AND o.segment_id = ANY(${adoptionIds}::text[])
      GROUP BY p.id, t.vec
      ORDER BY p.published_at DESC, p.id
      LIMIT ${MAX_CANDIDATE_POSTS + 1}
    `,
    db`
      SELECT count(*)::int AS pending
      FROM posts p
      WHERE p.deleted_at IS NULL
        AND p.published_at > now() - ${`${hours} hours`}::interval
        AND EXISTS (SELECT 1 FROM observations o
                     WHERE o.post_id = p.id
                       AND o.observed_at > now() - ${`${hours} hours`}::interval
                       AND o.segment_id = ANY(${adoptionIds}::text[]))
        AND NOT EXISTS (
          SELECT 1 FROM topic_embeddings t
          WHERE t.post_id = p.id AND t.model = ${TOPIC_MODEL}
            AND t.content_hash = p.content_hash
        )
    `,
    segmentCoverage(hours),
    db`
      SELECT extract(epoch FROM (now() - coalesce(min(first_collected_at), now()))) / 3600 AS span
      FROM posts
    `,
  ])) as unknown as [
    TopicProjectionInput["rows"],
    Array<{ pending: number }>,
    SegmentCoverage[],
    Array<{ span: number | null }>,
  ];
  return project({
    rows: rows.length > MAX_CANDIDATE_POSTS ? rows.slice(0, MAX_CANDIDATE_POSTS) : rows,
    hours,
    pending: Number(pendingRows[0]?.pending ?? 0),
    coverage,
    observedSpanHours: Number(history[0]?.span ?? 0),
    generatedAt,
    topicModel: TOPIC_MODEL,
    topicDimension: TOPIC_DIM,
    limited: rows.length > MAX_CANDIDATE_POSTS,
  });
}

/**
 * Real topic evidence only: no inference on GET and no source hubs. Four
 * single-flight snapshots bound memory; mutations invalidate immediately and
 * the minute bucket refreshes rolling windows/scores even without writes.
 * A cache hit retains its original generatedAt instead of claiming new work.
 */
export async function buildTrendMap(hours = HOURS_DEFAULT): Promise<TrendMap> {
  const db = await getDb();
  if (snapshotDb !== db) {
    snapshots.clear();
    snapshotDb = db;
  }
  const revision = await mutationRevision(db);
  const key = `${hours}:${Math.floor(Date.now() / SNAPSHOT_INTERVAL_MS)}:${revision}`;
  const cached = snapshots.get(key);
  if (cached) {
    snapshots.delete(key);
    snapshots.set(key, cached);
    return cached;
  }
  const pending = loadSnapshot(db, hours);
  snapshots.set(key, pending);
  while (snapshots.size > MAX_CACHED_WINDOWS) snapshots.delete(snapshots.keys().next().value!);
  try {
    return await pending;
  } catch (error) {
    if (snapshots.get(key) === pending) snapshots.delete(key);
    throw error;
  }
}
