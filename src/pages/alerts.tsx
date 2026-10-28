import { Bell, CheckCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { toastError } from "@/lib/toast";
import { AlertList } from "@/components/alerts-list";
import { LiveToggle, RefreshButton, SourceBadge } from "@/components/controls";
import { EmptyState } from "@/components/empty-state";
import { NoticeBanner } from "@/components/notice-banner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useMarkAlertsRead } from "@/hooks/use-trends";
import { useApp } from "@/lib/app-context";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";

type Filter = "all" | "unread";

export function AlertsPage() {
  const { overview, live, setLive } = useApp();
  const [filter, setFilter] = useState<Filter>("all");
  const markRead = useMarkAlertsRead();
  const data = overview.data;
  const alerts = data?.alerts ?? [];
  const unread = data?.stats.unreadAlerts ?? 0;
  const unreadAlerts = alerts.filter((alert) => !alert.read);
  const refreshError =
    overview.isError && data
      ? overview.error instanceof Error
        ? overview.error.message
        : "The trend service did not respond. Showing the last loaded alerts."
      : null;

  function handleRead(id: string) {
    markRead.mutate(id, {
      onError: () =>
        toastError("Unable to mark the alert read. Check your connection and try again."),
    });
  }

  function markAll() {
    markRead.mutate(undefined, {
      onSuccess: () => toast("All alerts marked read"),
      onError: () => toastError("Unable to mark alerts read. Check your connection and try again."),
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alerts"
        description="Threshold crossings and forecast signals from the trends you monitor."
        actions={
          <>
            {data ? <SourceBadge stale={data.stale} /> : null}
            <LiveToggle live={live} onChange={setLive} />
            <RefreshButton onClick={() => overview.refetch()} fetching={overview.isFetching} />
            <Button
              variant="outline"
              size="sm"
              onClick={markAll}
              disabled={unread === 0 || markRead.isPending}
            >
              <CheckCheck aria-hidden="true" className="size-3.5" />
              Mark all read
            </Button>
          </>
        }
      />

      {refreshError || data?.notice ? (
        <NoticeBanner
          message={refreshError ?? data?.notice ?? ""}
          onRetry={() => overview.refetch()}
          retrying={overview.isFetching}
        />
      ) : null}

      {overview.isLoading && !data ? (
        <Card>
          <CardHeader>
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-64" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : null}

      {overview.isError && !data ? (
        <Card>
          <EmptyState
            icon={Bell}
            title="Unable to load alerts"
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
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
            <CardTitle>Alert inbox</CardTitle>
            <p className="text-xs text-muted-foreground" role="status">
              {formatNumber(unread)} unread of {formatNumber(alerts.length)} recent alerts
            </p>
          </CardHeader>
          <CardContent className="pt-0">
            {alerts.length === 0 ? (
              <EmptyState
                icon={Bell}
                title="No alerts yet"
                description="When a monitored trend moves past its threshold, the alert appears here after the dashboard refreshes."
                action={
                  <Button variant="outline" size="sm" asChild>
                    <a href="#/watchlist">Review watchlist</a>
                  </Button>
                }
                className="border-0"
              />
            ) : (
              <>
                <div
                  role="group"
                  aria-label="Filter alerts"
                  className="inline-flex h-8 items-center gap-0.5 rounded-lg bg-muted p-0.5"
                >
                  {(
                    [
                      { value: "all", label: "All", count: alerts.length },
                      { value: "unread", label: "Unread", count: unreadAlerts.length },
                    ] as const
                  ).map((option) => {
                    const active = filter === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setFilter(option.value)}
                        className={cn(
                          "inline-flex h-7 items-center justify-center whitespace-nowrap rounded-md px-2.5 text-xs font-medium transition-[color,background-color,box-shadow] duration-150",
                          active
                            ? "border border-input bg-background font-semibold text-foreground"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {option.label}
                        <span className="numeric ml-1">{option.count}</span>
                        <span className="sr-only"> alerts</span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-3">
                  {filter === "all" ? (
                    <AlertList alerts={alerts} onRead={handleRead} />
                  ) : (
                    <AlertList
                      alerts={unreadAlerts}
                      onRead={handleRead}
                      emptyTitle="No unread alerts"
                      emptyDescription="Everything is caught up. New movements will appear here after the next live refresh."
                      emptyAction={
                        <Button variant="outline" size="sm" onClick={() => setFilter("all")}>
                          Show all alerts
                        </Button>
                      }
                      className="border-0"
                    />
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      ) : null}

      <p className="text-xs leading-5 text-muted-foreground">
        Alerts are derived from live Google Trends data only. When live data is unavailable, no
        alert is created.
      </p>
    </div>
  );
}
