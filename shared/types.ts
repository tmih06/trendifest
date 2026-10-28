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

export interface GeoOption {
  code: string;
  name: string;
}
