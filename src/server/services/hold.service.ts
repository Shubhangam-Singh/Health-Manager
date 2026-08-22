import { prisma } from "@/server/lib/prisma";
import { AppError } from "@/server/lib/errors";
import { translateDbError, type DbErrorLike } from "@/server/lib/db-errors";
import { getAvailableSlots, isoDateInZone } from "./slot.service";

/** How long a patient gets to complete the symptom form. */
export const HOLD_MINUTES = 10;

/**
 * Take a hold on a slot.
 *
 * The whole thing runs in ONE transaction, because three things must be true
 * together or not at all:
 *   1. any EXPIRED hold on this slot is removed -- a dead row still occupies
 *      the unique key, so without this the slot is locked forever
 *   2. this patient's previous hold is released -- selecting a new slot means
 *      abandoning the old one, and it also stops one patient from holding
 *      every slot a doctor has
 *   3. the new hold is inserted, where the unique constraint decides the winner
 */
export async function createHold(input: {
  doctorId: string;
  patientId: string;
  startAt: Date;
}) {
  const doctor = await prisma.doctorProfile.findUnique({
    where: { id: input.doctorId },
    select: { slotDurationMin: true, timezone: true },
  });
  if (!doctor) throw new AppError("NOT_FOUND", "Doctor not found");

  // Is this a legitimate slot at all? Working hours, not a leave day, not in
  // the past. A unique constraint cannot answer any of that.
  const date = isoDateInZone(input.startAt, doctor.timezone);
  const available = await getAvailableSlots(input.doctorId, date);
  const isFree = available.some((s) => s.startAt.getTime() === input.startAt.getTime());

  // Already holding this exact slot? Return it rather than failing -- a
  // double-click must not be an error.
  if (!isFree) {
    const mine = await prisma.slotHold.findUnique({
      where: { doctorId_startAt: { doctorId: input.doctorId, startAt: input.startAt } },
    });
    if (mine && mine.patientId === input.patientId && mine.expiresAt > new Date()) {
      return mine;
    }
    throw new AppError("CONFLICT", "That slot is not available");
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + HOLD_MINUTES * 60000);

  try {
    return await prisma.$transaction(async (tx) => {
      // (1) lazy expiry -- reclaim this slot if a dead hold is sitting on it
      await tx.slotHold.deleteMany({
        where: { doctorId: input.doctorId, startAt: input.startAt, expiresAt: { lte: now } },
      });
      // (2) one live hold per patient
      await tx.slotHold.deleteMany({ where: { patientId: input.patientId } });
      // (3) the insert the unique constraint arbitrates
      return await tx.slotHold.create({
        data: {
          doctorId: input.doctorId,
          patientId: input.patientId,
          startAt: input.startAt,
          endAt: new Date(input.startAt.getTime() + doctor.slotDurationMin * 60000),
          expiresAt,
        },
      });
    });
  } catch (e) {
    const known = translateDbError(e as DbErrorLike);
    if (known) throw known;
    throw e;
  }
}

/** The patient's current live hold, if any. Expired rows never count. */
export async function getActiveHold(patientId: string) {
  return prisma.slotHold.findFirst({
    where: { patientId, expiresAt: { gt: new Date() } },
    include: {
      doctor: { select: { id: true, specialisation: true, timezone: true, user: { select: { name: true } } } },
    },
  });
}

/**
 * Release a hold explicitly -- the patient cancelled or navigated away.
 * Ownership is checked: releasing by id alone would let anyone free someone
 * else's hold and snipe the slot.
 */
export async function releaseHold(holdId: string, patientId: string) {
  const hold = await prisma.slotHold.findUnique({ where: { id: holdId } });
  if (!hold) throw new AppError("NOT_FOUND", "Hold not found");
  if (hold.patientId !== patientId) {
    // 404 rather than 403: telling a stranger "that hold exists but is not
    // yours" confirms someone is booking that slot.
    throw new AppError("NOT_FOUND", "Hold not found");
  }
  await prisma.slotHold.delete({ where: { id: holdId } });
}

/**
 * Sweep every expired hold. Called by the cron job in Step 37.
 *
 * Lazy expiry alone is not enough: it only reclaims a slot when someone tries
 * to hold THAT slot again. A slot nobody retries stays invisible in
 * availability until its row is removed. Belt and braces.
 */
export async function cleanupExpiredHolds(now: Date = new Date()) {
  const { count } = await prisma.slotHold.deleteMany({
    where: { expiresAt: { lte: now } },
  });
  return count;
}
