import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RangeKey } from "../../shared/types.ts";
import {
  collectNow,
  createWatchlistItem,
  deleteWatchlistItem,
  fetchAnalysis,
  fetchOverview,
  fetchSignals,
  fetchSuggestions,
  fetchTrendMap,
  fetchWatchlistItems,
  patchWatchlistThreshold,
  readAlerts,
  searchSignals,
} from "@/lib/api";

export function useOverview(geo: string, range: RangeKey, live: boolean) {
  return useQuery({
    queryKey: ["overview", geo, range],
    queryFn: () => fetchOverview(geo, range),
    staleTime: 30_000,
    refetchInterval: live ? 60_000 : false,
  });
}

export function useAnalysis(terms: string[], geo: string, range: RangeKey) {
  return useQuery({
    queryKey: ["analysis", terms.join(","), geo, range],
    queryFn: () => fetchAnalysis(terms, geo, range),
    enabled: terms.length > 0,
    staleTime: 5 * 60_000,
  });
}

export function useWatchlist() {
  return useQuery({
    queryKey: ["watchlist"],
    queryFn: fetchWatchlistItems,
    staleTime: 30_000,
  });
}

export function useSuggestions(query: string) {
  return useQuery({
    queryKey: ["suggest", query],
    queryFn: ({ signal }) => fetchSuggestions(query, signal),
    enabled: query.trim().length >= 2,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/** All watchlist mutations invalidate the dashboard so derived alerts refresh. */
export function useAddWatchlist() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: createWatchlistItem,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["overview"] });
      void client.invalidateQueries({ queryKey: ["watchlist"] });
    },
  });
}

export function useRemoveWatchlist() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: deleteWatchlistItem,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["overview"] });
      void client.invalidateQueries({ queryKey: ["watchlist"] });
    },
  });
}

export function useThresholdUpdate() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, threshold }: { id: string; threshold: number }) =>
      patchWatchlistThreshold(id, threshold),
    onSuccess: () => client.invalidateQueries({ queryKey: ["overview"] }),
  });
}

export function useMarkAlertsRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id?: string) => readAlerts(id),
    onSuccess: () => client.invalidateQueries({ queryKey: ["overview"] }),
  });
}

export function useSignals(hours: number) {
  return useQuery({
    queryKey: ["signals", hours],
    queryFn: () => fetchSignals(hours),
    staleTime: 30_000,
    refetchInterval: 60_000,
    // A missing database is a configuration state, not a transient error worth
    // retrying; retrying would just hammer a 503.
    retry: (count, error) =>
      !(error instanceof Error && "code" in error && error.code === "database_unconfigured") &&
      count < 1,
  });
}

export function useSignalSearch(query: string) {
  return useQuery({
    queryKey: ["signals-search", query],
    queryFn: ({ signal }) => searchSignals(query, signal),
    enabled: query.trim().length >= 2,
    staleTime: 60_000,
    retry: false,
  });
}

export function useCollectNow() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (limit: number) => collectNow(limit),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["signals"] });
    },
  });
}

export function useTrendMap(hours: number) {
  return useQuery({
    queryKey: ["trend-map", hours],
    queryFn: () => fetchTrendMap(hours),
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: (count, error) =>
      !(error instanceof Error && "code" in error && error.code === "database_unconfigured") &&
      count < 1,
  });
}
