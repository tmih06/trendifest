import type {
  Alert,
  Overview,
  RangeKey,
  TrendAnalysis,
  WatchlistItem,
} from "../../shared/types.ts";

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

function query(params: Record<string, string>) {
  return new URLSearchParams(params).toString();
}

export function fetchOverview(geo: string, range: RangeKey) {
  return request<Overview>(`/api/overview?${query({ geo, range })}`);
}

export async function fetchWatchlistItems() {
  const result = await request<{ items: WatchlistItem[] }>("/api/watchlist");
  return result.items;
}

export function fetchAnalysis(terms: string[], geo: string, range: RangeKey) {
  return request<TrendAnalysis>(`/api/analyze?${query({ terms: terms.join(","), geo, range })}`);
}

export async function fetchSuggestions(queryText: string, signal?: AbortSignal) {
  const result = await request<{ suggestions: string[] }>(
    `/api/suggest?${query({ q: queryText })}`,
    { signal },
  );
  return result.suggestions;
}

export function createWatchlistItem(input: { term: string; geo: string; threshold: number }) {
  return request<{ item: WatchlistItem }>("/api/watchlist", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function deleteWatchlistItem(id: string) {
  return request<{ item: WatchlistItem }>(`/api/watchlist/${id}`, { method: "DELETE" });
}

export function patchWatchlistThreshold(id: string, threshold: number) {
  return request<{ item: WatchlistItem }>(`/api/watchlist/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ threshold }),
  });
}

export function readAlerts(id?: string) {
  return request<{ alerts: Alert[]; unread: number }>("/api/alerts/read", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(id ? { id } : {}),
  });
}
