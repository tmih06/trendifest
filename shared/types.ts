/**
 * Wire types shared by the Bun API and the React client. These are the only
 * shapes that cross the network.
 */

export interface ApiError {
  error: string;
  code?: string;
}

/* ------------------------------------------------------------------ *
 * Vietnamese-first collection of public community discussion excerpts.
 * ------------------------------------------------------------------ */

/** Independent networks currently collected through their public RSS feeds. */
export type SocialSource = "voz" | "otofun";

export type PostKind = "text" | "image" | "video" | "audio" | "link";
export type SourceTimeKind = "published" | "activity";

/** A concrete collection context, not a demographic or a whole-network pool. */
export interface ViewerSegment {
  id: string;
  label: string;
  description: string;
  source: SocialSource;
  feedUrl: string;
}

/** Only measured counters are present; absence is not a measured zero. */
export interface EngagementSnapshot {
  likes?: number;
  reposts?: number;
  replies?: number;
  quotes?: number;
  capturedAt: string;
}

export interface ClusterExample {
  uri: string;
  permalink: string;
  source: SocialSource;
  /** Forum RSS dates can be latest thread activity, not original publication. */
  timeKind: SourceTimeKind;
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
  /** Distinct observed collection contexts, not verified demographic audiences. */
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
  source: SocialSource;
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
/** One bounded poll result; source outages remain visible rather than becoming zero coverage. */
export interface SourceCollectionResult {
  segmentId: string;
  source: SocialSource;
  fetched: number;
  stored: number;
  duplicates: number;
  skippedLanguage: number;
  skippedQuality: number;
  error: string | null;
}

export interface IngestReport {
  segments: number;
  fetched: number;
  stored: number;
  observations: number;
  vectors: number;
  unvectorized: number;
  clusters: number;
  duplicates: number;
  skippedLanguage: number;
  skippedQuality: number;
  expired: number;
  sources: SourceCollectionResult[];
  errors: Array<{ segmentId: string; message: string }>;
}

export interface CollectionStatus {
  configured: boolean;
  enabled: boolean;
  backfilling: boolean;
  lastBackfillAt: string | null;
  lastBackfill: IngestReport | null;
  segments: number;
  lastErrors: Array<{ segmentId: string; message: string }>;
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

export type TrendMapNodeKind = "segment" | "pattern";

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
  /** Latest measured engagement across member posts. */
  likes?: number;
  shares?: number;
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
  coverage: SegmentCoverage[];
  method: {
    version: number;
    velocityWindowHours: number;
    weights: Record<string, number>;
    /** False while history is too short for two comparable velocity windows. */
    velocityComparable: boolean;
  };
}
