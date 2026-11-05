import { parentPort } from "node:worker_threads";
import { projectTopicMap, type TopicProjectionInput } from "./topic-projection.ts";

if (!parentPort) throw new Error("Topic projection must run in a worker");
const port = parentPort;
port.on("message", ({ id, input }: { id: number; input: TopicProjectionInput }) => {
  try {
    port.postMessage({ id, map: projectTopicMap(input) });
  } catch (error) {
    port.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
});
