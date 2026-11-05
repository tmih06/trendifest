import { matchEntity } from "../../shared/entities.ts";
import type {
  TopicEntity,
  WatchDraft,
  WatchRule,
  WatchRuleInput,
} from "../../shared/intelligence.ts";
import type { TrendMapNode } from "../../shared/types.ts";
import { topicSearchText } from "@/lib/format";

/**
 * Pure logic behind the watchlist panel.
 *
 * The panel renders server state, so everything that decides what state to send
 * or how many rows to offer lives here where it can be tested without a DOM: a
 * threshold is either a whole number the server accepts or it is nothing, and a
 * bounded option list never grows with the 1,500-topic map.
 */

/** Bounded option lists keep the form fast on a full map. */
export const TOPIC_OPTION_LIMIT = 120;
export const ENTITY_OPTION_LIMIT = 120;

/** The server's own ceiling for every threshold; kept in step with `watchlists.ts`. */
export const MAX_THRESHOLD = 100;

/** Server retention, mirrored for the explanatory copy in the panel. */
export const WATCH_RETENTION = { rules: 100, alerts: 200 } as const;

export const ENTITY_KIND_LABELS: Record<TopicEntity["kind"], string> = {
  person: "Person",
  organization: "Organisation",
  location: "Place",
  product: "Product",
};

export interface WatchFormValues {
  kind: "topic" | "entity";
  targetId: string;
  label: string;
  enabled: boolean;
  minNewAccounts: string;
  minNewPublishers: string;
  minNewSources: string;
  minPotential: string;
}

/**
 * Empty means zero: a cleared field is "no threshold here", not an error. A
 * fractional, negative or out-of-range entry is `NaN` so the form can say so
 * before the request is sent.
 */
export function thresholdValue(text: string): number {
  if (!text.trim()) return 0;
  const parsed = Number(text);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > MAX_THRESHOLD) return Number.NaN;
  return parsed;
}

/**
 * Build the wire input, or `null` when the form cannot produce a valid watch.
 * Growth dimensions are OR-ed by the evaluator, so all-zero growth is a watch
 * that can never fire and is rejected here exactly as the server rejects it.
 */
export function toWatchInput(values: WatchFormValues): WatchRuleInput | null {
  const minNewAccounts = thresholdValue(values.minNewAccounts);
  const minNewPublishers = thresholdValue(values.minNewPublishers);
  const minNewSources = thresholdValue(values.minNewSources);
  const minPotential = thresholdValue(values.minPotential);
  if ([minNewAccounts, minNewPublishers, minNewSources, minPotential].some(Number.isNaN)) {
    return null;
  }
  if (minNewAccounts + minNewPublishers + minNewSources === 0) return null;
  return {
    kind: values.kind,
    targetId: values.targetId,
    label: values.label.trim(),
    enabled: values.enabled,
    minNewAccounts,
    minNewPublishers,
    minNewSources,
    minPotential,
  };
}

/** The same words the evaluator uses, so the rule reads as it behaves. */
export function thresholdSummary(rule: WatchRule): string {
  const parts: string[] = [];
  if (rule.minNewAccounts > 0) parts.push(`${rule.minNewAccounts}+ new accounts`);
  if (rule.minNewPublishers > 0) parts.push(`${rule.minNewPublishers}+ new publishers`);
  if (rule.minNewSources > 0) parts.push(`${rule.minNewSources}+ new sources`);
  return `${parts.join(" or ")} · potential ≥ ${rule.minPotential}/100`;
}

/**
 * A new watch from a Follow action. News publishers are the only independently
 * timestamped evidence the current feeds provide, so that growth dimension
 * starts enabled; every other threshold is opt-in and visible in the form.
 */
export function draftToInput(draft: WatchDraft): WatchRuleInput {
  return {
    kind: draft.kind,
    targetId: draft.targetId,
    label: draft.label,
    enabled: true,
    minNewAccounts: 0,
    minNewPublishers: 2,
    minNewSources: 0,
    minPotential: 40,
  };
}

export function ruleToForm(rule: WatchRule): WatchFormValues {
  return {
    kind: rule.kind,
    targetId: rule.targetId,
    label: rule.label,
    enabled: rule.enabled,
    minNewAccounts: String(rule.minNewAccounts),
    minNewPublishers: String(rule.minNewPublishers),
    minNewSources: String(rule.minNewSources),
    minPotential: String(rule.minPotential),
  };
}

export function inputToForm(input: WatchRuleInput): WatchFormValues {
  return {
    kind: input.kind,
    targetId: input.targetId,
    label: input.label,
    enabled: input.enabled,
    minNewAccounts: String(input.minNewAccounts),
    minNewPublishers: String(input.minNewPublishers),
    minNewSources: String(input.minNewSources),
    minPotential: String(input.minPotential),
  };
}

/** Highest potential first: the topics a reader is most likely to follow. */
export function topicChoices(topics: readonly TrendMapNode[]): TrendMapNode[] {
  return [...topics]
    .sort((a, b) => b.potential - a.potential || a.label.localeCompare(b.label))
    .slice(0, TOPIC_OPTION_LIMIT);
}

export function entityChoices(entities: readonly TopicEntity[]): TopicEntity[] {
  return [...entities].sort((a, b) => a.label.localeCompare(b.label)).slice(0, ENTITY_OPTION_LIMIT);
}

/**
 * Search the entire current corpus before bounding DOM options. A Follow target
 * outside the first 120 ranks must stay visible and selectable in the form.
 */
export function filterTopicChoices(
  topics: readonly TrendMapNode[],
  query: string,
  selectedId: string,
): TrendMapNode[] {
  const needle = topicSearchText(query.trim());
  const matches = topicChoices(
    needle ? topics.filter((node) => topicSearchText(node.label).includes(needle)) : topics,
  );
  const selected = topics.find((node) => node.id === selectedId);
  return selected && !matches.some((node) => node.id === selected.id)
    ? [selected, ...matches].slice(0, TOPIC_OPTION_LIMIT)
    : matches;
}

/** Alias search also covers the complete catalog before applying the option cap. */
export function filterEntityChoices(
  entities: readonly TopicEntity[],
  query: string,
  selectedId: string,
): TopicEntity[] {
  const matches = entityChoices(
    query.trim() ? entities.filter((entity) => matchEntity(entity, query)) : entities,
  );
  const selected = entities.find((entity) => entity.id === selectedId);
  return selected && !matches.some((entity) => entity.id === selected.id)
    ? [selected, ...matches].slice(0, ENTITY_OPTION_LIMIT)
    : matches;
}
