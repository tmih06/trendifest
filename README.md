# Trendifest

A trend analysis, forecasting, and monitoring app with two collection paths:

- **Google Trends** (default) — keyword search interest, comparison, forecasts,
  and threshold alerts. The root opens a live related-query graph; the workspace
  behind it compares up to five terms and projects the next observations.
- **Social signals** (optional, `#/signals`) — live Bluesky posts collected per
  _viewer segment_, embedded locally per modality, and grouped into pattern
  clusters with cross-audience adoption counts.

Every number in the product comes from live data or a cached live snapshot.
There is no demo watchlist, no synthetic posts, and no invented cluster.

## Stack

- **Bun** for the runtime, server, scripts, and tests
- **Vite+** (`vite-plus`) for dev, build, formatting, linting, and type checks
- **React 19 + TypeScript**
- **Tailwind CSS 4** with shadcn-style semantic tokens and Radix Dialog
- **Recharts** for the interest and forecast charts
- **react-force-graph-2d** and **d3-force** for the live related-query graph
- **TanStack Query** for caching, polling, and mutations
- **Inter** (self-hosted via Fontsource), an Obsidian-inspired workspace, and Lucide icons
- **Postgres + pgvector** for social observations, vectors, and clusters
- **transformers.js** (ONNX, local) for MiniLM text, CLIP image, and CLAP audio embeddings

## Run it

```bash
bun install
bun run dev
```

The dev command picks the first free ports (starting from 5180 for the web app
and 8787 for the API), prints both URLs when the API answers, and points the
`/api` proxy at the port it actually chose. A stale dev server or another project
on 8787 is not a failure: both servers move forward and the proxy follows. Set
`PORT` or `WEB_PORT` to pin either one.

The root is the related graph; the dashboard is at `#/overview`. No password is
required in development. Use `Ctrl+C` to stop both.

```bash
bun run check   # Vite+ format + lint + typecheck
bun test        # forecast, Google client, alert, and social adapter tests
bun run build   # typecheck and production client build
```

Social pipeline tests need a scratch database and are skipped without one:

```bash
TRENDIFEST_TEST_DATABASE_URL='postgres://postgres:pg@127.0.0.1:5432/trendifest_test' bun test
```

## Run in production

Production requires a password; the server exits without one.

```bash
bun run build
TRENDIFEST_PASSWORD='choose-a-long-password' bun run start
```

The API and the client shell are protected by HTTP Basic authentication. The
browser asks once and remembers the credential for the session. Serve the app
behind HTTPS: Basic credentials are only as private as the transport. Only
`/api/health` is public so a supervisor can probe the process.

Environment variables:

| Variable               | Default                          | Purpose                                                                                              |
| ---------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `PORT`                 | `8787`                           | API port. In development, the first free port is used if taken; production fails rather than moving. |
| `WEB_PORT`             | `5180`                           | Dev web port. The dev script falls forward if taken.                                                 |
| `TRENDIFEST_PASSWORD`  | unset                            | Password gate; required when `NODE_ENV=production`                                                   |
| `TRENDIFEST_DATA_FILE` | `server/data/state.json`         | Watchlist and alert store                                                                            |
| `TRENDIFEST_MONITOR`   | production: on; development: off | Set `1` to enable the background monitor, `0` to disable it                                          |

The monitor refreshes the watchlist every 15 minutes and appends threshold
alerts to the store, so alerts keep accumulating while nobody has the app open.
Alerts are delivered in-app; the MVP has no email or webhook delivery.

## Social collection (optional)

Set `TRENDIFEST_DATABASE_URL` to a Postgres database and `TRENDIFEST_SOCIAL=1` to
collect real posts. Requires the `vector` extension (the server creates it) and
`ffmpeg` on PATH for video frames and audio.

```bash
docker run -d --name pg -e POSTGRES_PASSWORD=pg -p 5432:5432 pgvector/pgvector:pg17
TRENDIFEST_DATABASE_URL='postgres://postgres:pg@127.0.0.1:5432/postgres' \
TRENDIFEST_SOCIAL=1 bun run dev
```

Then open `#/map` for the trend map and `#/signals` for per-segment coverage.

**Viewer segments are stratified collection, not demographics.** Bluesky exposes
no audience data, so a segment is defined only as _the posts this feed surfaced_
(`shared/segments.ts`, every feed URI verified against the public feed index).
The unit tagged is the **observation**, not the post: one post appearing in two
segments is two rows, which is what makes cross-audience adoption measurable. A
crossing counts collection segments only — Discover is a whole-network pool and
is never counted, because reaching it says nothing about crossing.

**Embeddings are local and plural, never one vector.** Text (MiniLM, 384d,
multilingual), images and video frames (CLIP, 512d), audio (CLAP, 512d) live in
separate spaces with separate HNSW indexes. Cosines from different models are not
comparable, so multi-space search fuses by reciprocal rank. All vectors are
L2-normalized and zero-padded into one 1024-dim column; padding preserves cosine
exactly, and pgvector cannot index a dimension-less column.

**Clustering uses complete linkage at measured thresholds.** A post joins a
cluster only if it is within the space's floor of the centroid _and_ of every
existing member. Floors come from measured corpus distributions, not guesses:
text 0.75 (p99 of 7,140 real pairs was 0.431; a 0.62 floor merged a Japanese eel
post with a Turkish greeting), image 0.78 (p99 0.638, max 0.761). Two rules keep
this honest:

- Text under 25 characters is stored and searchable but **not clustered**. Below
  that length the distributions invert — unrelated pairs reached 0.952 while
  related pairs peaked at 0.845 — so no threshold can separate them.
- Individual video frames are searchable but not clustered; a 100 ms shift
  changes the image.

The trade is deliberate: these floors group re-uploads and near-identical
imagery, not "two photos of the same subject". A wrong merge is unrecoverable
evidence; a missed merge is a smaller cluster.

**The live tail samples.** The public Jetstream carries roughly 1,500 posts a
minute, far beyond local CPU inference. `TRENDIFEST_TAIL_SAMPLE` (default 20)
embeds every Nth create; deletes are never sampled, so takedowns always apply. A
bounded queue drops oldest rather than reporting lag as signal. Coverage says
this plainly instead of implying the whole network was read.

**Coverage is per segment and outages are unknown, not zero.** A feed that failed
this cycle reports `unknown`; a segment that ran and found nothing reports `0`.

Metrics snapshots are append-only with their own capture time, so a later read
cannot silently rewrite an earlier measurement. A delete tombstones the post and
removes its vectors and cluster memberships.

## Trend map (`#/map`)

The demo view. **Larger pattern nodes mean higher emergence scores**: the
bigger the node, the more potential that pattern has to become a trend.
Every edge is a collected observation, not an invented similarity.

The canvas uses a force-directed layout with repulsion, link attraction, and
collision spacing. Audience hubs are not pinned to a ring. The initial layout
settles offscreen; live relaxation stops after at most two seconds. Refreshes
preserve existing node positions and the camera instead of restarting the layout.
Reduced-motion mode displays the settled layout without live relaxation.

| Component   | Weight | What it measures                       |
| ----------- | ------ | -------------------------------------- |
| Reach       | 34%    | Distinct authors, log-scaled           |
| Velocity    | 26%    | Recent authors versus the prior window |
| Spread      | 18%    | Distinct audience segments             |
| Persistence | 12%    | How long it keeps producing members    |
| Diversity   | 10%    | Authors per post                       |

The weighted sum is multiplied by an evidence-volume factor: one author keeps
30% of the score, five or more keep all of it. Three rules keep the number
honest, each learned from the live corpus:

- **Authors, not posts.** The first cluster measured had 64 posts from a single
  account — a counter bot. Post count would have ranked it first.
- **Velocity is neutral, not maximum, while history is short.** With less than
  12 hours collected there is no prior window, so "no prior authors" means
  unmeasured; the map says so instead of reporting every cluster as accelerating.
- **Future-dated posts are clamped.** `record.createdAt` is client-supplied; a
  post claiming 2050 would stay permanently newest and corrupt recency.

This is a heuristic, not a probability, and it says so in the UI. It ranks
candidates for a human to inspect; it does not predict breakout.

## What it does

- **Related graph** — choose a watched term and see Google's top and rising
  related queries as a force-directed network. Queries connect to the center
  because Google returned them together; a second kind of edge joins labels
  where one query literally contains the other. Select a node for its real
  value, open it in Explore, or monitor it with a 15% threshold.
- **Overview** — selected trend history, a damped-trend forecast with an 80%
  interval, watchlist movement, recent alerts, and daily trending searches.
- **Explore** — add up to five terms, compare them on Google's shared 0–100
  index, and read related queries and regional interest for a single term.
- **Watchlist** — edit alert thresholds inline, remove a trend with undo, and
  inspect per-trend movement and projections.
- **Alerts** — unread/all filters, mark-one or mark-all-read, and plain-language
  explanations of each threshold crossing.
- **Signals** — per-segment coverage, clusters ranked by audience crossings, and
  one ranked search across text and image spaces.

A first run starts with an empty watchlist and an empty graph. Add a term from
the graph or any workspace page; the watchlist holds twelve.

## Live data behavior

Google Trends rate-limits unauthenticated clients aggressively, especially
shared IPs. Data degrades in two honest stages:

1. fresh live data;
2. the last successful live snapshot, marked **Cached live data**;
3. an explicit error with **Retry** when neither exists.

A failed query enters a 90-second cooldown so an outage never becomes a request
storm from every open tab. Cached snapshots remain visible during an outage and
never enter the alert pipeline twice.

## Related graph data

The graph makes one single-term Google Trends request per selected term, because
Google only returns related queries for single-term requests. Top-query values
are a relative 0–100 score; rising-query values are growth percentages, not
search volume. A center-to-query edge means Google returned that query as
related. A curved query-to-query edge means one label literally contains the
other. Nothing else is inferred.

Country comes from the watchlist item; range comes from the graph controls.
Changing either resets the selection and fetches a fresh neighborhood. When no
related queries come back, the graph says so instead of manufacturing nodes.

## Forecast method

Each series is fitted with a damped Holt linear trend. The level, trend, and
damping factors are selected by a grid search over one-step squared error. The
projection carries an approximate 80% interval derived from the fit's RMSE, and
accuracy is measured by holding out the last four observations and reporting
MAPE. These are statistical projections, not Google predictions.

Google returns a relative 0–100 index for each request; when several terms are
compared, they share one normalization. The interface labels the scale on every
chart and exposes the same series in a keyboard-reachable data table.

## Layout

```
server/          Bun API, Google Trends client, forecast engine, auth, JSON store
server/social/   Bluesky adapter, media decode, local embeddings, clustering
shared/          Wire types and country/range configuration
src/components/  shadcn-style primitives, charts, graph canvas, and inspector
src/pages/       Related graph, Trend map, Overview, Signals, Explore, Watchlist, Alerts
src/hooks/       Hash routing, theme, debounce, TanStack Query hooks
tests/           Forecast, Google client, alerts, social adapter and pipeline tests
scripts/dev.ts   Starts the API and Vite+ dev server together
```

## Limits

Social coverage is one network. Bluesky is the only source with verified
unauthenticated live access; TikTok's research API excludes commercial use,
Reddit needs a written agreement, and YouTube permits metadata but not downloads.
The segment model is source-agnostic, but the covered population is Bluesky
today, and the UI says so rather than averaging it away.

This is a single-user MVP. It has one shared password and no account model, so
there is no per-user data separation and no login rate limiting. Use a long
password and keep the server behind HTTPS. Watchlist state lives in one
atomically written JSON file; there is no database or multi-instance
coordination. The background monitor is one process on a fixed 15-minute
interval, with no durable job queue. Google's endpoints are unofficial, can
change, and have no SLA. Up to five terms can be compared in one request; the
watchlist holds twelve.
