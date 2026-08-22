import { prisma } from "@/server/lib/prisma";
import { AppError } from "@/server/lib/errors";
import { translateDbError, type DbErrorLike } from "@/server/lib/db-errors";
import { computeDoseTimes, describeFrequency, type Frequency } from "./reminder.core";
import { zonedWallTimeToUtc } from "./slot.core";
import type { VisitNoteInput } from "@/server/validation/visit.schema";

/**
 * Doctor submits notes + prescription after the consultation.
 *
 * ONE transaction writes the note, the prescription, its items, the
 * materialised reminder rows, and a PENDING post-visit summary. The LLM call
 * happens afterwards, outside the transaction, exactly as at booking.
 *
 * Reminder rows are MATERIALISED rather than computed on demand so each dose
 * can be individually queued, retried, cancelled and audited -- and so a
 * later prescription edit cannot silently rewrite history.
 */
export async function submitVisitNotes(input: {
  appointmentId: string;
  doctorUserId: string;
  data: VisitNoteInput;
}) {
  const appointment = await prisma.appointment.findUnique({
    where: { id: input.appointmentId },
    include: { doctor: { select: { userId: true, timezone: true } } },
  });
  // Ownership: it must be THIS appointment's doctor, not merely a doctor.
  if (!appointment || appointment.doctor.userId !== input.doctorUserId) {
    throw new AppError("NOT_FOUND", "Appointment not found");
  }
  if (appointment.status === "CANCELLED") {
    throw new AppError("CONFLICT", "This appointment was cancelled");
  }

  const tz = appointment.doctor.timezone;
  const now = new Date();

  try {
    return await prisma.$transaction(async (tx) => {
      await tx.visitNote.upsert({
        where: { appointmentId: input.appointmentId },
        create: { appointmentId: input.appointmentId, ...input.data.note },
        update: input.data.note,
      });

      // Replace any previous prescription wholesale: cascade removes its items
      // and their reminders, so an edited prescription cannot leave orphaned
      // doses scheduled from the old version.
      await tx.prescription.deleteMany({ where: { appointmentId: input.appointmentId } });

      if (input.data.medications.length > 0) {
        const prescription = await tx.prescription.create({
          data: { appointmentId: input.appointmentId, notes: input.data.prescriptionNotes },
        });

        for (const med of input.data.medications) {
          const item = await tx.prescriptionItem.create({
            data: { prescriptionId: prescription.id, ...med },
          });

          const doses = computeDoseTimes({
            frequency: med.frequency as Frequency,
            durationDays: med.durationDays,
            startFrom: appointment.endAt,
            toUtc: (y, m, d, minutes) => zonedWallTimeToUtc(y, m, d, minutes, tz),
            now,
          });

          if (doses.length > 0) {
            await tx.medicationReminder.createMany({
              data: doses.map((scheduledAt) => ({ prescriptionItemId: item.id, scheduledAt })),
              skipDuplicates: true, // unique(prescriptionItemId, scheduledAt)
            });
          }
        }
      }

      await tx.appointment.update({
        where: { id: input.appointmentId },
        data: { status: "COMPLETED" },
      });

      await tx.postVisitSummary.upsert({
        where: { appointmentId: input.appointmentId },
        create: { appointmentId: input.appointmentId, status: "PENDING" },
        update: { status: "PENDING", lastError: null },
      });

      return tx.visitNote.findUniqueOrThrow({ where: { appointmentId: input.appointmentId } });
    });
  } catch (e) {
    if (e instanceof AppError) throw e;
    const known = translateDbError(e as DbErrorLike);
    if (known) throw known;
    throw e;
  }
}

/** Medication lines for the post-visit prompt, with schedules already computed. */
export async function medicationLines(appointmentId: string) {
  const p = await prisma.prescription.findUnique({
    where: { appointmentId },
    include: { items: true },
  });
  return (p?.items ?? []).map((i) => ({
    drugName: i.drugName,
    dose: i.dose,
    schedule: describeFrequency(i.frequency as Frequency),
    durationDays: i.durationDays,
    instructions: i.instructions,
  }));
}
