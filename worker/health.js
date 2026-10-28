import { emailHealth } from "./email.js";
import { linearHealth } from "./linear.js";
import { patreonHealth } from "./patreon.js";

function failed(error, detail) {
  return { configured: false, ok: false, detail: error instanceof Error ? error.message : detail };
}

export async function serviceHealth(env) {
  const [patreon, linear, email] = await Promise.all([
    patreonHealth(env).catch((error) => ({ ...failed(error, "Patreon check failed."), connected: false })),
    linearHealth(env).catch((error) => failed(error, "Linear check failed.")),
    Promise.resolve().then(() => emailHealth(env)),
  ]);
  return { checkedAt: new Date().toISOString(), patreon, linear, email };
}
