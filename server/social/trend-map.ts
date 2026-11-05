import type { SQL } from "bun";
import { Worker } from "node:worker_threads";
import { VIEWER_SEGMENTS } from "../../shared/segments.ts";
import type { SegmentCoverage, TrendMap } from "../../shared/types.ts";
import { getDb } from "../db.ts";
import { segmentCoverage } from "./pipeline.ts";
import { TOPIC_DIM, TOPIC_MODEL } from "./topic-embedding.ts";
import type { TopicSnapshotPoint } from "./topic-trend.ts";
import {
  MAX_CANDIDATE_POSTS,
  type TopicProjection,
  type TopicProjectionInput,
} from "./topic-projection.ts";
import {
  loadCatalog,
  loadIntelligenceState,
  loadSnapshots,
  mutationRevision,
  persistMaterialization,
  recordRefreshError,
  resolveTopicId,
  type IntelligenceState,
} from "./topic-records.ts";

export const HOURS_DEFAULT = 168;
/** Windows the background refresh materializes, default view first. */
export const REFRESH_WINDOWS = [HOURS_DEFAULT, 24, 72] as const;
/** Rolling minute bucket: scores refresh even when nothing was collected. */
const SNAPSHOT_INTERVAL_MS = 60_000;
/** One hour is the finest sampling the schema stores. */
const HOUR_MS = 3_600_000;
const MAX_CACHED_WINDOWS = 8;
/**
 * Snapshot history a map node may carry. Full retained history belongs to the
 * detail read, where the payload is one topic rather than fifteen hundred.
 */
const MAP_HISTORY_HOURS = 24;

interface WindowSnapshot {
  map: TrendMap;
  /** Completed projection, kept so a refresh can persist without re-grouping. */
  projection: TopicProjection;
  revision: string;
}

const windows = new Map<string, Promise<WindowSnapshot>>();
let snapshotDb: SQL | null = null;
let projectionWorker: Worker | null = null;
let nextProjectionId = 0;
let refreshing = false;
const projections = new Map<
  number,
  {
    resolve: (projection: TopicProjection) => void;
    reject: (error: Error) => void;
  }
>();
type ProjectionReply = { id: number; projection: TopicProjection } | { id: number; error: string };

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
    else pending.resolve(message.projection);
  });
  worker.on("error", fail);
  worker.on("exit", (code) => fail(new Error(`Topic projection worker exited (${code})`)));
  worker.unref();
  return worker;
}

function project(input: TopicProjectionInput): Promise<TopicProjection> {
  const worker = workerForProjection();
  const id = ++nextProjectionId;
  const pending = Promise.withResolvers<TopicProjection>();
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
 * Release the projection worker. A CLI script or test that builds a map must
 * call this (or let its process end) so an idle worker handle cannot hold the
 * process open; `unref` already covers the common case.
 */
export async function closeTrendMapWorker() {
  const worker = projectionWorker;
  projectionWorker = null;
  for (const pending of projections.values()) {
    pending.reject(new Error("Topic projection worker was closed"));
  }
  projections.clear();
  if (worker) await worker.terminate();
}

/** Rows and persisted evidence for one window, read in one round of queries. */
async function loadProjectionInput(
  db: SQL,
  hours: number,
  startedAt: Date,
): Promise<TopicProjectionInput> {
  const adoptionIds = VIEWER_SEGMENTS.map((segment) => segment.id);
  const [rows, pendingRows, coverage, assignmentRows, catalog, snapshots] = (await Promise.all([
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
    // Only a current, valid assignment may steer identity: an edited post
    // stops carrying its old topic until it is re-embedded and reassigned.
    db`
        SELECT m.post_id, m.topic_id, m.locked
        FROM topic_memberships m
        JOIN posts p ON p.id = m.post_id AND p.deleted_at IS NULL
        JOIN topic_catalog c ON c.id = m.topic_id
        WHERE m.content_hash = p.content_hash
          AND p.published_at > now() - ${`${hours} hours`}::interval
          AND EXISTS (
            SELECT 1 FROM observations o
            WHERE o.post_id = p.id
              AND o.observed_at > now() - ${`${hours} hours`}::interval
          )
          AND EXISTS (
            SELECT 1 FROM topic_embeddings t
            WHERE t.post_id = p.id AND t.model = ${TOPIC_MODEL}
              AND t.content_hash = p.content_hash
          )
      `,
    loadCatalog(db),
    loadSnapshots(hours, Date.now() - MAP_HISTORY_HOURS * HOUR_MS),
  ])) as unknown as [
    TopicProjectionInput["rows"],
    Array<{ pending: number }>,
    SegmentCoverage[],
    Array<{ post_id: string; topic_id: string; locked: boolean }>,
    Map<string, { id: string; label: string; mergedInto: string | null }>,
    Map<string, TopicSnapshotPoint[]>,
  ];

  // Redirects resolve once, here, so the worker never needs the catalog and an
  // automatic group continues a merged topic instead of forking a new id.
  const assignments = assignmentRows.map((row) => ({
    postId: String(row.post_id),
    topicId: resolveTopicId(catalog, String(row.topic_id)),
    locked: row.locked === true,
  }));
  const labels: Record<string, string> = {};
  for (const entry of catalog.values()) labels[entry.id] = entry.label;

  return {
    rows: rows.length > MAX_CANDIDATE_POSTS ? rows.slice(0, MAX_CANDIDATE_POSTS) : rows,
    hours,
    pending: Number(pendingRows[0]?.pending ?? 0),
    coverage,
    generatedAt: new Date().toISOString(),
    topicModel: TOPIC_MODEL,
    topicDimension: TOPIC_DIM,
    limited: rows.length > MAX_CANDIDATE_POSTS,
    assignments,
    labels,
    history: Object.fromEntries(snapshots),
    startedAt: startedAt.toISOString(),
  };
}

/**
 * Overlay the live global state onto a computed map. `refreshing` and
 * `lastSnapshotAt` describe the store *now*; a cached projection must not claim
 * a refresh finished (or never started) based on when it happened to be built.
 */
function withIntelligence(map: TrendMap, state: IntelligenceState): TrendMap {
  return {
    ...map,
    intelligence: {
      startedAt: state.startedAt.toISOString(),
      lastSnapshotAt: state.lastRefreshAt ? state.lastRefreshAt.toISOString() : null,
      refreshing,
    },
  };
}

/** One window, cached: same minute bucket, same persisted inputs, same answer. */
async function loadWindow(db: SQL, hours: number): Promise<WindowSnapshot> {
  const state = await loadIntelligenceState(db);
  const revision = await mutationRevision(db);
  const key = `${hours}:${Math.floor(Date.now() / SNAPSHOT_INTERVAL_MS)}:${revision}`;
  const cached = windows.get(key);
  if (cached) {
    windows.delete(key);
    windows.set(key, cached);
    return cached;
  }
  const pending = (async () => {
    const input = await loadProjectionInput(db, hours, state.startedAt);
    const projection = await project(input);
    return {
      map: withIntelligence(projection.map, state),
      projection,
      revision,
    };
  })();
  windows.set(key, pending);
  while (windows.size > MAX_CACHED_WINDOWS) {
    const oldest = windows.keys().next().value;
    if (oldest === undefined) break;
    windows.delete(oldest);
  }
  try {
    return await pending;
  } catch (error) {
    if (windows.get(key) === pending) windows.delete(key);
    throw error;
  }
}

/**
 * Real topic evidence only: no inference on GET and no source hubs.
 *
 * A cache hit keeps its original `generatedAt` instead of claiming new work, and
 * a mutation (collection, edit, delete, review decision) changes the revision and
 * therefore the key, so a stale map is never served after the evidence moved.
 */
export async function buildTrendMap(hours = HOURS_DEFAULT): Promise<TrendMap> {
  const db = await getDb();
  if (snapshotDb !== db) {
    windows.clear();
    snapshotDb = db;
  }
  const snapshot = await loadWindow(db, hours);
  // One single-row read: the served map always states the store's current
  // refresh state instead of the state captured when the projection was built.
  return withIntelligence(snapshot.map, await loadIntelligenceState(db));
}

let refreshFlight: Promise<TrendMap[]> | null = null;

/**
 * Materialize the three map windows: stable catalog and membership identity,
 * one real hourly observation per topic and window, bounded retention.
 *
 * Single-flight per process (a second caller joins the running pass) and
 * cross-process safe (an advisory lock decides who writes). The default 168-hour
 * window is built first so the primary graph is ready before the smaller views,
 * and each window is the *same* work a GET for that window performs — a warm
 * request after the refresh pays no second projection.
 *
 * The returned maps are what the alert evaluator, board and inspector consume:
 * nothing is recomputed by the caller, and no read path infers a trend.
 */
export function refreshTopicIntelligence(): Promise<TrendMap[]> {
  if (refreshFlight) return refreshFlight;
  refreshFlight = (async () => {
    const db = await getDb();
    if (snapshotDb !== db) {
      windows.clear();
      snapshotDb = db;
    }
    refreshing = true;
    const byWindow = new Map<number, TrendMap>();
    try {
      for (const hours of REFRESH_WINDOWS) {
        const snapshot = await loadWindow(db, hours);
        // Alert evaluation must not consume a projection that lost its write
        // race: its membership no longer describes the committed evidence.
        const observedAt = new Date(snapshot.map.generatedAt);
        const outcome = await persistMaterialization({
          hours,
          canonical: hours === HOURS_DEFAULT,
          revision: snapshot.revision,
          bucketAt: new Date(Math.floor(observedAt.getTime() / HOUR_MS) * HOUR_MS),
          observedAt,
          catalog: snapshot.projection.catalog,
          members: snapshot.projection.members,
          snapshots: snapshot.projection.snapshots,
        });
        if (outcome === "written") byWindow.set(hours, snapshot.map);
      }
    } catch (error) {
      // The state row is the only place a background failure is visible, so the
      // UI can say why history is not advancing instead of implying calm.
      await recordRefreshError(error instanceof Error ? error.message : String(error)).catch(
        () => undefined,
      );
      throw error;
    } finally {
      refreshing = false;
      refreshFlight = null;
    }
    // State is read after the pass, so callers see `lastSnapshotAt` for the write
    // that just happened rather than the value captured before it. Returned in
    // ascending window order (24, 72, 168) whatever order they were built in.
    const state = await loadIntelligenceState(db);
    return [...byWindow.keys()]
      .sort((a, b) => a - b)
      .map((hours) => withIntelligence(byWindow.get(hours)!, state));
  })();
  return refreshFlight;
}
