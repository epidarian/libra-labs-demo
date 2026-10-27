INSERT OR IGNORE INTO commissions
  (id, queue_id, rating, usernames, email, paypal_email, description, selections, quote_cents, status, created_at)
VALUES
  ('demo-0001', 'illustration', 'sfw', 'Demo client 1', 'demo1@example.com', '',
   'Demo request 1. A single-character illustration for a framed print.',
   '[{"id":"illustration-sketch","label":"Sketch","qty":null,"unit":null,"cents":5000},{"id":"illustration-lineart","label":"Lineart","qty":null,"unit":null,"cents":2500},{"id":"illustration-shade","label":"Shade","qty":null,"unit":null,"cents":2500},{"id":"illustration-characters","label":"Characters","qty":1,"unit":"characters","cents":0}]',
   10000, 'new', '2026-10-20T15:04:00.000Z'),
  ('demo-0002', 'illustration', 'sfw', 'Demo client 2', 'demo2@example.com', 'pay2@example.com',
   'Demo request 2. Two characters with a background scene.',
   '[{"id":"illustration-sketch","label":"Sketch","qty":null,"unit":null,"cents":5000},{"id":"illustration-lineart","label":"Lineart","qty":null,"unit":null,"cents":2500},{"id":"illustration-characters","label":"Characters","qty":2,"unit":"characters","cents":3750},{"id":"illustration-background","label":"Background","qty":null,"unit":null,"cents":2500}]',
   13750, 'new', '2026-10-22T09:30:00.000Z'),
  ('demo-0003', 'illustration', 'nsfw', 'Demo client 3', 'demo3@example.com', '',
   'Demo request 3. A two-character piece for the adult catalog.',
   '[{"id":"illustration-sketch","label":"Sketch","qty":null,"unit":null,"cents":5000},{"id":"illustration-characters","label":"Characters","qty":2,"unit":"characters","cents":2500}]',
   7500, 'new', '2026-10-24T21:12:00.000Z'),
  ('demo-0004', 'comics', 'sfw', 'Demo client 4', 'demo4@example.com', '',
   'Demo request 4. One comic page, four panels, in color.',
   '[{"id":"comics-pages","label":"Comic","qty":1,"unit":"pages","cents":25000},{"id":"comics-color","label":"Color","qty":null,"unit":null,"cents":3750}]',
   28750, 'accepted', '2026-10-18T18:45:00.000Z');
