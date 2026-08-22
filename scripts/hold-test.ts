/**
 * Exercises the slot hold mechanism end to end.
 *
 *   1. two patients race for the same hold -> exactly one wins
 *   2. a held slot disappears from everyone's availability
 *   3. releasing a hold gives the slot back
 *   4. an EXPIRED hold does not lock the slot forever
 *
 * Run:  node --env-file=.env scripts/hold-test.ts
 */
import { Client } from "pg";

const BASE = process.env.RACE_BASE_URL ?? "http://localhost:3000";
const PASSWORD = "holdtestpassword";

async function csrf() {
  const res = await fetch(`${BASE}/api/auth/csrf`);
  const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  const { csrfToken } = (await res.json()) as { csrfToken: string };
  return { csrfToken, cookie };
}

async function patient(email: string): Promise<string> {
  await fetch(`${BASE}/api/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, name: "Hold Tester" }),
  });
  const { csrfToken, cookie } = await csrf();
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST", redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookie },
    body: new URLSearchParams({ csrfToken, email, password: PASSWORD }),
  });
  const session = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0])
    .filter((c) => c.startsWith("authjs.session-token"));
  if (!session.length) throw new Error(`login failed: ${email}`);
  return [cookie, ...session].join("; ");
}

const slotsFor = async (cookie: string, doctorId: string, date: string) => {
  const r = await fetch(`${BASE}/api/doctors/${doctorId}/slots?date=${date}`, { headers: { Cookie: cookie } });
  return ((await r.json()) as { slots: { startAt: string }[] }).slots ?? [];
};

async function main() {
  const a = await patient("holder-a@test.com");
  const b = await patient("holder-b@test.com");

  const docs = (await (await fetch(`${BASE}/api/doctors`, { headers: { Cookie: a } })).json())
    .doctors as { id: string; user: { name: string } }[];

  let target: { doctorId: string; date: string; startAt: string } | null = null;
  for (let i = 1; i <= 14 && !target; i++) {
    const date = new Date(Date.now() + i * 86400000).toISOString().slice(0, 10);
    for (const d of docs) {
      const slots = await slotsFor(a, d.id, date);
      if (slots.length) { target = { doctorId: d.id, date, startAt: slots[0].startAt }; break; }
    }
  }
  if (!target) throw new Error("no free slot found");
  console.log(`\n  target slot: ${target.startAt}\n`);

  const hold = (cookie: string) =>
    fetch(`${BASE}/api/holds`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ doctorId: target!.doctorId, startAt: target!.startAt }),
    });

  // --- 1. race for the hold ---------------------------------------------
  const [ra, rb] = await Promise.all([hold(a), hold(b)]);
  const codes = [ra.status, rb.status].sort();
  console.log(`  1. two patients race     → ${codes.join(" and ")}  ${codes.join() === "201,409" ? "✅" : "❌"}`);

  const winner = ra.status === 201 ? a : b;
  const holdId = ((await (ra.status === 201 ? ra : rb).json()) as { hold: { id: string } }).hold.id;

  // --- 2. held slot vanishes from availability ---------------------------
  const after = await slotsFor(b, target.doctorId, target.date);
  const gone = !after.some((s) => s.startAt === target!.startAt);
  console.log(`  2. slot hidden from others → ${gone ? "yes ✅" : "no ❌"}`);

  // --- 3. releasing gives it back ----------------------------------------
  const del = await fetch(`${BASE}/api/holds/${holdId}`, { method: "DELETE", headers: { Cookie: winner } });
  const back = await slotsFor(b, target.doctorId, target.date);
  const returned = back.some((s) => s.startAt === target!.startAt);
  console.log(`  3. release (${del.status}) returns slot → ${returned ? "yes ✅" : "no ❌"}`);

  // --- 4. an EXPIRED hold must not lock the slot -------------------------
  const rehold = await hold(a);
  console.log(`  4. re-held by patient A     → ${rehold.status}`);
  const db = new Client({ connectionString: process.env.DIRECT_URL });
  await db.connect();
  await db.query(`UPDATE "SlotHold" SET "expiresAt" = NOW() - INTERVAL '1 minute'`);
  const visible = (await slotsFor(b, target.doctorId, target.date))
    .some((s) => s.startAt === target!.startAt);
  const stolen = await hold(b);
  const rows = await db.query(
    `SELECT COUNT(*)::int n FROM "SlotHold" WHERE "doctorId"=$1 AND "startAt"=$2`,
    [target.doctorId, target.startAt]);
  await db.end();
  console.log(`     once expired, slot reappears → ${visible ? "yes ✅" : "no ❌"}`);
  console.log(`     another patient can claim it → ${stolen.status === 201 ? "yes ✅" : `no ❌ (${stolen.status})`}`);
  console.log(`     rows left on that slot: ${rows.rows[0].n} (must be 1, not 2)\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
