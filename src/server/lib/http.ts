import { NextResponse } from "next/server";
import { AppError, HTTP_STATUS } from "./errors";
import { translateDbError, type DbErrorLike } from "./db-errors";

/**
 * The single place a thrown error becomes an HTTP response.
 *
 * Responses carry a stable machine-readable `code` alongside the human
 * message. Clients must branch on the code, never on the message text --
 * messages get reworded, and any client parsing them breaks silently.
 */
export function toErrorResponse(e: unknown) {
  if (e instanceof AppError) {
    return NextResponse.json(
      { error: e.message, code: e.code, field: e.field },
      { status: HTTP_STATUS[e.code] },
    );
  }

  // Safety net: a database error that escaped a service without being
  // translated still becomes the right status rather than a blanket 500.
  const translated = translateDbError(e as DbErrorLike);
  if (translated) {
    console.warn("[api] untranslated db error reached the route:", translated.code);
    return NextResponse.json(
      { error: translated.message, code: translated.code, field: translated.field },
      { status: HTTP_STATUS[translated.code] },
    );
  }

  // Genuinely unexpected. Log the detail, tell the client nothing -- error
  // text can leak table names, query fragments and internal paths.
  console.error("[api] unexpected", e);
  return NextResponse.json(
    { error: "Something went wrong", code: "INTERNAL" },
    { status: 500 },
  );
}
