import { useSiteMode } from "../context/SiteMode.jsx";
import { sections } from "../sections.js";
import { Logo } from "./Logo.jsx";
import { ModeSwitch } from "./ModeSwitch.jsx";

const pad = (n) => String(n).padStart(2, "0");

export function Frame({ children }) {
  const { theme, rating, lite, nsfw, toggleTheme, toggleRating, section, setSection } =
    useSiteMode();

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

        <div className="modes" role="group" aria-label="Site mode">
          <ModeSwitch
            kind="rating"
            on={nsfw}
            onToggle={toggleRating}
            offLabel="SFW"
            onLabel="NSFW"
          />
          <ModeSwitch
            kind="theme"
            on={lite}
            onToggle={toggleTheme}
            offLabel="Dark"
            onLabel="Lite"
          />
        </div>
      </header>

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
