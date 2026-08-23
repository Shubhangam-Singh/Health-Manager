import { prisma } from "@/server/lib/prisma";

/**
 * A dashboard is a summary, not the source of truth. A transient connection
 * drop should degrade one tile to "—", not replace the whole page with an
 * error boundary. Anything that actually MUTATES data still throws loudly.
 */
async function safe<T>(work: Promise<T>, fallback: T): Promise<T> {
  try {
    return await work;
  } catch (e) {
    console.warn("[dashboard] a stat could not be loaded:", e instanceof Error ? e.message : e);
    return fallback;
  }
}

/** Counts for the patient overview. */
export async function patientOverview(patientId: string) {
  const now = new Date();
  const [upcoming, past, activeMeds, nextAppointment] = await Promise.all([
    safe(prisma.appointment.count({ where: { patientId, status: "CONFIRMED", startAt: { gte: now } } }), null),
    safe(prisma.appointment.count({ where: { patientId, status: { in: ["COMPLETED", "CANCELLED"] } } }), null),
    safe(prisma.medicationReminder.count({
      where: { status: "PENDING", prescriptionItem: { prescription: { appointment: { patientId } } } },
    }), null),
    safe(prisma.appointment.findFirst({
      where: { patientId, status: "CONFIRMED", startAt: { gte: now } },
      orderBy: { startAt: "asc" },
      include: { doctor: { select: { specialisation: true, timezone: true, user: { select: { name: true } } } } },
    }), null),
  ]);
  return { upcoming, past, activeMeds, nextAppointment };
}

/** Counts for the doctor overview. */
export async function doctorOverview(doctorUserId: string) {
  const profile = await prisma.doctorProfile.findUnique({
    where: { userId: doctorUserId },
    select: { id: true, timezone: true, specialisation: true, slotDurationMin: true },
  });
  if (!profile) return null;

  const now = new Date();
  const endOfToday = new Date(now.getTime() + 24 * 3600 * 1000);

  const [today, upcoming, needingNotes, highUrgency] = await Promise.all([
    safe(prisma.appointment.count({ where: { doctorId: profile.id, status: "CONFIRMED", startAt: { gte: now, lt: endOfToday } } }), null),
    safe(prisma.appointment.count({ where: { doctorId: profile.id, status: "CONFIRMED", startAt: { gte: now } } }), null),
    safe(prisma.appointment.count({ where: { doctorId: profile.id, status: "CONFIRMED", visitNote: null, startAt: { lt: now } } }), null),
    safe(prisma.appointment.count({ where: { doctorId: profile.id, status: "CONFIRMED", preVisitSummary: { urgency: "HIGH" } } }), null),
  ]);
  return { profile, today, upcoming, needingNotes, highUrgency };
}

/** Counts for the admin overview, including delivery health. */
export async function adminOverview() {
  const [doctors, patients, appointments, failedNotifications, pendingNotifications, failedSummaries] =
    await Promise.all([
      safe(prisma.doctorProfile.count(), null),
      safe(prisma.user.count({ where: { role: "PATIENT" } }), null),
      safe(prisma.appointment.count({ where: { status: "CONFIRMED" } }), null),
      safe(prisma.notification.count({ where: { status: "FAILED" } }), null),
      safe(prisma.notification.count({ where: { status: "PENDING" } }), null),
      safe(prisma.preVisitSummary.count({ where: { status: "FAILED" } }), null),
    ]);
  return { doctors, patients, appointments, failedNotifications, pendingNotifications, failedSummaries };
}
