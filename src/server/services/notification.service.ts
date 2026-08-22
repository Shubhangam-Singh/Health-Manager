import { prisma } from "@/server/lib/prisma";
import type { Prisma, NotificationType } from "@/generated/prisma/client";
import { backoffMinutes as computeBackoff, shouldGiveUp } from "./notification.core";

/**
 * THE OUTBOX WORKER.
 *
 * Business transactions write Notification rows with status PENDING. This
 * picks them up and delivers them, outside any transaction.
 *
 * Backoff: 1m, 5m, 15m, 1h, 6h. After MAX_ATTEMPTS the row is FAILED and left
 * for an admin to see. Failures are visible, never silent.
 */
// The retry policy itself lives in notification.core.ts, which imports
// nothing, so it can be unit-tested without a database.
export { MAX_ATTEMPTS, backoffMinutes } from "./notification.core";

/**
 * Queue a notification inside an existing transaction.
 * `idempotencyKey` is unique, so the same logical event can never be queued
 * twice -- a retried business operation reuses the key and the insert is
 * skipped rather than duplicated.
 */
export async function queueNotification(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    type: NotificationType;
    payload: Prisma.InputJsonValue;
    idempotencyKey: string;
  },
) {
  await tx.notification.createMany({
    data: [input],
    skipDuplicates: true, // relies on the unique index on idempotencyKey
  });
}

/** Rows that are due: PENDING, and either never tried or past their retry time. */
export async function findDueNotifications(limit: number, now: Date = new Date()) {
  return prisma.notification.findMany({
    where: {
      status: "PENDING",
      OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
    },
    // Oldest first, so a backlog drains in the order it was created.
    orderBy: { createdAt: "asc" },
    take: limit,
    include: { user: { select: { email: true, name: true } } },
  });
}

/** Delivery succeeded. */
export async function markSent(id: string) {
  await prisma.notification.update({
    where: { id },
    data: { status: "SENT", sentAt: new Date(), lastError: null, nextRetryAt: null },
  });
}

/**
 * Delivery failed. Increments attempts and either schedules a retry or gives
 * up. Giving up marks FAILED rather than deleting, so an admin can see what
 * was never delivered -- an invisible failure is worse than a visible one.
 */
export async function markFailed(id: string, attempts: number, error: string, now: Date = new Date()) {
  const next = attempts + 1;
  const giveUp = shouldGiveUp(next);

  await prisma.notification.update({
    where: { id },
    data: {
      attempts: next,
      lastError: error.slice(0, 500),
      status: giveUp ? "FAILED" : "PENDING",
      nextRetryAt: giveUp ? null : new Date(now.getTime() + computeBackoff(next) * 60_000),
    },
  });
}
