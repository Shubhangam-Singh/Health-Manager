import { NextResponse } from "next/server";
import { requireCronSecret } from "@/server/lib/cron-auth";
import { toErrorResponse } from "@/server/lib/http";
import { dispatchDueReminders, queueAppointmentReminders } from "@/server/services/reminder.service";

export const dynamic = "force-dynamic";

async function handle(request: Request) {
  try {
    requireCronSecret(request);
    // Both kinds of reminder, one job: medication doses that are due now, and
    // appointments happening within the next 24 hours.
    const medication = await dispatchDueReminders();
    const appointments = await queueAppointmentReminders();
    return NextResponse.json({ ok: true, medication, appointments });
  } catch (e) {
    return toErrorResponse(e);
  }
}
export const GET = handle;
export const POST = handle;
