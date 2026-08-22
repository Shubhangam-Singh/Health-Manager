import { NextResponse, after } from "next/server";
import { z } from "zod";
import { requireRole } from "@/server/lib/auth-guard";
import { toErrorResponse } from "@/server/lib/http";
import { visitNoteSchema } from "@/server/validation/visit.schema";
import { submitVisitNotes } from "@/server/services/visit.service";
import { generatePostVisitSummary } from "@/server/services/summary.service";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Ctx) {
  try {
    const user = await requireRole("DOCTOR");
    const { id } = await params;

    const body = await request.json().catch(() => null);
    const parsed = visitNoteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", code: "BAD_REQUEST", fields: z.flattenError(parsed.error).fieldErrors },
        { status: 400 },
      );
    }

    const note = await submitVisitNotes({
      appointmentId: id,
      doctorUserId: user.id,
      data: parsed.data,
    });

    // Generation runs after the response, exactly as at booking. The doctor is
    // not made to wait on a language model to record a consultation.
    after(() => generatePostVisitSummary(id));

    return NextResponse.json({ note }, { status: 201 });
  } catch (e) {
    return toErrorResponse(e);
  }
}
