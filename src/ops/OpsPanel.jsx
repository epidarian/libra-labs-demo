import { useCallback, useEffect, useMemo, useState } from "react";
import { Logo } from "../components/Logo.jsx";
import { TopTools } from "../components/TopTools.jsx";
import { Viewport } from "../components/Viewport.jsx";
import { usePatreon } from "../context/Patreon.jsx";
import { AboutEditor } from "./AboutEditor.jsx";
import { CommissionsTab } from "./CommissionsTab.jsx";
import { ConventionsTab } from "./ConventionsTab.jsx";
import { creatorReturnTab } from "./creatorConnect.js";
import { DashboardTab } from "./DashboardTab.jsx";
import { FulfillmentTab } from "./FulfillmentTab.jsx";
import { GalleryTab } from "./GalleryTab.jsx";
import { sheetQuery, SheetView } from "../fulfillment/SheetView.jsx";
import { pendingGoogleReturn } from "../googleAuth.js";
import { loadDemoMode } from "../demoMode.js";
import { demoOpsOpen, workerAnswered } from "./demoAccess.js";
import { Confirm } from "./Modal.jsx";
import { NotFound } from "./NotFound.jsx";
import { siteHref } from "./route.js";
import { badgeFor, SummaryProvider, useSummaryLoader } from "./summary.js";
import { dirtyLabels, ToastProvider, useLeaveGuard } from "./ui.jsx";
import { UsersTab } from "./UsersTab.jsx";

// `about` is the hover text on the tab.
const TABS = [
  { id: "dashboard", label: "Dashboard", about: "What is waiting, and service status", Panel: DashboardTab },
  { id: "commissions", label: "Commissions", about: "Requests, queues, prices and terms", Panel: CommissionsTab },
  { id: "gallery", label: "Gallery", about: "Pictures, their files, and who can see them", Panel: GalleryTab },
  { id: "conventions", label: "Conventions", about: "The public convention schedule", Panel: ConventionsTab },
  { id: "about", label: "About page", about: "The text of the public About page", Panel: AboutEditor },
  { id: "users", label: "Users", about: "Accounts, roles, access tags and sign-ins", Panel: UsersTab },
  { id: "fulfillment", label: "Fulfillment", about: "Monthly print orders, parcels and invoices", Panel: FulfillmentTab },
];

const isTab = (id) => TABS.some((item) => item.id === id);
const hashTab = () => window.location.hash.replace(/^#/, "");

function useAccess() {
  const { profile } = usePatreon();
  const [access, setAccess] = useState(null);

  const check = useCallback(() => {
    loadDemoMode().then(() => {
      fetch("/api/ops/access")
        .then((res) => setAccess(res.ok || (!workerAnswered(res) && demoOpsOpen())))
        .catch(() => setAccess(demoOpsOpen()));
    });
  }, []);

  useEffect(check, [check, profile?.email]);

  return [access, check];
}

export function OpsPanel() {
  const [access, recheck] = useAccess();
  const googleReturn = pendingGoogleReturn();
  const printing = sheetQuery();

  if (googleReturn || access === null) return null;
  if (!access) return <NotFound onUnlock={recheck} />;
  if (printing) return <SheetView kind={printing.kind} month={printing.month} />;

  return (
    <ToastProvider>
      <Console />
    </ToastProvider>
  );
}

function Console() {
  const [tab, setTab] = useState(() => {
    const back = creatorReturnTab();
    if (back) return isTab(back) ? back : "gallery";
    return isTab(hashTab()) ? hashTab() : TABS[0].id;
  });
  const [leaving, setLeaving] = useState(null);
  const [summary, refresh] = useSummaryLoader(tab);
  useLeaveGuard();

  // The open tab lives in the address so a reload or a shared link lands on it.
  const open = useCallback((id) => {
    setTab(id);
    if (hashTab() !== id) window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${id}`);
  }, []);

  const goTo = useCallback(
    (id) => {
      if (!isTab(id) || id === tab) return;
      const unsaved = dirtyLabels();
      if (unsaved.length) setLeaving({ id, unsaved });
      else open(id);
    },
    [open, tab]
  );

  useEffect(() => {
    const onHash = () => {
      const next = hashTab();
      if (isTab(next)) goTo(next);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [goTo]);

  const context = useMemo(() => ({ summary, refresh, goTo }), [summary, refresh, goTo]);
  const { label, Panel } = TABS.find((item) => item.id === tab);

  return (
    <SummaryProvider value={context}>
      <div className="station">
        <Viewport />
        <div className="console">
          <header className="topbar">
            <a className="brand" href={siteHref("/")}>
              <Logo className="brand__mark" />
              <span className="brand__name">Libra Labs</span>
            </a>
            <nav className="nav" aria-label="Operations">
              {TABS.map((item, i) => {
                const badge = badgeFor(item.id, summary);
                return (
                  <button
                    key={item.id}
                    type="button"
                    className="nav__btn"
                    aria-current={tab === item.id ? "page" : undefined}
                    title={item.about}
                    onClick={() => goTo(item.id)}
                  >
                    <span className="nav__num">{String(i + 1).padStart(2, "0")}</span>
                    <span>{item.label}</span>
                    {badge ? (
                      <span className="nav__count" aria-label={badge.label} title={badge.label}>
                        {badge.count}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </nav>
            <TopTools />
          </header>

          <div className="well">
            <main className="view ops">
              <header className="window-head">
                <p className="tagline">
                  <span className="pill">Operations</span>
                </p>
                <h1>{label}</h1>
              </header>
              <Panel key={tab} />
            </main>
          </div>
        </div>
      </div>
      {leaving ? (
        <Confirm
          title="Leave without saving?"
          body={
            <>
              <p>These changes have not been saved and will be lost:</p>
              <ul className="ops__bullets">
                {leaving.unsaved.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </>
          }
          label="Discard and leave"
          cancelLabel="Stay here"
          onConfirm={() => {
            const { id } = leaving;
            setLeaving(null);
            open(id);
          }}
          onClose={() => setLeaving(null)}
        />
      ) : null}
    </SummaryProvider>
  );
}
