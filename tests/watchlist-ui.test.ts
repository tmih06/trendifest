import { describe, expect, test } from "bun:test";
import type { TopicAttention, TopicEntity, TopicTrend } from "../shared/intelligence.ts";
import type { TrendMapNode } from "../shared/types.ts";
import {
  ENTITY_OPTION_LIMIT,
  MAX_THRESHOLD,
  TOPIC_OPTION_LIMIT,
  entityChoices,
  filterEntityChoices,
  filterTopicChoices,
  thresholdValue,
  toWatchInput,
  topicChoices,
} from "../src/lib/watchlist.ts";

/**
 * The panel is the only place a reader authors an alert rule, so its decisions
 * are tested without a DOM: which form values become a request, which are
 * refused before one is sent, and how the bounded option lists behave.
 */

const trend: TopicTrend = {
  phase: "insufficient_history",
  comparable: false,
  windowHours: 6,
  previousRank: null,
  rankChange: null,
  newAccounts: 0,
  newPublishers: 0,
  newSources: [],
  recentRecords: 0,
  priorRecords: 0,
  history: [],
  reasons: [],
};

const attention: TopicAttention = {
  news: 0,
  community: 0,
  newsPublishers: 0,
  communityAccounts: 0,
};

function node(id: string, label: string, potential = 50, entityIds: string[] = []): TrendMapNode {
  return {
    id,
    kind: "topic",
    label,
    description: "",
    radius: 1,
    potential,
    posts: 0,
    authors: 0,
    segments: [],
    score: {
      potential,
      reach: 0,
      velocity: 0,
      spread: 0,
      persistence: 0,
      diversity: 0,
      confidence: 1,
      authors: 0,
      posts: 0,
    },
    discussionPosts: 0,
    newsPosts: 0,
    publishers: 0,
    mediaCount: 0,
    firstSeenAt: "2026-11-05T00:00:00.000Z",
    lastSeenAt: "2026-11-05T00:00:00.000Z",
    examples: [],
    trend,
    attention,
    entityIds,
  };
}

const baseForm = {
  kind: "topic" as const,
  targetId: "topic:a",
  label: "A topic",
  enabled: true,
  minNewAccounts: "0",
  minNewPublishers: "2",
  minNewSources: "0",
  minPotential: "40",
};

describe("watch form values", () => {
  test("an empty threshold means zero, not an error", () => {
    expect(thresholdValue("")).toBe(0);
    expect(thresholdValue("   ")).toBe(0);
  });

  test("only whole numbers inside the server range are accepted", () => {
    expect(thresholdValue("0")).toBe(0);
    expect(thresholdValue(String(MAX_THRESHOLD))).toBe(MAX_THRESHOLD);
    expect(thresholdValue("2.5")).toBeNaN();
    expect(thresholdValue("-1")).toBeNaN();
    expect(thresholdValue("101")).toBeNaN();
    expect(thresholdValue("two")).toBeNaN();
  });

  test("all-zero growth is refused before a request is sent", () => {
    expect(toWatchInput({ ...baseForm, minNewPublishers: "0", minPotential: "40" })).toBeNull();
  });

  test("an out-of-range number is refused rather than clamped", () => {
    expect(toWatchInput({ ...baseForm, minNewPublishers: "1.5" })).toBeNull();
    expect(toWatchInput({ ...baseForm, minPotential: "140" })).toBeNull();
  });
});

describe("bounded option lists", () => {
  const entities: TopicEntity[] = [
    { id: "entity:openai", kind: "organization", label: "OpenAI", aliases: ["Open AI"] },
    { id: "entity:hcmc", kind: "location", label: "TP.HCM", aliases: ["Hồ Chí Minh"] },
  ];

  test("topics are ranked by potential and capped", () => {
    const topics = Array.from({ length: TOPIC_OPTION_LIMIT + 20 }, (_, index) =>
      node(`topic:${index}`, `Topic ${index}`, index % 100),
    );
    const choices = topicChoices(topics);
    expect(choices.length).toBe(TOPIC_OPTION_LIMIT);
    expect(choices[0]!.potential).toBe(99);
    for (let index = 1; index < choices.length; index += 1) {
      expect(choices[index - 1]!.potential).toBeGreaterThanOrEqual(choices[index]!.potential);
    }
  });

  test("entities are capped and sorted by label", () => {
    const many = [
      ...entities,
      { id: "entity:z", kind: "product" as const, label: "Zeta", aliases: [] },
    ];
    expect(entityChoices(many).map((item) => item.label)).toEqual(["OpenAI", "TP.HCM", "Zeta"]);
    const huge = Array.from({ length: ENTITY_OPTION_LIMIT + 5 }, (_, index) => ({
      id: `entity:${index}`,
      kind: "product" as const,
      label: `Product ${String(index).padStart(3, "0")}`,
      aliases: [],
    }));
    expect(entityChoices(huge).length).toBe(ENTITY_OPTION_LIMIT);
  });

  test("filtering a topic list keeps the current selection selectable", () => {
    const topics = [node("topic:a", "Alpha event"), node("topic:b", "Beta product")];
    const choices = topicChoices(topics);

    // Not matching the query, but selected: it must not vanish mid-edit.
    const kept = filterTopicChoices(choices, "beta", "topic:a");
    expect(kept.map((item) => item.id)).toEqual(["topic:a", "topic:b"]);

    // Already in the matches: no duplicate appears.
    const matched = filterTopicChoices(choices, "alpha", "topic:a");
    expect(matched.map((item) => item.id)).toEqual(["topic:a"]);
  });

  test("unaccented queries match accented Vietnamese labels", () => {
    const topics = [node("topic:hcmc", "Hồ Chí Minh mở tuyến metro")];
    expect(filterTopicChoices(topicChoices(topics), "ho chi minh", "").length).toBe(1);
  });

  test("entity filtering matches aliases and preserves a selected entity", () => {
    expect(filterEntityChoices(entities, "ho chi minh", "").map((e) => e.id)).toEqual([
      "entity:hcmc",
    ]);
    expect(filterEntityChoices(entities, "open", "").map((e) => e.id)).toEqual(["entity:openai"]);
    // A selection outside the bounded slice stays selectable while filtering.
    const beyond = { id: "entity:beyond", kind: "person" as const, label: "Người X", aliases: [] };
    expect(filterEntityChoices([...entities, beyond], "open", beyond.id).map((e) => e.id)).toEqual([
      beyond.id,
      "entity:openai",
    ]);
  });

  test("search and Follow selection include low-ranked targets before capping options", () => {
    const topics = Array.from({ length: 1_500 }, (_, index) =>
      node(`topic:${index}`, `Incident ${index}`, 1_500 - index),
    );
    expect(filterTopicChoices(topics, "Incident 1400", "").map((item) => item.id)).toEqual([
      "topic:1400",
    ]);
    const selected = filterTopicChoices(topics, "", "topic:1400");
    expect(selected[0]!.id).toBe("topic:1400");
    expect(selected.length).toBeLessThanOrEqual(TOPIC_OPTION_LIMIT);
    const catalog = Array.from({ length: 300 }, (_, index) => ({
      id: `person:${index}`,
      label: `Person ${String(index).padStart(3, "0")}`,
      kind: "person" as const,
      aliases: [],
    }));
    expect(filterEntityChoices(catalog, "Person 250", "").map((item) => item.id)).toEqual([
      "person:250",
    ]);
    expect(filterEntityChoices(catalog, "", "person:250")[0]!.id).toBe("person:250");
  });
});
