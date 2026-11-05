import { createHash } from "node:crypto";
import { francAll } from "franc-min";
import type {
  EngagementSnapshot,
  PostKind,
  SocialSource,
  SourceTimeKind,
} from "../../shared/types.ts";

/** Source-owned media references; no raw API payload or duplicate CID array. */
export interface MediaRef {
  kind: "image" | "video" | "audio" | "link";
  url: string;
}

/** The complete adapter boundary: only fields consumed by storage or rendering. */
export interface SourcePost {
  source: SocialSource;
  /** Stable source-native identity, not a title or a content hash. */
  uri: string;
  authorId: string | null;
  authorHandle: string | null;
  text: string;
  kind: PostKind;
  permalink: string;
  publishedAt: string;
  timeKind: SourceTimeKind;
  media: MediaRef[];
  /** Null means unmeasured; it must not become a fabricated zero snapshot. */
  engagement: EngagementSnapshot | null;
}

export interface AcceptedPost extends SourcePost {
  id: string;
  authorId: string;
  language: "vi";
  contentHash: string;
}

export type InputRejection = "empty" | "short" | "language" | "date" | "url";
export type InputResult =
  | { accepted: true; post: AcceptedPost }
  | { accepted: false; reason: InputRejection };

/** The UI supports at most 30 days; older input cannot contribute to its map. */
export const RETENTION_DAYS = 30;
export const MAX_TEXT_CHARS = 2_000;
export const MAX_MEDIA_ITEMS = 4;
export const MAX_POSTS_PER_SOURCE = 25;
const MIN_LANGUAGE_LETTERS = 25;

/** Stable namespaced identity prevents collisions between unrelated networks. */
export function postId(source: SocialSource, uri: string) {
  return `${source}:${uri}`;
}

/** Collapse invisible padding and canonically equivalent Vietnamese Unicode. */
export function normalizeText(value: string) {
  return value
    .normalize("NFC")
    .replace(/[\p{Cc}\p{Cf}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Only public web links belong in evidence; adapters never return executable URLs. */
function webUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * Gate every source before storage and inference. Language metadata and a
 * Vietnam keyword are not proof: classify the text against all detector languages.
 * The score gap is a conservative ambiguity heuristic, not a probability.
 * Short, stale and undetermined input is rejected, including media-only posts.
 */
export function acceptInput(input: SourcePost, now = Date.now()): InputResult {
  const text = normalizeText(input.text).slice(0, MAX_TEXT_CHARS);
  if (!text) return { accepted: false, reason: "empty" };
  const sample = text.replace(/https?:\/\/\S+/gi, " ").replace(/@[\p{L}\p{N}_.@-]+/gu, " ");
  if ((sample.match(/\p{L}/gu)?.length ?? 0) < MIN_LANGUAGE_LETTERS) {
    return { accepted: false, reason: "short" };
  }
  const ranked = francAll(sample, { minLength: MIN_LANGUAGE_LETTERS });
  if (ranked[0]?.[0] !== "vie" || ranked[0][1] - (ranked[1]?.[1] ?? 0) < 0.05) {
    return { accepted: false, reason: "language" };
  }
  const published = Date.parse(input.publishedAt);
  if (
    !Number.isFinite(published) ||
    published > now + 60_000 ||
    published < now - RETENTION_DAYS * 86_400_000
  ) {
    return { accepted: false, reason: "date" };
  }
  const permalink = webUrl(input.permalink);
  if (!permalink || !input.uri.trim()) return { accepted: false, reason: "url" };
  const media = input.media.filter((item) => webUrl(item.url) !== null).slice(0, MAX_MEDIA_ITEMS);
  const contentHash = createHash("sha256")
    .update(text)
    .update("\0")
    .update(JSON.stringify(media.map(({ kind, url }) => [kind, url])))
    .digest("hex");
  return {
    accepted: true,
    post: {
      ...input,
      id: postId(input.source, input.uri),
      authorId: `${input.source}:${input.authorId || "unknown"}`,
      authorHandle: input.authorHandle?.slice(0, 200) ?? null,
      text,
      permalink,
      publishedAt: new Date(Math.min(published, now)).toISOString(),
      media,
      language: "vi",
      contentHash,
    },
  };
}
