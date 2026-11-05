import { describe, expect, test } from "bun:test";
import type {
  TopicAttention,
  TopicEntity,
  TopicHistoryPoint,
  TopicTrend,
} from "../shared/intelligence.ts";
import type { TrendMapNode } from "../shared/types.ts";
import {
  MAX_HISTORY_POINTS,
  PAGE_SIZE,
  compareEntries,
  filterEntries,
  indexEntityKinds,
  indexTopics,
  paginate,
  selectEntityOptions,
  sortEntries,
  sortMetric,
  sparklineGeometry,
} from "../src/lib/board.ts";

/**
 * Behavioural regressions for the ranked board.
 *
 * The board is the alternative to the canvas, so it must never state more than
 * the enriched map measured: an unavailable baseline is not a zero, a single
 * stored sample is not a flat trend line, and a re-render must not reshuffle
 * equally scored rows. These tests exercise the pure ranking, filtering,
 * pagination and sparkline geometry the table renders.
 */

const NOW = "2026-11-05T12:00:00.000Z";

function attention(news: number, community: number): TopicAttention {
  return {
    news,
    community,
    newsPublishers: news > 0 ? 3 : 0,
    communityAccounts: community > 0 ? 7 : 0,
  };
}

function history(values: number[]): TopicHistoryPoint[] {
  return values.map((potential, index) => ({
    at: new Date(Date.parse(NOW) + index * 3_600_000).toISOString(),
    potential,
    rank: index + 1,
    accounts: potential,
    publishers: 0,
    posts: potential * 2,
    newsAttention: potential,
    communityMomentum: potential,
  }));
}

function trend(overrides: Partial<TopicTrend> = {}): TopicTrend {
  return {
    phase: "sustained",
    comparable: true,
    windowHours: 6,
    previousRank: 3,
    rankChange: 0,
    newAccounts: 2,
    newPublishers: 1,
    newSources: ["voz"],
    recentRecords: 9,
    priorRecords: 6,
    history: history([40, 44, 48]),
    reasons: ["6h window"],
    ...overrides,
  };
}

function node(id: string, potential: number, overrides: Partial<TrendMapNode> = {}): TrendMapNode {
  const base: TrendMapNode = {
    id,
    kind: "topic",
    label: `Chủ đề ${id}`,
    description: "",
    radius: 10,
    potential,
    posts: 10,
    authors: 4,
    segments: ["voz"],
    score: {
      potential,
      reach: 0,
      velocity: 0,
      spread: 0,
      persistence: 0,
      diversity: 0,
      confidence: 1,
      authors: 4,
      posts: 10,
    },
    discussionPosts: 6,
    newsPosts: 2,
    publishers: 1,
    mediaCount: 0,
    firstSeenAt: NOW,
    lastSeenAt: NOW,
    examples: [],
    trend: trend(),
    attention: attention(potential, potential),
    entityIds: [],
  };
  return { ...base, ...overrides };
}

/** The shape core emits before twelve hours of comparable observations exist. */
const UNMEASURED: TopicTrend = {
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
  reasons: ["Baseline not yet comparable"],
};

describe("board filtering", () => {
  test("phase filter isolates insufficient-history topics", () => {
    const indexed = indexTopics([
      node("rising", 70, { trend: trend({ phase: "rising" }) }),
      node("new", 65, { trend: UNMEASURED }),
    ]);
    const filtered = filterEntries(indexed, {
      query: "",
      phase: "insufficient_history",
      entityId: null,
    });
    expect(filtered.map((entry) => entry.node.id)).toEqual(["new"]);
    expect(filtered[0].node.trend.phase).toBe("insufficient_history");
  });

  test("search ignores Vietnamese accents but keeps the display label", () => {
    const indexed = indexTopics([node("hn", 50, { label: "Hà Nội ngập sâu" })]);
    expect(filterEntries(indexed, { query: "ha noi", phase: "all", entityId: null })).toHaveLength(
      1,
    );
    expect(indexed[0].node.label).toBe("Hà Nội ngập sâu");
  });

  test("entity filter selects one deterministic entity ID", () => {
    const indexed = indexTopics([
      node("a", 60, { entityIds: ["org:openai"] }),
      node("b", 55, { entityIds: ["product:gpt-5"] }),
      node("c", 50, { entityIds: ["product:gpt-4.1"] }),
    ]);
    const filtered = filterEntries(indexed, { query: "", phase: "all", entityId: "product:gpt-5" });
    expect(filtered.map((entry) => entry.node.id)).toEqual(["b"]);
  });

  test("global rank survives filtering and sorting", () => {
    const indexed = indexTopics([node("top", 90), node("mid", 60), node("low", 30)]);
    const sorted = sortEntries(
      filterEntries(indexed, { query: "", phase: "all", entityId: null }),
      "potential",
    );
    expect(sorted.map((entry) => entry.rank)).toEqual([1, 2, 3]);
    const filtered = filterEntries(indexed, { query: "low", phase: "all", entityId: null });
    expect(filtered[0].rank).toBe(3);
  });

  test("a source-filtered subset keeps whole-map ranks when supplied", () => {
    const scoped = [node("mid", 60), node("low", 30)];
    const rankById = new Map([
      ["top", 1],
      ["mid", 2],
      ["low", 3],
    ]);
    const indexed = indexTopics(scoped, rankById);
    expect(indexed.map((entry) => entry.rank)).toEqual([2, 3]);
    // Without the map the board can only report its own order, labelled as scoped.
    expect(indexTopics(scoped).map((entry) => entry.rank)).toEqual([1, 2]);
    const sorted = sortEntries(indexed, "potential");
    expect(sorted.map((entry) => [entry.node.id, entry.rank])).toEqual([
      ["mid", 2],
      ["low", 3],
    ]);
  });
});

describe("entity kind filter", () => {
  const catalogue: TopicEntity[] = [
    { id: "org:openai", kind: "organization", label: "OpenAI", aliases: [] },
    { id: "product:gpt-5", kind: "product", label: "GPT-5", aliases: [] },
    { id: "person:altman", kind: "person", label: "Sam Altman", aliases: [] },
  ];
  const kindById = indexEntityKinds(catalogue);
  const entries = indexTopics([
    node("org", 60, { entityIds: ["org:openai", "product:gpt-5"] }),
    node("product", 50, { entityIds: ["product:gpt-5"] }),
    node("person", 40, { entityIds: ["person:altman"] }),
    node("none", 30),
  ]);

  test("narrows rows to topics carrying that kind", () => {
    const products = filterEntries(entries, {
      query: "",
      phase: "all",
      entityId: null,
      kind: { value: "product", byId: kindById },
    });
    expect(products.map((entry) => entry.node.id)).toEqual(["org", "product"]);
  });

  test("exact entity still wins over kind", () => {
    const filtered = filterEntries(entries, {
      query: "",
      phase: "all",
      entityId: "person:altman",
      kind: { value: "person", byId: kindById },
    });
    expect(filtered.map((entry) => entry.node.id)).toEqual(["person"]);
  });

  test("the all kinds option applies no kind restriction", () => {
    expect(
      filterEntries(entries, {
        query: "",
        phase: "all",
        entityId: null,
      }),
    ).toHaveLength(4);
  });
});

describe("entity identity in the board", () => {
  test("a bogus extra entity cannot change which topic a chip selects", () => {
    // Extraction may over-generate, but board selection is by exact catalogue
    // ID: an unrelated ID on the same row never matches another entity's filter.
    const indexed = indexTopics([
      node("real", 60, { entityIds: ["location:ho-chi-minh"] }),
      node("noisy", 50, { entityIds: ["location:ho-chi-minh", "organization:hdnd-tp"] }),
    ]);
    const filtered = filterEntries(indexed, {
      query: "",
      phase: "all",
      entityId: "organization:hdnd-tp",
    });
    expect(filtered.map((entry) => entry.node.id)).toEqual(["noisy"]);
    const city = filterEntries(indexed, {
      query: "",
      phase: "all",
      entityId: "location:ho-chi-minh",
    });
    expect(city.map((entry) => entry.node.id)).toEqual(["real", "noisy"]);
  });

  test("a missing catalogue entity degrades to no filter, not an empty table", () => {
    const indexed = indexTopics([node("a", 60, { entityIds: ["person:gone"] })]);
    expect(
      filterEntries(indexed, { query: "", phase: "all", entityId: "person:not-in-catalogue" }),
    ).toHaveLength(0);
    // The board resolves the ID through the catalogue first, so a stale ID is
    // never applied — see appliedEntity in topic-board.tsx.
    expect(filterEntries(indexed, { query: "", phase: "all", entityId: null })).toHaveLength(1);
  });
});

describe("board sorting", () => {
  test("unmeasured movement sorts after measured values, never as zero", () => {
    const measured = node("measured", 50, { trend: trend({ rankChange: -4 }) });
    const unknown = node("unknown", 80, { trend: UNMEASURED });
    expect(sortMetric(unknown, "movement")).toBeNull();
    expect(sortMetric(unknown, "support")).toBeNull();
    expect(sortMetric(measured, "movement")).toBe(-4);
    const sorted = sortEntries(indexTopics([unknown, measured]), "movement");
    expect(sorted.map((entry) => entry.node.id)).toEqual(["measured", "unknown"]);
  });

  test("support sort sums only measured new independent evidence", () => {
    const small = node("small", 40, {
      trend: trend({ newAccounts: 1, newPublishers: 1, newSources: ["voz"] }),
    });
    const large = node("large", 30, {
      trend: trend({ newAccounts: 5, newPublishers: 2, newSources: ["voz", "facebook"] }),
    });
    expect(sortMetric(small, "support")).toBe(3);
    expect(sortMetric(large, "support")).toBe(9);
    expect(
      sortEntries(indexTopics([small, large]), "support").map((entry) => entry.node.id),
    ).toEqual(["large", "small"]);
  });

  test("equal metrics fall back to potential then global rank, deterministically", () => {
    const tied = [
      node("a", 50, { trend: trend({ rankChange: 2 }) }),
      node("b", 50, { trend: trend({ rankChange: 2 }) }),
      node("c", 50, { trend: trend({ rankChange: 2 }) }),
    ];
    const indexed = indexTopics(tied);
    const forward = sortEntries(indexed, "movement").map((entry) => entry.node.id);
    const backward = sortEntries([...indexed].reverse(), "movement").map((entry) => entry.node.id);
    expect(forward).toEqual(["a", "b", "c"]);
    expect(backward).toEqual(forward);
    expect(compareEntries(indexed[1], indexed[1], "movement")).toBe(0);
  });

  test("news and community attention are sorted independently", () => {
    const newsHeavy = node("news", 50, { attention: attention(90, 10) });
    const communityHeavy = node("community", 50, { attention: attention(10, 90) });
    const entries = indexTopics([newsHeavy, communityHeavy]);
    expect(sortEntries(entries, "news")[0].node.id).toBe("news");
    expect(sortEntries(entries, "community")[0].node.id).toBe("community");
  });
});

describe("board pagination", () => {
  test("bounds the rendered rows to 80", () => {
    const nodes = Array.from({ length: 203 }, (_, index) => node(`n${index}`, 200 - index));
    const { page, lastPage, start, visible } = paginate(indexTopics(nodes), 0);
    expect(PAGE_SIZE).toBe(80);
    expect(page).toBe(0);
    expect(start).toBe(0);
    expect(visible).toHaveLength(80);
    expect(lastPage).toBe(2);
  });

  test("clamps a stale page after the result set shrinks", () => {
    const nodes = Array.from({ length: 10 }, (_, index) => node(`n${index}`, 100 - index));
    const { page, lastPage, visible } = paginate(indexTopics(nodes), 7);
    expect(lastPage).toBe(0);
    expect(page).toBe(0);
    expect(visible).toHaveLength(10);
  });
});

describe("entity options", () => {
  const entities: TopicEntity[] = [
    { id: "product:gpt-5", kind: "product", label: "GPT-5", aliases: [] },
    { id: "product:gpt-4.1", kind: "product", label: "GPT-4.1", aliases: [] },
    { id: "location:hcm", kind: "location", label: "TP.HCM", aliases: ["Hồ Chí Minh"] },
  ];

  test("caps rendered options while reporting the true match count", () => {
    const { options, matched } = selectEntityOptions(entities, () => true, null, 2);
    expect(options.map((entity) => entity.id)).toEqual(["product:gpt-5", "product:gpt-4.1"]);
    expect(matched).toBe(3);
  });

  test("keeps an active selection visible when it falls outside the cap", () => {
    const selected = entities[2];
    const { options } = selectEntityOptions(
      entities,
      (entity) => entity.kind === "location",
      selected,
      1,
    );
    expect(options).toEqual([selected]);
  });
});

describe("sparkline", () => {
  test("fewer than two stored samples is insufficient history, not a zero line", () => {
    expect(sparklineGeometry([])).toBeNull();
    expect(sparklineGeometry(history([42]))).toBeNull();
  });

  test("preserves the measured range and latest observation", () => {
    const geometry = sparklineGeometry(history([40, 55, 48]));
    expect(geometry).not.toBeNull();
    expect(geometry?.samples).toBe(3);
    expect(geometry?.min).toBe(40);
    expect(geometry?.max).toBe(55);
    expect(geometry?.latest).toBe(48);
    expect(geometry?.path).not.toMatch(/NaN|Infinity/u);
  });

  test("a flat measured series produces finite geometry rather than dividing by zero", () => {
    const geometry = sparklineGeometry(history([30, 30, 30]));
    expect(geometry?.min).toBe(30);
    expect(geometry?.max).toBe(30);
    expect(geometry?.path).not.toMatch(/NaN|Infinity/u);
  });

  test("keeps the most recent 24 samples only", () => {
    const geometry = sparklineGeometry(history(Array.from({ length: 40 }, (_, index) => index)));
    expect(geometry?.samples).toBeLessThanOrEqual(MAX_HISTORY_POINTS);
    expect(geometry?.min).toBe(40 - MAX_HISTORY_POINTS);
    expect(geometry?.latest).toBe(39);
  });

  test("observation gaps retain their real width instead of fabricating equal spacing", () => {
    const points = history([20, 30, 40]);
    points[1]!.at = new Date(Date.parse(NOW) + 12 * 3_600_000).toISOString();
    points[2]!.at = new Date(Date.parse(NOW) + 13 * 3_600_000).toISOString();
    const geometry = sparklineGeometry(points)!;
    const xs = [...geometry.path.matchAll(/[ML](-?[\d.]+) /gu)].map((match) => Number(match[1]));
    expect(xs[1]! - xs[0]!).toBeGreaterThan(8 * (xs[2]! - xs[1]!));
    expect(sparklineGeometry([{ ...points[0]! }, { ...points[0]!, potential: 50 }])).toBeNull();
  });
});
