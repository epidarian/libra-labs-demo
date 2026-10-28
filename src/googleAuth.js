const STATE_KEY = "libra-google-state";
const RETURN_KEY = "libra-google-return";

let taken = null;
let inflight = false;
let exchange = null;

export function googleRedirect() {
  return `${window.location.origin}/ops`;
}

function safeReturn(value) {
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
  return value;
}

export function isGoogleReturn() {
  try {
    const params = new URLSearchParams(window.location.search);
    return Boolean(params.get("state") && sessionStorage.getItem(STATE_KEY) === params.get("state"));
  } catch {
    return false;
  }
}

export function pendingGoogleReturn() {
  if (inflight) return true;
  try {
    const params = new URLSearchParams(window.location.search);
    return Boolean(params.get("code") && sessionStorage.getItem(STATE_KEY) === params.get("state"));
  } catch {
    return false;
  }
}

function takeGoogleReturn() {
  if (taken) return taken;
  const params = new URLSearchParams(window.location.search);
  const state = params.get("state");
  let expected = "";
  let back = "/";
  try {
    expected = sessionStorage.getItem(STATE_KEY) || "";
    back = sessionStorage.getItem(RETURN_KEY) || "/";
  } catch {
    return null;
  }
  if (!expected || state !== expected) return null;
  try {
    sessionStorage.removeItem(STATE_KEY);
    sessionStorage.removeItem(RETURN_KEY);
  } catch {
    /* private mode */
  }
  window.history.replaceState(null, "", window.location.pathname);
  inflight = true;
  taken = {
    code: params.get("code") || "",
    oauthError: params.get("error") || "",
    back: safeReturn(back),
  };
  return taken;
}

export function finishGoogleReturn() {
  inflight = false;
}

const ERROR_KEY = "libra-google-error";

export function holdGoogleError(message) {
  try {
    sessionStorage.setItem(ERROR_KEY, message);
  } catch {
    /* private mode */
  }
}

export function takeGoogleError() {
  try {
    const message = sessionStorage.getItem(ERROR_KEY) || "";
    if (message) sessionStorage.removeItem(ERROR_KEY);
    return message;
  } catch {
    return "";
  }
}

export function googleExchange() {
  const callback = takeGoogleReturn();
  if (!callback) return null;
  if (!exchange) {
    exchange = (async () => {
      if (callback.oauthError || !callback.code) {
        return { error: "Google sign-in was cancelled.", back: callback.back };
      }
      try {
        const res = await fetch("/api/auth/google", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: callback.code, redirect_uri: googleRedirect() }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) return { error: body.error || "Google sign-in failed.", back: callback.back };
        return { profile: body, back: callback.back };
      } catch {
        return { error: "Google sign-in failed.", back: callback.back };
      }
    })();
  }
  return exchange;
}

export function discardGoogleReturn() {
  if (!isGoogleReturn()) return;
  try {
    sessionStorage.removeItem(STATE_KEY);
    sessionStorage.removeItem(RETURN_KEY);
  } catch {
    /* private mode */
  }
  window.history.replaceState(null, "", window.location.pathname);
}

export async function beginGoogleSignIn() {
  const res = await fetch("/api/auth/google");
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.clientId) throw new Error(body.error || "Google sign-in is not configured.");
  const state = crypto.randomUUID();
  sessionStorage.setItem(STATE_KEY, state);
  sessionStorage.setItem(RETURN_KEY, `${window.location.pathname}${window.location.search}`);
  const params = new URLSearchParams({
    client_id: body.clientId,
    redirect_uri: googleRedirect(),
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  window.location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}
