import type { SQL } from "bun";
import { getDb } from "../db.ts";
import {
  embedTopicText,
  TOPIC_MODEL,
  toTopicVectorLiteral,
  topicDocumentText,
} from "./topic-embedding.ts";

/**
 * Persistence for specific-topic vectors.
 *
 * Every write is conditional on the record still being the one that was read:
 * the row is written only while `posts.content_hash` still equals the hash the
 * vector was computed from, under a row lock. That condition is what makes
 * concurrent ingest, an explicit edit, and a bounded backfill safe in any
 * interleaving — a vector computed from text that has since changed is
 * discarded instead of being stored against the new text.
 *
 * No function here is reachable from a GET once the vector exists; reads only
 * ever JOIN existing rows.
 */

/** One record snapshot: exactly what the vector was computed from. */
export interface TopicRecord {
  id: string;
  contentHash: string;
  title: string;
  body: string;
}

export type TopicPersistResult = "embedded" | "unchanged" | "pending" | "superseded";

/**
 * Ensure a valid vector exists for exactly this text.
 *
 * A valid row is reused instead of recomputed, so a redelivery costs no
 * inference; a missing row (new table on an old corpus, interrupted cycle) is
 * filled. Both public entry points are this function, because "first write" and
 * "repair" differ only in what already exists, never in what is correct.
 */
async function writeTopicVector(
  record: TopicRecord,
): Promise<{ result: TopicPersistResult; reason?: string }> {
  const db = await getDb();

  const [existing] = await db`
    SELECT 1 FROM topic_embeddings
    WHERE post_id = ${record.id} AND model = ${TOPIC_MODEL}
      AND content_hash = ${record.contentHash}
  `;
  if (existing) return { result: "unchanged" };

  const embedded = await embedTopicText(topicDocumentText(record.title, record.body));
  if (embedded.status !== "ok") return { result: "pending", reason: embedded.reason };

  const literal = toTopicVectorLiteral(embedded.value);
  // Inference takes long enough that the post can be edited while it runs, so
  // the write is one transaction that locks the post row first. The lock is the
  // race guarantee: an editor takes `FOR UPDATE` in `storePost`, so it either
  // commits before this check (making this write superseded) or waits for it
  // and invalidates the vector afterwards. Two writers can never interleave to
  // leave a vector describing text the post no longer has.
  const result = await db.begin(async (tx): Promise<TopicPersistResult> => {
    const [post] = await tx`
      SELECT content_hash FROM posts
      WHERE id = ${record.id} AND deleted_at IS NULL
      FOR SHARE
    `;
    if (!post || String(post.content_hash) !== record.contentHash) return "superseded";

    // `DO UPDATE` is conditional so a second writer that computed the same
    // text does not bump `created_at` or rewrite an identical vector.
    const written = (await tx`
      INSERT INTO topic_embeddings (post_id, model, content_hash, vec)
      VALUES (${record.id}, ${TOPIC_MODEL}, ${record.contentHash}, ${literal}::vector)
      ON CONFLICT (post_id) DO UPDATE SET
        model = EXCLUDED.model, content_hash = EXCLUDED.content_hash,
        vec = EXCLUDED.vec, created_at = now()
      WHERE topic_embeddings.model IS DISTINCT FROM EXCLUDED.model
         OR topic_embeddings.content_hash IS DISTINCT FROM EXCLUDED.content_hash
      RETURNING post_id
    `) as unknown as Array<{ post_id: string }>;
    return written.length > 0 ? "embedded" : "unchanged";
  });
  return { result };
}

/**
 * Idempotent write used by both the new/edit ingest path and the unchanged
 * redelivery path: a vector that is still valid for this exact text is kept, a
 * missing one is computed. Called only after the post row is committed, so the
 * conditional write can see the current hash. There is deliberately no separate
 * "repair" entry point — "write" and "repair" differ only in what already
 * exists, and two names for one guarantee invite the two to drift.
 */
export async function persistTopicEmbedding(record: TopicRecord): Promise<TopicPersistResult> {
  return (await writeTopicVector(record)).result;
}

/** Drop the derived vector in the same transaction that invalidates evidence. */
export async function deleteTopicEmbedding(tx: SQL, ids: string[]) {
  if (ids.length === 0) return;
  await tx`DELETE FROM topic_embeddings WHERE post_id = ANY(${ids}::text[])`;
}

/**
 * Posts whose topic vector is missing or no longer valid for their current
 * text. One definition, used by the backfill and by the map's pending count, so
 * "pending" cannot mean two different things in two places.
 *
 * A document with fewer than two non-space characters cannot produce a vector
 * (`embedTopicText` rejects it), so it is excluded here rather than skipped
 * inside the loop: otherwise the bounded batch would retry the same head-of-
 * queue row forever and "pending" would never reach zero. `acceptInput` already
 * requires 25 letters, so no real record takes this path.
 */
const PENDING_PREDICATE = `
  p.deleted_at IS NULL
  AND greatest(
        length(btrim(p.body)),
        length(btrim(coalesce(p.title, '')))
      ) >= 2
  AND NOT EXISTS (
    SELECT 1 FROM topic_embeddings t
    WHERE t.post_id = p.id AND t.model = '${TOPIC_MODEL}' AND t.content_hash = p.content_hash
  )
`;

export async function countPendingTopicEmbeddings() {
  const db = await getDb();
  const [row] = (await db.unsafe(
    `SELECT count(*)::int AS pending FROM posts p WHERE ${PENDING_PREDICATE}`,
  )) as unknown as Array<{ pending: number }>;
  return Number(row?.pending ?? 0);
}

/** One process owns model inference, so concurrent callers must not double-load it. */
let backfilling = false;

/**
 * Embed a bounded slice of the existing corpus.
 *
 * This exists because the vector table is new for an already-collected
 * corpus. It is chunked, resumable, and free of hidden retries: each call does
 * at most `limit` inference passes and reports what is still missing, so the
 * collector can spend one batch per cycle and an operator can drain it in
 * controlled steps instead of blocking a poll on the whole existing corpus.
 *
 * A record edited between the read and the write is skipped by the conditional
 * write, so the batch can never install a vector for text that no longer exists.
 */
export async function backfillTopicEmbeddings(
  limit = 25,
): Promise<{ embedded: number; pending: number; error?: string }> {
  const bounded = Math.max(1, Math.min(Math.trunc(limit), 200));
  if (backfilling) return { embedded: 0, pending: await countPendingTopicEmbeddings() };
  backfilling = true;
  try {
    const db = await getDb();
    const rows = (await db.unsafe(
      `SELECT p.id, p.content_hash, p.title, p.body
       FROM posts p
       WHERE ${PENDING_PREDICATE}
       ORDER BY p.first_collected_at ASC, p.id ASC
       LIMIT ${bounded}`,
    )) as unknown as Array<{
      id: string;
      content_hash: string;
      title: string;
      body: string;
    }>;

    let embedded = 0;
    let error: string | undefined;
    for (const row of rows) {
      const result = await writeTopicVector({
        id: String(row.id),
        contentHash: String(row.content_hash),
        title: String(row.title ?? ""),
        body: String(row.body ?? ""),
      });
      if (result.result === "embedded") embedded += 1;
      // A failed inference is an unavailable model, not a bad record: trying the
      // remaining rows would repeat the same failing load. The next cycle retries.
      if (result.result === "pending") {
        error = result.reason ?? "Topic model unavailable";
        break;
      }
    }
    const pending = await countPendingTopicEmbeddings();
    return error ? { embedded, pending, error } : { embedded, pending };
  } finally {
    backfilling = false;
  }
}
