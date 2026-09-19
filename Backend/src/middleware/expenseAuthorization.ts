/**
 * Expense authorization middleware (Task 6).
 *
 * Mounted under the Task 5 chain (requireAuth -> requireActor ->
 * loadGroupMembership), so by the time these run the actor is a verified
 * MEMBER of :groupId. Here we:
 *
 *   loadGroupExpense   fetch the expense scoped to :groupId (a generic 404
 *                      when it does not exist OR belongs to another group —
 *                      no cross-group existence leak) -> req.groupExpense
 *   requireEditor      allow only the expense creator or a group OWNER/ADMIN
 *                      (403 otherwise)
 *
 * Role and identity always come from the database membership row and the
 * verified actor — never from the request body.
 */
import type { NextFunction, Request, Response } from 'express';
import { AppError, ErrorCodes } from '../utils/appError.js';
import { canModifyExpense, expensesRepository } from '../services/expenses.service.js';

const GENERIC_NOT_FOUND = 'Expense not found';

/** Loads :expenseId scoped to :groupId (which membership has already verified). */
export async function loadGroupExpense(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.groupMembership) {
      // Route mis-wired — membership middleware must run first.
      next(new AppError(ErrorCodes.UNAUTHORIZED));
      return;
    }
    const rawId = req.params.expenseId;
    const expenseId = typeof rawId === 'string' ? rawId.trim() : '';
    if (expenseId.length === 0 || expenseId.length > 64) {
      throw new AppError(ErrorCodes.NOT_FOUND, { message: GENERIC_NOT_FOUND });
    }
    const relations = await expensesRepository().findExpenseInGroup(
      expenseId,
      req.groupMembership.groupId,
    );
    // Same generic 404 whether the expense is missing, deleted, or belongs to
    // a different group — outsiders cannot probe cross-group ids either.
    if (!relations) {
      throw new AppError(ErrorCodes.NOT_FOUND, { message: GENERIC_NOT_FOUND });
    }
    req.groupExpense = relations;
    next();
  } catch (error) {
    next(error);
  }
}

/** Creator OR group OWNER/ADMIN may modify the loaded expense. */
export function requireEditor(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const membership = req.groupMembership;
  const relations = req.groupExpense;
  if (!membership || !relations || !req.actor) {
    next(new AppError(ErrorCodes.UNAUTHORIZED));
    return;
  }
  if (
    !canModifyExpense(req.actor.user.id, membership.role, relations.expense)
  ) {
    next(
      new AppError(ErrorCodes.FORBIDDEN, {
        message: 'Only the expense creator or a group owner/admin can modify this expense',
      }),
    );
    return;
  }
  next();
}
