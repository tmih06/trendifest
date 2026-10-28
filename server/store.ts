import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isGeoCode } from "../shared/config.ts";
import type {
  Alert,
  AlertKind,
  RangeKey,
  TermInsight,
  WatchlistItem,
  WatchlistSummary,
} from "../shared/types.ts";

export class ApiFailure extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, message: string, code = "bad_request") {
    super(message);
    this.name = "ApiFailure";
    this.status = status;
    this.code = code;
  }
}

interface PersistedState {
  watchlist: WatchlistItem[];
  alerts: Alert[];
}

/** Resolve lazily so tests and one-off runs can point at an isolated store. */
function dataFile() {
  return (
    process.env.TRENDIFEST_DATA_FILE ?? fileURLToPath(new URL("./data/state.json", import.meta.url))
  );
}

const MAX_WATCHLIST = 12;
const MAX_ALERTS = 120;

let cached: PersistedState | null = null;
let writeChain: Promise<unknown> = Promise.resolve();

function emptyState(): PersistedState {
  return { watchlist: [], alerts: [] };
}

function isState(value: unknown): value is PersistedState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PersistedState>;
  return Array.isArray(candidate.watchlist) && Array.isArray(candidate.alerts);
}

async function load(): Promise<PersistedState> {
  if (cached) return cached;

  try {
    const raw = await readFile(dataFile(), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!isState(parsed)) throw new Error("Unexpected state shape");
    // Rebuild instead of keeping the parsed object so fields from older state
    // files (such as the retired lastCheckAt) do not survive the next write.
    // Early builds seeded three demo trends; drop those IDs so upgrading does
    // not leave a fresh MVP pretending the user chose them.
    cached = {
      watchlist: parsed.watchlist.filter((item) => !item.id.startsWith("seed-")),
      alerts: parsed.alerts.filter((alert) => !alert.watchlistId.startsWith("seed-")),
    };
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
    if (!missing) {
      // A corrupted file must not take the whole app down; starting empty loses
      // only local watchlist state, and the file is replaced on the next mutation.
      console.warn("Resetting trendifest state:", error instanceof Error ? error.message : error);
    }
    cached = emptyState();
  }

  return cached;
}

async function persist(state: PersistedState) {
  const file = dataFile();
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await rename(temporary, file);
}

/**
 * Serialize every mutation so concurrent browser tabs cannot interleave a
 * read-modify-write of the single JSON store. Reads wait for pending writes,
 * which keeps an overview request from observing half-applied state.
 */
function mutate<T>(operation: (state: PersistedState) => T | Promise<T>): Promise<T> {
  const task = writeChain.then(async () => {
    const state = await load();
    const result = await operation(state);
    await persist(state);
    return result;
  });
  writeChain = task.catch(() => undefined);
  return task;
}

export async function readState() {
  await writeChain;
  return load();
}

export async function addWatchlist(term: string, geo: string, threshold: number) {
  const clean = term.trim().replace(/\s+/g, " ").slice(0, 80);
  if (!clean) throw new ApiFailure(400, "Enter a search term to monitor");
  if (clean.includes(",")) {
    throw new ApiFailure(400, "Add one term at a time, without commas");
  }
  if (!isGeoCode(geo)) throw new ApiFailure(400, "Choose a supported country");
  const limit = Math.round(Math.min(100, Math.max(1, threshold)));

  return mutate((state) => {
    const duplicate = state.watchlist.find(
      (item) => item.term.toLowerCase() === clean.toLowerCase() && item.geo === geo.toUpperCase(),
    );
    if (duplicate) {
      throw new ApiFailure(409, `“${clean}” is already monitored for this country`, "duplicate");
    }
    if (state.watchlist.length >= MAX_WATCHLIST) {
      throw new ApiFailure(
        400,
        `The watchlist holds ${MAX_WATCHLIST} trends. Remove one before adding another.`,
        "limit",
      );
    }

    const item: WatchlistItem = {
      id: crypto.randomUUID(),
      term: clean,
      geo: geo.toUpperCase(),
      threshold: limit,
      createdAt: new Date().toISOString(),
    };
    state.watchlist.push(item);
    return item;
  });
}

export async function removeWatchlist(id: string) {
  return mutate((state) => {
    const item = state.watchlist.find((entry) => entry.id === id);
    if (!item) throw new ApiFailure(404, "That trend is no longer monitored", "not_found");
    state.watchlist = state.watchlist.filter((entry) => entry.id !== id);
    state.alerts = state.alerts.filter((alert) => alert.watchlistId !== id);
    return item;
  });
}

export async function updateThreshold(id: string, threshold: number) {
  const limit = Math.round(Math.min(100, Math.max(1, threshold)));
  return mutate((state) => {
    const item = state.watchlist.find((entry) => entry.id === id);
    if (!item) throw new ApiFailure(404, "That trend is no longer monitored", "not_found");
    item.threshold = limit;
    return item;
  });
}

export async function markAlertsRead(id?: string) {
  return mutate((state) => {
    for (const alert of state.alerts) {
      if (!id || alert.id === id) alert.read = true;
    }
    return state.alerts;
  });
}

function alertKindFor(
  insight: TermInsight,
  threshold: number,
): { kind: AlertKind; changePct: number; value: number; previous: number } | null {
  if (insight.changePct >= threshold) {
    return {
      kind: "surge",
      changePct: insight.changePct,
      value: insight.latest,
      previous: insight.previous,
    };
  }
  if (insight.changePct <= -threshold) {
    return {
      kind: "drop",
      changePct: insight.changePct,
      value: insight.latest,
      previous: insight.previous,
    };
  }
  if (
    insight.forecast.direction === "up" &&
    insight.forecast.changePct >= threshold &&
    insight.latest < 70
  ) {
    const endpoint = insight.forecast.points.at(-1)?.value ?? insight.forecast.next;
    return {
      kind: "forecast-rise",
      changePct: insight.forecast.changePct,
      value: endpoint,
      previous: insight.latest,
    };
  }
  return null;
}

/**
 * Derive alerts from live summaries. Only one alert per watchlist item, kind,
 * and observed period is stored, so polling the overview never inflates the
 * inbox. The analysis client has no synthetic data source; an outage throws
 * before it can reach this function.
 */
export async function recordAlerts(summaries: WatchlistSummary[], range: RangeKey) {
  return mutate((state) => {
    const existing = new Set(state.alerts.map((alert) => alert.id));
    const created: Alert[] = [];

    for (const summary of summaries) {
      const candidate = alertKindFor(summary.insight, summary.threshold);
      if (!candidate) continue;
      const id = `${summary.id}:${candidate.kind}:${summary.insight.latestTime}`;
      if (existing.has(id)) continue;

      const alert: Alert = {
        id,
        watchlistId: summary.id,
        term: summary.term,
        geo: summary.geo,
        kind: candidate.kind,
        value: candidate.value,
        previous: candidate.previous,
        changePct: candidate.changePct,
        threshold: summary.threshold,
        range,
        horizon: candidate.kind === "forecast-rise" ? summary.insight.forecast.horizon : null,
        period: String(summary.insight.latestTime),
        createdAt: new Date().toISOString(),
        read: false,
      };
      state.alerts.unshift(alert);
      existing.add(id);
      created.push(alert);
    }

    state.alerts = state.alerts
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, MAX_ALERTS);
    return created;
  });
}
