import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  PROVIDER_FEED_CONCURRENCY,
  fetchPublisherFeeds,
  parsePublisherFeed,
  publisherFeedUrls,
  vietnamClockInstant,
} from "../server/social/news.ts";
import { fetchPublicFeed } from "../server/social/feeds.ts";
import { MAX_POSTS_PER_SOURCE } from "../server/social/input.ts";
import { VIEWER_SEGMENTS } from "../shared/segments.ts";
import type { ViewerSegment } from "../shared/types.ts";

/**
 * The section-feed publishers are the volume source of the collection graph, so
 * the behaviours pinned here are the ones that would silently produce bad
 * evidence: a Vietnam wall clock read in the wrong zone, HTML entities left in a
 * headline, a failing section erasing the sections that answered, one report
 * counted twice because two sections carried it, an undated item dated "now",
 * and a provider read with unbounded fan-out.
 *
 * Fixtures keep the exact shapes the live documents use: `&agrave;`-style
 * entities and a two-digit year at Thanh Niên, a narrow no-break space before
 * the meridiem at Tuổi Trẻ, an image anchor in every description, and Dân trí's
 * `dc:creator` (which must still not become a community identity).
 */

/** Fixed clock: the window boundary must not depend on the day this suite runs. */
const NOW = Date.parse("2026-11-05T23:00:00Z");

const VNEXPRESS = VIEWER_SEGMENTS.find((segment) => segment.source === "vnexpress")!;
const TUOITRE = VIEWER_SEGMENTS.find((segment) => segment.source === "tuoitre")!;
const THANHNIEN = VIEWER_SEGMENTS.find((segment) => segment.source === "thanhnien")!;
const DAN_TRI = VIEWER_SEGMENTS.find((segment) => segment.source === "dantri")!;

const xmlText = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

interface SectionItem {
  title: string;
  link: string;
  /** Raw `<pubDate>` text, already in the publisher's own spelling. */
  published?: string | null;
  description?: string | null;
  creator?: string | null;
}

function sectionItem(item: SectionItem): string {
  const nodes = [`<title><![CDATA[${item.title}]]></title>`, `<link>${xmlText(item.link)}</link>`];
  if (item.published !== null)
    nodes.push(
      `<pubDate>${xmlText(item.published ?? "Thu, 05 Nov 2026 19:24:01 +0700")}</pubDate>`,
    );
  if (item.description != null)
    nodes.push(`<description><![CDATA[${item.description}]]></description>`);
  if (item.creator != null) nodes.push(`<dc:creator>${xmlText(item.creator)}</dc:creator>`);
  return `<item>${nodes.join("")}</item>`;
}

function sectionFeed(items: string[], title = "Thời sự"): string {
  return [
    `<?xml version="1.0" encoding="utf-8"?>`,
    `<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel>`,
    `<title>${xmlText(title)}</title>`,
    `<link>https://vnexpress.net/</link>`,
    ...items,
    `</channel></rss>`,
  ].join("");
}

/** An article description as the publishers serve it: link + thumbnail + excerpt. */
function articleDescription(link: string, excerpt: string): string {
  return `<a href="${link}"><img src="https://vcdn1.vnexpress.vnecdn.net/2026/11/05/a.jpg" ></a></br>${excerpt}`;
}

describe("vietnamClockInstant", () => {
  test("reads Tuổi Trẻ's wall clock as UTC+07:00, not as UTC or the machine zone", () => {
    // "11/5/2026 9:15:00 PM" is 21:15 in Vietnam, i.e. 14:15 UTC.
    expect(vietnamClockInstant("11/5/2026 9:15:00 PM")).toBe(
      Date.parse("2026-11-05T14:15:00.000Z"),
    );
    expect(vietnamClockInstant("11/5/2026 9:15:00 AM")).toBe(
      Date.parse("2026-11-05T02:15:00.000Z"),
    );
  });

  test("accepts the narrow no-break space and a 24-hour value without meridiem", () => {
    expect(vietnamClockInstant("11/5/2026 9:15:00\u202fPM")).toBe(
      Date.parse("2026-11-05T14:15:00.000Z"),
    );
    expect(vietnamClockInstant("11/5/2026 21:15:00")).toBe(Date.parse("2026-11-05T14:15:00.000Z"));
  });

  test("rejects an impossible calendar value and an unreadable one", () => {
    expect(Number.isNaN(vietnamClockInstant("31/2/2026 9:00:00 AM"))).toBe(true);
    expect(Number.isNaN(vietnamClockInstant("2/31/2026 9:00:00 AM"))).toBe(true);
    expect(Number.isNaN(vietnamClockInstant("11/5/2026 9:60:00 AM"))).toBe(true);
    expect(Number.isNaN(vietnamClockInstant("11/5/2026 9:15:60 PM"))).toBe(true);
    expect(Number.isNaN(vietnamClockInstant("11/5/2026 24:00:00"))).toBe(true);
    expect(Number.isNaN(vietnamClockInstant("11/5/2026 13:00:00 PM"))).toBe(true);
    expect(Number.isNaN(vietnamClockInstant(""))).toBe(true);
    expect(Number.isNaN(vietnamClockInstant("hôm qua"))).toBe(true);
  });
});

describe("publisherFeedUrls", () => {
  test("refuses a catalog document that leaves the publisher origin or is not RSS", () => {
    expect(() =>
      publisherFeedUrls({ ...VNEXPRESS, additionalFeedUrls: ["https://vietnamnet.vn/rss/a.rss"] }),
    ).toThrow("stay on");
    expect(() =>
      publisherFeedUrls({ ...VNEXPRESS, additionalFeedUrls: ["http://vnexpress.net/rss/a.rss"] }),
    ).toThrow("must be HTTPS");
    expect(() =>
      publisherFeedUrls({ ...VNEXPRESS, additionalFeedUrls: ["https://vnexpress.net/thoi-su"] }),
    ).toThrow("RSS document");
  });

  test("collapses a duplicated catalog entry instead of reading it twice", () => {
    const urls = publisherFeedUrls({
      ...VNEXPRESS,
      additionalFeedUrls: [VNEXPRESS.feedUrl, "https://vnexpress.net/rss/the-gioi.rss"],
    });
    expect(urls).toEqual([VNEXPRESS.feedUrl, "https://vnexpress.net/rss/the-gioi.rss"]);
  });

  test("refuses a source that has no section-feed catalog", () => {
    const google = VIEWER_SEGMENTS.find((segment) => segment.source === "google-news")!;
    expect(() => publisherFeedUrls(google)).toThrow("no section-feed catalog");
  });
});

describe("parsePublisherFeed", () => {
  test("decodes HTML entities in the headline and keeps the visible excerpt", () => {
    const link = "https://thanhnien.vn/hon-600-co-so-an-uong-185261105201051481.htm";
    const xml = sectionFeed([
      sectionItem({
        title: "Hơn 600 cơ sở ăn uống chưa được cấp chứng nhận an to&agrave;n thực phẩm",
        link,
        published: "Thu, 05 Nov 26 21:21:00 +0700",
        description: articleDescription(
          link,
          "Hơn 600 cơ sở kinh doanh dịch vụ ăn uống chưa được cấp giấy chứng nhận an to&agrave;n.",
        ),
      }),
    ]);

    const posts = parsePublisherFeed(xml, THANHNIEN, MAX_POSTS_PER_SOURCE, NOW);
    expect(posts).toHaveLength(1);
    const post = posts[0]!;
    expect(post.title).toBe("Hơn 600 cơ sở ăn uống chưa được cấp chứng nhận an toàn thực phẩm");
    expect(post.text).toContain("an toàn.");
    expect(post.text).not.toContain("&agrave;");
    expect(post.text).not.toContain("<a ");
    expect(post.text).not.toContain("<img");
    expect(post.publisher).toBe("Thanh Niên");
    expect(post.evidenceType).toBe("news");
    expect(post.timeKind).toBe("published");
    // Two-digit year at Thanh Niên survives as 2026, with its +07:00 offset.
    expect(post.publishedAt).toBe("2026-11-05T14:21:00.000Z");
    // A newsroom byline is never a community author, and nothing is measured.
    expect(post.authorId).toBeNull();
    expect(post.authorHandle).toBeNull();
    expect(post.engagement).toBeNull();
    expect(post.media).toEqual([]);
    // The canonical article link is the identity, not a title or a hash.
    expect(post.uri).toBe(link);
    expect(post.permalink).toBe(link);
  });

  test("uses each publisher's own timestamp spelling and attribution", () => {
    const tuoiTreLink = "https://tuoitre.vn/tphcm-ho-tro-tai-dinh-cu-100261105211111484.htm";
    const tuoiTre = parsePublisherFeed(
      sectionFeed([
        sectionItem({
          title: "TP.HCM dự kiến hỗ trợ 1 tỉ đến 6 tỉ đồng",
          link: tuoiTreLink,
          published: "11/5/2026 9:15:00\u202fPM",
          description: articleDescription(tuoiTreLink, "Dự kiến người dân sẽ tự lo chỗ ở."),
        }),
      ]),
      TUOITRE,
      MAX_POSTS_PER_SOURCE,
      NOW,
    )[0]!;
    expect(tuoiTre.publisher).toBe("Tuổi Trẻ");
    expect(tuoiTre.publishedAt).toBe("2026-11-05T14:15:00.000Z");

    const danTriLink = "https://dantri.com.vn/thoi-su/cao-toc-bac-nam-20261105205407127.htm";
    const danTri = parsePublisherFeed(
      sectionFeed([
        sectionItem({
          title: "Cao tốc Bắc - Nam phía Đông thu hơn 3.500 tỷ đồng",
          link: danTriLink,
          published: "Thu, 05 Nov 2026 20:59:16 +0700",
          creator: "Nguyễn Hải",
          description: articleDescription(danTriLink, "(Dân trí) - Từ tháng 3 đến hết tháng 10."),
        }),
      ]),
      DAN_TRI,
      MAX_POSTS_PER_SOURCE,
      NOW,
    )[0]!;
    expect(danTri.publisher).toBe("Dân trí");
    expect(danTri.publishedAt).toBe("2026-11-05T13:59:16.000Z");
    // Dân trí's own byline is newsroom attribution, not a community identity.
    expect(danTri.authorId).toBeNull();

    const vnExpressLink = "https://vnexpress.net/oto-bien-dang-5141328.html";
    const vnExpress = parsePublisherFeed(
      sectionFeed([
        sectionItem({
          title: "Ôtô biến dạng sau khi tông xe bơm bêtông ở Nha Trang",
          link: vnExpressLink,
          published: "Thu, 05 Nov 2026 20:29:42 +0700",
          description: articleDescription(vnExpressLink, "Ôtô chở 4 người va chạm với xe bơm."),
        }),
      ]),
      VNEXPRESS,
      MAX_POSTS_PER_SOURCE,
      NOW,
    )[0]!;
    expect(vnExpress.publisher).toBe("VnExpress");
    expect(vnExpress.publishedAt).toBe("2026-11-05T13:29:42.000Z");
  });

  test("drops undated, stale and future records instead of dating them now", () => {
    const link = (index: number) => `https://vnexpress.net/bai-${index}.html`;
    const posts = parsePublisherFeed(
      sectionFeed([
        sectionItem({ title: "Tin không có ngày", link: link(1), published: null }),
        sectionItem({
          title: "Tin cũ ngoài cửa sổ bảy ngày",
          link: link(2),
          published: "Fri, 10 Oct 2026 09:00:00 +0700",
        }),
        sectionItem({
          title: "Tin ở tương lai",
          link: link(3),
          published: "Fri, 06 Nov 2026 09:00:00 +0700",
        }),
        sectionItem({
          title: "Tin hợp lệ trong cửa sổ",
          link: link(4),
          published: "Thu, 05 Nov 2026 09:00:00 +0700",
        }),
      ]),
      VNEXPRESS,
      MAX_POSTS_PER_SOURCE,
      NOW,
    );
    expect(posts.map((post) => post.permalink)).toEqual([link(4)]);
  });

  test("collapses the same canonical article and keeps tracking parameters out", () => {
    const posts = parsePublisherFeed(
      sectionFeed([
        sectionItem({
          title: "Tin thứ nhất",
          link: "https://vnexpress.net/tin-thu-nhat-5141000.html?utm_source=rss&utm_medium=feed",
          published: "Thu, 05 Nov 2026 09:00:00 +0700",
        }),
        sectionItem({
          title: "Tin thứ nhất (bản in lại)",
          link: "https://vnexpress.net/tin-thu-nhat-5141000.html",
          published: "Thu, 05 Nov 2026 09:00:00 +0700",
        }),
        sectionItem({
          title: "Tin thứ hai",
          link: "https://vnexpress.net/tin-thu-hai-5141001.html",
          published: "Thu, 05 Nov 2026 08:00:00 +0700",
        }),
      ]),
      VNEXPRESS,
      MAX_POSTS_PER_SOURCE,
      NOW,
    );
    expect(posts.map((post) => post.permalink)).toEqual([
      "https://vnexpress.net/tin-thu-nhat-5141000.html",
      "https://vnexpress.net/tin-thu-hai-5141001.html",
    ]);
  });

  test("clamps the requested limit and keeps the publisher's own order", () => {
    const items = Array.from({ length: MAX_POSTS_PER_SOURCE + 3 }, (_, index) => {
      const link = `https://vnexpress.net/bai-${index}.html`;
      return sectionItem({
        title: `Tiêu đề số ${index + 1}`,
        link,
        published: new Date(NOW - 3_600_000 - index * 60_000).toUTCString(),
      });
    });
    const posts = parsePublisherFeed(sectionFeed(items), VNEXPRESS, Number.MAX_SAFE_INTEGER, NOW);
    // RSS order is preserved as the publisher wrote it; nothing is invented.
    expect(posts).toHaveLength(MAX_POSTS_PER_SOURCE);
    expect(posts[0]!.title).toBe("Tiêu đề số 1");
    expect(parsePublisherFeed(sectionFeed(items), VNEXPRESS, 0, NOW)).toEqual([]);
  });

  test("rejects a non-RSS document rather than reporting an empty feed", () => {
    const consent = `<?xml version="1.0" encoding="utf-8"?><html><body>Vui lòng bật JavaScript</body></html>`;
    expect(() => parsePublisherFeed(consent, VNEXPRESS, 5, NOW)).toThrow();
  });
});

describe("fetchPublicFeed section fan-in", () => {
  let server: Bun.Server<undefined> | undefined;
  let origin = "";
  let host = "";
  let inFlight = 0;
  let peak = 0;
  let malformed = true;
  const hits = new Map<string, number>();

  /** A live-clock item so the seven-day window accepts it during the run. */
  function freshItem(slug: string, title: string, minutesAgo: number): string {
    return sectionItem({
      title,
      link: `https://${host}/${slug}.html`,
      published: new Date(Date.now() - minutesAgo * 60_000).toUTCString(),
      description: articleDescription(`https://${host}/${slug}.html`, `Tóm tắt của ${slug}.`),
    });
  }

  /** A document with `count` fresh articles, one every two minutes. */
  function documentWith(prefix: string, count: number): string {
    return sectionFeed(
      Array.from({ length: count }, (_, index) =>
        freshItem(`${prefix}-${index}`, `Tin ${prefix} số ${index + 1}`, 10 + index * 2),
      ),
    );
  }

  beforeAll(() => {
    server = Bun.serve({
      port: 0,
      idleTimeout: 15,
      async fetch(request) {
        const url = new URL(request.url);
        if (!url.pathname.startsWith("/rss/")) return new Response("không", { status: 404 });
        hits.set(url.pathname, (hits.get(url.pathname) ?? 0) + 1);
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        try {
          // A real socket round-trip is what the request bound applies to, so the
          // fixture holds each reply open briefly: fake timers cannot drive Bun's
          // HTTP server, and an instant reply would never overlap two requests.
          await Bun.sleep(20);
          if (url.pathname === "/rss/broken.rss" || url.pathname === "/rss/broken2.rss") {
            return new Response("lỗi", { status: 500 });
          }
          if (url.pathname === "/rss/slow.rss") {
            return new Response(
              sectionFeed([freshItem("slow-article", "Tin chậm nhưng thật", 30)]),
              {
                headers: { "content-type": "application/rss+xml" },
              },
            );
          }
          if (url.pathname === "/rss/home.rss") {
            return new Response(documentWith("trang-chu", 40), {
              headers: { "content-type": "application/rss+xml" },
            });
          }
          if (url.pathname === "/rss/many.rss") {
            // The default-source boundary: 601 records against a 500-record budget.
            const count = Number(url.searchParams.get("n") ?? 601);
            return new Response(documentWith("nhieu", count), {
              headers: { "content-type": "application/rss+xml", etag: `"many-${count}"` },
            });
          }
          if (url.pathname === "/rss/etag.rss") {
            if (request.headers.get("if-none-match") === '"sections-1"')
              return new Response(null, { status: 304 });
            return new Response(sectionFeed([freshItem("etag-article", "Tin có ETag", 45)]), {
              headers: { "content-type": "application/rss+xml", etag: '"sections-1"' },
            });
          }
          if (url.pathname === "/rss/large-etag.rss") {
            // 30 real articles behind a validator: one budget cannot reach them all.
            if (request.headers.get("if-none-match") === '"large-1"')
              return new Response(null, { status: 304 });
            return new Response(documentWith("lon", 30), {
              headers: { "content-type": "application/rss+xml", etag: '"large-1"' },
            });
          }
          if (url.pathname === "/rss/one-shot-etag.rss") {
            if (request.headers.get("if-none-match") === '"one-shot"')
              return new Response(null, { status: 304 });
            return new Response(sectionFeed([freshItem("one-shot-article", "Tin một lần", 20)]), {
              headers: { "content-type": "application/rss+xml", etag: '"one-shot"' },
            });
          }
          if (url.pathname === "/rss/malformed.rss") {
            if (malformed) {
              // A broken document that still claims a validator.
              return new Response("<rss><channel><title>Hỏng</title><item>", {
                headers: { "content-type": "application/rss+xml", etag: '"malformed-1"' },
              });
            }
            if (request.headers.get("if-none-match") === '"malformed-1"')
              return new Response(null, { status: 304 });
            return new Response(
              sectionFeed([freshItem("sau-khi-hong", "Tin đọc được sau lần hỏng", 25)]),
              { headers: { "content-type": "application/rss+xml", etag: '"malformed-1"' } },
            );
          }
          // The same article is carried by two sections, as the live catalogs do.
          const shared = freshItem("chia-se", "Tin xuất hiện ở hai chuyên mục", 15);
          return new Response(
            sectionFeed([
              shared,
              freshItem(`rieng-${url.pathname.replaceAll("/", "-")}`, "Tin riêng chuyên mục", 60),
            ]),
            { headers: { "content-type": "application/rss+xml" } },
          );
        } finally {
          inFlight -= 1;
        }
      },
    });
    origin = `http://127.0.0.1:${server.port}`;
    host = `127.0.0.1:${server.port}`;
  });

  afterAll(async () => {
    await server?.stop(true);
  });

  const segmentWith = (...paths: string[]): ViewerSegment => ({
    ...VNEXPRESS,
    feedUrl: `${origin}${paths[0]}`,
    additionalFeedUrls: paths.slice(1).map((path) => `${origin}${path}`),
  });

  const numbersIn = (posts: Array<{ permalink: string }>, prefix: string) =>
    posts
      .filter((post) => post.permalink.includes(`/${prefix}-`))
      .map((post) => Number(new RegExp(`/${prefix}-(\\d+)\\.html$`).exec(post.permalink)![1]));

  test("merges sections into one article list, keeping one copy of a shared report", async () => {
    const result = await fetchPublicFeed(segmentWith("/rss/thoi-su.rss", "/rss/the-gioi.rss"), 25);
    expect(result.errors).toEqual([]);
    const uris = result.posts.map((post) => post.permalink);
    expect(new Set(uris).size).toBe(uris.length);
    expect(uris.filter((uri) => uri === `https://${host}/chia-se.html`)).toHaveLength(1);
    expect(result.posts.every((post) => post.evidenceType === "news")).toBe(true);
    expect(result.posts.every((post) => post.publisher === "VnExpress")).toBe(true);
  });

  test("keeps a failing section as a labelled error and still returns the rest", async () => {
    const result = await fetchPublicFeed(segmentWith("/rss/thoi-su.rss", "/rss/broken.rss"), 25);
    expect(result.posts.length).toBeGreaterThan(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("vnexpress");
    expect(result.errors[0]).toContain("/rss/broken.rss");
    expect(result.errors[0]).toContain("500");
  });

  test("never exceeds the provider request bound while fanning in", async () => {
    peak = 0;
    await fetchPublicFeed(
      segmentWith(
        "/rss/thoi-su.rss",
        "/rss/the-gioi.rss",
        "/rss/slow.rss",
        "/rss/one-shot-etag.rss",
      ),
      25,
    );
    expect(peak).toBeLessThanOrEqual(PROVIDER_FEED_CONCURRENCY);
    expect(peak).toBeGreaterThan(1);
  });

  test("replays the cached articles on a 304 instead of reporting an empty read", async () => {
    const segment = segmentWith("/rss/one-shot-etag.rss");
    const before = hits.get("/rss/one-shot-etag.rss") ?? 0;
    const first = await fetchPublicFeed(segment, 25);
    expect(first.posts.map((post) => post.permalink)).toEqual([
      `https://${host}/one-shot-article.html`,
    ]);

    const second = await fetchPublicFeed(segment, 25);
    // "Unchanged" means the same real article is still evidence, not that the
    // publisher became empty.
    expect(second.errors).toEqual([]);
    expect(second.posts.map((post) => post.permalink)).toEqual([
      `https://${host}/one-shot-article.html`,
    ]);
    expect((hits.get("/rss/one-shot-etag.rss") ?? 0) - before).toBe(2);
  });

  test("a larger request after a 304 still gets the records the earlier budget skipped", async () => {
    const segment = segmentWith("/rss/large-etag.rss");

    const small = await fetchPublicFeed(segment, 5);
    expect(small.posts).toHaveLength(5);
    const smallSeen = new Set(small.posts.map((post) => post.permalink));

    // The next poll is answered with 304; the budget is now much larger, so the
    // records the previous cycle could not reach must become visible.
    const large = await fetchPublicFeed(segment, 25);
    expect(large.errors).toEqual([]);
    expect(large.posts).toHaveLength(25);
    expect(new Set(large.posts.map((post) => post.permalink)).size).toBe(25);
    expect(
      large.posts.filter((post) => !smallSeen.has(post.permalink)).length,
    ).toBeGreaterThanOrEqual(20);
    // The newest article stays reachable through every cycle.
    expect(large.posts[0]!.permalink).toBe(`https://${host}/lon-0.html`);
  });

  test("a malformed document does not consume its validator", async () => {
    malformed = true;
    const segment = segmentWith("/rss/malformed.rss");
    const before = hits.get("/rss/malformed.rss") ?? 0;
    const failed = await fetchPublicFeed(segment, 25).catch(() => null);
    // No readable document at all is unavailable, and no validator was stored.
    expect(failed).toBeNull();

    malformed = false;
    const recovered = await fetchPublicFeed(segment, 25);
    expect(recovered.errors).toEqual([]);
    expect(recovered.posts.map((post) => post.permalink)).toEqual([
      `https://${host}/sau-khi-hong.html`,
    ]);
    // The parser was given the real document instead of a 304 for a document it
    // never accepted.
    expect((hits.get("/rss/malformed.rss") ?? 0) - before).toBe(2);
  });

  test("rotates the window-wide sample between cycles while keeping the newest record", async () => {
    const segment = segmentWith("/rss/large-etag.rss");
    const base = Date.now();
    // Two adjacent ten-minute epochs select different records from one document;
    // the second read is answered with 304, so this is the cached-record path.
    const first = await fetchPublisherFeeds(segment, 6, base);
    const second = await fetchPublisherFeeds(segment, 6, base + 600_000);
    expect(first.posts).toHaveLength(6);
    expect(second.posts).toHaveLength(6);
    expect(first.posts[0]!.permalink).toBe(`https://${host}/lon-0.html`);
    expect(second.posts[0]!.permalink).toBe(`https://${host}/lon-0.html`);
    const firstUris = new Set(first.posts.map((post) => post.permalink));
    expect(second.posts.some((post) => !firstUris.has(post.permalink))).toBe(true);
  });

  test("reaches every record in the window across successive rotations", async () => {
    const segment = segmentWith("/rss/large-etag.rss");
    const reached = new Set<string>();
    const base = Date.now();
    // Six records per cycle over a 30-record document: advancing the collector's
    // clock must expose the whole window instead of only its newest slice.
    for (let cycle = 0; cycle < 7; cycle += 1) {
      const result = await fetchPublisherFeeds(segment, 6, base + cycle * 600_000);
      expect(result.errors).toEqual([]);
      for (const post of result.posts) reached.add(post.permalink);
    }
    expect(reached.size).toBe(30);
  });

  test("fills the exact requested quota when the window barely exceeds it", async () => {
    // 601 records against a 500 budget: a stride that shares a factor with the
    // window length would visit only the slots it lands on and return 301 of the
    // 500 requested records. Every request must return the full quota of
    // distinct articles instead.
    const segment: ViewerSegment = {
      ...VNEXPRESS,
      feedUrl: `${origin}/rss/many.rss?n=601`,
      additionalFeedUrls: [],
    };
    const result = await fetchPublicFeed(segment, 500);
    expect(result.errors).toEqual([]);
    expect(result.posts).toHaveLength(500);
    expect(new Set(result.posts.map((post) => post.permalink)).size).toBe(500);
    // The newest report is never crowded out by the sample.
    expect(result.posts[0]!.permalink).toBe(`https://${host}/nhieu-0.html`);
  });

  test("covers the whole over-budget window across rotations", async () => {
    const segment: ViewerSegment = {
      ...VNEXPRESS,
      feedUrl: `${origin}/rss/many.rss?n=601`,
      additionalFeedUrls: [],
    };
    const base = Date.now();
    const reached = new Set<string>();
    // Six disjoint-lane rotations of 500 must reach all 601 records, so no
    // article inside the window is permanently unreachable.
    for (let cycle = 0; cycle < 6; cycle += 1) {
      const result = await fetchPublisherFeeds(segment, 500, base + cycle * 600_000);
      expect(result.posts).toHaveLength(500);
      for (const post of result.posts) reached.add(post.permalink);
    }
    expect(reached.size).toBe(601);
  });

  test("samples across the window so an older article stays reachable", async () => {
    const result = await fetchPublicFeed(segmentWith("/rss/home.rss"), 10);
    expect(result.posts).toHaveLength(10);
    expect(result.posts[0]!.permalink).toBe(`https://${host}/trang-chu-0.html`);
    // The newest ten would all be same-hour items; the sample reaches much further.
    expect(Math.max(...numbersIn(result.posts, "trang-chu"))).toBeGreaterThan(20);
  });

  test("reports an unreadable provider as unavailable instead of an empty source", async () => {
    const outcome = await fetchPublicFeed(
      segmentWith("/rss/broken.rss", "/rss/broken2.rss"),
      25,
    ).catch((error: unknown) => error);
    expect(outcome).toBeInstanceOf(Error);
    expect(String(outcome)).toContain("no section feed could be read");
  });
});
