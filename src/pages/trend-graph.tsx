import { ChevronRight, Info, ListTree, Moon, Search, Sun, Network, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { TrendGraphCanvas } from "@/components/trend-graph-canvas";
import { TrendGraphInspector } from "@/components/trend-graph-inspector";
import { KindDot } from "@/components/trend-graph-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useTheme } from "@/hooks/use-app";
import { cn } from "@/lib/utils";
import {
  GRAPH_LINKS,
  GRAPH_NODES,
  KIND_LABEL,
  NODE_BY_ID,
  PATTERNS,
  SOURCE_OPTIONS,
  connectionsFor,
  searchTextFor,
  type NodeKind,
  type Source,
} from "./trend-graph.data";

const KIND_ORDER: NodeKind[] = ["pattern", "concept", "sound", "community"];
const EMPTY_IDS = new Set<string>();

function matchesForSource(source: Source | "all") {
  if (source === "all") return new Set(GRAPH_NODES.map((node) => node.id));
  const patternIds = new Set(
    PATTERNS.filter((pattern) => pattern.sources.includes(source)).map((pattern) => pattern.id),
  );
  const ids = new Set<string>(patternIds);
  for (const link of GRAPH_LINKS) {
    if (link.relation !== "echoes" && patternIds.has(link.source)) ids.add(link.target);
  }
  return ids;
}

function GraphLegend() {
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-20 flex max-w-[calc(100%-10rem)] flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-border/70 bg-background/85 px-2.5 py-2 text-[10px] text-muted-foreground shadow-sm backdrop-blur-sm max-sm:hidden">
      {KIND_ORDER.map((kind) => (
        <span key={kind} className="inline-flex items-center gap-1.5">
          <KindDot kind={kind} />
          {KIND_LABEL[kind]}
        </span>
      ))}
    </div>
  );
}

function BrowseDialog({
  open,
  onOpenChange,
  selectedId,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Browse signals</DialogTitle>
          <DialogDescription>
            Move through the graph without using the canvas. Selecting a signal opens its evidence
            in the inspector.
          </DialogDescription>
        </DialogHeader>
        <div className="-mx-2 max-h-[55dvh] overflow-y-auto overscroll-contain px-2">
          {KIND_ORDER.map((kind) => {
            const nodes = GRAPH_NODES.filter((node) => node.kind === kind).toSorted((a, b) =>
              a.label.localeCompare(b.label),
            );
            if (!nodes.length) return null;
            return (
              <section key={kind} className="mt-5 first:mt-2">
                <h3 className="mb-1.5 flex items-center gap-2 px-2 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  <KindDot kind={kind} />
                  {KIND_LABEL[kind]}
                  <span className="ml-auto tabular-nums">{nodes.length}</span>
                </h3>
                <div className="space-y-0.5">
                  {nodes.map((node) => {
                    const active = node.id === selectedId;
                    const connections = connectionsFor(node.id).length;
                    return (
                      <button
                        key={node.id}
                        aria-label={`${node.label}, ${KIND_LABEL[kind]}`}
                        onClick={() => {
                          onSelect(node.id);
                          onOpenChange(false);
                        }}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-[12px] transition-colors hover:bg-muted",
                          active && "bg-muted",
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate">{node.label}</span>
                        <span className="text-[10px] tabular-nums text-muted-foreground">
                          {connections}
                        </span>
                        <ChevronRight className="size-3 text-muted-foreground" aria-hidden="true" />
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AboutDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>A map, not a feed</DialogTitle>
          <DialogDescription>
            A graph-shaped view of early cultural patterns, built to make relationships easier to
            see than a list of trending keywords.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-[13px] leading-6 text-muted-foreground">
          <p>
            Patterns connect to the concepts, sounds and communities they reuse. Nodes are
            positioned by a force simulation; drag them, scroll to zoom, or select one to read the
            evidence.
          </p>
          <p>
            Every pattern, creator, quote, source and score in this demo is fictional. No social
            account, live feed or prediction model is connected.
          </p>
          <div className="rounded-lg border border-border/70 bg-muted/40 px-3.5 py-3 text-[12px] leading-5">
            <p className="font-medium text-foreground">Why a graph?</p>
            <p className="mt-1">
              A shared sound or community can connect patterns that look unrelated by keyword. The
              graph is the working surface; the inspector is the evidence.
            </p>
          </div>
        </div>
        <DialogFooter className="sm:justify-between">
          <Button asChild variant="ghost">
            <a href="#/overview">Open classic workspace</a>
          </Button>
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TrendGraphPrototype() {
  const { theme, toggle } = useTheme();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<Source | "all">("all");
  const [browseOpen, setBrowseOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [tracked, setTracked] = useState(new Set<string>());
  const searchRef = useRef<HTMLInputElement>(null);
  const browseTriggerRef = useRef<HTMLButtonElement>(null);
  const infoTriggerRef = useRef<HTMLButtonElement>(null);

  const selected = selectedId ? NODE_BY_ID.get(selectedId) : undefined;
  const sourceIds = useMemo(() => matchesForSource(source), [source]);
  const normalizedQuery = query.trim().toLowerCase();
  const matches = useMemo(
    () =>
      normalizedQuery
        ? GRAPH_NODES.filter(
            (node) => sourceIds.has(node.id) && searchTextFor(node).includes(normalizedQuery),
          )
        : [],
    [normalizedQuery, sourceIds],
  );
  const emphasizedIds = useMemo(
    () => (selectedId ? EMPTY_IDS : new Set(matches.map((node) => node.id))),
    [matches, selectedId],
  );
  const filterActiveIds = useMemo(() => {
    if (!normalizedQuery) return sourceIds;
    const direct = new Set(matches.map((node) => node.id));
    const context = new Set(direct);
    for (const link of GRAPH_LINKS) {
      if (link.relation === "echoes") continue;
      if (!sourceIds.has(link.source) || !sourceIds.has(link.target)) continue;
      if (direct.has(link.source) || direct.has(link.target)) {
        context.add(link.source);
        context.add(link.target);
      }
    }
    return context;
  }, [matches, normalizedQuery, sourceIds]);
  const activeIds = useMemo(() => {
    if (!selected) return filterActiveIds;
    const ids = new Set([selected.id]);
    for (const connection of connectionsFor(selected.id)) {
      if (selected.kind === "pattern" && connection.node.kind === "pattern") continue;
      ids.add(connection.node.id);
    }
    return ids;
  }, [filterActiveIds, selected]);
  const activePatterns = useMemo(
    () => PATTERNS.filter((pattern) => sourceIds.has(pattern.id)).length,
    [sourceIds],
  );
  const showContextLabels = Boolean(selected || normalizedQuery || source !== "all");
  const summary = normalizedQuery
    ? `${matches.length} ${matches.length === 1 ? "match" : "matches"}`
    : selected
      ? `${connectionsFor(selected.id).length} connections`
      : source !== "all"
        ? `${activePatterns} patterns in focus`
        : `${GRAPH_NODES.length} signals · ${GRAPH_LINKS.length} connections`;
  const trackedSelected = selected ? tracked.has(selected.id) : false;

  useEffect(() => {
    document.title = "Signal graph — Trendifest";
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target;
      const editing =
        target instanceof HTMLElement &&
        Boolean(
          target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]'),
        );
      if (event.key === "/" && !editing) {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (event.key !== "Escape" || editing) return;
      if (selectedId) closeInspector();
      else if (query) setQuery("");
      else if (source !== "all") setSource("all");
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [query, selectedId, source]);

  function selectNode(id: string | null) {
    setSelectedId(id);
  }

  /** The inspector's close button unmounts; return focus to the stable browse control. */
  function closeInspector() {
    setSelectedId(null);
    window.requestAnimationFrame(() => browseTriggerRef.current?.focus());
  }

  function toggleTracked() {
    if (!selected) return;
    setTracked((current) => {
      const next = new Set(current);
      if (next.has(selected.id)) next.delete(selected.id);
      else next.add(selected.id);
      return next;
    });
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <h1 className="sr-only">Signal graph</h1>
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border/80 px-3 py-2.5 lg:h-14 lg:flex-nowrap lg:px-5 lg:py-0">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-foreground text-background">
            <Network className="size-4" aria-hidden="true" />
          </span>
          <span className="truncate text-[15px] font-semibold tracking-[-0.03em]">
            trendifest<span className="font-normal text-muted-foreground">.</span>
          </span>
          <span className="hidden h-4 w-px bg-border sm:block" aria-hidden="true" />
          <span className="hidden text-[12px] text-muted-foreground sm:block">Signal graph</span>
        </div>

        <div className="order-last flex w-full items-center gap-2 lg:order-none lg:ml-4 lg:w-auto lg:max-w-[420px] lg:flex-1">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              ref={searchRef}
              type="text"
              inputMode="search"
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                if (selectedId) setSelectedId(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.stopPropagation();
                  setQuery("");
                }
              }}
              aria-label="Search signals"
              placeholder="Search"
              className="h-8 border-transparent bg-muted/50 pl-8 pr-8 text-base md:text-[13px]"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-1 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
          <div className="w-[132px] shrink-0">
            <Select
              value={source}
              onChange={(event) => {
                setSource(event.target.value as Source | "all");
                if (selectedId) setSelectedId(null);
              }}
              aria-label="Filter by source"
              className="h-8 text-base md:text-[12px]"
            >
              <option value="all">All sources</option>
              {SOURCE_OPTIONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <Badge variant="outline" className="mr-1 hidden sm:inline-flex">
            Simulated
          </Badge>
          <Button
            ref={browseTriggerRef}
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2 text-muted-foreground"
            onClick={() => setBrowseOpen(true)}
            aria-label="Browse all signals"
            title="Browse all signals"
          >
            <ListTree />
            <span className="hidden lg:inline">Browse</span>
          </Button>
          <Button
            ref={infoTriggerRef}
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            onClick={() => setAboutOpen(true)}
            aria-label="About this graph"
            title="About this graph"
          >
            <Info />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            onClick={toggle}
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          >
            {theme === "dark" ? <Sun /> : <Moon />}
          </Button>
        </div>
      </header>

      <main className="grid min-h-0 flex-1 grid-rows-[minmax(0,1.1fr)_minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-1">
        <section
          aria-label="Interactive relationship graph"
          aria-describedby="graph-description"
          className="relative min-h-0 overflow-hidden border-b border-border/70 lg:border-b-0"
          style={{
            backgroundColor: "var(--background)",
            backgroundImage: "radial-gradient(circle, var(--border) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        >
          <p id="graph-description" className="sr-only">
            A force-directed network of {PATTERNS.length} patterns connected by concepts, sounds and
            communities. The canvas is visual. Use Browse all signals to move through every node
            with the keyboard.
          </p>
          <span className="pointer-events-none absolute left-4 top-3 z-20 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-chart-1" aria-hidden="true" />
            {summary}
          </span>

          <TrendGraphCanvas
            theme={theme}
            selectedId={selectedId}
            activeIds={activeIds}
            emphasisIds={emphasizedIds}
            showContextLabels={showContextLabels}
            onSelect={selectNode}
          />

          <GraphLegend />

          {normalizedQuery && matches.length === 0 && (
            <div className="absolute inset-0 z-20 grid place-items-center px-5">
              <div className="pointer-events-auto w-full max-w-xs rounded-xl border border-border bg-background/95 p-4 text-center shadow-lg backdrop-blur-sm">
                <p className="text-[13px] font-medium">No signals match “{query.trim()}”</p>
                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                  Try a broader concept, sound or community.
                </p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => setQuery("")}>
                  Clear search
                </Button>
              </div>
            </div>
          )}

          <p className="sr-only" role="status" aria-live="polite">
            {selected
              ? `${KIND_LABEL[selected.kind]} selected: ${selected.label}`
              : normalizedQuery
                ? `${matches.length} matching signals`
                : ""}
          </p>
        </section>

        <aside
          aria-label="Signal inspector"
          className="min-h-0 overflow-hidden bg-card lg:border-l lg:border-border/80"
        >
          <TrendGraphInspector
            selected={selected}
            onSelect={selectNode}
            onClose={closeInspector}
            tracked={trackedSelected}
            onToggleTracked={toggleTracked}
          />
        </aside>
      </main>

      <BrowseDialog
        open={browseOpen}
        onOpenChange={(open) => {
          setBrowseOpen(open);
          if (!open) window.requestAnimationFrame(() => browseTriggerRef.current?.focus());
        }}
        selectedId={selectedId}
        onSelect={selectNode}
      />
      <AboutDialog
        open={aboutOpen}
        onOpenChange={(open) => {
          setAboutOpen(open);
          if (!open) window.requestAnimationFrame(() => infoTriggerRef.current?.focus());
        }}
      />
    </div>
  );
}
