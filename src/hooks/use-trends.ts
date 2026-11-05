import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { collectNow, fetchCollectionStatus, fetchTrendMap } from "@/lib/api";

/**
 * A missing database is a configuration state, not a transient error worth
 * retrying; retrying would just hammer a 503.
 */
function retryUnlessUnconfigured(count: number, error: Error) {
  return (
    !(error instanceof Error && "code" in error && error.code === "database_unconfigured") &&
    count < 1
  );
}

/**
 * Keep exact window snapshots in memory for quick revisits. Active windows
 * still poll every two minutes; collection completion invalidates every window.
 * Never derive a smaller window from capped aggregate topics: that would lose
 * evidence and reuse scores computed for the wrong observation interval.
 */
export function useTrendMap(hours: number) {
  return useQuery({
    queryKey: ["trend-map", hours],
    queryFn: () => fetchTrendMap(hours),
    staleTime: 15 * 60_000,
    gcTime: 30 * 60_000,
    refetchInterval: 120_000,
    retry: retryUnlessUnconfigured,
  });
}

/**
 * Collection status changes on the server's own schedule, so it polls faster
 * than the graph. The server owns configuration, cycle state and completion
 * timestamps; the client does not invent a live stream.
 */
export function useCollectionStatus() {
  const client = useQueryClient();
  const previousCompletion = useRef<string | null | undefined>(undefined);
  const query = useQuery({
    queryKey: ["collect-status"],
    queryFn: fetchCollectionStatus,
    staleTime: 10_000,
    refetchInterval: 15_000,
    retry: retryUnlessUnconfigured,
  });
  useEffect(() => {
    if (!query.data) return;
    const completedAt = query.data.lastBackfillAt;
    if (
      previousCompletion.current !== undefined &&
      completedAt &&
      completedAt !== previousCompletion.current
    ) {
      void client.invalidateQueries({ queryKey: ["trend-map"] });
    }
    previousCompletion.current = completedAt;
  }, [client, query.data]);
  return query;
}

/** Acceptance is immediate; the status poll observes the long-running cycle. */
export function useCollectNow() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (limit: number) => collectNow(limit),
    onSuccess: (result) => {
      client.setQueryData(["collect-status"], result.status);
      void client.invalidateQueries({ queryKey: ["collect-status"] });
    },
  });
}
