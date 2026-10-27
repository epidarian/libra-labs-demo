import { createContext, useContext, useEffect, useState } from "react";
import { usePatreon } from "./Patreon.jsx";
import { useSiteMode } from "./SiteMode.jsx";

const SiteContentContext = createContext(null);

export function SiteContentProvider({ children }) {
  const { rating } = useSiteMode();
  const { profile } = usePatreon();
  const [content, setContent] = useState(null);

  useEffect(() => {
    let cancel = false;
    setContent(null);
    fetch(`/api/content?rating=${rating}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((next) => {
        if (!cancel && next) setContent(next);
      })
      .catch(() => {});
    return () => {
      cancel = true;
    };
  }, [rating, profile?.email]);

  return <SiteContentContext.Provider value={content}>{children}</SiteContentContext.Provider>;
}

export function useSiteContent() {
  return useContext(SiteContentContext);
}
