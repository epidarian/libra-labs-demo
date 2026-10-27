import { json, readBody, userForRequest } from "./auth.js";
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
    about: {
      sfw: settings["about.sfw"] ?? null,
      nsfw: settings["about.nsfw"] ?? null,
    },
    commissions: settings.commissions ?? null,
    conventions,
    gallery: gallery.works,
    galleryLive: gallery.live,
    tiers: await listTiers(env),
  };
}

async function receiveCommission(request, env) {
  const body = await readBody(request);
  const fields = {
    name: text(body?.name, 120),
    email: text(body?.email, 254).toLowerCase(),
    rating: RATINGS.includes(body?.rating) ? body.rating : "sfw",
    size: text(body?.size, 200),
    deadline: text(body?.deadline, 40),
    venue: text(body?.venue, 200),
    message: text(body?.message, 5000),
  };
  if (!fields.name) return json({ error: "Enter your name." }, 400);
  if (!/^\S+@\S+\.\S+$/.test(fields.email)) {
    return json({ error: "Enter a valid email address." }, 400);
  }
  if (!fields.message) return json({ error: "Enter a message." }, 400);

  const settings = await readSettings(env);
  if (settings.commissions?.status === "closed") {
    return json({ error: "Commissions are closed." }, 409);
  }

  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO commissions (id, name, email, rating, size, deadline, venue, message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      fields.name,
      fields.email,
      fields.rating,
      fields.size,
      fields.deadline,
      fields.venue,
      fields.message
    )
    .run();
  console.log(JSON.stringify({ message: "commission received", id }));
  return json({ ok: true, id }, 201);
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
