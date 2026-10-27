import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  authorizeUrl,
  CREATOR_STATE_KEY,
  demoProfile,
  exchangeCode,
  patreonLive,
} from "../patreon.js";
import { emailLive } from "../emailAuth.js";

const PatreonContext = createContext(null);
const PROFILE_KEY = "libra-patreon";
const STATE_KEY = "libra-patreon-state";

function readProfile() {
  try {
    return JSON.parse(localStorage.getItem(PROFILE_KEY)) || null;
  } catch {
    return null;
  }
}

function saveProfile(profile) {
  try {
    if (profile) localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    else localStorage.removeItem(PROFILE_KEY);
  } catch {
    /* private mode */
  }
}

export function PatreonProvider({ children }) {
  const [profile, setProfile] = useState(readProfile);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancel = false;
    fetch("/api/auth/session")
      .then(async (res) => {
        if (cancel) return;
        if (res.ok) {
          const next = await res.json();
          setProfile(next);
          saveProfile(next);
          return;
        }
        const stored = readProfile();
        if (stored?.provider === "email") {
          setProfile(null);
          saveProfile(null);
        }
      })
      .catch(() => {});
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (!code) return;
    if (sessionStorage.getItem(CREATOR_STATE_KEY) === params.get("state")) return;
    const expected = sessionStorage.getItem(STATE_KEY);
    sessionStorage.removeItem(STATE_KEY);
    window.history.replaceState(null, "", window.location.pathname);
    if (!expected || params.get("state") !== expected) {
      setError("Patreon sign-in could not be verified. Try again.");
      return;
    }
    setStatus("connecting");
    exchangeCode(code)
      .then((next) => {
        setProfile(next);
        saveProfile(next);
        setStatus("idle");
      })
      .catch((err) => {
        setError(err.message);
        setStatus("idle");
      });
  }, []);

  const value = useMemo(
    () => ({
      profile,
      status,
      error,
      live: patreonLive,
      emailLive,
      isPatron: profile?.patronStatus === "active_patron",
      connect: () => {
        setError(null);
        if (patreonLive) {
          const state = crypto.randomUUID();
          sessionStorage.setItem(STATE_KEY, state);
          window.location.assign(authorizeUrl(state));
          return;
        }
        setStatus("connecting");
        window.setTimeout(() => {
          setProfile(demoProfile);
          saveProfile(demoProfile);
          setStatus("idle");
        }, 1200);
      },
      signInWithEmail: async ({ email, password, create }) => {
        setError(null);
        if (!/^\S+@\S+\.\S+$/.test(email)) {
          setError("Enter a valid email address.");
          return;
        }
        if (password.length < 8) {
          setError("Password must be at least 8 characters.");
          return;
        }
        setStatus("connecting");
        try {
          const res = await fetch(create ? "/api/auth/register" : "/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(body.error || "Sign-in failed.");
          setProfile(body);
          saveProfile(body);
        } catch (err) {
          setError(err.message);
        } finally {
          setStatus("idle");
        }
      },
      disconnect: () => {
        fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
        fetch("/api/patreon", { method: "DELETE" }).catch(() => {});
        setProfile(null);
        saveProfile(null);
      },
    }),
    [profile, status, error]
  );

  return (
    <PatreonContext.Provider value={value}>{children}</PatreonContext.Provider>
  );
}

export function usePatreon() {
  const ctx = useContext(PatreonContext);
  if (!ctx) throw new Error("usePatreon must be used within PatreonProvider");
  return ctx;
}
