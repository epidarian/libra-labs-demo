export const patreonConfig = {
  clientId: import.meta.env.VITE_PATREON_CLIENT_ID || "",
  exchangeUrl: import.meta.env.VITE_PATREON_EXCHANGE_URL || "/api/patreon",
  pageUrl: import.meta.env.VITE_PATREON_PAGE_URL || "https://www.patreon.com/",
  scope: "identity",
};

export const patreonLive = Boolean(
  patreonConfig.clientId && patreonConfig.exchangeUrl
);

export function redirectUri() {
  return `${window.location.origin}${window.location.pathname}`;
}

export const CREATOR_STATE_KEY = "libra-creator-state";

export function creatorAuthorizeUrl(state) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: patreonConfig.clientId,
    redirect_uri: `${window.location.origin}/ops`,
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
