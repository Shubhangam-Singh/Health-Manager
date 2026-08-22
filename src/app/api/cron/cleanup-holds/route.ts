import { NextResponse } from "next/server";
import { requireCronSecret } from "@/server/lib/cron-auth";
import { toErrorResponse } from "@/server/lib/http";
import { cleanupExpiredHolds } from "@/server/services/hold.service";

export const dynamic = "force-dynamic";

async function handle(request: Request) {
  try {
    requireCronSecret(request);
    // Lazy expiry only reclaims a slot someone tries to re-hold. This sweep
    // catches slots nobody retries, which would otherwise stay invisible.
    const removed = await cleanupExpiredHolds();
    return NextResponse.json({ ok: true, removed });
  } catch (e) {
    return toErrorResponse(e);
  }
}
export const GET = handle;
export const POST = handle;
