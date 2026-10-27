import { useState } from "react";
import { describeLine, formatCents } from "../commissionPricing.js";
import { ops, shortDate, useOps } from "./api.js";
import { Notice } from "./Notice.jsx";

const DECIDED = ["accepted", "declined", "done"];
const FILTERS = ["all", ...DECIDED];
const label = (value) => value.charAt(0).toUpperCase() + value.slice(1);

function Request({ item, queue, data, run, warnings = [], setWarnings }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const act = async (request) => {
    setBusy(true);
    const result = await run(request);
    setWarnings(item.id, result?.warnings ?? []);
    setBusy(false);
  };

  const decide = (decision) => {
    const verb = decision === "accept" ? "Accept" : "Decline";
    const mail = data.email ? ` and email ${item.email}` : "";
    if (!window.confirm(`${verb} the request from ${item.usernames}${mail}?`)) return;
    act(() => ops(`commissions/${item.id}/decision`, { method: "POST", body: { decision, note } }));
  };

  const remove = () => {
    if (!window.confirm(`Delete the request from ${item.usernames}?`)) return;
    run(() => ops(`commissions/${item.id}`, { method: "DELETE" }));
  };

  const pending = item.status === "new";
  const canLinear = item.status === "accepted" && !item.linear_url;

  return (
    <article className="ops__request" data-state={item.status}>
      <header className="ops__request-head">
        <div>
          <h3>{item.usernames}</h3>
          <a href={`mailto:${item.email}`}>{item.email}</a>
        </div>
        <span className="ops__tag">{queue?.name ?? item.queue_id}</span>
        <span className="ops__tag">{item.rating.toUpperCase()}</span>
        <time dateTime={item.created_at}>{shortDate(item.created_at)}</time>
      </header>
      <dl className="ops__facts">
        <dt>PayPal invoice to</dt>
        <dd>{item.paypal_email || item.email}</dd>
        <dt>Options</dt>
        <dd>
          {item.selections.length ? item.selections.map((line) => <div key={line.id}>{describeLine(line)}</div>) : "-"}
        </dd>
        <dt>Quoted total</dt>
        <dd>{formatCents(item.quote_cents)}</dd>
        {pending ? null : (
          <>
            <dt>Decided</dt>
            <dd>
              {label(item.status === "done" ? "accepted" : item.status)} {shortDate(item.decided_at)}
              {item.emailed_at ? ", emailed" : ", not emailed"}
            </dd>
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
              <a key={file.id} className="ops__ref" href={href} target="_blank" rel="noreferrer" title={file.name}>
                <img src={href} alt={file.name} loading="lazy" />
              </a>
            );
          })}
        </div>
      ) : null}
      {pending ? (
        <div className="field">
          <label htmlFor={`note-${item.id}`}>Note to client (optional, included in the email)</label>
          <textarea
            id={`note-${item.id}`}
            className="ops__note"
            rows={2}
            maxLength={2000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Reason for declining, or details for an accepted request"
          />
        </div>
      ) : null}
      {warnings.map((warning) => (
        <p key={warning} className="ops__error">{warning}</p>
      ))}
      <footer className="ops__actions">
        {pending ? (
          <>
            <button type="button" className="ops__btn" disabled={busy} onClick={() => decide("accept")}>
              Accept
            </button>
            <button type="button" className="ops__btn ops__btn--danger" disabled={busy} onClick={() => decide("decline")}>
              Decline
            </button>
          </>
        ) : null}
        {item.status === "accepted" ? (
          <button
            type="button"
            className="ops__btn"
            onClick={() => run(() => ops(`commissions/${item.id}`, { method: "PATCH", body: { status: "done" } }))}
          >
            Mark done
          </button>
        ) : null}
        {!pending && !item.emailed_at && data.email ? (
          <button
            type="button"
            className="ops__btn"
            disabled={busy}
            onClick={() => act(() => ops(`commissions/${item.id}/email`, { method: "POST" }))}
          >
            Send decision email
          </button>
        ) : null}
        {item.linear_url ? (
          <a className="ops__btn" href={item.linear_url} target="_blank" rel="noreferrer">
            Linear {item.linear_identifier}
          </a>
        ) : canLinear ? (
          <button
            type="button"
            className="ops__btn"
            disabled={!data.linear || busy}
            title={data.linear ? undefined : "Set LINEAR_API_KEY"}
            onClick={() => act(() => ops(`commissions/${item.id}/linear`, { method: "POST" }))}
          >
            Send to Linear
          </button>
        ) : null}
        <button type="button" className="ops__btn ops__btn--danger" onClick={remove}>
          Delete
        </button>
      </footer>
    </article>
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

function QueueEditor({ queue, linear, run }) {
  const [name, setName] = useState(queue.name);
  const [team, setTeam] = useState(queue.linear_team_id);
  const [labelId, setLabelId] = useState(queue.linear_label_id);
  const [rows, setRows] = useState(() => queue.options.map(toRow));
  const [saved, setSaved] = useState(false);
  const typed = (set) => (event) => {
    setSaved(false);
    set(event.target.value);
  };

  const edit = (index, patch) => {
    setSaved(false);
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };
  const move = (index, by) => {
    setSaved(false);
    setRows((current) => {
      const next = [...current];
      const [row] = next.splice(index, 1);
      next.splice(index + by, 0, row);
      return next;
    });
  };
  const removeRow = (index) => {
    setSaved(false);
    const id = rows[index].id;
    setRows((current) =>
      current.filter((_, i) => i !== index).map((row) => (row.parent_id === id ? { ...row, parent_id: null } : row))
    );
  };
  const addRow = () => {
    setSaved(false);
    setRows((current) => [
      ...current,
      {
        id: `${queue.id}-${crypto.randomUUID().slice(0, 8)}`,
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
    const result = await run(() =>
      ops(`commissions/queues/${queue.id}`, {
        method: "PUT",
        body: { name, linear_team_id: team, linear_label_id: labelId, options: rows.map(fromRow) },
      })
    );
    setSaved(!!result);
  };

  const remove = () => {
    if (!window.confirm(`Delete the ${queue.name} queue and its prices?`)) return;
    run(() => ops(`commissions/queues/${queue.id}`, { method: "DELETE" }));
  };

  return (
    <section className="ops__queue">
      <div className="ops__bar">
        <h3 className="panel__title">
          {queue.name}
          <span className="ops__tag">{queue.open ? "Open" : "Closed"}</span>
        </h3>
        <div className="ops__actions">
          <button
            type="button"
            className="btn"
            onClick={() =>
              run(() => ops(`commissions/queues/${queue.id}`, { method: "PATCH", body: { open: !queue.open } }))
            }
          >
            {queue.open ? `Close ${queue.name}` : `Open ${queue.name}`}
          </button>
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor={`qname-${queue.id}`}>Name</label>
          <input id={`qname-${queue.id}`} value={name} onChange={typed(setName)} />
        </div>
        <div className="field">
          <label htmlFor={`qteam-${queue.id}`}>Linear team id</label>
          <input
            id={`qteam-${queue.id}`}
            value={team}
            placeholder={linear ? "Falls back to LINEAR_TEAM_ID" : "Linear is not configured"}
            onChange={typed(setTeam)}
          />
        </div>
        <div className="field">
          <label htmlFor={`qlabel-${queue.id}`}>Linear label id (optional)</label>
          <input id={`qlabel-${queue.id}`} value={labelId} onChange={typed(setLabelId)} />
        </div>
      </div>

      <div className="ops__scroll">
        <table className="ops__table ops__prices">
          <thead>
            <tr>
              <th>Option</th>
              <th>Needs</th>
              <th>Price</th>
              <th>Unit</th>
              <th title="Percent options are a share of the sum of these">Base</th>
              <th>Required</th>
              <th title="Leave blank for a checkbox; fill in (e.g. pages) for a number input">Counted in</th>
              <th>Included</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id}>
                <td>
                  <input className="ops__input" aria-label="Option label" value={row.label} onChange={(e) => edit(index, { label: e.target.value })} />
                </td>
                <td>
                  <select
                    className="ops__select"
                    aria-label="Needs option"
                    value={row.parent_id ?? ""}
                    onChange={(e) => edit(index, { parent_id: e.target.value || null })}
                  >
                    <option value="">-</option>
                    {rows.slice(0, index).map((other) => (
                      <option key={other.id} value={other.id}>
                        {other.label || "(unnamed)"}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    className="ops__input ops__input--num"
                    aria-label="Price"
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
                    aria-label="Price unit"
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
                    aria-label="Counts toward base"
                    checked={!!row.in_base}
                    disabled={row.price_unit === "percent"}
                    onChange={(e) => edit(index, { in_base: e.target.checked ? 1 : 0 })}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    aria-label="Required"
                    checked={!!row.required}
                    onChange={(e) => edit(index, { required: e.target.checked ? 1 : 0 })}
                  />
                </td>
                <td>
                  <input
                    className="ops__input ops__input--short"
                    aria-label="Quantity unit"
                    value={row.quantity_label}
                    placeholder="-"
                    onChange={(e) => edit(index, { quantity_label: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    className="ops__input ops__input--num"
                    aria-label="Included units"
                    type="number"
                    min={0}
                    disabled={!row.quantity_label}
                    value={row.included}
                    onChange={(e) => edit(index, { included: e.target.value })}
                  />
                </td>
                <td className="ops__rowtools">
                  <button type="button" className="ops__btn" aria-label="Move up" disabled={index === 0} onClick={() => move(index, -1)}>
                    ↑
                  </button>
                  <button
                    type="button"
                    className="ops__btn"
                    aria-label="Move down"
                    disabled={index === rows.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    ↓
                  </button>
                  <button type="button" className="ops__btn ops__btn--danger" aria-label="Remove option" onClick={() => removeRow(index)}>
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="ops__actions">
        <button type="button" className="ops__btn" onClick={addRow}>
          Add option
        </button>
        <button type="button" className="btn" onClick={save}>
          Save {queue.name}
        </button>
        <button type="button" className="ops__btn ops__btn--danger" onClick={remove}>
          Delete queue
        </button>
        {saved ? <p className="ops__muted">Saved.</p> : null}
      </div>
    </section>
  );
}

function TermsEditor({ terms, run }) {
  const [draft, setDraft] = useState(() => terms.items.join("\n\n"));
  const [saved, setSaved] = useState(false);
  const save = async () => {
    const items = draft.split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean);
    const result = await run(() => ops("commissions/terms", { method: "PUT", body: { items } }));
    setSaved(!!result);
  };
  return (
    <section className="ops__queue">
      <h3 className="panel__title">Terms of Service</h3>
      <p className="ops__muted">
        One term per paragraph; leave a blank line between terms. They are numbered in order. Each request
        records the version its sender agreed to. Last changed {shortDate(terms.updated)}.
      </p>
      <div className="field">
        <textarea
          aria-label="Terms of service"
          rows={16}
          value={draft}
          onChange={(event) => {
            setSaved(false);
            setDraft(event.target.value);
          }}
        />
      </div>
      <div className="ops__actions">
        <button type="button" className="btn" onClick={save}>
          Save terms
        </button>
        {saved ? <p className="ops__muted">Saved.</p> : null}
      </div>
    </section>
  );
}

function Settings({ data, run }) {
  const [queueName, setQueueName] = useState("");
  const addQueue = async () => {
    const result = await run(() => ops("commissions/queues", { method: "POST", body: { name: queueName } }));
    if (result) setQueueName("");
  };
  return (
    <details className="panel ops__section ops__settings">
      <summary className="panel__title">Settings: queues, prices, open and closed, terms of service</summary>
      {data.queues.map((queue) => (
        <QueueEditor key={queue.id} queue={queue} linear={data.linear} run={run} />
      ))}
      <div className="ops__actions">
        <input
          className="ops__input"
          aria-label="New queue name"
          placeholder="New queue name"
          value={queueName}
          onChange={(event) => setQueueName(event.target.value)}
        />
        <button type="button" className="ops__btn" disabled={!queueName.trim()} onClick={addQueue}>
          Add queue
        </button>
        <p className="ops__muted">New queues start closed.</p>
      </div>
      <TermsEditor key={data.terms.updated} terms={data.terms} run={run} />
    </details>
  );
}

export function CommissionsTab() {
  const { data, error, run } = useOps("commissions");
  const [filter, setFilter] = useState("accepted");
  const [warnings, setAllWarnings] = useState({});
  const setWarnings = (id, list) => setAllWarnings((current) => ({ ...current, [id]: list }));
  const card = (item) => (
    <Request
      key={item.id}
      item={item}
      queue={queues.get(item.queue_id)}
      data={data}
      run={run}
      warnings={warnings[item.id]}
      setWarnings={setWarnings}
    />
  );
  const all = data?.commissions ?? [];
  const queues = new Map((data?.queues ?? []).map((queue) => [queue.id, queue]));
  const pending = all.filter((item) => item.status === "new");
  const decided = all.filter((item) => item.status !== "new").reverse();
  const shown = filter === "all" ? decided : decided.filter((item) => item.status === filter);

  return (
    <>
      <section className="panel ops__section">
        <div className="ops__bar">
          <h2 className="panel__title">Approval queue ({pending.length})</h2>
          <p className="ops__status">
            {(data?.queues ?? []).map((queue) => `${queue.name}: ${queue.open ? "open" : "closed"}`).join(" · ")}
          </p>
        </div>
        {data && !data.email ? (
          <p className="ops__muted">
            Email is not configured, so clients will not be emailed. Set EMAIL_FROM and the EMAIL binding.
          </p>
        ) : null}
        {data && !data.linear ? (
          <p className="ops__muted">Linear is not configured. Set LINEAR_API_KEY to file accepted requests.</p>
        ) : null}
        <Notice error={error} loading={!data} />
        {data && pending.length === 0 ? <p className="ops__muted">Nothing waiting for approval.</p> : null}
        <div className="ops__list">
          {pending.map(card)}
        </div>
      </section>

      <section className="panel ops__section">
        <div className="ops__bar">
          <h2 className="panel__title">Decided ({shown.length})</h2>
          <div className="ops__filters" role="group" aria-label="Filter requests">
            {FILTERS.map((value) => (
              <button
                key={value}
                type="button"
                className="ops__btn"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {label(value)} ({value === "all" ? decided.length : decided.filter((i) => i.status === value).length})
              </button>
            ))}
          </div>
        </div>
        {data && shown.length === 0 ? <p className="ops__muted">No requests.</p> : null}
        <div className="ops__list">
          {shown.map(card)}
        </div>
      </section>

      {data ? <Settings data={data} run={run} /> : null}
    </>
  );
}
