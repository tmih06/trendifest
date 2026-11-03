import {
  AutoFeatureExtractor,
  AutoProcessor,
  AutoTokenizer,
  CLIPTextModelWithProjection,
  CLIPVisionModelWithProjection,
  ClapAudioModelWithProjection,
  type FeatureExtractionPipeline,
  type PreTrainedModel,
  type PreTrainedTokenizer,
  type Processor,
  RawImage,
  env,
  pipeline,
} from "@huggingface/transformers";
import { SPACE_MODELS } from "../db.ts";
import type { Space } from "../db.ts";
import type { Extraction } from "./media.ts";

/**
 * Local embeddings, one model per space. Nothing leaves the machine and no API
 * key is required, which keeps unapproved community content off third-party
 * inference. Models load lazily on first use and stay resident for the process,
 * so the first post pays a one-time download and every later one is inference only.
 *
 * Each vector is L2-normalized by `toVectorLiteral` at write time, so cosine
 * similarity is a plain dot product and all spaces can share one padded column.
 */

// Keep weights inside the project so a container restart does not re-download
// hundreds of megabytes into a read-only home directory.
env.cacheDir = process.env.TRENDIFEST_MODEL_CACHE ?? ".cache/transformers";
env.allowLocalModels = true;

/** Shorter than this and CLAP's mel window is mostly padding, which yields noise. */
const MIN_AUDIO_SAMPLES = 4_800;
const MAX_TEXT_CHARS = 2_000;

export interface Vector {
  space: Space;
  model: string;
  dim: number;
  values: number[];
}

/**
 * Memoized async loader: one load per process, and a rejected load clears
 * itself so a transient download failure does not poison every later post.
 */
class Loader<T> {
  #load: () => Promise<T>;
  #pending: Promise<T> | null = null;
  #value: T | null = null;

  constructor(load: () => Promise<T>) {
    this.#load = load;
  }

  get loaded() {
    return this.#value !== null;
  }

  get(): Promise<T> {
    if (this.#value) return Promise.resolve(this.#value);
    this.#pending ??= this.#load()
      .then((value) => {
        this.#value = value;
        return value;
      })
      .catch((error) => {
        this.#pending = null;
        throw error;
      });
    return this.#pending;
  }

  reset() {
    this.#value = null;
    this.#pending = null;
  }
}

const textModel = new Loader<FeatureExtractionPipeline>(() =>
  pipeline("feature-extraction", SPACE_MODELS.text.model),
);

// CLIP's text and vision towers are separate ONNX graphs; the processor and the
// tokenizer are separate again, so each gets its own memoized load.
const clipText = new Loader<PreTrainedModel>(() =>
  CLIPTextModelWithProjection.from_pretrained(SPACE_MODELS.image.model, { dtype: "q8" }),
);
const clipVision = new Loader<PreTrainedModel>(() =>
  CLIPVisionModelWithProjection.from_pretrained(SPACE_MODELS.image.model, { dtype: "q8" }),
);
const clipProcessor = new Loader<Processor>(() =>
  AutoProcessor.from_pretrained(SPACE_MODELS.image.model),
);
const clipTokenizer = new Loader<PreTrainedTokenizer>(() =>
  AutoTokenizer.from_pretrained(SPACE_MODELS.image.model),
);

// ClapModel in this runtime has no audio helper, so the audio tower is loaded
// directly and fed by an explicit feature extractor.
const clapAudio = new Loader<PreTrainedModel>(() =>
  ClapAudioModelWithProjection.from_pretrained(SPACE_MODELS.audio.model, { dtype: "q8" }),
);
const clapFeatures = new Loader(() =>
  AutoFeatureExtractor.from_pretrained(SPACE_MODELS.audio.model),
);

/** Zero vectors carry no direction; indexing one would match everything weakly. */
function hasSignal(values: ArrayLike<number>) {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] !== 0) return true;
  }
  return false;
}

function toVector(space: Space, values: ArrayLike<number>): Vector | null {
  if (!hasSignal(values)) return null;
  return {
    space,
    model: SPACE_MODELS[space].model,
    dim: SPACE_MODELS[space].dim,
    values: Array.from(values),
  };
}

function failure(error: unknown, fallback: string) {
  return { status: "failed", reason: error instanceof Error ? error.message : fallback } as const;
}

/**
 * Text embedding for a post body, OCR output, alt text, or a transcript.
 * Rejects input shorter than two characters: single glyphs and emoji-only posts
 * produce noise clusters rather than meaning.
 */
export async function embedText(text: string): Promise<Extraction<Vector>> {
  const clean = text.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_CHARS);
  if (clean.length < 2) return { status: "failed", reason: "no usable text" };

  try {
    const extract = await textModel.get();
    const output = await extract([clean], { pooling: "mean", normalize: true });
    const vector = toVector("text", output.tolist()[0] ?? []);
    if (!vector) return { status: "failed", reason: "degenerate text vector" };
    return { status: "ok", value: vector };
  } catch (error) {
    return failure(error, "text model failed");
  }
}

/**
 * Image embedding in CLIP's shared image/text space, so a frame can be
 * retrieved by a caption as well as by other frames. Do not mix these vectors
 * with `embedText` results: that is a different space and a different model.
 */
export async function embedImage(blob: Blob): Promise<Extraction<Vector>> {
  try {
    const [vision, processor] = await Promise.all([clipVision.get(), clipProcessor.get()]);
    const image = await RawImage.fromBlob(blob);
    const inputs = await processor(image);
    const output = await vision({ pixel_values: inputs.pixel_values });
    const vector = toVector("image", output.image_embeds.data);
    if (!vector) return { status: "failed", reason: "degenerate image vector" };
    return { status: "ok", value: vector };
  } catch (error) {
    return failure(error, "image model failed");
  }
}

/** Free-text query in the image space, used for cross-modal cluster search. */
export async function embedClipText(text: string): Promise<Extraction<Vector>> {
  const clean = text.replace(/\s+/g, " ").trim().slice(0, 400);
  if (clean.length < 2) return { status: "failed", reason: "no usable query" };

  try {
    const [model, tokenizer] = await Promise.all([clipText.get(), clipTokenizer.get()]);
    const inputs = tokenizer([clean], { padding: true, truncation: true });
    const output = await model(inputs);
    const vector = toVector("image", output.text_embeds.data);
    if (!vector) return { status: "failed", reason: "degenerate clip text vector" };
    return { status: "ok", value: vector };
  } catch (error) {
    return failure(error, "clip text failed");
  }
}

/** Audio embedding from decoded 48 kHz mono float32 PCM. */
export async function embedAudio(samples: Float32Array): Promise<Extraction<Vector>> {
  if (samples.length < MIN_AUDIO_SAMPLES) {
    return { status: "failed", reason: "audio too short to embed" };
  }

  try {
    const [model, extractor] = await Promise.all([clapAudio.get(), clapFeatures.get()]);
    const inputs = await extractor(samples, { sampling_rate: 48_000 });
    const output = await model(inputs);
    const vector = toVector("audio", output.audio_embeds.data);
    if (!vector) return { status: "failed", reason: "degenerate audio vector" };
    return { status: "ok", value: vector };
  } catch (error) {
    return failure(error, "audio model failed");
  }
}

/** Drop resident weights and their network handles; tests and shutdown use this. */
export function disposeEmbedders() {
  for (const loader of [
    textModel,
    clipText,
    clipVision,
    clipProcessor,
    clipTokenizer,
    clapAudio,
    clapFeatures,
  ]) {
    loader.reset();
  }
}
