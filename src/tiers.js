export function tierName(tiers, minCents) {
  if (minCents == null) return "";
  const match = (tiers || []).find((tier) => tier.amountCents === minCents);
  if (match) return match.title;
  const dollars = minCents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

export function meetsTier(profile, item) {
  const min = item?.minCents ?? null;
  if (min == null && !item?.patronsOnly) return true;
  if (profile?.patronStatus !== "active_patron") return false;
  if (min == null) return true;
  return (profile.amountCents || 0) >= min;
}
