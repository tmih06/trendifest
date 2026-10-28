import { forceCollide } from "d3-force";
import { Maximize2, Minus, Plus, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d";
import { Button } from "@/components/ui/button";
import type { Theme } from "@/hooks/use-app";
import {
  GRAPH_LINKS,
  GRAPH_NODES,
  connectionsFor,
  type GraphLink,
  type GraphNode,
} from "@/pages/trend-graph.data";

type NodePoint = GraphNode & {
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number;
  fy?: number;
};
type LinkPoint = GraphLink & {
  source: string | number | NodePoint;
  target: string | number | NodePoint;
};
type CanvasGraph = { nodes: NodePoint[]; links: GraphLink[] };

interface GraphPalette {
  pattern: string;
  concept: string;
  sound: string;
  community: string;
  foreground: string;
  muted: string;
  background: string;
  edge: string;
  edgeDim: string;
  edgeSelected: string;
}

const FALLBACK_PALETTE: GraphPalette = {
  pattern: "oklch(0.55 0.19 265)",
  concept: "oklch(0.5 0.009 260)",
  sound: "oklch(0.55 0.12 305)",
  community: "oklch(0.58 0.11 195)",
  foreground: "oklch(0.16 0.006 260)",
  muted: "oklch(0.5 0.009 260)",
  background: "oklch(0.995 0 0)",
  edge: "rgba(80, 84, 94, 0.42)",
  edgeDim: "rgba(80, 84, 94, 0.09)",
  edgeSelected: "rgba(67, 83, 210, 0.82)",
};

/** Six fixed hubs keep the canvas legible while leaf nodes still force-settle. */
const HUB_POSITIONS: Record<string, { x: number; y: number }> = {
  "side-quest": { x: 0, y: 252 },
  "low-battery": { x: -326, y: 126 },
  "polite-crashout": { x: -252, y: -164 },
  "objects-at-work": { x: 0, y: -276 },
  "frame-vacation": { x: 302, y: -118 },
  "corporate-lore": { x: 324, y: 158 },
};

/**
 * Seed every leaf around the hub(s) it belongs to. Shared community nodes land
 * between their patterns, which gives the force layout its bridges from the
 * first frame instead of a cloud collapsing from the centre.
 */
const LEAF_SEEDS = new Map<string, { x: number; y: number }>();
{
  const anchors = new Map<string, { x: number; y: number; count: number }>();
  for (const link of GRAPH_LINKS) {
    if (!(link.source in HUB_POSITIONS)) continue;
    const hub = HUB_POSITIONS[link.source]!;
    const anchor = anchors.get(link.target) ?? { x: 0, y: 0, count: 0 };
    anchor.x += hub.x;
    anchor.y += hub.y;
    anchor.count += 1;
    anchors.set(link.target, anchor);
  }
  let index = 0;
  for (const [id, anchor] of anchors) {
    const angle = index * 2.399963229728653;
    const radius = 32 + (index % 4) * 11;
    LEAF_SEEDS.set(id, {
      x: anchor.x / anchor.count + Math.cos(angle) * radius,
      y: anchor.y / anchor.count + Math.sin(angle) * radius,
    });
    index += 1;
  }
}

const PARENT_PATTERNS = new Map<string, string[]>();
for (const link of GRAPH_LINKS) {
  if (link.relation === "echoes") continue;
  const parents = PARENT_PATTERNS.get(link.target) ?? [];
  parents.push(link.source);
  PARENT_PATTERNS.set(link.target, parents);
}

let colorProbe: CanvasRenderingContext2D | null = null;

/** Canvas cannot read CSS custom properties, so resolve the theme tokens once. */
function resolveColor(color: string, alpha = 1): string {
  if (!color) return `rgba(120, 120, 120, ${alpha})`;
  colorProbe ??= document.createElement("canvas").getContext("2d", {
    willReadFrequently: true,
  });
  if (!colorProbe) return color;
  colorProbe.clearRect(0, 0, 1, 1);
  colorProbe.fillStyle = color;
  colorProbe.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = colorProbe.getImageData(0, 0, 1, 1).data;
  return `rgba(${r}, ${g}, ${b}, ${alpha * (a / 255)})`;
}

function readPalette(): GraphPalette {
  if (typeof document === "undefined") return FALLBACK_PALETTE;
  const styles = getComputedStyle(document.documentElement);
  const token = (name: string) => styles.getPropertyValue(name).trim();
  const pattern = token("--chart-1");
  return {
    pattern: pattern || FALLBACK_PALETTE.pattern,
    concept: token("--muted-foreground") || FALLBACK_PALETTE.concept,
    sound: token("--chart-5") || FALLBACK_PALETTE.sound,
    community: token("--chart-2") || FALLBACK_PALETTE.community,
    foreground: token("--foreground") || FALLBACK_PALETTE.foreground,
    muted: token("--muted-foreground") || FALLBACK_PALETTE.muted,
    background: token("--background") || FALLBACK_PALETTE.background,
    edge: resolveColor(token("--muted-foreground") || "#646672", 0.55),
    edgeDim: resolveColor(token("--muted-foreground") || "#646672", 0.09),
    edgeSelected: resolveColor(pattern || "#6c72d8", 0.82),
  };
}

function endpointId(endpoint: unknown): string {
  if (!endpoint || typeof endpoint !== "object" || !("id" in endpoint)) {
    return String(endpoint);
  }
  const id = endpoint.id;
  return typeof id === "string" || typeof id === "number" ? String(id) : "";
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
}

function makeGraphData(layoutVersion = 0): CanvasGraph {
  return {
    nodes: GRAPH_NODES.map((node, index) => {
      if (node.kind === "pattern") {
        const hub = HUB_POSITIONS[node.id]!;
        return { ...node, x: hub.x, y: hub.y, fx: hub.x, fy: hub.y };
      }
      const base = LEAF_SEEDS.get(node.id) ?? { x: 0, y: 0 };
      const angle = index * 2.399963229728653 + layoutVersion * 0.83;
      const radius = 18 + ((index + layoutVersion) % 4) * 11;
      return {
        ...node,
        x: base.x + Math.cos(angle) * radius,
        y: base.y + Math.sin(angle) * radius,
      };
    }),
    links: GRAPH_LINKS.map((link) => ({ ...link })),
  };
}

interface TrendGraphCanvasProps {
  theme: Theme;
  selectedId: string | null;
  activeIds: Set<string>;
  emphasisIds: Set<string>;
  showContextLabels: boolean;
  onSelect: (id: string | null) => void;
}

/**
 * Obsidian-like force graph: canvas rendering, d3 simulation, pan/zoom, node
 * dragging and selection. The canvas is visual; Browse signals is the
 * keyboard and screen-reader path through all nodes.
 */
export function TrendGraphCanvas({
  theme,
  selectedId,
  activeIds,
  emphasisIds,
  showContextLabels,
  onSelect,
}: TrendGraphCanvasProps) {
  const graphRef = useRef<ForceGraphMethods | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const labelCanvasRef = useRef<HTMLCanvasElement>(null);
  const frameNodes = useRef<NodePoint[]>([]);
  const shouldFit = useRef(true);
  const reducedMotion = useReducedMotion();
  const [layoutVersion, setLayoutVersion] = useState(0);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [palette, setPalette] = useState(readPalette);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // Restarting the layout reseeds leaf arrangements while hubs keep their ring.
  const graphData = useMemo(() => makeGraphData(layoutVersion), [layoutVersion]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setPalette(readPalette()));
    return () => window.cancelAnimationFrame(frame);
  }, [theme]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      setSize({
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height)),
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const charge = graph.d3Force("charge") as { strength?: (value: number) => void } | undefined;
    charge?.strength?.(-150);
    const link = graph.d3Force("link") as
      | { distance?: (value: (link: LinkPoint) => number) => void }
      | undefined;
    link?.distance?.((edge) =>
      edge.relation === "spreads in" ? 108 : edge.relation === "uses" ? 86 : 74,
    );
    graph.d3Force(
      "collide",
      forceCollide<NodePoint>(
        (node) => (node.radius ?? 6) + (node.kind === "pattern" ? 26 : 14),
      ) as never,
    );
    graph.d3Force("center", null);
    graph.d3ReheatSimulation();
  }, [layoutVersion]);

  const fitView = useCallback(
    (duration: number) => {
      const graph = graphRef.current;
      if (!graph) return;
      const compact = size.width < 700 || size.height < 560;
      if (!selectedId) {
        graph.zoomToFit(duration, compact ? 44 : 92);
        return;
      }
      const focusIds = new Set([selectedId]);
      const selected = GRAPH_NODES.find((node) => node.id === selectedId);
      for (const connection of connectionsFor(selectedId)) {
        // A pattern's direct echo links span the whole network. Keep the local
        // fit on its own concepts, sound and communities instead.
        if (selected?.kind === "pattern" && connection.node.kind === "pattern") continue;
        focusIds.add(connection.node.id);
      }
      graph.zoomToFit(duration, compact ? 42 : 150, (node) => focusIds.has(String(node.id)));
    },
    [selectedId, size.height, size.width],
  );

  useEffect(() => {
    if (!size.width || !size.height) return;
    const timer = window.setTimeout(() => fitView(reducedMotion ? 0 : selectedId ? 450 : 400), 160);
    return () => window.clearTimeout(timer);
  }, [fitView, reducedMotion, selectedId, size.width, size.height]);

  const finishLayout = useCallback(() => {
    if (shouldFit.current) {
      shouldFit.current = false;
      fitView(reducedMotion ? 0 : 600);
    }
  }, [fitView, reducedMotion]);

  const colorFor = useCallback(
    (kind: GraphNode["kind"]) => {
      if (kind === "pattern") return palette.pattern;
      if (kind === "sound") return palette.sound;
      if (kind === "community") return palette.community;
      return palette.concept;
    },
    [palette],
  );

  const paintNode = useCallback(
    (raw: object, ctx: CanvasRenderingContext2D) => {
      const node = raw as NodePoint;
      frameNodes.current.push(node);
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const selected = node.id === selectedId;
      const hovered = node.id === hoveredId;
      const active = activeIds.has(node.id);
      const emphasis = emphasisIds.has(node.id);
      const dim = !active;
      const radius = node.radius + (hovered ? 0.8 : 0);

      ctx.save();
      ctx.globalAlpha = dim ? 0.16 : 1;

      if (selected || hovered) {
        ctx.beginPath();
        ctx.arc(x, y, radius + 5, 0, Math.PI * 2);
        ctx.fillStyle = palette.background;
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = colorFor(node.kind);
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = palette.background;
      ctx.stroke();

      if (selected || hovered) {
        ctx.beginPath();
        ctx.arc(x, y, radius + 5, 0, Math.PI * 2);
        ctx.lineWidth = selected ? 2 : 1.4;
        ctx.strokeStyle = selected ? palette.foreground : palette.muted;
        ctx.stroke();
      } else if (emphasis) {
        ctx.beginPath();
        ctx.arc(x, y, radius + 3.5, 0, Math.PI * 2);
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = palette.pattern;
        ctx.stroke();
      }

      ctx.restore();
    },
    [activeIds, colorFor, emphasisIds, hoveredId, palette, selectedId],
  );

  /**
   * Labels live on a separate transparent canvas. That keeps them above every
   * node, lets us clear stale frames, and keeps their screen size stable while
   * the force graph zooms. Colliding labels are skipped except for the active
   * selection.
   */
  const drawLabels = useCallback(() => {
    const graph = graphRef.current;
    const canvas = labelCanvasRef.current;
    if (!graph || !canvas || !size.width || !size.height) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const dpr = window.devicePixelRatio || 1;
    const pixelWidth = Math.round(size.width * dpr);
    const pixelHeight = Math.round(size.height * dpr);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, size.width, size.height);
    context.globalAlpha = 1;

    const zoom = graph.zoom() || 1;
    const positions = new Map(
      frameNodes.current.map((node) => {
        const point = graph.graph2ScreenCoords(node.x ?? 0, node.y ?? 0);
        return [node.id, point];
      }),
    );
    const placed: { left: number; top: number; right: number; bottom: number }[] = [];
    const labels = frameNodes.current
      .filter((node) => {
        if (!activeIds.has(node.id) && node.id !== hoveredId) return false;
        return (
          node.id === selectedId ||
          node.id === hoveredId ||
          node.kind === "pattern" ||
          node.degree > 2 ||
          showContextLabels ||
          zoom > 2.2
        );
      })
      .toSorted((a, b) => {
        const priority = (node: NodePoint) =>
          node.id === selectedId || node.id === hoveredId
            ? 3
            : node.kind === "pattern"
              ? 2
              : node.degree > 2
                ? 1.5
                : 1;
        return priority(b) - priority(a);
      });

    for (const node of labels) {
      const point = positions.get(node.id);
      if (!point) continue;
      const isPattern = node.kind === "pattern";
      const selected = node.id === selectedId;
      const hovered = node.id === hoveredId;
      const fontSize = isPattern ? 12.5 : 10.5;
      context.font = `${isPattern ? 600 : 500} ${fontSize}px "Geist Variable", ui-sans-serif, sans-serif`;
      context.textBaseline = "middle";
      context.textAlign = "center";
      const textWidth = context.measureText(node.label).width;
      let labelX = point.x;
      let labelY = point.y + node.radius * zoom + 12;

      if (!isPattern) {
        const parents = (PARENT_PATTERNS.get(node.id) ?? [])
          .map((id) => positions.get(id))
          .filter((parent): parent is { x: number; y: number } => Boolean(parent));
        let directionX = 1;
        let directionY = 0;
        if (parents.length) {
          const centerX = parents.reduce((sum, parent) => sum + parent.x, 0) / parents.length;
          const centerY = parents.reduce((sum, parent) => sum + parent.y, 0) / parents.length;
          const dx = point.x - centerX;
          const dy = point.y - centerY;
          const length = Math.hypot(dx, dy);
          if (length > 1) {
            directionX = dx / length;
            directionY = dy / length;
          }
        }
        const distance = node.radius * zoom + 7 + textWidth / 2;
        labelX = point.x + directionX * distance;
        labelY = point.y + directionY * distance;
      }

      const inset = textWidth / 2 + 8;
      const minX = inset;
      const maxX = size.width - inset;
      const maxY = size.height - (size.width < 640 ? 10 : 58);
      if (minX > maxX) continue;
      labelX = Math.min(Math.max(labelX, minX), maxX);
      labelY = Math.min(Math.max(labelY, fontSize / 2 + 8), maxY);

      const pad = 3;
      const left = labelX - textWidth / 2 - pad;
      const right = labelX + textWidth / 2 + pad;
      const top = labelY - fontSize / 2 - pad * 0.5;
      const bottom = labelY + fontSize / 2 + pad * 0.5;

      if (!isPattern && !selected && !hovered) {
        const coversHub = frameNodes.current.some((other) => {
          if (other.kind !== "pattern") return false;
          const hub = positions.get(other.id);
          if (!hub) return false;
          const nearestX = Math.max(left, Math.min(hub.x, right));
          const nearestY = Math.max(top, Math.min(hub.y, bottom));
          return Math.hypot(hub.x - nearestX, hub.y - nearestY) < other.radius * zoom + 2;
        });
        if (coversHub) continue;
      }

      const collides = placed.some(
        (box) => left < box.right && right > box.left && top < box.bottom && bottom > box.top,
      );
      if (collides && !selected && !hovered && !isPattern) continue;

      context.lineWidth = 3.5;
      context.strokeStyle = palette.background;
      context.lineJoin = "round";
      context.strokeText(node.label, labelX, labelY);
      context.fillStyle = isPattern ? palette.foreground : palette.muted;
      context.fillText(node.label, labelX, labelY);
      placed.push({ left, top, right, bottom });
    }
  }, [activeIds, hoveredId, palette, selectedId, showContextLabels, size.height, size.width]);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      drawLabels();
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [drawLabels]);

  const linkColor = useCallback(
    (raw: object) => {
      const link = raw as LinkPoint;
      const source = endpointId(link.source);
      const target = endpointId(link.target);
      const sourceActive = activeIds.has(source);
      const targetActive = activeIds.has(target);
      if (selectedId && (source === selectedId || target === selectedId)) {
        return (source === selectedId ? targetActive : sourceActive)
          ? palette.edgeSelected
          : palette.edgeDim;
      }
      return sourceActive && targetActive ? palette.edge : palette.edgeDim;
    },
    [activeIds, palette, selectedId],
  );

  const linkWidth = useCallback(
    (raw: object) => {
      const link = raw as LinkPoint;
      const source = endpointId(link.source);
      const target = endpointId(link.target);
      const selectedEdge = selectedId && (source === selectedId || target === selectedId);
      const otherActive = selectedId
        ? activeIds.has(source === selectedId ? target : source)
        : false;
      return selectedEdge && otherActive ? 1.4 : 0.9;
    },
    [activeIds, selectedId],
  );

  function zoomBy(factor: number) {
    const graph = graphRef.current;
    if (!graph) return;
    graph.zoom(graph.zoom() * factor, reducedMotion ? 0 : 250);
  }

  function resetLayout() {
    shouldFit.current = true;
    setLayoutVersion((version) => version + 1);
  }

  return (
    <div ref={containerRef} className="absolute inset-0">
      <div aria-hidden="true" className="absolute inset-0">
        {size.width > 0 && (
          <ForceGraph2D
            ref={graphRef}
            width={size.width}
            height={size.height}
            graphData={graphData}
            backgroundColor="rgba(0,0,0,0)"
            nodeCanvasObject={paintNode}
            nodePointerAreaPaint={(raw, color, ctx) => {
              const node = raw as NodePoint;
              ctx.beginPath();
              ctx.arc(node.x ?? 0, node.y ?? 0, node.radius + 9, 0, Math.PI * 2);
              ctx.fillStyle = color;
              ctx.fill();
            }}
            nodeLabel={() => ""}
            linkColor={linkColor}
            linkWidth={linkWidth}
            linkCurvature={(raw) => ((raw as LinkPoint).relation === "echoes" ? 0.14 : 0)}
            linkHoverPrecision={8}
            onRenderFramePre={() => {
              frameNodes.current = [];
            }}
            onNodeHover={(raw) => setHoveredId(raw ? String(raw.id) : null)}
            onNodeClick={(raw) => {
              const node = raw as NodePoint;
              if (node?.id) onSelect(node.id);
            }}
            onBackgroundClick={() => onSelect(null)}
            onEngineStop={finishLayout}
            cooldownTicks={reducedMotion ? 0 : 110}
            warmupTicks={reducedMotion ? 80 : 24}
            d3AlphaDecay={0.035}
            d3VelocityDecay={0.34}
            minZoom={0.35}
            maxZoom={2.5}
            enableNodeDrag
            enablePanInteraction
            enableZoomInteraction
            showPointerCursor
          />
        )}
      </div>

      <canvas
        ref={labelCanvasRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-10 h-full w-full"
      />

      <div className="absolute bottom-3 right-3 z-30 flex items-center gap-0.5 rounded-lg border border-border/80 bg-background/90 p-0.5 shadow-sm backdrop-blur-sm max-sm:hidden">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Zoom out"
          title="Zoom out"
          onClick={() => zoomBy(0.8)}
        >
          <Minus />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Zoom in"
          title="Zoom in"
          onClick={() => zoomBy(1.25)}
        >
          <Plus />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Fit graph to view"
          title="Fit graph to view"
          onClick={() => graphRef.current?.zoomToFit(reducedMotion ? 0 : 350, 92)}
        >
          <Maximize2 />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Restart layout"
          title="Restart layout"
          onClick={resetLayout}
        >
          <RotateCcw />
        </Button>
      </div>
    </div>
  );
}
