import { createHash, timingSafeEqual } from "node:crypto";

/**
 * The MVP is deliberately single-user: one password protects the whole
 * workspace, including static assets and the API. HTTP Basic is enough here
 * because the browser owns the login prompt and there is no account model.
 *
 * Set `TRENDIFEST_PASSWORD` to enable the gate. Production refuses to start
 * without it; development stays frictionless unless the variable is present.
 */
const PASSWORD = (process.env.TRENDIFEST_PASSWORD ?? "").trim();

export const AUTH_ENABLED = PASSWORD.length > 0;

function digest(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}

function samePassword(supplied: string) {
  // Hashing both sides keeps the comparison constant-time without leaking the
  // configured password's length through timingSafeEqual's buffer length check.
  return timingSafeEqual(digest(supplied), digest(PASSWORD));
}

function challenge() {
  return new Response("Authentication required", {
    status: 401,
    headers: {
      "www-authenticate": 'Basic realm="Trendifest", charset="UTF-8"',
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

/**
 * Return a 401 response when the request lacks the configured password, or
 * null when it may proceed. The Basic username is intentionally ignored.
 */
export function authorize(request: Request): Response | null {
  if (!AUTH_ENABLED) return null;

  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Basic ")) return challenge();

  let decoded = "";
  try {
    decoded = Buffer.from(header.slice("Basic ".length), "base64").toString("utf8");
  } catch {
    return challenge();
  }

  const separator = decoded.indexOf(":");
  const supplied = separator >= 0 ? decoded.slice(separator + 1) : "";
  return supplied && samePassword(supplied) ? null : challenge();
}
