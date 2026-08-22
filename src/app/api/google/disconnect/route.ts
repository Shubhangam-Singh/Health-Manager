import { NextResponse } from "next/server";
import { requireAuth } from "@/server/lib/auth-guard";
import { toErrorResponse } from "@/server/lib/http";
import { prisma } from "@/server/lib/prisma";

// Removes our stored tokens. The user should ALSO revoke at
// myaccount.google.com/permissions -- deleting our copy stops us using it,
// but only Google can invalidate the grant itself.
export async function POST() {
  try {
    const user = await requireAuth();
    await prisma.googleAccount.deleteMany({ where: { userId: user.id } });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return toErrorResponse(e);
  }
}
