import { parentPort } from "node:worker_threads";
import { projectTopicMap, type TopicProjectionInput } from "./topic-projection.ts";

/**
 * CPU boundary only. The worker receives plain rows and returns a projection;
 * it has no database handle, no model, and no timers, so it cannot keep a CLI or
 * test process alive and cannot reach the network.
 */
if (!parentPort) throw new Error("Topic projection must run in a worker");
const port = parentPort;
port.on("message", ({ id, input }: { id: number; input: TopicProjectionInput }) => {
  try {
    port.postMessage({ id, projection: projectTopicMap(input) });
  } catch (error) {
    port.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
});
