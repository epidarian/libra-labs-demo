import { hashPassword, verifyPassword } from "./passwords.js";

const SESSION_SECONDS = 60 * 60 * 24 * 30;
const COOKIE = "libra_session";

export function json(body, status = 200, extraHeaders) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (extraHeaders) {
    for (const [key, value] of Object.entries(extraHeaders)) headers.set(key, value);
  }
  return new Response(JSON.stringify(body), { status, headers });
}

export function cookie(request, token, maxAge, name = COOKIE) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${name}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function readCookie(request, name = COOKIE) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return "";
}

export function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export async function tokenHash(token) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

const PERMANENT_ADMINS = ["herb.colunga@gmail.com", "matroposa@outlook.com"];

function adminEmails(env) {
  return String(env.OPS_ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
    .concat(PERMANENT_ADMINS);
}

export function isAdmin(env, user) {
  return user.role === "admin" || adminEmails(env).includes(user.email);
}

function profile(env, user) {
  return {
    name: user.email.split("@")[0],
    email: user.email,
    image: null,
    provider: "email",
    patronStatus: null,
    amountCents: 0,
    role: isAdmin(env, user) ? "admin" : "user",
  };
}

function credentials(body) {
  const email = String(body?.email || "").trim().toLowerCase();
  const password = String(body?.password || "");
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) {
    return { error: "Enter a valid email address." };
  }
  if (password.length < 8 || password.length > 200) {
    return { error: "Password must be at least 8 characters." };
  }
  return { email, password };
}

export async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function openSession(env, request, user) {
  const token = randomToken();
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  await env.DB.prepare(
    "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)"
  )
    .bind(await tokenHash(token), user.id, expires)
    .run();
  return json(profile(env, user), 200, {
    "Set-Cookie": cookie(request, token, SESSION_SECONDS),
  });
}

export async function userForRequest(env, request) {
  const token = readCookie(request);
  if (!token) return null;
  const now = Math.floor(Date.now() / 1000);
  return env.DB.prepare(
    `SELECT users.id AS id, users.email AS email, users.role AS role
     FROM sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.token_hash = ? AND sessions.expires_at > ?
       AND users.disabled_at IS NULL`
  )
    .bind(await tokenHash(token), now)
    .first();
}

export async function handleAuth(request, env, url) {
  const path = url.pathname;
  if (request.method === "GET" && path === "/api/auth/session") {
    const user = await userForRequest(env, request);
    if (!user) return json({ error: "Not signed in." }, 401);
    return json(profile(env, user));
  }

  if (request.method === "POST" && path === "/api/auth/logout") {
    const token = readCookie(request);
    if (token) {
      await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?")
        .bind(await tokenHash(token))
        .run();
    }
    return json({ ok: true }, 200, { "Set-Cookie": cookie(request, "", 0) });
  }

  if (request.method !== "POST") return json({ error: "Not found." }, 404);

  const fields = credentials(await readBody(request));
  if (fields.error) return json({ error: fields.error }, 400);

  if (path === "/api/auth/register") {
    const passwordHash = await hashPassword(fields.password);
    const id = crypto.randomUUID();
    try {
      await env.DB.prepare(
        "INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)"
      )
        .bind(id, fields.email, passwordHash)
        .run();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("UNIQUE")) {
        return json({ error: "An account with that email already exists." }, 409);
      }
      console.error(JSON.stringify({ message: "register failed", error: message }));
      return json({ error: "Something went wrong." }, 500);
    }
    console.log(JSON.stringify({ message: "account created" }));
    return openSession(env, request, { id, email: fields.email, role: "user" });
  }

  if (path === "/api/auth/login") {
    const user = await env.DB.prepare(
      "SELECT id, email, role, disabled_at, password_hash FROM users WHERE email = ?"
    )
      .bind(fields.email)
      .first();
    if (!user) {
      await hashPassword(fields.password);
      return json({ error: "Email or password is incorrect." }, 401);
    }
    if (!(await verifyPassword(fields.password, user.password_hash))) {
      return json({ error: "Email or password is incorrect." }, 401);
    }
    if (user.disabled_at) return json({ error: "This account is disabled." }, 403);
    console.log(JSON.stringify({ message: "signed in" }));
    return openSession(env, request, user);
  }

  return json({ error: "Not found." }, 404);
}
