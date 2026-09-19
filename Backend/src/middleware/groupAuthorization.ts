/**
 * Group authorization middleware (Task 5).
 *
 * Chains the verified identity into a database-backed authorization decision:
 *
 *   req.auth (from Task 4 requireAuth)
 *     -> requireActor          resolve/find PostgreSQL User  -> req.actor
 *     -> loadGroupMembership   GroupMember row for :groupId  -> req.groupMembership
 *     -> requireRole(...)      GroupRole gate                -> 403 if insufficient
 *
 * Everything is derived from the verified identity and database membership.
 * Client-supplied ownerId/createdBy/role/actor userId are never consulted.
 * Non-members get the same generic 404 whether the group is missing or they
 * simply cannot see it — existence is not leaked.
 */
import type { NextFunction, Request, Response } from 'express';
import type { GroupRole } from '@prisma/client';
import { AppError, ErrorCodes } from '../utils/appError.js';
import { findOrProvisionUser } from '../services/currentUserService.js';
import { groupsRepository } from '../services/groups.service.js';

const GENERIC_NOT_FOUND = 'Group not found';

/** Resolves req.auth to the PostgreSQL User and attaches it as req.actor. */
export async function requireActor(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.auth) {
      throw new AppError(ErrorCodes.UNAUTHORIZED);
    }
    const user = await findOrProvisionUser(req.auth);
    req.actor = { user };
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Loads the authenticated user's membership for :groupId. Non-members and
 * nonexistent groups receive the identical 404 body (no existence leak).
 */
export async function loadGroupMembership(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.actor) {
      throw new AppError(ErrorCodes.UNAUTHORIZED);
    }
    // Express 5 types params as string | string[]; routes here always produce
    // single string segments.
    const rawGroupId = req.params.groupId;
    const groupId = typeof rawGroupId === 'string' ? rawGroupId.trim() : '';
    // A syntactically impossible id can never exist; same generic 404.
    if (groupId.length === 0 || groupId.length > 64) {
      throw new AppError(ErrorCodes.NOT_FOUND, { message: GENERIC_NOT_FOUND });
    }
    const membership = await groupsRepository().findMembership(
      groupId,
      req.actor.user.id,
    );
    if (!membership) {
      throw new AppError(ErrorCodes.NOT_FOUND, { message: GENERIC_NOT_FOUND });
    }
    req.groupMembership = membership;
    next();
  } catch (error) {
    next(error);
  }
}

/** Role gate over the verified membership. */
export function requireRole(
  ...allowed: GroupRole[]
): (req: Request, _res: Response, next: NextFunction) => void {
  return (req, _res, next) => {
    const membership = req.groupMembership;
    if (!membership) {
      // Route wired incorrectly — never reachable in a correct mounting.
      next(new AppError(ErrorCodes.UNAUTHORIZED));
      return;
    }
    if (!allowed.includes(membership.role)) {
      next(
        new AppError(ErrorCodes.FORBIDDEN, {
          message: 'You do not have permission to perform this action',
        }),
      );
      return;
    }
    next();
  };
}
