import { ADOPTION_SEGMENTS, VIEWER_SEGMENTS } from "../../shared/segments.ts";
import type {
  SocialSignals,
  TrendMap,
  TrendMapEdge,
  TrendMapNode,
  TrendScore,
} from "../../shared/types.ts";
import { getDb } from "../db.ts";
import { segmentCoverage } from "./pipeline.ts";
import type { Space } from "../db.ts";

/**
 * Trend map: the collection graph rendered for a non-specialist audience.
 *
 * Nodes are viewer segments (fixed hubs) and pattern clusters (leaves). An edge
 * means "this segment observed this pattern", which is a collected fact, not an
 * inference. Node size is the pattern's emergence score.
 *
 * The score is a transparent heuristic, not a probability. It deliberately
 * weights *distinct authors* over post count: the first cluster measured here
 * had 64 posts from a single account, which is one person's counter bot, not an
 * emerging trend. Any score that ranked it first would be lying to the viewer.
 */

const HOURS_DEFAULT = 72;
/**
 * Patterns drawn on the map. Beyond roughly this many, circles overlap so
 * heavily that size comparison — the whole point of the encoding — stops
 * working; the ranked list still reports the full top set.
 */
const MAX_PATTERN_NODES = 40;
/**
 * Per-segment share of the map. Taking the global top N let the discovery pool,
 * which sees the whole network, take 30 of 40 slots and left seven niches with
 * no patterns at all — the map then read as "nothing happens in Science", which
 * was false: 3 of its 33 posts were clustered. A floor per segment guarantees
 * every audience is represented before remaining slots go to the strongest.
 */
const MIN_PATTERNS_PER_SEGMENT = 3;
/** Window used for the recent-versus-prior velocity comparison. */
const VELOCITY_WINDOW_HOURS = 6;

interface ClusterStatsRow {
  cluster_id: string;
  space: Space;
  posts: number;
  authors: number;
  recent: number;
  prior: number;
  recent_authors: number;
  prior_authors: number;
  segments: string[] | null;
  first_seen: Date;
  last_seen: Date;
  label: string | null;
  kind: string;
  media_count: number;
  observed_span_hours: number;
}

/**
 * Components, each normalized to 0..1 before weighting so a single long-running
 * cluster cannot dominate through raw volume.
 *
 * - reach: distinct authors, log-scaled. Ten independent creators is the first
 *   evidence of replication; one account posting ten times is not.
 * - velocity: recent authors against the preceding window. Only authors count,
 *   so a burst of reposts from one account cannot look like acceleration.
 * - spread: distinct collection segments. Discover is excluded upstream, so a
 *   general trending pool cannot inflate this.
 * - persistence: how long the pattern has kept producing members.
 * - diversity: authors per post. A ratio near 1 means every post is a different
 *   person; a ratio near 0 means mechanical repetition.
 *
 * A support factor then scales the weighted sum by evidence volume. Without it a
 * brand-new two-post cluster scored 65/100: velocity is 1.0 whenever there is no
 * prior window to compare against, persistence is 1.0 for any pattern older than
 * 12 hours, and diversity is 1.0 when two authors wrote two posts. Those are all
 * technically true and jointly misleading. Two independent creators is a
 * hypothesis, not a trend, so the score says so.
 */
function scoreCluster(row: ClusterStatsRow): TrendScore {
  const authors = Number(row.authors);
  const posts = Number(row.posts);
  const recentAuthors = Number(row.recent_authors);
  const priorAuthors = Number(row.prior_authors);

  const reach = Math.min(1, Math.log10(authors + 1) / Math.log10(11));
  // Velocity needs two comparable windows. Until the collector has 12 hours of
  // history, "no prior authors" means *unmeasured*, not "infinite growth" — the
  // same unknown-is-not-zero rule coverage follows. A neutral 0.5 keeps a young
  // deployment from ranking every cluster as accelerating.
  const velocityComparable = Number(row.observed_span_hours) >= VELOCITY_WINDOW_HOURS * 2;
  const velocity = !velocityComparable
    ? 0.5
    : priorAuthors === 0
      ? recentAuthors > 0
        ? 1
        : 0
      : Math.min(1, recentAuthors / (priorAuthors * 2));
  const spread = Math.min(1, (row.segments?.length ?? 0) / 3);
  const ageHours = Math.max(0, (row.last_seen.getTime() - row.first_seen.getTime()) / 3_600_000);
  const persistence = Math.min(1, ageHours / 12);
  const diversity = posts === 0 ? 0 : authors / posts;

  const raw = 0.34 * reach + 0.26 * velocity + 0.18 * spread + 0.12 * persistence + 0.1 * diversity;

  // Evidence volume gates the score: one author keeps 30% of it, five or more
  // keep all of it. The curve is linear in between so the ranking stays stable.
  const support = Math.min(1, authors / 5);
  const confidence = 0.3 + 0.7 * support;

  return {
    potential: Math.round(raw * confidence * 100),
    reach,
    velocity,
    spread,
    persistence,
    diversity,
    confidence,
    authors,
    posts,
  };
}

/** Radius grows with the square root of potential so area tracks the score. */
function radiusFor(potential: number) {
  return 4 + Math.sqrt(potential / 100) * 14;
}

export async function buildTrendMap(hours = HOURS_DEFAULT): Promise<TrendMap> {
  const db = await getDb();
  const adoptionIds = ADOPTION_SEGMENTS.map((segment) => segment.id);

  const rows = (await db`
    WITH members AS (
      SELECT c.id AS cluster_id, c.space::text AS space,
             p.id AS post_id, p.author_did, p.published_at, p.media, p.kind
      FROM clusters c
      JOIN cluster_members cm ON cm.cluster_id = c.id
      JOIN posts p ON p.id = cm.post_id
      WHERE p.deleted_at IS NULL
        AND p.published_at > now() - ${`${hours} hours`}::interval
    ),
    agg AS (
      SELECT cluster_id,
             count(DISTINCT post_id)::int AS posts,
             count(DISTINCT author_did)::int AS authors,
             count(DISTINCT post_id) FILTER (
               WHERE published_at > now() - ${`${VELOCITY_WINDOW_HOURS} hours`}::interval
             )::int AS recent,
             count(DISTINCT post_id) FILTER (
               WHERE published_at <= now() - ${`${VELOCITY_WINDOW_HOURS} hours`}::interval
                 AND published_at > now() - ${`${VELOCITY_WINDOW_HOURS * 2} hours`}::interval
             )::int AS prior,
             count(DISTINCT author_did) FILTER (
               WHERE published_at > now() - ${`${VELOCITY_WINDOW_HOURS} hours`}::interval
             )::int AS recent_authors,
             count(DISTINCT author_did) FILTER (
               WHERE published_at <= now() - ${`${VELOCITY_WINDOW_HOURS} hours`}::interval
                 AND published_at > now() - ${`${VELOCITY_WINDOW_HOURS * 2} hours`}::interval
             )::int AS prior_authors,
             min(published_at) AS first_seen,
             max(published_at) AS last_seen
      FROM members GROUP BY cluster_id
    )
    SELECT a.*, c.space::text AS space,
           (SELECT extract(epoch FROM (now() - min(o.observed_at))) / 3600
              FROM observations o)::float8 AS observed_span_hours,
           (SELECT string_agg(DISTINCT o.segment_id, ',')
              FROM members m JOIN observations o ON o.post_id = m.post_id
             WHERE m.cluster_id = a.cluster_id) AS segments,
           (SELECT p.body FROM members m JOIN posts p ON p.id = m.post_id
             WHERE m.cluster_id = a.cluster_id AND length(p.body) >= 25
             ORDER BY length(p.body) DESC LIMIT 1) AS label,
           (SELECT count(*)::int FROM members m WHERE m.cluster_id = a.cluster_id
              AND jsonb_array_length(m.media) > 0) AS media_count
    FROM agg a
    JOIN clusters c ON c.id = a.cluster_id
    WHERE a.authors >= 1
    ORDER BY a.authors DESC, a.posts DESC
    LIMIT ${MAX_PATTERN_NODES * 6}
  `) as unknown as Array<
    Omit<ClusterStatsRow, "segments" | "label" | "kind" | "media_count"> & {
      segments: string | null;
      label: string | null;
      kind: string;
      media_count: number;
      observed_span_hours: number;
    }
  >;

  const all = rows.map((row) => ({
    ...row,
    // The aggregate query returns `cluster_id`; node and edge ids are built
    // from it, so normalizing here keeps undefined out of every React key.
    id: row.cluster_id,
    segments: row.segments ? row.segments.split(",") : [],
    observed_span_hours: Number(row.observed_span_hours ?? 0),
  }));

  /**
   * Stratified selection: every collection segment gets its strongest patterns
   * first, then the remaining slots go by score. Without this the map's shape
   * is decided by whichever feed emits the most posts, not by where the evidence
   * actually is.
   */
  const scored = all
    .map((row) => ({ row, score: scoreCluster(row) }))
    .sort((a, b) => b.score.potential - a.score.potential);

  const chosen: typeof scored = [];
  const taken = new Set<string>();
  for (const segment of VIEWER_SEGMENTS.filter((item) => item.scope === "collection")) {
    const owned = scored.filter(
      (item) => !taken.has(item.row.cluster_id) && (item.row.segments ?? []).includes(segment.id),
    );
    for (const item of owned.slice(0, MIN_PATTERNS_PER_SEGMENT)) {
      chosen.push(item);
      taken.add(item.row.cluster_id);
    }
  }
  for (const item of scored) {
    if (chosen.length >= MAX_PATTERN_NODES) break;
    if (taken.has(item.row.cluster_id)) continue;
    chosen.push(item);
    taken.add(item.row.cluster_id);
  }

  const clusters = chosen
    .slice(0, MAX_PATTERN_NODES)
    .map((item) => ({ ...item.row, preselected: item.score }));

  const coverage = await segmentCoverage(hours);
  const nodes: TrendMapNode[] = [];
  const edges: TrendMapEdge[] = [];

  // Segment hubs are fixed positions: the map is read audience-first, and a
  // drifting hub would make two visits show different structures for the same
  // evidence. Angle is derived from the catalog order, which is stable.
  //
  // The ring radius grows with the pattern count, because each hub's leaves are
  // placed on a ring around it: a fixed 260px radius left a hollow middle with
  // eight isolated dots and crushed every discover leaf into one pile.
  const segmentNodes = VIEWER_SEGMENTS.filter((segment) => segment.scope === "collection");
  // Compact enough that the hubs read as one population rather than eight
  // islands, loose enough that each hub's leaf cluster stays its own clump.
  const hubRing = Math.max(135, Math.min(190, 95 + Math.sqrt(clusters.length) * 12));
  segmentNodes.forEach((segment, index) => {
    const angle = (index / segmentNodes.length) * Math.PI * 2 - Math.PI / 2;
    nodes.push({
      id: `segment:${segment.id}`,
      kind: "segment",
      label: segment.label,
      description: segment.description,
      radius: 13,
      potential: null,
      posts: coverage.find((row) => row.segmentId === segment.id)?.posts ?? 0,
      authors: 0,
      segments: [segment.id],
      // Radius carries meaning for patterns only, so hubs are placed explicitly.
      x: Math.cos(angle) * hubRing,
      y: Math.sin(angle) * hubRing,
    });
  });

  const clusterNodes: TrendMapNode[] = [];
  for (const row of clusters) {
    const score = row.preselected;
    const observed = (row.segments ?? []).filter((id) => adoptionIds.includes(id));
    const label = (row.label ?? "").replace(/\s+/g, " ").trim() || "(media-only pattern)";
    clusterNodes.push({
      id: `cluster:${row.cluster_id}`,
      kind: "pattern",
      label: label.slice(0, 90),
      description:
        `${score.posts} post${score.posts === 1 ? "" : "s"} from ${score.authors} ` +
        `author${score.authors === 1 ? "" : "s"} across ${observed.length || 1} ` +
        `audience${observed.length === 1 ? "" : "s"}.`,
      radius: radiusFor(score.potential),
      potential: score.potential,
      posts: score.posts,
      authors: score.authors,
      segments: observed,
      score,
      clusterId: row.cluster_id,
      kind_: row.kind,
      mediaCount: Number(row.media_count),
      firstSeenAt: row.first_seen.toISOString(),
      lastSeenAt: row.last_seen.toISOString(),
    });

    // A pattern observed by no collection segment still belongs to the map via
    // Discover; it is attached to the discovery hub so nothing is unreachable.
    // The attachment list is deduplicated because a post can carry several
    // spans (text plus images), which would otherwise emit duplicate edges and
    // collide on React keys.
    const attachment = [...new Set(observed.length > 0 ? observed : ["discover"])];
    for (const segmentId of attachment) {
      edges.push({
        id: `segment:${segmentId}>cluster:${row.cluster_id}`,
        source: `segment:${segmentId}`,
        target: `cluster:${row.cluster_id}`,
        relation: "observed-in",
        weight: 1,
      });
    }
  }

  // Discovery is a hub too, but it is drawn as a whole-network pool: a pattern
  // reaching it says nothing about crossing, so it is visually distinct.
  nodes.push({
    id: "segment:discover",
    kind: "pool",
    label: "Discover",
    description: "Bluesky's general trending pool. Reaching it is not audience adoption.",
    // Every unmapped pattern attaches here, so the pool is drawn larger than a
    // niche segment: it is visibly the busiest hub, not just another anchor.
    radius: 16,
    potential: null,
    posts: coverage.find((row) => row.segmentId === "discover")?.posts ?? 0,
    authors: 0,
    segments: ["discover"],
    x: 0,
    y: 0,
  });

  const byPotential = [...clusterNodes].sort((a, b) => (b.potential ?? 0) - (a.potential ?? 0));

  return {
    hours,
    generatedAt: new Date().toISOString(),
    nodes: [...nodes, ...clusterNodes],
    edges,
    top: byPotential.slice(0, 12),
    coverage,
    method: {
      version: 1,
      velocityWindowHours: VELOCITY_WINDOW_HOURS,
      weights: { reach: 0.34, velocity: 0.26, spread: 0.18, persistence: 0.12, diversity: 0.1 },
      // False until the collector has two comparable windows; the panel says so
      // instead of presenting a neutral default as measured acceleration.
      velocityComparable: clusters.some(
        (row) => Number(row.observed_span_hours) >= VELOCITY_WINDOW_HOURS * 2,
      ),
    },
  };
}

export type { SocialSignals };
