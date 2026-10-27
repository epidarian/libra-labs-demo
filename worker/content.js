import { json, readBody, userForRequest } from "./auth.js";
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

const MAX_IMAGES = 8;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function safeImageName(name, ext) {
  const base = String(name || `image.${ext}`).split(/[/\\]/).pop();
  const clean = base.replace(/[^\w. -]+/g, "").trim().slice(0, 80);
  return clean || `image.${ext}`;
}

// Identify the image from its leading bytes, not the client-declared type.
function sniffImage(buffer) {
  const b = new Uint8Array(buffer);
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: "jpg", type: "image/jpeg" };
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { ext: "png", type: "image/png" };
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return { ext: "gif", type: "image/gif" };
  if (
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) {
    return { ext: "webp", type: "image/webp" };
  }
  return null;
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
    commissions: settings.commissions ?? null,
    conventions,
    gallery: gallery.works,
    galleryLive: gallery.live,
    tiers: await listTiers(env),
  };
}

async function readCommissionImages(form) {
  const entries = form
    .getAll("images")
    .filter((value) => value && typeof value === "object" && typeof value.arrayBuffer === "function");
  if (entries.length > MAX_IMAGES) {
    return { error: `Attach up to ${MAX_IMAGES} images.` };
  }
  const images = [];
  for (const file of entries) {
    if (file.size === 0) continue;
    if (file.size > MAX_IMAGE_BYTES) {
      return { error: "Each image must be 8 MB or smaller." };
    }
    const buffer = await file.arrayBuffer();
    if (!buffer.byteLength) continue;
    const sniff = sniffImage(buffer);
    if (!sniff) return { error: "Images must be jpeg, png, webp, or gif." };
    images.push({
      name: safeImageName(file.name, sniff.ext),
      type: sniff.type,
      buffer,
    });
  }
  return { images };
}

async function receiveCommission(request, env) {
  const contentType = request.headers.get("Content-Type") || "";
  let fields;
  let images = [];
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    fields = {
      name: text(form.get("name"), 120),
      email: text(form.get("email"), 254).toLowerCase(),
      rating: RATINGS.includes(form.get("rating")) ? form.get("rating") : "sfw",
      size: text(form.get("size"), 200),
      deadline: text(form.get("deadline"), 40),
      venue: text(form.get("venue"), 200),
      message: text(form.get("message"), 5000),
    };
    const parsed = await readCommissionImages(form);
    if (parsed.error) return json({ error: parsed.error }, 400);
    images = parsed.images;
  } else {
    const body = await readBody(request);
    fields = {
      name: text(body?.name, 120),
      email: text(body?.email, 254).toLowerCase(),
      rating: RATINGS.includes(body?.rating) ? body.rating : "sfw",
      size: text(body?.size, 200),
      deadline: text(body?.deadline, 40),
      venue: text(body?.venue, 200),
      message: text(body?.message, 5000),
    };
  }

  if (!fields.name) return json({ error: "Enter your name." }, 400);
  if (!/^\S+@\S+\.\S+$/.test(fields.email)) {
    return json({ error: "Enter a valid email address." }, 400);
  }
  if (!fields.message) return json({ error: "Enter a message." }, 400);
  if (images.length && !env.GALLERY) {
    return json({ error: "Image storage is not available." }, 503);
  }

  const settings = await readSettings(env);
  if (settings.commissions?.status === "closed") {
    return json({ error: "Commissions are closed." }, 409);
  }

  const id = crypto.randomUUID();

  // Hold the images in R2 until the request is sent to Linear or deleted.
  const stored = [];
  try {
    for (const image of images) {
      const fileId = crypto.randomUUID();
      const key = `commissions/${id}/${fileId}`;
      await env.GALLERY.put(key, image.buffer, { httpMetadata: { contentType: image.type } });
      stored.push({ id: fileId, key, name: image.name, type: image.type, bytes: image.buffer.byteLength });
    }
  } catch (error) {
    for (const file of stored) await env.GALLERY.delete(file.key).catch(() => {});
    console.error(
      JSON.stringify({ message: "commission image store failed", id, error: String(error) })
    );
    return json({ error: "Could not store the images." }, 502);
  }

  const statements = [
    env.DB.prepare(
      `INSERT INTO commissions (id, name, email, rating, size, deadline, venue, message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      fields.name,
      fields.email,
      fields.rating,
      fields.size,
      fields.deadline,
      fields.venue,
      fields.message
    ),
    ...stored.map((file) =>
      env.DB.prepare(
        `INSERT INTO commission_files (id, commission_id, name, content_type, bytes, r2_key)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(file.id, id, file.name, file.type, file.bytes, file.key)
    ),
  ];

  try {
    await env.DB.batch(statements);
  } catch (error) {
    for (const file of stored) await env.GALLERY.delete(file.key).catch(() => {});
    console.error(
      JSON.stringify({ message: "commission record failed", id, error: String(error) })
    );
    return json({ error: "The request could not be saved." }, 500);
  }

  console.log(JSON.stringify({ message: "commission received", id, images: stored.length }));
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
