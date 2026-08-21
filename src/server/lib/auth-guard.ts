import { auth } from "@/auth";
import { AppError } from "./errors";
import type { Role } from "@/generated/prisma/enums";

export type SessionUser = { id: string; email: string; role: string };

/**
 * Authorisation for API routes. Middleware guards PAGE navigation only --
 * it never runs for /api/*, and even where it does, an endpoint must not
 * depend on a matcher config for its security. Every route calls this itself.
 */
export async function requireAuth(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new AppError("UNAUTHORIZED", "You must be signed in");
  }
  return {
    id: session.user.id,
    email: session.user.email ?? "",
    role: session.user.role,
  };
}

/** Requires one of the given roles. Throws FORBIDDEN if signed in but wrong. */
export async function requireRole(...allowed: Role[]): Promise<SessionUser> {
  const user = await requireAuth();
  if (!allowed.includes(user.role as Role)) {
    throw new AppError("FORBIDDEN", "You do not have access to this resource");
  }
  return user;
}
