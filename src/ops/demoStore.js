import { nsfwCatalog } from "../nsfw/catalog.js";
import { sfwCatalog } from "../sfw/catalog.js";
import { conventions } from "../shared.js";

const COMMISSIONS = [
  {
    id: "demo-0003",
    name: "Demo client 3",
    email: "demo3@example.com",
    rating: "nsfw",
    size: "18×24",
    deadline: "2027-01-10",
    venue: "Personal",
    message: "Demo request 3. A two-character piece for the adult catalog.",
    status: "new",
    created_at: "2026-10-24T21:12:00.000Z",
    linear_url: null,
    linear_identifier: null,
  },
  {
    id: "demo-0002",
    name: "Demo client 2",
    email: "demo2@example.com",
    rating: "sfw",
    size: "Phone wallpaper",
    deadline: "",
    venue: "Personal",
    message: "Demo request 2. A background scene, no characters.",
    status: "new",
    created_at: "2026-10-22T09:30:00.000Z",
    linear_url: null,
    linear_identifier: null,
  },
  {
    id: "demo-0001",
    name: "Demo client 1",
    email: "demo1@example.com",
    rating: "sfw",
    size: "11×17",
    deadline: "2026-12-15",
    venue: "Print",
    message: "Demo request 1. A single-character illustration for a framed print.",
    status: "new",
    created_at: "2026-10-20T15:04:00.000Z",
    linear_url: null,
    linear_identifier: null,
  },
  {
    id: "demo-0004",
    name: "Demo client 4",
    email: "demo4@example.com",
    rating: "sfw",
    size: "Comic page",
    deadline: "2026-11-30",
    venue: "Stream",
    message: "Demo request 4. One comic page, four panels.",
    status: "accepted",
    created_at: "2026-10-18T18:45:00.000Z",
    linear_url: null,
    linear_identifier: null,
  },
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
    status: { status: "open", updated: "2026-10-26" },
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
    commissions: data.status,
  };
}

export function demoUpload() {
  fail("This demo does not store files.");
}

export function demoOps(path, { method = "GET", body } = {}) {
  const data = db();
  const [resource, id, action, extra] = path.split("/");

  if (resource === "commissions" && !id && method === "GET") {
    return {
      linear: false,
      status: data.status,
      commissions: data.commissions.map((row) => ({ ...row, files: [] })),
    };
  }
  if (resource === "commissions" && id === "status" && method === "PUT") {
    if (!["open", "closed"].includes(body?.status)) fail("Unknown status.");
    data.status = { status: body.status, updated: new Date().toISOString().slice(0, 10) };
    return data.status;
  }
  if (resource === "commissions" && id && action === "linear") {
    fail("Linear is not configured. Set LINEAR_API_KEY and LINEAR_TEAM_ID.");
  }
  if (resource === "commissions" && id && !action && method === "PATCH") {
    const row = data.commissions.find((item) => item.id === id);
    if (!row) fail("Request not found.");
    if (!["new", "accepted", "declined", "done"].includes(body?.status)) fail("Unknown status.");
    row.status = body.status;
    return { ok: true };
  }
  if (resource === "commissions" && id && !action && method === "DELETE") {
    data.commissions = data.commissions.filter((item) => item.id !== id);
    return { ok: true };
  }

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
