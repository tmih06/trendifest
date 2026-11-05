import { EntityDecoder, XML } from "@nodable/entities";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { Parser } from "htmlparser2";
import type { SocialSource, ViewerSegment } from "../../shared/types.ts";
import { MAX_POSTS_PER_SOURCE, normalizeText, type SourcePost } from "./input.ts";

/**
 * Bounded public Vietnamese news discovery, plus the HTTP/XML readers every
 * adapter shares.
 *
 * News is separate evidence, never community reaction: a headline is one
 * publisher's article with no author, no likes and no reply count. These sources
 * here are public, unauthenticated endpoints read with a hard response cap, a
 * hard timeout and no retries, logins or challenge bypass:
 *
 * - `https://news.google.com/rss?hl=vi&gl=VN&ceid=VN%3Avi` is a general
 *   front-page feed (no query). It only carries roughly the last day of items,
 *   and each description lists *related* publisher headlines; those are other
 *   articles, so only the item's own headline is evidence. Its links are Google
 *   redirect URLs and its `<source>` label is the publisher name; neither is
 *   decoded into a canonical publisher URL here, so the label is reported as
 *   given instead of being "verified" against an article we did not open.
 * - `https://www.nguoi-viet.com/wp-json/wp/v2/posts` is the publisher's own
 *   WordPress REST API. Its Vietnam section ("viet-nam", category resolved by
 *   slug once per process) held 38 records across seven days when measured, so
 *   the newest-20 slice of the unfiltered feed misses a report only four days
 *   old. One bounded request reads the newest `NGUOI_VIET_PAGE_SIZE` records of
 *   the seven-day window and the per-cycle budget is spread across the whole
 *   window with a rotating stride, so an older report stays reachable without
 *   any event keyword. A window longer than one page is a known coverage gap
 *   rather than a silently complete result; no paging loop is attempted.
 * - VnExpress, Tuổi Trẻ, Thanh Niên and Dân Trí each publish one official RSS
 *   document per section. Every catalog here was read live before it was
 *   enabled (53 documents, 2,564 distinct articles inside seven days, measured
 *   2026-11-05T15:00Z) and each provider is one collection context: the primary
 *   document plus its declared sections are read with at most
 *   `PROVIDER_FEED_CONCURRENCY` requests in flight, then merged by canonical
 *   article link. A section that fails degrades to a labelled error line while
 *   the other sections' real articles are still collected. VietnamNet is not
 *   in the catalog: its section feeds exceed the 1 MB body cap, its `/rss/home`
 *   and `/rss/tin-moi-nhat` documents are 404, and the one small document
 *   (`cong-nghe`) had no article inside the window.
 */

/** Hard cap on any public response body; a larger body is aborted, not buffered whole. */
export const MAX_RESPONSE_BYTES = 1_000_000;
/** One bounded attempt per source per cycle; no hidden retry of any kind. */
export const REQUEST_TIMEOUT_MS = 15_000;
/** Generic discovery window, aligned with the default seven-day map window. */
export const NEWS_WINDOW_DAYS = 7;
/** Identifies the collector to the publishers it reads. */
export const PUBLIC_USER_AGENT = "Trendifest/0.1 (public-feed reader)";
/**
 * One provider issues this many simultaneous requests at most. Every catalog
 * document is a few tens of kilobytes, so the bound is about being a polite
 * reader of one publisher rather than about local memory.
 */
export const PROVIDER_FEED_CONCURRENCY = 2;
const NGUOI_VIET_PUBLISHER = "Người Việt";
const NGUOI_VIET_CATEGORY_SLUG = "viet-nam";
/** One request reads this many window records; older ones are not paged. */
const NGUOI_VIET_PAGE_SIZE = 50;
/** Vietnam Standard Time has no daylight saving; feed clocks without an offset are +07:00. */
const VIETNAM_OFFSET_MS = 7 * 3_600_000;

/** Section-feed publishers whose documents carry real articles and dates. */
export type PublisherSource = "vnexpress" | "tuoitre" | "thanhnien" | "dantri";

/**
 * How one publisher's documents spell a publication instant. VnExpress, Thanh
 * Niên and Dân Trí use RFC 822 offsets; Tuổi Trẻ prints a Vietnam wall clock
 * ("11/5/2026 9:15:00 PM") with no zone at all, so it is read as +07:00 rather
 * than as the machine's local time or as UTC.
 */
type PublisherDateStyle = "rfc822" | "vietnam-clock";

const PUBLISHERS: Record<PublisherSource, { publisher: string; dateStyle: PublisherDateStyle }> = {
  vnexpress: { publisher: "VnExpress", dateStyle: "rfc822" },
  tuoitre: { publisher: "Tuổi Trẻ", dateStyle: "vietnam-clock" },
  thanhnien: { publisher: "Thanh Niên", dateStyle: "rfc822" },
  dantri: { publisher: "Dân trí", dateStyle: "rfc822" },
};

/** Sources whose evidence is published articles, not community discussion. */
export function isNewsSource(source: SocialSource): boolean {
  return (
    source === "google-news" ||
    source === "nguoi-viet" ||
    source === "vnexpress" ||
    source === "tuoitre" ||
    source === "thanhnien" ||
    source === "dantri"
  );
}

/** True for the section-feed publishers, whose cycles merge several documents. */
export function isPublisherSource(source: SocialSource): source is PublisherSource {
  return Object.hasOwn(PUBLISHERS, source);
}

/** Narrow untrusted XML nodes instead of assuming a successful HTTP response is a feed. */
export function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Namespaced RSS elements can be strings or attribute-bearing #text objects. */
export function text(value: unknown): string {
  if (typeof value === "string") return value;
  const nested = object(value)["#text"];
  return typeof nested === "string" ? nested : "";
}

/** Strip tracking from evidence links while preserving the actual article identity. */
export function canonicalLink(value: string, base: string): string | null {
  if (!value.trim()) return null;
  try {
    const url = new URL(value, base);
    const host = new URL(base).hostname;
    if (url.protocol !== "https:" || url.hostname !== host) return null;
    // Snapshot only tracking keys: deleting while iterating skips adjacent parameters.
    const trackingKeys: string[] = [];
    for (const key of url.searchParams.keys()) {
      if (key.startsWith("utm_") || key === "fbclid" || key === "gclid") trackingKeys.push(key);
    }
    for (const key of trackingKeys) url.searchParams.delete(key);
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

/**
 * Read one RSS document defensively: declarations quoted inside CDATA or
 * comments are not a DTD, and a response that is not an RSS channel is an error
 * rather than an empty feed.
 */
export function parseRssChannel(xml: string): Record<string, unknown> {
  const declarations = xml.replace(/<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->/g, "");
  if (/<!DOCTYPE|<!ENTITY/i.test(declarations))
    throw new Error("Feed DTD/entity declarations are not accepted");
  if (XMLValidator.validate(xml) !== true) throw new Error("Source returned malformed XML");
  const parsed = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false,
    entityDecoder: new EntityDecoder({ namedEntities: XML, numericAllowed: true }),
  }).parse(xml) as unknown;
  const channel = object(object(object(parsed).rss).channel);
  if (!Object.hasOwn(channel, "title")) throw new Error("Source did not return an RSS channel");
  return channel;
}

/** A response with its body already bounded, or an error status/no-content marker. */
export interface PublicResponse {
  status: number;
  body: string;
  etag: string | null;
  lastModified: string | null;
}

/** Stop reading before an untrusted or unexpectedly large document fills memory. */
async function boundedText(response: Response): Promise<string> {
  if (Number(response.headers.get("content-length") ?? 0) > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new Error("Source exceeds the 1 MB input cap");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Source response has no body");
  const decoder = new TextDecoder();
  let bytes = 0;
  let result = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error("Source exceeds the 1 MB input cap");
      }
      result += decoder.decode(chunk.value, { stream: true });
    }
    return result + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

/**
 * The single bounded HTTP boundary for every adapter: one request, a 15 second
 * timeout, a 1 MB body cap, and the response's own cache validators so callers
 * can revalidate instead of re-reading an unchanged document.
 */
export async function requestBounded(url: string, headers: Headers): Promise<PublicResponse> {
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const etag = response.headers.get("etag");
  const lastModified = response.headers.get("last-modified");
  if (response.status === 304) {
    await response.body?.cancel();
    return { status: 304, body: "", etag, lastModified };
  }
  if (!response.ok) {
    await response.body?.cancel();
    return { status: response.status, body: "", etag, lastModified };
  }
  return { status: response.status, body: await boundedText(response), etag, lastModified };
}

/** Visible text of untrusted HTML: no tags, no script/style content, NFC. */
function htmlText(html: string): string {
  const parts: string[] = [];
  const skip: Record<string, true> = { script: true, style: true };
  let excluded = 0;
  const parser = new Parser(
    {
      onopentag(name) {
        if (Object.hasOwn(skip, name)) excluded += 1;
        if (!excluded) parts.push(" ");
      },
      ontext(value) {
        if (!excluded) parts.push(value);
      },
      onclosetag(name) {
        if (Object.hasOwn(skip, name)) excluded = Math.max(0, excluded - 1);
        if (!excluded) parts.push(" ");
      },
    },
    { decodeEntities: true },
  );
  parser.end(html);
  return normalizeText(parts.join(""));
}

/** One publisher headline, without the " - <publisher>" suffix Google appends. */
function stripPublisherSuffix(headline: string, publisher: string): string {
  if (!publisher) return headline;
  const suffix = ` - ${publisher}`;
  return headline.toLowerCase().endsWith(suffix.toLowerCase())
    ? headline.slice(0, headline.length - suffix.length).trim()
    : headline;
}

/**
 * Read the general Google News Vietnam front page. Every item is one article:
 * the description's related-headline list is other coverage, so it never becomes
 * post text or an extra post, and the item carries no author or engagement.
 */
export function parseGoogleNewsFeed(
  xml: string,
  segment: ViewerSegment,
  limit = MAX_POSTS_PER_SOURCE,
): SourcePost[] {
  const channel = parseRssChannel(xml);
  const rawItems =
    channel.item === undefined ? [] : Array.isArray(channel.item) ? channel.item : [channel.item];
  const cap = Math.min(MAX_POSTS_PER_SOURCE, Math.max(0, limit));
  const posts: SourcePost[] = [];
  const seenGuids = new Set<string>();
  const seenStories = new Set<string>();
  for (const raw of rawItems) {
    if (posts.length >= cap) break;
    const item = object(raw);
    const guid = text(item.guid).trim();
    const permalink = canonicalLink(text(item.link), segment.feedUrl);
    if (!guid || !permalink) continue;
    if (seenGuids.has(guid)) continue;
    const publisher = normalizeText(text(item.source)).slice(0, 120);
    const headline = stripPublisherSuffix(normalizeText(text(item.title)), publisher).slice(0, 180);
    if (!headline) continue;
    // The same publisher headline can surface twice under different Google ids.
    const story = `${publisher.toLowerCase()}\0${headline.toLowerCase()}`;
    if (seenStories.has(story)) continue;
    seenGuids.add(guid);
    seenStories.add(story);
    posts.push({
      source: segment.source,
      title: headline,
      evidenceType: "news",
      publisher: publisher || null,
      uri: guid,
      authorId: null,
      authorHandle: null,
      // A headline is the only text Google gives for this article; the related
      // headlines in its description are not this article's content.
      text: headline,
      kind: "link",
      permalink,
      publishedAt: text(item.pubDate),
      timeKind: "published",
      media: [],
      engagement: null,
    });
  }
  return posts;
}

/**
 * Spend the caller's per-cycle budget across the whole window instead of on the
 * newest slice alone, and rotate the sample position between cycles.
 *
 * A publisher that posted heavily in the last day would otherwise push every
 * older article out of reach, so a four-day-old report could never enter the map
 * even though the window is seven days wide. The newest record is always
 * collected; the rest of the budget walks the window at a fixed stride whose
 * start advances once per ten-minute collection cycle, so every record in the
 * window is collected within `stride` cycles (at most a few cycles of polling)
 * while each cycle stays inside the 25-record network budget. The offset is
 * derived from the clock, not from hidden module state, so a probe can reproduce
 * it. No event or keyword is ever targeted.
 */
function sampleAcrossWindow(records: SourcePost[], limit: number, now: number): SourcePost[] {
  if (records.length <= limit) return records;
  const rest = records.slice(1);
  const quota = limit - 1;
  if (quota <= 0) return [records[0]!];
  // ceil keeps the stride large enough that the quota never wraps twice, so a
  // window is fully covered after `stride` consecutive rotations.
  const stride = Math.max(1, Math.ceil(rest.length / quota));
  const offset = Math.floor(now / 600_000) % stride;
  const chosen = new Set<SourcePost>([records[0]!]);
  for (let index = offset; index < rest.length && chosen.size < limit; index += stride) {
    chosen.add(rest[index]!);
  }
  // Preserve the publisher's publication order, independent of sampling order.
  return records.filter((record) => chosen.has(record));
}

/** Parse the WordPress REST post list into publisher articles inside the window. */
export function parseNguoiVietPosts(
  value: unknown,
  segment: ViewerSegment,
  limit = MAX_POSTS_PER_SOURCE,
  now = Date.now(),
): SourcePost[] {
  if (!Array.isArray(value)) throw new Error(`${segment.label} API did not return a post list`);
  const cap = Math.min(MAX_POSTS_PER_SOURCE, Math.max(0, limit));
  if (cap === 0) return [];
  const since = now - NEWS_WINDOW_DAYS * 86_400_000;
  const seen = new Set<string>();
  const candidates: SourcePost[] = [];
  for (const raw of value) {
    const record = object(raw);
    const id = record.id;
    const uri =
      typeof id === "number" && Number.isSafeInteger(id) && id > 0
        ? String(id)
        : typeof id === "string" && /^\d+$/.test(id)
          ? id
          : "";
    if (!uri || seen.has(uri)) continue;
    const permalink = canonicalLink(
      typeof record.link === "string" ? record.link : "",
      segment.feedUrl,
    );
    if (!permalink) continue;
    const titleHtml = object(record.title).rendered;
    const excerptHtml = object(record.excerpt).rendered;
    const title = htmlText(typeof titleHtml === "string" ? titleHtml : "").slice(0, 180);
    const excerpt = htmlText(typeof excerptHtml === "string" ? excerptHtml : "");
    if (!title) continue;
    // WordPress `date_gmt` is the publication instant; a bare value is UTC.
    const rawDate = typeof record.date_gmt === "string" ? record.date_gmt.trim() : "";
    const published = rawDate
      ? Date.parse(/[zZ]$|[+-]\d\d:?\d\d$/.test(rawDate) ? rawDate : `${rawDate}Z`)
      : Number.NaN;
    if (!Number.isFinite(published) || published < since || published > now + 60_000) continue;
    seen.add(uri);
    candidates.push({
      source: segment.source,
      title,
      evidenceType: "news",
      publisher: NGUOI_VIET_PUBLISHER,
      uri,
      // A newsroom byline is not a community identity, and an article is not a user.
      authorId: null,
      authorHandle: null,
      text: excerpt && !title.startsWith(excerpt) ? `${title} ${excerpt}`.trim() : title,
      kind: "link",
      permalink,
      publishedAt: new Date(published).toISOString(),
      timeKind: "published",
      media: [],
      engagement: null,
    });
  }
  return sampleAcrossWindow(candidates, cap, now);
}

function newsHeaders(accept: string): Headers {
  return new Headers({ accept, "user-agent": PUBLIC_USER_AGENT });
}

/**
 * The result of one bounded read: real evidence plus the labelled failures that
 * did not erase it. An empty `posts` with a non-empty `errors` is an unavailable
 * source, not a measured zero.
 */
export interface FeedReadResult {
  posts: SourcePost[];
  errors: string[];
}

/**
 * Tuổi Trẻ prints a Vietnam wall clock without any offset: "11/5/2026 9:15:00
 * PM". It is read as Indochina Time (UTC+07:00, no daylight saving) rather than
 * as the machine's zone or as UTC, and a value that is not a real calendar
 * instant is rejected instead of being shifted.
 */
export function vietnamClockInstant(raw: string): number {
  const cleaned = raw.replace(/[\u00a0\u202f]/g, " ").trim();
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)?$/i.exec(
    cleaned,
  );
  if (!match) return Number.NaN;
  const [, month, day, year, hour, minute, second, meridiem] = match as unknown as string[];
  const monthIndex = Number(month) - 1;
  let hours = Number(hour);
  if (meridiem) {
    if (hours < 1 || hours > 12) return Number.NaN;
    hours = (hours % 12) + (meridiem.toUpperCase() === "PM" ? 12 : 0);
  }
  if (hours > 23 || Number(minute) > 59 || Number(second) > 59) return Number.NaN;
  const wall = Date.UTC(
    Number(year),
    monthIndex,
    Number(day),
    hours,
    Number(minute),
    Number(second),
  );
  if (!Number.isFinite(wall)) return Number.NaN;
  // Reject 31/02-style values the Date constructor would roll into March.
  const check = new Date(wall);
  if (check.getUTCMonth() !== monthIndex || check.getUTCDate() !== Number(day)) return Number.NaN;
  return wall - VIETNAM_OFFSET_MS;
}

/** Publication instant from a publisher's own spelling; never "now" as a fallback. */
function publisherInstant(style: PublisherDateStyle, raw: string): number {
  const value = raw.trim();
  if (!value) return Number.NaN;
  return style === "vietnam-clock" ? vietnamClockInstant(value) : Date.parse(value);
}

/**
 * Every document this provider publishes: the segment's primary feed plus its
 * declared sections. All of them must sit on the segment's own origin, so a
 * catalog typo can never turn one segment into an arbitrary fetcher, and a
 * public catalog must be HTTPS. Loopback hosts are allowed unencrypted so a
 * local fixture server can exercise the real fan-in path.
 */
export function publisherFeedUrls(segment: ViewerSegment): string[] {
  if (!isPublisherSource(segment.source))
    throw new Error(`${segment.label} has no section-feed catalog`);
  const urls = [segment.feedUrl, ...(segment.additionalFeedUrls ?? [])];
  let origin: URL | null = null;
  const resolved: string[] = [];
  for (const raw of urls) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new Error(`${segment.label} catalog URL is not a valid URL: ${raw}`);
    }
    const loopback =
      url.hostname === "localhost" || url.hostname === "[::1]" || url.hostname.startsWith("127.");
    if (url.protocol !== "https:" && !(loopback && url.protocol === "http:"))
      throw new Error(`${segment.label} catalog URL must be HTTPS: ${raw}`);
    if (!url.pathname.startsWith("/rss/"))
      throw new Error(`${segment.label} catalog URL must be an RSS document: ${raw}`);
    origin ??= url;
    if (url.host !== origin.host)
      throw new Error(
        `${segment.label} catalog URL must stay on ${origin.host}, not ${url.host}: ${raw}`,
      );
    if (!resolved.includes(url.href)) resolved.push(url.href);
  }
  return resolved;
}

/**
 * Every usable article in one document, in the publisher's own order: a real
 * publication instant, a canonical link on the publisher's own host, and a
 * decoded headline. Nothing is windowed or capped here, so the caller can keep
 * the normalized records and re-apply a moving window or a different budget
 * later without re-reading the document.
 */
function publisherRecords(xml: string, segment: ViewerSegment): SourcePost[] {
  if (!isPublisherSource(segment.source))
    throw new Error(`${segment.label} has no section-feed catalog`);
  const { publisher, dateStyle } = PUBLISHERS[segment.source];
  const channel = parseRssChannel(xml);
  const rawItems =
    channel.item === undefined ? [] : Array.isArray(channel.item) ? channel.item : [channel.item];
  const records: SourcePost[] = [];
  const seen = new Set<string>();
  for (const raw of rawItems) {
    const item = object(raw);
    const permalink = canonicalLink(text(item.link), segment.feedUrl);
    if (!permalink || seen.has(permalink)) continue;
    // Titles in several Vietnamese feeds carry HTML entities (&agrave;, &Ocirc;)
    // even though the XML itself is valid, so decode through the HTML reader.
    const title = htmlText(text(item.title)).slice(0, 180);
    if (!title) continue;
    const published = publisherInstant(dateStyle, text(item.pubDate));
    // An undated report is not evidence of anything, and it is not dated "now".
    if (!Number.isFinite(published)) continue;
    const excerpt = htmlText(text(item.description));
    seen.add(permalink);
    records.push({
      source: segment.source,
      title,
      evidenceType: "news",
      publisher,
      uri: permalink,
      // A newsroom byline is not a community identity; no author is invented.
      authorId: null,
      authorHandle: null,
      text: !excerpt ? title : excerpt.startsWith(title) ? excerpt : `${title} ${excerpt}`.trim(),
      kind: "link",
      permalink,
      publishedAt: new Date(published).toISOString(),
      timeKind: "published",
      // Topic discovery needs the visible text, not thumbnail downloads and
      // extra media inference for every article in a broad category feed.
      media: [],
      engagement: null,
    });
  }
  return records;
}

/** The generic discovery window, applied to records that may have been read earlier. */
function inNewsWindow(record: SourcePost, now: number): boolean {
  const published = Date.parse(record.publishedAt);
  return published >= now - NEWS_WINDOW_DAYS * 86_400_000 && published <= now + 60_000;
}

/**
 * One document's articles inside the window, in the publisher's own order,
 * capped at `limit`. Staleness is decided at read time, so a record read
 * yesterday stops counting once it leaves the window instead of lingering as if
 * it were current.
 */
export function parsePublisherFeed(
  xml: string,
  segment: ViewerSegment,
  limit = MAX_POSTS_PER_SOURCE,
  now = Date.now(),
): SourcePost[] {
  const cap = Math.min(MAX_POSTS_PER_SOURCE, Math.max(0, limit));
  if (cap === 0) return [];
  return publisherRecords(xml, segment)
    .filter((record) => inNewsWindow(record, now))
    .slice(0, cap);
}

/**
 * Spend the cycle budget across the whole window, always keeping the newest
 * record and rotating the rest of the sample by ten-minute epoch.
 *
 * A provider that published heavily in the last hour would otherwise fill the
 * budget with its own newest slice and an older report would never be reached,
 * and a fixed sample would return the same records forever once the publisher
 * answers "unchanged". The window is therefore cut into one disjoint lane per
 * remaining budget slot: each lane contributes exactly one article, and the
 * position inside a lane advances once per ten-minute cycle. Because the lanes
 * never overlap, the requested quota is always filled with distinct articles —
 * stepping by a stride would revisit a subset of positions whenever the stride
 * shared a factor with the window length — and each lane is fully covered after
 * as many cycles as its own size. The offset comes from the clock, never from
 * hidden state, so a probe can reproduce the selection.
 */
function sampleWindow(records: SourcePost[], limit: number, now: number): SourcePost[] {
  if (limit <= 0 || records.length === 0) return [];
  if (records.length <= limit) return records;
  const rest = records.slice(1);
  const quota = limit - 1;
  if (quota <= 0) return [records[0]!];
  const epoch = Math.floor(now / 600_000);
  const chosen = new Set<SourcePost>([records[0]!]);
  for (let lane = 0; lane < quota; lane += 1) {
    const start = Math.floor((lane * rest.length) / quota);
    const size = Math.floor(((lane + 1) * rest.length) / quota) - start;
    // `rest` is longer than `quota`, so every lane holds at least one record.
    chosen.add(rest[start + ((epoch + lane) % size)]!);
  }
  return records.filter((record) => chosen.has(record));
}

/**
 * Normalized documents already read, keyed by URL. Only records are kept (no
 * raw XML/HTML), and only after the document parsed successfully, so a
 * conditional "unchanged" answer replays real articles instead of nothing and a
 * malformed document cannot consume a validator.
 */
const feedDocuments = new Map<
  string,
  { etag: string | null; modified: string | null; records: SourcePost[] }
>();

/** One conditional document read: 304 replays the cached records, it is not "no news". */
async function readPublisherRecords(url: string, segment: ViewerSegment): Promise<SourcePost[]> {
  const cached = feedDocuments.get(url);
  const headers = newsHeaders("application/rss+xml, application/xml");
  if (cached?.etag) headers.set("if-none-match", cached.etag);
  if (cached?.modified) headers.set("if-modified-since", cached.modified);
  const response = await requestBounded(url, headers);
  if (response.status === 304) {
    if (!cached) throw new Error("HTTP 304 without a cached document");
    return cached.records;
  }
  if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
  // Parse first: a malformed document must fail again on the next poll rather
  // than be remembered as a successfully revalidated one. The replacement entry
  // also drops the old validator, so a publisher that stops sending one is
  // re-read in full instead of being served from a stale "unchanged" answer.
  const records = publisherRecords(response.body, segment);
  feedDocuments.set(url, { etag: response.etag, modified: response.lastModified, records });
  return records;
}

/** Short, URL-labelled failure line: one bad section never hides the others. */
function documentError(url: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  let path = url;
  try {
    path = new URL(url).pathname;
  } catch {
    // A catalog entry that does not parse as a URL is reported verbatim.
  }
  return `${path}: ${message.slice(0, 120)}`;
}

/**
 * One bounded provider cycle: every section document is read with at most
 * `PROVIDER_FEED_CONCURRENCY` requests in flight, then the articles are merged,
 * de-duplicated by canonical link and sampled across the window. A failing
 * section contributes a labelled error line; only when no document could be
 * read at all is the provider reported as unavailable.
 */
export async function fetchPublisherFeeds(
  segment: ViewerSegment,
  limit = MAX_POSTS_PER_SOURCE,
  now = Date.now(),
): Promise<FeedReadResult> {
  const urls = publisherFeedUrls(segment);
  const errors: string[] = [];
  const batches: SourcePost[][] = Array.from({ length: urls.length }, () => []);
  let read = 0;
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      const url = urls[index];
      if (url === undefined) return;
      try {
        const records = await readPublisherRecords(url, segment);
        batches[index] = records.filter((record) => inNewsWindow(record, now));
        read += 1;
      } catch (error) {
        errors.push(`${segment.id} ${documentError(url, error)}`);
      }
    }
  };
  const workers = Math.min(PROVIDER_FEED_CONCURRENCY, urls.length);
  await Promise.all(Array.from({ length: workers }, worker));
  if (read === 0)
    throw new Error(
      `${segment.label}: no section feed could be read (${errors.length} failed); ` +
        `first error ${errors[0] ?? "unknown"}`,
    );
  // One article per canonical link: the same report is carried by several
  // sections, and counting it twice would falsify the volume of new evidence.
  const byLink = new Map<string, SourcePost>();
  for (const batch of batches) {
    for (const post of batch) if (!byLink.has(post.uri)) byLink.set(post.uri, post);
  }
  const merged = [...byLink.values()].sort(
    (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
  );
  const cap = Math.max(0, Math.min(MAX_POSTS_PER_SOURCE, limit));
  return { posts: sampleWindow(merged, cap, now), errors };
}

function parseJson(body: string, label: string): unknown {
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new Error(`${label} returned invalid JSON`);
  }
}

/** Category ids are stable per publisher origin for the life of the process. */
const categoryIds = new Map<string, number>();

/** Resolve the section by slug so a renumbered category does not silently empty the feed. */
async function nguoiVietCategoryId(postsUrl: URL, segment: ViewerSegment): Promise<number> {
  // Validate the configured boundary before any cached state can bypass it.
  if (!/\/posts\/?$/.test(postsUrl.pathname))
    throw new Error(`${segment.label} feed URL must point at the WordPress posts endpoint`);
  const cached = categoryIds.get(postsUrl.origin);
  if (cached !== undefined) return cached;
  const categories = new URL(postsUrl.href);
  categories.pathname = categories.pathname.replace(/posts\/?$/, "categories");
  categories.search = "";
  categories.searchParams.set("slug", NGUOI_VIET_CATEGORY_SLUG);
  categories.searchParams.set("_fields", "id,slug");
  const response = await requestBounded(categories.href, newsHeaders("application/json"));
  if (response.status !== 200)
    throw new Error(`${segment.label} category lookup returned HTTP ${response.status}`);
  const first = parseJson(response.body, segment.label);
  const id = Array.isArray(first) ? object(first[0]).id : undefined;
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0)
    throw new Error(`${segment.label} section "${NGUOI_VIET_CATEGORY_SLUG}" was not found`);
  categoryIds.set(postsUrl.origin, id);
  return id;
}

async function fetchGoogleNews(segment: ViewerSegment, limit: number): Promise<SourcePost[]> {
  const response = await requestBounded(
    segment.feedUrl,
    newsHeaders("application/rss+xml, application/xml"),
  );
  if (response.status !== 200) throw new Error(`${segment.label} returned HTTP ${response.status}`);
  return parseGoogleNewsFeed(response.body, segment, limit);
}

async function fetchNguoiViet(
  segment: ViewerSegment,
  limit: number,
  now: number,
): Promise<SourcePost[]> {
  const postsUrl = new URL(segment.feedUrl);
  const category = await nguoiVietCategoryId(postsUrl, segment);
  postsUrl.search = "";
  postsUrl.searchParams.set("categories", String(category));
  // Truncated to the hour: the same URL is reused across nearby cycles, so the
  // publisher's cache can answer it instead of a fresh uncached range query.
  const after = Math.floor((now - NEWS_WINDOW_DAYS * 86_400_000) / 3_600_000) * 3_600_000;
  postsUrl.searchParams.set("after", new Date(after).toISOString());
  postsUrl.searchParams.set("per_page", String(NGUOI_VIET_PAGE_SIZE));
  postsUrl.searchParams.set("_fields", "id,date_gmt,link,title,excerpt");
  const response = await requestBounded(postsUrl.href, newsHeaders("application/json"));
  if (response.status !== 200) throw new Error(`${segment.label} returned HTTP ${response.status}`);
  return parseNguoiVietPosts(parseJson(response.body, segment.label), segment, limit, now);
}

/**
 * One bounded news cycle per segment: the Google front page is a single RSS
 * read, Người Việt is one post-window read plus a one-time-per-process section
 * lookup that is cached by origin, and a section-feed publisher fans in its
 * catalog with a bounded number of parallel requests. Google and Người Việt
 * emit no ETag/Last-Modified (verified against the live services), so those
 * requests are unconditional; Dân trí does send validators and is revalidated.
 *
 * Returns real evidence plus labelled failures instead of either throwing away
 * partly collected articles or reporting a failure as an empty source.
 */
export async function fetchNewsFeed(
  segment: ViewerSegment,
  limit = MAX_POSTS_PER_SOURCE,
  now = Date.now(),
): Promise<FeedReadResult> {
  if (segment.source === "google-news")
    return { posts: await fetchGoogleNews(segment, limit), errors: [] };
  if (segment.source === "nguoi-viet")
    return { posts: await fetchNguoiViet(segment, limit, now), errors: [] };
  if (isPublisherSource(segment.source)) return fetchPublisherFeeds(segment, limit, now);
  throw new Error(`${segment.label} has no news adapter`);
}
