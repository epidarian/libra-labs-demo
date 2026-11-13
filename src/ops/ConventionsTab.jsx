import { useId, useState } from "react";
import { dateRange } from "../dates.js";
import { ops, useOps } from "./api.js";
import { Modal, useConfirm, useDiscardGuard } from "./Modal.jsx";
import { Notice } from "./Notice.jsx";
import { Empty, Field, SectionHead, Segmented, Status, useToast } from "./ui.jsx";

const EMPTY = { name: "", place: "", starts_on: "", ends_on: "", table_label: "", rating: "sfw" };
const SITES = [
  { value: "sfw", label: "SFW" },
  { value: "nsfw", label: "NSFW" },
];
// The public site hides a convention the day after it ends, by UTC date.
const today = () => new Date().toISOString().slice(0, 10);
const lastDay = (item) => item.ends_on || item.starts_on || "";
const hasEnded = (item, now) => Boolean(lastDay(item)) && lastDay(item) < now;

function formOf(item) {
  return { ...EMPTY, ...item, starts_on: item.starts_on ?? "", ends_on: item.ends_on ?? "" };
}

function ConventionDialog({ initial, send, onClose }) {
  const formId = useId();
  const toast = useToast();
  const start = formOf(initial);
  const [form, setForm] = useState(start);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const editing = Boolean(initial.id);
  const dirty = JSON.stringify(form) !== JSON.stringify(start);
  const [requestClose, discardDialog] = useDiscardGuard(dirty, onClose);
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const endsError =
    form.ends_on && !form.starts_on
      ? "Needs a first day too"
      : form.ends_on && form.ends_on < form.starts_on
        ? "Before the first day"
        : null;

  const submit = async (event) => {
    event.preventDefault();
    if (endsError) return;
    setSaving(true);
    setError(null);
    try {
      await send(() =>
        ops(editing ? `conventions/${initial.id}` : "conventions", { method: editing ? "PUT" : "POST", body: form })
      );
      toast.ok(editing ? `Saved ${form.name.trim()}.` : `Added ${form.name.trim()}.`);
      onClose();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <Modal
      title={editing ? initial.name : "Add a convention"}
      onClose={requestClose}
      busy={saving}
      footer={
        <>
          {hasEnded(form, today()) ? <Status tone="warn">Already over, so the site will not show it</Status> : null}
          <span className="modal__spacer" />
          <button type="button" className="btn btn--quiet" onClick={() => requestClose(false)} disabled={saving}>
            Cancel
          </button>
          <button type="submit" form={formId} className="btn" disabled={saving || !form.name.trim() || Boolean(endsError)}>
            {saving ? "Saving…" : editing ? "Save" : "Add"}
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
        <div className="field-row field-row--2">
          <Field label="Name">
            {(props) => <input {...props} value={form.name} onChange={set("name")} maxLength={120} required data-autofocus />}
          </Field>
          <Field label="City or venue">
            {(props) => <input {...props} value={form.place} onChange={set("place")} maxLength={120} />}
          </Field>
        </div>
        <div className="field-row">
          <Field label="First day" help="Leave both days blank to show “Dates TBA”.">
            {(props) => <input {...props} type="date" value={form.starts_on} onChange={set("starts_on")} />}
          </Field>
          <Field label="Last day" error={endsError} help="Leave blank for a one-day event.">
            {(props) => (
              <input {...props} type="date" value={form.ends_on} min={form.starts_on || undefined} onChange={set("ends_on")} />
            )}
          </Field>
          <Field label="Table">
            {(props) => (
              <input {...props} value={form.table_label} onChange={set("table_label")} maxLength={60} placeholder="Table TBA" />
            )}
          </Field>
        </div>
        <div className="field">
          <span className="field__label">Listed on</span>
          <Segmented
            label="Site that lists it"
            value={form.rating}
            onChange={(rating) => setForm((current) => ({ ...current, rating }))}
            options={SITES}
          />
        </div>
      </form>
      {discardDialog}
    </Modal>
  );
}

export function ConventionsTab() {
  const { data, error, send } = useOps("conventions");
  const [editing, setEditing] = useState(null);
  const [site, setSite] = useState("all");
  const [ask, confirmDialog] = useConfirm();
  const now = today();
  const items = data?.conventions ?? [];
  const shown = site === "all" ? items : items.filter((item) => item.rating === site);
  // Upcoming first, in date order; ended ones sink to the bottom.
  const sorted = [...shown.filter((item) => !hasEnded(item, now)), ...shown.filter((item) => hasEnded(item, now))];

  const remove = (item) =>
    ask({
      title: `Delete ${item.name}?`,
      body: hasEnded(item, now)
        ? "It has ended and is already hidden from the site."
        : `It comes off the ${item.rating.toUpperCase()} site's schedule right away.`,
      label: "Delete",
      action: () => send(() => ops(`conventions/${item.id}`, { method: "DELETE" })),
      done: `Deleted ${item.name}.`,
    });

  return (
    <section className="panel ops__section">
      <SectionHead
        title="Schedule"
        count={data ? shown.length : null}
        help="Each convention shows on one site and drops off by itself the day after it ends."
      >
        <Segmented
          label="Site to show"
          value={site}
          onChange={setSite}
          options={[{ value: "all", label: "All" }, ...SITES]}
        />
        <button type="button" className="btn btn--small" onClick={() => setEditing(EMPTY)}>
          Add convention
        </button>
      </SectionHead>
      <Notice error={error} loading={!data && !error} />
      {data && !sorted.length ? <Empty>No conventions.</Empty> : null}
      {sorted.length ? (
        <div className="ops__scroll">
          <table className="ops__table">
            <thead>
              <tr>
                <th>Convention</th>
                <th>Where</th>
                <th>Dates</th>
                <th>Table</th>
                <th>Site</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sorted.map((item) => {
                const ended = hasEnded(item, now);
                return (
                  <tr key={item.id} data-faded={ended ? "true" : undefined}>
                    <td>
                      <strong>{item.name}</strong>
                    </td>
                    <td>{item.place}</td>
                    <td>
                      <span className="ops__pair">
                        {dateRange(item.starts_on, item.ends_on)}
                        {ended ? (
                          <Status tone="off" title="Hidden from the site">
                            Ended
                          </Status>
                        ) : null}
                      </span>
                    </td>
                    <td>{item.table_label || "TBA"}</td>
                    <td>{item.rating.toUpperCase()}</td>
                    <td className="ops__rowtools">
                      <button type="button" className="ops__btn ops__btn--small" onClick={() => setEditing(item)}>
                        Edit
                      </button>
                      <button type="button" className="ops__btn ops__btn--small ops__btn--danger" onClick={() => remove(item)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      {editing ? (
        <ConventionDialog key={editing.id || "new"} initial={editing} send={send} onClose={() => setEditing(null)} />
      ) : null}
      {confirmDialog}
    </section>
  );
}
