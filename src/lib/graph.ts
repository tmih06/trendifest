import type { GraphLink, GraphNode } from "obi-graph";
import type { TrendMap } from "../../shared/types.ts";

/** App-only metadata used by the connectedness color accessor. */
export interface TrendNodeData {
  /** Measured related-topic links, not source observations. */
  degree: number;
}

/**
 * obi-graph places labels in priority tiers, where `hub` rows are drawn first
 * and win any collision. The strongest topics therefore get placement priority
 * once zoom makes labels visible, without bypassing the shared zoom fade.
 * Other titles appear when placement allows them.
 */
const HUB_TOPICS = 12;

/**
 * Canvas titles stay one line and must still fit the narrowest surface, where
 * obi-graph skips any label wider than the canvas. The inspector and the ranked
 * list always show the untruncated title.
 */
const CANVAS_LABEL_LIMIT = 42;

function canvasLabel(label: string) {
  const collapsed = label.replace(/\s+/g, " ").trim();
  if (collapsed.length <= CANVAS_LABEL_LIMIT) return collapsed;
  return `${collapsed.slice(0, CANVAS_LABEL_LIMIT - 1).trimEnd()}…`;
}

/**
 * Adapt immutable API data to obi-graph without leaking simulation state into
 * the payload. Every node is a specific topic and every link is a measured
 * relationship between two distinct topics, so there are no source hubs and no
 * per-post nodes. Radii come from the API unchanged, which keeps node size a
 * direct, monotonic read of topic potential.
 */
export function toCanvas(map: TrendMap) {
  const ids = new Set(map.nodes.map((node) => node.id));
  const degrees = new Map<string, number>();
  const links: GraphLink[] = [];
  for (const edge of map.edges) {
    if (edge.source === edge.target) continue;
    if (!ids.has(edge.source) || !ids.has(edge.target)) continue;
    degrees.set(edge.source, (degrees.get(edge.source) ?? 0) + 1);
    degrees.set(edge.target, (degrees.get(edge.target) ?? 0) + 1);
    links.push({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      dashed: false,
      distance: 96,
      width: 0.9,
    });
  }
  const labelled = new Set(
    [...map.nodes]
      .sort((a, b) => b.potential - a.potential || b.radius - a.radius || a.id.localeCompare(b.id))
      .slice(0, HUB_TOPICS)
      .map((node) => node.id),
  );
  const nodes: GraphNode<TrendNodeData>[] = map.nodes.map((node) => ({
    id: node.id,
    label: canvasLabel(node.label),
    radius: node.radius,
    hub: labelled.has(node.id),
    data: { degree: degrees.get(node.id) ?? 0 },
  }));
  return { nodes, links };
}
