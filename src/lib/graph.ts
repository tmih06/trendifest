import type { GraphLink, GraphNode, NodeShape } from "obi-graph";
import type { TrendMap } from "../../shared/types.ts";

/** App-only metadata used by the connection-count color accessor. */
export interface TrendNodeData {
  degree: number;
}

const MEDIA_SHAPES: Record<string, NodeShape> = {
  image: "square",
  video: "triangle",
  audio: "diamond",
  link: "pentagon",
};

/**
 * Adapt immutable API data to obi-graph without leaking simulation state into
 * the payload. The inspector keeps full labels; only canvas titles are shortened.
 * Solid observations and dashed similarities retain their distinct spacing.
 */
export function toCanvas(map: TrendMap) {
  const degrees = new Map<string, number>();
  for (const edge of map.edges) {
    degrees.set(edge.source, (degrees.get(edge.source) ?? 0) + 1);
    if (edge.target !== edge.source) {
      degrees.set(edge.target, (degrees.get(edge.target) ?? 0) + 1);
    }
  }
  const nodes: GraphNode<TrendNodeData>[] = map.nodes.map((node) => {
    const label = node.label.replace(/\s+/g, " ").trim();
    return {
      id: node.id,
      label:
        node.kind === "pattern" && label.length > 46 ? `${label.slice(0, 45).trimEnd()}…` : label,
      radius: node.radius * 0.6,
      shape: node.kind === "pattern" ? (MEDIA_SHAPES[node.kind_ ?? "text"] ?? "circle") : "circle",
      hub: node.kind !== "pattern",
      data: { degree: degrees.get(node.id) ?? 0 },
    };
  });
  const links: GraphLink[] = map.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    dashed: edge.relation === "similarity",
    distance: edge.relation === "similarity" ? 80 : 90,
    width: edge.relation === "similarity" ? 0.7 : 0.9,
  }));
  return { nodes, links };
}
