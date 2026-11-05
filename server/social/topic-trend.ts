import { EVIDENCE_DISCOVERY_LAG_HOURS } from "../../shared/intelligence.ts";
import type {
  TopicAttention,
  TopicHistoryPoint,
  TopicPhase,
  TopicTrend,
} from "../../shared/intelligence.ts";
import type { TopicEvidence, TopicGroup } from "./topics.ts";

export const TREND_WINDOW_HOURS = 6;
export const MIN_COMPARABLE_HOURS = TREND_WINDOW_HOURS * 2;
export const MAX_NODE_HISTORY = 12;
const HOUR_MS = 3_600_000;
/** Hourly observations tolerate one refresh's delay, not hours of offline time. */
const MAX_SAMPLE_GAP_MS = 75 * 60_000;

/** An actual observed sample; its hour bucket is not its observation time. */
export interface TopicSnapshotPoint {
  at: number;
  potential: number;
  rank: number;
  accounts: number;
  publishers: number;
  posts: number;
  newsAttention: number;
  communityMomentum: number;
}

/** Earliest independent support, qualified by a fresh, source-dated publication. */
export interface TopicSupport {
  accounts: Map<string, number>;
  publishers: Map<string, number>;
  sources: Map<string, number>;
  records: number[];
}

export interface TrendOptions {
  now: Date;
  startedAt: Date;
  rank: number;
  history: readonly TopicSnapshotPoint[];
  hours: number;
  windowHours?: number;
  /** The scorer and explanation reuse the same measured support. */
  support?: TopicSupport;
  attention?: TopicAttention;
  /** The projection already checked coverage while scoring this same group. */
  baseline?: TopicSnapshotPoint | null;
}

/** Bounded logarithmic support score, not an audience or probability estimate. */
function independentScale(units: number) {
  return units <= 0 ? 0 : Math.round(100 * Math.min(1, Math.log10(1 + units) / Math.log10(11)));
}

function knownAccount(evidence: TopicEvidence) {
  const id = evidence.authorId?.trim();
  return id && !id.endsWith(":unknown") ? id : null;
}

function knownPublisher(evidence: TopicEvidence) {
  return evidence.evidenceType === "news" ? evidence.publisher?.trim() || null : null;
}

/**
 * Attention channels measure independent breadth, never audience. Forum activity
 * can establish account breadth but cannot establish new publication/momentum.
 */
export function computeAttention(group: TopicGroup): TopicAttention {
  const publishers = new Set<string>();
  const accounts = new Set<string>();
  for (const member of group.members) {
    const publisher = knownPublisher(member);
    if (publisher) publishers.add(publisher);
    const account = knownAccount(member);
    if (account && member.evidenceType !== "news") accounts.add(account);
  }
  return {
    news: independentScale(publishers.size),
    community: independentScale(accounts.size),
    newsPublishers: publishers.size,
    communityAccounts: accounts.size,
  };
}

/**
 * One identity contributes once, at its earliest collection in the topic. Keep
 * that first date even when it came from an older record: a repeat is not a new
 * account/publisher. Credit growth only when that identity has a real published
 * record discovered within the permitted lag. Archive imports and forum bumps
 * remain source evidence, but do not manufacture a rise or velocity boost.
 */
export function measureTopicSupport(group: TopicGroup, now: Date): TopicSupport {
  const accounts = new Map<string, number>();
  const publishers = new Map<string, number>();
  const sources = new Map<string, number>();
  const eligibleAccounts = new Set<string>();
  const eligiblePublishers = new Set<string>();
  const eligibleSources = new Set<string>();
  const records: number[] = [];
  const remember = (map: Map<string, number>, key: string, at: number) => {
    const previous = map.get(key);
    if (previous === undefined || at < previous) map.set(key, at);
  };
  const nowMs = now.getTime();
  for (const member of group.members) {
    const collected = member.firstCollectedAt.getTime();
    if (!Number.isFinite(collected) || collected > nowMs) continue;
    const account = member.evidenceType === "news" ? null : knownAccount(member);
    const publisher = knownPublisher(member);
    if (account) remember(accounts, account, collected);
    if (publisher) remember(publishers, publisher, collected);
    remember(sources, member.source, collected);
    const published = member.publishedAt.getTime();
    if (
      member.timeKind !== "published" ||
      !Number.isFinite(published) ||
      published > nowMs ||
      published < collected - EVIDENCE_DISCOVERY_LAG_HOURS * HOUR_MS
    )
      continue;
    records.push(collected);
    if (account) eligibleAccounts.add(account);
    if (publisher) eligiblePublishers.add(publisher);
    eligibleSources.add(member.source);
  }
  for (const key of accounts.keys()) if (!eligibleAccounts.has(key)) accounts.delete(key);
  for (const key of publishers.keys()) if (!eligiblePublishers.has(key)) publishers.delete(key);
  for (const key of sources.keys()) if (!eligibleSources.has(key)) sources.delete(key);
  return { accounts, publishers, sources, records };
}

/**
 * Require actual hourly observations across both complete comparison windows.
 * A start-date row plus one old sample is not proof of twelve measured hours.
 * Use the latest sample at/before the six-hour horizon, with hourly tolerance.
 */
export function comparisonBaseline(
  history: readonly TopicSnapshotPoint[],
  now: number,
  viewHours: number,
  startedAt: number,
  windowHours = TREND_WINDOW_HOURS,
): TopicSnapshotPoint | null {
  const coverageStart = now - windowHours * 2 * HOUR_MS;
  if (viewHours < windowHours * 2 || startedAt > coverageStart) return null;
  let anchor: TopicSnapshotPoint | null = null;
  for (const point of history) {
    if (
      point.at >= startedAt &&
      point.at <= coverageStart &&
      point.at >= coverageStart - MAX_SAMPLE_GAP_MS
    )
      anchor = point;
  }
  if (!anchor || anchor.at < now - viewHours * HOUR_MS) return null;
  const horizon = now - windowHours * HOUR_MS;
  let previous = anchor.at;
  let baseline: TopicSnapshotPoint | null = null;
  for (const point of history) {
    if (point.at < anchor.at || point.at > now) continue;
    if (point.at < previous || point.at - previous > MAX_SAMPLE_GAP_MS) return null;
    previous = point.at;
    if (point.at <= horizon && point.at >= horizon - MAX_SAMPLE_GAP_MS) baseline = point;
  }
  return now - previous <= MAX_SAMPLE_GAP_MS ? baseline : null;
}

/** Count distinct identities in a half-open collection window. */
function countBetween(map: Map<string, number>, after: number, upto: number) {
  let total = 0;
  for (const at of map.values()) if (at > after && at <= upto) total += 1;
  return total;
}

function historyPoint(point: TopicSnapshotPoint): TopicHistoryPoint {
  return { ...point, at: new Date(point.at).toISOString() };
}

/** Direction and explanations use real support and the same canonical rank. */
export function computeTrend(group: TopicGroup, options: TrendOptions): TopicTrend {
  const windowHours = options.windowHours ?? TREND_WINDOW_HOURS;
  const now = options.now.getTime();
  const startedAt = options.startedAt.getTime();
  const recentStart = Math.max(startedAt, now - windowHours * HOUR_MS);
  const priorStart = Math.max(startedAt, now - windowHours * 2 * HOUR_MS);
  const support = options.support ?? measureTopicSupport(group, options.now);
  const newAccounts = countBetween(support.accounts, recentStart, now);
  const newPublishers = countBetween(support.publishers, recentStart, now);
  const newSources: string[] = [];
  for (const [key, at] of support.sources) if (at > recentStart && at <= now) newSources.push(key);
  newSources.sort();
  const recentRecords = support.records.filter((at) => at > recentStart && at <= now).length;
  const priorEnd = now - windowHours * HOUR_MS;
  const priorAccounts = countBetween(support.accounts, priorStart, priorEnd);
  const priorPublishers = countBetween(support.publishers, priorStart, priorEnd);
  const priorRecords = support.records.filter((at) => at > priorStart && at <= priorEnd).length;
  const baseline =
    options.baseline === undefined
      ? comparisonBaseline(options.history, now, options.hours, startedAt, windowHours)
      : options.baseline;
  const comparable = baseline !== null;
  const current = newAccounts + newPublishers;
  const prior = priorAccounts + priorPublishers;
  let phase: TopicPhase = "insufficient_history";
  if (comparable) {
    if (current > prior) phase = "rising";
    else if (current < prior || (current === 0 && recentRecords === 0)) phase = "fading";
    else phase = "sustained";
  }
  const previousRank = baseline?.rank ?? null;
  const rankChange = baseline ? baseline.rank - options.rank : null;
  const attention = options.attention ?? computeAttention(group);
  const reasons: string[] = [];
  if (!comparable) {
    reasons.push(
      `Direction is unknown until actual hourly observations cover both ${windowHours}-hour windows without a collection gap. A monitoring start date alone is not a baseline.`,
    );
  } else {
    reasons.push(
      `Compared with the stored observation ${((now - baseline.at) / HOUR_MS).toFixed(1)}h ago using consecutive ${windowHours}-hour collection windows.`,
    );
    reasons.push(
      `${newAccounts} new independent accounts and ${newPublishers} new publishers contributed source-dated support in the latest window (previous window: ${priorAccounts} accounts, ${priorPublishers} publishers).`,
    );
    reasons.push(
      rankChange === 0
        ? `Global rank is unchanged at ${options.rank}.`
        : `Global rank moved from ${previousRank} to ${options.rank} (${rankChange! > 0 ? "+" : ""}${rankChange}).`,
    );
  }
  let bootstrap = 0;
  for (const member of group.members)
    if (member.firstCollectedAt.getTime() <= startedAt) bootstrap += 1;
  if (bootstrap > 0)
    reasons.push(
      `${bootstrap} records first collected before monitoring began are baseline evidence, not new growth.`,
    );
  reasons.push(
    `News attention ${attention.news}/100 measures ${attention.newsPublishers} independent publishers; community momentum ${attention.community}/100 is a breadth proxy from ${attention.communityAccounts} known accounts, not verified fresh post volume or audience.`,
  );
  reasons.push(
    `Growth excludes archive imports and activity-only forum timestamps. ${recentRecords} qualifying publications were first collected in the latest window.`,
  );
  reasons.push(
    `Sampled corpus: ${group.members.length} records inside this view; provider availability bounds coverage. Accounts across networks are not verified distinct people.`,
  );
  return {
    phase,
    comparable,
    windowHours,
    previousRank,
    rankChange,
    newAccounts,
    newPublishers,
    newSources,
    recentRecords,
    priorRecords,
    history: options.history.slice(-MAX_NODE_HISTORY).map(historyPoint),
    reasons,
  };
}
