import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/server/lib/auth-guard";
import { toErrorResponse } from "@/server/lib/http";
import { bookAppointment, bookFromHold } from "@/server/services/booking.service";

// Two ways to book, expressed as a union so the shape is explicit:
//   { holdId }              -- the normal flow: confirm a slot you hold
//   { doctorId, startAt }   -- direct booking, used by scripts/race-test.ts
const bookSchema = z.union([
  z.object({ holdId: z.string().min(1) }),
  z.object({
    doctorId: z.string().min(1),
    startAt: z.iso.datetime("startAt must be an ISO 8601 UTC instant"),
  }),
]);

export async function POST(request: Request) {
  try {
    // patientId always comes from the session, never the body.
    const user = await requireRole("PATIENT");

    const body = await request.json().catch(() => null);
    const parsed = bookSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Provide either holdId, or doctorId and startAt", code: "BAD_REQUEST" },
        { status: 400 },
      );
    }

    const appointment =
      "holdId" in parsed.data
        ? await bookFromHold({ holdId: parsed.data.holdId, patientId: user.id })
        : await bookAppointment({
            doctorId: parsed.data.doctorId,
            patientId: user.id,
            startAt: new Date(parsed.data.startAt),
          });

    return NextResponse.json({ appointment }, { status: 201 });
  } catch (e) {
    return toErrorResponse(e);
  }
}
