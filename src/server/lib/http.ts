import { NextResponse } from "next/server";
import { AppError, HTTP_STATUS } from "./errors";

/**
 * One place that turns a thrown error into an HTTP response, so error mapping
 * is not copy-pasted into every route handler.
 */
export function toErrorResponse(e: unknown) {
  if (e instanceof AppError) {
    return NextResponse.json(
      { error: e.message, field: e.field },
      { status: HTTP_STATUS[e.code] },
    );
  }
  console.error("[api] unexpected", e);
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}
