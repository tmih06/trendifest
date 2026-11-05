import { databaseConfigured } from "../db.ts";
import { refreshTopicIntelligence } from "./topic-intelligence.ts";

/** Collection runs every ten minutes; materialized history also advances when idle. */
const REFRESH_INTERVAL_MS = 5 * 60_000;
let timer: NodeJS.Timeout | undefined;
let flight: Promise<void> | undefined;

/**
 * Share one bounded refresh per process. The intelligence store also serializes
 * independent API/collector processes; source polling never owns model inference
 * or graph projection on the HTTP event loop. Mutating callers request a pass
 * after existing work: an older in-flight projection may predate their writes.
 */
export function refreshIntelligence(afterCurrent = false): Promise<void> {
  if (!databaseConfigured()) return Promise.resolve();
  if (flight) {
    return afterCurrent ? flight.catch(() => undefined).then(() => refreshIntelligence()) : flight;
  }
  const pending = refreshTopicIntelligence()
    .then(() => undefined)
    .finally(() => {
      flight = undefined;
    });
  flight = pending;
  return pending;
}

/** Startup is fire-and-forget: readiness must never wait on SQL or CPU grouping. */
export function startTopicIntelligence(): void {
  if (!databaseConfigured() || timer !== undefined) return;
  const refresh = () => {
    void refreshIntelligence().catch((error: unknown) => {
      console.warn(
        "Topic intelligence refresh failed:",
        error instanceof Error ? error.message : String(error),
      );
    });
  };
  timer = setInterval(refresh, REFRESH_INTERVAL_MS);
  timer.unref();
  refresh();
}

/** Stop owned future work; an accepted durable refresh can finish normally. */
export function stopTopicIntelligence(): void {
  clearInterval(timer);
  timer = undefined;
}
