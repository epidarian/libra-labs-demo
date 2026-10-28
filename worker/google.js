import { demoAllowed } from "./demo.js";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

function probeError(error) {
  if (error?.name === "TimeoutError" || error?.name === "AbortError") return "Google did not answer.";
  return "Google request failed.";
}

function missing(clientId, clientSecret) {
  if (!clientId && !clientSecret) return "Client id and secret are unset.";
  if (!clientId) return "Client id is unset.";
  return "Client secret is unset.";
}

export function googleRedirect(request) {
  return `${new URL(request.url).origin}/ops`;
}

const DEMO = { configured: false, ok: false, detail: "Demo mode." };

// Asks Google to authenticate the sign-in client. A rejected code means the client was accepted.
export async function googleHealth(env, request) {
  if (demoAllowed(env)) return DEMO;
  const redirect = googleRedirect(request);
  const clientId = String(env.GOOGLE_CLIENT_ID || "").trim();
  const clientSecret = String(env.GOOGLE_CLIENT_SECRET || "").trim();
  if (!clientId || !clientSecret) {
    return {
      configured: false,
      ok: false,
      redirect,
      detail: `${missing(clientId, clientSecret)} Redirect is ${redirect}.`,
    };
  }

  const signal = AbortSignal.timeout(8000);
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: "health-check",
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirect,
      }),
      signal,
    });
    const payload = await res.json().catch(() => null);
    if (payload?.access_token) {
      console.error(JSON.stringify({ message: "google health failed", error: "unexpected token" }));
      return { configured: true, ok: false, redirect, detail: "Google request failed." };
    }
    const error = typeof payload?.error === "string" ? payload.error : "";
    if (error === "redirect_uri_mismatch") {
      console.error(JSON.stringify({ message: "google health failed", error }));
      return { configured: true, ok: false, redirect, detail: `Add this redirect: ${redirect}.` };
    }
    if (error === "invalid_grant") {
      return {
        configured: true,
        ok: true,
        redirect,
        detail: `Sign-in client accepted. Redirect is ${redirect}.`,
      };
    }
    if (error === "invalid_client" || error === "deleted_client") {
      console.error(JSON.stringify({ message: "google health failed", error }));
      return { configured: true, ok: false, redirect, detail: "Client id or secret was refused." };
    }
    console.error(JSON.stringify({ message: "google health failed", error: error || res.status }));
    return { configured: true, ok: false, redirect, detail: "Google request failed." };
  } catch (error) {
    const detail = probeError(error);
    console.error(JSON.stringify({ message: "google health failed", error: detail }));
    return { configured: true, ok: false, redirect, detail };
  }
}

function httpsUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.toString().slice(0, 2000) : null;
  } catch {
    return null;
  }
}

// Exchanges an authorization code for the Google account's verified email.
export async function googleUser(env, code, redirectUri) {
  if (demoAllowed(env)) return { error: "Demo mode.", status: 503 };
  const clientId = String(env.GOOGLE_CLIENT_ID || "").trim();
  const clientSecret = String(env.GOOGLE_CLIENT_SECRET || "").trim();
  if (!clientId || !clientSecret) return { error: "Google sign-in is not configured.", status: 503 };

  const signal = AbortSignal.timeout(8000);
  let token;
  let info;
  try {
    const tokenRes = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }),
      signal,
    });
    token = await tokenRes.json().catch(() => null);
    if (!token?.access_token) {
      console.error(JSON.stringify({ message: "google sign-in failed", error: token?.error || tokenRes.status }));
      return { error: "Google refused the sign-in.", status: 502 };
    }
    const infoRes = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${token.access_token}` },
      signal,
    });
    info = await infoRes.json().catch(() => null);
    if (!infoRes.ok) {
      console.error(JSON.stringify({ message: "google sign-in failed", error: info?.error || infoRes.status }));
      return { error: "Google refused the sign-in.", status: 502 };
    }
  } catch (error) {
    const detail = probeError(error);
    console.error(JSON.stringify({ message: "google sign-in failed", error: detail }));
    return { error: detail, status: 502 };
  }

  const email = String(info.email || "").trim().toLowerCase();
  if (!info.email_verified || !/^\S+@\S+\.\S+$/.test(email) || email.length > 254) {
    return { error: "Google did not confirm an email address.", status: 403 };
  }
  const name = String(info.name || "").trim().slice(0, 80);
  return { email, name: name || null, image: httpsUrl(info.picture) };
}
