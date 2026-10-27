import { Activity, ArrowUpDown, Bell, Plus, Radar, TrendingUp } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { toastError } from "@/lib/toast";
import { RANGE_OPTIONS } from "../../shared/config.ts";
import type { WatchlistSummary } from "../../shared/types.ts";
import { geoName } from "../../shared/config.ts";
import { AlertList } from "@/components/alerts-list";
import { TrendChart } from "@/components/charts/trend-chart";
import { EmptyState } from "@/components/empty-state";
import {
  CountrySelect,
  LiveToggle,
  RangeTabs,
  RefreshButton,
  SourceBadge,
} from "@/components/controls";
import { ForecastPanel } from "@/components/forecast-panel";
import { NoticeBanner } from "@/components/notice-banner";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { TrendingList } from "@/components/trending-list";
import { WatchlistTable } from "@/components/watchlist-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useApp } from "@/lib/app-context";
import { cn } from "@/lib/utils";
import { formatNumber, formatPercent, formatRelative, directionText } from "@/lib/format";
import { useAddWatchlist, useMarkAlertsRead, useRemoveWatchlist } from "@/hooks/use-trends";

function OverviewSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index} className="h-28 p-4 sm:p-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-4 h-7 w-20" />
            <Skeleton className="mt-3 h-3 w-32" />
          </Card>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-8">
          <CardHeader>
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-56" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-72 w-full" />
          </CardContent>
        </Card>
        <Card className="xl:col-span-4">
          <CardHeader>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-20" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** Dashboard: one chart plus the forecast behind it, then the monitored set. */
export function OverviewPage() {
  const { overview, geo, setGeo, range, setRange, live, setLive, navigate, openAdd } = useApp();
  const [selectedTerm, setSelectedTerm] = useState<string | null>(null);
  const remove = useRemoveWatchlist();
  const add = useAddWatchlist();
  const markRead = useMarkAlertsRead();

  const data = overview.data;
  const loading = overview.isLoading && !data;
  const failed = overview.isError && !data;
  const watchlist = data?.watchlist ?? [];
  const active = watchlist.find((item) => item.term === selectedTerm) ?? watchlist[0] ?? null;
  const alerts = data?.alerts ?? [];

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
                {
                  onError: () =>
                    toastError("Unable to restore that trend. Add it from the watchlist."),
                },
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

  function handleMarkRead(id: string) {
    markRead.mutate(id, {
      onError: () =>
        toastError("Unable to mark the alert read. Check your connection and try again."),
    });
  }

  const topMover = data?.stats.topMover;
  const DirectionIcon =
    topMover?.direction === "up"
      ? TrendingUp
      : topMover?.direction === "down"
        ? ArrowUpDown
        : ArrowUpDown;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description="Search interest, forecasts, and threshold alerts for the trends you monitor."
        actions={
          <>
            {data ? <SourceBadge source={data.source} stale={data.stale} /> : null}
            <div className="hidden items-center text-xs text-muted-foreground lg:flex">
              {data ? (
                <time dateTime={data.fetchedAt}>Updated {formatRelative(data.fetchedAt)}</time>
              ) : null}
            </div>
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
        <CountrySelect value={geo} onChange={setGeo} />
        <RangeTabs value={range} onChange={setRange} />
      </div>

      {loading ? <OverviewSkeleton /> : null}

      {failed ? (
        <Card>
          <EmptyState
            icon={Bell}
            title="Unable to load the dashboard"
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
        <>
          <section
            aria-label="Key metrics"
            className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4"
          >
            <StatCard
              label="Monitored trends"
              value={formatNumber(data.stats.tracked)}
              hint="Across your workspace"
              icon={Radar}
            />
            <StatCard
              label="Average interest"
              value={formatNumber(data.stats.averageInterest)}
              hint="Latest relative index"
              icon={Activity}
            />
            <StatCard
              label="Top mover"
              value={topMover ? formatPercent(topMover.changePct) : "—"}
              hint={
                topMover ? (
                  <span className="flex items-center gap-1">
                    <DirectionIcon aria-hidden="true" className="size-3" />
                    {topMover.term} · {directionText(topMover.direction)}
                  </span>
                ) : (
                  "No meaningful move this period"
                )
              }
              icon={TrendingUp}
              badge={
                topMover ? (
                  <Badge variant="outline" className="mb-0.5">
                    {topMover.direction === "up"
                      ? "Up"
                      : topMover.direction === "down"
                        ? "Down"
                        : "Flat"}
                  </Badge>
                ) : null
              }
            />
            <StatCard
              label="Unread alerts"
              value={formatNumber(data.stats.unreadAlerts)}
              hint="Moves beyond your thresholds"
              icon={Bell}
              badge={
                data.stats.unreadAlerts > 0 ? (
                  <Badge variant="accent" className="mb-0.5">
                    New
                  </Badge>
                ) : null
              }
            />
          </section>

          <div className="grid gap-4 xl:grid-cols-12">
            <Card className="min-w-0 xl:col-span-8">
              <CardHeader className="gap-3">
                <div className="flex flex-col gap-1">
                  <CardTitle>Search interest</CardTitle>
                  <CardDescription>
                    {active
                      ? `${active.term} · ${RANGE_OPTIONS[range].label} · relative index 0–100`
                      : "Select a monitored trend to chart it"}
                  </CardDescription>
                </div>
                {watchlist.length > 0 ? (
                  <div role="group" aria-label="Chart trend" className="flex flex-wrap gap-1">
                    {watchlist.map((item) => {
                      const isActive = item.id === active?.id;
                      return (
                        <Button
                          key={item.id}
                          variant={isActive ? "secondary" : "ghost"}
                          size="xs"
                          aria-pressed={isActive}
                          onClick={() => setSelectedTerm(item.term)}
                          className={cn(
                            "max-w-48 justify-start",
                            isActive && "border border-input",
                          )}
                        >
                          <span className="truncate">{item.term}</span>
                        </Button>
                      );
                    })}
                  </div>
                ) : null}
              </CardHeader>
              <CardContent className="pt-3">
                {active ? (
                  <TrendChart insight={active.insight} range={range} />
                ) : (
                  <EmptyState
                    icon={Radar}
                    title="Chart a trend"
                    description="Monitor a search term to see its history and projection here."
                    action={
                      <Button size="sm" onClick={openAdd}>
                        <Plus aria-hidden="true" className="size-3.5" />
                        Monitor trend
                      </Button>
                    }
                    className="border-0 py-12"
                  />
                )}
              </CardContent>
            </Card>

            {active ? (
              <ForecastPanel insight={active.insight} range={range} className="xl:col-span-4" />
            ) : (
              <Card className="xl:col-span-4">
                <CardHeader>
                  <CardTitle>Forecast</CardTitle>
                  <CardDescription>Projection, interval, and backtest.</CardDescription>
                </CardHeader>
                <CardContent>
                  <EmptyState
                    icon={TrendingUp}
                    title="No forecast yet"
                    description="Add a trend to fit a projection on its search history."
                    className="border-0 px-2 py-8"
                  />
                </CardContent>
              </Card>
            )}
          </div>

          <div className="grid items-start gap-4 xl:grid-cols-12">
            <Card className="min-w-0 xl:col-span-8">
              <CardHeader className="flex-row items-start justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle>Monitored trends</CardTitle>
                  <CardDescription>Choose a trend to update the chart above.</CardDescription>
                </div>
                <Button variant="ghost" size="xs" asChild>
                  <a href="#/watchlist">View watchlist</a>
                </Button>
              </CardHeader>
              <CardContent className="pt-2">
                <WatchlistTable
                  items={watchlist}
                  range={range}
                  selectedId={active?.id}
                  onSelect={(item) => setSelectedTerm(item.term)}
                  onRemove={handleRemove}
                  emptyAction={
                    <Button size="sm" onClick={openAdd}>
                      <Plus aria-hidden="true" className="size-3.5" />
                      Monitor trend
                    </Button>
                  }
                />
              </CardContent>
            </Card>

            <div className="space-y-4 xl:col-span-4">
              <Card>
                <CardHeader className="flex-row items-start justify-between gap-3">
                  <div className="space-y-1">
                    <CardTitle>Recent alerts</CardTitle>
                    <CardDescription>Threshold crossings and forecast signals.</CardDescription>
                  </div>
                  <Button variant="ghost" size="xs" asChild>
                    <a href="#/alerts">View all</a>
                  </Button>
                </CardHeader>
                <CardContent className="px-5 pb-2 pt-1">
                  <AlertList
                    alerts={alerts.slice(0, 3)}
                    onRead={handleMarkRead}
                    compact
                    className={alerts.length === 0 ? "border-0 px-0 py-4" : undefined}
                    emptyTitle="No alerts yet"
                    emptyDescription="Moves past a watchlist threshold show up here."
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex-row items-start justify-between gap-3">
                  <div className="space-y-1">
                    <CardTitle>Trending now</CardTitle>
                    <CardDescription>{geoName(geo)} · daily searches</CardDescription>
                  </div>
                  <Badge variant={data.trending.source === "google" ? "outline" : "warning"}>
                    {data.trending.source === "google" ? (
                      <>
                        <span aria-hidden="true" className="size-1.5 rounded-full bg-success" />
                        Live
                      </>
                    ) : (
                      "Sample"
                    )}
                  </Badge>
                </CardHeader>
                <CardContent className="pt-2">
                  <TrendingList
                    items={data.trending.items.slice(0, 5)}
                    onAnalyze={(term) => navigate("explore", { terms: term })}
                  />
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
