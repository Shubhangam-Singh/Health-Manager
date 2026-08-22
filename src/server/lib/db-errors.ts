import { AppError, type AppErrorCode } from "./errors.ts";

/**
 * ONE place that translates database errors into domain errors.
 *
 * Previously three services each caught P2002 and GUESSED which constraint had
 * fired. That guess is silently wrong the moment a table gains a second unique
 * constraint. Here the constraint is identified by name.
 *
 * PRISMA 7 NOTE: with driver adapters, `e.meta.target` -- which every tutorial
 * reads -- does not exist. The detail lives at
 * `meta.driverAdapterError.cause.constraint`. Both shapes are handled so this
 * keeps working if the adapter is swapped out.
 *
 * Pure and importing only ./errors, so it is unit-testable with no database.
 */
export type DbErrorLike = {
  code?: string;
  meta?: {
    modelName?: string;
    target?: string[] | string;
    driverAdapterError?: {
      cause?: {
        originalMessage?: string;
        constraint?: { fields?: string[]; index?: string };
      };
    };
  };
};

/** The constraint or index name, whichever the driver reported. */
export function constraintNameOf(e: DbErrorLike): string | undefined {
  const c = e.meta?.driverAdapterError?.cause;
  if (c?.constraint?.index) return c.constraint.index;
  // Some drivers only put the name in the raw message text.
  const m = c?.originalMessage?.match(/constraint "([^"]+)"/);
  if (m) return m[1];
  if (typeof e.meta?.target === "string") return e.meta.target;
  return undefined;
}

/** The offending column names, when the driver reports them. */
export function constraintFieldsOf(e: DbErrorLike): string[] {
  const fields = e.meta?.driverAdapterError?.cause?.constraint?.fields;
  if (fields?.length) return fields;
  if (Array.isArray(e.meta?.target)) return e.meta.target;
  return [];
}

/**
 * Named constraints get a message written for the person who will read it.
 * Keyed by the exact name in the migration, so adding a constraint without
 * adding an entry here degrades to a generic message rather than a wrong one.
 */
const BY_CONSTRAINT: Record<string, { code: AppErrorCode; message: string; field?: string }> = {
  appointment_slot_unique: {
    code: "CONFLICT",
    message: "That slot was just taken. Please pick another time.",
    field: "startAt",
  },
  User_email_key: {
    code: "CONFLICT",
    message: "That email is already registered",
    field: "email",
  },
  DoctorProfile_userId_key: {
    code: "CONFLICT",
    message: "That user already has a doctor profile",
    field: "userId",
  },
  LeaveDay_doctorId_date_key: {
    code: "CONFLICT",
    message: "Leave is already recorded for that date",
    field: "date",
  },
  Appointment_doctorId_fkey: {
    code: "CONFLICT",
    message: "This doctor has appointments and cannot be removed",
    field: "doctorId",
  },
  Appointment_patientId_fkey: {
    code: "CONFLICT",
    message: "This patient has appointments and cannot be removed",
    field: "patientId",
  },
};

/**
 * Returns an AppError for database errors we understand, or undefined for
 * anything else -- which the caller must rethrow so it surfaces as a 500.
 * Swallowing unknown database errors is how real bugs become silent.
 */
export function translateDbError(e: DbErrorLike): AppError | undefined {
  const name = constraintNameOf(e);
  const known = name ? BY_CONSTRAINT[name] : undefined;

  switch (e.code) {
    // Unique violation (Postgres 23505).
    case "P2002": {
      if (known) return new AppError(known.code, known.message, known.field);
      const fields = constraintFieldsOf(e);
      return new AppError(
        "CONFLICT",
        fields.length ? `That ${fields.join(" and ")} is already in use` : "That record already exists",
        fields[0],
      );
    }

    // Foreign key violation (23503): pointing at something absent, or
    // deleting something still referenced under ON DELETE RESTRICT.
    case "P2003":
      return known
        ? new AppError(known.code, known.message, known.field)
        : new AppError("CONFLICT", "That operation conflicts with related records");

    // Update or delete of a row that is not there.
    case "P2025":
      return new AppError("NOT_FOUND", "Record not found");

    // CHECK constraint violation (23514). Reaching here means input validation
    // let something through that the database refused -- a gap worth logging.
    case "P2039":
      return new AppError("BAD_REQUEST", "That value is not allowed", name);

    default:
      return undefined; // unknown: let it become a 500
  }
}
