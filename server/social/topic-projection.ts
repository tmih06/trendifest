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

export const MAX_CANDIDATE_POSTS = 8_000;
export const MAX_TOPIC_NODES = 1_500;
const MIN_TOPICS_PER_SEGMENT = 3;
const MAX_EXAMPLES = 3;

/** Structured-clone input: no database connection or model enters the worker. */
export interface TopicProjectionInput {
  rows: CandidateRow[];
  hours: number;
  pending: number;
  coverage: SegmentCoverage[];
  observedSpanHours: number;
  generatedAt: string;
  topicModel: string;
  topicDimension: number;
  limited: boolean;
}

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

/** Invalid vectors remain unknown, never a zero vector that matches everything. */
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

/** At most three source-grounded records, newest first. */
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

function edgesFor(groups: readonly TopicGroup[], ids: Set<string>): TrendMapEdge[] {
  return relatedTopicEdges(groups)
    .filter((edge) => ids.has(edge.source) && ids.has(edge.target) && edge.source !== edge.target)
    .map((edge) => ({
      id: `related:${edge.source}:${edge.target}`,
      source: edge.source,
      target: edge.target,
      relation: "related" as const,
      weight: edge.weight,
      similarity: edge.similarity,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Preserve a small source floor, then select by measured potential. */
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

/** CPU-only projection, run outside the HTTP event loop. */
export function projectTopicMap(input: TopicProjectionInput): TrendMap {
  const records: TopicEvidence[] = [];
  for (const row of input.rows) {
    const vector = parseVector(row.vec);
    if (!vector || vector.length !== input.topicDimension) continue;
    records.push(toEvidence(row, vector));
  }
  const scoreOptions: TopicScoreOptions = {
    now: new Date(input.generatedAt),
    observedSpanHours: input.observedSpanHours,
  };
  const allGroups = groupSpecificTopics(records);
  const selected = selectGroups(allGroups, MAX_TOPIC_NODES, scoreOptions);
  const nodes = selected.map((item) => nodeFor(item.group, item.score));
  const edges = edgesFor(
    selected.map((item) => item.group),
    new Set(nodes.map((node) => node.id)),
  );
  return {
    hours: input.hours,
    generatedAt: input.generatedAt,
    nodes,
    edges,
    coverage: input.coverage,
    stats: {
      posts: records.length,
      topics: nodes.length,
      discussionPosts: nodes.reduce((total, node) => total + node.discussionPosts, 0),
      newsPosts: nodes.reduce((total, node) => total + node.newsPosts, 0),
      pendingEmbeddings: input.pending,
      limited: input.limited || allGroups.length > nodes.length,
    },
    method: {
      version: 3,
      velocityWindowHours: VELOCITY_WINDOW_HOURS,
      weights: { reach: 0.34, velocity: 0.26, spread: 0.18, persistence: 0.12, diversity: 0.1 },
      topicModel: input.topicModel,
      groupingThreshold: GROUPING_THRESHOLD,
      velocityComparable: input.observedSpanHours >= VELOCITY_WINDOW_HOURS * 2,
    },
  };
}
