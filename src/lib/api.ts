import type { TrendMap } from "../../shared/types.ts";

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code = "request_failed") {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new ApiClientError(
      "Unable to reach the trend service. Check your connection and try again.",
      0,
      "network",
    );
  }

  const body = (await response.json().catch(() => null)) as
    | { error?: string; code?: string }
    | T
    | null;

  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : "The request could not be completed. Try again.";
    throw new ApiClientError(
      message,
      response.status,
      body && typeof body === "object" && "code" in body && typeof body.code === "string"
        ? body.code
        : "request_failed",
    );
  }

  return body as T;
}

export interface CollectStatus {
  /** False when no database is configured; collection then cannot run at all. */
  configured: boolean;
  /** A backfill cycle is running right now, whether started by the timer or by hand. */
  backfilling: boolean;
  lastBackfillAt: string | null;
  lastBackfill: IngestReport | null;
  /** The live Jetstream tail is connected, so new posts arrive without polling. */
  tailConnected: boolean;
  tail: { seen: number; processed: number; dropped: number; sampleRate: number } | null;
  segments: number;
  lastErrors: Array<{ segmentId: string; message: string }>;
}

export interface IngestReport {
  segments: number;
  fetched: number;
  stored: number;
  observations: number;
  vectors: number;
  unvectorized: number;
  clusters: number;
  skippedLanguage: number;
  errors: Array<{ segmentId: string; message: string }>;
}

export function fetchTrendMap(hours: number) {
  return request<TrendMap>(`/api/trend-map?${new URLSearchParams({ hours: String(hours) })}`);
}

export function fetchCollectionStatus() {
  return request<CollectStatus>("/api/collect/status");
}

export function collectNow(limit: number) {
  return request<{ status: CollectStatus }>("/api/collect", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ limit }),
  });
}
