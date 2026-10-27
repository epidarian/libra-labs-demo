// Workers Free allows 10ms of CPU per request. 100,000 iterations took ~18ms
// on this machine, so sign-in would be killed in production. 10,000 stays
// inside that cap. Raise this on a Workers Paid account.
const ITERATIONS = 10_000;
const SALT_BYTES = 16;
const BITS = 256;

function encode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decode(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    BITS
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await pbkdf2(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${encode(salt)}$${encode(hash)}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, rounds, salt, hash] = String(stored).split("$");
  const iterations = Number(rounds);
  if (scheme !== "pbkdf2" || !Number.isInteger(iterations) || iterations < 1) return false;
  if (!salt || !hash) return false;
  const actual = await pbkdf2(password, decode(salt), iterations);
  const expected = decode(hash);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}
