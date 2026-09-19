import { Router } from 'express';
import {
  createExpenseHandler,
  deleteExpenseHandler,
  getExpenseHandler,
  listExpensesHandler,
  updateExpenseHandler,
} from '../controllers/expenses.controller.js';
import {
  loadGroupExpense,
  requireEditor,
} from '../middleware/expenseAuthorization.js';

/**
 * Expenses API routes (Task 6), mounted at /groups/:groupId/expenses with
 * mergeParams so :groupId flows through.
 *
 * The mount point in groups.routes.ts already enforces:
 *   requireAuth -> requireActor -> loadGroupMembership
 * i.e. every request below is from a verified group member.
 *
 * Route policy:
 *   POST /                      any member            -> 201
 *   GET  /                      any member            -> 200 (this group only)
 *   GET  /:expenseId            any member            -> 200 (scoped to group)
 *   PATCH /:expenseId           creator or OWNER/ADMIN -> 200
 *   DELETE /:expenseId          creator or OWNER/ADMIN -> 200
 */
export const expensesRouter = Router({ mergeParams: true });

expensesRouter.post('/', createExpenseHandler);
expensesRouter.get('/', listExpensesHandler);
expensesRouter.get('/:expenseId', loadGroupExpense, getExpenseHandler);
expensesRouter.patch(
  '/:expenseId',
  loadGroupExpense,
  requireEditor,
  updateExpenseHandler,
);
expensesRouter.delete(
  '/:expenseId',
  loadGroupExpense,
  requireEditor,
  deleteExpenseHandler,
);
