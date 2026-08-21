import type { DefaultSession } from "next-auth";

// MODULE AUGMENTATION: we are reaching into Auth.js's own types and adding
// fields. Without this, `session.user.role` is a TypeScript error even though
// the value is there at runtime -- the library cannot know what we put in.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
    } & DefaultSession["user"];
  }

  interface User {
    role?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: string;
  }
}
