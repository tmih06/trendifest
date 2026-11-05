import { VIEWER_SEGMENTS } from "../../shared/segments.ts";
import type {
  EvidenceType,
  PostKind,
  SegmentCoverage,
  SocialSource,
  SourceTimeKind,
  TopicExample,
  TrendMap,
  TrendMapEdge,
  TrendMapNode,
  TrendScore,
} from "../../shared/types.ts";
import { getDb } from "../db.ts";
import { segmentCoverage } from "./pipeline.ts";
import { TOPIC_DIM, TOPIC_MODEL } from "./topic-embedding.ts";
import {
  GROUPING_THRESHOLD,
  VELOCITY_WINDOW_HOURS,
  groupSpecificTopics,
  radiusForPotential,
  relatedTopicEdges,
  scoreTopic,
  type TopicEvidence,
  type TopicGroup,
  type TopicScoreOptions,
} from "./topics.ts";

/**
 * The map payload: specific topics built from stored records.
 *
 * Read path rules that shape this module:
 *
 * - A record participates only when it has a topic vector that matches its
 *   current text hash. Vectors are never computed here: no GET pays inference
 *   cost, and a stale vector is reported as pending instead of being used.
 * - The public graph is *not* the near-copy cluster graph. Clusters answer
 *   "same text"; the map answers "same event/product", which is what
 *   `topics.ts` measures.
 * - Nothing here needs the near-copy cluster tables, so a map renders from posts
 *   and their topic vectors alone.
 * - Counts are distinct underlying records: one post observed twice is one post,
 *   and a news report republished by the same publisher is one report.
 */

const HOURS_DEFAULT = 168;
/**
 * Candidate ceiling. A bounded window keeps the payload and the O(n²) pair
 * comparisons predictable; `stats.limited` says so rather than silently
 * truncating a busy window.
 */
const MAX_CANDIDATE_POSTS = 600;
/** Drawn topics. Beyond this the canvas stops being readable, not more truthful. */
const MAX_TOPIC_NODES = 90;
/** Per-segment share, so one prolific feed cannot decide the map's shape alone. */
const MIN_TOPICS_PER_SEGMENT = 3;
/** Supporting records per node; each stays well inside the payload budget. */
const MAX_EXAMPLES = 3;

/** One stored record with its vector and metadata, as the query returns it. */
interface CandidateRow {
  id: string;
  title: string;
  body: string;
  source: SocialSource;
  evidence_type: EvidenceType;
  publisher: string | null;
  author_id: string;
  author_handle: string | null;
  permalink: string;
  kind: PostKind;
  time_kind: SourceTimeKind;
  media_count: number;
  content_hash: string;
  published_at: Date;
  first_collected_at: Date;
  observed_at: Date;
  segments: string[] | null;
  vec: string;
  likes: string | null;
  shares: string | null;
}

/**
 * Parse a pgvector literal. The vector arrives as text because the client
 * library has no vector type; anything unparseable is treated as absent rather
 * than as a zero vector, which would silently match everything.
 */
function parseVector(literal: string): number[] | null {
  if (typeof literal !== "string") return null;
  const body = literal.startsWith("[") ? literal.slice(1, -1) : literal;
  if (!body) return null;
  const values = body.split(",").map(Number);
  if (values.length === 0) return null;
  for (const value of values) if (!Number.isFinite(value)) return null;
  return values;
}

function finiteNumber(value: string | number | null): number | undefined {
  if (value === null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toEvidence(row: CandidateRow, vector: number[]): TopicEvidence {
  return {
    id: row.id,
    title: row.title,
    text: row.body,
    source: row.source,
    evidenceType: row.evidence_type,
    publisher: row.publisher,
    authorId: row.author_id,
    authorHandle: row.author_handle,
    permalink: row.permalink,
    kind: row.kind,
    timeKind: row.time_kind,
    mediaCount: Number(row.media_count ?? 0),
    contentHash: row.content_hash,
    publishedAt: new Date(row.published_at),
    firstCollectedAt: new Date(row.first_collected_at),
    observedAt: new Date(row.observed_at),
    segments: row.segments ?? [],
    vector,
    likes: finiteNumber(row.likes),
    shares: finiteNumber(row.shares),
  };
}

/** A node label must name the event, so a body paragraph never becomes one. */
function exampleFor(evidence: TopicEvidence): TopicExample {
  return {
    uri: evidence.id,
    permalink: evidence.permalink,
    source: evidence.source,
    timeKind: evidence.timeKind,
    text: evidence.text.slice(0, 600),
    authorHandle: evidence.authorHandle,
    kind: evidence.kind,
    mediaCount: evidence.mediaCount,
    segments: evidence.segments,
    observedAt: evidence.observedAt.toISOString(),
    title: evidence.title,
    evidenceType: evidence.evidenceType,
    publisher: evidence.publisher,
    publishedAt: evidence.publishedAt.toISOString(),
  };
}

/**
 * Supporting records for the inspector: newest first, at most three, and never
 * the representative twice. Titles carry attribution, so the reader can open
 * the original rather than trusting a summary.
 */
function examplesFor(group: TopicGroup): TopicExample[] {
  return [...group.members]
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime() || a.id.localeCompare(b.id))
    .slice(0, MAX_EXAMPLES)
    .map(exampleFor);
}

function nodeFor(group: TopicGroup, score: TrendScore): TrendMapNode {
  const posts = group.discussionPosts + group.newsPosts;
  const evidence = [
    `${posts} ${posts === 1 ? "record" : "records"}`,
    group.discussionPosts > 0
      ? `${group.discussionPosts} community post${group.discussionPosts === 1 ? "" : "s"} from ${group.authors} account${group.authors === 1 ? "" : "s"}`
      : null,
    group.newsPosts > 0
      ? `${group.newsPosts} news report${group.newsPosts === 1 ? "" : "s"} from ${group.publishers} publisher${group.publishers === 1 ? "" : "s"}`
      : null,
    group.segments.length > 0
      ? `observed in ${group.segments.length} collection context${group.segments.length === 1 ? "" : "s"}`
      : null,
  ].filter(Boolean);

  const likes = group.members.reduce<number | undefined>(
    (total, member) => (member.likes === undefined ? total : (total ?? 0) + member.likes),
    undefined,
  );
  const shares = group.members.reduce<number | undefined>(
    (total, member) => (member.shares === undefined ? total : (total ?? 0) + member.shares),
    undefined,
  );

  return {
    id: group.id,
    kind: "topic",
    label: group.label,
    description: `${evidence.join("; ")}. Heuristic grouping of records that describe one specific event, not a calibrated probability.`,
    radius: radiusForPotential(score.potential),
    potential: score.potential,
    posts,
    authors: group.authors,
    segments: group.segments.filter((id) => VIEWER_SEGMENTS.some((segment) => segment.id === id)),
    score,
    discussionPosts: group.discussionPosts,
    newsPosts: group.newsPosts,
    publishers: group.publishers,
    mediaCount: group.members.reduce((total, member) => total + member.mediaCount, 0),
    likes,
    shares,
    firstSeenAt: group.firstSeenAt.toISOString(),
    lastSeenAt: group.lastSeenAt.toISOString(),
    examples: examplesFor(group),
  };
}

/** The wire edge shape, built from the measured related-topic pairs. */
function edgesFor(groups: readonly TopicGroup[], ids: Set<string>): TrendMapEdge[] {
  return relatedTopicEdges(groups)
    .filter((edge) => ids.has(edge.source) && ids.has(edge.target) && edge.source !== edge.target)
    .map((edge) => ({
      // Deterministic and unique for the undirected pair, so a client can key on it.
      id: `related:${edge.source}:${edge.target}`,
      source: edge.source,
      target: edge.target,
      relation: "related" as const,
      weight: edge.weight,
      similarity: edge.similarity,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Stratified selection: each collection context contributes its strongest
 * topics first, then remaining slots go by potential. Without the floor the
 * map's shape is decided by whichever feed emits the most posts.
 */
function selectGroups(
  groups: readonly TopicGroup[],
  limit: number,
  scoreOptions: TopicScoreOptions,
) {
  const scored = groups
    .map((group) => ({ group, score: scoreTopic(group, scoreOptions) }))
    .sort((a, b) => b.score.potential - a.score.potential || a.group.id.localeCompare(b.group.id));

  const chosen: typeof scored = [];
  const taken = new Set<string>();
  for (const segment of VIEWER_SEGMENTS) {
    const owned = scored.filter(
      (item) => !taken.has(item.group.id) && item.group.segments.includes(segment.id),
    );
    for (const item of owned.slice(0, MIN_TOPICS_PER_SEGMENT)) {
      chosen.push(item);
      taken.add(item.group.id);
    }
  }
  for (const item of scored) {
    if (chosen.length >= limit) break;
    if (taken.has(item.group.id)) continue;
    chosen.push(item);
    taken.add(item.group.id);
  }
  return chosen.slice(0, limit);
}

/**
 * How much collection history exists. Velocity compares two collection windows,
 * so the collector needs at least twice the window before growth is a
 * measurement rather than a guess.
 *
 * Use immutable first-collection timestamps, including rows outside this map's
 * window. Older observation logs cannot reconstruct first collection for rows
 * migrated at cutover; treating them as history would invent a growth baseline.
 */
async function observedSpanHours() {
  const db = await getDb();
  const [row] = (await db`
    SELECT extract(epoch FROM (now() - coalesce(min(first_collected_at), now()))) / 3600 AS span
    FROM posts
  `) as unknown as Array<{ span: number | null }>;
  return Number(row?.span ?? 0);
}

export async function buildTrendMap(hours = HOURS_DEFAULT): Promise<TrendMap> {
  const db = await getDb();
  const adoptionIds = VIEWER_SEGMENTS.map((segment) => segment.id);

  /**
   * One row per stored post with a *valid* topic vector, plus any post that has
   * no valid vector at all. A post whose vector belongs to older text is not
   * silently mapped with stale meaning: it is counted as pending.
   */
  const rows = (await db`
    SELECT p.id, p.title, p.body, p.source, p.evidence_type, p.publisher,
           p.author_id, p.author_handle, p.permalink, p.kind, p.time_kind,
           p.content_hash, p.published_at, p.first_collected_at,
           jsonb_array_length(p.media) AS media_count,
           t.vec::text AS vec,
           max(o.observed_at) AS observed_at,
           array_agg(DISTINCT o.segment_id) FILTER (WHERE o.segment_id IS NOT NULL) AS segments,
           (SELECT ms.likes FROM metric_snapshots ms WHERE ms.post_id = p.id) AS likes,
           (SELECT CASE WHEN ms.reposts IS NULL AND ms.quotes IS NULL THEN NULL
                        ELSE coalesce(ms.reposts, 0) + coalesce(ms.quotes, 0) END
              FROM metric_snapshots ms WHERE ms.post_id = p.id) AS shares
    FROM posts p
    JOIN topic_embeddings t ON t.post_id = p.id
      AND t.model = ${TOPIC_MODEL} AND t.content_hash = p.content_hash
    JOIN observations o ON o.post_id = p.id
    WHERE p.deleted_at IS NULL
      AND p.published_at > now() - ${`${hours} hours`}::interval
      AND o.observed_at > now() - ${`${hours} hours`}::interval
      AND o.segment_id = ANY(${adoptionIds}::text[])
    GROUP BY p.id, t.vec
    ORDER BY p.published_at DESC, p.id
    LIMIT ${MAX_CANDIDATE_POSTS}
  `) as unknown as CandidateRow[];

  const [pendingRow] = (await db`
    SELECT count(*)::int AS pending
    FROM posts p
    WHERE p.deleted_at IS NULL
      AND p.published_at > now() - ${`${hours} hours`}::interval
      AND EXISTS (SELECT 1 FROM observations o
                   WHERE o.post_id = p.id
                     AND o.observed_at > now() - ${`${hours} hours`}::interval
                     AND o.segment_id = ANY(${adoptionIds}::text[]))
      AND NOT EXISTS (
        SELECT 1 FROM topic_embeddings t
        WHERE t.post_id = p.id AND t.model = ${TOPIC_MODEL}
          AND t.content_hash = p.content_hash
      )
  `) as unknown as Array<{ pending: number }>;

  const records: TopicEvidence[] = [];
  for (const row of rows) {
    const vector = parseVector(row.vec);
    // An unparseable or wrong-width vector is unknown evidence, not a record to
    // group on: only the topic model's own width is comparable.
    if (!vector || vector.length !== TOPIC_DIM) continue;
    records.push(toEvidence(row, vector));
  }

  const coverage: SegmentCoverage[] = await segmentCoverage(hours);
  const spanHours = await observedSpanHours();
  const velocityComparable = spanHours >= VELOCITY_WINDOW_HOURS * 2;
  // Ranking and the payload must use one set of scoring inputs, or the strongest
  // topic could be selected on one velocity reading and drawn with another.
  const scoreOptions: TopicScoreOptions = { observedSpanHours: spanHours };

  const allGroups = groupSpecificTopics(records);
  const selected = selectGroups(allGroups, MAX_TOPIC_NODES, scoreOptions);
  const selectedGroups = selected.map((item) => item.group);
  const nodes = selected.map((item) => nodeFor(item.group, item.score));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = edgesFor(selectedGroups, nodeIds);

  const discussionPosts = nodes.reduce((total, node) => total + node.discussionPosts, 0);
  const newsPosts = nodes.reduce((total, node) => total + node.newsPosts, 0);

  return {
    hours,
    generatedAt: new Date().toISOString(),
    nodes,
    edges,
    coverage,
    stats: {
      posts: records.length,
      topics: nodes.length,
      discussionPosts,
      newsPosts,
      pendingEmbeddings: Number(pendingRow?.pending ?? 0),
      limited: rows.length >= MAX_CANDIDATE_POSTS || allGroups.length > nodes.length,
    },
    method: {
      version: 3,
      velocityWindowHours: VELOCITY_WINDOW_HOURS,
      weights: { reach: 0.34, velocity: 0.26, spread: 0.18, persistence: 0.12, diversity: 0.1 },
      topicModel: TOPIC_MODEL,
      groupingThreshold: GROUPING_THRESHOLD,
      velocityComparable,
    },
  };
}
