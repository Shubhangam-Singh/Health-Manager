import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "@/auth.config";
import { verifyCredentials } from "@/server/services/auth.service";
import { loginSchema } from "@/server/validation/auth.schema";

// NODE RUNTIME ONLY. This file imports Prisma and bcryptjs through the auth
// service, so it must never be imported by middleware. Middleware imports
// auth.config.ts instead, which has no such dependencies.
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,

  providers: [
    Credentials({
      credentials: { email: {}, password: {} },

      // Return a user object to allow sign-in, or null to reject.
      // Throwing here would leak the reason to the client, so we never do.
      async authorize(raw) {
        const parsed = loginSchema.safeParse(raw);
        if (!parsed.success) return null;

        const user = await verifyCredentials(parsed.data.email, parsed.data.password);
        if (!user) return null;

        // Whatever we return here is handed to the `jwt` callback as `user`.
        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
  ],
});
