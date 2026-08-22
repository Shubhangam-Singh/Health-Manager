import bcrypt from "bcryptjs";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/lib/prisma";
import { AppError } from "@/server/lib/errors";
import type { CreateDoctorInput, UpdateDoctorInput } from "@/server/validation/doctor.schema";

const BCRYPT_COST = 10;

/**
 * Creating a doctor writes to THREE tables. Either all of it happens or none
 * of it does -- a User with role DOCTOR but no DoctorProfile would be a broken
 * account that can log in and see nothing.
 *
 * Note bcrypt.hash runs BEFORE the transaction opens. Hashing takes ~100ms of
 * CPU, and holding a database connection open while doing unrelated work
 * starves the pool. Same principle as never doing network I/O in a transaction.
 */
export async function createDoctor(input: CreateDoctorInput) {
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);

  try {
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.email,
          passwordHash,
          name: input.name,
          phone: input.phone,
          role: "DOCTOR", // set by us, never by the caller
        },
        select: { id: true, email: true, name: true, phone: true },
      });

      const profile = await tx.doctorProfile.create({
        data: {
          userId: user.id,
          specialisation: input.specialisation,
          slotDurationMin: input.slotDurationMin,
          bio: input.bio,
          // Nested create: children written in the same transaction.
          workingHours: { create: input.workingHours },
        },
        include: { workingHours: { orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }] } },
      });

      return { ...profile, user };
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new AppError("CONFLICT", "That email is already registered", "email");
    }
    throw e;
  }
}

const doctorInclude = {
  user: { select: { id: true, email: true, name: true, phone: true } },
  workingHours: { orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }] },
} satisfies Prisma.DoctorProfileInclude;

/** Filtering happens in SQL, never by fetching everything and filtering in JS. */
export async function listDoctors(specialisation?: string) {
  return prisma.doctorProfile.findMany({
    where: specialisation
      ? { specialisation: { contains: specialisation, mode: "insensitive" } }
      : undefined,
    include: doctorInclude,
    orderBy: { createdAt: "desc" },
  });
}

export async function getDoctor(id: string) {
  const doctor = await prisma.doctorProfile.findUnique({
    where: { id },
    include: doctorInclude,
  });
  // Services throw domain errors; the route maps them to 404. The service
  // itself knows nothing about HTTP.
  if (!doctor) throw new AppError("NOT_FOUND", "Doctor not found");
  return doctor;
}

export async function updateDoctor(id: string, input: UpdateDoctorInput) {
  const { name, phone, ...profileFields } = input;

  return prisma.$transaction(async (tx) => {
    const existing = await tx.doctorProfile.findUnique({ where: { id } });
    if (!existing) throw new AppError("NOT_FOUND", "Doctor not found");

    // name and phone live on User; the rest live on DoctorProfile.
    if (name !== undefined || phone !== undefined) {
      await tx.user.update({ where: { id: existing.userId }, data: { name, phone } });
    }

    return tx.doctorProfile.update({
      where: { id },
      data: profileFields,
      include: doctorInclude,
    });
  });
}

/**
 * PUT semantics: the incoming array IS the doctor's week. Delete-then-insert
 * inside one transaction, so the schedule is never partially applied and
 * sending the same payload twice leaves identical state (idempotent).
 */
export async function replaceWorkingHours(
  doctorId: string,
  hours: { dayOfWeek: number; startMinute: number; endMinute: number }[],
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.doctorProfile.findUnique({ where: { id: doctorId } });
    if (!existing) throw new AppError("NOT_FOUND", "Doctor not found");

    await tx.workingHour.deleteMany({ where: { doctorId } });
    if (hours.length > 0) {
      await tx.workingHour.createMany({
        data: hours.map((h) => ({ ...h, doctorId })),
      });
    }

    return tx.workingHour.findMany({
      where: { doctorId },
      orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }],
    });
  });
}

/**
 * Deleting the DoctorProfile cascades to WorkingHour and LeaveDay, and
 * deleting the User cascades to the profile. We delete the User so no orphaned
 * login remains.
 *
 * NOTE for Step 14: once Appointment exists this becomes unsafe as written --
 * medical records must survive. That relation will use Restrict, and this
 * function will become a soft delete.
 */
export async function deleteDoctor(id: string) {
  const doctor = await prisma.doctorProfile.findUnique({ where: { id } });
  if (!doctor) throw new AppError("NOT_FOUND", "Doctor not found");

  await prisma.user.delete({ where: { id: doctor.userId } });
}
