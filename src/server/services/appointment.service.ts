import { prisma } from "@/server/lib/prisma";
import { AppError } from "@/server/lib/errors";

/**
 * A doctor's own appointments.
 *
 * OWNERSHIP IS IN THE QUERY. The caller passes their User id; we resolve it to
 * their DoctorProfile and filter on it. There is no code path here that could
 * return another doctor's appointment, because the WHERE clause cannot express
 * one. Compare that with fetching by id and checking afterwards -- which works
 * until someone adds an early return above the check.
 */
export async function listDoctorAppointments(doctorUserId: string) {
  const profile = await prisma.doctorProfile.findUnique({
    where: { userId: doctorUserId },
    select: { id: true, timezone: true },
  });
  if (!profile) throw new AppError("NOT_FOUND", "No doctor profile for this account");

  const appointments = await prisma.appointment.findMany({
    where: { doctorId: profile.id },
    include: {
      patient: { select: { name: true, email: true, phone: true } },
      symptomForm: { select: { severity: true, durationDays: true } },
      preVisitSummary: { select: { status: true, urgency: true, chiefComplaint: true } },
    },
    orderBy: { startAt: "asc" },
  });

  return { timezone: profile.timezone, appointments };
}

/** One appointment, scoped to the doctor who owns it. */
export async function getDoctorAppointment(doctorUserId: string, appointmentId: string) {
  const profile = await prisma.doctorProfile.findUnique({
    where: { userId: doctorUserId },
    select: { id: true, timezone: true },
  });
  if (!profile) throw new AppError("NOT_FOUND", "No doctor profile for this account");

  const appointment = await prisma.appointment.findFirst({
    // Both conditions in one WHERE: an appointment belonging to someone else
    // simply does not match, so it is indistinguishable from one that does not
    // exist -- which is also the right thing to tell the caller.
    where: { id: appointmentId, doctorId: profile.id },
    include: {
      patient: { select: { name: true, email: true, phone: true } },
      symptomForm: true,
      preVisitSummary: true,
      visitNote: true,
      prescription: { include: { items: true } },
    },
  });
  if (!appointment) throw new AppError("NOT_FOUND", "Appointment not found");

  return { timezone: profile.timezone, appointment };
}
