import { EntityDecoder, XML } from "@nodable/entities";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { Parser } from "htmlparser2";
import type { ViewerSegment } from "../../shared/types.ts";
import {
  MAX_MEDIA_ITEMS,
  MAX_POSTS_PER_SOURCE,
  normalizeText,
  type MediaRef,
  type SourcePost,
} from "./input.ts";

const MAX_FEED_BYTES = 1_000_000;
const TIMEOUT_MS = 15_000;
const validators = new Map<string, { etag: string | null; modified: string | null }>();

/** Narrow untrusted XML nodes instead of assuming a successful HTTP response is a feed. */
function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Namespaced RSS elements can be strings or attribute-bearing #text objects. */
function text(value: unknown): string {
  if (typeof value === "string") return value;
  const nested = object(value)["#text"];
  return typeof nested === "string" ? nested : "";
}

/** Strip tracking from evidence links while preserving the actual thread identity. */
function canonicalLink(value: string, base: string): string | null {
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
 * Extract visible first-post text, excluding quoted copies and script/style
 * content. Only source-hosted attachments are eligible for inference; arbitrary
 * third-party image URLs and avatars are not downloaded from RSS descriptions.
 */
function excerpt(html: string, permalink: string): { body: string; media: MediaRef[] } {
  const parts: string[] = [];
  const media: MediaRef[] = [];
  let excluded = 0;
  const skip: Record<string, true> = { script: true, style: true, blockquote: true };
  const root = new URL(permalink);
  const parser = new Parser(
    {
      onopentag(name, attributes) {
        if (Object.hasOwn(skip, name)) excluded += 1;
        if (excluded) return;
        parts.push(" ");
        if (name !== "img" || media.length >= MAX_MEDIA_ITEMS) return;
        try {
          const url = new URL(attributes.src ?? "", permalink);
          const domain = root.hostname.replace(/^www\./, "");
          if (
            url.protocol !== "https:" ||
            !(url.hostname === domain || url.hostname.endsWith(`.${domain}`))
          )
            return;
          if (/\/(?:smilies|avatars)\//i.test(url.pathname)) return;
          if (media.some((item) => item.url === url.href)) return;
          media.push({ kind: "image", url: url.href });
        } catch {
          // A broken image URL does not discard the thread's usable text.
        }
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
  return { body: normalizeText(parts.join("")), media };
}

/**
 * Parse the two verified XenForo RSS feeds into lean source records. RSS dates
 * describe activity, not proven original publication. Missing counters remain
 * absent, and missing dates are rejected later rather than invented as now.
 */
export function parsePublicFeed(
  xml: string,
  segment: ViewerSegment,
  limit = MAX_POSTS_PER_SOURCE,
): SourcePost[] {
  // Declarations inside CDATA or XML comments are quoted content, not a DTD.
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
  const rawItems =
    channel.item === undefined ? [] : Array.isArray(channel.item) ? channel.item : [channel.item];
  const posts: SourcePost[] = [];
  const seen = new Set<string>();
  for (const raw of rawItems) {
    if (posts.length >= Math.min(MAX_POSTS_PER_SOURCE, Math.max(0, limit))) break;
    const item = object(raw);
    const permalink = canonicalLink(text(item.link), segment.feedUrl);
    if (!permalink) continue;
    const guid = text(item.guid);
    const uri = guid.startsWith("urn:xenforo:thread:") ? guid : permalink;
    if (seen.has(uri)) continue;
    seen.add(uri);
    const title = normalizeText(text(item.title));
    const { body, media } = excerpt(
      text(item["content:encoded"]) || text(item.description),
      permalink,
    );
    const author = normalizeText(
      text(item["dc:creator"]) || text(item.author).match(/\(([^)]+)\)\s*$/)?.[1] || "",
    );
    const rawReplies = text(item["slash:comments"]);
    const replies = /^\d+$/.test(rawReplies)
      ? Math.min(Number(rawReplies), 2_147_483_647)
      : undefined;
    posts.push({
      source: segment.source,
      uri,
      authorId: author || null,
      authorHandle: author || null,
      text: body.startsWith(title) ? body : `${title} ${body}`.trim(),
      kind: media.length ? "image" : "text",
      permalink,
      publishedAt: text(item.pubDate),
      timeKind: "activity",
      media,
      engagement: replies === undefined ? null : { replies, capturedAt: new Date().toISOString() },
    });
  }
  return posts;
}

/** Stop reading before an untrusted or unexpectedly large feed fills memory. */
async function boundedText(response: Response): Promise<string> {
  if (Number(response.headers.get("content-length") ?? 0) > MAX_FEED_BYTES) {
    await response.body?.cancel();
    throw new Error("Feed exceeds the 1 MB input cap");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Feed response has no body");
  const decoder = new TextDecoder();
  let bytes = 0;
  let result = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_FEED_BYTES) {
        await reader.cancel();
        throw new Error("Feed exceeds the 1 MB input cap");
      }
      result += decoder.decode(chunk.value, { stream: true });
    }
    return result + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

/** One conditional public request per source; no hidden retries, login or challenge bypass. */
export async function fetchPublicFeed(
  segment: ViewerSegment,
  limit = MAX_POSTS_PER_SOURCE,
): Promise<SourcePost[]> {
  const cached = validators.get(segment.feedUrl);
  const headers = new Headers({
    accept: "application/rss+xml, application/xml",
    "user-agent": "Trendifest/0.1 (public-feed reader)",
  });
  if (cached?.etag) headers.set("if-none-match", cached.etag);
  if (cached?.modified) headers.set("if-modified-since", cached.modified);
  const response = await fetch(segment.feedUrl, {
    headers,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (response.status === 304) return [];
  if (!response.ok) throw new Error(`${segment.label} returned HTTP ${response.status}`);
  const posts = parsePublicFeed(await boundedText(response), segment, limit);
  validators.set(segment.feedUrl, {
    etag: response.headers.get("etag"),
    modified: response.headers.get("last-modified"),
  });
  return posts;
}
