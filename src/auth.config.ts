import type { NextAuthConfig } from "next-auth";

// EDGE-SAFE ONLY. Nothing in this file may import Prisma, bcryptjs, or any Node
// API, because middleware runs on the Edge runtime. `providers: []` is
// deliberate -- the real Credentials provider is added in auth.ts, which only
// ever runs in Node.
export const authConfig = {
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  pages: {
    signIn: "/login",
    // Without this, Auth.js sends failures to its own bare /api/auth/error
    // route. Point them at the login page so the user lands somewhere they
    // can act on, with the reason in ?error=.
    error: "/login",
  },
  providers: [],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = user.role as string;
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
      }
      return session;
    },

    // Runs in middleware for every matched request.
    // Return true to allow, false to bounce to the signIn page.
    authorized({ auth, request }) {
      const role = auth?.user?.role;
      const path = request.nextUrl.pathname;

      const required = path.startsWith("/admin")
        ? "ADMIN"
        : path.startsWith("/doctor")
          ? "DOCTOR"
          : path.startsWith("/patient")
            ? "PATIENT"
            : null;

      if (!required) return true; // not a guarded path
      if (!role) return false; // not logged in -> Auth.js redirects to /login

      // Logged in but wrong portal. Returning false would bounce them to
      // /login, which is confusing when they already have a valid session.
      // Send them somewhere that explains the situation instead.
      if (role !== required) {
        return Response.redirect(new URL("/unauthorized", request.nextUrl));
      }
      return true;
    },
  },
} satisfies NextAuthConfig;
