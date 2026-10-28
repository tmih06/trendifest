import { describe, expect, test } from "bun:test";
import { buildForecast, buildInsight } from "../server/forecast.ts";

const weekly = 7 * 86400;
const times = (count: number) =>
  Array.from({ length: count }, (_, index) => 1_760_000_000 + index * weekly);

describe("forecast", () => {
  test("projects a rising linear series upward with ordered intervals", () => {
    const count = 30;
    const values = Array.from({ length: count }, (_, index) => 20 + index * 2);
    const forecast = buildForecast(values, times(count), 6);

    expect(forecast.points).toHaveLength(6);
    expect(forecast.direction).toBe("up");
    expect(forecast.changePct).toBeGreaterThan(5);
    expect(forecast.confidence).not.toBe("low");
    for (const point of forecast.points) {
      expect(point.lower).toBeLessThanOrEqual(point.value);
      expect(point.upper).toBeGreaterThanOrEqual(point.value);
      expect(point.value).toBeGreaterThanOrEqual(0);
      expect(point.value).toBeLessThanOrEqual(100);
    }
    expect(forecast.points[1]!.time - forecast.points[0]!.time).toBe(weekly);
  });

  test("keeps a flat series flat inside the 0–100 index", () => {
    const count = 24;
    const values = Array.from({ length: count }, () => 50);
    const forecast = buildForecast(values, times(count), 4);

    expect(forecast.direction).toBe("flat");
    for (const point of forecast.points) {
      expect(point.value).toBeGreaterThanOrEqual(48);
      expect(point.value).toBeLessThanOrEqual(52);
    }
  });

  test("does not extrapolate past the index ceiling", () => {
    const count = 20;
    const values = Array.from({ length: count }, (_, index) => 80 + index);
    const forecast = buildForecast(values, times(count), 8);
    for (const point of forecast.points) {
      expect(point.upper).toBeLessThanOrEqual(100);
      expect(point.value).toBeLessThanOrEqual(100);
    }
  });

  test("insight carries the full history and latest observation", () => {
    const count = 12;
    const at = times(count);
    const values = Array.from({ length: count }, (_, index) => 10 + index * 3);
    const insight = buildInsight("test term", values, at, 4);

    expect(insight.term).toBe("test term");
    expect(insight.sampleSize).toBe(count);
    expect(insight.history).toHaveLength(count);
    expect(insight.history.at(-1)!.value).toBe(43);
    expect(insight.latest).toBe(43);
    expect(insight.latestTime).toBe(at.at(-1)!);
    expect(insight.peak).toBe(43);
    expect(insight.changePct).toBeGreaterThan(0);
  });
});
