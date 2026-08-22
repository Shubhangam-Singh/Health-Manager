import { prisma } from "@/server/lib/prisma";
import { queueNotification } from "./notification.service";
import { describeFrequency, type Frequency } from "./reminder.core";

/**
 * Converts DUE medication reminders into Notification rows, then lets the
 * existing outbox worker deliver them.
 *
 * REUSE OVER REBUILD: retries, backoff, idempotency and failure visibility
 * already exist in the notification pipeline. A second delivery mechanism
 * would be a second thing to get wrong.
 */
export async function dispatchDueReminders(now: Date = new Date(), batchSize = 100) {
  const due = await prisma.medicationReminder.findMany({
    where: { status: "PENDING", scheduledAt: { lte: now } },
    orderBy: { scheduledAt: "asc" },
    take: batchSize,
    include: {
      prescriptionItem: {
        include: {
          prescription: {
            include: { appointment: { select: { patientId: true } } },
          },
        },
      },
    },
  });

  let queued = 0;

  for (const r of due) {
    const item = r.prescriptionItem;
    await prisma.$transaction(async (tx) => {
      await queueNotification(tx, {
        userId: item.prescription.appointment.patientId,
        type: "MEDICATION_REMINDER",
        payload: {
          drugName: item.drugName,
          dose: item.dose,
          instructions: item.instructions ?? describeFrequency(item.frequency as Frequency),
        },
        // One notification per dose, ever, even if this job runs twice.
        idempotencyKey: `med-reminder:${r.id}`,
      });
      await tx.medicationReminder.update({
        where: { id: r.id },
        data: { status: "SENT", sentAt: now },
      });
    });
    queued++;
  }

  return { due: due.length, queued };
}

/** Cancel outstanding reminders, e.g. when an appointment is cancelled. */
export async function cancelRemindersForAppointment(appointmentId: string) {
  const { count } = await prisma.medicationReminder.updateMany({
    where: {
      status: "PENDING",
      prescriptionItem: { prescription: { appointmentId } },
    },
    data: { status: "CANCELLED" },
  });
  return count;
}
