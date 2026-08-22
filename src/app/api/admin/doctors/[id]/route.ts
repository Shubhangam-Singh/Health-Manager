import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/server/lib/auth-guard";
import { toErrorResponse } from "@/server/lib/http";
import { updateDoctorSchema } from "@/server/validation/doctor.schema";
import { getDoctor, updateDoctor, deleteDoctor } from "@/server/services/doctor.service";

// In Next 15 `params` is a PROMISE and must be awaited. It used to be a plain
// object; the change lets Next start rendering before the route is fully
// resolved. Forgetting the await gives you a Promise where you expected a string.
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    await requireRole("ADMIN");
    const { id } = await params;
    return NextResponse.json({ doctor: await getDoctor(id) });
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    await requireRole("ADMIN");
    const { id } = await params;

    const body = await request.json().catch(() => null);
    const parsed = updateDoctorSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", fields: z.flattenError(parsed.error).fieldErrors },
        { status: 400 },
      );
    }

    return NextResponse.json({ doctor: await updateDoctor(id, parsed.data) });
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    await requireRole("ADMIN");
    const { id } = await params;
    await deleteDoctor(id);
    // 204: succeeded, and there is deliberately nothing to return.
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return toErrorResponse(e);
  }
}
