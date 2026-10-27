import { Bell, Plus, Radar } from "lucide-react";
import { toast } from "sonner";
import { toastError } from "@/lib/toast";
import type { WatchlistSummary } from "../../shared/types.ts";
import { NoticeBanner } from "@/components/notice-banner";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { LiveToggle, RangeTabs, RefreshButton, SourceBadge } from "@/components/controls";
import { WatchlistTable } from "@/components/watchlist-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAddWatchlist, useRemoveWatchlist, useThresholdUpdate } from "@/hooks/use-trends";
import { useApp } from "@/lib/app-context";

export function WatchlistPage() {
  const { overview, live, setLive, range, setRange, openAdd } = useApp();
  const remove = useRemoveWatchlist();
  const add = useAddWatchlist();
  const updateThreshold = useThresholdUpdate();
  const data = overview.data;
  const items = data?.watchlist ?? [];

  function handleRemove(item: WatchlistSummary) {
    remove.mutate(item.id, {
      onSuccess: () => {
        toast(`Stopped monitoring ${item.term}`, {
          duration: Infinity,
          action: {
            label: "Undo",
            onClick: () => {
              add.mutate(
                { term: item.term, geo: item.geo, threshold: item.threshold },
                { onError: () => toastError("Unable to restore that trend. Try again.") },
              );
            },
          },
        });
      },
      onError: (error) => {
        toastError(
          error instanceof Error ? error.message : "Unable to remove that trend. Try again.",
        );
      },
    });
  }

  function handleThreshold(item: WatchlistSummary, threshold: number) {
    return updateThreshold.mutateAsync({ id: item.id, threshold }).catch((error) => {
      toastError(
        error instanceof Error ? error.message : "Unable to save that threshold. Try again.",
      );
      throw error;
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Watchlist"
        description="Monitor search terms, set alert thresholds, and check the latest movement."
        actions={
          <>
            {data ? <SourceBadge source={data.source} stale={data.stale} /> : null}
            <LiveToggle live={live} onChange={setLive} />
            <RefreshButton onClick={() => overview.refetch()} fetching={overview.isFetching} />
            <Button size="sm" onClick={openAdd}>
              <Plus aria-hidden="true" className="size-3.5" />
              Monitor trend
            </Button>
          </>
        }
      />

      {data?.notice ? (
        <NoticeBanner
          message={data.notice}
          onRetry={() => overview.refetch()}
          retrying={overview.isFetching}
        />
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Forecast window</span>
        <RangeTabs value={range} onChange={setRange} />
      </div>

      {overview.isLoading && !data ? (
        <Card>
          <CardHeader>
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-72" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : null}

      {overview.isError && !data ? (
        <Card>
          <EmptyState
            icon={Radar}
            title="Unable to load the watchlist"
            description={
              overview.error instanceof Error
                ? overview.error.message
                : "The trend service did not respond. Check your connection and try again."
            }
            action={
              <Button variant="outline" size="sm" onClick={() => overview.refetch()}>
                Retry
              </Button>
            }
            className="border-0"
          />
        </Card>
      ) : null}

      {data ? (
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle>Tracked trends</CardTitle>
              <CardDescription>
                Alert when a new observation moves more than the threshold beside it.
              </CardDescription>
            </div>
            {data.stats.unreadAlerts > 0 ? (
              <Button variant="outline" size="sm" asChild>
                <a href="#/alerts">
                  <Bell aria-hidden="true" className="size-3.5" />
                  {data.stats.unreadAlerts} unread
                </a>
              </Button>
            ) : null}
          </CardHeader>
          <CardContent className="pt-2">
            <WatchlistTable
              items={items}
              range={range}
              onRemove={handleRemove}
              onThresholdChange={handleThreshold}
              emptyAction={
                <Button size="sm" onClick={openAdd}>
                  <Plus aria-hidden="true" className="size-3.5" />
                  Monitor trend
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : null}

      <p className="text-xs leading-5 text-muted-foreground">
        Movement compares consecutive Google Trends observations: daily for the past three months,
        weekly otherwise. Forecast alerts use the same threshold against the projected move.
      </p>
    </div>
  );
}
