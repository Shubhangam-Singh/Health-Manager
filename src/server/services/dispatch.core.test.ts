import { test } from "node:test";
import assert from "node:assert/strict";
import { isDeliverable } from "./dispatch.core.ts";

test("real addresses are deliverable", () => {
  for (const e of ["a@gmail.com", "dr.smith@clinic.co.uk", "x@sub.domain.org"]) {
    assert.equal(isDeliverable(e), true, e);
  }
});

test("RFC 2606 reserved domains are never attempted", () => {
  // These CANNOT resolve. The provider accepts the message then bounces it back
  // to the sending mailbox, so each retry produces a delivery-failure email.
  for (const e of [
    "asha@example.test",
    "user@something.invalid",
    "a@foo.example",
    "root@localhost",
    "a@deep.sub.test",
  ]) {
    assert.equal(isDeliverable(e), false, e);
  }
});

test("an empty address is not deliverable", () => {
  assert.equal(isDeliverable(""), false);
});

test("matching is case-insensitive and ignores surrounding space", () => {
  assert.equal(isDeliverable("  Asha@Example.TEST  "), false);
});

test("a domain merely CONTAINING a reserved word is still fine", () => {
  // "testing.com" and "example.com" are real, registrable domains — only the
  // reserved top-level names are blocked.
  assert.equal(isDeliverable("a@testing.com"), true);
  assert.equal(isDeliverable("a@example.com"), true);
  assert.equal(isDeliverable("a@contest.org"), true);
});
