// Shared by the Worker and both fulfillment desks so the counts they show always agree.

// Extra copies for headquarters: the line's own number, or the default from settings.
export function resolvedExtras(itemExtra, settingsExtra) {
  if (itemExtra != null) return itemExtra;
  return settingsExtra == null ? 0 : settingsExtra;
}

// A blank per-patron count means one copy each.
export function copiesForPatrons(count, headcount) {
  return headcount * (count == null ? 1 : count);
}

// The tier a pledge falls in: the highest tier amount it reaches.
export function bandOf(amountCents, tiers) {
  let band = null;
  for (const tier of tiers) {
    if (amountCents >= tier.amount_cents && (band == null || tier.amount_cents > band)) band = tier.amount_cents;
  }
  return band;
}

// Whether an active patron receives a line. Inclusive lines go to every pledge at or
// above any chosen amount; otherwise the patron's own tier must be one of the chosen ones.
export function entitled(patron, item, tiers) {
  const amounts = item.amounts || [];
  if (patron.patron_status !== "active_patron" || !amounts.length) return false;
  if (item.inclusive) return amounts.some((amount) => patron.amount_cents >= amount);
  const band = bandOf(patron.amount_cents, tiers);
  return band != null && amounts.includes(band);
}
