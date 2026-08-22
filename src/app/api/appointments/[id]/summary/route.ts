import { NextResponse } from "next/server";
import { requireAuth } from "@/server/lib/auth-guard";
import { toErrorResponse } from "@/server/lib/http";
import { AppError } from "@/server/lib/errors";
import { prisma } from "@/server/lib/prisma";
import { generatePreVisitSummary } from "@/server/services/summary.service";

type Ctx = { params: Promise<{ id: string }> };

/** POST -> regenerate. Backs the "Regenerate" button a doctor sees on FAILED. */
export async function POST(_request: Request, { params }: Ctx) {
  try {
    const user = await requireAuth();
    const { id } = await params;

    const appt = await prisma.appointment.findUnique({
      where: { id },
      select: { patientId: true, doctor: { select: { userId: true } } },
    });
    if (!appt) throw new AppError("NOT_FOUND", "Appointment not found");

    // RESOURCE OWNERSHIP, not just role. Being a doctor is not enough -- it
    // must be THIS appointment's doctor, or the patient themselves.
    const allowed =
      appt.doctor.userId === user.id ||
      appt.patientId === user.id ||
      user.role === "ADMIN";
    if (!allowed) throw new AppError("NOT_FOUND", "Appointment not found");

    await generatePreVisitSummary(id);
    const summary = await prisma.preVisitSummary.findUnique({ where: { appointmentId: id } });
    return NextResponse.json({ summary });
  } catch (e) {
    return toErrorResponse(e);
  }
}
