import { emailHealth } from "./email.js";
import { googleHealth } from "./google.js";
import { linearHealth } from "./linear.js";
import { patreonHealth } from "./patreon.js";

function failed(error, detail) {
  return { configured: false, ok: false, detail: error instanceof Error ? error.message : detail };
}

export async function serviceHealth(env, request) {
  const [patreon, linear, email, google] = await Promise.all([
    patreonHealth(env).catch((error) => ({ ...failed(error, "Patreon check failed."), connected: false })),
    linearHealth(env).catch((error) => failed(error, "Linear check failed.")),
    Promise.resolve().then(() => emailHealth(env)),
    googleHealth(env, request).catch((error) => failed(error, "Google check failed.")),
  ]);
  return { checkedAt: new Date().toISOString(), patreon, linear, email, google };
}
