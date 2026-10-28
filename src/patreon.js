import { useEffect, useState } from "react";
import { OPS_PATH } from "./ops/route.js";

export const patreonConfig = {
  clientId: import.meta.env.VITE_PATREON_CLIENT_ID || "",
  exchangeUrl: import.meta.env.VITE_PATREON_EXCHANGE_URL || "/api/patreon",
  pageUrl: import.meta.env.VITE_PATREON_PAGE_URL || "https://www.patreon.com/",
  scope: "identity identity[email]",
};

export function patreonIsLive() {
  return Boolean(patreonConfig.clientId && patreonConfig.exchangeUrl);
}

const listeners = new Set();
let clientLoad = null;

function notify() {
  listeners.forEach((listener) => listener());
}

export function loadPatreonClient() {
  if (!clientLoad) {
    clientLoad = fetch(patreonConfig.exchangeUrl)
      .then(async (res) => {
        if (!res.ok) return;
        const body = await res.json();
        patreonConfig.clientId = body.clientId || "";
        notify();
      })
      .catch(() => {});
  }
  return clientLoad;
}

export function usePatreonLive() {
  const [live, setLive] = useState(patreonIsLive);
  useEffect(() => {
    const update = () => setLive(patreonIsLive());
    listeners.add(update);
    loadPatreonClient().then(update);
    return () => listeners.delete(update);
  }, []);
  return live;
}

export function redirectUri() {
  return `${window.location.origin}${OPS_PATH}`;
}

export const CREATOR_STATE_KEY = "libra-creator-state";

export function creatorAuthorizeUrl(state) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: patreonConfig.clientId,
    redirect_uri: redirectUri(),
    scope: "identity campaigns",
    state,
  });
  return `https://www.patreon.com/oauth2/authorize?${params}`;
}

export function authorizeUrl(state) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: patreonConfig.clientId,
    redirect_uri: redirectUri(),
    scope: patreonConfig.scope,
    state,
  });
  return `https://www.patreon.com/oauth2/authorize?${params}`;
}

export async function exchangeCode(code) {
  const res = await fetch(patreonConfig.exchangeUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, redirect_uri: redirectUri() }),
  });
  if (!res.ok) throw new Error(`Exchange failed (${res.status})`);
  return res.json();
}

export const demoProfile = {
  name: "Demo patron",
  image: null,
  patronStatus: "active_patron",
  amountCents: 500,
  demo: true,
};
