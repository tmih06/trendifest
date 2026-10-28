import { useState } from "react";
import {
  AudioLines,
  BatteryLow,
  BriefcaseBusiness,
  Check,
  Coffee,
  Expand,
  FileText,
  Image,
  LampDesk,
  Minus,
  Network,
  Plus,
  Video,
  Waves,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  evidenceFor,
  type MockEvidence,
  type MockPattern,
  type SampleSource,
} from "@/pages/trend-network-prototype.data";

const KIND_ICONS = {
  video: Video,
  image: Image,
  audio: AudioLines,
  text: FileText,
  community: Users,
};
const ART_ICONS = {
  quest: Coffee,
  battery: BatteryLow,
  polite: BriefcaseBusiness,
  objects: LampDesk,
  vacation: Waves,
  lore: FileText,
};

/** Illustrative original artwork, never a thumbnail scraped from a real creator. */
export function PrototypeArtwork({
  pattern,
  alternate = false,
  compact = false,
}: {
  pattern: MockPattern;
  alternate?: boolean;
  compact?: boolean;
}) {
  const Icon = ART_ICONS[pattern.art];
  return (
    <div
      className={cn(
        "mock-art",
        `mock-art-${pattern.art}`,
        alternate && "mock-art-alternate",
        compact && "mock-art-compact",
      )}
      aria-hidden="true"
    >
      <div className="art-corner">{alternate ? "ANOTHER PERSPECTIVE" : "A SMALL MOMENT"}</div>
      <div className="art-orbit">
        <Icon strokeWidth={1.3} />
      </div>
      <div className="art-caption">
        {pattern.art === "quest"
          ? alternate
            ? "+10 XP"
            : "SIDE QUEST ACCEPTED"
          : pattern.art === "battery"
            ? "ENERGY: 2%"
            : pattern.art === "polite"
              ? "KIND REGARDS."
              : pattern.art === "objects"
                ? "EMPLOYEE OF THE MONTH"
                : pattern.art === "vacation"
                  ? "MENTALLY ELSEWHERE"
                  : "THE LORE RUNS DEEP"}
      </div>
      {!compact && (
        <span className="art-sticker">
          {pattern.art === "quest" ? "optional objective" : "illustrative frame"}
        </span>
      )}
    </div>
  );
}

interface GraphProps {
  pattern: MockPattern;
  phase: number;
  inferred: boolean;
  source: SampleSource | "All sources";
  selected: string | null;
  onSelect: (id: string | null) => void;
  signals: number;
  wide?: boolean;
}

/** Source filters and replay change the visible evidence, not the stable node positions. */
export function MockNetworkGraph({
  pattern,
  phase,
  inferred,
  source,
  selected,
  onSelect,
  signals,
  wide = false,
}: GraphProps) {
  const [zoom, setZoom] = useState(1);
  const visible = evidenceFor(pattern).filter(
    (node) =>
      node.appears <= phase &&
      (inferred || node.observed) &&
      (source === "All sources" || node.source === source),
  );
  const additional: MockEvidence[] =
    signals > 0 &&
    inferred &&
    phase === 3 &&
    (source === "All sources" || source === pattern.sources[0])
      ? [
          {
            id: "new-signal",
            label: "A new independent remix",
            detail: `Simulation event ${signals}`,
            kind: "video",
            source: pattern.sources[0]!,
            x: 15,
            y: 51,
            appears: 3,
            observed: false,
          },
        ]
      : [];
  const nodes = [...visible, ...additional];
  return (
    <section
      className={cn("mock-network", wide && "mock-network-wide")}
      aria-label={`${pattern.name} relationship graph`}
    >
      <div className="network-toolbar">
        <div>
          <Network size={15} aria-hidden="true" />
          <span>Pattern network</span>
          <span className="soft-count">{nodes.length + 1} nodes</span>
          <span className="network-pan-hint">Swipe to explore</span>
        </div>
        <div className="network-tools">
          <span className="network-scope">Selected family</span>
          <div className="graph-zoom">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Zoom out graph"
              disabled={zoom <= 1}
              onClick={() => setZoom(Math.max(1, zoom - 0.2))}
            >
              <Minus />
            </Button>
            <span>{Math.round(zoom * 100)}%</span>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Zoom in graph"
              disabled={zoom >= 1.6}
              onClick={() => setZoom(Math.min(1.6, zoom + 0.2))}
            >
              <Plus />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Fit graph"
              onClick={() => setZoom(1)}
            >
              <Expand />
            </Button>
          </div>
        </div>
      </div>
      <div
        className="network-viewport"
        tabIndex={0}
        aria-label="Scrollable relationship graph. Select a node to inspect its evidence. A relationship list follows the graph."
      >
        <div
          className="network-plane"
          style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}
        >
          <svg
            className="network-edges"
            viewBox="0 0 1000 640"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <circle cx="490" cy="320" r="195" className="network-orbit" />
            <circle cx="490" cy="320" r="275" className="network-orbit outer" />
            {nodes.map((node) => (
              <path
                key={node.id}
                d={`M 490 320 Q ${node.x * 10} 320 ${node.x * 10} ${node.y * 6.4}`}
                className={cn(
                  "network-edge",
                  !node.observed && "inferred",
                  selected === node.id && "selected",
                )}
              />
            ))}
          </svg>
          <button
            className={cn("network-family", selected === null && "selected")}
            style={{ left: "49%", top: "50%" }}
            onClick={() => onSelect(null)}
            aria-pressed={selected === null}
          >
            <span className="family-symbol">
              <Network size={24} strokeWidth={1.6} aria-hidden="true" />
            </span>
            <strong>{pattern.name}</strong>
            <span>Pattern family</span>
            <span className="family-score">
              <span className="tiny-dot" />
              Emergence {pattern.score}/100
            </span>
          </button>
          {nodes.map((node) => {
            const Icon = KIND_ICONS[node.kind];
            const isMedia =
              node.kind === "video" || (node.kind === "image" && node.id !== "visual");
            return (
              <button
                key={node.id}
                className={cn(
                  "network-node",
                  `node-${node.kind}`,
                  isMedia && "node-media",
                  selected === node.id && "selected",
                )}
                style={{ left: `${node.x}%`, top: `${node.y}%` }}
                onClick={() => onSelect(node.id)}
                aria-pressed={selected === node.id}
                aria-label={`Inspect ${node.label}, ${node.kind}, ${node.observed ? "observed" : "inferred"} relationship`}
              >
                {isMedia ? (
                  <PrototypeArtwork pattern={pattern} compact alternate={node.id !== "original"} />
                ) : (
                  <span className="node-icon">
                    <Icon size={17} strokeWidth={1.7} aria-hidden="true" />
                  </span>
                )}
                <span className="node-content">
                  <strong>{node.label}</strong>
                  <span>{node.detail}</span>
                </span>
                {node.observed && <Check size={12} className="node-observed" aria-hidden="true" />}
              </button>
            );
          })}
          {nodes.length === 0 && (
            <div className="network-no-evidence">
              No matching evidence at this point.
              <br />
              Change the source or show inferred links.
            </div>
          )}
          <span className="network-map-label map-label-left">LANGUAGE + AUDIO</span>
          <span className="network-map-label map-label-right">VISUAL + ADOPTION</span>
        </div>
      </div>
      <div className="network-footer">
        <div className="network-legend">
          <span>
            <i className="legend-line" />
            Observed
          </span>
          <span>
            <i className="legend-line dashed" />
            Inferred
          </span>
        </div>
        <span className="network-node-key">Select any node for evidence</span>
      </div>
      <details className="network-accessible-list">
        <summary>View {nodes.length} relationships as a list</summary>
        <ul>
          {nodes.map((node) => (
            <li key={node.id}>
              <button onClick={() => onSelect(node.id)}>
                {node.label}
                <span>
                  {node.kind} · {node.source} · {node.observed ? "Observed" : "Inferred"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

/** Small deterministic trend line. It illustrates relative movement, not observed data. */
export function MockSparkline({ values, muted = false }: { values: number[]; muted?: boolean }) {
  const maximum = Math.max(...values, 1);
  const points = values
    .map((value, index) => `${index * 26},${34 - (value / maximum) * 30}`)
    .join(" ");
  return (
    <svg viewBox="0 0 80 38" className={cn("mock-sparkline", muted && "muted")} aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Miniature forecast with a visually separated, explicitly hypothetical future. */
export function MockForecastChart({ pattern, phase }: { pattern: MockPattern; phase: number }) {
  const values = pattern.creators.slice(0, phase + 1);
  const current = values.at(-1) ?? 0;
  const max = pattern.creators[3]! * 2.8;
  const actual = values
    .map((value, index) => `${18 + index * 49},${128 - (value / max) * 108}`)
    .join(" ");
  const startX = 18 + phase * 49;
  const startY = 128 - (current / max) * 108;
  return (
    <div className="mock-forecast-chart">
      <svg
        viewBox="0 0 300 160"
        role="img"
        aria-label={`Illustrative adoption chart: ${current} simulated creators at the selected time. The dashed future is a hypothetical scenario, not a validated prediction.`}
      >
        {[35, 80, 125].map((y) => (
          <line key={y} x1="18" x2="282" y1={y} y2={y} className="chart-grid" />
        ))}
        <path
          d={`M ${startX} ${startY} L 280 ${Math.max(12, startY - 85)} L 280 ${Math.max(40, startY - 20)} Z`}
          className="forecast-band"
        />
        <polyline points={actual} className="forecast-actual" />
        <path
          d={`M ${startX} ${startY} Q 232 ${startY} 280 ${Math.max(22, startY - 55)}`}
          className="forecast-future"
        />
        <circle cx={startX} cy={startY} r="4" className="forecast-point" />
        <text x="18" y="151">
          First observed
        </text>
        <text x={startX} y="151" textAnchor="middle">
          {phase > 0 ? "Selected time" : ""}
        </text>
        <text x="280" y="151" textAnchor="end">
          +72h scenario
        </text>
      </svg>
    </div>
  );
}
