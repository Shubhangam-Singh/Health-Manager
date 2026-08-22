import { NextResponse } from "next/server";
import { requireCronSecret } from "@/server/lib/cron-auth";
import { toErrorResponse } from "@/server/lib/http";
import { dispatchDueReminders } from "@/server/services/reminder.service";

export const dynamic = "force-dynamic";

async function handle(request: Request) {
  try {
    requireCronSecret(request);
    return NextResponse.json({ ok: true, ...(await dispatchDueReminders()) });
  } catch (e) {
    return toErrorResponse(e);
  }
}
export const GET = handle;
export const POST = handle;
