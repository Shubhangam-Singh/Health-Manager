import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/server/lib/auth-guard";
import { toErrorResponse } from "@/server/lib/http";
import { replaceWorkingHoursSchema } from "@/server/validation/doctor.schema";
import { replaceWorkingHours } from "@/server/services/doctor.service";

type Ctx = { params: Promise<{ id: string }> };

// PUT, not PATCH: the body IS the doctor's complete week. Sending it twice
// leaves exactly the same state as sending it once -- that is idempotency.
export async function PUT(request: Request, { params }: Ctx) {
  try {
    await requireRole("ADMIN");
    const { id } = await params;

    const body = await request.json().catch(() => null);
    const parsed = replaceWorkingHoursSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", fields: z.flattenError(parsed.error).fieldErrors },
        { status: 400 },
      );
    }

    const workingHours = await replaceWorkingHours(id, parsed.data.workingHours);
    return NextResponse.json({ workingHours });
  } catch (e) {
    return toErrorResponse(e);
  }
}
