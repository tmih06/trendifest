import { gzipSync } from "node:zlib";
import type { Plugin } from "vite-plus";
import { MIN_COMPRESS_BYTES, isCompressibleFile } from "../shared/compression.ts";

/** Precompress immutable build outputs once, rather than on every HTTP request. */
const GZIP_LEVEL = 9;

/**
 * Emit a `.gz` sibling for every compressible build output worth encoding.
 *
 * `order: "post"` is required: Vite's HTML plugin adds `index.html` to the
 * bundle from its own `generateBundle` hook, and a hook that runs earlier never
 * sees the document. `generateBundle`, rather than `writeBundle`, is also what
 * lets the sidecar reuse the asset's hash-named file name, so an immutable
 * asset and its encoded variant are a matched pair with no per-request work.
 *
 * Only files whose extension maps to a textual media type are considered, and a
 * sidecar is written only when the original clears `MIN_COMPRESS_BYTES` and the
 * encoded output is smaller; a sidecar for a tiny or incompressible file would
 * cost disk and cache space for no transfer win. Sidecar names are never
 * compressible, so an emitted sidecar cannot be encoded twice.
 *
 * Sidecars are emitted through the bundle, so they obey `emptyOutDir`, appear in
 * watch rebuilds, and disappear with the build that produced them.
 */
export function assetCompression(): Plugin {
  return {
    name: "trendifest:asset-compression",
    apply: "build",
    generateBundle: {
      order: "post",
      handler(_options, bundle) {
        for (const [fileName, entry] of Object.entries(bundle)) {
          if (!isCompressibleFile(fileName)) continue;
          const source = entry.type === "asset" ? entry.source : entry.code;
          const payload = typeof source === "string" ? new TextEncoder().encode(source) : source;
          if (payload.byteLength < MIN_COMPRESS_BYTES) continue;

          const compressed = gzipSync(payload, { level: GZIP_LEVEL });
          if (compressed.byteLength >= payload.byteLength) continue;

          this.emitFile({
            type: "asset",
            fileName: `${fileName}.gz`,
            source: compressed,
          });
        }
      },
    },
  };
}
