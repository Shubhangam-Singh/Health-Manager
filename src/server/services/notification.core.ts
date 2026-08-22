/**
 * Pure retry policy. NO IMPORTS -- so it is unit-testable without a database,
 * same rule as slot.core.ts.
 *
 * 1m, 5m, 15m, 1h, 6h then give up. Total 441 minutes: long enough to ride
 * out a typical mail provider outage, short enough that a permanently bad
 * address is flagged the same working day instead of sitting PENDING for ever.
 */
const BACKOFF_MINUTES = [1, 5, 15, 60, 360];

export const MAX_ATTEMPTS = BACKOFF_MINUTES.length;

/** Minutes to wait before attempt number `attempts + 1`. */
export function backoffMinutes(attempts: number): number {
  return BACKOFF_MINUTES[Math.min(attempts, BACKOFF_MINUTES.length - 1)];
}

/** Whether we should stop retrying after this many failures. */
export function shouldGiveUp(attemptsAfterFailure: number): boolean {
  return attemptsAfterFailure >= MAX_ATTEMPTS;
}
