import { test } from "node:test";
import assert from "node:assert/strict";
import { computeDoseTimes, describeFrequency } from "./reminder.core.ts";

// Fake IST (+5:30) converter so the tests stay pure and deterministic.
const toUtc = (y: number, m: number, d: number, minutes: number) =>
  new Date(Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60) - 330 * 60000);

const START = new Date("2026-09-01T04:00:00Z"); // 09:30 IST
const LONG_AGO = new Date("2026-01-01T00:00:00Z");

test("TWICE_DAILY for 5 days gives 10 doses", () => {
  const doses = computeDoseTimes({ frequency: "TWICE_DAILY", durationDays: 5, startFrom: START, toUtc, now: LONG_AGO });
  assert.equal(doses.length, 10);
});

test("THRICE_DAILY for 3 days gives 9 doses", () => {
  assert.equal(computeDoseTimes({ frequency: "THRICE_DAILY", durationDays: 3, startFrom: START, toUtc, now: LONG_AGO }).length, 9);
});

test("EVERY_OTHER_DAY for 10 days gives 5 doses", () => {
  assert.equal(computeDoseTimes({ frequency: "EVERY_OTHER_DAY", durationDays: 10, startFrom: START, toUtc, now: LONG_AGO }).length, 5);
});

test("WEEKLY for 28 days gives 4 doses", () => {
  assert.equal(computeDoseTimes({ frequency: "WEEKLY", durationDays: 28, startFrom: START, toUtc, now: LONG_AGO }).length, 4);
});

test("AS_NEEDED produces no reminders at all", () => {
  // Inventing a schedule would tell a patient to take medication they were
  // told to take only when symptoms appear.
  assert.equal(computeDoseTimes({ frequency: "AS_NEEDED", durationDays: 30, startFrom: START, toUtc, now: LONG_AGO }).length, 0);
});

test("zero or negative duration produces nothing", () => {
  assert.equal(computeDoseTimes({ frequency: "ONCE_DAILY", durationDays: 0, startFrom: START, toUtc, now: LONG_AGO }).length, 0);
  assert.equal(computeDoseTimes({ frequency: "ONCE_DAILY", durationDays: -3, startFrom: START, toUtc, now: LONG_AGO }).length, 0);
});

test("doses already past are skipped", () => {
  // Consultation ends 14:00 IST, so that day's 09:00 dose is gone.
  const now = new Date("2026-09-01T08:30:00Z"); // 14:00 IST
  const doses = computeDoseTimes({ frequency: "TWICE_DAILY", durationDays: 2, startFrom: START, toUtc, now });
  assert.equal(doses.length, 3); // day1 21:00, day2 09:00, day2 21:00
  assert.ok(doses.every((d) => d.getTime() > now.getTime()));
});

test("doses come back in chronological order", () => {
  const doses = computeDoseTimes({ frequency: "FOUR_TIMES_DAILY", durationDays: 3, startFrom: START, toUtc, now: LONG_AGO });
  assert.equal(doses.length, 12);
  for (let i = 1; i < doses.length; i++) {
    assert.ok(doses[i].getTime() > doses[i - 1].getTime());
  }
});

test("first TWICE_DAILY dose is 09:00 IST = 03:30 UTC", () => {
  const doses = computeDoseTimes({ frequency: "TWICE_DAILY", durationDays: 1, startFrom: START, toUtc, now: LONG_AGO });
  assert.equal(doses[0].toISOString(), "2026-09-01T03:30:00.000Z");
  assert.equal(doses[1].toISOString(), "2026-09-01T15:30:00.000Z");
});

test("every frequency has a human description", () => {
  for (const f of ["ONCE_DAILY","TWICE_DAILY","THRICE_DAILY","FOUR_TIMES_DAILY","EVERY_OTHER_DAY","WEEKLY","AS_NEEDED"] as const) {
    assert.ok(describeFrequency(f).length > 0);
  }
});
