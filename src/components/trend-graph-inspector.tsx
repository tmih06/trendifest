import { AlertCircle, Bell, BellOff, ChevronRight, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { KindDot, KindLabel, StageBadge } from "@/components/trend-graph-ui";
import {
  GRAPH_LINKS,
  GRAPH_NODES,
  KIND_LABEL,
  PATTERNS,
  STAGE_LABEL,
  connectionsFor,
  type Connection,
  type GraphNode,
  type NodeKind,
  type Pattern,
} from "@/pages/trend-graph.data";

const number = new Intl.NumberFormat("en");

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
      {children}
    </h3>
  );
}

function PatternRow({ pattern, onClick }: { pattern: Pattern; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group flex w-full items-center gap-3 py-3 text-left transition-colors hover:text-foreground"
    >
      <KindDot kind="pattern" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{pattern.name}</span>
        <span className="mt-0.5 block text-[11px] text-muted-foreground">
          {STAGE_LABEL[pattern.stage]} · {pattern.score}/100
        </span>
      </span>
      <ChevronRight className="size-3.5 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5" />
    </button>
  );
}

function ConnectionChip({ connection, onClick }: { connection: Connection; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex min-h-7 items-center gap-1.5 rounded-md border border-border/80 bg-background px-2 py-1 text-[11px] text-foreground transition-colors hover:bg-muted"
    >
      <KindDot kind={connection.node.kind} />
      <span className="max-w-44 truncate">{connection.node.label}</span>
    </button>
  );
}

function Overview({ onSelect }: { onSelect: (id: string) => void }) {
  const startingPatterns = [...PATTERNS].sort((a, b) => b.score - a.score).slice(0, 3);
  return (
    <div className="pt-5">
      <h2 className="text-xl font-semibold tracking-[-0.025em]">Signal network</h2>
      <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
        A map of early patterns and the concepts, sounds and communities that connect them. Select a
        node to inspect the evidence.
      </p>

      <dl className="mt-6 grid grid-cols-3 gap-3 border-y border-border/70 py-4">
        <div>
          <dt className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Patterns</dt>
          <dd className="mt-1 text-lg font-medium tabular-nums">{PATTERNS.length}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Signals</dt>
          <dd className="mt-1 text-lg font-medium tabular-nums">{GRAPH_NODES.length}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Links</dt>
          <dd className="mt-1 text-lg font-medium tabular-nums">{GRAPH_LINKS.length}</dd>
        </div>
      </dl>

      <section className="mt-6">
        <SectionHeading>Start with a pattern</SectionHeading>
        <div className="mt-1 divide-y divide-border/70">
          {startingPatterns.map((pattern) => (
            <PatternRow key={pattern.id} pattern={pattern} onClick={() => onSelect(pattern.id)} />
          ))}
        </div>
      </section>

      <section className="mt-6 border-t border-border/70 pt-5">
        <SectionHeading>How to read it</SectionHeading>
        <p className="mt-2 text-[12px] leading-5 text-muted-foreground">
          Patterns are the large blue hubs. Concepts are grey, sounds are violet and communities are
          teal; shared signals grow larger. Curved links connect families with a direct resemblance.
          Drag to rearrange, scroll to zoom, and select any node for its evidence.
        </p>
      </section>

      <p className="mt-8 text-[11px] leading-5 text-muted-foreground">
        Simulated dataset · no social accounts or model connected
      </p>
    </div>
  );
}

function PatternDetail({
  node,
  connections,
  onSelect,
  tracked,
  onToggleTracked,
}: {
  node: GraphNode;
  connections: Connection[];
  onSelect: (id: string) => void;
  tracked: boolean;
  onToggleTracked: () => void;
}) {
  const pattern = node.pattern;
  if (!pattern) return null;
  const grouped = (["concept", "sound", "community", "pattern"] as const)
    .map((kind: NodeKind) => ({
      kind,
      items: connections.filter((connection) => connection.node.kind === kind),
    }))
    .filter((group) => group.items.length > 0);
  const groupLabel: Record<NodeKind, string> = {
    pattern: "Related patterns",
    concept: "Concepts",
    sound: "Sound",
    community: "Communities",
  };

  return (
    <div className="pt-5">
      <div className="flex flex-wrap items-center gap-2">
        <StageBadge stage={pattern.stage} />
        <span className="text-[11px] text-muted-foreground">Pattern family</span>
      </div>
      <h2 className="mt-3 text-[22px] font-semibold leading-tight tracking-[-0.035em]">
        {pattern.name}
      </h2>
      <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">{pattern.subtitle}</p>

      <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] tabular-nums text-muted-foreground">
        <span>{number.format(pattern.creators)} creators</span>
        <span aria-hidden="true">·</span>
        <span>↑ {pattern.growth}%</span>
        <span aria-hidden="true">·</span>
        <span>first seen {pattern.age} ago</span>
      </p>

      <div className="mt-5">
        <div className="flex items-end justify-between gap-3">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Emergence
          </span>
          <span className="text-xl font-medium tabular-nums">
            {pattern.score}
            <span className="text-[11px] font-normal text-muted-foreground">/100</span>
          </span>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-chart-1" style={{ width: `${pattern.score}%` }} />
        </div>
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          Illustrative ranking, not a breakout probability.
        </p>
      </div>

      <p className="mt-5 text-[13px] leading-6">{pattern.summary}</p>

      <section className="mt-6 border-t border-border/70 pt-5">
        <SectionHeading>Connections</SectionHeading>
        <div className="mt-2.5 space-y-3">
          {grouped.map((group) => (
            <div key={group.kind}>
              <p className="mb-1.5 text-[10px] text-muted-foreground">{groupLabel[group.kind]}</p>
              <div className="flex flex-wrap gap-1.5">
                {group.items.map((connection) => (
                  <ConnectionChip
                    key={connection.node.id}
                    connection={connection}
                    onClick={() => onSelect(connection.node.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 border-t border-border/70 pt-5">
        <SectionHeading>Anatomy</SectionHeading>
        <dl className="mt-2.5 space-y-2.5">
          <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-3">
            <dt className="text-[11px] text-muted-foreground">Format</dt>
            <dd className="text-[12px] leading-5">{pattern.format}</dd>
          </div>
          <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-3">
            <dt className="text-[11px] text-muted-foreground">Sources</dt>
            <dd className="text-[12px] leading-5">
              {pattern.sources.join(", ")}
              <span className="ml-1.5 text-[10px] text-muted-foreground">simulated</span>
            </dd>
          </div>
        </dl>
      </section>

      <section className="mt-6 border-t border-border/70 pt-5">
        <SectionHeading>What to watch</SectionHeading>
        <p className="mt-2 text-[13px] leading-6">{pattern.outlook}</p>
        <p className="mt-3 flex gap-2 text-[11px] leading-5 text-muted-foreground">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {pattern.caution}
        </p>
      </section>

      <section className="mt-6 border-t border-border/70 pt-5">
        <SectionHeading>Sample evidence</SectionHeading>
        <div className="mt-3 space-y-3">
          {pattern.evidence.map((item) => (
            <blockquote
              key={item.quote}
              className="border-l-2 border-border pl-3 text-[12px] leading-5"
            >
              “{item.quote}”
              <footer className="mt-1 text-[10px] text-muted-foreground">
                {item.source} · simulated
              </footer>
            </blockquote>
          ))}
        </div>
      </section>

      <div className="mt-6 border-t border-border/70 pt-5">
        <Button
          variant={tracked ? "outline" : "default"}
          className="w-full"
          aria-pressed={tracked}
          onClick={onToggleTracked}
        >
          {tracked ? <BellOff /> : <Bell />}
          {tracked ? "Stop tracking" : "Track pattern"}
        </Button>
        <p className="mt-2 text-center text-[10px] text-muted-foreground">
          {tracked ? "Tracked for this demo session." : "Local demo only. Nothing is scheduled."}
        </p>
      </div>
    </div>
  );
}

function SignalDetail({
  node,
  connections,
  onSelect,
}: {
  node: GraphNode;
  connections: Connection[];
  onSelect: (id: string) => void;
}) {
  const patterns = connections
    .filter((connection) => connection.node.kind === "pattern")
    .map((connection) => connection.node.pattern)
    .filter((pattern): pattern is Pattern => Boolean(pattern));

  return (
    <div className="pt-5">
      <h2 className="text-[22px] font-semibold leading-tight tracking-[-0.035em]">{node.label}</h2>
      <p className="mt-2 text-[13px] leading-6 text-muted-foreground">{node.description}</p>

      <section className="mt-6 border-t border-border/70 pt-5">
        <SectionHeading>
          Appears in {patterns.length === 1 ? "one pattern" : `${patterns.length} patterns`}
        </SectionHeading>
        <div className="mt-1 divide-y divide-border/70">
          {patterns.map((pattern) => (
            <PatternRow key={pattern.id} pattern={pattern} onClick={() => onSelect(pattern.id)} />
          ))}
        </div>
      </section>

      <section className="mt-6 border-t border-border/70 pt-5">
        <SectionHeading>Why this link exists</SectionHeading>
        <p className="mt-2 text-[12px] leading-5 text-muted-foreground">
          This {KIND_LABEL[node.kind].toLowerCase()} is a shared signal, not a keyword match. It
          appears because the connected patterns reuse the same idea, sound or audience behaviour in
          their own examples.
        </p>
      </section>

      <p className="mt-8 text-[11px] leading-5 text-muted-foreground">
        Simulated dataset · no social accounts or model connected
      </p>
    </div>
  );
}

export function TrendGraphInspector({
  selected,
  onSelect,
  onClose,
  tracked,
  onToggleTracked,
}: {
  selected: GraphNode | undefined;
  onSelect: (id: string) => void;
  onClose: () => void;
  tracked: boolean;
  onToggleTracked: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [selected?.id]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border/70 px-5">
        {selected ? (
          <KindLabel kind={selected.kind} />
        ) : (
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Network
          </span>
        )}
        {selected && (
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground"
            aria-label="Close inspector"
            title="Close inspector"
            onClick={onClose}
          >
            <X />
          </Button>
        )}
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6">
        {!selected && <Overview onSelect={onSelect} />}
        {selected?.kind === "pattern" && (
          <PatternDetail
            node={selected}
            connections={connectionsFor(selected.id)}
            onSelect={onSelect}
            tracked={tracked}
            onToggleTracked={onToggleTracked}
          />
        )}
        {selected && selected.kind !== "pattern" && (
          <SignalDetail
            node={selected}
            connections={connectionsFor(selected.id)}
            onSelect={onSelect}
          />
        )}
      </div>
    </div>
  );
}
