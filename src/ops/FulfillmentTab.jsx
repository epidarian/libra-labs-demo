import { useMemo, useState } from "react";
import { SheetActions } from "../fulfillment/SheetView.jsx";
import { money } from "../fulfillment/sheets.js";
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

export function FulfillmentTab() {
  const { data, error, reload, run } = useOps("fulfillment");
  const [month, setMonth] = useState("");
  const [added, setAdded] = useState([]);
  const [notice, setNotice] = useState("");

  const months = useMemo(() => {
    if (!data) return [];
    return [...new Set([...data.items.map((item) => item.month), ...data.months.map((row) => row.month), ...added])].sort();
  }, [data, added]);

  const selected = month || months[months.length - 1] || "";
  const locked = data?.months.find((row) => row.month === selected)?.locked_at || "";
  const lines = data?.items.filter((item) => item.month === selected) || [];

  const act = (request) => run(request).then(() => setNotice(""));

  if (!data) {
    return (
      <div className="panel">
        <Notice error={error} />
      </div>
    );
  }

  return (
    <div className="panel ops__stack">
      <Notice error={error || notice} />
      {data.edits.length ? (
        <section className="ops__section">
          <h2>Catalog prices changed</h2>
          <ul className="ops__list">
            {data.edits.map((edit) => (
              <li key={edit.id}>
                {edit.good_name || "Good"}: {money(edit.old_price_cents)} to {money(edit.new_price_cents)}
              </li>
            ))}
          </ul>
          <button type="button" className="ops__btn" onClick={() => act(() => ops("fulfillment/edits", { method: "POST" }))}>
            Dismiss
          </button>
        </section>
      ) : null}

      <SettingsForm
        settings={data.settings}
        onSave={(body) => act(() => ops("fulfillment/settings", { method: "PUT", body }))}
      />

      <section className="ops__section">
        <h2>Print goods</h2>
        <GoodForm
          onSave={(body) => act(() => ops("fulfillment/goods", { method: "POST", body }))}
        />
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
            {data.goods.map((good) => (
              <GoodRow
                key={good.id}
                good={good}
                onSave={(body) => act(() => ops(`fulfillment/goods/${good.id}`, { method: "PATCH", body }))}
                onDelete={() => act(() => ops(`fulfillment/goods/${good.id}`, { method: "DELETE" }))}
              />
            ))}
          </tbody>
        </table>
      </section>

      <section className="ops__section">
        <div className="ops__bar">
          <h2>Months</h2>
          <label className="field">
            <span className="ops__muted">Add month</span>
            <input
              type="month"
              onChange={(event) => {
                const value = event.target.value;
                if (!value) return;
                setAdded((current) => (current.includes(value) ? current : [...current, value]));
                setMonth(value);
              }}
            />
          </label>
        </div>
        <div className="ops__actions">
          {months.map((item) => (
            <button
              key={item}
              type="button"
              className="ops__btn"
              aria-pressed={item === selected}
              onClick={() => setMonth(item)}
            >
              {item}
              {data.months.some((row) => row.month === item && row.locked_at) ? " Locked" : ""}
            </button>
          ))}
        </div>
        {selected ? (
          <MonthEditor
            month={selected}
            locked={locked}
            lines={lines}
            goods={data.goods}
            tiers={data.tiers}
            act={act}
            reload={reload}
            onError={setNotice}
          />
        ) : (
          <p className="ops__muted">Add a month to set an order.</p>
        )}
      </section>

      {selected ? (
        <section className="ops__section">
          <div className="ops__bar">
            <h2>Patrons</h2>
            <button type="button" className="ops__btn" onClick={() => act(() => ops("fulfillment/sync", { method: "POST" }))}>
              Sync patrons
            </button>
          </div>
          <div className="ops__scroll">
            <table className="ops__table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Entitled</th>
                  <th>Address</th>
                  <th>Tracking</th>
                  <th>Fulfilled</th>
                </tr>
              </thead>
              <tbody>
                {data.patrons.map((patron) => {
                  const shipment = data.shipments.find(
                    (row) => row.month === selected && row.dest === "patron" && row.patreon_id === patron.patreon_id
                  );
                  const line1 = shipment ? shipment.line1 : patron.line1;
                  return (
                    <tr key={patron.patreon_id}>
                      <td>{patron.name || patron.email}</td>
                      <td>{money(patron.amount_cents)}</td>
                      <td>{line1 ? "Present" : "Missing"}</td>
                      <td>{shipment?.tracking || ""}</td>
                      <td>{shipment?.fulfilled ? "Yes" : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <SheetActions base="/api/ops/fulfillment/sheets" month={selected} onError={setNotice} />
        </section>
      ) : null}

      <section className="ops__section">
        <h2>Invoices</h2>
        <table className="ops__table">
          <thead>
            <tr>
              <th>Month</th>
              <th>Amount</th>
              <th>Note</th>
              <th>File</th>
              <th>Paid</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.invoices.map((invoice) => (
              <tr key={invoice.id}>
                <td>{invoice.month}</td>
                <td>{money(invoice.amount_cents)}</td>
                <td>{invoice.note}</td>
                <td>
                  <a href={`/api/ops/fulfillment/invoices/${invoice.id}/file`}>{invoice.filename}</a>
                </td>
                <td>{invoice.paid_at ? invoice.paid_at.slice(0, 10) : ""}</td>
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
      </section>
    </div>
  );
}

function SettingsForm({ settings, onSave }) {
  const [hq, setHq] = useState({ ...blankHq, ...settings.hq });
  const [extraCopies, setExtraCopies] = useState(settings.extraCopies);
  const [passphrase, setPassphrase] = useState("");
  const set = (key) => (event) => setHq((current) => ({ ...current, [key]: event.target.value }));
  return (
    <form
      className="ops__section ops__form"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({ extraCopies: Number(extraCopies), passphrase, hq });
        setPassphrase("");
      }}
    >
      <h2>Headquarters</h2>
      <p className="ops__muted">{settings.hasPass ? "A partner passphrase is set." : "Set a partner passphrase."}</p>
      <div className="field-row">
        <div className="field">
          <label>Extra copies</label>
          <input type="number" min="0" value={extraCopies} onChange={(event) => setExtraCopies(event.target.value)} />
        </div>
        <div className="field">
          <label>Partner passphrase</label>
          <input value={passphrase} onChange={(event) => setPassphrase(event.target.value)} autoComplete="off" />
        </div>
        <Field label="Recipient" value={hq.recipient} onChange={set("recipient")} />
        <Field label="Street" value={hq.line1} onChange={set("line1")} />
        <Field label="Line 2" value={hq.line2} onChange={set("line2")} />
        <Field label="City" value={hq.city} onChange={set("city")} />
        <Field label="Region" value={hq.region} onChange={set("region")} />
        <Field label="Postal code" value={hq.postalCode} onChange={set("postalCode")} />
        <Field label="Country" value={hq.country} onChange={set("country")} />
        <Field label="Phone" value={hq.phone} onChange={set("phone")} />
      </div>
      <button type="submit" className="btn">
        Save settings
      </button>
    </form>
  );
}

function GoodForm({ onSave, initial }) {
  const [form, setForm] = useState(
    initial || { name: "", price_cents: "", kind: "print", kind_note: "", in_stock: true }
  );
  const set = (key) => (event) => {
    const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
    setForm((current) => ({ ...current, [key]: value }));
  };
  return (
    <form
      className="ops__form"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({ ...form, price_cents: Number(form.price_cents), in_stock: Boolean(form.in_stock) });
        if (!initial) setForm({ name: "", price_cents: "", kind: "print", kind_note: "", in_stock: true });
      }}
    >
      <div className="field-row">
        <Field label="Name" value={form.name} onChange={set("name")} required />
        <div className="field">
          <label>Price (cents)</label>
          <input type="number" min="0" value={form.price_cents} onChange={set("price_cents")} required />
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
        <label className="field">
          <span>In stock</span>
          <input type="checkbox" checked={Boolean(form.in_stock)} onChange={set("in_stock")} />
        </label>
      </div>
      <button type="submit" className="ops__btn">
        {initial ? "Save good" : "Add good"}
      </button>
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
            onSave={async (body) => {
              await onSave(body);
              setEditing(false);
            }}
          />
        </td>
      </tr>
    );
  }
  return (
    <tr>
      <td>{good.name}</td>
      <td>{good.kind === "other" ? good.kind_note : good.kind}</td>
      <td>{money(good.price_cents)}</td>
      <td>{good.in_stock ? "Yes" : "No"}</td>
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

function MonthEditor({ month, locked, lines, goods, tiers, act, reload, onError }) {
  return (
    <div>
      {locked ? <p className="ops__status">Locked {locked.slice(0, 10)}</p> : null}
      {locked ? (
        <ul className="ops__list">
          {lines.map((line) => (
            <li key={line.id}>
              {line.good_name} · {line.drop_on} · {money(line.price_cents)} · patrons {line.count ?? "auto"} · extras{" "}
              {line.extra_copies ?? "default"}
              <div>{line.assets.map((asset) => asset.filename).join(", ")}</div>
            </li>
          ))}
        </ul>
      ) : (
        <>
          <LineForm
            key={month}
            goods={goods}
            tiers={tiers}
            initial={{
              print_good_id: goods[0]?.id || "",
              drop_on: `${month}-01`,
              price_cents: goods[0]?.price_cents ?? "",
              count: "",
              extra_copies: "",
              tier_ids: [],
            }}
            onSave={(body) => act(() => ops("fulfillment/items", { method: "POST", body }))}
          />
          {lines.map((line) => (
            <LineEditor key={line.id} line={line} tiers={tiers} act={act} reload={reload} onError={onError} />
          ))}
        </>
      )}
    </div>
  );
}

function LineForm({ goods, tiers, onSave, initial }) {
  const [form, setForm] = useState(
    initial || {
      print_good_id: goods[0]?.id || "",
      drop_on: "",
      price_cents: goods[0]?.price_cents ?? "",
      count: "",
      extra_copies: "",
      tier_ids: [],
    }
  );
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  return (
    <form
      className="ops__form"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({
          ...form,
          price_cents: form.price_cents === "" ? null : Number(form.price_cents),
          count: form.count === "" ? null : Number(form.count),
          extra_copies: form.extra_copies === "" ? null : Number(form.extra_copies),
        });
      }}
    >
      <div className="field-row">
        <div className="field">
          <label>Good</label>
          <select
            value={form.print_good_id}
            onChange={(event) => {
              const good = goods.find((item) => item.id === event.target.value);
              setForm((current) => ({
                ...current,
                print_good_id: event.target.value,
                price_cents: good ? good.price_cents : current.price_cents,
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
          <label>Drop date</label>
          <input type="date" value={form.drop_on} onChange={set("drop_on")} required />
        </div>
        <div className="field">
          <label>Line price (cents)</label>
          <input type="number" min="0" value={form.price_cents} onChange={set("price_cents")} />
        </div>
        <div className="field">
          <label>Patron count</label>
          <input type="number" min="0" value={form.count} onChange={set("count")} placeholder="One each" />
        </div>
        <div className="field">
          <label>Extra copies</label>
          <input type="number" min="0" value={form.extra_copies} onChange={set("extra_copies")} placeholder="Default" />
        </div>
      </div>
      <div className="ops__actions">
        {tiers.map((tier) => (
          <label key={tier.id} className="ops__tag">
            <input
              type="checkbox"
              checked={form.tier_ids.includes(tier.id)}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  tier_ids: event.target.checked
                    ? [...current.tier_ids, tier.id]
                    : current.tier_ids.filter((id) => id !== tier.id),
                }))
              }
            />
            {tier.title}
          </label>
        ))}
      </div>
      <button type="submit" className="ops__btn">
        {initial ? "Save line" : "Add to month"}
      </button>
    </form>
  );
}

function LineEditor({ line, tiers, act, reload, onError }) {
  return (
    <article className="ops__service">
      <h3>
        {line.good_name} · {line.drop_on}
      </h3>
      <LineForm
        goods={[{ id: line.print_good_id, name: line.good_name, price_cents: line.price_cents }]}
        tiers={tiers}
        initial={{
          print_good_id: line.print_good_id,
          drop_on: line.drop_on,
          price_cents: line.price_cents,
          count: line.count ?? "",
          extra_copies: line.extra_copies ?? "",
          tier_ids: line.tier_ids,
        }}
        onSave={(body) =>
          act(() =>
            ops(`fulfillment/items/${line.id}`, {
              method: "PATCH",
              body: {
                price_cents: body.price_cents,
                count: body.count,
                extra_copies: body.extra_copies,
                tier_ids: body.tier_ids,
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
      <label className="ops__btn">
        Upload print file
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
      <button type="button" className="ops__btn ops__btn--danger" onClick={() => act(() => ops(`fulfillment/items/${line.id}`, { method: "DELETE" }))}>
        Remove line
      </button>
    </article>
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
