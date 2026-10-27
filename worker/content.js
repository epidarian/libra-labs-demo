import { json, userForRequest } from "./auth.js";
import { publicCommissions, receiveCommission } from "./commissions.js";
import { demoAllowed } from "./demo.js";
import { listTiers, publishedGallery } from "./gallery.js";

export const RATINGS = ["sfw", "nsfw"];

export function sameOrigin(request, url) {
  const origin = request.headers.get("Origin");
  return !origin || origin === url.origin;
}

export function text(value, max) {
  return String(value ?? "").trim().slice(0, max);
}

export async function readSettings(env) {
  const { results } = await env.DB.prepare("SELECT key, value FROM settings").all();
  const settings = {};
  for (const row of results) {
    try {
      settings[row.key] = JSON.parse(row.value);
    } catch {
      /* skip malformed rows */
    }
  }
  return settings;
}

export async function writeSetting(env, key, value) {
  await env.DB.prepare(
    `INSERT INTO settings (key, value, updated_at)
     VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  )
    .bind(key, JSON.stringify(value))
    .run();
}

async function publicContent(env, rating, userId) {
  const settings = await readSettings(env);
  const { results: conventions } = await env.DB.prepare(
    `SELECT id, name, place, starts_on, ends_on, table_label
     FROM conventions
     WHERE rating = ?
       AND (COALESCE(ends_on, starts_on) IS NULL
            OR COALESCE(ends_on, starts_on) >= date('now'))
     ORDER BY starts_on IS NULL, starts_on, name`
  )
    .bind(rating)
    .all();
  const gallery = await publishedGallery(env, rating, userId);
  return {
    demo: demoAllowed(env),
    about: {
      sfw: settings["about.sfw"] ?? null,
      nsfw: settings["about.nsfw"] ?? null,
    },
    commissions: await publicCommissions(env, settings),
    conventions,
    gallery: gallery.works,
    galleryLive: gallery.live,
    tiers: await listTiers(env),
  };
}

export async function handleContent(request, env, url) {
  if (url.pathname === "/api/content" && request.method === "GET") {
    const rating = url.searchParams.get("rating");
    const user = await userForRequest(env, request);
    return json(await publicContent(env, RATINGS.includes(rating) ? rating : "sfw", user?.id ?? null));
  }
  if (url.pathname === "/api/commissions" && request.method === "POST") {
    if (!sameOrigin(request, url)) return json({ error: "Forbidden." }, 403);
    return receiveCommission(request, env);
  }
  return json({ error: "Not found." }, 404);
}
