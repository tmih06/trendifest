import { describe, expect, test } from "bun:test";
import { safeTestDatabaseUrl } from "./database-safety.ts";

/** Production/development targets must be rejected before a test opens SQL. */
describe("destructive test database safety", () => {
  test("rejects development, demo copies, invalid protocols, and encoded development names", () => {
    for (const url of [
      "postgres://user:secret@localhost/trendifest",
      "postgres://user:secret@localhost/trendifest_feature_demo_20261105",
      "postgres://user:secret@localhost/%74rendifest",
      "https://localhost/trendifest_test",
      "not a database URL",
    ]) {
      expect(() => safeTestDatabaseUrl(url)).toThrow();
    }
  });

  test("allows explicitly disposable CI and scratch names without inheriting application settings", () => {
    for (const database of [
      "trendifest_test",
      "trendifest_feature_ci_20261105",
      "trendifest_reviewslice_scratch",
    ]) {
      const safe = safeTestDatabaseUrl(`postgres://user:secret@localhost/${database}`)!;
      expect(new URL(safe).pathname).toBe(`/${database}`);
    }
    expect(safeTestDatabaseUrl(undefined)).toBeUndefined();
    expect(safeTestDatabaseUrl("  ")).toBeUndefined();
  });
});
