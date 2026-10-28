# Trendifest

A minimal trend analysis, forecasting, and monitoring prototype built on Google
Trends search interest. Search a term, compare up to five terms, project the next
few observations, and set thresholds that turn live movement into alerts.

> **Prototype branch:** the app opens with a separate, entirely fictional
> trend-network study at `#/prototype/trend-network`; `#/overview` still reaches
> the Google Trends workspace. See [Trend-network mock](#trend-network-mock).

## Trend-network mock

The trend-network study explores the early-signal product idea without connecting
to a social network or pretending to make real predictions. It contains fictional
patterns, creators, media, evidence links, and numerical scores. Read the
[research feasibility note](docs/research/early-trend-intelligence.md) for the
design constraints behind it.

Open `http://localhost:5180/#/prototype/trend-network` after `bun run dev`, or use
the links in the sidebar. The mock offers three layout studies, switchable with
the development bar or `?variant=A|B|C` in the URL:

- **Radar** — ranked candidates, a focused evidence graph, and an inspector.
- **Canvas** — a wider graph with candidate and activity rails.
- **Editorial** — a readable signal brief with its supporting graph.

Try selecting graph nodes to inspect inferred relationships, scrubbing the pattern
history, simulating a new remix, configuring a mock alert, monitoring a candidate,
pausing a sample feed, and exporting a Markdown brief. All state is in memory and
resets on reload. The Google Trends API is not used on this route.

## Stack

- **Bun** for the runtime, server, scripts, and tests
- **Vite+** (`vite-plus`) for dev, build, formatting, linting, and type checks
- **React 19 + TypeScript**
- **Tailwind CSS 4** with shadcn-style semantic tokens and Radix Dialog
- **Recharts** for the interest and forecast charts
- **TanStack Query** for caching, polling, and mutations
- **Geist** (self-hosted via Fontsource) and Lucide icons

## Run it

```bash
bun install
bun run dev
```

Open **http://localhost:5180**. The dev command starts the Bun API on port 8787
and the Vite+ dev server with a `/api` proxy. Use `Ctrl+C` to stop both.

```bash
bun run check   # Vite+ format + lint + typecheck
bun test        # forecast and alert unit tests
bun run build   # typecheck and production client build
bun run start   # serve dist + API on port 8787
```

Set `PORT` to move the API (the dev proxy follows it). Set
`TRENDIFEST_DATA_FILE` to use another watchlist store.

## What it does

- **Overview** — a selected trend's interest history, a damped-trend forecast
  with an 80% interval, watchlist movement, and recent alerts.
- **Explore** — add up to five terms, compare them on Google's shared 0–100
  index, and read related queries and regional interest for a single term.
- **Watchlist** — edit alert thresholds inline, remove a trend with undo, and
  inspect per-trend movement and projections.
- **Alerts** — unread/all filters, mark-one or mark-all-read, and plain-language
  explanations of each threshold crossing.

Data is pulled from Google Trends' unofficial explore and widget endpoints, the
daily trending RSS feed, and autocomplete. Watchlist state lives in
`server/data/state.json` (gitignored) and is written atomically. Alerts are
derived only from live data, deduplicated by observed period, and never created
from the demo fallback.

## Forecast method

Each series is fitted with a damped Holt linear trend. The level, trend, and
damping factors are selected by a grid search over one-step squared error. The
projection carries an approximate 80% interval derived from the fit's RMSE, and
accuracy is measured by holding out the last four observations and reporting
MAPE. These are statistical projections, not Google predictions.

Google returns a relative 0–100 index for each request; when several terms are
compared, they share one normalization. The interface labels the scale on every
chart and exposes the same series in a keyboard-reachable data table.

## Live data and the sample fallback

Google Trends rate-limits unauthenticated clients aggressively, especially
shared IPs. The server caches a successful analysis for 12 minutes, keeps a
90-second failure cooldown per query, and degrades in stages:

1. fresh live data;
2. the last live snapshot, marked **Cached live data**;
3. deterministic sample data, marked **Sample data** in the header, banner, and
   chart.

The fallback exists so the workspace stays usable and reviewable when Google
returns HTTP 429. It never feeds the alert pipeline. If you see sample data, use
**Retry live data** after the cooldown or continue with another network.

## Layout

```
server/          Bun API, Google Trends client, forecast engine, JSON store
shared/          Wire types and country/range configuration
src/components/  shadcn-style primitives, charts, product components
src/pages/       Overview, Explore, Watchlist, Alerts
src/hooks/       Hash routing, theme, debounce, TanStack Query hooks
tests/           Forecast and alert derivation tests
scripts/dev.ts   Starts the API and Vite+ dev server together
```

## Limits

This is a local, single-user prototype. It has no authentication, database,
background worker, or production rate-limit budget. The Google Trends endpoints
are unofficial and can change. Up to five terms can be compared in one request;
the watchlist holds twelve trends.
