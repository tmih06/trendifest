import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzip } from "node:zlib";
import type { ApiError, TrendMap } from "../shared/types.ts";
import { ApiFailure } from "./api-error.ts";
import { DatabaseMissingError } from "./db.ts";
import { searchAcrossSpaces } from "./social/pipeline.ts";
import { DEFAULT_COLLECTION_LIMIT, MAX_POSTS_PER_SOURCE } from "./social/input.ts";
import {
  coverageWithErrors,
  runBackfill,
  signalsWithCoverage,
  socialHealth,
  startSocialCollection,
  stopSocialCollection,
  status,
} from "./social/service.ts";
import { buildTrendMap } from "./social/trend-map.ts";
import { getTopicDetail } from "./social/topic-intelligence.ts";
import {
  refreshIntelligence,
  startTopicIntelligence,
  stopTopicIntelligence,
} from "./social/intelligence-service.ts";
import { acceptableEncodings, compressibleResponse, staticFileResponse } from "./compression.ts";
import { applyTopicReview, listTopicReviews, undoTopicReview } from "./social/topic-review.ts";
import {
  createWatchRule,
  deleteWatchRule,
  getWatchlists,
  markAlertRead,
  updateWatchRule,
} from "./social/watchlists.ts";

const DIST = fileURLToPath(new URL("../dist", import.meta.url));
const PORT = Number(process.env.PORT ?? 8787);
const PRODUCTION = process.env.NODE_ENV === "production";
// Managed development uses no API TCP port; production keeps its TCP listener.
const API_SOCKET = PRODUCTION ? undefined : process.env.API_SOCKET;

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
};

/**
 * Transport responses stay no-store even when the underlying graph snapshot is
 * reused. Negotiate compression per request without changing snapshot content.
 */
function json(request: Request, body: unknown, status = 200) {
  return compressibleResponse(request, JSON.stringify(body), { status, headers: JSON_HEADERS });
}

/** Encoded bytes live exactly as long as their bounded immutable projection. */
const mapRepresentations = new WeakMap<
  TrendMap["nodes"],
  {
    metadata: string;
    bytes: Promise<{ identity: Uint8Array<ArrayBuffer>; gzip: Uint8Array<ArrayBuffer> }>;
  }
>();

/**
 * Reuse serialization/compression, not evidence freshness. The projection still
 * verifies its database revision on every GET; live coverage errors and refresh
 * state are part of this representation key. Gzip runs outside the HTTP event
 * loop and concurrent readers share one encoding. No raw vectors are retained.
 */
async function mapResponse(request: Request, map: TrendMap): Promise<Response> {
  const accepted = acceptableEncodings(request);
  if (accepted.length === 0) return compressibleResponse(request, "", { headers: JSON_HEADERS });
  const coverage = coverageWithErrors(map.coverage);
  const metadata = JSON.stringify([map.generatedAt, map.intelligence, coverage]);
  let representation = mapRepresentations.get(map.nodes);
  if (!representation || representation.metadata !== metadata) {
    const identity = new TextEncoder().encode(JSON.stringify({ ...map, coverage }));
    const {
      promise: bytes,
      resolve,
      reject,
    } = Promise.withResolvers<{
      identity: Uint8Array<ArrayBuffer>;
      gzip: Uint8Array<ArrayBuffer>;
    }>();
    gzip(identity, { level: 6 }, (error, compressed) => {
      if (error) reject(error);
      else resolve({ identity, gzip: compressed });
    });
    representation = { metadata, bytes };
    mapRepresentations.set(map.nodes, representation);
    void bytes.catch(() => {
      if (mapRepresentations.get(map.nodes)?.bytes === bytes) mapRepresentations.delete(map.nodes);
    });
  }
  const bytes = await representation.bytes;
  const encoded =
    accepted[0] === "gzip" &&
    (bytes.gzip.byteLength < bytes.identity.byteLength || !accepted.includes("identity"));
  return new Response(encoded ? bytes.gzip : bytes.identity, {
    headers: {
      ...JSON_HEADERS,
      vary: "accept-encoding",
      ...(encoded ? { "content-encoding": "gzip" } : {}),
    },
  });
}

function apiError(request: Request, status: number, error: string, code = "bad_request") {
  return json(request, { error, code } satisfies ApiError, status);
}

/** Both social read routes share one window contract. */
function readWindowHours(url: URL) {
  const hours = Number(url.searchParams.get("hours") ?? "168");
  if (!Number.isFinite(hours) || hours <= 0 || hours > 720) {
    throw new ApiFailure(400, "Window must be between 1 and 720 hours", "invalid_window");
  }
  return Math.round(hours);
}

/** Mutations accept JSON objects; arrays and null are not request contracts. */
async function readJson(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiFailure(400, "Request body must be valid JSON", "invalid_json");
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiFailure(400, "Request body must be a JSON object", "invalid_json");
  }
  return body as Record<string, unknown>;
}

/** Decode bounded resource IDs without turning malformed URLs into a 500. */
function readResourceId(encoded: string) {
  let id: string;
  try {
    id = decodeURIComponent(encoded);
  } catch {
    throw new ApiFailure(400, "Resource ID is not valid URL encoding", "invalid_id");
  }
  for (let index = 0; index < id.length; index += 1) {
    if (id.charCodeAt(index) < 32 || id[index] === "/")
      throw new ApiFailure(400, "Choose a valid resource ID", "invalid_id");
  }
  if (!id || id.length > 200) {
    throw new ApiFailure(400, "Choose a valid resource ID", "invalid_id");
  }
  return id;
}

/** The decision is already durable; background projection must not delay its acknowledgement. */
function refreshAfterReview() {
  void refreshIntelligence(true).catch((error: unknown) => {
    console.warn(
      "Review saved; topic materialization failed:",
      error instanceof Error ? error.message : String(error),
    );
  });
}

async function handleApi(request: Request, url: URL) {
  if (url.pathname === "/api/health") {
    return json(request, {
      ok: true,
      mode: PRODUCTION ? "production" : "development",
      now: new Date().toISOString(),
      social: socialHealth(),
    });
  }

  if (url.pathname === "/api/signals" && request.method === "GET") {
    return json(request, await signalsWithCoverage(readWindowHours(url)));
  }

  if (url.pathname === "/api/trend-map" && request.method === "GET") {
    const map = await buildTrendMap(readWindowHours(url));
    return mapResponse(request, map);
  }

  const topicPath = /^\/api\/topics\/([^/]+)$/u.exec(url.pathname);
  if (topicPath && request.method === "GET") {
    const offset = Number(url.searchParams.get("offset") ?? "0");
    const limit = Number(url.searchParams.get("limit") ?? "40");
    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 100
    ) {
      throw new ApiFailure(
        400,
        "Use a nonnegative offset and a limit between 1 and 100",
        "invalid_page",
      );
    }
    return json(
      request,
      await getTopicDetail(readResourceId(topicPath[1]!), readWindowHours(url), offset, limit),
    );
  }
  if (url.pathname === "/api/topic-reviews") {
    if (request.method === "GET") {
      const topicId = url.searchParams.get("topicId");
      return json(request, {
        decisions: await listTopicReviews(topicId === null ? undefined : readResourceId(topicId)),
      });
    }
    if (request.method === "POST") {
      const result = await applyTopicReview(await readJson(request));
      refreshAfterReview();
      return json(request, result, 201);
    }
  }
  const reviewPath = /^\/api\/topic-reviews\/([^/]+)$/u.exec(url.pathname);
  if (reviewPath && request.method === "DELETE") {
    await undoTopicReview(readResourceId(reviewPath[1]!));
    refreshAfterReview();
    return json(request, { ok: true });
  }

  if (url.pathname === "/api/watchlists") {
    if (request.method === "GET") {
      return json(request, await getWatchlists(url.searchParams.get("before") ?? undefined));
    }
    if (request.method === "POST")
      return json(request, await createWatchRule(await readJson(request)), 201);
  }
  const watchPath = /^\/api\/watchlists\/([^/]+)$/u.exec(url.pathname);
  if (watchPath) {
    const id = readResourceId(watchPath[1]!);
    if (request.method === "PATCH")
      return json(request, await updateWatchRule(id, await readJson(request)));
    if (request.method === "DELETE") {
      await deleteWatchRule(id);
      return json(request, { ok: true });
    }
  }
  const alertPath = /^\/api\/alerts\/([^/]+)\/read$/u.exec(url.pathname);
  if (alertPath && request.method === "POST") {
    await markAlertRead(readResourceId(alertPath[1]!));
    return json(request, { ok: true });
  }

  if (url.pathname === "/api/signals/search" && request.method === "GET") {
    const query = url.searchParams.get("q")?.trim() ?? "";
    if (query.length < 2)
      throw new ApiFailure(400, "Enter at least two characters", "invalid_query");
    return json(request, { results: await searchAcrossSpaces(query.slice(0, 200)) });
  }

  if (url.pathname === "/api/collect" && request.method === "POST") {
    const body = await readJson(request);
    const limit =
      typeof body.limit === "number" ? Math.round(body.limit) : DEFAULT_COLLECTION_LIMIT;
    if (limit < 1 || limit > MAX_POSTS_PER_SOURCE) {
      throw new ApiFailure(
        400,
        `Collect between 1 and ${MAX_POSTS_PER_SOURCE} excerpts per source`,
        "invalid_limit",
      );
    }
    const current = status();
    if (!current.configured) throw new DatabaseMissingError();
    if (current.backfilling) {
      throw new ApiFailure(409, "A collection cycle is already running", "collect_in_progress");
    }
    // Media inference outlives ordinary HTTP timeouts. The existing single-flight
    // collector owns the work; clients observe completion through its status.
    void runBackfill(limit).catch((error: unknown) => {
      console.warn("Manual collection failed:", error instanceof Error ? error.message : error);
    });
    return json(request, { status: status() }, 202);
  }

  if (url.pathname === "/api/collect/status" && request.method === "GET") {
    return json(request, status());
  }

  return apiError(request, 404, "API route not found", "not_found");
}

async function serveStatic(request: Request, url: URL) {
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const resolved = path.resolve(DIST, `.${requested}`);
  if (!resolved.startsWith(`${DIST}${path.sep}`)) return new Response("Not found", { status: 404 });

  const file = Bun.file(resolved);
  if (await file.exists()) {
    const isAsset = requested.startsWith("/assets/");
    const headers = {
      "cache-control": isAsset ? "public, max-age=31536000, immutable" : "no-cache",
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin",
    };
    return staticFileResponse(request, resolved, headers);
  }

  // Client-side routes fall back to the shell, but only for document requests.
  if (requested === "/index.html" || !path.extname(requested)) {
    const shell = path.join(DIST, "index.html");
    if (await Bun.file(shell).exists())
      return staticFileResponse(request, shell, { "cache-control": "no-cache" });
  }

  return new Response("Not found", { status: 404 });
}

/**
 * Bind the standalone API's TCP port. Direct development starts may fall
 * forward; production fails rather than silently moving a deployment listener.
 * `bun dev` bypasses TCP entirely and binds its private Unix socket instead.
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

const { server, port: boundPort } = API_SOCKET
  ? { server: Bun.serve({ unix: API_SOCKET, fetch }), port: null }
  : listen(PORT);

/**
 * Drain in-flight requests on a supervisor's stop signal instead of dropping
 * them. Bun keeps the process alive on open sockets, so the exit is explicit.
 */
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    stopTopicIntelligence();
    stopSocialCollection();
    void server.stop().then(() => process.exit(0));
  });
}

async function fetch(request: Request) {
  // Unix listeners use per-request timeouts; retain the TCP API's 60-second allowance.
  if (API_SOCKET) server.timeout(request, 60);
  const url = new URL(request.url);

  if (url.pathname.startsWith("/api/")) {
    try {
      return await handleApi(request, url);
    } catch (error) {
      if (error instanceof ApiFailure) {
        return apiError(request, error.status, error.message, error.code);
      }
      if (error instanceof DatabaseMissingError) {
        return apiError(request, error.status, error.message, error.code);
      }
      console.error(`API ${request.method} ${url.pathname} failed:`, error);
      return apiError(
        request,
        500,
        "The server could not complete that request. Try again.",
        "internal",
      );
    }
  }

  if (PRODUCTION) return serveStatic(request, url);

  return json(
    request,
    {
      name: "trendifest-api",
      message: "API is running. The interface is served by Vite during development.",
    },
    200,
  );
}

console.log(
  API_SOCKET
    ? "Trendifest API connected to the private development socket."
    : `Trendifest API listening on http://127.0.0.1:${boundPort} (${PRODUCTION ? "production" : "development"})`,
);

// Cached projections and measured history advance off-request, even when feeds
// are paused. This call never delays the listener's readiness announcement.
startTopicIntelligence();

// Social collection is opt-in: it needs a database, downloads models on first
// use, and polls public Vietnamese discussion and explicitly labelled news.
if (process.env.TRENDIFEST_SOCIAL === "1") {
  const social = startSocialCollection();
  console.log(
    social.configured
      ? `Social collection: ${social.segments} Vietnamese source feeds`
      : "Social collection: disabled (TRENDIFEST_DATABASE_URL is not set)",
  );
}
