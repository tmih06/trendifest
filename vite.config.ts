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
    port: 5180,
    strictPort: true,
    proxy: {
      "/api": {
        target: process.env.API_TARGET ?? "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
  staged: {
    "*": "vp check --fix",
  },
  fmt: {
    ignorePatterns: [
      ".agents/**",
      "dist/**",
      "server/data/**",
      "tests/fixtures/**",
      "AGENTS.md",
      "skills-lock.json",
    ],
  },
  lint: {
    ignorePatterns: [".agents/**", "dist/**", "server/data/**", "tests/fixtures/**"],
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
});
