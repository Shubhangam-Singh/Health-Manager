/**
 * Proves the outbox retry machinery: a notification that cannot be delivered
 * backs off, retries, and is eventually marked FAILED rather than lost.
 * Run: node --env-file=.env scripts/notification-retry-test.ts
 */
import { Client } from "pg";

const BASE = process.env.RACE_BASE_URL ?? "http://localhost:3000";
const SECRET = process.env.CRON_SECRET!;

const run = async () => {
  const r = await fetch(`${BASE}/api/cron/notifications`, {
    headers: { Authorization: `Bearer ${SECRET}` },
  });
  return r.json() as Promise<{ considered: number; sent: number; retryScheduled: number; gaveUp: number }>;
};

async function main() {
  const db = new Client({ connectionString: process.env.DIRECT_URL });
  await db.connect();

  // A user whose email is empty: rendering succeeds, delivery cannot.
  await db.query(`DELETE FROM "Notification" WHERE "idempotencyKey" LIKE 'retry-test%'`);
  await db.query(`DELETE FROM "User" WHERE email = 'retry-test@example.invalid'`);
  await db.query(
    `INSERT INTO "User" (id,email,"passwordHash",name,role,"createdAt","updatedAt")
     VALUES ('retry_user','retry-test@example.invalid','x','Retry Tester','PATIENT',NOW(),NOW())`);
  await db.query(
    `INSERT INTO "Notification" (id,"userId",type,channel,payload,status,attempts,"idempotencyKey","createdAt","updatedAt")
     VALUES ('retry_n1','retry_user','BOOKING_CONFIRMATION','EMAIL','{"audience":"PATIENT"}','PENDING',0,'retry-test-1',NOW(),NOW())`);

  // Force a delivery failure by blanking the address the worker reads.
  await db.query(`UPDATE "User" SET email = '' WHERE id = 'retry_user'`);

  console.log("\n  attempt | result           | next retry in");
  console.log("  --------|------------------|---------------");

  for (let i = 1; i <= 6; i++) {
    // Make the row due immediately, so one script run can walk the whole
    // backoff schedule instead of waiting 7 hours.
    await db.query(`UPDATE "Notification" SET "nextRetryAt" = NOW() - INTERVAL '1 minute' WHERE id='retry_n1' AND status='PENDING'`);
    const rep = await run();
    const row = (await db.query(
      `SELECT status, attempts, "nextRetryAt", "lastError" FROM "Notification" WHERE id='retry_n1'`)).rows[0];
    const mins = row.nextRetryAt
      ? Math.round((new Date(row.nextRetryAt).getTime() - Date.now()) / 60000) + " min"
      : "—";
    console.log(`     ${i}    | ${String(row.status).padEnd(8)} a=${row.attempts}   | ${mins}`);
    if (rep.considered === 0 && row.status === "FAILED") break;
  }

  const final = (await db.query(`SELECT status, attempts, "lastError" FROM "Notification" WHERE id='retry_n1'`)).rows[0];
  console.log(`\n  final: ${final.status} after ${final.attempts} attempts`);
  console.log(`  lastError: ${final.lastError}`);
  console.log(`  ${final.status === "FAILED" ? "✅ visible to an admin, not silently lost" : "❌ expected FAILED"}\n`);

  await db.query(`DELETE FROM "Notification" WHERE "idempotencyKey" LIKE 'retry-test%'`);
  await db.query(`DELETE FROM "User" WHERE id='retry_user'`);
  await db.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
