import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { fetchPublicFeed, parsePublicFeed } from "../server/social/feeds.ts";
import { MAX_MEDIA_ITEMS, MAX_POSTS_PER_SOURCE } from "../server/social/input.ts";
import { VIEWER_SEGMENTS } from "../shared/segments.ts";
import type { ViewerSegment } from "../shared/types.ts";

/**
 * The two Vietnamese forums are read from their public XenForo RSS feeds, and
 * everything stored or rendered comes from these records. These tests pin the
 * readings that are easy to break and expensive to notice: native thread
 * identity survives tracking links, feed dates stay "activity" timestamps,
 * quoted/script/style junk never becomes post text, third-party images are not
 * adopted, and unmeasured counters stay absent instead of becoming zeros.
 *
 * Fixtures are minimal but keep the namespaced elements (`dc:`, `slash:`,
 * `content:`) the shipped feeds use, so a namespace regression fails here
 * rather than at runtime.
 */

const VOZ: ViewerSegment = VIEWER_SEGMENTS.find((segment) => segment.source === "voz")!;
const OTOFUN: ViewerSegment = VIEWER_SEGMENTS.find((segment) => segment.source === "otofun")!;

/** Fixed feed timestamp; assertions must not depend on the wall clock. */
const ACTIVITY_AT = "Tue, 03 Nov 2026 09:15:00 +0000";

interface ItemFields {
  title?: string;
  /** `null` omits the element entirely. */
  link?: string | null;
  guid?: string | null;
  published?: string | null;
  creator?: string | null;
  author?: string | null;
  description?: string | null;
  content?: string | null;
  replies?: string | number | null;
}

/** Escape text nodes the way XenForo does: only the XML metacharacters. */
const xmlText = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

function rssItem(fields: ItemFields = {}): string {
  const nodes: string[] = [`<title>${xmlText(fields.title ?? "Chủ đề thảo luận")}</title>`];
  if (fields.link !== null) {
    nodes.push(`<link>${xmlText(fields.link ?? "https://voz.vn/t/chu-de.100/")}</link>`);
  }
  if (fields.guid !== null) {
    nodes.push(
      `<guid isPermaLink="false">${xmlText(fields.guid ?? "urn:xenforo:thread:100.0")}</guid>`,
    );
  }
  if (fields.published !== null) {
    nodes.push(`<pubDate>${xmlText(fields.published ?? ACTIVITY_AT)}</pubDate>`);
  }
  if (fields.creator != null) nodes.push(`<dc:creator>${xmlText(fields.creator)}</dc:creator>`);
  if (fields.author != null) nodes.push(`<author>${xmlText(fields.author)}</author>`);
  if (fields.replies != null) nodes.push(`<slash:comments>${fields.replies}</slash:comments>`);
  if (fields.content != null)
    nodes.push(`<content:encoded><![CDATA[${fields.content}]]></content:encoded>`);
  if (fields.description != null)
    nodes.push(`<description><![CDATA[${fields.description}]]></description>`);
  return `<item>${nodes.join("")}</item>`;
}

interface Channel {
  title: string;
  link: string;
}

const VOZ_CHANNEL: Channel = { title: "VOZ - Diễn đàn", link: "https://voz.vn/" };
const OTOFUN_CHANNEL: Channel = {
  title: "Otofun - Diễn đàn ô tô",
  link: "https://www.otofun.net.vn/",
};

function rssFeed(items: string[], channel: Channel = VOZ_CHANNEL): string {
  return [
    `<?xml version="1.0" encoding="utf-8"?>`,
    `<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"` +
      ` xmlns:dc="http://purl.org/dc/elements/1.1/"` +
      ` xmlns:slash="http://purl.org/rss/1.0/modules/slash/">`,
    `<channel>`,
    `<title>${xmlText(channel.title)}</title>`,
    `<link>${channel.link}</link>`,
    `<description>${xmlText("Bài viết mới trong diễn đàn")}</description>`,
    ...items,
    `</channel>`,
    `</rss>`,
  ].join("");
}

describe("parsePublicFeed - VOZ", () => {
  test("keeps the native thread identity and permalink while stripping tracking", () => {
    const xml = rssFeed([
      rssItem({
        title: "Chuyến đi Đà Lạt mùa mưa",
        link: "https://voz.vn/t/chuyen-di-da-lat.100/?utm_source=rss&utm_medium=feed",
        guid: "urn:xenforo:thread:100.0",
        published: ACTIVITY_AT,
        creator: "Nguyễn Văn An",
        replies: 7,
        description:
          "<p>Cả nhà mình vừa đi Đà Lạt về, trời mưa suốt ba ngày nhưng vẫn rất vui.</p>",
      }),
    ]);

    const posts = parsePublicFeed(xml, VOZ);

    expect(posts).toHaveLength(1);
    const post = posts[0]!;
    expect(post.source).toBe("voz");
    expect(post.uri).toBe("urn:xenforo:thread:100.0");
    expect(post.permalink).toBe("https://voz.vn/t/chuyen-di-da-lat.100/");
    expect(post.permalink).not.toContain("utm_");
    expect(post.authorId).toBe("Nguyễn Văn An");
    expect(post.authorHandle).toBe("Nguyễn Văn An");
    expect(post.text).toContain("Chuyến đi Đà Lạt mùa mưa");
    expect(post.text).toContain("Cả nhà mình vừa đi Đà Lạt về");
  });

  test("collapses repeated sightings of the same native GUID into one post", () => {
    const posts = parsePublicFeed(
      rssFeed([
        rssItem({
          guid: "urn:xenforo:thread:100.0",
          link: "https://voz.vn/t/chu-de.100/?utm_source=rss",
        }),
        rssItem({
          guid: "urn:xenforo:thread:100.0",
          link: "https://voz.vn/t/chu-de.100/?fbclid=abc123",
        }),
      ]),
      VOZ,
    );

    expect(posts).toHaveLength(1);
    expect(posts[0]!.uri).toBe("urn:xenforo:thread:100.0");
  });

  test("uses the canonical permalink as identity only when the native GUID is absent", () => {
    const posts = parsePublicFeed(
      rssFeed([rssItem({ guid: null, link: "https://voz.vn/t/chu-de-khac.200/?utm_source=rss" })]),
      VOZ,
    );

    expect(posts[0]!.uri).toBe("https://voz.vn/t/chu-de-khac.200/");
    expect(posts[0]!.uri).toBe(posts[0]!.permalink);
  });

  test("reports the feed date as activity time and never fabricates publication", () => {
    const dated = parsePublicFeed(rssFeed([rssItem({ published: ACTIVITY_AT })]), VOZ)[0]!;
    expect(dated.timeKind).toBe("activity");
    // The feed's own timestamp is preserved verbatim and stays parseable; it is
    // not re-stamped as "now" nor relabelled as an original publication time.
    expect(dated.publishedAt).toBe(ACTIVITY_AT);
    expect(Number.isNaN(Date.parse(dated.publishedAt))).toBe(false);

    const undated = parsePublicFeed(rssFeed([rssItem({ published: null })]), VOZ)[0]!;
    expect(undated.timeKind).toBe("activity");
    expect(undated.publishedAt).toBe("");
  });

  test("records the real reply count without inventing likes, shares or quotes", () => {
    const replied = parsePublicFeed(rssFeed([rssItem({ replies: 7 })]), VOZ)[0]!;
    expect(replied.engagement).not.toBeNull();
    expect(replied.engagement!.replies).toBe(7);
    expect(replied.engagement!.likes).toBeUndefined();
    expect(replied.engagement!.reposts).toBeUndefined();
    expect(replied.engagement!.quotes).toBeUndefined();
    expect(Number.isNaN(Date.parse(replied.engagement!.capturedAt))).toBe(false);

    const unmeasured = parsePublicFeed(rssFeed([rssItem()]), VOZ)[0]!;
    expect(unmeasured.engagement).toBeNull();

    const unparsable = parsePublicFeed(rssFeed([rssItem({ replies: "không rõ" })]), VOZ)[0]!;
    expect(unparsable.engagement).toBeNull();
  });

  test("keeps only the visible first post, excluding quotes, scripts and styles", () => {
    const posts = parsePublicFeed(
      rssFeed([
        rssItem({
          title: "Hỏi đường đi Sa Pa",
          description:
            "<p>Mở đầu câu chuyện về chuyến đi Sa Pa.</p>" +
            '<blockquote class="quote"><p>Trích dẫn cũ của người khác</p></blockquote>' +
            "<script>alert('hacked')</script>" +
            "<style>.an{color:red}</style>" +
            "<p>Kết thúc câu chuyện ở Sa Pa.</p>",
        }),
      ]),
      VOZ,
    );

    const text = posts[0]!.text;
    expect(text).toContain("Mở đầu câu chuyện về chuyến đi Sa Pa.");
    expect(text).toContain("Kết thúc câu chuyện ở Sa Pa.");
    expect(text).not.toContain("Trích dẫn cũ của người khác");
    expect(text).not.toContain("hacked");
    expect(text).not.toContain("color:red");
  });

  test("prefers the full content:encoded body over the short description", () => {
    const posts = parsePublicFeed(
      rssFeed([
        rssItem({
          title: "Kinh nghiệm mua xe cũ",
          description: "<p>Đoạn mô tả rút gọn.</p>",
          content: "<p>Toàn bộ bài viết đầu tiên về kinh nghiệm mua xe cũ.</p>",
        }),
      ]),
      VOZ,
    );

    expect(posts[0]!.text).toContain("Toàn bộ bài viết đầu tiên về kinh nghiệm mua xe cũ.");
    expect(posts[0]!.text).not.toContain("Đoạn mô tả rút gọn.");
  });

  test("collects only source-hosted HTTPS attachments, deduplicated and capped", () => {
    const posts = parsePublicFeed(
      rssFeed([
        rssItem({
          description:
            "<p>Ảnh chuyến đi.</p>" +
            '<img src="https://voz.vn/data/attachments/1/a.jpg"/>' +
            '<img src="https://voz.vn/data/attachments/1/a.jpg"/>' +
            '<img src="https://cdn.voz.vn/data/attachments/2/b.png"/>' +
            '<img src="https://voz.vn/data/avatars/l/1/1.jpg"/>' +
            '<img src="https://voz.vn/styles/smilies/smile.gif"/>' +
            '<img src="http://voz.vn/data/attachments/3/c.jpg"/>' +
            '<img src="https://images.example.net/data/attachments/4/d.jpg"/>' +
            '<img src="https://voz.vn/data/attachments/3/c.jpg"/>' +
            '<img src="https://voz.vn/data/attachments/4/d.jpg"/>' +
            '<img src="https://voz.vn/data/attachments/5/e.jpg"/>',
        }),
      ]),
      VOZ,
    );

    const post = posts[0]!;
    expect(post.media).toHaveLength(MAX_MEDIA_ITEMS);
    expect(post.media.map((item) => item.url)).toEqual([
      "https://voz.vn/data/attachments/1/a.jpg",
      "https://cdn.voz.vn/data/attachments/2/b.png",
      "https://voz.vn/data/attachments/3/c.jpg",
      "https://voz.vn/data/attachments/4/d.jpg",
    ]);
    expect(post.media.every((item) => item.kind === "image")).toBe(true);
    expect(post.kind).toBe("image");

    const textOnly = parsePublicFeed(
      rssFeed([rssItem({ description: "<p>Không có ảnh.</p>" })]),
      VOZ,
    )[0]!;
    expect(textOnly.media).toEqual([]);
    expect(textOnly.kind).toBe("text");
  });

  test("uses the forum creator name and ignores the RSS reply email", () => {
    const post = parsePublicFeed(
      rssFeed([rssItem({ creator: "Trần Thị Bích", author: "noreply@voz.vn (Nguyễn Văn An)" })]),
      VOZ,
    )[0]!;

    expect(post.authorId).toBe("Trần Thị Bích");
    expect(post.authorHandle).toBe("Trần Thị Bích");
    expect(post.authorId).not.toContain("@");
  });

  test("takes the name from the author element but never stores its address", () => {
    const named = parsePublicFeed(
      rssFeed([rssItem({ author: "noreply@voz.vn (Lê Minh Châu)" })]),
      VOZ,
    )[0]!;
    expect(named.authorId).toBe("Lê Minh Châu");

    const anonymous = parsePublicFeed(rssFeed([rssItem({ author: "noreply@voz.vn" })]), VOZ)[0]!;
    expect(anonymous.authorId).toBeNull();
    expect(anonymous.authorHandle).toBeNull();
  });

  test("decodes entities and normalises Vietnamese Unicode to NFC", () => {
    const decomposed = "To\u0302i \u0111i cho\u031b\u0323 sa\u0301ng nay";
    const posts = parsePublicFeed(
      rssFeed([
        rssItem({
          title: "Giá vàng & đô la",
          creator: "Nguyễn Văn An",
          description: `<p>Th&#7883; tr&#432;&#7901;ng v&#224;ng h&#244;m nay t&#259;ng gi&#225;.</p><p>${decomposed}</p>`,
        }),
      ])
        .replace("Giá vàng", "Gi&#225; v&#224;ng")
        .replace("Nguyễn Văn An", "Nguy&#7877;n V&#259;n An"),
      VOZ,
    );

    const text = posts[0]!.text;
    expect(text).toContain("Giá vàng & đô la");
    expect(text).toContain("Thị trường vàng hôm nay tăng giá.");
    expect(text).toContain("Tôi đi chợ sáng nay");
    expect(posts[0]!.authorHandle).toBe("Nguyễn Văn An");
    expect(text).toBe(text.normalize("NFC"));
  });

  test("preserves character references quoted as literal text", () => {
    const posts = parsePublicFeed(
      rssFeed([
        rssItem({
          title: "Cách viết &#225; trong HTML.",
          description: "<p>Cách viết &amp;#225; trong HTML.</p>",
        }),
      ]),
      VOZ,
    );
    expect(posts[0]!.text).toBe("Cách viết &#225; trong HTML.");
  });

  test("does not repeat the thread title when the body already starts with it", () => {
    const posts = parsePublicFeed(
      rssFeed([
        rssItem({
          title: "Chuyện ở quê",
          description: "<p>Chuyện ở quê hôm qua có đám cưới của anh hàng xóm.</p>",
        }),
      ]),
      VOZ,
    );

    expect(posts[0]!.text).toBe("Chuyện ở quê hôm qua có đám cưới của anh hàng xóm.");
  });

  test("skips entries whose permalink is not HTTPS on the forum's own host", () => {
    const posts = parsePublicFeed(
      rssFeed([
        rssItem({ link: "http://voz.vn/t/khong-bao-mat.1/", guid: "urn:xenforo:thread:1.0" }),
        rssItem({ link: "https://otofun.net.vn/t/lan-sang.2/", guid: "urn:xenforo:thread:2.0" }),
        rssItem({ link: "https://voz.vn/t/hop-le.3/", guid: "urn:xenforo:thread:3.0" }),
      ]),
      VOZ,
    );

    expect(posts.map((post) => post.uri)).toEqual(["urn:xenforo:thread:3.0"]);
  });

  test("rejects a linkless entry rather than linking to the feed itself", () => {
    const posts = parsePublicFeed(
      rssFeed([
        rssItem({
          link: null,
          guid: "urn:xenforo:thread:404.0",
          description: "<p>Nội dung mồ côi.</p>",
        }),
      ]),
      VOZ,
    );

    expect(posts).toEqual([]);
  });

  test("allows declarations quoted inside CDATA without accepting an actual DTD", () => {
    const posts = parsePublicFeed(
      rssFeed([
        rssItem({
          title: "Chia sẻ mã HTML",
          description: "<p>Tôi dán đoạn mã sau:</p><pre><!DOCTYPE html></pre>",
        }),
      ]),
      VOZ,
    );

    expect(posts).toHaveLength(1);
    expect(posts[0]!.text).toContain("Tôi dán đoạn mã sau:");
  });
});

describe("parsePublicFeed - Otofun", () => {
  test("parses its own host, source and attachment host", () => {
    const posts = parsePublicFeed(
      rssFeed(
        [
          rssItem({
            title: "Xe gia đình nên chọn loại nào",
            link: "https://www.otofun.net.vn/threads/xe-gia-dinh.55/?utm_source=rss",
            guid: "urn:xenforo:thread:55.0",
            published: ACTIVITY_AT,
            creator: "Phạm Quốc Hưng",
            description:
              "<p>Gia đình bốn người đang cân nhắc giữa sedan và SUV.</p>" +
              '<img src="https://cdn.otofun.net.vn/data/attachments/9/xe.jpg"/>',
          }),
        ],
        OTOFUN_CHANNEL,
      ),
      OTOFUN,
    );

    expect(posts).toHaveLength(1);
    const post = posts[0]!;
    expect(post.source).toBe("otofun");
    expect(post.uri).toBe("urn:xenforo:thread:55.0");
    expect(post.permalink).toBe("https://www.otofun.net.vn/threads/xe-gia-dinh.55/");
    expect(post.authorId).toBe("Phạm Quốc Hưng");
    expect(post.media).toEqual([
      { kind: "image", url: "https://cdn.otofun.net.vn/data/attachments/9/xe.jpg" },
    ]);
    expect(post.engagement).toBeNull();
    expect(post.timeKind).toBe("activity");

    const withReplies = parsePublicFeed(
      rssFeed(
        [
          rssItem({
            link: "https://www.otofun.net.vn/threads/xe-gia-dinh.56/",
            guid: "urn:xenforo:thread:56.0",
            replies: 23,
          }),
        ],
        OTOFUN_CHANNEL,
      ),
      OTOFUN,
    )[0]!;
    expect(withReplies.engagement!.replies).toBe(23);
    expect(withReplies.engagement!.likes).toBeUndefined();
  });

  test("rejects an item pointed at the other forum's host", () => {
    const posts = parsePublicFeed(
      rssFeed([
        rssItem({ link: "https://voz.vn/t/lan-sang.77/", guid: "urn:xenforo:thread:77.0" }),
      ]),
      OTOFUN,
    );

    expect(posts).toEqual([]);
  });
});

describe("parsePublicFeed - empty versus unreadable feeds", () => {
  test("returns no posts for a well-formed but empty channel", () => {
    expect(parsePublicFeed(rssFeed([]), VOZ)).toEqual([]);
  });

  test("throws on malformed XML instead of quietly returning an empty feed", () => {
    const malformed = `<rss version="2.0"><channel><title>VOZ</title><item><title>x</title></channel></rss>`;
    expect(() => parsePublicFeed(malformed, VOZ)).toThrow();
  });

  test("throws when the response is not an RSS channel", () => {
    const html = `<?xml version="1.0" encoding="utf-8"?><html><body>Vui lòng bật JavaScript</body></html>`;
    expect(() => parsePublicFeed(html, VOZ)).toThrow();
  });

  test("refuses DTD and entity declarations before parsing untrusted markup", () => {
    const feed = rssFeed([rssItem()]);
    const dtd = feed.replace("<rss", '<!DOCTYPE rss SYSTEM "http://voz.vn/rss.dtd"><rss');
    expect(() => parsePublicFeed(dtd, VOZ)).toThrow();

    const entity = feed.replace("<rss", '<!ENTITY xxe SYSTEM "file:///etc/passwd"><rss');
    expect(() => parsePublicFeed(entity, VOZ)).toThrow();
  });
});

describe("parsePublicFeed - limits", () => {
  test("clamps an oversized requested limit to the hard ceiling", () => {
    const items = Array.from({ length: MAX_POSTS_PER_SOURCE + 5 }, (_, index) =>
      rssItem({
        title: `Chủ đề số ${index + 1}`,
        link: `https://voz.vn/t/chu-de.${index + 1}/`,
        guid: `urn:xenforo:thread:${index + 1}.0`,
      }),
    );

    expect(parsePublicFeed(rssFeed(items), VOZ, Number.MAX_SAFE_INTEGER)).toHaveLength(
      MAX_POSTS_PER_SOURCE,
    );
  });

  test("applies the limit to accepted, deduplicated entries", () => {
    const xml = rssFeed([
      rssItem({ link: "http://voz.vn/t/khong-bao-mat.1/", guid: "urn:xenforo:thread:1.0" }),
      rssItem({ link: "https://voz.vn/t/trung.2/", guid: "urn:xenforo:thread:2.0" }),
      rssItem({ link: "https://voz.vn/t/trung.2/?utm_source=rss", guid: "urn:xenforo:thread:2.0" }),
      rssItem({ link: "https://voz.vn/t/ba.3/", guid: "urn:xenforo:thread:3.0" }),
      rssItem({ link: "https://voz.vn/t/bon.4/", guid: "urn:xenforo:thread:4.0" }),
    ]);

    const posts = parsePublicFeed(xml, VOZ, 2);
    expect(posts.map((post) => post.uri)).toEqual([
      "urn:xenforo:thread:2.0",
      "urn:xenforo:thread:3.0",
    ]);
  });

  test("returns nothing when the caller asks for no entries", () => {
    const xml = rssFeed([
      rssItem(),
      rssItem({ link: "https://voz.vn/t/hai.2/", guid: "urn:xenforo:thread:2.0" }),
    ]);
    expect(parsePublicFeed(xml, VOZ, 0)).toEqual([]);
  });
});

describe("fetchPublicFeed over HTTP", () => {
  const ETAG = '"voz-thread-1"';

  let server: Bun.Server<undefined> | undefined;
  let origin = "";
  let host = "";
  let threadHits = 0;
  let errorHits = 0;
  let oversizedHits = 0;
  let lastConditional: string | null = null;

  /** Fresh segment per call: the module caches validators by feedUrl. */
  const segmentFor = (pathname: string): ViewerSegment => ({
    id: "test",
    label: "Test feed",
    description: "Local feed",
    source: "voz",
    feedUrl: `${origin}${pathname}`,
  });

  beforeAll(() => {
    server = Bun.serve({
      port: 0,
      idleTimeout: 10,
      fetch(request) {
        const url = new URL(request.url);
        if (url.pathname === "/thread.rss") {
          threadHits += 1;
          lastConditional = request.headers.get("if-none-match");
          if (lastConditional === ETAG) return new Response(null, { status: 304 });
          const body =
            `<?xml version="1.0" encoding="utf-8"?><rss version="2.0"><channel>` +
            `<title>VOZ</title><link>https://voz.vn/</link>` +
            `<item><title>Chủ đề mới</title><link>https://${url.host}/t/chu-de.100/</link>` +
            `<guid isPermaLink="false">urn:xenforo:thread:100.0</guid>` +
            `<pubDate>${ACTIVITY_AT}</pubDate>` +
            `<description><![CDATA[<p>Nội dung bài viết đầu tiên.</p>]]></description></item>` +
            `</channel></rss>`;
          return new Response(body, {
            headers: { "content-type": "application/rss+xml", etag: ETAG },
          });
        }
        if (url.pathname === "/error.rss") {
          errorHits += 1;
          return new Response(rssFeed([rssItem({ link: `https://${url.host}/t/thread.1/` })]), {
            status: 503,
          });
        }
        if (url.pathname === "/oversized.rss") {
          oversizedHits += 1;
          return new Response(
            new ReadableStream({
              start(controller) {
                const encoder = new TextEncoder();
                controller.enqueue(encoder.encode("<rss><channel><title>VOZ</title>"));
                const chunk = new Uint8Array(64 * 1024).fill(0x20);
                for (let index = 0; index < 64; index += 1) controller.enqueue(chunk);
                controller.enqueue(encoder.encode("</channel></rss>"));
                controller.close();
              },
            }),
            { headers: { "content-type": "application/rss+xml" } },
          );
        }
        return new Response("không tìm thấy", { status: 404 });
      },
    });
    origin = `http://127.0.0.1:${server.port}`;
    host = `127.0.0.1:${server.port}`;
  });

  afterAll(async () => {
    await server?.stop(true);
  });

  test("revalidates with the stored ETag and treats 304 as unchanged, not as a fresh post", async () => {
    const segment = segmentFor("/thread.rss");

    const first = await fetchPublicFeed(segment, 5);
    expect(first).toHaveLength(1);
    expect(first[0]!.uri).toBe("urn:xenforo:thread:100.0");
    expect(first[0]!.permalink).toBe(`https://${host}/t/chu-de.100/`);
    expect(threadHits).toBe(1);
    expect(lastConditional).toBeNull();

    const second = await fetchPublicFeed(segment, 5);
    expect(second).toEqual([]);
    expect(threadHits).toBe(2);
    expect(lastConditional).toBe(ETAG);
  });

  test("surfaces a non-2xx response as a failure instead of an empty feed", async () => {
    const outcome = await fetchPublicFeed(segmentFor("/error.rss")).catch(
      (error: unknown) => error,
    );
    expect(outcome).toBeInstanceOf(Error);
    expect(errorHits).toBe(1);
  });

  test("aborts an oversized streamed body instead of buffering it whole", async () => {
    const outcome = await fetchPublicFeed(segmentFor("/oversized.rss")).catch(
      (error: unknown) => error,
    );
    expect(outcome).toBeInstanceOf(Error);
    expect(oversizedHits).toBe(1);
  });
});
