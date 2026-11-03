import {
  Activity,
  Bell,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Compass,
  Database,
  Info,
  LayoutDashboard,
  ListTree,
  LoaderCircle,
  Moon,
  Network,
  Plus,
  Radar,
  RefreshCw,
  Search,
  Sun,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { toast, Toaster } from "sonner";
import type { RangeKey, WatchlistItem } from "../../shared/types.ts";
import { AddTrendDialog } from "@/components/add-trend-dialog";
import { RangeTabs } from "@/components/controls";
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
import { useAnalysis, useWatchlist, useAddWatchlist } from "@/hooks/use-trends";
import { useTheme } from "@/hooks/use-app";
import { toastError } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  KIND_GROUP_LABEL,
  KIND_LABEL,
  KIND_ORDER,
  buildRelatedGraph,
  searchTextFor,
  type NodeKind,
  type RelatedGraph,
} from "./trend-graph.data";

const EMPTY_IDS = new Set<string>();
const EMPTY_GRAPH: RelatedGraph = {
  seedId: "",
  geo: "US",
  nodes: [],
  links: [],
  updatedAt: "",
  stale: false,
};

const RIBBON = [
  { href: "#/graph", label: "Related graph", icon: Network, active: true },
  { href: "#/map", label: "Trend map", icon: Activity, active: false },
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
        <RailButton label="Browse graph nodes" onClick={onBrowse}>
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
  nodes: { id: string; label: string; kind: NodeKind }[];
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
  kind,
  onKind,
}: {
  searchRef: RefObject<HTMLInputElement | null>;
  query: string;
  onQuery: (value: string) => void;
  kind: NodeKind | "all";
  onKind: (value: NodeKind | "all") => void;
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
          aria-label="Search related queries"
          placeholder="Search related queries"
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
        value={kind}
        onChange={(event) => onKind(event.target.value as NodeKind | "all")}
        aria-label="Filter by node type"
        className="h-7 rounded-[4px] border-border bg-background text-[12px] text-muted-foreground focus-visible:border-ring focus-visible:ring-0"
      >
        <option value="all">All related queries</option>
        {KIND_ORDER.map((nodeKind) => (
          <option key={nodeKind} value={nodeKind}>
            {KIND_LABEL[nodeKind]}
          </option>
        ))}
      </Select>
    </div>
  );
}

function TermControls({
  items,
  activeId,
  range,
  onActive,
  onRange,
  onAdd,
}: {
  items: WatchlistItem[];
  activeId: string;
  range: RangeKey;
  onActive: (id: string) => void;
  onRange: (range: RangeKey) => void;
  onAdd: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        <Select
          value={activeId}
          onChange={(event) => onActive(event.target.value)}
          aria-label="Monitored term to graph"
          disabled={items.length === 0}
          className="h-7 min-w-0 flex-1 rounded-[4px] border-border bg-background text-[12px]"
        >
          {items.length === 0 ? <option value="">No monitored terms</option> : null}
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.term} · {item.geo}
            </option>
          ))}
        </Select>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={onAdd}
          aria-label="Add monitored term"
          title="Add monitored term"
          className="size-7 shrink-0 rounded-[4px]"
        >
          <Plus aria-hidden="true" className="size-3.5" />
        </Button>
      </div>
      <RangeTabs value={range} onChange={onRange} className="h-7 bg-background" />
    </div>
  );
}

function GraphSidebar({
  items,
  activeId,
  range,
  onActive,
  onRange,
  onAdd,
  nodes,
  selectedId,
  onSelect,
  onBrowse,
  onAbout,
  searchRef,
  query,
  onQuery,
  kind,
  onKind,
  updatedLabel,
  stale,
}: {
  items: WatchlistItem[];
  activeId: string;
  range: RangeKey;
  onActive: (id: string) => void;
  onRange: (range: RangeKey) => void;
  onAdd: () => void;
  nodes: RelatedGraph["nodes"];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onBrowse: () => void;
  onAbout: () => void;
  searchRef: RefObject<HTMLInputElement | null>;
  query: string;
  onQuery: (value: string) => void;
  kind: NodeKind | "all";
  onKind: (value: NodeKind | "all") => void;
  updatedLabel: string;
  stale: boolean;
}) {
  return (
    <aside
      aria-label="Related query explorer"
      className="hidden w-60 shrink-0 flex-col border-r border-border bg-muted lg:flex"
    >
      <div className="shrink-0 border-b border-border px-2 py-2">
        <TermControls
          items={items}
          activeId={activeId}
          range={range}
          onActive={onActive}
          onRange={onRange}
          onAdd={onAdd}
        />
      </div>

      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-2">
        <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          <ChevronDown className="size-3" strokeWidth={2} />
          Explorer
        </span>
        <button
          type="button"
          onClick={onBrowse}
          aria-label="Browse all graph nodes"
          title="Browse all graph nodes"
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
          kind={kind}
          onKind={onKind}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
        <div className="space-y-0.5">
          {KIND_ORDER.map((nodeKind) => (
            <ExplorerGroup
              key={nodeKind}
              title={KIND_GROUP_LABEL[nodeKind]}
              nodes={nodes.filter((node) => node.kind === nodeKind)}
              defaultOpen={nodeKind === "term" || nodeKind === "rising"}
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
          Browse all nodes
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-border px-2 py-2 text-[11px] text-muted-foreground">
        <Database className="size-3.5 text-muted-foreground/70" strokeWidth={1.75} />
        <span className="min-w-0 flex-1 truncate">
          {nodes.length === 0 ? "No live data" : stale ? "Cached live data" : "Live Google Trends"}
        </span>
        <span className="truncate text-[10px] text-muted-foreground/70">{updatedLabel}</span>
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
      <a
        href="#/graph"
        aria-label="Trendifest related graph"
        className="grid w-11 shrink-0 place-items-center border-r border-border text-primary"
      >
        <span className="grid size-5 place-items-center rounded-[3px] bg-primary text-background">
          <Network className="size-3.5" strokeWidth={2.4} aria-hidden="true" />
        </span>
      </a>
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
          <span className="whitespace-nowrap">Related graph</span>
          <a
            href="#/overview"
            aria-label="Close related graph tab"
            title="Close related graph tab"
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
          aria-label="Browse all graph nodes"
          title="Browse all graph nodes"
          className="grid h-[30px] w-7 shrink-0 place-items-center self-end rounded-t-[6px] text-muted-foreground/70 hover:bg-accent hover:text-muted-foreground"
        >
          <Plus className="size-3.5" strokeWidth={2} />
        </button>
      </div>
      <div className="flex shrink-0 items-center gap-0.5 border-l border-border px-1.5">
        <button
          type="button"
          onClick={onBrowse}
          aria-label="Browse all graph nodes"
          title="Browse all graph nodes"
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

function GraphStatusBar({
  summary,
  selectedLabel,
  stale,
  available,
}: {
  summary: string;
  selectedLabel?: string;
  stale: boolean;
  available: boolean;
}) {
  return (
    <footer className="flex h-[22px] shrink-0 items-center justify-between gap-3 border-t border-border bg-background px-3 text-[11px] text-muted-foreground/70">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex items-center gap-1.5">
          <span
            className={cn(
              "size-1.5 rounded-full",
              !available ? "bg-muted-foreground" : stale ? "bg-warning" : "bg-success",
            )}
            aria-hidden="true"
          />
          {!available ? "No live data" : stale ? "Cached live data" : "Live Google Trends"}
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

function matchesForKind(nodes: RelatedGraph["nodes"], kind: NodeKind | "all") {
  if (kind === "all") return new Set(nodes.map((node) => node.id));
  const ids = new Set(nodes.filter((node) => node.kind === kind).map((node) => node.id));
  const seed = nodes.find((node) => node.kind === "term");
  if (seed) ids.add(seed.id);
  return ids;
}

function GraphMessage({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="absolute inset-0 z-20 grid place-items-center px-5">
      <div className="pointer-events-auto w-full max-w-[340px] rounded-[6px] border border-border bg-muted p-5 text-center shadow-lg">
        <Network className="mx-auto size-5 text-muted-foreground" aria-hidden="true" />
        <p className="mt-3 text-[13px] font-medium">{title}</p>
        <p className="mt-1 text-[12px] leading-5 text-muted-foreground">{description}</p>
        {action ? <div className="mt-3 flex justify-center">{action}</div> : null}
      </div>
    </div>
  );
}

function BrowseDialog({
  open,
  onOpenChange,
  graph,
  nodes,
  selectedId,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  graph: RelatedGraph;
  nodes: RelatedGraph["nodes"];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Browse graph nodes</DialogTitle>
          <DialogDescription>
            Move through the graph without using the canvas. Selecting a node opens its details in
            the inspector.
          </DialogDescription>
        </DialogHeader>
        <div className="-mx-2 max-h-[55dvh] overflow-y-auto overscroll-contain px-2">
          {KIND_ORDER.map((kind) => {
            const group = nodes
              .filter((node) => node.kind === kind)
              .toSorted((a, b) => a.label.localeCompare(b.label));
            if (!group.length) return null;
            return (
              <section key={kind} className="mt-5 first:mt-2">
                <h3 className="mb-1.5 flex items-center gap-2 px-2 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  <KindDot kind={kind} />
                  {KIND_GROUP_LABEL[kind]}
                  <span className="ml-auto tabular-nums">{group.length}</span>
                </h3>
                <div className="space-y-0.5">
                  {group.map((node) => {
                    const active = node.id === selectedId;
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
                          {node.value === null
                            ? graph.nodes.length - 1
                            : node.rising
                              ? `+${node.value}%`
                              : node.value}
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
          <DialogTitle>Related demand, mapped</DialogTitle>
          <DialogDescription>
            A graph-shaped view of the searches Google returns alongside one monitored term.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-[13px] leading-6 text-muted-foreground">
          <p>
            The filled center is the term you track. Hollow notes are Google's top and rising
            related queries; select one for its value and a link to Explore.
          </p>
          <p>
            Queries connect to the center because Google returned them together. Two queries can
            also connect when one label literally contains the other. No semantic similarity, social
            post, or predicted breakout is invented.
          </p>
          <div className="rounded-lg border border-border/70 bg-muted/40 px-3.5 py-3 text-[12px] leading-5">
            <p className="font-medium text-foreground">Why a graph?</p>
            <p className="mt-1">
              A list hides which searches belong to the same demand neighborhood. The graph keeps
              the relationships visible while the inspector keeps the values honest.
            </p>
          </div>
        </div>
        <DialogFooter className="sm:justify-between">
          <Button asChild variant="ghost">
            <a href="#/overview">Open workspace</a>
          </Button>
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TrendGraphPage() {
  const { theme, toggle } = useTheme();
  const watchlist = useWatchlist();
  const [activeId, setActiveId] = useState("");
  const [range, setRange] = useState<RangeKey>("12m");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<NodeKind | "all">("all");
  const [browseOpen, setBrowseOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [trackingTerm, setTrackingTerm] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const mobileSearchRef = useRef<HTMLInputElement>(null);
  const browseTriggerRef = useRef<HTMLButtonElement>(null);
  const infoTriggerRef = useRef<HTMLButtonElement>(null);
  const items = watchlist.data ?? [];

  useEffect(() => {
    const linkedTerm = new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("term");
    if (items.length === 0) {
      setActiveId("");
      return;
    }
    setActiveId((current) => {
      if (items.some((item) => item.id === current)) return current;
      const linked = linkedTerm
        ? items.find((item) => item.term.toLowerCase() === linkedTerm.toLowerCase())
        : undefined;
      return linked?.id ?? items[0]!.id;
    });
  }, [items]);

  const active = items.find((item) => item.id === activeId) ?? null;
  const analysis = useAnalysis(active ? [active.term] : [], active?.geo ?? "US", range);
  const graph = useMemo(
    () => (analysis.data ? buildRelatedGraph(analysis.data) : EMPTY_GRAPH),
    [analysis.data],
  );
  const insight = analysis.data?.insights[0];
  const selected = selectedId ? graph.nodes.find((node) => node.id === selectedId) : undefined;
  const add = useAddWatchlist();
  const selectedTracked =
    selected?.kind === "term" ||
    (selected
      ? items.some(
          (item) =>
            item.term.toLowerCase() === selected.label.toLowerCase() && item.geo === graph.geo,
        )
      : false);

  useEffect(() => {
    if (selectedId && !graph.nodes.some((node) => node.id === selectedId)) setSelectedId(null);
  }, [graph.nodes, selectedId]);

  useEffect(() => {
    document.title = "Related graph — Trendifest";
  }, []);

  const sourceIds = useMemo(() => matchesForKind(graph.nodes, kind), [graph.nodes, kind]);
  const normalizedQuery = query.trim().toLowerCase();
  const matches = useMemo(
    () =>
      normalizedQuery
        ? graph.nodes.filter(
            (node) => sourceIds.has(node.id) && searchTextFor(node).includes(normalizedQuery),
          )
        : [],
    [graph.nodes, normalizedQuery, sourceIds],
  );
  const emphasisIds = useMemo(
    () => (selectedId ? EMPTY_IDS : new Set(matches.map((node) => node.id))),
    [matches, selectedId],
  );
  const filterActiveIds = useMemo(() => {
    if (!normalizedQuery) return sourceIds;
    const direct = new Set(matches.map((node) => node.id));
    const context = new Set(direct);
    for (const link of graph.links) {
      if (link.relation === "contains") continue;
      if (!sourceIds.has(link.source) || !sourceIds.has(link.target)) continue;
      if (direct.has(link.source) || direct.has(link.target)) {
        context.add(link.source);
        context.add(link.target);
      }
    }
    return context;
  }, [graph.links, matches, normalizedQuery, sourceIds]);
  const activeIds = useMemo(() => {
    if (!selected) return filterActiveIds;
    const ids = new Set([selected.id]);
    for (const link of graph.links) {
      if (link.source === selected.id) ids.add(link.target);
      else if (link.target === selected.id) ids.add(link.source);
    }
    return ids;
  }, [filterActiveIds, graph.links, selected]);
  const showContextLabels = Boolean(selected || normalizedQuery || kind !== "all");
  const summary = normalizedQuery
    ? `${matches.length} ${matches.length === 1 ? "match" : "matches"}`
    : selected
      ? `${graph.links.filter((link) => link.source === selected.id || link.target === selected.id).length} connections`
      : graph.nodes.length > 0
        ? `${graph.nodes.length} nodes · ${graph.links.length} links`
        : analysis.isLoading
          ? "Loading related queries"
          : "No live data";

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
      else if (kind !== "all") setKind("all");
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  function focusSearch() {
    const target = window.matchMedia("(min-width: 1024px)").matches ? searchRef : mobileSearchRef;
    target.current?.focus();
  }

  function closeInspector() {
    setSelectedId(null);
    window.requestAnimationFrame(() => browseTriggerRef.current?.focus());
  }

  function updateQuery(value: string) {
    setQuery(value);
    if (selectedId) setSelectedId(null);
  }

  function updateKind(value: NodeKind | "all") {
    setKind(value);
    if (selectedId) setSelectedId(null);
  }

  function selectTerm(id: string) {
    setActiveId(id);
    setSelectedId(null);
    const item = items.find((candidate) => candidate.id === id);
    if (item) {
      window.history.replaceState(null, "", `#/graph?term=${encodeURIComponent(item.term)}`);
    }
  }

  function selectNode(id: string | null) {
    setSelectedId(id);
  }

  function trackQuery(term: string) {
    if (!active) return;
    setTrackingTerm(term);
    add.mutate(
      { term, geo: active.geo, threshold: 15 },
      {
        onSuccess: () => toast(`Monitoring ${term}`, { description: "Added to your watchlist." }),
        onError: (error) => {
          toastError(
            error instanceof Error ? error.message : "Unable to monitor that query. Try again.",
          );
        },
        onSettled: () => setTrackingTerm(null),
      },
    );
  }

  const updatedLabel = graph.updatedAt
    ? new Date(graph.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "—";
  const graphReady = Boolean(active) && graph.nodes.length > 0;
  const noItems = !watchlist.isLoading && !watchlist.isError && items.length === 0;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <h1 className="sr-only">Related demand graph</h1>
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
          items={items}
          activeId={activeId}
          range={range}
          onActive={selectTerm}
          onRange={(next) => {
            setRange(next);
            setSelectedId(null);
          }}
          onAdd={() => setAddOpen(true)}
          nodes={graph.nodes}
          selectedId={selectedId}
          onSelect={selectNode}
          onBrowse={() => setBrowseOpen(true)}
          onAbout={() => setAboutOpen(true)}
          searchRef={searchRef}
          query={query}
          onQuery={updateQuery}
          kind={kind}
          onKind={updateKind}
          updatedLabel={updatedLabel}
          stale={graph.stale}
        />

        <main id="main" className="flex min-w-0 flex-1 flex-col">
          <div className="shrink-0 space-y-1.5 border-b border-border bg-muted px-2 py-1.5 lg:hidden">
            <TermControls
              items={items}
              activeId={activeId}
              range={range}
              onActive={selectTerm}
              onRange={(next) => {
                setRange(next);
                setSelectedId(null);
              }}
              onAdd={() => setAddOpen(true)}
            />
            <GraphFilters
              searchRef={mobileSearchRef}
              query={query}
              onQuery={updateQuery}
              kind={kind}
              onKind={updateKind}
            />
          </div>

          <div className="relative flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_300px]">
            <section
              aria-label="Interactive related-query graph"
              aria-describedby="graph-description"
              className="relative min-h-0 flex-1 overflow-hidden bg-background"
            >
              <p id="graph-description" className="sr-only">
                A force-directed graph of one monitored search term and its top and rising related
                queries. The canvas is visual. Use Browse graph nodes to move through every node
                with the keyboard.
              </p>

              {graphReady ? (
                <TrendGraphCanvas
                  theme={theme}
                  nodes={graph.nodes}
                  links={graph.links}
                  selectedId={selectedId}
                  activeIds={activeIds}
                  emphasisIds={emphasisIds}
                  showContextLabels={showContextLabels}
                  onSelect={selectNode}
                />
              ) : null}

              {watchlist.isLoading ? (
                <GraphMessage
                  title="Loading watchlist"
                  description="Reading the terms you monitor."
                  action={<LoaderCircle className="size-4 animate-spin text-muted-foreground" />}
                />
              ) : null}

              {noItems ? (
                <GraphMessage
                  title="Graph a monitored term"
                  description="Add a search term to build a live related-query neighborhood around it."
                  action={
                    <Button size="sm" onClick={() => setAddOpen(true)}>
                      <Plus aria-hidden="true" className="size-3.5" />
                      Monitor trend
                    </Button>
                  }
                />
              ) : null}

              {!noItems && watchlist.isError ? (
                <GraphMessage
                  title="Unable to load the watchlist"
                  description={
                    watchlist.error instanceof Error
                      ? watchlist.error.message
                      : "The service did not respond. Try again."
                  }
                  action={
                    <Button variant="outline" size="sm" onClick={() => watchlist.refetch()}>
                      <RefreshCw aria-hidden="true" className="size-3.5" />
                      Retry
                    </Button>
                  }
                />
              ) : null}

              {!noItems && active && analysis.isLoading ? (
                <GraphMessage
                  title="Building the graph"
                  description={`Fetching related searches for “${active.term}” from Google Trends.`}
                  action={<LoaderCircle className="size-4 animate-spin text-muted-foreground" />}
                />
              ) : null}

              {!noItems && active && analysis.isError && !analysis.data ? (
                <GraphMessage
                  title="Unable to load related searches"
                  description={
                    analysis.error instanceof Error
                      ? analysis.error.message
                      : "Google Trends did not respond. Try again."
                  }
                  action={
                    <Button variant="outline" size="sm" onClick={() => analysis.refetch()}>
                      <RefreshCw aria-hidden="true" className="size-3.5" />
                      Retry
                    </Button>
                  }
                />
              ) : null}

              {!noItems && active && graph.nodes.length <= 1 && analysis.data ? (
                <GraphMessage
                  title="No related queries returned"
                  description="Google did not return related searches for this term in this country and range. Try another range."
                />
              ) : null}

              {normalizedQuery && matches.length === 0 && graph.nodes.length > 0 ? (
                <div className="absolute inset-0 z-20 grid place-items-center px-5">
                  <div className="pointer-events-auto w-full max-w-[280px] rounded-[6px] border border-border bg-muted p-4 text-center shadow-lg">
                    <p className="text-[13px] font-medium">No queries match “{query.trim()}”</p>
                    <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
                      Try a broader query or another node type.
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
              ) : null}

              <p className="sr-only" role="status" aria-live="polite">
                {selected
                  ? `${KIND_LABEL[selected.kind]} selected: ${selected.label}`
                  : normalizedQuery
                    ? `${matches.length} matching queries`
                    : ""}
              </p>
            </section>

            <aside
              aria-label="Graph inspector"
              className={cn(
                "min-h-0 overflow-hidden bg-muted lg:flex lg:flex-col lg:border-l lg:border-border",
                selected
                  ? "max-lg:absolute max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-20 max-lg:flex max-lg:h-[45dvh] max-lg:flex-col max-lg:border-t max-lg:border-border max-lg:shadow-[0_-10px_30px_rgb(0_0_0_/_0.35)]"
                  : "hidden lg:flex",
              )}
            >
              <TrendGraphInspector
                selected={selected}
                graph={graph}
                insight={insight}
                onSelect={selectNode}
                onClose={closeInspector}
                selectedTracked={selectedTracked}
                onTrack={trackQuery}
                tracking={add.isPending && trackingTerm === selected?.label}
              />
            </aside>
          </div>
        </main>
      </div>

      <GraphStatusBar
        summary={summary}
        selectedLabel={selected?.label}
        stale={graph.stale}
        available={graph.nodes.length > 0}
      />

      <BrowseDialog
        open={browseOpen}
        onOpenChange={(open) => {
          setBrowseOpen(open);
          if (!open) window.requestAnimationFrame(() => browseTriggerRef.current?.focus());
        }}
        graph={graph}
        nodes={graph.nodes}
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
      <AddTrendDialog open={addOpen} onOpenChange={setAddOpen} defaultGeo={active?.geo ?? "US"} />
      <Toaster
        theme={theme}
        position="bottom-right"
        closeButton
        toastOptions={{
          classNames: {
            toast: "border-border bg-popover font-sans text-popover-foreground",
            description: "text-muted-foreground",
          },
        }}
      />
    </div>
  );
}
