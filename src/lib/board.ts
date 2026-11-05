import type {
  EntityKind,
  TopicEntity,
  TopicHistoryPoint,
  TopicPhase,
} from "../../shared/intelligence.ts";
import type { TrendMapNode } from "../../shared/types.ts";
import { topicSearchText } from "./format.ts";

/**
 * Pure board ranking/filtering and sparkline geometry.
 *
 * The table is the alternative to the canvas, so a row must never claim more
 * than the enriched map measured. Everything here reads the payload already in
 * memory: no per-row requests, no synthesised history, and a total tie-break so
 * a re-render cannot reshuffle equally scored rows.
 */

export const PAGE_SIZE = 80;
/** At most one stored sample per hour, capped so a row never carries a series. */
export const MAX_HISTORY_POINTS = 24;
/** Bounded catalogue slice: a select never renders the whole catalogue. */
export const ENTITY_OPTION_LIMIT = 25;
/** Kind vocabulary for the board filter; shared so panels stay consistent. */
export const ENTITY_KIND_LABELS: Record<EntityKind, string> = {
  person: "People",
  organization: "Organizations",
  location: "Locations",
  product: "Products",
};

export const ENTITY_KIND_FILTERS = [
  { value: "all", label: "All kinds" },
  { value: "person", label: ENTITY_KIND_LABELS.person },
  { value: "organization", label: ENTITY_KIND_LABELS.organization },
  { value: "location", label: ENTITY_KIND_LABELS.location },
  { value: "product", label: ENTITY_KIND_LABELS.product },
] as const;

export type EntityKindFilter = (typeof ENTITY_KIND_FILTERS)[number]["value"];
/** Named entities shown per row before collapsing the rest into a count. */
export const ROW_ENTITY_LIMIT = 3;
/** Reasons stay a concise evidence summary; the inspector holds the full text. */
export const ROW_REASON_LIMIT = 3;

export const PHASE_LABELS: Record<TopicPhase, string> = {
  rising: "Rising",
  sustained: "Sustained",
  fading: "Fading",
  insufficient_history: "Insufficient history",
};

export const PHASE_FILTERS = [
  { value: "all", label: "All phases" },
  { value: "rising", label: PHASE_LABELS.rising },
  { value: "sustained", label: PHASE_LABELS.sustained },
  { value: "fading", label: PHASE_LABELS.fading },
  { value: "insufficient_history", label: PHASE_LABELS.insufficient_history },
] as const;

export type PhaseFilter = (typeof PHASE_FILTERS)[number]["value"];

export const SORT_OPTIONS = [
  { value: "potential", label: "Potential" },
  { value: "movement", label: "Rank movement" },
  { value: "news", label: "News attention" },
  { value: "community", label: "Community momentum" },
  { value: "support", label: "New independent evidence" },
] as const;

export type SortKey = (typeof SORT_OPTIONS)[number]["value"];

export interface BoardEntry {
  node: TrendMapNode;
  /** Global potential rank when known, else the position in the supplied snapshot. */
  rank: number;
  text: string;
}

export interface BoardFilter {
  /** Raw search text; normalised here so accents never decide a match. */
  query: string;
  phase: PhaseFilter;
  /** Exact catalogue ID, already resolved by the caller. */
  entityId: string | null;
  /**
   * Kind restriction and the lookup it needs. Both travel together so a
   * requested kind can never be silently dropped for a missing index.
   */
  kind?: { value: Exclude<EntityKindFilter, "all">; byId: ReadonlyMap<string, EntityKind> };
}

/**
 * Preserve the global potential rank while the view is source-filtered and
 * sorted. History and movement are measured against whole-map ranks, so a
 * source-scoped subset cannot supply them: the caller passes the canonical map
 * order. Only a standalone caller without that map falls back to its own order.
 */
export function indexTopics(
  topics: readonly TrendMapNode[],
  rankById?: ReadonlyMap<string, number>,
): BoardEntry[] {
  return topics.map((node, index) => ({
    node,
    rank: rankById?.get(node.id) ?? index + 1,
    text: topicSearchText(node.label),
  }));
}

export function filterEntries(
  entries: readonly BoardEntry[],
  { query, phase, entityId, kind }: BoardFilter,
): BoardEntry[] {
  const term = topicSearchText(query).trim();
  return entries.filter(
    ({ node, text }) =>
      (!term || text.includes(term)) &&
      (phase === "all" || node.trend.phase === phase) &&
      (entityId === null || node.entityIds.includes(entityId)) &&
      (kind === undefined || node.entityIds.some((id) => kind.byId.get(id) === kind.value)),
  );
}

/** Entity IDs grouped by kind, so a kind filter never scans the catalogue per row. */
export function indexEntityKinds(entities: readonly TopicEntity[]): Map<string, EntityKind> {
  return new Map(entities.map((entity) => [entity.id, entity.kind]));
}

/**
 * A missing measurement ranks after real values: an unavailable baseline is not
 * a measured zero, and sorting must not place it between "fading" and "flat".
 */
export function sortMetric(node: TrendMapNode, key: SortKey): number | null {
  const trend = node.trend;
  switch (key) {
    case "potential":
      return node.potential;
    case "movement":
      return trend.comparable ? trend.rankChange : null;
    case "news":
      return node.attention.news;
    case "community":
      return node.attention.community;
    case "support":
      return trend.comparable
        ? trend.newAccounts + trend.newPublishers + trend.newSources.length
        : null;
  }
}

export function compareEntries(a: BoardEntry, b: BoardEntry, key: SortKey): number {
  const left = sortMetric(a.node, key);
  const right = sortMetric(b.node, key);
  if (left === null && right !== null) return 1;
  if (left !== null && right === null) return -1;
  if (left !== null && right !== null && left !== right) return right - left;
  // Stable, total tie-break: potential, then global rank, then the stable ID.
  if (b.node.potential !== a.node.potential) return b.node.potential - a.node.potential;
  if (a.rank !== b.rank) return a.rank - b.rank;
  return a.node.id.localeCompare(b.node.id);
}

export function sortEntries(entries: readonly BoardEntry[], key: SortKey): BoardEntry[] {
  return [...entries].sort((a, b) => compareEntries(a, b, key));
}

export function paginate<T>(
  items: readonly T[],
  requestedPage: number,
): {
  page: number;
  lastPage: number;
  start: number;
  visible: T[];
} {
  const lastPage = Math.max(0, Math.ceil(items.length / PAGE_SIZE) - 1);
  const page = Math.min(Math.max(0, Math.trunc(requestedPage) || 0), lastPage);
  const start = page * PAGE_SIZE;
  return { page, lastPage, start, visible: items.slice(start, start + PAGE_SIZE) };
}

/**
 * Bound the entity select without hiding an active selection. The predicate is
 * injected so this stays independent of the extraction module while the board
 * still applies exactly one alias/kind rule set.
 */
export function selectEntityOptions(
  entities: readonly TopicEntity[],
  matches: (entity: TopicEntity) => boolean,
  selected: TopicEntity | null,
  limit = ENTITY_OPTION_LIMIT,
): { options: TopicEntity[]; matched: number } {
  const options: TopicEntity[] = [];
  let matched = 0;
  for (const entity of entities) {
    if (!matches(entity)) continue;
    matched += 1;
    if (options.length < limit) options.push(entity);
  }
  if (selected && !options.includes(selected)) options.unshift(selected);
  return { options, matched };
}

/** Movement copy for assistive tech; the glyph alone is not a label. */
export function movementText(change: number | null): string {
  if (change === null) return "No comparable rank history";
  if (change > 0) return `Up ${change} rank${change === 1 ? "" : "s"}`;
  if (change < 0) return `Down ${-change} rank${change === -1 ? "" : "s"}`;
  return "Rank unchanged";
}

export const SPARK_WIDTH = 88;
export const SPARK_HEIGHT = 22;
const SPARK_PAD = 3;

/** Why a row cannot show measured movement or support, in one vocabulary. */
export const NO_BASELINE_LABEL = PHASE_LABELS.insufficient_history;
export const NO_BASELINE_DETAIL = "No comparable baseline window yet";
export const NO_RANK_DETAIL = "No comparable rank history";

export interface SparklineGeometry {
  path: string;
  lastX: string;
  lastY: string;
  min: number;
  max: number;
  latest: number;
  samples: number;
  /** Accessible label measuring what was actually stored. */
  label: string;
}

/**
 * Plot stored potential samples on their actual observation times. Gaps from
 * offline collection keep their width; fewer than two ordered samples cannot
 * establish a temporal trajectory and return null rather than inventing one.
 */
export function sparklineGeometry(points: readonly TopicHistoryPoint[]): SparklineGeometry | null {
  const measured = points.slice(-MAX_HISTORY_POINTS);
  if (measured.length < 2) return null;
  const times = measured.map((point) => Date.parse(point.at));
  if (
    times.some((time, index) => !Number.isFinite(time) || (index > 0 && time <= times[index - 1]!))
  )
    return null;
  const startAt = times[0]!;
  const duration = times[times.length - 1]! - startAt;

  const values = measured.map((point) => point.potential);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const coordinates = values.map((value, index) => {
    const x = SPARK_PAD + ((times[index]! - startAt) / duration) * (SPARK_WIDTH - SPARK_PAD * 2);
    const y =
      span === 0
        ? SPARK_HEIGHT / 2
        : SPARK_PAD + (1 - (value - min) / span) * (SPARK_HEIGHT - SPARK_PAD * 2);
    return `${x.toFixed(1)} ${y.toFixed(1)}`;
  });
  const [lastX, lastY] = coordinates[coordinates.length - 1].split(" ");
  const latest = values[values.length - 1];
  return {
    path: coordinates.map((point, index) => `${index === 0 ? "M" : "L"}${point}`).join(" "),
    lastX,
    lastY,
    min,
    max,
    latest,
    samples: values.length,
    label:
      span === 0
        ? `Measured potential history: ${values.length} stored observations, steady at ${latest} out of 100.`
        : `Measured potential history: ${values.length} stored observations from ${min} to ${max} out of 100, latest ${latest}.`,
  };
}
