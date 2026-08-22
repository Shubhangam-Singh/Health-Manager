import { test } from "node:test";
import assert from "node:assert/strict";
import { backoffMinutes, MAX_ATTEMPTS, shouldGiveUp } from "./notification.core.ts";

test("backoff grows: 1m, 5m, 15m, 1h, 6h", () => {
  assert.deepEqual([0, 1, 2, 3, 4].map(backoffMinutes), [1, 5, 15, 60, 360]);
});

test("backoff is clamped past the last step", () => {
  assert.equal(backoffMinutes(99), 360);
});

test("gives up after 5 attempts", () => {
  assert.equal(MAX_ATTEMPTS, 5);
  assert.equal(shouldGiveUp(4), false);
  assert.equal(shouldGiveUp(5), true);
});

test("retries span just over 7 hours before giving up", () => {
  // 1 + 5 + 15 + 60 + 360 = 441 minutes. Long enough to ride out a typical
  // mail provider outage, short enough that a dead address is flagged the
  // same working day rather than lingering as PENDING for ever.
  const total = [0, 1, 2, 3, 4].map(backoffMinutes).reduce((a, b) => a + b, 0);
  assert.equal(total, 441);
  assert.ok(total > 6 * 60 && total < 12 * 60);
});
