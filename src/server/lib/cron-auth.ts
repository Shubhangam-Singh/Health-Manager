import { AppError } from "./errors";

/**
 * Cron endpoints are PUBLIC URLs. Without this, anyone who finds
 * /api/cron/notifications can trigger mail delivery repeatedly -- an open
 * relay for spam, billed to us and damaging our sending reputation.
 *
 * Accepts either `Authorization: Bearer <secret>` or `x-cron-secret`, because
 * different schedulers support different header styles.
 */
export function requireCronSecret(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) throw new AppError("FORBIDDEN", "CRON_SECRET is not configured");

  const auth = request.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;
  const provided = bearer ?? request.headers.get("x-cron-secret") ?? undefined;

  if (!provided || provided !== expected) {
    throw new AppError("UNAUTHORIZED", "Invalid or missing cron secret");
  }
}
