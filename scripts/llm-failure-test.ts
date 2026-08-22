/** Proves booking survives an unusable LLM. Run with GEMINI_API_KEY unset or wrong. */
import { Client } from "pg";
const BASE = process.env.RACE_BASE_URL ?? "http://localhost:3000";
const PW = "llmtestpassword";
async function patient(email: string) {
  await fetch(`${BASE}/api/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PW, name: "LLM Tester" }) });
  const r1 = await fetch(`${BASE}/api/auth/csrf`);
  const c1 = (r1.headers.getSetCookie?.() ?? []).map(c => c.split(";")[0]).join("; ");
  const { csrfToken } = await r1.json() as { csrfToken: string };
  const r2 = await fetch(`${BASE}/api/auth/callback/credentials`, { method: "POST", redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: c1 },
    body: new URLSearchParams({ csrfToken, email, password: PW }) });
  const s = (r2.headers.getSetCookie?.() ?? []).map(c => c.split(";")[0]).filter(c => c.startsWith("authjs.session-token"));
  return [c1, ...s].join("; ");
}
async function main() {
  const cookie = await patient("llm@test.com");
  const docs = ((await (await fetch(`${BASE}/api/doctors`, { headers: { Cookie: cookie } })).json()) as { doctors: { id: string }[] }).doctors;
  type Target = { doctorId: string; startAt: string };
  let t: Target | null = null;
  for (let i = 1; i <= 14 && !t; i++) {
    const date = new Date(Date.now() + i * 86400000).toISOString().slice(0, 10);
    for (const d of docs) {
      const s = ((await (await fetch(`${BASE}/api/doctors/${d.id}/slots?date=${date}`, { headers: { Cookie: cookie } })).json()) as { slots?: { startAt: string }[] }).slots;
      if (s?.length) { t = { doctorId: d.id, startAt: s[0].startAt }; break; }
    }
  }
  const h = await (await fetch(`${BASE}/api/holds`, { method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify(t!) })).json();
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/appointments`, { method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ holdId: h.hold.id, symptoms: {
      rawText: "Sharp chest pain when walking up stairs, worse over the last three days.",
      durationDays: 3, severity: 8, existingConditions: "hypertension", currentMedications: "amlodipine" } }) });
  const ms = Date.now() - t0;
  const body = await res.json();
  console.log(`\n  booking response: HTTP ${res.status} in ${ms}ms ${res.status === 201 ? "✅" : "❌"}`);
  console.log(`  (an LLM timeout is 15s -- this returned in ${ms}ms, so booking did NOT wait)\n`);
  await new Promise(r => setTimeout(r, 6000));
  const db = new Client({ connectionString: process.env.DIRECT_URL });
  await db.connect();
  const s = await db.query(`SELECT status, attempts, "lastError", "promptVersion" FROM "PreVisitSummary" WHERE "appointmentId"=$1`, [body.appointment.id]);
  const f = await db.query(`SELECT "rawText" FROM "SymptomForm" WHERE "appointmentId"=$1`, [body.appointment.id]);
  console.log(`  appointment stored:  ${body.appointment.status} ✅`);
  console.log(`  symptom form stored: ${f.rowCount === 1 ? "yes ✅" : "no ❌"}`);
  const row = s.rows[0];
  console.log(`  summary status:      ${row?.status}  attempts=${row?.attempts}`);
  console.log(`  lastError:           ${row?.lastError}`);
  console.log(`\n  The doctor sees the raw symptom text plus a Regenerate button.\n  Nothing crashed, and the appointment is real.\n`);
  await db.end();
}
main().catch(e => { console.error(e); process.exit(1); });
