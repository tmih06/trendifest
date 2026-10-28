import type {
  RangeKey,
  RelatedQuery,
  RegionInterest,
  SeriesPoint,
  TermInsight,
  TrendAnalysis,
  TrendingItem,
  TrendingResult,
} from "../shared/types.ts";
import { RANGE_OPTIONS } from "../shared/config.ts";
import { buildInsight } from "./forecast.ts";

const BASE = "https://trends.google.com/trends/api";
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const ANALYSIS_TTL_MS = 12 * 60 * 1000;
const TRENDING_TTL_MS = 8 * 60 * 1000;
const FAILURE_COOLDOWN_MS = 90 * 1000;
const MAX_TERMS = 5;

/** A Google Trends outage is a retryable dependency failure, not a client bug. */
export class TrendSourceError extends Error {
  readonly status = 503;
  readonly code = "upstream_unavailable";

  constructor(message: string) {
    super(message);
    this.name = "TrendSourceError";
  }
}

interface ExploreWidget {
  id: string;
  token: string;
  request: unknown;
}

interface GoogleTimelinePoint {
  time: string;
  value: number[];
}

interface GoogleTimeline {
  default?: { timelineData?: GoogleTimelinePoint[] };
}

interface GoogleRelatedList {
  rankedKeyword?: Array<{ query?: string; value?: number }>;
}

interface GoogleRelated {
  default?: { rankedList?: GoogleRelatedList[] };
}

interface GoogleRegions {
  default?: {
    geoMapData?: Array<{
      geoCode?: string;
      geoName?: string;
      value?: number[];
    }>;
  };
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const analysisCache = new Map<string, CacheEntry<TrendAnalysis>>();
const trendingCache = new Map<string, CacheEntry<TrendingResult>>();
const suggestionCache = new Map<string, CacheEntry<string[]>>();
const failureUntil = new Map<string, number>();

function normalizeTerms(terms: string[]) {
  const unique: string[] = [];
  for (const raw of terms) {
    const term = raw.trim().replace(/\s+/g, " ").slice(0, 80);
    if (term && !unique.some((existing) => existing.toLowerCase() === term.toLowerCase())) {
      unique.push(term);
    }
  }
  return unique;
}

export function parseTermList(input: string | null): string[] {
  return normalizeTerms((input ?? "").split(","));
}

function stripGooglePrefix(text: string) {
  return text.replace(/^\)\]\}',?\s*/, "");
}

async function googleFetch(url: string) {
  const response = await fetch(url, {
    headers: {
      "user-agent": USER_AGENT,
      accept: "application/json, text/plain, */*",
      "accept-language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`Google Trends returned ${response.status}`);
  }

  const text = await response.text();
  try {
    return JSON.parse(stripGooglePrefix(text)) as unknown;
  } catch {
    throw new Error("Google Trends returned an unexpected payload");
  }
}

async function explore(terms: string[], geo: string, range: RangeKey) {
  const time = RANGE_OPTIONS[range].googleTime;
  const request = {
    comparisonItem: terms.map((keyword) => ({ keyword, geo, time })),
    category: 0,
    property: "",
  };
  const payload = (await googleFetch(
    `${BASE}/explore?hl=en-US&tz=0&req=${encodeURIComponent(JSON.stringify(request))}`,
  )) as { widgets?: ExploreWidget[] };
  const widgets = payload.widgets ?? [];
  const timeseries = widgets.find((widget) => widget.id === "TIMESERIES");
  if (!timeseries) throw new Error("Google Trends did not return a timeline");
  return widgets;
}

async function widget<T>(widgetData: ExploreWidget, endpoint: string): Promise<T> {
  const req = encodeURIComponent(JSON.stringify(widgetData.request));
  return (await googleFetch(
    `${BASE}/widgetdata/${endpoint}?hl=en-US&tz=0&req=${req}&token=${encodeURIComponent(widgetData.token)}`,
  )) as T;
}

function timelineFrom(payload: GoogleTimeline) {
  const raw = payload.default?.timelineData ?? [];
  if (raw.length === 0) throw new Error("Google Trends returned an empty timeline");
  // The widget does not declare its resolution; infer it from the cadence.
  const step = Number(raw[1]?.time ?? 0) - Number(raw[0]?.time ?? 0);
  const resolution: "day" | "week" = step > 0 && step <= 2 * 86400 ? "day" : "week";
  return {
    resolution,
    points: raw.map((point) => {
      const time = Number(point.time);
      return {
        time,
        date: new Date(time * 1000).toISOString(),
        values: point.value.map((value) => Number(value)),
      };
    }),
  };
}

function parseRelated(payload: GoogleRelated): RelatedQuery[] {
  const lists = payload.default?.rankedList ?? [];
  const rows: RelatedQuery[] = [];
  lists.slice(0, 2).forEach((list, listIndex) => {
    for (const item of (list.rankedKeyword ?? []).slice(0, 8)) {
      if (!item.query || !Number.isFinite(item.value)) continue;
      rows.push({
        query: item.query,
        value: Number(item.value),
        rising: listIndex === 1,
      });
    }
  });
  return rows;
}

function parseRegions(payload: GoogleRegions): RegionInterest[] {
  return (payload.default?.geoMapData ?? [])
    .map((row) => ({
      code: row.geoCode ?? "",
      name: row.geoName ?? row.geoCode ?? "Unknown",
      value: Number(row.value?.[0] ?? 0),
    }))
    .filter((row) => row.code && Number.isFinite(row.value) && row.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
}

function assemble(
  terms: string[],
  geo: string,
  range: RangeKey,
  points: SeriesPoint[],
  resolution: "day" | "week",
  related: RelatedQuery[],
  regions: RegionInterest[],
): TrendAnalysis {
  const times = points.map((point) => point.time);
  const insights: TermInsight[] = terms.map((term, index) => {
    const insight = buildInsight(
      term,
      points.map((point) => point.values[index] ?? 0),
      times,
      RANGE_OPTIONS[range].horizon,
    );
    // Secondary widgets are requested for a single term only; comparing
    // multiple terms changes Google's widget request shape.
    if (index === 0) {
      insight.related = related;
      insight.regions = regions;
    }
    return insight;
  });

  return {
    query: { terms, geo, range },
    source: "google",
    fetchedAt: new Date().toISOString(),
    resolution,
    points,
    insights,
  };
}

async function fetchLiveAnalysis(terms: string[], geo: string, range: RangeKey) {
  const widgets = await explore(terms, geo, range);
  const timeseriesWidget = widgets.find((widget) => widget.id === "TIMESERIES");
  if (!timeseriesWidget) throw new Error("Missing timeline widget");

  const timelinePayload = await widget<GoogleTimeline>(timeseriesWidget, "multiline");
  const time = timelineFrom(timelinePayload);

  let related: RelatedQuery[] = [];
  let regions: RegionInterest[] = [];

  if (terms.length === 1) {
    const relatedWidget = widgets.find((widget) => widget.id === "RELATED_QUERIES");
    const regionWidget = widgets.find((widget) => widget.id === "GEO_MAP");

    // Both widgets are supplementary. Fetch them together and absorb failures
    // so a partial response never throws away a valid timeline.
    await Promise.all([
      relatedWidget
        ? widget<GoogleRelated>(relatedWidget, "relatedsearches")
            .then((payload) => {
              related = parseRelated(payload);
            })
            .catch(() => undefined)
        : Promise.resolve(),
      regionWidget
        ? widget<GoogleRegions>(regionWidget, "comparedgeo")
            .then((payload) => {
              regions = parseRegions(payload);
            })
            .catch(() => undefined)
        : Promise.resolve(),
    ]);
  }

  return assemble(terms, geo, range, time.points, time.resolution, related, regions);
}

function cacheKey(terms: string[], geo: string, range: RangeKey) {
  return `${terms.map((term) => term.toLowerCase()).join(",")}|${geo}|${range}`;
}

/**
 * Return live Google Trends analysis. A successful response is cached for 12
 * minutes; if a request fails, the last successful snapshot may be reused for
 * that query and is marked stale. There is no synthetic fallback: a dashboard
 * built from invented interest would be worse than an explicit retry.
 *
 * Failures open a short cooldown per query so an outage or a 429 never turns
 * into a request storm from every open tab. The cache, not the client, is what
 * keeps monitoring polling cheap.
 */
export async function getAnalysis(
  rawTerms: string[],
  geo: string,
  range: RangeKey,
): Promise<TrendAnalysis> {
  const terms = normalizeTerms(rawTerms);
  if (terms.length === 0) throw new Error("Add at least one search term");
  if (terms.length > MAX_TERMS) throw new Error("Compare up to five terms at once");

  const key = cacheKey(terms, geo, range);
  const cached = analysisCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  if ((failureUntil.get(key) ?? 0) > Date.now()) {
    if (cached) {
      return {
        ...cached.value,
        stale: true,
        notice: "Google Trends is rate limiting; showing the last live snapshot.",
      };
    }
    throw new TrendSourceError("Google Trends is rate limiting requests. Try again in a minute.");
  }

  try {
    const live = await fetchLiveAnalysis(terms, geo, range);
    analysisCache.set(key, { value: live, expiresAt: Date.now() + ANALYSIS_TTL_MS });
    failureUntil.delete(key);
    return live;
  } catch {
    failureUntil.set(key, Date.now() + FAILURE_COOLDOWN_MS);
    if (cached) {
      return {
        ...cached.value,
        stale: true,
        notice: "Google Trends is unavailable; showing the last live snapshot.",
      };
    }
    throw new TrendSourceError("Google Trends is unavailable right now. Try again in a minute.");
  }
}

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, "&");
}

function readTag(block: string, tag: string) {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return match ? decodeXml(match[1]!.trim()) : null;
}

function parseRss(xml: string, geo: string): TrendingItem[] {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 8);
  return items.flatMap((match) => {
    const block = match[1] ?? "";
    const title = readTag(block, "title");
    if (!title) return [];
    const traffic = readTag(block, "ht:approx_traffic") ?? "";
    const published = readTag(block, "pubDate");
    const publishedAt =
      published && Number.isFinite(Date.parse(published))
        ? new Date(published).toISOString()
        : null;
    return [
      {
        title,
        traffic,
        publishedAt,
        link: `https://trends.google.com/trends/explore?q=${encodeURIComponent(title)}&geo=${geo}&date=today%2012-m`,
      },
    ];
  });
}

/**
 * Daily trending searches come from Google's RSS endpoint, not the retired
 * realtime JSON endpoint. Cache and cooldown mirror the analysis path. When no
 * live snapshot exists, return an empty result with a notice rather than
 * inventing searches.
 */
export async function getTrending(geo: string): Promise<TrendingResult> {
  const cached = trendingCache.get(geo);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const key = `trending:${geo}`;
  if ((failureUntil.get(key) ?? 0) > Date.now()) {
    if (cached) {
      return {
        ...cached.value,
        stale: true,
        notice: "Showing the last live trending snapshot.",
      };
    }
    return {
      geo,
      source: "google",
      fetchedAt: new Date().toISOString(),
      items: [],
      notice: "Google Trends is rate limiting; trending searches are unavailable.",
    };
  }

  try {
    const response = await fetch(
      `https://trends.google.com/trending/rss?geo=${encodeURIComponent(geo)}`,
      {
        headers: {
          "user-agent": USER_AGENT,
          accept: "application/rss+xml, application/xml, text/xml",
        },
        signal: AbortSignal.timeout(12_000),
      },
    );
    if (!response.ok) throw new Error(`Trending feed returned ${response.status}`);
    const items = parseRss(await response.text(), geo);
    if (items.length === 0) throw new Error("Trending feed was empty");
    const result: TrendingResult = {
      geo,
      source: "google",
      fetchedAt: new Date().toISOString(),
      items,
    };
    trendingCache.set(geo, { value: result, expiresAt: Date.now() + TRENDING_TTL_MS });
    failureUntil.delete(key);
    return result;
  } catch {
    failureUntil.set(key, Date.now() + FAILURE_COOLDOWN_MS);
    if (cached) {
      return {
        ...cached.value,
        stale: true,
        notice: "Showing the last live trending snapshot.",
      };
    }
    return {
      geo,
      source: "google",
      fetchedAt: new Date().toISOString(),
      items: [],
      notice: "Google Trends is unavailable; trending searches are unavailable.",
    };
  }
}

export async function suggest(term: string): Promise<string[]> {
  const query = term.trim().slice(0, 60);
  if (!query) return [];

  const key = `suggest:${query.toLowerCase()}`;
  const cached = suggestionCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if ((failureUntil.get(key) ?? 0) > Date.now()) return [];

  try {
    const payload = (await googleFetch(
      `${BASE}/autocomplete/${encodeURIComponent(query)}?hl=en-US`,
    )) as { default?: { topics?: Array<{ title?: string }> } };
    const seen = new Set<string>();
    const suggestions = (payload.default?.topics ?? [])
      .map((topic) => topic.title ?? "")
      .filter((title) => {
        const titleKey = title.toLowerCase();
        if (!title || seen.has(titleKey)) return false;
        seen.add(titleKey);
        return true;
      })
      .slice(0, 7);
    suggestionCache.set(key, { value: suggestions, expiresAt: Date.now() + 10 * 60_000 });
    return suggestions;
  } catch {
    failureUntil.set(key, Date.now() + 5 * 60_000);
    throw new Error("Autocomplete is unavailable");
  }
}
