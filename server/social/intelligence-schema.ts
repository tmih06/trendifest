/**
 * Additive, idempotent single-user intelligence storage. Raw evidence stays in
 * posts; history stores bounded numeric observations, never copied article text.
 * Catalog redirects preserve review/watch identities when automatic groups move.
 */
export const INTELLIGENCE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS topic_catalog (
    id text PRIMARY KEY,
    label text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    merged_into text
  );

  CREATE TABLE IF NOT EXISTS topic_memberships (
    post_id text PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
    topic_id text NOT NULL REFERENCES topic_catalog(id),
    content_hash text NOT NULL,
    locked boolean NOT NULL DEFAULT false,
    review_id text,
    assigned_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS topic_memberships_topic_idx ON topic_memberships(topic_id);

  CREATE TABLE IF NOT EXISTS topic_snapshots (
    topic_id text NOT NULL REFERENCES topic_catalog(id),
    hours integer NOT NULL,
    bucket_at timestamptz NOT NULL,
    observed_at timestamptz NOT NULL,
    potential integer NOT NULL,
    rank integer NOT NULL,
    accounts integer NOT NULL,
    publishers integer NOT NULL,
    posts integer NOT NULL,
    news_attention integer NOT NULL,
    community_momentum integer NOT NULL,
    source_ids text[] NOT NULL DEFAULT '{}',
    PRIMARY KEY(topic_id, hours, bucket_at)
  );
  ALTER TABLE topic_snapshots ADD COLUMN IF NOT EXISTS observed_at timestamptz;
  -- A bucket alone cannot establish when its rank was actually observed.
  DELETE FROM topic_snapshots WHERE observed_at IS NULL;
  ALTER TABLE topic_snapshots ALTER COLUMN observed_at SET NOT NULL;
  CREATE INDEX IF NOT EXISTS topic_snapshots_window_idx ON topic_snapshots(hours, bucket_at DESC);

  CREATE TABLE IF NOT EXISTS topic_intelligence_state (
    singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
    started_at timestamptz NOT NULL DEFAULT now(),
    last_refresh_at timestamptz,
    last_error text
  );
  INSERT INTO topic_intelligence_state(singleton) VALUES(true) ON CONFLICT DO NOTHING;

  CREATE TABLE IF NOT EXISTS topic_review_decisions (
    id text PRIMARY KEY,
    operation text NOT NULL CHECK(operation IN ('merge', 'split')),
    topic_ids text[] NOT NULL,
    record_ids text[] NOT NULL,
    target_id text NOT NULL,
    note text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    active boolean NOT NULL DEFAULT true
  );
  ALTER TABLE topic_review_decisions
    ADD COLUMN IF NOT EXISTS prior_state jsonb NOT NULL DEFAULT '{}'::jsonb;
  CREATE INDEX IF NOT EXISTS topic_review_decisions_recent_idx ON topic_review_decisions(created_at DESC);

  CREATE TABLE IF NOT EXISTS watch_rules (
    id text PRIMARY KEY,
    kind text NOT NULL CHECK(kind IN ('topic', 'entity')),
    target_id text NOT NULL,
    label text NOT NULL,
    enabled boolean NOT NULL DEFAULT true,
    min_new_accounts integer NOT NULL CHECK(min_new_accounts >= 0),
    min_new_publishers integer NOT NULL CHECK(min_new_publishers >= 0),
    min_new_sources integer NOT NULL CHECK(min_new_sources >= 0),
    min_potential integer NOT NULL CHECK(min_potential BETWEEN 0 AND 100),
    created_at timestamptz NOT NULL DEFAULT now(),
    evaluated_at timestamptz,
    baseline jsonb NOT NULL DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS watch_alerts (
    id text PRIMARY KEY,
    watch_id text NOT NULL REFERENCES watch_rules(id) ON DELETE CASCADE,
    topic_id text NOT NULL,
    topic_label text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    read_at timestamptz,
    new_accounts integer NOT NULL,
    new_publishers integer NOT NULL,
    new_sources text[] NOT NULL DEFAULT '{}',
    potential integer NOT NULL,
    reasons jsonb NOT NULL,
    fingerprint text NOT NULL UNIQUE
  );
  DROP INDEX IF EXISTS watch_alerts_recent_idx;
  CREATE INDEX IF NOT EXISTS watch_alerts_page_idx ON watch_alerts(created_at DESC, id DESC);
`;
