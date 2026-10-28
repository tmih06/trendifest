import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RangeKey } from "../../shared/types.ts";
import {
  createWatchlistItem,
  deleteWatchlistItem,
  fetchAnalysis,
  fetchOverview,
  fetchSuggestions,
  fetchWatchlistItems,
  patchWatchlistThreshold,
  readAlerts,
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
