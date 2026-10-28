import {
  Bell,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Compass,
  Database,
  Info,
  LayoutDashboard,
  ListTree,
  Moon,
  Network,
  Plus,
  Radar,
  Search,
  Sun,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { TrendGraphCanvas } from "@/components/trend-graph-canvas";
import { TrendGraphInspector } from "@/components/trend-graph-inspector";
import { KindDot } from "@/components/trend-graph-ui";
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
const KIND_GROUP_LABEL: Record<NodeKind, string> = {
  pattern: "Patterns",
  concept: "Concepts",
  sound: "Sounds",
  community: "Communities",
};
const EMPTY_IDS = new Set<string>();

const RIBBON = [
  { href: "#/prototype/trend-graph", label: "Signal graph", icon: Network, active: true },
  { href: "#/overview", label: "Overview", icon: LayoutDashboard, active: false },
  { href: "#/explore", label: "Explore", icon: Compass, active: false },
  { href: "#/watchlist", label: "Watchlist", icon: Radar, active: false },
  { href: "#/alerts", label: "Alerts", icon: Bell, active: false },
] as const;

function RailButton({
  label,
  onClick,
  children,
  active,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "grid size-8 place-items-center rounded-[4px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        active && "bg-accent text-primary",
      )}
    >
      {children}
    </button>
  );
}

function GraphRibbon({
  theme,
  onToggleTheme,
  onBrowse,
  onAbout,
}: {
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onBrowse: () => void;
  onAbout: () => void;
}) {
  return (
    <nav
      aria-label="Ribbon"
      className="hidden w-11 shrink-0 flex-col items-center border-r border-border bg-muted py-2 lg:flex"
    >
      <div className="flex flex-col items-center gap-1">
        {RIBBON.map((item) => {
          const Icon = item.icon;
          return (
            <a
              key={item.href}
              href={item.href}
              aria-label={item.label}
              aria-current={item.active ? "page" : undefined}
              title={item.label}
              className={cn(
                "grid size-8 place-items-center rounded-[4px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                item.active && "bg-accent text-primary",
              )}
            >
              <Icon className="size-[18px]" strokeWidth={1.75} />
            </a>
          );
        })}
        <RailButton label="Browse signals" onClick={onBrowse}>
          <ListTree className="size-[18px]" strokeWidth={1.75} />
        </RailButton>
      </div>
      <div className="mt-auto flex flex-col items-center gap-1">
        <RailButton label="About this graph" onClick={onAbout}>
          <Info className="size-[18px]" strokeWidth={1.75} />
        </RailButton>
        <RailButton
          label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          onClick={onToggleTheme}
        >
          {theme === "dark" ? (
            <Sun className="size-[18px]" strokeWidth={1.75} />
          ) : (
            <Moon className="size-[18px]" strokeWidth={1.75} />
          )}
        </RailButton>
      </div>
    </nav>
  );
}

function ExplorerGroup({
  title,
  nodes,
  defaultOpen,
  selectedId,
  onSelect,
}: {
  title: string;
  nodes: (typeof GRAPH_NODES)[number][];
  defaultOpen: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="group/explorer"
    >
      <summary className="flex h-6 cursor-pointer list-none items-center gap-1 rounded-[3px] px-1 text-[12px] font-medium text-muted-foreground hover:bg-accent [&::-webkit-details-marker]:hidden">
        <ChevronRight
          className="size-3 text-muted-foreground/70 transition-transform group-open/explorer:rotate-90"
          strokeWidth={2}
        />
        <span className="truncate">{title}</span>
        <span className="ml-auto text-[10px] tabular-nums text-muted-foreground/70">
          {nodes.length}
        </span>
      </summary>
      <div className="ml-[5px] border-l border-border pl-1">
        {nodes.map((node) => {
          const selected = node.id === selectedId;
          return (
            <button
              key={node.id}
              type="button"
              onClick={() => onSelect(node.id)}
              className={cn(
                "flex h-6 w-full items-center gap-1.5 rounded-[3px] px-1.5 text-left text-[12px] transition-colors",
                selected
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <KindDot kind={node.kind} className="size-1.5" />
              <span className="truncate">{node.label}</span>
            </button>
          );
        })}
      </div>
    </details>
  );
}

function GraphFilters({
  searchRef,
  query,
  onQuery,
  source,
  onSource,
}: {
  searchRef: RefObject<HTMLInputElement | null>;
  query: string;
  onQuery: (value: string) => void;
  source: Source | "all";
  onSource: (value: Source | "all") => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/70"
          aria-hidden="true"
        />
        <Input
          ref={searchRef}
          type="text"
          inputMode="search"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              onQuery("");
            }
          }}
          aria-label="Search signals"
          placeholder="Search signals"
          className="h-7 rounded-[4px] border-border bg-background pl-7 pr-7 text-[12px] text-foreground placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-0"
        />
        {query ? (
          <button
            type="button"
            onClick={() => onQuery("")}
            aria-label="Clear search"
            className="absolute right-1 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-[3px] text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-3" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <Select
        value={source}
        onChange={(event) => onSource(event.target.value as Source | "all")}
        aria-label="Filter by source"
        className="h-7 rounded-[4px] border-border bg-background text-[12px] text-muted-foreground focus-visible:border-ring focus-visible:ring-0"
      >
        <option value="all">All sources</option>
        {SOURCE_OPTIONS.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </Select>
    </div>
  );
}

function GraphSidebar({
  selectedId,
  onSelect,
  onBrowse,
  onAbout,
  searchRef,
  query,
  onQuery,
  source,
  onSource,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onBrowse: () => void;
  onAbout: () => void;
  searchRef: RefObject<HTMLInputElement | null>;
  query: string;
  onQuery: (value: string) => void;
  source: Source | "all";
  onSource: (value: Source | "all") => void;
}) {
  return (
    <aside
      aria-label="Signal explorer"
      className="hidden w-60 shrink-0 flex-col border-r border-border bg-muted lg:flex"
    >
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-2">
        <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          <ChevronDown className="size-3" strokeWidth={2} />
          Explorer
        </span>
        <button
          type="button"
          onClick={onBrowse}
          aria-label="Browse all signals"
          title="Browse all signals"
          className="grid size-6 place-items-center rounded-[3px] text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ListTree className="size-3.5" strokeWidth={1.75} />
        </button>
      </div>

      <div className="shrink-0 border-b border-border px-2 py-2">
        <GraphFilters
          searchRef={searchRef}
          query={query}
          onQuery={onQuery}
          source={source}
          onSource={onSource}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
        <div className="space-y-0.5">
          {KIND_ORDER.map((kind) => (
            <ExplorerGroup
              key={kind}
              title={KIND_GROUP_LABEL[kind]}
              nodes={GRAPH_NODES.filter((node) => node.kind === kind)}
              defaultOpen={kind === "pattern"}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={onBrowse}
          className="mt-2 flex h-6 w-full items-center gap-1.5 rounded-[3px] px-1.5 text-left text-[12px] text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ListTree className="size-3.5" strokeWidth={1.75} />
          Browse all signals
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-border px-2 py-2 text-[11px] text-muted-foreground">
        <Database className="size-3.5 text-muted-foreground/70" strokeWidth={1.75} />
        <span className="min-w-0 flex-1 truncate">Simulated vault</span>
        <button
          type="button"
          onClick={onAbout}
          aria-label="About this graph"
          title="About this graph"
          className="grid size-6 place-items-center rounded-[3px] text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Info className="size-3.5" strokeWidth={1.75} />
        </button>
      </div>
    </aside>
  );
}

function GraphTitleBar({
  theme,
  onToggleTheme,
  onBrowse,
  onAbout,
  browseTriggerRef,
  infoTriggerRef,
}: {
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onBrowse: () => void;
  onAbout: () => void;
  browseTriggerRef: RefObject<HTMLButtonElement | null>;
  infoTriggerRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <header className="flex h-[38px] shrink-0 items-stretch border-b border-border bg-muted text-foreground">
      <div className="flex w-11 shrink-0 items-center justify-center border-r border-border">
        <span className="grid size-5 place-items-center rounded-[3px] bg-primary text-background">
          <Network className="size-3.5" strokeWidth={2.4} aria-hidden="true" />
        </span>
      </div>
      <div className="hidden w-60 shrink-0 items-center gap-1 border-r border-border px-2.5 text-[12px] lg:flex">
        <span className="truncate font-medium">trendifest</span>
        <ChevronsUpDown className="size-3 text-muted-foreground/70" strokeWidth={1.75} />
      </div>
      <div className="flex min-w-0 flex-1 items-end gap-0.5 overflow-x-auto px-2">
        <div className="flex h-[30px] shrink-0 items-center gap-1.5 rounded-t-[6px] bg-background px-2.5 text-[12px] text-foreground">
          <Network
            className="size-3.5 text-muted-foreground"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <span className="whitespace-nowrap">Signal graph</span>
          <a
            href="#/overview"
            aria-label="Close Signal graph tab"
            title="Close Signal graph tab"
            className="grid size-4 place-items-center rounded-[2px] text-muted-foreground/70 hover:bg-accent hover:text-foreground"
          >
            <X className="size-3" strokeWidth={2} />
          </a>
        </div>
        <a
          href="#/overview"
          className="flex h-[30px] shrink-0 items-center gap-1.5 rounded-t-[6px] px-2.5 text-[12px] text-muted-foreground/70 hover:bg-accent hover:text-muted-foreground"
        >
          <LayoutDashboard className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
          Overview
        </a>
        <button
          type="button"
          ref={browseTriggerRef}
          onClick={onBrowse}
          aria-label="Browse all signals"
          title="Browse all signals"
          className="grid h-[30px] w-7 shrink-0 place-items-center self-end rounded-t-[6px] text-muted-foreground/70 hover:bg-accent hover:text-muted-foreground"
        >
          <Plus className="size-3.5" strokeWidth={2} />
        </button>
      </div>
      <div className="flex shrink-0 items-center gap-0.5 border-l border-border px-1.5">
        <button
          type="button"
          onClick={onBrowse}
          aria-label="Browse all signals"
          title="Browse all signals"
          className="grid size-7 place-items-center rounded-[3px] text-muted-foreground hover:bg-accent hover:text-foreground sm:hidden"
        >
          <ListTree className="size-3.5" strokeWidth={1.75} />
        </button>
        <button
          type="button"
          ref={infoTriggerRef}
          onClick={onAbout}
          aria-label="About this graph"
          title="About this graph"
          className="grid size-7 place-items-center rounded-[3px] text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Info className="size-3.5" strokeWidth={1.75} />
        </button>
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          className="grid size-7 place-items-center rounded-[3px] text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          {theme === "dark" ? (
            <Sun className="size-3.5" strokeWidth={1.75} />
          ) : (
            <Moon className="size-3.5" strokeWidth={1.75} />
          )}
        </button>
      </div>
    </header>
  );
}

function GraphStatusBar({ summary, selectedLabel }: { summary: string; selectedLabel?: string }) {
  return (
    <footer className="flex h-[22px] shrink-0 items-center justify-between gap-3 border-t border-border bg-background px-3 text-[11px] text-muted-foreground/70">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
          Simulated
        </span>
        <span className="hidden truncate sm:inline">{selectedLabel ?? "Force layout"}</span>
      </div>
      <div className="flex shrink-0 items-center gap-3 tabular-nums">
        <span>{summary}</span>
        <span className="hidden sm:inline">Local</span>
      </div>
    </footer>
  );
}

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
  const mobileSearchRef = useRef<HTMLInputElement>(null);
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
        focusSearch();
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

  function updateQuery(value: string) {
    setQuery(value);
    if (selectedId) setSelectedId(null);
  }

  function updateSource(value: Source | "all") {
    setSource(value);
    if (selectedId) setSelectedId(null);
  }

  function focusSearch() {
    const target = window.matchMedia("(min-width: 1024px)").matches ? searchRef : mobileSearchRef;
    target.current?.focus();
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
      <GraphTitleBar
        theme={theme}
        onToggleTheme={toggle}
        onBrowse={() => setBrowseOpen(true)}
        onAbout={() => setAboutOpen(true)}
        browseTriggerRef={browseTriggerRef}
        infoTriggerRef={infoTriggerRef}
      />

      <div className="flex min-h-0 flex-1">
        <GraphRibbon
          theme={theme}
          onToggleTheme={toggle}
          onBrowse={() => setBrowseOpen(true)}
          onAbout={() => setAboutOpen(true)}
        />
        <GraphSidebar
          selectedId={selectedId}
          onSelect={selectNode}
          onBrowse={() => setBrowseOpen(true)}
          onAbout={() => setAboutOpen(true)}
          searchRef={searchRef}
          query={query}
          onQuery={updateQuery}
          source={source}
          onSource={updateSource}
        />

        <main id="main" className="flex min-w-0 flex-1 flex-col">
          <div className="shrink-0 border-b border-border bg-muted px-2 py-1.5 lg:hidden">
            <GraphFilters
              searchRef={mobileSearchRef}
              query={query}
              onQuery={updateQuery}
              source={source}
              onSource={updateSource}
            />
          </div>

          <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_300px]">
            <section
              aria-label="Interactive relationship graph"
              aria-describedby="graph-description"
              className="relative min-h-0 flex-1 overflow-hidden bg-background"
            >
              <p id="graph-description" className="sr-only">
                A force-directed network of {PATTERNS.length} patterns connected by concepts, sounds
                and communities. The canvas is visual. Use Browse all signals to move through every
                node with the keyboard.
              </p>

              <TrendGraphCanvas
                theme={theme}
                selectedId={selectedId}
                activeIds={activeIds}
                emphasisIds={emphasizedIds}
                showContextLabels={showContextLabels}
                onSelect={selectNode}
              />

              {normalizedQuery && matches.length === 0 && (
                <div className="absolute inset-0 z-20 grid place-items-center px-5">
                  <div className="pointer-events-auto w-full max-w-[280px] rounded-[6px] border border-border bg-muted p-4 text-center shadow-lg">
                    <p className="text-[13px] font-medium">No signals match “{query.trim()}”</p>
                    <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
                      Try a broader concept, sound or community.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3 h-7 rounded-[4px] border-border bg-secondary text-[12px] text-foreground hover:bg-accent"
                      onClick={() => setQuery("")}
                    >
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
              className={cn(
                "min-h-0 overflow-hidden bg-muted lg:flex lg:flex-col lg:border-l lg:border-border",
                selected
                  ? "flex max-h-[45dvh] shrink-0 flex-col border-t border-border lg:max-h-none"
                  : "hidden lg:flex",
              )}
            >
              <TrendGraphInspector
                selected={selected}
                onSelect={selectNode}
                onClose={closeInspector}
                tracked={trackedSelected}
                onToggleTracked={toggleTracked}
              />
            </aside>
          </div>
        </main>
      </div>

      <GraphStatusBar summary={summary} selectedLabel={selected?.label} />

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
