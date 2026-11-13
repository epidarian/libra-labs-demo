import { createContext, useContext, useEffect, useState } from "react";
import { usePatreon } from "./Patreon.jsx";
import { useSiteMode } from "./SiteMode.jsx";

const SiteContentContext = createContext(null);

export function SiteContentProvider({ children }) {
  const { rating } = useSiteMode();
  const { profile } = usePatreon();
  const [bundle, setBundle] = useState({ rating: null, content: null });

  useEffect(() => {
    let cancel = false;
    fetch(`/api/content?rating=${rating}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((next) => {
        if (!cancel && next) setBundle({ rating, content: next });
      })
      .catch(() => {});
    return () => {
      cancel = true;
    };
  }, [rating, profile?.email]);

  const content = bundle.rating === rating ? bundle.content : null;
  return <SiteContentContext.Provider value={content}>{children}</SiteContentContext.Provider>;
}

export function useSiteContent() {
  return useContext(SiteContentContext);
}
