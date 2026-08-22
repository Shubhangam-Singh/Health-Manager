import { prisma } from "@/server/lib/prisma";
import { AppError } from "@/server/lib/errors";
import { translateDbError, type DbErrorLike } from "@/server/lib/db-errors";
import { queueNotification } from "./notification.service";
import { getAvailableSlots } from "./slot.service";

export type AffectedAppointment = {
  id: string;
  startAt: Date;
  endAt: Date;
  patientName: string;
  patientEmail: string;
};

/**
 * DETECTION, separate from mutation.
 *
 * Marking a doctor on leave can cancel other people's appointments. That is
 * destructive and irreversible from the patient's point of view, so the admin
 * is shown exactly who is affected BEFORE anything is written, and must send
 * confirm: true to proceed.
 */
export async function findLeaveConflicts(doctorId: string, date: string) {
  const doctor = await prisma.doctorProfile.findUnique({
    where: { id: doctorId },
    select: { id: true, timezone: true, user: { select: { name: true } } },
  });
  if (!doctor) throw new AppError("NOT_FOUND", "Doctor not found");

  // The leave day is a calendar date in the CLINIC's zone. Convert it to the
  // UTC window that day actually occupies, or appointments near midnight are
  // missed or wrongly included.
  const { start, end } = dayWindowUtc(date, doctor.timezone);

  const affected = await prisma.appointment.findMany({
    where: {
      doctorId,
      startAt: { gte: start, lt: end },
      status: { in: ["PENDING", "CONFIRMED"] },
    },
    include: { patient: { select: { name: true, email: true } } },
    orderBy: { startAt: "asc" },
  });

  return {
    doctorName: doctor.user.name,
    timezone: doctor.timezone,
    date,
    affected: affected.map((a) => ({
      id: a.id, startAt: a.startAt, endAt: a.endAt,
      patientName: a.patient.name, patientEmail: a.patient.email,
    })) satisfies AffectedAppointment[],
  };
}

/** The UTC instants bounding a calendar date in a given zone. */
export function dayWindowUtc(date: string, timeZone: string): { start: Date; end: Date } {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  const offsetAt = (instant: Date) => {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone, hour12: false, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    const p: Record<string, string> = {};
    for (const { type, value } of dtf.formatToParts(instant)) p[type] = value;
    const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
    return (asUtc - (instant.getTime() - instant.getMilliseconds())) / 60000;
  };
  const off = offsetAt(new Date(guess));
  const start = new Date(guess - off * 60000);
  const end = new Date(start.getTime() + 24 * 3600 * 1000);
  return { start, end };
}

/**
 * Apply the leave. ONE transaction:
 *   1. create the LeaveDay
 *   2. cancel every affected appointment with reason DOCTOR_LEAVE
 *   3. queue a cancellation notification for each patient
 *   4. queue one for the doctor summarising what was cancelled
 *
 * No email is sent and no calendar API called here -- the golden rule. The
 * worker delivers afterwards, so a mail outage cannot roll back the leave.
 *
 * Alternative slots are computed BEFORE the transaction opens, because that
 * involves several reads and the transaction must stay short.
 */
export async function applyLeave(input: {
  doctorId: string;
  date: string;
  reason?: string;
  confirm: boolean;
}) {
  const conflicts = await findLeaveConflicts(input.doctorId, input.date);

  // Detection-only: report and change nothing.
  if (!input.confirm) {
    return { applied: false as const, ...conflicts };
  }

  // Suggest three alternatives per patient, computed outside the transaction.
  const alternatives = conflicts.affected.length
    ? await findAlternativeSlots(input.doctorId, input.date, 3)
    : [];

  try {
    await prisma.$transaction(async (tx) => {
      await tx.leaveDay.create({
        data: {
          doctorId: input.doctorId,
          date: new Date(`${input.date}T00:00:00.000Z`),
          reason: input.reason,
        },
      });

      for (const a of conflicts.affected) {
        await tx.appointment.update({
          where: { id: a.id },
          data: {
            status: "CANCELLED",
            cancelReason: "DOCTOR_LEAVE",
            cancelledAt: new Date(),
          },
        });

        const appt = await tx.appointment.findUnique({
          where: { id: a.id },
          select: { patientId: true, doctor: { select: { userId: true } } },
        });

        await queueNotification(tx, {
          userId: appt!.patientId,
          type: "DOCTOR_LEAVE_CANCELLATION",
          payload: {
            appointmentId: a.id,
            startAt: a.startAt.toISOString(),
            timezone: conflicts.timezone,
            doctorName: conflicts.doctorName,
            patientName: a.patientName,
            audience: "PATIENT",
            reason: input.reason ?? "The doctor is unavailable on this date",
            alternatives,
          },
          // Deterministic: re-running this can never send a second email.
          idempotencyKey: `leave-cancel:${a.id}`,
        });
      }

      if (conflicts.affected.length > 0) {
        const doctorUserId = (await tx.doctorProfile.findUnique({
          where: { id: input.doctorId }, select: { userId: true },
        }))!.userId;

        await queueNotification(tx, {
          userId: doctorUserId,
          type: "DOCTOR_LEAVE_CANCELLATION",
          payload: {
            timezone: conflicts.timezone,
            doctorName: conflicts.doctorName,
            audience: "DOCTOR",
            startAt: conflicts.affected[0].startAt.toISOString(),
            reason: `${conflicts.affected.length} appointment(s) on ${input.date} were cancelled because you are on leave.`,
          },
          idempotencyKey: `leave-doctor:${input.doctorId}:${input.date}`,
        });
      }
    });
  } catch (e) {
    const known = translateDbError(e as DbErrorLike);
    if (known) throw known;
    throw e;
  }

  return {
    applied: true as const,
    ...conflicts,
    cancelled: conflicts.affected.length,
    alternatives,
  };
}

/** The doctor's next available slots after the leave date, for the email. */
async function findAlternativeSlots(doctorId: string, fromDate: string, count: number) {
  const found: string[] = [];
  const [y, m, d] = fromDate.split("-").map(Number);
  for (let offset = 1; offset <= 14 && found.length < count; offset++) {
    const next = new Date(Date.UTC(y, m - 1, d + offset)).toISOString().slice(0, 10);
    const slots = await getAvailableSlots(doctorId, next);
    for (const s of slots) {
      if (found.length >= count) break;
      found.push(s.startAt.toISOString());
    }
  }
  return found;
}
