import { Bell, ExternalLink, Network, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { KindBadge, KindDot } from "@/components/trend-graph-ui";
import type { TermInsight } from "../../shared/types.ts";
import type { Connection, GraphNode, RelatedGraph } from "@/pages/trend-graph.data";
import { KIND_LABEL, connectionsFor } from "@/pages/trend-graph.data";

const number = new Intl.NumberFormat("en");

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
      {children}
    </h3>
  );
}

function ValueLabel({ node }: { node: GraphNode }) {
  if (node.value === null) return null;
  if (node.rising) {
    return <>Rising interest +{number.format(node.value)}%</>;
  }
  return <>Interest index {node.value}/100</>;
}

function ConnectionChip({ connection, onClick }: { connection: Connection; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-left text-[12px] text-primary underline-offset-2 hover:underline"
    >
      <KindDot kind={connection.node.kind} />
      <span className="max-w-56 truncate">{connection.node.label}</span>
    </button>
  );
}

function Overview({
  graph,
  insight,
  onSelect,
}: {
  graph: RelatedGraph;
  insight: TermInsight | undefined;
  onSelect: (id: string) => void;
}) {
  const rising = graph.nodes
    .filter((node) => node.kind === "rising")
    .toSorted((a, b) => (b.value ?? 0) - (a.value ?? 0))
    .slice(0, 4);
  const top = graph.nodes
    .filter((node) => node.kind === "top")
    .toSorted((a, b) => (b.value ?? 0) - (a.value ?? 0))
    .slice(0, 3);

  return (
    <div className="pt-4">
      <h2 className="text-[18px] font-semibold">Related demand</h2>
      <p className="mt-1.5 text-[12px] leading-5 text-muted-foreground">
        One monitored term, connected to the top and rising searches Google returns for it. Select a
        query to inspect its value or open it in Explore.
      </p>

      {graph.nodes.length === 0 ? (
        <div className="mt-4 rounded-[4px] border border-border bg-background px-3 py-3">
          <p className="text-[12px] font-medium">No term selected</p>
          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
            Add a search term to the watchlist, then choose it here to build its related-query
            neighborhood.
          </p>
        </div>
      ) : graph.nodes.length === 1 ? (
        <div className="mt-4 rounded-[4px] border border-border bg-background px-3 py-3">
          <p className="text-[12px] font-medium">No related queries returned</p>
          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
            Google did not return related searches for this term and country. Try another range or
            check Explore.
          </p>
        </div>
      ) : (
        <dl className="mt-4 grid grid-cols-3 gap-3 border-y border-border py-3">
          <div>
            <dt className="text-[10px] text-muted-foreground">Related</dt>
            <dd className="mt-0.5 text-base font-medium tabular-nums">{graph.nodes.length - 1}</dd>
          </div>
          <div>
            <dt className="text-[10px] text-muted-foreground">Rising</dt>
            <dd className="mt-0.5 text-base font-medium tabular-nums">
              {graph.nodes.filter((node) => node.kind === "rising").length}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] text-muted-foreground">Links</dt>
            <dd className="mt-0.5 text-base font-medium tabular-nums">{graph.links.length}</dd>
          </div>
        </dl>
      )}

      {rising.length > 0 ? (
        <section className="mt-5">
          <SectionHeading>Rising now</SectionHeading>
          <div className="mt-1 divide-y divide-border">
            {rising.map((node) => (
              <button
                key={node.id}
                onClick={() => onSelect(node.id)}
                className="group flex w-full items-center gap-2 py-2 text-left transition-colors hover:bg-accent hover:text-foreground"
              >
                <KindDot kind={node.kind} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-medium">{node.label}</span>
                  <span className="mt-0.5 block text-[10px] text-muted-foreground">
                    <ValueLabel node={node} />
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {top.length > 0 ? (
        <section className="mt-5 border-t border-border pt-3.5">
          <SectionHeading>Top queries</SectionHeading>
          <div className="mt-1 divide-y divide-border">
            {top.map((node) => (
              <button
                key={node.id}
                onClick={() => onSelect(node.id)}
                className="group flex w-full items-center gap-2 py-2 text-left transition-colors hover:bg-accent hover:text-foreground"
              >
                <KindDot kind={node.kind} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-medium">{node.label}</span>
                  <span className="mt-0.5 block text-[10px] text-muted-foreground">
                    <ValueLabel node={node} />
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-5 border-t border-border pt-3.5">
        <SectionHeading>How to read it</SectionHeading>
        <p className="mt-1.5 text-[12px] leading-5 text-muted-foreground">
          The filled center is the monitored term; hollow notes are Google related searches. A short
          arc between two queries means one label contains the other, not that their demand is
          similar.
        </p>
      </section>

      <p className="mt-6 text-[10px] leading-5 text-muted-foreground">
        {insight ? (
          <>
            Updated {new Date(graph.updatedAt).toLocaleString()} ·{" "}
            {graph.stale ? "cached live snapshot" : "live Google Trends"}
          </>
        ) : graph.nodes.length === 0 ? (
          "Add a monitored term to start a live graph."
        ) : (
          "Waiting for a live response"
        )}
      </p>
    </div>
  );
}

function TermDetail({
  node,
  connections,
  graph,
  insight,
  onSelect,
}: {
  node: GraphNode;
  connections: Connection[];
  graph: RelatedGraph;
  insight: TermInsight | undefined;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="pt-4">
      <KindBadge kind={node.kind} />
      <h2 className="mt-2.5 text-[20px] font-semibold leading-tight">{node.label}</h2>
      <p className="mt-1 text-[12px] leading-5 text-muted-foreground">{node.description}</p>

      <dl className="mt-4 grid grid-cols-2 gap-3 border-y border-border py-3">
        <div>
          <dt className="text-[10px] text-muted-foreground">Latest interest</dt>
          <dd className="mt-0.5 text-lg font-medium tabular-nums">
            {insight ? Math.round(insight.latest) : "—"}
            <span className="ml-1 text-[10px] font-normal text-muted-foreground">/100</span>
          </dd>
        </div>
        <div>
          <dt className="text-[10px] text-muted-foreground">Related queries</dt>
          <dd className="mt-0.5 text-lg font-medium tabular-nums">{graph.nodes.length - 1}</dd>
        </div>
      </dl>

      {insight ? (
        <p className="mt-3 text-[12px] leading-5 text-muted-foreground">
          Latest move{" "}
          <span
            className={
              insight.changePct > 0
                ? "text-success"
                : insight.changePct < 0
                  ? "text-destructive"
                  : "text-foreground"
            }
          >
            {insight.changePct > 0 ? "+" : ""}
            {insight.changePct.toFixed(1)}%
          </span>{" "}
          over one observation. Google's index is relative to this query set.
        </p>
      ) : null}

      {connections.length > 0 ? (
        <section className="mt-5 border-t border-border pt-3.5">
          <SectionHeading>Related searches</SectionHeading>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {connections.map((connection) => (
              <ConnectionChip
                key={connection.node.id}
                connection={connection}
                onClick={() => onSelect(connection.node.id)}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-5 border-t border-border pt-3.5">
        <SectionHeading>Continue in the workspace</SectionHeading>
        <div className="mt-2 flex flex-col gap-1.5">
          <Button asChild variant="outline" className="h-7 justify-start rounded-[4px] text-[12px]">
            <a href="#/overview">Open overview</a>
          </Button>
          <Button asChild variant="outline" className="h-7 justify-start rounded-[4px] text-[12px]">
            <a href={`#/explore?terms=${encodeURIComponent(node.label)}`}>
              Compare in Explore
              <ExternalLink aria-hidden="true" className="size-3" />
            </a>
          </Button>
        </div>
      </section>
    </div>
  );
}

function QueryDetail({
  node,
  connections,
  graph,
  onSelect,
  tracked,
  onTrack,
  tracking,
}: {
  node: GraphNode;
  connections: Connection[];
  graph: RelatedGraph;
  onSelect: (id: string) => void;
  tracked: boolean;
  onTrack: (term: string) => void;
  tracking: boolean;
}) {
  const parent = graph.nodes.find((candidate) => candidate.label === node.parentTerm);
  const others = connections.filter(
    (connection) => connection.node.id !== parent?.id && connection.relation === "contains",
  );

  return (
    <div className="pt-4">
      <KindBadge kind={node.kind} />
      <h2 className="mt-2.5 text-[20px] font-semibold leading-tight">{node.label}</h2>
      <p className="mt-1 text-[12px] leading-5 text-muted-foreground">{node.description}</p>

      <div className="mt-4 border-y border-border py-3">
        <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          {node.rising ? "Rising interest" : "Relative interest"}
        </p>
        <p className="mt-0.5 text-lg font-medium tabular-nums">
          {node.rising ? "+" : ""}
          {number.format(node.value ?? 0)}
          <span className="ml-1 text-[10px] font-normal text-muted-foreground">
            {node.rising ? "% growth" : "/100"}
          </span>
        </p>
        <p className="mt-1 text-[10px] leading-5 text-muted-foreground">
          {node.rising
            ? "Google's rising-query value is growth relative to the previous period, not search volume."
            : "Google's related-query score on a 0–100 scale within this result set."}
        </p>
      </div>

      <section className="mt-4">
        <SectionHeading>Connection</SectionHeading>
        <p className="mt-1.5 text-[12px] leading-5 text-muted-foreground">
          Related to the tracked term{" "}
          <button
            type="button"
            onClick={() => parent && onSelect(parent.id)}
            className="text-primary underline-offset-2 hover:underline"
          >
            {node.parentTerm}
          </button>
          .
        </p>
      </section>

      {others.length > 0 ? (
        <section className="mt-5 border-t border-border pt-3.5">
          <SectionHeading>Shared phrase</SectionHeading>
          <div className="mt-2 space-y-1.5">
            {others.map((connection) => (
              <ConnectionChip
                key={connection.node.id}
                connection={connection}
                onClick={() => onSelect(connection.node.id)}
              />
            ))}
          </div>
          <p className="mt-1.5 text-[10px] leading-5 text-muted-foreground">
            Links join labels where one phrase literally contains the other.
          </p>
        </section>
      ) : null}

      <section className="mt-5 border-t border-border pt-3.5">
        <SectionHeading>Search elsewhere</SectionHeading>
        <div className="mt-2 flex flex-col gap-1.5">
          <Button asChild variant="outline" className="h-7 justify-start rounded-[4px] text-[12px]">
            <a
              href={`https://trends.google.com/trends/explore?q=${encodeURIComponent(node.label)}&geo=${encodeURIComponent(graph.geo)}`}
              target="_blank"
              rel="noreferrer"
            >
              Open on Google Trends
              <ExternalLink aria-hidden="true" className="size-3" />
            </a>
          </Button>
          <Button asChild variant="outline" className="h-7 justify-start rounded-[4px] text-[12px]">
            <a href={`#/explore?terms=${encodeURIComponent(node.label)}`}>
              Compare in Explore
              <ExternalLink aria-hidden="true" className="size-3" />
            </a>
          </Button>
        </div>
      </section>

      <div className="mt-5 border-t border-border pt-3.5">
        <Button
          variant={tracked ? "outline" : "default"}
          className="h-7 w-full rounded-[4px] text-[12px]"
          disabled={tracked || tracking}
          onClick={() => onTrack(node.label)}
        >
          <Bell aria-hidden="true" className="size-3.5" />
          {tracked ? "Already monitored" : tracking ? "Adding…" : "Monitor this query"}
        </Button>
        <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
          Adds the query to your watchlist with a 15% alert threshold.
        </p>
      </div>
    </div>
  );
}

export function TrendGraphInspector({
  selected,
  graph,
  insight,
  onSelect,
  onClose,
  selectedTracked,
  onTrack,
  tracking,
}: {
  selected: GraphNode | undefined;
  graph: RelatedGraph;
  insight: TermInsight | undefined;
  onSelect: (id: string) => void;
  onClose: () => void;
  selectedTracked: boolean;
  onTrack: (term: string) => void;
  tracking: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [selected?.id]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-[38px] shrink-0 items-center justify-between gap-3 border-b border-border bg-muted px-3">
        <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-muted-foreground">
          {selected ? (
            <KindDot kind={selected.kind} />
          ) : (
            <Network className="size-3.5 text-muted-foreground/70" aria-hidden="true" />
          )}
          <span className="truncate">{selected ? KIND_LABEL[selected.kind] : "Network"}</span>
        </span>
        {selected && (
          <Button
            variant="ghost"
            size="icon-xs"
            className="size-6 rounded-[3px] text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Close inspector"
            title="Close inspector"
            onClick={onClose}
          >
            <X className="size-3" />
          </Button>
        )}
      </div>
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3.5 pb-5"
      >
        {!selected ? <Overview graph={graph} insight={insight} onSelect={onSelect} /> : null}
        {selected?.kind === "term" ? (
          <TermDetail
            node={selected}
            connections={connectionsFor(selected.id, graph)}
            graph={graph}
            insight={insight}
            onSelect={onSelect}
          />
        ) : null}
        {selected && selected.kind !== "term" ? (
          <QueryDetail
            node={selected}
            connections={connectionsFor(selected.id, graph)}
            graph={graph}
            onSelect={onSelect}
            tracked={selectedTracked}
            onTrack={onTrack}
            tracking={tracking}
          />
        ) : null}
      </div>
    </div>
  );
}
