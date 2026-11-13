import { copiesForPatrons, entitled, resolvedExtras } from "./rules.js";

export const KINDS = [
  ["print", "Print"],
  ["sticker", "Sticker"],
  ["keychain", "Keychain"],
  ["other", "Other"],
];

export function kindLabel(kind, note) {
  if (kind === "other") return note || "Other";
  return KINDS.find(([value]) => value === kind)?.[1] || kind;
}

export function money(cents) {
  return `$${((Number(cents) || 0) / 100).toFixed(2)}`;
}

export function dollarInput(cents) {
  if (cents === "" || cents == null) return "";
  return (Number(cents) / 100).toFixed(2);
}

export function centsFromDollars(value) {
  const text = String(value ?? "").trim().replace(/^\$/, "");
  if (!text) return null;
  if (!/^\d+(\.\d{0,2})?$/.test(text)) return undefined;
  const [whole, frac = ""] = text.split(".");
  return Number(whole) * 100 + Number((frac + "00").slice(0, 2));
}

export function monthLabel(month) {
  const [year, m] = String(month).split("-");
  if (!year || !m) return month;
  return new Date(Number(year), Number(m) - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
}

export function dayLabel(iso) {
  const [year, m, d] = String(iso).slice(0, 10).split("-");
  if (!year || !m || !d) return iso;
  return new Date(Number(year), Number(m) - 1, Number(d)).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function addressLine(row) {
  return [row.line1, row.line2, row.city, row.region, row.postal_code, row.country].filter(Boolean).join(", ");
}

export function tierLabel(tiers, cents) {
  const tier = tiers.find((row) => row.amount_cents === cents);
  return tier ? `${tier.title} (${money(cents)})` : money(cents);
}

export function tierName(tiers, cents) {
  return tiers.find((row) => row.amount_cents === cents)?.title || money(cents);
}

// Who a line goes to, in a few words.
export function audienceLabel(line, tiers) {
  const amounts = [...(line.amounts || [])].sort((a, b) => a - b);
  if (!amounts.length) return "Nobody";
  if (line.inclusive) return `${tierName(tiers, amounts[0])} and up`;
  return amounts.map((amount) => tierName(tiers, amount)).join(", ");
}

/**
 * One month as both desks show it. Before the lock the numbers are worked out from the
 * current patron list; after it they are the quantities frozen at the moment of locking.
 */
export function monthView(data, month) {
  const lockedAt = data.months.find((row) => row.month === month)?.locked_at || "";
  const frozen = new Map(
    (data.orderLines || []).filter((row) => row.month === month).map((row) => [row.item_id, row])
  );
  const receiving = new Map();
  const rows = data.items
    .filter((item) => item.month === month)
    .map((line) => {
      const receivers = data.patrons.filter((patron) => entitled(patron, line, data.tiers));
      for (const patron of receivers) {
        const entry = receiving.get(patron.patreon_id) || { patron, items: [] };
        entry.items.push(line.good_name);
        receiving.set(patron.patreon_id, entry);
      }
      const snap = lockedAt ? frozen.get(line.id) : null;
      const patronQty = snap ? snap.patron_qty : copiesForPatrons(line.count, receivers.length);
      const extraQty = snap ? snap.extra_qty : resolvedExtras(line.extra_copies, data.settings.extraCopies);
      const price = snap ? snap.price_cents : line.price_cents;
      const copies = patronQty + extraQty;
      return { line, receivers: receivers.length, patronQty, extraQty, copies, price, cents: copies * price };
    });
  return {
    month,
    lockedAt,
    rows,
    receiving: [...receiving.values()],
    shipments: data.shipments.filter((row) => row.month === month),
    invoices: data.invoices.filter((invoice) => invoice.month === month),
    copies: rows.reduce((sum, row) => sum + row.copies, 0),
    extras: rows.reduce((sum, row) => sum + row.extraQty, 0),
    cents: rows.reduce((sum, row) => sum + row.cents, 0),
  };
}

// The same conditions the server checks before it lets the partner lock a month.
export function lockBlockers(data, view) {
  const blockers = [];
  if (view.lockedAt) return blockers;
  if (data.today < `${view.month}-01`) blockers.push(`Locking opens ${dayLabel(`${view.month}-01`)}`);
  if (!view.rows.length) blockers.push("The order has no items");
  for (const { line } of view.rows) {
    if (!line.amounts?.length) blockers.push(`${line.good_name} has no tier`);
    if (!line.in_stock) blockers.push(`${line.good_name} is out of stock`);
  }
  return blockers;
}

export function openSheet(month, kind) {
  const url = new URL(window.location.href);
  url.hash = "";
  url.searchParams.set("sheet", kind);
  url.searchParams.set("month", month);
  window.open(url.toString(), "_blank", "noopener");
}

export async function downloadSheet(base, month, kind, format) {
  const params = new URLSearchParams({ month, kind, format });
  const res = await fetch(`${base}?${params}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Request failed (${res.status}).`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${kind}-${month}.${format}`;
  link.click();
  URL.revokeObjectURL(url);
}
