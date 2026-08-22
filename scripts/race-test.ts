/**
 * Fires N simultaneous booking requests at the SAME slot and reports how many
 * succeeded. Correct behaviour is exactly one 201 and N-1 rejections.
 *
 * Run:  node --env-file=.env scripts/race-test.ts
 *
 * Deliberately uses plain fetch and pg only -- no imports from src/ -- so it
 * runs under plain node with no bundler and no path aliases.
 */
import { Client } from "pg";

const BASE = process.env.RACE_BASE_URL ?? "http://localhost:3000";
const N = Number(process.env.RACE_N ?? 10);
const PASSWORD = "racetestpassword";

type Cookie = string;

async function csrf(): Promise<{ token: string; cookie: Cookie }> {
  const res = await fetch(`${BASE}/api/auth/csrf`);
  const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  const { csrfToken } = (await res.json()) as { csrfToken: string };
  return { token: csrfToken, cookie };
}

async function register(email: string) {
  await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, name: "Race Tester" }),
  }); // 409 on re-run is fine
}

async function login(email: string): Promise<Cookie> {
  const { token, cookie } = await csrf();
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookie },
    body: new URLSearchParams({ csrfToken: token, email, password: PASSWORD }),
  });
  const session = (res.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(";")[0])
    .filter((c) => c.includes("authjs.session-token"));
  if (session.length === 0) throw new Error(`login failed for ${email}`);
  return [cookie, ...session].join("; ");
}

async function pickTarget(cookie: Cookie) {
  const docRes = await fetch(`${BASE}/api/doctors`, { headers: { Cookie: cookie } });
  const { doctors } = (await docRes.json()) as { doctors: { id: string; user: { name: string } }[] };

  // Walk forward day by day until a doctor has a free slot.
  for (let offset = 1; offset <= 14; offset++) {
    const date = new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
    for (const d of doctors) {
      const res = await fetch(`${BASE}/api/doctors/${d.id}/slots?date=${date}`, {
        headers: { Cookie: cookie },
      });
      const { slots } = (await res.json()) as { slots: { startAt: string }[] };
      if (slots?.length) {
        return { doctorId: d.id, doctorName: d.user.name, date, startAt: slots[0].startAt };
      }
    }
  }
  throw new Error("no free slot found in the next 14 days");
}

async function main() {
  console.log(`\n=== RACE TEST: ${N} simultaneous bookings, same slot ===\n`);

  const emails = Array.from({ length: N }, (_, i) => `racer${i}@test.com`);
  await Promise.all(emails.map(register));
  const cookies = await Promise.all(emails.map(login));
  console.log(`  logged in ${cookies.length} distinct patients`);

  const target = await pickTarget(cookies[0]);
  console.log(`  target: ${target.doctorName} on ${target.date} at ${target.startAt}\n`);

  // THE RACE. All N requests are dispatched before any of them completes.
  const started = Date.now();
  const results = await Promise.all(
    cookies.map((cookie) =>
      fetch(`${BASE}/api/appointments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ doctorId: target.doctorId, startAt: target.startAt }),
      }).then(async (r) => ({ status: r.status, body: await r.text() })),
    ),
  );
  const elapsed = Date.now() - started;

  const tally = new Map<number, number>();
  for (const r of results) tally.set(r.status, (tally.get(r.status) ?? 0) + 1);
  console.log(`  responses in ${elapsed}ms:`);
  for (const [status, count] of [...tally].sort()) {
    console.log(`    HTTP ${status} × ${count}`);
  }

  // The database is the source of truth, not the HTTP responses.
  const db = new Client({ connectionString: process.env.DIRECT_URL });
  await db.connect();
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS n FROM "Appointment"
      WHERE "doctorId" = $1 AND "startAt" = $2
        AND status IN ('PENDING','CONFIRMED')`,
    [target.doctorId, target.startAt],
  );
  await db.end();

  const n = rows[0].n;
  console.log(`\n  rows in the database for that slot: ${n}`);
  console.log(n === 1 ? "  ✅ PASS — exactly one booking won.\n"
                      : `  ❌ FAIL — ${n} patients booked the same slot.\n`);
  process.exit(n === 1 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
