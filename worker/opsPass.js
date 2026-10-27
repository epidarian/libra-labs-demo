import { cookie, randomToken, readCookie, tokenHash } from "./auth.js";

const CODE_HASH = "205381c5198d1547ccd344c22a9be4fe0039ad509764436e2e0e3fe3bd26d369";
const COOKIE = "libra_ops";
const PASS_SECONDS = 60 * 60 * 12;

export async function codeMatches(code) {
  const actual = await tokenHash(String(code ?? ""));
  let diff = actual.length ^ CODE_HASH.length;
  for (let i = 0; i < CODE_HASH.length; i++) diff |= actual.charCodeAt(i) ^ CODE_HASH.charCodeAt(i);
  return diff === 0;
}

export async function issuePass(env, request) {
  const token = randomToken();
  const now = Math.floor(Date.now() / 1000);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM ops_passes WHERE expires_at <= ?").bind(now),
    env.DB.prepare("INSERT INTO ops_passes (token_hash, expires_at) VALUES (?, ?)").bind(
      await tokenHash(token),
      now + PASS_SECONDS
    ),
  ]);
  return cookie(request, token, PASS_SECONDS, COOKIE);
}

export async function hasPass(env, request) {
  const token = readCookie(request, COOKIE);
  if (!token) return false;
  const row = await env.DB.prepare(
    "SELECT 1 AS ok FROM ops_passes WHERE token_hash = ? AND expires_at > ?"
  )
    .bind(await tokenHash(token), Math.floor(Date.now() / 1000))
    .first();
  return Boolean(row);
}
