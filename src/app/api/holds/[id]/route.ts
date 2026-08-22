import { NextResponse } from "next/server";
import { requireRole } from "@/server/lib/auth-guard";
import { toErrorResponse } from "@/server/lib/http";
import { releaseHold } from "@/server/services/hold.service";

type Ctx = { params: Promise<{ id: string }> };

// DELETE /api/holds/:id -> give the slot back
export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const user = await requireRole("PATIENT");
    const { id } = await params;
    await releaseHold(id, user.id);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return toErrorResponse(e);
  }
}
