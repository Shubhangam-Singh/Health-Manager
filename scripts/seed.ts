/**
 * Demo data. Wipes the app tables and rebuilds a realistic clinic.
 *
 * Run: npm run seed
 *
 * Deliberately destructive and only for demo/dev environments -- an evaluator
 * should be able to reset to a known state in one command.
 */
import { Client } from "pg";
import bcrypt from "bcryptjs";

const PASSWORD = {
  admin: "admin12345",
  doctor: "doctor12345",
  patient: "patient12345",
};

const IST = "Asia/Kolkata";
const hhmm = (h: number, m = 0) => h * 60 + m;

/**
 * Demo addresses use RFC 2606 reserved domains (.test) ON PURPOSE: they can
 * never resolve, so a demo can never accidentally email a real person. The
 * dispatcher recognises them and skips delivery rather than attempting a send
 * that the provider would accept and then bounce back to the operator.
 *
 * To receive real email, register an account through the UI with an address
 * you own.
 */
async function main() {
  const db = new Client({ connectionString: process.env.DIRECT_URL });
  await db.connect();

  console.log("  clearing existing data…");
  // Order matters: children before parents, despite cascades, so the script
  // is explicit about what it destroys.
  for (const t of [
    "MedicationReminder", "PrescriptionItem", "Prescription", "VisitNote",
    "PostVisitSummary", "PreVisitSummary", "SymptomForm", "CalendarEvent",
    "Notification", "Appointment", "SlotHold", "LeaveDay", "WorkingHour",
    "GoogleAccount", "DoctorProfile", "User",
  ]) {
    await db.query(`DELETE FROM "${t}"`);
  }

  const hash = async (p: string) => bcrypt.hash(p, 10);
  const user = async (id: string, email: string, name: string, role: string, pw: string, phone?: string) => {
    await db.query(
      `INSERT INTO "User" (id,email,"passwordHash",name,phone,role,"createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())`,
      [id, email, await hash(pw), name, phone ?? null, role]);
    return id;
  };

  console.log("  creating users…");
  await user("seed_admin", "admin@clinic.test", "Clinic Admin", "ADMIN", PASSWORD.admin, "+91 90000 00001");

  const doctors = [
    { id: "seed_doc_1", email: "mehta@clinic.test",  name: "Dr Rajiv Mehta",  spec: "Cardiology",    slot: 30, bio: "Interventional cardiologist, 20 years experience.", days: [1, 3, 5], from: hhmm(9),  to: hhmm(13) },
    { id: "seed_doc_2", email: "rao@clinic.test",    name: "Dr Anita Rao",    spec: "Dermatology",   slot: 20, bio: "Skin, hair and allergy specialist.",                days: [1, 2, 4], from: hhmm(10), to: hhmm(14) },
    { id: "seed_doc_3", email: "shah@clinic.test",   name: "Dr Vikram Shah",  spec: "Orthopaedics",  slot: 30, bio: "Joint replacement and sports injuries.",            days: [2, 4, 6], from: hhmm(10), to: hhmm(15) },
    { id: "seed_doc_4", email: "nair@clinic.test",   name: "Dr Priya Nair",   spec: "Pediatrics",    slot: 15, bio: "Newborn and child care.",                           days: [1, 2, 3, 4, 5], from: hhmm(9), to: hhmm(12) },
  ];

  for (const d of doctors) {
    await user(d.id, d.email, d.name, "DOCTOR", PASSWORD.doctor);
    const profileId = `${d.id}_profile`;
    await db.query(
      `INSERT INTO "DoctorProfile" (id,"userId",specialisation,"slotDurationMin",bio,timezone,"createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())`,
      [profileId, d.id, d.spec, d.slot, d.bio, IST]);

    for (const day of d.days) {
      await db.query(
        `INSERT INTO "WorkingHour" (id,"doctorId","dayOfWeek","startMinute","endMinute")
         VALUES ($1,$2,$3,$4,$5)`,
        [`${profileId}_wh_${day}`, profileId, day, d.from, d.to]);
    }
    // Dr Mehta also does an evening clinic on Wednesdays -- a split shift, to
    // demonstrate that the schema supports more than one block per day.
    if (d.id === "seed_doc_1") {
      await db.query(
        `INSERT INTO "WorkingHour" (id,"doctorId","dayOfWeek","startMinute","endMinute")
         VALUES ($1,$2,3,$3,$4)`,
        [`${profileId}_wh_3_evening`, profileId, hhmm(17), hhmm(20)]);
    }
  }

  const patients = [
    { id: "seed_pat_1", email: "asha@example.test",  name: "Asha Verma",   phone: "+91 90000 10001" },
    { id: "seed_pat_2", email: "rohit@example.test", name: "Rohit Sharma", phone: "+91 90000 10002" },
    { id: "seed_pat_3", email: "meera@example.test", name: "Meera Iyer",   phone: "+91 90000 10003" },
  ];
  for (const p of patients) await user(p.id, p.email, p.name, "PATIENT", PASSWORD.patient, p.phone);

  console.log("  done.\n");
  console.log("  ┌── DEMO ACCOUNTS ──────────────────────────────────────────┐");
  console.log(`  │ admin    admin@clinic.test      ${PASSWORD.admin.padEnd(14)}          │`);
  console.log(`  │ doctor   mehta@clinic.test      ${PASSWORD.doctor.padEnd(14)}          │`);
  console.log(`  │          rao@clinic.test, shah@…, nair@…  (same password)  │`);
  console.log(`  │ patient  asha@example.test      ${PASSWORD.patient.padEnd(14)}          │`);
  console.log(`  │          rohit@example.test, meera@example.test             │`);
  console.log("  └────────────────────────────────────────────────────────────┘\n");

  const counts = (await db.query(`SELECT
    (SELECT COUNT(*)::int FROM "User") users,
    (SELECT COUNT(*)::int FROM "DoctorProfile") doctors,
    (SELECT COUNT(*)::int FROM "WorkingHour") hours`)).rows[0];
  console.log(`  ${counts.users} users, ${counts.doctors} doctors, ${counts.hours} working-hour blocks`);
  console.log(`  Appointments are left empty on purpose: book one through the UI\n  to see holds, the symptom form and the AI summary working.\n`);

  await db.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
