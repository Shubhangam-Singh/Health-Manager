/**
 * The full patient flow: hold -> confirm -> appointment + queued notifications.
 * Run: node --env-file=.env scripts/booking-flow-test.ts
 */
import { Client } from "pg";
const BASE = process.env.RACE_BASE_URL ?? "http://localhost:3000";
const PW = "flowtestpassword";

async function patient(email: string) {
  await fetch(`${BASE}/api/auth/register`, { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PW, name: "Flow Tester" }) });
  const r1 = await fetch(`${BASE}/api/auth/csrf`);
  const c1 = (r1.headers.getSetCookie?.() ?? []).map(c => c.split(";")[0]).join("; ");
  const { csrfToken } = await r1.json() as { csrfToken: string };
  const r2 = await fetch(`${BASE}/api/auth/callback/credentials`, { method: "POST", redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: c1 },
    body: new URLSearchParams({ csrfToken, email, password: PW }) });
  const s = (r2.headers.getSetCookie?.() ?? []).map(c => c.split(";")[0]).filter(c => c.includes("authjs.session-token"));
  return [c1, ...s].join("; ");
}

const j = async (r: Response) => ({ status: r.status, body: await r.json().catch(() => null) });

async function main() {
  const cookie = await patient("flow@test.com");
  const docs = ((await (await fetch(`${BASE}/api/doctors`, { headers: { Cookie: cookie } })).json()) as { doctors: { id: string }[] }).doctors;

  type Target = { doctorId: string; startAt: string };
  let target: Target | null = null;
  for (let i = 1; i <= 14 && !target; i++) {
    const date = new Date(Date.now() + i * 86400000).toISOString().slice(0, 10);
    for (const d of docs) {
      const s = ((await (await fetch(`${BASE}/api/doctors/${d.id}/slots?date=${date}`, { headers: { Cookie: cookie } })).json()) as { slots?: { startAt: string }[] }).slots;
      if (s?.length) { target = { doctorId: d.id, startAt: s[0].startAt }; break; }
    }
  }
  console.log(`\n  slot: ${target!.startAt}`);

  const held = await j(await fetch(`${BASE}/api/holds`, { method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify(target!) }));
  console.log(`  1. hold taken            → ${held.status} ${held.status === 201 ? "✅" : "❌"}`);

  const holdId = held.body.hold.id;
  const booked = await j(await fetch(`${BASE}/api/appointments`, { method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ holdId }) }));
  console.log(`  2. hold -> appointment   → ${booked.status} ${booked.status === 201 ? "✅" : "❌"}`);

  const again = await j(await fetch(`${BASE}/api/appointments`, { method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ holdId }) }));
  console.log(`  3. same hold reused      → ${again.status} (want 404) ${again.status === 404 ? "✅" : "❌"}`);

  const db = new Client({ connectionString: process.env.DIRECT_URL });
  await db.connect();
  const n = await db.query(`SELECT type, status, "idempotencyKey" FROM "Notification" WHERE payload->>'appointmentId' = $1 ORDER BY "idempotencyKey"`, [booked.body.appointment.id]);
  const h = await db.query(`SELECT COUNT(*)::int c FROM "SlotHold" WHERE id = $1`, [holdId]);
  console.log(`  4. hold row deleted      → ${h.rows[0].c === 0 ? "yes ✅" : "no ❌"}`);
  console.log(`  5. notifications queued  → ${n.rowCount} rows`);
  for (const r of n.rows) console.log(`       ${r.status.padEnd(8)} ${r.idempotencyKey}`);
  await db.end();
  console.log(`\n  nothing was SENT — status is PENDING. The worker (Step 25) delivers.\n`);
}
main().catch(e => { console.error(e); process.exit(1); });
