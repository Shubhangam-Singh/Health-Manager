import { google } from "googleapis";
import { prisma } from "@/server/lib/prisma";
import { clientForUser, isCalendarConfigured } from "@/server/lib/google-calendar";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Calendar sync as QUEUED WORK, exactly like notifications.
 *
 * A CalendarEvent row is written inside the booking transaction with status
 * PENDING. A worker creates the real Google event afterwards. That is what
 * guarantees the rule from the assignment: a Calendar failure must never fail
 * the booking. Google returning 500 leaves a PENDING row to retry, not a
 * patient without an appointment.
 */
const MAX_ATTEMPTS = 5;

/** Queue events for both parties, inside the caller's transaction. */
export async function queueCalendarEvents(
  tx: Prisma.TransactionClient,
  input: { appointmentId: string; patientUserId: string; doctorUserId: string },
) {
  await tx.calendarEvent.createMany({
    data: [
      { appointmentId: input.appointmentId, userId: input.patientUserId },
      { appointmentId: input.appointmentId, userId: input.doctorUserId },
    ],
    skipDuplicates: true, // unique(appointmentId, userId) makes this idempotent
  });
}

/**
 * Times changed. The event already exists in Google, so it is PATCHED rather
 * than deleted and recreated — recreating would drop the attendee's own
 * reminders and any notes they added to it.
 */
export async function queueCalendarUpdate(
  tx: Prisma.TransactionClient,
  appointmentId: string,
) {
  await tx.calendarEvent.updateMany({
    where: { appointmentId, status: { in: ["SYNCED", "UPDATE_PENDING"] } },
    data: { status: "UPDATE_PENDING", attempts: 0, lastError: null },
  });
  // Anything still PENDING has not been created yet, so it will simply be
  // created with the new times when the worker gets to it.
}

/** Mark a booking's events for deletion. The worker removes them from Google. */
export async function queueCalendarDeletion(
  tx: Prisma.TransactionClient,
  appointmentId: string,
) {
  await tx.calendarEvent.updateMany({
    where: { appointmentId, status: { in: ["PENDING", "SYNCED"] } },
    data: { status: "DELETE_PENDING" },
  });
}

export type CalendarReport = {
  configured: boolean;
  created: number; updated: number; deleted: number; skipped: number; failed: number;
};

/** One worker pass: create pending events and delete those marked for removal. */
export async function syncCalendarEvents(batchSize = 20): Promise<CalendarReport> {
  const report: CalendarReport = {
    configured: isCalendarConfigured(), created: 0, updated: 0, deleted: 0, skipped: 0, failed: 0,
  };
  if (!report.configured) return report; // no credentials: nothing to do, no error

  const rows = await prisma.calendarEvent.findMany({
    where: { status: { in: ["PENDING", "UPDATE_PENDING", "DELETE_PENDING"] }, attempts: { lt: MAX_ATTEMPTS } },
    take: batchSize,
    orderBy: { createdAt: "asc" },
    include: {
      appointment: {
        include: {
          patient: { select: { name: true, email: true } },
          doctor: { select: { timezone: true, specialisation: true, user: { select: { name: true, email: true } } } },
        },
      },
    },
  });

  for (const row of rows) {
    const auth = await clientForUser(row.userId);
    if (!auth) {
      // This person never connected a calendar. Not a failure -- most users
      // will not, and it must not be retried forever.
      report.skipped++;
      await prisma.calendarEvent.update({
        where: { id: row.id },
        data: { status: "FAILED", lastError: "user has not connected Google Calendar" },
      });
      continue;
    }

    const calendar = google.calendar({ version: "v3", auth });
    const a = row.appointment;

    try {
      if (row.status === "UPDATE_PENDING" && row.googleEventId) {
        // Patch only the times; everything else the attendee sees is preserved.
        await calendar.events.patch({
          calendarId: "primary",
          eventId: row.googleEventId,
          requestBody: {
            start: { dateTime: a.startAt.toISOString(), timeZone: a.doctor.timezone },
            end: { dateTime: a.endAt.toISOString(), timeZone: a.doctor.timezone },
          },
        });
        await prisma.calendarEvent.update({
          where: { id: row.id }, data: { status: "SYNCED", lastError: null },
        });
        report.updated++;
      } else if (row.status === "DELETE_PENDING") {
        if (row.googleEventId) {
          await calendar.events.delete({ calendarId: "primary", eventId: row.googleEventId });
        }
        await prisma.calendarEvent.update({
          where: { id: row.id }, data: { status: "DELETED", lastError: null },
        });
        report.deleted++;
      } else {
        const isDoctor = a.doctor.user.email === (await prisma.user.findUnique({
          where: { id: row.userId }, select: { email: true },
        }))?.email;

        const res = await calendar.events.insert({
          calendarId: "primary",
          requestBody: {
            summary: isDoctor
              ? `Consultation — ${a.patient.name}`
              : `Appointment — ${a.doctor.user.name} (${a.doctor.specialisation})`,
            description: isDoctor
              ? `Patient: ${a.patient.name}\nSymptom summary is on your dashboard.`
              : `Doctor: ${a.doctor.user.name}\nSpecialisation: ${a.doctor.specialisation}`,
            start: { dateTime: a.startAt.toISOString(), timeZone: a.doctor.timezone },
            end: { dateTime: a.endAt.toISOString(), timeZone: a.doctor.timezone },
            reminders: { useDefault: true },
          },
        });

        await prisma.calendarEvent.update({
          where: { id: row.id },
          data: { googleEventId: res.data.id ?? null, status: "SYNCED", lastError: null },
        });
        report.created++;
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const attempts = row.attempts + 1;
      await prisma.calendarEvent.update({
        where: { id: row.id },
        data: {
          attempts,
          lastError: message.slice(0, 500),
          // Give up eventually, and stay visible rather than retrying for ever.
          status: attempts >= MAX_ATTEMPTS ? "FAILED" : row.status,
        },
      });
      report.failed++;
    }
  }

  return report;
}
