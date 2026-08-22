import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/lib/prisma";
import { AppError } from "@/server/lib/errors";
import { getAvailableSlots, isoDateInZone } from "./slot.service";

/**
 * Booking, with the guarantee where it belongs: in the database.
 *
 * There are still two steps, and that is fine, because their JOBS are now
 * different:
 *
 *   THE CHECK  is for the 99.9% case and for legitimacy. It answers "is this
 *              even a real slot?" -- inside working hours, not a leave day,
 *              not in the past. A unique index cannot answer any of that.
 *              It also produces a helpful message instead of a raw DB error.
 *
 *   THE INDEX  is the guarantee. It answers "did anyone else get here first?"
 *              and it cannot be raced, because Postgres serialises inserts on
 *              the key. The check being stale no longer matters.
 *
 * The bug in step 14 was not "we checked first". It was "checking was ALL we
 * did". A check is a courtesy; a constraint is a promise.
 */
export async function bookAppointment(input: {
  doctorId: string;
  patientId: string;
  startAt: Date;
}) {
  const doctor = await prisma.doctorProfile.findUnique({
    where: { id: input.doctorId },
    select: { slotDurationMin: true, timezone: true },
  });
  if (!doctor) throw new AppError("NOT_FOUND", "Doctor not found");

  const date = isoDateInZone(input.startAt, doctor.timezone);
  const available = await getAvailableSlots(input.doctorId, date);
  const isFree = available.some((s) => s.startAt.getTime() === input.startAt.getTime());

  if (!isFree) {
    throw new AppError("CONFLICT", "That slot is not available");
  }

  try {
    return await prisma.appointment.create({
      data: {
        doctorId: input.doctorId,
        patientId: input.patientId,
        startAt: input.startAt,
        endAt: new Date(input.startAt.getTime() + doctor.slotDurationMin * 60000),
        status: "CONFIRMED",
      },
      select: { id: true, doctorId: true, patientId: true, startAt: true, endAt: true, status: true },
    });
  } catch (e) {
    // P2002 = unique constraint violation (Postgres SQLSTATE 23505).
    // Reaching here means we lost a race: our check said free, someone else
    // committed first. The database decided, not us.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new AppError("CONFLICT", "That slot was just taken. Please pick another time.");
    }
    throw e;
  }
}
