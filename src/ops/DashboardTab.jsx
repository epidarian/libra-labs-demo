import { Children, useState } from "react";
import { usePatreonLive } from "../patreon.js";
import { ops, useOps } from "./api.js";
import { beginCreatorConnect, useCreatorReturn } from "./creatorConnect.js";
import { Notice } from "./Notice.jsx";

const LABEL = { up: "Up", down: "Down", off: "Off" };

function tone(service) {
  if (service?.ok) return "up";
  if (service?.configured && service.connected !== false) return "down";
  return "off";
}

function checkedLabel(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function Service({ name, service, note, children }) {
  const state = tone(service);
  const actions = Children.toArray(children);
  return (
    <article className="ops__service" data-state={state}>
      <header className="ops__service-head">
        <h3>{name}</h3>
        <span className="ops__tag">{LABEL[state]}</span>
      </header>
      <p className="ops__muted">{service?.detail}</p>
      {note}
      {actions.length ? <footer className="ops__actions">{actions}</footer> : null}
    </article>
  );
}

export function DashboardTab() {
  const { data, error, reload, run } = useOps("health");
  const [busy, setBusy] = useState(false);
  const patreonLive = usePatreonLive();
  useCreatorReturn(run);

  const act = async (request) => {
    setBusy(true);
    await run(request);
    setBusy(false);
  };

  const check = async () => {
    setBusy(true);
    await reload();
    setBusy(false);
  };

  const patreon = data?.patreon;
  const when = data?.checkedAt ? checkedLabel(data.checkedAt) : "";

  return (
    <section className="panel ops__section">
      <div className="ops__bar">
        <h2 className="panel__title">Services</h2>
        <button type="button" className="ops__btn" disabled={!data || busy} onClick={check}>
          Check again
        </button>
      </div>
      {when ? <p className="ops__muted">Checked {when}</p> : null}
      <Notice error={error} loading={!data && !error} />
      {data ? (
        <div className="ops__health">
          <Service
            name="Patreon"
            service={patreon}
            note={
              patreon?.configured && !patreon.connected && !patreonLive ? (
                <p className="ops__muted">Set VITE_PATREON_CLIENT_ID to start the connection.</p>
              ) : null
            }
          >
            {patreon?.configured && !patreon.connected ? (
              <button
                type="button"
                className="ops__btn"
                disabled={!patreonLive || busy}
                onClick={() => beginCreatorConnect("dashboard")}
              >
                Connect
              </button>
            ) : null}
            {patreon?.connected ? (
              <button
                type="button"
                className="ops__btn"
                disabled={busy}
                onClick={() => act(() => ops("gallery/tiers", { method: "POST" }))}
              >
                Sync tiers
              </button>
            ) : null}
            {patreon?.connected ? (
              <button
                type="button"
                className="ops__btn"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm("Disconnect the Patreon campaign?")) return;
                  act(() => ops("gallery/patreon", { method: "DELETE" }));
                }}
              >
                Disconnect
              </button>
            ) : null}
          </Service>
          <Service name="Linear" service={data.linear} />
          <Service name="Google" service={data.google} />
        </div>
      ) : null}
    </section>
  );
}
