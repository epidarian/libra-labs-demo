CREATE TABLE tiers (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0
);

INSERT INTO tiers (id, title, amount_cents, sort) VALUES
  ('supporter', 'Supporter', 300, 1),
  ('studio', 'Studio', 500, 2),
  ('archive', 'Archive', 1000, 3);

ALTER TABLE gallery_works ADD COLUMN min_cents INTEGER;

INSERT INTO gallery_works (id, title, slug, rating, medium, year, patrons_only, published, min_cents, created_at) VALUES
  ('d1000000-0000-4000-8000-000000000001', 'Demonstration, public', 'demo-public', 'sfw', 'Test', '2026', 0, 1, NULL, '2026-10-27T12:00:06Z'),
  ('d1000000-0000-4000-8000-000000000002', 'Demonstration, Supporter', 'demo-supporter', 'sfw', 'Test', '2026', 0, 1, 300, '2026-10-27T12:00:05Z'),
  ('d1000000-0000-4000-8000-000000000003', 'Demonstration, Archive', 'demo-archive', 'sfw', 'Test', '2026', 0, 1, 1000, '2026-10-27T12:00:04Z'),
  ('d1000000-0000-4000-8000-000000000004', 'Demonstration, print tag', 'demo-print', 'sfw', 'Test', '2026', 0, 0, NULL, '2026-10-27T12:00:03Z'),
  ('d1000000-0000-4000-8000-000000000005', 'Demonstration, public', 'demo-public-nsfw', 'nsfw', 'Test', '2026', 0, 1, NULL, '2026-10-27T12:00:02Z'),
  ('d1000000-0000-4000-8000-000000000006', 'Demonstration, Studio', 'demo-studio-nsfw', 'nsfw', 'Test', '2026', 0, 1, 500, '2026-10-27T12:00:01Z');

INSERT INTO gallery_work_tags (work_id, tag) VALUES
  ('d1000000-0000-4000-8000-000000000004', 'print');
