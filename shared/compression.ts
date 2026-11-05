/**
 * Compression policy shared by the production build and the Bun server.
 *
 * The build decides which emitted files get a precompressed `.gz` sidecar; the
 * server decides which responses may travel encoded. Both must read the policy
 * from here, otherwise the server would look for sidecars the build never wrote
 * or advertise an encoding for a payload whose bytes would grow.
 */

/** Normal minimum for useful gzip savings; gzip-only clients can still receive smaller JSON. */
export const MIN_COMPRESS_BYTES = 1024;

/**
 * Non-`text/*` media types that are still textual. `image/svg+xml` is XML;
 * fonts, images, video and archives are already compressed and stay identity so
 * clients never pay a decompression pass for no size win.
 */
const COMPRESSIBLE_APPLICATION_TYPES: Record<string, true> = {
  "application/json": true,
  "application/javascript": true,
  "application/manifest+json": true,
  "application/xhtml+xml": true,
  "application/xml": true,
  "image/svg+xml": true,
};

/**
 * Bundle extensions mapped to the media type the server will report for them.
 * Extension checks go through this table so the build and the server cannot
 * disagree about which files are compressible.
 */
const EXTENSION_TYPES: Record<string, string> = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".map": "application/json",
  ".mjs": "text/javascript",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
  ".webmanifest": "application/manifest+json",
  ".xml": "application/xml",
};

/**
 * True when a `Content-Type` describes a payload that gzip reliably shrinks.
 * Only the media type is inspected; parameters such as `charset` are ignored,
 * so callers may pass the header value verbatim.
 */
export function isCompressibleType(contentType: string): boolean {
  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return mediaType.startsWith("text/") || COMPRESSIBLE_APPLICATION_TYPES[mediaType] === true;
}

/**
 * True when a built file name has an extension that produces a compressible
 * representation. Used by the build plugin, which sees bundle names rather than
 * response headers.
 */
export function isCompressibleFile(fileName: string): boolean {
  const dot = fileName.lastIndexOf(".");
  const extension = dot === -1 ? "" : fileName.slice(dot).toLowerCase();
  const type = EXTENSION_TYPES[extension];
  return type !== undefined && isCompressibleType(type);
}
