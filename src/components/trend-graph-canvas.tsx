import { forceCollide } from "d3-force";
import { Crosshair, Maximize2, Minus, Plus, RotateCcw } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
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

interface LabelHitArea {
  id: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface LabelBitmap {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  textWidth: number;
}

const LABEL_FONT_FAMILY = '"Inter Variable", "Inter", sans-serif';

/**
 * Labels repeat every frame. Rasterize the halo and glyphs once per role,
 * color and DPR; the frame loop then only draws the bitmap.
 */
function makeLabelBitmap(
  label: string,
  isPattern: boolean,
  color: string,
  background: string,
  dpr: number,
): LabelBitmap {
  const fontSize = isPattern ? 12 : 11;
  const font = `${isPattern ? 500 : 400} ${fontSize}px ${LABEL_FONT_FAMILY}`;
  const measure = document.createElement("canvas").getContext("2d");
  if (!measure) {
    return { canvas: document.createElement("canvas"), width: 0, height: 0, textWidth: 0 };
  }
  measure.font = font;
  const textWidth = measure.measureText(label).width;
  const width = Math.ceil(textWidth + 8);
  const height = Math.ceil(fontSize + 8);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(width * dpr));
  canvas.height = Math.max(1, Math.ceil(height * dpr));
  const context = canvas.getContext("2d");
  if (context) {
    context.scale(dpr, dpr);
    context.font = font;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineWidth = 3;
    context.lineJoin = "round";
    context.strokeStyle = background;
    context.strokeText(label, width / 2, height / 2);
    context.fillStyle = color;
    context.fillText(label, width / 2, height / 2);
  }
  return { canvas, width, height, textWidth };
}

const INTERACTIVE_TARGET = "button, a, input, select, textarea, [role='dialog']";

/** Pointer events over graph chrome must not become graph clicks. */
function isGraphSurface(target: EventTarget | null): boolean {
  return !(target instanceof Element && target.closest(INTERACTIVE_TARGET));
}

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
  pattern: "#a78bfa",
  concept: "#b3b3b3",
  sound: "#a78bfa",
  community: "#82aaff",
  foreground: "#dadada",
  muted: "#999999",
  background: "#1e1e1e",
  edge: "rgba(167, 139, 250, 0.20)",
  edgeDim: "rgba(167, 139, 250, 0.055)",
  edgeSelected: "rgba(167, 139, 250, 0.62)",
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
  const pattern = token("--graph-node-focused") || "#a78bfa";
  return {
    pattern,
    concept: token("--graph-node") || FALLBACK_PALETTE.concept,
    sound: token("--graph-node-focused") || FALLBACK_PALETTE.sound,
    community: token("--graph-node-tag") || FALLBACK_PALETTE.community,
    foreground: token("--text-normal") || FALLBACK_PALETTE.foreground,
    muted: token("--graph-text") || FALLBACK_PALETTE.muted,
    background: token("--background-primary") || FALLBACK_PALETTE.background,
    edge: resolveColor(token("--graph-line") || "#a78bfa", 0.2),
    edgeDim: resolveColor(token("--graph-line") || "#a78bfa", 0.055),
    edgeSelected: resolveColor(token("--graph-line") || "#a78bfa", 0.62),
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
  const frameNodes = useRef<NodePoint[]>([]);
  const labelHitAreas = useRef<LabelHitArea[]>([]);
  const labelCache = useRef(new Map<string, LabelBitmap>());
  const labelCacheDpr = useRef(0);
  const pointerStart = useRef<{
    x: number;
    y: number;
    hitId: string | null;
    pointerType: string;
  } | null>(null);
  const dragNode = useRef<{
    node: NodePoint;
    pointerId: number;
    offsetX: number;
    offsetY: number;
    active: boolean;
    initialFx?: number;
    initialFy?: number;
  } | null>(null);
  const hoveredIdRef = useRef<string | null>(null);
  const cursorRef = useRef("");
  const shouldFit = useRef(true);
  const reducedMotion = useReducedMotion();
  const [layoutVersion, setLayoutVersion] = useState(0);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [palette, setPalette] = useState(readPalette);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [, setFontReady] = useState(false);
  const [hasSettled, setHasSettled] = useState(false);
  const [dragging, setDragging] = useState(false);
  // Restarting the layout reseeds leaf arrangements while hubs keep their ring.
  const graphData = useMemo(() => makeGraphData(layoutVersion), [layoutVersion]);

  const getLabelBitmap = useCallback(
    (label: string, isPattern: boolean, color: string, background: string, dpr: number) => {
      const key = `${isPattern ? 1 : 0}|${dpr}|${color}|${background}|${label}`;
      const cached = labelCache.current.get(key);
      if (cached) return cached;
      const bitmap = makeLabelBitmap(label, isPattern, color, background, dpr);
      labelCache.current.set(key, bitmap);
      return bitmap;
    },
    [],
  );

  useEffect(() => {
    let active = true;
    void document.fonts?.ready
      .then(() => {
        if (!active) return;
        // Font metrics and glyphs changed; rebuild every bitmap once.
        labelCache.current.clear();
        setFontReady(true);
      })
      .catch(() => {
        if (active) setFontReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setPalette(readPalette()));
    return () => window.cancelAnimationFrame(frame);
  }, [theme]);

  useEffect(() => {
    labelCache.current.clear();
  }, [palette]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      // ForceGraph can replace its canvas when the measured size changes.
      cursorRef.current = "";
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

  const compact = size.width < 700 || size.height < 560;

  const fitAll = useCallback(
    (duration: number) => {
      graphRef.current?.zoomToFit(duration, compact ? 44 : 92);
    },
    [compact],
  );

  /** Camera motion is explicit: clicking a node never moves the graph. */
  const fitSelection = useCallback(
    (duration: number) => {
      const graph = graphRef.current;
      if (!graph) return;
      if (!selectedId) {
        fitAll(duration);
        return;
      }
      const focusIds = new Set([selectedId]);
      const node = GRAPH_NODES.find((candidate) => candidate.id === selectedId);
      for (const connection of connectionsFor(selectedId)) {
        if (node?.kind === "pattern" && connection.node.kind === "pattern") continue;
        focusIds.add(connection.node.id);
      }
      graph.zoomToFit(duration, compact ? 42 : 150, (target) => focusIds.has(String(target.id)));
    },
    [compact, fitAll, selectedId],
  );

  const finishLayout = useCallback(() => {
    if (shouldFit.current) {
      shouldFit.current = false;
      fitAll(0);
    }
  }, [fitAll]);

  const handleEngineStop = useCallback(() => {
    finishLayout();
    setHasSettled(true);
  }, [finishLayout]);

  const updateHovered = useCallback((id: string | null) => {
    if (hoveredIdRef.current === id) return;
    hoveredIdRef.current = id;
    setHoveredId(id);
  }, []);

  const setGraphCursor = useCallback((cursor: string) => {
    if (cursorRef.current === cursor) return;
    cursorRef.current = cursor;
    const canvas = containerRef.current?.querySelector("canvas");
    if (canvas instanceof HTMLCanvasElement) canvas.style.cursor = cursor;
  }, []);

  /**
   * Resolve the current node under a pointer from the last painted labels and
   * live node positions. Labels win because they are the larger, labelled
   * target users naturally aim at.
   */
  const findHitAt = useCallback(
    (clientX: number, clientY: number): string | null => {
      const container = containerRef.current;
      const graph = graphRef.current;
      if (!container || !graph) return null;
      const rect = container.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;

      for (const area of labelHitAreas.current) {
        if (x >= area.left && x <= area.right && y >= area.top && y <= area.bottom) {
          return area.id;
        }
      }

      const zoom = graph.zoom() || 1;
      let closest: string | null = null;
      let closestDistance = Number.POSITIVE_INFINITY;
      for (const node of graphData.nodes) {
        if (typeof node.x !== "number" || typeof node.y !== "number") continue;
        const point = graph.graph2ScreenCoords(node.x, node.y);
        const radius = (node.radius ?? 5) * zoom + (node.kind === "pattern" ? 14 : 11);
        const distance = Math.hypot(x - point.x, y - point.y);
        if (distance <= radius && distance < closestDistance) {
          closest = node.id;
          closestDistance = distance;
        }
      }
      return closest;
    },
    [graphData],
  );

  const toGraphPoint = useCallback((clientX: number, clientY: number) => {
    const container = containerRef.current;
    const graph = graphRef.current;
    if (!container || !graph) return null;
    const rect = container.getBoundingClientRect();
    return graph.screen2GraphCoords(clientX - rect.left, clientY - rect.top);
  }, []);

  const finishNodeDrag = useCallback(() => {
    const drag = dragNode.current;
    if (!drag) return false;
    dragNode.current = null;
    if (!drag.active) return false;
    const { node } = drag;
    setDragging(false);
    // Pattern hubs are seeded as fixed points; free leaves return to the
    // simulation. This mirrors ForceGraph's own drag release semantics.
    if (drag.initialFx === undefined) node.fx = undefined;
    else node.fx = node.x;
    if (drag.initialFy === undefined) node.fy = undefined;
    else node.fy = node.y;
    graphRef.current?.d3ReheatSimulation();
    return true;
  }, []);

  function handleMouseDownCapture(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.button !== 0 || !isGraphSurface(event.target)) return;
    if (findHitAt(event.clientX, event.clientY)) {
      // A node drag owns this gesture; keep d3-zoom from panning the camera.
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !isGraphSurface(event.target)) {
      pointerStart.current = null;
      return;
    }
    const hitId = findHitAt(event.clientX, event.clientY);
    pointerStart.current = {
      x: event.clientX,
      y: event.clientY,
      hitId,
      pointerType: event.pointerType,
    };

    // Mouse/pen node drags are handled directly against live screen geometry.
    // Touch keeps d3-zoom so pinch and two-finger pan still work.
    if (event.pointerType !== "touch" && hitId) {
      const node = graphData.nodes.find((candidate) => candidate.id === hitId);
      const point = toGraphPoint(event.clientX, event.clientY);
      if (node && point && typeof node.x === "number" && typeof node.y === "number") {
        dragNode.current = {
          node,
          pointerId: event.pointerId,
          offsetX: node.x - point.x,
          offsetY: node.y - point.y,
          active: false,
          initialFx: node.fx,
          initialFy: node.fy,
        };
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Pointer capture is an enhancement; the drag still works without it.
        }
      }
    }
    setGraphCursor("grabbing");
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!isGraphSurface(event.target)) {
      updateHovered(null);
      setGraphCursor("");
      return;
    }
    const start = pointerStart.current;
    const threshold = event.pointerType === "touch" ? 10 : 5;
    if (start) {
      // A background press is already a camera pan; skip hit testing until it
      // ends. Only node/label drags need pointer-follow work.
      if (!start.hitId) {
        updateHovered(null);
        setGraphCursor("grabbing");
        return;
      }
      const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y) > threshold;
      if (moved) {
        const drag = dragNode.current;
        if (drag && drag.pointerId === event.pointerId) {
          const point = toGraphPoint(event.clientX, event.clientY);
          if (point) {
            if (!drag.active) {
              drag.active = true;
              setDragging(true);
            }
            drag.node.x = point.x + drag.offsetX;
            drag.node.y = point.y + drag.offsetY;
            drag.node.fx = drag.node.x;
            drag.node.fy = drag.node.y;
          }
          updateHovered(null);
          setGraphCursor("grabbing");
          return;
        }
        // A camera pan owns the gesture. Resolving nodes on every move would
        // churn labels and React state under the pointer.
        updateHovered(null);
        setGraphCursor("grabbing");
        return;
      }
    }
    const hitId = findHitAt(event.clientX, event.clientY);
    updateHovered(hitId);
    setGraphCursor(hitId ? "pointer" : "grab");
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const start = pointerStart.current;
    pointerStart.current = null;
    const dragged = finishNodeDrag();
    if (dragged) {
      const hitId = findHitAt(event.clientX, event.clientY);
      updateHovered(hitId);
      setGraphCursor(hitId ? "pointer" : "grab");
      return;
    }
    if (!start) return;
    if (!isGraphSurface(event.target)) {
      setGraphCursor("");
      return;
    }
    const threshold = start.pointerType === "touch" ? 10 : 5;
    const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (moved > threshold) {
      const hitId = findHitAt(event.clientX, event.clientY);
      updateHovered(hitId);
      setGraphCursor(hitId ? "pointer" : "grab");
      return;
    }
    onSelect(start.hitId);
    updateHovered(start.hitId);
    setGraphCursor(start.hitId ? "pointer" : "grab");
  }

  function handlePointerLeave() {
    updateHovered(null);
    setGraphCursor("");
  }

  function handlePointerCancel() {
    finishNodeDrag();
    pointerStart.current = null;
    setGraphCursor("");
  }

  useEffect(() => {
    function releaseOutside(event: PointerEvent) {
      // Pointer capture normally routes the release back here; this is the
      // fallback for browsers that drop it, and for background pans.
      finishNodeDrag();
      const target = event.target;
      if (target instanceof Node && containerRef.current?.contains(target)) return;
      pointerStart.current = null;
      updateHovered(null);
      setGraphCursor("");
    }
    window.addEventListener("pointerup", releaseOutside);
    window.addEventListener("pointercancel", releaseOutside);
    return () => {
      window.removeEventListener("pointerup", releaseOutside);
      window.removeEventListener("pointercancel", releaseOutside);
    };
  }, [finishNodeDrag, setGraphCursor, updateHovered]);

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
      const isPattern = node.kind === "pattern";
      const kindColor = colorFor(node.kind);
      const radius = node.radius + (hovered ? 0.8 : 0);

      ctx.save();
      ctx.globalAlpha = dim ? 0.16 : 1;

      // Selected notes glow; unfocused hubs stay flat like Obsidian notes.
      if (selected || hovered) {
        ctx.beginPath();
        ctx.arc(x, y, radius + 8, 0, Math.PI * 2);
        ctx.fillStyle = palette.pattern;
        ctx.globalAlpha = dim ? 0.06 : 0.16;
        ctx.fill();
        ctx.globalAlpha = dim ? 0.16 : 1;
      }

      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = isPattern || selected || hovered ? palette.pattern : palette.background;
      ctx.fill();
      ctx.lineWidth = isPattern ? 1.2 : 1.25;
      ctx.strokeStyle =
        selected || hovered ? palette.pattern : isPattern ? palette.background : kindColor;
      ctx.stroke();

      if (selected || hovered) {
        ctx.beginPath();
        ctx.arc(x, y, radius + 4, 0, Math.PI * 2);
        ctx.lineWidth = 1;
        ctx.strokeStyle = selected ? palette.foreground : palette.muted;
        ctx.stroke();
      } else if (emphasis) {
        ctx.beginPath();
        ctx.arc(x, y, radius + 3.5, 0, Math.PI * 2);
        ctx.lineWidth = 1.1;
        ctx.strokeStyle = palette.pattern;
        ctx.stroke();
      }

      ctx.restore();
    },
    [activeIds, colorFor, emphasisIds, hoveredId, palette, selectedId],
  );

  /**
   * Keep the node renderer identity tied to the label-only toggle as well, so
   * ForceGraph repaints labels when context-label visibility changes without
   * any node or link property changing.
   */
  const paintNodeAndLabels = useCallback(
    (raw: object, context: CanvasRenderingContext2D) => {
      paintNode(raw, context);
    },
    [paintNode, showContextLabels],
  );

  /**
   * Labels paint over the graph in screen space, so their size stays stable
   * while the force graph zooms. Colliding labels are skipped except for the
   * active selection.
   */
  const drawLabelsRef = useRef<(context: CanvasRenderingContext2D) => void>(() => {});
  const drawLabels = useCallback(
    (context: CanvasRenderingContext2D) => {
      const graph = graphRef.current;
      if (!graph || !size.width || !size.height) {
        labelHitAreas.current = [];
        return;
      }
      const dpr = window.devicePixelRatio || 1;
      if (labelCacheDpr.current !== dpr) {
        labelCache.current.clear();
        labelCacheDpr.current = dpr;
      }
      context.save();
      // The graph paints in its own zoom transform. Labels are positioned in
      // screen space, so draw them with the same CSS-pixel transform the graph
      // starts with and restore the graph's transform afterwards.
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.globalAlpha = 1;

      const zoom = graph.zoom() || 1;
      const positions = new Map(
        frameNodes.current.map((node) => {
          const point = graph.graph2ScreenCoords(node.x ?? 0, node.y ?? 0);
          return [node.id, point];
        }),
      );
      const placed: { left: number; top: number; right: number; bottom: number }[] = [];
      const hitAreas: LabelHitArea[] = [];
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
        const fontSize = isPattern ? 12 : 11;
        const labelColor = selected || hovered ? palette.foreground : palette.muted;
        const bitmap = getLabelBitmap(node.label, isPattern, labelColor, palette.background, dpr);
        const textWidth = bitmap.textWidth;
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

        const inset = textWidth / 2 + 12;
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

        hitAreas.push({
          id: node.id,
          left: left - 2,
          top: top - 2,
          right: right + 2,
          bottom: bottom + 2,
        });
        const drawX = Math.round((labelX - bitmap.width / 2) * dpr) / dpr;
        const drawY = Math.round((labelY - bitmap.height / 2) * dpr) / dpr;
        context.drawImage(bitmap.canvas, drawX, drawY, bitmap.width, bitmap.height);
        placed.push({ left, top, right, bottom });
      }
      labelHitAreas.current = hitAreas;
      context.restore();
    },
    [
      activeIds,
      getLabelBitmap,
      hoveredId,
      palette,
      selectedId,
      showContextLabels,
      size.height,
      size.width,
    ],
  );

  drawLabelsRef.current = drawLabels;

  /**
   * Labels paint at the end of the graph's own frame, after links and nodes.
   * Keeping them on the same canvas avoids a second full-screen transparent
   * layer, which measured as the main source of dropped pan and drag frames.
   * The stable callback reads the latest label closure through the ref.
   */
  const paintLabelFrame = useCallback((context: CanvasRenderingContext2D) => {
    drawLabelsRef.current(context);
  }, []);

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
    <div
      ref={containerRef}
      className="absolute inset-0"
      onMouseDownCapture={handleMouseDownCapture}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onPointerCancel={handlePointerCancel}
    >
      <div aria-hidden="true" className="absolute inset-0">
        {size.width > 0 && (
          <ForceGraph2D
            ref={graphRef}
            width={size.width}
            height={size.height}
            graphData={graphData}
            backgroundColor="rgba(0,0,0,0)"
            nodeCanvasObject={paintNodeAndLabels}
            linkColor={linkColor}
            linkWidth={linkWidth}
            linkCurvature={(raw) => ((raw as LinkPoint).relation === "echoes" ? 0.14 : 0)}
            onRenderFramePre={() => {
              frameNodes.current = [];
            }}
            onRenderFramePost={paintLabelFrame}
            onEngineStop={handleEngineStop}
            cooldownTicks={reducedMotion || !hasSettled ? 0 : 80}
            warmupTicks={reducedMotion ? 80 : 100}
            d3AlphaDecay={0.045}
            d3VelocityDecay={0.35}
            minZoom={0.35}
            maxZoom={2.5}
            autoPauseRedraw={!dragging}
            enablePointerInteraction={false}
            enableNodeDrag={false}
            enablePanInteraction
            enableZoomInteraction
          />
        )}
      </div>

      <div className="absolute right-2 top-2 z-30 flex items-center gap-0.5 text-muted-foreground opacity-70 transition-opacity hover:opacity-100 max-sm:hidden">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Zoom out"
          title="Zoom out"
          className="size-7 rounded-[3px] text-inherit hover:bg-accent hover:text-foreground [&_svg]:size-3.5"
          onClick={() => zoomBy(0.8)}
        >
          <Minus />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Zoom in"
          title="Zoom in"
          className="size-7 rounded-[3px] text-inherit hover:bg-accent hover:text-foreground [&_svg]:size-3.5"
          onClick={() => zoomBy(1.25)}
        >
          <Plus />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Fit graph to view"
          title="Fit graph to view"
          className="size-7 rounded-[3px] text-inherit hover:bg-accent hover:text-foreground [&_svg]:size-3.5"
          onClick={() => fitAll(reducedMotion ? 0 : 300)}
        >
          <Maximize2 />
        </Button>
        {selectedId && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Focus selected node"
            title="Focus selected node"
            className="size-7 rounded-[3px] text-inherit hover:bg-accent hover:text-foreground [&_svg]:size-3.5"
            onClick={() => fitSelection(reducedMotion ? 0 : 350)}
          >
            <Crosshair />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Restart layout"
          title="Restart layout"
          className="size-7 rounded-[3px] text-inherit hover:bg-accent hover:text-foreground [&_svg]:size-3.5"
          onClick={resetLayout}
        >
          <RotateCcw />
        </Button>
      </div>
    </div>
  );
}
