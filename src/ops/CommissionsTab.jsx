import { useState } from "react";
import { ops, shortDate, useOps } from "./api.js";
import { Notice } from "./Notice.jsx";

const STATES = ["new", "accepted", "declined", "done"];
const FILTERS = ["all", ...STATES];
const label = (value) => value.charAt(0).toUpperCase() + value.slice(1);

function Request({ item, linear, run }) {
  const [sending, setSending] = useState(false);

  const send = async () => {
    setSending(true);
    await run(() => ops(`commissions/${item.id}/linear`, { method: "POST" }));
    setSending(false);
  };

  const remove = () => {
    if (!window.confirm(`Delete the request from ${item.name}?`)) return;
    run(() => ops(`commissions/${item.id}`, { method: "DELETE" }));
  };

  return (
    <article className="ops__request" data-state={item.status}>
      <header className="ops__request-head">
        <div>
          <h3>{item.name}</h3>
          <a href={`mailto:${item.email}`}>{item.email}</a>
        </div>
        <span className="ops__tag">{item.rating.toUpperCase()}</span>
        <time dateTime={item.created_at}>{shortDate(item.created_at)}</time>
      </header>
      <dl className="ops__facts">
        <dt>Size</dt>
        <dd>{item.size || "-"}</dd>
        <dt>Deadline</dt>
        <dd>{item.deadline || "-"}</dd>
        <dt>Where it will be shown</dt>
        <dd>{item.venue || "-"}</dd>
      </dl>
      <p className="ops__message">{item.message}</p>
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
      <footer className="ops__actions">
        <select
          className="ops__select"
          value={item.status}
          aria-label={`Status for ${item.name}`}
          onChange={(event) =>
            run(() =>
              ops(`commissions/${item.id}`, { method: "PATCH", body: { status: event.target.value } })
            )
          }
        >
          {STATES.map((state) => (
            <option key={state} value={state}>
              {label(state)}
            </option>
          ))}
        </select>
        {item.linear_url ? (
          <a className="ops__btn" href={item.linear_url} target="_blank" rel="noreferrer">
            Linear {item.linear_identifier}
          </a>
        ) : (
          <button
            type="button"
            className="ops__btn"
            disabled={!linear || sending}
            title={linear ? undefined : "Set LINEAR_API_KEY and LINEAR_TEAM_ID"}
            onClick={send}
          >
            {sending ? "Sending…" : "Send to Linear"}
          </button>
        )}
        <button type="button" className="ops__btn ops__btn--danger" onClick={remove}>
          Delete
        </button>
      </footer>
    </article>
  );
}

export function CommissionsTab() {
  const { data, error, run } = useOps("commissions");
  const [filter, setFilter] = useState("new");
  const status = data?.status?.status ?? "open";
  const all = data?.commissions ?? [];
  const shown = filter === "all" ? all : all.filter((item) => item.status === filter);

  const setStatus = (next) =>
    run(() => ops("commissions/status", { method: "PUT", body: { status: next } }));

  return (
    <>
      <section className="panel ops__section">
        <h2 className="panel__title">Public status</h2>
        <div className="ops__actions">
          <p className="ops__status">
            Commissions are <strong>{status === "open" ? "Open" : "Closed"}</strong>
            {data?.status?.updated ? ` (since ${data.status.updated})` : ""}
          </p>
          <button
            type="button"
            className="btn"
            disabled={!data}
            onClick={() => setStatus(status === "open" ? "closed" : "open")}
          >
            {status === "open" ? "Close commissions" : "Open commissions"}
          </button>
        </div>
        {data && !data.linear ? (
          <p className="ops__muted">
            Linear is not configured. Set the LINEAR_API_KEY and LINEAR_TEAM_ID Worker secrets to
            enable Send to Linear.
          </p>
        ) : null}
      </section>

      <section className="panel ops__section">
        <div className="ops__bar">
          <h2 className="panel__title">Requests ({shown.length})</h2>
          <div className="ops__filters" role="group" aria-label="Filter requests">
            {FILTERS.map((value) => (
              <button
                key={value}
                type="button"
                className="ops__btn"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {label(value)} ({value === "all" ? all.length : all.filter((i) => i.status === value).length})
              </button>
            ))}
          </div>
        </div>
        <Notice error={error} loading={!data} />
        {data && shown.length === 0 ? <p className="ops__muted">No requests.</p> : null}
        <div className="ops__list">
          {shown.map((item) => (
            <Request key={item.id} item={item} linear={data.linear} run={run} />
          ))}
        </div>
      </section>
    </>
  );
}
