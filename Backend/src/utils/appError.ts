/**
 * Application error codes.
 *
 * Stable, machine-readable identifiers. Extend this map as feature modules
 * land (auth, groups, expenses, settlements, subscriptions, ...); never
 * repurpose an existing code.
 */
export const ErrorCodes = {
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  CONFLICT: 'CONFLICT',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/** Mapping of error codes to the HTTP status they should produce. */
export const statusCodeForError: Record<ErrorCode, number> = {
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500,
};

const genericMessages: Record<ErrorCode, string> = {
  NOT_FOUND: 'Route not found',
  VALIDATION_ERROR: 'Invalid request',
  PAYLOAD_TOO_LARGE: 'Request body too large',
  UNSUPPORTED_MEDIA_TYPE: 'Unsupported media type',
  UNAUTHORIZED: 'Authentication required',
  FORBIDDEN: 'Not allowed',
  CONFLICT: 'Conflict',
  INTERNAL_SERVER_ERROR: 'Internal server error',
};

/**
 * The single error type used across the application. Services and controllers
 * throw this; the centralized error handler knows how to serialize it.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  // `| undefined` is required under exactOptionalPropertyTypes.
  readonly details?: Record<string, string[]> | undefined;

  constructor(
    code: ErrorCode,
    options?: {
      message?: string;
      statusCode?: number;
      details?: Record<string, string[]>;
      cause?: unknown;
    },
  ) {
    super(options?.message ?? genericMessages[code], { cause: options?.cause });
    this.name = 'AppError';
    this.code = code;
    this.statusCode = options?.statusCode ?? statusCodeForError[code];
    this.details = options?.details;
  }
}
