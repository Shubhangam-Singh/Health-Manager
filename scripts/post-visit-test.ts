/** Doctor submits notes + prescription -> reminders materialise -> LLM summary. */
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
  const s = (r2.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).filter((c) => c.includes("authjs.session-token"));
  if (!s.length) throw new Error(`login failed ${email}`);
  return [c1, ...s].join("; ");
}

async function main() {
  const db = new Client({ connectionString: process.env.DIRECT_URL });
  await db.connect();

  const row = (await db.query(`
    SELECT a.id, u.email AS doctor_email
      FROM "Appointment" a
      JOIN "DoctorProfile" dp ON dp.id = a."doctorId"
      JOIN "User" u ON u.id = dp."userId"
     WHERE a.status <> 'CANCELLED' ORDER BY a."createdAt" DESC LIMIT 1`)).rows[0];
  let appt = row;
  if (!appt) {
    // Nothing live (the leave test cancels things), so book one first.
    const patient = await login("asha@example.test", "patient12345");
    const docs = ((await (await fetch(`${BASE}/api/doctors`, { headers: { Cookie: patient } })).json()) as
      { doctors: { id: string }[] }).doctors;
    let t: { doctorId: string; startAt: string } | null = null;
    for (let i = 1; i <= 21 && !t; i++) {
      const date = new Date(Date.now() + i * 86400000).toISOString().slice(0, 10);
      for (const d of docs) {
        const sl = ((await (await fetch(`${BASE}/api/doctors/${d.id}/slots?date=${date}`, { headers: { Cookie: patient } })).json()) as
          { slots?: { startAt: string }[] }).slots;
        if (sl?.length) { t = { doctorId: d.id, startAt: sl[0].startAt }; break; }
      }
    }
    if (!t) throw new Error("no free slot anywhere in the next 21 days");
    const h = (await (await fetch(`${BASE}/api/holds`, { method: "POST",
      headers: { "Content-Type": "application/json", Cookie: patient }, body: JSON.stringify(t) })).json()) as { hold: { id: string } };
    const b = (await (await fetch(`${BASE}/api/appointments`, { method: "POST",
      headers: { "Content-Type": "application/json", Cookie: patient },
      body: JSON.stringify({ holdId: h.hold.id, symptoms: {
        rawText: "Chest tightness on exertion for the last four days, easing with rest.",
        durationDays: 4, severity: 7 } }) })).json()) as { appointment: { id: string } };
    appt = (await db.query(`
      SELECT a.id, u.email AS doctor_email FROM "Appointment" a
        JOIN "DoctorProfile" dp ON dp.id=a."doctorId" JOIN "User" u ON u.id=dp."userId"
       WHERE a.id=$1`, [b.appointment.id])).rows[0];
    console.log(`  (booked a fresh appointment for this test)`);
  }
  const row2 = appt;

  const doctor = await login(row2.doctor_email, "doctor12345");

  const res = await fetch(`${BASE}/api/appointments/${row2.id}/visit-notes`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: doctor },
    body: JSON.stringify({
      note: {
        clinicalNotes: "Exertional angina suspected. ECG showed no acute ST changes. Started on antianginal therapy and referred for a treadmill stress test. Advised to avoid heavy exertion until reviewed.",
        diagnosis: "Stable angina pectoris",
        followUpDays: 14,
      },
      prescriptionNotes: "Take with food. Stop and seek help if chest pain occurs at rest.",
      medications: [
        { drugName: "Aspirin", dose: "75 mg", frequency: "ONCE_DAILY", durationDays: 30, instructions: "After breakfast" },
        { drugName: "Metoprolol", dose: "25 mg", frequency: "TWICE_DAILY", durationDays: 14 },
        { drugName: "Sorbitrate", dose: "5 mg", frequency: "AS_NEEDED", durationDays: 30, instructions: "Under the tongue if chest pain starts" },
      ],
    }),
  });
  console.log(`\n  1. visit notes submitted -> ${res.status} ${res.status === 201 ? "OK" : "FAIL"}`);
  if (res.status !== 201) console.log("     ", (await res.text()).slice(0, 400));

  const counts = (await db.query(`
    SELECT
      (SELECT COUNT(*)::int FROM "PrescriptionItem" pi JOIN "Prescription" p ON p.id=pi."prescriptionId" WHERE p."appointmentId"=$1) items,
      (SELECT COUNT(*)::int FROM "MedicationReminder" mr JOIN "PrescriptionItem" pi ON pi.id=mr."prescriptionItemId"
         JOIN "Prescription" p ON p.id=pi."prescriptionId" WHERE p."appointmentId"=$1) reminders,
      (SELECT status FROM "Appointment" WHERE id=$1) appt_status`, [row2.id])).rows[0];
  console.log(`  2. prescription items: ${counts.items}, reminders materialised: ${counts.reminders}`);
  console.log(`     appointment status: ${counts.appt_status}`);

  await new Promise((r) => setTimeout(r, 20000)); // the model can take a while
  const s = (await db.query(`SELECT status, attempts, "lastError", "patientFriendlyText", "followUpSteps" FROM "PostVisitSummary" WHERE "appointmentId"=$1`, [row2.id])).rows[0];
  console.log(`  3. post-visit summary: ${s?.status} (attempts ${s?.attempts})`);
  if (s?.status === "READY") {
    console.log(`\n     ${s.patientFriendlyText}\n`);
    console.log(`     follow-up steps:`);
    for (const f of s.followUpSteps) console.log(`       - ${f}`);
  } else if (s) { console.log(`     error: ${s.lastError}`); }

  // Distinct offsets per row: unique(prescriptionItemId, scheduledAt) rejects
  // two doses of the same drug at the same instant -- which is exactly the
  // point of that constraint.
  await db.query(`
    UPDATE "MedicationReminder" m
       SET "scheduledAt" = NOW() - (r.rn * INTERVAL '1 minute')
      FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY "scheduledAt") rn
              FROM "MedicationReminder" WHERE status='PENDING' LIMIT 3) r
     WHERE m.id = r.id`);
  const rem = await (await fetch(`${BASE}/api/cron/reminders`, { headers: { Authorization: `Bearer ${SECRET}` } })).json();
  console.log(`\n  4. reminder cron: ${JSON.stringify(rem)}`);
  const disp = await (await fetch(`${BASE}/api/cron/notifications`, { headers: { Authorization: `Bearer ${SECRET}` } })).json();
  console.log(`  5. notification worker: sent=${disp.sent} considered=${disp.considered}`);
  const hold = await (await fetch(`${BASE}/api/cron/cleanup-holds`, { headers: { Authorization: `Bearer ${SECRET}` } })).json();
  console.log(`  6. hold cleanup: ${JSON.stringify(hold)}\n`);
  await db.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
