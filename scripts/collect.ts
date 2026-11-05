import { parseArgs } from "node:util";
import { VIEWER_SEGMENTS } from "../shared/segments.ts";
import { closeDb } from "../server/db.ts";
import { DEFAULT_COLLECTION_LIMIT, MAX_POSTS_PER_SOURCE } from "../server/social/input.ts";
import { runBackfill, status } from "../server/social/service.ts";

/** One real source cycle, sharing the server's database lock and receipt counters. */
async function main() {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      limit: { type: "string", default: String(DEFAULT_COLLECTION_LIMIT) },
      segment: { type: "string", multiple: true },
      help: { type: "boolean" },
    },
    strict: true,
  });
  if (values.help) {
    console.log(
      `Usage: bun scripts/collect.ts [--limit=${DEFAULT_COLLECTION_LIMIT}] [--segment=<source-id>]`,
    );
    console.log(`Sources: ${VIEWER_SEGMENTS.map((segment) => segment.id).join(", ")}`);
    console.log(
      `Limit is records per provider, 1–${MAX_POSTS_PER_SOURCE}. Sources are real public feeds; no fixtures are inserted.`,
    );
    return;
  }
  const limit = Number(values.limit);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_POSTS_PER_SOURCE) {
    throw new Error(`Choose an integer limit between 1 and ${MAX_POSTS_PER_SOURCE}.`);
  }
  for (const id of values.segment ?? []) {
    if (!VIEWER_SEGMENTS.some((segment) => segment.id === id))
      throw new Error(`Unknown source: ${id}`);
  }
  let previous = "";
  /** Emit changed receipts only; elapsed time is never presented as fake completion. */
  function printProgress() {
    const current = JSON.stringify(status().progress);
    if (current === previous) return;
    previous = current;
    console.log(current);
  }
  const interval = setInterval(printProgress, 2_000);
  try {
    const report = await runBackfill(limit, values.segment);
    printProgress();
    if (!report) {
      console.error(status().progress.note ?? "A collection cycle is already running.");
      process.exitCode = 2;
      return;
    }
    console.log(JSON.stringify({ report }));
    // Partial source failure is still visible to automation even when other
    // providers succeeded and their accepted evidence remains durable.
    if (report.errors.length > 0) process.exitCode = 1;
  } finally {
    clearInterval(interval);
    await closeDb();
  }
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
