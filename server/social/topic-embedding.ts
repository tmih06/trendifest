import { env, pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";
import { TOPIC_VECTOR_DIM } from "../db.ts";
import type { Extraction } from "./media.ts";

/**
 * Specific-topic embeddings: one model, one space, one purpose.
 *
 * These vectors answer "is this the same concrete event/product?" — not "is
 * this the same text?". They are deliberately separate from the near-copy
 * spaces in `embed.ts`:
 *
 * - A different model (multilingual-e5-small, q8) and a different native width
 *   (384, unpadded), so they live in their own `topic_embeddings` table. Mixing
 *   them with MiniLM or CLIP vectors would compare unrelated spaces.
 * - E5 is trained with a prefix. The model card asks for `query: ` on the side
 *   that is compared against a stored corpus; we use it symmetrically because
 *   every stored record here is also a candidate query for grouping.
 * - The model asserts a compressed similarity range, so callers must apply
 *   entity/version constraints on top of a cosine floor. A high cosine alone is
 *   not evidence of the same event.
 *
 * Nothing here is called from a read path: no request may pay inference cost,
 * and no GET may mutate vectors.
 */

export const TOPIC_MODEL = "Xenova/multilingual-e5-small";
export const TOPIC_DIM = TOPIC_VECTOR_DIM;
/** E5's retrieval prefix, applied to every document and every comparison text. */
const QUERY_PREFIX = "query: ";
/** Bounded so one long post cannot dominate a batch's token budget. */
export const MAX_TOPIC_DOCUMENT_CHARS = 1_200;
const MAX_TITLE_CHARS = 180;

env.cacheDir = process.env.TRENDIFEST_MODEL_CACHE ?? ".cache/transformers";
env.allowLocalModels = true;

let extractor: FeatureExtractionPipeline | null = null;
let pending: Promise<FeatureExtractionPipeline> | null = null;

/**
 * Lazily load the quantized pipeline once per process. A rejected load clears
 * itself, so a transient failure does not poison every later post, and no model
 * bytes are read merely by importing this module.
 */
async function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (extractor) return extractor;
  pending ??= pipeline("feature-extraction", TOPIC_MODEL, { dtype: "q8" })
    .then((loaded) => {
      extractor = loaded;
      return loaded;
    })
    .catch((error: unknown) => {
      pending = null;
      throw error;
    });
  return pending;
}

function clean(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

/**
 * The exact text a stored topic vector is computed from. Both ingest and the
 * bounded backfill call this, so a redelivery can be recognised as already
 * embedded instead of drifting between two normalisations.
 *
 * News and current forum records preserve a headline. Older forum rows may lack
 * one; their existing body supplies the bounded document without inventing a title.
 */
export function topicDocumentText(title: string | null | undefined, body: string) {
  const heading = clean(title).slice(0, MAX_TITLE_CHARS);
  const text = clean(body);
  return (heading ? `${heading}\n${text}` : text).slice(0, MAX_TOPIC_DOCUMENT_CHARS);
}

/**
 * Embed one topic document. Failures are reported, never replaced with a
 * placeholder vector: a fake vector would silently group unrelated records.
 */
export async function embedTopicText(text: string): Promise<Extraction<number[]>> {
  const document = text.slice(0, MAX_TOPIC_DOCUMENT_CHARS).trim();
  // Two real characters after punctuation/symbols: fewer carries no direction.
  if (document.replace(/[\p{P}\p{S}\s]/gu, "").length < 2) {
    return { status: "failed", reason: "no usable topic text" };
  }

  try {
    const extract = await getExtractor();
    const output = await extract([`${QUERY_PREFIX}${document}`], {
      pooling: "mean",
      normalize: true,
    });
    const values = (output.tolist()[0] ?? []) as number[];
    if (values.length !== TOPIC_DIM) {
      return {
        status: "failed",
        reason: `topic model returned ${values.length} dimensions, expected ${TOPIC_DIM}`,
      };
    }
    let norm = 0;
    for (const value of values) norm += value * value;
    if (!(norm > 0)) return { status: "failed", reason: "degenerate topic vector" };
    return { status: "ok", value: values };
  } catch (error) {
    return {
      status: "failed",
      reason: error instanceof Error ? error.message : "topic model failed",
    };
  }
}

/**
 * Serialize a topic vector at its native width. `toVectorLiteral` pads to the
 * shared 1024-dim near-copy column; doing that here would store a vector the
 * topic table cannot even hold, so this is deliberately a separate function.
 */
export function toTopicVectorLiteral(values: ArrayLike<number>) {
  if (values.length !== TOPIC_DIM) {
    throw new Error(`topic vector must be ${TOPIC_DIM} dimensions, got ${values.length}`);
  }
  let norm = 0;
  for (let index = 0; index < TOPIC_DIM; index += 1) norm += values[index]! * values[index]!;
  const scale = norm > 0 ? 1 / Math.sqrt(norm) : 0;

  const parts: string[] = [];
  for (let index = 0; index < TOPIC_DIM; index += 1) {
    const value = values[index]! * scale;
    // Six decimals is inside fp32 precision and keeps the wire literal small.
    parts.push(value === 0 ? "0" : value.toFixed(6));
  }
  return `[${parts.join(",")}]`;
}
