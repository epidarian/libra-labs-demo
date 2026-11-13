import { useEffect, useState } from "react";
import { onPartner } from "../ops/route.js";
import { ActionButton, useToast } from "../ops/ui.jsx";
import { addressLine, downloadSheet, kindLabel, money, monthLabel, openSheet } from "./sheets.js";

const SHEETS = [
  ["order", "Order sheet", "Every item, how many copies, and the cost"],
  ["fulfillment", "Shipping sheet", "Every parcel with its address and tracking"],
];

/** The two sheets for one month: open to print, or download as CSV or PDF. */
export function SheetActions({ base, month }) {
  const toast = useToast();
  const download = (kind, format) =>
    downloadSheet(base, month, kind, format).catch((err) => toast.error(err.message));
  return (
    <ul className="rows">
      {SHEETS.map(([kind, title, about]) => (
        <li key={kind} className="rows__row">
          <strong className="rows__name" title={about}>
            {title}
          </strong>
          <div className="ops__actions">
            <button
              type="button"
              className="ops__btn ops__btn--small"
              title="Opens in a new tab and starts printing"
              onClick={() => openSheet(month, kind)}
            >
              Print
            </button>
            <ActionButton className="ops__btn ops__btn--small" busyLabel="…" title="Download as a spreadsheet" onClick={() => download(kind, "csv")}>
              CSV
            </ActionButton>
            <ActionButton className="ops__btn ops__btn--small" busyLabel="…" title="Download as a PDF" onClick={() => download(kind, "pdf")}>
              PDF
            </ActionButton>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function sheetQuery() {
  const params = new URLSearchParams(window.location.search);
  const kind = params.get("sheet");
  const month = params.get("month") || "";
  if (kind !== "order" && kind !== "fulfillment") return null;
  return { kind, month };
}

export function SheetView({ kind, month }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const base = onPartner ? "/api/partner/sheets" : "/api/ops/fulfillment/sheets";
    const params = new URLSearchParams({ month, kind });
    fetch(`${base}?${params}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
        setRows(data.rows || []);
      })
      .catch((err) => setError(err.message));
  }, [kind, month]);

  useEffect(() => {
    if (rows) window.setTimeout(() => window.print(), 200);
  }, [rows]);

  const title = kind === "order" ? "Goods to order" : "Fulfillment";
  const list = rows || [];
  const copies = list.reduce((sum, row) => sum + (row.patron_qty || 0) + (row.extra_qty || 0), 0);
  const total = list.reduce((sum, row) => sum + ((row.patron_qty || 0) + (row.extra_qty || 0)) * row.price_cents, 0);

  return (
    <main className="sheet">
      <header className="sheet__head">
        <p className="sheet__who">Libra Labs LLC</p>
        <h1>{title}</h1>
        <p className="sheet__when">{monthLabel(month)}</p>
      </header>
      {error ? <p>{error}</p> : null}
      {kind === "order" ? (
        <table>
          <thead>
            <tr>
              <th>Good</th>
              <th>Type</th>
              <th>Patrons</th>
              <th>Headquarters</th>
              <th>Price</th>
              <th>Line</th>
            </tr>
          </thead>
          <tbody>
            {list.map((row, index) => (
              <tr key={row.item_id || `${row.name}-${row.kind}-${index}`}>
                <td>{row.name}</td>
                <td>{kindLabel(row.kind, row.kind_note)}</td>
                <td>{row.patron_qty}</td>
                <td>{row.extra_qty}</td>
                <td>{money(row.price_cents)}</td>
                <td>{money((row.patron_qty + row.extra_qty) * row.price_cents)}</td>
              </tr>
            ))}
          </tbody>
          {list.length ? (
            <tfoot>
              <tr>
                <th colSpan={2}>Total</th>
                <th colSpan={3}>{copies} copies</th>
                <th>{money(total)}</th>
              </tr>
            </tfoot>
          ) : null}
        </table>
      ) : (
        <table>
          <thead>
            <tr>
              <th>To</th>
              <th>Recipient</th>
              <th>Address</th>
              <th>Tracking</th>
            </tr>
          </thead>
          <tbody>
            {list.map((row, index) => (
              <tr key={row.id || `${row.dest}-${index}`}>
                <td>{row.dest === "hq" ? "Headquarters" : "Patron"}</td>
                <td>{row.recipient}</td>
                <td>{row.address_missing ? "Address missing" : addressLine(row)}</td>
                <td>{row.tracking}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
