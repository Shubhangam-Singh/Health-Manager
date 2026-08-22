import { NextResponse, after } from "next/server";
import { z } from "zod";
import { requireRole } from "@/server/lib/auth-guard";
import { toErrorResponse } from "@/server/lib/http";
import { bookAppointment, bookFromHold } from "@/server/services/booking.service";
import { symptomFormSchema } from "@/server/validation/symptom.schema";
import { generatePreVisitSummary } from "@/server/services/summary.service";

// Two ways to book, expressed as a union so the shape is explicit:
//   { holdId }              -- the normal flow: confirm a slot you hold
//   { doctorId, startAt }   -- direct booking, used by scripts/race-test.ts
const bookSchema = z.union([
  z.object({ holdId: z.string().min(1), symptoms: symptomFormSchema.optional() }),
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
        ? await bookFromHold({
            holdId: parsed.data.holdId,
            patientId: user.id,
            symptoms: parsed.data.symptoms,
          })
        : await bookAppointment({
            doctorId: parsed.data.doctorId,
            patientId: user.id,
            startAt: new Date(parsed.data.startAt),
          });

    // after() runs once the response has been flushed to the client. The
    // patient sees "confirmed" immediately; the LLM call happens behind it.
    // Booking NEVER waits on the model, and a model failure cannot affect
    // this response. generatePreVisitSummary never throws.
    if ("holdId" in parsed.data && parsed.data.symptoms) {
      after(() => generatePreVisitSummary(appointment.id));
    }

    return NextResponse.json({ appointment }, { status: 201 });
  } catch (e) {
    return toErrorResponse(e);
  }
}
