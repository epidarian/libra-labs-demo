import { commissionQueues, commissionTerms } from "../commissionOffer.js";
import { normalizeOptions, quote } from "../commissionPricing.js";
import { nsfwCatalog } from "../nsfw/catalog.js";
import { sfwCatalog } from "../sfw/catalog.js";
import { conventions } from "../shared.js";

const QUEUES = commissionQueues.map((queue) => ({
  ...queue,
  linear_team_id: "",
  linear_label_id: "",
  updated_at: "2026-10-26T00:00:00.000Z",
  options: queue.options.map((option) => ({ ...option, queue_id: queue.id })),
}));

const TERMS = commissionTerms;

function request(id, queue_id, usernames, email, description, picks, status, created_at) {
  const queue = QUEUES.find((item) => item.id === queue_id);
  const priced = quote(queue.options, picks);
  return {
    id,
    queue_id,
    rating: "sfw",
    usernames,
    email,
    paypal_email: "",
    description,
    selections: priced.lines,
    quote_cents: priced.totalCents,
    terms_version: TERMS.updated,
    status,
    decision_note: "",
    decided_at: status === "new" ? null : created_at,
    emailed_at: null,
    created_at,
    linear_url: null,
    linear_identifier: null,
  };
}

const COMMISSIONS = [
  request("demo-0004", "comics", "Demo client 4", "demo4@example.com",
    "Demo request 4. One comic page, four panels, in color.",
    { "comics-pages": 1, "comics-color": 1 }, "accepted", "2026-10-18T18:45:00.000Z"),
  request("demo-0001", "illustration", "Demo client 1", "demo1@example.com",
    "Demo request 1. A single-character illustration for a framed print.",
    { "illustration-lineart": 1, "illustration-shade": 1 }, "new", "2026-10-20T15:04:00.000Z"),
  request("demo-0002", "illustration", "Demo client 2", "demo2@example.com",
    "Demo request 2. Two characters with a background scene.",
    { "illustration-lineart": 1, "illustration-characters": 2, "illustration-background": 1 }, "new",
    "2026-10-22T09:30:00.000Z"),
  request("demo-0003", "comics", "Demo client 3", "demo3@example.com",
    "Demo request 3. Two pages.",
    { "comics-pages": 2 }, "new", "2026-10-24T21:12:00.000Z"),
];

function tagOf(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

function slugOf(title) {
  return tagOf(title) || "picture";
}

function picture(item, rating) {
  const slug = `${rating}-${slugOf(item.title)}`;
  return {
    id: item.id,
    title: item.title,
    slug,
    folder: `gallery/${slug}/`,
    rating,
    medium: item.medium,
    description: item.medium,
    year: item.year,
    patronsOnly: false,
    minCents: null,
    published: true,
    createdAt: `${item.year}-01-01T00:00:00.000Z`,
    files: [],
    tags: [tagOf(item.medium)].filter(Boolean),
  };
}

function seed() {
  return {
    queues: QUEUES.map((queue) => ({ ...queue, options: queue.options.map((o) => ({ ...o })) })),
    terms: { ...TERMS },
    commissions: COMMISSIONS.map((row) => ({ ...row })),
    conventions: conventions.items.map((item, index) => ({
      id: item.id,
      name: item.name,
      place: item.place,
      starts_on: null,
      ends_on: null,
      table_label: item.table === "Table TBA" ? "" : item.table,
      rating: index === conventions.items.length - 1 ? "nsfw" : "sfw",
    })),
    users: [
      {
        id: "demo-admin",
        email: "demo1@example.com",
        role: "admin",
        disabled_at: null,
        created_at: "2026-10-20T15:04:00.000Z",
        sessions: 1,
        tags: [],
        envAdmin: false,
      },
      {
        id: "demo-user-2",
        email: "demo2@example.com",
        role: "user",
        disabled_at: null,
        created_at: "2026-10-22T09:30:00.000Z",
        sessions: 0,
        tags: ["print"],
        envAdmin: false,
      },
      {
        id: "demo-user-3",
        email: "demo3@example.com",
        role: "user",
        disabled_at: null,
        created_at: "2026-10-24T21:12:00.000Z",
        sessions: 1,
        tags: ["nsfw"],
        envAdmin: false,
      },
      {
        id: "demo-user-4",
        email: "demo4@example.com",
        role: "user",
        disabled_at: "2026-10-01T00:00:00.000Z",
        created_at: "2026-10-18T18:45:00.000Z",
        sessions: 0,
        tags: [],
        envAdmin: false,
      },
    ],
    works: [
      ...sfwCatalog.gallery.works.map((item) => picture(item, "sfw")),
      ...nsfwCatalog.gallery.works.map((item) => picture(item, "nsfw")),
    ],
    about: { sfw: null, nsfw: null },
  };
}

let state = null;

function db() {
  if (!state) state = seed();
  return state;
}

function fail(message) {
  throw new Error(message);
}

function galleryPayload() {
  const data = db();
  return {
    works: data.works,
    tiers: [],
    patreon: { configured: false, connected: false },
  };
}

function findWork(id) {
  const work = db().works.find((item) => item.id === id);
  if (!work) fail("Picture not found.");
  return work;
}

function applyWork(work, body) {
  const title = String(body?.title ?? work.title).trim();
  if (!title) fail("Enter a title.");
  const slug = `${body?.rating === "nsfw" ? "nsfw" : "sfw"}-${slugOf(title)}`;
  work.title = title;
  work.slug = slug;
  work.folder = `gallery/${slug}/`;
  work.description = String(body?.description ?? "");
  work.year = String(body?.year ?? "").slice(0, 4);
  work.rating = body?.rating === "nsfw" ? "nsfw" : "sfw";
  work.patronsOnly = !!body?.patronsOnly;
  work.minCents = body?.minCents === "" || body?.minCents == null ? null : Number(body.minCents);
  work.published = !!body?.published;
  if (Array.isArray(body?.tags)) work.tags = body.tags.map(tagOf).filter(Boolean);
}

export function demoContent() {
  const data = db();
  return {
    about: { sfw: data.about.sfw, nsfw: data.about.nsfw },
  };
}

function findQueue(id) {
  const queue = db().queues.find((item) => item.id === id);
  if (!queue) fail("Queue not found.");
  return queue;
}

function findRequest(id) {
  const row = db().commissions.find((item) => item.id === id);
  if (!row) fail("Request not found.");
  return row;
}

function demoCommissions(method, id, action, body) {
  const data = db();
  const stamp = new Date().toISOString();
  if (!id && method === "GET") {
    return {
      linear: false,
      email: false,
      queues: data.queues,
      terms: data.terms,
      commissions: data.commissions.map((row) => ({ ...row, files: [] })),
    };
  }
  if (id === "terms" && method === "PUT") {
    const items = (Array.isArray(body?.items) ? body.items : []).map((item) => String(item).trim()).filter(Boolean);
    if (!items.length) fail("Add at least one term.");
    data.terms = { items, updated: stamp };
    return data.terms;
  }
  if (id === "queues" && !action && method === "POST") {
    const name = String(body?.name ?? "").trim().slice(0, 60);
    if (!name) fail("Enter a queue name.");
    const queueId = `${tagOf(name) || "queue"}-${crypto.randomUUID().slice(0, 6)}`;
    data.queues.push({ id: queueId, name, open: false, linear_team_id: "", linear_label_id: "", updated_at: stamp, options: [] });
    return { ok: true, id: queueId };
  }
  if (id === "queues" && action && method === "PUT") {
    const queue = findQueue(action);
    const name = String(body?.name ?? "").trim().slice(0, 60);
    if (!name) fail("Enter a queue name.");
    const parsed = normalizeOptions(body?.options);
    if (parsed.error) fail(parsed.error);
    Object.assign(queue, {
      name,
      linear_team_id: String(body?.linear_team_id ?? ""),
      linear_label_id: String(body?.linear_label_id ?? ""),
      updated_at: stamp,
      options: parsed.options.map((o) => ({ ...o, queue_id: queue.id })),
    });
    return { ok: true };
  }
  if (id === "queues" && action && method === "PATCH") {
    const queue = findQueue(action);
    queue.open = !!body?.open;
    queue.updated_at = stamp;
    return { ok: true };
  }
  if (id === "queues" && action && method === "DELETE") {
    const used = data.commissions.filter((row) => row.queue_id === action).length;
    if (used) fail(`${used} request(s) use this queue. Close it instead, or delete them first.`);
    data.queues = data.queues.filter((queue) => queue.id !== action);
    return { ok: true };
  }
  if (id && action === "decision" && method === "POST") {
    const row = findRequest(id);
    if (row.status !== "new") fail("This request was already decided.");
    if (!["accept", "decline"].includes(body?.decision)) fail("Unknown decision.");
    row.status = body.decision === "accept" ? "accepted" : "declined";
    row.decision_note = String(body?.note ?? "").trim().slice(0, 2000);
    row.decided_at = stamp;
    return { ok: true, warnings: ["This demo does not send email."] };
  }
  if (id && action === "email") fail("Email is not configured.");
  if (id && action === "linear") fail("Linear is not configured. Set LINEAR_API_KEY.");
  if (id && !action && method === "PATCH") {
    const row = findRequest(id);
    if (body?.status !== "done" || row.status !== "accepted") fail("Only accepted requests can be marked done.");
    row.status = "done";
    return { ok: true };
  }
  if (id && !action && method === "DELETE") {
    data.commissions = data.commissions.filter((item) => item.id !== id);
    return { ok: true };
  }
  fail("Not found.");
}

export function demoUpload() {
  fail("This demo does not store files.");
}

export function demoOps(path, { method = "GET", body } = {}) {
  const data = db();
  const [resource, id, action, extra] = path.split("/");

  if (resource === "commissions") return demoCommissions(method, id, action, body);

  if (resource === "users" && !id && method === "GET") {
    return { me: "demo-admin", users: data.users };
  }
  if (resource === "users" && id && action === "tags" && !extra && method === "POST") {
    const user = data.users.find((item) => item.id === id);
    const tag = tagOf(body?.tag);
    if (!user) fail("User not found.");
    if (!tag) fail("Use a tag made of letters, numbers, or hyphens.");
    if (!user.tags.includes(tag)) user.tags.push(tag);
    return { ok: true, tag };
  }
  if (resource === "users" && id && action === "tags" && extra && method === "DELETE") {
    const user = data.users.find((item) => item.id === id);
    if (!user) fail("User not found.");
    user.tags = user.tags.filter((tag) => tag !== decodeURIComponent(extra));
    return { ok: true };
  }
  if (resource === "users" && id && action === "sessions" && method === "DELETE") {
    const user = data.users.find((item) => item.id === id);
    if (!user) fail("User not found.");
    user.sessions = 0;
    return { ok: true };
  }
  if (resource === "users" && id && !action && method === "PATCH") {
    const user = data.users.find((item) => item.id === id);
    if (!user) fail("User not found.");
    if (body?.role) {
      if (id === "demo-admin" && body.role !== "admin") fail("You cannot remove your own admin role.");
      user.role = body.role;
    }
    if ("disabled" in (body || {})) {
      if (id === "demo-admin" && body.disabled) fail("You cannot disable your own account.");
      user.disabled_at = body.disabled ? new Date().toISOString() : null;
    }
    return { ok: true };
  }
  if (resource === "users" && id && !action && method === "DELETE") {
    if (id === "demo-admin") fail("You cannot delete your own account.");
    data.users = data.users.filter((item) => item.id !== id);
    return { ok: true };
  }

  if (resource === "conventions" && !id && method === "GET") {
    return { conventions: data.conventions };
  }
  if (resource === "conventions" && !id && method === "POST") {
    const row = conventionRow(body);
    row.id = crypto.randomUUID();
    data.conventions.push(row);
    return { ok: true, id: row.id };
  }
  if (resource === "conventions" && id && method === "PUT") {
    const index = data.conventions.findIndex((item) => item.id === id);
    if (index < 0) fail("Convention not found.");
    data.conventions[index] = { ...conventionRow(body), id };
    return { ok: true, id };
  }
  if (resource === "conventions" && id && method === "DELETE") {
    data.conventions = data.conventions.filter((item) => item.id !== id);
    return { ok: true };
  }

  if (resource === "about" && id && method === "PUT") {
    if (id !== "sfw" && id !== "nsfw") fail("Unknown catalog.");
    if (body?.reset) {
      data.about[id] = null;
      return { ok: true };
    }
    const paragraphs = (Array.isArray(body?.paragraphs) ? body.paragraphs : [])
      .map((paragraph) => String(paragraph).trim())
      .filter(Boolean);
    if (!paragraphs.length) fail("Add at least one paragraph.");
    const value = { title: String(body?.title || "About").slice(0, 80), paragraphs };
    data.about[id] = value;
    return value;
  }

  if (resource === "gallery" && !id && method === "GET") return galleryPayload();
  if (resource === "gallery" && !id && method === "POST") {
    const work = {
      id: crypto.randomUUID(),
      files: [],
      tags: [],
      createdAt: new Date().toISOString(),
    };
    applyWork(work, body);
    data.works.unshift(work);
    return { work };
  }
  if (resource === "gallery" && id === "tiers") return galleryPayload();
  if (resource === "gallery" && id === "patreon") return galleryPayload();
  if (resource === "gallery" && id && !action && method === "PUT") {
    const work = findWork(id);
    applyWork(work, body);
    return { work };
  }
  if (resource === "gallery" && id && !action && method === "DELETE") {
    data.works = data.works.filter((item) => item.id !== id);
    return { ok: true };
  }
  if (resource === "gallery" && id && action === "tags" && !extra && method === "POST") {
    const work = findWork(id);
    const tag = tagOf(body?.tag);
    if (!tag) fail("Use a tag made of letters, numbers, or hyphens.");
    if (!work.tags.includes(tag)) work.tags.push(tag);
    return { work };
  }
  if (resource === "gallery" && id && action === "tags" && extra && method === "DELETE") {
    const work = findWork(id);
    work.tags = work.tags.filter((tag) => tag !== decodeURIComponent(extra));
    return { work };
  }
  if (resource === "gallery" && id && action === "files") {
    fail("This demo does not store files.");
  }

  fail("Not found.");
}

function conventionRow(body) {
  const name = String(body?.name ?? "").trim().slice(0, 120);
  if (!name) fail("Enter a convention name.");
  const rating = body?.rating === "nsfw" ? "nsfw" : body?.rating === "sfw" ? "sfw" : "";
  if (!rating) fail("Tag the convention SFW or NSFW.");
  const starts_on = dateOrNull(body?.starts_on);
  const ends_on = dateOrNull(body?.ends_on);
  if (starts_on && ends_on && ends_on < starts_on) fail("End date is before start date.");
  return {
    name,
    place: String(body?.place ?? "").trim().slice(0, 120),
    starts_on,
    ends_on,
    table_label: String(body?.table_label ?? "").trim().slice(0, 60),
    rating,
  };
}

function dateOrNull(value) {
  const text = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}
