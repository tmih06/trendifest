import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Forecast, TermInsight, WatchlistSummary } from "../shared/types.ts";
import { getAnalysis } from "../server/google-trends.ts";
import { buildOverview, refreshWatchlist } from "../server/overview.ts";
import { buildRelatedGraph, connectionsFor } from "../src/pages/trend-graph.data.ts";
import * as store from "../server/store.ts";

let directory = "";
const fixtures = path.join(import.meta.dir, "fixtures");
const originalFetch = globalThis.fetch;

beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "trendifest-store-"));
  process.env.TRENDIFEST_DATA_FILE = path.join(directory, "state.json");

  const [explore, timeline, related, regions, trending] = await Promise.all([
    readFile(path.join(fixtures, "explore.json"), "utf8"),
    readFile(path.join(fixtures, "timeline.json"), "utf8"),
    readFile(path.join(fixtures, "related.json"), "utf8"),
    readFile(path.join(fixtures, "regions.json"), "utf8"),
    readFile(path.join(fixtures, "trending.xml"), "utf8"),
  ]);

  globalThis.fetch = (async (input: RequestInfo | URL) => {
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
  }) as unknown as typeof fetch;
});

afterAll(async () => {
  globalThis.fetch = originalFetch;
  await rm(directory, { recursive: true, force: true });
});

function fakeForecast(changePct: number, direction: "up" | "down" | "flat"): Forecast {
  return {
    points: [
      { time: 100, date: "2026-01-08T00:00:00.000Z", value: 50, lower: 40, upper: 60 },
      { time: 200, date: "2026-01-15T00:00:00.000Z", value: 60, lower: 48, upper: 72 },
    ],
    next: 50,
    changePct,
    direction,
    confidence: "high",
    mape: 7,
    model: "holt-damped-trend",
    horizon: 2,
  };
}

function summary(
  id: string,
  term: string,
  changePct: number,
  forecast: Forecast,
): WatchlistSummary {
  const insight: TermInsight = {
    term,
    latest: 60,
    previous: 50,
    peak: 70,
    peakTime: 100,
    latestTime: 1_760_000_000,
    sampleSize: 20,
    history: [],
    changePct,
    direction: changePct > 2 ? "up" : changePct < -2 ? "down" : "flat",
    momentum: 0,
    forecast,
    sparkline: [],
    related: [],
    regions: [],
  };
  return {
    id,
    term,
    geo: "US",
    threshold: 20,
    createdAt: "2026-01-01T00:00:00.000Z",
    insight,
    source: "google",
    lastCheckedAt: "2026-01-02T00:00:00.000Z",
  };
}

describe("alerts", () => {
  test("derives surge, drop, and forecast alerts once per period", async () => {
    const items = [
      summary("watch-1", "surge", 50, fakeForecast(5, "up")),
      summary("watch-2", "drop", -35, fakeForecast(-5, "down")),
      summary("watch-3", "forecast", 5, fakeForecast(30, "up")),
    ];

    const created = await store.recordAlerts(items, "12m");
    expect(created).toHaveLength(3);
    expect(created.map((alert) => alert.kind).sort()).toEqual(["drop", "forecast-rise", "surge"]);
    const forecastAlert = created.find((alert) => alert.kind === "forecast-rise");
    expect(forecastAlert?.horizon).toBe(2);
    expect(forecastAlert?.value).toBe(60);
    expect(created.every((alert) => alert.range === "12m")).toBe(true);

    const again = await store.recordAlerts(items, "12m");
    expect(again).toHaveLength(0);

    const state = await store.readState();
    expect(state.alerts).toHaveLength(3);
  });

  test("marks alerts read and keeps them after a read", async () => {
    const alerts = await store.markAlertsRead();
    expect(alerts.every((alert) => alert.read)).toBe(true);
    const state = await store.readState();
    expect(state.alerts.every((alert) => alert.read)).toBe(true);
  });

  test("builds a live overview and refreshes it for the background monitor", async () => {
    const item = await store.addWatchlist("ai", "US", 12);
    const overview = await buildOverview("US", "12m");

    expect(overview.source).toBe("google");
    expect(overview.stats.tracked).toBe(1);
    expect(overview.watchlist[0]?.id).toBe(item.id);
    expect(overview.watchlist[0]?.insight.term).toBe("ai");
    expect(overview.watchlist[0]?.insight.history.length).toBeGreaterThan(0);
    expect(overview.trending.items.length).toBeGreaterThan(0);

    const refreshed = await refreshWatchlist("12m");
    expect(refreshed.summaries).toBe(1);
    expect(overview.stats.unreadAlerts).toBeGreaterThanOrEqual(0);
  });

  test("builds a live related-query graph", async () => {
    const analysis = await getAnalysis(["ai"], "US", "12m");
    const graph = buildRelatedGraph(analysis);

    expect(graph.geo).toBe("US");
    expect(graph.nodes[0]?.kind).toBe("term");
    expect(graph.nodes.some((node) => node.kind === "top")).toBe(true);
    expect(graph.nodes.some((node) => node.kind === "rising")).toBe(true);
    expect(graph.links.some((link) => link.relation === "related")).toBe(true);
    expect(graph.links.some((link) => link.relation === "rising")).toBe(true);
    expect(new Set(graph.nodes.map((node) => node.id)).size).toBe(graph.nodes.length);
    expect(connectionsFor(graph.seedId, graph)).toHaveLength(graph.nodes.length - 1);
  });
});
