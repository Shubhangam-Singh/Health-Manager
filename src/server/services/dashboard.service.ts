import { prisma } from "@/server/lib/prisma";

/** Counts for the patient overview. */
export async function patientOverview(patientId: string) {
  const now = new Date();
  const [upcoming, past, activeMeds, nextAppointment] = await Promise.all([
    prisma.appointment.count({ where: { patientId, status: "CONFIRMED", startAt: { gte: now } } }),
    prisma.appointment.count({ where: { patientId, status: { in: ["COMPLETED", "CANCELLED"] } } }),
    prisma.medicationReminder.count({
      where: { status: "PENDING", prescriptionItem: { prescription: { appointment: { patientId } } } },
    }),
    prisma.appointment.findFirst({
      where: { patientId, status: "CONFIRMED", startAt: { gte: now } },
      orderBy: { startAt: "asc" },
      include: { doctor: { select: { specialisation: true, timezone: true, user: { select: { name: true } } } } },
    }),
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
    prisma.appointment.count({ where: { doctorId: profile.id, status: "CONFIRMED", startAt: { gte: now, lt: endOfToday } } }),
    prisma.appointment.count({ where: { doctorId: profile.id, status: "CONFIRMED", startAt: { gte: now } } }),
    prisma.appointment.count({ where: { doctorId: profile.id, status: "CONFIRMED", visitNote: null, startAt: { lt: now } } }),
    prisma.appointment.count({ where: { doctorId: profile.id, status: "CONFIRMED", preVisitSummary: { urgency: "HIGH" } } }),
  ]);
  return { profile, today, upcoming, needingNotes, highUrgency };
}

/** Counts for the admin overview, including delivery health. */
export async function adminOverview() {
  const [doctors, patients, appointments, failedNotifications, pendingNotifications, failedSummaries] =
    await Promise.all([
      prisma.doctorProfile.count(),
      prisma.user.count({ where: { role: "PATIENT" } }),
      prisma.appointment.count({ where: { status: "CONFIRMED" } }),
      prisma.notification.count({ where: { status: "FAILED" } }),
      prisma.notification.count({ where: { status: "PENDING" } }),
      prisma.preVisitSummary.count({ where: { status: "FAILED" } }),
    ]);
  return { doctors, patients, appointments, failedNotifications, pendingNotifications, failedSummaries };
}
