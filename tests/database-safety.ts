/**
 * Bun preloads this before ANY test module can open a database or truncate rows.
 * Never inherit the application's .env database into tests. A dedicated URL is
 * required, and its database name must explicitly identify a disposable target.
 */
export function safeTestDatabaseUrl(value: string | undefined) {
  if (!value?.trim()) return undefined;
  let url: URL;
  let database: string;
  try {
    url = new URL(value.trim());
    database = decodeURIComponent(url.pathname.slice(1));
  } catch {
    throw new Error(
      "TRENDIFEST_TEST_DATABASE_URL must be a valid PostgreSQL URL for a dedicated test database.",
    );
  }
  const dedicated =
    /^trendifest_(?:test(?:_[a-z0-9_]+)?|[a-z0-9_]+_ci_[a-z0-9_]+|(?:[a-z0-9_]+_)?scratch(?:_[a-z0-9_]+)?)$/iu;
  if (
    (url.protocol !== "postgres:" && url.protocol !== "postgresql:") ||
    !dedicated.test(database)
  ) {
    throw new Error(
      "Refusing destructive database tests: use trendifest_test, trendifest_*_ci_*, or trendifest_*_scratch. The development database and demo copies are forbidden.",
    );
  }
  return url.toString();
}

const testUrl = safeTestDatabaseUrl(process.env.TRENDIFEST_TEST_DATABASE_URL);
process.env.TRENDIFEST_TEST_DATABASE_URL = testUrl ?? "";
process.env.TRENDIFEST_DATABASE_URL = testUrl ?? "";
