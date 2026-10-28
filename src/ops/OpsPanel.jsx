import { useCallback, useEffect, useState } from "react";
import { Logo } from "../components/Logo.jsx";
import { TopTools } from "../components/TopTools.jsx";
import { Viewport } from "../components/Viewport.jsx";
import { usePatreon } from "../context/Patreon.jsx";
import { AboutEditor } from "./AboutEditor.jsx";
import { CommissionsTab } from "./CommissionsTab.jsx";
import { ConventionsTab } from "./ConventionsTab.jsx";
import { creatorReturnTab } from "./creatorConnect.js";
import { DashboardTab } from "./DashboardTab.jsx";
import { GalleryTab } from "./GalleryTab.jsx";
import { pendingGoogleReturn } from "../googleAuth.js";
import { loadDemoMode } from "../demoMode.js";
import { demoOpsOpen, workerAnswered } from "./demoAccess.js";
import { NotFound } from "./NotFound.jsx";
import { siteHref } from "./route.js";
import { UsersTab } from "./UsersTab.jsx";

const TABS = [
  { id: "dashboard", label: "Dashboard", Panel: DashboardTab },
  { id: "commissions", label: "Commissions", Panel: CommissionsTab },
  { id: "gallery", label: "Gallery", Panel: GalleryTab },
  { id: "conventions", label: "Conventions", Panel: ConventionsTab },
  { id: "about", label: "About page", Panel: AboutEditor },
  { id: "users", label: "Users", Panel: UsersTab },
];

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
  const [tab, setTab] = useState(() => {
    const back = creatorReturnTab();
    if (!back) return TABS[0].id;
    return TABS.some((item) => item.id === back) ? back : "gallery";
  });

  if (googleReturn || access === null) return null;
  if (!access) return <NotFound onUnlock={recheck} />;

  const { label, Panel } = TABS.find((item) => item.id === tab);

  return (
    <div className="station">
      <Viewport />
      <div className="console">
        <header className="topbar">
          <a className="brand" href={siteHref("/")}>
            <Logo className="brand__mark" />
            <span className="brand__name">Libra Labs</span>
          </a>
          <nav className="nav" aria-label="Operations">
            {TABS.map((item, i) => (
              <button
                key={item.id}
                type="button"
                className="nav__btn"
                aria-current={tab === item.id ? "page" : undefined}
                onClick={() => setTab(item.id)}
              >
                <span className="nav__num">{String(i + 1).padStart(2, "0")}</span>
                <span>{item.label}</span>
              </button>
            ))}
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
  );
}
