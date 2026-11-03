import { ADOPTION_SEGMENTS, VIEWER_SEGMENTS, declaresEnglish } from "../../shared/segments.ts";
import type {
  ClusterExample,
  EngagementSnapshot,
  PatternCluster,
  PostKind,
  SegmentCoverage,
  SocialPost,
  SocialSignals,
} from "../../shared/types.ts";
import { SPACE_MODELS, getDb, toVectorLiteral } from "../db.ts";
import type { Space } from "../db.ts";
import type { Vector } from "./embed.ts";
import { embedAudio, embedClipText, embedImage, embedText } from "./embed.ts";
import { engagementOf, fetchFeedPage, openTail, toSocialPost } from "./bluesky.ts";
import type { MediaRef, TailEvent } from "./bluesky.ts";
import type { Extraction } from "./media.ts";
import { extractAudio, extractVideoFrames, fetchImage } from "./media.ts";

/**
 * The ingest pipeline: observations -> vectors -> clusters -> crossings.
 *
 * Design constraints that shape every step:
 *
 * - A post and an *observation* are different rows. The same post surfacing in
 *   two viewer segments is the signal worth measuring, so membership is never
 *   flattened onto the post.
 * - Media is embedded per span (`image:0`, `video:frame:2`, `video:audio`) so a
 *   cluster can say which modality matched, not just that something did.
 * - Clustering is bounded: each new vector compares against cluster centroids
 *   for its own space only, so unrelated spaces never compete and no O(n^2)
 *   sweep runs over the corpus.
 */

/**
 * Cosine floors measured against real data, not guessed.
 *
 * Text: measured on 120 real collected posts (7,140 pairs), cosine ran p50
 * 0.101, p95 0.322, p99 0.431. Paraphrases sit near 0.87. A 0.62 floor sat only
 * just above the corpus tail and merged a Japanese eel post with a Turkish
 * greeting at 0.81, so the floor is 0.75: above p99 with margin, below the
 * paraphrase band. Below ~25 characters the distributions invert entirely —
 * unrelated pairs reached 0.952 while related pairs peaked at 0.845, because a
 * three-word embed is dominated by function words and language priors — so
 * short text does not cluster at all; see MIN_CLUSTER_TEXT.
 *
 * Image: measured on 80 collected images (3,160 pairs), cosine ran p50 0.355,
 * p90 0.515, p95 0.558, p99 0.638, max 0.761. CLIP saturates on generic visual
 * content, so a 0.62 floor sat below p99 and merged unrelated photos into
 * 47-member clusters. 0.78 is above the observed maximum, which means only
 * genuinely near-identical imagery groups. Audio inherits the image floor until
 * a measured distribution exists; it is the one space without a real corpus
 * behind the number.
 *
 * Consequence, stated plainly: at these floors a gallery post and a re-upload
 * group, but "two photos of the same subject" usually do not. That is the honest
 * trade — a wrong merge is unrecoverable evidence, a missed merge is a smaller
 * cluster.
 */
const JOIN_THRESHOLD: Record<Space, number> = { text: 0.75, image: 0.78, audio: 0.78 };

/**
 * A new member must stay within JOIN_THRESHOLD of *every* existing member, not
 * just near the centroid: complete linkage, not single linkage.
 *
 * Two failures led here. A running-mean centroid drifts, so an early "good
 * morning" cluster widened until unrelated greetings sat near its centre. Then a
 * lower member floor (0.55) still permitted chaining: A joined B at 0.78, B
 * joined C at 0.78, and A-C at 0.56 held the whole 63-member cluster together
 * even though its true minimum pairwise similarity was 0.558.
 *
 * Requiring the join threshold against every member makes the invariant checkable
 * after the fact — the minimum pairwise cosine inside any cluster is at least
 * JOIN_THRESHOLD[space] — and bounds cluster size by genuine mutual similarity.
 */
const MEMBER_FLOOR = JOIN_THRESHOLD;
/** Below this, no threshold separates related from unrelated; skip clustering. */
const MIN_CLUSTER_TEXT = 25;
/**
 * The public tail is the whole network: roughly 1,500 posts a minute. Local CPU
 * embedding cannot keep up with that, and pretending otherwise would build an
 * unbounded queue that reports lag as if it were signal. The tail therefore
 * samples, and the sample rate is part of the honest coverage story: it is a
 * bounded subset of the network, not "all of Bluesky".
 */
const TAIL_SAMPLE_RATE = Number(process.env.TRENDIFEST_TAIL_SAMPLE ?? "20");
/** Pending embeddings; beyond this the oldest waiting post is dropped, not queued forever. */
const TAIL_QUEUE_LIMIT = 64;
/** A stale centroid stops dominating after this long without a new member. */
const CLUSTER_IDLE_HOURS = 24;
const MAX_CLUSTERS_PER_SPACE = 400;
/** Oldest clusters retired when a space hits the cap; they keep their members. */
const RETIRED_CLUSTERS_PER_CYCLE = 20;
const TEXT_SPAN = "body";
const MAX_INGEST_POSTS_PER_SEGMENT = 50;
/**
 * Feed pages to walk per segment. One page is not enough: popular posts appear
 * across many feeds, so the first page of a niche segment is often entirely
 * posts already collected elsewhere. Stopping after one page left Science,
 * Artists, Film, Food, and Urbanism with zero attributed patterns.
 */
const MAX_PAGES_PER_FEED = 3;

export interface IngestReport {
  segments: number;
  fetched: number;
  stored: number;
  observations: number;
  vectors: number;
  unvectorized: number;
  clusters: number;
  /** Posts dropped for declaring only non-English languages. */
  skippedLanguage: number;
  errors: Array<{ segmentId: string; message: string }>;
}

interface PreparedVector {
  space: Space;
  span: string;
  vector: Vector;
  /** Stable identity so a re-run overwrites instead of duplicating. */
  identity: string;
  /** False when the vector is retrieval-only for its space (e.g. very short text). */
  clusterable: boolean;
}

/**
 * Persist a post, its observation, and an engagement snapshot in one
 * transaction. `ON CONFLICT` matters because Jetstream is at-least-once and
 * feed pages overlap between cycles.
 */
async function storePost(
  post: SocialPost,
  media: MediaRef[],
  segmentId: string,
  engagement: EngagementSnapshot | null,
) {
  const db = await getDb();
  await db.begin(async (tx) => {
    await tx`
      INSERT INTO posts (id, source, uri, author_did, author_handle, body, lang, tags,
                         kind, permalink, published_at, media, content_hash)
      VALUES (${post.id}, ${post.source}, ${post.uri}, ${post.authorDid}, ${post.authorHandle},
              ${post.text}, ${post.lang}, ${post.tags}, ${post.kind}, ${post.permalink},
              ${post.publishedAt}, ${JSON.stringify(media)}::text::jsonb, ${post.contentHash})
      ON CONFLICT (id) DO UPDATE SET
        author_handle = COALESCE(EXCLUDED.author_handle, posts.author_handle),
        body = EXCLUDED.body,
        lang = EXCLUDED.lang,
        tags = EXCLUDED.tags,
        kind = EXCLUDED.kind,
        media = EXCLUDED.media,
        deleted_at = NULL
    `;

    await tx`
      INSERT INTO observations (post_id, segment_id, observed_at, via)
      VALUES (${post.id}, ${segmentId}, ${new Date().toISOString()}, ${"feed"})
      ON CONFLICT (post_id, segment_id) DO UPDATE SET observed_at = EXCLUDED.observed_at
    `;

    if (engagement) {
      await tx`
        INSERT INTO metric_snapshots (post_id, captured_at, likes, reposts, replies, quotes)
        VALUES (${post.id}, ${engagement.capturedAt}, ${engagement.likes}, ${engagement.reposts},
                ${engagement.replies}, ${engagement.quotes})
        ON CONFLICT (post_id, captured_at) DO NOTHING
      `;
    }
  });
}

/**
 * True when this post already has vectors. Embedding is the expensive step, so
 * an already-vectorized post costs one indexed lookup instead of three model
 * runs; Jetstream redelivery and overlapping feed pages both rely on this.
 */
async function alreadyVectorized(postId: string) {
  const db = await getDb();
  const rows = await db`
    SELECT 1 AS present FROM embeddings WHERE post_id = ${postId} LIMIT 1
  `;
  return rows.length > 0;
}

async function saveVectors(postId: string, vectors: PreparedVector[]) {
  if (vectors.length === 0) return;
  const db = await getDb();
  await db.begin(async (tx) => {
    for (const item of vectors) {
      await tx`
        INSERT INTO embeddings (post_id, space, model, dim, span, vec)
        VALUES (${postId}, ${item.space}, ${item.vector.model}, ${item.vector.dim}, ${item.span},
                ${toVectorLiteral(item.vector.values)}::vector)
        ON CONFLICT (post_id, model, span) DO UPDATE SET
          vec = EXCLUDED.vec, space = EXCLUDED.space, dim = EXCLUDED.dim
      `;
    }
  });
}

/**
 * Assign one span to the nearest sufficient cluster in its own space, or open a
 * new one. Comparison is against centroids only, so cost per vector is bounded
 * by cluster count, not corpus size.
 */
/** pgvector exposes no scalar multiply/divide, so centroid blending runs here. */
function blendCentroid(centroid: string, values: number[], weight: number) {
  const previous = centroid
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map(Number);

  const blended = Array.from({ length: values.length }, () => 0);
  for (let index = 0; index < values.length; index += 1) {
    const old = previous[index] ?? 0;
    blended[index] = (old * weight + values[index]!) / (weight + 1);
  }
  return blended;
}

async function assignCluster(postId: string, item: PreparedVector) {
  const db = await getDb();
  const threshold = JOIN_THRESHOLD[item.space];
  const literal = toVectorLiteral(item.vector.values);

  const candidates = (await db`
    SELECT id, member_count, centroid::text AS centroid,
           (1 - (centroid <=> ${literal}::vector)) AS similarity
    FROM clusters
    WHERE space = ${item.space}
      AND model = ${item.vector.model}
      AND last_seen_at > now() - ${`${CLUSTER_IDLE_HOURS} hours`}::interval
    ORDER BY centroid <=> ${literal}::vector
    LIMIT 1
  `) as unknown as Array<{
    id: string;
    member_count: number;
    centroid: string;
    similarity: number;
  }>;

  const best = candidates[0];
  if (best && Number(best.similarity) >= threshold) {
    const similarity = Number(best.similarity);
    const count = Number(best.member_count);

    // Compare against the actual members before accepting. A running-mean
    // centroid drifts: an early "good morning" cluster absorbed enough greetings
    // that its centroid sat among all of them, and a 67-member cluster of
    // mutually unrelated posts followed. Centroid distance is necessary but not
    // sufficient; the nearest-member check is what stops that drift.
    const [nearestRow] = (await db`
      SELECT coalesce(min(1 - (e.vec <=> ${literal}::vector)), 1)::float8 AS nearest
      FROM cluster_members cm
      JOIN embeddings e ON e.post_id = cm.post_id AND e.span = cm.span
      WHERE cm.cluster_id = ${best.id}
    `) as unknown as Array<{ nearest: number }>;

    if (Number(nearestRow?.nearest ?? 1) >= MEMBER_FLOOR[item.space]) {
      const centroid = toVectorLiteral(blendCentroid(best.centroid, item.vector.values, count));

      await db.begin(async (tx) => {
        await tx`
          UPDATE clusters
          SET centroid = ${centroid}::vector, member_count = member_count + 1, last_seen_at = now()
          WHERE id = ${best.id}
        `;
        await tx`
          INSERT INTO cluster_members (cluster_id, post_id, span, similarity)
          VALUES (${best.id}, ${postId}, ${item.span}, ${similarity})
          ON CONFLICT (cluster_id, post_id, span) DO NOTHING
        `;
      });
      return { clusterId: best.id, joined: true };
    }
    // Far from at least one existing member: fall through and open a new cluster.
  }

  // Cap growth rather than let singleton clusters multiply forever. Retiring a
  // cluster keeps its members, so already-grouped posts are never un-grouped.
  const [countRow] = await db`
    SELECT count(*)::int AS total FROM clusters WHERE space = ${item.space}
  `;
  if (Number(countRow?.total ?? 0) >= MAX_CLUSTERS_PER_SPACE) {
    await db`
      DELETE FROM clusters
      WHERE id IN (
        SELECT id FROM clusters WHERE space = ${item.space}
        ORDER BY last_seen_at ASC LIMIT ${RETIRED_CLUSTERS_PER_CYCLE}
      )
    `;
  }

  const clusterId = crypto.randomUUID();
  await db.begin(async (tx) => {
    await tx`
      INSERT INTO clusters (id, space, model, dim, centroid, member_count, first_seen_at, last_seen_at)
      VALUES (${clusterId}, ${item.space}, ${item.vector.model}, ${item.vector.dim},
              ${literal}::vector, 1, now(), now())
    `;
    await tx`
      INSERT INTO cluster_members (cluster_id, post_id, span, similarity)
      VALUES (${clusterId}, ${postId}, ${item.span}, 1)
    `;
  });
  return { clusterId, joined: false };
}

/**
 * Build every vector a post can support. Media extraction failures are counted
 * as unvectorized spans rather than aborting the post: a blocked Blob CDN must
 * not lose the text.
 */
async function vectorize(post: SocialPost, media: MediaRef[]) {
  const vectors: PreparedVector[] = [];

  const text = await embedText(post.text);
  if (text.status === "ok") {
    vectors.push({
      space: "text",
      span: TEXT_SPAN,
      vector: text.value,
      identity: TEXT_SPAN,
      // Short text is still stored and searchable; it just cannot be clustered.
      clusterable: post.text.trim().length >= MIN_CLUSTER_TEXT,
    });
  }

  for (const [index, item] of media.entries()) {
    if (item.kind === "image") {
      const blob = await fetchImage(item.url);
      if (blob.status !== "ok") continue;
      const vector = await embedImage(blob.value);
      if (vector.status === "ok") {
        vectors.push({
          space: "image",
          span: `image:${index}`,
          vector: vector.value,
          identity: `image:${item.cid}`,
          clusterable: true,
        });
      }
      continue;
    }

    if (item.kind === "video") {
      const frames = await extractVideoFrames(item.url);
      if (frames.status === "ok") {
        for (const [frameIndex, frame] of frames.value.entries()) {
          const vector = await embedImage(frame);
          if (vector.status === "ok") {
            vectors.push({
              space: "image",
              // Frame index keeps temporal order visible in the span name.
              span: `video:${index}:frame:${frameIndex}`,
              vector: vector.value,
              identity: `video:${item.cid}:${frameIndex}`,
              // Individual frames are unstable evidence: a 100 ms shift changes
              // the image. They stay searchable but do not form their own clusters.
              clusterable: false,
            });
          }
        }
      }
      const audio = await extractAudio(item.url);
      if (audio.status === "ok") {
        const vector = await embedAudio(audio.value);
        if (vector.status === "ok") {
          vectors.push({
            space: "audio",
            span: `video:${index}:audio`,
            vector: vector.value,
            identity: `video:${item.cid}:audio`,
            clusterable: true,
          });
        }
      }
      continue;
    }

    if (item.kind === "audio") {
      const audio = await extractAudio(item.url);
      if (audio.status !== "ok") continue;
      const vector = await embedAudio(audio.value);
      if (vector.status === "ok") {
        vectors.push({
          space: "audio",
          span: `audio:${index}`,
          vector: vector.value,
          identity: `audio:${item.cid}`,
          clusterable: true,
        });
      }
    }
  }

  return vectors;
}

/**
 * Pull one page per segment and process it. Errors are collected per segment so
 * one broken feed cannot stop the others; the caller surfaces them as coverage
 * gaps rather than reporting zero posts for that segment.
 */
export async function ingestSegments(
  options: {
    limitPerSegment?: number;
    segmentIds?: string[];
  } = {},
): Promise<IngestReport> {
  const limit = Math.min(options.limitPerSegment ?? 20, MAX_INGEST_POSTS_PER_SEGMENT);
  const segments = options.segmentIds
    ? VIEWER_SEGMENTS.filter((segment) => options.segmentIds!.includes(segment.id))
    : VIEWER_SEGMENTS;

  const report: IngestReport = {
    segments: 0,
    fetched: 0,
    stored: 0,
    observations: 0,
    vectors: 0,
    unvectorized: 0,
    clusters: 0,
    skippedLanguage: 0,
    errors: [],
  };

  const seenPosts = new Set<string>();

  for (const segment of segments) {
    report.segments += 1;
    // `handled` counts posts accepted into THIS segment, not items inspected.
    // Overlapping popular posts must not consume the budget, or a niche feed
    // spends its whole allowance on content already collected.
    let handled = 0;
    let exhausted = false;

    for (const feed of segment.feeds) {
      if (handled >= limit) break;
      let cursor: string | null = null;

      for (let pageIndex = 0; pageIndex < MAX_PAGES_PER_FEED; pageIndex += 1) {
        if (handled >= limit) break;

        let page;
        try {
          page = await fetchFeedPage(feed, cursor, Math.min(limit, 50));
        } catch (error) {
          report.errors.push({
            segmentId: segment.id,
            message: error instanceof Error ? error.message : "feed failed",
          });
          break;
        }

        cursor = page.cursor;
        if (page.posts.length === 0) {
          // An empty page with no cursor is the end of the feed, not an error.
          exhausted = true;
          break;
        }

        for (const item of page.posts) {
          if (handled >= limit) break;
          report.fetched += 1;

          try {
            const isNew = !seenPosts.has(item.post.id);
            seenPosts.add(item.post.id);

            // English-only collection is a declared scope, so a post tagged
            // exclusively with other languages is skipped before it costs an
            // embedding. Untagged posts are kept: absence of a tag is unknown,
            // not evidence of another language.
            if (!declaresEnglish(item.post.lang)) {
              report.skippedLanguage += 1;
              continue;
            }

            await storePost(item.post, item.media, segment.id, engagementOf(item.engagement));
            report.observations += 1;
            handled += 1;

            // A post seen in a second segment is still a new observation for
            // that segment, but its vectors already exist and must not be
            // recomputed.
            if (!isNew || (await alreadyVectorized(item.post.id))) continue;

            const vectors = await vectorize(item.post, item.media);
            await saveVectors(item.post.id, vectors);
            report.vectors += vectors.length;

            if (vectors.length === 0) report.unvectorized += 1;

            for (const vector of vectors) {
              if (vector.clusterable) await assignCluster(item.post.id, vector);
            }

            report.stored += 1;
          } catch (error) {
            report.unvectorized += 1;
            report.errors.push({
              segmentId: segment.id,
              message: error instanceof Error ? error.message : "post failed",
            });
          }
        }

        // No cursor means there is nothing further back to read.
        if (!cursor || page.posts.length === 0) {
          exhausted = true;
          break;
        }
      }

      if (exhausted) continue;
    }
  }

  return report;
}

/**
 * Handle one live tail event. Creates and updates are both upserts: Jetstream
 * redelivers after reconnects and an update carries a full record, so treating
 * them the same is correct and idempotent. A delete tombstones the post and
 * drops its vectors, which is what a takedown requires.
 */
export async function ingestTailEvent(event: TailEvent) {
  const db = await getDb();

  if (event.operation === "delete") {
    await db`UPDATE posts SET deleted_at = now() WHERE source = ${"bluesky"} AND uri = ${event.uri}`;
    await db`DELETE FROM embeddings WHERE post_id = ${event.uri}`;
    await db`DELETE FROM cluster_members WHERE post_id = ${event.uri}`;
    return { deleted: true as const };
  }

  if (!event.record) return { skipped: true as const };

  const { post, media } = toTailPost(event);
  if (!declaresEnglish(post.lang)) return { skippedLanguage: true as const };
  // The tail carries no viewer segment: it is the whole network, so the
  // observation is attributed to the discovery pool and never to an audience.
  await storePost(post, media, "discover", null);

  if (await alreadyVectorized(post.id)) return { duplicate: true as const };

  const vectors = await vectorize(post, media);
  await saveVectors(post.id, vectors);
  for (const vector of vectors) {
    if (vector.clusterable) await assignCluster(post.id, vector);
  }
  return { stored: true as const, vectors: vectors.length };
}

/**
 * Convert a tail record with the same parser the feed path uses, so a video
 * post observed live carries its frames and audio just like one from a page.
 * The record arrives already decoded but in raw (blob-ref) form.
 */
function toTailPost(event: TailEvent) {
  const record = event.record ?? {};
  const embed = record.embed;
  return toSocialPost({
    uri: event.uri,
    did: event.did,
    handle: null,
    record: {
      text: typeof record.text === "string" ? record.text : "",
      langs: Array.isArray(record.langs) ? (record.langs as string[]) : [],
      tags: Array.isArray(record.tags) ? (record.tags as string[]) : [],
      createdAt: typeof record.createdAt === "string" ? record.createdAt : event.time,
    },
    embed,
    indexedAt: event.time,
  });
}

/**
 * Rebuild cluster membership from the stored vectors.
 *
 * Ingest skips already-vectorized posts, so any change to a join threshold — or
 * a repaired cluster table — leaves existing vectors unassigned. This walks them
 * in publication order and re-runs assignment, which is the operational path for
 * a threshold change. Vectors are never recomputed; only membership is.
 */
export async function recluster(options: { space?: Space; limit?: number } = {}) {
  const db = await getDb();
  const space = options.space;
  const limit = options.limit ?? 5_000;

  const rows = (await db`
    SELECT e.post_id, e.space, e.model, e.dim, e.span, e.vec::text AS vec,
           length(p.body) AS body_length
    FROM embeddings e
    JOIN posts p ON p.id = e.post_id
    WHERE p.deleted_at IS NULL
      AND (${space ?? null}::text IS NULL OR e.space = ${space ?? null})
    ORDER BY p.published_at ASC
    LIMIT ${limit}
  `) as unknown as Array<{
    post_id: string;
    space: Space;
    model: string;
    dim: number;
    span: string;
    vec: string;
    body_length: number;
  }>;

  await db`DELETE FROM cluster_members`;
  await db`DELETE FROM clusters`;

  let assigned = 0;
  for (const row of rows) {
    // Same rule as ingest: very short text has no separable direction.
    if (row.space === "text" && Number(row.body_length) < MIN_CLUSTER_TEXT) continue;
    if (row.space === "image" && row.span.includes(":frame:")) continue;

    const values = row.vec
      .replace(/^\[|\]$/g, "")
      .split(",")
      .slice(0, row.dim)
      .map(Number);

    await assignCluster(row.post_id, {
      space: row.space,
      span: row.span,
      vector: { space: row.space, model: row.model, dim: row.dim, values },
      identity: row.span,
      clusterable: true,
    });
    assigned += 1;
  }

  return { vectors: rows.length, assigned };
}

/* ------------------------------------------------------------------ *
 * Read side: clusters, coverage, crossings.
 * ------------------------------------------------------------------ */

/** Row shapes returned by the read queries; Bun.SQL types results as unknown. */
interface MemberRow {
  id: string;
  permalink: string;
  body: string | null;
  author_handle: string | null;
  kind: string;
  media: unknown;
  published_at: Date;
  segments: string[] | null;
  observed_at: Date | null;
}

interface SearchRow {
  id: string;
  permalink: string;
  body: string | null;
  author_handle: string | null;
  kind: string;
  published_at: Date;
}

interface ClusterRow {
  id: string;
  space: string;
  member_count: number;
  post_count: number;
  first_seen_at: Date;
  last_seen_at: Date;
  cohesion: number | null;
}

/**
 * Cluster list with crossings. A crossing counts distinct *collection*
 * segments, so a post that also appeared in the whole-network pool cannot
 * inflate adoption.
 */
export async function listClusters(limit = 20): Promise<PatternCluster[]> {
  const db = await getDb();
  const adoptionIds = ADOPTION_SEGMENTS.map((segment) => segment.id);

  // `size` counts distinct posts, not vectors: one post contributes a text
  // span plus one span per image, and counting spans would inflate a gallery.
  const rows = (await db`
    SELECT c.id, c.space::text AS space, c.member_count,
           (SELECT count(DISTINCT cm.post_id)::int FROM cluster_members cm WHERE cm.cluster_id = c.id) AS post_count,
           c.first_seen_at, c.last_seen_at,
           (SELECT avg(cm.similarity)::float8 FROM cluster_members cm WHERE cm.cluster_id = c.id) AS cohesion
    FROM clusters c
    WHERE c.member_count > 0
    ORDER BY post_count DESC, c.last_seen_at DESC
    LIMIT ${limit}
  `) as unknown as ClusterRow[];

  return Promise.all(rows.map((row) => describeCluster(row, adoptionIds)));
}

async function describeCluster(row: ClusterRow, adoptionIds: string[]): Promise<PatternCluster> {
  const db = await getDb();

  // Members that are still present (a takedown removes the member row) and
  // their segments, so the UI can show which audiences saw the pattern.
  const members = (await db`
    SELECT p.id, p.permalink, p.body, p.author_handle, p.kind, p.media,
           p.published_at,
           array_remove(array_agg(DISTINCT o.segment_id), NULL) AS segments,
           min(o.observed_at) AS observed_at
    FROM cluster_members cm
    JOIN posts p ON p.id = cm.post_id
    LEFT JOIN observations o ON o.post_id = p.id
    WHERE cm.cluster_id = ${row.id} AND p.deleted_at IS NULL
    GROUP BY p.id, p.permalink, p.body, p.author_handle, p.kind, p.media, p.published_at
    ORDER BY p.published_at DESC
    LIMIT 6
  `) as unknown as MemberRow[];

  const segmentIds = new Set<string>();
  const examples: ClusterExample[] = members.map((member) => {
    const memberSegments = Array.isArray(member.segments) ? (member.segments as string[]) : [];
    for (const id of memberSegments) if (adoptionIds.includes(id)) segmentIds.add(id);
    const media: unknown[] = Array.isArray(member.media) ? member.media : [];
    return {
      uri: String(member.id),
      permalink: String(member.permalink),
      text: String(member.body ?? "").slice(0, 240),
      authorHandle: member.author_handle ? String(member.author_handle) : null,
      kind: String(member.kind) as PostKind,
      mediaCount: media.length,
      segments: memberSegments,
      observedAt: (member.observed_at ?? member.published_at).toISOString(),
    };
  });

  const label =
    examples
      .find((example) => example.text.trim().length > 0)
      ?.text.trim()
      .slice(0, 90) ?? "(media-only cluster)";

  return {
    id: row.id,
    label,
    kind: examples[0]?.kind ?? "text",
    size: Number(row.post_count),
    segments: [...segmentIds],
    // A crossing is a move *between* audiences: one segment is the baseline,
    // each additional segment is one crossing. Counting segments would make
    // every single-audience cluster look like it crossed.
    crossings: Math.max(0, segmentIds.size - 1),
    firstSeenAt: row.first_seen_at.toISOString(),
    lastSeenAt: row.last_seen_at.toISOString(),
    cohesion: row.cohesion === null ? 0 : Math.max(0, Math.min(1, Number(row.cohesion))),
    examples,
  };
}

/**
 * Per-segment counts for the requested window. `lastObservedAt` is null and
 * `error` is set when the segment failed this cycle: an outage is unknown
 * volume, not zero volume.
 */
export async function segmentCoverage(windowHours: number): Promise<SegmentCoverage[]> {
  const db = await getDb();
  const rows = (await db`
    SELECT o.segment_id,
           count(DISTINCT o.post_id)::int AS posts,
           count(DISTINCT o.post_id) FILTER (WHERE p.kind IN ('image', 'video', 'audio'))::int AS media_posts,
           max(o.observed_at) AS last_observed_at
    FROM observations o
    JOIN posts p ON p.id = o.post_id
    WHERE o.observed_at > now() - ${`${windowHours} hours`}::interval
      AND p.deleted_at IS NULL
    GROUP BY o.segment_id
  `) as unknown as Array<{
    segment_id: string;
    posts: number;
    media_posts: number;
    last_observed_at: Date | null;
  }>;

  const byId = new Map(rows.map((row) => [row.segment_id, row]));
  return VIEWER_SEGMENTS.map((segment) => {
    const row = byId.get(segment.id);
    return {
      segmentId: segment.id,
      label: segment.label,
      posts: Number(row?.posts ?? 0),
      mediaPosts: Number(row?.media_posts ?? 0),
      lastObservedAt: row?.last_observed_at?.toISOString() ?? null,
    };
  });
}

/** Whole-panel payload: counts, coverage, and the ranked clusters behind them. */
export async function socialSignals(windowHours = 72): Promise<SocialSignals> {
  const db = await getDb();
  const [stats] = await db`
    SELECT
      (SELECT count(*)::int FROM posts
        WHERE deleted_at IS NULL
          AND published_at > now() - ${`${windowHours} hours`}::interval) AS posts,
      (SELECT count(*)::int FROM observations
        WHERE observed_at > now() - ${`${windowHours} hours`}::interval) AS observations,
      (SELECT count(*)::int FROM clusters) AS clusters,
      (SELECT count(*)::int FROM posts p
        WHERE p.deleted_at IS NULL
          AND p.published_at > now() - ${`${windowHours} hours`}::interval
          AND NOT EXISTS (SELECT 1 FROM embeddings e WHERE e.post_id = p.id)) AS unvectorized
  `;

  const [coverage, clusters] = await Promise.all([segmentCoverage(windowHours), listClusters(20)]);

  return {
    windowHours,
    generatedAt: new Date().toISOString(),
    stats: {
      posts: Number(stats?.posts ?? 0),
      observations: Number(stats?.observations ?? 0),
      clusters: Number(stats?.clusters ?? 0),
      crossings: clusters.filter((cluster) => cluster.crossings >= 1).length,
      unvectorized: Number(stats?.unvectorized ?? 0),
    },
    coverage,
    clusters,
  };
}

/**
 * Search across spaces by fusing ranks with reciprocal rank fusion. Raw cosine
 * values from three different models are not comparable, so only their order
 * is used; that is what makes one ranked list honest rather than a weighted sum
 * of unrelated scales.
 */
export async function searchAcrossSpaces(text: string, limit = 10) {
  const db = await getDb();
  const [textVector, imageVector] = await Promise.all([embedText(text), embedClipText(text)]);

  const ranks = new Map<string, number>();
  const k = 60;

  const collect = async (space: Space, literal: string) => {
    const rows = (await db`
      SELECT post_id, 1 - (vec <=> ${literal}::vector) AS similarity
      FROM embeddings
      WHERE space = ${space} AND model = ${SPACE_MODELS[space].model}
      ORDER BY vec <=> ${literal}::vector
      LIMIT ${limit * 4}
    `) as unknown as Array<{ post_id: string }>;

    // Reciprocal rank fusion: only the order from each space is used, because
    // cosine values from three models are on unrelated scales.
    for (const [index, row] of rows.entries()) {
      const id = String(row.post_id);
      ranks.set(id, (ranks.get(id) ?? 0) + 1 / (k + index + 1));
    }
  };

  if (textVector.status === "ok") {
    await collect("text", toVectorLiteral(textVector.value.values));
  }
  if (imageVector.status === "ok") {
    await collect("image", toVectorLiteral(imageVector.value.values));
  }

  const ordered = [...ranks.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
  if (ordered.length === 0) return [];

  const ids = ordered.map(([id]) => id);
  const posts = (await db`
    SELECT id, permalink, body, author_handle, kind, published_at
    FROM posts WHERE id = ANY(${ids}) AND deleted_at IS NULL
  `) as unknown as SearchRow[];
  const byId = new Map(posts.map((post) => [post.id, post]));

  return ordered
    .map(([id, score]) => {
      const post = byId.get(id);
      if (!post) return null;
      return {
        uri: id,
        permalink: String(post.permalink),
        text: String(post.body ?? ""),
        authorHandle: post.author_handle ? String(post.author_handle) : null,
        kind: String(post.kind) as PostKind,
        publishedAt: post.published_at.toISOString(),
        score,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

/**
 * Start the live tail. Reconnects with exponential backoff and resumes from the
 * last processed seq, which Jetstream treats as inclusive. Processing is
 * serialized so a slow media download cannot reorder observations.
 */
export function startTail(
  options: {
    onError?: (error: Error) => void;
    /** Every Nth create is processed; deletes always are, so takedowns are never sampled away. */
    sampleRate?: number;
  } = {},
) {
  const rate = Math.max(1, Math.round(options.sampleRate ?? TAIL_SAMPLE_RATE));

  let socket: WebSocket | null = null;
  let closed = false;
  let cursor: string | undefined;
  let backoff = 1_000;
  let seen = 0;
  let dropped = 0;
  let processing = false;
  const pending: TailEvent[] = [];

  const drain = async () => {
    if (processing) return;
    processing = true;
    try {
      while (pending.length > 0) {
        const event = pending.shift()!;
        try {
          await ingestTailEvent(event);
        } catch (error) {
          options.onError?.(error instanceof Error ? error : new Error(String(error)));
        }
      }
    } finally {
      processing = false;
    }
  };

  const connect = () => {
    if (closed) return;
    socket = openTail({
      cursor,
      onEvent: (event) => {
        cursor = String(event.seq);
        // Deletes must always apply: a takedown that was sampled away would keep
        // removed content in the graph and in every cluster it joined.
        if (event.operation === "create" || event.operation === "update") {
          seen += 1;
          if (seen % rate !== 0) return;
        }
        if (pending.length >= TAIL_QUEUE_LIMIT) {
          pending.shift();
          dropped += 1;
        }
        pending.push(event);
        void drain();
      },
      onError: (error) => options.onError?.(error),
      onClose: () => {
        if (closed) return;
        backoff = Math.min(backoff * 2, 30_000);
        setTimeout(connect, backoff);
      },
    });
  };

  connect();

  return {
    stop() {
      closed = true;
      socket?.close();
      socket = null;
      pending.length = 0;
    },
    get open() {
      return socket?.readyState === WebSocket.OPEN;
    },
    /** Sampling and drop counters, so coverage can state what the tail skipped. */
    get counters() {
      return {
        seen,
        processed: seen === 0 ? 0 : Math.floor(seen / rate),
        dropped,
        sampleRate: rate,
      };
    },
  };
}

/** Exposed for tests: the join threshold is the whole clustering contract. */
export const CLUSTER_THRESHOLDS = JOIN_THRESHOLD;

/** Vector extraction result used by tests to assert failure semantics. */
export type VectorExtraction = Extraction<Vector>;
