import { VIEWER_SEGMENTS } from "../../shared/segments.ts";
import type {
  CollectionProgress,
  CollectionStatus,
  IngestReport,
  SegmentCoverage,
  SocialSignals,
} from "../../shared/types.ts";
import { databaseConfigured, getDb } from "../db.ts";
import { clampCollectionLimit, DEFAULT_COLLECTION_LIMIT } from "./input.ts";
import { ingestSegments, socialSignals } from "./pipeline.ts";

/** Finite provider polls; a session lock also coordinates independent server/CLI processes. */
const POLL_INTERVAL_MS = 10 * 60 * 1000;
const COLLECTION_LOCK_NAMESPACE = 0x54524446;
let timer: NodeJS.Timeout | undefined;
let backfilling = false;
let lastBackfillAt: string | null = null;
let lastBackfill: IngestReport | null = null;
let lastErrors: Array<{ segmentId: string; message: string }> = [];

/** A new cycle starts with measured-zero receipts, not an estimated percentage. */
function emptyProgress(limit: number): CollectionProgress {
  return {
    phase: "idle",
    limit,
    segments: VIEWER_SEGMENTS.length,
    segmentsDone: 0,
    fetched: 0,
    stored: 0,
    duplicates: 0,
    rejected: 0,
    embedded: 0,
    pending: 0,
    startedAt: null,
    updatedAt: null,
    current: null,
    note: null,
  };
}

let progress = emptyProgress(DEFAULT_COLLECTION_LIMIT);

/**
 * A timer, manual request and operator CLI share one collector per database.
 * A reserved connection owns the advisory lock without putting inference into
 * one long transaction. Process exit releases the lock automatically; every
 * accepted post remains individually durable and resumable.
 */
export async function runBackfill(
  limitPerSegment = DEFAULT_COLLECTION_LIMIT,
  segmentIds?: string[],
): Promise<IngestReport | null> {
  if (backfilling) return null;
  backfilling = true;
  const limit = clampCollectionLimit(limitPerSegment);
  const startedAt = new Date().toISOString();
  progress = { ...emptyProgress(limit), phase: "fetching", startedAt, updatedAt: startedAt };
  try {
    const db = await getDb();
    const connection = await db.reserve();
    let acquired = false;
    try {
      const [lock] = await connection`
        SELECT pg_try_advisory_lock(${COLLECTION_LOCK_NAMESPACE}::int, 1) AS acquired
      `;
      acquired = lock?.acquired === true;
      if (!acquired) {
        progress = {
          ...progress,
          phase: "idle",
          note: "Another process is collecting this database; no overlapping cycle was started.",
          updatedAt: new Date().toISOString(),
        };
        return null;
      }
      const report = await ingestSegments({
        limitPerSegment: limit,
        segmentIds,
        onProgress(update) {
          progress = { ...progress, ...update, updatedAt: new Date().toISOString() };
        },
      });
      lastBackfill = report;
      lastBackfillAt = new Date().toISOString();
      lastErrors = report.errors;
      progress = {
        ...progress,
        phase: "done",
        current: null,
        updatedAt: lastBackfillAt,
        note: report.errors.length
          ? `${report.errors.length} collection errors; see source results.`
          : null,
      };
      return report;
    } finally {
      try {
        if (acquired) {
          await connection`SELECT pg_advisory_unlock(${COLLECTION_LOCK_NAMESPACE}::int, 1)`;
        }
      } finally {
        await connection.release();
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    lastErrors = [{ segmentId: "collection", message }];
    progress = { ...progress, phase: "failed", note: message, updatedAt: new Date().toISOString() };
    throw error;
  } finally {
    backfilling = false;
  }
}

/** Start once only when configured; kickoff is asynchronous and never delays HTTP readiness. */
export function startSocialCollection() {
  if (!databaseConfigured() || timer !== undefined) return status();
  const poll = () => {
    void runBackfill().catch((error: unknown) => {
      console.warn(
        "Public feed collection failed:",
        error instanceof Error ? error.message : String(error),
      );
    });
  };
  timer = setInterval(poll, POLL_INTERVAL_MS);
  poll();
  return status();
}

/** Stop future polls; accepted in-flight work retains its database lock until completion. */
export function stopSocialCollection() {
  clearInterval(timer);
  timer = undefined;
}

/** Polling state and real progress receipts, never a fictional stream or audience estimate. */
export function status(): CollectionStatus {
  return {
    configured: databaseConfigured(),
    enabled: timer !== undefined,
    backfilling,
    lastBackfillAt,
    lastBackfill,
    lastErrors,
    segments: VIEWER_SEGMENTS.length,
    progress,
  };
}

/** Preserve known counts while making partial or complete source failures visible. */
export function coverageWithErrors(coverage: SegmentCoverage[]): SegmentCoverage[] {
  return coverage.map((row) => {
    const error = lastErrors.find((item) => item.segmentId === row.segmentId);
    return error ? { ...row, error: error.message } : row;
  });
}

/** Operational near-copy results keep the same error accounting as the topic graph. */
export async function signalsWithCoverage(windowHours = 72) {
  const signals = await socialSignals(windowHours);
  return {
    ...signals,
    coverage: coverageWithErrors(signals.coverage),
  } satisfies SocialSignals;
}

/** Cheap health status; checking readiness never starts inference or waits for collection. */
export function socialHealth() {
  return {
    configured: databaseConfigured(),
    enabled: timer !== undefined,
    segments: VIEWER_SEGMENTS.length,
  };
}
