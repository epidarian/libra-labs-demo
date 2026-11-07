const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

export async function claimPatreon(env, userId, patreonId, fields) {
  const id = String(patreonId || "").trim();
  if (!id) return { error: "Patreon did not share an account id.", status: 502 };
  const holder = await env.DB.prepare("SELECT id FROM users WHERE patreon_id = ?").bind(id).first();
  if (holder && holder.id !== userId) {
    return { error: "This Patreon account is already linked to another user.", status: 409 };
  }
  await env.DB.prepare("UPDATE users SET patreon_id = ? WHERE id = ?").bind(id, userId).run();
  const email = String(fields.email || "").trim().toLowerCase().slice(0, 254);
  const name = String(fields.name || "").trim().slice(0, 200);
  const image = fields.image ? String(fields.image).slice(0, 2000) : null;
  const amount = Math.max(0, Number(fields.amountCents) || 0);
  const status = fields.patronStatus || null;
  await env.DB.prepare(
    `INSERT INTO patrons (
       patreon_id, user_id, email, name, image, amount_cents, patron_status, synced_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ${NOW})
     ON CONFLICT (patreon_id) DO UPDATE SET
       user_id = excluded.user_id,
       email = excluded.email,
       name = excluded.name,
       image = excluded.image,
       amount_cents = excluded.amount_cents,
       patron_status = excluded.patron_status,
       synced_at = excluded.synced_at`
  )
    .bind(id, userId, email, name, image, amount, status)
    .run();
  return { ok: true, patreonId: id };
}

export async function readAddress(env, patreonId) {
  const row = await env.DB.prepare(
    `SELECT recipient, line1, line2, city, region, postal_code, country, phone
     FROM patrons WHERE patreon_id = ?`
  )
    .bind(patreonId)
    .first();
  return (
    row || {
      recipient: "",
      line1: "",
      line2: "",
      city: "",
      region: "",
      postal_code: "",
      country: "US",
      phone: "",
    }
  );
}

export async function writeAddress(env, user, claim, body) {
  const fields = {
    recipient: clip(body?.recipient, 120),
    line1: clip(body?.line1, 160),
    line2: clip(body?.line2, 160),
    city: clip(body?.city, 80),
    region: clip(body?.region, 80),
    postal_code: clip(body?.postal_code, 20),
    country: clip(body?.country, 80) || "US",
    phone: clip(body?.phone, 40),
  };
  if (!fields.recipient || !fields.line1 || !fields.city || !fields.region || !fields.postal_code) {
    return { error: "Enter a recipient, street, city, region, and postal code.", status: 400 };
  }
  const existing = await env.DB.prepare("SELECT patreon_id FROM patrons WHERE patreon_id = ?")
    .bind(user.patreon_id)
    .first();
  if (existing) {
    await env.DB.prepare(
      `UPDATE patrons SET recipient = ?, line1 = ?, line2 = ?, city = ?, region = ?,
         postal_code = ?, country = ?, phone = ?, user_id = ?, updated_at = ${NOW}
       WHERE patreon_id = ?`
    )
      .bind(
        fields.recipient,
        fields.line1,
        fields.line2,
        fields.city,
        fields.region,
        fields.postal_code,
        fields.country,
        fields.phone,
        user.id,
        user.patreon_id
      )
      .run();
  } else {
    await env.DB.prepare(
      `INSERT INTO patrons (
         patreon_id, user_id, email, name, image, amount_cents, patron_status,
         recipient, line1, line2, city, region, postal_code, country, phone, synced_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${NOW})`
    )
      .bind(
        user.patreon_id,
        user.id,
        user.email,
        user.name || "",
        user.image,
        Math.max(0, Number(claim.amountCents) || 0),
        claim.patronStatus,
        fields.recipient,
        fields.line1,
        fields.line2,
        fields.city,
        fields.region,
        fields.postal_code,
        fields.country,
        fields.phone
      )
      .run();
  }
  return { ok: true, ...fields };
}

function clip(value, max) {
  return String(value ?? "").trim().slice(0, max);
}
