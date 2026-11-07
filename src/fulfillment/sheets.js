export function money(cents) {
  return `$${((Number(cents) || 0) / 100).toFixed(2)}`;
}

export function openSheet(month, kind) {
  const url = new URL(window.location.href);
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

