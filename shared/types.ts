/**
 * Wire types shared by the Bun API and the React client. These are the only
 * shapes that cross the network.
 */

export interface ApiError {
  error: string;
  code?: string;
}

/* ------------------------------------------------------------------ *
 * Social collection: viewer-segment stratified ingest of real feeds.
 * ------------------------------------------------------------------ */

/** Network a social adapter reads. */
export type SocialSource = "bluesky";

/** Media carried by a post; each maps to its own embedding space. */
export type PostKind = "text" | "image" | "video" | "audio" | "link";

export interface ViewerSegment {
  id: string;
  label: string;
  description: string;
  source: SocialSource;
  /** Concrete feed URIs that make up this segment. */
  feeds: string[];
  /** Measured share of English-tagged posts at sample time; 0-1. */
  englishFloor: number;
  /** Why this feed belongs to the declared audience prior. Shown in the UI. */
  prior: string;
  /**
   * `whole-network` segments are broad discovery pools (Bluesky's own trending
   * feed). They are collected but never counted as cross-segment adoption,
   * because a post reaching Discover and one niche is not a crossing.
   */
  scope: "whole-network" | "collection";
}

export interface EngagementSnapshot {
  likes: number;
  reposts: number;
  replies: number;
  quotes: number;
  capturedAt: string;
}

/** A deduplicated piece of creative content, independent of who saw it. */
export interface SocialPost {
  id: string;
  source: SocialSource;
  uri: string;
  authorDid: string;
  authorHandle: string | null;
  text: string;
  lang: string[];
  tags: string[];
  kind: PostKind;
  permalink: string;
  publishedAt: string;
  /** CIDs of embedded media; the pipeline resolves them to CDN URLs. */
  mediaCids: string[];
  contentHash: string;
}

export interface ClusterExample {
  uri: string;
  permalink: string;
  text: string;
  authorHandle: string | null;
  kind: PostKind;
  mediaCount: number;
  segments: string[];
  observedAt: string;
}

export interface PatternCluster {
  id: string;
  /** Highest-scoring member text, shortened for display; never a generated title. */
  label: string;
  kind: PostKind;
  size: number;
  /** Distinct segments (excluding whole-network pools) that observed a member. */
  segments: string[];
  crossings: number;
  firstSeenAt: string;
  lastSeenAt: string;
  /** Mean cosine of members to the cluster centroid across the text space. */
  cohesion: number;
  examples: ClusterExample[];
}

export interface SegmentCoverage {
  segmentId: string;
  label: string;
  posts: number;
  mediaPosts: number;
  lastObservedAt: string | null;
  /** Set when the segment's feed failed this cycle; absence of posts is then unknown, not zero. */
  error?: string;
}

export interface SocialStats {
  posts: number;
  observations: number;
  clusters: number;
  crossings: number;
  /** Posts in the window that produced no usable vector (too short, media blocked, model skipped). */
  unvectorized: number;
}

export interface SocialSignals {
  windowHours: number;
  generatedAt: string;
  stats: SocialStats;
  coverage: SegmentCoverage[];
  clusters: PatternCluster[];
}

/* ------------------------------------------------------------------ *
 * Trend map: the collection graph with an emergence score.
 * ------------------------------------------------------------------ */

export interface TrendScore {
  /** 0-100 heuristic emergence score. Not a probability and not calibrated. */
  potential: number;
  reach: number;
  velocity: number;
  spread: number;
  persistence: number;
  diversity: number;
  /** 0.3-1 multiplier from evidence volume; keeps tiny samples from scoring high. */
  confidence: number;
  authors: number;
  posts: number;
}

export type TrendMapNodeKind = "segment" | "pattern" | "pool";

export interface TrendMapNode {
  id: string;
  kind: TrendMapNodeKind;
  label: string;
  description: string;
  radius: number;
  /** Null for segment hubs, which carry no emergence claim. */
  potential: number | null;
  posts: number;
  authors: number;
  segments: string[];
  /** Fixed layout position for hubs; derived by the force layout for patterns. */
  x?: number;
  y?: number;
  score?: TrendScore;
  clusterId?: string;
  kind_?: string;
  mediaCount?: number;
  firstSeenAt?: string;
  lastSeenAt?: string;
  /** A few member posts, so the inspector can show provenance without a list route. */
  examples?: ClusterExample[];
}

export type TrendMapRelation = "observed-in" | "similarity";

export interface TrendMapEdge {
  id: string;
  source: string;
  target: string;
  /** `observed-in` is a collected observation; `similarity` is centroid cosine in one space. */
  relation: TrendMapRelation;
  weight: number;
  /** Cosine similarity for `similarity` edges; absent on observations. */
  similarity?: number;
}

export interface TrendMap {
  hours: number;
  generatedAt: string;
  nodes: TrendMapNode[];
  edges: TrendMapEdge[];
  top: TrendMapNode[];
  coverage: SegmentCoverage[];
  method: {
    version: number;
    velocityWindowHours: number;
    weights: Record<string, number>;
    /** False while history is too short for two comparable velocity windows. */
    velocityComparable: boolean;
  };
}
