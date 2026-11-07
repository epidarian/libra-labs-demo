import { useEffect, useMemo, useState } from "react";
import { Logo } from "../components/Logo.jsx";
import { TopTools } from "../components/TopTools.jsx";
import { Viewport } from "../components/Viewport.jsx";
import { centsFromDollars, dollarInput, money } from "../fulfillment/sheets.js";
import { SheetActions, SheetView, sheetQuery } from "../fulfillment/SheetView.jsx";
import { siteHref } from "../ops/route.js";
import { Notice } from "../ops/Notice.jsx";

const KINDS = [
  ["print", "Print"],
  ["sticker", "Sticker"],
  ["keychain", "Keychain"],
  ["other", "Other"],
];

async function partner(path, { method = "GET", body } = {}) {
  const res = await fetch(`/api/partner/${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
  return data;
}

export function PartnerPanel() {
  const printing = sheetQuery();
  const [access, setAccess] = useState(null);

  useEffect(() => {
    fetch("/api/partner/access")
      .then((res) => setAccess(res.ok))
      .catch(() => setAccess(false));
  }, []);

  if (access === null) return null;
  if (!access) return <PartnerGate onUnlock={() => setAccess(true)} />;
  if (printing) return <SheetView kind={printing.kind} month={printing.month} />;

  return (
    <div className="station">
      <Viewport />
      <div className="console">
        <header className="topbar">
          <a className="brand" href={siteHref("/")}>
            <Logo className="brand__mark" />
            <span className="brand__name">Libra Labs</span>
          </a>
          <p className="tagline">
            <span className="pill">Partner</span>
          </p>
          <TopTools />
        </header>
        <div className="well">
          <main className="view ops">
            <header className="window-head">
              <h1>Fulfillment desk</h1>
            </header>
            <Desk />
          </main>
        </div>
      </div>
    </div>
  );
}

function PartnerGate({ onUnlock }) {
  const [value, setValue] = useState("");
  useEffect(() => {
    const previous = document.title;
    document.title = "404 Not Found";
    return () => {
      document.title = previous;
    };
  }, []);
  const submit = async (event) => {
    event.preventDefault();
    const res = await fetch("/api/partner/access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: value }),
    }).catch(() => null);
    setValue("");
    if (res?.ok) onUnlock();
  };
  return (
    <div className="notfound">
      <h1>404 Not Found</h1>
      <p>The requested URL was not found on this server.</p>
      <form onSubmit={submit}>
        <input value={value} onChange={(event) => setValue(event.target.value)} autoComplete="off" spellCheck={false} />
      </form>
      <hr />
      <address>Server at {window.location.host}</address>
    </div>
  );
}

function Desk() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [month, setMonth] = useState("");

  const load = () =>
    partner("")
      .then((next) => {
        setData(next);
        setError("");
      })
      .catch((err) => setError(err.message));

  useEffect(() => {
    load();
  }, []);

  const months = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.items.map((item) => item.month))].sort();
  }, [data]);
  const selected = month || months[months.length - 1] || "";

  const run = async (request) => {
    setError("");
    try {
      await request();
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  if (!data) return <Notice error={error} />;
  const lines = data.items.filter((item) => item.month === selected);
  const locked = data.months.find((row) => row.month === selected)?.locked_at || "";
  const ready =
    Boolean(selected) &&
    data.today >= `${selected}-01` &&
    lines.length > 0 &&
    lines.every((line) => line.amounts?.length && line.in_stock);
  const shipments = data.shipments.filter((row) => row.month === selected);

  return (
    <div className="panel ops__stack">
      <Notice error={error} />
      <div className="ops__actions">
        {months.map((item) => (
          <button key={item} type="button" className="ops__btn" aria-pressed={item === selected} onClick={() => setMonth(item)}>
            {item}
          </button>
        ))}
      </div>
      {selected ? (
        <>
          <p className="ops__status">{locked ? `Locked ${locked.slice(0, 10)}` : `Today ${data.today}`}</p>
          <section className="ops__section">
            <h2>Print files</h2>
            <ul className="ops__list">
              {lines.flatMap((line) =>
                line.assets.map((asset) => (
                  <li key={asset.id}>
                    <a href={`/api/partner/assets/${asset.id}`}>
                      {line.good_name}: {asset.filename}
                    </a>
                  </li>
                ))
              )}
            </ul>
            <SheetActions base="/api/partner/sheets" month={selected} onError={setError} />
            <button
              type="button"
              className="btn"
              disabled={!ready || Boolean(locked)}
              onClick={() => run(() => partner(`months/${selected}/lock`, { method: "POST" }))}
            >
              Lock month
            </button>
          </section>
          {locked ? (
            <section className="ops__section">
              <h2>Shipments</h2>
              <div className="ops__scroll">
              <table className="ops__table">
                <thead>
                  <tr>
                    <th>To</th>
                    <th>Address</th>
                    <th>Tracking</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {shipments.map((row) => (
                    <ShipmentRow key={row.id} row={row} onSave={(body) => run(() => partner(`shipments/${row.id}`, { method: "PATCH", body }))} />
                  ))}
                </tbody>
              </table>
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <p className="ops__muted">No month has been prepared.</p>
      )}

      <section className="ops__section">
        <h2>Catalog</h2>
        {data.goods.map((good) => (
          <GoodEdit key={good.id} good={good} onSave={(body) => run(() => partner(`goods/${good.id}`, { method: "PATCH", body }))} />
        ))}
      </section>

      <section className="ops__section">
        <h2>Invoice</h2>
        <InvoiceForm
          month={selected}
          onDone={load}
          onError={setError}
        />
        <div className="ops__scroll">
        <table className="ops__table">
          <thead>
            <tr>
              <th>Month</th>
              <th>Amount</th>
              <th>Note</th>
              <th>File</th>
              <th>Paid</th>
            </tr>
          </thead>
          <tbody>
            {data.invoices.map((invoice) => (
              <tr key={invoice.id}>
                <td>{invoice.month}</td>
                <td>{money(invoice.amount_cents)}</td>
                <td>{invoice.note}</td>
                <td>
                  <a href={`/api/partner/invoices/${invoice.id}/file`}>{invoice.filename}</a>
                </td>
                <td>{invoice.paid_at ? "Paid" : "Open"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>
    </div>
  );
}

function ShipmentRow({ row, onSave }) {
  const [tracking, setTracking] = useState(row.tracking || "");
  const address = row.line1
    ? [row.recipient, row.line1, row.line2, row.city, row.region, row.postal_code, row.country].filter(Boolean).join(", ")
    : `${row.recipient} · Address missing`;
  return (
    <tr>
      <td>{row.dest === "hq" ? "Headquarters" : "Patron"}</td>
      <td>{address}</td>
      <td>
        <input value={tracking} onChange={(event) => setTracking(event.target.value)} />
      </td>
      <td>
        <button type="button" className="ops__btn" onClick={() => onSave({ tracking })}>
          Save tracking
        </button>
        {row.fulfilled ? (
          <span className="ops__muted">Fulfilled</span>
        ) : (
          <button type="button" className="ops__btn" onClick={() => onSave({ tracking, fulfilled: true })}>
            Mark fulfilled
          </button>
        )}
      </td>
    </tr>
  );
}

function GoodEdit({ good, onSave }) {
  const [form, setForm] = useState({
    name: good.name,
    price: dollarInput(good.price_cents),
    kind: good.kind,
    kind_note: good.kind_note,
    in_stock: Boolean(good.in_stock),
  });
  const set = (key) => (event) => {
    const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
    setForm((current) => ({ ...current, [key]: value }));
  };
  return (
    <form
      className="ops__form"
      onSubmit={(event) => {
        event.preventDefault();
        const price_cents = centsFromDollars(form.price);
        if (price_cents == null) return;
        onSave({
          name: form.name,
          kind: form.kind,
          kind_note: form.kind_note,
          price_cents,
          in_stock: Boolean(form.in_stock),
        });
      }}
    >
      <div className="field-row">
        <label className="field">
          Name
          <input value={form.name} onChange={set("name")} />
        </label>
        <label className="field">
          Price
          <input type="number" min="0" step="0.01" inputMode="decimal" value={form.price} onChange={set("price")} />
        </label>
        <label className="field">
          Type
          <select value={form.kind} onChange={set("kind")}>
            {KINDS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {form.kind === "other" ? (
          <label className="field">
            Label
            <input value={form.kind_note} onChange={set("kind_note")} />
          </label>
        ) : null}
        <label className="ops__check fulfill-stock">
          <input type="checkbox" checked={Boolean(form.in_stock)} onChange={set("in_stock")} />
          In stock
        </label>
      </div>
      <button type="submit" className="ops__btn">
        Save {good.name}
      </button>
    </form>
  );
}

function InvoiceForm({ month, onDone, onError }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState(null);
  return (
    <form
      className="ops__form"
      onSubmit={(event) => {
        event.preventDefault();
        const amount_cents = centsFromDollars(amount);
        if (!month || !file || amount_cents == null) return;
        const params = new URLSearchParams({
          month,
          amount_cents: String(amount_cents),
          note,
          name: file.name,
        });
        fetch(`/api/partner/invoices?${params}`, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        })
          .then(async (res) => {
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
            setAmount("");
            setNote("");
            setFile(null);
            onDone();
          })
          .catch((err) => onError(err.message));
      }}
    >
      <div className="field-row">
        <label className="field">
          Amount
          <input type="number" min="0" step="0.01" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} required />
        </label>
        <label className="field">
          Note
          <input value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        <label className="field">
          File
          <input type="file" onChange={(event) => setFile(event.target.files?.[0] || null)} required />
        </label>
      </div>
      <button type="submit" className="btn" disabled={!month}>
        Upload invoice
      </button>
    </form>
  );
}
