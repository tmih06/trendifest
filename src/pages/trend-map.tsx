import {
  Badge,
  Button,
  Dialog,
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
  Radio,
  RefreshCw,
  Sun,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { TrendMap, TrendMapNode } from "../../shared/types.ts";
import { DbNotice } from "@/components/db-notice";
import { TrendGraphCanvas } from "@/components/trend-graph-canvas";
import { useTheme } from "@/hooks/use-app";
import { useCollectionStatus, useCollectNow, useTrendMap } from "@/hooks/use-trends";
import { formatRelative } from "@/lib/format";
import type { GraphLink, GraphNode } from "@/lib/graph";

const WINDOWS = [
  { hours: 24, label: "24h" },
  { hours: 72, label: "3d" },
  { hours: 168, label: "7d" },
] as const;
const NO_EMPHASIS = new Set<string>();

/** Keep labels short on the canvas; the inspector retains the complete API label. */
function toCanvas(map: TrendMap) {
  const nodes: GraphNode[] = map.nodes.map((node) => {
    const label = node.label.replace(/\s+/g, " ").trim();
    return {
      id: node.id,
      kind: node.kind,
      label:
        node.kind === "pattern" && label.length > 46 ? `${label.slice(0, 45).trimEnd()}…` : label,
      description: node.description,
      radius: node.radius * 0.6,
      degree: map.edges.filter((edge) => edge.source === node.id || edge.target === node.id).length,
      hub: node.kind !== "pattern",
    };
  });
  const links: GraphLink[] = map.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    relation: edge.relation,
    similarity: edge.similarity,
  }));
  return { nodes, links };
}

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
              <dt className="text-[11px] text-fg-3">Independent authors</dt>
              <dd className="mono mt-1 text-[17px] text-fg">{score.authors}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-fg-3">Collected posts</dt>
              <dd className="mono mt-1 text-[17px] text-fg">{score.posts}</dd>
            </div>
          </dl>
          <div className="space-y-2.5">
            {[
              { label: "Reach", value: score.reach },
              { label: "Velocity", value: score.velocity },
              { label: "Audience spread", value: score.spread },
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
            Evidence multiplier ×{score.confidence.toFixed(2)}. Five independent authors are needed
            for the full score. This is a ranking heuristic, not a prediction.
          </p>
        </>
      ) : (
        <p className="text-[12px] leading-5 text-fg-3">
          {node.posts.toLocaleString()} posts observed. Audience hubs have no trend score.
        </p>
      )}
      {node.kind === "pattern" && (
        <section className="border-t border-line pt-4" aria-label="Source posts">
          <h4 className="label-caps mb-2">Source posts</h4>
          {node.examples?.length ? (
            <ul className="space-y-2">
              {node.examples.map((example) => (
                <li key={example.uri} className="rounded-lg border border-line p-2.5">
                  <div className="mb-1 flex items-center justify-between gap-2 text-[10.5px] text-fg-3">
                    <span className="min-w-0 truncate">
                      {example.authorHandle ? `@${example.authorHandle}` : "Unknown handle"}
                    </span>
                    <Badge>{example.kind}</Badge>
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
                    Open source post
                    <ArrowUpRight className="size-3" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-fg-3">No source posts available in this window.</p>
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
  const [audience, setAudience] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [desktopInspector, setDesktopInspector] = useState(true);
  const [mobileInspector, setMobileInspector] = useState(false);
  const [narrow, setNarrow] = useState(() => window.matchMedia("(max-width: 1199px)").matches);
  const map = useTrendMap(hours);
  const collection = useCollectionStatus();
  const collect = useCollectNow();
  const data = map.data;
  const canvas = useMemo(() => (data ? toCanvas(data) : { nodes: [], links: [] }), [data]);
  const selected = data?.nodes.find((node) => node.id === selectedId) ?? null;
  const connectedIds = useMemo(() => {
    if (!audience) return new Set(canvas.nodes.map((node) => node.id));
    const hubId = `segment:${audience}`;
    return new Set([
      hubId,
      ...canvas.links.filter((edge) => edge.source === hubId).map((edge) => edge.target),
    ]);
  }, [audience, canvas]);
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
  const audienceLabel =
    data?.coverage.find((row) => row.segmentId === audience)?.label ?? "All audiences";
  const status = collection.data;
  const busy = collect.isPending || status?.backfilling === true;
  const live = status?.configured === true && status.tailConnected;
  const statusLabel = collection.isError
    ? "Status unavailable"
    : !status
      ? "Connecting"
      : !status.configured
        ? "Database required"
        : live
          ? "Live feed"
          : busy
            ? "Collecting"
            : "Feed disconnected";
  const unconfigured =
    map.error instanceof Error && "code" in map.error && map.error.code === "database_unconfigured";

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1199px)");
    const update = () => setNarrow(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    setSelectedId(null);
  }, [hours]);

  /** Filtering only changes emphasis; it must not restart the force simulation. */
  function chooseAudience(id: string | null) {
    setAudience(id);
    setSelectedId(null);
    setNavOpen(false);
  }

  /** Both the ranked list and canvas open the same details, including on narrow screens. */
  function selectNode(id: string | null) {
    setSelectedId(id);
    if (id) {
      if (!connectedIds.has(id)) setAudience(null);
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
      <SidebarSection label="Workspace" collapsed={rail}>
        <SidebarItem
          icon={<Network />}
          active={!audience}
          collapsed={rail}
          onClick={() => chooseAudience(null)}
          count={data?.nodes.filter((node) => node.kind === "pattern").length}
          title="All audiences"
        >
          Trend graph
        </SidebarItem>
      </SidebarSection>
      <SidebarSection label="Audience feeds" collapsed={rail}>
        {(data?.coverage ?? []).map((row) => (
          <SidebarItem
            key={row.segmentId}
            icon={row.segmentId === "discover" ? <Radio /> : <Circle className="size-3" />}
            active={audience === row.segmentId}
            collapsed={rail}
            onClick={() => chooseAudience(row.segmentId)}
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
        <Button
          variant="ghost"
          square
          aria-label="Close pattern inspector"
          onClick={() => {
            setDesktopInspector(false);
            setMobileInspector(false);
          }}
        >
          <PanelRight />
        </Button>
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
                    {node.authors} authors
                    <span className="mx-1" aria-hidden="true">
                      ·
                    </span>
                    {node.posts} posts
                  </span>
                </span>
                <PotentialBadge node={node} />
              </button>
            </li>
          ))}
        </ol>
        {data && patterns.length === 0 && (
          <p className="p-4 text-[12px] leading-5 text-fg-3">
            No patterns observed for this audience in this window. Try a wider window or collect
            more posts.
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
              aria-label="Open audience sidebar"
              onClick={() => setNavOpen(true)}
            >
              <Menu />
            </Button>
            <div className="flex min-w-0 items-center gap-2">
              <Network className="size-4 text-fg-3" aria-hidden="true" />
              <h1 className="text-[13px] font-medium">Trend graph</h1>
              <ChevronRight className="header-breadcrumb size-3 text-fg-4" aria-hidden="true" />
              <span className="header-breadcrumb max-w-40 truncate text-[12px] text-fg-3">
                {audienceLabel}
              </span>
            </div>
            <div className="ms-auto flex items-center gap-1.5">
              <span className="header-live">
                <Badge dot tone={live ? "ok" : "neutral"}>
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
        }
      >
        <div id="graph-workspace" tabIndex={-1} className="graph-workspace">
          <section
            className="graph-surface relative min-h-0 min-w-0 overflow-hidden"
            aria-label="Trend graph"
            aria-describedby="graph-description"
          >
            <p id="graph-description" className="sr-only">
              Collected patterns connected to audience feeds. Larger pattern nodes have higher
              emergence scores. Use the pattern inspector to select nodes with the keyboard.
            </p>
            <div className="graph-toolbar pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-wrap items-start justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-fg-2">{audienceLabel}</p>
                <p className="mt-1 text-[11px] text-fg-3">
                  {data ? `${patterns.length} patterns in view` : "Connecting to collected signals"}
                </p>
              </div>
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
            </div>
            {canvas.nodes.length > 0 && (
              <TrendGraphCanvas
                theme={theme}
                nodes={canvas.nodes}
                links={canvas.links}
                selectedId={selectedId}
                activeIds={connectedIds}
                emphasisIds={NO_EMPHASIS}
                showContextLabels={false}
                labelHubsAlways
                autoFitSelection={false}
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
                  Choose another audience or collect more posts.
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
              <span className="rounded bg-surface/90 px-1">Larger node · higher potential</span>
            </div>
          </section>
          {desktopInspector && (
            <aside
              className="graph-inspector min-h-0 min-w-0 border border-line bg-surface"
              aria-label="Pattern inspector"
            >
              {inspector}
            </aside>
          )}
        </div>
      </Shell>
      <Dialog open={navOpen} onOpenChange={setNavOpen} title="Audience feeds" size="sm">
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
            Solid edges mean an audience feed observed a pattern. Dashed edges connect patterns with
            similar embedding centroids, compared only within the same model, modality, and native
            dimension.
          </p>
          <p>
            Similarity links use cosine thresholds of 0.75 for text and 0.78 for images or audio.
            Each pattern has at most three similarity links. These are affinity heuristics, not
            probabilities or proof that two posts mean the same thing.
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
            The weighted result is reduced when evidence is limited. Five independent authors are
            needed for the full score. Larger pattern nodes have higher scores; audience hubs carry
            no score. Connections do not inflate the score.
          </p>
          <p className="rounded-lg bg-sunken p-3">
            {data?.method.velocityComparable
              ? "Velocity compares distinct authors in the latest and preceding six-hour windows."
              : "Velocity stays neutral until at least twelve hours of observation history are available."}
          </p>
          <p className="text-[11px] text-fg-3">
            Audience feeds are collection contexts, not verified viewer demographics. Feed selection
            cannot prove a poster’s age.
          </p>
        </div>
      </Dialog>
      <Dialog
        open={collectionOpen}
        onOpenChange={setCollectionOpen}
        title="Collection status"
        description="Live social feeds, local embeddings, and your Postgres database."
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
            <span>Bluesky feed</span>
            <Badge tone={live ? "ok" : "neutral"} dot>
              {statusLabel}
            </Badge>
          </div>
          <p>
            {status?.lastBackfillAt
              ? `Last collection ${formatRelative(status.lastBackfillAt)}.`
              : "No completed collection reported."}{" "}
            The graph refreshes every two minutes; feed status refreshes separately.
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
                ? `Last completed cycle: processed ${status.lastBackfill.stored} posts and ${status.lastBackfill.vectors} vectors. ${status.lastBackfill.errors.length} feed errors.`
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
    </>
  );
}
