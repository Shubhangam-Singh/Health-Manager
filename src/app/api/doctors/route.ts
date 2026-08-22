import { NextResponse } from "next/server";
import { requireAuth } from "@/server/lib/auth-guard";
import { toErrorResponse } from "@/server/lib/http";
import { searchDoctors } from "@/server/services/doctor.service";

// GET /api/doctors?specialisation=derm
// Any signed-in user. The page itself calls the service directly -- this
// endpoint exists for clients that are not our server-rendered pages.
export async function GET(request: Request) {
  try {
    await requireAuth();
    const q = new URL(request.url).searchParams.get("specialisation") ?? undefined;
    return NextResponse.json({ doctors: await searchDoctors(q) });
  } catch (e) {
    return toErrorResponse(e);
  }
}
