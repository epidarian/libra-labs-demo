import { useEffect, useRef, useState } from "react";
import { useSiteMode } from "../context/SiteMode.jsx";
import { usePatreon } from "../context/Patreon.jsx";
import { loadDemoMode } from "../demoMode.js";
import { OPS_PATH, onOps, siteHref } from "../ops/route.js";
import { patreonConfig } from "../patreon.js";
import { ModeSwitch } from "./ModeSwitch.jsx";
import { PatreonMark } from "./PatreonMark.jsx";

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.5v2.6M12 18.9v2.6M21.5 12h-2.6M5.1 12H2.5M18.7 5.3l-1.8 1.8M7.1 16.9l-1.8 1.8M18.7 18.7l-1.8-1.8M7.1 7.1 5.3 5.3" />
      <circle cx="12" cy="12" r="6.6" />
    </svg>
  );
}

function GoogleMark() {
  return (
    <svg className="google-mark" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function Avatar({ profile, size }) {
  const initial = profile.name?.trim().charAt(0) || "?";
  return (
    <span className={`avatar avatar--${size}`} aria-hidden="true">
      {profile.image ? <img src={profile.image} alt="" /> : initial}
    </span>
  );
}

function AccountCard() {
  const { profile, isPatron, disconnect } = usePatreon();
  const viaEmail = profile.provider === "email" || profile.provider === "google";
  return (
    <div className="account">
      <div className="account__head">
        <Avatar profile={profile} size="lg" />
        <div>
          <p className="drawer__name">{profile.name}</p>
          <p className="drawer__meta">
            {viaEmail
              ? profile.email
              : isPatron
                ? `Patron, $${(profile.amountCents / 100).toFixed(2)} / month`
                : "Not a current patron"}
            {profile.provider === "patreon" && profile.email ? ` · ${profile.email}` : ""}
            {profile.demo ? " (demo)" : ""}
          </p>
        </div>
      </div>
      <a className="account__item" href={patreonConfig.pageUrl} target="_blank" rel="noreferrer">
        <PatreonMark />
        Patreon page
      </a>
      <button type="button" className="btn btn--quiet" onClick={disconnect}>
        Sign out
      </button>
    </div>
  );
}

function SignInPanel() {
  const { status, error, live, emailLive, connect, signInWithEmail, signInWithGoogle } = usePatreon();
  const [create, setCreate] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [demo, setDemo] = useState(false);
  const connecting = status === "connecting";

  useEffect(() => {
    loadDemoMode().then(setDemo);
  }, []);

  const submit = (event) => {
    event.preventDefault();
    signInWithEmail({ email, password, create });
  };

  return (
    <div className="account">
      <p className="drawer__brand">
        <PatreonMark />
        Patreon
      </p>
      <p className="drawer__meta">
        Sign in with Patreon to link your membership.
        {live ? "" : " Demo mode: no Patreon client is configured."}
      </p>
      <button type="button" className="btn btn--patreon" onClick={connect} disabled={connecting}>
        <PatreonMark />
        {connecting ? "Connecting…" : "Sign in with Patreon"}
      </button>
      <a className="account__item" href={patreonConfig.pageUrl} target="_blank" rel="noreferrer">
        Patreon page
      </a>

      <p className="drawer__or">or</p>

      <form className="login" onSubmit={submit} noValidate>
        <label className="login__field">
          <span>Email</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label className="login__field">
          <span>Password</span>
          <input
            type="password"
            autoComplete={create ? "new-password" : "current-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={8}
            required
          />
        </label>
        <button type="submit" className="btn" disabled={connecting}>
          {create ? "Create account" : "Sign in"}
        </button>
        <button type="button" className="btn btn--google" onClick={signInWithGoogle} disabled={connecting || demo}>
          <GoogleMark />
          Sign in with Google
        </button>
        {demo ? <p className="drawer__meta">Demo mode.</p> : null}
        <button type="button" className="login__switch" onClick={() => setCreate((on) => !on)}>
          {create ? "Have an account? Sign in" : "New here? Create an account"}
        </button>
        {!emailLive && (
          <p className="drawer__meta">Demo mode: no account server is configured.</p>
        )}
      </form>

      {error && (
        <p className="drawer__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function TopTools() {
  const { lite, nsfw, ambient, toggleTheme, toggleRating, toggleAmbient } = useSiteMode();
  const { profile, status, error, isPatron } = usePatreon();
  const [open, setOpen] = useState(null);
  const [demo, setDemo] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    loadDemoMode().then(setDemo);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(null);
    };
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(null);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (error) setOpen("account");
  }, [error]);

  const toggle = (id) => setOpen((current) => (current === id ? null : id));
  const viaPatreon = profile && profile.provider !== "email" && profile.provider !== "google";

  return (
    <div className="tools" ref={rootRef}>
      {profile ? (
        <button
          type="button"
          className={`tool tool--avatar${isPatron ? " is-patron" : ""}`}
          aria-label={`Account: ${profile.name}`}
          aria-expanded={open === "account"}
          aria-controls="tools-account"
          onClick={() => toggle("account")}
        >
          <Avatar profile={profile} size="sm" />
          {viaPatreon && (
            <span className="tool__badge">
              <PatreonMark />
            </span>
          )}
        </button>
      ) : (
        <button
          type="button"
          className="signin"
          aria-expanded={open === "account"}
          aria-controls="tools-account"
          onClick={() => toggle("account")}
          disabled={status === "connecting"}
        >
          <PatreonMark />
          {status === "connecting" ? "Connecting…" : "Sign in"}
        </button>
      )}

      <button
        type="button"
        className="tool"
        aria-label="Display settings"
        aria-expanded={open === "settings"}
        aria-controls="tools-settings"
        onClick={() => toggle("settings")}
      >
        <GearIcon />
      </button>

      {open === "settings" && (
        <div
          id="tools-settings"
          className="drawer drawer--settings"
          role="group"
          aria-label="Display settings"
        >
          <ModeSwitch kind="rating" on={nsfw} onToggle={toggleRating} offLabel="SFW" onLabel="NSFW" />
          <ModeSwitch kind="theme" on={lite} onToggle={toggleTheme} offLabel="Dark" onLabel="Lite" />
          <button
            type="button"
            className="drawer__ambient"
            aria-pressed={ambient}
            onClick={toggleAmbient}
          >
            Ambient Mode
          </button>
          {(demo || onOps) && (
            <a className="drawer__link" href={siteHref(onOps ? "/" : OPS_PATH)}>
              {onOps ? "Back to site" : "Operations"}
            </a>
          )}
        </div>
      )}

      {open === "account" && (
        <div id="tools-account" className="drawer" aria-label="Account">
          {profile ? <AccountCard /> : <SignInPanel />}
        </div>
      )}
    </div>
  );
}
