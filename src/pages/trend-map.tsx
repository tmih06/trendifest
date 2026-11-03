import { ArrowUpRight, Info, RefreshCw, TrendingUp, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { TrendMap, TrendMapNode } from "../../shared/types.ts";
import { DbNotice } from "@/components/db-notice";
import { TrendGraphCanvas } from "@/components/trend-graph-canvas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTheme } from "@/hooks/use-app";
import { useTrendMap } from "@/hooks/use-trends";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { GraphLink, GraphNode, NodeKind } from "@/pages/trend-graph.data";

/**
 * The trend map: one picture of what the collector actually saw.
 *
 * Nodes are viewer segments and pattern clusters. Node size follows the
 * emergence score, so the largest circle answers "what might become a trend?".
 * Every edge is a collected observation, never an inferred similarity: the
 * "these two patterns are alike" claim lives in the Signals cluster view, not
 * here.
 */

const WINDOWS = [
  { hours: 24, label: "24h" },
  { hours: 72, label: "3d" },
  { hours: 168, label: "7d" },
] as const;

/**
 * Graph labels are capped: a 470px sentence centered on a circle covers every
 * hub name around it. The inspector and ranked list carry the full text, so the
 * canvas only needs enough to identify the node.
 */
function graphLabel(label: string) {
  const clean = label.replace(/\s+/g, " ").trim();
  return clean.length <= 46 ? clean : `${clean.slice(0, 45).trimEnd()}…`;
}

function toCanvas(map: TrendMap) {
  const nodes: GraphNode[] = map.nodes.map((node) => ({
    id: node.id,
    kind: (node.kind === "pattern"
      ? "pattern"
      : node.kind === "pool"
        ? "pool"
        : "segment") as NodeKind,
    label: node.kind === "pattern" ? graphLabel(node.label) : node.label,
    description: node.description,
    radius: node.radius * 0.6,
    degree: map.edges.filter((edge) => edge.source === node.id || edge.target === node.id).length,
    hub: node.kind !== "pattern",
    value: node.potential,
    rising: (node.potential ?? 0) >= 40,
    parentTerm: "trend map",
    latest: null,
    changePct: null,
    x: node.x,
    y: node.y,
  }));

  const links: GraphLink[] = map.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    relation: "observed-in",
  }));

  return { nodes, links };
}

function PotentialBadge({ node }: { node: TrendMapNode }) {
  if (node.potential === null) return null;
  const variant = node.potential >= 60 ? "success" : node.potential >= 35 ? "warning" : "outline";
  return (
    <Badge variant={variant} className="tabular-nums">
      {node.potential}/100
    </Badge>
  );
}

/** One row of the ranked list; doubles as the keyboard path into the map. */
function RankedRow({
  node,
  rank,
  selected,
  onSelect,
}: {
  node: TrendMapNode;
  rank: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const score = node.score;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "w-full rounded-md border border-border p-2.5 text-left transition-colors hover:bg-accent",
        selected && "border-primary/40 bg-accent",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-[0.8125rem] leading-5 text-foreground">
          <span className="mr-1.5 text-muted-foreground tabular-nums">{rank}.</span>
          {node.label}
        </p>
        <PotentialBadge node={node} />
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Users aria-hidden="true" className="size-3" />
          {node.authors} author{node.authors === 1 ? "" : "s"}
        </span>
        <span>{node.posts} posts</span>
        {node.segments.length > 0 ? (
          <span>{node.segments.join(", ")}</span>
        ) : (
          <span>discovery pool only</span>
        )}
        {score && score.velocity > 0.6 ? (
          <span className="inline-flex items-center gap-1 text-success">
            <TrendingUp aria-hidden="true" className="size-3" />
            accelerating
          </span>
        ) : null}
      </div>
    </button>
  );
}

/** Selected-node detail: the score broken into its parts, with no hidden math. */
function NodeDetail({ node }: { node: TrendMapNode }) {
  const score = node.score;
  if (!score) {
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">{node.label}</p>
        <p className="text-[0.8125rem] leading-5 text-muted-foreground">{node.description}</p>
        <p className="text-xs text-muted-foreground">
          {node.posts} posts observed in this window. Segments are anchors, so they carry no score.
        </p>
      </div>
    );
  }

  const parts = [
    { label: "Reach", value: score.reach, hint: "distinct authors, log-scaled" },
    { label: "Velocity", value: score.velocity, hint: "recent authors vs the prior window" },
    { label: "Spread", value: score.spread, hint: "distinct audience segments" },
    { label: "Persistence", value: score.persistence, hint: "how long it keeps producing" },
    { label: "Diversity", value: score.diversity, hint: "authors per post" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[0.9375rem] font-medium leading-5 text-foreground">{node.label}</p>
        <PotentialBadge node={node} />
      </div>

      <dl className="grid grid-cols-2 gap-2">
        <div>
          <dt className="text-xs text-muted-foreground">Authors</dt>
          <dd className="numeric text-sm tabular-nums text-foreground">{score.authors}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Posts</dt>
          <dd className="numeric text-sm tabular-nums text-foreground">{score.posts}</dd>
        </div>
      </dl>

      <div className="space-y-1.5">
        {parts.map((part) => (
          <div key={part.label} className="space-y-0.5">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="text-muted-foreground" title={part.hint}>
                {part.label}
              </span>
              <span className="numeric tabular-nums text-foreground">
                {(part.value * 100).toFixed(0)}
              </span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.round(part.value * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <p className="rounded-md border border-border bg-muted/40 p-2 text-xs leading-5 text-muted-foreground">
        Evidence confidence ×{score.confidence.toFixed(2)}. A pattern needs at least five
        independent authors to keep its full score; below that the score is reduced rather than
        inflated by a small sample.
      </p>
    </div>
  );
}

export function TrendMapPage() {
  const { theme } = useTheme();
  const [hours, setHours] = useState<number>(72);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const map = useTrendMap(hours);

  const data = map.data;
  const canvas = useMemo(() => (data ? toCanvas(data) : { nodes: [], links: [] }), [data]);
  const selected = data?.nodes.find((node) => node.id === selectedId) ?? null;

  // Selection highlights, never dims: fading the rest of the map to 16% would
  // make a 64/100 circle and a 14/100 circle look equally faint.
  const activeIds = useMemo(() => new Set(canvas.nodes.map((node) => node.id)), [canvas.nodes]);

  useEffect(() => {
    // A window change invalidates every node id in the selection.
    setSelectedId(null);
  }, [hours]);

  const loading = map.isLoading && !data;
  const unconfigured =
    map.isError &&
    map.error instanceof Error &&
    "code" in map.error &&
    map.error.code === "database_unconfigured";

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <header className="flex h-[38px] shrink-0 items-center gap-2 border-b border-border bg-muted px-2.5 text-[12px]">
        <a href="#/graph" className="font-medium text-foreground hover:underline">
          trendifest
        </a>
        <span className="text-muted-foreground/60" aria-hidden="true">
          /
        </span>
        <span className="text-muted-foreground">Trend map</span>
        <div className="ml-auto flex items-center gap-1">
          <div className="flex items-center rounded-[4px] border border-border">
            {WINDOWS.map((window) => (
              <button
                key={window.hours}
                type="button"
                onClick={() => setHours(window.hours)}
                aria-pressed={hours === window.hours}
                className={cn(
                  "h-6 px-2 text-[11px] tabular-nums text-muted-foreground transition-colors hover:text-foreground",
                  hours === window.hours && "bg-accent text-foreground",
                )}
              >
                {window.label}
              </button>
            ))}
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="How the score works"
            title="How the score works"
            className="size-6 rounded-[3px] [&_svg]:size-3.5"
            onClick={() => setAboutOpen(true)}
          >
            <Info />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Refresh the map"
            title="Refresh the map"
            className="size-6 rounded-[3px] [&_svg]:size-3.5"
            onClick={() => void map.refetch()}
          >
            <RefreshCw />
          </Button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_320px]">
        <section
          aria-label="Trend map"
          aria-describedby="map-description"
          className="relative min-h-0 flex-1 overflow-hidden"
        >
          <p id="map-description" className="sr-only">
            A graph of viewer segments and collected patterns. Larger pattern nodes have higher
            emergence scores. The ranked list is the keyboard and screen-reader path.
          </p>

          {canvas.nodes.length > 0 ? (
            <TrendGraphCanvas
              theme={theme}
              nodes={canvas.nodes}
              links={canvas.links}
              selectedId={selectedId}
              activeIds={activeIds}
              emphasisIds={new Set()}
              // Labels on hover and selection only. With every label forced on,
              // a 120-node map becomes a wall of overlapping text.
              showContextLabels={false}
              labelHubsAlways
              // The map encodes score as size, so selecting a pattern must not
              // zoom into it: that would hide the comparison being demonstrated.
              autoFitSelection={false}
              onSelect={setSelectedId}
            />
          ) : null}

          {loading ? (
            <div className="absolute inset-0 grid place-items-center">
              <p className="text-sm text-muted-foreground">Building the map…</p>
            </div>
          ) : null}

          {unconfigured ? (
            <div className="absolute inset-0 grid place-items-center px-6">
              <DbNotice />
            </div>
          ) : null}

          {!loading && !unconfigured && data && data.nodes.length === 0 ? (
            <div className="absolute inset-0 grid place-items-center px-6">
              <div className="max-w-sm space-y-2 text-center">
                <p className="text-sm font-medium text-foreground">Nothing collected yet</p>
                <p className="text-[0.8125rem] leading-5 text-muted-foreground">
                  Run a collection cycle on the Signals page; patterns appear here as posts are
                  embedded and grouped.
                </p>
                <Button variant="outline" size="sm" onClick={() => void map.refetch()}>
                  Refresh
                </Button>
              </div>
            </div>
          ) : null}

          {data ? (
            <div className="pointer-events-none absolute bottom-2 left-2.5 z-20 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <span className="pointer-events-auto rounded-[3px] bg-background/80 px-1">
                {data.nodes.filter((node) => node.kind === "pattern").length} patterns
              </span>
              <span className="pointer-events-auto rounded-[3px] bg-background/80 px-1">
                {data.coverage.reduce((sum, row) => sum + row.posts, 0)} posts
              </span>
              <span className="pointer-events-auto rounded-[3px] bg-background/80 px-1">
                larger node = higher potential
              </span>
            </div>
          ) : null}
        </section>

        <aside
          aria-label="Ranked patterns"
          className="flex min-h-0 flex-col border-t border-border bg-muted lg:border-l lg:border-t-0"
        >
          <div className="shrink-0 space-y-1 border-b border-border px-3 py-2">
            <h2 className="text-[13px] font-medium text-foreground">Largest potential</h2>
            <p className="text-[11px] leading-4 text-muted-foreground">
              Ranked by emergence score over the last {data?.hours ?? hours} hours.
            </p>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
            {selected ? (
              <div className="rounded-md border border-border bg-background p-2.5">
                <NodeDetail node={selected} />
                {selected.kind === "pattern" ? (
                  <a
                    href="#/signals"
                    className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    Inspect source posts
                    <ArrowUpRight aria-hidden="true" className="size-3" />
                  </a>
                ) : null}
              </div>
            ) : null}

            {(data?.top ?? []).map((node, index) => (
              <RankedRow
                key={node.id}
                node={node}
                rank={index + 1}
                selected={node.id === selectedId}
                onSelect={() => setSelectedId(node.id === selectedId ? null : node.id)}
              />
            ))}

            {!loading && data && data.top.length === 0 ? (
              <p className="px-2 py-4 text-xs leading-5 text-muted-foreground">
                No pattern has more than one author yet. A single account posting repeatedly is not
                counted as a trend.
              </p>
            ) : null}
          </div>

          {data ? (
            <p className="shrink-0 border-t border-border px-3 py-2 text-[11px] leading-4 text-muted-foreground">
              Updated {formatRelative(data.generatedAt)}.{" "}
              {data.method.velocityComparable
                ? "Velocity compares two 6-hour windows."
                : "Velocity is neutral until 12 hours of history exist."}
            </p>
          ) : null}
        </aside>
      </div>

      <Dialog open={aboutOpen} onOpenChange={setAboutOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>How the score is computed</DialogTitle>
            <DialogDescription>
              A transparent heuristic over collected evidence. It is not a probability and it is not
              calibrated.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-[0.8125rem] leading-5 text-muted-foreground">
            <p>
              Five components, each normalized to 0–1 and weighted: reach (distinct authors,
              log-scaled) 34%, velocity (recent versus prior authors) 26%, audience spread 18%,
              persistence 12%, and author diversity 10%.
            </p>
            <p>
              The weighted sum is then scaled by evidence volume: a pattern with one author keeps
              30% of its score, five or more keep all of it. This is why a two-post cluster reads
              low here even when its cosine similarity is high.
            </p>
            <p>
              Distinct authors, not post count, drive reach and velocity. The first cluster measured
              had 64 posts from a single account — a counter bot — and any ranking that put it first
              would be wrong.
            </p>
            <p>
              Circle area is the score, so a circle twice the radius is roughly four times the
              score. Segments are fixed anchors: they carry no score because they are the frame, not
              the finding.
            </p>
            {data && !data.method.velocityComparable ? (
              <p className="rounded-md border border-warning/30 bg-warning/5 p-2 text-foreground">
                Velocity is currently neutral: the collector has less than 12 hours of history, so a
                prior window does not exist yet. Acceleration will become measurable as history
                accumulates.
              </p>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
