import { VIEWER_SEGMENTS } from "../../shared/segments.ts";
import type { SegmentCoverage, SocialSignals } from "../../shared/types.ts";
import { databaseConfigured } from "../db.ts";
import { BlueskyError } from "./bluesky.ts";
import { ingestSegments, socialSignals, startTail } from "./pipeline.ts";
import type { IngestReport } from "./pipeline.ts";

/**
 * Background ingest scheduling and read caching.
 *
 * Two collection paths run together:
 * - periodic feed backfill, which supplies engagement counts and reaches posts
 *   the live tail dropped during a disconnect;
 * - the live Jetstream tail, which supplies new posts without polling.
 *
 * Segment errors are retained in `lastErrors` so the API can report "unknown"
 * for a failed segment instead of implying it observed zero posts.
 */

const BACKFILL_INTERVAL_MS = 10 * 60 * 1000;
const DEFAULT_WINDOW_HOURS = 72;

export interface SocialServiceStatus {
  configured: boolean;
  backfilling: boolean;
  lastBackfillAt: string | null;
  lastBackfill: IngestReport | null;
  lastErrors: Array<{ segmentId: string; message: string }>;
  tailConnected: boolean;
  /** What the live tail saw versus processed; null when the tail is not running. */
  tail: { seen: number; processed: number; dropped: number; sampleRate: number } | null;
  segments: number;
}

let timer: ReturnType<typeof setInterval> | null = null;
let tail: ReturnType<typeof startTail> | null = null;
let backfilling = false;
let lastBackfillAt: string | null = null;
let lastBackfill: IngestReport | null = null;
const lastErrors = new Map<string, string>();
let errorLog: Array<{ segmentId: string; message: string }> = [];

/**
 * Run one backfill cycle. Re-entrancy is guarded by `backfilling`: a slow cycle
 * covering video downloads must not stack behind the interval timer.
 */
/**
 * `limitPerSegment` counts posts *accepted* per segment, and ingestion now
 * walks up to three pages to find unseen ones. 25 keeps niche feeds producing
 * patterns without turning a cycle into a long media-embedding run.
 */
export async function runBackfill(limitPerSegment = 25): Promise<IngestReport | null> {
  // A concurrent cycle returns null rather than a half-made report, so the API
  // can say "already running" instead of reporting a stale success.
  if (backfilling) return null;
  backfilling = true;
  try {
    const report = await ingestSegments({ limitPerSegment });
    lastBackfill = report;
    lastBackfillAt = new Date().toISOString();

    // Errors are per segment and replace the previous cycle's, so a fixed
    // segment stops showing an error without any explicit clearing step.
    lastErrors.clear();
    for (const error of report.errors) lastErrors.set(error.segmentId, error.message);
    errorLog = [...lastErrors.entries()].map(([segmentId, message]) => ({ segmentId, message }));
    return report;
  } finally {
    backfilling = false;
  }
}

/**
 * Start the tail and the backfill timer. No database means social collection is
 * unavailable, which is a supported deployment (the keyword MVP needs no DB);
 * callers see `configured: false` rather than a background crash.
 */
export function startSocialCollection() {
  if (!databaseConfigured()) return status();
  if (!tail) {
    tail = startTail({
      onError: (error) => {
        console.warn("Social tail error:", error.message);
      },
    });
  }
  if (!timer) {
    timer = setInterval(() => {
      void runBackfill().catch((error: unknown) => {
        // The interval must survive a database blip; the next cycle retries.
        console.warn(
          "Social backfill failed:",
          error instanceof Error ? error.message : String(error),
        );
      });
    }, BACKFILL_INTERVAL_MS);
    void runBackfill().catch(() => undefined);
  }
  return status();
}

export function stopSocialCollection() {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
  tail?.stop();
  tail = null;
}

export function status(): SocialServiceStatus {
  return {
    configured: databaseConfigured(),
    backfilling,
    lastBackfillAt,
    lastBackfill,
    lastErrors: errorLog,
    tailConnected: tail?.open ?? false,
    tail: tail?.counters ?? null,
    segments: VIEWER_SEGMENTS.length,
  };
}

/**
 * Signals with per-segment failure attached. Coverage rows for a failed segment
 * carry `error`, so the client can label them unknown instead of zero.
 */
export async function signalsWithCoverage(windowHours = DEFAULT_WINDOW_HOURS) {
  const signals = await socialSignals(windowHours);
  return {
    ...signals,
    coverage: signals.coverage.map((row): SegmentCoverage => {
      const message = lastErrors.get(row.segmentId);
      return message && row.posts === 0 ? { ...row, error: message } : row;
    }),
  } satisfies SocialSignals;
}

/** Sanity check used by the health route: surface an unconfigured DB early. */
export function socialHealth() {
  return { configured: databaseConfigured(), segments: VIEWER_SEGMENTS.length };
}

export { BlueskyError };
