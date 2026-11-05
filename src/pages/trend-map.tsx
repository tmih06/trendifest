import {
  Badge,
  Button,
  Shell,
  Sidebar,
  SidebarItem,
  SidebarSection,
  cn,
} from "@trendifest/opendesk";
import {
  Activity,
  ArrowUpRight,
  ChevronRight,
  Circle,
  Database,
  Info,
  Menu,
  Moon,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRight,
  RefreshCw,
  Sun,
  Users,
  X,
} from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState, type CSSProperties } from "react";
import type { TrendMapNode } from "../../shared/types.ts";
import { DbNotice } from "@/components/db-notice";
import { TrendGraphCanvas } from "@/components/trend-graph-canvas";
import { useTheme } from "@/hooks/use-app";
import { useCollectionStatus, useCollectNow, useTrendMap } from "@/hooks/use-trends";
import { compactNumber, formatRelative } from "@/lib/format";
import { toCanvas } from "@/lib/graph";

const Dialog = lazy(() =>
  import("@trendifest/opendesk/dialog").then((module) => ({ default: module.Dialog })),
);

const WINDOWS = [
  { hours: 24, label: "24h" },
  { hours: 72, label: "3d" },
  { hours: 168, label: "7d" },
] as const;

/** A heuristic score, deliberately not formatted as a probability. */
function PotentialBadge({ node }: { node: TrendMapNode }) {
  if (node.potential === null) return null;
  return (
    <Badge tone={node.potential >= 60 ? "ok" : "neutral"} className="mono">
      {node.potential}
      <span className="text-fg-3">/100</span>
    </Badge>
  );
}

/** The selected pattern's evidence remains readable without interpreting the canvas. */
function NodeDetail({ node }: { node: TrendMapNode }) {
  const score = node.score;
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 break-words text-[13px] font-medium leading-5 text-fg">
          {node.label}
        </h3>
        <PotentialBadge node={node} />
      </div>
      <p className="text-[12px] leading-5 text-fg-3">{node.description}</p>
      {score ? (
        <>
          <dl className="grid grid-cols-2 gap-3 rounded-lg bg-sunken p-3">
            <div>
              <dt className="text-[11px] text-fg-3">Source accounts</dt>
              <dd className="mono mt-1 text-[17px] text-fg">{score.authors}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-fg-3">Thread excerpts</dt>
              <dd className="mono mt-1 text-[17px] text-fg">{score.posts}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-fg-3">Likes</dt>
              <dd className="mono mt-1 text-[17px] text-fg">
                {node.likes === undefined ? "—" : compactNumber(node.likes)}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-fg-3">Reposts + quotes</dt>
              <dd className="mono mt-1 text-[17px] text-fg">
                {node.shares === undefined ? "—" : compactNumber(node.shares)}
              </dd>
            </div>
          </dl>
          <div className="space-y-2.5">
            {[
              { label: "Reach", value: score.reach },
              { label: "Velocity", value: score.velocity },
              { label: "Source coverage", value: score.spread },
              { label: "Persistence", value: score.persistence },
              { label: "Author diversity", value: score.diversity },
            ].map((part) => (
              <div key={part.label}>
                <div className="mb-1 flex justify-between gap-2 text-[11px]">
                  <span className="text-fg-3">{part.label}</span>
                  <span className="mono text-fg-2">{Math.round(part.value * 100)}/100</span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-active">
                  <div
                    className="h-full rounded-full bg-fg-2"
                    style={{ width: `${part.value * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] leading-5 text-fg-3">
            Evidence multiplier ×{score.confidence.toFixed(2)}. Five source accounts are needed for
            the full score. Accounts on different sites are not verified distinct people.
          </p>
        </>
      ) : (
        <p className="text-[12px] leading-5 text-fg-3">
          {node.posts.toLocaleString()} excerpts observed. Source hubs have no trend score.
        </p>
      )}
      {node.kind === "pattern" && (
        <section className="border-t border-line pt-4" aria-label="Source excerpts">
          <h4 className="label-caps mb-2">Source excerpts</h4>
          <p className="mb-2 text-[11px] leading-5 text-fg-3">
            RSS excerpts, not every reply. Feed dates reflect activity, not verified publication.
          </p>
          {node.examples?.length ? (
            <ul className="space-y-2">
              {node.examples.map((example) => (
                <li key={example.uri} className="rounded-lg border border-line p-2.5">
                  <div className="mb-1 flex items-center justify-between gap-2 text-[10.5px] text-fg-3">
                    <span className="min-w-0 truncate">
                      {example.authorHandle ?? "Unknown author"}
                    </span>
                    <Badge>{example.source === "voz" ? "VOZ" : "Otofun"}</Badge>
                  </div>
                  <p className="break-words text-[11.5px] leading-5 text-fg-2">
                    {example.text || "Media-only post"}
                  </p>
                  <a
                    href={example.permalink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex min-h-6 items-center gap-1 text-[11px] text-fg underline underline-offset-4"
                  >
                    Open original thread
                    <ArrowUpRight className="size-3" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-fg-3">No source excerpts available in this window.</p>
          )}
        </section>
      )}
    </div>
  );
}

/** One graph workspace: collection controls and evidence live beside the graph, never on separate routes. */
export function TrendMapPage() {
  const { theme, toggle } = useTheme();
  const [hours, setHours] = useState<number>(72);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [desktopInspector, setDesktopInspector] = useState(true);
  const [mobileInspector, setMobileInspector] = useState(false);
  const [narrow, setNarrow] = useState(() => window.matchMedia("(max-width: 1199px)").matches);
  const [dialogsEnabled, setDialogsEnabled] = useState(false);
  const map = useTrendMap(hours);
  const collection = useCollectionStatus();
  const collect = useCollectNow();
  const data = map.data;
  const canvas = useMemo(() => (data ? toCanvas(data) : { nodes: [], links: [] }), [data]);
  const selected = data?.nodes.find((node) => node.id === selectedId) ?? null;
  const connectedIds = useMemo(() => {
    if (!sourceId) return new Set(canvas.nodes.map((node) => node.id));
    const hubId = `segment:${sourceId}`;
    return new Set([
      hubId,
      ...canvas.links.filter((edge) => edge.source === hubId).map((edge) => edge.target),
    ]);
  }, [sourceId, canvas]);
  const patterns = useMemo(
    () =>
      (data?.nodes ?? [])
        .filter((node) => node.kind === "pattern" && connectedIds.has(node.id))
        .sort((a, b) => (b.potential ?? 0) - (a.potential ?? 0)),
    [data, connectedIds],
  );
  const relatedPatterns = useMemo(
    () =>
      (data?.edges ?? [])
        .flatMap((edge) => {
          if (edge.relation !== "similarity" || !selectedId) return [];
          const otherId =
            edge.source === selectedId
              ? edge.target
              : edge.target === selectedId
                ? edge.source
                : null;
          const node = data?.nodes.find((item) => item.id === otherId);
          return node ? [{ node, similarity: edge.similarity ?? edge.weight }] : [];
        })
        .sort((a, b) => b.similarity - a.similarity),
    [data, selectedId],
  );
  const sourceLabel =
    data?.coverage.find((row) => row.segmentId === sourceId)?.label ?? "All sources";
  const status = collection.data;
  const busy = collect.isPending || status?.backfilling === true;
  const healthy =
    status?.configured === true &&
    status.enabled &&
    status.lastBackfillAt !== null &&
    status.lastErrors.length === 0;
  const statusLabel = collection.isError
    ? "Status unavailable"
    : !status
      ? "Connecting"
      : !status.configured
        ? "Database required"
        : busy
          ? "Collecting"
          : status.lastErrors.length
            ? "Source errors"
            : !status.enabled
              ? "Polling paused"
              : healthy
                ? "Polling active"
                : "Waiting for first poll";
  const unconfigured =
    map.error instanceof Error && "code" in map.error && map.error.code === "database_unconfigured";

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1199px)");
    const update = () => setNarrow(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  // Load accessible modal behavior only after the first dialog request. Keep
  // it mounted afterward so closing transitions and focus restoration finish.
  useEffect(() => {
    if (navOpen || aboutOpen || collectionOpen || mobileInspector) setDialogsEnabled(true);
  }, [navOpen, aboutOpen, collectionOpen, mobileInspector]);

  useEffect(() => {
    setSelectedId(null);
  }, [hours]);

  /** Filtering only changes emphasis; it must not restart the force simulation. */
  function chooseSource(id: string | null) {
    setSourceId(id);
    setSelectedId(null);
    setNavOpen(false);
  }

  /** Both the ranked list and canvas open the same details, including on narrow screens. */
  function selectNode(id: string | null) {
    setSelectedId(id);
    if (id) {
      if (!connectedIds.has(id)) setSourceId(null);
      if (narrow) setMobileInspector(true);
      else setDesktopInspector(true);
    }
  }

  const sidebar = (rail: boolean) => (
    <Sidebar
      collapsed={rail}
      footer={
        <div className="space-y-2">
          <SidebarItem
            icon={<Database />}
            collapsed={rail}
            onClick={() => {
              setNavOpen(false);
              setCollectionOpen(true);
            }}
            title="Collection status"
          >
            Collection status
          </SidebarItem>
          <SidebarItem
            icon={theme === "dark" ? <Sun /> : <Moon />}
            collapsed={rail}
            onClick={toggle}
            title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          >
            {theme === "dark" ? "Light appearance" : "Dark appearance"}
          </SidebarItem>
          <div className="sidebar-collapse">
            <SidebarItem
              icon={rail ? <PanelLeftOpen /> : <PanelLeftClose />}
              collapsed={rail}
              onClick={() => setCollapsed(!collapsed)}
              title={rail ? "Expand sidebar" : "Collapse sidebar"}
            >
              {rail ? "Expand sidebar" : "Collapse sidebar"}
            </SidebarItem>
          </div>
        </div>
      }
    >
      <div className="od-sidebar-section">
        <SidebarItem
          icon={<Network />}
          active={!sourceId}
          collapsed={rail}
          onClick={() => chooseSource(null)}
          count={data?.nodes.filter((node) => node.kind === "pattern").length}
          title="All sources"
        >
          Trend graph
        </SidebarItem>
      </div>
      <SidebarSection label="Vietnamese sources" collapsed={rail}>
        {(data?.coverage ?? []).map((row) => (
          <SidebarItem
            key={row.segmentId}
            icon={<Circle className="size-3" />}
            active={sourceId === row.segmentId}
            collapsed={rail}
            onClick={() => chooseSource(row.segmentId)}
            count={row.posts}
            title={row.error ? `${row.label}: ${row.error}` : row.label}
          >
            {row.label}
          </SidebarItem>
        ))}
        {!data && !rail && (
          <p className="px-4 py-2 text-[12px] text-fg-3">Feeds appear after connection.</p>
        )}
      </SidebarSection>
    </Sidebar>
  );

  const inspector = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-12 shrink-0 items-center justify-between gap-2 border-b border-line px-4">
        <div>
          <h2 className="text-[12.5px] font-medium text-fg">
            {selected ? "Pattern details" : "Highest potential"}
          </h2>
          <p className="mt-0.5 text-[10.5px] text-fg-3">
            {selected
              ? "Evidence behind the node"
              : `${patterns.length} patterns · last ${hours} hours`}
          </p>
        </div>
        {selected && (
          <Button
            variant="ghost"
            square
            aria-label="Clear node selection"
            onClick={() => setSelectedId(null)}
          >
            <X />
          </Button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {selected && (
          <div className="border-b border-line p-4">
            <NodeDetail node={selected} />
            {selected.kind === "pattern" && (
              <div className="mt-4 border-t border-line pt-4">
                <h3 className="label-caps mb-2">Similar patterns</h3>
                {relatedPatterns.length === 0 ? (
                  <p className="text-[11px] leading-5 text-fg-3">
                    No displayed pattern meets the same-model similarity threshold.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {relatedPatterns.map(({ node, similarity }) => (
                      <li key={node.id}>
                        <button
                          type="button"
                          onClick={() => selectNode(node.id)}
                          className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-start hover:bg-hover"
                        >
                          <span className="min-w-0 flex-1 break-words text-[11.5px] leading-5 text-fg-2">
                            {node.label}
                          </span>
                          <span
                            className="mono pt-0.5 text-[10.5px] text-fg-3"
                            title="Cosine similarity"
                          >
                            {similarity.toFixed(3)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
        <ol className="p-2" aria-label="Patterns ranked by potential">
          {patterns.map((node, index) => (
            <li key={node.id}>
              <button
                type="button"
                className={cn(
                  "pattern-row group flex w-full items-start gap-2.5 rounded-lg px-2.5 py-3 text-start hover:bg-hover",
                  selectedId === node.id && "bg-active",
                )}
                aria-pressed={selectedId === node.id}
                onClick={() => selectNode(selectedId === node.id ? null : node.id)}
              >
                <span className="mono pt-0.5 text-[10.5px] text-fg-3">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 block break-words text-[12px] leading-[18px] text-fg-2 group-hover:text-fg">
                    {node.label}
                  </span>
                  <span className="mt-1.5 flex items-center gap-1 text-[10.5px] text-fg-3">
                    <Users className="size-3" aria-hidden="true" />
                    Source accounts: {node.authors}
                    <span className="mx-1" aria-hidden="true">
                      ·
                    </span>
                    Excerpts: {node.posts}
                  </span>
                </span>
                <PotentialBadge node={node} />
              </button>
            </li>
          ))}
        </ol>
        {data && patterns.length === 0 && (
          <p className="p-4 text-[12px] leading-5 text-fg-3">
            No patterns observed for this source in this window. Try a wider window or collect more
            Vietnamese excerpts.
          </p>
        )}
      </div>
      <p className="shrink-0 border-t border-line px-4 py-3 text-[10.5px] leading-4 text-fg-3">
        Larger nodes mean higher potential. Scores rank collected evidence; they are not
        predictions.
      </p>
    </div>
  );

  return (
    <>
      <a className="skip-link" href="#graph-workspace">
        Skip to graph
      </a>
      <Shell
        collapsed={collapsed}
        sidebar={sidebar(collapsed)}
        header={
          <div className="workspace-header flex min-w-0 flex-wrap items-center gap-2 px-3 py-2">
            <Button
              className="mobile-nav-trigger"
              variant="ghost"
              square
              aria-label="Open source sidebar"
              onClick={() => setNavOpen(true)}
            >
              <Menu />
            </Button>
            <div className="flex min-w-0 items-center gap-2">
              <Network className="size-4 text-fg-3" aria-hidden="true" />
              <h1 className="text-[13px] font-medium">Trend graph</h1>
              <ChevronRight className="header-breadcrumb size-3 text-fg-4" aria-hidden="true" />
              <span className="header-breadcrumb max-w-40 truncate text-[12px] text-fg-3">
                {sourceLabel}
              </span>
            </div>
            <div className="ms-auto flex items-center gap-1.5">
              <span className="header-live">
                <Badge dot tone={healthy ? "ok" : "neutral"}>
                  {statusLabel}
                </Badge>
              </span>
              <Button
                variant="ghost"
                square
                aria-label="Refresh the map"
                disabled={map.isFetching}
                onClick={() => void map.refetch()}
              >
                <RefreshCw />
              </Button>
              <Button
                variant="ghost"
                square
                aria-label="How the score works"
                onClick={() => setAboutOpen(true)}
              >
                <Info />
              </Button>
            </div>
          </div>
        }
      >
        <div id="graph-workspace" tabIndex={-1} className="graph-workspace">
          <section
            className="graph-surface relative min-h-0 min-w-0 overflow-hidden"
            aria-label="Trend graph"
            aria-describedby="graph-description"
          >
            <p id="graph-description" className="sr-only">
              Vietnamese discussion patterns connected to their source feeds. Larger nodes have
              higher heuristic scores. Use the inspector to select nodes with the keyboard.
            </p>
            <div className="graph-toolbar pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-wrap items-start justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-fg-2">{sourceLabel}</p>
                <p className="mt-1 text-[11px] text-fg-3">
                  {data ? `${patterns.length} patterns in view` : "Connecting to collected signals"}
                </p>
              </div>
              <div className="pointer-events-auto flex items-center gap-2">
                <div
                  className="observation-window pointer-events-auto"
                  aria-label="Observation window"
                  role="group"
                  style={
                    {
                      "--window-index": WINDOWS.findIndex((window) => window.hours === hours),
                    } as CSSProperties
                  }
                >
                  <span className="observation-indicator" aria-hidden="true" />
                  {WINDOWS.map((window) => (
                    <Button
                      key={window.hours}
                      variant="ghost"
                      size="xs"
                      className="observation-option"
                      aria-pressed={hours === window.hours}
                      onClick={() => setHours(window.hours)}
                    >
                      {window.label}
                    </Button>
                  ))}
                </div>
                <Button
                  variant="ghost"
                  square
                  aria-label="Toggle pattern inspector"
                  aria-expanded={narrow ? mobileInspector : desktopInspector}
                  onClick={() =>
                    narrow
                      ? setMobileInspector(!mobileInspector)
                      : setDesktopInspector(!desktopInspector)
                  }
                >
                  <PanelRight />
                </Button>
              </div>
            </div>
            {canvas.nodes.length > 0 && (
              <TrendGraphCanvas
                theme={theme}
                nodes={canvas.nodes}
                links={canvas.links}
                selectedId={selectedId}
                activeIds={connectedIds}
                onSelect={selectNode}
              />
            )}
            {map.isLoading && (
              <div className="graph-state" role="status">
                <Activity className="size-5 text-fg-3" aria-hidden="true" />
                <p>Loading collected patterns…</p>
              </div>
            )}
            {unconfigured && (
              <div className="graph-state">
                <DbNotice />
              </div>
            )}
            {map.isError && !unconfigured && (
              <div className="graph-error" role="alert">
                <p>
                  {data
                    ? "Graph refresh failed. Showing the last collected data."
                    : map.error.message}
                </p>
                <Button onClick={() => void map.refetch()}>Try again</Button>
              </div>
            )}
            {data && patterns.length === 0 && !map.isError && (
              <div className="graph-empty pointer-events-none">
                <Network className="mx-auto mb-3 size-6 text-fg-3" aria-hidden="true" />
                <p className="text-[13px] font-medium">No patterns in this view yet</p>
                <p className="mt-1 text-[12px] text-fg-3">
                  Choose another source or collect more Vietnamese excerpts.
                </p>
                <Button
                  className="pointer-events-auto mt-4"
                  onClick={() => setCollectionOpen(true)}
                >
                  Collection status
                </Button>
              </div>
            )}
            <div className="graph-footer pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-[10.5px] text-fg-3">
              <span>
                {data ? (
                  <>
                    {data.edges.filter((edge) => edge.relation === "similarity").length} similarity
                    links
                    <span className="footer-updated">
                      {" "}
                      · updated {formatRelative(data.generatedAt)}
                    </span>
                  </>
                ) : (
                  "Waiting for data"
                )}
              </span>
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded bg-surface/90 px-1.5 py-1">
                <span className="flex items-center gap-1" aria-hidden="true">
                  <span className="graph-legend-swatch" data-shape="text" data-level="1" />
                  <span className="graph-legend-swatch" data-shape="text" data-level="2" />
                  <span className="graph-legend-swatch" data-shape="text" data-level="3" />
                </span>
                <span>colour · connections</span>
                <span className="flex items-center gap-1">
                  <span className="graph-legend-swatch" data-shape="image" data-level="2" />
                  <span className="graph-legend-swatch" data-shape="video" data-level="2" />
                  <span className="graph-legend-swatch" data-shape="audio" data-level="2" />
                  <span className="graph-legend-swatch" data-shape="link" data-level="2" />
                </span>
                <span>shape · type</span>
                <span className="flex items-center gap-1" aria-hidden="true">
                  <span className="graph-legend-dot" style={{ width: 5, height: 5 }} />
                  <span className="graph-legend-dot" style={{ width: 9, height: 9 }} />
                </span>
                <span>size · potential</span>
              </span>
            </div>
          </section>
          <aside
            className="graph-inspector min-h-0 min-w-0 border border-line bg-surface"
            aria-label="Pattern inspector"
            data-open={desktopInspector && !narrow}
            inert={!desktopInspector || narrow}
            aria-hidden={!desktopInspector || narrow}
          >
            {inspector}
          </aside>
        </div>
      </Shell>
      {dialogsEnabled && (
        <Suspense fallback={null}>
          <Dialog open={navOpen} onOpenChange={setNavOpen} title="Vietnamese sources" size="sm">
            <div className="mobile-sidebar">{sidebar(false)}</div>
          </Dialog>
          <Dialog
            open={mobileInspector && narrow}
            onOpenChange={setMobileInspector}
            title="Pattern inspector"
            size="sm"
          >
            <div className="mobile-inspector">{inspector}</div>
          </Dialog>
          <Dialog
            open={aboutOpen}
            onOpenChange={setAboutOpen}
            title="How trend potential works"
            description="A transparent ranking heuristic over collected evidence, not a probability."
          >
            <div className="space-y-4 text-[12.5px] leading-5 text-fg-2">
              <p>
                Solid edges mean a source feed observed a pattern. Dashed edges connect patterns
                with similar embedding centroids, compared only within the same model, modality, and
                native dimension.
              </p>
              <p>
                Similarity links use cosine thresholds of 0.75 for text and 0.78 for images or
                audio. Each pattern has at most three similarity links. These are affinity
                heuristics, not probabilities or proof that two posts mean the same thing.
              </p>
              <dl className="space-y-2">
                {Object.entries(
                  data?.method.weights ?? {
                    reach: 0.34,
                    velocity: 0.26,
                    spread: 0.18,
                    persistence: 0.12,
                    diversity: 0.1,
                  },
                ).map(([label, weight]) => (
                  <div className="flex justify-between gap-4" key={label}>
                    <dt className="capitalize">{label}</dt>
                    <dd className="mono">{Math.round(weight * 100)}%</dd>
                  </div>
                ))}
              </dl>
              <p>
                The weighted result is reduced when evidence is limited. Five source accounts are
                needed for the full score. Larger pattern nodes have higher scores; source hubs
                carry no score. Connections do not inflate the score.
              </p>
              <p className="rounded-lg bg-sunken p-3">
                {data?.method.velocityComparable
                  ? "Velocity compares source accounts by thread activity in consecutive six-hour windows, not verified new publications."
                  : "Velocity stays neutral until at least twelve hours of observation history are available."}
              </p>
              <p className="text-[11px] text-fg-3">
                Forum excerpts are a sampled collection, not a census of Vietnamese users. Account
                names do not establish a person's age or cross-platform identity.
              </p>
            </div>
          </Dialog>
          <Dialog
            open={collectionOpen}
            onOpenChange={setCollectionOpen}
            title="Collection status"
            description="Vietnamese RSS sources, bounded local inference, and Postgres storage."
            footer={
              <Button
                variant="primary"
                icon={<RefreshCw />}
                loading={busy}
                disabled={!status?.configured}
                onClick={() => collect.mutate(25)}
              >
                Collect now
              </Button>
            }
          >
            <div className="space-y-4 text-[12px] leading-5 text-fg-2">
              <div className="flex items-center justify-between gap-3">
                <span>Vietnamese source polling</span>
                <Badge tone={healthy ? "ok" : "neutral"} dot>
                  {statusLabel}
                </Badge>
              </div>
              <dl className="space-y-2" aria-label="Source collection results">
                {(data?.coverage ?? []).map((source) => {
                  const result = status?.lastBackfill?.sources.find(
                    (item) => item.segmentId === source.segmentId,
                  );
                  return (
                    <div key={source.segmentId} className="flex items-start justify-between gap-3">
                      <dt>{source.label}</dt>
                      <dd className="text-end text-fg-3">
                        {result?.error
                          ? "Unavailable"
                          : result
                            ? `${result.stored} stored · ${result.duplicates} unchanged`
                            : busy
                              ? "Collecting"
                              : "Not collected"}
                      </dd>
                    </div>
                  );
                })}
              </dl>
              <p>
                {status?.lastBackfillAt
                  ? `Last collection ${formatRelative(status.lastBackfillAt)}.`
                  : "No completed collection reported."}{" "}
                Sources are polled every ten minutes; the graph refreshes every two minutes.
              </p>
              {collection.isError && (
                <p role="alert" className="text-danger-fg">
                  {collection.error.message}
                </p>
              )}
              {collect.isError && (
                <p role="alert" className="text-danger-fg">
                  {collect.error.message}
                </p>
              )}
              <p role="status" className="text-fg-3">
                {busy
                  ? "A collection cycle is running. This can take time while media is embedded."
                  : status?.lastBackfill
                    ? `Last cycle: ${status.lastBackfill.stored} stored, ${status.lastBackfill.duplicates} unchanged, ${status.lastBackfill.skippedLanguage + status.lastBackfill.skippedQuality} rejected. ${status.lastBackfill.errors.length} source errors.`
                    : collect.isSuccess
                      ? "Collection accepted. Waiting for updated status."
                      : ""}
              </p>
              {status?.lastErrors && status.lastErrors.length > 0 && (
                <ul className="space-y-1 rounded-lg bg-sunken p-3" aria-label="Collection errors">
                  {status.lastErrors.map((error, index) => (
                    <li key={`${error.segmentId}:${index}`} className="break-words">
                      {error.segmentId}: {error.message}
                    </li>
                  ))}
                </ul>
              )}
              {unconfigured && <DbNotice />}
            </div>
          </Dialog>
        </Suspense>
      )}
    </>
  );
}
