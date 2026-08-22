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

/**
 * Queue "your appointment is tomorrow" reminders.
 *
 * Runs from the same cron as medication reminders. Looks for confirmed
 * appointments starting inside the window and queues one notification for the
 * patient and one for the doctor.
 *
 * The idempotencyKey is per (appointment, audience), so running this every
 * five minutes for a whole day queues each reminder EXACTLY ONCE -- the unique
 * index does the deduplication, not a "already reminded" flag we would have to
 * remember to set.
 */
export async function queueAppointmentReminders(
  now: Date = new Date(),
  hoursAhead = 24,
) {
  const windowEnd = new Date(now.getTime() + hoursAhead * 3600 * 1000);

  const due = await prisma.appointment.findMany({
    where: {
      status: "CONFIRMED",
      startAt: { gte: now, lte: windowEnd },
    },
    include: {
      patient: { select: { id: true, name: true } },
      doctor: {
        select: {
          timezone: true, specialisation: true,
          user: { select: { id: true, name: true } },
        },
      },
    },
    take: 200,
  });

  let queued = 0;

  for (const a of due) {
    const payload = {
      appointmentId: a.id,
      startAt: a.startAt.toISOString(),
      timezone: a.doctor.timezone,
      doctorName: a.doctor.user.name,
      specialisation: a.doctor.specialisation,
      patientName: a.patient.name,
    };

    await prisma.$transaction(async (tx) => {
      await queueNotification(tx, {
        userId: a.patientId,
        type: "APPOINTMENT_REMINDER",
        payload: { ...payload, audience: "PATIENT" },
        idempotencyKey: `appt-reminder:${a.id}:patient`,
      });
      await queueNotification(tx, {
        userId: a.doctor.user.id,
        type: "APPOINTMENT_REMINDER",
        payload: { ...payload, audience: "DOCTOR" },
        idempotencyKey: `appt-reminder:${a.id}:doctor`,
      });
    });
    queued += 2;
  }

  // `queued` counts attempts; duplicates are silently skipped by the unique
  // index, so a second run in the same window inserts nothing.
  return { appointments: due.length, attempted: queued };
}
