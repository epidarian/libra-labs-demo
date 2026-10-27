import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  authorizeUrl,
  demoProfile,
  exchangeCode,
  patreonLive,
} from "../patreon.js";
import { demoEmailProfile, emailLive } from "../emailAuth.js";

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
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (!code) return;
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
      signInWithEmail: ({ email, password }) => {
        setError(null);
        if (!/^\S+@\S+\.\S+$/.test(email)) {
          setError("Enter a valid email address.");
          return;
        }
        if (password.length < 8) {
          setError("Password must be at least 8 characters.");
          return;
        }
        if (!emailLive) {
          setStatus("connecting");
          window.setTimeout(() => {
            const next = demoEmailProfile(email);
            setProfile(next);
            saveProfile(next);
            setStatus("idle");
          }, 900);
        }
      },
      disconnect: () => {
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
