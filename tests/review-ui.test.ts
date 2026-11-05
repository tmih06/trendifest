import { describe, expect, test } from "bun:test";
import type { TrendMapNode } from "../shared/types.ts";
import { MERGE_OPTION_LIMIT, mergeTargetOptions, toggleSelection } from "../src/lib/review.ts";

/**
 * Behavioural regressions for the review panel's pure decisions.
 *
 * These cover which topics can be merge targets and how a record selection
 * remains bounded across pages. Persistence, dependencies, and undo behavior
 * are exercised against a real database in
 * `topic-review.test.ts`.
 */

function node(id: string, label: string): TrendMapNode {
  return {
    id,
    kind: "topic",
    label,
    description: label,
    radius: 1,
    potential: 1,
    posts: 1,
    authors: 1,
    segments: ["voz"],
    score: {
      potential: 1,
      reach: 0,
      velocity: 0,
      spread: 0,
      persistence: 0,
      diversity: 0,
      confidence: 1,
      authors: 1,
      posts: 1,
    },
    discussionPosts: 1,
    newsPosts: 0,
    publishers: 0,
    mediaCount: 0,
    firstSeenAt: "2026-11-05T00:00:00.000Z",
    lastSeenAt: "2026-11-05T01:00:00.000Z",
    examples: [],
    trend: {
      phase: "insufficient_history",
      comparable: false,
      windowHours: 6,
      previousRank: null,
      rankChange: null,
      newAccounts: 0,
      newPublishers: 0,
      newSources: [],
      recentRecords: 1,
      priorRecords: 0,
      history: [],
      reasons: [],
    },
    attention: { news: 0, community: 0, newsPublishers: 0, communityAccounts: 0 },
    entityIds: [],
  };
}

const TOPICS = [
  node("topic:olympia", "Chung kết Olympia 2026"),
  node("topic:olympia-wide", "Olympia 2026 phát sóng trực tiếp"),
  node("topic:gpt5", "OpenAI ra mắt GPT-5"),
  node("topic:market", "Giá vàng hôm nay"),
];

describe("merge targets", () => {
  test("exclude the topic under review and never list the whole map", () => {
    const options = mergeTargetOptions(TOPICS, "topic:olympia", "");
    expect(options.shown.map((entry) => entry.id)).toEqual([
      "topic:olympia-wide",
      "topic:gpt5",
      "topic:market",
    ]);
    expect(options.matchCount).toBe(3);

    const many = Array.from({ length: 200 }, (_, index) =>
      node(`topic:${index}`, `Topic ${index}`),
    );
    const bounded = mergeTargetOptions(many, "topic:0", "");
    expect(bounded.shown).toHaveLength(MERGE_OPTION_LIMIT);
    // The count still tells the reviewer the list is narrowed, so a missing
    // topic reads as "type to narrow" rather than "this topic does not exist".
    expect(bounded.matchCount).toBe(199);
  });

  test("match accents either way, using the same folding as the board", () => {
    const options = mergeTargetOptions(TOPICS, "topic:market", "chung ket");
    expect(options.shown.map((entry) => entry.id)).toEqual(["topic:olympia"]);
    expect(mergeTargetOptions(TOPICS, "topic:market", "CHUNG KẾT").matchCount).toBe(1);
    expect(mergeTargetOptions(TOPICS, "topic:market", "không có gì").matchCount).toBe(0);
  });
});

describe("split selection", () => {
  test("adds, removes, and never exceeds the request contract", () => {
    let selected = toggleSelection(new Set<string>(), "a", 2);
    selected = toggleSelection(selected, "b", 2);
    expect([...selected]).toEqual(["a", "b"]);
    // A third selection is refused instead of dropped silently on submit.
    selected = toggleSelection(selected, "c", 2);
    expect([...selected]).toEqual(["a", "b"]);
    selected = toggleSelection(selected, "a", 2);
    expect([...selected]).toEqual(["b"]);
    // Toggling the same id twice returns to the original set.
    expect(toggleSelection(selected, "b", 2).size).toBe(0);
  });
});
