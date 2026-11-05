/**
 * The pinned Git dependency ships source, not its exported dist/ files. Build
 * those exports at install time using the host toolchain; no engine is vendored.
 * @types/d3-force remains a dev dependency for upstream declaration emission.
 */
import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const library = new URL("node_modules/obi-graph/", root);
const dist = new URL("dist/", library);

const declarations = Bun.spawn(
  [
    fileURLToPath(new URL("node_modules/.bin/tsc", root)),
    "--project",
    fileURLToPath(new URL("tsconfig.build.json", library)),
  ],
  { cwd: fileURLToPath(root), stdout: "inherit", stderr: "inherit" },
);
const code = await declarations.exited;
if (code !== 0) throw new Error(`obi-graph declaration build failed (${code})`);

const bundle = await Bun.build({
  entrypoints: [fileURLToPath(new URL("src/graph/index.ts", library))],
  outdir: fileURLToPath(dist),
  target: "browser",
  format: "esm",
  minify: true,
  // Library output must work with React's production runtime regardless of install mode.
  jsx: { runtime: "automatic", development: false },
  external: ["react", "react/jsx-runtime", "react-dom", "d3-force"],
});
if (!bundle.success) throw new AggregateError(bundle.logs, "obi-graph bundle failed");

await mkdir(dist, { recursive: true });
await copyFile(new URL("src/graph/graph.css", library), new URL("styles.css", dist));
await Bun.write(new URL("styles.d.ts", dist), "export {};\n");
