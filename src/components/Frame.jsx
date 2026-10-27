import { useSiteContent } from "../context/SiteContent.jsx";
import { useSiteMode } from "../context/SiteMode.jsx";
import { sections } from "../sections.js";
import { CommissionStatus } from "./CommissionStatus.jsx";
import { Logo } from "./Logo.jsx";
import { TopTools } from "./TopTools.jsx";

const pad = (n) => String(n).padStart(2, "0");

export function Frame({ children }) {
  const { theme, rating, section, setSection } = useSiteMode();
  const content = useSiteContent();
  const commissions = content?.commissions;

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

      <CommissionStatus mini status={commissions?.status ?? "open"} updated={commissions?.updated} />
      <div className="well">{children}</div>

      <footer className="colophon">
        <span>Libra Labs</span>
        <span>Pictures, comics, prints</span>
        <span>
          {rating.toUpperCase()} / {theme === "lite" ? "LITE" : "DARK"}
        </span>
      </footer>
    </div>
  );
}
