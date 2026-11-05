import type { TopicReviewDecision } from "../../shared/intelligence.ts";
import type { TrendMapNode } from "../../shared/types.ts";
import { topicSearchText } from "@/lib/format";

/** A select is not a place for the whole map; the search narrows it first. */
export const MERGE_OPTION_LIMIT = 60;

/**
 * Mirrors the server's split limit, so the panel cannot compose a request that
 * is guaranteed to be refused. The server remains the authority.
 */
export const MAX_SELECTED_RECORDS = 400;

export interface MergeOptions {
  shown: TrendMapNode[];
  matchCount: number;
}

/**
 * Candidate merge targets from the shared map snapshot.
 *
 * The topic under review is excluded because merging a topic into itself is not
 * a correction, and a redirect-free label search keeps the list small: the map
 * holds up to 1,500 topics, and an unbounded `<select>` would be both unusable
 * and far past the DOM budget the rest of the workspace keeps.
 */
export function mergeTargetOptions(
  nodes: readonly TrendMapNode[],
  topicId: string,
  query: string,
  limit = MERGE_OPTION_LIMIT,
): MergeOptions {
  const term = topicSearchText(query).trim();
  const matches = nodes.filter(
    (node) => node.id !== topicId && (!term || topicSearchText(node.label).includes(term)),
  );
  return { shown: matches.slice(0, limit), matchCount: matches.length };
}

/** A human sentence for a decision; both sides keep their stored order. */
export interface DecisionSummary {
  /** The topics that lost their place (merge) or the topic that was split. */
  sources: string[];
  target: string;
  /** One line naming what the decision did, without counts of hidden work. */
  text: string;
}

/**
 * Describe a stored decision using whatever labels are currently known.
 *
 * A label can be missing: the map window changes, and a source topic that was
 * merged away is no longer a node. Falling back to the stored id keeps the
 * decision inspectable instead of rendering an empty sentence.
 */
export function decisionSummary(
  decision: TopicReviewDecision,
  labelForTopic: ReadonlyMap<string, string>,
): DecisionSummary {
  const label = (id: string) => labelForTopic.get(id) ?? id;
  const target = label(decision.targetId);
  const sources = decision.topicIds.filter((id) => id !== decision.targetId).map(label);
  const records = decision.recordIds.length;
  const recordPhrase = `${records} record${records === 1 ? "" : "s"}`;
  if (decision.operation === "merge") {
    return {
      sources,
      target,
      text:
        sources.length === 1
          ? `“${sources[0]}” merged into “${target}”.`
          : `${sources.length} topics merged into “${target}”.`,
    };
  }
  return {
    sources,
    target,
    text: `${recordPhrase} split out of “${sources[0] ?? target}” into a separate topic.`,
  };
}

/**
 * Toggle one record in a split selection.
 *
 * Selection is bounded by the request contract, not by the visible page: the
 * panel can select across pages, and the server decides whether the subset is a
 * proper subset of the topic's current members.
 */
export function toggleSelection(
  selected: ReadonlySet<string>,
  id: string,
  limit: number,
): ReadonlySet<string> {
  const next = new Set(selected);
  if (next.has(id)) {
    next.delete(id);
    return next;
  }
  if (next.size >= limit) return selected;
  next.add(id);
  return next;
}
