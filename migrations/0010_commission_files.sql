CREATE TABLE commission_files (
  id TEXT PRIMARY KEY,
  commission_id TEXT NOT NULL,
  name TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT '',
  bytes INTEGER NOT NULL DEFAULT 0,
  r2_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_commission_files_commission ON commission_files (commission_id);
