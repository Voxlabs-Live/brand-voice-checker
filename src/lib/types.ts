/**
 * Shared response envelope. All /api/* routes return this shape so the
 * client-side script can do one branch on `error` vs `ok`.
 */
export type ApiResponse<T> =
  | { ok: true; data: T; remaining: number }
  | { ok: false; error: ApiErrorCode; message: string };

export type ApiErrorCode =
  | "rate_limit_exceeded"
  | "invalid_input"
  | "anthropic_error"
  | "parse_error"
  | "missing_api_key";
