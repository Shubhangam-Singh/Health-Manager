// Domain errors. Services throw these; the HTTP layer maps them to status
// codes. Services stay framework-agnostic -- they never import NextResponse.

export type AppErrorCode =
  | "BAD_REQUEST" // 400 -- malformed input; fix it and retry
  | "CONFLICT" // 409 -- valid request, clashes with current state
  | "NOT_FOUND" // 404
  | "FORBIDDEN" // 403
  | "UNAUTHORIZED"; // 401

export class AppError extends Error {
  readonly code: AppErrorCode;
  /** Which input field caused it, when that makes sense to the client. */
  readonly field?: string;

  // NOTE: written as explicit assignments rather than TypeScript "parameter
  // properties" (constructor(public readonly code: ...)). Node runs .ts files
  // by STRIPPING types, not compiling them, and parameter properties require
  // real code generation. Using them here breaks `node --test` with
  // ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX. Same applies to enum and decorators.
  constructor(code: AppErrorCode, message: string, field?: string) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.field = field;
  }
}

export const HTTP_STATUS: Record<AppErrorCode, number> = {
  BAD_REQUEST: 400,
  CONFLICT: 409,
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  UNAUTHORIZED: 401,
};
