import { handleAuth } from "./auth.js";
import { handleContent } from "./content.js";
import { clearDemoData, demoAllowed } from "./demo.js";
import { handleMedia } from "./gallery.js";
import { handleLegal } from "./legal.js";
import { handleOps } from "./ops.js";
import { handlePatreon } from "./patreon.js";

async function opsDocument(request, env, url) {
  const page = new URL(url);
  page.pathname = "/ops";
  const asset = await env.ASSETS.fetch(new Request(page, request));
  return new Response(asset.body, {
    status: 404,
    statusText: "Not Found",
    headers: asset.headers,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (
      (request.method === "GET" || request.method === "HEAD") &&
      (url.pathname === "/ops" || url.pathname === "/ops/")
    ) {
      return opsDocument(request, env, url);
    }
    try {
      if (!demoAllowed(env)) await clearDemoData(env);
      if (url.pathname.startsWith("/api/auth/")) return await handleAuth(request, env, url);
      if (url.pathname === "/api/patreon") return await handlePatreon(request, env);
      if (url.pathname === "/api/content" || url.pathname === "/api/commissions") {
        return await handleContent(request, env, url);
      }
      if (url.pathname.startsWith("/api/ops/")) return await handleOps(request, env, url);
      if (url.pathname.startsWith("/media/")) return await handleMedia(request, env, url);
      const legal = await handleLegal(request, env, url);
      if (legal) return legal;
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
