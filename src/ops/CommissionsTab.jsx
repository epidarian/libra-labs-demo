import { useId, useRef, useState } from "react";
import { describeLine, formatCents, MAX_OPTIONS, MAX_QUANTITY, priceLabel } from "../commissionPricing.js";
import { longDate, ops, useOps } from "./api.js";
import { Modal, useConfirm, useDiscardGuard } from "./Modal.jsx";
import { Notice } from "./Notice.jsx";
import { ActionButton, Empty, Field, SectionHead, Segmented, Status, Switch, Tip, plural, useToast } from "./ui.jsx";

const STATUS = {
  accepted: { tone: "info", label: "In progress" },
  done: { tone: "ok", label: "Done" },
  declined: { tone: "off", label: "Declined" },
};
const FILTERS = [
  ["accepted", "In progress"],
  ["done", "Done"],
  ["declined", "Declined"],
  ["all", "All"],
];
const MAX_TERMS = 40;
const MAX_TERM_LENGTH = 2000;

function Request({ item, queue, linear, run, send, ask, warnings = [], setWarnings, onDecided }) {
  const noteRef = useRef(null);
  const toast = useToast();
  const pending = item.status === "new";
  const status = STATUS[item.status];

  const decide = (decision) => {
    const accept = decision === "accept";
    ask({
      title: `${accept ? "Accept" : "Decline"} the request from ${item.usernames}?`,
      body: (
        <>
          <ul className="ops__bullets">
            <li>This cannot be reversed.</li>
            {accept && linear ? <li>It is filed to Linear if this queue has a Linear team.</li> : null}
            <li>
              The client is not told automatically. Write to <strong>{item.email}</strong>.
            </li>
          </ul>
          <Field label="Private note" help="Optional. Saved with your decision. The client never sees it.">
            {(props) => <textarea {...props} ref={noteRef} className="ops__note" rows={3} maxLength={2000} />}
          </Field>
        </>
      ),
      label: accept ? "Accept" : "Decline",
      danger: !accept,
      action: async () => {
        const result = await send(() =>
          ops(`commissions/${item.id}/decision`, {
            method: "POST",
            body: { decision, note: noteRef.current?.value ?? "" },
          })
        );
        const problems = result?.warnings ?? [];
        setWarnings(item.id, problems);
        if (problems.length) toast.warn(`Accepted, but not filed to Linear: ${problems[0]}`);
        onDecided(accept ? "accepted" : "declined");
      },
      done: accept ? `Accepted ${item.usernames}.` : `Declined ${item.usernames}.`,
    });
  };

  const markDone = () =>
    ask({
      title: `Mark the request from ${item.usernames} as done?`,
      body: "A done request cannot be moved back to in progress.",
      label: "Mark done",
      danger: false,
      action: async () => {
        await send(() => ops(`commissions/${item.id}`, { method: "PATCH", body: { status: "done" } }));
        onDecided("done");
      },
      done: `Marked ${item.usernames} as done.`,
    });

  const remove = () =>
    ask({
      title: `Delete the request from ${item.usernames}?`,
      body: "The request, its note and any reference images held here are removed for good. An issue already in Linear is not touched.",
      label: "Delete",
      action: () => send(() => ops(`commissions/${item.id}`, { method: "DELETE" })),
      done: `Deleted the request from ${item.usernames}.`,
    });

  return (
    <article className="ops__request" data-state={item.status}>
      <header className="ops__request-head">
        <div>
          <h3>{item.usernames}</h3>
          <a href={`mailto:${item.email}`}>{item.email}</a>
        </div>
        {status ? <Status tone={status.tone}>{status.label}</Status> : null}
        <span className="chip">{queue?.name ?? item.queue_id}</span>
        <span className="chip">{item.rating.toUpperCase()}</span>
        <time dateTime={item.created_at}>{longDate(item.created_at)}</time>
      </header>
      <dl className="ops__facts">
        <dt>PayPal invoice to</dt>
        <dd>{item.paypal_email || item.email}</dd>
        <dt>Options</dt>
        <dd>
          {item.selections.length ? item.selections.map((line) => <div key={line.id}>{describeLine(line)}</div>) : "None"}
        </dd>
        <dt>Quoted total</dt>
        <dd>{formatCents(item.quote_cents)}</dd>
        {pending ? null : (
          <>
            <dt>Decided</dt>
            <dd>{longDate(item.decided_at)}</dd>
            {item.decision_note ? (
              <>
                <dt>Note</dt>
                <dd>{item.decision_note}</dd>
              </>
            ) : null}
          </>
        )}
      </dl>
      <p className="ops__message">{item.description}</p>
      {item.files?.length ? (
        <div className="ops__refs">
          {item.files.map((file) => {
            const href = `/api/ops/commissions/${item.id}/files/${file.id}`;
            return (
              <a key={file.id} className="ops__ref" href={href} target="_blank" rel="noreferrer" title={`Open ${file.name}`}>
                <img src={href} alt={file.name} loading="lazy" />
              </a>
            );
          })}
        </div>
      ) : null}
      {warnings.map((warning) => (
        <p key={warning} className="ops__error" role="alert">
          Not filed to Linear: {warning}
        </p>
      ))}
      <footer className="ops__actions">
        {pending ? (
          <>
            <button type="button" className="btn btn--small" onClick={() => decide("accept")}>
              Accept
            </button>
            <button type="button" className="ops__btn ops__btn--danger" onClick={() => decide("decline")}>
              Decline
            </button>
          </>
        ) : null}
        {item.status === "accepted" ? (
          <button type="button" className="btn btn--small" onClick={markDone}>
            Mark done
          </button>
        ) : null}
        {item.linear_url ? (
          <a className="ops__btn" href={item.linear_url} target="_blank" rel="noreferrer">
            {item.linear_identifier} in Linear ↗
          </a>
        ) : item.status === "accepted" ? (
          <ActionButton
            busyLabel="Sending…"
            disabled={!linear}
            title={linear ? "File this request as a Linear issue" : "Linear is not set up"}
            onClick={async () => {
              const result = await run(() => ops(`commissions/${item.id}/linear`, { method: "POST" }), {
                ok: (sent) => `Filed to Linear as ${sent?.issue?.identifier ?? "a new issue"}.`,
              });
              if (result) setWarnings(item.id, []);
            }}
          >
            Send to Linear
          </ActionButton>
        ) : null}
        <span className="ops__spacer" />
        <button type="button" className="ops__btn ops__btn--danger" onClick={remove}>
          Delete
        </button>
      </footer>
    </article>
  );
}

function QueueRow({ queue, run, onEdit }) {
  const [busy, setBusy] = useState(false);
  const toggle = async (open) => {
    setBusy(true);
    await run(() => ops(`commissions/queues/${queue.id}`, { method: "PATCH", body: { open } }), {
      ok: open ? `${queue.name} is open for requests.` : `${queue.name} is closed.`,
    });
    setBusy(false);
  };
  return (
    <li className="rows__row">
      <strong className="rows__name">{queue.name}</strong>
      <Switch
        label={`${queue.name} takes requests`}
        checked={Boolean(queue.open)}
        on="Open"
        off="Closed"
        disabled={busy}
        onChange={toggle}
      />
      <button type="button" className="ops__btn ops__btn--small" onClick={onEdit}>
        Edit prices
      </button>
    </li>
  );
}

// Editor rows keep prices as typed text; dollars for usd, whole percent for percent.
const toRow = (option) => ({
  ...option,
  price: option.price_unit === "percent" ? String(option.price) : String(option.price / 100),
});

const fromRow = (row) => ({
  ...row,
  price: row.price_unit === "percent" ? Math.round(Number(row.price)) : Math.round(Number(row.price) * 100),
});

const draftOf = (queue) => ({
  name: queue.name,
  team: queue.linear_team_id || "",
  labelId: queue.linear_label_id || "",
  rows: queue.options.map(toRow),
});

// The same rules the server applies, checked while typing so Save never comes back with a surprise.
function rowProblem(row, index, rows) {
  if (!row.label.trim()) return "Needs a name";
  const price = Number(row.price);
  if (String(row.price).trim() === "" || !Number.isFinite(price) || price < 0) return "Needs a price of 0 or more";
  if (row.price_unit === "percent" && (!Number.isInteger(price) || price > 1000)) return "Use a whole percent up to 1000";
  if (row.price_unit !== "percent" && price > 100000) return "Over the $100,000 limit";
  if (row.quantity_label) {
    const included = Number(row.included);
    if (!Number.isInteger(included) || included < 0 || included > MAX_QUANTITY) return `Free units must be 0 to ${MAX_QUANTITY}`;
  }
  if (row.parent_id) {
    const at = rows.findIndex((other) => other.id === row.parent_id);
    const parent = rows[at];
    if (!parent || at > index) return `Must be below ${parent?.label || "the option it requires"}`;
    if (row.required && !parent.required) return `${parent.label || "The option it requires"} must be required too`;
  }
  return null;
}

function preview(row, rows) {
  const option = fromRow(row);
  const parts = [priceLabel({ ...option, included: row.quantity_label ? Number(row.included) || 0 : 0 })];
  if (row.required) parts.push("always included");
  const parent = row.parent_id ? rows.find((other) => other.id === row.parent_id) : null;
  if (parent) parts.push(`with ${parent.label || "(unnamed)"}`);
  return parts.join(" · ");
}

function QueueDialog({ queue, linear, used, send, onClose }) {
  const toast = useToast();
  const start = draftOf(queue);
  const [draft, setDraft] = useState(start);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [fresh, setFresh] = useState(null);
  const [ask, confirmDialog] = useConfirm();
  const { rows } = draft;
  const dirty = JSON.stringify(draft) !== JSON.stringify(start);
  const [requestClose, discardDialog] = useDiscardGuard(dirty, onClose);
  const problems = rows.map(rowProblem);
  const problemCount = problems.filter(Boolean).length + (draft.name.trim() ? 0 : 1);

  const set = (patch) => setDraft((current) => ({ ...current, ...patch }));
  const setRows = (change) => setDraft((current) => ({ ...current, rows: change(current.rows) }));
  const edit = (index, patch) => setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const move = (index, by) =>
    setRows((current) => {
      const next = [...current];
      const [row] = next.splice(index, 1);
      next.splice(index + by, 0, row);
      return next;
    });
  const removeRow = (index) => {
    const id = rows[index].id;
    setRows((current) =>
      current.filter((_, i) => i !== index).map((row) => (row.parent_id === id ? { ...row, parent_id: null } : row))
    );
  };
  const addRow = () => {
    const id = `${queue.id}-${crypto.randomUUID().slice(0, 8)}`;
    setFresh(id);
    setRows((current) => [
      ...current,
      {
        id,
        parent_id: null,
        label: "",
        price: "0",
        price_unit: "usd",
        in_base: 0,
        required: 0,
        quantity_label: "",
        included: 0,
      },
    ]);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await send(() =>
        ops(`commissions/queues/${queue.id}`, {
          method: "PUT",
          body: {
            name: draft.name,
            linear_team_id: draft.team,
            linear_label_id: draft.labelId,
            options: rows.map(fromRow),
          },
        })
      );
      toast.ok(`${draft.name.trim()} saved.`);
      onClose();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  const remove = () =>
    ask({
      title: `Delete the ${queue.name} queue?`,
      body: `The queue and its ${plural(queue.options.length, "option")} are removed from the commission form for good.`,
      label: "Delete queue",
      action: async () => {
        await send(() => ops(`commissions/queues/${queue.id}`, { method: "DELETE" }));
        onClose();
      },
      done: `Deleted the ${queue.name} queue.`,
    });

  return (
    <Modal
      className="modal--xwide"
      title={`${queue.name} prices`}
      onClose={requestClose}
      busy={saving}
      footer={
        <>
          <button
            type="button"
            className="btn btn--quiet btn--danger-quiet"
            disabled={saving || used > 0}
            title={used > 0 ? `${plural(used, "request")} use this queue. Close it instead.` : undefined}
            onClick={remove}
          >
            Delete queue
          </button>
          <span className="modal__spacer" />
          {problemCount ? <Status tone="bad">{plural(problemCount, "problem")} to fix</Status> : null}
          <button type="button" className="btn btn--quiet" onClick={() => requestClose(false)} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="btn" onClick={save} disabled={saving || !dirty || problemCount > 0}>
            {saving ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      {error ? (
        <p className="ops__error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="field-row">
        <Field label="Queue name" error={draft.name.trim() ? null : "Needs a name"}>
          {(props) => <input {...props} value={draft.name} maxLength={60} onChange={(event) => set({ name: event.target.value })} />}
        </Field>
        <Field
          label="Linear team"
          help={
            linear
              ? "Team key (such as ZAN) or ID that accepted requests are filed under. Blank uses the site default."
              : "Linear is not set up yet. This is used once it is."
          }
        >
          {(props) => <input {...props} value={draft.team} maxLength={64} onChange={(event) => set({ team: event.target.value })} />}
        </Field>
        <Field label="Linear label ID" help="Optional. A label put on every issue filed from this queue.">
          {(props) => (
            <input {...props} value={draft.labelId} maxLength={64} onChange={(event) => set({ labelId: event.target.value })} />
          )}
        </Field>
      </div>

      {rows.length ? (
        <div className="ops__scroll">
          <table className="ops__table ops__prices">
            <thead>
              <tr>
                <th>Option</th>
                <th>Price</th>
                <th>Unit</th>
                <th>
                  In base
                  <Tip text="Percent prices are a share of the ticked options added together." />
                </th>
                <th>
                  Required
                  <Tip text="Added to every request. The client cannot remove it." />
                </th>
                <th>
                  Requires
                  <Tip text="Offered only once this other option is chosen." />
                </th>
                <th>
                  Counted in
                  <Tip text="A unit such as “pages”. The client is asked how many. Blank makes a plain checkbox." />
                </th>
                <th>
                  Free units
                  <Tip text="Units covered before the price starts to apply." />
                </th>
                <th>
                  Reads as
                  <Tip text="How this option is priced on the public form." />
                </th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const name = row.label.trim() || `option ${index + 1}`;
                const parentAbove = index > 0 && rows[index - 1].id === row.parent_id;
                const childBelow = index < rows.length - 1 && rows[index + 1].parent_id === row.id;
                return (
                  <tr key={row.id}>
                    <td>
                      <input
                        className="ops__input"
                        aria-label={`Name of option ${index + 1}`}
                        maxLength={80}
                        autoFocus={row.id === fresh}
                        value={row.label}
                        onChange={(e) => edit(index, { label: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="ops__input ops__input--num"
                        aria-label={`Price of ${name}`}
                        type="number"
                        min={0}
                        step={row.price_unit === "percent" ? 1 : 0.01}
                        value={row.price}
                        onChange={(e) => edit(index, { price: e.target.value })}
                      />
                    </td>
                    <td>
                      <select
                        className="ops__select"
                        aria-label={`Unit for ${name}`}
                        value={row.price_unit}
                        onChange={(e) =>
                          edit(index, { price_unit: e.target.value, in_base: e.target.value === "percent" ? 0 : row.in_base })
                        }
                      >
                        <option value="usd">$</option>
                        <option value="percent">% of base</option>
                      </select>
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        className="ops__tick"
                        aria-label={`${name} counts toward the base`}
                        checked={!!row.in_base}
                        disabled={row.price_unit === "percent"}
                        onChange={(e) => edit(index, { in_base: e.target.checked ? 1 : 0 })}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        className="ops__tick"
                        aria-label={`${name} is required`}
                        checked={!!row.required}
                        onChange={(e) => edit(index, { required: e.target.checked ? 1 : 0 })}
                      />
                    </td>
                    <td>
                      <select
                        className="ops__select"
                        aria-label={`Option that ${name} requires`}
                        value={row.parent_id ?? ""}
                        onChange={(e) => edit(index, { parent_id: e.target.value || null })}
                      >
                        <option value="">Nothing</option>
                        {rows.slice(0, index).map((other) => (
                          <option key={other.id} value={other.id}>
                            {other.label || "(unnamed)"}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        className="ops__input ops__input--short"
                        aria-label={`Unit that ${name} is counted in`}
                        value={row.quantity_label}
                        maxLength={20}
                        onChange={(e) => edit(index, { quantity_label: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="ops__input ops__input--num"
                        aria-label={`Free units of ${name}`}
                        type="number"
                        min={0}
                        max={MAX_QUANTITY}
                        disabled={!row.quantity_label}
                        value={row.included}
                        onChange={(e) => edit(index, { included: e.target.value })}
                      />
                    </td>
                    <td className="ops__reads">
                      {problems[index] ? <span className="field__error">{problems[index]}</span> : preview(row, rows)}
                    </td>
                    <td className="ops__rowtools">
                      <button
                        type="button"
                        className="ops__btn"
                        aria-label={`Move ${name} up`}
                        title={parentAbove ? "Must stay below the option it requires" : "Move up"}
                        disabled={index === 0 || parentAbove}
                        onClick={() => move(index, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="ops__btn"
                        aria-label={`Move ${name} down`}
                        title={childBelow ? "The option below requires this one" : "Move down"}
                        disabled={index === rows.length - 1 || childBelow}
                        onClick={() => move(index, 1)}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="ops__btn ops__btn--danger"
                        aria-label={`Remove ${name}`}
                        onClick={() => removeRow(index)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>No options yet.</Empty>
      )}
      <div className="ops__actions">
        <button
          type="button"
          className="ops__btn"
          disabled={rows.length >= MAX_OPTIONS}
          title={rows.length >= MAX_OPTIONS ? `A queue holds at most ${MAX_OPTIONS} options` : undefined}
          onClick={addRow}
        >
          Add option
        </button>
      </div>
      {discardDialog}
      {confirmDialog}
    </Modal>
  );
}

function AddQueueDialog({ send, onAdded, onClose }) {
  const formId = useId();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const submit = async (event) => {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const result = await send(() => ops("commissions/queues", { method: "POST", body: { name } }));
      onAdded(result.id);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };
  return (
    <Modal
      className="modal--narrow"
      title="Add a queue"
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <button type="button" className="btn btn--quiet" onClick={() => onClose(false)} disabled={saving}>
            Cancel
          </button>
          <button type="submit" form={formId} className="btn" disabled={saving || !name.trim()}>
            {saving ? "Adding…" : "Add queue"}
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
        <Field label="Name" help="One kind of commission, such as Illustration. It starts closed; you set its prices next.">
          {(props) => <input {...props} value={name} maxLength={60} onChange={(event) => setName(event.target.value)} data-autofocus />}
        </Field>
      </form>
    </Modal>
  );
}

function TermsDialog({ terms, send, onClose }) {
  const toast = useToast();
  const initial = terms.items.join("\n\n");
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const items = draft.split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean);
  const dirty = draft !== initial;
  const [requestClose, discardDialog] = useDiscardGuard(dirty, onClose);
  const tooLong = items.findIndex((item) => item.length > MAX_TERM_LENGTH);
  const blocked = !items.length
    ? "Needs at least one term"
    : items.length > MAX_TERMS
      ? `At most ${MAX_TERMS} terms`
      : tooLong >= 0
        ? `Term ${tooLong + 1} is over ${MAX_TERM_LENGTH} characters`
        : null;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await send(() => ops("commissions/terms", { method: "PUT", body: { items } }));
      toast.ok("Terms saved.");
      onClose();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Terms of service"
      kicker={
        <>
          <span>{plural(items.length, "term")}</span>
          <span>Last changed {longDate(terms.updated) || "never"}</span>
          <a href="/tos.txt" target="_blank" rel="noreferrer">
            Published copy ↗
          </a>
        </>
      }
      onClose={requestClose}
      busy={saving}
      footer={
        <>
          {blocked ? <Status tone="bad">{blocked}</Status> : null}
          <span className="modal__spacer" />
          <button type="button" className="btn btn--quiet" onClick={() => requestClose(false)} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="btn" onClick={save} disabled={saving || !dirty || Boolean(blocked)}>
            {saving ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      {error ? (
        <p className="ops__error" role="alert">
          {error}
        </p>
      ) : null}
      <Field
        label="Terms"
        help="One term per paragraph, with a blank line between them. They are numbered in this order. Each request records the version its sender agreed to."
      >
        {(props) => <textarea {...props} rows={18} value={draft} onChange={(event) => setDraft(event.target.value)} data-autofocus />}
      </Field>
      {discardDialog}
    </Modal>
  );
}

export function CommissionsTab() {
  const { data, error, run, send } = useOps("commissions");
  const [filter, setFilter] = useState("accepted");
  const [warnings, setAllWarnings] = useState({});
  const [dialog, setDialog] = useState(null);
  const [ask, confirmDialog] = useConfirm();
  const setWarnings = (id, list) => setAllWarnings((current) => ({ ...current, [id]: list }));

  const all = data?.commissions ?? [];
  const queueList = data?.queues ?? [];
  const queues = new Map(queueList.map((queue) => [queue.id, queue]));
  const pending = all.filter((item) => item.status === "new");
  const decided = all.filter((item) => item.status !== "new").reverse();
  const shown = filter === "all" ? decided : decided.filter((item) => item.status === filter);
  const countOf = (value) => (value === "all" ? decided.length : decided.filter((item) => item.status === value).length);
  const editing = dialog?.queue ? queues.get(dialog.queue) : null;

  const card = (item) => (
    <Request
      key={item.id}
      item={item}
      queue={queues.get(item.queue_id)}
      linear={Boolean(data.linear)}
      run={run}
      send={send}
      ask={ask}
      warnings={warnings[item.id]}
      setWarnings={setWarnings}
      onDecided={setFilter}
    />
  );

  return (
    <>
      <section className="panel ops__section">
        <SectionHead title="Queues" help="An open queue takes requests on the public site. The switch takes effect right away.">
          <button type="button" className="ops__btn" disabled={!data} onClick={() => setDialog({ terms: true })}>
            Terms of service
          </button>
          <button type="button" className="ops__btn" disabled={!data} onClick={() => setDialog({ add: true })}>
            Add queue
          </button>
        </SectionHead>
        <Notice error={error} loading={!data && !error} />
        {data && !queueList.length ? <Empty>No queues yet.</Empty> : null}
        {queueList.length ? (
          <ul className="rows">
            {queueList.map((queue) => (
              <QueueRow key={queue.id} queue={queue} run={run} onEdit={() => setDialog({ queue: queue.id })} />
            ))}
          </ul>
        ) : null}
      </section>

      <section className="panel ops__section">
        <SectionHead title="Waiting" count={data ? pending.length : null} />
        {data && pending.length === 0 ? <Empty>No requests are waiting.</Empty> : null}
        {data ? <div className="ops__list">{pending.map(card)}</div> : null}
      </section>

      <section className="panel ops__section">
        <SectionHead title="Decided">
          <Segmented
            label="Decided requests to show"
            value={filter}
            onChange={setFilter}
            options={FILTERS.map(([value, label]) => ({ value, label, count: countOf(value) }))}
          />
        </SectionHead>
        {data && shown.length === 0 ? <Empty>None.</Empty> : null}
        {data ? <div className="ops__list">{shown.map(card)}</div> : null}
      </section>

      {editing ? (
        <QueueDialog
          key={editing.id}
          queue={editing}
          linear={Boolean(data.linear)}
          used={all.filter((item) => item.queue_id === editing.id).length}
          send={send}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.add ? (
        <AddQueueDialog send={send} onAdded={(id) => setDialog({ queue: id })} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.terms ? <TermsDialog terms={data.terms} send={send} onClose={() => setDialog(null)} /> : null}
      {confirmDialog}
    </>
  );
}
