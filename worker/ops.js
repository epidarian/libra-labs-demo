import { isAdmin, json, readBody, userForRequest } from "./auth.js";
import { handleCommissionOps } from "./commissions.js";
import { RATINGS, sameOrigin, text, writeSetting } from "./content.js";
import { handleGalleryRoutes, handleGalleryUpload, normalizeTag } from "./gallery.js";
import { serviceHealth } from "./health.js";
import { codeMatches, hasPass, issuePass } from "./opsPass.js";

const ROLES = ["user", "admin"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function dateOrNull(value) {
  const v = text(value, 10);
  return DATE.test(v) ? v : null;
}

async function listUsers(env, admin) {
  const now = Math.floor(Date.now() / 1000);
  const { results } = await env.DB.prepare(
    `SELECT users.id, users.email, users.role, users.disabled_at, users.created_at,
       (SELECT COUNT(*) FROM sessions
        WHERE sessions.user_id = users.id AND sessions.expires_at > ?) AS sessions
     FROM users
     ORDER BY users.created_at DESC`
  )
    .bind(now)
    .all();
  const { results: tags } = await env.DB.prepare(
    "SELECT user_id, tag FROM user_tags ORDER BY tag"
  ).all();
  const byUser = new Map();
  for (const row of tags) {
    const list = byUser.get(row.user_id) || [];
    list.push(row.tag);
    byUser.set(row.user_id, list);
  }
  return json({
    me: admin.id,
    users: results.map((user) => ({
      ...user,
      tags: byUser.get(user.id) || [],
      admin: isAdmin(env, user),
      envAdmin: user.role !== "admin" && isAdmin(env, user),
    })),
  });
}

async function addUserTag(env, id, body) {
  const tag = normalizeTag(body?.tag);
  if (!tag) return json({ error: "Use a tag made of letters, numbers, or hyphens." }, 400);
  const target = await env.DB.prepare("SELECT id FROM users WHERE id = ?").bind(id).first();
  if (!target) return json({ error: "User not found." }, 404);
  await env.DB.prepare("INSERT OR IGNORE INTO user_tags (user_id, tag) VALUES (?, ?)").bind(id, tag).run();
  return json({ ok: true, tag });
}

async function removeUserTag(env, id, tag) {
  const name = normalizeTag(tag);
  if (!name) return json({ error: "Unknown tag." }, 400);
  await env.DB.prepare("DELETE FROM user_tags WHERE user_id = ? AND tag = ?").bind(id, name).run();
  return json({ ok: true });
}

async function updateUser(env, admin, id, body) {
  const target = await env.DB.prepare("SELECT id FROM users WHERE id = ?").bind(id).first();
  if (!target) return json({ error: "User not found." }, 404);
  const self = id === admin.id;
  const statements = [];

  if (body?.role !== undefined) {
    if (!ROLES.includes(body.role)) return json({ error: "Unknown role." }, 400);
    if (self && body.role !== "admin") {
      return json({ error: "You cannot remove your own admin role." }, 400);
    }
    statements.push(env.DB.prepare("UPDATE users SET role = ? WHERE id = ?").bind(body.role, id));
  }
  if (body?.disabled !== undefined) {
    if (self && body.disabled) return json({ error: "You cannot disable your own account." }, 400);
    statements.push(
      env.DB.prepare(
        "UPDATE users SET disabled_at = CASE WHEN ? THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') END WHERE id = ?"
      ).bind(body.disabled ? 1 : 0, id)
    );
    if (body.disabled) {
      statements.push(env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id));
    }
  }
  if (!statements.length) return json({ error: "Nothing to change." }, 400);
  await env.DB.batch(statements);
  console.log(JSON.stringify({ message: "user updated", id, by: admin.id }));
  return json({ ok: true });
}

async function deleteUser(env, admin, id) {
  if (id === admin.id) return json({ error: "You cannot delete your own account." }, 400);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id),
    env.DB.prepare("DELETE FROM user_tags WHERE user_id = ?").bind(id),
    env.DB.prepare("DELETE FROM users WHERE id = ?").bind(id),
  ]);
  console.log(JSON.stringify({ message: "user deleted", id, by: admin.id }));
  return json({ ok: true });
}

async function revokeSessions(env, admin, id) {
  await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id).run();
  console.log(JSON.stringify({ message: "sessions revoked", id, by: admin.id }));
  return json({ ok: true });
}

function conventionFields(body) {
  const fields = {
    name: text(body?.name, 120),
    place: text(body?.place, 120),
    starts_on: dateOrNull(body?.starts_on),
    ends_on: dateOrNull(body?.ends_on),
    table_label: text(body?.table_label, 60),
    rating: body?.rating,
  };
  if (!fields.name) return { error: "Enter a convention name." };
  if (!RATINGS.includes(fields.rating)) return { error: "Tag the convention SFW or NSFW." };
  if (fields.starts_on && fields.ends_on && fields.ends_on < fields.starts_on) {
    return { error: "End date is before start date." };
  }
  return fields;
}

async function listConventions(env) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM conventions ORDER BY starts_on IS NULL, starts_on, name"
  ).all();
  return json({ conventions: results });
}

async function saveConvention(env, id, body) {
  const fields = conventionFields(body);
  if (fields.error) return json({ error: fields.error }, 400);
  const values = [
    fields.name,
    fields.place,
    fields.starts_on,
    fields.ends_on,
    fields.table_label,
    fields.rating,
  ];
  if (!id) {
    const newId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO conventions (name, place, starts_on, ends_on, table_label, rating, id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(...values, newId)
      .run();
    return json({ ok: true, id: newId }, 201);
  }
  const { meta } = await env.DB.prepare(
    `UPDATE conventions
     SET name = ?, place = ?, starts_on = ?, ends_on = ?, table_label = ?, rating = ?
     WHERE id = ?`
  )
    .bind(...values, id)
    .run();
  if (!meta.changes) return json({ error: "Convention not found." }, 404);
  return json({ ok: true, id });
}

async function deleteConvention(env, id) {
  await env.DB.prepare("DELETE FROM conventions WHERE id = ?").bind(id).run();
  return json({ ok: true });
}

async function saveAbout(env, rating, body) {
  if (!RATINGS.includes(rating)) return json({ error: "Unknown catalog." }, 404);
  if (body?.reset) {
    await env.DB.prepare("DELETE FROM settings WHERE key = ?").bind(`about.${rating}`).run();
    return json({ ok: true });
  }
  const paragraphs = (Array.isArray(body?.paragraphs) ? body.paragraphs : [])
    .map((p) => text(p, 2000))
    .filter(Boolean)
    .slice(0, 20);
  const value = { title: text(body?.title, 80) || "About", paragraphs };
  if (!paragraphs.length) return json({ error: "Add at least one paragraph." }, 400);
  await writeSetting(env, `about.${rating}`, value);
  return json(value);
}

const notFound = () => json({ error: "Not found." }, 404);

async function actorFor(env, request) {
  const user = await userForRequest(env, request);
  if (user && isAdmin(env, user)) return user;
  if (await hasPass(env, request)) return { id: null };
  return null;
}

export async function handleOps(request, env, url) {
  const method = request.method;
  const [resource, id, action, extra] = url.pathname.replace(/^\/api\/ops\//, "").split("/");
  const upload = resource === "gallery" && id && action === "files" && !extra && method === "PUT";
  if (upload) {
    if (!sameOrigin(request, url)) return notFound();
    const uploader = await actorFor(env, request);
    if (!uploader) return notFound();
    return handleGalleryUpload(request, env, id, url);
  }

  if (method !== "GET" && !sameOrigin(request, url)) return notFound();
  const body = method === "GET" || method === "DELETE" ? null : await readBody(request);

  if (resource === "access" && !id && method === "POST") {
    if (!(await codeMatches(body?.code))) return notFound();
    console.log(JSON.stringify({ message: "ops unlocked by code" }));
    return json({ ok: true }, 200, { "Set-Cookie": await issuePass(env, request) });
  }

  const user = await actorFor(env, request);
  if (!user) return notFound();

  if (resource === "access" && !id && method === "GET") return json({ ok: true });
  if (resource === "health" && !id && method === "GET") return json(await serviceHealth(env, request));

  if (resource === "users") {
    if (!id && method === "GET") return listUsers(env, user);
    if (id && action === "tags" && !extra && method === "POST") return addUserTag(env, id, body);
    if (id && action === "tags" && extra && method === "DELETE") return removeUserTag(env, id, extra);
    if (id && action === "sessions" && method === "DELETE") return revokeSessions(env, user, id);
    if (id && !action && method === "PATCH") return updateUser(env, user, id, body);
    if (id && !action && method === "DELETE") return deleteUser(env, user, id);
  }

  if (resource === "commissions") {
    const response = await handleCommissionOps(env, user, method, id, action, extra, body);
    if (response) return response;
  }

  if (resource === "conventions") {
    if (!id && method === "GET") return listConventions(env);
    if (!id && method === "POST") return saveConvention(env, null, body);
    if (id && method === "PUT") return saveConvention(env, id, body);
    if (id && method === "DELETE") return deleteConvention(env, id);
  }

  if (resource === "about" && id && method === "PUT") return saveAbout(env, id, body);

  if (resource === "gallery") {
    const response = await handleGalleryRoutes(env, request, url, method, id, action, extra, body);
    if (response) return response;
  }

  return notFound();
}
