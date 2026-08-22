import { NextResponse } from "next/server";
import { requireCronSecret } from "@/server/lib/cron-auth";
import { toErrorResponse } from "@/server/lib/http";
import { dispatchPendingNotifications } from "@/server/services/dispatch.service";

// Never cached: a cron endpoint must do work on every call.
export const dynamic = "force-dynamic";

async function handle(request: Request) {
  try {
    requireCronSecret(request);
    const report = await dispatchPendingNotifications();
    return NextResponse.json({ ok: true, ...report });
  } catch (e) {
    return toErrorResponse(e);
  }
}

// GET and POST both supported: some schedulers only issue GET.
export const GET = handle;
export const POST = handle;
