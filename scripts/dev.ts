import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { findAvailablePort, readPortEnv } from "./ports.ts";

/**
 * Vite owns the only TCP listener. Its /api reverse proxy reaches Bun through
 * a private Unix socket, so forwarding the web port also forwards every API.
 * Each invocation owns its socket directory and both child process groups.
 */
const root = path.resolve(import.meta.dir, "..");
const vp = path.join(root, "node_modules", ".bin", "vp");
const requestedPort = readPortEnv(process.env.PORT, 5180);
const webPort = await findAvailablePort(requestedPort);
const socketDirectory = await mkdtemp(path.join(tmpdir(), "trendifest-"));
const apiSocket = path.join(socketDirectory, "api.sock");

if (webPort !== requestedPort) {
  console.log(`Port ${requestedPort} is in use; using ${webPort} for Trendifest.`);
}

const api = Bun.spawn(["bun", "--watch", "server/index.ts"], {
  cwd: root,
  env: { ...process.env, API_SOCKET: apiSocket },
  detached: true,
  stdout: "inherit",
  stderr: "inherit",
});

const web = Bun.spawn([vp, "dev"], {
  cwd: root,
  env: { ...process.env, PORT: String(webPort), API_SOCKET: apiSocket },
  detached: true,
  stdout: "inherit",
  stderr: "inherit",
});

let stopping = false;
/** Stop watchers and their descendants before removing this invocation's socket. */
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of [api, web]) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
  }
  await Promise.all([api.exited, web.exited]);
  await rm(socketDirectory, { recursive: true, force: true });
  process.exit(code);
}

process.on("SIGINT", () => void stop(0));
process.on("SIGTERM", () => void stop(0));

/** Announce readiness only after the public URL can reach the API through Vite. */
async function waitForProxy(attempts = 40) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (stopping || api.exitCode !== null || web.exitCode !== null) return;
    try {
      const response = await fetch(`http://127.0.0.1:${webPort}/api/health`, {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok) {
        console.log(`\n  Trendifest ready → http://localhost:${webPort}\n`);
        return;
      }
    } catch {
      // Either child can still be starting; their exits carry startup errors.
    }
    await Bun.sleep(250);
  }
  console.error("The development reverse proxy did not become ready.");
  await stop(1);
}

void waitForProxy();

const first = await Promise.race([
  api.exited.then((code) => ({ name: "api", code })),
  web.exited.then((code) => ({ name: "web", code })),
]);

if (!stopping) {
  console.error(`${first.name} exited with code ${first.code}; stopping the other process.`);
  await stop(first.code ?? 1);
}
