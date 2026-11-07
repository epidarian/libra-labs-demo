ALTER TABLE reward_items ADD COLUMN inclusive INTEGER NOT NULL DEFAULT 0;
ALTER TABLE reward_tiers ADD COLUMN amount_cents INTEGER;

UPDATE reward_tiers
SET amount_cents = (SELECT tiers.amount_cents FROM tiers WHERE tiers.id = reward_tiers.tier_id)
WHERE amount_cents IS NULL;

UPDATE tiers SET include_previous = 0;
