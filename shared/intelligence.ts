/** Source-grounded intelligence; none of these scores is an audience estimate. */
/** Maximum source-publication lag credited as newly discovered support. */
export const EVIDENCE_DISCOVERY_LAG_HOURS = 12;

export type TopicPhase = "rising" | "sustained" | "fading" | "insufficient_history";
export type EntityKind = "person" | "organization" | "location" | "product";

export interface TopicEntity {
  id: string;
  kind: EntityKind;
  label: string;
  aliases: string[];
}

export interface TopicHistoryPoint {
  at: string;
  potential: number;
  rank: number;
  accounts: number;
  publishers: number;
  posts: number;
  newsAttention: number;
  communityMomentum: number;
}

/** Fixed comparable collection windows, never a backfilled publication series. */
export interface TopicTrend {
  phase: TopicPhase;
  comparable: boolean;
  windowHours: number;
  previousRank: number | null;
  rankChange: number | null;
  newAccounts: number;
  newPublishers: number;
  newSources: string[];
  recentRecords: number;
  priorRecords: number;
  history: TopicHistoryPoint[];
  reasons: string[];
}

export interface TopicAttention {
  news: number;
  community: number;
  newsPublishers: number;
  communityAccounts: number;
}

/** One original record; source time and collector time are deliberately distinct. */
export interface TopicTimelineRecord {
  id: string;
  title: string;
  excerpt: string;
  permalink: string;
  source: string;
  evidenceType: "news" | "discussion";
  publisher: string | null;
  authorHandle: string | null;
  sourceAt: string;
  timeKind: "published" | "activity";
  firstCollectedAt: string;
  lastObservedAt: string;
}

export interface TopicDetail {
  topicId: string;
  label: string;
  hours: number;
  total: number;
  offset: number;
  limit: number;
  records: TopicTimelineRecord[];
  history: TopicHistoryPoint[];
  entities: TopicEntity[];
  review: { lockedRecords: number; decisions: TopicReviewDecision[] };
}

export interface TopicReviewDecision {
  id: string;
  operation: "merge" | "split";
  topicIds: string[];
  recordIds: string[];
  targetId: string;
  note: string;
  createdAt: string;
  active: boolean;
}

export interface TopicReviewInput {
  operation: "merge" | "split";
  topicIds: string[];
  recordIds: string[];
  note: string;
}

export interface TopicReviewResult {
  decision: TopicReviewDecision;
  topicId: string;
}

export interface WatchDraft {
  kind: "topic" | "entity";
  targetId: string;
  label: string;
}

export interface WatchRule extends WatchDraft {
  id: string;
  enabled: boolean;
  minNewAccounts: number;
  minNewPublishers: number;
  minNewSources: number;
  minPotential: number;
  createdAt: string;
  evaluatedAt: string | null;
}

export interface WatchRuleInput extends WatchDraft {
  enabled: boolean;
  minNewAccounts: number;
  minNewPublishers: number;
  minNewSources: number;
  minPotential: number;
}

export interface TopicAlert {
  id: string;
  watchId: string;
  watchLabel: string;
  topicId: string;
  topicLabel: string;
  createdAt: string;
  readAt: string | null;
  newAccounts: number;
  newPublishers: number;
  newSources: string[];
  potential: number;
  reasons: string[];
}

export interface WatchlistState {
  rules: WatchRule[];
  alerts: TopicAlert[];
  unread: number;
  /** Opaque keyset cursor; older notifications remain reachable without offset scans. */
  alertsNextCursor: string | null;
}
