/**
 * Full journey on seeded data:
 *   register -> search -> hold -> symptom form -> confirm -> AI summary
 *   -> doctor notes + prescription -> reminders -> crons -> patient summary
 * Run: node --env-file=.env scripts/e2e-test.ts
 */
import { Client } from "pg";
const BASE = process.env.RACE_BASE_URL ?? "http://localhost:3000";
const SECRET = process.env.CRON_SECRET!;

async function login(email: string, password: string) {
  const r1 = await fetch(`${BASE}/api/auth/csrf`);
  const c1 = (r1.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  const { csrfToken } = (await r1.json()) as { csrfToken: string };
  const r2 = await fetch(`${BASE}/api/auth/callback/credentials`, { method: "POST", redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: c1 },
    body: new URLSearchParams({ csrfToken, email, password }) });
  const s = (r2.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).filter((c) => c.startsWith("authjs.session-token"));
  if (!s.length) throw new Error(`login failed: ${email}`);
  return [c1, ...s].join("; ");
}
const ok = (b: boolean) => (b ? "PASS" : "FAIL");

async function main() {
  const db = new Client({ connectionString: process.env.DIRECT_URL });
  await db.connect();
  let failures = 0;
  const step = (n: string, pass: boolean, extra = "") => {
    if (!pass) failures++;
    console.log(`  ${ok(pass).padEnd(4)} ${n}${extra ? "  — " + extra : ""}`);
  };

  const patient = await login("asha@example.test", "patient12345");
  step("patient logs in", true);

  const docs = ((await (await fetch(`${BASE}/api/doctors?specialisation=cardio`, { headers: { Cookie: patient } })).json()) as
    { doctors: { id: string; user: { name: string } }[] }).doctors;
  step("search by specialisation", docs.length === 1, docs[0]?.user.name);

  let t: { doctorId: string; startAt: string } | null = null;
  for (let i = 1; i <= 21 && !t; i++) {
    const date = new Date(Date.now() + i * 86400000).toISOString().slice(0, 10);
    const sl = ((await (await fetch(`${BASE}/api/doctors/${docs[0].id}/slots?date=${date}`, { headers: { Cookie: patient } })).json()) as
      { slots?: { startAt: string }[] }).slots;
    if (sl?.length) t = { doctorId: docs[0].id, startAt: sl[0].startAt };
  }
  step("slots generated from working hours", !!t, t?.startAt);

  const h = (await (await fetch(`${BASE}/api/holds`, { method: "POST",
    headers: { "Content-Type": "application/json", Cookie: patient }, body: JSON.stringify(t) })).json()) as { hold: { id: string } };
  step("slot held", !!h.hold?.id);

  const other = await login("rohit@example.test", "patient12345");
  const stolen = await fetch(`${BASE}/api/holds`, { method: "POST",
    headers: { "Content-Type": "application/json", Cookie: other }, body: JSON.stringify(t) });
  step("second patient cannot hold the same slot", stolen.status === 409, `HTTP ${stolen.status}`);

  const booked = await fetch(`${BASE}/api/appointments`, { method: "POST",
    headers: { "Content-Type": "application/json", Cookie: patient },
    body: JSON.stringify({ holdId: h.hold.id, symptoms: {
      rawText: "Tight chest pain when walking uphill for the last five days, settles with rest. Some breathlessness yesterday.",
      durationDays: 5, severity: 7, existingConditions: "High cholesterol", currentMedications: "Atorvastatin 10mg" } }) });
  const appt = (await booked.json()) as { appointment: { id: string } };
  step("appointment confirmed with symptom form", booked.status === 201);

  const q = await db.query(`SELECT
      (SELECT COUNT(*)::int FROM "Notification" WHERE payload->>'appointmentId'=$1) notifs,
      (SELECT COUNT(*)::int FROM "CalendarEvent" WHERE "appointmentId"=$1) cal,
      (SELECT COUNT(*)::int FROM "SlotHold" WHERE id=$2) holds`, [appt.appointment.id, h.hold.id]);
  step("2 notifications queued (outbox)", q.rows[0].notifs === 2, `${q.rows[0].notifs}`);
  step("2 calendar events queued", q.rows[0].cal === 2, `${q.rows[0].cal}`);
  step("hold consumed", q.rows[0].holds === 0);

  const doctor = await login("mehta@clinic.test", "doctor12345");
  const notes = await fetch(`${BASE}/api/appointments/${appt.appointment.id}/visit-notes`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: doctor },
    body: JSON.stringify({
      note: { clinicalNotes: "Exertional chest pain, likely stable angina. ECG unremarkable at rest. Starting antianginal therapy and arranging a stress test.", diagnosis: "Stable angina", followUpDays: 14 },
      medications: [
        { drugName: "Aspirin", dose: "75 mg", frequency: "ONCE_DAILY", durationDays: 30 },
        { drugName: "Metoprolol", dose: "25 mg", frequency: "TWICE_DAILY", durationDays: 14 },
      ] }) });
  step("doctor records notes and prescription", notes.status === 201, `HTTP ${notes.status}`);

  const rem = await db.query(`SELECT COUNT(*)::int n FROM "MedicationReminder" mr
    JOIN "PrescriptionItem" pi ON pi.id=mr."prescriptionItemId"
    JOIN "Prescription" p ON p.id=pi."prescriptionId" WHERE p."appointmentId"=$1`, [appt.appointment.id]);
  step("58 medication reminders materialised", rem.rows[0].n === 58, `${rem.rows[0].n}`);

  const intruder = await fetch(`${BASE}/api/appointments/${appt.appointment.id}/visit-notes`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: await login("rao@clinic.test", "doctor12345") },
    body: JSON.stringify({ note: { clinicalNotes: "Trying to write on someone else's patient." }, medications: [] }) });
  step("another doctor cannot write these notes", intruder.status === 404, `HTTP ${intruder.status}`);

  const cronNoSecret = await fetch(`${BASE}/api/cron/notifications`);
  step("cron rejects a missing secret", cronNoSecret.status === 401);

  const disp = (await (await fetch(`${BASE}/api/cron/notifications`, { headers: { Authorization: `Bearer ${SECRET}` } })).json()) as { sent: number };
  step("notification worker delivers", disp.sent >= 2, `sent ${disp.sent}`);

  // Wait for the AI summaries, which run after the response.
  let pre: string | undefined, post: string | undefined;
  for (let i = 0; i < 20; i++) {
    const r = await db.query(
      `SELECT (SELECT status FROM "PreVisitSummary" WHERE "appointmentId"=$1) pre,
              (SELECT status FROM "PostVisitSummary" WHERE "appointmentId"=$1) post`, [appt.appointment.id]);
    pre = r.rows[0].pre; post = r.rows[0].post;
    if (pre !== "PENDING" && post !== "PENDING") break;
    await new Promise((r2) => setTimeout(r2, 3000));
  }
  step("pre-visit summary generated", pre === "READY", `${pre}`);
  step("post-visit summary generated", post === "READY", `${post}`);

  console.log(`\n  ${failures === 0 ? "ALL CHECKS PASSED" : failures + " CHECK(S) FAILED"}\n`);
  await db.end();
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
