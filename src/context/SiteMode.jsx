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

export function SiteModeProvider({ children }) {
  const [theme, setTheme] = useState(() =>
    readStored("libra-theme", ["dark", "lite"], "dark")
  );
  const [rating, setRating] = useState(() =>
    readStored("libra-rating", ["sfw", "nsfw"], "sfw")
  );
  const [section, setSectionState] = useState("gallery");
  const setSection = (id) => {
    setSectionState(id);
    window.scrollTo(0, 0);
  };

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.rating = rating;
    try {
      localStorage.setItem("libra-theme", theme);
      localStorage.setItem("libra-rating", rating);
    } catch {
      /* private mode */
    }
  }, [theme, rating]);

  const value = useMemo(
    () => ({
      theme,
      rating,
      lite: theme === "lite",
      nsfw: rating === "nsfw",
      section,
      setSection,
      toggleTheme: () => setTheme((t) => (t === "dark" ? "lite" : "dark")),
      toggleRating: () => setRating((r) => (r === "sfw" ? "nsfw" : "sfw")),
    }),
    [theme, rating, section]
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
