/**
 * Live related-query graph model. The center is one monitored Google Trends
 * term; its top and rising related queries are the leaves. Edges are either
 * Google's related-query relationship or a literal phrase containment between
 * two related queries. Nothing is inferred beyond the returned labels.
 */
import type { TermInsight, TrendAnalysis } from "../../shared/types.ts";

export type NodeKind = "term" | "top" | "rising";
export type Relation = "related" | "rising" | "contains";

export const KIND_LABEL: Record<NodeKind, string> = {
  term: "Tracked term",
  top: "Top query",
  rising: "Rising query",
};

export const KIND_COLOR: Record<NodeKind, string> = {
  term: "--graph-node-focused",
  top: "--graph-node",
  rising: "--graph-node-attachment",
};

export const KIND_ORDER: NodeKind[] = ["term", "top", "rising"];
export const KIND_GROUP_LABEL: Record<NodeKind, string> = {
  term: "Tracked term",
  top: "Top queries",
  rising: "Rising queries",
};

export interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
  description: string;
  radius: number;
  degree: number;
  /** Google's related-query score; null for the monitored center. */
  value: number | null;
  rising: boolean;
  parentTerm: string;
  /** Present only on the center node. */
  latest: number | null;
  changePct: number | null;
}

export interface GraphLink {
  id: string;
  source: string;
  target: string;
  relation: Relation;
}

export interface Connection {
  node: GraphNode;
  relation: Relation;
}

export interface RelatedGraph {
  seedId: string;
  geo: string;
  nodes: GraphNode[];
  links: GraphLink[];
  updatedAt: string;
  stale: boolean;
}

function normalize(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function queryId(query: string) {
  return `query:${normalize(query)}`;
}

function relatedRadius(query: { value: number; rising: boolean }) {
  if (query.rising) {
    // Rising values are growth percentages and can be thousands; logarithmic
    // sizing keeps a breakout from swallowing the rest of the neighborhood.
    return 5.8 + Math.min(4, Math.log10(Math.max(1, query.value) + 1) / 1.5);
  }
  return 5.2 + Math.min(4.2, Math.max(0, query.value) / 25);
}

function describeQuery(query: { rising: boolean }, term: string) {
  return query.rising
    ? `A rising Google search related to “${term}”.`
    : `A top Google search related to “${term}”.`;
}

/**
 * Build the one-hop graph around a single-term analysis. Google only returns
 * related queries for single-term requests, which is why the page selects one
 * monitored term at a time.
 */
export function buildRelatedGraph(analysis: TrendAnalysis): RelatedGraph {
  const insight = analysis.insights[0];
  if (!insight) {
    return {
      seedId: "",
      geo: analysis.query.geo,
      nodes: [],
      links: [],
      updatedAt: analysis.fetchedAt,
      stale: false,
    };
  }
  const seedId = `term:${normalize(insight.term)}`;
  const seed: GraphNode = {
    id: seedId,
    kind: "term",
    label: insight.term,
    description: `Monitored search term in ${analysis.query.geo}.`,
    radius: 17,
    degree: 0,
    value: null,
    rising: false,
    parentTerm: insight.term,
    latest: insight.latest,
    changePct: insight.changePct,
  };

  const seen = new Set<string>();
  const leaves: GraphNode[] = [];
  const links: GraphLink[] = [];
  for (const related of insight.related) {
    const id = queryId(related.query);
    if (seen.has(id)) continue;
    seen.add(id);
    const leaf: GraphNode = {
      id,
      kind: related.rising ? "rising" : "top",
      label: related.query,
      description: describeQuery(related, insight.term),
      radius: relatedRadius(related),
      degree: 1,
      value: related.value,
      rising: related.rising,
      parentTerm: insight.term,
      latest: null,
      changePct: null,
    };
    leaves.push(leaf);
    links.push({
      id: `${seedId}>${id}`,
      source: seedId,
      target: id,
      relation: related.rising ? "rising" : "related",
    });
  }

  // Literal phrase containment is visible in the labels themselves: "ai news"
  // and "ai news today" share a phrase, while nothing about their demand is
  // inferred. This gives the force layout a few real bridges beyond the hub.
  const ordered = [...leaves].sort((a, b) => a.label.length - b.label.length);
  let containmentEdges = 0;
  for (let index = 0; index < ordered.length && containmentEdges < 10; index += 1) {
    const shorter = ordered[index]!;
    const shortText = normalize(shorter.label);
    if (shortText.length < 3) continue;
    for (let other = index + 1; other < ordered.length; other += 1) {
      const longer = ordered[other]!;
      if (!normalize(longer.label).includes(shortText)) continue;
      links.push({
        id: `contains:${shorter.id}:${longer.id}`,
        source: shorter.id,
        target: longer.id,
        relation: "contains",
      });
      shorter.degree += 1;
      longer.degree += 1;
      containmentEdges += 1;
      if (containmentEdges >= 10) break;
    }
  }

  seed.degree = leaves.length;
  return {
    seedId,
    geo: analysis.query.geo,
    nodes: [seed, ...leaves],
    links,
    updatedAt: analysis.fetchedAt,
    stale: analysis.stale === true,
  };
}

export function connectionsFor(
  id: string,
  graph: Pick<RelatedGraph, "nodes" | "links">,
): Connection[] {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const connections: Connection[] = [];
  for (const link of graph.links) {
    if (link.source === id) {
      const node = byId.get(link.target);
      if (node) connections.push({ node, relation: link.relation });
    } else if (link.target === id) {
      const node = byId.get(link.source);
      if (node) connections.push({ node, relation: link.relation });
    }
  }
  return connections;
}

export function searchTextFor(node: GraphNode) {
  return [node.label, node.description, KIND_LABEL[node.kind], node.parentTerm]
    .join(" ")
    .toLowerCase();
}

export function relatedCount(insight: TermInsight | undefined) {
  return insight?.related.length ?? 0;
}
