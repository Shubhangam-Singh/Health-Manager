import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/server/lib/auth-guard";
import { toErrorResponse } from "@/server/lib/http";
import { getAvailableSlots } from "@/server/services/slot.service";

const querySchema = z.object({
  // Shape enforced here so a malformed date is a 400, not a crash downstream.
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
});

type Ctx = { params: Promise<{ id: string }> };

// GET /api/doctors/:id/slots?date=2026-08-29
export async function GET(request: Request, { params }: Ctx) {
  try {
    await requireAuth();
    const { id } = await params;

    const parsed = querySchema.safeParse({
      date: new URL(request.url).searchParams.get("date"),
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query", fields: z.flattenError(parsed.error).fieldErrors },
        { status: 400 },
      );
    }

    const slots = await getAvailableSlots(id, parsed.data.date);
    return NextResponse.json({
      date: parsed.data.date,
      slots: slots.map((s) => ({
        startAt: s.startAt.toISOString(),
        endAt: s.endAt.toISOString(),
      })),
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}
