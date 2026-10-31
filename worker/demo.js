const DEMO_WORK_IDS = [
  "d1000000-0000-4000-8000-000000000001",
  "d1000000-0000-4000-8000-000000000002",
  "d1000000-0000-4000-8000-000000000003",
  "d1000000-0000-4000-8000-000000000004",
  "d1000000-0000-4000-8000-000000000005",
  "d1000000-0000-4000-8000-000000000006",
];

const DEMO_COMMISSION_IDS = ["demo-0001", "demo-0002", "demo-0003", "demo-0004"];

const CLEARED_KEY = "demo.cleared";

let cleared = false;

export function demoAllowed(env) {
  const value = String(env.DEMO ?? "").trim().toLowerCase();
  if (!value) return true;
  return !["0", "off", "false", "no"].includes(value);
}

export async function clearDemoData(env) {
  if (demoAllowed(env) || cleared) return;
  const done = await env.DB.prepare("SELECT 1 AS ok FROM settings WHERE key = ?").bind(CLEARED_KEY).first();
  if (done) {
    cleared = true;
    return;
  }
  const workMarks = DEMO_WORK_IDS.map(() => "?").join(", ");
  const commissionMarks = DEMO_COMMISSION_IDS.map(() => "?").join(", ");
  const files = await env.DB.prepare(
    `SELECT r2_key FROM gallery_files WHERE work_id IN (${workMarks})`
  )
    .bind(...DEMO_WORK_IDS)
    .all();
  const attached = await env.DB.prepare(
    `SELECT r2_key FROM commission_files WHERE commission_id IN (${commissionMarks})`
  )
    .bind(...DEMO_COMMISSION_IDS)
    .all();
  if (env.GALLERY) {
    for (const row of [...files.results, ...attached.results]) {
      await env.GALLERY.delete(row.r2_key).catch(() => {});
    }
  }
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM gallery_work_tags WHERE work_id IN (${workMarks})`).bind(...DEMO_WORK_IDS),
    env.DB.prepare(`DELETE FROM gallery_files WHERE work_id IN (${workMarks})`).bind(...DEMO_WORK_IDS),
    env.DB.prepare(`DELETE FROM gallery_works WHERE id IN (${workMarks})`).bind(...DEMO_WORK_IDS),
    env.DB.prepare(`DELETE FROM commission_files WHERE commission_id IN (${commissionMarks})`).bind(
      ...DEMO_COMMISSION_IDS
    ),
    env.DB.prepare(`DELETE FROM commissions WHERE id IN (${commissionMarks})`).bind(...DEMO_COMMISSION_IDS),
    env.DB.prepare(
      `INSERT INTO settings (key, value) VALUES (?, '1') ON CONFLICT (key) DO NOTHING`
    ).bind(CLEARED_KEY),
  ]);
  cleared = true;
}
