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
 * publisher's article with no author, no likes and no reply count. Both sources
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
 */

/** Hard cap on any public response body; a larger body is aborted, not buffered whole. */
export const MAX_RESPONSE_BYTES = 1_000_000;
/** One bounded attempt per source per cycle; no hidden retry of any kind. */
export const REQUEST_TIMEOUT_MS = 15_000;
/** Generic discovery window, aligned with the default seven-day map window. */
export const NEWS_WINDOW_DAYS = 7;
/** Identifies the collector to the publishers it reads. */
export const PUBLIC_USER_AGENT = "Trendifest/0.1 (public-feed reader)";
const NGUOI_VIET_PUBLISHER = "Người Việt";
const NGUOI_VIET_CATEGORY_SLUG = "viet-nam";
/** One request reads this many window records; older ones are not paged. */
const NGUOI_VIET_PAGE_SIZE = 50;

/** Sources whose evidence is published articles, not community discussion. */
export function isNewsSource(source: SocialSource): boolean {
  return source === "google-news" || source === "nguoi-viet";
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
 * read, and Người Việt is one post-window read plus a one-time-per-process
 * section lookup that is cached by origin. Neither endpoint emits
 * ETag/Last-Modified (verified against the live services), so news requests are
 * unconditional rather than pretending a revalidation that cannot happen.
 */
export async function fetchNewsFeed(
  segment: ViewerSegment,
  limit = MAX_POSTS_PER_SOURCE,
  now = Date.now(),
): Promise<SourcePost[]> {
  if (segment.source === "google-news") return fetchGoogleNews(segment, limit);
  if (segment.source === "nguoi-viet") return fetchNguoiViet(segment, limit, now);
  throw new Error(`${segment.label} has no news adapter`);
}
