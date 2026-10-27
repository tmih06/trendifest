import path from "node:path";

const root = path.resolve(import.meta.dir, "..");
const vp = path.join(root, "node_modules", ".bin", "vp");

const api = Bun.spawn(["bun", "--watch", "server/index.ts"], {
  cwd: root,
  env: { ...process.env, PORT: process.env.PORT ?? "8787" },
  stdout: "inherit",
  stderr: "inherit",
});

const web = Bun.spawn([vp, "dev"], {
  cwd: root,
  env: {
    ...process.env,
    API_TARGET: `http://127.0.0.1:${process.env.PORT ?? "8787"}`,
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

const first = await Promise.race([
  api.exited.then((code) => ({ name: "api", code })),
  web.exited.then((code) => ({ name: "web", code })),
]);

if (!stopping) {
  console.error(`${first.name} exited with code ${first.code}; stopping the other process.`);
  stop(first.code ?? 1);
}
