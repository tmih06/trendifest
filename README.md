# Trendifest

A minimal trend analysis, forecasting, and monitoring app built on Google Trends
search interest. Search a term, compare up to five terms, project the next few
observations, and monitor a watchlist with threshold alerts.

Every number in the product comes from live Google Trends data or a cached live
snapshot. There is no demo watchlist and no synthetic fallback.

## Stack

- **Bun** for the runtime, server, scripts, and tests
- **Vite+** (`vite-plus`) for dev, build, formatting, linting, and type checks
- **React 19 + TypeScript**
- **Tailwind CSS 4** with shadcn-style semantic tokens and Radix Dialog
- **Recharts** for the interest and forecast charts
- **TanStack Query** for caching, polling, and mutations
- **Inter** (self-hosted via Fontsource), an Obsidian-inspired workspace, and Lucide icons

## Run it

```bash
bun install
bun run dev
```

Open **http://localhost:5180**. The dev command starts the Bun API on port 8787
and the Vite+ dev server with a `/api` proxy. No password is required in
development. Use `Ctrl+C` to stop both.

```bash
bun run check   # Vite+ format + lint + typecheck
bun test        # forecast, Google client, and alert tests
bun run build   # typecheck and production client build
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

| Variable               | Default                          | Purpose                                                     |
| ---------------------- | -------------------------------- | ----------------------------------------------------------- |
| `PORT`                 | `8787`                           | API and production static server port                       |
| `TRENDIFEST_PASSWORD`  | unset                            | Password gate; required when `NODE_ENV=production`          |
| `TRENDIFEST_DATA_FILE` | `server/data/state.json`         | Watchlist and alert store                                   |
| `TRENDIFEST_MONITOR`   | production: on; development: off | Set `1` to enable the background monitor, `0` to disable it |

The monitor refreshes the watchlist every 15 minutes and appends threshold
alerts to the store, so alerts keep accumulating while nobody has the app open.
Alerts are delivered in-app; the MVP has no email or webhook delivery.

## What it does

- **Overview** — selected trend history, a damped-trend forecast with an 80%
  interval, watchlist movement, recent alerts, and daily trending searches.
- **Explore** — add up to five terms, compare them on Google's shared 0–100
  index, and read related queries and regional interest for a single term.
- **Watchlist** — edit alert thresholds inline, remove a trend with undo, and
  inspect per-trend movement and projections.
- **Alerts** — unread/all filters, mark-one or mark-all-read, and plain-language
  explanations of each threshold crossing.

A first run starts with an empty watchlist. Add terms from any page; the
watchlist holds twelve.

## Live data behavior

Google Trends rate-limits unauthenticated clients aggressively, especially
shared IPs. Data degrades in two honest stages:

1. fresh live data;
2. the last successful live snapshot, marked **Cached live data**;
3. an explicit error with **Retry** when neither exists.

A failed query enters a 90-second cooldown so an outage never becomes a request
storm from every open tab. Cached snapshots remain visible during an outage and
never enter the alert pipeline twice.

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
shared/          Wire types and country/range configuration
src/components/  shadcn-style primitives, charts, and layout
src/pages/       Overview, Explore, Watchlist, Alerts
src/hooks/       Hash routing, theme, debounce, TanStack Query hooks
tests/           Forecast, Google client, and alert derivation tests
scripts/dev.ts   Starts the API and Vite+ dev server together
```

## Limits

This is a single-user MVP. It has one shared password and no account model, so
there is no per-user data separation and no login rate limiting. Use a long
password and keep the server behind HTTPS. Watchlist state lives in one
atomically written JSON file; there is no database or multi-instance
coordination. The background monitor is one process on a fixed 15-minute
interval, with no durable job queue. Google's endpoints are unofficial, can
change, and have no SLA. Up to five terms can be compared in one request; the
watchlist holds twelve.
