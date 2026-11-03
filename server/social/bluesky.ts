import type { PostKind, SocialPost } from "../../shared/types.ts";

/**
 * Bluesky collection adapter. Two access paths, both verified against the live
 * network before this file existed:
 *
 * 1. `app.bsky.feed.getFeed` — paginated, engagement-bearing, so it is the only
 *    path that can supply metric snapshots. Used for segment backfill.
 * 2. Jetstream WebSocket — the live tail, no auth, at-least-once delivery with
 *    an inclusive cursor. Used for ongoing observation without polling.
 *
 * The adapter owns quirks the rest of the server must not learn: paged cursors
 * are opaque, Jetstream wraps events in an envelope whose `record` is already
 * decoded, deletes carry no record, and media is a CID that has to be turned
 * into a CDN URL per embed type.
 */

const PUBLIC_API = "https://public.api.bsky.app/xrpc";
const JETSTREAM =
  "wss://jetstream.us-east.bsky.network/xrpc/network.bsky.jetstream.subscribeEvents";
const JETSTREAM_PROTOCOL = "xrpc.v1.json";
const POST_COLLECTION = "app.bsky.feed.post";
const REQUEST_TIMEOUT_MS = 15_000;

export class BlueskyError extends Error {
  readonly status = 503;
  readonly code = "source_unavailable";

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "BlueskyError";
  }
}

/** Media reference resolved to something the pipeline can fetch or link. */
export interface MediaRef {
  kind: "image" | "video" | "audio" | "link";
  /** Bluesky blob CID for images, or the video CID for video posts. */
  cid: string;
  /** CDN URL for images; HLS playlist for video; external URL for links. */
  url: string;
  alt: string;
  mimeType: string;
}

interface FeedPostView {
  uri: string;
  author: { did: string; handle?: string };
  record?: {
    text?: string;
    langs?: string[];
    tags?: string[];
    createdAt?: string;
    embed?: unknown;
  };
  embed?: unknown;
  indexedAt?: string;
  likeCount?: number;
  repostCount?: number;
  replyCount?: number;
  quoteCount?: number;
}

/** `getFeed` wraps every entry as `{ post }`; the reason for inclusion is not used. */
interface FeedItem {
  post?: FeedPostView;
}

export interface FeedPage {
  posts: Array<{ post: SocialPost; media: MediaRef[]; engagement: FeedPostView }>;
  /** Opaque cursor; absent when the feed is exhausted. */
  cursor: string | null;
}

/** CDN render of an image blob; full size keeps text overlays legible for CLIP. */
function imageUrl(did: string, cid: string) {
  return `https://cdn.bsky.app/img/feed_fullsize/plain/${did}/${cid}@jpeg`;
}

/** HLS playlist for a video blob; ffmpeg and the browser both read it directly. */
export function videoPlaylistUrl(did: string, cid: string) {
  return `https://video.bsky.app/watch/${did}/${cid}/playlist.m3u8`;
}

export function postPermalink(uri: string) {
  // at://did/app.bsky.feed.post/rkey -> bsky.app/profile/did/post/rkey
  const match = uri.match(/^at:\/\/([^/]+)\/[^/]+\/([^/]+)$/);
  return match ? `https://bsky.app/profile/${match[1]}/post/${match[2]}` : uri;
}

/** Object narrowing that keeps the compiler's view honest at this JSON boundary. */
function recordOf(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Blob refs arrive as `{ ref: { $link } }` in raw Jetstream records; resolved
 * views carry a ready-made URL instead. Both shapes are read here so the same
 * adapter serves the live tail and the paginated feed.
 */
function blobCid(value: unknown): string | null {
  const node = recordOf(value);
  const ref = recordOf(node?.ref);
  return typeof ref?.$link === "string" ? ref.$link : null;
}

function textOf(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function readImages(list: unknown, did: string): MediaRef[] {
  if (!Array.isArray(list)) return [];
  const media: MediaRef[] = [];
  for (const raw of list) {
    const image = recordOf(raw);
    if (!image) continue;
    // `#view` items expose fullsize directly; raw records expose a blob ref.
    const resolved = textOf(image.fullsize) || textOf(image.thumbnail);
    const cid = blobCid(image.image) ?? blobCid(image.thumb) ?? "";
    const url = resolved || (cid ? imageUrl(did, cid) : "");
    if (!url) continue;
    media.push({
      kind: "image",
      cid,
      url,
      alt: textOf(image.alt),
      mimeType: "image/jpeg",
    });
  }
  return media;
}

function readVideo(value: unknown, did: string): MediaRef[] {
  const video = recordOf(value);
  if (!video) return [];
  // Raw shape nests the blob: `{ video: { ref } }`. The resolved `#view` shape
  // hoists `cid` and `playlist` to the embed root, so `value` is already it.
  const nested = recordOf(video.video);
  const resolved = textOf(video.playlist);
  const cid = textOf(video.cid) || blobCid(nested) || "";
  const url = resolved || (cid ? videoPlaylistUrl(did, cid) : "");
  if (!url) return [];
  return [{ kind: "video", cid, url, alt: "", mimeType: "video/mp4" }];
}

function readAudio(list: unknown, did: string): MediaRef[] {
  if (!Array.isArray(list)) return [];
  const media: MediaRef[] = [];
  for (const raw of list) {
    const audio = recordOf(raw);
    if (!audio) continue;
    const cid = blobCid(audio.audio) ?? "";
    const url = cid
      ? `https://bsky.social/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(did)}&cid=${cid}`
      : "";
    if (!url) continue;
    media.push({ kind: "audio", cid, url, alt: textOf(audio.alt), mimeType: "audio/mp4" });
  }
  return media;
}

function readExternal(value: unknown): MediaRef[] {
  const external = recordOf(value);
  const uri = textOf(external?.uri);
  if (!uri) return [];
  return [
    {
      kind: "link",
      cid: "",
      url: uri,
      alt: textOf(external?.description) || textOf(external?.title),
      mimeType: "text/uri-list",
    },
  ];
}

/**
 * Flatten any embed shape into a post kind plus ordered media refs. Handles both
 * `app.bsky.embed.images` and `app.bsky.embed.images#view`, because Jetstream
 * sends records while `getFeed` sends resolved views. Order is preserved so the
 * pipeline can address spans (`image:0`, `video:frame:2`).
 */
function readEmbed(embed: unknown, did: string): { kind: PostKind; media: MediaRef[] } {
  const node = recordOf(embed);
  if (!node) return { kind: "text", media: [] };

  // recordWithMedia wraps the real media one level down in both shapes.
  const wrapper = recordOf(node.media) ?? node;

  const images = readImages(wrapper.images, did);
  const gallery = readImages(recordOf(wrapper.gallery)?.items, did);
  // A video embed carries its descriptor at the root; other embeds nest media
  // under `video`, so both positions are tried.
  const video = readVideo(
    textOf(wrapper.$type).includes("embed.video") ? wrapper : wrapper.video,
    did,
  );
  const audio = readAudio(wrapper.audio, did);
  const external = readExternal(wrapper.external);

  const media = [...images, ...gallery, ...video, ...audio, ...external];
  if (video.length > 0) return { kind: "video", media };
  if (images.length > 0 || gallery.length > 0) return { kind: "image", media };
  if (audio.length > 0) return { kind: "audio", media };
  if (external.length > 0) return { kind: "link", media };
  return { kind: "text", media };
}

/**
 * `record.createdAt` is a client-supplied string with no server validation, so
 * a post can claim any publication date. A future timestamp would make it
 * permanently "newest" and corrupt every recency and velocity signal. Clamp to
 * observation time; the untrusted value is discarded rather than stored, so no
 * downstream query has to remember the rule.
 */
function publicationTime(claimed: string | undefined, fallback: string) {
  const now = Date.now();
  const parsed = claimed ? Date.parse(claimed) : Number.NaN;
  if (!Number.isFinite(parsed)) return new Date(fallback).toISOString();
  // A minute of tolerance absorbs ordinary clock skew between hosts.
  return new Date(Math.min(parsed, now + 60_000)).toISOString();
}

/** Normalize one feed item or Jetstream record into the wire post shape. */
export function toSocialPost(input: {
  uri: string;
  did: string;
  handle: string | null;
  record: NonNullable<FeedPostView["record"]>;
  embed?: unknown;
  indexedAt?: string;
}): { post: SocialPost; media: MediaRef[] } {
  const { kind, media } = readEmbed(input.embed ?? input.record.embed, input.did);
  const text = typeof input.record.text === "string" ? input.record.text : "";
  const publishedAt = publicationTime(
    input.record.createdAt,
    input.indexedAt ?? new Date().toISOString(),
  );
  const rkey = input.uri.split("/").pop() ?? input.uri;

  return {
    post: {
      // The AT URI is the stable source-native id; Jetstream is at-least-once.
      id: input.uri,
      source: "bluesky",
      uri: input.uri,
      authorDid: input.did,
      authorHandle: input.handle,
      text,
      lang: Array.isArray(input.record.langs) ? input.record.langs.slice(0, 5) : [],
      tags: Array.isArray(input.record.tags) ? input.record.tags.slice(0, 20) : [],
      kind,
      permalink: postPermalink(input.uri),
      publishedAt,
      mediaCids: media.map((item) => item.cid).filter(Boolean),
      contentHash: contentHashOf(`${text}\u0000${rkey}`),
    },
    media,
  };
}

/**
 * Cheap FNV-1a over the visible text plus the record key. Exact-repost
 * detection ("this identical caption again") uses this; it is not a perceptual
 * hash and makes no claim about near-duplicate media.
 */
export function contentHashOf(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

async function fetchJson<T>(url: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new BlueskyError("Bluesky did not respond in time", { cause: error });
  }
  if (!response.ok) {
    throw new BlueskyError(`Bluesky returned ${response.status}`);
  }
  return (await response.json()) as T;
}

/**
 * One page of a feed. `cursor` is whatever the previous page returned; the
 * cursor encodes an index and timestamp, so it must round-trip untouched.
 */
export async function fetchFeedPage(feed: string, cursor: string | null, limit = 50) {
  const params = new URLSearchParams({ feed, limit: String(limit) });
  if (cursor) params.set("cursor", cursor);
  const body = await fetchJson<{ feed?: FeedItem[]; cursor?: string }>(
    `${PUBLIC_API}/app.bsky.feed.getFeed?${params.toString()}`,
  );

  const posts: FeedPage["posts"] = [];
  for (const item of body.feed ?? []) {
    const view = item.post;
    // A missing post means the entry was a blocked or not-found placeholder;
    // there is nothing to observe, so it is skipped rather than faked.
    if (!view?.record) continue;
    const { post, media } = toSocialPost({
      uri: view.uri,
      did: view.author.did,
      handle: view.author.handle ?? null,
      record: view.record,
      embed: view.embed,
      indexedAt: view.indexedAt,
    });
    posts.push({ post, media, engagement: view });
  }

  return { posts, cursor: body.cursor ?? null } satisfies FeedPage;
}

export function engagementOf(view: FeedPostView) {
  return {
    likes: view.likeCount ?? 0,
    reposts: view.repostCount ?? 0,
    replies: view.replyCount ?? 0,
    quotes: view.quoteCount ?? 0,
    capturedAt: new Date().toISOString(),
  };
}

export interface TailEvent {
  operation: "create" | "update" | "delete";
  uri: string;
  did: string;
  rkey: string;
  seq: number;
  record?: NonNullable<FeedPostView["record"]>;
  /** Jetstream v2 has no durable cursor per message; seq doubles as one. */
  time: string;
}

/**
 * Open the live tail. The caller owns reconnection: this returns the socket
 * and a promise that settles when the socket closes, so the ingest loop can
 * decide whether to back off rather than hiding it here.
 */
export function openTail(handlers: {
  onEvent: (event: TailEvent) => void | Promise<void>;
  onError?: (error: Error) => void;
  onClose?: () => void;
  /** Resume point: inclusive, so the last processed seq is replayed once. */
  cursor?: string;
}) {
  const params = new URLSearchParams({
    collections: POST_COLLECTION,
    kinds: "commit",
  });
  if (handlers.cursor) params.set("cursor", handlers.cursor);

  // The v2 endpoint speaks the xrpc.v1.json subprotocol; without it the upgrade
  // is rejected before any frames arrive.
  const socket = new WebSocket(`${JETSTREAM}?${params.toString()}`, [JETSTREAM_PROTOCOL]);

  socket.onmessage = (message) => {
    let envelope: { payload?: Record<string, unknown> };
    try {
      envelope = JSON.parse(String(message.data)) as typeof envelope;
    } catch {
      return;
    }
    const payload = envelope.payload;
    if (!payload) return;

    const commit = payload as {
      operation?: string;
      collection?: string;
      did?: string;
      rkey?: string;
      seq?: number;
      time?: string;
      record?: Record<string, unknown>;
    };
    if (commit.collection !== POST_COLLECTION) return;

    const operation = commit.operation;
    if (operation !== "create" && operation !== "update" && operation !== "delete") return;

    void handlers.onEvent({
      operation,
      uri: `at://${commit.did}/${POST_COLLECTION}/${commit.rkey}`,
      did: String(commit.did ?? ""),
      rkey: String(commit.rkey ?? ""),
      seq: Number(commit.seq ?? 0),
      record: commit.record as TailEvent["record"],
      time: String(commit.time ?? new Date().toISOString()),
    });
  };
  socket.onerror = () => handlers.onError?.(new BlueskyError("Jetstream socket failed"));
  socket.onclose = () => handlers.onClose?.();

  return socket;
}

/** Resolve handles for a page of posts in one request instead of N. */
export async function resolveHandles(dids: string[]) {
  if (dids.length === 0) return new Map<string, string>();
  const params = new URLSearchParams();
  for (const did of dids.slice(0, 25)) params.append("actors", did);
  try {
    const body = await fetchJson<{ profiles?: Array<{ did: string; handle: string }> }>(
      `${PUBLIC_API}/app.bsky.actor.getProfiles?${params.toString()}`,
    );
    return new Map((body.profiles ?? []).map((profile) => [profile.did, profile.handle]));
  } catch {
    // Handles are cosmetic; the DID remains the identity if lookup fails.
    return new Map<string, string>();
  }
}
