import type {
  Alert,
  Overview,
  RangeKey,
  WatchlistItem,
  WatchlistSummary,
} from "../shared/types.ts";
import { getAnalysis, getTrending } from "./google-trends.ts";
import { readState, recordAlerts } from "./store.ts";

const TERMS_PER_REQUEST = 5;

interface SummaryResult {
  summaries: WatchlistSummary[];
  notices: string[];
}

async function buildSummaries(items: WatchlistItem[], range: RangeKey): Promise<SummaryResult> {
  const groups = new Map<string, WatchlistItem[]>();
  for (const item of items) {
    groups.set(item.geo, [...(groups.get(item.geo) ?? []), item]);
  }

  const summaries: WatchlistSummary[] = [];
  const notices: string[] = [];

  for (const [geo, group] of groups) {
    for (let index = 0; index < group.length; index += TERMS_PER_REQUEST) {
      const chunk = group.slice(index, index + TERMS_PER_REQUEST);
      const analysis = await getAnalysis(
        chunk.map((item) => item.term),
        geo,
        range,
      );

      if (analysis.notice) notices.push(analysis.notice);
      const byTerm = new Map(
        analysis.insights.map((insight) => [insight.term.toLowerCase(), insight]),
      );

      for (const item of chunk) {
        const insight = byTerm.get(item.term.toLowerCase());
        if (!insight) continue;
        summaries.push({
          ...item,
          insight,
          source: analysis.source,
          stale: analysis.stale,
          lastCheckedAt: analysis.fetchedAt,
        });
      }
    }
  }

  const order = new Map(items.map((item, index) => [item.id, index]));
  summaries.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return { summaries, notices };
}

/**
 * Refresh the watchlist outside a page request so alerts keep accumulating
 * while nobody has the dashboard open. The monitor is started by the server;
 * it returns created alerts for logging and never writes synthetic data.
 */
export async function refreshWatchlist(range: RangeKey = "12m") {
  const state = await readState();
  if (state.watchlist.length === 0) {
    return { summaries: 0, created: [] as Alert[], notices: [] as string[] };
  }
  const { summaries, notices } = await buildSummaries(state.watchlist, range);
  const created = await recordAlerts(summaries, range);
  return { summaries: summaries.length, created, notices };
}

/**
 * Assemble the dashboard in one server round-trip: monitored trends, derived
 * alerts, and daily trending searches. Alerts are derived only from live
 * summaries so an outage cannot manufacture a signal.
 */
export async function buildOverview(geo: string, range: RangeKey): Promise<Overview> {
  const state = await readState();
  const [{ summaries, notices }, trending] = await Promise.all([
    buildSummaries(state.watchlist, range),
    getTrending(geo),
  ]);

  if (summaries.length > 0) {
    await recordAlerts(summaries, range);
  }

  const latestState = await readState();
  const alerts: Alert[] = latestState.alerts.slice(0, 8);
  const tracked = summaries.length;
  const averageInterest =
    tracked > 0
      ? Math.round(
          (summaries.reduce((total, item) => total + item.insight.latest, 0) / tracked) * 10,
        ) / 10
      : 0;

  const mover = summaries.reduce<WatchlistSummary | null>((best, item) => {
    if (!best) return item;
    return Math.abs(item.insight.changePct) > Math.abs(best.insight.changePct) ? item : best;
  }, null);

  const source = "google";

  const notice = notices[0] ?? trending.notice;
  const stale = summaries.length > 0 && summaries.every((summary) => summary.stale === true);

  return {
    query: { geo, range },
    source,
    fetchedAt: new Date().toISOString(),
    notice,
    stale,
    stats: {
      tracked,
      averageInterest,
      topMover:
        mover && Math.abs(mover.insight.changePct) >= 0.1
          ? {
              term: mover.term,
              changePct: mover.insight.changePct,
              direction: mover.insight.direction,
            }
          : null,
      unreadAlerts: latestState.alerts.filter((alert) => !alert.read).length,
    },
    watchlist: summaries,
    alerts,
    trending,
  };
}
