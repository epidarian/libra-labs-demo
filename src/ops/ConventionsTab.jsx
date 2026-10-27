import { useId, useState } from "react";
import { dateRange } from "../dates.js";
import { ops, useOps } from "./api.js";
import { Notice } from "./Notice.jsx";

const EMPTY = { name: "", place: "", starts_on: "", ends_on: "", table_label: "", rating: "sfw" };
const today = () => new Date().toISOString().slice(0, 10);

function ConventionForm({ initial, onSave, onCancel }) {
  const id = useId();
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    const ok = await onSave(form);
    setSaving(false);
    if (ok && !initial.id) setForm(EMPTY);
  };

  return (
    <form className="ops__form" onSubmit={submit}>
      <div className="field-row">
        <div className="field">
          <label htmlFor={`${id}-name`}>Name</label>
          <input id={`${id}-name`} value={form.name} onChange={set("name")} required />
        </div>
        <div className="field">
          <label htmlFor={`${id}-place`}>City / venue</label>
          <input id={`${id}-place`} value={form.place} onChange={set("place")} />
        </div>
        <div className="field">
          <label htmlFor={`${id}-rating`}>Shown on</label>
          <select id={`${id}-rating`} value={form.rating} onChange={set("rating")}>
            <option value="sfw">SFW site</option>
            <option value="nsfw">NSFW site</option>
          </select>
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor={`${id}-start`}>Starts</label>
          <input id={`${id}-start`} type="date" value={form.starts_on} onChange={set("starts_on")} />
        </div>
        <div className="field">
          <label htmlFor={`${id}-end`}>Ends</label>
          <input
            id={`${id}-end`}
            type="date"
            value={form.ends_on}
            min={form.starts_on || undefined}
            onChange={set("ends_on")}
          />
        </div>
        <div className="field">
          <label htmlFor={`${id}-table`}>Table</label>
          <input
            id={`${id}-table`}
            value={form.table_label}
            onChange={set("table_label")}
            placeholder="Table TBA"
          />
        </div>
      </div>
      <div className="ops__actions">
        <button type="submit" className="btn" disabled={saving}>
          {initial.id ? "Save" : "Add convention"}
        </button>
        {onCancel ? (
          <button type="button" className="btn btn--quiet" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

export function ConventionsTab() {
  const { data, error, run } = useOps("conventions");
  const [editing, setEditing] = useState(null);
  const items = data?.conventions ?? [];
  const now = today();

  const save = async (form) => {
    const path = form.id ? `conventions/${form.id}` : "conventions";
    const result = await run(() =>
      ops(path, { method: form.id ? "PUT" : "POST", body: form })
    );
    if (result && form.id) setEditing(null);
    return Boolean(result);
  };

  const remove = (item) => {
    if (!window.confirm(`Delete ${item.name}?`)) return;
    run(() => ops(`conventions/${item.id}`, { method: "DELETE" }));
  };

  return (
    <>
      <section className="panel ops__section">
        <h2 className="panel__title">Schedule a convention</h2>
        <ConventionForm initial={EMPTY} onSave={save} />
      </section>

      <section className="panel ops__section">
        <h2 className="panel__title">Scheduled ({items.length})</h2>
        <p className="ops__muted">
          Each convention appears only on the site matching its tag. Conventions that have ended
          are hidden.
        </p>
        <Notice error={error} loading={!data} />
        {data && items.length === 0 ? <p className="ops__muted">No conventions.</p> : null}
        <div className="ops__list">
          {items.map((item) => {
            const past = (item.ends_on || item.starts_on || "9999") < now;
            if (editing === item.id) {
              return (
                <div className="ops__request" key={item.id}>
                  <ConventionForm
                    initial={{
                      ...EMPTY,
                      ...item,
                      starts_on: item.starts_on ?? "",
                      ends_on: item.ends_on ?? "",
                    }}
                    onSave={save}
                    onCancel={() => setEditing(null)}
                  />
                </div>
              );
            }
            return (
              <article className="ops__request" key={item.id} data-state={past ? "past" : "live"}>
                <header className="ops__request-head">
                  <div>
                    <h3>{item.name}</h3>
                    <span>{item.place || "-"}</span>
                  </div>
                  <span className="ops__tag">{item.rating.toUpperCase()}</span>
                  {past ? <span className="ops__tag">Past</span> : null}
                  <span>{dateRange(item.starts_on, item.ends_on)}</span>
                </header>
                <footer className="ops__actions">
                  <span className="ops__muted">{item.table_label || "Table TBA"}</span>
                  <button type="button" className="ops__btn" onClick={() => setEditing(item.id)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="ops__btn ops__btn--danger"
                    onClick={() => remove(item)}
                  >
                    Delete
                  </button>
                </footer>
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}
