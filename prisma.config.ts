import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // The CLI runs MIGRATIONS, so it uses the DIRECT endpoint.
    // Neon's pooled endpoint is PgBouncer in transaction mode, which does not
    // support the session-level features migrations need (advisory locks,
    // CREATE TYPE). The app itself uses the pooled DATABASE_URL at runtime.
    url: process.env["DIRECT_URL"],
  },
});
