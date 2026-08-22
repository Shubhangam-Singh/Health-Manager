import bcrypt from "bcryptjs";
import { prisma } from "@/server/lib/prisma";
import { translateDbError, type DbErrorLike } from "@/server/lib/db-errors";
import type { RegisterInput } from "@/server/validation/auth.schema";

// Cost factor 10 => 2^10 = 1024 rounds, roughly 100ms per hash.
// Invisible to a user logging in; ruinous for anyone brute-forcing.
// Raise this as hardware gets faster -- the cost is stored inside the hash,
// so old hashes keep verifying with their original cost.
const BCRYPT_COST = 10;

/** The user shape safe to send over the wire. Note: no passwordHash. */
export type PublicUser = {
  id: string;
  email: string;
  name: string;
  role: string;
};

export async function registerUser(input: RegisterInput): Promise<PublicUser> {
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);

  try {
    const user = await prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        name: input.name,
        phone: input.phone,
        // role is deliberately NOT taken from input -- see note below.
      },
      select: { id: true, email: true, name: true, role: true },
    });
    return user;
  } catch (e) {
    // The DATABASE decided this, not us, so there is no race window between
    // checking and inserting. The message comes from the shared translator,
    // keyed on the constraint name User_email_key.
    const known = translateDbError(e as DbErrorLike);
    if (known) throw known;
    throw e;
  }
}

// A real bcrypt hash of a random throwaway string. Nothing can match it.
// WHY IT EXISTS: if the email is not found we still run bcrypt.compare against
// this, so a missing user costs the same ~100ms as a wrong password. Without
// it, "no such user" returns in ~2ms and "wrong password" in ~100ms, and an
// attacker times the difference to discover which emails have accounts.
// That is a TIMING SIDE CHANNEL, and it enables user enumeration.
const DUMMY_HASH = "$2b$10$y941bUHt1dcmQrfZqfTLLO2d6WW6Iyi3I5jUi3gE6jOoj/hoq4FyO";

/**
 * Returns the user on success, or null on ANY failure.
 * Deliberately does not distinguish "no such email" from "wrong password" --
 * that distinction is exactly what an attacker wants.
 */
export async function verifyCredentials(
  email: string,
  password: string,
): Promise<PublicUser | null> {
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true, email: true, name: true, role: true, passwordHash: true },
  });

  // Always hash, even when there is no user. Constant work, constant timing.
  const matches = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !matches) return null;

  return { id: user.id, email: user.email, name: user.name, role: user.role };
}
