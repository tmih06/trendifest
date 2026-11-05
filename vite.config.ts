import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

const src = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
