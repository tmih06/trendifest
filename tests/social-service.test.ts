import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { VIEWER_SEGMENTS } from "../shared/segments.ts";
import { closeDb, getDb } from "../server/db.ts";
import { runBackfill, status } from "../server/social/service.ts";

const TEST_URL = process.env.TRENDIFEST_TEST_DATABASE_URL ?? "";
if (TEST_URL) process.env.TRENDIFEST_DATABASE_URL = TEST_URL;
const VOZ = VIEWER_SEGMENTS.find((segment) => segment.id === "voz")!;
const originalFeed = VOZ.feedUrl;

/** A valid empty source lets coordination tests avoid inference and external HTTP. */
const emptyFeed = '<rss version="2.0"><channel><title>Local source</title></channel></rss>';

/** Local source records have real parser shape; they are never inserted into the collection DB. */
function feedItem(id: string, text: string, port: number) {
  return (
    `<item><title>${text}</title><guid>urn:xenforo:thread:${id}.0</guid>` +
    `<link>https://127.0.0.1:${port}/t/${id}/</link><pubDate>${new Date().toUTCString()}</pubDate>` +
    `<description><![CDATA[<p>${text}</p>]]></description></item>`
  );
}

describe.skipIf(!TEST_URL)("collection service ownership and progress", () => {
  beforeEach(async () => {
    const db = await getDb();
    await db`TRUNCATE topic_embeddings, cluster_members, clusters, embeddings, metric_snapshots, observations, posts RESTART IDENTITY CASCADE`;
  });
  afterAll(async () => {
    VOZ.feedUrl = originalFeed;
    await closeDb();
  });

  test("another process cannot run a second collector while a source is in flight", async () => {
    const fetched = Promise.withResolvers<void>();
    const release = Promise.withResolvers<Response>();
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch() {
        fetched.resolve();
        return release.promise;
      },
    });
    VOZ.feedUrl = `http://127.0.0.1:${server.port}/lease.rss`;
    const first = runBackfill(1, ["voz"]);
    try {
      await fetched.promise;
      expect(status().backfilling).toBe(true);
      const child = Bun.spawn(
        [
          process.execPath,
          "--eval",
          `
        import {runBackfill,status} from './server/social/service.ts';
        import {closeDb} from './server/db.ts';
        try {console.log(JSON.stringify({report:await runBackfill(1,[]),progress:status().progress}));}
        finally {await closeDb();}
      `,
        ],
        {
          cwd: new URL("..", import.meta.url).pathname,
          env: { ...process.env, TRENDIFEST_DATABASE_URL: TEST_URL, TRENDIFEST_SOCIAL: "0" },
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      const output = await new Response(child.stdout).text();
      expect(await child.exited).toBe(0);
      const second = JSON.parse(output.trim());
      expect(second.report).toBeNull();
      expect(second.progress.phase).toBe("idle");
      expect(second.progress.stored).toBe(0);
      release.resolve(new Response(emptyFeed));
      expect((await first)?.errors).toEqual([]);
      // The next cycle is permitted after ownership is released.
      expect(await runBackfill(1, [])).not.toBeNull();
    } finally {
      release.resolve(new Response(emptyFeed));
      await first;
      await server.stop(true);
      VOZ.feedUrl = originalFeed;
    }
  });

  test("progress reports actual stored and rejected receipts without blocking the next cycle", async () => {
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(): Response {
        return new Response(
          `<rss version="2.0"><channel><title>Local source</title>` +
            feedItem(
              "vietnamese",
              "Người dùng Việt Nam đang thảo luận về mô hình trí tuệ nhân tạo mới, với khả năng lập trình và suy luận được cải thiện rõ rệt.",
              server.port!,
            ) +
            feedItem(
              "english",
              "Travelers in Vietnam recommend visiting the capital city and booking affordable hotels before the summer holidays begin.",
              server.port!,
            ) +
            "</channel></rss>",
        );
      },
    });
    VOZ.feedUrl = `http://127.0.0.1:${server.port}/progress.rss`;
    try {
      const report = await runBackfill(10, ["voz"]);
      expect(report?.stored).toBe(1);
      expect(report?.skippedLanguage).toBe(1);
      const progress = status().progress;
      expect(progress.phase).toBe("done");
      expect(progress.segmentsDone).toBe(1);
      expect(progress.fetched).toBe(2);
      expect(progress.stored).toBe(1);
      expect(progress.rejected).toBe(1);
      expect(progress.embedded).toBe(1);
      expect(status().backfilling).toBe(false);
    } finally {
      await server.stop(true);
      VOZ.feedUrl = originalFeed;
    }
  });

  test("a failed source keeps its error visible and releases ownership for recovery", async () => {
    let available = false;
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch() {
        return available ? new Response(emptyFeed) : new Response("Unavailable", { status: 503 });
      },
    });
    VOZ.feedUrl = `http://127.0.0.1:${server.port}/recovery.rss`;
    try {
      expect((await runBackfill(1, ["voz"]))?.errors.length).toBe(1);
      expect(status().lastErrors.length).toBe(1);
      available = true;
      expect((await runBackfill(1, ["voz"]))?.errors).toEqual([]);
      expect(status().lastErrors).toEqual([]);
      expect(status().backfilling).toBe(false);
    } finally {
      await server.stop(true);
      VOZ.feedUrl = originalFeed;
    }
  });
});
