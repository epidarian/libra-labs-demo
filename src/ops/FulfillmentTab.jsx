import { useId, useState } from "react";
import { Catalog, priceError } from "../fulfillment/Goods.jsx";
import { bandOf, copiesForPatrons, entitled, resolvedExtras } from "../fulfillment/rules.js";
import { SheetActions } from "../fulfillment/SheetView.jsx";
import {
  addressLine,
  audienceLabel,
  centsFromDollars,
  dayLabel,
  dollarInput,
  lockBlockers,
  money,
  monthLabel,
  monthView,
  tierLabel,
} from "../fulfillment/sheets.js";
import { ops, opsUpload, useOps } from "./api.js";
import { Dropzone } from "./files.jsx";
import { Modal, useConfirm, useDiscardGuard } from "./Modal.jsx";
import { Notice } from "./Notice.jsx";
import { PARTNER_PATH, siteHref } from "./route.js";
import {
  ActionButton,
  Empty,
  Field,
  SaveBar,
  SectionHead,
  Segmented,
  Status,
  Switch,
  Tip,
  plural,
  useDirty,
  useToast,
} from "./ui.jsx";

const MONTH = /^\d{4}-\d{2}$/;
const MAX_PRINT_FILE = 40 * 1024 * 1024;
const PATRON_STATUS = {
  active_patron: "Active",
  declined_patron: "Declined",
  former_patron: "Former",
};

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

function countError(value) {
  if (value === "" || value == null) return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? null : "Use a whole number";
}

export function FulfillmentTab() {
  const { data, error, reload, run, send } = useOps("fulfillment");
  const [month, setMonth] = useState("");
  const [added, setAdded] = useState([]);
  const [ask, confirmDialog] = useConfirm();

  if (!data) {
    return (
      <div className="panel">
        <Notice error={error} loading={!error} />
      </div>
    );
  }

  const thisMonth = data.today.slice(0, 7);
  const months = [
    ...new Set([...data.items.map((item) => item.month), ...data.months.map((row) => row.month), ...added]),
  ].sort();
  const selected = months.includes(month) ? month : months.includes(thisMonth) ? thisMonth : months[months.length - 1] || "";
  const outOfStock = data.goods.filter((good) => !good.in_stock).length;

  const addMonth = (value) => {
    setAdded((current) => (current.includes(value) ? current : [...current, value]));
    setMonth(value);
  };

  return (
    <>
      {data.edits.length ? (
        <section className="panel ops__section fulfill-alert">
          <SectionHead
            title="Price changes"
            count={data.edits.length}
            help="The print partner changed these catalog prices. Items already on a month keep the price they were added with."
          >
            <ActionButton
              busyLabel="Clearing…"
              onClick={() => run(() => ops("fulfillment/edits", { method: "POST" }), { ok: "Price changes cleared." })}
            >
              Mark as seen
            </ActionButton>
          </SectionHead>
          <ul className="ops__bullets">
            {data.edits.map((edit) => (
              <li key={edit.id}>
                {edit.good_name || "A deleted item"}: {money(edit.old_price_cents)} → {money(edit.new_price_cents)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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
          <AddMonth months={months} onAdd={addMonth} />
        </aside>

        {selected ? (
          <MonthPane key={selected} data={data} view={monthView(data, selected)} run={run} send={send} reload={reload} ask={ask} />
        ) : (
          <Empty>Add a month to start an order.</Empty>
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
            goods={data.goods}
            items={data.items}
            create={(body) => send(() => ops("fulfillment/goods", { method: "POST", body }))}
            update={(id, body) => send(() => ops(`fulfillment/goods/${id}`, { method: "PATCH", body }))}
            destroy={(id) => send(() => ops(`fulfillment/goods/${id}`, { method: "DELETE" }))}
          />
        </div>
      </details>

      <details className="panel ops__section fold">
        <summary>
          <span className="fold__title">Headquarters</span>
          <span className="fold__meta">
            {data.settings.hq?.line1 ? null : <Status tone="warn">No address</Status>}
          </span>
        </summary>
        <div className="fold__body">
          {/* Remounts on the stored values so a save shows exactly what the server kept. */}
          <HeadquartersForm
            key={JSON.stringify([data.settings.hq, data.settings.extraCopies])}
            settings={data.settings}
            run={run}
          />
        </div>
      </details>

      <details className="panel ops__section fold">
        <summary>
          <span className="fold__title">Partner access</span>
          <span className="fold__meta">
            {data.settings.hasPass ? <Status tone="ok">Passphrase set</Status> : <Status tone="bad">No passphrase</Status>}
          </span>
        </summary>
        <div className="fold__body">
          <PassphraseForm settings={data.settings} send={send} ask={ask} />
        </div>
      </details>
      {confirmDialog}
    </>
  );
}

function AddMonth({ months, onAdd }) {
  const [value, setValue] = useState("");
  const valid = MONTH.test(value);
  const exists = months.includes(value);
  return (
    <form
      className="fulfill-add"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid || exists) return;
        onAdd(value);
        setValue("");
      }}
    >
      <input
        className="ops__input"
        type="month"
        aria-label="Month to add"
        placeholder="YYYY-MM"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <button
        type="submit"
        className="ops__btn"
        disabled={!valid || exists}
        title={exists ? "That month is already listed" : "A month is kept once it has an item"}
      >
        Add month
      </button>
    </form>
  );
}

// What stands between this month and a clean lock. Blockers match the server's own checks.
function issuesOf(data, view) {
  const warnings = [];
  const noFiles = view.rows.filter((row) => !row.line.assets.length).length;
  if (noFiles) warnings.push(`${plural(noFiles, "item")} without print files`);
  const noAddress = view.receiving.filter((entry) => !entry.patron.line1).length;
  if (noAddress) warnings.push(`${plural(noAddress, "patron")} without an address`);
  if (view.extras > 0 && !data.settings.hq.line1) warnings.push("No headquarters address for the extra copies");
  if (!data.settings.hasPass) warnings.push("The partner has no passphrase");
  return { blockers: lockBlockers(data, view), warnings };
}

function MonthPane({ data, view, run, send, reload, ask }) {
  const [editing, setEditing] = useState(null);
  const locked = Boolean(view.lockedAt);
  const { blockers, warnings } = issuesOf(data, view);
  const openLine = editing && editing !== "new" ? view.rows.find((row) => row.line.id === editing)?.line : null;
  const cannotAdd = !data.goods.length
    ? "Add an item to the catalog first"
    : !data.tiers.length
      ? "Refresh tiers from Patreon on the Dashboard first"
      : null;

  return (
    <div className="fulfill-pane">
      <header className="fulfill-head">
        <h2 className="fulfill-month">{monthLabel(view.month)}</h2>
        {locked ? (
          <Status tone="ok">Locked {dayLabel(view.lockedAt)}</Status>
        ) : !blockers.length && !warnings.length ? (
          <Status tone="ok">Ready to lock</Status>
        ) : (
          <Status tone="info">Open</Status>
        )}
        <Tip
          text={
            locked
              ? "The print partner locked this month. The order and addresses are frozen; the partner adds tracking and marks parcels shipped."
              : "The print partner locks a month on or after the 1st. That freezes the quantities and copies every patron's address."
          }
        />
      </header>

      {!locked && (blockers.length || warnings.length) ? (
        <ul className="issues">
          {blockers.map((text) => (
            <li key={text}>
              <Status tone="bad" title="The month cannot be locked until this is fixed">
                {text}
              </Status>
            </li>
          ))}
          {warnings.map((text) => (
            <li key={text}>
              <Status tone="warn" title="Worth fixing before the month is locked">
                {text}
              </Status>
            </li>
          ))}
        </ul>
      ) : null}

      <section className="fulfill-block">
        <SectionHead level={3} title="Order" count={view.rows.length}>
          {locked ? null : (
            <button
              type="button"
              className="btn btn--small"
              disabled={Boolean(cannotAdd)}
              title={cannotAdd || undefined}
              onClick={() => setEditing("new")}
            >
              Add item
            </button>
          )}
        </SectionHead>
        {view.rows.length ? (
          <OrderTable data={data} view={view} locked={locked} onEdit={setEditing} />
        ) : (
          <Empty>{cannotAdd && !locked ? `${cannotAdd}.` : "Nothing on this order."}</Empty>
        )}
      </section>

      <section className="fulfill-block">
        <SectionHead
          level={3}
          title="Sheets"
          help={locked ? "Final, as frozen at the lock." : "A preview. The numbers follow the patron list until the month is locked."}
        />
        <SheetActions base="/api/ops/fulfillment/sheets" month={view.month} />
      </section>

      {locked ? <Parcels view={view} /> : <Patrons data={data} view={view} run={run} />}

      <Invoices view={view} send={send} ask={ask} />

      {editing === "new" || openLine ? (
        <LineDialog
          key={editing}
          month={view.month}
          line={openLine}
          data={data}
          send={send}
          reload={reload}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function OrderTable({ data, view, locked, onEdit }) {
  return (
    <div className="ops__scroll">
      <table className="ops__table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Goes to</th>
            <th>
              Patrons
              <Tip text="Copies for patrons: the number of receiving patrons times the copies each one gets." />
            </th>
            <th>
              Extra
              <Tip text="Spare copies sent to headquarters." />
            </th>
            <th>Total</th>
            <th>Price</th>
            <th>Cost</th>
            <th>Files</th>
            {locked ? null : <th />}
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
                    <a key={asset.id} className="filelink" href={`/api/ops/fulfillment/assets/${asset.id}`} title="Download">
                      {asset.filename}
                    </a>
                  ))
                ) : (
                  <span className="ops__muted">None</span>
                )}
              </td>
              {locked ? null : (
                <td className="ops__rowtools">
                  <button type="button" className="ops__btn ops__btn--small" onClick={() => onEdit(row.line.id)}>
                    Edit
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th colSpan={4}>Total</th>
            <th>{view.copies}</th>
            <th />
            <th>{money(view.cents)}</th>
            <th colSpan={locked ? 1 : 2} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function LineDialog({ month, line, data, send, reload, onClose }) {
  const formId = useId();
  const toast = useToast();
  const [ask, confirmDialog] = useConfirm();
  const firstGood = data.goods.find((good) => good.in_stock) || data.goods[0];
  const start = line
    ? {
        goodId: line.print_good_id,
        price: dollarInput(line.price_cents),
        count: line.count == null ? "" : String(line.count),
        extra: line.extra_copies == null ? "" : String(line.extra_copies),
        amounts: [...(line.amounts || [])].sort((a, b) => a - b),
        inclusive: Boolean(line.inclusive),
      }
    : { goodId: firstGood?.id || "", price: dollarInput(firstGood?.price_cents ?? ""), count: "", extra: "", amounts: [], inclusive: false };
  const [form, setForm] = useState(start);
  const [pending, setPending] = useState([]);
  const [dropped, setDropped] = useState([]);
  const [createdId, setCreatedId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const formDirty = JSON.stringify(form) !== JSON.stringify(start);
  const dirty = formDirty || pending.length > 0 || dropped.length > 0;
  const [requestClose, discardDialog] = useDiscardGuard(dirty, onClose);
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const good = data.goods.find((item) => item.id === form.goodId);
  const name = line ? line.good_name : good?.name || "item";
  const defaultExtra = data.settings.extraCopies;
  const choices = [...new Set([...data.tiers.map((tier) => tier.amount_cents), ...form.amounts])]
    .filter((amount) => Number.isInteger(amount))
    .sort((a, b) => a - b);
  const active = data.patrons.filter((patron) => patron.patron_status === "active_patron");
  const inBand = (amount) => active.filter((patron) => bandOf(patron.amount_cents, data.tiers) === amount).length;

  const badPrice = priceError(form.price);
  const badCount = countError(form.count);
  const badExtra = countError(form.extra);
  const ready = Boolean(form.goodId) && !badPrice && !badCount && !badExtra && form.amounts.length > 0;

  const receivers = active.filter((patron) => entitled(patron, form, data.tiers)).length;
  const each = form.count === "" || badCount ? 1 : Number(form.count);
  const extraQty = resolvedExtras(form.extra === "" || badExtra ? null : Number(form.extra), defaultExtra);
  const copies = copiesForPatrons(each, receivers) + extraQty;

  const toggle = (amount, on) =>
    setForm((current) => ({
      ...current,
      amounts: on ? [...current.amounts, amount].sort((a, b) => a - b) : current.amounts.filter((value) => value !== amount),
    }));

  const addFiles = (files) => {
    const tooBig = files.find((file) => file.size > MAX_PRINT_FILE);
    if (tooBig) setError(`${tooBig.name} is over 40 MB.`);
    const fits = files.filter((file) => file.size <= MAX_PRINT_FILE);
    setPending((current) => [...current, ...fits.map((file) => ({ key: crypto.randomUUID(), file }))]);
  };

  // The item and its print files are saved together. Each finished step is cleared, so if
  // one fails the rest stay waiting and Save picks up where it stopped.
  const submit = async (event) => {
    event.preventDefault();
    if (!ready) return;
    setSaving(true);
    setError(null);
    const body = {
      price_cents: centsFromDollars(form.price),
      count: form.count === "" ? null : Number(form.count),
      extra_copies: form.extra === "" ? null : Number(form.extra),
      amounts: form.amounts,
      inclusive: form.inclusive ? 1 : 0,
    };
    try {
      let itemId = line?.id || createdId;
      if (!itemId) {
        setProgress("Adding the item…");
        const result = await ops("fulfillment/items", {
          method: "POST",
          body: { ...body, print_good_id: form.goodId, drop_on: `${month}-01` },
        });
        itemId = result.id;
        setCreatedId(itemId);
      } else if (line && formDirty) {
        setProgress("Saving the item…");
        await ops(`fulfillment/items/${itemId}`, { method: "PATCH", body });
      }
      for (const [index, item] of pending.entries()) {
        await opsUpload(`fulfillment/items/${itemId}/files`, item.file, { name: item.file.name }, (share) =>
          setProgress(`Uploading ${item.file.name} (${index + 1} of ${pending.length}) ${Math.round(share * 100)}%`)
        );
        setPending((current) => current.filter((entry) => entry.key !== item.key));
      }
      for (const id of dropped) {
        setProgress("Deleting files…");
        await ops(`fulfillment/items/${itemId}/files/${id}`, { method: "DELETE" });
        setDropped((current) => current.filter((entry) => entry !== id));
      }
      await reload();
      toast.ok(line ? `Saved ${name}.` : `Added ${name} to ${monthLabel(month)}.`);
      onClose();
    } catch (err) {
      setError(`Saving stopped: ${err.message} What finished is saved; the rest is still waiting.`);
      await reload();
      setSaving(false);
      setProgress(null);
    }
  };

  const remove = () =>
    ask({
      title: `Remove ${name} from ${monthLabel(month)}?`,
      body: line.assets.length
        ? `Its ${plural(line.assets.length, "print file")} will be deleted too. The catalog item stays.`
        : "The catalog item stays.",
      label: "Remove",
      action: async () => {
        await send(() => ops(`fulfillment/items/${line.id}`, { method: "DELETE" }));
        onClose();
      },
      done: `Removed ${name} from ${monthLabel(month)}.`,
    });

  const assets = line?.assets || [];
  const fileCount = assets.length - dropped.length + pending.length;

  return (
    <Modal
      className="modal--wide"
      kicker={<span>{monthLabel(month)}</span>}
      title={line ? name : "Add an item"}
      onClose={requestClose}
      busy={saving}
      footer={
        <>
          {line ? (
            <button type="button" className="btn btn--quiet btn--danger-quiet" onClick={remove} disabled={saving}>
              Remove from month
            </button>
          ) : null}
          <span className="modal__spacer" />
          {progress ? (
            <span className="modal__hint" role="status">
              {progress}
            </span>
          ) : line && dirty ? (
            <Status tone="warn">Unsaved changes</Status>
          ) : null}
          <button type="button" className="btn btn--quiet" onClick={() => requestClose(false)} disabled={saving}>
            Cancel
          </button>
          <button type="submit" form={formId} className="btn" disabled={saving || !ready || (Boolean(line) && !dirty)}>
            {saving ? "Saving…" : line ? "Save" : "Add"}
          </button>
        </>
      }
    >
      {error ? (
        <p className="ops__error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="editor">
        <form id={formId} className="ops__form" onSubmit={submit}>
          <div className="field-row field-row--2">
            {line ? null : (
              <Field label="Item">
                {(props) => (
                  <select
                    {...props}
                    value={form.goodId}
                    disabled={Boolean(createdId)}
                    onChange={(event) => {
                      const next = data.goods.find((item) => item.id === event.target.value);
                      setForm((current) => ({
                        ...current,
                        goodId: event.target.value,
                        price: next ? dollarInput(next.price_cents) : current.price,
                      }));
                    }}
                  >
                    {data.goods.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                        {item.in_stock ? "" : " (out of stock)"}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            )}
            <Field
              label="Price per copy ($)"
              error={form.price && badPrice ? badPrice : null}
              help={good ? `The catalog price is ${money(good.price_cents)}. This order uses the price typed here.` : undefined}
            >
              {(props) => <input {...props} inputMode="decimal" placeholder="0.00" value={form.price} onChange={set("price")} />}
            </Field>
          </div>

          <fieldset className="choices">
            <legend>
              Tiers that receive it
              <Tip text="The number beside each tier is its active patrons right now." />
            </legend>
            {choices.map((amount) => (
              <label key={amount} className="choice">
                <input
                  type="checkbox"
                  checked={form.amounts.includes(amount)}
                  onChange={(event) => toggle(amount, event.target.checked)}
                />
                <span>{tierLabel(data.tiers, amount)}</span>
                <small>{inBand(amount)}</small>
              </label>
            ))}
            {choices.length ? null : <span className="ops__muted">No tiers loaded from Patreon.</span>}
            <Switch
              label="Include higher pledges"
              checked={form.inclusive}
              on="And every higher pledge"
              off="Only the ticked tiers"
              onChange={(inclusive) => setForm((current) => ({ ...current, inclusive }))}
            />
          </fieldset>

          <div className="field-row field-row--2">
            <Field label="Copies per patron" error={badCount} help="Blank means 1.">
              {(props) => <input {...props} type="number" min="0" step="1" placeholder="1" value={form.count} onChange={set("count")} />}
            </Field>
            <Field
              label="Extra copies"
              error={badExtra}
              help={`Spares sent to headquarters. Blank uses the default${defaultExtra == null ? ", which is none" : ` of ${defaultExtra}`}.`}
            >
              {(props) => (
                <input
                  {...props}
                  type="number"
                  min="0"
                  step="1"
                  placeholder={String(defaultExtra ?? 0)}
                  value={form.extra}
                  onChange={set("extra")}
                />
              )}
            </Field>
          </div>

          <p className="tally" data-empty={copies === 0 ? "true" : undefined} role="status">
            {plural(receivers, "patron")} × {each} + {extraQty} extra = <strong>{plural(copies, "copy", "copies")}</strong>
            {badPrice ? null : ` · ${money(copies * centsFromDollars(form.price))}`}
            <Tip text="Counted from today's patron list. The final number is taken when the month is locked." />
          </p>
        </form>

        <section className="ops__form">
          <span className="field__top">
            <span className="field__label">Print files</span>
            <Tip text="The artwork the print partner downloads, up to 40 MB each." />
            <span className="ops__muted">{fileCount ? plural(fileCount, "file") : "None"}</span>
          </span>
          {assets.length || pending.length ? (
            <ul className="rows">
              {assets.map((asset) => {
                const gone = dropped.includes(asset.id);
                return (
                  <li key={asset.id} className="rows__row" data-mark={gone ? "remove" : undefined}>
                    <a className="rows__name" href={`/api/ops/fulfillment/assets/${asset.id}`} title="Download">
                      {asset.filename}
                    </a>
                    {gone ? <Status tone="bad">Will be deleted</Status> : null}
                    <button
                      type="button"
                      className={gone ? "ops__btn ops__btn--small" : "ops__btn ops__btn--small ops__btn--danger"}
                      disabled={saving}
                      onClick={() =>
                        setDropped((current) =>
                          gone ? current.filter((id) => id !== asset.id) : [...current, asset.id]
                        )
                      }
                    >
                      {gone ? "Undo" : "Delete"}
                    </button>
                  </li>
                );
              })}
              {pending.map((item) => (
                <li key={item.key} className="rows__row">
                  <span className="rows__name">{item.file.name}</span>
                  <Status tone="info">New</Status>
                  <button
                    type="button"
                    className="ops__btn ops__btn--small"
                    disabled={saving}
                    onClick={() => setPending((current) => current.filter((entry) => entry.key !== item.key))}
                  >
                    Undo
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <Dropzone compact label="Add files" hint="Drop here or click to choose" multiple disabled={saving} onFiles={addFiles} />
        </section>
      </div>
      {discardDialog}
      {confirmDialog}
    </Modal>
  );
}

function Patrons({ data, view, run }) {
  const [filter, setFilter] = useState("receiving");
  const receiving = new Map(view.receiving.map((entry) => [entry.patron.patreon_id, entry.items]));
  const noAddress = view.receiving.filter((entry) => !entry.patron.line1);
  const shown =
    filter === "receiving"
      ? view.receiving.map((entry) => entry.patron)
      : filter === "missing"
        ? noAddress.map((entry) => entry.patron)
        : data.patrons;

  return (
    <section className="fulfill-block">
      <SectionHead
        level={3}
        title="Patrons"
        help="Patrons enter their own shipping address on the site after signing in with Patreon. It cannot be edited here."
      >
        <Segmented
          label="Patrons to show"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "receiving", label: "Receiving", count: view.receiving.length },
            { value: "missing", label: "No address", count: noAddress.length },
            { value: "all", label: "All", count: data.patrons.length },
          ]}
        />
        <ActionButton
          busyLabel="Syncing…"
          title="Fetch the current patrons and pledges from Patreon"
          onClick={() =>
            run(() => ops("fulfillment/sync", { method: "POST" }), {
              ok: (result) => `Synced ${plural(result?.count ?? 0, "patron")} from Patreon.`,
            })
          }
        >
          Sync from Patreon
        </ActionButton>
      </SectionHead>
      {shown.length ? (
        <div className="ops__scroll">
          <table className="ops__table">
            <thead>
              <tr>
                <th>Patron</th>
                <th>Pledge</th>
                <th>Status</th>
                <th>Receives</th>
                <th>Address</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((patron) => {
                const items = receiving.get(patron.patreon_id);
                return (
                  <tr key={patron.patreon_id}>
                    <td title={patron.email || undefined}>{patron.name || patron.email}</td>
                    <td>{money(patron.amount_cents)}</td>
                    <td>{PATRON_STATUS[patron.patron_status] || "Not a patron"}</td>
                    <td>{items ? items.join(", ") : ""}</td>
                    <td>
                      {patron.line1 ? (
                        [patron.city, patron.region].filter(Boolean).join(", ") || "On file"
                      ) : (
                        <Status tone={items ? "bad" : "off"}>Missing</Status>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>None.</Empty>
      )}
    </section>
  );
}

function Parcels({ view }) {
  const [filter, setFilter] = useState("all");
  const shipped = view.shipments.filter((row) => row.fulfilled);
  const waiting = view.shipments.filter((row) => !row.fulfilled);
  const shown = filter === "waiting" ? waiting : filter === "shipped" ? shipped : view.shipments;
  return (
    <section className="fulfill-block">
      <SectionHead
        level={3}
        title="Parcels"
        help="One per receiving patron, plus one for headquarters when there are extra copies. The print partner adds tracking and marks them shipped."
      >
        <Segmented
          label="Parcels to show"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All", count: view.shipments.length },
            { value: "waiting", label: "To ship", count: waiting.length },
            { value: "shipped", label: "Shipped", count: shipped.length },
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
                <tr key={row.id}>
                  <td>
                    {row.recipient}
                    {row.dest === "hq" ? <span className="chip">Headquarters</span> : null}
                  </td>
                  <td>{row.line1 ? addressLine(row) : <Status tone="bad">Missing</Status>}</td>
                  <td>{row.tracking}</td>
                  <td>{row.fulfilled ? <Status tone="ok">{row.fulfilled_at ? dayLabel(row.fulfilled_at) : "Yes"}</Status> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>None.</Empty>
      )}
    </section>
  );
}

function Invoices({ view, send, ask }) {
  const invoices = [...view.invoices].sort((a, b) => Number(Boolean(a.paid_at)) - Number(Boolean(b.paid_at)));
  const pay = (invoice) =>
    ask({
      title: `Mark the ${money(invoice.amount_cents)} invoice as paid?`,
      body: "The print partner sees it as paid. It cannot be switched back.",
      label: "Mark paid",
      danger: false,
      action: () => send(() => ops(`fulfillment/invoices/${invoice.id}/paid`, { method: "POST" })),
      done: `${money(invoice.amount_cents)} invoice marked paid.`,
    });
  return (
    <section className="fulfill-block">
      <SectionHead level={3} title="Invoices" count={invoices.length} help="Uploaded by the print partner from their desk." />
      {invoices.length ? (
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
              {invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td>{money(invoice.amount_cents)}</td>
                  <td>{invoice.note}</td>
                  <td>
                    <a href={`/api/ops/fulfillment/invoices/${invoice.id}/file`} title="Download">
                      {invoice.filename || "Download"}
                    </a>
                  </td>
                  <td>
                    {invoice.paid_at ? (
                      <Status tone="ok">{dayLabel(invoice.paid_at)}</Status>
                    ) : (
                      <button type="button" className="ops__btn ops__btn--small" onClick={() => pay(invoice)}>
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
        <Empty>None.</Empty>
      )}
    </section>
  );
}

function HeadquartersForm({ settings, run }) {
  const start = { ...blankHq, ...settings.hq, extraCopies: settings.extraCopies == null ? "" : String(settings.extraCopies) };
  const [form, setForm] = useState(start);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(start);
  const badExtra = countError(form.extraCopies);
  useDirty(dirty, "Headquarters");
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const text = (key, label) => (
    <Field label={label}>{(props) => <input {...props} value={form[key]} onChange={set(key)} autoComplete="off" />}</Field>
  );

  const save = async (event) => {
    event.preventDefault();
    if (badExtra) return;
    setSaving(true);
    const { extraCopies, ...hq } = form;
    await run(
      () =>
        ops("fulfillment/settings", {
          method: "PUT",
          body: { extraCopies: extraCopies === "" ? null : Number(extraCopies), passphrase: "", hq },
        }),
      { ok: "Headquarters saved." }
    );
    setSaving(false);
  };

  return (
    <form className="ops__form fulfill-address" onSubmit={save}>
      {text("recipient", "Recipient")}
      {text("line1", "Street")}
      {text("line2", "Apt, suite")}
      <div className="field-row field-row--2">
        {text("city", "City")}
        {text("region", "State")}
      </div>
      <div className="field-row field-row--2">
        {text("postalCode", "ZIP")}
        {text("country", "Country")}
      </div>
      <div className="field-row field-row--2">
        {text("phone", "Phone")}
        <Field
          label="Extra copies"
          error={badExtra}
          help="Spare copies of each item sent to this address, unless an order item sets its own number. Blank means none."
        >
          {(props) => <input {...props} type="number" min="0" step="1" placeholder="0" value={form.extraCopies} onChange={set("extraCopies")} />}
        </Field>
      </div>
      <SaveBar dirty={dirty} saving={saving} onDiscard={() => setForm(start)} blocked={badExtra ? "Fix the extra copies" : null} />
    </form>
  );
}

function PassphraseForm({ settings, send, ask }) {
  const toast = useToast();
  const [passphrase, setPassphrase] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const url = `${window.location.origin}${siteHref(PARTNER_PATH)}`;

  const store = () =>
    send(() =>
      ops("fulfillment/settings", {
        method: "PUT",
        body: { extraCopies: settings.extraCopies, passphrase: passphrase.trim(), hq: { ...blankHq, ...settings.hq } },
      })
    ).then(() => setPassphrase(""));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.ok("Link copied.");
    } catch {
      toast.error("Copying is blocked in this browser. Select the link and copy it by hand.");
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!passphrase.trim()) return;
    if (settings.hasPass) {
      ask({
        title: "Replace the partner passphrase?",
        body: "The old one stops working and the partner is signed out right away. It is never shown again after saving, so send them the new one yourself.",
        label: "Replace",
        action: store,
        done: "Passphrase replaced. The partner was signed out.",
      });
      return;
    }
    setSaving(true);
    try {
      await store();
      toast.ok("Passphrase saved.");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="ops__form fulfill-address" onSubmit={submit}>
      <Field
        label="Partner link"
        help="The page looks like a “404 Not Found” error on purpose. The partner types the passphrase into the box on it and presses Enter. A sign-in lasts 12 hours."
      >
        {(props) => (
          <span className="joined">
            <input {...props} readOnly value={url} onFocus={(event) => event.target.select()} />
            <button type="button" className="ops__btn" onClick={copy}>
              Copy
            </button>
          </span>
        )}
      </Field>
      <Field
        label={settings.hasPass ? "New passphrase" : "Passphrase"}
        help={settings.hasPass ? "The current passphrase cannot be shown. Saving a new one signs the partner out." : undefined}
      >
        {(props) => (
          <span className="joined">
            <input
              {...props}
              type={show ? "text" : "password"}
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
              autoComplete="new-password"
              maxLength={200}
            />
            <button type="button" className="ops__btn" aria-pressed={show} onClick={() => setShow((current) => !current)}>
              {show ? "Hide" : "Show"}
            </button>
          </span>
        )}
      </Field>
      <div className="ops__actions">
        <button type="submit" className="btn btn--small" disabled={saving || !passphrase.trim()}>
          {saving ? "Saving…" : settings.hasPass ? "Replace passphrase" : "Save passphrase"}
        </button>
      </div>
    </form>
  );
}
