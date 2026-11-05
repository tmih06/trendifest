import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import compression from "compression";
import { defineConfig, type Connect, type Plugin } from "vite-plus";
import { assetCompression } from "./scripts/asset-compression.ts";

const src = fileURLToPath(new URL("./src", import.meta.url));

/**
 * Port forwarding otherwise transfers Vite's multi-megabyte debug modules raw.
 * Negotiate streaming compression without removing source maps or changing HMR.
 */
const devCompression: Plugin = {
  name: "trendifest-dev-compression",
  apply: "serve",
  /** Wrap module and proxy responses before Vite installs their handlers. */
  configureServer(server) {
    // Node HTTP-compatible at runtime; its published types are narrowed to Express.
    server.middlewares.use(compression() as Connect.NextHandleFunction);
  },
};

export default defineConfig({
  plugins: [devCompression, react(), tailwindcss(), assetCompression()],
  resolve: {
    alias: { "@": src },
  },
  server: {
    // `scripts/dev.ts` selects this port and passes it in; the fallback only
    // applies when Vite runs on its own (for example `vp dev` directly).
    port: Number(process.env.PORT ?? 5180),
    strictPort: true,
    proxy: {
      "/api": {
        target: process.env.API_SOCKET
          ? { host: "localhost", port: 80, protocol: "http:", socketPath: process.env.API_SOCKET }
          : "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
  staged: {
    "*": "vp check --fix",
  },
  fmt: {
    ignorePatterns: [".agents/**", ".cache/**", "dist/**", "AGENTS.md", "skills-lock.json"],
  },
  lint: {
    ignorePatterns: [".agents/**", ".cache/**", "dist/**"],
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
});
