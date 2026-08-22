import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/server/lib/auth-guard";
import { toErrorResponse } from "@/server/lib/http";
import { bookAppointmentNaive } from "@/server/services/booking.service";

const bookSchema = z.object({
  doctorId: z.string().min(1),
  // ISO 8601 instant, e.g. "2026-08-29T03:30:00.000Z"
  startAt: z.iso.datetime("startAt must be an ISO 8601 UTC instant"),
});

export async function POST(request: Request) {
  try {
    // Only a patient books, and they book as THEMSELVES -- patientId comes
    // from the session, never from the request body. Accepting it from the
    // body would let anyone book appointments in someone else's name.
    const user = await requireRole("PATIENT");

    const body = await request.json().catch(() => null);
    const parsed = bookSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", fields: z.flattenError(parsed.error).fieldErrors },
        { status: 400 },
      );
    }

    const appointment = await bookAppointmentNaive({
      doctorId: parsed.data.doctorId,
      patientId: user.id,
      startAt: new Date(parsed.data.startAt),
    });

    return NextResponse.json({ appointment }, { status: 201 });
  } catch (e) {
    return toErrorResponse(e);
  }
}
