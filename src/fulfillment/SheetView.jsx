import { useEffect, useState } from "react";
import { onPartner } from "../ops/route.js";
import { downloadSheet, money, openSheet } from "./sheets.js";

export function SheetActions({ base, month, onError }) {
  const run = (kind, format) => {
    if (format === "html") {
      openSheet(month, kind);
      return;
    }
    downloadSheet(base, month, kind, format).catch((err) => onError?.(err.message));
  };
  return (
    <div className="ops__actions">
      {["order", "fulfillment"].map((kind) => (
        <span key={kind} className="sheet-actions">
          <span className="ops__muted">{kind === "order" ? "Goods order" : "Fulfillment"}</span>
          {["html", "csv", "pdf"].map((format) => (
            <button key={format} type="button" className="ops__btn" onClick={() => run(kind, format)}>
              {format.toUpperCase()}
            </button>
          ))}
        </span>
      ))}
    </div>
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

  return (
    <main className="sheet">
      <header>
        <p>Libra Labs LLC</p>
        <h1>
          {title} · {month}
        </h1>
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
            {(rows || []).map((row) => (
              <tr key={`${row.name}-${row.kind}`}>
                <td>{row.name}</td>
                <td>{row.kind === "other" ? row.kind_note : row.kind}</td>
                <td>{row.patron_qty}</td>
                <td>{row.extra_qty}</td>
                <td>{money(row.price_cents)}</td>
                <td>{money((row.patron_qty + row.extra_qty) * row.price_cents)}</td>
              </tr>
            ))}
          </tbody>
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
            {(rows || []).map((row, index) => (
              <tr key={row.id || `${row.dest}-${index}`}>
                <td>{row.dest === "hq" ? "Headquarters" : "Patron"}</td>
                <td>{row.recipient}</td>
                <td>
                  {row.address_missing
                    ? "Address missing"
                    : [row.line1, row.line2, row.city, row.region, row.postal_code, row.country]
                        .filter(Boolean)
                        .join(", ")}
                </td>
                <td>{row.tracking}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
