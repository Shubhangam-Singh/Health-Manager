import { prisma } from "@/server/lib/prisma";
import { AppError } from "@/server/lib/errors";
import { generateSlots, zonedWallTimeToUtc, type Slot } from "./slot.core";

// ---------------------------------------------------------------------------
// The IMPURE shell. Everything above is pure and unit-tested; this part talks
// to the database and then hands plain data to the pure core. The pattern is
// "functional core, imperative shell": all the logic worth testing lives in a
// function that needs no database, and the database work stays trivial enough
// that it does not need testing.
// ---------------------------------------------------------------------------

/** Splits "YYYY-MM-DD" into [year, month, day]. */
function dateParts(date: string): [number, number, number] {
  const [y, m, d] = date.split("-").map(Number);
  return [y, m, d];
}

/** Formats an instant as "YYYY-MM-DD" as seen in the given timezone. */
export function isoDateInZone(instant: Date, timeZone: string): string {
  // en-CA renders as YYYY-MM-DD, which is exactly the shape we want.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(instant);
}

export async function getAvailableSlots(
  doctorId: string,
  date: string,
  now: Date = new Date(),
): Promise<Slot[]> {
  const doctor = await prisma.doctorProfile.findUnique({
    where: { id: doctorId },
    include: { workingHours: true, leaveDays: true },
  });
  if (!doctor) throw new AppError("NOT_FOUND", "Doctor not found");

  // Only the day in question is fetched, bounded by a range on startAt so the
  // (doctorId, startAt) index is used. Fetching a doctor's whole history to
  // find one day's bookings would get slower with every appointment ever made.
  const dayStart = zonedWallTimeToUtc(...dateParts(date), 0, doctor.timezone);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const booked = await prisma.appointment.findMany({
    where: {
      doctorId,
      startAt: { gte: dayStart, lt: dayEnd },
      // A cancelled appointment must NOT block its slot -- that slot is free
      // again. This is the same reasoning that makes the Step 15 index partial.
      status: { in: ["PENDING", "CONFIRMED"] },
    },
    select: { startAt: true },
  });

  const held = await prisma.slotHold.findMany({
    where: {
      doctorId,
      startAt: { gte: dayStart, lt: dayEnd },
      expiresAt: { gt: now },
    },
    select: { startAt: true },
  });

  return generateSlots({
    date,
    timezone: doctor.timezone,
    slotDurationMin: doctor.slotDurationMin,
    workingHours: doctor.workingHours,
    leaveDates: doctor.leaveDays.map((l) => isoDateInZone(l.date, "UTC")),
    // Live holds block a slot exactly as a booking does. Expired ones are
    // filtered out here rather than deleted -- a read path should not write.
    // Deletion happens in createHold and in the cleanup cron.
    busyStarts: [...booked.map((b) => b.startAt), ...held.map((h) => h.startAt)],
    now,
    minNoticeMinutes: 30,
  });
}
