// Domain errors. Services throw these; the HTTP layer maps them to status
// codes. Services stay framework-agnostic -- they never import NextResponse.

export type AppErrorCode =
  | "CONFLICT" // 409 -- state clash, e.g. email taken, slot just booked
  | "NOT_FOUND" // 404
  | "FORBIDDEN" // 403
  | "UNAUTHORIZED"; // 401

export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    message: string,
    /** Which input field caused it, when that makes sense to the client. */
    public readonly field?: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const HTTP_STATUS: Record<AppErrorCode, number> = {
  CONFLICT: 409,
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  UNAUTHORIZED: 401,
};
