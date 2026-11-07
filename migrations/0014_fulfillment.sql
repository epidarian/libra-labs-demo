ALTER TABLE users ADD COLUMN patreon_id TEXT;
CREATE UNIQUE INDEX idx_users_patreon ON users (patreon_id) WHERE patreon_id IS NOT NULL;

CREATE TABLE print_goods (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  kind TEXT NOT NULL,
  kind_note TEXT NOT NULL DEFAULT '',
  in_stock INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE reward_items (
  id TEXT PRIMARY KEY,
  print_good_id TEXT NOT NULL REFERENCES print_goods (id),
  drop_on TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  count INTEGER,
  extra_copies INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_reward_items_drop ON reward_items (drop_on);

CREATE TABLE reward_assets (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES reward_items (id),
  r2_key TEXT NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE reward_tiers (
  item_id TEXT NOT NULL REFERENCES reward_items (id),
  tier_id TEXT NOT NULL,
  PRIMARY KEY (item_id, tier_id)
);

CREATE TABLE patrons (
  patreon_id TEXT PRIMARY KEY,
  user_id TEXT,
  email TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  image TEXT,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  patron_status TEXT,
  recipient TEXT NOT NULL DEFAULT '',
  line1 TEXT NOT NULL DEFAULT '',
  line2 TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  postal_code TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT 'US',
  phone TEXT NOT NULL DEFAULT '',
  synced_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_patrons_user ON patrons (user_id);

CREATE TABLE fulfillment_months (
  month TEXT PRIMARY KEY,
  locked_at TEXT
);

CREATE TABLE order_lines (
  id TEXT PRIMARY KEY,
  month TEXT NOT NULL,
  item_id TEXT NOT NULL,
  print_good_id TEXT NOT NULL,
  patron_qty INTEGER NOT NULL,
  extra_qty INTEGER NOT NULL,
  price_cents INTEGER NOT NULL,
  UNIQUE (month, item_id)
);

CREATE TABLE shipments (
  id TEXT PRIMARY KEY,
  month TEXT NOT NULL,
  dest TEXT NOT NULL,
  patreon_id TEXT NOT NULL DEFAULT '',
  recipient TEXT NOT NULL DEFAULT '',
  line1 TEXT NOT NULL DEFAULT '',
  line2 TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  postal_code TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  tracking TEXT NOT NULL DEFAULT '',
  fulfilled INTEGER NOT NULL DEFAULT 0,
  fulfilled_at TEXT,
  UNIQUE (month, dest, patreon_id)
);
CREATE INDEX idx_shipments_month ON shipments (month);

CREATE TABLE invoices (
  id TEXT PRIMARY KEY,
  month TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  r2_key TEXT,
  filename TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  paid_at TEXT
);
CREATE INDEX idx_invoices_month ON invoices (month);

CREATE TABLE catalog_edits (
  id TEXT PRIMARY KEY,
  print_good_id TEXT NOT NULL,
  old_price_cents INTEGER NOT NULL,
  new_price_cents INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  acked_at TEXT
);

CREATE TABLE partner_passes (
  token_hash TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
