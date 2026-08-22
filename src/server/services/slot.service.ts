import { prisma } from "@/server/lib/prisma";
import { AppError } from "@/server/lib/errors";
import { generateSlots, type Slot } from "./slot.core";

// ---------------------------------------------------------------------------
// The IMPURE shell. Everything above is pure and unit-tested; this part talks
// to the database and then hands plain data to the pure core. The pattern is
// "functional core, imperative shell": all the logic worth testing lives in a
// function that needs no database, and the database work stays trivial enough
// that it does not need testing.
// ---------------------------------------------------------------------------

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

  return generateSlots({
    date,
    timezone: doctor.timezone,
    slotDurationMin: doctor.slotDurationMin,
    workingHours: doctor.workingHours,
    leaveDates: doctor.leaveDays.map((l) => isoDateInZone(l.date, "UTC")),
    // TODO(step 14/17): confirmed appointments and unexpired slot holds.
    // Those tables do not exist yet, so nothing is busy.
    busyStarts: [],
    now,
    minNoticeMinutes: 30,
  });
}
