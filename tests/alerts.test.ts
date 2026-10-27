import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Forecast, TermInsight, WatchlistSummary } from "../shared/types.ts";
import * as store from "../server/store.ts";

let directory = "";

beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "trendifest-store-"));
  process.env.TRENDIFEST_DATA_FILE = path.join(directory, "state.json");
});

afterAll(async () => {
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
  source: "google" | "simulated" = "google",
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
    source,
    lastCheckedAt: "2026-01-02T00:00:00.000Z",
  };
}

describe("alerts", () => {
  test("derives surge, drop, and forecast alerts once per period", async () => {
    const items = [
      summary("watch-1", "surge", 50, fakeForecast(5, "up")),
      summary("watch-2", "drop", -35, fakeForecast(-5, "down")),
      summary("watch-3", "forecast", 5, fakeForecast(30, "up")),
      summary("watch-4", "sample", 90, fakeForecast(50, "up"), "simulated"),
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
});
