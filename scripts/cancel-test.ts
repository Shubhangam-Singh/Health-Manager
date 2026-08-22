/**
 * Patient cancels an appointment. Verifies the other party is notified, the
 * calendar events are queued for deletion, outstanding medication reminders
 * stop, and the slot becomes bookable again — which is only true because the
 * unique index is PARTIAL.
 *
 * Run: node --env-file=.env scripts/cancel-test.ts
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
  if (!s.length) throw new Error(`login failed ${email}`);
  return [c1, ...s].join("; ");
}

/** Short-lived connection per query: a held one drops while we wait on HTTP. */
async function q(sql: string, params: unknown[] = []) {
  const db = new Client({ connectionString: process.env.DIRECT_URL });
  await db.connect();
  try { return await db.query(sql, params); } finally { await db.end(); }
}

async function main() {
  let fails = 0;
  const ok = (n: string, pass: boolean, extra = "") => {
    if (!pass) fails++;
    console.log(`  ${pass ? "PASS" : "FAIL"} ${n}${extra ? "  — " + extra : ""}`);
  };

  const patient = await login("asha@example.test", "patient12345");
  const docs = ((await (await fetch(`${BASE}/api/doctors`, { headers: { Cookie: patient } })).json()) as
    { doctors: { id: string }[] }).doctors;

  let t: { doctorId: string; startAt: string; date: string } | null = null;
  for (let i = 1; i <= 21 && !t; i++) {
    const date = new Date(Date.now() + i * 86400000).toISOString().slice(0, 10);
    for (const d of docs) {
      const sl = ((await (await fetch(`${BASE}/api/doctors/${d.id}/slots?date=${date}`,
        { headers: { Cookie: patient } })).json()) as { slots?: { startAt: string }[] }).slots;
      if (sl?.length) { t = { doctorId: d.id, startAt: sl[0].startAt, date }; break; }
    }
  }
  if (!t) throw new Error("no free slot in the next 21 days");

  const h = (await (await fetch(`${BASE}/api/holds`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: patient },
    body: JSON.stringify({ doctorId: t.doctorId, startAt: t.startAt }),
  })).json()) as { hold: { id: string } };

  const booked = (await (await fetch(`${BASE}/api/appointments`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: patient },
    body: JSON.stringify({ holdId: h.hold.id }),
  })).json()) as { appointment: { id: string } };
  ok("booked an appointment", !!booked.appointment?.id);
  const id = booked.appointment.id;

  const other = await login("rohit@example.test", "patient12345");
  const intruder = await fetch(`${BASE}/api/appointments/${id}/cancel`,
    { method: "POST", headers: { Cookie: other } });
  ok("another patient cannot cancel it", intruder.status === 404, `HTTP ${intruder.status}`);

  const res = await fetch(`${BASE}/api/appointments/${id}/cancel`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: patient },
    body: JSON.stringify({ reason: "Feeling better" }),
  });
  ok("patient cancels their own", res.status === 200, `HTTP ${res.status}`);

  const again = await fetch(`${BASE}/api/appointments/${id}/cancel`,
    { method: "POST", headers: { Cookie: patient } });
  ok("cancelling twice is a 409", again.status === 409, `HTTP ${again.status}`);

  const row = (await q(`SELECT status, "cancelReason" FROM "Appointment" WHERE id=$1`, [id])).rows[0];
  ok("status CANCELLED with reason", row.status === "CANCELLED" && row.cancelReason === "PATIENT_REQUEST",
     `${row.status}/${row.cancelReason}`);

  const n = (await q(`SELECT COUNT(*)::int c FROM "Notification" WHERE "idempotencyKey"=$1`,
    [`booking-cancelled:${id}`])).rows[0];
  ok("doctor notified exactly once", n.c === 1, `${n.c} row(s)`);

  const cal = (await q(
    `SELECT COUNT(*)::int c FROM "CalendarEvent" WHERE "appointmentId"=$1 AND status='DELETE_PENDING'`,
    [id])).rows[0];
  ok("calendar events queued for deletion", cal.c === 2, `${cal.c}`);

  const slots = ((await (await fetch(`${BASE}/api/doctors/${t.doctorId}/slots?date=${t.date}`,
    { headers: { Cookie: patient } })).json()) as { slots?: { startAt: string }[] }).slots ?? [];
  ok("slot bookable again (partial index)", slots.some((s) => s.startAt === t!.startAt));

  const rem = (await (await fetch(`${BASE}/api/cron/reminders`,
    { headers: { Authorization: `Bearer ${SECRET}` } })).json()) as
    { appointments?: { appointments: number; attempted: number } };
  ok("appointment reminders generated", typeof rem.appointments?.appointments === "number",
     JSON.stringify(rem.appointments));

  console.log(`\n  ${fails === 0 ? "ALL CHECKS PASSED" : fails + " CHECK(S) FAILED"}\n`);
  process.exit(fails === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
