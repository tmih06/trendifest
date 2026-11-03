import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Media decoding for the multimodal pipeline. Every model input is derived
 * here so the embedding layer only ever sees decoded images/audio and never
 * touches ffmpeg, temp files, or the network.
 *
 * Requires `ffmpeg` on PATH. When it is absent, video/audio extraction reports
 * `unavailable` instead of throwing: a text-only deployment is a defined
 * degraded mode, not a crash.
 */

const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 20_000;
/** Video frames sampled for embedding; fixed count keeps cost per video bounded. */
export const VIDEO_FRAME_COUNT = 6;
/** CLAP consumes a 10 s window; sampling one window is enough for retrieval. */
const AUDIO_WINDOW_SECONDS = 10;

export type Extraction<T> =
  | { status: "ok"; value: T }
  | { status: "unavailable"; reason: string }
  | { status: "failed"; reason: string };

let ffmpegAvailable: boolean | null = null;

/** Probe once per process; repeated spawns per post would dominate ingest time. */
export async function hasFfmpeg() {
  if (ffmpegAvailable !== null) return ffmpegAvailable;
  const { promise, resolve } = Promise.withResolvers<boolean>();
  const child = spawn("ffmpeg", ["-version"], { stdio: "ignore" });
  child.on("error", () => resolve(false));
  child.on("close", (code) => resolve(code === 0));
  ffmpegAvailable = await promise;
  return ffmpegAvailable;
}

async function download(url: string) {
  const response = await fetch(url, {
    headers: { accept: "image/*,video/*,audio/*,*/*" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`media returned ${response.status}`);
  const length = Number(response.headers.get("content-length") ?? "0");
  if (length > MAX_MEDIA_BYTES) throw new Error("media exceeds the size cap");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_MEDIA_BYTES) throw new Error("media exceeds the size cap");
  return bytes;
}

/** Fetch a remote image as a Blob, which is what transformers.js image inputs accept. */
export async function fetchImage(url: string): Promise<Extraction<Blob>> {
  try {
    const bytes = await download(url);
    return { status: "ok", value: new Blob([bytes], { type: "image/jpeg" }) };
  } catch (error) {
    return { status: "failed", reason: error instanceof Error ? error.message : "image failed" };
  }
}

function run(args: string[], input?: Uint8Array): Promise<Uint8Array> {
  const { promise, resolve, reject } = Promise.withResolvers<Uint8Array>();
  const child = spawn("ffmpeg", args, { stdio: ["pipe", "pipe", "pipe"] });
  const chunks: Uint8Array[] = [];
  const errors: Buffer[] = [];
  child.stdout.on("data", (chunk: Buffer) => chunks.push(new Uint8Array(chunk)));
  child.stderr.on("data", (chunk: Buffer) => errors.push(chunk));
  child.on("error", reject);
  child.on("close", (code) => {
    if (code === 0) resolve(Buffer.concat(chunks));
    else reject(new Error(Buffer.concat(errors).toString().slice(-300) || `ffmpeg ${code}`));
  });
  child.stdin.end(input);
  return promise;
}

/** ffprobe can read the remote HLS playlist directly; duration bounds frame sampling. */
function probeDuration(url: string): Promise<number> {
  const { promise, resolve } = Promise.withResolvers<number>();
  const child = spawn("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "csv=p=0",
    url,
  ]);
  const chunks: Buffer[] = [];
  child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
  child.on("error", () => resolve(0));
  child.on("close", () => resolve(Number(Buffer.concat(chunks).toString().trim()) || 0));
  return promise;
}

/**
 * Decode PCM as 48 kHz mono float32, the rate CLAP's feature extractor expects.
 * Reading the HLS playlist directly means video audio and standalone audio take
 * the same path; ffmpeg picks a variant and muxes the AAC track.
 */
async function decodeAudio(url: string): Promise<Extraction<Float32Array>> {
  if (!(await hasFfmpeg())) {
    return { status: "unavailable", reason: "ffmpeg is not installed" };
  }
  try {
    // -t bounds the read: a long video should not stream its whole soundtrack.
    const pcm = await run([
      "-v",
      "error",
      "-t",
      String(AUDIO_WINDOW_SECONDS),
      "-i",
      url,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "48000",
      "-f",
      "f32le",
      "-",
    ]);
    if (pcm.byteLength === 0) return { status: "failed", reason: "no audio track" };
    const copy = new Uint8Array(pcm.byteLength);
    copy.set(pcm);
    return { status: "ok", value: new Float32Array(copy.buffer) };
  } catch (error) {
    return { status: "failed", reason: error instanceof Error ? error.message : "audio failed" };
  }
}

export function extractAudio(url: string) {
  return decodeAudio(url);
}

/**
 * Sample evenly spaced frames across the video. Scene-cut detection was tested
 * and yielded zero frames on short clips with a single scene, which would
 * silently produce no visual evidence; even sampling always yields
 * `VIDEO_FRAME_COUNT` frames or a clear failure.
 */
export async function extractVideoFrames(url: string): Promise<Extraction<Blob[]>> {
  if (!(await hasFfmpeg())) {
    return { status: "unavailable", reason: "ffmpeg is not available for video decoding" };
  }

  const directory = await mkdtemp(path.join(tmpdir(), "trendifest-frame-"));
  try {
    const duration = await probeDuration(url);

    // A 0 duration means ffprobe could not read the stream; sample by count instead.
    const total = duration > 0 ? duration : VIDEO_FRAME_COUNT;
    const frames: Blob[] = [];
    for (let index = 0; index < VIDEO_FRAME_COUNT; index += 1) {
      const at = ((index + 0.5) / VIDEO_FRAME_COUNT) * total;
      const file = path.join(directory, `frame-${index}.jpg`);
      try {
        await run([
          "-v",
          "error",
          "-y",
          "-ss",
          at.toFixed(2),
          "-i",
          url,
          "-frames:v",
          "1",
          "-q:v",
          "4",
          file,
        ]);
        const bytes = await Bun.file(file).bytes();
        if (bytes.byteLength > 0) {
          frames.push(new Blob([bytes], { type: "image/jpeg" }));
        }
      } catch {
        // One unreadable timestamp must not void the whole video; keep going.
      }
    }

    if (frames.length === 0) return { status: "failed", reason: "no video frames decoded" };
    return { status: "ok", value: frames };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
