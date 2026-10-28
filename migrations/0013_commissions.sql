CREATE TABLE commissions_next (
  id TEXT PRIMARY KEY,
  queue_id TEXT NOT NULL REFERENCES commission_queues (id),
  rating TEXT NOT NULL,
  usernames TEXT NOT NULL,
  email TEXT NOT NULL,
  paypal_email TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL,
  selections TEXT NOT NULL DEFAULT '[]',
  quote_cents INTEGER NOT NULL DEFAULT 0,
  terms_version TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new',
  decision_note TEXT NOT NULL DEFAULT '',
  decided_at TEXT,
  linear_id TEXT,
  linear_identifier TEXT,
  linear_url TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO commissions_next (
  id, queue_id, rating, usernames, email, paypal_email, description, selections,
  quote_cents, terms_version, status, decision_note, decided_at,
  linear_id, linear_identifier, linear_url, created_at
)
SELECT
  id, queue_id, rating, usernames, email, paypal_email, description, selections,
  quote_cents, terms_version, status, decision_note, decided_at,
  linear_id, linear_identifier, linear_url, created_at
FROM commissions;

DROP TABLE commissions;
ALTER TABLE commissions_next RENAME TO commissions;

CREATE INDEX idx_commissions_created ON commissions (created_at);
CREATE INDEX idx_commissions_queue_status ON commissions (queue_id, status);
