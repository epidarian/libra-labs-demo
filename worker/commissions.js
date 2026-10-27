import { json } from "./auth.js";
import { RATINGS, readSettings, text, writeSetting } from "./content.js";
import { emailConfigured, sendAccepted, sendDeclined, sendReceipt } from "./email.js";
import { createCommissionIssue, linearConfigured, linearTeam } from "./linear.js";
import { normalizeOptions, quote } from "../src/commissionPricing.js";

const MAX_IMAGES = 8;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const EMAIL = /^\S+@\S+\.\S+$/;
const TERMS_KEY = "commissions.terms";

const now = () => new Date().toISOString();
const errorText = (error) => (error instanceof Error ? error.message : String(error));

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
    images.push({ name: safeImageName(file.name, sniff.ext), type: sniff.type, buffer });
  }
  return { images };
}

export async function loadQueues(env) {
  const { results: queues } = await env.DB.prepare(
    "SELECT * FROM commission_queues ORDER BY position, name"
  ).all();
  const { results: options } = await env.DB.prepare(
    "SELECT * FROM commission_options ORDER BY position"
  ).all();
  return queues.map((queue) => ({
    ...queue,
    open: !!queue.open,
    options: options.filter((option) => option.queue_id === queue.id),
  }));
}

async function loadQueue(env, id) {
  return (await loadQueues(env)).find((queue) => queue.id === id) ?? null;
}

function readTerms(settings) {
  const terms = settings[TERMS_KEY];
  return { items: Array.isArray(terms?.items) ? terms.items : [], updated: terms?.updated ?? "" };
}

const publicQueue = ({ id, name, open, options }) => ({
  id,
  name,
  open,
  options: options.map(({ queue_id, ...option }) => option),
});

// Shape served to the public site: overall status, the queues with prices, and the terms.
export async function publicCommissions(env, settings) {
  const queues = await loadQueues(env);
  const updated = queues.map((queue) => queue.updated_at).sort().pop() ?? "";
  return {
    status: queues.some((queue) => queue.open) ? "open" : "closed",
    updated: updated.slice(0, 10),
    queues: queues.map(publicQueue),
    terms: readTerms(settings),
  };
}

export async function receiveCommission(request, env) {
  if (!(request.headers.get("Content-Type") || "").includes("multipart/form-data")) {
    return json({ error: "Send the form as multipart/form-data." }, 400);
  }
  const form = await request.formData();
  const fields = {
    queue_id: text(form.get("queue"), 64),
    usernames: text(form.get("usernames"), 200),
    email: text(form.get("email"), 254).toLowerCase(),
    paypal_email: text(form.get("paypal_email"), 254).toLowerCase(),
    description: text(form.get("description"), 5000),
    rating: RATINGS.includes(form.get("rating")) ? form.get("rating") : "sfw",
  };

  if (!fields.usernames) return json({ error: "Enter your username(s)." }, 400);
  if (!EMAIL.test(fields.email)) return json({ error: "Enter a valid email address." }, 400);
  if (fields.paypal_email && !EMAIL.test(fields.paypal_email)) {
    return json({ error: "Enter a valid PayPal email address, or leave it blank." }, 400);
  }
  if (fields.paypal_email === fields.email) fields.paypal_email = "";
  if (!fields.description) return json({ error: "Enter a description." }, 400);
  if (form.get("rights") !== "1") return json({ error: "Confirm you may use the characters." }, 400);
  if (form.get("terms") !== "1") return json({ error: "Agree to the terms of service." }, 400);

  const settings = await readSettings(env);
  const terms = readTerms(settings);
  if (String(form.get("terms_version") ?? "") !== terms.updated) {
    return json({ error: "The terms of service changed. Reload the page, review them, and send again." }, 409);
  }

  const queue = await loadQueue(env, fields.queue_id);
  if (!queue) return json({ error: "Choose a commission type." }, 400);
  if (!queue.open) return json({ error: `${queue.name} commissions are closed.` }, 409);

  let picks;
  try {
    picks = JSON.parse(String(form.get("picks") || "{}"));
  } catch {
    return json({ error: "The chosen options could not be read." }, 400);
  }
  const priced = quote(queue.options, picks && typeof picks === "object" ? picks : {});
  if (priced.error) return json({ error: priced.error }, 400);

  const parsed = await readCommissionImages(form);
  if (parsed.error) return json({ error: parsed.error }, 400);
  const images = parsed.images;
  if (images.length && !env.GALLERY) return json({ error: "Image storage is not available." }, 503);

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
    console.error(JSON.stringify({ message: "commission image store failed", id, error: String(error) }));
    return json({ error: "Could not store the images." }, 502);
  }

  const row = {
    id,
    ...fields,
    selections: JSON.stringify(priced.lines),
    quote_cents: priced.totalCents,
    terms_version: terms.updated,
  };

  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO commissions
           (id, queue_id, rating, usernames, email, paypal_email, description, selections, quote_cents, terms_version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        row.id,
        row.queue_id,
        row.rating,
        row.usernames,
        row.email,
        row.paypal_email,
        row.description,
        row.selections,
        row.quote_cents,
        row.terms_version
      ),
      ...stored.map((file) =>
        env.DB.prepare(
          `INSERT INTO commission_files (id, commission_id, name, content_type, bytes, r2_key)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).bind(file.id, id, file.name, file.type, file.bytes, file.key)
      ),
    ]);
  } catch (error) {
    for (const file of stored) await env.GALLERY.delete(file.key).catch(() => {});
    console.error(JSON.stringify({ message: "commission record failed", id, error: String(error) }));
    return json({ error: "The request could not be saved." }, 500);
  }

  if (emailConfigured(env)) {
    try {
      await sendReceipt(env, row, queue.name);
    } catch (error) {
      console.error(JSON.stringify({ message: "receipt email failed", id, error: errorText(error) }));
    }
  }

  console.log(JSON.stringify({ message: "commission received", id, queue: queue.id, images: stored.length }));
  return json({ ok: true, id, quoteCents: priced.totalCents }, 201);
}

async function listCommissions(env) {
  const { results } = await env.DB.prepare("SELECT * FROM commissions ORDER BY created_at").all();
  const { results: files } = await env.DB.prepare(
    "SELECT id, commission_id, name, content_type, bytes FROM commission_files"
  ).all();
  const byCommission = new Map();
  for (const file of files) {
    const list = byCommission.get(file.commission_id) || [];
    list.push({ id: file.id, name: file.name, contentType: file.content_type, bytes: file.bytes });
    byCommission.set(file.commission_id, list);
  }
  return json({
    linear: linearConfigured(env),
    email: emailConfigured(env),
    queues: await loadQueues(env),
    terms: readTerms(await readSettings(env)),
    commissions: results.map((row) => ({
      ...row,
      selections: JSON.parse(row.selections || "[]"),
      files: byCommission.get(row.id) || [],
    })),
  });
}

async function deleteCommissionFiles(env, id) {
  const { results } = await env.DB.prepare("SELECT r2_key FROM commission_files WHERE commission_id = ?")
    .bind(id)
    .all();
  if (env.GALLERY) {
    for (const file of results) await env.GALLERY.delete(file.r2_key).catch(() => {});
  }
  await env.DB.prepare("DELETE FROM commission_files WHERE commission_id = ?").bind(id).run();
}

async function serveCommissionFile(env, commissionId, fileId) {
  const file = await env.DB.prepare(
    "SELECT r2_key, content_type FROM commission_files WHERE id = ? AND commission_id = ?"
  )
    .bind(fileId, commissionId)
    .first();
  if (!file) return json({ error: "File not found." }, 404);
  if (!env.GALLERY) return json({ error: "Image storage is not available." }, 503);
  const object = await env.GALLERY.get(file.r2_key);
  if (!object) return json({ error: "File not found." }, 404);
  const headers = new Headers();
  if (file.content_type) headers.set("content-type", file.content_type);
  headers.set("cache-control", "private, no-store");
  headers.set("x-content-type-options", "nosniff");
  return new Response(object.body, { headers });
}

async function fileToLinear(env, request, queue) {
  const { results: files } = await env.DB.prepare(
    "SELECT id, name, content_type, bytes, r2_key FROM commission_files WHERE commission_id = ? ORDER BY created_at"
  )
    .bind(request.id)
    .all();
  const issue = await createCommissionIssue(env, request, queue, files);
  await env.DB.prepare(
    "UPDATE commissions SET linear_id = ?, linear_identifier = ?, linear_url = ? WHERE id = ?"
  )
    .bind(issue.id, issue.identifier, issue.url, request.id)
    .run();
  // Linear holds the copies now; release the R2 hold.
  await deleteCommissionFiles(env, request.id);
  return issue;
}

const readRequest = (env, id) => env.DB.prepare("SELECT * FROM commissions WHERE id = ?").bind(id).first();

async function emailDecision(env, request, queue) {
  const send = request.status === "accepted" ? sendAccepted : sendDeclined;
  await send(env, request, queue.name);
  await env.DB.prepare("UPDATE commissions SET emailed_at = ? WHERE id = ?").bind(now(), request.id).run();
}

// Accept or decline a queued request. The decision is saved first; email and Linear
// failures come back as warnings so they can be retried from the console.
async function decide(env, actor, id, body) {
  if (!["accept", "decline"].includes(body?.decision)) return json({ error: "Unknown decision." }, 400);
  const request = await readRequest(env, id);
  if (!request) return json({ error: "Request not found." }, 404);
  if (request.status !== "new") return json({ error: "This request was already decided." }, 409);
  const queue = await loadQueue(env, request.queue_id);

  const decided = {
    ...request,
    status: body.decision === "accept" ? "accepted" : "declined",
    decision_note: text(body?.note, 2000),
    decided_at: now(),
  };
  await env.DB.prepare(
    "UPDATE commissions SET status = ?, decision_note = ?, decided_at = ? WHERE id = ?"
  )
    .bind(decided.status, decided.decision_note, decided.decided_at, id)
    .run();

  const warnings = [];
  if (!emailConfigured(env)) {
    warnings.push("Email is not configured, so the client was not emailed.");
  } else {
    try {
      await emailDecision(env, decided, queue);
    } catch (error) {
      warnings.push(`The email was not sent: ${errorText(error)}`);
    }
  }
  if (decided.status === "accepted" && linearConfigured(env) && linearTeam(env, queue)) {
    try {
      await fileToLinear(env, decided, queue);
    } catch (error) {
      warnings.push(errorText(error));
    }
  }
  console.log(JSON.stringify({ message: "commission decided", id, status: decided.status, by: actor.id }));
  return json({ ok: true, warnings });
}

async function resendEmail(env, id) {
  if (!emailConfigured(env)) return json({ error: "Email is not configured." }, 503);
  const request = await readRequest(env, id);
  if (!request) return json({ error: "Request not found." }, 404);
  if (!["accepted", "declined"].includes(request.status)) {
    return json({ error: "Only decided requests have an email to send." }, 409);
  }
  try {
    await emailDecision(env, request, await loadQueue(env, request.queue_id));
  } catch (error) {
    return json({ error: `The email was not sent: ${errorText(error)}` }, 502);
  }
  return json({ ok: true });
}

async function sendToLinear(env, actor, id) {
  if (!linearConfigured(env)) return json({ error: "Linear is not configured. Set LINEAR_API_KEY." }, 503);
  const request = await readRequest(env, id);
  if (!request) return json({ error: "Request not found." }, 404);
  if (request.linear_id) return json({ error: `Already sent as ${request.linear_identifier}.` }, 409);
  const queue = await loadQueue(env, request.queue_id);
  if (!linearTeam(env, queue)) return json({ error: `Set a Linear team for ${queue.name}.` }, 400);
  let issue;
  try {
    issue = await fileToLinear(env, request, queue);
  } catch (error) {
    console.error(JSON.stringify({ message: "linear send failed", id, error: errorText(error) }));
    return json({ error: errorText(error) }, 502);
  }
  console.log(JSON.stringify({ message: "sent to linear", id, issue: issue.identifier, by: actor.id }));
  return json({ ok: true, issue });
}

async function markDone(env, id, body) {
  if (body?.status !== "done") return json({ error: "Use Accept or Decline to decide a request." }, 400);
  const { meta } = await env.DB.prepare(
    "UPDATE commissions SET status = 'done' WHERE id = ? AND status = 'accepted'"
  )
    .bind(id)
    .run();
  if (!meta.changes) return json({ error: "Only accepted requests can be marked done." }, 409);
  return json({ ok: true });
}

async function deleteCommission(env, id) {
  await deleteCommissionFiles(env, id);
  await env.DB.prepare("DELETE FROM commissions WHERE id = ?").bind(id).run();
  return json({ ok: true });
}

function slugOf(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "queue";
}

async function createQueue(env, body) {
  const name = text(body?.name, 60);
  if (!name) return json({ error: "Enter a queue name." }, 400);
  let id = slugOf(name);
  if (await env.DB.prepare("SELECT 1 FROM commission_queues WHERE id = ?").bind(id).first()) {
    id = `${id}-${crypto.randomUUID().slice(0, 6)}`;
  }
  await env.DB.prepare(
    `INSERT INTO commission_queues (id, name, position, open)
     VALUES (?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM commission_queues), 0)`
  )
    .bind(id, name)
    .run();
  return json({ ok: true, id }, 201);
}

async function saveQueue(env, id, body) {
  const name = text(body?.name, 60);
  if (!name) return json({ error: "Enter a queue name." }, 400);
  const parsed = normalizeOptions(body?.options);
  if (parsed.error) return json({ error: parsed.error }, 400);
  if (!(await env.DB.prepare("SELECT 1 FROM commission_queues WHERE id = ?").bind(id).first())) {
    return json({ error: "Queue not found." }, 404);
  }
  if (parsed.options.length) {
    const marks = parsed.options.map(() => "?").join(", ");
    const clash = await env.DB.prepare(
      `SELECT label FROM commission_options WHERE queue_id <> ? AND id IN (${marks})`
    )
      .bind(id, ...parsed.options.map((option) => option.id))
      .first();
    if (clash) return json({ error: `An option id is already used by another queue (${clash.label}).` }, 400);
  }

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE commission_queues
       SET name = ?, linear_team_id = ?, linear_label_id = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ?`
    ).bind(name, text(body?.linear_team_id, 64), text(body?.linear_label_id, 64), id),
    env.DB.prepare("DELETE FROM commission_options WHERE queue_id = ?").bind(id),
    ...parsed.options.map((option) =>
      env.DB.prepare(
        `INSERT INTO commission_options
           (id, queue_id, parent_id, position, label, price, price_unit, in_base, required, quantity_label, included)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        option.id,
        id,
        option.parent_id,
        option.position,
        option.label,
        option.price,
        option.price_unit,
        option.in_base,
        option.required,
        option.quantity_label,
        option.included
      )
    ),
  ]);
  return json({ ok: true });
}

async function setQueueOpen(env, id, body) {
  if (typeof body?.open !== "boolean") return json({ error: "Send open as true or false." }, 400);
  const { meta } = await env.DB.prepare(
    "UPDATE commission_queues SET open = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?"
  )
    .bind(body.open ? 1 : 0, id)
    .run();
  if (!meta.changes) return json({ error: "Queue not found." }, 404);
  return json({ ok: true });
}

async function deleteQueue(env, id) {
  const used = await env.DB.prepare("SELECT COUNT(*) AS n FROM commissions WHERE queue_id = ?").bind(id).first();
  if (used?.n) {
    return json({ error: `${used.n} request(s) use this queue. Close it instead, or delete them first.` }, 409);
  }
  await env.DB.batch([
    env.DB.prepare("DELETE FROM commission_options WHERE queue_id = ?").bind(id),
    env.DB.prepare("DELETE FROM commission_queues WHERE id = ?").bind(id),
  ]);
  return json({ ok: true });
}

async function saveTerms(env, body) {
  const items = (Array.isArray(body?.items) ? body.items : [])
    .map((item) => text(item, 2000))
    .filter(Boolean)
    .slice(0, 40);
  if (!items.length) return json({ error: "Add at least one term." }, 400);
  const value = { items, updated: now() };
  await writeSetting(env, TERMS_KEY, value);
  return json(value);
}

// Routes under /api/ops/commissions. Returns null when nothing matches.
export function handleCommissionOps(env, actor, method, id, action, extra, body) {
  if (!id && method === "GET") return listCommissions(env);

  if (id === "terms" && !action && method === "PUT") return saveTerms(env, body);
  if (id === "queues") {
    if (!action && method === "POST") return createQueue(env, body);
    if (action && !extra && method === "PUT") return saveQueue(env, action, body);
    if (action && !extra && method === "PATCH") return setQueueOpen(env, action, body);
    if (action && !extra && method === "DELETE") return deleteQueue(env, action);
    return null;
  }

  if (id && action === "decision" && method === "POST") return decide(env, actor, id, body);
  if (id && action === "email" && method === "POST") return resendEmail(env, id);
  if (id && action === "linear" && method === "POST") return sendToLinear(env, actor, id);
  if (id && action === "files" && extra && method === "GET") return serveCommissionFile(env, id, extra);
  if (id && !action && method === "PATCH") return markDone(env, id, body);
  if (id && !action && method === "DELETE") return deleteCommission(env, id);
  return null;
}
