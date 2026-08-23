/**
 * Doctor leave conflict handling (graded problem 3).
 *   1. book an appointment
 *   2. admin asks "what would break if this doctor takes that day off?"  -> nothing changes
 *   3. admin confirms                                                     -> cancelled + queued
 *   4. worker delivers the cancellation emails
 * Run: node --env-file=.env scripts/leave-conflict-test.ts
 */
import { Client } from "pg";

const BASE = process.env.RACE_BASE_URL ?? "http://localhost:3000";
const SECRET = process.env.CRON_SECRET!;

async function login(email: string, password: string) {
  const r1 = await fetch(`${BASE}/api/auth/csrf`);
  const c1 = (r1.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  const { csrfToken } = (await r1.json()) as { csrfToken: string };
  const r2 = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST", redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: c1 },
    body: new URLSearchParams({ csrfToken, email, password }),
  });
  const s = (r2.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0])
    .filter((c) => c.includes("authjs.session-token"));
  if (!s.length) throw new Error(`login failed: ${email}`);
  return [c1, ...s].join("; ");
}

async function main() {
  const admin = await login("admin@clinic.test", "admin12345");
  const patient = await login("asha@example.test", "patient12345");

  const docs = ((await (await fetch(`${BASE}/api/doctors`, { headers: { Cookie: patient } })).json()) as
    { doctors: { id: string; user: { name: string } }[] }).doctors;

  // Find a doctor with a free slot and book it.
  let target: { doctorId: string; date: string; startAt: string; name: string } | null = null;
  for (let i = 2; i <= 14 && !target; i++) {
    const date = new Date(Date.now() + i * 86400000).toISOString().slice(0, 10);
    for (const d of docs) {
      const s = ((await (await fetch(`${BASE}/api/doctors/${d.id}/slots?date=${date}`, { headers: { Cookie: patient } })).json()) as
        { slots?: { startAt: string }[] }).slots;
      if (s?.length) { target = { doctorId: d.id, date, startAt: s[0].startAt, name: d.user.name }; break; }
    }
  }
  if (!target) throw new Error("no free slot");

  const hold = await (await fetch(`${BASE}/api/holds`, { method: "POST",
    headers: { "Content-Type": "application/json", Cookie: patient },
    body: JSON.stringify({ doctorId: target.doctorId, startAt: target.startAt }) })).json() as { hold: { id: string } };
  const booked = await fetch(`${BASE}/api/appointments`, { method: "POST",
    headers: { "Content-Type": "application/json", Cookie: patient },
    body: JSON.stringify({ holdId: hold.hold.id }) });
  console.log(`\n  1. booked with ${target.name} on ${target.date} → ${booked.status}`);

  // 2. Dry run.
  const dry = await (await fetch(`${BASE}/api/admin/doctors/${target.doctorId}/leave?date=${target.date}`,
    { headers: { Cookie: admin } })).json() as { affected: { patientName: string; startAt: string }[] };
  console.log(`  2. dry run: ${dry.affected.length} appointment(s) would be cancelled`);
  for (const a of dry.affected) console.log(`       ${a.patientName} at ${a.startAt}`);

  const db = new Client({ connectionString: process.env.DIRECT_URL });
  await db.connect();
  const stillLive = await db.query(
    `SELECT COUNT(*)::int n FROM "Appointment" WHERE "doctorId"=$1 AND status='CONFIRMED'`, [target.doctorId]);
  console.log(`     nothing changed yet — still CONFIRMED: ${stillLive.rows[0].n} ✅`);

  // 3. Confirm.
  const applied = await fetch(`${BASE}/api/admin/doctors/${target.doctorId}/leave`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: admin },
    body: JSON.stringify({ date: target.date, reason: "Attending a conference", confirm: true }) });
  const result = await applied.json() as { cancelled: number; alternatives: string[] };
  console.log(`  3. confirmed → ${applied.status}, cancelled ${result.cancelled}, ${result.alternatives.length} alternatives suggested`);

  const after = await db.query(
    `SELECT status, "cancelReason" FROM "Appointment" WHERE "doctorId"=$1 ORDER BY "updatedAt" DESC LIMIT 1`, [target.doctorId]);
  console.log(`     appointment now: ${after.rows[0].status} / ${after.rows[0].cancelReason} ✅`);

  const queued = await db.query(
    `SELECT type, status, "idempotencyKey" FROM "Notification" WHERE "idempotencyKey" LIKE 'leave-%' ORDER BY "idempotencyKey"`);
  console.log(`  4. notifications queued: ${queued.rowCount}`);
  for (const q of queued.rows) console.log(`       ${q.status.padEnd(8)} ${q.idempotencyKey}`);

  // Slot must be gone from availability.
  const slotsNow = ((await (await fetch(`${BASE}/api/doctors/${target.doctorId}/slots?date=${target.date}`, { headers: { Cookie: patient } })).json()) as
    { slots?: unknown[] }).slots ?? [];
  console.log(`  5. slots on that date now: ${slotsNow.length} (leave day) ${slotsNow.length === 0 ? "✅" : "❌"}`);

  const rep = await (await fetch(`${BASE}/api/cron/notifications`, { headers: { Authorization: `Bearer ${SECRET}` } })).json();
  console.log(`  6. worker run: ${JSON.stringify(rep)}\n`);
  await db.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
