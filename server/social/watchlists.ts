import { createHash, randomUUID } from "node:crypto";
import type { SQL } from "bun";
import {
  EVIDENCE_DISCOVERY_LAG_HOURS,
  type TopicAlert,
  type WatchRule,
  type WatchRuleInput,
  type WatchlistState,
} from "../../shared/intelligence.ts";
import type { TrendMap, TrendMapNode } from "../../shared/types.ts";
import { ApiFailure } from "../api-error.ts";
import { getDb } from "../db.ts";

/**
 * Persistent single-user watch rules and in-app alerts.
 *
 * Alert semantics live here because they are the whole product:
 *
 * - A rule is created with a baseline at `now()`. Nothing collected before the
 *   rule existed can alert, which is what keeps the first corpus (thousands of
 *   already-imported records) from firing every watch on creation.
 * - Support is *independent identities*, never raw records: distinct community
 *   author IDs are accounts, distinct `publisher` values are publishers, and
 *   distinct providers (`posts.source`) are sources. Five posts by one account
 *   are one new account, and a publisher is never counted as a community
 *   account.
 * - Support is *new* only when the identity's earliest appearance in that topic
 *   is newer than the rule's watermark. An account that already supported the
 *   topic before the last check is not new merely because it posted again.
 * - Freshness: a credited record's source time must fall inside
 *   `SUPPORT_FRESHNESS_HOURS`, and must not predate our first sighting by more
 *   than `DISCOVERY_LAG_HOURS`. Imported archives and an old article
 *   rediscovered late therefore never manufacture an alert.
 * - Community source times are *thread activity*, not publication. A bump on an
 *   already-collected thread keeps its original `first_collected_at` and is
 *   never new support, so forum times are never presented as verified
 *   publication or virality.
 * - Bootstrap guard: a rule row written before baseline metadata existed has no
 *   watermark. It starts from `topic_intelligence_state.started_at` instead of
 *   its own creation time, so pre-upgrade collection is baseline evidence rather
 *   than a spike. Rules written by this code are already anchored after it.
 * - A reviewed merge only records a redirect, so an evaluation credits members
 *   of every catalog id that resolves to the node it displays — never the
 *   source topic's older identities, because their `first_collected_at` still
 *   precedes the watermark.
 * - Sub-threshold support accumulates per rule and topic in `baseline`, so a
 *   "three new publishers" watch fires on the third one instead of forgetting
 *   the first two between five-minute polls. A fired alert clears that
 *   accumulator, so the same identities can never alert twice.
 * - Evaluation serialises per rule with `SELECT ... FOR UPDATE`, and every alert
 *   carries a UNIQUE fingerprint of rule + topic + credited identities. A
 *   concurrent or retried evaluation inserts nothing and loses no state.
 * - Pausing then re-enabling a watch, or pointing it at a different target,
 *   deliberately re-baselines instead of replaying everything it missed.
 */

export const MAX_RULES = 100;
export const MAX_ALERTS = 200;
/** Also the ceiling for every threshold, so an accumulator can always satisfy one. */
const MAX_THRESHOLD = 100;

const SUPPORT_FRESHNESS_HOURS = 48;
const MAX_ACCUMULATED_ACCOUNTS = 250;
const MAX_ACCUMULATED_PUBLISHERS = 150;
const MAX_ACCUMULATED_SOURCES = MAX_THRESHOLD;
/** Three bounded projection windows can expose at most 4,500 distinct topics. */
const MAX_TRACKED_TOPICS = 4_500;

/* --- *
 * Input validation. Routes pass untrusted JSON; this module owns the contract.
 * --- */

function requireText(value: unknown, field: string, maxLength: number) {
  if (typeof value !== "string") {
    throw new ApiFailure(400, `${field} must be text`, "invalid_watch");
  }
  const trimmed = value.trim();
  if (!trimmed) throw new ApiFailure(400, `${field} is required`, "invalid_watch");
  if (trimmed.length > maxLength) {
    throw new ApiFailure(400, `${field} is too long`, "invalid_watch");
  }
  return trimmed;
}

function optionalThreshold(value: unknown, field: string) {
  if (value === undefined || value === null) return undefined;
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value.trim())
        : Number.NaN;
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > MAX_THRESHOLD) {
    throw new ApiFailure(
      400,
      `${field} must be a whole number between 0 and ${MAX_THRESHOLD}`,
      "invalid_watch",
    );
  }
  return parsed;
}

function optionalEnabled(value: unknown) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean") {
    throw new ApiFailure(400, "Enabled must be true or false", "invalid_watch");
  }
  return value;
}

function optionalKind(value: unknown): "topic" | "entity" | undefined {
  if (value === undefined || value === null) return undefined;
  if (value !== "topic" && value !== "entity") {
    throw new ApiFailure(400, "Watch a topic or an entity", "invalid_watch");
  }
  return value;
}

/** An alert needs a growth dimension and a potential floor; all-zero growth is a no-op. */
function assertThresholds(rule: WatchRuleInput) {
  if (rule.minNewAccounts <= 0 && rule.minNewPublishers <= 0 && rule.minNewSources <= 0) {
    throw new ApiFailure(
      400,
      "Set at least one growth threshold above zero: new accounts, publishers, or sources",
      "invalid_watch",
    );
  }
}

function asRecord(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ApiFailure(400, "Watch details must be an object", "invalid_watch");
  }
  return input as Record<string, unknown>;
}

/** Full rule input for creation. Growth thresholds default to zero; one must be positive. */
function parseWatchRuleInput(input: unknown): WatchRuleInput {
  const body = asRecord(input);
  const kind = optionalKind(body.kind);
  if (!kind) throw new ApiFailure(400, "Choose what to watch", "invalid_watch");
  const rule: WatchRuleInput = {
    kind,
    targetId: requireText(body.targetId, "Watch target", 300),
    label: requireText(body.label, "Watch label", 300),
    enabled: optionalEnabled(body.enabled) ?? true,
    minNewAccounts: optionalThreshold(body.minNewAccounts, "New accounts") ?? 0,
    minNewPublishers: optionalThreshold(body.minNewPublishers, "New publishers") ?? 0,
    minNewSources: optionalThreshold(body.minNewSources, "New sources") ?? 0,
    minPotential: optionalThreshold(body.minPotential, "Minimum potential") ?? 0,
  };
  assertThresholds(rule);
  return rule;
}

/**
 * Partial update: absent fields keep their stored value, so a toggle only sends
 * `{enabled}`. The merged result must still satisfy the creation contract.
 */
function parseWatchRulePatch(input: unknown, existing: WatchRuleInput): WatchRuleInput {
  const body = asRecord(input);
  const rule: WatchRuleInput = {
    kind: optionalKind(body.kind) ?? existing.kind,
    targetId:
      body.targetId === undefined
        ? existing.targetId
        : requireText(body.targetId, "Watch target", 300),
    label: body.label === undefined ? existing.label : requireText(body.label, "Watch label", 300),
    enabled: optionalEnabled(body.enabled) ?? existing.enabled,
    minNewAccounts:
      optionalThreshold(body.minNewAccounts, "New accounts") ?? existing.minNewAccounts,
    minNewPublishers:
      optionalThreshold(body.minNewPublishers, "New publishers") ?? existing.minNewPublishers,
    minNewSources: optionalThreshold(body.minNewSources, "New sources") ?? existing.minNewSources,
    minPotential:
      optionalThreshold(body.minPotential, "Minimum potential") ?? existing.minPotential,
  };
  assertThresholds(rule);
  return rule;
}

/* --- *
 * Stored shapes. Column names stay snake_case exactly as the schema table
 * declares them; everything leaving this module is the camelCase wire type.
 * --- */

interface RuleRow {
  id: string;
  kind: "topic" | "entity";
  target_id: string;
  label: string;
  enabled: boolean;
  min_new_accounts: number;
  min_new_publishers: number;
  min_new_sources: number;
  min_potential: number;
  created_at: Date | string;
  evaluated_at: Date | string | null;
  baseline: unknown;
}

/** HTTP list reads never fetch/parse the private support accumulator JSON. */
type PublicRuleRow = Omit<RuleRow, "baseline">;

interface AlertRow {
  id: string;
  watch_id: string;
  watch_label: string;
  topic_id: string;
  topic_label: string;
  created_at: Date | string;
  read_at: Date | string | null;
  new_accounts: number;
  new_publishers: number;
  new_sources: string[] | null;
  potential: number;
  reasons: unknown;
}

/** New identities credited toward one rule/topic while below threshold. */
interface SupportAccumulator {
  accounts: string[];
  publishers: string[];
  sources: string[];
  /** When the pending support was last observed; only for pruning. */
  lastAt: string;
}

interface RuleBaseline {
  watermark: string;
  mark: "created" | "reenabled" | "retargeted" | "legacy";
  topics: Record<string, SupportAccumulator>;
}

/** jsonb arrives parsed from Bun.SQL, but an older text row may not. */
function asJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function iso(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function ruleFromRow(row: PublicRuleRow): WatchRule {
  return {
    id: String(row.id),
    kind: row.kind,
    targetId: String(row.target_id),
    label: String(row.label),
    enabled: Boolean(row.enabled),
    minNewAccounts: Number(row.min_new_accounts),
    minNewPublishers: Number(row.min_new_publishers),
    minNewSources: Number(row.min_new_sources),
    minPotential: Number(row.min_potential),
    createdAt: new Date(row.created_at).toISOString(),
    evaluatedAt: iso(row.evaluated_at),
  };
}

function alertFromRow(row: AlertRow): TopicAlert {
  const reasons = asJson(row.reasons);
  return {
    id: String(row.id),
    watchId: String(row.watch_id),
    watchLabel: String(row.watch_label ?? ""),
    topicId: String(row.topic_id),
    topicLabel: String(row.topic_label),
    createdAt: new Date(row.created_at).toISOString(),
    readAt: iso(row.read_at),
    newAccounts: Number(row.new_accounts),
    newPublishers: Number(row.new_publishers),
    newSources: (row.new_sources ?? []).map(String),
    potential: Number(row.potential),
    reasons: Array.isArray(reasons) ? reasons.map(String) : [],
  };
}

/** Follow `merged_into` chains so a reviewed merge never orphans a watch. */
function redirectTable(rows: Array<{ id: string; merged_into: string | null }>) {
  const redirects = new Map<string, string>();
  for (const row of rows) {
    if (row.merged_into && row.merged_into !== row.id) {
      redirects.set(String(row.id), String(row.merged_into));
    }
  }
  return redirects;
}

function resolveTopic(id: string, redirects: ReadonlyMap<string, string>) {
  let current = id;
  const seen = new Set<string>();
  while (!seen.has(current)) {
    // A cycle returns the original target instead of hanging evaluation.
    seen.add(current);
    const next = redirects.get(current);
    if (!next) return current;
    current = next;
  }
  return id;
}

/**
 * A reviewed merge keeps the source topic's memberships and only records a
 * redirect. A watch on the surviving topic must still see that evidence, so an
 * evaluation queries every catalog id that resolves to the node it displays.
 */
function familyOf(id: string, redirects: ReadonlyMap<string, string>) {
  const family = [id];
  for (const source of redirects.keys()) {
    if (source !== id && resolveTopic(source, redirects) === id) family.push(source);
  }
  return family;
}

/**
 * A merged topic keeps its alert rows — undo must restore them — so the merge is
 * projected at read time only: an alert whose topic was merged resolves to the
 * topic that now holds the evidence, which is also where "open topic" lands.
 * Nothing is rewritten, so undoing the merge restores the original display.
 */
async function mergedTopicTargets(db: SQL, ids: string[]) {
  const targets = new Map<string, { id: string; label: string }>();
  if (ids.length === 0) return targets;
  const rows = (await db`
    SELECT id, merged_into FROM topic_catalog WHERE merged_into IS NOT NULL
  `) as unknown as Array<{ id: string; merged_into: string | null }>;
  const redirects = redirectTable(rows);
  const current = new Map<string, string>();
  for (const id of ids) {
    const target = resolveTopic(id, redirects);
    if (target !== id) current.set(id, target);
  }
  if (current.size === 0) return targets;
  // One read for every surviving topic the merged alerts resolve to.
  const survivors = [...new Set(current.values())];
  const labelRows = (await db`
    SELECT id, label FROM topic_catalog WHERE id = ANY(${survivors}::text[])
  `) as unknown as Array<{ id: string; label: string }>;
  const labels = new Map(labelRows.map((row) => [String(row.id), String(row.label)]));
  for (const [id, target] of current) {
    const label = labels.get(target);
    if (label) targets.set(id, { id: target, label });
  }
  return targets;
}

/** Resolve a keyset anchor in PostgreSQL, preserving sub-millisecond timestamps. */
async function readAlertCursor(db: SQL, value: string | undefined) {
  if (value === undefined) return null;
  if (!value || value.length > 200 || /[\u0000-\u0020]/u.test(value)) {
    throw new ApiFailure(400, "Choose a valid notification history page", "invalid_cursor");
  }
  const rows = (await db`
    SELECT id, created_at::text AS at FROM watch_alerts WHERE id = ${value}
  `) as unknown as Array<{ id: string; at: string }>;
  if (!rows[0]) {
    throw new ApiFailure(
      400,
      "This history page no longer exists. Return to the latest notifications.",
      "invalid_cursor",
    );
  }
  return rows[0];
}

/** Newest-first keyset pages; all unread notifications remain counted globally. */
export async function getWatchlists(before?: string): Promise<WatchlistState> {
  const db = await getDb();
  const cursor = await readAlertCursor(db, before);
  const [ruleRows, alertRows, unreadRows] = await Promise.all([
    db`
      SELECT id, kind, target_id, label, enabled, min_new_accounts, min_new_publishers,
             min_new_sources, min_potential, created_at, evaluated_at
      FROM watch_rules
      ORDER BY created_at DESC, id
      LIMIT ${MAX_RULES}
    `,
    db`
      SELECT a.id, a.watch_id, w.label AS watch_label, a.topic_id, a.topic_label,
             a.created_at, a.read_at, a.new_accounts, a.new_publishers, a.new_sources,
             a.potential, a.reasons
      FROM watch_alerts a
      JOIN watch_rules w ON w.id = a.watch_id
      WHERE (${cursor?.at ?? null}::timestamptz IS NULL
        OR (a.created_at, a.id) < (${cursor?.at ?? null}::timestamptz, ${cursor?.id ?? null}::text))
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT ${MAX_ALERTS + 1}
    `,
    db`SELECT count(*)::int AS unread FROM watch_alerts WHERE read_at IS NULL`,
  ]);

  const rules = (ruleRows as unknown as PublicRuleRow[]).map(ruleFromRow);
  const pageRows = alertRows as unknown as AlertRow[];
  const hasMore = pageRows.length > MAX_ALERTS;
  const alerts = pageRows.slice(0, MAX_ALERTS).map(alertFromRow);
  const merged = await mergedTopicTargets(db, [...new Set(alerts.map((alert) => alert.topicId))]);
  for (const alert of alerts) {
    const target = merged.get(alert.topicId);
    if (!target) continue;
    alert.topicId = target.id;
    alert.topicLabel = target.label;
  }
  const unread = Number((unreadRows as unknown as Array<{ unread: number }>)[0]?.unread ?? 0);
  const last = alerts.at(-1);
  const alertsNextCursor = hasMore && last ? last.id : null;
  return { rules, alerts, unread, alertsNextCursor };
}

/** Anchored at creation so existing corpus support can never alert retroactively. */
function freshBaseline(mark: RuleBaseline["mark"], at: Date): RuleBaseline {
  return { watermark: at.toISOString(), mark, topics: {} };
}

/** Serialize creation so concurrent requests cannot exceed the 100-rule bound. */
export async function createWatchRule(input: unknown): Promise<WatchRule> {
  const rule = parseWatchRuleInput(input);
  const db = await getDb();
  return db.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(${0x54524446}::int, 4)`;
    const [countRow] =
      (await tx`SELECT count(*)::int AS rules FROM watch_rules`) as unknown as Array<{
        rules: number;
      }>;
    if (Number(countRow?.rules ?? 0) >= MAX_RULES) {
      throw new ApiFailure(
        409,
        `Keep at most ${MAX_RULES} watches; delete one before adding another`,
        "rules_limit",
      );
    }
    const created = new Date();
    const rows = (await tx`
      INSERT INTO watch_rules (id, kind, target_id, label, enabled, min_new_accounts,
                               min_new_publishers, min_new_sources, min_potential,
                               created_at, evaluated_at, baseline)
      VALUES (${`watch:${randomUUID()}`}, ${rule.kind}, ${rule.targetId}, ${rule.label},
              ${rule.enabled}, ${rule.minNewAccounts}, ${rule.minNewPublishers},
              ${rule.minNewSources}, ${rule.minPotential}, ${created}, ${created},
              ${JSON.stringify(freshBaseline("created", created))}::text::jsonb)
      RETURNING id, kind, target_id, label, enabled, min_new_accounts, min_new_publishers,
                min_new_sources, min_potential, created_at, evaluated_at, baseline
    `) as unknown as RuleRow[];
    const row = rows[0];
    if (!row) throw new ApiFailure(409, "That watch could not be created; try again", "conflict");
    return ruleFromRow(row);
  });
}

export async function updateWatchRule(id: string, input: unknown): Promise<WatchRule> {
  const db = await getDb();
  const changes = asRecord(input);

  return db.begin(async (tx) => {
    const [existing] = (await tx`
      SELECT * FROM watch_rules WHERE id = ${id} FOR UPDATE
    `) as unknown as RuleRow[];
    if (!existing) throw new ApiFailure(404, "That watch no longer exists", "not_found");

    const current: WatchRuleInput = {
      kind: existing.kind,
      targetId: String(existing.target_id),
      label: String(existing.label),
      enabled: Boolean(existing.enabled),
      minNewAccounts: Number(existing.min_new_accounts),
      minNewPublishers: Number(existing.min_new_publishers),
      minNewSources: Number(existing.min_new_sources),
      minPotential: Number(existing.min_potential),
    };
    const next = parseWatchRulePatch(changes, current);
    const now = new Date();
    const retargeted = next.kind !== current.kind || next.targetId !== current.targetId;
    const reenabled = !current.enabled && next.enabled;
    // A retargeted watch is a different subject, and a resumed watch must not
    // replay the support it missed while paused. Both re-baseline.
    const resets = retargeted || reenabled;
    const baseline = resets
      ? freshBaseline(retargeted ? "retargeted" : "reenabled", now)
      : readBaseline(existing.baseline, [existing.evaluated_at, existing.created_at]);

    const rows = (await tx`
      UPDATE watch_rules SET
        kind = ${next.kind}, target_id = ${next.targetId}, label = ${next.label},
        enabled = ${next.enabled}, min_new_accounts = ${next.minNewAccounts},
        min_new_publishers = ${next.minNewPublishers}, min_new_sources = ${next.minNewSources},
        min_potential = ${next.minPotential},
        evaluated_at = ${resets ? now : existing.evaluated_at},
        baseline = ${JSON.stringify(baseline)}::text::jsonb
      WHERE id = ${id}
      RETURNING id, kind, target_id, label, enabled, min_new_accounts, min_new_publishers,
                min_new_sources, min_potential, created_at, evaluated_at, baseline
    `) as unknown as RuleRow[];
    if (!rows[0]) throw new ApiFailure(404, "That watch no longer exists", "not_found");
    return ruleFromRow(rows[0]);
  });
}

export async function deleteWatchRule(id: string): Promise<void> {
  const db = await getDb();
  const rows = (await db`
    DELETE FROM watch_rules WHERE id = ${id} RETURNING id
  `) as unknown as Array<{ id: string }>;
  if (rows.length === 0) throw new ApiFailure(404, "That watch no longer exists", "not_found");
}

export async function markAlertRead(id: string): Promise<void> {
  const db = await getDb();
  const rows = (await db`
    UPDATE watch_alerts SET read_at = coalesce(read_at, now())
    WHERE id = ${id} RETURNING id
  `) as unknown as Array<{ id: string }>;
  if (rows.length === 0)
    throw new ApiFailure(404, "That notification no longer exists", "not_found");
}

/* --- *
 * Evaluation
 * --- */

function readBaseline(raw: unknown, fallbacks: Array<Date | string | null>): RuleBaseline {
  const value = asJson(raw);
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  const topics: Record<string, SupportAccumulator> = {};
  const storedTopics =
    record?.topics && typeof record.topics === "object"
      ? (record.topics as Record<string, unknown>)
      : {};
  for (const [key, entry] of Object.entries(storedTopics)) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    const strings = (input: unknown) =>
      Array.isArray(input) ? input.filter((text): text is string => typeof text === "string") : [];
    const lastAt = iso(typeof item.lastAt === "string" ? item.lastAt : null);
    if (!lastAt) continue;
    topics[key] = {
      accounts: strings(item.accounts).sort(),
      publishers: strings(item.publishers).sort(),
      sources: strings(item.sources).sort(),
      lastAt,
    };
  }
  // Rows written before the jsonb baseline existed fall back to their own times,
  // which are still later than the corpus they must not alert on.
  const fallback =
    fallbacks
      .map((entry) => iso(entry))
      .filter((entry): entry is string => entry !== null)
      .sort()
      .at(-1) ?? new Date(0).toISOString();
  const watermark = iso(typeof record?.watermark === "string" ? record.watermark : null);
  return {
    watermark: watermark ?? fallback,
    mark: typeof record?.mark === "string" ? (record.mark as RuleBaseline["mark"]) : "legacy",
    topics,
  };
}

/**
 * Catalog-backed candidates only. Before the first materialization a node still
 * carries a provisional seed id with no memberships, so its support is unknown
 * rather than zero.
 */
async function knownTopics(
  tx: SQL,
  candidates: readonly TopicCandidate[],
): Promise<TopicCandidate[]> {
  if (candidates.length === 0) return [];
  const ids = candidates.map((candidate) => candidate.node.id);
  const rows = (await tx`
    SELECT id FROM topic_catalog WHERE id = ANY(${ids}::text[])
  `) as unknown as Array<{ id: string }>;
  const known = new Set(rows.map((row) => String(row.id)));
  return candidates.filter((candidate) => known.has(candidate.node.id));
}

interface TopicCandidate {
  node: TrendMapNode;
  hours: number;
}

/** Longest window wins: it holds the most evidence for the same topic. */
function indexNodes(maps: readonly TrendMap[]) {
  const byId = new Map<string, TopicCandidate>();
  for (const map of [...maps].sort((a, b) => b.hours - a.hours)) {
    for (const node of map.nodes) {
      if (!byId.has(node.id)) byId.set(node.id, { node, hours: map.hours });
    }
  }
  return byId;
}

function matchedTopics(
  rule: RuleRow,
  nodes: ReadonlyMap<string, TopicCandidate>,
  redirects: ReadonlyMap<string, string>,
): TopicCandidate[] {
  if (rule.kind === "topic") {
    const target = String(rule.target_id);
    const candidate = nodes.get(resolveTopic(target, redirects)) ?? nodes.get(target);
    return candidate ? [candidate] : [];
  }
  const entityId = String(rule.target_id);
  const matched: TopicCandidate[] = [];
  for (const candidate of nodes.values()) {
    if (candidate.node.entityIds.includes(entityId)) matched.push(candidate);
  }
  return matched.sort(
    (a, b) => b.node.potential - a.node.potential || a.node.id.localeCompare(b.node.id),
  );
}

interface IdentityRow {
  topic_id: string;
  identity: string;
  first_seen: Date | string;
  latest_published: Date | string | null;
}

interface ProviderRow {
  topic_id: string;
  provider: string;
  first_seen: Date | string;
  latest_published: Date | string | null;
}

interface SupportBatch {
  accounts: Map<string, Set<string>>;
  publishers: Map<string, Set<string>>;
  sources: Map<string, Set<string>>;
}

/**
 * One batched read for every topic the rule matches. The watermark and the
 * freshness floor are SQL predicates, so identities credited by an earlier
 * alert and identities older than the credit window never come back at all.
 * Grouping happens in SQL; there is no query per topic.
 */
async function loadNewSupport(
  tx: SQL,
  topicIds: string[],
  watermark: Date,
  freshnessFloor: Date,
  redirects: ReadonlyMap<string, string>,
): Promise<SupportBatch> {
  const batch: SupportBatch = { accounts: new Map(), publishers: new Map(), sources: new Map() };
  if (topicIds.length === 0) return batch;
  const nowMs = Date.now();

  const add = (map: Map<string, Set<string>>, topicId: string, value: string) => {
    let set = map.get(topicId);
    if (!set) {
      set = new Set();
      map.set(topicId, set);
    }
    set.add(value);
  };
  const credit = (firstSeen: Date | string, latestPublished: Date | string | null) => {
    const seen = new Date(firstSeen);
    const published = latestPublished === null ? null : new Date(latestPublished);
    if (Number.isNaN(seen.getTime()) || !published || Number.isNaN(published.getTime()))
      return false;
    // Recent in absolute terms, and not published long before we ever saw it: an
    // identity only counts if one of its records in this topic is genuinely recent.
    return (
      published.getTime() >= freshnessFloor.getTime() &&
      published.getTime() <= nowMs &&
      published.getTime() >= seen.getTime() - EVIDENCE_DISCOVERY_LAG_HOURS * 3_600_000
    );
  };

  const identityRows = (await tx`
    SELECT m.topic_id AS topic_id,
           CASE WHEN p.evidence_type = 'news'
                THEN nullif(btrim(coalesce(p.publisher, '')), '')
                ELSE CASE WHEN p.author_id LIKE '%:unknown' THEN NULL ELSE p.author_id END END AS identity,
           (p.evidence_type = 'news') AS is_news,
           min(p.first_collected_at) AS first_seen,
           max(CASE WHEN p.time_kind = 'published' THEN p.published_at END) AS latest_published
    FROM topic_memberships m
    JOIN posts p ON p.id = m.post_id
    WHERE m.topic_id = ANY(${topicIds}::text[])
      AND p.deleted_at IS NULL
      AND p.content_hash = m.content_hash
    GROUP BY 1, 2, 3
    HAVING min(p.first_collected_at) > ${watermark}::timestamptz
  `) as unknown as Array<IdentityRow & { is_news: boolean }>;

  for (const row of identityRows) {
    if (!credit(row.first_seen, row.latest_published)) continue;
    const identity = String(row.identity ?? "").trim();
    if (!identity) continue;
    add(
      row.is_news ? batch.publishers : batch.accounts,
      resolveTopic(String(row.topic_id), redirects),
      identity,
    );
  }

  const providerRows = (await tx`
    SELECT m.topic_id AS topic_id,
           p.source AS provider,
           min(p.first_collected_at) AS first_seen,
           max(CASE WHEN p.time_kind = 'published' THEN p.published_at END) AS latest_published
    FROM topic_memberships m
    JOIN posts p ON p.id = m.post_id
    WHERE m.topic_id = ANY(${topicIds}::text[])
      AND p.deleted_at IS NULL
      AND p.content_hash = m.content_hash
    GROUP BY 1, 2
    HAVING min(p.first_collected_at) > ${watermark}::timestamptz
  `) as unknown as ProviderRow[];

  for (const row of providerRows) {
    if (!credit(row.first_seen, row.latest_published)) continue;
    add(batch.sources, resolveTopic(String(row.topic_id), redirects), String(row.provider));
  }

  return batch;
}

function updatedAccumulator(
  existing: SupportAccumulator | undefined,
  incoming: { accounts: string[]; publishers: string[]; sources: string[] },
  at: Date,
): SupportAccumulator {
  const accounts = new Set(existing?.accounts ?? []);
  const publishers = new Set(existing?.publishers ?? []);
  const sources = new Set(existing?.sources ?? []);
  for (const value of incoming.accounts) {
    if (accounts.size < MAX_ACCUMULATED_ACCOUNTS) accounts.add(value);
  }
  for (const value of incoming.publishers) {
    if (publishers.size < MAX_ACCUMULATED_PUBLISHERS) publishers.add(value);
  }
  for (const value of incoming.sources) {
    if (sources.size < MAX_ACCUMULATED_SOURCES) sources.add(value);
  }
  return {
    accounts: [...accounts].sort(),
    publishers: [...publishers].sort(),
    sources: [...sources].sort(),
    lastAt: at.toISOString(),
  };
}

/**
 * Deterministic, evidence-grounded sentences. The accumulator holds everything
 * credited since the watch last reported this topic, which is an earlier alert
 * or — for a first alert — the baseline taken when the watch was created.
 */
function reasonsFor(
  rule: RuleRow,
  accumulator: SupportAccumulator,
  candidate: TopicCandidate,
): string[] {
  const reasons: string[] = [];
  const { accounts, publishers, sources } = accumulator;
  if (accounts.length > 0) {
    reasons.push(
      `${accounts.length} independent community account${accounts.length === 1 ? "" : "s"} joined since this watch last reported the topic`,
    );
  }
  if (publishers.length > 0) {
    reasons.push(
      `${publishers.length} news publisher${publishers.length === 1 ? "" : "s"} reported the topic since this watch last reported it`,
    );
  }
  if (sources.length > 0) {
    const shown = sources.slice(0, 4).join(", ");
    const rest = sources.length - 4;
    reasons.push(
      `New source${sources.length === 1 ? "" : "s"}: ${shown}${rest > 0 ? `, +${rest} more` : ""}`,
    );
  }
  reasons.push(
    `Measured potential ${candidate.node.potential}/100 over the last ${candidate.hours} hours`,
  );
  if (Number(rule.min_potential) > 0) {
    reasons.push(`Required minimum potential ${Number(rule.min_potential)}/100 was met`);
  }
  reasons.push(
    "Only identities first collected after the previous check count; forum activity is not publication",
  );
  return reasons;
}

/**
 * Deterministic identity digest: one watch, one topic, one set of credited
 * identities is one notification, however many times evaluation runs. This is
 * also what stops a post-alert repeat — the accumulator is cleared when an
 * alert fires, but the same identities can never insert a second row.
 */
function alertFingerprint(watchId: string, topicId: string, accumulator: SupportAccumulator) {
  const digest = createHash("sha256")
    .update(
      [
        ...accumulator.accounts.map((value) => `acct:${value}`),
        ...accumulator.publishers.map((value) => `pub:${value}`),
        ...accumulator.sources.map((value) => `src:${value}`),
      ].join("\n"),
    )
    .digest("hex");
  return createHash("sha256").update(`${watchId}\n${topicId}\n${digest}`).digest("hex");
}

function pruneBaseline(baseline: RuleBaseline) {
  const entries = Object.entries(baseline.topics);
  if (entries.length <= MAX_TRACKED_TOPICS) return baseline;
  entries.sort((a, b) => (a[1].lastAt < b[1].lastAt ? 1 : -1));
  return { ...baseline, topics: Object.fromEntries(entries.slice(0, MAX_TRACKED_TOPICS)) };
}

/** Threshold test: OR across growth dimensions, with the potential floor required. */
function crossing(rule: RuleRow, accumulator: SupportAccumulator, potential: number) {
  const growth =
    (Number(rule.min_new_accounts) > 0 &&
      accumulator.accounts.length >= Number(rule.min_new_accounts)) ||
    (Number(rule.min_new_publishers) > 0 &&
      accumulator.publishers.length >= Number(rule.min_new_publishers)) ||
    (Number(rule.min_new_sources) > 0 &&
      accumulator.sources.length >= Number(rule.min_new_sources));
  return growth && potential >= Number(rule.min_potential);
}

/** Migration completes before getDb resolves; an SQL failure must stay visible. */
async function baselineStartedAt(db: SQL) {
  const rows = (await db`
    SELECT started_at FROM topic_intelligence_state WHERE singleton
  `) as unknown as Array<{ started_at: Date | string }>;
  const value = iso(rows[0]?.started_at ?? null);
  return value ? new Date(value) : null;
}

/** Every redirect (there are only ever as many as reviews) plus the rule targets. */
async function loadRedirects(db: SQL, ids: string[]) {
  const rows = (await db`
    SELECT id, merged_into FROM topic_catalog
    WHERE merged_into IS NOT NULL OR id = ANY(${ids}::text[])
  `) as unknown as Array<{ id: string; merged_into: string | null }>;
  return redirectTable(rows);
}

/**
 * Evaluate every enabled rule against supplied maps. Callers pass fresh
 * 24/72/168 maps; evaluation never builds a map or calls a model, so polling it
 * adds nothing to the projection path.
 */
export async function evaluateWatchAlerts(maps: readonly TrendMap[]): Promise<void> {
  if (maps.length === 0) return;
  const db = await getDb();
  const nodes = indexNodes(maps);
  if (nodes.size === 0) return;

  const rules = (await db`
    SELECT * FROM watch_rules WHERE enabled ORDER BY created_at ASC, id
  `) as unknown as RuleRow[];
  if (rules.length === 0) return;

  const redirects = await loadRedirects(
    db,
    rules.filter((rule) => rule.kind === "topic").map((rule) => String(rule.target_id)),
  );
  const baselineFloor = await baselineStartedAt(db);

  for (const rule of rules) {
    try {
      await evaluateRule(db, rule.id, nodes, redirects, baselineFloor);
    } catch (error) {
      // One bad rule must not stop the others, and its watermark stays put so the
      // next evaluation retries the same support instead of losing it.
      console.warn(
        `Watch evaluation failed for ${rule.id}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }
}

async function evaluateRule(
  db: SQL,
  id: string,
  nodes: ReadonlyMap<string, TopicCandidate>,
  redirects: ReadonlyMap<string, string>,
  baselineFloor: Date | null,
) {
  await db.begin(async (tx) => {
    // Per-rule serialisation across processes: a concurrent evaluation waits
    // here, then re-reads the advanced watermark and finds nothing new.
    const [rule] = (await tx`
      SELECT * FROM watch_rules WHERE id = ${id} FOR UPDATE
    `) as unknown as RuleRow[];
    if (!rule?.enabled) return;

    const baseline = readBaseline(rule.baseline, [rule.evaluated_at, rule.created_at]);
    const created = iso(rule.created_at) ?? new Date().toISOString();
    // Bootstrap guard: only a row written before this code existed has no
    // baseline metadata. Its watermark is raised to the intelligence start, so
    // the pre-upgrade corpus is baseline evidence instead of a spike. A rule
    // created by this code is already anchored after that corpus.
    const floor = [baseline.watermark, created];
    if (
      baseline.mark === "legacy" &&
      baselineFloor &&
      Date.parse(created) < baselineFloor.getTime()
    ) {
      floor.push(baselineFloor.toISOString());
    }
    const watermark = new Date(floor.sort().at(-1)!);
    const evaluationAt = new Date();
    const freshnessFloor = new Date(evaluationAt.getTime() - SUPPORT_FRESHNESS_HOURS * 3_600_000);

    const matched = matchedTopics(rule, nodes, redirects);
    // A node whose id is not in the catalog has no memberships yet, so its
    // support is unknown, not zero. Advancing the watermark over it would
    // discard identities first collected before its catalog row appeared.
    const topics = await knownTopics(tx, matched);
    if (matched.length > 0 && topics.length === 0) return;
    // Merged source ids are queried alongside the node id that now represents them.
    const supports = await loadNewSupport(
      tx,
      [...new Set(topics.flatMap((candidate) => familyOf(candidate.node.id, redirects)))],
      watermark,
      freshnessFloor,
      redirects,
    );

    const nextTopics = { ...baseline.topics };
    for (const candidate of topics) {
      const topicId = candidate.node.id;
      const accumulator = updatedAccumulator(
        nextTopics[topicId],
        {
          accounts: [...(supports.accounts.get(topicId) ?? [])],
          publishers: [...(supports.publishers.get(topicId) ?? [])],
          sources: [...(supports.sources.get(topicId) ?? [])],
        },
        evaluationAt,
      );
      if (
        accumulator.accounts.length === 0 &&
        accumulator.publishers.length === 0 &&
        accumulator.sources.length === 0
      ) {
        continue;
      }

      if (!crossing(rule, accumulator, candidate.node.potential)) {
        nextTopics[topicId] = accumulator;
        continue;
      }

      await tx`
        INSERT INTO watch_alerts (id, watch_id, topic_id, topic_label, created_at, read_at,
                                  new_accounts, new_publishers, new_sources, potential,
                                  reasons, fingerprint)
        VALUES (${`alert:${randomUUID()}`}, ${rule.id}, ${topicId}, ${candidate.node.label},
                ${evaluationAt}::timestamptz, NULL, ${accumulator.accounts.length},
                ${accumulator.publishers.length},
                ${accumulator.sources}::text[],
                ${Math.round(candidate.node.potential)},
                ${JSON.stringify(reasonsFor(rule, accumulator, candidate))}::text::jsonb,
                ${alertFingerprint(String(rule.id), topicId, accumulator)})
        ON CONFLICT (fingerprint) DO NOTHING
      `;
      // The fired support is consumed: the next alert needs genuinely new identities.
      delete nextTopics[topicId];
    }

    await tx`
      UPDATE watch_rules SET
        evaluated_at = ${evaluationAt},
        baseline = ${JSON.stringify(
          pruneBaseline({
            ...baseline,
            watermark: evaluationAt.toISOString(),
            topics: nextTopics,
          }),
        )}::text::jsonb
      WHERE id = ${id}
    `;
  });
}
