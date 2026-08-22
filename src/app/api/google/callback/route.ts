import { NextResponse } from "next/server";
import { requireAuth } from "@/server/lib/auth-guard";
import { toErrorResponse } from "@/server/lib/http";
import { prisma } from "@/server/lib/prisma";
import { exchangeCodeForTokens } from "@/server/lib/google-calendar";

// Step 2: Google redirects here with a one-time code.
export async function GET(request: Request) {
  try {
    const user = await requireAuth();
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    const back = (q: string) =>
      NextResponse.redirect(new URL(`/patient/calendar?${q}`, url.origin));

    // The user pressed Cancel on the consent screen.
    if (error) return back(`error=${encodeURIComponent(error)}`);
    if (!code) return back("error=missing_code");

    // The state must match the signed-in user. Without this check, an attacker
    // could trick a victim into linking the ATTACKER's Google account.
    if (state !== user.id) return back("error=state_mismatch");

    const tokens = await exchangeCodeForTokens(code);

    await prisma.googleAccount.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...tokens },
      update: tokens,
    });

    return back("connected=1");
  } catch (e) {
    return toErrorResponse(e);
  }
}
