import { useState } from "react";
import { SheetActions } from "../fulfillment/SheetView.jsx";
import { centsFromDollars, dollarInput, money } from "../fulfillment/sheets.js";
import { ops, opsUpload, useOps } from "./api.js";
import { Notice } from "./Notice.jsx";

const KINDS = [
  ["print", "Print"],
  ["sticker", "Sticker"],
  ["keychain", "Keychain"],
  ["other", "Other"],
];

const blankHq = {
  recipient: "",
  line1: "",
  line2: "",
  city: "",
  region: "",
  postalCode: "",
  country: "US",
  phone: "",
};

function monthLabel(month) {
  const [year, m] = String(month).split("-");
  if (!year || !m) return month;
  return new Date(Number(year), Number(m) - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
}

function dayLabel(iso) {
  const [year, m, d] = String(iso).slice(0, 10).split("-");
  if (!year || !m || !d) return iso;
  return new Date(Number(year), Number(m) - 1, Number(d)).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function unfulfilled(count, extra, amounts, hqExtra) {
  const quantityEmpty = count === "" || count == null;
  const extras = extra === "" || extra == null ? (hqExtra == null ? 0 : Number(hqExtra)) : Number(extra);
  return quantityEmpty && extras === 0 && !(amounts || []).length;
}

function pledgeLabel(tiers, cents) {
  const tier = tiers.find((row) => row.amount_cents === cents);
  return tier ? `${tier.title} ${money(cents)}` : money(cents);
}

function pledgeChoices(tiers, selected) {
  const amounts = new Set(tiers.map((tier) => tier.amount_cents));
  for (const amount of selected || []) amounts.add(amount);
  return [...amounts].filter((amount) => Number.isInteger(amount)).sort((a, b) => a - b);
}

function kindLabel(kind, note) {
  if (kind === "other") return note || "Other";
  return KINDS.find(([value]) => value === kind)?.[1] || kind;
}

function shipmentFor(shipments, month, patronId) {
  return shipments.find((row) => row.month === month && row.dest === "patron" && row.patreon_id === patronId);
}

export function FulfillmentTab() {
  const { data, error, reload, run } = useOps("fulfillment");
  const [month, setMonth] = useState("");
  const [added, setAdded] = useState([]);
  const [notice, setNotice] = useState("");

  const months = data
    ? [...new Set([...data.items.map((item) => item.month), ...data.months.map((row) => row.month), ...added])].sort()
    : [];

  const selected = month || months[months.length - 1] || "";
  const locked = data?.months.find((row) => row.month === selected)?.locked_at || "";
  const lines = data?.items.filter((item) => item.month === selected) || [];

  const act = (request) =>
    run(request).then((result) => {
      setNotice("");
      return result;
    });

  const addMonth = (value) => {
    if (!value) return;
    setAdded((current) => (current.includes(value) ? current : [...current, value]));
    setMonth(value);
  };

  if (!data) {
    return (
      <div className="panel">
        <Notice error={error} />
      </div>
    );
  }

  return (
    <>
      {data.edits.length ? (
        <section className="panel ops__section fulfill-alert">
          <h2 className="panel__title">Price changes</h2>
          <ul className="ops__list">
            {data.edits.map((edit) => (
              <li key={edit.id}>
                {edit.good_name || "An item"} was {money(edit.old_price_cents)}, now {money(edit.new_price_cents)}
              </li>
            ))}
          </ul>
          <button type="button" className="ops__btn" onClick={() => act(() => ops("fulfillment/edits", { method: "POST" }))}>
            Dismiss
          </button>
        </section>
      ) : null}

      <section className="panel fulfill-desk">
        <Notice error={error || notice} />
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
                <span>{isLocked ? "Locked" : count ? `${count} ${count === 1 ? "item" : "items"}` : "Empty"}</span>
              </button>
            );
          })}
          <label className="field fulfill-add">
            <span className="ops__muted">Add month</span>
            <input type="month" onChange={(event) => addMonth(event.target.value)} />
          </label>
        </aside>

        {selected ? (
          <MonthPane
            month={selected}
            locked={locked}
            lines={lines}
            data={data}
            act={act}
            reload={reload}
            onError={setNotice}
          />
        ) : (
          <p className="ops__muted">Choose a month.</p>
        )}
      </section>

      <details className="panel ops__section fulfill-fold">
        <summary>
          <span className="panel__title">Catalog</span>
        </summary>
        <Catalog goods={data.goods} act={act} />
      </details>

      <details className="panel ops__section fulfill-fold">
        <summary>
          <span className="panel__title">Headquarters</span>
        </summary>
        <HeadquartersForm
          settings={data.settings}
          onSave={(body) => act(() => ops("fulfillment/settings", { method: "PUT", body }))}
        />
      </details>

      <details className="panel ops__section fulfill-fold">
        <summary>
          <span className="panel__title">Partner login</span>
        </summary>
        <PassphraseForm
          settings={data.settings}
          onSave={(body) => act(() => ops("fulfillment/settings", { method: "PUT", body }))}
        />
      </details>
    </>
  );
}

function MonthPane({ month, locked, lines, data, act, reload, onError }) {
  const invoices = data.invoices
    .filter((invoice) => invoice.month === month)
    .sort((a, b) => Number(Boolean(a.paid_at)) - Number(Boolean(b.paid_at)));
  const missing = data.patrons.filter((patron) => {
    const shipment = shipmentFor(data.shipments, month, patron.patreon_id);
    return !(shipment ? shipment.line1 : patron.line1);
  }).length;

  return (
    <div className="fulfill-pane">
      <header className="fulfill-head">
        <div className="fulfill-head__title">
          <h2 className="fulfill-month">{monthLabel(month)}</h2>
          {locked ? <p className="ops__status">Locked {dayLabel(locked)}</p> : null}
        </div>
        <SheetActions base="/api/ops/fulfillment/sheets" month={month} onError={onError} />
      </header>

      <section className="fulfill-block">
        <h3 className="panel__title">Order</h3>
        <OrderTable
          key={month}
          month={month}
          locked={locked}
          lines={lines}
          goods={data.goods}
          tiers={data.tiers}
          spareDefault={data.settings.extraCopies}
          act={act}
          reload={reload}
          onError={onError}
        />
      </section>

      <section className="fulfill-block fulfill-block--later">
        <div className="ops__bar">
          <h3 className="panel__title">Patrons</h3>
          {missing ? <p className="ops__status">{missing} without an address</p> : null}
          <button type="button" className="ops__btn" onClick={() => act(() => ops("fulfillment/sync", { method: "POST" }))}>
            Sync from Patreon
          </button>
        </div>
        {data.patrons.length ? (
          <div className="ops__scroll">
            <table className="ops__table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Pledge</th>
                  <th>Address</th>
                  <th>Tracking</th>
                  <th>Shipped</th>
                </tr>
              </thead>
              <tbody>
                {data.patrons.map((patron) => {
                  const shipment = shipmentFor(data.shipments, month, patron.patreon_id);
                  const line1 = shipment ? shipment.line1 : patron.line1;
                  return (
                    <tr key={patron.patreon_id}>
                      <td>{patron.name || patron.email}</td>
                      <td>{money(patron.amount_cents)}</td>
                      <td>{line1 ? "" : "No address"}</td>
                      <td>{shipment?.tracking || ""}</td>
                      <td>{shipment?.fulfilled ? "Shipped" : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="ops__muted">None.</p>
        )}
      </section>

      <section className="fulfill-block fulfill-block--later">
        <h3 className="panel__title">Invoices</h3>
        {invoices.length ? (
          <div className="ops__scroll">
            <table className="ops__table">
              <thead>
                <tr>
                  <th>Amount</th>
                  <th>Note</th>
                  <th>File</th>
                  <th>Paid</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>{money(invoice.amount_cents)}</td>
                    <td>{invoice.note}</td>
                    <td>
                      <a href={`/api/ops/fulfillment/invoices/${invoice.id}/file`}>{invoice.filename}</a>
                    </td>
                    <td>{invoice.paid_at ? dayLabel(invoice.paid_at) : ""}</td>
                    <td>
                      {invoice.paid_at ? null : (
                        <button
                          type="button"
                          className="ops__btn"
                          onClick={() => act(() => ops(`fulfillment/invoices/${invoice.id}/paid`, { method: "POST" }))}
                        >
                          Mark paid
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="ops__muted">None.</p>
        )}
      </section>
    </div>
  );
}

function OrderTable({ month, locked, lines, goods, tiers, spareDefault, act, reload, onError }) {
  const [open, setOpen] = useState(null);
  const span = locked ? 6 : 7;
  return (
    <div className="ops__scroll">
      <table className="ops__table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Price</th>
            <th>Quantity</th>
            <th>Extra copies</th>
            <th>Files</th>
            <th>Tiers</th>
            {locked ? null : <th></th>}
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <LineRow
              key={line.id}
              line={line}
              tiers={tiers}
              spareDefault={spareDefault}
              locked={Boolean(locked)}
              open={open === line.id}
              onToggle={() => setOpen((current) => (current === line.id ? null : line.id))}
              act={act}
              reload={reload}
              onError={onError}
            />
          ))}
          {locked ? null : (
            <tr>
              <td colSpan={span}>
                {open === "new" ? (
                  <div className="fulfill-edit">
                    <LineForm
                      goods={goods}
                      tiers={tiers}
                      spareDefault={spareDefault}
                      onCancel={() => setOpen(null)}
                      initial={{
                        print_good_id: goods[0]?.id || "",
                        price_cents: goods[0]?.price_cents ?? "",
                        count: "",
                        extra_copies: "",
                        amounts: [],
                        inclusive: 0,
                      }}
                      onSave={async (body) => {
                        const result = await act(() =>
                          ops("fulfillment/items", { method: "POST", body: { ...body, drop_on: `${month}-01` } })
                        );
                        if (result) setOpen(null);
                      }}
                    />
                  </div>
                ) : (
                  <div className="ops__actions">
                    {goods.length ? (
                      <button type="button" className="ops__btn" onClick={() => setOpen("new")}>
                        Add
                      </button>
                    ) : (
                      <p className="ops__muted">Nothing in the catalog.</p>
                    )}
                  </div>
                )}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function LineRow({ line, tiers, spareDefault, locked, open, onToggle, act, reload, onError }) {
  const names = (line.amounts || []).map((amount) => pledgeLabel(tiers, amount));
  return (
    <>
      <tr>
        <td>{line.good_name}</td>
        <td>{money(line.price_cents)}</td>
        <td>{line.count ?? 1}</td>
        <td>{line.extra_copies ?? ""}</td>
        <td>
          {line.assets.map((asset, index) => (
            <span key={asset.id}>
              {index ? ", " : ""}
              <a href={`/api/ops/fulfillment/assets/${asset.id}`}>{asset.filename}</a>
            </span>
          ))}
        </td>
        <td>{names.join(", ")}</td>
        {locked ? null : (
          <td>
            <button type="button" className="ops__btn" aria-expanded={open} onClick={onToggle}>
              {open ? "Close" : "Edit"}
            </button>
          </td>
        )}
      </tr>
      {unfulfilled(line.count, line.extra_copies, line.amounts, spareDefault) ? (
        <tr>
          <td className="fulfill-warn" colSpan={locked ? 6 : 7}>
            warning this item is not being fulfilled
          </td>
        </tr>
      ) : null}
      {open ? (
        <tr>
          <td colSpan={locked ? 6 : 7}>
            <div className="fulfill-edit">
              <LineForm
                goods={[{ id: line.print_good_id, name: line.good_name, price_cents: line.price_cents }]}
                tiers={tiers}
                spareDefault={spareDefault}
                initial={{
                  print_good_id: line.print_good_id,
                  price_cents: line.price_cents,
                  count: line.count ?? "",
                  extra_copies: line.extra_copies ?? "",
                  amounts: line.amounts || [],
                  inclusive: line.inclusive ? 1 : 0,
                }}
                onSave={(body) =>
                  act(() =>
                    ops(`fulfillment/items/${line.id}`, {
                      method: "PATCH",
                      body: {
                        price_cents: body.price_cents,
                        count: body.count,
                        extra_copies: body.extra_copies,
                        amounts: body.amounts,
                        inclusive: body.inclusive,
                      },
                    })
                  )
                }
              />
              <ul className="ops__list">
                {line.assets.map((asset) => (
                  <li key={asset.id}>
                    <a href={`/api/ops/fulfillment/assets/${asset.id}`}>{asset.filename}</a>
                    <button
                      type="button"
                      className="ops__btn"
                      onClick={() => act(() => ops(`fulfillment/items/${line.id}/files/${asset.id}`, { method: "DELETE" }))}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
              <div className="ops__actions">
                <label className="ops__btn">
                  Add file
                  <input
                    type="file"
                    hidden
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (!file) return;
                      opsUpload(`fulfillment/items/${line.id}/files`, file, { name: file.name })
                        .then(() => reload())
                        .catch((err) => onError(err.message));
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="ops__btn ops__btn--danger"
                  onClick={() => act(() => ops(`fulfillment/items/${line.id}`, { method: "DELETE" }))}
                >
                  Remove
                </button>
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function Catalog({ goods, act }) {
  const [adding, setAdding] = useState(false);
  return (
    <section className="ops__section">
      <div className="ops__bar">
        <button type="button" className="ops__btn" aria-expanded={adding} onClick={() => setAdding((current) => !current)}>
          {adding ? "Cancel" : "Add"}
        </button>
      </div>
      {adding ? (
        <GoodForm
          onSave={async (body) => {
            const result = await act(() => ops("fulfillment/goods", { method: "POST", body }));
            if (result) setAdding(false);
          }}
        />
      ) : null}
      {goods.length ? (
        <div className="ops__scroll">
          <table className="ops__table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Price</th>
              <th>Stock</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {goods.map((good) => (
              <GoodRow
                key={good.id}
                good={good}
                onSave={(body) => act(() => ops(`fulfillment/goods/${good.id}`, { method: "PATCH", body }))}
                onDelete={() => act(() => ops(`fulfillment/goods/${good.id}`, { method: "DELETE" }))}
              />
            ))}
          </tbody>
        </table>
        </div>
      ) : (
        <p className="ops__muted">None.</p>
      )}
    </section>
  );
}

function HeadquartersForm({ settings, onSave }) {
  const [hq, setHq] = useState({ ...blankHq, ...settings.hq });
  const [extraCopies, setExtraCopies] = useState(settings.extraCopies ?? "");
  const set = (key) => (event) => setHq((current) => ({ ...current, [key]: event.target.value }));
  return (
    <form
      className="ops__form"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({ extraCopies: extraCopies === "" ? null : Number(extraCopies), passphrase: "", hq });
      }}
    >
      <div className="fulfill-address">
        <Field label="Recipient" value={hq.recipient} onChange={set("recipient")} />
        <Field label="Street" value={hq.line1} onChange={set("line1")} />
        <Field label="Apt, suite" value={hq.line2} onChange={set("line2")} />
        <div className="field-row field-row--2">
          <Field label="City" value={hq.city} onChange={set("city")} />
          <Field label="State" value={hq.region} onChange={set("region")} />
        </div>
        <div className="field-row field-row--2">
          <Field label="ZIP" value={hq.postalCode} onChange={set("postalCode")} />
          <Field label="Country" value={hq.country} onChange={set("country")} />
        </div>
        <Field label="Phone" value={hq.phone} onChange={set("phone")} />
      </div>
      <div className="field fulfill-count">
        <label>Extra copies</label>
        <input type="number" min="0" value={extraCopies} onChange={(event) => setExtraCopies(event.target.value)} />
      </div>
      <button type="submit" className="btn btn--quiet">
        Save address
      </button>
    </form>
  );
}

function PassphraseForm({ settings, onSave }) {
  const [passphrase, setPassphrase] = useState("");
  return (
    <form
      className="ops__form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!passphrase.trim()) return;
        onSave({ extraCopies: settings.extraCopies, passphrase, hq: { ...blankHq, ...settings.hq } });
        setPassphrase("");
      }}
    >
      {settings.hasPass ? <p className="ops__muted">Saving signs the partner out.</p> : null}
      <div className="field fulfill-phrase">
        <label>Passphrase</label>
        <input
          type="password"
          value={passphrase}
          onChange={(event) => setPassphrase(event.target.value)}
          autoComplete="new-password"
        />
      </div>
      <button type="submit" className="btn btn--quiet" disabled={!passphrase.trim()}>
        Save
      </button>
    </form>
  );
}

function GoodForm({ onSave, onCancel, initial }) {
  const [form, setForm] = useState({
    name: initial?.name || "",
    price: dollarInput(initial?.price_cents ?? ""),
    kind: initial?.kind || "print",
    kind_note: initial?.kind_note || "",
    in_stock: initial ? Boolean(initial.in_stock) : true,
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
        if (!initial) setForm({ name: "", price: "", kind: "print", kind_note: "", in_stock: true });
      }}
    >
      <div className="field-row">
        <Field label="Name" value={form.name} onChange={set("name")} required />
        <div className="field">
          <label>Price</label>
          <input type="number" min="0" step="0.01" inputMode="decimal" value={form.price} onChange={set("price")} required />
        </div>
        <div className="field">
          <label>Type</label>
          <select value={form.kind} onChange={set("kind")}>
            {KINDS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {form.kind === "other" ? <Field label="Label" value={form.kind_note} onChange={set("kind_note")} required /> : null}
        <label className="ops__check fulfill-stock">
          <input type="checkbox" checked={Boolean(form.in_stock)} onChange={set("in_stock")} />
          In stock
        </label>
      </div>
      <div className="ops__actions">
        <button type="submit" className="ops__btn">
          Save
        </button>
        {onCancel ? (
          <button type="button" className="ops__btn" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

function GoodRow({ good, onSave, onDelete }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <tr>
        <td colSpan={5}>
          <GoodForm
            initial={{
              name: good.name,
              price_cents: good.price_cents,
              kind: good.kind,
              kind_note: good.kind_note,
              in_stock: Boolean(good.in_stock),
            }}
            onCancel={() => setEditing(false)}
            onSave={async (body) => {
              const result = await onSave(body);
              if (result) setEditing(false);
            }}
          />
        </td>
      </tr>
    );
  }
  return (
    <tr>
      <td>{good.name}</td>
      <td>{kindLabel(good.kind, good.kind_note)}</td>
      <td>{money(good.price_cents)}</td>
      <td>{good.in_stock ? "In stock" : "Out"}</td>
      <td>
        <button type="button" className="ops__btn" onClick={() => setEditing(true)}>
          Edit
        </button>
        <button type="button" className="ops__btn ops__btn--danger" onClick={onDelete}>
          Delete
        </button>
      </td>
    </tr>
  );
}

function LineForm({ goods, tiers, spareDefault, onSave, onCancel, initial }) {
  const [form, setForm] = useState(() => {
    const start = initial || {
      print_good_id: goods[0]?.id || "",
      price_cents: goods[0]?.price_cents ?? "",
      count: "",
      extra_copies: "",
      amounts: [],
      inclusive: 0,
    };
    return { ...start, price: dollarInput(start.price_cents) };
  });
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  return (
    <form
      className="ops__form"
      onSubmit={(event) => {
        event.preventDefault();
        const price_cents = centsFromDollars(form.price);
        if (price_cents == null) return;
        onSave({
          print_good_id: form.print_good_id,
          amounts: form.amounts,
          inclusive: form.inclusive ? 1 : 0,
          price_cents,
          count: form.count === "" ? null : Number(form.count),
          extra_copies: form.extra_copies === "" ? null : Number(form.extra_copies),
        });
      }}
    >
      <div className="field-row">
        <div className="field">
          <label>Item</label>
          <select
            value={form.print_good_id}
            onChange={(event) => {
              const good = goods.find((item) => item.id === event.target.value);
              setForm((current) => ({
                ...current,
                print_good_id: event.target.value,
                price: good ? dollarInput(good.price_cents) : current.price,
              }));
            }}
          >
            {goods.map((good) => (
              <option key={good.id} value={good.id}>
                {good.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Price</label>
          <input type="number" min="0" step="0.01" inputMode="decimal" value={form.price} onChange={set("price")} required />
        </div>
        <div className="field">
          <label>Quantity</label>
          <input type="number" min="0" value={form.count} onChange={set("count")} />
        </div>
        <div className="field">
          <label>Extra copies</label>
          <input type="number" min="0" value={form.extra_copies} onChange={set("extra_copies")} />
        </div>
      </div>
      <div className="ops__actions">
        {pledgeChoices(tiers, form.amounts).map((amount) => (
          <label key={amount} className="ops__check">
            <input
              type="checkbox"
              checked={form.amounts.includes(amount)}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  amounts: event.target.checked
                    ? [...current.amounts, amount]
                    : current.amounts.filter((value) => value !== amount),
                }))
              }
            />
            {pledgeLabel(tiers, amount)}
          </label>
        ))}
        <label className="ops__check">
          <input
            type="checkbox"
            checked={Boolean(form.inclusive)}
            onChange={(event) => setForm((current) => ({ ...current, inclusive: event.target.checked ? 1 : 0 }))}
          />
          Higher pledges
        </label>
      </div>
      {unfulfilled(form.count, form.extra_copies, form.amounts, spareDefault) ? (
        <p className="fulfill-warn">warning this item is not being fulfilled</p>
      ) : null}
      <div className="ops__actions">
        <button type="submit" className="ops__btn">
          Save
        </button>
        {onCancel ? (
          <button type="button" className="ops__btn" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

function Field({ label, value, onChange, required }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input value={value} onChange={onChange} required={required} />
    </div>
  );
}
