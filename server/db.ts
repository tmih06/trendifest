import { SQL } from "bun";

/**
 * Postgres + pgvector access for social collection. Observations need real
 * indexes and ANN search, so they live here rather than in a JSON file.
 *
 * The connection is lazy: importing this module must not open a socket, or
 * `bun test` and `bun run build` would require a database to be running.
 */

const PADDED_DIM = 1024;

/**
 * Embedding spaces share one padded column. pgvector rejects HNSW on a
 * dimension-less `vector` column, and a column cannot hold mixed dimensions, so
 * every vector is L2-normalized and zero-padded to `PADDED_DIM`. Cosine
 * similarity is unchanged by trailing zeros (verified: 0.856248974795 before
 * and after padding), and each space gets its own partial HNSW index so
 * unrelated spaces never compete during search.
 */
export const EMBEDDING_DIM = PADDED_DIM;

/**
 * Spaces are an allowlist, not user input: their names are interpolated into
 * partial-index DDL, which cannot take bind parameters.
 */
export const SPACES = ["text", "image", "audio"] as const;
export type Space = (typeof SPACES)[number];

export function isSpace(value: string): value is Space {
  return (SPACES as readonly string[]).includes(value);
}

export const SPACE_MODELS: Record<Space, { model: string; dim: number }> = {
  // Multilingual text embeddings include Vietnamese; matching remains a heuristic.
  text: { model: "Xenova/paraphrase-multilingual-MiniLM-L12-v2", dim: 384 },
  // CLIP ViT-B/32: image and text towers share one space, so a frame can be
  // compared against captions as well as other frames.
  image: { model: "Xenova/clip-vit-base-patch32", dim: 512 },
  // CLAP: audio and text share one space.
  audio: { model: "Xenova/clap-htsat-unfused", dim: 512 },
};

let client: SQL | null = null;
let ready: Promise<SQL> | null = null;

export function databaseConfigured() {
  return (process.env.TRENDIFEST_DATABASE_URL ?? "").trim().length > 0;
}

export class DatabaseMissingError extends Error {
  readonly status = 503;
  readonly code = "database_unconfigured";

  constructor() {
    super(
      "Social collection needs a Postgres database with pgvector. Set TRENDIFEST_DATABASE_URL.",
    );
    this.name = "DatabaseMissingError";
  }
}

/** DDL is idempotent so a fresh database and an upgraded one take the same path. */
function migrationSql() {
  const spaceIndexes = SPACES.map(
    (space) => `
      CREATE INDEX IF NOT EXISTS embeddings_${space}_hnsw
        ON embeddings USING hnsw (vec vector_cosine_ops)
        WHERE space = '${space}';`,
  ).join("\n");

  return `
    CREATE EXTENSION IF NOT EXISTS vector;

    CREATE TABLE IF NOT EXISTS posts (
      id text PRIMARY KEY,
      source text NOT NULL,
      uri text NOT NULL,
      author_id text NOT NULL,
      author_handle text,
      body text NOT NULL DEFAULT '',
      lang text[] NOT NULL DEFAULT '{}',
      kind text NOT NULL,
      permalink text NOT NULL,
      published_at timestamptz NOT NULL,
      time_kind text NOT NULL DEFAULT 'published',
      media jsonb NOT NULL DEFAULT '[]'::jsonb,
      content_hash text NOT NULL,
      deleted_at timestamptz,
      UNIQUE (source, uri)
    );
    CREATE INDEX IF NOT EXISTS posts_published_idx ON posts (published_at DESC);
    CREATE INDEX IF NOT EXISTS posts_hash_idx ON posts (content_hash);

    -- One row per (post, segment) delivery. A post observed in two segments is
    -- the crossing signal; collapsing it to one row would erase that.
    CREATE TABLE IF NOT EXISTS observations (
      post_id text NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      segment_id text NOT NULL,
      observed_at timestamptz NOT NULL,
      via text NOT NULL,
      PRIMARY KEY (post_id, segment_id)
    );
    CREATE INDEX IF NOT EXISTS observations_segment_idx ON observations (segment_id, observed_at DESC);

    -- Only the latest measured counters are consumed. Missing metrics stay
    -- NULL; an RSS reply count is not a measured like/share count.
    CREATE TABLE IF NOT EXISTS metric_snapshots (
      post_id text NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      captured_at timestamptz NOT NULL,
      likes integer,
      reposts integer,
      replies integer,
      quotes integer,
      PRIMARY KEY (post_id)
    );

    -- One vector per (post, model, span). Spans keep per-modality provenance:
    -- body, image:0, video:frame:2, video:audio.
    CREATE TABLE IF NOT EXISTS embeddings (
      post_id text NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      space text NOT NULL,
      model text NOT NULL,
      dim integer NOT NULL,
      span text NOT NULL,
      vec vector(${PADDED_DIM}) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (post_id, model, span)
    );
    CREATE INDEX IF NOT EXISTS embeddings_space_idx ON embeddings (space);
    ${spaceIndexes}

    CREATE TABLE IF NOT EXISTS clusters (
      id text PRIMARY KEY,
      space text NOT NULL,
      model text NOT NULL,
      dim integer NOT NULL,
      centroid vector(${PADDED_DIM}) NOT NULL,
      member_count integer NOT NULL DEFAULT 0,
      first_seen_at timestamptz NOT NULL,
      last_seen_at timestamptz NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cluster_members (
      cluster_id text NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
      post_id text NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      span text NOT NULL,
      similarity real NOT NULL,
      assigned_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (cluster_id, post_id, span)
    );
    CREATE INDEX IF NOT EXISTS cluster_members_post_idx ON cluster_members (post_id);

    -- Retired clusters are archived, not deleted: deleting one cascaded its
    -- memberships away and left embedded posts with no cluster at all.
    ALTER TABLE clusters ADD COLUMN IF NOT EXISTS archived_at timestamptz;
    CREATE INDEX IF NOT EXISTS clusters_active_idx
      ON clusters (space, last_seen_at DESC) WHERE archived_at IS NULL;

  `;
}

async function migrate(sql: SQL) {
  // Rename the source-specific column without losing provenance on an upgrade.
  const oldAuthor = await sql`
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'posts' AND column_name = 'author_did'
  `;
  if (oldAuthor.length) await sql.unsafe("ALTER TABLE posts RENAME COLUMN author_did TO author_id");
  for (const statement of migrationSql().split(/;\s*\n/)) {
    const trimmed = statement.trim();
    if (trimmed) await sql.unsafe(trimmed);
  }
  await sql.unsafe(
    "ALTER TABLE posts ADD COLUMN IF NOT EXISTS time_kind text NOT NULL DEFAULT 'published'",
  );
  await sql.unsafe("ALTER TABLE posts DROP COLUMN IF EXISTS tags");
  for (const column of ["likes", "reposts", "replies", "quotes"]) {
    await sql.unsafe(
      `ALTER TABLE metric_snapshots ALTER COLUMN ${column} DROP NOT NULL, ALTER COLUMN ${column} DROP DEFAULT`,
    );
  }
  const oldMetricKey = await sql`
    SELECT 1 FROM information_schema.key_column_usage
    WHERE table_schema = 'public' AND table_name = 'metric_snapshots'
      AND constraint_name = 'metric_snapshots_pkey' AND column_name = 'captured_at'
  `;
  if (oldMetricKey.length) {
    await sql`
      DELETE FROM metric_snapshots old USING metric_snapshots newer
      WHERE old.post_id = newer.post_id AND old.captured_at < newer.captured_at
    `;
    await sql.unsafe(
      "ALTER TABLE metric_snapshots DROP CONSTRAINT metric_snapshots_pkey, ADD PRIMARY KEY (post_id)",
    );
  }
  await sql.unsafe("DROP INDEX IF EXISTS metrics_recent_idx");
  await sql.unsafe("DROP TABLE IF EXISTS ingest_state");
}

/**
 * Return the migrated client, connecting once per process. A failed migration
 * clears the cached promise so the next request retries instead of pinning a
 * permanently broken handle.
 */
export async function getDb(): Promise<SQL> {
  if (!databaseConfigured()) throw new DatabaseMissingError();
  if (client) return client;

  ready ??= (async () => {
    // 8 connections covers the ingest loop plus interactive API reads without
    // holding a pool this single-user app cannot use.
    const sql = new SQL({
      url: (process.env.TRENDIFEST_DATABASE_URL ?? "").trim(),
      max: 8,
      idleTimeout: 30,
    });
    await migrate(sql);
    client = sql;
    return sql;
  })().catch((error) => {
    ready = null;
    throw error;
  });

  return ready;
}

export async function closeDb() {
  ready = null;
  // Bun.SQL's close is async; shutdown must not await it because this runs from
  // signal handlers and test teardown, where blocking would hang the process.
  void client?.close();
  client = null;
}

/** Format a unit vector as a pgvector literal; padding keeps one shared column. */
export function toVectorLiteral(values: ArrayLike<number>) {
  const length = Math.min(values.length, PADDED_DIM);
  let norm = 0;
  for (let index = 0; index < length; index += 1) norm += values[index]! * values[index]!;
  const scale = norm > 0 ? 1 / Math.sqrt(norm) : 0;

  const parts: string[] = [];
  for (let index = 0; index < PADDED_DIM; index += 1) {
    const value = index < length ? values[index]! * scale : 0;
    // Six decimals is well inside fp32 precision and keeps the wire literal small.
    parts.push(value === 0 ? "0" : value.toFixed(6));
  }
  return `[${parts.join(",")}]`;
}
