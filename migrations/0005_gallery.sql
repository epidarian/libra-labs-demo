CREATE TABLE gallery_works (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  rating TEXT NOT NULL DEFAULT 'sfw',
  medium TEXT NOT NULL DEFAULT '',
  year TEXT NOT NULL DEFAULT '',
  patrons_only INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 0,
  patreon_post_id TEXT,
  patreon_url TEXT,
  patreon_title TEXT,
  patreon_public INTEGER,
  patreon_paid INTEGER,
  patreon_published_at TEXT,
  patreon_synced_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_gallery_works_rating ON gallery_works (rating, published, created_at);

CREATE TABLE gallery_files (
  id TEXT PRIMARY KEY,
  work_id TEXT NOT NULL,
  slot TEXT NOT NULL,
  name TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT '',
  bytes INTEGER NOT NULL DEFAULT 0,
  viewable INTEGER NOT NULL DEFAULT 0,
  downloadable INTEGER NOT NULL DEFAULT 0,
  patrons_only INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_gallery_files_work ON gallery_files (work_id, slot);
