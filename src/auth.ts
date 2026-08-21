import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { verifyCredentials } from "@/server/services/auth.service";
import { loginSchema } from "@/server/validation/auth.schema";

export const { handlers, auth, signIn, signOut } = NextAuth({
  // JWT, not database sessions: no session table, no DB read per request.
  // Cost: a token cannot be revoked before it expires. Hence the short maxAge.
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },

  pages: { signIn: "/login" },

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

  callbacks: {
    // Runs when the token is CREATED (user present) and on every later read.
    // Copy role and id in once, at creation, so they ride inside the token.
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = user.role as string;
      }
      return token;
    },

    // Shapes what client code sees via useSession()/auth(). The token itself
    // is never exposed here -- only the fields we copy across.
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
      }
      return session;
    },
  },
});
