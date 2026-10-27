INSERT OR IGNORE INTO commissions (id, name, email, rating, size, deadline, venue, message, status, created_at) VALUES
  ('demo-0001', 'Demo client 1', 'demo1@example.com', 'sfw', '11×17', '2026-12-15', 'Print',
   'Demo request 1. A single-character illustration for a framed print.', 'new',
   '2026-10-20T15:04:00.000Z'),
  ('demo-0002', 'Demo client 2', 'demo2@example.com', 'sfw', 'Phone wallpaper', '', 'Personal',
   'Demo request 2. A background scene, no characters.', 'new',
   '2026-10-22T09:30:00.000Z'),
  ('demo-0003', 'Demo client 3', 'demo3@example.com', 'nsfw', '18×24', '2027-01-10', 'Personal',
   'Demo request 3. A two-character piece for the adult catalog.', 'new',
   '2026-10-24T21:12:00.000Z'),
  ('demo-0004', 'Demo client 4', 'demo4@example.com', 'sfw', 'Comic page', '2026-11-30', 'Stream',
   'Demo request 4. One comic page, four panels.', 'accepted',
   '2026-10-18T18:45:00.000Z');
