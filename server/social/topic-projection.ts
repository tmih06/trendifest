import { extractTopicEntities } from "../../shared/entities.ts";
import type { TopicEntity } from "../../shared/intelligence.ts";
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
  buildTopicGroup,
  groupSpecificTopics,
  prepare,
  radiusForPotential,
  relatedTopicEdges,
  scoreTopic,
  seedTopicId,
  topicPairScore,
  type PreparedRecord,
  type TopicEvidence,
  type TopicGroup,
} from "./topics.ts";
import {
  comparisonBaseline,
  computeAttention,
  computeTrend,
  measureTopicSupport,
  type TopicSnapshotPoint,
  type TopicSupport,
} from "./topic-trend.ts";

export const MAX_CANDIDATE_POSTS = 8_000;
export const MAX_TOPIC_NODES = 1_500;
const MIN_TOPICS_PER_SEGMENT = 3;
const MAX_EXAMPLES = 3;
const MAX_ENTITIES_PER_TOPIC = 8;

/**
 * A persisted assignment the projection must respect. `locked` rows are human
 * decisions (review merge/split) and are applied *before* automatic grouping,
 * so a correction is never reshaped by the clustering rules.
 */
export interface TopicAssignment {
  postId: string;
  /** Already redirect-resolved catalog id. */
  topicId: string;
  locked: boolean;
}

/** Structured-clone input: no database connection or model enters the worker. */
export interface TopicProjectionInput {
  rows: CandidateRow[];
  hours: number;
  pending: number;
  coverage: SegmentCoverage[];
  generatedAt: string;
  topicModel: string;
  topicDimension: number;
  limited: boolean;
  /** Valid persisted assignments in this window, redirect-resolved. */
  assignments: TopicAssignment[];
  /** Catalog labels for ids that already exist. */
  labels: Record<string, string>;
  /** Stored observations per catalog topic id, ascending by time. */
  history: Record<string, TopicSnapshotPoint[]>;
  /** Start of post-upgrade monitoring; earlier records are bootstrap evidence. */
  startedAt: string;
}

/** One assignment the projection produced, for durable persistence. */
export interface MaterializedAssignment {
  postId: string;
  topicId: string;
  contentHash: string;
}

export interface TopicProjection {
  map: TrendMap;
  catalog: Array<{ id: string; label: string }>;
  members: MaterializedAssignment[];
  /** Selected nodes only: a rank only exists for what the map actually ranked. */
  snapshots: Array<{
    topicId: string;
    rank: number;
    potential: number;
    accounts: number;
    publishers: number;
    posts: number;
    newsAttention: number;
    communityMomentum: number;
    sourceIds: string[];
  }>;
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

function nodeFor(
  group: TopicGroup,
  score: TrendScore,
  context: {
    rank: number;
    startedAt: Date;
    now: Date;
    history: Record<string, TopicSnapshotPoint[]>;
    entityIds: string[];
    hours: number;
    support: TopicSupport;
    baseline: TopicSnapshotPoint | null;
    reviewed: boolean;
  },
): TrendMapNode {
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
  const attention = computeAttention(group);
  const trend = computeTrend(group, {
    now: context.now,
    startedAt: context.startedAt,
    rank: context.rank,
    history: context.history[group.id] ?? [],
    windowHours: VELOCITY_WINDOW_HOURS,
    hours: context.hours,
    support: context.support,
    baseline: context.baseline,
    attention,
  });
  if (context.reviewed)
    trend.reasons.push(
      "Human-reviewed membership is locked; rank comparisons can reflect grouping corrections as well as newly collected evidence.",
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
    trend,
    attention,
    entityIds: context.entityIds,
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

/** Source floor first (so every collection context is represented), then potential. */
function selectGroups(
  groups: readonly TopicGroup[],
  limit: number,
  context: {
    now: Date;
    startedAt: Date;
    hours: number;
    history: Record<string, TopicSnapshotPoint[]>;
  },
) {
  const scored = groups
    .map((group) => {
      const support = measureTopicSupport(group, context.now);
      const baseline = comparisonBaseline(
        context.history[group.id] ?? [],
        context.now.getTime(),
        context.hours,
        context.startedAt.getTime(),
      );
      const score = scoreTopic(group, {
        now: context.now,
        observedSpanHours: baseline ? VELOCITY_WINDOW_HOURS * 2 : 0,
        support,
      });
      return { group, score, support, baseline };
    })
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
  // The source floor decides *inclusion*; it must not decide *order*. Ranking is
  // one global function of measured potential, so a small source's floor topic is
  // never presented as a top trend, and every consumer sees one canonical rank.
  return chosen
    .slice(0, limit)
    .sort((a, b) => b.score.potential - a.score.potential || a.group.id.localeCompare(b.group.id));
}

/**
 * A reviewed partition can grow without surrendering its original locked rows.
 * Attach an automatic group only when it matches every member of exactly one
 * reviewed partition. Ambiguous matches (including intentional same-event
 * splits) stay separate. Updated complete-link checks prevent bridge joins.
 * One shared pair budget bounds work; an incomplete search never proves a fit.
 */
function attachToReviewed(
  automatic: TopicGroup[],
  reviewed: TopicGroup[],
  labels: Record<string, string>,
) {
  if (reviewed.length === 0) return automatic;
  const remaining: TopicGroup[] = [];
  const prepared = new Map<string, PreparedRecord>();
  const preparedFor = (record: TopicEvidence) => {
    let value = prepared.get(record.id);
    if (!value) {
      value = prepare(record);
      prepared.set(record.id, value);
    }
    return value;
  };
  let pairs = 0;
  for (const group of automatic) {
    let target = -1;
    let incomplete = false;
    for (let index = 0; index < reviewed.length; index += 1) {
      let matches = true;
      for (const member of group.members) {
        for (const anchor of reviewed[index]!.members) {
          if (++pairs > 50_000) {
            incomplete = true;
            matches = false;
            break;
          }
          if (
            !topicPairScore(member, anchor, {
              prepared: [preparedFor(member), preparedFor(anchor)],
            }).matches
          ) {
            matches = false;
            break;
          }
        }
        if (!matches) break;
      }
      if (incomplete) break;
      if (!matches) continue;
      if (target !== -1) {
        target = -1;
        break;
      }
      target = index;
    }
    if (target === -1 || incomplete) {
      remaining.push(group);
      continue;
    }
    const original = reviewed[target]!;
    const combined = buildTopicGroup([...original.members, ...group.members], original.id);
    combined.label = labels[original.id] ?? combined.label;
    reviewed[target] = combined;
  }
  return remaining;
}

/**
 * Give each automatically grouped topic the id it already had, when that id is
 * still valid for it.
 *
 * This is what makes a topic keep its URL, watch, and history while its member
 * set changes: the persisted assignment wins over the seed hash. Two guards keep
 * the mapping honest:
 *
 * - A reviewed topic's id is reserved. New evidence joins it only through the
 *   unambiguous complete-link check above, never through an id-vote shortcut.
 * - Two different groups can both contain records previously assigned to one
 *   topic (an identity guard now separates them). Only one may keep the id;
 *   the other receives its deterministic seed id. Without this the map would
 *   emit duplicate node ids.
 */
function assignStableIds(
  groups: readonly TopicGroup[],
  assignments: Map<string, string>,
  persistedLabels: Record<string, string>,
  reserved: Set<string>,
) {
  const claims = new Map<string, Array<{ group: TopicGroup; seed: string; weight: number }>>();
  const seeds = new Map<TopicGroup, string>();
  for (const group of groups) {
    const seed = seedTopicId(
      [...group.members].sort(
        (a, b) =>
          a.firstCollectedAt.getTime() - b.firstCollectedAt.getTime() || a.id.localeCompare(b.id),
      )[0]!,
    );
    seeds.set(group, seed);
    const counts = new Map<string, number>();
    for (const member of group.members) {
      const persisted = assignments.get(member.id);
      // A catalog row we never labelled is not an identity we can trust.
      if (!persisted || reserved.has(persisted)) continue;
      if (!(persisted in persistedLabels)) continue;
      counts.set(persisted, (counts.get(persisted) ?? 0) + 1);
    }
    let best: string | null = null;
    let bestCount = 0;
    for (const [id, count] of counts) {
      if (count > bestCount || (count === bestCount && best !== null && id < best)) {
        best = id;
        bestCount = count;
      }
    }
    if (!best) continue;
    const list = claims.get(best) ?? [];
    list.push({ group, seed, weight: bestCount });
    claims.set(best, list);
  }

  const resolved = new Map<TopicGroup, string>();
  for (const [id, list] of claims) {
    // Deterministic priority: the group holding more of the original evidence
    // keeps the identity, then the lexicographically smaller seed id.
    list.sort(
      (a, b) =>
        b.weight - a.weight ||
        b.group.members.length - a.group.members.length ||
        a.seed.localeCompare(b.seed),
    );
    resolved.set(list[0]!.group, id);
    for (const loser of list.slice(1)) resolved.set(loser.group, loser.seed);
  }
  return groups.map((group) => ({ group, id: resolved.get(group) ?? seeds.get(group)! }));
}

/** Union of member entities, first-seen order, deduplicated by id. */
function entitiesForGroup(
  group: TopicGroup,
  recordEntities: Map<string, TopicEntity[]>,
): TopicEntity[] {
  const seen = new Map<string, TopicEntity>();
  for (const member of group.members) {
    for (const entity of recordEntities.get(member.id) ?? []) {
      if (!seen.has(entity.id)) seen.set(entity.id, entity);
    }
  }
  return [...seen.values()].slice(0, MAX_ENTITIES_PER_TOPIC);
}

/** CPU-only projection, run outside the HTTP event loop. */
export function projectTopicMap(input: TopicProjectionInput): TopicProjection {
  const now = new Date(input.generatedAt);
  const records: TopicEvidence[] = [];
  /** Extracted once per record, never per group or per window pair. */
  const recordEntities = new Map<string, TopicEntity[]>();
  for (const row of input.rows) {
    const vector = parseVector(row.vec);
    if (!vector || vector.length !== input.topicDimension) continue;
    records.push(toEvidence(row, vector));
    recordEntities.set(row.id, extractTopicEntities(row.title ?? "", row.body ?? ""));
  }

  // Reviewer decisions are authoritative and must be applied before grouping:
  // a locked record is placed exactly where a human put it, and it is excluded
  // from the automatic partition so no clustering rule can pull it elsewhere.
  const lockedByTopic = new Map<string, TopicEvidence[]>();
  const assignmentOf = new Map(input.assignments.map((item) => [item.postId, item.topicId]));
  const reserved = new Set<string>();
  for (const assignment of input.assignments) {
    if (assignment.locked) reserved.add(assignment.topicId);
  }
  const unlocked: TopicEvidence[] = [];
  const lockedAssignments = new Map(
    input.assignments.filter((item) => item.locked).map((item) => [item.postId, item.topicId]),
  );
  for (const record of records) {
    const assignedTopic = lockedAssignments.get(record.id);
    if (assignedTopic) {
      const list = lockedByTopic.get(assignedTopic) ?? [];
      list.push(record);
      lockedByTopic.set(assignedTopic, list);
      continue;
    }
    unlocked.push(record);
  }

  const lockedGroups = [...lockedByTopic.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([id, members]) => {
      const group = buildTopicGroup(members, id);
      group.label = input.labels[id] ?? group.label;
      return group;
    });
  const autoGroups = attachToReviewed(groupSpecificTopics(unlocked), lockedGroups, input.labels);
  const claimed = assignStableIds(autoGroups, assignmentOf, input.labels, reserved);

  // One node per id. A locked topic owns its id; an automatic group that wanted
  // that id, or whose seed hash collides with another group's seed, falls back to
  // a deterministic disambiguator. Duplicate ids would merge unrelated evidence
  // in every consumer that keys by id.
  const used = new Set<string>();
  const uniqueId = (group: TopicGroup, wanted: string) => {
    let candidate = wanted;
    for (let attempt = 1; used.has(candidate); attempt += 1) {
      candidate =
        attempt === 1
          ? seedTopicId(group.members[0]!)
          : `${seedTopicId(group.members[0]!)}:${attempt}`;
    }
    used.add(candidate);
    return candidate;
  };
  const allGroups: TopicGroup[] = [];
  for (const group of lockedGroups) {
    allGroups.push({ ...group, id: uniqueId(group, group.id) });
  }
  for (const item of claimed) {
    allGroups.push({ ...item.group, id: uniqueId(item.group, item.id) });
  }

  const startedAt = new Date(input.startedAt);
  const selected = selectGroups(allGroups, MAX_TOPIC_NODES, {
    now,
    startedAt,
    hours: input.hours,
    history: input.history,
  });

  /** The entity catalog travels once, not once per node. */
  const catalog = new Map<string, TopicEntity>();
  const nodeEntities = new Map<string, string[]>();
  for (const item of selected) {
    const own = entitiesForGroup(item.group, recordEntities);
    nodeEntities.set(
      item.group.id,
      own.map((entity) => entity.id),
    );
    for (const entity of own) if (!catalog.has(entity.id)) catalog.set(entity.id, entity);
  }

  const nodes = selected.map((item, index) =>
    nodeFor(item.group, item.score, {
      // Canonical global rank: the node's position in this map's own order.
      rank: index + 1,
      startedAt,
      now,
      history: input.history,
      entityIds: nodeEntities.get(item.group.id) ?? [],
      hours: input.hours,
      support: item.support,
      baseline: item.baseline,
      reviewed: lockedByTopic.has(item.group.id),
    }),
  );
  const edges = edgesFor(
    selected.map((item) => item.group),
    new Set(nodes.map((node) => node.id)),
  );

  const map: TrendMap = {
    hours: input.hours,
    generatedAt: input.generatedAt,
    nodes,
    edges,
    coverage: input.coverage,
    entities: [...catalog.values()].sort((a, b) => a.id.localeCompare(b.id)),
    intelligence: {
      startedAt: startedAt.toISOString(),
      lastSnapshotAt: null,
      refreshing: false,
    },
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
      velocityComparable: nodes.some((node) => node.trend.comparable),
    },
  };

  // Every bounded candidate is persisted, not just the displayed ones: the
  // inspector, review guard and watch evaluation all read memberships that the
  // map never showed.
  const members: MaterializedAssignment[] = [];
  const catalogRows: Array<{ id: string; label: string }> = [];
  const seenCatalog = new Set<string>();
  for (const group of allGroups) {
    if (!seenCatalog.has(group.id)) {
      seenCatalog.add(group.id);
      catalogRows.push({ id: group.id, label: group.label });
    }
    for (const member of group.members) {
      members.push({ postId: member.id, topicId: group.id, contentHash: member.contentHash });
    }
  }

  return {
    map,
    catalog: catalogRows,
    members,
    snapshots: nodes.map((node, index) => ({
      topicId: node.id,
      rank: index + 1,
      potential: node.potential,
      accounts: node.authors,
      publishers: node.publishers,
      posts: node.posts,
      newsAttention: node.attention.news,
      communityMomentum: node.attention.community,
      // Every collection context behind the topic, not just the three examples.
      sourceIds: [...new Set(selected[index]!.group.members.map((member) => member.source))].sort(),
    })),
  };
}

export type { CandidateRow };
