import { useCallback, useEffect, useState } from "react";
import { Logo } from "../components/Logo.jsx";
import { TopTools } from "../components/TopTools.jsx";
import { Viewport } from "../components/Viewport.jsx";
import { Catalog, priceError } from "../fulfillment/Goods.jsx";
import {
  addressLine,
  audienceLabel,
  centsFromDollars,
  dayLabel,
  lockBlockers,
  money,
  monthLabel,
  monthView,
} from "../fulfillment/sheets.js";
import { SheetActions, SheetView, sheetQuery } from "../fulfillment/SheetView.jsx";
import { Dropzone, sizeLabel } from "../ops/files.jsx";
import { useConfirm } from "../ops/Modal.jsx";
import { Notice } from "../ops/Notice.jsx";
import { siteHref } from "../ops/route.js";
import {
  Empty,
  Field,
  SectionHead,
  Segmented,
  Status,
  Tip,
  ToastProvider,
  plural,
  useDirty,
  useLeaveGuard,
  useToast,
} from "../ops/ui.jsx";

const MAX_INVOICE_FILE = 20 * 1024 * 1024;

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

function uploadInvoice(fields, file, onProgress) {
  const params = new URLSearchParams(fields);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", `/api/partner/invoices?${params}`);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      let data = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        data = {};
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data.error || `Request failed (${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error("The upload did not reach the server."));
    xhr.send(file);
  });
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
    <ToastProvider>
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
    </ToastProvider>
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
  const [ask, confirmDialog] = useConfirm();
  useLeaveGuard();

  const load = useCallback(
    () =>
      partner("")
        .then((next) => {
          setData(next);
          setError("");
          return next;
        })
        .catch((err) => {
          setError(err.message);
          return null;
        }),
    []
  );

  useEffect(() => {
    load();
  }, [load]);

  // Run a change, then reload. Throws on failure so dialogs can show why.
  const send = useCallback(
    async (request) => {
      const result = await request();
      await load();
      return result;
    },
    [load]
  );

  if (!data) {
    return (
      <div className="panel">
        <Notice error={error} loading={!error} />
      </div>
    );
  }

  const thisMonth = data.today.slice(0, 7);
  const months = [
    ...new Set([
      ...data.items.map((item) => item.month),
      ...data.months.map((row) => row.month),
      ...data.invoices.map((invoice) => invoice.month),
    ]),
  ].sort();
  const selected = months.includes(month) ? month : months.includes(thisMonth) ? thisMonth : months[months.length - 1] || "";
  const outOfStock = data.goods.filter((good) => !good.in_stock).length;

  return (
    <>
      <Notice error={error} />
      <section className="panel fulfill-desk">
        <aside className="fulfill-rail" aria-label="Months">
          {months.map((item) => {
            const count = data.items.filter((line) => line.month === item).length;
            const isLocked = data.months.some((row) => row.month === item && row.locked_at);
            return (
              <button
                key={item}
                type="button"
                className="fulfill-month-btn"
                aria-pressed={item === selected}
                onClick={() => setMonth(item)}
              >
                <strong>{monthLabel(item)}</strong>
                <span>{isLocked ? "Locked" : count ? plural(count, "item") : "Empty"}</span>
              </button>
            );
          })}
        </aside>
        {selected ? (
          <MonthPane key={selected} data={data} view={monthView(data, selected)} send={send} ask={ask} />
        ) : (
          <Empty>No month has been prepared yet.</Empty>
        )}
      </section>

      <details className="panel ops__section fold">
        <summary>
          <span className="fold__title">Catalog</span>
          <span className="fold__meta">
            {plural(data.goods.length, "item")}
            {outOfStock ? <Status tone="warn">{outOfStock} out of stock</Status> : null}
          </span>
        </summary>
        <div className="fold__body">
          <Catalog
            partner
            goods={data.goods}
            items={data.items}
            create={(body) => send(() => partner("goods", { method: "POST", body }))}
            update={(id, body) => send(() => partner(`goods/${id}`, { method: "PATCH", body }))}
          />
        </div>
      </details>
      {confirmDialog}
    </>
  );
}

function MonthPane({ data, view, send, ask }) {
  const locked = Boolean(view.lockedAt);
  const name = monthLabel(view.month);
  const blockers = lockBlockers(data, view);
  const noAddress = view.receiving.filter((entry) => !entry.patron.line1).length;
  const parcels = view.receiving.length + (view.extras > 0 ? 1 : 0);

  const lock = () =>
    ask({
      title: `Lock ${name}?`,
      body: (
        <ul className="ops__bullets">
          <li>
            The order is fixed at {plural(view.copies, "copy", "copies")}, {money(view.cents)}.
          </li>
          <li>{plural(parcels, "parcel")} will be created with the addresses on file now.</li>
          {noAddress ? (
            <li>
              {plural(noAddress, "patron")} {noAddress === 1 ? "has" : "have"} no address. That cannot be filled in after locking.
            </li>
          ) : null}
          <li>This cannot be undone.</li>
        </ul>
      ),
      label: "Lock",
      danger: false,
      action: () => send(() => partner(`months/${view.month}/lock`, { method: "POST" })),
      done: `${name} is locked.`,
    });

  return (
    <div className="fulfill-pane">
      <header className="fulfill-head">
        <h2 className="fulfill-month">{name}</h2>
        {locked ? <Status tone="ok">Locked {dayLabel(view.lockedAt)}</Status> : <Status tone="info">Not locked</Status>}
        <Tip
          text={
            locked
              ? "The order and parcel list are final."
              : "Until you lock the month the order is a preview and can still change. Locking fixes the quantities and creates the parcel list."
          }
        />
        {locked ? null : (
          <button
            type="button"
            className="btn btn--small fulfill-head__action"
            disabled={blockers.length > 0}
            title={blockers.length ? blockers.join(". ") : undefined}
            onClick={lock}
          >
            Lock month
          </button>
        )}
      </header>

      {!locked && (blockers.length || noAddress) ? (
        <ul className="issues">
          {blockers.map((text) => (
            <li key={text}>
              <Status tone="bad" title="The month cannot be locked until this is fixed">
                {text}
              </Status>
            </li>
          ))}
          {noAddress ? (
            <li>
              <Status tone="warn" title="Ask Libra Labs to chase these before you lock">
                {plural(noAddress, "patron")} without an address
              </Status>
            </li>
          ) : null}
        </ul>
      ) : null}

      <section className="fulfill-block">
        <SectionHead level={3} title="Order" count={view.rows.length} />
        {view.rows.length ? (
          <div className="ops__scroll">
            <table className="ops__table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Goes to</th>
                  <th>
                    Patrons
                    <Tip text="Copies for patrons." />
                  </th>
                  <th>
                    Extra
                    <Tip text="Spare copies shipped to Libra Labs headquarters." />
                  </th>
                  <th>Total</th>
                  <th>Price</th>
                  <th>Cost</th>
                  <th>Print files</th>
                </tr>
              </thead>
              <tbody>
                {view.rows.map((row) => (
                  <tr key={row.line.id}>
                    <td>
                      <span className="ops__pair">
                        <strong>{row.line.good_name}</strong>
                        {!locked && !row.line.in_stock ? <Status tone="bad">Out of stock</Status> : null}
                      </span>
                    </td>
                    <td>{audienceLabel(row.line, data.tiers)}</td>
                    <td>{row.patronQty}</td>
                    <td>{row.extraQty}</td>
                    <td>
                      <strong>{row.copies}</strong>
                    </td>
                    <td>{money(row.price)}</td>
                    <td>{money(row.cents)}</td>
                    <td>
                      {row.line.assets.length ? (
                        row.line.assets.map((asset) => (
                          <a key={asset.id} className="filelink" href={`/api/partner/assets/${asset.id}`} title="Download">
                            {asset.filename}
                          </a>
                        ))
                      ) : (
                        <span className="ops__muted">None</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan={4}>Total</th>
                  <th>{view.copies}</th>
                  <th />
                  <th>{money(view.cents)}</th>
                  <th />
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <Empty>Nothing on this order yet.</Empty>
        )}
      </section>

      <section className="fulfill-block">
        <SectionHead
          level={3}
          title="Sheets"
          help={locked ? "Final, as fixed at the lock." : "A preview. The numbers can change until the month is locked."}
        />
        <SheetActions base="/api/partner/sheets" month={view.month} />
      </section>

      {locked ? <Parcels view={view} send={send} ask={ask} /> : null}

      <Invoices view={view} name={name} send={send} />
    </div>
  );
}

function Parcels({ view, send, ask }) {
  const [filter, setFilter] = useState("waiting");
  const shipped = view.shipments.filter((row) => row.fulfilled);
  const waiting = view.shipments.filter((row) => !row.fulfilled);
  const shown = filter === "waiting" ? waiting : filter === "shipped" ? shipped : view.shipments;
  return (
    <section className="fulfill-block">
      <SectionHead level={3} title="Parcels">
        <Segmented
          label="Parcels to show"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "waiting", label: "To ship", count: waiting.length },
            { value: "shipped", label: "Shipped", count: shipped.length },
            { value: "all", label: "All", count: view.shipments.length },
          ]}
        />
      </SectionHead>
      {shown.length ? (
        <div className="ops__scroll">
          <table className="ops__table">
            <thead>
              <tr>
                <th>Recipient</th>
                <th>Address</th>
                <th>Tracking</th>
                <th>Shipped</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <ParcelRow key={row.id} row={row} send={send} ask={ask} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>{filter === "waiting" && view.shipments.length ? "Everything has shipped." : "None."}</Empty>
      )}
    </section>
  );
}

function ParcelRow({ row, send, ask }) {
  const toast = useToast();
  const [tracking, setTracking] = useState(row.tracking || "");
  const [saving, setSaving] = useState(false);
  const who = row.recipient || (row.dest === "hq" ? "headquarters" : "this patron");
  const changed = tracking.trim() !== (row.tracking || "");
  useDirty(changed, `Tracking for ${who}`);

  const save = async (event) => {
    event.preventDefault();
    if (!changed) return;
    setSaving(true);
    try {
      await send(() => partner(`shipments/${row.id}`, { method: "PATCH", body: { tracking } }));
      toast.ok(`Tracking saved for ${who}.`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const ship = () =>
    ask({
      title: `Mark the parcel for ${who} as shipped?`,
      body: tracking.trim()
        ? `Tracking ${tracking.trim()} is saved with it. This cannot be undone.`
        : "No tracking number is entered. You can add one later, but shipped cannot be undone.",
      label: "Mark shipped",
      danger: false,
      action: () => send(() => partner(`shipments/${row.id}`, { method: "PATCH", body: { tracking, fulfilled: true } })),
      done: `Parcel for ${who} marked shipped.`,
    });

  return (
    <tr>
      <td>
        {row.recipient}
        {row.dest === "hq" ? <span className="chip">Headquarters</span> : null}
      </td>
      <td className="ops__wrap">{row.line1 ? addressLine(row) : <Status tone="bad">Missing</Status>}</td>
      <td>
        <form className="joined" onSubmit={save}>
          <input
            className="ops__input"
            aria-label={`Tracking number for ${who}`}
            maxLength={80}
            value={tracking}
            onChange={(event) => setTracking(event.target.value)}
          />
          <button type="submit" className="ops__btn ops__btn--small" disabled={!changed || saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </form>
      </td>
      <td>
        {row.fulfilled ? (
          <Status tone="ok">{row.fulfilled_at ? dayLabel(row.fulfilled_at) : "Yes"}</Status>
        ) : (
          <button type="button" className="ops__btn ops__btn--small" onClick={ship}>
            Mark shipped
          </button>
        )}
      </td>
    </tr>
  );
}

function Invoices({ view, name, send }) {
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const badAmount = priceError(amount);
  useDirty(Boolean(amount || note || file), `Invoice for ${name}`);

  const pick = (files) => {
    const next = files[0];
    if (!next) return;
    if (next.size > MAX_INVOICE_FILE) {
      setError(`${next.name} is over 20 MB.`);
      return;
    }
    setError(null);
    setFile(next);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (badAmount || !file) return;
    setError(null);
    setProgress(0);
    try {
      await send(() =>
        uploadInvoice(
          { month: view.month, amount_cents: String(centsFromDollars(amount)), note, name: file.name },
          file,
          setProgress
        )
      );
      toast.ok(`Invoice for ${money(centsFromDollars(amount))} uploaded.`);
      setAmount("");
      setNote("");
      setFile(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setProgress(null);
    }
  };

  return (
    <section className="fulfill-block">
      <SectionHead level={3} title="Invoices" count={view.invoices.length} />
      {view.invoices.length ? (
        <div className="ops__scroll">
          <table className="ops__table">
            <thead>
              <tr>
                <th>Amount</th>
                <th>Note</th>
                <th>File</th>
                <th>Paid</th>
              </tr>
            </thead>
            <tbody>
              {view.invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td>{money(invoice.amount_cents)}</td>
                  <td>{invoice.note}</td>
                  <td>
                    <a href={`/api/partner/invoices/${invoice.id}/file`} title="Download">
                      {invoice.filename || "Download"}
                    </a>
                  </td>
                  <td>
                    {invoice.paid_at ? <Status tone="ok">{dayLabel(invoice.paid_at)}</Status> : <span className="ops__muted">Not yet</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <form className="ops__form invoice-form" onSubmit={submit}>
        {error ? (
          <p className="ops__error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="field-row field-row--2">
          <Field label="Invoice total ($)" error={amount && badAmount ? badAmount : null}>
            {(props) => (
              <input {...props} inputMode="decimal" placeholder="0.00" value={amount} onChange={(event) => setAmount(event.target.value)} />
            )}
          </Field>
          <Field label="Note">
            {(props) => <input {...props} value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} />}
          </Field>
        </div>
        <Dropzone
          label={file ? file.name : "Drop the invoice here or click to choose"}
          hint={file ? sizeLabel(file.size) : "Up to 20 MB"}
          onFiles={pick}
          progress={progress}
        />
        <div className="ops__actions">
          <button
            type="submit"
            className="btn btn--small"
            disabled={Boolean(badAmount) || !file || progress != null}
            title="An uploaded invoice cannot be removed, so check the total first"
          >
            {progress != null ? "Uploading…" : `Upload invoice for ${name}`}
          </button>
        </div>
      </form>
    </section>
  );
}
