/**
 * Authentication middleware (Task 4).
 *
 * Behavior:
 *   Authorization: Bearer <token>  -> verify via authService (Firebase Admin in
 *                                     production; injected verifier in tests)
 *   no/malformed Authorization     -> dev path, but ONLY when
 *                                     NODE_ENV !== 'production' AND the
 *                                     explicit x-dev-user-id header is present
 *   anything else                  -> 401 UNAUTHORIZED
 *
 * The verified identity is attached to `req.auth`; handlers never see tokens.
 * Client-supplied userId/firebaseUid/email/displayName outside the verified
 * token are never trusted. The dev header asserts ONLY the Firebase UID —
 * never email or display name, which must come from verified claims.
 */
import type { NextFunction, Request, Response } from 'express';
import { AppError, ErrorCodes } from '../utils/appError.js';
import { isDevAuthAllowed, verifyIdToken } from '../services/authService.js';

const DEV_USER_HEADER = 'x-dev-user-id';

function unauthorized(message: string, cause?: unknown): AppError {
  return new AppError(ErrorCodes.UNAUTHORIZED, { message, cause });
}

function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const token = match?.[1]?.trim();
  return token && token.length > 0 ? token : null;
}

/** Verifies a Firebase ID token and attaches the identity to the request. */
export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const bearerToken = extractBearerToken(req.headers.authorization);

  if (bearerToken) {
    try {
      req.auth = await verifyIdToken(bearerToken);
      next();
      return;
    } catch (error) {
      next(unauthorized('Invalid or expired authentication token', error));
      return;
    }
  }

  // Development-only path: an explicit, clearly-named header asserts the
  // Firebase UID with zero verification. Structurally unreachable in
  // production (isDevAuthAllowed() is false when NODE_ENV=production), and it
  // never fires when a Bearer token was presented.
  if (isDevAuthAllowed()) {
    const devUid = req.headers[DEV_USER_HEADER];
    if (typeof devUid === 'string' && devUid.trim().length > 0) {
      req.auth = {
        firebaseUid: devUid.trim(),
        method: 'dev-header',
      };
      next();
      return;
    }
  }

  next(unauthorized('Missing or invalid Authorization header'));
}
