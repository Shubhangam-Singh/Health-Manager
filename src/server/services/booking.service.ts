import { prisma } from "@/server/lib/prisma";
import { AppError } from "@/server/lib/errors";
import { translateDbError, type DbErrorLike } from "@/server/lib/db-errors";
import { getAvailableSlots, isoDateInZone } from "./slot.service";
import type { SymptomFormInput } from "@/server/validation/symptom.schema";

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
    // Reaching here means we lost a race: our check said free, someone else
    // committed first. translateDbError identifies the constraint by NAME
    // (appointment_slot_unique) rather than assuming which one fired.
    const known = translateDbError(e as DbErrorLike);
    if (known) throw known;
    throw e; // unknown database error -> 500, never swallowed
  }
}

/**
 * Convert a hold into a confirmed appointment.
 *
 * ONE transaction does all of this, or none of it:
 *   1. verify the hold exists, belongs to this patient, and has not expired
 *   2. delete the hold
 *   3. create the appointment (the partial unique index still arbitrates)
 *   4. queue notification rows for BOTH patient and doctor
 *
 * ==========================================================================
 * GOLDEN RULE: NO NETWORK I/O INSIDE A TRANSACTION.
 * ==========================================================================
 * No email is sent here and no calendar API is called. Those are network
 * operations that can hang for 30 seconds or fail outright, and doing them
 * here would mean a mail server hiccup ROLLS BACK a valid appointment. It
 * would also hold a database connection open for the duration.
 *
 * Instead the transaction writes Notification rows with status PENDING. A cron
 * worker delivers them afterwards and retries on failure. The appointment is
 * committed either way.
 */
export async function bookFromHold(input: {
  holdId: string;
  patientId: string;
  /** Collected BEFORE confirming, written in the same transaction. */
  symptoms?: SymptomFormInput;
}) {
  try {
    return await prisma.$transaction(async (tx) => {
      const hold = await tx.slotHold.findUnique({
        where: { id: input.holdId },
        include: {
          doctor: {
            select: {
              id: true, slotDurationMin: true, timezone: true, specialisation: true,
              user: { select: { id: true, name: true, email: true } },
            },
          },
          patient: { select: { id: true, name: true, email: true } },
        },
      });

      // 404 rather than 403 for someone else's hold: see D17/Step 17.
      if (!hold || hold.patientId !== input.patientId) {
        throw new AppError("NOT_FOUND", "Hold not found");
      }
      if (hold.expiresAt <= new Date()) {
        // Distinct message: the patient did nothing wrong, their time ran out.
        throw new AppError("CONFLICT", "Your hold on this slot expired. Please pick a time again.");
      }

      await tx.slotHold.delete({ where: { id: hold.id } });

      const appointment = await tx.appointment.create({
        data: {
          doctorId: hold.doctorId,
          patientId: hold.patientId,
          startAt: hold.startAt,
          endAt: hold.endAt,
          status: "CONFIRMED",
        },
      });

      // The outbox. Nothing is sent; rows are written.
      const payload = {
        appointmentId: appointment.id,
        startAt: appointment.startAt.toISOString(),
        endAt: appointment.endAt.toISOString(),
        timezone: hold.doctor.timezone,
        doctorName: hold.doctor.user.name,
        specialisation: hold.doctor.specialisation,
        patientName: hold.patient.name,
      };

      // The symptom form is created here, not in a separate request, so an
      // appointment can never exist without the symptoms the doctor needs --
      // and an abandoned form can never be left orphaned.
      if (input.symptoms) {
        await tx.symptomForm.create({
          data: { appointmentId: appointment.id, ...input.symptoms },
        });
        // A PENDING summary row is created HERE, inside the transaction, so a
        // doctor can always distinguish "not generated yet" from "nobody ever
        // tried". The LLM call itself happens after the response is sent --
        // booking must never wait on a language model.
        await tx.preVisitSummary.create({
          data: { appointmentId: appointment.id, status: "PENDING" },
        });
      }

      await tx.notification.createMany({
        data: [
          {
            userId: hold.patientId,
            type: "BOOKING_CONFIRMATION",
            payload: { ...payload, audience: "PATIENT" },
            // Deterministic key: retrying this booking can never queue a
            // second copy of the same email.
            idempotencyKey: `booking-confirmed:${appointment.id}:patient`,
          },
          {
            userId: hold.doctor.user.id,
            type: "BOOKING_CONFIRMATION",
            payload: { ...payload, audience: "DOCTOR" },
            idempotencyKey: `booking-confirmed:${appointment.id}:doctor`,
          },
        ],
      });

      return appointment;
    });
  } catch (e) {
    if (e instanceof AppError) throw e;
    const known = translateDbError(e as DbErrorLike);
    if (known) throw known;
    throw e;
  }
}

/** A patient's own appointments. Scoped by patientId so one patient can never
 *  read another's — resource ownership enforced in the QUERY, which is the
 *  hardest place to get it wrong. */
export async function listPatientAppointments(patientId: string) {
  return prisma.appointment.findMany({
    where: { patientId },
    include: {
      doctor: {
        select: { specialisation: true, timezone: true, user: { select: { name: true } } },
      },
      symptomForm: { select: { rawText: true, severity: true, durationDays: true } },
    },
    orderBy: { startAt: "desc" },
  });
}
