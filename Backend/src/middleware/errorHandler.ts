import type { NextFunction, Request, Response } from 'express';
import {
  AppError,
  ErrorCodes,
  type ErrorCode,
} from '../utils/appError.js';
import type { ApiFailureBody } from '../types/api.js';

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * body-parser sets `err.type` on body failures. Map the common ones to safe,
 * honest status codes and sanitized messages instead of a blanket 500.
 */
const bodyParserStatusByType: Record<string, number> = {
  'entity.parse.failed': 400,
  'entity.too.large': 413,
  'parameters.too.many': 400,
  'charset.unsupported': 415,
  'encoding.unsupported': 415,
};

const bodyParserMessageByType: Record<string, string> = {
  'entity.parse.failed': 'Malformed JSON body',
  'entity.too.large': 'Request body too large',
  'parameters.too.many': 'Too many parameters',
  'charset.unsupported': 'Unsupported charset',
  'encoding.unsupported': 'Unsupported content encoding',
};

const codeForStatus: Record<number, ErrorCode> = {
  400: ErrorCodes.VALIDATION_ERROR,
  413: ErrorCodes.PAYLOAD_TOO_LARGE,
  415: ErrorCodes.UNSUPPORTED_MEDIA_TYPE,
};

function asBodyParserError(err: unknown): AppError | null {
  if (typeof err !== 'object' || err === null) return null;
  const type = (err as { type?: unknown }).type;
  if (typeof type !== 'string') return null;
  const status = bodyParserStatusByType[type];
  if (status === undefined) return null;
  const code = codeForStatus[status] ?? ErrorCodes.VALIDATION_ERROR;
  return new AppError(code, {
    message: bodyParserMessageByType[type] ?? 'Invalid request body',
    statusCode: status,
    cause: err,
  });
}

/**
 * Centralized error handler.
 *
 * All thrown errors funnel through here and are serialized into the standard
 * failure envelope. Internal error details (stack traces, causes) are logged
 * server-side but never sent to clients in production.
 *
 * Feature modules (auth, groups, expenses, settlements, ...) should throw
 * AppError; anything else becomes a sanitized error response.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  const appError =
    err instanceof AppError ? err : asBodyParserError(err);

  if (appError) {
    console.error(
      `[error] ${appError.code} ${appError.statusCode} ${req.method} ${req.path}: ${appError.message}`,
    );
    const body: ApiFailureBody = {
      success: false,
      error: { code: appError.code, message: appError.message },
    };
    if (appError.details) {
      body.error.details = appError.details;
    }
    res.status(appError.statusCode).json(body);
    return;
  }

  // Unexpected error: log the full detail server-side, return a sanitized
  // response (message only outside production to aid local debugging).
  const fallbackMessage = err instanceof Error ? err.message : 'Unknown error';
  console.error(
    `[error] UNHANDLED ${req.method} ${req.path}: ${fallbackMessage}`,
    err,
  );

  const message = isProduction()
    ? 'Internal server error'
    : fallbackMessage || 'Internal server error';

  res.status(500).json({
    success: false,
    error: { code: ErrorCodes.INTERNAL_SERVER_ERROR, message },
  } satisfies ApiFailureBody);
}
