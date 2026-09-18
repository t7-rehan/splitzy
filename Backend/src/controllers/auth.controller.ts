import type { NextFunction, Request, Response } from 'express';
import { AppError, ErrorCodes } from '../utils/appError.js';
import { findOrProvisionUser, toPublicUser } from '../services/currentUserService.js';
import type { ApiSuccessBody } from '../types/api.js';
import type { PublicUser } from '../types/auth.js';

/**
 * GET /api/v1/auth/me — resolves the authenticated identity to the Splitzy
 * PostgreSQL User (provisioning it on first login) and returns the safe
 * public projection. `req.auth` is set by requireAuth; the guard below is
 * defensive so the handler can never misbehave if mounted without it.
 */
export async function getMe(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const identity = req.auth;
    if (!identity) {
      throw new AppError(ErrorCodes.UNAUTHORIZED);
    }
    const user = await findOrProvisionUser(identity);
    const body: ApiSuccessBody<PublicUser> = {
      success: true,
      data: toPublicUser(user),
    };
    res.status(200).json(body);
  } catch (error) {
    next(error);
  }
}
