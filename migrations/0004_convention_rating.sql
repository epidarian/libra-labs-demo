ALTER TABLE conventions ADD COLUMN rating TEXT NOT NULL DEFAULT 'sfw';

CREATE INDEX idx_conventions_rating ON conventions (rating, starts_on);
