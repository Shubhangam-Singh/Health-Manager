import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/server/lib/auth-guard";
import { toErrorResponse } from "@/server/lib/http";
import { cancelAppointment } from "@/server/services/booking.service";

const schema = z.object({ reason: z.string().trim().max(300).optional() });

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Ctx) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const parsed = schema.safeParse(body ?? {});

    const appointment = await cancelAppointment({
      appointmentId: id,
      userId: user.id,
      reason: parsed.success ? parsed.data.reason : undefined,
    });

    return NextResponse.json({ appointment });
  } catch (e) {
    return toErrorResponse(e);
  }
}
