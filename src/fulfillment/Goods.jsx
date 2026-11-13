import { useId, useState } from "react";
import { Modal, useConfirm, useDiscardGuard } from "../ops/Modal.jsx";
import { Empty, Field, Switch, useToast } from "../ops/ui.jsx";
import { centsFromDollars, dollarInput, KINDS, kindLabel, money } from "./sheets.js";

function formOf(good) {
  return {
    name: good?.name || "",
    price: dollarInput(good?.price_cents ?? ""),
    kind: good?.kind || "print",
    kind_note: good?.kind_note || "",
    in_stock: good ? Boolean(good.in_stock) : true,
  };
}

export function priceError(value) {
  const cents = centsFromDollars(value);
  if (cents === null) return "Needs a price";
  if (cents === undefined) return "Use dollars and cents, like 4.50";
  return null;
}

function GoodDialog({ good, partner, save, onClose }) {
  const formId = useId();
  const toast = useToast();
  const start = formOf(good);
  const [form, setForm] = useState(start);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const dirty = JSON.stringify(form) !== JSON.stringify(start);
  const [requestClose, discardDialog] = useDiscardGuard(dirty, onClose);
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const badPrice = priceError(form.price);
  const ready = form.name.trim() && !badPrice && (form.kind !== "other" || form.kind_note.trim());

  const submit = async (event) => {
    event.preventDefault();
    if (!ready) return;
    setSaving(true);
    setError(null);
    try {
      await save({
        name: form.name,
        kind: form.kind,
        kind_note: form.kind_note,
        price_cents: centsFromDollars(form.price),
        in_stock: Boolean(form.in_stock),
      });
      toast.ok(good ? `Saved ${form.name.trim()}.` : `Added ${form.name.trim()}.`);
      onClose();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <Modal
      title={good ? good.name : "Add a catalog item"}
      onClose={requestClose}
      busy={saving}
      footer={
        <>
          <button type="button" className="btn btn--quiet" onClick={() => requestClose(false)} disabled={saving}>
            Cancel
          </button>
          <button type="submit" form={formId} className="btn" disabled={saving || !ready || (Boolean(good) && !dirty)}>
            {saving ? "Saving…" : good ? "Save" : "Add"}
          </button>
        </>
      }
    >
      <form id={formId} className="ops__form" onSubmit={submit}>
        {error ? (
          <p className="ops__error" role="alert">
            {error}
          </p>
        ) : null}
        <Field label="Name">
          {(props) => <input {...props} value={form.name} onChange={set("name")} maxLength={120} data-autofocus />}
        </Field>
        <div className="field-row">
          <Field label="Type">
            {(props) => (
              <select {...props} value={form.kind} onChange={set("kind")}>
                {KINDS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            )}
          </Field>
          {form.kind === "other" ? (
            <Field label="Called">
              {(props) => (
                <input {...props} value={form.kind_note} onChange={set("kind_note")} maxLength={80} placeholder="Enamel pin" />
              )}
            </Field>
          ) : null}
          <Field
            label="Price per copy ($)"
            error={form.price && badPrice ? badPrice : null}
            help={
              partner
                ? "Libra Labs is told when you change a price."
                : "Order items start at this price. Items already on a month keep the price they were added with."
            }
          >
            {(props) => <input {...props} inputMode="decimal" placeholder="0.00" value={form.price} onChange={set("price")} />}
          </Field>
        </div>
        <Switch
          label="In stock"
          checked={form.in_stock}
          on="In stock"
          off="Out of stock"
          title="A month cannot be locked while it includes an out-of-stock item"
          onChange={(in_stock) => setForm((current) => ({ ...current, in_stock }))}
        />
      </form>
      {discardDialog}
    </Modal>
  );
}

/**
 * The list of goods the print partner can make. Both desks edit it.
 * create/update/destroy must reload the data and throw on failure.
 * Leave `destroy` out to hide deleting (the partner desk cannot delete).
 */
export function Catalog({ goods, items, partner = false, create, update, destroy }) {
  const toast = useToast();
  const [editing, setEditing] = useState(null);
  const [pending, setPending] = useState(null);
  const [ask, confirmDialog] = useConfirm();
  const used = (good) => items.some((item) => item.print_good_id === good.id);

  const setStock = async (good, in_stock) => {
    setPending(good.id);
    try {
      await update(good.id, { in_stock });
      toast.ok(`${good.name} is ${in_stock ? "back in stock" : "out of stock"}.`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setPending(null);
    }
  };

  const remove = (good) =>
    ask({
      title: `Delete ${good.name}?`,
      body: "It is removed from the catalog for good.",
      label: "Delete",
      action: () => destroy(good.id),
      done: `Deleted ${good.name}.`,
    });

  return (
    <>
      {goods.length ? (
        <div className="ops__scroll">
          <table className="ops__table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Type</th>
                <th>Price per copy</th>
                <th>Stock</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {goods.map((good) => (
                <tr key={good.id}>
                  <td>
                    <strong>{good.name}</strong>
                  </td>
                  <td>{kindLabel(good.kind, good.kind_note)}</td>
                  <td>{money(good.price_cents)}</td>
                  <td>
                    <Switch
                      label={`${good.name} is in stock`}
                      checked={Boolean(good.in_stock)}
                      disabled={pending === good.id}
                      on="In stock"
                      off="Out of stock"
                      title="A month cannot be locked while it includes an out-of-stock item"
                      onChange={(next) => setStock(good, next)}
                    />
                  </td>
                  <td className="ops__rowtools">
                    <button type="button" className="ops__btn ops__btn--small" onClick={() => setEditing(good)}>
                      Edit
                    </button>
                    {destroy ? (
                      <button
                        type="button"
                        className="ops__btn ops__btn--small ops__btn--danger"
                        disabled={used(good)}
                        title={used(good) ? "On a monthly order, so it cannot be deleted. Mark it out of stock instead." : undefined}
                        onClick={() => remove(good)}
                      >
                        Delete
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>The catalog is empty.</Empty>
      )}
      <div className="ops__actions">
        <button type="button" className="ops__btn" onClick={() => setEditing("new")}>
          Add item
        </button>
      </div>
      {editing ? (
        <GoodDialog
          key={editing === "new" ? "new" : editing.id}
          good={editing === "new" ? null : editing}
          partner={partner}
          save={(body) => (editing === "new" ? create(body) : update(editing.id, body))}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {confirmDialog}
    </>
  );
}
