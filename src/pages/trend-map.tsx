import {
  Badge,
  Button,
  Shell,
  Sidebar,
  SidebarItem,
  SidebarSection,
  cn,
} from "@trendifest/opendesk";
// Each icon is imported through its own public subpath. The package root
// re-exports every icon module (over two thousand), so a barrel import makes
// the dev server prebundle and serve all of them for the sixteen drawn below.
import Activity from "lucide-react/icons/activity";
import ArrowUpRight from "lucide-react/icons/arrow-up-right";
import ChevronRight from "lucide-react/icons/chevron-right";
import Circle from "lucide-react/icons/circle";
import Database from "lucide-react/icons/database";
import Home from "lucide-react/icons/home";
import Info from "lucide-react/icons/info";
import Menu from "lucide-react/icons/menu";
import Moon from "lucide-react/icons/moon";
import Network from "lucide-react/icons/network";
import PanelLeftClose from "lucide-react/icons/panel-left-close";
import PanelLeftOpen from "lucide-react/icons/panel-left-open";
import PanelRight from "lucide-react/icons/panel-right";
import RefreshCw from "lucide-react/icons/refresh-cw";
import Sun from "lucide-react/icons/sun";
import ListOrdered from "lucide-react/icons/list-ordered";
import Users from "lucide-react/icons/users";
import X from "lucide-react/icons/x";
import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { SocialSource, TopicExample, TrendMapNode } from "../../shared/types.ts";
import { DbNotice } from "@/components/db-notice";
import { ThemeToggle, useThemeToggle } from "@/components/motion/theme-toggle";
import { TrendGraphCanvas } from "@/components/trend-graph-canvas";
import { TopicBoard } from "@/components/topic-board";
import { useCollectionStatus, useCollectNow, useTrendMap } from "@/hooks/use-trends";
import { compactNumber, formatRelative, topicSearchText } from "@/lib/format";
import { toCanvas } from "@/lib/graph";
import { VIEWER_SEGMENTS } from "../../shared/segments.ts";
import { useWatchlists } from "@/hooks/use-watchlists.ts";
import type { WatchDraft } from "../../shared/intelligence.ts";

const Dialog = lazy(() =>
  import("@trendifest/opendesk/dialog").then((module) => ({ default: module.Dialog })),
);

/** Selected-topic analysis stays off the landing and initial graph entry path. */
const TopicIntelligencePanel = lazy(() =>
  import("@/components/topic-intelligence").then((module) => ({
    default: module.TopicIntelligencePanel,
  })),
);

const TopicReviewPanel = lazy(() =>
  import("@/components/topic-review").then((module) => ({ default: module.TopicReviewPanel })),
);

const WatchlistPanel = lazy(() =>
  import("@/components/watchlist-panel").then((module) => ({ default: module.WatchlistPanel })),
);
const TopicArchivePanel = lazy(() =>
  import("@/components/topic-intelligence").then((module) => ({
    default: module.TopicArchivePanel,
  })),
);

/** Review code and paginated evidence load only after an explicit disclosure. */
function TopicReviewDisclosure({
  topicId,
  hours,
  onChanged,
}: {
  topicId: string;
  hours: number;
  onChanged: (topicId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="mt-4 border-t border-line pt-3"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="min-h-8 cursor-pointer text-[12px] font-medium text-fg">
        Review topic grouping
      </summary>
      {open && (
        <Suspense
          fallback={
            <p role="status" className="text-[12px] text-fg-3">
              Loading review controls…
            </p>
          }
        >
          <TopicReviewPanel topicId={topicId} hours={hours} onChanged={onChanged} />
        </Suspense>
      )}
    </details>
  );
}

/** Default to a week so a topic reported days ago is still inside the window. */
const DEFAULT_HOURS = 168;

const WINDOWS = [
  { hours: 24, label: "24h", text: "24 hours" },
  { hours: 72, label: "3d", text: "3 days" },
  { hours: DEFAULT_HOURS, label: "7d", text: "7 days" },
] as const;

/** Beyond this age the rendered map no longer describes the current window. */
const STALE_MAP_MINUTES = 15;

/** The entire graph renders; only this many ranking rows occupy the DOM at once. */
const TOPIC_PAGE_SIZE = 80;

/** Source roles follow the collection catalog rather than a second hardcoded list. */
const NEWS_SOURCES: ReadonlySet<SocialSource> = new Set(
  VIEWER_SEGMENTS.filter((segment) => segment.evidenceType === "news").map(
    (segment) => segment.source,
  ),
);

/** A heuristic score, deliberately not formatted as a probability. */
function PotentialBadge({ node }: { node: TrendMapNode }) {
  return (
    <Badge tone={node.potential >= 60 ? "ok" : "neutral"} className="mono">
      {node.potential}
      <span className="text-fg-3">/100</span>
    </Badge>
  );
}

/** One measured count; `undefined` is unmeasured, never zero. */
function Metric({ label, value }: { label: string; value: string | number | undefined }) {
  return (
    <div>
      <dt className="text-[11px] text-fg-3">{label}</dt>
      {value === undefined ? (
        <dd className="mt-1 text-[11px] leading-5 text-fg-3">Not measured</dd>
      ) : (
        <dd className="mono mt-1 text-[17px] text-fg">{value}</dd>
      )}
    </div>
  );
}

function EvidenceCard({ example, sourceLabel }: { example: TopicExample; sourceLabel: string }) {
  const byline =
    example.evidenceType === "news"
      ? (example.publisher ?? sourceLabel)
      : (example.authorHandle ?? "Unknown account");
  const excerpt =
    example.title && example.text.startsWith(example.title)
      ? example.text.slice(example.title.length).trim()
      : example.text;
  return (
    <li className="rounded-lg border border-line p-2.5">
      <div className="mb-1 flex items-start justify-between gap-2 text-[10.5px] text-fg-3">
        <span className="min-w-0 flex-1 break-words">{byline}</span>
        {(example.evidenceType === "discussion" || byline !== sourceLabel) && (
          <Badge className="shrink-0">{sourceLabel}</Badge>
        )}
      </div>
      <p className="break-words text-[11.5px] leading-5 text-fg-2">
        {example.title || "Untitled record"}
      </p>
      {excerpt && (
        <p className="mt-1 line-clamp-3 break-words text-[11px] leading-5 text-fg-3">{excerpt}</p>
      )}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] text-fg-3">
        <span>
          {example.evidenceType === "news" ? "News report" : "Community post"} ·{" "}
          {example.timeKind === "published" ? "published" : "latest activity"}{" "}
          {formatRelative(example.publishedAt)}
        </span>
        {example.mediaCount > 0 && (
          <span>
            {example.mediaCount} attachment{example.mediaCount === 1 ? "" : "s"}
          </span>
        )}
      </div>
      <a
        href={example.permalink}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex min-h-6 items-center gap-1 text-[11px] text-fg underline underline-offset-4"
      >
        {example.evidenceType === "news" ? "Open the report" : "Open the original post"}
        <ArrowUpRight className="size-3" aria-hidden="true" />
      </a>
    </li>
  );
}

/** The selected topic's evidence stays readable without interpreting the canvas. */
function NodeDetail({
  node,
  sourceLabels,
}: {
  node: TrendMapNode;
  sourceLabels: ReadonlyMap<string, string>;
}) {
  const score = node.score;
  const discussion = node.examples.filter((example) => example.evidenceType === "discussion");
  const news = node.examples.filter((example) => example.evidenceType === "news");
  const labelFor = (example: TopicExample) =>
    sourceLabels.get(example.source) ??
    sourceLabels.get(example.segments[0] ?? "") ??
    example.source;
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 break-words text-[13px] font-medium leading-5 text-fg">
          {node.label}
        </h3>
        <PotentialBadge node={node} />
      </div>
      <p className="text-[12px] leading-5 text-fg-3">{node.description}</p>
      <dl className="grid grid-cols-2 gap-3 rounded-lg bg-sunken p-3">
        <Metric label="Community posts" value={node.discussionPosts} />
        <Metric label="News reports" value={node.newsPosts} />
        <Metric label="Community accounts" value={node.authors} />
        <Metric label="Publishers" value={node.publishers} />
        <Metric
          label="Likes"
          value={node.likes === undefined ? undefined : compactNumber(node.likes)}
        />
        <Metric
          label="Reposts + quotes"
          value={node.shares === undefined ? undefined : compactNumber(node.shares)}
        />
      </dl>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-fg-3">
        <span>First seen {formatRelative(node.firstSeenAt)}</span>
        <span aria-hidden="true">·</span>
        <span>Last seen {formatRelative(node.lastSeenAt)}</span>
        {node.mediaCount > 0 && (
          <>
            <span aria-hidden="true">·</span>
            <span>
              {node.mediaCount} attachment{node.mediaCount === 1 ? "" : "s"}
            </span>
          </>
        )}
      </div>
      <div className="space-y-2.5">
        {[
          { label: "Reach", value: score.reach },
          { label: "New evidence", value: score.velocity },
          { label: "Source spread", value: score.spread },
          { label: "Persistence", value: score.persistence },
          { label: "Evidence diversity", value: score.diversity },
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
        Evidence multiplier ×{score.confidence.toFixed(2)}. One account posting repeatedly, or the
        same headline copied across sites, cannot carry a topic on its own. Accounts on different
        sources are not verified distinct people.
      </p>
      {node.examples.length > 0 ? (
        <div className="space-y-4 border-t border-line pt-4">
          <p className="text-[11px] leading-5 text-fg-3">
            A bounded selection of supporting records, not the full set. Each link opens the
            original source and keeps its attribution.
          </p>
          {discussion.length > 0 && (
            <section aria-label="Community posts in this topic">
              <h4 className="label-caps mb-2">Discussion posts</h4>
              <ul className="space-y-2">
                {discussion.map((example) => (
                  <EvidenceCard
                    key={example.uri}
                    example={example}
                    sourceLabel={labelFor(example)}
                  />
                ))}
              </ul>
            </section>
          )}
          {news.length > 0 && (
            <section aria-label="News reports in this topic">
              <h4 className="label-caps mb-2">News reports</h4>
              <p className="mb-2 text-[11px] leading-5 text-fg-3">
                Headlines count as publisher evidence. They are never counted as community people or
                reactions.
              </p>
              <ul className="space-y-2">
                {news.map((example) => (
                  <EvidenceCard
                    key={example.uri}
                    example={example}
                    sourceLabel={labelFor(example)}
                  />
                ))}
              </ul>
            </section>
          )}
        </div>
      ) : (
        <p className="border-t border-line pt-4 text-[11px] leading-5 text-fg-3">
          No supporting record was included in this payload.
        </p>
      )}
    </div>
  );
}

/** Reset evidence scroll on selection without remounting focused topic buttons. */
function TopicInspectorBody({
  topicId,
  pageKey,
  children,
}: {
  topicId: string | null;
  pageKey: string;
  children: ReactNode;
}) {
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (body.current) body.current.scrollTop = 0;
  }, [topicId, pageKey]);
  return (
    <div ref={body} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      {children}
    </div>
  );
}

/** One graph workspace: collection controls and evidence live beside the graph, never on separate routes. */
export function TrendMapPage({ onNavigateHome }: { onNavigateHome?: () => void } = {}) {
  const { isDark, toggle: toggleTheme } = useThemeToggle({ start: "top-down" });
  const theme = isDark ? "dark" : "light";
  const [hours, setHours] = useState<number>(DEFAULT_HOURS);
  const [view, setView] = useState<"graph" | "board" | "watchlists">("graph");
  const [watchDraft, setWatchDraft] = useState<WatchDraft | null>(null);
  const [archiveTopicId, setArchiveTopicId] = useState<string | null>(null);
  const workspaceHeading = useRef<HTMLHeadingElement>(null);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [topicQuery, setTopicQuery] = useState("");
  const [requestedTopicPage, setRequestedTopicPage] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [desktopInspector, setDesktopInspector] = useState(true);
  const [mobileInspector, setMobileInspector] = useState(false);
  const [narrow, setNarrow] = useState(() => window.matchMedia("(max-width: 1199px)").matches);
  const [dialogsEnabled, setDialogsEnabled] = useState(false);
  // A minute tick lets the staleness warning appear without waiting for a
  // refetch; the map itself still refreshes on its own query interval.
  const [now, setNow] = useState(() => Date.now());
  const map = useTrendMap(hours);
  const collection = useCollectionStatus();
  const collect = useCollectNow();
  const data = map.data;
  const selected = data?.nodes.find((node) => node.id === selectedId) ?? null;
  const watches = useWatchlists(collection.data?.configured === true);
  /**
   * A source is a filter over each topic's own collection contexts. Topics carry
   * `segments`, and there are no source nodes and no observation edges, so this
   * reads topic provenance directly instead of walking graph links.
   */
  const visibleIds = useMemo(() => {
    const all = new Set((data?.nodes ?? []).map((node) => node.id));
    if (!sourceId) return all;
    return new Set(
      (data?.nodes ?? []).filter((node) => node.segments.includes(sourceId)).map((node) => node.id),
    );
  }, [data, sourceId]);
  /**
   * A source filter narrows the drawn topics to those whose own `segments`
   * include it; there are no source nodes to filter through. `toCanvas` drops
   * links to topics that are no longer drawn, so the canvas, the ranked list and
   * the footer count always describe one set. obi-graph seeds surviving nodes
   * from their previous positions, so switching sources does not scatter the
   * map into a fresh random layout.
   */
  const canvas = useMemo(
    () =>
      data
        ? toCanvas({ ...data, nodes: data.nodes.filter((node) => visibleIds.has(node.id)) })
        : { nodes: [], links: [] },
    [data, visibleIds],
  );
  // The projection's canonical potential/id order also defines stored ranks.
  // Filtering must not silently renumber ranks used by movement comparisons.
  const rankById = useMemo(
    () => new Map((data?.nodes ?? []).map((node, index) => [node.id, index + 1])),
    [data],
  );
  const topics = useMemo(
    () => (data?.nodes ?? []).filter((node) => visibleIds.has(node.id)),
    [data, visibleIds],
  );
  const searchableTopics = useMemo(
    () =>
      topics.map((node) => ({
        node,
        rank: rankById.get(node.id)!,
        text: topicSearchText(node.label),
      })),
    [topics, rankById],
  );
  const matchingTopics = useMemo(() => {
    const query = topicSearchText(topicQuery).trim();
    return query ? searchableTopics.filter((item) => item.text.includes(query)) : searchableTopics;
  }, [searchableTopics, topicQuery]);
  const lastTopicPage = Math.max(0, Math.ceil(matchingTopics.length / TOPIC_PAGE_SIZE) - 1);
  const topicPage = Math.min(requestedTopicPage, lastTopicPage);
  const topicPageStart = topicPage * TOPIC_PAGE_SIZE;
  const pageTopics = matchingTopics.slice(topicPageStart, topicPageStart + TOPIC_PAGE_SIZE);
  const relatedTopics = useMemo(
    () =>
      (data?.edges ?? [])
        .flatMap((edge) => {
          if (!selectedId) return [];
          const otherId =
            edge.source === selectedId
              ? edge.target
              : edge.target === selectedId
                ? edge.source
                : null;
          const node = data?.nodes.find((item) => item.id === otherId && visibleIds.has(item.id));
          return node ? [{ node, similarity: edge.similarity }] : [];
        })
        .sort((a, b) => b.similarity - a.similarity),
    [data, selectedId, visibleIds],
  );
  const sourceLabels = useMemo(() => {
    const labels = new Map<string, string>();
    for (const row of data?.coverage ?? []) {
      labels.set(row.segmentId, row.label);
      labels.set(row.source, row.label);
    }
    return labels;
  }, [data]);
  const sourceLabel =
    data?.coverage.find((row) => row.segmentId === sourceId)?.label ?? "All sources";
  const windowText = WINDOWS.find((window) => window.hours === hours)?.text ?? `${hours} hours`;
  const stats = data?.stats;
  const stale =
    data !== undefined && now - Date.parse(data.generatedAt) > STALE_MAP_MINUTES * 60_000;
  const status = collection.data;
  const progress = status?.progress;
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
  const viewLabel =
    view === "watchlists"
      ? "Watchlists & alerts"
      : view === "board"
        ? "Topic board"
        : "Trend graph";
  const inspectorVisible =
    view !== "watchlists" && desktopInspector && !narrow && (view === "graph" || selected !== null);
  const unconfigured =
    map.error instanceof Error && "code" in map.error && map.error.code === "database_unconfigured";

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    document.title = `${viewLabel} — Trendifest`;
  }, [viewLabel]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1199px)");
    const update = () => setNarrow(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  // Load accessible modal behavior only after the first dialog request. Keep
  // it mounted afterward so closing transitions and focus restoration finish.
  useEffect(() => {
    if (navOpen || aboutOpen || collectionOpen || mobileInspector || archiveTopicId)
      setDialogsEnabled(true);
  }, [navOpen, aboutOpen, collectionOpen, mobileInspector, archiveTopicId]);

  useEffect(() => {
    setSelectedId(null);
  }, [hours]);

  // A topic that leaves the current window or filter must not stay selected.
  useEffect(() => {
    if (selectedId && !visibleIds.has(selectedId)) setSelectedId(null);
  }, [selectedId, visibleIds]);

  /** A source filter narrows the drawn topics; it never fabricates source nodes. */
  function chooseSource(id: string | null) {
    setSourceId(id);
    setRequestedTopicPage(0);
    setTopicQuery("");
    setSelectedId(null);
    setNavOpen(false);
  }

  /** Views share the query and filters; navigation does not fetch another map. */
  function chooseView(next: "graph" | "board" | "watchlists") {
    setView(next);
    setNavOpen(false);
    window.requestAnimationFrame(() => workspaceHeading.current?.focus());
  }

  /** Both the ranked list and canvas open the same details, including on narrow screens. */
  function selectNode(id: string | null) {
    setSelectedId(id);
    if (id) {
      if (!visibleIds.has(id)) setSourceId(null);
      if (narrow) setMobileInspector(true);
      else setDesktopInspector(true);
    }
  }

  /** A Follow action edits a real persistent rule; it never silently enables one. */
  function follow(draft: WatchDraft) {
    setWatchDraft(draft);
    setSelectedId(null);
    setMobileInspector(false);
    chooseView("watchlists");
  }

  /** Retained notifications remain inspectable even outside the visible sample. */
  function openWatchedTopic(id: string) {
    if (!data?.nodes.some((node) => node.id === id)) {
      setArchiveTopicId(id);
      return;
    }
    setSourceId(null);
    chooseView("board");
    selectNode(id);
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
            icon={isDark ? <Sun /> : <Moon />}
            collapsed={rail}
            onClick={toggleTheme}
            title={isDark ? "Switch to light theme" : "Switch to dark theme"}
          >
            {isDark ? "Light appearance" : "Dark appearance"}
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
          active={view === "graph"}
          collapsed={rail}
          onClick={() => chooseView("graph")}
          count={data?.nodes.length}
          title="Trend graph"
        >
          Trend graph
        </SidebarItem>
        <SidebarItem
          icon={<ListOrdered />}
          active={view === "board"}
          collapsed={rail}
          onClick={() => chooseView("board")}
          count={data?.nodes.length}
          title="Topic board"
        >
          Topic board
        </SidebarItem>
        <SidebarItem
          icon={<Activity />}
          active={view === "watchlists"}
          collapsed={rail}
          onClick={() => chooseView("watchlists")}
          count={watches.unread || undefined}
          title="Watchlists and alerts"
        >
          Watchlists &amp; alerts
        </SidebarItem>
      </SidebarSection>
      <SidebarSection label="Sources" collapsed={rail}>
        <SidebarItem
          icon={<Circle className="size-3" />}
          active={!sourceId}
          collapsed={rail}
          onClick={() => chooseSource(null)}
          title="All collected sources"
        >
          All sources
        </SidebarItem>
        {(data?.coverage ?? []).map((row) => (
          <SidebarItem
            key={row.segmentId}
            icon={<Circle className="size-3" />}
            active={sourceId === row.segmentId}
            collapsed={rail}
            onClick={() => chooseSource(row.segmentId)}
            count={row.posts}
            title={
              row.error
                ? `${row.label}: ${row.error}`
                : `${row.label} — ${NEWS_SOURCES.has(row.source) ? "news publisher feed" : "community discussion feed"}`
            }
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
            {selected ? "Topic details" : "Top topics"}
          </h2>
          <p className="mt-0.5 text-[10.5px] text-fg-3">
            {selected
              ? "Evidence behind this topic"
              : `${topics.length} topics · last ${windowText}`}
          </p>
        </div>
        {selected && (
          <Button
            variant="ghost"
            square
            aria-label="Clear topic selection"
            onClick={() => {
              setSelectedId(null);
              if (view === "board") setMobileInspector(false);
            }}
          >
            <X />
          </Button>
        )}
      </div>
      {view === "graph" && (
        <div className="shrink-0 border-b border-line px-3 py-2">
          <label className="mb-1 block text-[11px] text-fg-3">
            Search ranked topics
            <input
              type="search"
              value={topicQuery}
              onChange={(event) => {
                setTopicQuery(event.target.value);
                setRequestedTopicPage(0);
              }}
              placeholder="Event, product or model"
              className="mt-1 block w-full rounded-md border border-line bg-surface px-2.5 py-2 text-base text-fg placeholder:text-fg-3 xl:text-[12px]"
            />
          </label>
          <nav
            aria-label="Topic ranking pages"
            className="mt-2 flex items-center justify-between gap-2"
          >
            <Button
              variant="ghost"
              disabled={topicPage === 0}
              onClick={() => setRequestedTopicPage(topicPage - 1)}
            >
              Previous
            </Button>
            <span role="status" className="mono text-center text-[10.5px] text-fg-3">
              {matchingTopics.length === 0
                ? "0 matches"
                : `${topicPageStart + 1}–${topicPageStart + pageTopics.length} of ${matchingTopics.length}`}
            </span>
            <Button
              variant="ghost"
              disabled={topicPage >= lastTopicPage}
              onClick={() => setRequestedTopicPage(topicPage + 1)}
            >
              Next
            </Button>
          </nav>
        </div>
      )}
      <TopicInspectorBody
        topicId={selected?.id ?? null}
        pageKey={`${sourceId}:${hours}:${topicQuery}:${topicPage}`}
      >
        {selected && (
          <div className="border-b border-line p-4">
            <NodeDetail node={selected} sourceLabels={sourceLabels} />
            <Button
              className="mt-3"
              variant="secondary"
              onClick={() =>
                follow({ kind: "topic", targetId: selected.id, label: selected.label })
              }
            >
              Follow topic
            </Button>
            <Suspense
              fallback={
                <p role="status" className="mt-4 text-[12px] text-fg-3">
                  Loading topic intelligence…
                </p>
              }
            >
              <TopicIntelligencePanel
                key={`${selected.id}:${hours}`}
                node={selected}
                hours={hours}
                entities={data?.entities ?? []}
              />
            </Suspense>
            <TopicReviewDisclosure
              key={`review:${selected.id}:${hours}`}
              topicId={selected.id}
              hours={hours}
              onChanged={selectNode}
            />
            <div className="mt-4 border-t border-line pt-4">
              <h3 className="label-caps mb-2">Related topics</h3>
              {relatedTopics.length === 0 ? (
                <p className="text-[11px] leading-5 text-fg-3">
                  No displayed topic shares a measured relationship with this one. A missing link is
                  not evidence that the topics are unrelated.
                </p>
              ) : (
                <ul className="space-y-1">
                  {relatedTopics.map(({ node, similarity }) => (
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
                          title="Measured semantic similarity between the two topics"
                        >
                          {similarity.toFixed(3)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
        {view === "graph" && (
          <ol className="p-2" aria-label="Topics ranked by potential">
            {pageTopics.map(({ node, rank }) => (
              <li key={node.id}>
                <button
                  type="button"
                  className={cn(
                    "topic-row group flex w-full items-start gap-2.5 rounded-lg px-2.5 py-3 text-start hover:bg-hover",
                    selectedId === node.id && "bg-active",
                  )}
                  aria-pressed={selectedId === node.id}
                  onClick={() => selectNode(selectedId === node.id ? null : node.id)}
                >
                  <span className="mono pt-0.5 text-[10.5px] text-fg-3">
                    {String(rank).padStart(2, "0")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 block break-words text-[12px] leading-[18px] text-fg-2 group-hover:text-fg">
                      {node.label}
                    </span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-x-1 text-[10.5px] text-fg-3">
                      {node.discussionPosts > 0 && (
                        <>
                          <Users className="size-3" aria-hidden="true" />
                          <span>Accounts: {node.authors}</span>
                          <span aria-hidden="true">·</span>
                          <span>Posts: {node.discussionPosts}</span>
                        </>
                      )}
                      {node.newsPosts > 0 && (
                        <>
                          {node.discussionPosts > 0 && <span aria-hidden="true">·</span>}
                          <span>News: {node.newsPosts}</span>
                          <span aria-hidden="true">·</span>
                          <span>Publishers: {node.publishers}</span>
                        </>
                      )}
                    </span>
                  </span>
                  <PotentialBadge node={node} />
                </button>
              </li>
            ))}
          </ol>
        )}
        {view === "graph" && topicQuery.trim() && matchingTopics.length === 0 && (
          <div className="p-4 text-[12px] leading-5 text-fg-3">
            <p>No ranked topic matches “{topicQuery}”. The graph is unchanged.</p>
            <Button
              variant="ghost"
              onClick={() => {
                setTopicQuery("");
                setRequestedTopicPage(0);
              }}
            >
              Clear search
            </Button>
          </div>
        )}
        {data && topics.length === 0 && (
          <p className="p-4 text-[12px] leading-5 text-fg-3">
            {sourceId
              ? "No topic in this window includes this source."
              : "No topic groups were formed from the posts in this window."}
          </p>
        )}
      </TopicInspectorBody>
      <div className="shrink-0 space-y-1 border-t border-line px-4 py-3 text-[10.5px] leading-4 text-fg-3">
        <details>
          <summary className="cursor-pointer font-medium text-fg-2">Map limits and scoring</summary>
          <div className="mt-2 space-y-1">
            <p>
              Bigger nodes have higher potential — a heuristic from evidence support and growth, not
              a probability. Colour tracks measured related links.
            </p>
            {stats?.limited && (
              <p>
                Up to 1,500 topics are shown from a bounded recent corpus. Some evidence or
                lower-ranked topics may be omitted.
              </p>
            )}
            {data && !data.method.velocityComparable && (
              <p>New-evidence scoring stays neutral until twelve hours of history exist.</p>
            )}
          </div>
        </details>
        {stats && stats.pendingEmbeddings > 0 && (
          <p>
            {stats.pendingEmbeddings} collected post
            {stats.pendingEmbeddings === 1 ? " is" : "s are"} still awaiting embeddings; topics may
            grow as they finish.
          </p>
        )}
        {data && stale && (
          <p className="text-fg-2">
            This map was computed {formatRelative(data.generatedAt)}. Refresh, or check collection
            status; the newest posts may be missing.
          </p>
        )}
      </div>
    </div>
  );

  const emptyState = (() => {
    if (!data || topics.length > 0) return null;
    if (sourceId) {
      return {
        title: `No topics from ${sourceLabel} in this window`,
        body: "Other sources may still have topics. Clear the filter to see every topic, or widen the window.",
        action: (
          <Button className="pointer-events-auto mt-4" onClick={() => chooseSource(null)}>
            Show all sources
          </Button>
        ),
      };
    }
    if (stats && stats.posts > 0) {
      return {
        title: "No topic groups yet",
        body:
          stats.pendingEmbeddings > 0
            ? `${stats.posts} posts are collected and ${stats.pendingEmbeddings} still await embeddings. Topics appear as those vectors finish.`
            : `${stats.posts} collected posts did not form any specific topic group in this window. Try a wider window or collect more.`,
        action: (
          <Button className="pointer-events-auto mt-4" onClick={() => setCollectionOpen(true)}>
            Collection status
          </Button>
        ),
      };
    }
    return {
      title: `No collected posts in the last ${windowText}`,
      body: "Collection may be paused, or every source failed this cycle. Check collection status to see which feeds reported.",
      action: (
        <Button className="pointer-events-auto mt-4" onClick={() => setCollectionOpen(true)}>
          Collection status
        </Button>
      ),
    };
  })();

  // `toCanvas` already dropped links whose endpoints are outside the filter.
  const relatedLinkCount = canvas.links.length;

  return (
    <>
      <a className="skip-link" href="#graph-workspace">
        {view === "board" ? "Skip to topic board" : "Skip to graph"}
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
              {view === "board" ? (
                <ListOrdered className="size-4 text-fg-3" aria-hidden="true" />
              ) : (
                <Network className="size-4 text-fg-3" aria-hidden="true" />
              )}
              <h1 ref={workspaceHeading} tabIndex={-1} className="text-[13px] font-medium">
                {viewLabel}
              </h1>
              <ChevronRight className="header-breadcrumb size-3 text-fg-4" aria-hidden="true" />
              <span className="header-breadcrumb max-w-40 truncate text-[12px] text-fg-3">
                {sourceLabel}
              </span>
            </div>
            <div className="ms-auto flex items-center gap-1.5">
              <ThemeToggle
                className="size-7 rounded-md text-fg-3 hover:text-fg hover:bg-chrome-hover transition-colors"
                iconClassName="size-3.5"
                start="top-down"
              />
              {onNavigateHome && (
                <Button
                  variant="secondary"
                  size="xs"
                  aria-label="Về trang giới thiệu"
                  onClick={onNavigateHome}
                  className="gap-1 text-[11px] me-1"
                >
                  <Home className="size-3" />
                  <span className="hidden sm:inline">Trang chủ</span>
                </Button>
              )}
              <span className="header-live">
                <Badge dot tone={healthy ? "ok" : "neutral"}>
                  {statusLabel}
                </Badge>
              </span>
              <Button
                variant="ghost"
                square
                aria-label={view === "board" ? "Refresh topics" : "Refresh the map"}
                disabled={map.isFetching}
                onClick={() => void map.refetch()}
              >
                <RefreshCw />
              </Button>
              <Button
                variant="ghost"
                square
                aria-label="How topics and potential work"
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
            className={cn(
              "graph-surface relative min-h-0 min-w-0 overflow-hidden",
              view !== "graph" && "flex flex-col",
            )}
            aria-label={viewLabel}
            aria-describedby="graph-description"
          >
            <p id="graph-description" className="sr-only">
              {view === "watchlists" ? (
                "Persistent topic and entity watches with publication-backed evidence alerts. Rules apply across all sources; notifications retain their original observation time."
              ) : view === "board" ? (
                "Specific topics ranked by heuristic potential. Select a title or View evidence to inspect source records. Source and time filters match the graph."
              ) : (
                <>
                  Graph of specific topics collected from Vietnamese sources. Each node is one topic
                  — an event, product, or model version — and each line is a measured relationship
                  between two topics. Larger nodes have higher heuristic potential. Use the ranked
                  topic list in the inspector for keyboard navigation and full evidence.
                </>
              )}
            </p>
            <div
              className={cn(
                "graph-toolbar z-20 flex shrink-0 flex-wrap items-start justify-between gap-3 p-4",
                view === "graph"
                  ? "pointer-events-none absolute inset-x-0 top-0"
                  : "relative border-b border-line",
              )}
            >
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-fg-2">
                  {view === "watchlists"
                    ? "All-source watches · in-app notifications"
                    : sourceLabel}
                </p>
                <p className="mt-1 max-w-[36ch] text-[11px] text-fg-3">
                  {data
                    ? sourceId
                      ? `${topics.length} of ${data.nodes.length} topics from ${sourceLabel} · last ${windowText}`
                      : `${topics.length} topic${topics.length === 1 ? "" : "s"} · last ${windowText}`
                    : "Connecting to collected signals"}
                </p>
                {data && (stale || (stats?.pendingEmbeddings ?? 0) > 0 || stats?.limited) && (
                  <p className="mt-1 flex max-w-[42ch] flex-wrap items-center gap-1 text-[10.5px] text-fg-3">
                    {stale && <Badge>Stale · {formatRelative(data.generatedAt)}</Badge>}
                    {(stats?.pendingEmbeddings ?? 0) > 0 && (
                      <Badge>
                        {stats?.pendingEmbeddings} post
                        {stats?.pendingEmbeddings === 1 ? "" : "s"} awaiting embeddings
                      </Badge>
                    )}
                    {stats?.limited && <Badge>Bounded sample</Badge>}
                  </p>
                )}
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
                      title={`Last ${window.text}`}
                      onClick={() => {
                        setHours(window.hours);
                        setRequestedTopicPage(0);
                      }}
                    >
                      {window.label}
                    </Button>
                  ))}
                </div>
                {(view === "graph" || selected) && (
                  <Button
                    variant="ghost"
                    square
                    aria-label="Toggle topic inspector"
                    aria-expanded={narrow ? mobileInspector : desktopInspector}
                    onClick={() =>
                      narrow
                        ? setMobileInspector(!mobileInspector)
                        : setDesktopInspector(!desktopInspector)
                    }
                  >
                    <PanelRight />
                  </Button>
                )}
              </div>
            </div>
            {view === "graph" && canvas.nodes.length > 0 && (
              <TrendGraphCanvas
                theme={theme}
                nodes={canvas.nodes}
                links={canvas.links}
                selectedId={selectedId}
                activeIds={visibleIds}
                onSelect={selectNode}
              />
            )}
            {view === "board" && data && topics.length > 0 && (
              <div className="min-h-0 flex-1">
                <TopicBoard
                  key={`${sourceId}:${hours}`}
                  topics={topics}
                  selectedId={selectedId}
                  entities={data.entities}
                  rankById={rankById}
                  sourceLabels={sourceLabels}
                  generatedAt={data.generatedAt}
                  limited={data.stats.limited}
                  detailsOpen={inspectorVisible}
                  onSelect={selectNode}
                  onWatchTopic={(node) =>
                    follow({ kind: "topic", targetId: node.id, label: node.label })
                  }
                  onWatchEntity={(entity) =>
                    follow({ kind: "entity", targetId: entity.id, label: entity.label })
                  }
                />
              </div>
            )}
            {view === "watchlists" && data && (
              <div className="min-h-0 flex-1 overflow-y-auto">
                <Suspense
                  fallback={
                    <p role="status" className="p-4 text-sm text-fg-3">
                      Loading watchlists…
                    </p>
                  }
                >
                  <WatchlistPanel
                    topics={data.nodes}
                    entities={data.entities}
                    draft={watchDraft}
                    onDraftConsumed={() => setWatchDraft(null)}
                    onSelectTopic={openWatchedTopic}
                  />
                </Suspense>
              </div>
            )}
            {map.isLoading && (
              <div className="graph-state" role="status">
                <Activity className="size-5 text-fg-3" aria-hidden="true" />
                <p>Grouping collected posts into topics…</p>
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
                  {data ? "Refresh failed. Showing the last computed topics." : map.error.message}
                </p>
                <Button onClick={() => void map.refetch()}>Try again</Button>
              </div>
            )}
            {view !== "watchlists" && emptyState && !map.isError && (
              <div className="graph-empty">
                <Network className="mx-auto mb-3 size-6 text-fg-3" aria-hidden="true" />
                <p className="text-[13px] font-medium">{emptyState.title}</p>
                <p className="mx-auto mt-1 max-w-[46ch] text-[12px] leading-5 text-fg-3">
                  {emptyState.body}
                </p>
                {emptyState.action}
              </div>
            )}
            {view === "graph" && (
              <div className="graph-footer pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-[10.5px] text-fg-3">
                <span>
                  {data ? (
                    <>
                      {relatedLinkCount} related-topic link
                      {relatedLinkCount === 1 ? "" : "s"}
                      <span className="footer-updated">
                        {" "}
                        · computed {formatRelative(data.generatedAt)}
                      </span>
                    </>
                  ) : (
                    "Waiting for data"
                  )}
                </span>
                <span className="graph-legend flex flex-wrap items-center gap-x-3 gap-y-1 rounded bg-surface/90 px-1.5 py-1">
                  <span className="flex items-center gap-1" aria-hidden="true">
                    <span className="graph-legend-dot" style={{ width: 5, height: 5 }} />
                    <span className="graph-legend-dot" style={{ width: 9, height: 9 }} />
                    <span className="graph-legend-dot" style={{ width: 13, height: 13 }} />
                  </span>
                  <span>size · topic potential</span>
                  <span className="flex items-center gap-1" aria-hidden="true">
                    <span className="graph-legend-swatch" data-level="1" />
                    <span className="graph-legend-swatch" data-level="2" />
                    <span className="graph-legend-swatch" data-level="3" />
                  </span>
                  <span>colour · related links</span>
                  <span className="flex items-center gap-1" aria-hidden="true">
                    <span className="graph-legend-line" />
                  </span>
                  <span>line · measured link</span>
                </span>
              </div>
            )}
          </section>
          <aside
            className="graph-inspector min-h-0 min-w-0 border border-line bg-surface"
            aria-label="Topic inspector"
            data-open={inspectorVisible}
            inert={!inspectorVisible}
            aria-hidden={!inspectorVisible}
          >
            {inspector}
          </aside>
        </div>
      </Shell>
      {dialogsEnabled && (
        <Suspense fallback={null}>
          <Dialog open={navOpen} onOpenChange={setNavOpen} title="Workspace and sources" size="sm">
            <div className="mobile-sidebar">{sidebar(false)}</div>
          </Dialog>
          <Dialog
            open={archiveTopicId !== null}
            onOpenChange={(open) => {
              if (!open) setArchiveTopicId(null);
            }}
            title="Retained topic evidence"
          >
            {archiveTopicId && (
              <Suspense fallback={<p role="status">Loading retained evidence…</p>}>
                <TopicArchivePanel key={archiveTopicId} topicId={archiveTopicId} />
              </Suspense>
            )}
          </Dialog>
          <Dialog
            open={mobileInspector && narrow}
            onOpenChange={setMobileInspector}
            title="Topic inspector"
            size="sm"
          >
            <div className="mobile-inspector">{inspector}</div>
          </Dialog>
          <Dialog
            open={aboutOpen}
            onOpenChange={setAboutOpen}
            title="How topics and potential work"
            description="Specific topics grouped from collected evidence, ranked by a transparent heuristic."
          >
            <div className="space-y-4 text-[12.5px] leading-5 text-fg-2">
              <section className="space-y-1.5">
                <h3 className="text-[12.5px] font-medium text-fg">Where topics come from</h3>
                <p>
                  Each dot is one specific topic: an event, a product, or a model version that
                  several collected posts describe. Posts are grouped by semantic similarity in a
                  multilingual embedding space, and posts that only share a broad category or forum
                  chatter stay separate. Several independent posts about the same model reinforce
                  one bigger topic; different products or versions remain different topics.
                </p>
                <p>
                  Grouping is a heuristic over a sampled collection, not a census of Vietnamese
                  discussion. An event that happened but was not collected cannot appear.
                </p>
              </section>
              <section className="space-y-1.5">
                <h3 className="text-[12.5px] font-medium text-fg">What the lines mean</h3>
                <p>
                  A line joins two distinct topics with a measured semantic relationship plus
                  supporting anchors. Each topic has at most three. No line is drawn merely because
                  two posts came from the same site, and an absent line is not evidence that two
                  topics are unrelated.
                </p>
              </section>
              <section className="space-y-1.5">
                <h3 className="text-[12.5px] font-medium text-fg">How potential is scored</h3>
                <dl className="space-y-2">
                  {Object.entries(
                    data?.method.weights ?? {
                      reach: 0.3,
                      velocity: 0.25,
                      spread: 0.2,
                      persistence: 0.15,
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
                  The weighted result is reduced while evidence is thin, so one account posting
                  repeatedly — or one headline copied across sites — cannot outrank a topic with
                  several independent posts. Node size follows potential; meaning in the graph never
                  depends on colour alone.
                </p>
                <p className="rounded-lg bg-sunken p-3">
                  {data?.method.velocityComparable
                    ? "New evidence compares consecutive six-hour windows of collection, not verified new publications. Forum timestamps can reflect thread activity."
                    : "New-evidence scoring stays neutral until at least twelve hours of observation history exist, so a young map does not fake a spike."}
                </p>
              </section>
              <section className="space-y-1.5">
                <h3 className="text-[12.5px] font-medium text-fg">What counts as evidence</h3>
                <p>
                  Discussion posts and news reports are shown separately. A news headline counts as
                  a publisher source; it is never counted as a community person, a like, or a
                  reaction. Likes and reposts appear only as measured counters — an unmeasured
                  counter is shown as not measured, never as zero.
                </p>
                <p className="text-[11px] text-fg-3">
                  {data
                    ? `Grouped with ${data.method.topicModel} at a ${data.method.groupingThreshold.toFixed(2)} similarity floor, method version ${data.method.version}.`
                    : "Grouping model details appear once the map loads."}{" "}
                  Source links in the inspector are evidence for a topic; sources are never graph
                  nodes.
                </p>
              </section>
              <p className="text-[11px] text-fg-3">
                {!stats
                  ? "Embedding status appears once the map loads."
                  : stats.pendingEmbeddings > 0
                    ? `${stats.pendingEmbeddings} collected posts still await embeddings; topics may grow and their counts may rise.`
                    : stats.posts > 0
                      ? "Every collected post in this window has a topic embedding."
                      : "No posts are collected in this window."}{" "}
                Collection is sampled and bounded, so this map does not promise complete internet
                coverage.
              </p>
            </div>
          </Dialog>
          <Dialog
            open={collectionOpen}
            onOpenChange={setCollectionOpen}
            title="Collection status"
            description="Vietnamese source polling, bounded local inference, and Postgres storage."
            footer={
              <Button
                variant="primary"
                icon={<RefreshCw />}
                loading={busy}
                disabled={!status?.configured}
                onClick={() => collect.mutate(500)}
              >
                Collect now
              </Button>
            }
          >
            <div className="space-y-4 text-[12px] leading-5 text-fg-2">
              <div className="flex items-center justify-between gap-3">
                <span>Source polling</span>
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
                      <dt>
                        {source.label}
                        <span className="ms-1.5 text-[10.5px] text-fg-3">
                          {NEWS_SOURCES.has(source.source) ? "news" : "discussion"}
                        </span>
                      </dt>
                      <dd className="text-end text-fg-3">
                        {result?.error
                          ? result.stored + result.duplicates > 0
                            ? `Partial · ${result.stored} stored · ${result.duplicates} unchanged`
                            : "Unavailable"
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
              <p className="text-fg-3">
                Each cycle examines up to 500 records per source; only accepted Vietnamese evidence
                is stored. Publisher news remains separate from community discussion.
              </p>
              <p>
                {status?.lastBackfillAt
                  ? `Last collection ${formatRelative(status.lastBackfillAt)}.`
                  : "No completed collection reported."}{" "}
                Sources are polled every ten minutes; the graph refreshes every two minutes.
              </p>
              {progress?.note && (
                <p className="rounded-lg bg-sunken p-3 text-fg-3">{progress.note}</p>
              )}
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
                  ? progress
                    ? `${progress.current ? `${sourceLabels.get(progress.current) ?? progress.current}: ` : ""}${progress.phase}. ${progress.segmentsDone}/${progress.segments} sources processed; ${progress.fetched} records fetched, ${progress.stored} stored, ${progress.duplicates} unchanged, ${progress.rejected} rejected.`
                    : "A collection cycle is running. New records are being collected and embedded."
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
