import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// WHY A SINGLETON?
// In dev, Next hot-reloads modules on every file save. A plain
// `new PrismaClient()` at module scope would create a BRAND NEW client on each
// reload, and each one opens its own connection pool. After 30 saves you have
// 30 pools and Neon starts refusing connections.
// `globalThis` survives hot reloads, so we cache the client on it. In
// production the module is evaluated once, so the cache is unnecessary there.

// WHY AN ADAPTER?
// Prisma 7 removed the Rust query engine. The client now talks to Postgres
// through a normal Node driver (`pg`). Smaller deploys, faster cold starts.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  // Fail loudly at startup rather than mysteriously on the first query.
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env.");
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    // The POOLED endpoint. Migrations use DIRECT_URL via prisma.config.ts.
    adapter: new PrismaPg({ connectionString }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
