import type { NextFunction, Request, Response } from 'express';
import { AppError, ErrorCodes } from '../utils/appError.js';
import type { ApiFailureBody } from '../types/api.js';

/**
 * 404 handler for unmatched routes. Mounted after all real routes, so reaching
 * this middleware means no route matched the request.
 */
export function notFoundHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Defensive: under normal mounting this never fires.
  if (res.headersSent) {
    next();
    return;
  }
  const error = new AppError(ErrorCodes.NOT_FOUND, {
    message: 'Route not found',
  });
  res.status(error.statusCode).json({
    success: false,
    error: { code: error.code, message: error.message },
  } satisfies ApiFailureBody);
}
