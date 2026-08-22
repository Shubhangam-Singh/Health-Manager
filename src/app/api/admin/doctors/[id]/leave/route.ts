import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/server/lib/auth-guard";
import { toErrorResponse } from "@/server/lib/http";
import { findLeaveConflicts, applyLeave } from "@/server/services/leave.service";

const leaveSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  reason: z.string().trim().max(200).optional(),
  // Explicit opt-in. Defaulting this to true would make a destructive action
  // the easy path, which is exactly backwards.
  confirm: z.boolean().default(false),
});

type Ctx = { params: Promise<{ id: string }> };

// GET -> dry run: who would be affected, changes nothing.
export async function GET(request: Request, { params }: Ctx) {
  try {
    await requireRole("ADMIN");
    const { id } = await params;
    const date = new URL(request.url).searchParams.get("date") ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "date must be YYYY-MM-DD", code: "BAD_REQUEST" }, { status: 400 });
    }
    return NextResponse.json(await findLeaveConflicts(id, date));
  } catch (e) {
    return toErrorResponse(e);
  }
}

// POST -> with confirm:false reports conflicts; with confirm:true applies.
export async function POST(request: Request, { params }: Ctx) {
  try {
    await requireRole("ADMIN");
    const { id } = await params;

    const body = await request.json().catch(() => null);
    const parsed = leaveSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", code: "BAD_REQUEST", fields: z.flattenError(parsed.error).fieldErrors },
        { status: 400 },
      );
    }

    const result = await applyLeave({ doctorId: id, ...parsed.data });
    // 200 for a dry run, 201 when leave was actually created.
    return NextResponse.json(result, { status: result.applied ? 201 : 200 });
  } catch (e) {
    return toErrorResponse(e);
  }
}
