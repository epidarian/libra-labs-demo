import { cookie, json, readCookie } from "./auth.js";
import { readSettings, writeSetting } from "./content.js";

const IDENTITY_URL =
  "https://www.patreon.com/api/oauth2/v2/identity" +
  "?include=memberships" +
  "&fields%5Buser%5D=full_name,image_url" +
  "&fields%5Bmember%5D=patron_status,currently_entitled_amount_cents";

const CAMPAIGNS_URL =
  "https://www.patreon.com/api/oauth2/v2/campaigns?fields%5Bcampaign%5D=creation_name,vanity";

const CREATOR_KEY = "patreon.creator";
const PATRON_COOKIE = "libra_patron";
const PATRON_SECONDS = 60 * 60 * 24 * 7;

function patreonCredentials(env) {
  return {
    id: env.VITE_PATREON_CLIENT_ID || env.PATREON_CLIENT_ID || "",
    secret: env.VITE_PATREON_CLIENT_SECRET || env.PATREON_CLIENT_SECRET || "",
  };
}

function b64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function b64urlDecode(value) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmac(secret, payload) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return b64url(new Uint8Array(sig));
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function patronCookie(request, env, status, amountCents = 0) {
  const { secret } = patreonCredentials(env);
  if (!secret || status !== "active_patron") {
    return cookie(request, "", 0, PATRON_COOKIE);
  }
  const exp = Math.floor(Date.now() / 1000) + PATRON_SECONDS;
  const payload = b64url(
    new TextEncoder().encode(
      JSON.stringify({ s: status, e: exp, c: Math.max(0, Number(amountCents) || 0) })
    )
  );
  const sig = await hmac(secret, payload);
  return cookie(request, `${payload}.${sig}`, PATRON_SECONDS, PATRON_COOKIE);
}

async function readPatron(request, env) {
  const { secret } = patreonCredentials(env);
  if (!secret) return null;
  const token = readCookie(request, PATRON_COOKIE);
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!safeEqual(sig, await hmac(secret, payload))) return null;
  try {
    const body = JSON.parse(new TextDecoder().decode(b64urlDecode(payload)));
    if (body.s !== "active_patron" || body.e <= Math.floor(Date.now() / 1000)) return null;
    return body;
  } catch {
    return null;
  }
}

export async function isActivePatron(request, env) {
  return Boolean(await readPatron(request, env));
}

export async function entitledCents(request, env) {
  const body = await readPatron(request, env);
  return body ? Number(body.c) || 0 : 0;
}

async function tokenRequest(env, params, signal) {
  const res = await fetch("https://www.patreon.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: patreonCredentials(env).id,
      client_secret: patreonCredentials(env).secret,
      ...params,
    }),
    signal,
  });
  if (!res.ok) return null;
  return res.json();
}

export async function handlePatreon(request, env) {
  if (request.method === "GET") {
    return json({ clientId: patreonCredentials(env).id });
  }
  if (request.method === "DELETE") {
    return json({ ok: true }, 200, { "Set-Cookie": await patronCookie(request, env, null) });
  }
  if (request.method !== "POST") return json({ error: "POST only" }, 405);
  if (!patreonCredentials(env).id || !patreonCredentials(env).secret) {
    return json({ error: "Patreon is not configured." }, 503);
  }

  let code;
  let redirectUri;
  try {
    ({ code, redirect_uri: redirectUri } = await request.json());
  } catch {
    return json({ error: "Bad request" }, 400);
  }

  let redirect;
  try {
    redirect = new URL(redirectUri);
  } catch {
    return json({ error: "Bad request" }, 400);
  }
  if (!code || redirect.origin !== new URL(request.url).origin) {
    return json({ error: "Bad request" }, 400);
  }

  const token = await tokenRequest(env, {
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });
  if (!token?.access_token) return json({ error: "Token exchange failed" }, 502);

  const idRes = await fetch(IDENTITY_URL, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!idRes.ok) return json({ error: "Identity lookup failed" }, 502);
  const identity = await idRes.json();

  const member = (identity.included || []).find((item) => item.type === "member");
  const patronStatus = member?.attributes.patron_status ?? null;
  return json(
    {
      name: identity.data.attributes.full_name,
      image: identity.data.attributes.image_url,
      patronStatus,
      amountCents: member?.attributes.currently_entitled_amount_cents ?? 0,
    },
    200,
    {
      "Set-Cookie": await patronCookie(
        request,
        env,
        patronStatus,
        member?.attributes.currently_entitled_amount_cents ?? 0
      ),
    }
  );
}

export async function campaignStatus(env) {
  const settings = await readSettings(env);
  const saved = settings[CREATOR_KEY];
  return {
    configured: Boolean(patreonCredentials(env).id && patreonCredentials(env).secret),
    connected: Boolean(saved?.refresh_token && saved?.campaign_id),
    campaign: saved?.campaign_name || "",
  };
}

export async function connectCampaign(env, requestUrl, body) {
  if (!patreonCredentials(env).id || !patreonCredentials(env).secret) {
    return { error: "Patreon is not configured.", status: 503 };
  }
  let redirect;
  try {
    redirect = new URL(body?.redirect_uri);
  } catch {
    return { error: "Bad request", status: 400 };
  }
  const here = new URL(requestUrl);
  if (!body?.code || redirect.origin !== here.origin || redirect.pathname !== "/ops") {
    return { error: "Bad request", status: 400 };
  }

  const token = await tokenRequest(env, {
    code: body.code,
    grant_type: "authorization_code",
    redirect_uri: body.redirect_uri,
  });
  if (!token?.access_token || !token.refresh_token) {
    return { error: "Patreon refused the connection.", status: 502 };
  }

  const campRes = await fetch(CAMPAIGNS_URL, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!campRes.ok) return { error: "Patreon campaign lookup failed.", status: 502 };
  const camps = await campRes.json();
  const campaign = camps.data?.[0];
  if (!campaign) return { error: "This Patreon account has no campaign.", status: 409 };

  const name = campaign.attributes?.creation_name || campaign.attributes?.vanity || "Campaign";
  await writeSetting(env, CREATOR_KEY, {
    refresh_token: token.refresh_token,
    access_token: token.access_token,
    expires_at: Date.now() + (token.expires_in || 0) * 1000,
    campaign_id: campaign.id,
    campaign_name: name,
  });
  console.log(JSON.stringify({ message: "patreon campaign connected", campaign: campaign.id }));
  const synced = await syncTiers(env);
  if (synced.error) {
    console.log(JSON.stringify({ message: "patreon tier sync failed", error: synced.error }));
  }
  return { campaign: name };
}

export async function disconnectCampaign(env) {
  await env.DB.prepare("DELETE FROM settings WHERE key = ?").bind(CREATOR_KEY).run();
  console.log(JSON.stringify({ message: "patreon campaign disconnected" }));
  return { ok: true };
}

async function creatorToken(env, force = false, signal) {
  const settings = await readSettings(env);
  const saved = settings[CREATOR_KEY];
  if (!saved?.refresh_token) return null;
  if (!force && saved.access_token && saved.expires_at > Date.now() + 60_000) return saved;

  const token = await tokenRequest(env, {
    grant_type: "refresh_token",
    refresh_token: saved.refresh_token,
  }, signal);
  if (!token?.access_token) return null;
  const next = {
    ...saved,
    access_token: token.access_token,
    refresh_token: token.refresh_token || saved.refresh_token,
    expires_at: Date.now() + (token.expires_in || 0) * 1000,
  };
  await writeSetting(env, CREATOR_KEY, next);
  return next;
}

async function patreonGet(env, path, signal) {
  const load = async (force) => {
    const auth = await creatorToken(env, force, signal);
    if (!auth) return { error: "Connect the Patreon campaign first.", status: 409 };
    const res = await fetch(`https://www.patreon.com${path}`, {
      headers: { Authorization: `Bearer ${auth.access_token}` },
      signal,
    });
    return res;
  };

  let res = await load(false);
  if (res.status === 401) res = await load(true);
  if (res.error) return res;
  if (res.status === 403) {
    return { error: "Patreon refused the request. Reconnect the campaign.", status: 502 };
  }
  if (!res.ok) return { error: "Patreon request failed.", status: 502 };
  return { body: await res.json() };
}

export async function syncTiers(env) {
  const result = await patreonGet(
    env,
    "/api/oauth2/v2/campaigns?include=tiers&fields%5Btier%5D=title,amount_cents,published"
  );
  if (result.error) return result;
  const included = (result.body?.included || [])
    .filter(
      (item) =>
        item.type === "tier" && item.attributes?.published !== false && item.attributes?.amount_cents > 0
    )
    .sort((a, b) => a.attributes.amount_cents - b.attributes.amount_cents);
  if (!included.length) return { error: "Patreon returned no tiers.", status: 502 };
  const statements = [env.DB.prepare("DELETE FROM tiers")];
  included.forEach((tier, index) => {
    statements.push(
      env.DB.prepare("INSERT INTO tiers (id, title, amount_cents, sort) VALUES (?, ?, ?, ?)").bind(
        tier.id,
        tier.attributes.title || "Tier",
        tier.attributes.amount_cents,
        index + 1
      )
    );
  });
  await env.DB.batch(statements);
  console.log(JSON.stringify({ message: "patreon tiers synced", count: included.length }));
  return { ok: true };
}

function probeError(error) {
  if (error?.name === "TimeoutError" || error?.name === "AbortError") return "Patreon did not answer.";
  return error instanceof Error ? error.message : "Patreon request failed.";
}

// Confirms the stored campaign token can still read the campaign. Does not rewrite tiers.
export async function patreonHealth(env) {
  const status = await campaignStatus(env);
  if (!status.configured) {
    return { ...status, ok: false, detail: "Client id and secret are unset." };
  }
  if (!status.connected) {
    return { ...status, ok: false, detail: "Connect the campaign to sync tiers." };
  }
  try {
    const result = await patreonGet(
      env,
      "/api/oauth2/v2/campaigns?fields%5Bcampaign%5D=creation_name",
      AbortSignal.timeout(8000)
    );
    if (result.error) {
      const detail =
        result.error === "Connect the Patreon campaign first."
          ? "The campaign token was refused. Reconnect."
          : result.error;
      console.error(JSON.stringify({ message: "patreon health failed", error: detail }));
      return { ...status, ok: false, detail };
    }
    const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM tiers").first();
    const tiers = Number(row?.n) || 0;
    const name = status.campaign || "Campaign";
    const stored = tiers === 1 ? "1 tier stored" : `${tiers} tiers stored`;
    return { ...status, ok: true, tiers, detail: `${name} · ${stored}` };
  } catch (error) {
    console.error(JSON.stringify({ message: "patreon health failed", error: probeError(error) }));
    return { ...status, ok: false, detail: probeError(error) };
  }
}

