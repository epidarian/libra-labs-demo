import { json, userForRequest } from "./auth.js";
import { RATINGS, text } from "./content.js";
import {
  campaignStatus,
  connectCampaign,
  disconnectCampaign,
  entitledCents,
  isActivePatron,
  syncTiers,
} from "./patreon.js";

const SLOTS = ["thumb", "full", "extra"];
const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "webp", "gif", "avif"]);
const FILE_EXT = new Set([...IMAGE_EXT, "psd", "zip", "pdf", "kra", "clip", "tif", "tiff", "txt"]);
const MAX_BYTES = 100 * 1024 * 1024;
const THUMB_WIDTH = 960;
const THUMB_SOURCE_MAX = 20 * 1024 * 1024;
const MOTIFS = ["orbit", "field", "meridian", "suns", "harbor", "trail", "heat"];
const TYPES = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  psd: "image/vnd.adobe.photoshop",
  pdf: "application/pdf",
  zip: "application/zip",
  txt: "text/plain",
  tif: "image/tiff",
  tiff: "image/tiff",
};

const FILE_ORDER = `CASE slot WHEN 'thumb' THEN 0 WHEN 'full' THEN 1 ELSE 2 END, gallery_files.created_at`;

function bit(value) {
  return value ? 1 : 0;
}


function slugify(title) {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return slug || "";
}

function safeName(name) {
  const base = String(name || "file").split(/[/\\]/).pop();
  const clean = base.replace(/[^\w. -]+/g, "").trim().slice(0, 80);
  return clean || "file";
}

function extOf(name) {
  const match = /\.([a-z0-9]{1,8})$/i.exec(name);
  return match ? match[1].toLowerCase() : "";
}

function shapeFile(file) {
  return {
    id: file.id,
    slot: file.slot,
    name: file.name,
    contentType: file.content_type,
    bytes: file.bytes,
    viewable: !!file.viewable,
    downloadable: !!file.downloadable,
    patronsOnly: !!file.patrons_only,
  };
}

export function normalizeTag(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

async function tagsByWork(env) {
  const { results } = await env.DB.prepare(
    "SELECT work_id, tag FROM gallery_work_tags ORDER BY tag"
  ).all();
  const map = new Map();
  for (const row of results) {
    const list = map.get(row.work_id) || [];
    list.push(row.tag);
    map.set(row.work_id, list);
  }
  return map;
}

function shapeWork(work, files, tags = []) {
  return {
    id: work.id,
    title: work.title,
    slug: work.slug,
    folder: `gallery/${work.slug}/`,
    rating: work.rating,
    medium: work.medium,
    description: work.description || "",
    year: work.year,
    patronsOnly: !!work.patrons_only,
    minCents: work.min_cents ?? null,
    published: !!work.published,
    createdAt: work.created_at,
    files: files.map(shapeFile),
    tags,
  };
}

async function filesFor(env, workId) {
  const { results } = await env.DB.prepare(
    `SELECT * FROM gallery_files WHERE work_id = ? ORDER BY ${FILE_ORDER}`
  )
    .bind(workId)
    .all();
  return results;
}

async function loadWork(env, id) {
  const work = await env.DB.prepare("SELECT * FROM gallery_works WHERE id = ?").bind(id).first();
  if (!work) return null;
  const tags = (await tagsByWork(env)).get(id) || [];
  return shapeWork(work, await filesFor(env, id), tags);
}

async function uniqueSlug(env, title) {
  const base = slugify(title);
  if (!base) return "";
  let slug = base;
  let n = 2;
  while (await env.DB.prepare("SELECT id FROM gallery_works WHERE slug = ?").bind(slug).first()) {
    slug = `${base}-${n++}`;
  }
  return slug;
}

function tagList(value) {
  const raw = Array.isArray(value) ? value : String(value ?? "").split(",");
  const tags = [];
  for (const item of raw) {
    const tag = normalizeTag(item);
    if (tag && !tags.includes(tag)) tags.push(tag);
  }
  return tags.slice(0, 20);
}

function centsField(value) {
  if (value === "" || value == null) return null;
  const amount = Number(value);
  if (!Number.isInteger(amount) || amount < 0 || amount > 1_000_000) return { error: "Pick a tier." };
  return amount || null;
}

function workFields(body) {
  const minCents = centsField(body?.minCents);
  if (minCents?.error) return minCents;
  const fields = {
    title: text(body?.title, 80),
    description: text(body?.description, 2000),
    year: text(body?.year, 4) || String(new Date().getUTCFullYear()),
    rating: body?.rating,
    patrons_only: bit(body?.patronsOnly),
    min_cents: minCents,
    published: bit(body?.published),
  };
  if (!fields.title) return { error: "Enter a title." };
  if (!slugify(fields.title)) return { error: "Use a title that can name a folder." };
  if (!RATINGS.includes(fields.rating)) return { error: "Tag the piece SFW or NSFW." };
  if (fields.year && !/^\d{4}$/.test(fields.year)) return { error: "Year must be four digits." };
  return fields;
}

export async function listTiers(env) {
  const { results } = await env.DB.prepare(
    "SELECT id, title, amount_cents FROM tiers ORDER BY sort, amount_cents"
  ).all();
  return results.map((row) => ({
    id: row.id,
    title: row.title,
    amountCents: row.amount_cents,
  }));
}

function tierTitle(tiers, cents) {
  if (cents == null) return null;
  return tiers.find((tier) => tier.amountCents === cents)?.title || null;
}

async function sharesTag(env, request, workId) {
  const { results } = await env.DB.prepare(
    "SELECT tag FROM gallery_work_tags WHERE work_id = ?"
  )
    .bind(workId)
    .all();
  if (!results.length) return false;
  const user = await userForRequest(env, request);
  if (!user) return false;
  const row = await env.DB.prepare(
    `SELECT 1 AS ok FROM user_tags WHERE user_id = ? AND tag IN (${results.map(() => "?").join(",")}) LIMIT 1`
  )
    .bind(user.id, ...results.map((item) => item.tag))
    .first();
  return Boolean(row);
}

export async function publishedGallery(env, rating, userId) {
  const { results: works } = await env.DB.prepare(
    `SELECT * FROM gallery_works WHERE rating = ? ORDER BY created_at DESC`
  )
    .bind(rating)
    .all();
  const tagged = await tagsByWork(env);
  let userTags = new Set();
  if (userId) {
    const { results } = await env.DB.prepare("SELECT tag FROM user_tags WHERE user_id = ?")
      .bind(userId)
      .all();
    userTags = new Set(results.map((row) => row.tag));
  }
  const shares = (work) => (tagged.get(work.id) || []).some((tag) => userTags.has(tag));
  const allowed = works.filter((work) => work.published || shares(work));
  if (!allowed.length) return { live: false, works: [] };
  const tiers = await listTiers(env);
  const { results: files } = await env.DB.prepare(
    `SELECT * FROM gallery_files WHERE work_id IN (${allowed.map(() => "?").join(",")}) ORDER BY ${FILE_ORDER}`
  )
    .bind(...allowed.map((work) => work.id))
    .all();
  const byWork = new Map();
  for (const file of files) {
    const list = byWork.get(file.work_id) || [];
    list.push(file);
    byWork.set(file.work_id, list);
  }
  return {
    live: true,
    works: allowed.map((work, i) => {
    const shaped = shapeWork(work, byWork.get(work.id) || [], tagged.get(work.id) || []);
    const visible = (file) => file && (file.viewable || file.downloadable);
    return {
      id: shaped.id,
      index: String(i + 1).padStart(2, "0"),
      title: shaped.title,
      description: shaped.description,
      year: shaped.year || String(shaped.createdAt || "").slice(0, 4),
      motif: MOTIFS[i % MOTIFS.length],
      slug: shaped.slug,
      patronsOnly: shaped.patronsOnly,
      minCents: shaped.minCents,
      tierTitle: tierTitle(tiers, shaped.minCents),
      thumb: shaped.files.find((file) => file.slot === "thumb" && visible(file)) || null,
      full: shaped.files.find((file) => file.slot === "full" && visible(file)) || null,
      files: shaped.files.filter((file) => file.slot === "extra" && visible(file)),
    };
  }),
  };
}

async function listGallery(env) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM gallery_works ORDER BY created_at DESC"
  ).all();
  const tagged = await tagsByWork(env);
  const works = [];
  for (const work of results) {
    works.push(shapeWork(work, await filesFor(env, work.id), tagged.get(work.id) || []));
  }
  return json({ works, tiers: await listTiers(env), patreon: await campaignStatus(env) });
}

async function createGallery(env, body) {
  const fields = workFields(body);
  if (fields.error) return json({ error: fields.error }, 400);
  const slug = await uniqueSlug(env, fields.title);
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO gallery_works (id, title, slug, rating, description, year, patrons_only, min_cents, published)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      fields.title,
      slug,
      fields.rating,
      fields.description,
      fields.year,
      fields.patrons_only,
      fields.min_cents,
      fields.published
    )
    .run();
  const tags = tagList(body?.tags);
  if (tags.length) {
    await env.DB.batch(
      tags.map((tag) =>
        env.DB.prepare("INSERT INTO gallery_work_tags (work_id, tag) VALUES (?, ?)").bind(id, tag)
      )
    );
  }
  console.log(JSON.stringify({ message: "gallery work created", id, slug, tags: tags.length }));
  return json({ work: await loadWork(env, id) }, 201);
}

async function updateGallery(env, id, body) {
  const fields = workFields(body);
  if (fields.error) return json({ error: fields.error }, 400);
  const { meta } = await env.DB.prepare(
    `UPDATE gallery_works
     SET title = ?, rating = ?, description = ?, year = ?, patrons_only = ?, min_cents = ?, published = ?
     WHERE id = ?`
  )
    .bind(
      fields.title,
      fields.rating,
      fields.description,
      fields.year,
      fields.patrons_only,
      fields.min_cents,
      fields.published,
      id
    )
    .run();
  if (!meta.changes) return json({ error: "Picture not found." }, 404);
  return json({ work: await loadWork(env, id) });
}

async function deletePrefix(env, slug) {
  let cursor;
  do {
    const listed = await env.GALLERY.list({ prefix: `gallery/${slug}/`, cursor });
    await Promise.all(listed.objects.map((object) => env.GALLERY.delete(object.key)));
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
}

async function deleteGallery(env, id) {
  const work = await env.DB.prepare("SELECT slug FROM gallery_works WHERE id = ?").bind(id).first();
  if (!work) return json({ error: "Picture not found." }, 404);
  if (env.GALLERY) await deletePrefix(env, work.slug);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM gallery_work_tags WHERE work_id = ?").bind(id),
    env.DB.prepare("DELETE FROM gallery_files WHERE work_id = ?").bind(id),
    env.DB.prepare("DELETE FROM gallery_works WHERE id = ?").bind(id),
  ]);
  console.log(JSON.stringify({ message: "gallery work deleted", id }));
  return json({ ok: true });
}

async function writeSlot(env, work, slot, name, body, contentType, flags) {
  const ext = extOf(name);
  const id = crypto.randomUUID();
  const key =
    slot === "thumb"
      ? `gallery/${work.slug}/thumbnail.${ext}`
      : slot === "full"
        ? `gallery/${work.slug}/full.${ext}`
        : `gallery/${work.slug}/files/${id}.${ext}`;
  const stored = await env.GALLERY.put(key, body, { httpMetadata: { contentType } });
  const bytes = stored?.size || body.byteLength || 0;
  if (!bytes) {
    await env.GALLERY.delete(key);
    return { error: "Empty upload." };
  }
  const previous =
    slot === "extra"
      ? null
      : await env.DB.prepare("SELECT id, r2_key FROM gallery_files WHERE work_id = ? AND slot = ?")
          .bind(work.id, slot)
          .first();
  if (previous) {
    await env.DB.prepare(
      `UPDATE gallery_files
       SET name = ?, r2_key = ?, content_type = ?, bytes = ?, viewable = ?, downloadable = ?, patrons_only = ?
       WHERE id = ?`
    )
      .bind(name, key, contentType, bytes, flags.viewable, flags.downloadable, flags.patrons_only, previous.id)
      .run();
    if (previous.r2_key !== key) await env.GALLERY.delete(previous.r2_key);
  } else {
    await env.DB.prepare(
      `INSERT INTO gallery_files
       (id, work_id, slot, name, r2_key, content_type, bytes, viewable, downloadable, patrons_only)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(id, work.id, slot, name, key, contentType, bytes, flags.viewable, flags.downloadable, flags.patrons_only)
      .run();
  }
  return { key, bytes };
}

async function thumbnailFrom(env, bytes) {
  if (!env.IMAGES) return { error: "Image resizing is not available." };
  try {
    let width = THUMB_WIDTH;
    try {
      const info = await env.IMAGES.info(bytes);
      if (info?.width && info.width < THUMB_WIDTH) width = info.width;
    } catch {
      width = THUMB_WIDTH;
    }
    const response = (
      await env.IMAGES.input(bytes).transform({ width }).output({ format: "image/webp" })
    ).response();
    if (!response.ok) return { error: "The thumbnail could not be made from that picture." };
    const body = await response.arrayBuffer();
    if (!body.byteLength) return { error: "The thumbnail could not be made from that picture." };
    return { body };
  } catch (err) {
    console.log(JSON.stringify({ message: "thumbnail failed", error: String(err) }));
    return { error: "The thumbnail could not be made from that picture." };
  }
}

async function uploadGalleryFile(request, env, workId, url) {
  if (!env.GALLERY) return json({ error: "Gallery storage is not configured." }, 503);
  const work = await env.DB.prepare("SELECT id, slug FROM gallery_works WHERE id = ?").bind(workId).first();
  if (!work) return json({ error: "Picture not found." }, 404);

  const params = url.searchParams;
  const slot = params.get("slot");
  if (slot === "thumb") return json({ error: "The thumbnail is made from the picture." }, 400);
  if (!SLOTS.includes(slot)) return json({ error: "Unknown file slot." }, 400);
  const name = safeName(params.get("name"));
  const ext = extOf(name);
  const allowed = slot === "extra" ? FILE_EXT : IMAGE_EXT;
  if (!allowed.has(ext)) {
    return json({ error: slot === "extra" ? "That file type is not allowed." : "Use a jpg, png, webp, gif, or avif." }, 400);
  }
  const declared = request.headers.get("content-length");
  const length = declared === null ? null : Number(declared);
  if (length === 0 || (length !== null && !Number.isFinite(length))) {
    return json({ error: "Empty upload." }, 400);
  }
  if (length !== null && length > MAX_BYTES) return json({ error: "File is larger than 100 MB." }, 413);

  const defaults = slot === "extra" ? { viewable: false, downloadable: true } : { viewable: true, downloadable: false };
  const flag = (key, fallback) => {
    const value = params.get(key);
    if (value === null) return fallback;
    return value === "1" || value === "true";
  };
  const flags = {
    viewable: bit(flag("viewable", defaults.viewable)),
    downloadable: bit(flag("downloadable", defaults.downloadable)),
    patrons_only: bit(flag("patrons_only", false)),
  };

  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength) return json({ error: "Empty upload." }, 400);
  if (bytes.byteLength > MAX_BYTES) return json({ error: "File is larger than 100 MB." }, 413);

  let thumb = null;
  let warning = null;
  if (slot === "full" && bytes.byteLength <= THUMB_SOURCE_MAX) {
    thumb = await thumbnailFrom(env, bytes);
    if (thumb.error) return json({ error: thumb.error }, 502);
  }

  const contentType = TYPES[ext] || "application/octet-stream";
  const stored = await writeSlot(env, work, slot, name, bytes, contentType, flags);
  if (stored.error) return json({ error: stored.error }, 400);

  if (slot === "full" && bytes.byteLength > THUMB_SOURCE_MAX) {
    await removeSlot(env, work.id, "thumb");
    warning = "A thumbnail still needs to be generated.";
  }

  if (thumb) {
    const existing = await env.DB.prepare(
      "SELECT viewable, downloadable, patrons_only FROM gallery_files WHERE work_id = ? AND slot = 'thumb'"
    )
      .bind(work.id)
      .first();
    const thumbFlags = existing || { viewable: 1, downloadable: 0, patrons_only: 0 };
    const written = await writeSlot(env, work, "thumb", "thumbnail.webp", thumb.body, "image/webp", thumbFlags);
    if (written.error) return json({ error: written.error }, 502);
  }

  console.log(JSON.stringify({ message: "gallery file stored", workId, slot, key: stored.key, warning }));
  return json({ work: await loadWork(env, workId), warning });
}

async function removeSlot(env, workId, slot) {
  const row = await env.DB.prepare(
    "SELECT id, r2_key FROM gallery_files WHERE work_id = ? AND slot = ?"
  )
    .bind(workId, slot)
    .first();
  if (!row) return;
  if (row.r2_key) await env.GALLERY.delete(row.r2_key);
  await env.DB.prepare("DELETE FROM gallery_files WHERE id = ?").bind(row.id).run();
}

async function updateFile(env, workId, fileId, body) {
  const sets = [];
  const binds = [];
  for (const [key, column] of [
    ["viewable", "viewable"],
    ["downloadable", "downloadable"],
    ["patronsOnly", "patrons_only"],
  ]) {
    if (body?.[key] !== undefined) {
      sets.push(`${column} = ?`);
      binds.push(bit(body[key]));
    }
  }
  if (!sets.length) return json({ error: "Nothing to change." }, 400);
  const { meta } = await env.DB.prepare(
    `UPDATE gallery_files SET ${sets.join(", ")} WHERE id = ? AND work_id = ?`
  )
    .bind(...binds, fileId, workId)
    .run();
  if (!meta.changes) return json({ error: "File not found." }, 404);
  return json({ work: await loadWork(env, workId) });
}

async function deleteFile(env, workId, fileId) {
  const file = await env.DB.prepare(
    "SELECT r2_key FROM gallery_files WHERE id = ? AND work_id = ?"
  )
    .bind(fileId, workId)
    .first();
  if (!file) return json({ error: "File not found." }, 404);
  if (env.GALLERY) await env.GALLERY.delete(file.r2_key);
  await env.DB.prepare("DELETE FROM gallery_files WHERE id = ?").bind(fileId).run();
  return json({ work: await loadWork(env, workId) });
}

async function fileBySlot(env, work, slot) {
  return env.DB.prepare("SELECT * FROM gallery_files WHERE work_id = ? AND slot = ?")
    .bind(work.id, slot)
    .first();
}

function allowed(work, file, patron, download) {
  if ((work.patrons_only || file.patrons_only) && !patron) return false;
  return download ? !!file.downloadable : !!file.viewable;
}

async function serveStored(request, env, work, file, download) {
  const patron = await isActivePatron(request, env);
  const teaser = file.slot === "thumb" && !download && !!file.viewable && !file.patrons_only;
  if (!teaser && work.min_cents != null && (!patron || (await entitledCents(request, env)) < work.min_cents)) {
    return new Response("Forbidden", { status: 403 });
  }
  if (!teaser && !allowed(work, file, patron, download)) {
    return new Response("Forbidden", { status: 403 });
  }
  const object = await env.GALLERY.get(file.r2_key);
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  if (file.content_type) headers.set("content-type", file.content_type);
  headers.set("etag", object.httpEtag);
  headers.set("x-content-type-options", "nosniff");
  const restricted = !teaser && (work.patrons_only || file.patrons_only || work.min_cents != null);
  headers.set(
    "cache-control",
    restricted || !work.published ? "private, no-store" : "public, max-age=86400"
  );
  const filename = String(file.name).replace(/["\r\n\\]/g, "");
  headers.set("content-disposition", `${download ? "attachment" : "inline"}; filename="${filename}"`);
  return new Response(request.method === "HEAD" ? null : object.body, { headers });
}

async function previewFile(request, env, workId, fileId) {
  const file = await env.DB.prepare(
    "SELECT * FROM gallery_files WHERE id = ? AND work_id = ?"
  )
    .bind(fileId, workId)
    .first();
  if (!file || !env.GALLERY) return new Response("Not found", { status: 404 });
  const object = await env.GALLERY.get(file.r2_key);
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  if (file.content_type) headers.set("content-type", file.content_type);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "private, no-store");
  headers.set("x-content-type-options", "nosniff");
  return new Response(request.method === "HEAD" ? null : object.body, { headers });
}

async function addWorkTag(env, workId, body) {
  const tag = normalizeTag(body?.tag);
  if (!tag) return json({ error: "Use a tag made of letters, numbers, or hyphens." }, 400);
  const work = await env.DB.prepare("SELECT id FROM gallery_works WHERE id = ?").bind(workId).first();
  if (!work) return json({ error: "Picture not found." }, 404);
  await env.DB.prepare("INSERT OR IGNORE INTO gallery_work_tags (work_id, tag) VALUES (?, ?)")
    .bind(workId, tag)
    .run();
  return json({ work: await loadWork(env, workId) });
}

async function removeWorkTag(env, workId, tag) {
  await env.DB.prepare("DELETE FROM gallery_work_tags WHERE work_id = ? AND tag = ?")
    .bind(workId, normalizeTag(tag))
    .run();
  const work = await loadWork(env, workId);
  if (!work) return json({ error: "Picture not found." }, 404);
  return json({ work });
}

export async function handleGalleryUpload(request, env, workId, url) {
  return uploadGalleryFile(request, env, workId, url);
}

export async function handleGalleryRoutes(env, request, url, method, id, action, extra, body) {
  if (!id && method === "GET") return listGallery(env);
  if (!id && method === "POST") return createGallery(env, body);
  if (id === "tiers" && !action && method === "POST") {
    const result = await syncTiers(env);
    if (result.error) return json({ error: result.error }, result.status);
    return listGallery(env);
  }
  if (id === "patreon" && action === "connect" && method === "POST") {
    const result = await connectCampaign(env, url, body);
    if (result.error) return json({ error: result.error }, result.status);
    return json({ ok: true, patreon: await campaignStatus(env) });
  }
  if (id === "patreon" && !action && method === "DELETE") {
    return json(await disconnectCampaign(env));
  }
  if (id && action === "files" && extra && method === "GET") return previewFile(request, env, id, extra);
  if (id && action === "files" && extra && method === "PATCH") return updateFile(env, id, extra, body);
  if (id && action === "files" && extra && method === "DELETE") return deleteFile(env, id, extra);
  if (id && action === "tags" && !extra && method === "POST") return addWorkTag(env, id, body);
  if (id && action === "tags" && extra && method === "DELETE") return removeWorkTag(env, id, extra);
  if (id && !action && method === "PUT") return updateGallery(env, id, body);
  if (id && !action && method === "DELETE") return deleteGallery(env, id);
  return null;
}

export async function handleMedia(request, env, url) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }
  if (!env.GALLERY) return new Response("Not found", { status: 404 });

  const download = url.searchParams.get("download") === "1";
  const thumb = url.pathname.match(/^\/media\/gallery\/([a-z0-9-]+)\/thumb$/);
  const full = url.pathname.match(/^\/media\/gallery\/([a-z0-9-]+)\/full$/);
  const extra = url.pathname.match(/^\/media\/gallery\/([a-z0-9-]+)\/files\/([0-9a-f-]+)$/);
  const legacy = url.pathname.match(/^\/media\/gallery\/([a-z0-9-]+)$/);
  const slug = thumb?.[1] || full?.[1] || extra?.[1] || legacy?.[1];
  if (!slug) return new Response("Not found", { status: 404 });

  const work = await env.DB.prepare("SELECT * FROM gallery_works WHERE slug = ?").bind(slug).first();
  if (!work) {
    if (!legacy) return new Response("Not found", { status: 404 });
    const object = await env.GALLERY.get(`gallery/${slug}`);
    if (!object) return new Response("Not found", { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("cache-control", "public, max-age=86400");
    headers.set("x-content-type-options", "nosniff");
    return new Response(request.method === "HEAD" ? null : object.body, { headers });
  }

  let file;
  if (extra) {
    file = await env.DB.prepare(
      "SELECT * FROM gallery_files WHERE id = ? AND work_id = ? AND slot = 'extra'"
    )
      .bind(extra[2], work.id)
      .first();
  } else if (full) {
    file = await fileBySlot(env, work, "full");
  } else {
    file = await fileBySlot(env, work, "thumb");
  }
  if (!file) return new Response("Not found", { status: 404 });
  if (!work.published && !(await sharesTag(env, request, work.id))) {
    return new Response("Not found", { status: 404 });
  }
  return serveStored(request, env, work, file, download);
}
