import { NextResponse } from "next/server";
import { requireCronSecret } from "@/server/lib/cron-auth";
import { toErrorResponse } from "@/server/lib/http";
import { retryStuckSummaries } from "@/server/services/summary.service";

export const dynamic = "force-dynamic";

async function handle(request: Request) {
  try {
    requireCronSecret(request);
    return NextResponse.json({ ok: true, ...(await retryStuckSummaries()) });
  } catch (e) {
    return toErrorResponse(e);
  }
}
export const GET = handle;
export const POST = handle;
