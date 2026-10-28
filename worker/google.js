const TOKEN_URL = "https://oauth2.googleapis.com/token";

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

// Asks Google to authenticate the sign-in client. A rejected code means the client was accepted.
export async function googleHealth(env, request) {
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
