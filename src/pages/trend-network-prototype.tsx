import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  Bell,
  BellPlus,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  Download,
  Eye,
  Filter,
  FlaskConical,
  GitBranch,
  Image,
  Layers3,
  ListFilter,
  Moon,
  Network,
  Pause,
  Play,
  Plus,
  Radio,
  Radar,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sun,
  TrendingUp,
  Users,
  Video,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  MockForecastChart,
  MockNetworkGraph,
  MockSparkline,
  PrototypeArtwork,
} from "@/components/trend-network-prototype-graph";
import { useTheme } from "@/hooks/use-app";
import { cn } from "@/lib/utils";
import {
  evidenceFor,
  MOCK_PATTERNS,
  REPLAY_LABELS,
  type MockEvidence,
  type MockPattern,
  type PatternStage,
  type SampleSource,
} from "./trend-network-prototype.data";
import "./trend-network-prototype.css";

// Three structurally different mock workspaces on #/prototype/trend-network,
// shareable via ?variant=A (radar), B (canvas), or C (editorial brief).
type Variant = "A" | "B" | "C";
type Section = "radar" | "monitoring" | "sources";
type InspectorView = "meaning" | "evidence" | "outlook";
const VARIANTS: { key: Variant; name: string }[] = [
  { key: "A", name: "Radar" },
  { key: "B", name: "Canvas" },
  { key: "C", name: "Editorial" },
];
const SOURCES: SampleSource[] = ["Bluesky", "Reddit", "Short-video lab"];
const number = new Intl.NumberFormat("en");

/** Read the existing hash-router query convention without adding a routing dependency. */
function readVariant(): Variant {
  const value = new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("variant");
  return value === "B" || value === "C" ? value : "A";
}

/** Replay stages intentionally stay qualitative; they are not model classifications. */
function stageAt(pattern: MockPattern, phase: number): PatternStage {
  if (phase === 0 || pattern.stage === "Nascent") return "Nascent";
  if (phase === 1) return "Emerging";
  if (phase === 2 && pattern.stage === "Saturating") return "Spreading";
  return pattern.stage;
}

/** A score expresses a synthetic ranking, never a probability of becoming viral. */
function StageBadge({ stage }: { stage: PatternStage }) {
  return (
    <span className={cn("pattern-stage", `stage-${stage.toLowerCase()}`)}>
      <span className="tiny-dot" />
      {stage}
    </span>
  );
}

/** Compact mock source marks use letters instead of implying authorized platform integrations. */
function SourceMarks({ sources }: { sources: SampleSource[] }) {
  return (
    <span className="source-marks" aria-label={sources.join(", ")}>
      {sources.map((source) => (
        <span
          key={source}
          title={`${source} — simulated`}
          className={`source-mark source-${source === "Bluesky" ? "b" : source === "Reddit" ? "r" : "v"}`}
        >
          {source === "Short-video lab" ? <Video size={10} aria-hidden="true" /> : source[0]}
        </span>
      ))}
    </span>
  );
}

interface CandidateListProps {
  patterns: MockPattern[];
  selected: string;
  onSelect: (id: string) => void;
  monitored: Set<string>;
  signals: Record<string, number>;
  onReset: () => void;
}

/** Every candidate is a native button; the selected state survives layout changes. */
function CandidateList({
  patterns,
  selected,
  onSelect,
  monitored,
  signals,
  onReset,
}: CandidateListProps) {
  return (
    <section className="candidate-panel" aria-label="Emerging pattern candidates">
      <div className="candidate-heading">
        <h2>
          Early candidates <span>{patterns.length}</span>
        </h2>
        <span className="eyebrow">Now</span>
      </div>
      {patterns.length ? (
        <div className="candidate-list">
          {patterns.map((pattern, index) => (
            <button
              key={pattern.id}
              className={cn("candidate", selected === pattern.id && "selected")}
              onClick={() => onSelect(pattern.id)}
              aria-pressed={selected === pattern.id}
            >
              <div className="candidate-top">
                <span className="candidate-rank">{String(index + 1).padStart(2, "0")}</span>
                <StageBadge stage={pattern.stage} />
                {monitored.has(pattern.id) && <Bell size={12} aria-label="Monitored" />}
                <span className="candidate-score">
                  {pattern.score}
                  <span>/100</span>
                </span>
              </div>
              <h3>{pattern.name}</h3>
              <p>{pattern.subtitle}</p>
              <div className="candidate-bottom">
                <div>
                  <span className="candidate-growth">
                    <ArrowUpRight size={13} aria-hidden="true" />
                    {pattern.growth}%
                  </span>
                  <span className="candidate-creators">
                    {number.format(pattern.creators[3]! + (signals[pattern.id] ?? 0) * 3)} creators
                  </span>
                </div>
                <MockSparkline values={pattern.creators} muted={pattern.stage === "Saturating"} />
              </div>
              <div className="candidate-source">
                <SourceMarks sources={pattern.sources} />
                <span>
                  First seen{" "}
                  {pattern.age < 24 ? `${pattern.age}h` : `${Math.floor(pattern.age / 24)}d`} ago
                </span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="mock-empty">
          <Search size={24} />
          <h3>No matching patterns</h3>
          <p>Try a broader phrase or clear the filters.</p>
          <Button variant="outline" size="sm" onClick={onReset}>
            Clear filters
          </Button>
        </div>
      )}
      <div className="candidate-footnote">
        <FlaskConical size={13} aria-hidden="true" />
        <span>Current snapshot · fictional patterns</span>
      </div>
    </section>
  );
}

interface InspectorProps {
  pattern: MockPattern;
  phase: number;
  node: MockEvidence | undefined;
  view: InspectorView;
  onView: (view: InspectorView) => void;
  monitored: boolean;
  onMonitor: () => void;
  onConfigure: () => void;
  onEvidence: () => void;
  signals: number;
  horizon: string;
}

/** Keep the evidence, inferred interpretation and hypothetical outlook visibly distinct. */
function PatternInspector({
  pattern,
  phase,
  node,
  view,
  onView,
  monitored,
  onMonitor,
  onConfigure,
  onEvidence,
  signals,
  horizon,
}: InspectorProps) {
  const creators = pattern.creators[phase]! + (phase === 3 ? signals * 3 : 0);
  const communities = Math.min(pattern.communities.length, phase + 1);
  return (
    <aside className="pattern-inspector" aria-label="Pattern inspector">
      <div className="inspector-kicker">
        <span className="eyebrow">{node ? "Evidence inspector" : "Pattern intelligence"}</span>
        <span className="mock-label">
          <Sparkles size={11} aria-hidden="true" />
          Mock analysis
        </span>
      </div>
      <div className="inspector-title">
        <StageBadge stage={stageAt(pattern, phase)} />
        <h2>{node?.label ?? pattern.name}</h2>
        <p>
          {node
            ? `${node.source} · ${node.kind} · ${node.observed ? "Observed reference" : "Inferred relationship"}`
            : pattern.subtitle}
        </p>
      </div>
      {!node && (
        <div className="emergence-meter">
          <div>
            <span>Emergence score</span>
            <strong>
              {pattern.score}
              <small>/100</small>
            </strong>
          </div>
          <div className="meter-track">
            <span style={{ width: `${pattern.score}%` }} />
          </div>
          <p>Illustrative ranking, not a breakout probability.</p>
        </div>
      )}
      <div className="inspector-tabs" role="group" aria-label="Inspector content">
        {(
          [
            ["meaning", "Meaning"],
            ["evidence", "Evidence"],
            ["outlook", "Outlook"],
          ] as const
        ).map(([key, label]) => (
          <button key={key} aria-pressed={view === key} onClick={() => onView(key)}>
            {label}
          </button>
        ))}
      </div>
      <div className="inspector-body">
        {view === "meaning" && (
          <>
            <h3>What connects these examples?</h3>
            <p>{pattern.meaning}</p>
            <div className="meaning-note">
              <GitBranch size={15} aria-hidden="true" />
              <p>{pattern.difference}</p>
            </div>
            <div className="inspector-tags">
              {pattern.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
            <h3 className="spaced-heading">The repeatable structure</h3>
            <p className="format-description">{pattern.format}</p>
          </>
        )}
        {view === "evidence" && (
          <>
            <div className="evidence-preview">
              <PrototypeArtwork pattern={pattern} alternate={node?.id === "remix"} />
              <span>Illustrative artwork · not a source post</span>
            </div>
            <blockquote>“{pattern.captions[node?.id === "remix" ? 1 : 0]}”</blockquote>
            <div className="evidence-method">
              <ShieldCheck size={15} aria-hidden="true" />
              <span>
                {node?.observed
                  ? "The attachment is observed. Its family membership is inferred."
                  : "Proposed relationship based on matching structure and context."}
              </span>
            </div>
            <Button variant="outline" size="sm" className="w-full" onClick={onEvidence}>
              <Eye />
              Inspect example & reasoning
            </Button>
          </>
        )}
        {view === "outlook" && (
          <>
            <div className="outlook-heading">
              <h3>Could it spread further?</h3>
              <span className="plain-tag">{horizon}</span>
            </div>
            <MockForecastChart pattern={pattern} phase={phase} />
            <div className="chart-key">
              <span>
                <i />
                Sample history
              </span>
              <span>
                <i className="dashed" />
                Hypothetical future
              </span>
            </div>
            <p>{pattern.outlook}</p>
            <div className="outlook-caution">
              <CircleHelp size={15} aria-hidden="true" />
              <p>{pattern.caution}</p>
            </div>
            <p className="small-note">
              No trained model or calibrated confidence. This is a visual scenario.
            </p>
          </>
        )}
      </div>
      <div className="inspector-stats">
        <div>
          <Users size={14} aria-hidden="true" />
          <strong>{number.format(creators)}</strong>
          <span>Creators</span>
        </div>
        <div>
          <Network size={14} aria-hidden="true" />
          <strong>{communities}</strong>
          <span>Communities</span>
        </div>
        <div>
          <Clock3 size={14} aria-hidden="true" />
          <strong>{Math.round((pattern.age * phase) / 3)}h</strong>
          <span>Elapsed since first</span>
        </div>
      </div>
      <div className="inspector-actions">
        <Button onClick={onMonitor} variant={monitored ? "outline" : "default"}>
          {monitored ? <Check /> : <BellPlus />}
          {monitored ? "Stop monitoring" : "Monitor pattern"}
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="Configure pattern alert"
          onClick={onConfigure}
        >
          <Settings2 />
        </Button>
      </div>
    </aside>
  );
}

interface WorkspaceProps {
  candidateList: ReactNode;
  graph: ReactNode;
  inspector: ReactNode;
  timeline: ReactNode;
  activity: ReactNode;
  pattern: MockPattern;
  onSelect: (id: string) => void;
  phase: number;
}

/** A: triage starts with a ranked list, then a bounded graph and detailed interpretation. */
function RadarVariant({ candidateList, graph, inspector, timeline, activity }: WorkspaceProps) {
  return (
    <div className="radar-workspace">
      {candidateList}
      <div className="network-column">
        {graph}
        {timeline}
        {activity}
      </div>
      {inspector}
    </div>
  );
}

/** B: spatial exploration gets the full canvas; candidate navigation becomes a horizontal rail. */
function CanvasVariant({ candidateList, graph, inspector, timeline, activity }: WorkspaceProps) {
  return (
    <div className="canvas-workspace">
      <div className="canvas-main">
        {graph}
        {timeline}
      </div>
      {inspector}
      <div className="canvas-candidates">{candidateList}</div>
      <div className="canvas-activity">{activity}</div>
    </div>
  );
}

/** C: an editorial briefing puts a readable argument and source examples ahead of the graph. */
function EditorialVariant({
  pattern,
  phase,
  onSelect,
  inspector,
  graph,
  timeline,
  activity,
}: WorkspaceProps) {
  return (
    <div className="editorial-workspace">
      <article className="editorial-lead">
        <span className="eyebrow">The early signal / 001</span>
        <h2>{pattern.name}</h2>
        <p className="editorial-deck">{pattern.subtitle}</p>
        <p>{pattern.meaning}</p>
        <div className="editorial-examples">
          {pattern.captions.slice(0, 2).map((caption, index) => (
            <figure key={caption}>
              <PrototypeArtwork pattern={pattern} alternate={index === 1} />
              <figcaption>
                “{caption}”
                <span>
                  Fictional example {index + 1} · {pattern.sources[index % pattern.sources.length]}
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
        <div className="editorial-takeaway">
          <Sparkles size={18} aria-hidden="true" />
          <div>
            <h3>Why this is worth watching</h3>
            <p>{pattern.outlook}</p>
          </div>
        </div>
        <div className="editorial-runners">
          <h3>Elsewhere on the radar</h3>
          {MOCK_PATTERNS.filter((item) => item.id !== pattern.id)
            .slice(0, 3)
            .map((item) => (
              <button key={item.id} onClick={() => onSelect(item.id)}>
                <span>
                  {item.name}
                  <small>{item.creators[phase]} sample creators</small>
                </span>
                <span>
                  {item.score}
                  <ArrowUpRight size={15} />
                </span>
              </button>
            ))}
        </div>
      </article>
      {inspector}
      <div className="editorial-network">
        {graph}
        {timeline}
      </div>
      {activity}
    </div>
  );
}

/** Shared dev-only switcher; arrows never steal input, dialog or composite-control keys. */
function PrototypeSwitcher({
  variant,
  onChange,
}: {
  variant: Variant;
  onChange: (variant: Variant) => void;
}) {
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        event.shiftKey ||
        !(target instanceof HTMLElement) ||
        target.closest("input, textarea, select, [contenteditable], [role=dialog], [role=slider]")
      )
        return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const index = VARIANTS.findIndex((item) => item.key === variant);
      changeRef.current(VARIANTS[(index + (event.key === "ArrowRight" ? 1 : 2)) % 3]!.key);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [variant]);
  if (!import.meta.env.DEV) return null;
  const index = VARIANTS.findIndex((item) => item.key === variant);
  return (
    <div className="prototype-switcher" role="group" aria-label="Prototype layout variations">
      <span className="switcher-caption">
        <FlaskConical size={13} aria-hidden="true" />
        Layout study
      </span>
      <button aria-label="Previous layout" onClick={() => onChange(VARIANTS[(index + 2) % 3]!.key)}>
        <ChevronLeft size={16} />
      </button>
      <span className="switcher-name">
        {variant}
        <span>{VARIANTS[index]!.name}</span>
      </span>
      <button aria-label="Next layout" onClick={() => onChange(VARIANTS[(index + 1) % 3]!.key)}>
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

/** Entire workspace is an in-memory mock. No network source, API mutation or model is connected. */
export function TrendNetworkPrototype() {
  const { theme, toggle } = useTheme();
  const [variant, setVariant] = useState<Variant>(readVariant);
  const [section, setSection] = useState<Section>("radar");
  const [selectedId, setSelectedId] = useState("side-quest");
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<SampleSource | "All sources">("All sources");
  const [stage, setStage] = useState("All stages");
  const [sort, setSort] = useState("emergence");
  const [phase, setPhase] = useState(3);
  const [playing, setPlaying] = useState(false);
  const [inferred, setInferred] = useState(true);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [view, setView] = useState<InspectorView>("meaning");
  const [monitored, setMonitored] = useState(new Set(["polite-crashout"]));
  const [signals, setSignals] = useState<Record<string, number>>({});
  const [pausedSources, setPausedSources] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState("");
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [configureOpen, setConfigureOpen] = useState(false);
  const [horizon, setHorizon] = useState("72 hours");
  const [threshold, setThreshold] = useState(70);
  const [settings, setSettings] = useState<Record<string, { horizon: string; threshold: number }>>(
    {},
  );
  const [dismissedAlerts, setDismissedAlerts] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const lastSection = useRef(section);
  const filtered = MOCK_PATTERNS.filter(
    (pattern) =>
      (source === "All sources" || pattern.sources.includes(source)) &&
      (stage === "All stages" || pattern.stage === stage) &&
      `${pattern.name} ${pattern.subtitle} ${pattern.tags.join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  ).toSorted((a, b) =>
    sort === "newest" ? a.age - b.age : sort === "growth" ? b.growth - a.growth : b.score - a.score,
  );
  const pattern =
    filtered.find((item) => item.id === selectedId) ??
    filtered[0] ??
    MOCK_PATTERNS.find((item) => item.id === selectedId) ??
    MOCK_PATTERNS[0]!;
  const filteredIds = filtered.map((item) => item.id).join("|");
  const node =
    evidenceFor(pattern).find((item) => item.id === selectedNode) ??
    (selectedNode === "new-signal"
      ? {
          id: "new-signal",
          label: "A new independent remix",
          detail: "New simulated adoption",
          kind: "video" as const,
          source: pattern.sources[0]!,
          x: 15,
          y: 51,
          appears: 3,
          observed: false,
        }
      : undefined);
  const signalCount = signals[pattern.id] ?? 0;
  const currentHorizon = settings[pattern.id]?.horizon ?? "72 hours";
  const activeSources = pattern.sources.filter((item) => !pausedSources.has(item));
  const mockAdoptions = MOCK_PATTERNS.reduce(
    (sum, item) => sum + item.creators[3]! + (signals[item.id] ?? 0) * 3,
    0,
  );
  const communityCount = new Set(MOCK_PATTERNS.flatMap((item) => item.communities)).size;
  const earlyCount = MOCK_PATTERNS.filter((item) => item.stage !== "Saturating").length;
  const watchCount = MOCK_PATTERNS.filter((item) => item.score >= 70).length;

  useEffect(() => {
    document.title = "Early signals — Trendifest prototype";
    const sync = () => setVariant(readVariant());
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(
      () =>
        setPhase((current) => {
          if (current >= 3) {
            setPlaying(false);
            return 3;
          }
          return current + 1;
        }),
      1600,
    );
    return () => window.clearInterval(timer);
  }, [playing]);

  useEffect(() => {
    if (lastSection.current === section) return;
    lastSection.current = section;
    mainRef.current?.scrollTo({ top: 0 });
    window.requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true }));
  }, [section]);

  /** Confirmations are informative, not modal; remove them before they obscure the inspector. */
  useEffect(() => {
    if (!status) return;
    const timer = window.setTimeout(() => setStatus(""), 6000);
    return () => window.clearTimeout(timer);
  }, [status]);

  /** Keep the graph and inspector aligned with the visible candidate set. */
  useEffect(() => {
    if (filteredIds && !filteredIds.split("|").includes(selectedId)) selectPattern(filtered[0]!.id);
  }, [filteredIds, selectedId]);

  /** Shareable layout selection follows the application's existing hash URL convention. */
  function changeVariant(next: Variant) {
    setVariant(next);
    setSection("radar");
    mainRef.current?.scrollTo({ top: 0 });
    window.history.replaceState(null, "", `#/prototype/trend-network?variant=${next}`);
    setStatus(
      `Layout ${next}: ${VARIANTS.find((item) => item.key === next)!.name}. Selection and monitoring are unchanged.`,
    );
  }

  /** A selection resets contextual evidence but leaves replay and monitoring intact. */
  function selectPattern(id: string) {
    setPlaying(false);
    setPhase(3);
    setSelectedId(id);
    setSelectedNode(null);
    setView("meaning");
  }

  /** Clear only discovery filters, not monitoring or the simulation history. */
  function clearFilters() {
    setQuery("");
    setSource("All sources");
    setStage("All stages");
  }

  /** Monitoring is reversible and intentionally disappears when the page reloads. */
  function toggleMonitor(id: string) {
    const name = MOCK_PATTERNS.find((item) => item.id === id)!.name;
    setMonitored((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setStatus(
      monitored.has(id)
        ? `Stopped monitoring ${name}. Select Monitor pattern to add it again.`
        : `Monitoring ${name}. This is saved only for this demo session.`,
    );
  }

  /** Add a visible, deterministic event rather than silently pretending a live feed is connected. */
  function simulateSignal() {
    setPlaying(false);
    setPhase(3);
    setSelectedNode("new-signal");
    setView("evidence");
    setSignals((current) => ({ ...current, [pattern.id]: (current[pattern.id] ?? 0) + 1 }));
    setDismissedAlerts(false);
    setStatus(
      `Simulated: three more creators adapted ${pattern.name}. A new remix node and sample activity were added.`,
    );
  }

  /** Export an actual Markdown brief with provenance and limitations, not a cosmetic success toast. */
  function exportBrief() {
    const content = `# ${pattern.name}\n\nSIMULATED PROTOTYPE — no real social posts or model predictions.\n\n${pattern.meaning}\n\n## Snapshot\n- Replay: ${REPLAY_LABELS[phase]}\n- Sample creators: ${pattern.creators[phase]! + (phase === 3 ? signalCount * 3 : 0)}\n- Emergence score: ${pattern.score}/100 (illustrative ranking, not probability)\n- Stage: ${stageAt(pattern, phase)}\n- Sources: ${pattern.sources.join(", ")} (all simulated)\n\n## Interpretation\n${pattern.difference}\n\n## Hypothetical outlook\n${pattern.outlook}\n\n## Limitation\n${pattern.caution}\n`;
    const url = URL.createObjectURL(new Blob([content], { type: "text/markdown" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `trendifest-mock-${pattern.id}.md`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus(`Exported a mock brief for ${pattern.name}.`);
  }

  /** Alert preferences affect the monitoring view and outlook horizon, never an external account. */
  function configurePattern() {
    setHorizon(settings[pattern.id]?.horizon ?? "72 hours");
    setThreshold(settings[pattern.id]?.threshold ?? 70);
    setConfigureOpen(true);
  }

  const candidateList = (
    <CandidateList
      patterns={filtered}
      selected={pattern.id}
      onSelect={selectPattern}
      monitored={monitored}
      signals={signals}
      onReset={clearFilters}
    />
  );
  const graph = (
    <MockNetworkGraph
      key={pattern.id}
      pattern={pattern}
      phase={phase}
      inferred={inferred}
      source={source}
      selected={selectedNode}
      onSelect={(id) => {
        setSelectedNode(id);
        setView(id ? "evidence" : "meaning");
      }}
      signals={signalCount}
      wide={variant === "B"}
    />
  );
  const inspector = (
    <PatternInspector
      pattern={pattern}
      phase={phase}
      node={node}
      view={view}
      onView={setView}
      monitored={monitored.has(pattern.id)}
      onMonitor={() => toggleMonitor(pattern.id)}
      onConfigure={configurePattern}
      onEvidence={() => setEvidenceOpen(true)}
      signals={signalCount}
      horizon={currentHorizon}
    />
  );
  const timeline = (
    <section className="replay-panel" aria-label="Selected pattern history replay">
      <div className="replay-heading">
        <span>
          <Clock3 size={14} aria-hidden="true" />
          Selected pattern history
        </span>
        <strong>{REPLAY_LABELS[phase]}</strong>
      </div>
      <div className="replay-controls">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={playing ? "Pause history replay" : "Play history replay"}
          onClick={() => {
            if (!playing) {
              setPhase(0);
              setSelectedNode(null);
            }
            setPlaying(!playing);
          }}
        >
          {playing ? <Pause /> : <Play />}
        </Button>
        <div className="replay-slider">
          <label htmlFor="pattern-history" className="sr-only">
            Pattern history position
          </label>
          <input
            id="pattern-history"
            type="range"
            min="0"
            max="3"
            step="1"
            value={phase}
            aria-valuetext={REPLAY_LABELS[phase]}
            onChange={(event) => {
              setPlaying(false);
              setPhase(Number(event.target.value));
              setSelectedNode(null);
            }}
          />
          <span aria-hidden="true">
            <span>First observed</span>
            <span>Current</span>
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Step forward in history"
          disabled={phase === 3}
          onClick={() => {
            setPlaying(false);
            setPhase(Math.min(3, phase + 1));
          }}
        >
          <ChevronRight />
        </Button>
      </div>
      {phase < 3 && (
        <p className="replay-note">
          Replaying {pattern.name}. The candidate list and network totals stay at the current
          snapshot.
        </p>
      )}
    </section>
  );
  const activity = (
    <section className="mock-activity">
      <div>
        <h2>
          <Radio size={14} aria-hidden="true" />
          Signal activity
        </h2>
        <span className="plain-tag">Simulated</span>
      </div>
      <div className="activity-event">
        <span className="event-marker">
          <GitBranch size={13} aria-hidden="true" />
        </span>
        <p>
          <strong>
            {signalCount && phase === 3
              ? "A new independent remix appeared"
              : phase === 3
                ? "The format crossed into a new community"
                : phase === 0
                  ? "A small pattern, not yet a trend"
                  : "New creators are adapting the format"}
          </strong>
          <span>
            {signalCount && phase === 3
              ? `+${signalCount * 3} sample creators · ${pattern.name}`
              : `${pattern.communities[Math.min(phase, pattern.communities.length - 1)]} · ${phase === 0 ? "First observation" : "Inferred from sample evidence"}`}
          </span>
        </p>
        <span className="event-time">
          {signalCount && phase === 3 ? "Just now" : REPLAY_LABELS[phase]}
        </span>
      </div>
    </section>
  );
  const workspaceProps: WorkspaceProps = {
    candidateList,
    graph,
    inspector,
    timeline,
    activity,
    pattern,
    onSelect: (id) => {
      clearFilters();
      selectPattern(id);
    },
    phase,
  };

  return (
    <div className="proto-shell">
      <a
        className="proto-skip"
        href="#prototype-main"
        onClick={(event) => {
          event.preventDefault();
          headingRef.current?.focus();
        }}
      >
        Skip to workspace
      </a>
      <aside className="proto-sidebar">
        <a
          className="proto-brand"
          href="#/prototype/trend-network"
          aria-label="Trendifest trend network prototype"
        >
          <span className="brand-symbol">
            <Network size={21} strokeWidth={1.7} />
          </span>
          <span>
            trendifest<span className="brand-period">.</span>
          </span>
        </a>
        <div className="workspace-selector">
          <span className="workspace-avatar">S</span>
          <span>
            Signals<small>Workspace</small>
          </span>
          <ChevronDown size={14} aria-hidden="true" />
        </div>
        <span className="sidebar-caption">Discover</span>
        <nav aria-label="Workspace">
          <button
            className={cn(section === "radar" && "active")}
            onClick={() => setSection("radar")}
          >
            <Radar size={17} />
            <span>Trend radar</span>
            <span className="nav-count">6</span>
          </button>
          <button
            className={cn(section === "monitoring" && "active")}
            onClick={() => setSection("monitoring")}
          >
            <Bell size={17} />
            <span>Monitoring</span>
            <span className="nav-count">{monitored.size}</span>
          </button>
          <button
            className={cn(section === "sources" && "active")}
            onClick={() => setSection("sources")}
          >
            <Layers3 size={17} />
            <span>Sources</span>
            <span className="nav-count">3</span>
          </button>
        </nav>
        <span className="sidebar-caption sidebar-second">Explore the idea</span>
        <nav aria-label="Prototype layouts">
          <button
            onClick={() => changeVariant("B")}
            className={cn(section === "radar" && variant === "B" && "layout-active")}
          >
            <Network size={17} />
            <span>Network canvas</span>
          </button>
          <button
            onClick={() => changeVariant("C")}
            className={cn(section === "radar" && variant === "C" && "layout-active")}
          >
            <ListFilter size={17} />
            <span>Signal brief</span>
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="prototype-card">
            <FlaskConical size={18} />
            <strong>A glimpse, not a prediction.</strong>
            <p>Explore an emerging-trend network with fictional data.</p>
            <span>Interactive prototype</span>
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <button className="sidebar-help">
                <CircleHelp size={16} />
                <span>How this mock works</span>
              </button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>From small signals to a bigger picture</DialogTitle>
                <DialogDescription>
                  This prototype explores a product idea. Every pattern, creator, post, source
                  count, and forecast is fictional.
                </DialogDescription>
              </DialogHeader>
              <ol className="how-it-works">
                <li>
                  <span>01</span>
                  <div>
                    <strong>Discover a pattern</strong>
                    <p>Start with an unnamed, low-volume format—not a popular keyword.</p>
                  </div>
                </li>
                <li>
                  <span>02</span>
                  <div>
                    <strong>Understand the connections</strong>
                    <p>
                      Select graph nodes to inspect shared meaning, images, sound, and community
                      crossings.
                    </p>
                  </div>
                </li>
                <li>
                  <span>03</span>
                  <div>
                    <strong>Watch it develop</strong>
                    <p>
                      Replay the history, simulate a new remix, and monitor a candidate. No accounts
                      are connected.
                    </p>
                  </div>
                </li>
              </ol>
              <DialogFooter>
                <DialogClose asChild>
                  <Button
                    onClick={() => {
                      setSection("radar");
                      setPhase(0);
                      setSelectedNode(null);
                    }}
                  >
                    Explore the first signal
                    <ArrowRight />
                  </Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <div className="sidebar-user">
            <span className="user-avatar">JD</span>
            <span>
              Demo workspace<small>Local session only</small>
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={toggle}
              aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            >
              {theme === "dark" ? <Sun /> : <Moon />}
            </Button>
          </div>
        </div>
      </aside>
      <div className="proto-main" ref={mainRef}>
        <header className="proto-topbar">
          <div>
            <span>Workspace</span>
            <ChevronRight size={13} aria-hidden="true" />
            <strong>
              {section === "radar"
                ? "Trend radar"
                : section === "monitoring"
                  ? "Monitoring"
                  : "Sources"}
            </strong>
          </div>
          <span className="topbar-right">
            <span className="prototype-chip">
              <FlaskConical size={12} aria-hidden="true" />
              Prototype
            </span>
            <span className="topbar-divider" />
            <span className="topbar-scope">Culture & internet</span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              onClick={toggle}
            >
              {theme === "dark" ? <Sun /> : <Moon />}
            </Button>
          </span>
        </header>
        <main id="prototype-main" className="proto-content">
          <div className="prototype-notice">
            <FlaskConical size={14} aria-hidden="true" />
            <span>
              <strong>Simulated workspace.</strong> All content and metrics are fictional. No social
              accounts or prediction model are connected.
            </span>
            <a href="#/overview">
              Google Trends prototype
              <ArrowUpRight size={12} aria-hidden="true" />
            </a>
          </div>
          <div className="proto-page-heading">
            <div>
              <div className="page-eyebrow">
                <span className="tiny-dot" />
                EARLY SIGNAL INTELLIGENCE
              </div>
              <h1 ref={headingRef} tabIndex={-1}>
                {section === "radar"
                  ? "Before everyone’s talking."
                  : section === "monitoring"
                    ? "Keep the interesting ones close."
                    : "Know what you’re seeing."}
              </h1>
              <p>
                {section === "radar"
                  ? "Spot the patterns forming at the edges. Understand what connects them."
                  : section === "monitoring"
                    ? "Follow emerging patterns, not just rising keywords."
                    : "Coverage and provenance are part of the signal, not a footnote."}
              </p>
            </div>
            <div className="page-actions">
              {section === "radar" && filtered.length > 0 && (
                <>
                  <Button variant="outline" onClick={exportBrief}>
                    <Download />
                    Export brief
                  </Button>
                  <Button onClick={simulateSignal} disabled={!activeSources.length}>
                    <Plus />
                    Simulate signal
                  </Button>
                </>
              )}
              {section === "monitoring" && (
                <Button
                  onClick={() => {
                    setSection("radar");
                    clearFilters();
                  }}
                >
                  <Radar />
                  Discover patterns
                </Button>
              )}
            </div>
          </div>
          {section === "radar" && (
            <>
              <div className="mock-metrics">
                <div>
                  <span>
                    <Radar size={14} />
                    Pattern families
                  </span>
                  <strong>
                    6<small>{earlyCount} still early</small>
                  </strong>
                </div>
                <div>
                  <span>
                    <Users size={14} />
                    Creative adoptions
                  </span>
                  <strong>
                    {number.format(mockAdoptions)}
                    <small>Across sample families</small>
                  </strong>
                </div>
                <div>
                  <span>
                    <GitBranch size={14} />
                    Communities reached
                  </span>
                  <strong>
                    {communityCount}
                    <small>Within this mock network</small>
                  </strong>
                </div>
                <div>
                  <span>
                    <TrendingUp size={14} />
                    Signals worth watching
                  </span>
                  <strong>
                    {watchCount}
                    <small>Early, not yet mainstream</small>
                  </strong>
                </div>
              </div>
              <div className="discovery-toolbar">
                <div className="discovery-search">
                  <Search size={15} aria-hidden="true" />
                  <label htmlFor="pattern-search" className="sr-only">
                    Search patterns
                  </label>
                  <input
                    id="pattern-search"
                    type="search"
                    placeholder="Search a pattern, idea, or format…"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                  {query && (
                    <button aria-label="Clear pattern search" onClick={() => setQuery("")}>
                      <X size={14} />
                    </button>
                  )}
                </div>
                <div className="discovery-filters">
                  <label>
                    <Layers3 size={13} aria-hidden="true" />
                    <span className="sr-only">Filter source</span>
                    <select
                      aria-label="Filter source"
                      value={source}
                      onChange={(event) => {
                        setSource(event.target.value as SampleSource | "All sources");
                        setSelectedNode(null);
                      }}
                    >
                      <option>All sources</option>
                      {SOURCES.map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <Filter size={13} aria-hidden="true" />
                    <span className="sr-only">Filter lifecycle stage</span>
                    <select
                      aria-label="Filter lifecycle stage"
                      value={stage}
                      onChange={(event) => setStage(event.target.value)}
                    >
                      <option>All stages</option>
                      {["Nascent", "Emerging", "Spreading", "Saturating"].map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <ArrowDown size={13} aria-hidden="true" />
                    <span className="sr-only">Sort candidates</span>
                    <select
                      aria-label="Sort candidates"
                      value={sort}
                      onChange={(event) => setSort(event.target.value)}
                    >
                      <option value="emergence">Emergence</option>
                      <option value="newest">Newest first</option>
                      <option value="growth">Fastest growth</option>
                    </select>
                  </label>
                </div>
                <label className="inference-toggle">
                  <input
                    type="checkbox"
                    checked={inferred}
                    onChange={(event) => {
                      setInferred(event.target.checked);
                      setSelectedNode(null);
                    }}
                  />
                  Inferred links
                </label>
              </div>
              {pausedSources.size > 0 && (
                <div className="source-pause-notice">
                  <Pause size={14} />
                  <span>
                    {pausedSources.size} sample feed{pausedSources.size === 1 ? " is" : "s are"}{" "}
                    paused. Existing evidence remains visible; no new data is implied.
                  </span>
                  <button onClick={() => setSection("sources")}>
                    Review sources
                    <ArrowRight size={12} />
                  </button>
                </div>
              )}
              {filtered.length ? (
                variant === "A" ? (
                  <RadarVariant {...workspaceProps} />
                ) : variant === "B" ? (
                  <CanvasVariant {...workspaceProps} />
                ) : (
                  <EditorialVariant {...workspaceProps} />
                )
              ) : (
                <div className="full-empty">
                  <Search size={30} />
                  <h2>No patterns match these filters</h2>
                  <p>Search a broader idea or reset the source and lifecycle filters.</p>
                  <Button variant="outline" onClick={clearFilters}>
                    Clear filters
                  </Button>
                </div>
              )}
              {filtered.length > 0 && (
                <section className="lifecycle-panel">
                  <div>
                    <GitBranch size={15} aria-hidden="true" />
                    <h2>A lifecycle, not a straight line.</h2>
                  </div>
                  <div className="lifecycle-stages">
                    {["Nascent", "Emerging", "Spreading", "Saturating", "Dormant"].map(
                      (item, index) => (
                        <span
                          key={item}
                          className={cn(stageAt(pattern, phase) === item && "current")}
                        >
                          <i>{index + 1}</i>
                          {item}
                          {index < 4 && <ChevronRight size={12} aria-hidden="true" />}
                        </span>
                      ),
                    )}
                  </div>
                  <p>
                    Patterns can mutate, find a new audience, or return. Brand adoption alone does
                    not mean a trend is over.
                  </p>
                </section>
              )}
            </>
          )}
          {section === "monitoring" && (
            <div className="monitoring-layout">
              <section className="monitoring-card">
                <div className="section-heading">
                  <div>
                    <h2>Patterns on your radar</h2>
                    <p>Changes stay in this browser session. Reloading resets the mock.</p>
                  </div>
                  <span className="soft-count">{monitored.size}</span>
                </div>
                {monitored.size ? (
                  <div className="monitor-rows">
                    {MOCK_PATTERNS.filter((item) => monitored.has(item.id)).map((item) => (
                      <div className="monitor-row" key={item.id}>
                        <span className={`monitor-art art-${item.art}`}>
                          <Network size={18} />
                        </span>
                        <div>
                          <button
                            className="monitor-name"
                            onClick={() => {
                              clearFilters();
                              selectPattern(item.id);
                              setSection("radar");
                            }}
                          >
                            {item.name}
                            <ArrowUpRight size={13} />
                          </button>
                          <span>
                            Emergence ≥ {settings[item.id]?.threshold ?? 70} ·{" "}
                            {settings[item.id]?.horizon ?? "72 hours"} outlook
                          </span>
                        </div>
                        <StageBadge stage={item.stage} />
                        <MockSparkline values={item.creators} />
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Stop monitoring ${item.name}`}
                          onClick={() => toggleMonitor(item.id)}
                        >
                          <X />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mock-empty">
                    <Bell size={26} />
                    <h3>Nothing monitored yet</h3>
                    <p>Select a pattern in the radar, then choose Monitor pattern.</p>
                    <Button variant="outline" onClick={() => setSection("radar")}>
                      Open trend radar
                    </Button>
                  </div>
                )}
              </section>
              <section className="monitoring-card">
                <div className="section-heading">
                  <div>
                    <h2>Sample alerts</h2>
                    <p>Illustrative notifications, not automated detections.</p>
                  </div>
                  {!dismissedAlerts && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setDismissedAlerts(true);
                        setStatus("Sample alerts dismissed. Simulate a signal to add another.");
                      }}
                    >
                      Dismiss alerts
                    </Button>
                  )}
                </div>
                {dismissedAlerts ? (
                  <div className="mock-empty compact">
                    <Check size={24} />
                    <h3>You’re caught up</h3>
                    <p>Simulate a signal in the radar to explore another notification.</p>
                  </div>
                ) : (
                  <div className="sample-alert">
                    <span className="event-marker">
                      <GitBranch size={16} />
                    </span>
                    <div>
                      <span className="eyebrow">Community crossing · Sample alert</span>
                      <h3>
                        {signalCount ? pattern.name : "The polite crashout"} found a new audience
                      </h3>
                      <p>
                        {signalCount
                          ? "Three more fictional creators adapted the format in the latest simulation event."
                          : "The same calm-voice / chaotic-scene structure appears in the Student life cohort."}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          clearFilters();
                          selectPattern(signalCount ? pattern.id : "polite-crashout");
                          setSection("radar");
                          setView("evidence");
                        }}
                      >
                        Inspect the evidence
                        <ArrowRight />
                      </Button>
                    </div>
                  </div>
                )}
              </section>
            </div>
          )}
          {section === "sources" && (
            <div className="sources-layout">
              <section className="coverage-summary">
                <div className="coverage-symbol">
                  <Layers3 size={25} strokeWidth={1.4} />
                </div>
                <div>
                  <h2>A deliberately visible blind spot.</h2>
                  <p>
                    This is a synthetic input lab, not internet-wide monitoring. These controls
                    simulate feed availability without connecting to a platform.
                  </p>
                </div>
                <span className="plain-tag">0 connected accounts</span>
              </section>
              <div className="source-cards">
                {SOURCES.map((item, index) => (
                  <article className="source-card" key={item}>
                    <div className="source-card-top">
                      <span
                        className={`source-large source-${index === 0 ? "b" : index === 1 ? "r" : "v"}`}
                      >
                        {index === 2 ? <Video size={22} /> : item[0]}
                      </span>
                      <span className="plain-tag">Synthetic feed</span>
                    </div>
                    <h2>{item}</h2>
                    <p>
                      {index === 0
                        ? "New posts, replies, image references, and repost relationships."
                        : index === 1
                          ? "Community context, image formats, and discussions around a pattern."
                          : "Fictional clips, audio motifs, and editing patterns for exploring multimodal analysis."}
                    </p>
                    <dl>
                      <div>
                        <dt>Example coverage</dt>
                        <dd>
                          {index === 0
                            ? "Text + images"
                            : index === 1
                              ? "Text + communities"
                              : "Video + audio"}
                        </dd>
                      </div>
                      <div>
                        <dt>Real access</dt>
                        <dd>
                          {index === 0
                            ? "Public stream available"
                            : index === 1
                              ? "Agreement required"
                              : "Licensed / consented media"}
                        </dd>
                      </div>
                      <div>
                        <dt>Simulation status</dt>
                        <dd className={cn(!pausedSources.has(item) && "feed-active")}>
                          {pausedSources.has(item) ? (
                            <>
                              <Pause size={12} />
                              Paused
                            </>
                          ) : (
                            <>
                              <span className="tiny-dot" />
                              Available
                            </>
                          )}
                        </dd>
                      </div>
                    </dl>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setPausedSources((current) => {
                          const next = new Set(current);
                          if (next.has(item)) next.delete(item);
                          else next.add(item);
                          return next;
                        });
                        setStatus(
                          `${item} sample feed ${pausedSources.has(item) ? "resumed" : "paused"}. No real connection was changed.`,
                        );
                      }}
                    >
                      {pausedSources.has(item) ? <Play /> : <Pause />}
                      {pausedSources.has(item) ? "Resume sample feed" : "Pause sample feed"}
                    </Button>
                  </article>
                ))}
              </div>
              <div className="coverage-principles">
                <ShieldCheck size={20} />
                <div>
                  <h2>Evidence keeps its provenance.</h2>
                  <p>
                    A real implementation must track source permissions, ingestion gaps, deletions,
                    model versions, and processing timestamps. Missing coverage should reduce
                    confidence—not become a zero in a chart.
                  </p>
                  <a href="#/prototype/trend-network" onClick={() => setSection("radar")}>
                    Return to the radar
                    <ArrowRight size={13} />
                  </a>
                </div>
              </div>
            </div>
          )}
          <footer className="proto-footer">
            <span>
              <FlaskConical size={12} aria-hidden="true" />
              Concept prototype · All observations are simulated
            </span>
            <span>Built to ask better questions.</span>
          </footer>
        </main>
      </div>
      <div className="prototype-status" role="status">
        {status}
      </div>
      {section === "radar" && <PrototypeSwitcher variant={variant} onChange={changeVariant} />}
      <Dialog open={evidenceOpen} onOpenChange={setEvidenceOpen}>
        <DialogContent className="mock-evidence-dialog">
          <DialogHeader>
            <DialogTitle>{node?.label ?? "A pattern, seen from another angle"}</DialogTitle>
            <DialogDescription>
              Fictional example · {node?.source ?? pattern.sources[0]} · No real creator or source
              media
            </DialogDescription>
          </DialogHeader>
          {node?.kind === "audio" ? (
            <div className="audio-example">
              <AudioLines size={32} />
              <strong>{pattern.sound}</strong>
              <p>Illustrative audio motif. No playable recording is included.</p>
              <div className="audio-wave" aria-hidden="true">
                {[
                  12, 24, 36, 18, 44, 30, 52, 26, 38, 18, 42, 54, 28, 40, 22, 12, 34, 48, 20, 30,
                  16, 42, 26, 12,
                ].map((height, index) => (
                  <i key={index} style={{ height }} />
                ))}
              </div>
            </div>
          ) : (
            <div className="evidence-storyboard">
              <figure>
                <PrototypeArtwork pattern={pattern} />
                <figcaption>00:00 · The setup</figcaption>
              </figure>
              <figure>
                <PrototypeArtwork pattern={pattern} alternate />
                <figcaption>00:03 · The repeatable idea</figcaption>
              </figure>
            </div>
          )}
          <blockquote className="dialog-quote">
            “{pattern.captions[node?.id === "remix" ? 1 : 0]}”
          </blockquote>
          <div className="extraction-note">
            <span className="eyebrow">
              <Sparkles size={12} />
              Illustrative AI interpretation
            </span>
            <h3>Literal content vs. intended meaning</h3>
            <p>{pattern.meaning}</p>
            <h3>Why link it to this family?</h3>
            <p>{pattern.difference}</p>
            <div>
              <span>
                <Image size={13} />
                Visual structure
              </span>
              <span>
                <AudioLines size={13} />
                Context matters
              </span>
              <span>
                <ShieldCheck size={13} />
                Inference, not fact
              </span>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Close example</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={configureOpen} onOpenChange={setConfigureOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Monitor {pattern.name}</DialogTitle>
            <DialogDescription>
              Explore an alert rule. Preferences stay in memory and do not run a real monitoring
              job.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setSettings((current) => ({ ...current, [pattern.id]: { threshold, horizon } }));
              setMonitored((current) => new Set([...current, pattern.id]));
              setConfigureOpen(false);
              setStatus(
                `Mock rule saved: ${pattern.name}, emergence at least ${threshold}, ${horizon} outlook.`,
              );
            }}
          >
            <label className="mock-field">
              Minimum emergence score
              <div>
                <input
                  type="range"
                  min="30"
                  max="95"
                  value={threshold}
                  onChange={(event) => setThreshold(Number(event.target.value))}
                />
                <output>{threshold}/100</output>
              </div>
              <small>A synthetic ranking, not a probability threshold.</small>
            </label>
            <label className="mock-field">
              Outlook window
              <select value={horizon} onChange={(event) => setHorizon(event.target.value)}>
                <option>24 hours</option>
                <option>72 hours</option>
                <option>7 days</option>
              </select>
            </label>
            <div className="rule-preview">
              <Bell size={16} />
              <p>
                Watch for emergence ≥ <strong>{threshold}</strong> and show a{" "}
                <strong>{horizon}</strong> outlook for this pattern.
              </p>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button type="submit">Save mock rule</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
