CREATE TABLE IF NOT EXISTS remote_assets (
  id TEXT PRIMARY KEY,
  source_url TEXT NOT NULL,
  etag TEXT,
  last_modified TEXT,
  content_sha256 TEXT,
  last_checked_at INTEGER,
  last_success_at INTEGER,
  last_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_remote_assets_last_checked_at
ON remote_assets(last_checked_at DESC);

-- This id is code-owned. Remove an old user-created row during upgrades so the
-- built-in selector can consistently resolve the GitHub-backed template.
DELETE FROM templates WHERE id = 'github-mihomo';
