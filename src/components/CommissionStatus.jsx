import { useEffect, useState } from "react";
import { useSiteMode } from "../context/SiteMode.jsx";

export function CommissionStatus({ status, updated, link = true }) {
  const { setSection } = useSiteMode();
  const [now, setNow] = useState(() => new Date());
  const open = status === "open";

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="feed" data-open={open ? "true" : "false"} aria-label="Commission status">
      <header className="feed__head">
        <span className="feed__live">
          <i aria-hidden="true" />
          Status feed
        </span>
        <time>{now.toLocaleTimeString([], { hour12: false })}</time>
      </header>
      <p className="feed__status" aria-live="polite">
        Commissions are <strong>{open ? "Open" : "Closed"}</strong>
      </p>
      <ol className="feed__log">
        <li>
          <time dateTime={updated}>{updated}</time>
          <span>{open ? "Requests are being accepted." : "Requests are paused."}</span>
        </li>
      </ol>
      {link && open ? (
        <button type="button" className="feed__action" onClick={() => setSection("commissions")}>
          Request a commission
        </button>
      ) : null}
    </section>
  );
}
