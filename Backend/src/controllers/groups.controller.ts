import type { NextFunction, Request, Response } from 'express';
import {
  addMember,
  changeMemberRole,
  createGroup,
  deleteGroup,
  getGroupDetails,
  leaveGroup,
  listMyGroups,
  removeMember,
  updateGroup,
  validateGroupCreate,
  validateGroupPatch,
  validateRoleInput,
  validateUserIdInput,
  validateUsernameInput,
} from '../services/groups.service.js';
import type { ApiSuccessBody } from '../types/api.js';
import type { GroupDetails, GroupSummary } from '../types/groups.js';

/** Express 5 types params as string | string[]; these routes use single
 *  string segments. Returns '' for anything else (downstream validation and
 *  the membership middleware produce the proper 404/400). */
function param(req: Request, name: 'groupId' | 'userId'): string {
  const value = req.params[name];
  return typeof value === 'string' ? value : '';
}

/**
 * Groups API controllers (Task 5). Deliberately thin: validate input, delegate
 * to the service, wrap in the standard success envelope. Authorization and
 * identity come from middleware-attached context (req.actor, req.groupMembership),
 * never from the request body.
 */

export async function createGroupHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = validateGroupCreate(req.body);
    const group = await createGroup(req.actor!, input);
    const body: ApiSuccessBody<GroupDetails> = { success: true, data: group };
    res.status(201).json(body);
  } catch (error) {
    next(error);
  }
}

export async function listGroupsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const groups = await listMyGroups(req.actor!);
    const body: ApiSuccessBody<GroupSummary[]> = { success: true, data: groups };
    res.status(200).json(body);
  } catch (error) {
    next(error);
  }
}

export async function getGroupHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const group = await getGroupDetails(
      param(req, 'groupId'),
      req.groupMembership!.role,
      req.actor!.user.id,
    );
    const body: ApiSuccessBody<GroupDetails> = { success: true, data: group };
    res.status(200).json(body);
  } catch (error) {
    next(error);
  }
}

export async function updateGroupHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const patch = validateGroupPatch(req.body);
    const group = await updateGroup(
      param(req, 'groupId'),
      patch,
      req.groupMembership!.role,
      req.actor!.user.id,
    );
    const body: ApiSuccessBody<GroupDetails> = { success: true, data: group };
    res.status(200).json(body);
  } catch (error) {
    next(error);
  }
}

export async function deleteGroupHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await deleteGroup(
      param(req, 'groupId'),
      req.actor!.user.id,
      req.groupMembership!.role,
    );
    const body: ApiSuccessBody<{ deleted: true }> = {
      success: true,
      data: { deleted: true },
    };
    res.status(200).json(body);
  } catch (error) {
    next(error);
  }
}

export async function leaveGroupHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await leaveGroup(param(req, 'groupId'), req.actor!);
    const body: ApiSuccessBody<{ membershipId: string; left: true }> = {
      success: true,
      data: { membershipId: result.membershipId, left: true },
    };
    res.status(200).json(body);
  } catch (error) {
    next(error);
  }
}

export async function addMemberHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const username = req.body?.username !== undefined
      ? validateUsernameInput(req.body.username)
      : validateUserIdInput(req.body?.userId);
    const member = await addMember(param(req, 'groupId'), username, req.actor!.user.id);
    const body: ApiSuccessBody<typeof member> = { success: true, data: member };
    res.status(201).json(body);
  } catch (error) {
    next(error);
  }
}

export async function removeMemberHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const targetUserId = validateUserIdInput(param(req, 'userId'));
    await removeMember(param(req, 'groupId'), targetUserId, req.groupMembership!.role);
    const body: ApiSuccessBody<{ removed: true }> = {
      success: true,
      data: { removed: true },
    };
    res.status(200).json(body);
  } catch (error) {
    next(error);
  }
}

export async function changeRoleHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const targetUserId = validateUserIdInput(param(req, 'userId'));
    const role = validateRoleInput(req.body?.role);
    const member = await changeMemberRole(
      param(req, 'groupId'),
      targetUserId,
      role,
    );
    const body: ApiSuccessBody<typeof member> = { success: true, data: member };
    res.status(200).json(body);
  } catch (error) {
    next(error);
  }
}
