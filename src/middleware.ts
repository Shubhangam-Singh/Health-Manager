import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Note what is imported: auth.config, NOT auth. This instance has no providers
// and therefore no Prisma and no bcryptjs, so it runs on the Edge runtime.
// It can still READ and verify the JWT, which is all route protection needs.
export default NextAuth(authConfig).auth;

export const config = {
  // Which requests pass through the checkpoint. Everything else skips it
  // entirely -- including /api/*, which is deliberate. See auth-guard.ts.
  matcher: ["/patient/:path*", "/doctor/:path*", "/admin/:path*"],
};
