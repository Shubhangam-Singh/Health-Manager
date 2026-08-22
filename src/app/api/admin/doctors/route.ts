import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/server/lib/auth-guard";
import { toErrorResponse } from "@/server/lib/http";
import { createDoctorSchema } from "@/server/validation/doctor.schema";
import { createDoctor, listDoctors } from "@/server/services/doctor.service";

// GET /api/admin/doctors?specialisation=cardio
export async function GET(request: Request) {
  try {
    await requireRole("ADMIN");
    const q = new URL(request.url).searchParams.get("specialisation") ?? undefined;
    return NextResponse.json({ doctors: await listDoctors(q) });
  } catch (e) {
    return toErrorResponse(e);
  }
}

// POST /api/admin/doctors
export async function POST(request: Request) {
  try {
    await requireRole("ADMIN");

    const body = await request.json().catch(() => null);
    const parsed = createDoctorSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", fields: z.flattenError(parsed.error).fieldErrors },
        { status: 400 },
      );
    }

    const doctor = await createDoctor(parsed.data);
    // 201 + Location: where the newly created thing now lives.
    return NextResponse.json({ doctor }, {
      status: 201,
      headers: { Location: `/api/admin/doctors/${doctor.id}` },
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}
