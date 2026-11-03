/**
 * Wire types shared by the Bun API and the React client. These are the only
 * shapes that cross the network; Google's payloads never leak into the UI.
 */

export type RangeKey = "3m" | "12m" | "5y";
export type TrendDirection = "up" | "down" | "flat";
export type DataSource = "google";
export type Confidence = "high" | "medium" | "low";

export interface ForecastPoint {
  /** Unix seconds, matching Google's timeline values. */
  time: number;
  /** ISO date so the client never has to guess the API's timezone. */
  date: string;
  value: number;
  lower: number;
  upper: number;
}

export interface Forecast {
  points: ForecastPoint[];
  /** First forecast step. */
  next: number;
  /** Projected change from the latest actual point to the horizon endpoint, in percent. */
  changePct: number;
  direction: TrendDirection;
  confidence: Confidence;
  /** Mean absolute percentage error from a six-step holdout; null when data is too short. */
  mape: number | null;
  model: "holt-damped-trend";
  horizon: number;
}

export interface SeriesPoint {
  time: number;
  date: string;
  /** One value per queried term, in the same order as `query.terms`. */
  values: number[];
}

export interface HistoryPoint {
  time: number;
  date: string;
  value: number;
}

export interface RelatedQuery {
  query: string;
  value: number;
  /** True for the rising-queries list, false for the all-time top list. */
  rising: boolean;
}

export interface RegionInterest {
  code: string;
  name: string;
  value: number;
}

export interface TermInsight {
  term: string;
  latest: number;
  previous: number;
  peak: number;
  peakTime: number;
  /** Unix seconds of the latest observation; alert periods are keyed on it. */
  latestTime: number;
  /** Number of usable observations in the analyzed series. */
  sampleSize: number;
  /** Full cleaned series for charting; weekly or daily depending on the range. */
  history: HistoryPoint[];
  /** Change from the previous point to the latest point, in percent. */
  changePct: number;
  /** Direction of the latest move, not the forecast. */
  direction: TrendDirection;
  /** Latest four-point momentum relative to the preceding four points, in percent. */
  momentum: number;
  forecast: Forecast;
  sparkline: number[];
  related: RelatedQuery[];
  regions: RegionInterest[];
}

export interface TrendAnalysis {
  query: {
    terms: string[];
    geo: string;
    range: RangeKey;
  };
  source: DataSource;
  fetchedAt: string;
  resolution: "day" | "week";
  points: SeriesPoint[];
  insights: TermInsight[];
  /** Present when live data failed, or when a stale live response was reused. */
  notice?: string;
  stale?: boolean;
}

export interface WatchlistItem {
  id: string;
  term: string;
  geo: string;
  threshold: number;
  createdAt: string;
}

export type AlertKind = "surge" | "drop" | "forecast-rise";

export interface Alert {
  id: string;
  watchlistId: string;
  term: string;
  geo: string;
  kind: AlertKind;
  value: number;
  previous: number;
  changePct: number;
  threshold: number;
  /** Date range in effect when the alert was derived, for copy such as "week over week". */
  range: RangeKey;
  /** Projection distance for forecast alerts; null for observed moves. */
  horizon: number | null;
  /** The latest observation this alert was derived from; used for deduplication. */
  period: string;
  createdAt: string;
  read: boolean;
}

export interface WatchlistSummary extends WatchlistItem {
  insight: TermInsight;
  source: DataSource;
  stale?: boolean;
  lastCheckedAt: string;
}

export interface TrendingItem {
  title: string;
  traffic: string;
  publishedAt: string | null;
  link: string;
}

export interface TrendingResult {
  geo: string;
  source: DataSource;
  fetchedAt: string;
  items: TrendingItem[];
  /** True when the feed is the last successful snapshot, not a fresh request. */
  stale?: boolean;
  notice?: string;
}

export interface OverviewStats {
  tracked: number;
  averageInterest: number;
  topMover: { term: string; changePct: number; direction: TrendDirection } | null;
  unreadAlerts: number;
}

export interface Overview {
  query: { geo: string; range: RangeKey };
  source: DataSource;
  fetchedAt: string;
  notice?: string;
  stale?: boolean;
  stats: OverviewStats;
  watchlist: WatchlistSummary[];
  alerts: Alert[];
  trending: TrendingResult;
}

export interface ApiError {
  error: string;
  code?: string;
}

/* ------------------------------------------------------------------ *
 * Social collection: viewer-segment stratified ingest of real feeds.
 * ------------------------------------------------------------------ */

/** Network a social adapter reads. Google Trends stays a separate keyword source. */
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

/** One delivery of a post into one segment; the unit that makes crossings measurable. */
export interface SocialObservation {
  id: string;
  postId: string;
  segmentId: string;
  observedAt: string;
  engagement: EngagementSnapshot | null;
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

export interface GeoOption {
  code: string;
  name: string;
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
}

export interface TrendMapEdge {
  id: string;
  source: string;
  target: string;
  relation: "observed-in";
  weight: number;
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
