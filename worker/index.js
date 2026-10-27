import { handleAuth } from "./auth.js";
import { handleContent } from "./content.js";
import { handleMedia } from "./gallery.js";
import { handleOps } from "./ops.js";
import { handlePatreon } from "./patreon.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith("/api/auth/")) return await handleAuth(request, env, url);
      if (url.pathname === "/api/patreon") return await handlePatreon(request, env);
      if (url.pathname === "/api/content" || url.pathname === "/api/commissions") {
        return await handleContent(request, env, url);
      }
      if (url.pathname.startsWith("/api/ops/")) return await handleOps(request, env, url);
      if (url.pathname.startsWith("/media/")) return await handleMedia(request, env, url);
    } catch (error) {
      console.error(
        JSON.stringify({
          message: "request failed",
          path: url.pathname,
          error: error instanceof Error ? error.message : String(error),
        })
      );
      return Response.json({ error: "Something went wrong." }, { status: 500 });
    }
    return new Response(null, { status: 404 });
  },
};
