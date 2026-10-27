// Shared by the public form, the Worker, and the demo console so all three quote alike.

export const MAX_QUANTITY = 99;
export const MAX_OPTIONS = 30;
const MAX_PERCENT = 1000;
const MAX_CENTS = 10_000_000;

export function formatCents(cents) {
  const dollars = cents / 100;
  return `$${dollars.toLocaleString("en-US", {
    minimumFractionDigits: cents % 100 ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

export function priceLabel(option) {
  const amount =
    option.price_unit === "percent" ? `+${option.price}% of base` : formatCents(option.price);
  if (!option.quantity_label) return amount;
  const unit = option.quantity_label.replace(/s$/, "");
  const included = option.included ? `${option.included} included, then ` : "";
  return `${included}${amount} per ${unit}`;
}

// Options must be ordered parents first. picks maps option id to a quantity; an id
// that is absent is not chosen. Required options count as chosen with quantity 1.
export function quote(options, picks = {}) {
  const chosen = new Set();
  const lines = [];
  for (const option of options) {
    const raw = picks[option.id];
    if (raw == null && !option.required) continue;
    if (option.parent_id && !chosen.has(option.parent_id)) {
      const parent = options.find((item) => item.id === option.parent_id);
      return { error: `${option.label} needs ${parent?.label ?? "another option"}.` };
    }
    let qty = 1;
    if (option.quantity_label) {
      qty = Number(raw ?? 1);
      if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QUANTITY) {
        return { error: `Enter ${option.quantity_label} as a whole number from 1 to ${MAX_QUANTITY}.` };
      }
    }
    chosen.add(option.id);
    lines.push({ option, qty, units: Math.max(0, qty - (option.included || 0)) });
  }

  let baseCents = 0;
  for (const { option, units } of lines) {
    if (option.in_base) baseCents += option.price * units;
  }
  const priced = lines.map(({ option, qty, units }) => ({
    id: option.id,
    label: option.label,
    qty: option.quantity_label ? qty : null,
    unit: option.quantity_label || null,
    cents:
      option.price_unit === "percent"
        ? Math.round((baseCents * option.price * units) / 100)
        : option.price * units,
  }));
  const totalCents = priced.reduce((sum, line) => sum + line.cents, 0);
  return { lines: priced, baseCents, totalCents };
}

export function describeLine(line) {
  const unit = line.unit && line.unit.toLowerCase() !== line.label.toLowerCase() ? ` ${line.unit}` : "";
  const qty = line.qty != null ? ` × ${line.qty}${unit}` : "";
  return `${line.label}${qty}: ${formatCents(line.cents)}`;
}

const int = (value) => (Number.isFinite(Number(value)) ? Math.round(Number(value)) : NaN);

// Validate a whole price list for one queue. Parents must come before their children.
export function normalizeOptions(list) {
  if (!Array.isArray(list)) return { error: "Send the option list." };
  if (list.length > MAX_OPTIONS) return { error: `Use at most ${MAX_OPTIONS} options per queue.` };
  const seen = new Map();
  const options = [];
  for (const [position, raw] of list.entries()) {
    const id = String(raw?.id ?? "").trim().slice(0, 64);
    const label = String(raw?.label ?? "").trim().slice(0, 80);
    if (!/^[\w-]+$/.test(id) || seen.has(id)) return { error: `Option ${position + 1} has a bad id.` };
    if (!label) return { error: `Option ${position + 1} needs a label.` };
    const price_unit = raw?.price_unit === "percent" ? "percent" : "usd";
    const price = int(raw?.price);
    const max = price_unit === "percent" ? MAX_PERCENT : MAX_CENTS;
    if (!(price >= 0 && price <= max)) return { error: `${label} has a price out of range.` };
    const parent_id = raw?.parent_id ? String(raw.parent_id) : null;
    if (parent_id && !seen.has(parent_id)) {
      return { error: `${label} must be listed after the option it depends on.` };
    }
    const quantity_label = String(raw?.quantity_label ?? "").trim().slice(0, 20);
    const included = quantity_label ? int(raw?.included ?? 0) : 0;
    if (!(included >= 0 && included <= MAX_QUANTITY)) return { error: `${label} has a bad included count.` };
    if (raw?.required && parent_id && !seen.get(parent_id).required) {
      return { error: `${label} is required, so the option it depends on must be required too.` };
    }
    const in_base = price_unit === "usd" && !!raw?.in_base;
    const option = {
      id,
      parent_id,
      position,
      label,
      price,
      price_unit,
      in_base: in_base ? 1 : 0,
      required: raw?.required ? 1 : 0,
      quantity_label,
      included,
    };
    seen.set(id, option);
    options.push(option);
  }
  return { options };
}
