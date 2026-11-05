import { VIEWER_SEGMENTS } from "../../shared/segments.ts";
import type {
  CollectionStatus,
  IngestReport,
  SegmentCoverage,
  SocialSignals,
} from "../../shared/types.ts";
import { databaseConfigured } from "../db.ts";
import { ingestSegments, socialSignals } from "./pipeline.ts";

/** Equal, bounded public-feed polls replace the unfiltered whole-network stream. */
const POLL_INTERVAL_MS = 10 * 60 * 1000;
let timer: NodeJS.Timeout | undefined;
let backfilling = false;
let lastBackfillAt: string | null = null;
let lastBackfill: IngestReport | null = null;
let lastErrors: Array<{ segmentId: string; message: string }> = [];

/** A manual request and the timer share one flight; overlapping cycles return null. */
export async function runBackfill(limitPerSegment = 20): Promise<IngestReport | null> {
  if (backfilling) return null;
  backfilling = true;
  try {
    const report = await ingestSegments({ limitPerSegment });
    lastBackfill = report;
    lastBackfillAt = new Date().toISOString();
    lastErrors = report.errors;
    return report;
  } catch (error) {
    lastErrors = [
      { segmentId: "collection", message: error instanceof Error ? error.message : String(error) },
    ];
    throw error;
  } finally {
    backfilling = false;
  }
}

/** Start once only when a database is configured; no public stream is opened. */
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

/** Stop future polls; an accepted in-flight cycle retains its single-flight ownership. */
export function stopSocialCollection() {
  clearInterval(timer);
  timer = undefined;
}

/** Report polling state, not a fictional live socket or guaranteed source availability. */
export function status(): CollectionStatus {
  return {
    configured: databaseConfigured(),
    enabled: timer !== undefined,
    backfilling,
    lastBackfillAt,
    lastBackfill,
    lastErrors,
    segments: VIEWER_SEGMENTS.length,
  };
}

/** Preserve known counts while marking collection failures, including in graph responses. */
export function coverageWithErrors(coverage: SegmentCoverage[]): SegmentCoverage[] {
  return coverage.map((row) => {
    const error = lastErrors.find((item) => item.segmentId === row.segmentId);
    return error ? { ...row, error: error.message } : row;
  });
}

export async function signalsWithCoverage(windowHours = 72) {
  const signals = await socialSignals(windowHours);
  return {
    ...signals,
    coverage: coverageWithErrors(signals.coverage),
  } satisfies SocialSignals;
}

/** Cheap health status; importing this module never creates a database connection. */
export function socialHealth() {
  return {
    configured: databaseConfigured(),
    enabled: timer !== undefined,
    segments: VIEWER_SEGMENTS.length,
  };
}
