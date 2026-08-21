import bcrypt from "bcryptjs";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/lib/prisma";
import { AppError } from "@/server/lib/errors";
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
    // P2002 = unique constraint violation. The DATABASE decided this, not us,
    // so there is no race window between checking and inserting.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new AppError("CONFLICT", "That email is already registered", "email");
    }
    throw e;
  }
}
