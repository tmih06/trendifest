import { ArrowUpRight, Layers, MessagesSquare, Radio, Search, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { PatternCluster, SegmentCoverage } from "../../shared/types.ts";
import { DbNotice } from "@/components/db-notice";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebouncedValue } from "@/hooks/use-app";
import { useCollectNow, useSignalSearch, useSignals } from "@/hooks/use-trends";
import { toastError } from "@/lib/toast";
import { formatNumber, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

const WINDOW_HOURS = 72;

/** A segment that failed this cycle is unknown volume, never zero. */
function CoverageCell({ row }: { row: SegmentCoverage }) {
  const failed = Boolean(row.error);
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-b-0">
      <div className="min-w-0">
        <p className="truncate text-[0.8125rem] text-foreground">{row.label}</p>
        <p className="text-xs text-muted-foreground">
          {row.lastObservedAt ? formatRelative(row.lastObservedAt) : "never observed"}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {row.mediaPosts > 0 ? (
          <Badge variant="outline" className="tabular-nums">
            {formatNumber(row.mediaPosts)} media
          </Badge>
        ) : null}
        {failed ? (
          <Badge variant="warning" title={row.error}>
            unknown
          </Badge>
        ) : (
          <span className="numeric text-sm tabular-nums text-foreground">
            {formatNumber(row.posts)}
          </span>
        )}
      </div>
    </div>
  );
}

function ClusterCard({ cluster }: { cluster: PatternCluster }) {
  const [open, setOpen] = useState(false);
  const examples = open ? cluster.examples : cluster.examples.slice(0, 2);

  return (
    <Card className="gap-0">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="line-clamp-2 text-[0.9375rem] leading-5">{cluster.label}</CardTitle>
          <Badge variant={cluster.crossings > 0 ? "accent" : "outline"} className="shrink-0">
            {cluster.crossings > 0
              ? `${cluster.crossings} crossing${cluster.crossings === 1 ? "" : "s"}`
              : "single audience"}
          </Badge>
        </div>
        <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span>{cluster.kind}</span>
          <span aria-hidden="true">·</span>
          <span>
            {cluster.size} post{cluster.size === 1 ? "" : "s"}
          </span>
          <span aria-hidden="true">·</span>
          <span>cohesion {cluster.cohesion.toFixed(2)}</span>
          <span aria-hidden="true">·</span>
          <span>{formatRelative(cluster.lastSeenAt)}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2.5 pb-4">
        {cluster.segments.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {cluster.segments.map((segment) => (
              <Badge key={segment} variant="secondary">
                {segment}
              </Badge>
            ))}
          </div>
        ) : null}

        <ul className="space-y-2">
          {examples.map((example) => (
            <li
              key={`${example.uri}-${example.kind}`}
              className="rounded-md border border-border p-2.5"
            >
              <p className="line-clamp-3 text-[0.8125rem] leading-5 text-foreground">
                {example.text.trim() || "(no text)"}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
                <a
                  href={example.permalink}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-0.5 underline-offset-2 hover:text-foreground hover:underline"
                >
                  {example.authorHandle ?? "view post"}
                  <ArrowUpRight aria-hidden="true" className="size-3" />
                </a>
                <span>{formatRelative(example.observedAt)}</span>
                {example.mediaCount > 0 ? <span>{example.mediaCount} media</span> : null}
              </div>
            </li>
          ))}
        </ul>

        {cluster.examples.length > 2 ? (
          <Button variant="ghost" size="xs" onClick={() => setOpen((value) => !value)}>
            {open ? "Show fewer" : `Show ${cluster.examples.length - 2} more`}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function SignalsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index} className="h-28 p-4 sm:p-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-4 h-7 w-16" />
            <Skeleton className="mt-3 h-3 w-32" />
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Card key={index} className="h-40 p-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-4 h-24 w-full" />
          </Card>
        ))}
      </div>
    </div>
  );
}

/**
 * Social signals: what each viewer segment supplied, which patterns formed, and
 * which of them crossed audiences. Coverage is shown next to the clusters on
 * purpose: a cluster list without its sampling base invites reading absence as
 * evidence that nothing happened.
 */
export function SignalsPage() {
  const signals = useSignals(WINDOW_HOURS);
  const collect = useCollectNow();
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query, 300);
  const search = useSignalSearch(debounced);

  const data = signals.data;
  const loading = signals.isLoading && !data;
  const unconfigured =
    signals.isError &&
    signals.error instanceof Error &&
    "code" in signals.error &&
    signals.error.code === "database_unconfigured";

  const sorted = useMemo(
    () =>
      data ? [...data.clusters].sort((a, b) => b.crossings - a.crossings || b.size - a.size) : [],
    [data],
  );

  const onCollect = () => {
    collect.mutate(8, {
      onSuccess: (result) => {
        if (!result.status.configured) {
          toast.error("Set TRENDIFEST_DATABASE_URL to collect social posts.");
          return;
        }
        toast.success("Collection cycle finished", {
          description: `${result.report.stored} new posts stored, ${result.report.vectors} vectors written.`,
        });
      },
      onError: (error) => {
        toastError(error instanceof Error ? error.message : "Collection failed");
      },
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Signals"
        description="Live Bluesky posts collected per viewer segment, grouped by local multimodal embeddings. Coverage is per segment: a failed feed reports unknown, never zero."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={onCollect}
              disabled={collect.isPending || unconfigured}
            >
              {collect.isPending ? "Collecting…" : "Collect now"}
            </Button>
          </>
        }
      />

      {unconfigured ? (
        <div role="status">
          <DbNotice />
        </div>
      ) : null}

      {loading ? <SignalsSkeleton /> : null}

      {signals.isError && !unconfigured ? (
        <EmptyState
          icon={TriangleAlert}
          title="Signals could not be loaded"
          description={
            signals.error instanceof Error
              ? signals.error.message
              : "The collection database did not answer."
          }
          action={
            <Button variant="outline" size="sm" onClick={() => void signals.refetch()}>
              Retry
            </Button>
          }
        />
      ) : null}

      {data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Posts"
              value={formatNumber(data.stats.posts)}
              hint={`Last ${data.windowHours} hours`}
              icon={Radio}
            />
            <StatCard
              label="Observations"
              value={formatNumber(data.stats.observations)}
              hint="Post × segment deliveries"
              icon={MessagesSquare}
            />
            <StatCard
              label="Clusters"
              value={formatNumber(data.stats.clusters)}
              hint="Across text, image, and audio"
              icon={Layers}
            />
            <StatCard
              label="Cross-segment"
              value={formatNumber(data.stats.crossings)}
              hint="Patterns seen by 2+ audiences"
              icon={Search}
              badge={
                data.stats.unvectorized > 0 ? (
                  <Badge variant="outline" title="Posts with no usable vector">
                    {formatNumber(data.stats.unvectorized)} unvectorized
                  </Badge>
                ) : undefined
              }
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle>Segment coverage</CardTitle>
                <CardDescription>Posts observed per viewer segment.</CardDescription>
              </CardHeader>
              <CardContent className="pb-4">
                <div className="max-h-[26rem] overflow-y-auto pr-1">
                  {data.coverage.map((row) => (
                    <CoverageCell key={row.segmentId} row={row} />
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4 lg:col-span-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-1">
                  <h2 className="text-sm font-medium text-foreground">Patterns</h2>
                  <p className="text-xs text-muted-foreground">
                    Ranked by audience crossings, then size. Similarity is per embedding space.
                  </p>
                </div>
                <div className="w-full space-y-1 sm:w-64">
                  <Label htmlFor="signal-search" className="sr-only">
                    Search collected posts
                  </Label>
                  <Input
                    id="signal-search"
                    placeholder="Search text or images…"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </div>
              </div>

              {debounced.trim().length >= 2 ? (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle>Ranked matches</CardTitle>
                    <CardDescription>
                      Fused across text and image spaces by rank, not raw cosine.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 pb-4">
                    {search.isFetching && !search.data ? (
                      <Skeleton className="h-16 w-full" />
                    ) : null}
                    {(search.data?.results ?? []).map((result) => (
                      <div key={result.uri} className="rounded-md border border-border p-2.5">
                        <p className="line-clamp-2 text-[0.8125rem] leading-5 text-foreground">
                          {result.text.trim() || "(no text)"}
                        </p>
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <a
                            href={result.permalink}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="underline-offset-2 hover:text-foreground hover:underline"
                          >
                            {result.authorHandle ?? "view post"}
                          </a>
                          <span>{result.kind}</span>
                          <span className="numeric tabular-nums">{result.score.toFixed(3)}</span>
                        </div>
                      </div>
                    ))}
                    {search.data?.results.length === 0 ? (
                      <p className="py-2 text-xs text-muted-foreground">
                        No collected post matches that query yet.
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              ) : null}

              {sorted.length === 0 ? (
                <EmptyState
                  icon={Layers}
                  title="No patterns yet"
                  description="Run a collection cycle to fetch posts from the viewer segments, then clusters appear as posts are embedded."
                  action={
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onCollect}
                      disabled={collect.isPending}
                    >
                      Collect now
                    </Button>
                  }
                />
              ) : (
                <div className={cn("grid gap-4", "md:grid-cols-2")}>
                  {sorted.map((cluster) => (
                    <ClusterCard key={cluster.id} cluster={cluster} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
