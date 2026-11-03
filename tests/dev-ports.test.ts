import { afterAll, describe, expect, test } from "bun:test";
import { createServer, type Server } from "node:net";
import { findAvailablePort, isPortFree, readPortEnv } from "../scripts/ports";

/**
 * Port selection is the contract between `scripts/dev.ts` and the Vite proxy: a
 * wrong answer here makes the app load but every API call fail, which is harder
 * to diagnose than a crash on start.
 */

const blockers: Server[] = [];

function occupy(port: number): Promise<void> {
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  const server = createServer();
  blockers.push(server);
  server.once("error", reject);
  server.listen({ port, host: "127.0.0.1", exclusive: true }, resolve);
  return promise;
}

afterAll(() => {
  for (const server of blockers) server.close();
});

describe("port selection", () => {
  test("reports a bound port as unavailable and a free one as available", async () => {
    await occupy(19501);
    expect(await isPortFree(19501)).toBe(false);
    expect(await isPortFree(19502)).toBe(true);
  });

  test("falls forward past every occupied port instead of assuming the next is free", async () => {
    await occupy(19510);
    // The middle port is occupied too: a naive `start + 1` would collide here.
    await occupy(19511);
    const port = await findAvailablePort(19510);
    expect(port).toBe(19512);
  });

  test("throws a message naming the range when everything is taken", async () => {
    await occupy(19520);
    await occupy(19521);
    const error = await findAvailablePort(19520, 2).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("19520");
  });

  test("reads a valid PORT and ignores values that are not ports", () => {
    expect(readPortEnv("9000", 8787)).toBe(9000);
    expect(readPortEnv(undefined, 8787)).toBe(8787);
    expect(readPortEnv("", 8787)).toBe(8787);
    expect(readPortEnv("not-a-port", 8787)).toBe(8787);
    // Out-of-range values would make Bun.serve throw on a typo instead of
    // falling back to the documented default.
    expect(readPortEnv("70000", 8787)).toBe(8787);
    expect(readPortEnv("0", 8787)).toBe(8787);
    expect(readPortEnv("-1", 8787)).toBe(8787);
  });
});
