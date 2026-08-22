import { prisma } from "@/server/lib/prisma";
import { AppError } from "@/server/lib/errors";
import { getAvailableSlots, isoDateInZone } from "./slot.service";

/**
 * ============================================================================
 * STEP 14: THIS IS THE NAIVE, BROKEN IMPLEMENTATION. IT DOUBLE-BOOKS.
 * ============================================================================
 *
 * It reads perfectly well, which is exactly why the bug is dangerous:
 *
 *   1. work out which slots are free      <-- a READ
 *   2. check the requested one is among them
 *   3. insert the appointment             <-- a WRITE
 *
 * Between (1) and (3) there is a gap of real milliseconds. Another request can
 * run its own step (1) inside that gap, get the same answer, and insert too.
 * Nothing in this function can close that window, because the window is
 * BETWEEN the statements rather than inside any one of them.
 *
 * scripts/race-test.ts proves it. Step 15 fixes it in the database.
 */
export async function bookAppointmentNaive(input: {
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

  // ---- STEP 1: THE CHECK -------------------------------------------------
  const available = await getAvailableSlots(input.doctorId, date);
  const isFree = available.some((s) => s.startAt.getTime() === input.startAt.getTime());

  if (!isFree) {
    throw new AppError("CONFLICT", "That slot is not available");
  }

  // <<<<<<<<<<<<<<<<<< THE RACE WINDOW IS RIGHT HERE >>>>>>>>>>>>>>>>>>>>>>>
  // Everything above was a read. The database has already forgotten we asked.

  // ---- STEP 2: THE WRITE -------------------------------------------------
  return prisma.appointment.create({
    data: {
      doctorId: input.doctorId,
      patientId: input.patientId,
      startAt: input.startAt,
      endAt: new Date(input.startAt.getTime() + doctor.slotDurationMin * 60000),
      status: "CONFIRMED",
    },
    select: { id: true, doctorId: true, patientId: true, startAt: true, endAt: true, status: true },
  });
}
