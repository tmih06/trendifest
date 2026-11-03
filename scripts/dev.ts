import path from "node:path";
import { findAvailablePort, readPortEnv } from "./ports.ts";

/**
 * Starts the API and the Vite+ dev server together.
 *
 * Port ownership: this script picks the API port, then the web port, and passes
 * both to the children through the environment. Vite reads `PORT` for its own
 * listener and `API_TARGET` for the `/api` proxy, so the proxy can never point
 * at a port the API did not get. Neither child auto-falls back on its own: a
 * silent fallback in the API would desync the proxy, which is the bug this
 * arrangement exists to prevent.
 */

const root = path.resolve(import.meta.dir, "..");
const vp = path.join(root, "node_modules", ".bin", "vp");

const apiPort = await findAvailablePort(readPortEnv(process.env.PORT, 8787));
const webPort = await findAvailablePort(
  // Skip the chosen API port if the defaults happen to collide.
  readPortEnv(process.env.WEB_PORT, 5180) === apiPort
    ? apiPort + 1
    : readPortEnv(process.env.WEB_PORT, 5180),
);

if (apiPort !== readPortEnv(process.env.PORT, 8787)) {
  console.log(
    `Port ${readPortEnv(process.env.PORT, 8787)} is in use; using ${apiPort} for the API.`,
  );
}
if (webPort !== readPortEnv(process.env.WEB_PORT, 5180)) {
  console.log(
    `Port ${readPortEnv(process.env.WEB_PORT, 5180)} is in use; using ${webPort} for the web app.`,
  );
}

const api = Bun.spawn(["bun", "--watch", "server/index.ts"], {
  cwd: root,
  env: { ...process.env, PORT: String(apiPort) },
  stdout: "inherit",
  stderr: "inherit",
});

const web = Bun.spawn([vp, "dev"], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(webPort),
    API_TARGET: `http://127.0.0.1:${apiPort}`,
  },
  stdout: "inherit",
  stderr: "inherit",
});

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  if (!api.killed) api.kill();
  if (!web.killed) web.kill();
  process.exit(code);
}

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

/**
 * Wait for the API to answer before printing the URL, so the first click lands
 * on a working server instead of a proxy error. A failure here is reported but
 * not fatal: the API child exiting is what terminates the pair, and it carries
 * the real error message.
 */
async function waitForApi(port: number, attempts = 40) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (api.exitCode !== null) return;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok) {
        console.log(
          `\n  Trendifest ready\n  → web  http://localhost:${webPort}\n  → api  http://127.0.0.1:${port}\n`,
        );
        return;
      }
    } catch {
      // Not up yet; keep waiting.
    }
    await Bun.sleep(250);
  }
}

void waitForApi(apiPort);

const first = await Promise.race([
  api.exited.then((code) => ({ name: "api", code })),
  web.exited.then((code) => ({ name: "web", code })),
]);

if (!stopping) {
  console.error(`${first.name} exited with code ${first.code}; stopping the other process.`);
  stop(first.code ?? 1);
}
