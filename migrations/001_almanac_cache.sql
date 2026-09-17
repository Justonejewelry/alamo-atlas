-- Durable almanac cache for civic snapshots (CKAN / ArcGIS / TACC).
-- Process TTL still lives in app memory; this table survives serverless cold starts.
CREATE TABLE IF NOT EXISTS almanac_cache (
  cache_key text PRIMARY KEY,
  payload jsonb NOT NULL,
  source text NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS almanac_cache_expires_idx ON almanac_cache (expires_at);
