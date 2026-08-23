import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/server/lib/auth-guard";
import { toErrorResponse } from "@/server/lib/http";
import { rescheduleAppointment } from "@/server/services/booking.service";

const schema = z.object({
  startAt: z.iso.datetime("startAt must be an ISO 8601 UTC instant"),
});

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Ctx) {
  try {
    const user = await requireAuth();
    const { id } = await params;

    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", code: "BAD_REQUEST", fields: z.flattenError(parsed.error).fieldErrors },
        { status: 400 },
      );
    }

    const appointment = await rescheduleAppointment({
      appointmentId: id,
      userId: user.id,
      newStartAt: new Date(parsed.data.startAt),
    });

    return NextResponse.json({ appointment });
  } catch (e) {
    return toErrorResponse(e);
  }
}
