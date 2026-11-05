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

/** Collector identities; publisher attribution is separate for aggregated news. */
export type SocialSource = "voz" | "otofun" | "google-news" | "nguoi-viet";
export type EvidenceType = "discussion" | "news";

export type PostKind = "text" | "image" | "video" | "audio" | "link";
export type SourceTimeKind = "published" | "activity";

/** A concrete collection context, not a demographic or a whole-network pool. */
export interface ViewerSegment {
  id: string;
  label: string;
  description: string;
  source: SocialSource;
  evidenceType: EvidenceType;
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

/** Evidence belongs in the inspector, never as source or individual-post graph hubs. */
export interface TopicExample extends ClusterExample {
  title: string;
  evidenceType: EvidenceType;
  publisher: string | null;
  /** Source-reported publication/activity time, distinct from local observation. */
  publishedAt: string;
}

export interface TrendMapNode {
  id: string;
  kind: "topic";
  /** A specific, evidence-backed event/product title, not a broad category. */
  label: string;
  description: string;
  radius: number;
  potential: number;
  posts: number;
  /** Source-qualified community accounts, never news publishers presented as people. */
  authors: number;
  segments: string[];
  score: TrendScore;
  discussionPosts: number;
  newsPosts: number;
  publishers: number;
  mediaCount: number;
  likes?: number;
  shares?: number;
  firstSeenAt: string;
  lastSeenAt: string;
  examples: TopicExample[];
}

export interface TrendMapEdge {
  id: string;
  source: string;
  target: string;
  /** A measured semantic relationship between distinct specific topics. */
  relation: "related";
  weight: number;
  similarity: number;
}

export interface TrendMap {
  hours: number;
  generatedAt: string;
  nodes: TrendMapNode[];
  edges: TrendMapEdge[];
  coverage: SegmentCoverage[];
  stats: {
    posts: number;
    topics: number;
    discussionPosts: number;
    newsPosts: number;
    pendingEmbeddings: number;
    limited: boolean;
  };
  method: {
    version: number;
    velocityWindowHours: number;
    weights: Record<string, number>;
    topicModel: string;
    groupingThreshold: number;
    /** False while history is too short for two comparable velocity windows. */
    velocityComparable: boolean;
  };
}
