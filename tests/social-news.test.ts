import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  MAX_RESPONSE_BYTES,
  NEWS_WINDOW_DAYS,
  parseGoogleNewsFeed,
  parseNguoiVietPosts,
  requestBounded,
} from "../server/social/news.ts";
import { fetchPublicFeed, parsePublicFeed } from "../server/social/feeds.ts";
import { MAX_POSTS_PER_SOURCE } from "../server/social/input.ts";
import { VIEWER_SEGMENTS } from "../shared/segments.ts";
import type { ViewerSegment } from "../shared/types.ts";

/**
 * News is separate evidence: one article is one publisher's report, never a
 * community author, a like counter or a crowd. These tests pin the adapter
 * behaviours that are expensive to get wrong in production — a headline stays a
 * headline, related-headline blocks are not turned into extra posts, the
 * publisher is attributed rather than invented, publication time is preserved
 * instead of being relabelled as forum activity, and the seven-day window is
 * sampled within the per-cycle budget rather than truncated to the newest slice.
 *
 * Fixtures are trimmed from the live documents: `google-news.rss` keeps the
 * `nfe`-style item shape Google actually serves (including the related-headline
 * `<ol>` in the description), and `nguoi-viet-posts.json` keeps the WordPress
 * fields the adapter requests.
 */

const GOOGLE: ViewerSegment = VIEWER_SEGMENTS.find((segment) => segment.source === "google-news")!;
const NGUOI_VIET: ViewerSegment = VIEWER_SEGMENTS.find(
  (segment) => segment.source === "nguoi-viet",
)!;
const VOZ: ViewerSegment = VIEWER_SEGMENTS.find((segment) => segment.source === "voz")!;

/** Fixed clock: window boundaries must not depend on the day this suite runs. */
const NOW = Date.parse("2026-11-05T12:00:00Z");
const DAY = 86_400_000;

const xmlText = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

interface GoogleItem {
  title: string;
  /** Google's stable per-item id string. */
  guid: string;
  link?: string;
  published?: string | null;
  publisher?: string | null;
  publisherUrl?: string | null;
  /** Related-headline HTML block Google puts in `description`. */
  related?: string | null;
}

function googleItem(item: GoogleItem): string {
  const nodes: string[] = [`<title>${xmlText(item.title)}</title>`];
  nodes.push(
    `<link>${xmlText(item.link ?? `https://news.google.com/rss/articles/${item.guid}?oc=5`)}</link>`,
  );
  nodes.push(`<guid isPermaLink="false">${xmlText(item.guid)}</guid>`);
  if (item.published !== null) {
    nodes.push(`<pubDate>${xmlText(item.published ?? "Thu, 05 Nov 2026 09:19:00 GMT")}</pubDate>`);
  }
  if (item.related !== null) {
    nodes.push(
      `<description>${xmlText(
        item.related ??
          `<a href="https://news.google.com/rss/articles/${item.guid}?oc=5" target="_blank">` +
            `${item.title}</a>&nbsp;&nbsp;<font color="#6f6f6f">${item.publisher ?? "Báo VietNamNet"}` +
            `</font><strong><a href="https://news.google.com/stories/CAAqNg?hl=vi">` +
            `Xem thêm tiêu đề và góc nhìn khác trên Google Tin tức</a></strong>`,
      )}</description>`,
    );
  }
  if (item.publisher !== null) {
    const url = item.publisherUrl ?? "https://vietnamnet.vn";
    nodes.push(
      `<source url="${xmlText(url)}">${xmlText(item.publisher ?? "Báo VietNamNet")}</source>`,
    );
  }
  return `<item>${nodes.join("")}</item>`;
}

function googleFeed(items: string[]): string {
  return [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel>`,
    `<generator>NFE/5.0</generator>`,
    `<title>Tin nổi bật - Google Tin tức</title>`,
    `<link>https://news.google.com/?hl=vi&amp;gl=VN&amp;ceid=VN:vi</link>`,
    `<language>vi</language>`,
    ...items,
    `</channel></rss>`,
  ].join("");
}

interface WpPost {
  id: number | string;
  date_gmt?: string | null;
  link?: string | null;
  title?: string | null;
  excerpt?: string | null;
}

function wpPost(post: WpPost): Record<string, unknown> {
  const record: Record<string, unknown> = { id: post.id };
  if (post.date_gmt !== null) record.date_gmt = post.date_gmt ?? "2026-11-01T19:56:12";
  if (post.link !== null) {
    record.link = post.link ?? "https://www.nguoi-viet.com/viet-nam/bai-viet-3490787/";
  }
  if (post.title !== null) {
    record.title = { rendered: post.title ?? "Nam sinh chào kiểu phát xít trên Đài Truyền Hình" };
  }
  if (post.excerpt !== null) {
    record.excerpt = {
      rendered:
        post.excerpt ??
        "<p>Trong trận chung kết cuộc thi “Đường Lên Đỉnh Olympia” phát sóng trực tiếp trên kênh VTV.</p>\n",
    };
  }
  return record;
}

/** The verified November 1 report, as the publisher's own API returns it. */
const OLYMPIA_RECORD = wpPost({
  id: 3490787,
  date_gmt: "2026-11-01T19:56:12",
  link: "https://www.nguoi-viet.com/viet-nam/nam-sinh-chao-kieu-phat-xit-tren-dai-truyen-hinh-viet-nam/",
  title: "Nam sinh chào kiểu phát xít trên Đài Truyền Hình Việt Nam",
});

/** A seven-day window of `count` records, newest first, one per two hours. */
function windowRecords(
  count: number,
  base = NOW,
  linkBase = "https://www.nguoi-viet.com/viet-nam",
): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, index) =>
    wpPost({
      id: 3_000_000 + index,
      date_gmt: new Date(base - 3_600_000 - index * 7_200_000).toISOString().slice(0, 19),
      link: `${linkBase}/bai-viet-${index}/`,
      title: `Bài viết số ${index + 1} về một sự việc cụ thể`,
      excerpt: `<p>Tóm tắt thứ ${index + 1} của bài viết trong cửa sổ bảy ngày.</p>`,
    }),
  );
}

describe("parseGoogleNewsFeed", () => {
  test("keeps one article per item and drops Google's publisher-name suffix", () => {
    const posts = parseGoogleNewsFeed(
      googleFeed([
        googleItem({
          title:
            "Hà Nội: Phát hiện nạn nhân tử vong trong vụ cháy tại Trường THCS Kim Liên - Báo VietNamNet",
          guid: "CBMikwFBVV95cUxPbjByd0lhOWxM",
          publisher: "Báo VietNamNet",
        }),
      ]),
      GOOGLE,
    );

    expect(posts).toHaveLength(1);
    const post = posts[0]!;
    expect(post.source).toBe("google-news");
    expect(post.title).toBe(
      "Hà Nội: Phát hiện nạn nhân tử vong trong vụ cháy tại Trường THCS Kim Liên",
    );
    expect(post.evidenceType).toBe("news");
    // Attribution is the publisher Google names, not a decoded article URL.
    expect(post.publisher).toBe("Báo VietNamNet");
    expect(post.permalink).toBe(
      "https://news.google.com/rss/articles/CBMikwFBVV95cUxPbjByd0lhOWxM?oc=5",
    );
    expect(post.uri).toBe("CBMikwFBVV95cUxPbjByd0lhOWxM");
    // A headline has no author and no measured engagement.
    expect(post.authorId).toBeNull();
    expect(post.authorHandle).toBeNull();
    expect(post.engagement).toBeNull();
    expect(post.kind).toBe("link");
    expect(post.media).toEqual([]);
  });

  test("preserves the real publication instant and does not call it activity", () => {
    const post = parseGoogleNewsFeed(
      googleFeed([googleItem({ title: "Giá xăng giảm mạnh", guid: "CBMiAAA1" })]),
      GOOGLE,
    )[0]!;

    expect(post.timeKind).toBe("published");
    // The feed's own timestamp survives verbatim rather than becoming "now".
    expect(post.publishedAt).toBe("Thu, 05 Nov 2026 09:19:00 GMT");
    expect(Number.isFinite(Date.parse(post.publishedAt))).toBe(true);

    const undated = parseGoogleNewsFeed(
      googleFeed([googleItem({ title: "Tin chưa có giờ", guid: "CBMiAAA2", published: null })]),
      GOOGLE,
    )[0]!;
    expect(undated.publishedAt).toBe("");
  });

  test("never treats the related-headline block as this article's text or as another post", () => {
    const related =
      '<ol><li><a href="https://news.google.com/rss/articles/CBMiOTHER?oc=5">' +
      "Một tiêu đề liên quan khác - Báo Dân trí</a></li>" +
      '<li><a href="https://news.google.com/rss/articles/CBMiTHIRD?oc=5">' +
      "Tiêu đề thứ ba - VnExpress</a></li></ol>";

    const posts = parseGoogleNewsFeed(
      googleFeed([
        googleItem({
          title: "Đăng clip sai sự thật về doanh nghiệp bị xử phạt - Báo Dân trí",
          guid: "CBMiMAIN1",
          publisher: "Báo Dân trí",
          related,
        }),
      ]),
      GOOGLE,
    );

    // One item is one article; the related headlines are other coverage.
    expect(posts).toHaveLength(1);
    expect(posts[0]!.text).toBe("Đăng clip sai sự thật về doanh nghiệp bị xử phạt");
    expect(posts[0]!.text).not.toContain("Một tiêu đề liên quan khác");
    expect(posts[0]!.text).not.toContain("Xem thêm tiêu đề");
  });

  test("collapses the same publisher headline served twice under different ids", () => {
    const headline = "Cựu ủy viên Bộ Chính trị Trung Quốc bị truy tố - VnExpress";
    const posts = parseGoogleNewsFeed(
      googleFeed([
        googleItem({ title: headline, guid: "CBMiDUP1", publisher: "VnExpress" }),
        googleItem({ title: headline, guid: "CBMiDUP2", publisher: "VnExpress" }),
      ]),
      GOOGLE,
    );

    // Copied items must not inflate the number of independent articles.
    expect(posts).toHaveLength(1);
    expect(posts[0]!.uri).toBe("CBMiDUP1");
  });

  test("skips items whose link leaves Google's own HTTPS host", () => {
    const posts = parseGoogleNewsFeed(
      googleFeed([
        googleItem({
          title: "Bài ngoài miền",
          guid: "EXT1",
          link: "https://vietnamnet.vn/bai-viet",
        }),
        googleItem({
          title: "Bài không bảo mật",
          guid: "INSECURE1",
          link: "http://news.google.com/x",
        }),
        googleItem({ title: "Bài hợp lệ trên miền tin tức", guid: "OK1" }),
      ]),
      GOOGLE,
    );

    expect(posts.map((post) => post.uri)).toEqual(["OK1"]);
  });

  test("keeps the publisher null when the item names none", () => {
    const post = parseGoogleNewsFeed(
      googleFeed([
        googleItem({ title: "Tiêu đề không kèm nguồn", guid: "NOSRC1", publisher: null }),
      ]),
      GOOGLE,
    )[0]!;

    expect(post.publisher).toBeNull();
    expect(post.title).toBe("Tiêu đề không kèm nguồn");
  });

  test("clamps the requested limit to the per-cycle source cap", () => {
    const items = Array.from({ length: MAX_POSTS_PER_SOURCE + 5 }, (_, index) =>
      googleItem({ title: `Tiêu đề số ${index + 1}`, guid: `GUID${index + 1}` }),
    );

    expect(parseGoogleNewsFeed(googleFeed(items), GOOGLE, Number.MAX_SAFE_INTEGER)).toHaveLength(
      MAX_POSTS_PER_SOURCE,
    );
    expect(parseGoogleNewsFeed(googleFeed(items), GOOGLE, 0)).toEqual([]);
  });

  test("rejects a non-RSS document instead of reporting an empty result", () => {
    const consent = `<?xml version="1.0" encoding="utf-8"?><html><body>Vui lòng bật JavaScript</body></html>`;
    expect(() => parseGoogleNewsFeed(consent, GOOGLE)).toThrow();
  });
});

describe("parseNguoiVietPosts", () => {
  test("reads the publisher's own record with its real publication time and identity", () => {
    const posts = parseNguoiVietPosts([OLYMPIA_RECORD], NGUOI_VIET, 25, NOW);

    expect(posts).toHaveLength(1);
    const post = posts[0]!;
    expect(post.uri).toBe("3490787");
    expect(post.source).toBe("nguoi-viet");
    expect(post.evidenceType).toBe("news");
    expect(post.publisher).toBe("Người Việt");
    expect(post.title).toBe("Nam sinh chào kiểu phát xít trên Đài Truyền Hình Việt Nam");
    expect(post.permalink).toBe(
      "https://www.nguoi-viet.com/viet-nam/nam-sinh-chao-kieu-phat-xit-tren-dai-truyen-hinh-viet-nam/",
    );
    // `date_gmt` is UTC publication, preserved and labelled as such.
    expect(post.timeKind).toBe("published");
    expect(post.publishedAt).toBe("2026-11-01T19:56:12.000Z");
    expect(post.text).toContain("Đường Lên Đỉnh Olympia");
    // An article is not a community member.
    expect(post.authorId).toBeNull();
    expect(post.authorHandle).toBeNull();
    expect(post.engagement).toBeNull();
    expect(post.media).toEqual([]);
  });

  test("decodes HTML entities in the publisher title", () => {
    const post = parseNguoiVietPosts(
      [
        wpPost({
          id: 3491354,
          date_gmt: new Date(NOW - 3_600_000).toISOString().slice(0, 19),
          title: "Chia sẻ clip cặp đôi &#8216;ái ân&#8217; trên xe VF3 ở Sài Gòn",
          excerpt: "<p>Cảnh quay lan truyền trên mạng xã hội.</p>",
        }),
      ],
      NGUOI_VIET,
      25,
      NOW,
    );

    expect(post[0]!.title).toBe("Chia sẻ clip cặp đôi ‘ái ân’ trên xe VF3 ở Sài Gòn");
  });

  test("rejects records outside the seven-day window instead of inventing dates", () => {
    const tooOld = wpPost({
      id: 3000001,
      date_gmt: new Date(NOW - (NEWS_WINDOW_DAYS + 1) * DAY).toISOString().slice(0, 19),
      link: "https://www.nguoi-viet.com/viet-nam/qua-cu/",
      title: "Bài quá cũ",
    });
    const inFuture = wpPost({
      id: 3000002,
      date_gmt: new Date(NOW + 2 * DAY).toISOString().slice(0, 19),
      link: "https://www.nguoi-viet.com/viet-nam/tuong-lai/",
      title: "Bài ở tương lai",
    });
    const undated = wpPost({
      id: 3000003,
      date_gmt: null,
      link: "https://www.nguoi-viet.com/viet-nam/khong-ngay/",
    });
    const fresh = wpPost({
      id: 3000004,
      date_gmt: new Date(NOW - DAY).toISOString().slice(0, 19),
      link: "https://www.nguoi-viet.com/viet-nam/hom-qua/",
      title: "Bài trong cửa sổ",
    });

    const posts = parseNguoiVietPosts([tooOld, inFuture, undated, fresh], NGUOI_VIET, 25, NOW);
    expect(posts.map((post) => post.uri)).toEqual(["3000004"]);
  });

  test("samples the whole window within the budget instead of the newest slice", () => {
    const records = [...windowRecords(24), OLYMPIA_RECORD];
    // The incident report is the oldest record; a newest-25 truncation cannot see it.
    const limit = 10;

    const first = parseNguoiVietPosts(records, NGUOI_VIET, limit, NOW);
    // The stride never spends more than the budget, and never returns nothing.
    expect(first.length).toBeGreaterThan(1);
    expect(first.length).toBeLessThanOrEqual(limit);
    expect(first.length).toBeLessThanOrEqual(MAX_POSTS_PER_SOURCE);
    // The newest record is always collected.
    expect(first[0]!.uri).toBe("3000000");

    // Successive collection cycles rotate the stride, so every record in the
    // window is reachable without any event keyword.
    const seen = new Set<string>();
    for (let cycle = 0; cycle < 10; cycle += 1) {
      for (const post of parseNguoiVietPosts(records, NGUOI_VIET, limit, NOW + cycle * 600_000)) {
        seen.add(post.uri);
      }
    }
    expect(seen.has("3490787")).toBe(true);
    expect(seen.size).toBe(records.length);
  });

  test("keeps publication order and stays inside the budget on a short window", () => {
    const records = windowRecords(6);
    const posts = parseNguoiVietPosts(records, NGUOI_VIET, 25, NOW);

    expect(posts).toHaveLength(6);
    expect(posts.map((post) => post.uri)).toEqual(records.map((record) => String(record.id)));
  });

  test("drops duplicate ids and records without a usable permalink", () => {
    const fresh = { date_gmt: new Date(NOW - 3_600_000).toISOString().slice(0, 19) };
    const posts = parseNguoiVietPosts(
      [
        wpPost({ id: 3490901, ...fresh, link: "https://www.nguoi-viet.com/viet-nam/mot/" }),
        wpPost({ id: 3490901, ...fresh, link: "https://www.nguoi-viet.com/viet-nam/mot-lan-nua/" }),
        wpPost({
          id: 3490902,
          ...fresh,
          link: "http://www.nguoi-viet.com/viet-nam/khong-bao-mat/",
        }),
        wpPost({ id: 3490903, ...fresh, link: "https://vnexpress.net/bai-cua-bao-khac/" }),
        wpPost({
          id: "không-phải-số",
          ...fresh,
          link: "https://www.nguoi-viet.com/viet-nam/ma-la/",
        }),
      ],
      NGUOI_VIET,
      25,
      NOW,
    );

    expect(posts.map((post) => post.uri)).toEqual(["3490901"]);
    expect(posts[0]!.permalink).toBe("https://www.nguoi-viet.com/viet-nam/mot/");
  });

  test("returns nothing when the caller asks for no records", () => {
    expect(parseNguoiVietPosts([OLYMPIA_RECORD], NGUOI_VIET, 0, NOW)).toEqual([]);
  });

  test("rejects a non-list payload instead of rendering it as an empty feed", () => {
    expect(() => parseNguoiVietPosts({ code: "rest_forbidden" }, NGUOI_VIET, 25, NOW)).toThrow();
  });
});

describe("fetchPublicFeed news dispatch", () => {
  let server: Bun.Server<undefined> | undefined;
  let origin = "";

  beforeAll(() => {
    server = Bun.serve({
      port: 0,
      idleTimeout: 10,
      fetch(request) {
        const url = new URL(request.url);
        if (url.pathname === "/wp-json/wp/v2/categories") {
          // The adapter resolves the section by slug, not by a hardcoded id.
          return Response.json([{ id: 66, slug: url.searchParams.get("slug") }]);
        }
        if (url.pathname === "/wp-json/wp/v2/posts") {
          const categories = url.searchParams.get("categories");
          const after = url.searchParams.get("after");
          if (categories !== "66" || !after) {
            return Response.json({ code: "rest_invalid_param" }, { status: 400 });
          }
          // Dispatch is what this test asserts, so the fixture is dated off the
          // live clock and its permalinks stay on the serving host (an evidence
          // link must be HTTPS on the adapter's own host, or it is rejected).
          const liveNow = Date.now();
          const linkBase = `https://${url.host}/viet-nam`;
          return Response.json([
            ...windowRecords(3, liveNow, linkBase),
            wpPost({
              id: 3490787,
              date_gmt: new Date(liveNow - 4 * 86_400_000).toISOString().slice(0, 19),
              link: `${linkBase}/nam-sinh-chao-kieu-phat-xit/`,
              title: "Nam sinh chào kiểu phát xít trên Đài Truyền Hình Việt Nam",
            }),
          ]);
        }
        if (url.pathname === "/news.rss") {
          return new Response(
            googleFeed([
              googleItem({
                title: "Hai người ở Huế bị mời làm việc vì đăng ảnh nhạy cảm - VnExpress",
                guid: "CBMiHUE1",
                // Evidence links must be HTTPS on the feed's own host, exactly
                // as Google serves them on `news.google.com`.
                link: `https://${url.host}/rss/articles/CBMiHUE1?oc=5`,
                publisher: "VnExpress",
                publisherUrl: "https://vnexpress.net",
                published: "Thu, 05 Nov 2026 08:38:50 GMT",
              }),
            ]),
            { headers: { "content-type": "application/xml" } },
          );
        }
        return new Response("không tìm thấy", { status: 404 });
      },
    });
    origin = `http://127.0.0.1:${server.port}`;
  });

  afterAll(async () => {
    await server?.stop(true);
  });

  test("dispatches a news segment to the news adapter, not the forum parser", async () => {
    const newsSegment: ViewerSegment = { ...GOOGLE, feedUrl: `${origin}/news.rss` };
    const result = await fetchPublicFeed(newsSegment, 5);
    const posts = result.posts;

    expect(result.errors).toEqual([]);
    expect(posts).toHaveLength(1);
    expect(posts[0]!.evidenceType).toBe("news");
    expect(posts[0]!.title).toBe("Hai người ở Huế bị mời làm việc vì đăng ảnh nhạy cảm");
    expect(posts[0]!.publisher).toBe("VnExpress");
    expect(posts[0]!.timeKind).toBe("published");
    expect(posts[0]!.permalink).toContain("/rss/articles/CBMiHUE1");
  });

  test("reads the publisher window through the resolved section id", async () => {
    const result = await fetchPublicFeed(
      { ...NGUOI_VIET, feedUrl: `${origin}/wp-json/wp/v2/posts` },
      25,
    );

    expect(result.errors).toEqual([]);
    expect(result.posts.map((post) => post.uri)).toContain("3490787");
    expect(result.posts.every((post) => post.publisher === "Người Việt")).toBe(true);
  });

  test("refuses a feed URL that is not the posts endpoint instead of guessing one", async () => {
    const broken: ViewerSegment = { ...NGUOI_VIET, feedUrl: `${origin}/wp-json/wp/v2` };
    const outcome = await fetchPublicFeed(broken, 5).catch((error: unknown) => error);

    // A provider with no readable document at all is unavailable, not empty.
    expect(outcome).toBeInstanceOf(Error);
    expect(String(outcome)).toContain("posts endpoint");
  });

  test("keeps the forum parser on the discussion contract", () => {
    // The shared dispatch must not change forum semantics for the same catalog.
    const xml =
      `<?xml version="1.0" encoding="utf-8"?>` +
      `<rss version="2.0" xmlns:slash="http://purl.org/rss/1.0/modules/slash/"><channel>` +
      `<title>VOZ</title><link>https://voz.vn/</link>` +
      `<item><title>Chủ đề mới</title><link>https://voz.vn/t/chu-de.100/</link>` +
      `<guid isPermaLink="false">urn:xenforo:thread:100.0</guid>` +
      `<pubDate>Tue, 03 Nov 2026 09:15:00 +0000</pubDate>` +
      `<slash:comments>4</slash:comments>` +
      `<description><![CDATA[<p>Nội dung bài viết đầu tiên.</p>]]></description></item>` +
      `</channel></rss>`;

    const post = parsePublicFeed(xml, VOZ)[0]!;
    expect(post.evidenceType).toBe("discussion");
    expect(post.timeKind).toBe("activity");
    expect(post.publisher).toBeNull();
    expect(post.title).toBe("Chủ đề mới");
  });
});

describe("requestBounded", () => {
  let server: Bun.Server<undefined> | undefined;
  let origin = "";

  beforeAll(() => {
    server = Bun.serve({
      port: 0,
      idleTimeout: 10,
      fetch(request) {
        const url = new URL(request.url);
        if (url.pathname === "/oversized.json") {
          return new Response(
            new ReadableStream({
              start(controller) {
                const chunk = new Uint8Array(64 * 1024).fill(0x20);
                for (let index = 0; index < 64; index += 1) controller.enqueue(chunk);
                controller.close();
              },
            }),
            { headers: { "content-type": "application/json" } },
          );
        }
        if (url.pathname === "/teapot") return new Response("không", { status: 418 });
        return new Response("[]", { headers: { "content-type": "application/json" } });
      },
    });
    origin = `http://127.0.0.1:${server.port}`;
  });

  afterAll(async () => {
    await server?.stop(true);
  });

  test("aborts a streamed body past the 1 MB cap instead of buffering it", async () => {
    const outcome = await requestBounded(`${origin}/oversized.json`, new Headers()).catch(
      (error: unknown) => error,
    );

    expect(outcome).toBeInstanceOf(Error);
    expect(String(outcome)).toContain(`${MAX_RESPONSE_BYTES / 1_000_000} MB`);
  });

  test("reports a non-2xx status to the caller rather than an empty document", async () => {
    const response = await requestBounded(`${origin}/teapot`, new Headers());
    expect(response.status).toBe(418);
    expect(response.body).toBe("");
  });
});
