import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getAnalysis, getTrending, TrendSourceError } from "../server/google-trends.ts";

const fixtures = path.join(import.meta.dir, "fixtures");
const originalFetch = globalThis.fetch;

beforeAll(async () => {
  // Captured from live Google Trends before the shared IP was rate limited.
  const [explore, timeline, related, regions, trending] = await Promise.all([
    readFile(path.join(fixtures, "explore.json"), "utf8"),
    readFile(path.join(fixtures, "timeline.json"), "utf8"),
    readFile(path.join(fixtures, "related.json"), "utf8"),
    readFile(path.join(fixtures, "regions.json"), "utf8"),
    readFile(path.join(fixtures, "trending.xml"), "utf8"),
  ]);

  const fixtureFetch = async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const body = url.includes("/trending/rss")
      ? trending
      : url.includes("/api/explore")
        ? explore
        : url.includes("/widgetdata/multiline")
          ? timeline
          : url.includes("/widgetdata/relatedsearches")
            ? related
            : url.includes("/widgetdata/comparedgeo")
              ? regions
              : null;
    return body
      ? new Response(body, { status: 200 })
      : new Response("unexpected fixture request", { status: 404 });
  };
  globalThis.fetch = fixtureFetch as unknown as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

describe("Google Trends client", () => {
  test("parses a live explore response end to end", async () => {
    const analysis = await getAnalysis(["ai"], "US", "12m");

    expect(analysis.source).toBe("google");
    expect(analysis.notice).toBeUndefined();
    expect(analysis.resolution).toBe("week");
    expect(analysis.points.length).toBeGreaterThan(30);
    expect(analysis.insights).toHaveLength(1);

    const insight = analysis.insights[0]!;
    expect(insight.term).toBe("ai");
    expect(insight.latest).toBeGreaterThan(0);
    expect(insight.history).toHaveLength(analysis.points.length);
    expect(insight.forecast.points).toHaveLength(6);
    expect(insight.related.length).toBeGreaterThan(0);
    expect(insight.related.some((query) => query.rising)).toBe(true);
    expect(insight.regions.length).toBeGreaterThan(0);
    expect(insight.regions[0]!.value).toBeGreaterThanOrEqual(insight.regions.at(-1)!.value);
  });

  test("parses the daily trending RSS feed", async () => {
    const trending = await getTrending("US");

    expect(trending.source).toBe("google");
    expect(trending.items.length).toBeGreaterThan(0);
    expect(trending.items[0]!.title.length).toBeGreaterThan(0);
    expect(trending.items[0]!.traffic.length).toBeGreaterThan(0);
    expect(trending.items[0]!.link).toContain("geo=US");
  });

  test("fails honestly when Google is unavailable", async () => {
    globalThis.fetch = (async () => new Response("", { status: 429 })) as unknown as typeof fetch;

    let failure: unknown;
    try {
      await getAnalysis(["offline probe"], "US", "12m");
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(TrendSourceError);

    const trending = await getTrending("GB");
    expect(trending.source).toBe("google");
    expect(trending.items).toHaveLength(0);
    expect(trending.notice).toContain("unavailable");
  });
});
