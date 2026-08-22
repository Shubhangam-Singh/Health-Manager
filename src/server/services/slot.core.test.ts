import { test } from "node:test";
import assert from "node:assert/strict";
import { generateSlots, zonedWallTimeToUtc, zoneOffsetMinutes } from "./slot.core.ts";

const IST = "Asia/Kolkata";
// 2026-08-25 is a Tuesday. dayOfWeek 2.
const TUE = "2026-08-25";
// Well before that date, so nothing is filtered as "past".
const NOW = new Date("2026-08-01T00:00:00Z");

const nineToFive = [{ dayOfWeek: 2, startMinute: 540, endMinute: 1020 }];

test("India is UTC+5:30", () => {
  assert.equal(zoneOffsetMinutes(new Date("2026-08-25T00:00:00Z"), IST), 330);
});

test("09:00 IST is 03:30 UTC", () => {
  const utc = zonedWallTimeToUtc(2026, 8, 25, 540, IST);
  assert.equal(utc.toISOString(), "2026-08-25T03:30:00.000Z");
});

test("generates back-to-back 30 minute slots", () => {
  const slots = generateSlots({
    date: TUE, timezone: IST, slotDurationMin: 30,
    workingHours: nineToFive, leaveDates: [], busyStarts: [], now: NOW,
  });
  assert.equal(slots.length, 16); // 09:00-17:00 = 480 min / 30
  assert.equal(slots[0].startAt.toISOString(), "2026-08-25T03:30:00.000Z");
  assert.equal(slots[0].endAt.toISOString(), "2026-08-25T04:00:00.000Z");
  assert.equal(slots.at(-1)!.startAt.toISOString(), "2026-08-25T11:00:00.000Z");
});

test("returns nothing on a different weekday", () => {
  const slots = generateSlots({
    date: "2026-08-26", timezone: IST, slotDurationMin: 30, // Wednesday
    workingHours: nineToFive, leaveDates: [], busyStarts: [], now: NOW,
  });
  assert.equal(slots.length, 0);
});

test("a leave day removes the entire day", () => {
  const slots = generateSlots({
    date: TUE, timezone: IST, slotDurationMin: 30,
    workingHours: nineToFive, leaveDates: [TUE], busyStarts: [], now: NOW,
  });
  assert.equal(slots.length, 0);
});

test("booked and held start times are excluded", () => {
  const slots = generateSlots({
    date: TUE, timezone: IST, slotDurationMin: 30,
    workingHours: nineToFive, leaveDates: [],
    busyStarts: [
      new Date("2026-08-25T03:30:00.000Z"), // 09:00 IST
      new Date("2026-08-25T05:00:00.000Z"), // 10:30 IST
    ],
    now: NOW,
  });
  assert.equal(slots.length, 14);
  const times = slots.map((s) => s.startAt.toISOString());
  assert.ok(!times.includes("2026-08-25T03:30:00.000Z"));
  assert.ok(!times.includes("2026-08-25T05:00:00.000Z"));
});

test("slots already past are excluded", () => {
  const slots = generateSlots({
    date: TUE, timezone: IST, slotDurationMin: 30,
    workingHours: nineToFive, leaveDates: [], busyStarts: [],
    // 12:00 IST on the same day
    now: new Date("2026-08-25T06:30:00.000Z"),
  });
  assert.equal(slots[0].startAt.toISOString(), "2026-08-25T06:30:00.000Z");
  assert.equal(slots.length, 10); // 12:00 to 17:00
});

test("minimum notice pushes the first bookable slot further out", () => {
  const slots = generateSlots({
    date: TUE, timezone: IST, slotDurationMin: 30,
    workingHours: nineToFive, leaveDates: [], busyStarts: [],
    now: new Date("2026-08-25T06:30:00.000Z"), // 12:00 IST
    minNoticeMinutes: 60,
  });
  assert.equal(slots[0].startAt.toISOString(), "2026-08-25T07:30:00.000Z"); // 13:00
});

test("split shifts produce two blocks with a gap between them", () => {
  const slots = generateSlots({
    date: TUE, timezone: IST, slotDurationMin: 60,
    workingHours: [
      { dayOfWeek: 2, startMinute: 540, endMinute: 720 },  // 09:00-12:00
      { dayOfWeek: 2, startMinute: 1020, endMinute: 1200 }, // 17:00-20:00
    ],
    leaveDates: [], busyStarts: [], now: NOW,
  });
  assert.equal(slots.length, 6);
  assert.equal(slots[2].startAt.toISOString(), "2026-08-25T05:30:00.000Z"); // 11:00
  assert.equal(slots[3].startAt.toISOString(), "2026-08-25T11:30:00.000Z"); // 17:00
});

test("a slot that would overrun closing time is not offered", () => {
  const slots = generateSlots({
    date: TUE, timezone: IST, slotDurationMin: 45,
    workingHours: [{ dayOfWeek: 2, startMinute: 540, endMinute: 600 }], // 09:00-10:00
    leaveDates: [], busyStarts: [], now: NOW,
  });
  assert.equal(slots.length, 1); // 09:00-09:45 only; 09:45-10:30 would overrun
});

test("overlapping shifts do not produce duplicate slots", () => {
  const slots = generateSlots({
    date: TUE, timezone: IST, slotDurationMin: 60,
    workingHours: [
      { dayOfWeek: 2, startMinute: 540, endMinute: 720 },
      { dayOfWeek: 2, startMinute: 540, endMinute: 660 }, // overlaps entirely
    ],
    leaveDates: [], busyStarts: [], now: NOW,
  });
  assert.equal(slots.length, 3);
});

// ---------------------------------------------------------------------------
// Daylight saving. India has no DST, so these use New York to prove the
// two-pass conversion actually works. This is what justifies its existence.
// US DST in 2026: starts Sun 8 March, ends Sun 1 November.
// ---------------------------------------------------------------------------
const NY = "America/New_York";
const mondayNineToFive = [{ dayOfWeek: 1, startMinute: 540, endMinute: 1020 }];

test("same wall-clock 09:00 maps to different UTC instants across DST", () => {
  // Monday 6 July -- summer, EDT (UTC-4)
  const summer = generateSlots({
    date: "2026-07-06", timezone: NY, slotDurationMin: 60,
    workingHours: mondayNineToFive, leaveDates: [], busyStarts: [],
    now: new Date("2026-01-01T00:00:00Z"),
  });
  // Monday 2 November -- winter, EST (UTC-5)
  const winter = generateSlots({
    date: "2026-11-02", timezone: NY, slotDurationMin: 60,
    workingHours: mondayNineToFive, leaveDates: [], busyStarts: [],
    now: new Date("2026-01-01T00:00:00Z"),
  });

  assert.equal(summer[0].startAt.toISOString(), "2026-07-06T13:00:00.000Z");
  assert.equal(winter[0].startAt.toISOString(), "2026-11-02T14:00:00.000Z");

  // The doctor's schedule row is IDENTICAL for both. Only the offset moved.
  // A naive "subtract a fixed offset" conversion gets one of these wrong.
  assert.notEqual(
    summer[0].startAt.getUTCHours(),
    winter[0].startAt.getUTCHours(),
  );
});

test("Saturday before DST starts is still EST", () => {
  const utc = zonedWallTimeToUtc(2026, 3, 7, 540, NY);
  assert.equal(utc.toISOString(), "2026-03-07T14:00:00.000Z"); // UTC-5
});

test("Monday after DST starts is EDT", () => {
  const utc = zonedWallTimeToUtc(2026, 3, 9, 540, NY);
  assert.equal(utc.toISOString(), "2026-03-09T13:00:00.000Z"); // UTC-4
});

test("offset differs either side of the DST boundary", () => {
  const before = zoneOffsetMinutes(new Date("2026-03-07T12:00:00Z"), NY);
  const after = zoneOffsetMinutes(new Date("2026-03-09T12:00:00Z"), NY);
  assert.equal(before, -300); // EST
  assert.equal(after, -240);  // EDT
});

test("still correct in a zone with a half-hour offset", () => {
  // Nepal is UTC+5:45 -- catches code that assumes whole-hour offsets.
  const utc = zonedWallTimeToUtc(2026, 8, 25, 540, "Asia/Kathmandu");
  assert.equal(utc.toISOString(), "2026-08-25T03:15:00.000Z");
});
