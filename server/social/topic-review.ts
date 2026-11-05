import { createHash, randomUUID } from "node:crypto";
import type { SQL } from "bun";
import type {
  TopicReviewDecision,
  TopicReviewInput,
  TopicReviewResult,
} from "../../shared/intelligence.ts";
import { ApiFailure } from "../api-error.ts";
import { getDb } from "../db.ts";
import { loadTopicMembers } from "./topic-intelligence.ts";
import {
  GROUPING_THRESHOLD,
  prepare,
  topicPairScore,
  type PreparedRecord,
  type TopicEvidence,
} from "./topics.ts";

/**
 * Human topic review: merge two topics that are one event, split one topic that
 * is two, and undo either decision later.
 *
 * Why this is its own write path instead of editing posts:
 *
 * - Raw evidence is immutable. A review never rewrites `posts`, `observations`,
 *   `metric_snapshots` or `topic_embeddings`: it records a decision and takes a
 *   *lock* on the memberships it covers. Undo restores those rows from the
 *   before-image captured in the same transaction, so no original record is
 *   ever mutated or lost.
 * - A merge is a redirect, not a copy. Source catalog rows keep existing (with
 *   `merged_into` set), which is what preserves deep links, snapshots and watch
 *   rules that already name them. Automatic grouping resolves the chain, so
 *   newly arriving evidence lands on the target deterministically.
 * - A split needs a stable home for the selected subset. The manual topic id is
 *   derived from the source topic plus the exact sorted record set, so the same
 *   split always names the same topic; `topic:manual:*` ids are reserved from
 *   automatic grouping, which is what stops the next refresh rejoining them.
 * - Both partitions are locked, not just the moved records: an unlocked target
 *   or complement could be regrouped and silently undo the human decision.
 * - Every decision is one transaction under one cross-process advisory lock, so
 *   two reviewers (in this process or another) can never interleave a guard
 *   check with a write.
 *
 * Guards are the *same* rules automatic grouping uses (`topicPairScore`).
 * A human may correct a fragmented paraphrase, but may never overrule an
 * explicit version, place, year or same-name/different-class conflict: cards
 * that name different things stay apart even when a person asks to merge them.
 */

/** Advisory namespace shared with the collector (key 1) and refresh (key 2). */
const REVIEW_LOCK_NAMESPACE = 0x54524446;
const REFRESH_LOCK_KEY = 2;
const REVIEW_LOCK_KEY = 3;
/**
 * How long a review waits for the refresh to finish its write phase. Grouping a
 * corpus takes seconds, and blocking an HTTP request behind it would look like a
 * hang; past this the reviewer is told to retry, which costs nothing because no
 * decision has been written yet.
 */
const REFRESH_WAIT_TRIES = 20;
const REFRESH_WAIT_MS = 100;

/**
 * Serialize against the intelligence refresh, then against other reviews.
 *
 * Key order is fixed (2 then 3) so a review and a refresh can never acquire the
 * two locks in opposite orders and deadlock on the membership rows they both
 * touch. The refresh is waited for with a bounded try-lock instead of a blocking
 * acquisition, so a long grouping run answers "try again" rather than holding the
 * request open indefinitely.
 */
async function acquireReviewLocks(tx: SQL) {
  for (let attempt = 0; attempt < REFRESH_WAIT_TRIES; attempt += 1) {
    const [row] = (await tx`
      SELECT pg_try_advisory_xact_lock(${REVIEW_LOCK_NAMESPACE}::int, ${REFRESH_LOCK_KEY}::int) AS acquired
    `) as unknown as Array<{ acquired: boolean }>;
    if (row?.acquired) {
      await tx`SELECT pg_advisory_xact_lock(${REVIEW_LOCK_NAMESPACE}::int, ${REVIEW_LOCK_KEY}::int)`;
      return;
    }
    await tx`SELECT pg_sleep(${REFRESH_WAIT_MS / 1000})`;
  }
  fail(
    "conflicting_review",
    "Intelligence is being refreshed right now. Try the review again in a moment.",
  );
}

/** A bounded decision, so one request cannot hold the review lock indefinitely. */
export const MAX_REVIEW_TOPICS = 8;
export const MAX_REVIEW_RECORDS = 400;
export const MAX_REVIEW_NOTE = 500;
/**
 * Bound exact cross-topic verification while holding review locks. Refuse work
 * beyond this budget rather than silently sampling pairs and missing a conflict.
 */
export const MAX_VERIFIED_PAIRS = 50_000;
/**
 * Evidence window used for the guard, deliberately wider than any route allows.
 *
 * A review must see *every* current member of the topics it touches, not only
 * the ones inside the page's window, or a merge could carry an unverified record
 * across. Ten years is past any record this collector can hold, so the guard's
 * set and the membership set coincide; if they ever do not, the decision is
 * refused rather than accepted partially (see `assertMergeEvidenceComplete`).
 */
const GUARD_WINDOW_HOURS = 87_600;

/* ------------------------------------------------------------------ *
 * Input validation. Routes pass untrusted JSON; this module owns the
 * contract, including the field-level messages the panel shows.
 * ------------------------------------------------------------------ */

function fail(code: "invalid_review" | "not_found" | "conflicting_review", message: string): never {
  throw new ApiFailure(
    code === "invalid_review" ? 400 : code === "not_found" ? 404 : 409,
    message,
    code,
  );
}

function asRecord(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    fail("invalid_review", "Review details must be an object");
  }
  return input as Record<string, unknown>;
}

/** Topic/record id lists: strings only, de-duplicated, first-seen order kept. */
function readIds(value: unknown, field: "topic" | "record", max: number) {
  if (!Array.isArray(value)) {
    fail("invalid_review", `${field === "topic" ? "Topic" : "Record"} IDs must be a list`);
  }
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") {
      fail("invalid_review", `${field === "topic" ? "Topic" : "Record"} IDs must be text`);
    }
    const id = entry.trim();
    if (!id) fail("invalid_review", "An empty ID was sent; reload the topic and try again");
    // Source-native record identities include publisher/aggregator URLs.
    if (id.length > (field === "record" ? 8_192 : 200))
      fail("invalid_review", "An over-long ID was sent; reload and try again");
    seen.add(id);
    if (seen.size > max) {
      fail(
        "invalid_review",
        field === "topic"
          ? `A review covers at most ${max} topics at once`
          : `A split covers at most ${max} records at once`,
      );
    }
  }
  return [...seen];
}

/** Narrowing validator: routes hand us parsed JSON, never a pre-typed object. */
export function parseTopicReviewInput(input: unknown): TopicReviewInput {
  const body = asRecord(input);
  const operation = body.operation;
  if (operation !== "merge" && operation !== "split") {
    fail("invalid_review", "Choose whether to merge or split");
  }
  const topicIds = readIds(body.topicIds, "topic", MAX_REVIEW_TOPICS);
  const recordIds = readIds(body.recordIds, "record", MAX_REVIEW_RECORDS);
  const noteValue = body.note === undefined || body.note === null ? "" : body.note;
  if (typeof noteValue !== "string") fail("invalid_review", "Note must be text");
  const note = noteValue.trim();
  if (note.length > MAX_REVIEW_NOTE) {
    fail("invalid_review", `Keep the note under ${MAX_REVIEW_NOTE} characters`);
  }
  if (operation === "merge") {
    if (topicIds.length < 2) {
      fail(
        "invalid_review",
        "A merge needs two different topics: the one that is wrong and the one that is right",
      );
    }
    if (recordIds.length > 0) {
      fail("invalid_review", "A merge moves whole topics; clear the selected records");
    }
  } else {
    if (topicIds.length !== 1) fail("invalid_review", "A split applies to exactly one topic");
    if (recordIds.length === 0) {
      fail("invalid_review", "Select the records that belong in the new topic");
    }
  }
  // A note is strongly encouraged and the panel requires one, but an empty note
  // is not an invalid review: the decision itself is the audit record, and a
  // caller that omits the reason must not be blocked from correcting a merge.
  return { operation, topicIds, recordIds, note };
}

/* ------------------------------------------------------------------ *
 * Stored shapes.
 * ------------------------------------------------------------------ */

interface DecisionRow {
  id: string;
  operation: "merge" | "split";
  topic_ids: string[];
  record_ids: string[];
  target_id: string;
  note: string;
  created_at: Date | string;
  active: boolean;
}

interface MemberRow {
  post_id: string;
  topic_id: string;
  content_hash: string;
  locked: boolean;
  review_id: string | null;
}

/** One persisted membership that still describes its record's current text. */
interface CurrentMembership {
  postId: string;
  topicId: string;
  contentHash: string;
  locked: boolean;
  reviewId: string | null;
}

/**
 * Before-image of everything a decision writes. Undo restores exactly these
 * rows, so it never has to re-derive an earlier grouping from current data.
 */
type PriorMembership = CurrentMembership;

interface PriorCatalog {
  id: string;
  existed: boolean;
  /** Value before the decision; null when the row did not exist. */
  mergedInto: string | null;
  label: string | null;
  /** Value this decision wrote, so undo can verify nothing moved since. */
  wrote: string | null;
}

interface PriorState {
  memberships: PriorMembership[];
  catalog: PriorCatalog[];
}

function toDecision(row: DecisionRow): TopicReviewDecision {
  return {
    id: String(row.id),
    operation: row.operation,
    topicIds: row.topic_ids.map(String),
    recordIds: row.record_ids.map(String),
    targetId: String(row.target_id),
    note: String(row.note),
    createdAt: new Date(row.created_at).toISOString(),
    active: row.active,
  };
}

/* ------------------------------------------------------------------ *
 * Reads.
 * ------------------------------------------------------------------ */

/**
 * Decisions newest first, optionally scoped to one topic. The scope follows
 * redirects on both sides: a source id resolves to its target, and a target's
 * history includes the decisions that redirect sources into it. That is what
 * makes a merge inspectable (and undoable) from either side.
 */
export async function listTopicReviews(topicId?: string): Promise<TopicReviewDecision[]> {
  const db = await getDb();
  if (topicId === undefined) {
    const rows = (await db`
      SELECT id, operation, topic_ids, record_ids, target_id, note, created_at, active
      FROM topic_review_decisions
      ORDER BY created_at DESC, id
    `) as unknown as DecisionRow[];
    return rows.map(toDecision);
  }
  const id = topicId.trim();
  if (!id) fail("invalid_review", "Topic ID is required");
  // The requested id is always in the set, even when its catalog row is gone:
  // a decision that mentions it must stay inspectable rather than vanish.
  const rows = (await db`
    WITH RECURSIVE chain AS (
      SELECT ${id}::text AS id
      UNION
      SELECT c.merged_into
      FROM topic_catalog c
      JOIN chain ON c.id = chain.id
      WHERE c.merged_into IS NOT NULL
    )
    SELECT DISTINCT d.id, d.operation, d.topic_ids, d.record_ids, d.target_id,
                    d.note, d.created_at, d.active
    FROM topic_review_decisions d
    WHERE d.topic_ids && ARRAY(SELECT id FROM chain)::text[]
       OR d.target_id IN (SELECT id FROM chain)
    ORDER BY d.created_at DESC, d.id
  `) as unknown as DecisionRow[];
  return rows.map(toDecision);
}

/* ------------------------------------------------------------------ *
 * Shared helpers.
 * ------------------------------------------------------------------ */

/** Follow the redirect chain under the decision lock; null when the topic is gone. */
async function resolveTopicId(tx: SQL, id: string): Promise<string | null> {
  let current = id;
  const seen = new Set<string>();
  while (true) {
    if (seen.has(current))
      fail(
        "conflicting_review",
        "Topic redirects contain a cycle; repair the catalog before reviewing",
      );
    seen.add(current);
    const [row] = (await tx`
      SELECT merged_into FROM topic_catalog WHERE id = ${current}
    `) as unknown as Array<{ merged_into: string | null }>;
    if (!row) return null;
    if (!row.merged_into) return current;
    current = String(row.merged_into);
  }
}

async function catalogRow(tx: SQL, id: string) {
  const [row] = (await tx`
    SELECT id, label, merged_into FROM topic_catalog WHERE id = ${id}
  `) as unknown as Array<{ id: string; label: string; merged_into: string | null }>;
  return row ?? null;
}

/**
 * Every persisted membership of these topics that still describes its record.
 * Membership, not the timeline window, is the unit a lock must cover: a record
 * outside today's window is still a member that a later refresh could regroup.
 */
async function currentMemberships(
  tx: SQL,
  topicIds: readonly string[],
): Promise<CurrentMembership[]> {
  if (topicIds.length === 0) return [];
  const rows = (await tx`
    SELECT m.post_id, m.topic_id, m.content_hash, m.locked, m.review_id
    FROM topic_memberships m
    JOIN posts p ON p.id = m.post_id
   WHERE m.topic_id = ANY(${topicIds}::text[])
     AND p.deleted_at IS NULL
     AND p.content_hash = m.content_hash
   ORDER BY m.post_id
   FOR UPDATE OF m, p
  `) as unknown as MemberRow[];
  return rows.map((row) => ({
    postId: String(row.post_id),
    topicId: String(row.topic_id),
    contentHash: String(row.content_hash),
    locked: row.locked,
    reviewId: row.review_id === null ? null : String(row.review_id),
  }));
}

/**
 * A merge moves every membership of both sides, so the guard must have verified
 * every one of them. `loadTopicMembers` and the membership read are separate
 * statements, and a refresh in another process can commit between them, so an
 * exact set-and-hash agreement is required before anything is written.
 *
 * A record with no valid topic vector is excluded from evidence and therefore
 * makes the sets disagree. That is refused rather than optimistically merged:
 * "identical enough to skip" is exactly the judgement a guard exists to make.
 */
function assertMergeEvidenceComplete(
  evidence: readonly TopicEvidence[],
  memberships: readonly CurrentMembership[],
) {
  const evidenceById = new Map(evidence.map((record) => [record.id, record]));
  const missing = memberships.filter(
    (row) => evidenceById.get(row.postId)?.contentHash !== row.contentHash,
  );
  if (missing.length > 0 || evidenceById.size !== memberships.length) {
    fail(
      "conflicting_review",
      "The merge cannot be verified: records have no valid topic vector or changed while this review was open. Reload the topic and try again.",
    );
  }
}

/** Stable manual topic id: same source and same record set always name one topic. */
function manualTopicId(sourceId: string, recordIds: readonly string[]) {
  const digest = createHash("sha1")
    .update(`split\0${sourceId}\0${[...recordIds].sort().join("\0")}`)
    .digest("hex")
    .slice(0, 16);
  return `topic:manual:${digest}`;
}

/** A source-grounded label for a new partition: a real title, never generated text. */
function labelForPartition(records: readonly { title: string; text: string }[]) {
  const titles = records
    .map((record) => (record.title || record.text).replace(/\s+/gu, " ").trim())
    .filter(Boolean)
    .sort((a, b) => a.length - b.length || a.localeCompare(b));
  const chosen = titles[0];
  if (!chosen)
    fail(
      "invalid_review",
      "Selected records have no source title or excerpt. Choose records with usable source text.",
    );
  return chosen.length > 240 ? `${chosen.slice(0, 239).trimEnd()}…` : chosen;
}

function titleOf(record: TopicEvidence) {
  const text = (record.title || record.text).replace(/\s+/g, " ").trim();
  return text.length > 90 ? `${text.slice(0, 89)}…` : text;
}

/**
 * Merge guard: every cross-topic record pair must be allowed by the same rules
 * automatic grouping applies. Records already inside one side are not
 * re-checked against each other (an earlier decision or the grouper already
 * accepted them); what a merge asserts is that the two sides are one event.
 *
 * The pair budget is a refusal, never a short cut: the request fails with an
 * explanation when the check would exceed it, so a merge is never accepted on a
 * partial verification.
 */
function assertMergeCompatible(
  groups: ReadonlyArray<{ id: string; members: readonly TopicEvidence[] }>,
) {
  let pairs = 0;
  for (let left = 0; left < groups.length; left += 1) {
    for (let right = left + 1; right < groups.length; right += 1) {
      pairs += groups[left]!.members.length * groups[right]!.members.length;
    }
  }
  if (pairs > MAX_VERIFIED_PAIRS) {
    fail(
      "conflicting_review",
      `These topics are too large to verify in one decision: ${pairs.toLocaleString("en")} record pairs, limit ${MAX_VERIFIED_PAIRS.toLocaleString("en")}. Split the largest topic first, then merge the smaller parts.`,
    );
  }
  // Each record is prepared once, not once per pair: `topicPairScore` accepts
  // the cached extraction, and the verdict is identical to letting it prepare
  // internally. That is what keeps an exact check affordable inside the budget.
  const prepared = new Map<string, PreparedRecord>();
  for (const group of groups) {
    for (const record of group.members) {
      if (!prepared.has(record.id)) prepared.set(record.id, prepare(record));
    }
  }
  for (let left = 0; left < groups.length; left += 1) {
    for (let right = left + 1; right < groups.length; right += 1) {
      for (const a of groups[left]!.members) {
        for (const b of groups[right]!.members) {
          const score = topicPairScore(a, b, {
            threshold: GROUPING_THRESHOLD,
            prepared: [prepared.get(a.id)!, prepared.get(b.id)!],
          });
          if (score.conflict) {
            fail(
              "conflicting_review",
              `"${titleOf(a)}" and "${titleOf(b)}" name different versions, places, or occurrences, so they stay separate topics. Split the record that does not belong.`,
            );
          }
        }
      }
    }
  }
}

/* ------------------------------------------------------------------ *
 * Decisions.
 * ------------------------------------------------------------------ */

/**
 * Apply one merge or split and return the audit record.
 *
 * Ordering, all inside one transaction under the review lock:
 * 1. resolve redirects, load current members and verify the guard;
 * 2. read every membership before-image `FOR UPDATE`;
 * 3. write the decision row, then memberships, then catalog redirects, then
 *    the before-image itself.
 *
 * The decision row is written before the memberships it authorizes, so a row
 * can never name a review that does not exist. A failure before commit leaves
 * no decision (including no orphan lock), because all of it rolls back.
 */
export async function applyTopicReview(input: unknown): Promise<TopicReviewResult> {
  const request = parseTopicReviewInput(input);
  const db = await getDb();
  return await db.begin(async (tx) => {
    await acquireReviewLocks(tx);
    return request.operation === "merge" ? mergeTopics(tx, request) : splitTopic(tx, request);
  });
}

async function mergeTopics(tx: SQL, request: TopicReviewInput): Promise<TopicReviewResult> {
  const resolved: string[] = [];
  for (const id of request.topicIds) {
    const target = await resolveTopicId(tx, id);
    if (!target) fail("not_found", "One of those topics no longer exists. Reload and try again.");
    if (!(await catalogRow(tx, target))) {
      fail("not_found", "One of those topics no longer exists. Reload and try again.");
    }
    if (!resolved.includes(target)) resolved.push(target);
  }
  if (resolved.length < 2) {
    fail(
      "conflicting_review",
      "Those topics already point at one topic. Reload the topic to see the current grouping.",
    );
  }

  const evidence = new Map<string, TopicEvidence[]>();
  for (const id of resolved) {
    evidence.set(id, await loadTopicMembers(id, GUARD_WINDOW_HOURS));
  }
  const groups = resolved.map((id) => ({ id, members: evidence.get(id)! }));
  for (const group of groups) {
    if (group.members.length === 0) {
      fail(
        "not_found",
        "One of those topics has no current records. Reload the topic and try again.",
      );
    }
  }
  assertMergeCompatible(groups);

  const memberships = new Map<string, CurrentMembership>();
  for (const id of resolved) {
    for (const row of await currentMemberships(tx, [id])) memberships.set(row.postId, row);
  }
  // Every membership this merge would move must be the exact record the guard
  // verified. A gap is refused, never assumed compatible: the guard's answer has
  // to cover exactly what the decision writes.
  assertMergeEvidenceComplete(
    groups.flatMap((group) => group.members),
    [...memberships.values()],
  );
  // The reviewer's explicit choice wins: `topicIds[0]` is the surviving topic
  // and every other id redirects into it. A heuristic (move into the larger
  // topic) would silently overrule the person who is looking at the evidence,
  // and the panel's copy asks "merge into" — so the request order *is* the
  // answer. `topicIds` keeps the submitted order; resolution only drops
  // duplicates that already point at the same topic.
  const chosen = resolved[0]!;
  const sources = resolved.filter((id) => id !== chosen);
  if (sources.length === 0) fail("invalid_review", "A merge needs two different topics");

  const reviewId = `review:${randomUUID().replace(/-/g, "")}`;
  await insertDecision(tx, {
    id: reviewId,
    operation: "merge",
    topicIds: resolved,
    // The audit lists the records that actually move: what a reader needs to
    // check the correction. The guard above covered every cross pair.
    recordIds: sources.flatMap((id) =>
      [...memberships.values()].filter((row) => row.topicId === id).map((row) => row.postId),
    ),
    targetId: chosen,
    note: request.note,
  });

  const prior: PriorMembership[] = [];
  for (const row of memberships.values()) {
    prior.push({ ...row });
    // Every record of every involved topic, target included, becomes this
    // decision's lock: a target row left unlocked could be regrouped away by
    // the next refresh, and undo restores the exact before-image either way.
    await writeLockedMembership(tx, row.postId, chosen, row.contentHash, reviewId);
  }

  const catalogPrior: PriorCatalog[] = [];
  for (const source of sources) {
    const row = (await catalogRow(tx, source))!;
    catalogPrior.push({
      id: source,
      existed: true,
      mergedInto: row.merged_into,
      label: row.label,
      wrote: chosen,
    });
    await tx`UPDATE topic_catalog SET merged_into = ${chosen}, last_seen_at = now()
             WHERE id = ${source}`;
  }

  await savePriorState(tx, reviewId, { memberships: prior, catalog: catalogPrior });
  return { decision: await readDecision(tx, reviewId), topicId: chosen };
}

async function splitTopic(tx: SQL, request: TopicReviewInput): Promise<TopicReviewResult> {
  const sourceId = await resolveTopicId(tx, request.topicIds[0]!);
  if (!sourceId) fail("not_found", "That topic no longer exists. Reload the topic and try again.");
  if (!(await catalogRow(tx, sourceId))) {
    fail("not_found", "That topic no longer exists. Reload the topic and try again.");
  }

  const subsetIds = [...new Set(request.recordIds)];
  // Idempotency comes first: the same split re-sent (a double click, a retried
  // request, two reviewers) is one decision, and saying so is more useful than
  // reporting that its records have moved.
  const manualId = manualTopicId(sourceId, subsetIds);
  const existingManual = await catalogRow(tx, manualId);
  if (existingManual && existingManual.merged_into === null) {
    fail(
      "conflicting_review",
      "This exact split is already applied. Reload the topic to see the current grouping.",
    );
  }

  const memberships = await currentMemberships(tx, [sourceId]);
  if (memberships.length < 2) {
    fail("not_found", "This topic has too few current records to split. Reload and try again.");
  }
  const memberIds = new Set(memberships.map((row) => row.postId));
  const missing = subsetIds.filter((id) => !memberIds.has(id));
  if (missing.length > 0) {
    fail(
      "not_found",
      missing.length === 1
        ? "One selected record is no longer part of this topic. Reload the records and try again."
        : `${missing.length} selected records are no longer part of this topic. Reload the records and try again.`,
    );
  }
  if (subsetIds.length >= memberships.length) {
    fail(
      "invalid_review",
      "A split keeps at least one record in the original topic. Select fewer records.",
    );
  }

  // Splitting changes a known membership, not a vector. Read the original
  // source text directly so pending embeddings never substitute a review note
  // or a generic placeholder for the new topic's identity.
  const originals = (await tx`
    SELECT title, body AS text FROM posts WHERE id = ANY(${subsetIds}::text[]) ORDER BY id
  `) as unknown as Array<{ title: string; text: string }>;
  const label = labelForPartition(originals);

  const reviewId = `review:${randomUUID().replace(/-/g, "")}`;
  const recordIds = [...subsetIds].sort();
  await insertDecision(tx, {
    id: reviewId,
    operation: "split",
    topicIds: [sourceId],
    recordIds,
    targetId: manualId,
    note: request.note,
  });

  const prior = memberships.map((row) => ({ ...row }));
  if (existingManual) {
    await tx`UPDATE topic_catalog SET merged_into = NULL, label = ${label}, last_seen_at = now()
             WHERE id = ${manualId}`;
  } else {
    await tx`
      INSERT INTO topic_catalog (id, label, created_at, last_seen_at, merged_into)
      VALUES (${manualId}, ${label}, now(), now(), NULL)
    `;
  }
  const split = new Set(recordIds);
  // Both partitions are locked: the complement must not rejoin the new topic on
  // the next automatic pass, and the new topic must not accept unrelated
  // records for being close to its members.
  for (const row of memberships) {
    const destination = split.has(row.postId) ? manualId : sourceId;
    await writeLockedMembership(tx, row.postId, destination, row.contentHash, reviewId);
  }

  await savePriorState(tx, reviewId, {
    memberships: prior,
    catalog: [
      {
        id: manualId,
        existed: Boolean(existingManual),
        mergedInto: existingManual?.merged_into ?? null,
        label: existingManual?.label ?? null,
        wrote: null,
      },
    ],
  });
  return { decision: await readDecision(tx, reviewId), topicId: manualId };
}

/** Write a locked membership row, keeping the record's current evidence hash. */
async function writeLockedMembership(
  tx: SQL,
  postId: string,
  topicId: string,
  contentHash: string,
  reviewId: string,
) {
  await tx`
    INSERT INTO topic_memberships (post_id, topic_id, content_hash, locked, review_id, assigned_at)
    VALUES (${postId}, ${topicId}, ${contentHash}, true, ${reviewId}, now())
    ON CONFLICT (post_id) DO UPDATE SET
      topic_id = EXCLUDED.topic_id,
      content_hash = EXCLUDED.content_hash,
      locked = true,
      review_id = EXCLUDED.review_id,
      assigned_at = now()
    WHERE topic_memberships.topic_id IS DISTINCT FROM EXCLUDED.topic_id
       OR topic_memberships.locked IS DISTINCT FROM true
       OR topic_memberships.review_id IS DISTINCT FROM EXCLUDED.review_id
       OR topic_memberships.content_hash IS DISTINCT FROM EXCLUDED.content_hash
  `;
}

async function insertDecision(
  tx: SQL,
  input: {
    id: string;
    topicIds: string[];
    recordIds: string[];
    targetId: string;
  } & TopicReviewInput,
) {
  await tx`
    INSERT INTO topic_review_decisions
      (id, operation, topic_ids, record_ids, target_id, note, created_at, active)
    VALUES (
      ${input.id}, ${input.operation}, ${input.topicIds}::text[], ${input.recordIds}::text[],
      ${input.targetId}, ${input.note}, now(), true
    )
  `;
}

async function savePriorState(tx: SQL, reviewId: string, prior: PriorState) {
  await tx`
    UPDATE topic_review_decisions SET prior_state = ${JSON.stringify(prior)}::text::jsonb
    WHERE id = ${reviewId}
  `;
}

async function readDecision(tx: SQL, id: string) {
  const [row] = (await tx`
    SELECT id, operation, topic_ids, record_ids, target_id, note, created_at, active
    FROM topic_review_decisions WHERE id = ${id}
  `) as unknown as DecisionRow[];
  if (!row) throw new Error(`Review decision ${id} disappeared after it was written`);
  return toDecision(row);
}

/* ------------------------------------------------------------------ *
 * Undo.
 * ------------------------------------------------------------------ */

/**
 * Undo one decision by restoring exactly the rows it wrote.
 *
 * The dependency guard is the safety property: if any membership this decision
 * wrote has since been claimed by a different review, or a redirect it wrote
 * has moved again, a later decision depends on this one. Undoing it then would
 * silently clobber that work, so the request is answered with 409 and nothing
 * is written; the reviewer undoes the newer decision first.
 *
 * A manual catalog row created by a split is never deleted: snapshots,
 * memberships or watch rules may already reference it, and a delete would break
 * them (or cascade). It is redirected to the source instead, which keeps every
 * reference resolvable and keeps automatic grouping from re-adopting the split.
 */
export async function undoTopicReview(id: string): Promise<void> {
  const reviewId = (id ?? "").trim();
  if (!reviewId) fail("invalid_review", "Review ID is required");
  const db = await getDb();
  await db.begin(async (tx) => {
    await acquireReviewLocks(tx);
    const [row] = (await tx`
      SELECT id, operation, topic_ids, record_ids, target_id, note, created_at, active, prior_state
      FROM topic_review_decisions
      WHERE id = ${reviewId}
      FOR UPDATE
    `) as unknown as Array<DecisionRow & { prior_state: unknown }>;
    if (!row) fail("not_found", "That review decision no longer exists.");
    if (!row.active) fail("conflicting_review", "That review was already undone.");

    const prior = readPriorState(row.prior_state);
    const memberships = prior.memberships;
    if (memberships.length === 0 || prior.catalog.length === 0) {
      fail(
        "conflicting_review",
        "This decision has no stored before-state, so it cannot be undone safely.",
      );
    }

    // Revalidate the exact assignment and source revision this decision wrote.
    // A later automatic reassignment or edited source is not safe to overwrite.
    const postIds = memberships.map((entry) => entry.postId);
    const current = (await tx`
      SELECT p.id AS post_id, p.content_hash AS current_hash, p.deleted_at,
             m.topic_id, m.content_hash, m.locked, m.review_id
      FROM posts p LEFT JOIN topic_memberships m ON m.post_id = p.id
      WHERE p.id = ANY(${postIds}::text[]) FOR UPDATE OF p
    `) as unknown as Array<{
      post_id: string;
      current_hash: string;
      deleted_at: Date | null;
      topic_id: string | null;
      content_hash: string | null;
      locked: boolean | null;
      review_id: string | null;
    }>;
    const priorById = new Map(memberships.map((entry) => [entry.postId, entry]));
    const selected = new Set(row.record_ids);
    for (const entry of current) {
      if (entry.deleted_at !== null) continue;
      const before = priorById.get(entry.post_id)!;
      const expectedTopic =
        row.operation === "merge" || selected.has(entry.post_id) ? row.target_id : row.topic_ids[0];
      if (
        entry.review_id !== reviewId ||
        !entry.locked ||
        entry.topic_id !== expectedTopic ||
        entry.content_hash !== before.contentHash ||
        entry.current_hash !== before.contentHash
      ) {
        fail(
          "conflicting_review",
          "These records changed after this review. Undo newer reviews first, or reload the current source evidence.",
        );
      }
    }

    // Guard: every redirect this decision wrote must still point where it put it.
    for (const entry of prior.catalog) {
      const [current] = (await tx`
        SELECT merged_into FROM topic_catalog WHERE id = ${entry.id} FOR UPDATE
      `) as unknown as Array<{ merged_into: string | null }>;
      if (!current) {
        if (entry.existed) {
          fail("conflicting_review", "A topic this review changed no longer exists.");
        }
        continue;
      }
      const actual = current.merged_into === null ? null : String(current.merged_into);
      if (actual !== entry.wrote) {
        fail(
          "conflicting_review",
          "A later review changed where this topic points. Undo the newer review first.",
        );
      }
    }

    for (const entry of memberships) {
      await tx`
        UPDATE topic_memberships
        SET topic_id = ${entry.topicId}, content_hash = ${entry.contentHash},
            locked = ${entry.locked}, review_id = ${entry.reviewId}, assigned_at = now()
        WHERE post_id = ${entry.postId}
      `;
    }

    for (const entry of prior.catalog) {
      if (!entry.existed) {
        // Keep the row and redirect it, so references stay resolvable and the
        // split cannot be silently re-adopted by automatic grouping.
        const source = row.operation === "split" ? row.topic_ids[0] : row.target_id;
        await tx`
          UPDATE topic_catalog SET merged_into = ${String(source)} WHERE id = ${entry.id}
        `;
        continue;
      }
      await tx`
        UPDATE topic_catalog SET merged_into = ${entry.mergedInto}, label = ${entry.label}
        WHERE id = ${entry.id}
      `;
    }

    await tx`UPDATE topic_review_decisions SET active = false WHERE id = ${reviewId}`;
  });
}

/** Before-images are required; missing/corrupt state cannot be safely invented. */
function readPriorState(value: unknown): PriorState {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  if (!source || !Array.isArray(source.memberships) || !Array.isArray(source.catalog)) {
    fail(
      "conflicting_review",
      "This review has no complete before-state and cannot be undone safely.",
    );
  }
  const memberships = source.memberships.map((item: unknown): PriorMembership => {
    const entry =
      item && typeof item === "object" && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : null;
    if (
      !entry ||
      typeof entry.postId !== "string" ||
      typeof entry.topicId !== "string" ||
      typeof entry.contentHash !== "string" ||
      typeof entry.locked !== "boolean" ||
      (entry.reviewId !== null && typeof entry.reviewId !== "string")
    ) {
      fail(
        "conflicting_review",
        "This review has incomplete membership before-state and cannot be undone safely.",
      );
    }
    return {
      postId: entry.postId,
      topicId: entry.topicId,
      contentHash: entry.contentHash,
      locked: entry.locked,
      reviewId: entry.reviewId,
    };
  });
  const catalog = source.catalog.map((item: unknown): PriorCatalog => {
    const entry =
      item && typeof item === "object" && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : null;
    if (
      !entry ||
      typeof entry.id !== "string" ||
      typeof entry.existed !== "boolean" ||
      (entry.mergedInto !== null && typeof entry.mergedInto !== "string") ||
      (entry.label !== null && typeof entry.label !== "string") ||
      (entry.wrote !== null && typeof entry.wrote !== "string") ||
      (entry.existed && entry.label === null)
    ) {
      fail(
        "conflicting_review",
        "This review has incomplete catalog before-state and cannot be undone safely.",
      );
    }
    return {
      id: entry.id,
      existed: entry.existed,
      mergedInto: entry.mergedInto,
      label: entry.label,
      wrote: entry.wrote,
    };
  });
  return { memberships, catalog };
}
