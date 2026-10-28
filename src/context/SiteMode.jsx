import { createContext, useContext, useEffect, useMemo, useState } from "react";

const SiteModeContext = createContext(null);

function readStored(key, allowed, fallback) {
  try {
    const value = localStorage.getItem(key);
    return allowed.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function store(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
}

export function SiteModeProvider({ children }) {
  const [adult, setAdult] = useState(
    () => readStored("libra-age", ["adult"], null) === "adult"
  );
  const [gateOpen, setGateOpen] = useState(() => !adult);
  const [theme, setTheme] = useState(() =>
    readStored("libra-theme", ["dark", "lite"], "dark")
  );
  const [rating, setRating] = useState(() =>
    adult ? readStored("libra-rating", ["sfw", "nsfw"], "nsfw") : "sfw"
  );
  const [ambient, setAmbient] = useState(false);
  const [section, setSectionState] = useState("gallery");
  const setSection = (id) => {
    setSectionState(id);
    window.scrollTo(0, 0);
  };

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.rating = rating;
    document.documentElement.dataset.ambient = ambient ? "true" : "false";
    store("libra-theme", theme);
    if (adult) store("libra-rating", rating);
  }, [theme, rating, adult, ambient]);

  const value = useMemo(
    () => ({
      theme,
      rating,
      lite: theme === "lite",
      nsfw: rating === "nsfw",
      adult,
      gateOpen,
      section,
      ambient,
      setSection,
      toggleTheme: () => setTheme((t) => (t === "dark" ? "lite" : "dark")),
      toggleAmbient: () => setAmbient((on) => !on),
      toggleRating: () => {
        if (rating === "nsfw") setRating("sfw");
        else if (adult) setRating("nsfw");
        else setGateOpen(true);
      },
      confirmAdult: () => {
        store("libra-age", "adult");
        setAdult(true);
        setRating("nsfw");
        setGateOpen(false);
      },
      declineAdult: () => {
        setRating("sfw");
        setGateOpen(false);
      },
    }),
    [theme, rating, adult, gateOpen, section, ambient]
  );

  return (
    <SiteModeContext.Provider value={value}>{children}</SiteModeContext.Provider>
  );
}

export function useSiteMode() {
  const ctx = useContext(SiteModeContext);
  if (!ctx) throw new Error("useSiteMode must be used within SiteModeProvider");
  return ctx;
}
