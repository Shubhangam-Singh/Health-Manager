import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/server/lib/auth-guard";
import { toErrorResponse } from "@/server/lib/http";
import { createHold, getActiveHold, HOLD_MINUTES } from "@/server/services/hold.service";

const holdSchema = z.object({
  doctorId: z.string().min(1),
  startAt: z.iso.datetime("startAt must be an ISO 8601 UTC instant"),
});

// GET /api/holds -> the caller's own live hold, if any
export async function GET() {
  try {
    const user = await requireRole("PATIENT");
    return NextResponse.json({ hold: await getActiveHold(user.id) });
  } catch (e) {
    return toErrorResponse(e);
  }
}

// POST /api/holds -> reserve a slot for HOLD_MINUTES
export async function POST(request: Request) {
  try {
    const user = await requireRole("PATIENT");

    const body = await request.json().catch(() => null);
    const parsed = holdSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", code: "BAD_REQUEST", fields: z.flattenError(parsed.error).fieldErrors },
        { status: 400 },
      );
    }

    const hold = await createHold({
      doctorId: parsed.data.doctorId,
      patientId: user.id, // from the session, never the body
      startAt: new Date(parsed.data.startAt),
    });

    return NextResponse.json({ hold, holdMinutes: HOLD_MINUTES }, { status: 201 });
  } catch (e) {
    return toErrorResponse(e);
  }
}
