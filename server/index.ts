import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ApiError, RangeKey } from "../shared/types.ts";
import { isGeoCode, isRangeKey } from "../shared/config.ts";
import { AUTH_ENABLED, authorize } from "./auth.ts";
import { getAnalysis, parseTermList, suggest, TrendSourceError } from "./google-trends.ts";
import { DatabaseMissingError } from "./db.ts";
import {
  runBackfill,
  signalsWithCoverage,
  socialHealth,
  startSocialCollection,
  status,
} from "./social/service.ts";
import { buildTrendMap } from "./social/trend-map.ts";
import { searchAcrossSpaces } from "./social/pipeline.ts";
import { BlueskyError } from "./social/bluesky.ts";
import { buildOverview, refreshWatchlist } from "./overview.ts";
import {
  addWatchlist,
  ApiFailure,
  markAlertsRead,
  readState,
  removeWatchlist,
  updateThreshold,
} from "./store.ts";

const DIST = fileURLToPath(new URL("../dist", import.meta.url));
const PORT = Number(process.env.PORT ?? 8787);
const PRODUCTION = process.env.NODE_ENV === "production";
const MONITOR_INTERVAL_MS = 15 * 60 * 1000;

if (PRODUCTION && !AUTH_ENABLED) {
  console.error("TRENDIFEST_PASSWORD is required when NODE_ENV=production.");
  console.error("Set it in the environment or a local .env file, then start again.");
  process.exit(1);
}

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function apiError(status: number, error: string, code = "bad_request") {
  return json({ error, code } satisfies ApiError, status);
}

function readGeo(url: URL) {
  const geo = (url.searchParams.get("geo") ?? "US").toUpperCase();
  if (!isGeoCode(geo)) throw new ApiFailure(400, "Choose a supported country", "invalid_geo");
  return geo;
}

function readRange(url: URL): RangeKey {
  const range = url.searchParams.get("range") ?? "12m";
  if (!isRangeKey(range))
    throw new ApiFailure(400, "Choose a supported date range", "invalid_range");
  return range;
}

async function readJson(request: Request) {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    throw new ApiFailure(400, "Request body must be valid JSON", "invalid_json");
  }
}

async function handleApi(request: Request, url: URL) {
  if (url.pathname === "/api/health") {
    return json({
      ok: true,
      mode: PRODUCTION ? "production" : "development",
      now: new Date().toISOString(),
      social: socialHealth(),
    });
  }

  if (url.pathname === "/api/overview" && request.method === "GET") {
    const overview = await buildOverview(readGeo(url), readRange(url));
    return json(overview);
  }

  if (url.pathname === "/api/analyze" && request.method === "GET") {
    const terms = parseTermList(url.searchParams.get("terms"));
    if (terms.length === 0) throw new ApiFailure(400, "Add a search term to analyze");
    if (terms.length > 5) throw new ApiFailure(400, "Compare up to five terms at once", "limit");
    const analysis = await getAnalysis(terms, readGeo(url), readRange(url));
    return json(analysis);
  }

  if (url.pathname === "/api/suggest" && request.method === "GET") {
    const query = url.searchParams.get("q")?.trim() ?? "";
    if (query.length < 2) return json({ suggestions: [] });
    try {
      return json({ suggestions: await suggest(query) });
    } catch {
      // Suggestions are a convenience; a blocked upstream must not block typing.
      return json({ suggestions: [] });
    }
  }

  if (url.pathname === "/api/watchlist" && request.method === "GET") {
    const state = await readState();
    return json({ items: state.watchlist });
  }

  if (url.pathname === "/api/watchlist" && request.method === "POST") {
    const body = await readJson(request);
    const term = typeof body.term === "string" ? body.term : "";
    const geo = typeof body.geo === "string" ? body.geo.toUpperCase() : "";
    const threshold = typeof body.threshold === "number" ? body.threshold : 15;
    const item = await addWatchlist(term, geo, threshold);
    return json({ item }, 201);
  }

  const watchlistMatch = url.pathname.match(/^\/api\/watchlist\/([\w-]+)$/);
  if (watchlistMatch) {
    const id = watchlistMatch[1]!;
    if (request.method === "DELETE") {
      return json({ item: await removeWatchlist(id) });
    }
    if (request.method === "PATCH") {
      const body = await readJson(request);
      if (typeof body.threshold !== "number") {
        throw new ApiFailure(400, "Provide a numeric alert threshold");
      }
      return json({ item: await updateThreshold(id, body.threshold) });
    }
  }

  if (url.pathname === "/api/signals" && request.method === "GET") {
    const windowHours = Number(url.searchParams.get("hours") ?? "72");
    if (!Number.isFinite(windowHours) || windowHours <= 0 || windowHours > 720) {
      throw new ApiFailure(400, "Window must be between 1 and 720 hours", "invalid_window");
    }
    return json(await signalsWithCoverage(Math.round(windowHours)));
  }

  if (url.pathname === "/api/trend-map" && request.method === "GET") {
    const hours = Number(url.searchParams.get("hours") ?? "72");
    if (!Number.isFinite(hours) || hours <= 0 || hours > 720) {
      throw new ApiFailure(400, "Window must be between 1 and 720 hours", "invalid_window");
    }
    return json(await buildTrendMap(Math.round(hours)));
  }

  if (url.pathname === "/api/signals/search" && request.method === "GET") {
    const query = url.searchParams.get("q")?.trim() ?? "";
    if (query.length < 2)
      throw new ApiFailure(400, "Enter at least two characters", "invalid_query");
    return json({ results: await searchAcrossSpaces(query.slice(0, 200)) });
  }

  if (url.pathname === "/api/collect" && request.method === "POST") {
    const body = await readJson(request);
    const limit = typeof body.limit === "number" ? Math.round(body.limit) : 8;
    if (limit < 1 || limit > 50) {
      throw new ApiFailure(400, "Collect between 1 and 50 posts per segment", "invalid_limit");
    }
    const report = await runBackfill(limit);
    if (!report) {
      throw new ApiFailure(409, "A collection cycle is already running", "collect_in_progress");
    }
    return json({ report, status: status() }, 202);
  }

  if (url.pathname === "/api/collect/status" && request.method === "GET") {
    return json(status());
  }

  if (url.pathname === "/api/alerts/read" && request.method === "POST") {
    const body = await readJson(request);
    const id = typeof body.id === "string" ? body.id : undefined;
    const alerts = await markAlertsRead(id);
    return json({ alerts, unread: alerts.filter((alert) => !alert.read).length });
  }

  return apiError(404, "API route not found", "not_found");
}

async function serveStatic(url: URL) {
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const resolved = path.resolve(DIST, `.${requested}`);
  if (!resolved.startsWith(`${DIST}${path.sep}`)) return new Response("Not found", { status: 404 });

  const file = Bun.file(resolved);
  if (await file.exists()) {
    const isAsset = requested.startsWith("/assets/");
    return new Response(file, {
      headers: {
        "cache-control": isAsset ? "public, max-age=31536000, immutable" : "no-cache",
        "x-content-type-options": "nosniff",
        "referrer-policy": "strict-origin-when-cross-origin",
      },
    });
  }

  // Client-side routes fall back to the shell, but only for document requests.
  if (requested === "/index.html" || !path.extname(requested)) {
    const shell = Bun.file(path.join(DIST, "index.html"));
    if (await shell.exists())
      return new Response(shell, { headers: { "cache-control": "no-cache" } });
  }

  return new Response("Not found", { status: 404 });
}

/**
 * Bind the API port.
 *
 * In development a taken port is normal (a stale dev server, another project's
 * process) and must not kill the workspace, so the server walks forward to the
 * next free port and prints what it got. `scripts/dev.ts` already picks a free
 * port, so this is the safety net for a direct `bun server/index.ts`.
 *
 * In production, falling back would silently move the API away from whatever a
 * supervisor, reverse proxy, or firewall expects. There it fails loudly.
 */
function listen(port: number) {
  for (let offset = 0; offset < 20; offset += 1) {
    const candidate = port + offset;
    if (candidate > 65_535) break;
    try {
      return { server: Bun.serve({ port: candidate, idleTimeout: 60, fetch }), port: candidate };
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code !== "EADDRINUSE") throw error;
      if (PRODUCTION) {
        console.error(`Port ${candidate} is in use. Production refuses to move silently.`);
        process.exit(1);
      }
      console.warn(`Port ${candidate} is in use; trying ${candidate + 1}.`);
    }
  }
  console.error(`No free API port found starting at ${port}.`);
  process.exit(1);
}

const { server, port: boundPort } = listen(PORT);

/**
 * Drain in-flight requests on a supervisor's stop signal instead of dropping
 * them. Bun keeps the process alive on open sockets, so the exit is explicit.
 */
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    void server.stop().then(() => process.exit(0));
  });
}

async function fetch(request: Request) {
  const url = new URL(request.url);

  // Health is intentionally public so a supervisor can probe the process;
  // everything else, including the client shell, sits behind the password.
  const unauthorized = url.pathname === "/api/health" ? null : authorize(request);
  if (unauthorized) return unauthorized;

  if (url.pathname.startsWith("/api/")) {
    try {
      return await handleApi(request, url);
    } catch (error) {
      if (error instanceof ApiFailure) {
        return apiError(error.status, error.message, error.code);
      }
      if (error instanceof TrendSourceError) {
        return apiError(error.status, error.message, error.code);
      }
      if (error instanceof DatabaseMissingError || error instanceof BlueskyError) {
        return apiError(error.status, error.message, error.code);
      }
      console.error(`API ${request.method} ${url.pathname} failed:`, error);
      return apiError(500, "The server could not complete that request. Try again.", "internal");
    }
  }

  if (PRODUCTION) return serveStatic(url);

  return json(
    {
      name: "trendifest-api",
      message: "API is running. The interface is served by Vite during development.",
    },
    200,
  );
}

console.log(
  `Trendifest API listening on http://127.0.0.1:${boundPort} (${PRODUCTION ? "production" : "development"})`,
);
console.log(AUTH_ENABLED ? "Password protection: on" : "Password protection: off (development)");

// Social collection is opt-in: it needs a database, downloads models on first
// use, and reaches the public Bluesky network. The keyword MVP never requires it.
if (process.env.TRENDIFEST_SOCIAL === "1") {
  const social = startSocialCollection();
  console.log(
    social.configured
      ? `Social collection: ${social.segments} viewer segments`
      : "Social collection: disabled (TRENDIFEST_DATABASE_URL is not set)",
  );
}

const MONITOR =
  process.env.TRENDIFEST_MONITOR === "1" || (PRODUCTION && process.env.TRENDIFEST_MONITOR !== "0");

if (MONITOR) {
  const refresh = async () => {
    try {
      const { created, summaries } = await refreshWatchlist("12m");
      if (created.length > 0) {
        console.log(`Monitor created ${created.length} alert(s) across ${summaries} trend(s).`);
      }
    } catch (error) {
      // A Google outage must not take down the web process; the next interval
      // retries after the client's own cooldown.
      console.warn(
        "Background monitor could not refresh:",
        error instanceof Error ? error.message : error,
      );
    }
  };

  void refresh();
  const timer = setInterval(refresh, MONITOR_INTERVAL_MS);
  timer.unref();
  console.log(`Background alert monitor: every ${MONITOR_INTERVAL_MS / 60_000} minutes`);
}
