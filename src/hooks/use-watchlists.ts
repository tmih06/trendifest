import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { WatchRule, WatchRuleInput, WatchlistState } from "../../shared/intelligence.ts";
import { ApiClientError, request } from "@/lib/api";

/**
 * Single-user watch rules plus the in-app alert history. One cache entry
 * (`['watchlists']`) is shared by the sidebar badge and the panel, so opening
 * the view never issues a second request.
 *
 * A missing database is a configuration state, not a transient failure: retrying
 * it would only hammer a 503. The same applies to the auth failure that stops
 * every route.
 */
function retryUnlessUnconfigured(count: number, error: Error) {
  if (
    error instanceof ApiClientError &&
    (error.status === 401 || error.status === 403 || error.code === "database_unconfigured")
  ) {
    return false;
  }
  return count < 1;
}

/** Shared with the shell, so a badge and the panel observe one entry. */
export const WATCHLIST_QUERY_KEY = ["watchlists"] as const;

/** Newest alerts arrive on the server's own schedule, so the view polls gently. */
const POLL_MS = 30_000;
const STALE_MS = 5 * 60_000;

/**
 * `enabled` lets the shell wait for database readiness. The latest page shares
 * one cache entry with its unread badge; older keyset pages are fetched only on
 * demand and never poll. Mutations invalidate the entire watchlist prefix.
 */
export function useWatchlists(enabled = true, before?: string) {
  const query = useQuery({
    queryKey: before ? [...WATCHLIST_QUERY_KEY, before] : WATCHLIST_QUERY_KEY,
    queryFn: () =>
      request<WatchlistState>(
        before ? `/api/watchlists?${new URLSearchParams({ before })}` : "/api/watchlists",
      ),
    enabled,
    staleTime: STALE_MS,
    gcTime: 30 * 60_000,
    refetchInterval: (current) => {
      if (!enabled || before) return false;
      const data = current.state.data;
      if (!data) return POLL_MS;
      return data.rules.some((rule) => rule.enabled) || data.unread > 0 ? POLL_MS : false;
    },
    retry: retryUnlessUnconfigured,
  });

  return {
    ...query,
    rules: query.data?.rules ?? [],
    /** At most 200 per keyset page; no per-row request exists. */
    alerts: query.data?.alerts ?? [],
    /** Counted server-side, so it stays correct beyond the returned page. */
    unread: query.data?.unread ?? 0,
    nextCursor: query.data?.alertsNextCursor ?? null,
  };
}

function revalidate(client: QueryClient) {
  void client.invalidateQueries({ queryKey: WATCHLIST_QUERY_KEY });
}

type RulePatch = Partial<WatchRuleInput>;

/** Create and edit share one mutation; the presence of `id` selects the route. */
export function useSaveWatchRule() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: WatchRuleInput | RulePatch }) =>
      id
        ? request<WatchRule>(`/api/watchlists/${encodeURIComponent(id)}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(input),
          })
        : request<WatchRule>("/api/watchlists", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(input),
          }),
    onSuccess: () => revalidate(client),
  });
}

export function useDeleteWatchRule() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request<{ ok: true }>(`/api/watchlists/${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: () => revalidate(client),
  });
}

/** Marking read is server state, not an optimistic guess: the badge must agree. */
export function useMarkAlertRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request<{ ok: true }>(`/api/alerts/${encodeURIComponent(id)}/read`, { method: "POST" }),
    onSuccess: () => revalidate(client),
  });
}
