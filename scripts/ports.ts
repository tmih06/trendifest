import { createServer } from "node:net";

/**
 * Port selection for the public development listener.
 *
 * `bun dev` selects Vite's TCP port before spawning it; the API uses a private
 * Unix socket and needs no port allocation. Probes use the same loopback
 * interface as Vite, so occupied ports can be skipped before either child starts.
 */

const HOST = "127.0.0.1";
/** Consecutive ports tried before giving up; enough to clear a stray dev server. */
const MAX_ATTEMPTS = 20;

/**
 * True when `port` can be bound on the loopback interface right now.
 *
 * `exclusive: true` disables SO_REUSEADDR so a port in TIME_WAIT still counts as
 * free (a restart should reuse it) while a live listener does not.
 */
export function isPortFree(port: number): Promise<boolean> {
  const { promise, resolve } = Promise.withResolvers<boolean>();
  const probe = createServer();
  probe.once("error", () => resolve(false));
  probe.listen({ port, host: HOST, exclusive: true }, () => resolve(true));
  return promise.finally(() => probe.close());
}

/**
 * First free port at or above `start`. Falls forward so a stale server on the
 * default port does not block a new session, and every candidate is re-probed
 * rather than assumed, because another process may hold a middle one.
 */
export async function findAvailablePort(start: number, attempts = MAX_ATTEMPTS) {
  for (let offset = 0; offset < attempts; offset += 1) {
    const candidate = start + offset;
    if (candidate > 65_535) break;
    if (await isPortFree(candidate)) return candidate;
  }
  throw new Error(
    `No free port in ${start}-${Math.min(start + attempts - 1, 65_535)}. ` +
      "Stop the process holding them or set PORT to an explicit value.",
  );
}

/** Parse a port from the environment, ignoring anything that is not a valid port. */
export function readPortEnv(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed < 65_536 ? parsed : fallback;
}
