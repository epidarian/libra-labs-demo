import { Children } from "react";
import { money } from "../fulfillment/sheets.js";
import { usePatreonLive } from "../patreon.js";
import { ops, useOps } from "./api.js";
import { beginCreatorConnect, useCreatorReturn } from "./creatorConnect.js";
import { useConfirm } from "./Modal.jsx";
import { Notice } from "./Notice.jsx";
import { useSummary } from "./summary.js";
import { ActionButton, SectionHead, Status, Tip, plural } from "./ui.jsx";

const STATE = {
  up: { tone: "ok", label: "Working" },
  down: { tone: "bad", label: "Not working" },
  off: { tone: "off", label: "Not set up" },
};

function stateOf(service) {
  if (service?.ok) return "up";
  if (service?.configured && service.connected !== false) return "down";
  return "off";
}

function checkedLabel(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function Service({ name, use, service, children }) {
  const state = stateOf(service);
  const actions = Children.toArray(children);
  return (
    <article className="ops__service" data-state={state}>
      <header className="ops__service-head">
        <h3>
          {name}
          <Tip text={use} />
        </h3>
        <Status tone={STATE[state].tone}>{STATE[state].label}</Status>
      </header>
      {service?.detail ? <p className="ops__muted">{service.detail}</p> : null}
      {actions.length ? <footer className="ops__actions">{actions}</footer> : null}
    </article>
  );
}

function todoList(summary) {
  if (!summary) return [];
  const list = [];
  if (summary.requests) {
    list.push({ id: "requests", text: `${plural(summary.requests, "commission request")} to decide`, tab: "commissions" });
  }
  if (summary.pictures) {
    list.push({ id: "pictures", text: `${plural(summary.pictures, "picture")} missing a file or thumbnail`, tab: "gallery" });
  }
  if (summary.priceEdits) {
    list.push({ id: "edits", text: `${plural(summary.priceEdits, "price change")} from the print partner`, tab: "fulfillment" });
  }
  if (summary.unpaid) {
    list.push({
      id: "unpaid",
      text: `${plural(summary.unpaid, "unpaid invoice")} · ${money(summary.unpaidCents)}`,
      tab: "fulfillment",
    });
  }
  if (summary.partnerLocked) {
    list.push({ id: "pass", text: "The print partner has no passphrase", tab: "fulfillment" });
  }
  return list;
}

export function DashboardTab() {
  const { data, error, reload, run, send } = useOps("health");
  const { summary, refresh, goTo } = useSummary();
  const patreonLive = usePatreonLive();
  const [ask, confirmDialog] = useConfirm();
  useCreatorReturn(run);

  const patreon = data?.patreon;
  const when = data?.checkedAt ? checkedLabel(data.checkedAt) : "";
  const todo = todoList(summary);
  const canConnect = patreon?.configured && !patreon.connected;

  return (
    <>
      <section className="panel ops__section">
        <SectionHead title="To do" count={summary ? todo.length : null} />
        {!summary ? <p className="ops__muted">Loading…</p> : null}
        {summary && !todo.length ? <Status tone="ok">Nothing is waiting</Status> : null}
        {todo.length ? (
          <ul className="todo">
            {todo.map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => goTo(item.tab)}>
                  <span>{item.text}</span>
                  <span aria-hidden="true">→</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="panel ops__section">
        <SectionHead title="Services">
          {when ? <span className="ops__muted">Checked {when}</span> : null}
          <ActionButton
            busyLabel="Checking…"
            disabled={!data && !error}
            onClick={() => Promise.all([reload(), refresh()])}
          >
            Check again
          </ActionButton>
        </SectionHead>
        <Notice error={error} loading={!data && !error} />
        {data ? (
          <div className="ops__health">
            <Service
              name="Patreon"
              use="Patron sign-in, tier-locked pictures, and the patron list for Fulfillment."
              service={patreon}
            >
              {canConnect ? (
                <button
                  type="button"
                  className="btn btn--small"
                  disabled={!patreonLive}
                  title={patreonLive ? undefined : "Set VITE_PATREON_CLIENT_ID in the site build to enable this"}
                  onClick={() => beginCreatorConnect("dashboard")}
                >
                  Connect
                </button>
              ) : null}
              {patreon?.connected ? (
                <ActionButton
                  busyLabel="Refreshing…"
                  title="Reload tier names and prices from Patreon"
                  onClick={() => run(() => ops("gallery/tiers", { method: "POST" }), { ok: "Tiers refreshed from Patreon." })}
                >
                  Refresh tiers
                </ActionButton>
              ) : null}
              {patreon?.connected ? (
                <button
                  type="button"
                  className="ops__btn ops__btn--danger"
                  onClick={() =>
                    ask({
                      title: "Disconnect the Patreon campaign?",
                      body: "Tier names stop updating and the patron list can no longer be synced until it is connected again. Pictures keep their current tier locks.",
                      label: "Disconnect",
                      action: () => send(() => ops("gallery/patreon", { method: "DELETE" })),
                      done: "Patreon disconnected.",
                    })
                  }
                >
                  Disconnect
                </button>
              ) : null}
            </Service>
            <Service name="Linear" use="Accepted commission requests are filed here as issues." service={data.linear} />
            <Service name="Google" use="Sign-in with a Google account." service={data.google} />
          </div>
        ) : null}
      </section>
      {confirmDialog}
    </>
  );
}
