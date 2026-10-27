// Cloudflare Worker. Exchanges a Patreon OAuth code for a token (the client
// secret cannot ship to the browser) and returns a minimal profile.
// Secrets: PATREON_CLIENT_ID, PATREON_CLIENT_SECRET. Var: ALLOWED_ORIGIN.

const IDENTITY_URL =
  "https://www.patreon.com/api/oauth2/v2/identity" +
  "?include=memberships" +
  "&fields%5Buser%5D=full_name,image_url" +
  "&fields%5Bmember%5D=patron_status,currently_entitled_amount_cents";

function cors(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(env, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors(env) },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors(env) });
    }
    if (request.method !== "POST") return json(env, { error: "POST only" }, 405);

    const { code, redirect_uri: redirectUri } = await request.json();
    if (!code || !redirectUri?.startsWith(env.ALLOWED_ORIGIN)) {
      return json(env, { error: "Bad request" }, 400);
    }

    const tokenRes = await fetch("https://www.patreon.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        grant_type: "authorization_code",
        client_id: env.PATREON_CLIENT_ID,
        client_secret: env.PATREON_CLIENT_SECRET,
        redirect_uri: redirectUri,
      }),
    });
    if (!tokenRes.ok) return json(env, { error: "Token exchange failed" }, 502);
    const { access_token: token } = await tokenRes.json();

    const idRes = await fetch(IDENTITY_URL, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!idRes.ok) return json(env, { error: "Identity lookup failed" }, 502);
    const identity = await idRes.json();

    const member = (identity.included || []).find((item) => item.type === "member");
    return json(env, {
      name: identity.data.attributes.full_name,
      image: identity.data.attributes.image_url,
      patronStatus: member?.attributes.patron_status ?? null,
      amountCents: member?.attributes.currently_entitled_amount_cents ?? 0,
    });
  },
};
