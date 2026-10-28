import { useEffect, useState } from "react";
import { useSiteContent } from "../context/SiteContent.jsx";
import { useSiteMode } from "../context/SiteMode.jsx";
import { nsfwCatalog } from "../nsfw/catalog.js";
import { sfwCatalog } from "../sfw/catalog.js";
import { sections } from "../sections.js";
import { CommissionStatus } from "./CommissionStatus.jsx";
import { Logo } from "./Logo.jsx";
import { TopTools } from "./TopTools.jsx";

function useClearance() {
  const [top, setTop] = useState(96);
  useEffect(() => {
    const bar = document.querySelector(".topbar");
    if (!bar) return undefined;
    const measure = () => setTop(Math.ceil(bar.getBoundingClientRect().height) + 12);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);
  return top;
}

const pad = (n) => String(n).padStart(2, "0");

export function Frame({ children }) {
  const { theme, rating, section, setSection } = useSiteMode();
  const content = useSiteContent();
  const commissions = content?.commissions;
  const banner = (rating === "nsfw" ? nsfwCatalog : sfwCatalog).banner;
  const top = useClearance();

  return (
    <div className="console">
      <header className="topbar">
        <button className="brand" type="button" onClick={() => setSection("gallery")}>
          <Logo className="brand__mark" />
          <span className="brand__name">Libra Labs</span>
        </button>

        <nav className="nav" aria-label="Sections">
          {sections.map((item, i) => (
            <button
              key={item.id}
              type="button"
              className="nav__btn"
              aria-current={section === item.id ? "page" : undefined}
              onClick={() => setSection(item.id)}
            >
              <span className="nav__num">{pad(i + 1)}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <TopTools />
      </header>

      <div className="corner" style={{ top }}>
        <CommissionStatus mini status={commissions?.status ?? "open"} updated={commissions?.updated} />
        {banner ? <p className="mature">{banner}</p> : null}
      </div>
      <div className="well">{children}</div>

      <footer className="colophon">
        <span>Libra Labs</span>
        <span>
          <a href="/tos.txt">Terms</a>
          {" · "}
          <a href="/privacy-policy.txt">Privacy</a>
        </span>
        <span>Pictures, comics, prints</span>
        <span>
          {rating.toUpperCase()} / {theme === "lite" ? "LITE" : "DARK"}
        </span>
      </footer>
    </div>
  );
}
