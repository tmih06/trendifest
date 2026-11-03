import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type ForceLink,
} from "d3-force";
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
import { Button } from "@trendifest/opendesk";
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d";
import type { Theme } from "@/hooks/use-app";
import { connectionsFor, endpointId, type GraphLink, type GraphNode } from "@/lib/graph";

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
/** The layout copy: links point at ids until d3 resolves them to node objects. */
type CanvasGraph = { nodes: NodePoint[]; links: LinkPoint[] };

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

const LABEL_FONT_FAMILY = '"Geist Variable", "Geist", ui-sans-serif, sans-serif';

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Labels repeat every frame. Rasterize the halo and glyphs once per role,
 * color and DPR; the frame loop then only draws the bitmap.
 */
function makeLabelBitmap(
  label: string,
  isHub: boolean,
  color: string,
  background: string,
  dpr: number,
): LabelBitmap {
  const fontSize = isHub ? 12 : 11;
  const font = `${isHub ? 500 : 400} ${fontSize}px ${LABEL_FONT_FAMILY}`;
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
    // Hub names are the map's frame, and leaves keep moving under them while
    // the force simulation settles. A halo is not enough to stay legible over
    // a circle, so hub labels get an opaque chip; leaf labels keep the halo so
    // they stay quiet.
    if (isHub) {
      context.fillStyle = background;
      context.beginPath();
      const radius = 3;
      const left = 0;
      const top = 0;
      const right = width;
      const bottom = height;
      context.moveTo(left + radius, top);
      context.lineTo(right - radius, top);
      context.quadraticCurveTo(right, top, right, top + radius);
      context.lineTo(right, bottom - radius);
      context.quadraticCurveTo(right, bottom, right - radius, bottom);
      context.lineTo(left + radius, bottom);
      context.quadraticCurveTo(left, bottom, left, bottom - radius);
      context.lineTo(left, top + radius);
      context.quadraticCurveTo(left, top, left + radius, top);
      context.closePath();
      context.fill();
    }
    context.font = font;
    context.textAlign = "center";
    context.textBaseline = "middle";
    if (!isHub) {
      context.lineWidth = 3;
      context.lineJoin = "round";
      context.strokeStyle = background;
      context.strokeText(label, width / 2, height / 2);
    }
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
  segment: string;
  pattern: string;
  pool: string;
  foreground: string;
  muted: string;
  background: string;
  edge: string;
  edgeDim: string;
  edgeSelected: string;
  /** Similarity is a measured affinity, so it stays quieter than an observation. */
  edgeSimilarity: string;
  edgeSimilarityDim: string;
}

const FALLBACK_PALETTE: GraphPalette = {
  segment: "#737373",
  pattern: "#7048e8",
  pool: "#a3a3a3",
  foreground: "#0a0a0a",
  muted: "#737373",
  background: "#ffffff",
  edge: "rgba(115, 115, 115, 0.30)",
  edgeDim: "rgba(115, 115, 115, 0.06)",
  edgeSelected: "rgba(115, 115, 115, 0.62)",
  edgeSimilarity: "rgba(115, 115, 115, 0.40)",
  edgeSimilarityDim: "rgba(115, 115, 115, 0.10)",
};

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
  // The shell owns the surfaces and text tokens; the graph-specific node hues
  // fall back to them, so the map is drawn in the same palette as the chrome.
  const surface =
    token("--background-primary") || token("--surface") || FALLBACK_PALETTE.background;
  const fg = token("--text-normal") || token("--fg") || FALLBACK_PALETTE.foreground;
  const muted = token("--graph-text") || token("--fg-3") || FALLBACK_PALETTE.muted;
  const line = token("--graph-line") || token("--line-strong") || "#737373";
  return {
    segment: token("--graph-node") || muted,
    pattern: token("--graph-node-focused") || muted,
    pool: token("--graph-node-attachment") || muted,
    foreground: fg,
    muted,
    background: surface,
    edge: resolveColor(line, 0.3),
    edgeDim: resolveColor(line, 0.06),
    edgeSelected: resolveColor(line, 0.62),
    // Dashed similarity links read thinner than a solid observation, so their
    // alpha is raised slightly to keep both legible at the same zoom.
    edgeSimilarity: resolveColor(line, 0.4),
    edgeSimilarityDim: resolveColor(line, 0.1),
  };
}

/** Similarity links are dashed so a measured proximity never reads as an observation. */
function isSimilarityLink(link: object): boolean {
  const relation = "relation" in link ? link.relation : null;
  return typeof relation === "string" && relation === "similarity";
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

/** The same forces settle the initial layout offscreen and relax node drags. */
function layoutForces() {
  return {
    charge: forceManyBody<NodePoint>().strength(-220).distanceMax(650),
    link: forceLink<NodePoint, LinkPoint>()
      .id((node) => node.id)
      // Similarity links join already-related patterns, so they sit closer than
      // an audience observation; everything else keeps the established spacing.
      .distance((link) => (isSimilarityLink(link) ? 80 : 90))
      .strength(0.3),
    collide: forceCollide<NodePoint>((node) => node.radius + 10).iterations(3),
    x: forceX<NodePoint>(0).strength(0.025),
    y: forceY<NodePoint>(0).strength(0.025),
    center: forceCenter<NodePoint>(0, 0),
  };
}

/**
 * Layout starts from a golden-angle spiral so nodes never share a spot, then a
 * finite simulation settles the graph. Observation and similarity edges both
 * shape it; nothing is positioned by hand.
 */
function makeGraphData(
  sourceNodes: GraphNode[],
  sourceLinks: GraphLink[],
  layoutVersion = 0,
  previous?: CanvasGraph,
): CanvasGraph {
  const oldNodes = new Map(previous?.nodes.map((node) => [node.id, node]));
  const oldLinks = new Map(previous?.links.map((link) => [link.id, link]));
  if (
    previous &&
    sourceNodes.length === previous.nodes.length &&
    sourceLinks.length === previous.links.length &&
    sourceNodes.every((node) => oldNodes.has(node.id)) &&
    sourceLinks.every((link) => {
      const old = oldLinks.get(link.id);
      return (
        old?.relation === link.relation &&
        endpointId(old.source) === link.source &&
        endpointId(old.target) === link.target
      );
    })
  ) {
    // Keep the graph object identity as well as coordinates. A new graphData
    // object reheats the library even when only scores or labels changed.
    // Collision padding reserves room for the bounded score-radius changes.
    for (const node of sourceNodes) Object.assign(oldNodes.get(node.id)!, node);
    for (const link of sourceLinks) oldLinks.get(link.id)!.similarity = link.similarity;
    return previous;
  }
  const graph: CanvasGraph = {
    nodes: sourceNodes.map((node, index) => {
      const old = oldNodes.get(node.id);
      const angle = index * 2.399963229728653 + layoutVersion * 0.41;
      const distance = 24 * Math.sqrt(index + 1);
      return {
        ...node,
        x: old?.x ?? Math.cos(angle) * distance,
        y: old?.y ?? Math.sin(angle) * distance,
        vx: 0,
        vy: 0,
      };
    }),
    links: sourceLinks.map((link) => ({ ...link })),
  };

  const forces = layoutForces();
  const simulation = forceSimulation<NodePoint>(graph.nodes).stop();
  for (const [name, force] of Object.entries(forces)) simulation.force(name, force as never);
  forces.link.links(graph.links);
  simulation.alphaDecay(0.035).velocityDecay(0.5).tick(300);
  simulation.stop();
  for (const node of graph.nodes) {
    node.vx = 0;
    node.vy = 0;
  }
  // d3 resolves endpoints to objects; the canvas owns its own link resolution.
  graph.links = sourceLinks.map((link) => ({ ...link }));
  return graph;
}

interface TrendGraphCanvasProps {
  theme: Theme;
  nodes: GraphNode[];
  links: GraphLink[];
  selectedId: string | null;
  activeIds: Set<string>;
  emphasisIds: Set<string>;
  showContextLabels: boolean;
  /**
   * Keep hub labels visible at every zoom level. The map's hubs are viewer
   * segments, and an unlabeled anchor makes the map unreadable.
   */
  labelHubsAlways?: boolean;
  /**
   * Re-frame the camera onto the selection. Correct when the graph is a
   * neighborhood to explore; wrong for a map whose node size encodes a score,
   * because zooming into one node destroys the comparison the view exists for.
   */
  autoFitSelection?: boolean;
  onSelect: (id: string | null) => void;
}

/**
 * Force graph: canvas rendering, d3 simulation, pan/zoom, node dragging and
 * selection. The canvas is visual; the ranked pattern list is the keyboard and
 * screen-reader path through the same nodes.
 */
export function TrendGraphCanvas({
  theme,
  nodes,
  links,
  selectedId,
  activeIds,
  emphasisIds,
  showContextLabels,
  labelHubsAlways = false,
  autoFitSelection = true,
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
  } | null>(null);
  const wheelZoom = useRef<{
    target: number;
    anchor: { screenX: number; screenY: number; graphX: number; graphY: number };
    raf: number;
    lastFrame: number;
  } | null>(null);
  const cameraAnimation = useRef<{
    raf: number;
    start: number;
    fromX: number;
    fromY: number;
    fromScale: number;
    toX: number;
    toY: number;
    toScale: number;
    duration: number;
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
  const [dragging, setDragging] = useState(false);
  const previousLayout = useRef<{ version: number; data: CanvasGraph } | null>(null);
  const graphData = useMemo(() => {
    const previous = previousLayout.current;
    const data = makeGraphData(
      nodes,
      links,
      layoutVersion,
      previous?.version === layoutVersion ? previous.data : undefined,
    );
    previousLayout.current = { version: layoutVersion, data };
    return data;
  }, [nodes, links, layoutVersion]);
  const parentHubs = useMemo(() => {
    const parents = new Map<string, string[]>();
    for (const link of graphData.links) {
      // Similarity edges join peers, not a hub to its leaves; label placement
      // only follows the audience-to-pattern observation edges. Endpoints may
      // already be resolved to node objects by the simulation, so compare ids.
      if (link.relation === "similarity") continue;
      const source = endpointId(link.source);
      const target = endpointId(link.target);
      const list = parents.get(target) ?? [];
      list.push(source);
      parents.set(target, list);
    }
    return parents;
  }, [graphData.links]);

  useEffect(() => {
    shouldFit.current = true;
  }, [layoutVersion]);

  const stopWheelZoom = useCallback(() => {
    const state = wheelZoom.current;
    if (state?.raf) window.cancelAnimationFrame(state.raf);
    wheelZoom.current = null;
  }, []);

  const stopCameraAnimation = useCallback(() => {
    const animation = cameraAnimation.current;
    if (animation?.raf) window.cancelAnimationFrame(animation.raf);
    cameraAnimation.current = null;
  }, []);

  const animateCameraTo = useCallback(
    (x: number, y: number, scale: number, duration = 600) => {
      const graph = graphRef.current;
      if (!graph) return;
      stopWheelZoom();
      stopCameraAnimation();
      const center = graph.centerAt();
      const animation = {
        raf: 0,
        start: performance.now(),
        fromX: center.x,
        fromY: center.y,
        fromScale: graph.zoom() || 1,
        toX: x,
        toY: y,
        toScale: scale,
        duration,
      };
      cameraAnimation.current = animation;

      const tick = (now: number) => {
        if (cameraAnimation.current !== animation) return;
        const progress = Math.min(1, (now - animation.start) / animation.duration);
        const eased = progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
        const nextScale = animation.fromScale + (animation.toScale - animation.fromScale) * eased;
        const nextX = animation.fromX + (animation.toX - animation.fromX) * eased;
        const nextY = animation.fromY + (animation.toY - animation.fromY) * eased;
        graph.zoom(nextScale, 0);
        graph.centerAt(nextX, nextY, 0);
        if (progress < 1) {
          animation.raf = window.requestAnimationFrame(tick);
        } else {
          cameraAnimation.current = null;
        }
      };
      animation.raf = window.requestAnimationFrame(tick);
    },
    [stopCameraAnimation, stopWheelZoom],
  );

  useEffect(
    () => () => {
      stopCameraAnimation();
      stopWheelZoom();
    },
    [stopCameraAnimation, stopWheelZoom],
  );

  const getLabelBitmap = useCallback(
    (label: string, isHub: boolean, color: string, background: string, dpr: number) => {
      const key = `${isHub ? 1 : 0}|${dpr}|${color}|${background}|${label}`;
      const cached = labelCache.current.get(key);
      if (cached) return cached;
      const bitmap = makeLabelBitmap(label, isHub, color, background, dpr);
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
    const element = containerRef.current;
    if (!element) return;
    const container = element;

    // A wheel gesture can contain dozens of events. Accumulate one target and
    // drive a single camera loop; restarting a tween per event makes them
    // fight each other and reads as stutter.
    function tick(time: number) {
      const graph = graphRef.current;
      const state = wheelZoom.current;
      if (!graph || !state) {
        wheelZoom.current = null;
        return;
      }
      const current = graph.zoom() || 1;
      const dt = state.lastFrame ? Math.min(50, Math.max(1, time - state.lastFrame)) : 16;
      state.lastFrame = time;
      const ease = 1 - Math.exp(-dt / 55);
      const next =
        Math.abs(state.target - current) < 0.0004
          ? state.target
          : current + (state.target - current) * ease;

      const rect = container.getBoundingClientRect();
      const centerX = state.anchor.graphX - (state.anchor.screenX - rect.width / 2) / next;
      const centerY = state.anchor.graphY - (state.anchor.screenY - rect.height / 2) / next;
      graph.zoom(next, 0);
      graph.centerAt(centerX, centerY, 0);

      if (Math.abs(state.target - next) < 0.0007) {
        state.raf = 0;
        wheelZoom.current = null;
        return;
      }
      state.raf = window.requestAnimationFrame(tick);
    }

    function onWheel(event: WheelEvent) {
      if (!isGraphSurface(event.target)) return;
      const graph = graphRef.current;
      if (!graph) return;
      event.preventDefault();
      stopCameraAnimation();

      const rect = container.getBoundingClientRect();
      const screenX = event.clientX - rect.left;
      const screenY = event.clientY - rect.top;
      const delta =
        event.deltaMode === 1
          ? event.deltaY * 16
          : event.deltaMode === 2
            ? event.deltaY * 400
            : event.deltaY;
      const factor = Math.exp(-delta * 0.0015);
      if (!Number.isFinite(factor) || factor === 1) return;

      let state = wheelZoom.current;
      if (!state) {
        const current = graph.zoom() || 1;
        const anchor = graph.screen2GraphCoords(screenX, screenY);
        state = {
          target: current,
          anchor: {
            screenX,
            screenY,
            graphX: anchor.x,
            graphY: anchor.y,
          },
          raf: 0,
          lastFrame: 0,
        };
        wheelZoom.current = state;
      } else if (Math.hypot(screenX - state.anchor.screenX, screenY - state.anchor.screenY) > 8) {
        const anchor = graph.screen2GraphCoords(screenX, screenY);
        state.anchor = {
          screenX,
          screenY,
          graphX: anchor.x,
          graphY: anchor.y,
        };
      }

      state.target = Math.min(2.5, Math.max(0.35, state.target * factor));
      if (!state.raf) state.raf = window.requestAnimationFrame(tick);
    }

    container.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", onWheel);
      const state = wheelZoom.current;
      if (state?.raf) window.cancelAnimationFrame(state.raf);
      wheelZoom.current = null;
    };
  }, [stopCameraAnimation]);

  const mountedGraph = size.width > 0;
  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const forces = layoutForces();
    // Keep the library-owned link force: it binds endpoints when its deferred
    // graph-data update runs, which can happen after this React effect.
    const link = graph.d3Force("link") as unknown as ForceLink<NodePoint, LinkPoint>;
    link.distance((raw) => (isSimilarityLink(raw) ? 80 : 90)).strength(0.3);
    for (const [name, force] of Object.entries(forces)) {
      if (name !== "link") graph.d3Force(name, force as never);
    }
    graph.d3ReheatSimulation();
  }, [graphData, mountedGraph]);

  const compact = size.width < 700 || size.height < 560;

  const fitAll = useCallback(
    (duration: number) => {
      stopCameraAnimation();
      graphRef.current?.zoomToFit(duration, compact ? 44 : 92);
    },
    [compact, stopCameraAnimation],
  );

  // Resize the camera, not the simulation, when the sidebar, inspector or
  // viewport changes. A desktop zoom carried onto a phone crops most nodes.
  useEffect(() => {
    if (size.width > 0 && size.height > 0) fitAll(0);
  }, [fitAll, size.width, size.height]);

  /**
   * Ease the camera to a box containing the selected node and its direct
   * relationships. Mobile subtracts the inspector overlay from the usable
   * viewport so the group lands above it.
   */
  const fitSelectionCamera = useCallback(
    (duration: number) => {
      if (!selectedId || !size.width || !size.height) return;
      const graph = graphRef.current;
      if (!graph) return;
      const byId = new Map(graphData.nodes.map((node) => [node.id, node]));
      const selected = byId.get(selectedId);
      if (!selected) return;

      const focus = [selected];
      const seen = new Set([selected.id]);
      for (const connection of connectionsFor(selectedId, graphData)) {
        const node = byId.get(connection.node.id);
        if (node && !seen.has(node.id)) {
          seen.add(node.id);
          focus.push(node);
        }
      }

      let minX = Number.POSITIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      for (const node of focus) {
        if (typeof node.x !== "number" || typeof node.y !== "number") continue;
        const radius = (node.radius ?? 5) + 8;
        minX = Math.min(minX, node.x - radius);
        minY = Math.min(minY, node.y - radius);
        maxX = Math.max(maxX, node.x + radius);
        maxY = Math.max(maxY, node.y + radius);
      }
      if (!Number.isFinite(minX)) return;

      const mobile = size.width < 1024;
      const bottomInset = mobile
        ? Math.min(Math.round(window.innerHeight * 0.45), Math.round(size.height * 0.6))
        : 0;
      const padding = compact ? 42 : 92;
      const availableWidth = Math.max(1, size.width - padding * 2);
      const availableHeight = Math.max(1, size.height - bottomInset - padding * 2);
      const bboxWidth = Math.max(1, maxX - minX);
      const bboxHeight = Math.max(1, maxY - minY);
      const scale = Math.min(
        2.5,
        Math.max(0.35, Math.min(availableWidth / bboxWidth, availableHeight / bboxHeight)),
      );
      const targetX = (minX + maxX) / 2;
      const targetScreenY = (size.height - bottomInset) / 2;
      const targetY = (minY + maxY) / 2 + (size.height / 2 - targetScreenY) / scale;
      animateCameraTo(targetX, targetY, scale, duration);
    },
    [animateCameraTo, compact, graphData, selectedId, size.height, size.width],
  );

  useEffect(() => {
    if (!selectedId || !autoFitSelection) return;
    fitSelectionCamera(620);
  }, [autoFitSelection, fitSelectionCamera, selectedId]);

  const finishLayout = useCallback(() => {
    if (shouldFit.current) {
      shouldFit.current = false;
      fitAll(0);
    }
  }, [fitAll]);

  const handleEngineStop = useCallback(() => {
    finishLayout();
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
        const radius = (node.radius ?? 5) * zoom + (node.hub ? 14 : 11);
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
    // Let the force layout reclaim the node; it should drift back rather than
    // sticking to the drop point.
    node.fx = undefined;
    node.fy = undefined;
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
    stopWheelZoom();
    stopCameraAnimation();
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
              graphRef.current?.d3ReheatSimulation();
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
      if (kind === "pool") return palette.pool;
      return palette.segment;
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
      const kindColor = colorFor(node.kind);
      const radius = node.radius + (hovered ? 0.8 : 0);

      ctx.save();
      ctx.globalAlpha = dim ? 0.16 : 1;

      // A selected or hovered node gets a soft halo; everything else stays flat
      // so the map's colour encoding is never mistaken for emphasis.
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
      // A selected or hovered node is the focus of the interaction; hubs keep
      // their kind colour so the map's anchors never read as a claim.
      ctx.fillStyle = selected || hovered ? palette.pattern : kindColor;
      ctx.fill();
      ctx.lineWidth = 0.7;
      ctx.strokeStyle = palette.background;
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
      const leafFade = smoothstep(2, 2.4, zoom);
      const hubFade = smoothstep(1.2, 1.7, zoom);
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
          if (node.id === selectedId || node.id === hoveredId || showContextLabels) return true;
          if (labelHubsAlways && node.hub) return true;
          return node.hub ? hubFade > 0.01 : leafFade > 0.01;
        })
        .toSorted((a, b) => {
          // Hub labels are drawn last so pattern circles cannot paint over the
          // anchor names; without this a dense cluster hides "Discover".
          const priority = (node: NodePoint) =>
            node.id === selectedId || node.id === hoveredId
              ? 3
              : node.hub
                ? 1.5
                : node.degree > 2
                  ? 2
                  : 1;
          return priority(b) - priority(a);
        });

      for (const node of labels) {
        const point = positions.get(node.id);
        if (!point) continue;
        const isHub = node.hub === true;
        const selected = node.id === selectedId;
        const hovered = node.id === hoveredId;
        const fade =
          selected || hovered || showContextLabels || (labelHubsAlways && isHub)
            ? 1
            : isHub
              ? hubFade
              : leafFade;
        if (fade < 0.02) continue;
        const fontSize = isHub ? 12 : 11;
        const labelColor = selected || hovered ? palette.foreground : palette.muted;
        const bitmap = getLabelBitmap(node.label, isHub, labelColor, palette.background, dpr);
        const textWidth = bitmap.textWidth;
        let labelX = point.x;
        // Hubs carry the map's frame and are flanked by their own leaves, so
        // their names sit further out than a leaf label would.
        let labelY = point.y + node.radius * zoom + (isHub ? 22 : 12);

        if (!isHub) {
          const parents = (parentHubs.get(node.id) ?? [])
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
          // Wide labels are centered beneath the node instead of pushed out
          // radially: a long sentence offset by half its own width otherwise
          // reads as detached from the circle it describes.
          if (textWidth > 96) {
            labelX = point.x;
            labelY = point.y + node.radius * zoom + 12;
          } else {
            const distance = node.radius * zoom + 7 + textWidth / 2;
            labelX = point.x + directionX * distance;
            labelY = point.y + directionY * distance;
          }
        }

        // Hub names are the map's frame and sit beside their circle; a narrow
        // inset let "News" and "Game dev" run into each other when hubs were
        // close. Hub labels get a wider margin so they stay legible.
        const inset = textWidth / 2 + (isHub ? 26 : 12);
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

        // Hub names are the frame of the map; nothing may paint over them, not
        // even the selected label. Selection is already shown by the ring and
        // the detail panel.
        if (!isHub) {
          const coversHub = frameNodes.current.some((other) => {
            if (!other.hub) return false;
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
        // Hubs stay eligible at every zoom, but cannot overprint another name.
        // The audience sidebar retains names suppressed on small viewports.
        if (collides && !selected && !hovered) continue;

        if (fade >= 0.3) {
          hitAreas.push({
            id: node.id,
            left: left - 2,
            top: top - 2,
            right: right + 2,
            bottom: bottom + 2,
          });
        }
        const drawX = Math.round((labelX - bitmap.width / 2) * dpr) / dpr;
        const drawY = Math.round((labelY - bitmap.height / 2) * dpr) / dpr;
        context.globalAlpha = fade;
        context.drawImage(bitmap.canvas, drawX, drawY, bitmap.width, bitmap.height);
        context.globalAlpha = 1;
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
      parentHubs,
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
      const similar = link.relation === "similarity";
      const active = sourceActive && targetActive;
      if (selectedId && (source === selectedId || target === selectedId)) {
        const otherActive = source === selectedId ? targetActive : sourceActive;
        if (otherActive) return similar ? palette.edgeSimilarity : palette.edgeSelected;
        return similar ? palette.edgeSimilarityDim : palette.edgeDim;
      }
      if (active) return similar ? palette.edgeSimilarity : palette.edge;
      return similar ? palette.edgeSimilarityDim : palette.edgeDim;
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
      if (link.relation === "similarity") return selectedEdge && otherActive ? 1 : 0.7;
      return selectedEdge && otherActive ? 1.4 : 0.9;
    },
    [activeIds, selectedId],
  );

  function zoomBy(factor: number) {
    stopWheelZoom();
    stopCameraAnimation();
    const graph = graphRef.current;
    if (!graph) return;
    graph.zoom(graph.zoom() * factor, reducedMotion ? 0 : 250);
  }

  function resetLayout() {
    stopWheelZoom();
    stopCameraAnimation();
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
            linkCurvature={0}
            linkLineDash={(raw: object) => (isSimilarityLink(raw) ? [3, 3] : null)}
            onRenderFramePre={() => {
              frameNodes.current = [];
            }}
            onRenderFramePost={paintLabelFrame}
            onEngineStop={handleEngineStop}
            cooldownTicks={reducedMotion ? 0 : 100}
            warmupTicks={0}
            cooldownTime={2_000}
            d3AlphaDecay={0.035}
            d3VelocityDecay={0.5}
            minZoom={0.1}
            maxZoom={2.5}
            autoPauseRedraw={!dragging}
            enablePointerInteraction={false}
            enableNodeDrag={false}
            enablePanInteraction
            enableZoomInteraction={false}
          />
        )}
      </div>

      <div
        role="group"
        aria-label="Graph view controls"
        className="pointer-events-auto absolute bottom-12 end-3 z-30 flex items-center gap-0.5 rounded-lg border border-line bg-surface/90 p-0.5 text-fg-3 shadow-xs backdrop-blur transition-opacity hover:text-fg"
      >
        <Button
          variant="ghost"
          size="sm"
          square
          aria-label="Zoom out"
          title="Zoom out"
          className="text-fg-3 hover:text-fg"
          onClick={() => zoomBy(0.8)}
        >
          <Minus />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          square
          aria-label="Zoom in"
          title="Zoom in"
          className="text-fg-3 hover:text-fg"
          onClick={() => zoomBy(1.25)}
        >
          <Plus />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          square
          aria-label="Fit graph to view"
          title="Fit graph to view"
          className="text-fg-3 hover:text-fg"
          onClick={() => fitAll(reducedMotion ? 0 : 300)}
        >
          <Maximize2 />
        </Button>
        {selectedId && (
          <Button
            variant="ghost"
            size="sm"
            square
            aria-label="Focus selected node"
            title="Focus selected node"
            className="text-fg-3 hover:text-fg"
            onClick={() => fitSelectionCamera(reducedMotion ? 0 : 450)}
          >
            <Crosshair />
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          square
          aria-label="Restart layout"
          title="Restart layout"
          className="text-fg-3 hover:text-fg"
          onClick={resetLayout}
        >
          <RotateCcw />
        </Button>
      </div>
    </div>
  );
}
