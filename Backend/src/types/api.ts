/**
 * Shared API contracts.
 *
 * Every JSON response uses one of these two envelopes so clients can rely on
 * a consistent shape across all future endpoints (auth, groups, expenses...).
 */

export interface ApiErrorBody {
  code: string;
  message: string;
  /** Machine-readable field-level details; only included when relevant. */
  details?: Record<string, string[]>;
}

export interface ApiSuccessBody<TData = unknown> {
  success: true;
  data: TData;
}

export interface ApiFailureBody {
  success: false;
  error: ApiErrorBody;
}

export type ApiResponseBody<TData = unknown> =
  | ApiSuccessBody<TData>
  | ApiFailureBody;
