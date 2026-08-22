import { test } from "node:test";
import assert from "node:assert/strict";
import { translateDbError, constraintNameOf, constraintFieldsOf } from "./db-errors.ts";

// These fixtures are the ACTUAL shapes Prisma 7 + @prisma/adapter-pg produced,
// captured by probing a real database. Inventing them would test a fiction.
const duplicateEmail = {
  code: "P2002",
  meta: { modelName: "User", driverAdapterError: { cause: {
    originalCode: "23505",
    originalMessage: 'duplicate key value violates unique constraint "User_email_key"',
    kind: "UniqueConstraintViolation",
    constraint: { fields: ["email"] },
  } } },
};

const fkMissingDoctor = {
  code: "P2003",
  meta: { modelName: "Appointment", driverAdapterError: { cause: {
    originalCode: "23503",
    originalMessage: 'insert or update on table "Appointment" violates foreign key constraint "Appointment_doctorId_fkey"',
    constraint: { index: "Appointment_doctorId_fkey" },
  } } },
};

const badWeekday = {
  code: "P2039",
  meta: { modelName: "WorkingHour", driverAdapterError: { cause: {
    originalCode: "23514",
    originalMessage: 'new row for relation "WorkingHour" violates check constraint "WorkingHour_dayOfWeek_range"',
  } } },
};

const missingRow = { code: "P2025", meta: { modelName: "DoctorProfile", operation: "an update" } };

const slotTaken = {
  code: "P2002",
  meta: { modelName: "Appointment", driverAdapterError: { cause: {
    originalCode: "23505",
    originalMessage: 'duplicate key value violates unique constraint "appointment_slot_unique"',
    constraint: { index: "appointment_slot_unique" },
  } } },
};

test("reads the constraint name from the index field", () => {
  assert.equal(constraintNameOf(fkMissingDoctor), "Appointment_doctorId_fkey");
});

test("falls back to parsing the raw message when there is no index field", () => {
  assert.equal(constraintNameOf(duplicateEmail), "User_email_key");
});

test("reads the offending column names", () => {
  assert.deepEqual(constraintFieldsOf(duplicateEmail), ["email"]);
});

test("losing the booking race is a 409 with a usable message", () => {
  const err = translateDbError(slotTaken)!;
  assert.equal(err.code, "CONFLICT");
  assert.equal(err.field, "startAt");
  assert.match(err.message, /just taken/);
});

test("duplicate email is a 409 naming the email field", () => {
  const err = translateDbError(duplicateEmail)!;
  assert.equal(err.code, "CONFLICT");
  assert.equal(err.field, "email");
  assert.match(err.message, /already registered/);
});

test("a blocked delete is a 409, not a 500", () => {
  const err = translateDbError(fkMissingDoctor)!;
  assert.equal(err.code, "CONFLICT");
});

test("a missing row is a 404", () => {
  assert.equal(translateDbError(missingRow)!.code, "NOT_FOUND");
});

test("a check-constraint violation is a 400", () => {
  const err = translateDbError(badWeekday)!;
  assert.equal(err.code, "BAD_REQUEST");
  assert.equal(err.field, "WorkingHour_dayOfWeek_range");
});

test("an unknown unique constraint still gives a sensible 409", () => {
  const err = translateDbError({
    code: "P2002",
    meta: { driverAdapterError: { cause: { constraint: { fields: ["phone"] } } } },
  })!;
  assert.equal(err.code, "CONFLICT");
  assert.match(err.message, /phone/);
});

test("unrecognised errors return undefined so they become 500s", () => {
  assert.equal(translateDbError({ code: "P1001" }), undefined);
  assert.equal(translateDbError({}), undefined);
});
