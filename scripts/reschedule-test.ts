/**
 * Reschedule: the appointment KEEPS its id and attached records, both parties
 * are notified, the calendar event is queued for PATCH rather than delete, the
 * old slot frees up, and the new one is taken.
 *
 * Run: node --env-file=.env scripts/reschedule-test.ts
 */
import { Client } from "pg";

const BASE = process.env.RACE_BASE_URL ?? "http://localhost:3000";

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

async function q(sql: string, params: unknown[] = []) {
  const db = new Client({ connectionString: process.env.DIRECT_URL });
  await db.connect();
  try { return await db.query(sql, params); } finally { await db.end(); }
}

const slotsFor = async (cookie: string, doctorId: string, date: string) =>
  ((await (await fetch(`${BASE}/api/doctors/${doctorId}/slots?date=${date}`,
    { headers: { Cookie: cookie } })).json()) as { slots?: { startAt: string }[] }).slots ?? [];

async function main() {
  let fails = 0;
  const ok = (n: string, pass: boolean, extra = "") => {
    if (!pass) fails++;
    console.log(`  ${pass ? "PASS" : "FAIL"} ${n}${extra ? "  — " + extra : ""}`);
  };

  const patient = await login("asha@example.test", "patient12345");
  const docs = ((await (await fetch(`${BASE}/api/doctors`, { headers: { Cookie: patient } })).json()) as
    { doctors: { id: string }[] }).doctors;

  // Find a day with at least TWO free slots, so we can move between them.
  let target: { doctorId: string; date: string; first: string; second: string } | null = null;
  for (let i = 1; i <= 21 && !target; i++) {
    const date = new Date(Date.now() + i * 86400000).toISOString().slice(0, 10);
    for (const d of docs) {
      const sl = await slotsFor(patient, d.id, date);
      if (sl.length >= 2) {
        target = { doctorId: d.id, date, first: sl[0].startAt, second: sl[1].startAt };
        break;
      }
    }
  }
  if (!target) throw new Error("no day with two free slots");

  const h = (await (await fetch(`${BASE}/api/holds`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: patient },
    body: JSON.stringify({ doctorId: target.doctorId, startAt: target.first }),
  })).json()) as { hold: { id: string } };

  const booked = (await (await fetch(`${BASE}/api/appointments`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: patient },
    body: JSON.stringify({
      holdId: h.hold.id,
      symptoms: { rawText: "Persistent dry cough for about a week, worse at night.", durationDays: 7, severity: 4 },
    }),
  })).json()) as { appointment: { id: string } };
  const id = booked.appointment.id;
  ok("booked at the first slot", !!id);

  // Another patient must not be able to move it.
  const other = await login("rohit@example.test", "patient12345");
  const intruder = await fetch(`${BASE}/api/appointments/${id}/reschedule`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: other },
    body: JSON.stringify({ startAt: target.second }),
  });
  ok("another patient cannot move it", intruder.status === 404, `HTTP ${intruder.status}`);

  const res = await fetch(`${BASE}/api/appointments/${id}/reschedule`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: patient },
    body: JSON.stringify({ startAt: target.second }),
  });
  ok("patient moves it to the second slot", res.status === 200, `HTTP ${res.status}`);

  const row = (await q(`SELECT id, "startAt", status FROM "Appointment" WHERE id=$1`, [id])).rows[0];
  ok("same appointment id kept", row.id === id);
  ok("startAt updated", new Date(row.startAt).toISOString() === target.second,
     new Date(row.startAt).toISOString());
  ok("still CONFIRMED", row.status === "CONFIRMED");

  const form = (await q(`SELECT COUNT(*)::int c FROM "SymptomForm" WHERE "appointmentId"=$1`, [id])).rows[0];
  ok("symptom form still attached", form.c === 1);

  const cal = (await q(
    `SELECT COUNT(*)::int c FROM "CalendarEvent" WHERE "appointmentId"=$1 AND status IN ('UPDATE_PENDING','PENDING')`,
    [id])).rows[0];
  ok("calendar queued for update, not delete", cal.c === 2, `${cal.c}`);

  const notes = (await q(
    `SELECT COUNT(*)::int c FROM "Notification" WHERE "idempotencyKey" LIKE $1`,
    [`rescheduled:${id}:%`])).rows[0];
  ok("both parties notified", notes.c === 2, `${notes.c}`);

  const after = await slotsFor(patient, target.doctorId, target.date);
  ok("old slot is free again", after.some((s) => s.startAt === target!.first));
  ok("new slot is taken", !after.some((s) => s.startAt === target!.second));

  const same = await fetch(`${BASE}/api/appointments/${id}/reschedule`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: patient },
    body: JSON.stringify({ startAt: target.second }),
  });
  ok("moving to the same time is a 409", same.status === 409, `HTTP ${same.status}`);

  console.log(`\n  ${fails === 0 ? "ALL CHECKS PASSED" : fails + " CHECK(S) FAILED"}\n`);
  process.exit(fails === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
