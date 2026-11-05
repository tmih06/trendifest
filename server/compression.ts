import { gzipSync } from "node:zlib";
import Negotiator from "negotiator";
import { MIN_COMPRESS_BYTES, isCompressibleType } from "../shared/compression.ts";

/**
 * Response construction for the production server, covering the two places a
 * payload can travel gzip-encoded: generated API JSON and built static files.
 *
 * API bytes remain request-specific; no result cache or stale graph is introduced.
 */

/** The request field that selects between the identity and gzip variants. */
const VARY = "accept-encoding";

/** Default zlib balance for per-request JSON; build sidecars use maximum compression. */
const GZIP_LEVEL = 6;

/** Transfer encodings this server can produce. */
export type ContentEncoding = "gzip" | "identity";

/**
 * Encodings the client accepts, most preferred first; empty when it accepts
 * neither.
 *
 * Delegated to `negotiator` so quality factors, wildcards and case-insensitive
 * tokens follow RFC 9110: `gzip;q=0` and `*;q=0` exclude the encoding even when
 * written later in the header, a bare `*` leaves both available, and a missing
 * or empty header means identity only. `x-gzip` is a distinct token.
 */
export function acceptableEncodings(request: Request): ContentEncoding[] {
  // `negotiator` reads headers by property access, which DOM `Headers` does not
  // support, so it receives a plain object.
  const negotiator = new Negotiator({
    headers: { "accept-encoding": request.headers.get("accept-encoding") ?? undefined },
  });
  return negotiator.encodings(["gzip", "identity"]) as ContentEncoding[];
}

/** Shared 406 for a request that accepts neither identity nor gzip. */
function notAcceptable(): Response {
  return new Response("Not acceptable", {
    status: 406,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      vary: VARY,
    },
  });
}

/** Status and headers shared by every encoded response built here. */
export interface EncodedResponseInit {
  status?: number;
  headers: Record<string, string>;
}

/**
 * Respond with a textual body, gzip-encoding it when the payload is worth the
 * encoding and the client asked for it.
 *
 * Bodies below `MIN_COMPRESS_BYTES` normally travel identity rather than paying
 * gzip framing. Every response carries Vary because encoding acceptance can also
 * select a 406; caches must distinguish rejected and successful representations.
 * Requests accepting neither available encoding receive 406.
 *
 * Errors and side effects: none; the body is encoded synchronously.
 */
export function compressibleResponse(
  request: Request,
  body: string,
  init: EncodedResponseInit,
): Response {
  const accepted = acceptableEncodings(request);
  const { status, headers } = init;
  if (accepted.length === 0) return notAcceptable();

  const bytes = new TextEncoder().encode(body);
  const preferGzip =
    accepted[0] === "gzip" &&
    (bytes.byteLength >= MIN_COMPRESS_BYTES || !accepted.includes("identity"));
  const encoded = preferGzip ? gzipSync(bytes, { level: GZIP_LEVEL }) : null;
  // Gzip can grow a payload of high-entropy identifiers; send the smaller body.
  if (!encoded || (encoded.byteLength >= bytes.byteLength && accepted.includes("identity"))) {
    return new Response(bytes, { status, headers: { ...headers, vary: VARY } });
  }

  return new Response(encoded, {
    status,
    headers: { ...headers, vary: VARY, "content-encoding": "gzip" },
  });
}

/**
 * Respond with a built file, preferring its precompressed `.gz` sidecar when
 * the client accepts gzip.
 *
 * The build writes a sidecar only for compressible, beneficial outputs, so the
 * sidecar's presence is the whole compression decision and a request costs one
 * existence probe. `Content-Type` comes from the original file, never from the
 * `.gz` extension, and the caller's caching headers apply to both variants.
 *
 * The caller must have established that `filePath` exists; this reads it as-is.
 * A `.gz` file requested by name is served verbatim, so an encoded
 * representation is never encoded twice.
 *
 * `Range` requests always receive the identity bytes. Bun answers them with a
 * `206` slice of whichever file is handed to it, and a slice of a gzip stream
 * cannot be decoded on its own, so a resumed download must address the
 * representation whose `Content-Range` it can consume. `Vary` stays on that
 * response because the resource as a whole still varies.
 */
export async function staticFileResponse(
  request: Request,
  filePath: string,
  headers: Record<string, string>,
): Promise<Response> {
  const accepted = acceptableEncodings(request);
  if (accepted.length === 0) return notAcceptable();

  const file = Bun.file(filePath);
  const contentType = file.type;
  const sidecar = Bun.file(`${filePath}.gz`);
  const negotiable = isCompressibleType(contentType) && (await sidecar.exists());
  const responseHeaders = negotiable ? { ...headers, vary: VARY } : headers;

  if (negotiable && accepted[0] === "gzip" && !request.headers.has("range")) {
    return new Response(sidecar, {
      headers: { ...responseHeaders, "content-type": contentType, "content-encoding": "gzip" },
    });
  }

  if (!accepted.includes("identity")) return notAcceptable();
  return new Response(file, { headers: { ...responseHeaders, "content-type": contentType } });
}
