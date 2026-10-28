-- Each queue is a separate commission type with its own price list and Linear team.
CREATE TABLE commission_queues (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  open INTEGER NOT NULL DEFAULT 1,
  linear_team_id TEXT NOT NULL DEFAULT '',
  linear_label_id TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- One row per priced control on the form. A child can only be chosen with its parent.
-- price is in cents when price_unit = 'usd', and whole percent of the base when 'percent'.
-- The base is the sum of chosen in_base options. A non-empty quantity_label makes the
-- control a number input; the first `included` units are free.
CREATE TABLE commission_options (
  id TEXT PRIMARY KEY,
  queue_id TEXT NOT NULL REFERENCES commission_queues (id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES commission_options (id),
  position INTEGER NOT NULL DEFAULT 0,
  label TEXT NOT NULL,
  price INTEGER NOT NULL DEFAULT 0,
  price_unit TEXT NOT NULL DEFAULT 'usd' CHECK (price_unit IN ('usd', 'percent')),
  in_base INTEGER NOT NULL DEFAULT 0,
  required INTEGER NOT NULL DEFAULT 0,
  quantity_label TEXT NOT NULL DEFAULT '',
  included INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_commission_options_queue ON commission_options (queue_id, position);

INSERT INTO commission_queues (id, name, position) VALUES
  ('illustration', 'Illustration', 0),
  ('comics', 'Comics', 1);

INSERT INTO commission_options
  (id, queue_id, parent_id, position, label, price, price_unit, in_base, required, quantity_label, included)
VALUES
  ('illustration-sketch', 'illustration', NULL, 0, 'Sketch', 5000, 'usd', 1, 1, '', 0),
  ('illustration-lineart', 'illustration', 'illustration-sketch', 1, 'Lineart', 2500, 'usd', 1, 0, '', 0),
  ('illustration-shade', 'illustration', 'illustration-lineart', 2, 'Shade', 2500, 'usd', 1, 0, '', 0),
  ('illustration-characters', 'illustration', NULL, 3, 'Characters', 50, 'percent', 0, 1, 'characters', 1),
  ('illustration-background', 'illustration', NULL, 4, 'Background', 2500, 'usd', 0, 0, '', 0),
  ('comics-pages', 'comics', NULL, 0, 'Comic', 25000, 'usd', 1, 1, 'pages', 0),
  ('comics-color', 'comics', NULL, 1, 'Color', 15, 'percent', 0, 0, '', 0),
  ('comics-backgrounds', 'comics', NULL, 2, 'Backgrounds', 10, 'percent', 0, 0, '', 0);

-- Carry the old single open/closed switch over to both queues, then retire it.
UPDATE commission_queues SET open = 0
WHERE EXISTS (
  SELECT 1 FROM settings WHERE key = 'commissions' AND json_extract(value, '$.status') = 'closed'
);
DELETE FROM settings WHERE key = 'commissions';

INSERT OR IGNORE INTO settings (key, value) VALUES (
  'commissions.terms',
  json_object(
    'updated', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    'items', json_array(
      'By commissioning artwork, you hereby acknowledge that you, the commissioner, are 18 years old or older and are of legal age.',
      'Payment is due upon receiving the invoice.',
      'Partial payments are allowed; however, work will not begin until full payment is received.',
      'You have 48 hours from when the invoice is sent to you to pay the invoice or partially pay. If no payment is received, the commission form will be rejected.',
      'The commissioner is entitled to one free revision at the sketch stage; however, subsequent revisions will result in an extra charge on top of the total agreed-upon price. Any revisions done after the sketch stage will have a mandatory charge and revisions will not be made until payment.',
      'Be accurate and to the point with your commission description. You can also choose to give the artist creative freedom with your image. However, multiple-page-long descriptions or confusing/awkwardly written descriptions will result in the commission form to be rejected.',
      'Please provide high-resolution references (visual references only). Low-resolution references or thumbnail sized references will result in the commission form to be rejected. Image links must be easily accessible; links that lead to broken or private images will result on the commission to be rejected.',
      'The form must be properly filled or else the commission will be rejected.',
      'Libra Labs will not draw any of the following subjects: Bodily waste/Watersports/Scat, etc; Gore/Blood; Weight Gain; Cubs/Shota/Loli; Reference Sheets; Extreme Hyper; Hard/Extreme Vore. This is not a comprehensive list - for any questions about the acceptability of potential art subjects, please ask directly.',
      'Prices are subject to change without notice. Libra Labs has the right to refuse commissions for whatever reason.'
    )
  )
);

-- Requests are rebuilt around the new form. Old size/deadline/venue answers are folded
-- into the description so nothing is lost; old rows are filed under Illustration.
CREATE TABLE commissions_next (
  id TEXT PRIMARY KEY,
  queue_id TEXT NOT NULL REFERENCES commission_queues (id),
  rating TEXT NOT NULL,
  usernames TEXT NOT NULL,
  email TEXT NOT NULL,
  paypal_email TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL,
  -- JSON snapshot of the chosen options and their prices when the request was sent.
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

INSERT INTO commissions_next
  (id, queue_id, rating, usernames, email, description, status, linear_id, linear_identifier, linear_url, created_at)
SELECT
  id, 'illustration', rating, name, email,
  message
    || CASE WHEN size <> '' THEN char(10) || 'Size: ' || size ELSE '' END
    || CASE WHEN deadline <> '' THEN char(10) || 'Deadline: ' || deadline ELSE '' END
    || CASE WHEN venue <> '' THEN char(10) || 'Where it will be shown: ' || venue ELSE '' END,
  status, linear_id, linear_identifier, linear_url, created_at
FROM commissions;

DROP TABLE commissions;
ALTER TABLE commissions_next RENAME TO commissions;

CREATE INDEX idx_commissions_created ON commissions (created_at);
CREATE INDEX idx_commissions_queue_status ON commissions (queue_id, status);
