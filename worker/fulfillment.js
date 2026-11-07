import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { json, readBody, tokenHash } from "./auth.js";
import { readSettings, sameOrigin, text, writeSetting } from "./content.js";
import { cookie } from "./auth.js";
import { syncCampaignMembers } from "./patreon.js";

const KEY = "fulfillment";
const KINDS = ["print", "sticker", "keychain", "other"];
const MONTH = /^\d{4}-\d{2}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PARTNER_COOKIE = "libra_partner";
const PASS_SECONDS = 60 * 60 * 12;

function nowSql() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function pacificToday(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function emptyHq() {
  return { recipient: "", line1: "", line2: "", city: "", region: "", postalCode: "", country: "US", phone: "" };
}

function settingsOf(raw) {
  const hq = { ...emptyHq(), ...(raw?.hq || {}) };
  return {
    extraCopies: Math.max(0, Number(raw?.extraCopies) || 0),
    passHash: raw?.passHash || "",
    hq,
  };
}

function hqFields(body) {
  const hq = body?.hq || {};
  return {
    recipient: text(hq.recipient, 120),
    line1: text(hq.line1, 160),
    line2: text(hq.line2, 160),
    city: text(hq.city, 80),
    region: text(hq.region, 80),
    postalCode: text(hq.postalCode, 20),
    country: text(hq.country, 80) || "US",
    phone: text(hq.phone, 40),
  };
}

function monthOf(dropOn) {
  return String(dropOn || "").slice(0, 7);
}

async function lockedAt(env, month) {
  const row = await env.DB.prepare("SELECT locked_at FROM fulfillment_months WHERE month = ?")
    .bind(month)
    .first();
  return row?.locked_at || null;
}

async function loadBundle(env) {
  const stored = settingsOf((await readSettings(env))[KEY]);
  const [goods, tiers, items, assets, links, months, patrons, shipments, invoices, edits] = await Promise.all([
    env.DB.prepare("SELECT * FROM print_goods ORDER BY name").all(),
    env.DB.prepare("SELECT id, title, amount_cents FROM tiers ORDER BY sort, amount_cents").all(),
    env.DB.prepare(
      `SELECT reward_items.*, print_goods.name AS good_name, print_goods.kind, print_goods.kind_note,
              print_goods.in_stock
       FROM reward_items JOIN print_goods ON print_goods.id = reward_items.print_good_id
       ORDER BY reward_items.drop_on, print_goods.name`
    ).all(),
    env.DB.prepare("SELECT id, item_id, filename, content_type FROM reward_assets ORDER BY sort, filename").all(),
    env.DB.prepare("SELECT item_id, tier_id FROM reward_tiers").all(),
    env.DB.prepare("SELECT month, locked_at FROM fulfillment_months").all(),
    env.DB.prepare(
      "SELECT patreon_id, name, email, amount_cents, patron_status, recipient, line1, line2, city, region, postal_code, country, phone FROM patrons ORDER BY name"
    ).all(),
    env.DB.prepare("SELECT * FROM shipments ORDER BY dest, recipient").all(),
    env.DB.prepare("SELECT * FROM invoices ORDER BY month DESC, created_at DESC").all(),
    env.DB.prepare(
      `SELECT catalog_edits.*, print_goods.name AS good_name
       FROM catalog_edits LEFT JOIN print_goods ON print_goods.id = catalog_edits.print_good_id
       WHERE catalog_edits.acked_at IS NULL ORDER BY catalog_edits.created_at`
    ).all(),
  ]);
  const tiersByItem = new Map();
  for (const link of links.results) {
    const list = tiersByItem.get(link.item_id) || [];
    list.push(link.tier_id);
    tiersByItem.set(link.item_id, list);
  }
  const assetsByItem = new Map();
  for (const asset of assets.results) {
    const list = assetsByItem.get(asset.item_id) || [];
    list.push(asset);
    assetsByItem.set(asset.item_id, list);
  }
  return {
    today: pacificToday(),
    settings: { extraCopies: stored.extraCopies, hasPass: Boolean(stored.passHash), hq: stored.hq },
    goods: goods.results,
    tiers: tiers.results,
    items: items.results.map((item) => ({
      ...item,
      month: monthOf(item.drop_on),
      tier_ids: tiersByItem.get(item.id) || [],
      assets: assetsByItem.get(item.id) || [],
    })),
    months: months.results,
    patrons: patrons.results,
    shipments: shipments.results,
    invoices: invoices.results,
    edits: edits.results,
  };
}

function goodFields(body) {
  const name = text(body?.name, 120);
  const kind = body?.kind;
  const kindNote = text(body?.kind_note, 80);
  const price = Number(body?.price_cents);
  if (!name) return { error: "Enter a name." };
  if (!KINDS.includes(kind)) return { error: "Choose a type." };
  if (kind === "other" && !kindNote) return { error: "Label this other good." };
  if (!Number.isInteger(price) || price < 0) return { error: "Enter a price in cents." };
  return { name, kind, kind_note: kind === "other" ? kindNote : "", price_cents: price, in_stock: body?.in_stock ? 1 : 0 };
}

function optionalCount(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) return undefined;
  return n;
}

async function saveSettings(env, body) {
  const current = settingsOf((await readSettings(env))[KEY]);
  const extra = optionalCount(body?.extraCopies);
  if (extra === undefined) return json({ error: "Enter a headquarters copy count." }, 400);
  const next = { ...current, extraCopies: extra, hq: hqFields(body) };
  const phrase = text(body?.passphrase, 200);
  if (phrase) {
    next.passHash = await tokenHash(phrase);
    await env.DB.prepare("DELETE FROM partner_passes").run();
  }
  await writeSetting(env, KEY, next);
  return json({ ok: true, hasPass: Boolean(next.passHash) });
}

async function createGood(env, body) {
  const fields = goodFields(body);
  if (fields.error) return json({ error: fields.error }, 400);
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO print_goods (id, name, price_cents, kind, kind_note, in_stock) VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(id, fields.name, fields.price_cents, fields.kind, fields.kind_note, fields.in_stock)
    .run();
  return json({ ok: true, id }, 201);
}

async function updateGood(env, id, body, fromPartner) {
  const current = await env.DB.prepare("SELECT * FROM print_goods WHERE id = ?").bind(id).first();
  if (!current) return json({ error: "Good not found." }, 404);
  const fields = goodFields({ ...current, ...body, kind_note: body?.kind_note ?? current.kind_note });
  if (fields.error) return json({ error: fields.error }, 400);
  await env.DB.prepare(
    `UPDATE print_goods SET name = ?, price_cents = ?, kind = ?, kind_note = ?, in_stock = ?,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`
  )
    .bind(fields.name, fields.price_cents, fields.kind, fields.kind_note, fields.in_stock, id)
    .run();
  if (fromPartner && fields.price_cents !== current.price_cents) {
    await env.DB.prepare(
      "INSERT INTO catalog_edits (id, print_good_id, old_price_cents, new_price_cents) VALUES (?, ?, ?, ?)"
    )
      .bind(crypto.randomUUID(), id, current.price_cents, fields.price_cents)
      .run();
  }
  return json({ ok: true });
}

async function deleteGood(env, id) {
  const used = await env.DB.prepare("SELECT 1 AS ok FROM reward_items WHERE print_good_id = ? LIMIT 1")
    .bind(id)
    .first();
  if (used) return json({ error: "This good is on a month order." }, 409);
  await env.DB.prepare("DELETE FROM print_goods WHERE id = ?").bind(id).run();
  return json({ ok: true });
}

async function createItem(env, body) {
  const drop = text(body?.drop_on, 10);
  if (!DATE.test(drop)) return json({ error: "Enter a drop date." }, 400);
  const month = monthOf(drop);
  if (await lockedAt(env, month)) return json({ error: "That month is locked." }, 409);
  const good = await env.DB.prepare("SELECT id, price_cents FROM print_goods WHERE id = ?")
    .bind(body?.print_good_id)
    .first();
  if (!good) return json({ error: "Choose a print good." }, 400);
  const tierIds = Array.isArray(body?.tier_ids) ? [...new Set(body.tier_ids.map((id) => text(id, 80)).filter(Boolean))] : [];
  if (!tierIds.length) return json({ error: "Choose at least one tier." }, 400);
  const count = optionalCount(body?.count);
  const extra = optionalCount(body?.extra_copies);
  if (count === undefined || extra === undefined) return json({ error: "Enter whole-number quantities." }, 400);
  const price = body?.price_cents == null || body.price_cents === "" ? good.price_cents : Number(body.price_cents);
  if (!Number.isInteger(price) || price < 0) return json({ error: "Enter a price in cents." }, 400);
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO reward_items (id, print_good_id, drop_on, price_cents, count, extra_copies)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(id, good.id, drop, price, count, extra),
    ...tierIds.map((tierId) =>
      env.DB.prepare("INSERT INTO reward_tiers (item_id, tier_id) VALUES (?, ?)").bind(id, tierId)
    ),
  ]);
  return json({ ok: true, id }, 201);
}

async function updateItem(env, id, body) {
  const item = await env.DB.prepare("SELECT * FROM reward_items WHERE id = ?").bind(id).first();
  if (!item) return json({ error: "Line not found." }, 404);
  if (await lockedAt(env, monthOf(item.drop_on))) return json({ error: "That month is locked." }, 409);
  const price = Number(body?.price_cents);
  const count = optionalCount(body?.count);
  const extra = optionalCount(body?.extra_copies);
  if (!Number.isInteger(price) || price < 0 || count === undefined || extra === undefined) {
    return json({ error: "Enter a price and whole-number quantities." }, 400);
  }
  const statements = [
    env.DB.prepare("UPDATE reward_items SET price_cents = ?, count = ?, extra_copies = ? WHERE id = ?").bind(
      price,
      count,
      extra,
      id
    ),
  ];
  if (Array.isArray(body?.tier_ids)) {
    const tierIds = [...new Set(body.tier_ids.map((tierId) => text(tierId, 80)).filter(Boolean))];
    if (!tierIds.length) return json({ error: "Choose at least one tier." }, 400);
    statements.push(env.DB.prepare("DELETE FROM reward_tiers WHERE item_id = ?").bind(id));
    for (const tierId of tierIds) {
      statements.push(env.DB.prepare("INSERT INTO reward_tiers (item_id, tier_id) VALUES (?, ?)").bind(id, tierId));
    }
  }
  await env.DB.batch(statements);
  return json({ ok: true });
}

async function deleteItem(env, id) {
  const item = await env.DB.prepare("SELECT drop_on FROM reward_items WHERE id = ?").bind(id).first();
  if (!item) return json({ error: "Line not found." }, 404);
  if (await lockedAt(env, monthOf(item.drop_on))) return json({ error: "That month is locked." }, 409);
  const { results } = await env.DB.prepare("SELECT r2_key FROM reward_assets WHERE item_id = ?").bind(id).all();
  if (env.GALLERY) {
    await Promise.all(results.map((row) => env.GALLERY.delete(row.r2_key)));
  }
  await env.DB.batch([
    env.DB.prepare("DELETE FROM reward_tiers WHERE item_id = ?").bind(id),
    env.DB.prepare("DELETE FROM reward_assets WHERE item_id = ?").bind(id),
    env.DB.prepare("DELETE FROM reward_items WHERE id = ?").bind(id),
  ]);
  return json({ ok: true });
}

function safeName(value) {
  const name = text(value, 180).replace(/[\\/]/g, "");
  return name || "file";
}

export async function uploadAsset(env, itemId, request, url) {
  const item = await env.DB.prepare("SELECT id, drop_on FROM reward_items WHERE id = ?").bind(itemId).first();
  if (!item) return json({ error: "Line not found." }, 404);
  if (await lockedAt(env, monthOf(item.drop_on))) return json({ error: "That month is locked." }, 409);
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > 40 * 1024 * 1024) {
    return json({ error: "Choose a file under 40 MB." }, 400);
  }
  const assetId = crypto.randomUUID();
  const filename = safeName(url.searchParams.get("name"));
  const key = `PatreonMonths/${monthOf(item.drop_on)}/${item.id}/${assetId}/${filename}`;
  const contentType = request.headers.get("Content-Type") || "application/octet-stream";
  await env.GALLERY.put(key, bytes, { httpMetadata: { contentType } });
  await env.DB.prepare(
    "INSERT INTO reward_assets (id, item_id, r2_key, filename, content_type) VALUES (?, ?, ?, ?, ?)"
  )
    .bind(assetId, item.id, key, filename, contentType)
    .run();
  return json({ ok: true, id: assetId });
}

async function deleteAsset(env, itemId, assetId) {
  const item = await env.DB.prepare("SELECT drop_on FROM reward_items WHERE id = ?").bind(itemId).first();
  if (!item) return json({ error: "Line not found." }, 404);
  if (await lockedAt(env, monthOf(item.drop_on))) return json({ error: "That month is locked." }, 409);
  const asset = await env.DB.prepare("SELECT r2_key FROM reward_assets WHERE id = ? AND item_id = ?")
    .bind(assetId, itemId)
    .first();
  if (!asset) return json({ error: "File not found." }, 404);
  if (env.GALLERY) await env.GALLERY.delete(asset.r2_key);
  await env.DB.prepare("DELETE FROM reward_assets WHERE id = ?").bind(assetId).run();
  return json({ ok: true });
}

async function downloadAsset(env, assetId) {
  const asset = await env.DB.prepare("SELECT * FROM reward_assets WHERE id = ?").bind(assetId).first();
  if (!asset) return json({ error: "File not found." }, 404);
  const object = await env.GALLERY.get(asset.r2_key);
  if (!object) return json({ error: "File not found." }, 404);
  return new Response(object.body, {
    headers: {
      "Content-Type": asset.content_type || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${asset.filename.replaceAll('"', "")}"`,
    },
  });
}

async function syncPatrons(env) {
  const synced = await syncCampaignMembers(env);
  if (synced.error) return json({ error: synced.error }, synced.status);
  const statements = [];
  for (const member of synced.members) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO patrons (patreon_id, email, name, image, amount_cents, patron_status, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         ON CONFLICT (patreon_id) DO UPDATE SET
           email = excluded.email,
           name = excluded.name,
           image = excluded.image,
           amount_cents = excluded.amount_cents,
           patron_status = excluded.patron_status,
           synced_at = excluded.synced_at`
      ).bind(
        member.patreonId,
        String(member.email || "").slice(0, 254),
        String(member.name || "").slice(0, 200),
        member.image ? String(member.image).slice(0, 2000) : null,
        Math.max(0, Number(member.amountCents) || 0),
        member.patronStatus
      )
    );
  }
  statements.push(
    env.DB.prepare(
      `UPDATE patrons SET user_id = (SELECT id FROM users WHERE users.patreon_id = patrons.patreon_id)
       WHERE user_id IS NULL
         AND EXISTS (SELECT 1 FROM users WHERE users.patreon_id = patrons.patreon_id)`
    )
  );
  await runBatch(env, statements);
  console.log(JSON.stringify({ message: "patrons synced", count: synced.members.length }));
  return json({ ok: true, count: synced.members.length });
}

async function ackEdits(env) {
  await env.DB.prepare(
    "UPDATE catalog_edits SET acked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE acked_at IS NULL"
  ).run();
  return json({ ok: true });
}

async function markPaid(env, id) {
  const { meta } = await env.DB.prepare(
    `UPDATE invoices SET paid_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE id = ? AND paid_at IS NULL`
  )
    .bind(id)
    .run();
  if (!meta.changes) return json({ error: "Invoice not found." }, 404);
  return json({ ok: true });
}

function entitled(patron, tierAmounts) {
  return patron.patron_status === "active_patron" && tierAmounts.some((amount) => patron.amount_cents >= amount);
}

async function monthModel(env, month) {
  if (!MONTH.test(month)) return { error: "Choose a month.", status: 400 };
  const bundle = await loadBundle(env);
  const items = bundle.items.filter((item) => item.month === month);
  const tierAmount = new Map(bundle.tiers.map((tier) => [tier.id, tier.amount_cents]));
  const locked = bundle.months.find((row) => row.month === month)?.locked_at || null;
  const amountsFor = (item) => item.tier_ids.map((id) => tierAmount.get(id)).filter((n) => n != null);
  return { bundle, items, locked, amountsFor };
}

async function orderRows(env, month) {
  const model = await monthModel(env, month);
  if (model.error) return model;
  if (model.locked) {
    const { results } = await env.DB.prepare(
      `SELECT order_lines.*, print_goods.name, print_goods.kind, print_goods.kind_note
       FROM order_lines JOIN print_goods ON print_goods.id = order_lines.print_good_id
       WHERE order_lines.month = ? ORDER BY print_goods.name`
    )
      .bind(month)
      .all();
    return {
      rows: results.map((row) => ({
        name: row.name,
        kind: row.kind,
        kind_note: row.kind_note,
        patron_qty: row.patron_qty,
        extra_qty: row.extra_qty,
        price_cents: row.price_cents,
      })),
    };
  }
  const stored = settingsOf((await readSettings(env))[KEY]);
  return {
    rows: model.items.map((item) => {
      const amounts = model.amountsFor(item);
      const live = model.bundle.patrons.filter((patron) => entitled(patron, amounts)).length;
      return {
        name: item.good_name,
        kind: item.kind,
        kind_note: item.kind_note,
        patron_qty: item.count == null ? live : item.count,
        extra_qty: item.extra_copies == null ? stored.extraCopies : item.extra_copies,
        price_cents: item.price_cents,
      };
    }),
  };
}

async function fulfillmentRows(env, month) {
  const model = await monthModel(env, month);
  if (model.error) return model;
  if (model.locked) {
    const { results } = await env.DB.prepare(
      "SELECT * FROM shipments WHERE month = ? ORDER BY dest, recipient"
    )
      .bind(month)
      .all();
    return {
      rows: results.map((row) => ({
        id: row.id,
        dest: row.dest,
        patreon_id: row.patreon_id,
        recipient: row.recipient,
        line1: row.line1,
        line2: row.line2,
        city: row.city,
        region: row.region,
        postal_code: row.postal_code,
        country: row.country,
        phone: row.phone,
        tracking: row.tracking,
        fulfilled: row.fulfilled,
        address_missing: row.dest === "patron" && !row.line1,
      })),
    };
  }
  const stored = settingsOf((await readSettings(env))[KEY]);
  const rows = [];
  let extras = 0;
  const seen = new Set();
  for (const item of model.items) {
    const amounts = model.amountsFor(item);
    const extra = item.extra_copies == null ? stored.extraCopies : item.extra_copies;
    extras += extra;
    for (const patron of model.bundle.patrons) {
      if (!entitled(patron, amounts) || seen.has(patron.patreon_id)) continue;
      seen.add(patron.patreon_id);
      rows.push({
        id: "",
        dest: "patron",
        patreon_id: patron.patreon_id,
        recipient: patron.recipient || patron.name,
        line1: patron.line1,
        line2: patron.line2,
        city: patron.city,
        region: patron.region,
        postal_code: patron.postal_code,
        country: patron.country,
        phone: patron.phone,
        tracking: "",
        fulfilled: 0,
        address_missing: !patron.line1,
      });
    }
  }
  if (extras > 0) {
    rows.push({
      id: "",
      dest: "hq",
      patreon_id: "",
      recipient: stored.hq.recipient || "Libra Labs LLC",
      line1: stored.hq.line1,
      line2: stored.hq.line2,
      city: stored.hq.city,
      region: stored.hq.region,
      postal_code: stored.hq.postalCode,
      country: stored.hq.country,
      phone: stored.hq.phone,
      tracking: "",
      fulfilled: 0,
      address_missing: !stored.hq.line1,
    });
  }
  return { rows };
}

function csvCell(value) {
  const textValue = String(value ?? "");
  return /[",\n]/.test(textValue) ? `"${textValue.replaceAll('"', '""')}"` : textValue;
}

function csv(headers, rows) {
  const lines = [headers.join(",")];
  for (const row of rows) lines.push(headers.map((key) => csvCell(row[key])).join(","));
  return lines.join("\r\n");
}

async function pdfTable(title, headers, records) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([792, 612]);
  let y = 572;
  const draw = (line, size, face) => {
    if (y < 40) {
      page = pdf.addPage([792, 612]);
      y = 572;
    }
    page.drawText(line.slice(0, 140), { x: 36, y, size, font: face, color: rgb(0.1, 0.1, 0.12) });
    y -= size + 6;
  };
  draw(title, 16, bold);
  draw(headers.join("  |  "), 9, bold);
  for (const record of records) draw(record, 9, font);
  return pdf.save();
}

async function sheetResponse(env, url, kind) {
  const month = url.searchParams.get("month") || "";
  const format = url.searchParams.get("format") || "json";
  const built = kind === "order" ? await orderRows(env, month) : await fulfillmentRows(env, month);
  if (built.error) return json({ error: built.error }, built.status);
  if (format === "json") return json({ month, kind, rows: built.rows });
  if (kind === "order" && format === "csv") {
    const body = csv(
      ["name", "kind", "kind_note", "patron_qty", "extra_qty", "price_cents"],
      built.rows
    );
    return fileResponse(body, `goods-order-${month}.csv`, "text/csv; charset=utf-8");
  }
  if (kind === "fulfillment" && format === "csv") {
    const body = csv(
      ["dest", "recipient", "line1", "line2", "city", "region", "postal_code", "country", "phone", "tracking", "fulfilled", "address_missing"],
      built.rows
    );
    return fileResponse(body, `fulfillment-${month}.csv`, "text/csv; charset=utf-8");
  }
  if (format === "pdf") {
    const title = kind === "order" ? `Goods order ${month}` : `Fulfillment ${month}`;
    const lines =
      kind === "order"
        ? built.rows.map(
            (row) =>
              `${row.name}  ${row.kind}  patrons ${row.patron_qty}  extras ${row.extra_qty}  $${(row.price_cents / 100).toFixed(2)}`
          )
        : built.rows.map(
            (row) =>
              `${row.dest}  ${row.recipient}  ${row.line1}  ${row.city} ${row.region} ${row.postal_code}  ${row.address_missing ? "address missing" : row.tracking || ""}`
          );
    const bytes = await pdfTable(title, kind === "order" ? ["Good", "Qty", "Price"] : ["Ship to"], lines);
    return new Response(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${kind}-${month}.pdf"`,
      },
    });
  }
  return json({ error: "Choose csv, pdf, or json." }, 400);
}

async function runBatch(env, statements) {
  for (let i = 0; i < statements.length; i += 40) {
    await env.DB.batch(statements.slice(i, i + 40));
  }
}

function fileResponse(body, filename, type) {
  return new Response(body, {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export async function lockMonth(env, month) {
  if (!MONTH.test(month)) return json({ error: "Choose a month." }, 400);
  if (pacificToday() < `${month}-01`) return json({ error: "This month opens on the 1st." }, 409);
  if (await lockedAt(env, month)) return json({ error: "That month is locked." }, 409);
  const model = await monthModel(env, month);
  if (!model.items.length) return json({ error: "Add a good to this month first." }, 409);
  for (const item of model.items) {
    if (!item.tier_ids.length) return json({ error: `${item.good_name} has no tier.` }, 409);
    if (!item.in_stock) return json({ error: `${item.good_name} is out of stock.` }, 409);
  }
  const stored = settingsOf((await readSettings(env))[KEY]);
  const statements = [
    env.DB.prepare("INSERT INTO fulfillment_months (month, locked_at) VALUES (?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))").bind(
      month
    ),
  ];
  let extras = 0;
  const patrons = new Map();
  for (const item of model.items) {
    const amounts = model.amountsFor(item);
    const live = model.bundle.patrons.filter((patron) => entitled(patron, amounts));
    const patronQty = item.count == null ? live.length : item.count;
    const extraQty = item.extra_copies == null ? stored.extraCopies : item.extra_copies;
    extras += extraQty;
    statements.push(
      env.DB.prepare(
        `INSERT INTO order_lines (id, month, item_id, print_good_id, patron_qty, extra_qty, price_cents)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(crypto.randomUUID(), month, item.id, item.print_good_id, patronQty, extraQty, item.price_cents)
    );
    for (const patron of live) patrons.set(patron.patreon_id, patron);
  }
  for (const patron of patrons.values()) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO shipments (
           id, month, dest, patreon_id, recipient, line1, line2, city, region, postal_code, country, phone
         ) VALUES (?, ?, 'patron', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        crypto.randomUUID(),
        month,
        patron.patreon_id,
        patron.recipient || patron.name || "",
        patron.line1,
        patron.line2,
        patron.city,
        patron.region,
        patron.postal_code,
        patron.country,
        patron.phone
      )
    );
  }
  if (extras > 0) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO shipments (
           id, month, dest, patreon_id, recipient, line1, line2, city, region, postal_code, country, phone
         ) VALUES (?, ?, 'hq', '', ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        crypto.randomUUID(),
        month,
        stored.hq.recipient || "Libra Labs LLC",
        stored.hq.line1,
        stored.hq.line2,
        stored.hq.city,
        stored.hq.region,
        stored.hq.postalCode,
        stored.hq.country,
        stored.hq.phone
      )
    );
  }
  await runBatch(env, statements);
  console.log(JSON.stringify({ message: "month locked", month, shipments: patrons.size + (extras > 0 ? 1 : 0) }));
  return json({ ok: true, locked_at: nowSql() });
}

async function patchShipment(env, id, body) {
  const row = await env.DB.prepare("SELECT * FROM shipments WHERE id = ?").bind(id).first();
  if (!row) return json({ error: "Shipment not found." }, 404);
  if (!(await lockedAt(env, row.month))) return json({ error: "Lock the month first." }, 409);
  if (body?.fulfilled) {
    const { meta } = await env.DB.prepare(
      `UPDATE shipments SET fulfilled = 1, fulfilled_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ? AND fulfilled = 0`
    )
      .bind(id)
      .run();
    if (!meta.changes) return json({ error: "Already fulfilled." }, 409);
  }
  if (body?.tracking != null) {
    await env.DB.prepare("UPDATE shipments SET tracking = ? WHERE id = ?")
      .bind(text(body.tracking, 80), id)
      .run();
  }
  return json({ ok: true });
}

export async function uploadInvoice(env, request, url) {
  const month = url.searchParams.get("month") || "";
  if (!MONTH.test(month)) return json({ error: "Choose a month." }, 400);
  const amount = Number(url.searchParams.get("amount_cents"));
  if (!Number.isInteger(amount) || amount < 0) return json({ error: "Enter an amount in cents." }, 400);
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > 20 * 1024 * 1024) {
    return json({ error: "Choose a file under 20 MB." }, 400);
  }
  const id = crypto.randomUUID();
  const filename = safeName(url.searchParams.get("name"));
  const key = `PatreonMonths/${month}/invoices/${id}/${filename}`;
  await env.GALLERY.put(key, bytes, {
    httpMetadata: { contentType: request.headers.get("Content-Type") || "application/octet-stream" },
  });
  await env.DB.prepare(
    "INSERT INTO invoices (id, month, amount_cents, note, r2_key, filename) VALUES (?, ?, ?, ?, ?, ?)"
  )
    .bind(id, month, amount, text(url.searchParams.get("note"), 500), key, filename)
    .run();
  return json({ ok: true, id }, 201);
}

async function downloadInvoice(env, id) {
  const row = await env.DB.prepare("SELECT * FROM invoices WHERE id = ?").bind(id).first();
  if (!row?.r2_key) return json({ error: "Invoice not found." }, 404);
  const object = await env.GALLERY.get(row.r2_key);
  if (!object) return json({ error: "Invoice not found." }, 404);
  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${row.filename.replaceAll('"', "")}"`,
    },
  });
}

const notFound = () => json({ error: "Not found." }, 404);

export async function handleFulfillmentOps(request, env, url, method, body) {
  const parts = url.pathname.replace(/^\/api\/ops\/fulfillment\/?/, "").split("/").filter(Boolean);
  const [a, b, c] = parts;
  if (!a && method === "GET") return json(await loadBundle(env));
  if (a === "settings" && method === "PUT") return saveSettings(env, body);
  if (a === "goods" && !b && method === "POST") return createGood(env, body);
  if (a === "goods" && b && method === "PATCH") return updateGood(env, b, body, false);
  if (a === "goods" && b && method === "DELETE") return deleteGood(env, b);
  if (a === "items" && !b && method === "POST") return createItem(env, body);
  if (a === "items" && b && !c && method === "PATCH") return updateItem(env, b, body);
  if (a === "items" && b && !c && method === "DELETE") return deleteItem(env, b);
  if (a === "items" && b && c === "files" && method === "PUT") return uploadAsset(env, b, request, url);
  if (a === "items" && b && c === "files" && parts[3] && method === "DELETE") return deleteAsset(env, b, parts[3]);
  if (a === "assets" && b && method === "GET") return downloadAsset(env, b);
  if (a === "sync" && method === "POST") return syncPatrons(env);
  if (a === "edits" && method === "POST") return ackEdits(env);
  if (a === "invoices" && b && c === "paid" && method === "POST") return markPaid(env, b);
  if (a === "invoices" && b && c === "file" && method === "GET") return downloadInvoice(env, b);
  if (a === "sheets" && method === "GET") {
    const kind = url.searchParams.get("kind");
    if (kind !== "order" && kind !== "fulfillment") return json({ error: "Choose a sheet." }, 400);
    return sheetResponse(env, url, kind);
  }
  return notFound();
}

export function fulfillmentUpload(url) {
  const parts = url.pathname.replace(/^\/api\/ops\/fulfillment\/?/, "").split("/").filter(Boolean);
  return parts[0] === "items" && parts[2] === "files";
}

async function partnerPass(env, request) {
  const token = (request.headers.get("Cookie") || "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${PARTNER_COOKIE}=`))
    ?.slice(PARTNER_COOKIE.length + 1);
  if (!token) return false;
  const row = await env.DB.prepare(
    "SELECT 1 AS ok FROM partner_passes WHERE token_hash = ? AND expires_at > ?"
  )
    .bind(await tokenHash(token), Math.floor(Date.now() / 1000))
    .first();
  return Boolean(row);
}

async function issuePartner(env, request) {
  const token = crypto.randomUUID() + crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM partner_passes WHERE expires_at <= ?").bind(now),
    env.DB.prepare("INSERT INTO partner_passes (token_hash, expires_at) VALUES (?, ?)").bind(
      await tokenHash(token),
      now + PASS_SECONDS
    ),
  ]);
  return cookie(request, token, PASS_SECONDS, PARTNER_COOKIE);
}

export async function handlePartner(request, env, url) {
  const method = request.method;
  if (method !== "GET" && method !== "HEAD" && !sameOrigin(request, url)) return notFound();
  const parts = url.pathname.replace(/^\/api\/partner\/?/, "").split("/").filter(Boolean);
  const [a, b, c] = parts;
  const raw = method === "PUT";
  const body = method === "GET" || method === "DELETE" || raw ? null : await readBody(request);

  if (a === "access" && method === "POST") {
    const stored = settingsOf((await readSettings(env))[KEY]);
    const phrase = String(body?.code ?? "");
    if (!stored.passHash || (await tokenHash(phrase)) !== stored.passHash) return notFound();
    console.log(JSON.stringify({ message: "partner unlocked" }));
    return json({ ok: true }, 200, { "Set-Cookie": await issuePartner(env, request) });
  }
  if (!(await partnerPass(env, request))) return notFound();
  if (a === "access" && method === "GET") return json({ ok: true });
  if (!a && method === "GET") return json(await loadBundle(env));
  if (a === "sheets" && method === "GET") {
    const kind = url.searchParams.get("kind");
    if (kind !== "order" && kind !== "fulfillment") return json({ error: "Choose a sheet." }, 400);
    return sheetResponse(env, url, kind);
  }
  if (a === "assets" && b && method === "GET") return downloadAsset(env, b);
  if (a === "invoices" && b && c === "file" && method === "GET") return downloadInvoice(env, b);
  if (a === "invoices" && method === "PUT") return uploadInvoice(env, request, url);
  if (a === "months" && b && c === "lock" && method === "POST") return lockMonth(env, b);
  if (a === "shipments" && b && method === "PATCH") return patchShipment(env, b, body);
  if (a === "goods" && b && method === "PATCH") return updateGood(env, b, body, true);
  return notFound();
}

export function partnerUpload(url) {
  return url.pathname === "/api/partner/invoices";
}
