import { NextResponse } from "next/server";
import { requireAuth } from "@/server/lib/auth-guard";
import { toErrorResponse } from "@/server/lib/http";
import { AppError } from "@/server/lib/errors";
import { buildConsentUrl, isCalendarConfigured } from "@/server/lib/google-calendar";

// Sends the user to Google's consent screen. Step 1 of the auth-code flow.
export async function GET() {
  try {
    const user = await requireAuth();
    if (!isCalendarConfigured()) {
      throw new AppError("FORBIDDEN", "Google Calendar is not configured on this server");
    }
    // `state` round-trips the user id so the callback knows who returned, and
    // is checked on the way back to prevent a CSRF-style forged callback.
    return NextResponse.redirect(buildConsentUrl(user.id));
  } catch (e) {
    return toErrorResponse(e);
  }
}
