import type { NextFunction, Request, Response } from 'express';
import {
  createExpense,
  deleteExpense,
  getExpense,
  listExpenses,
  updateExpense,
} from '../services/expenses.service.js';
import type { ApiSuccessBody } from '../types/api.js';
import type { PublicExpense } from '../types/expenses.js';

/**
 * Expenses API controllers (Task 6). Thin by design: delegate to the service
 * and wrap results in the standard success envelope. Identity, membership and
 * expense context arrive from middleware (req.actor, req.groupMembership,
 * req.groupExpense) — never from the request body.
 */

export async function createExpenseHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const groupId = req.groupMembership!.groupId;
    const expense = await createExpense(groupId, req.actor!, req.body);
    const body: ApiSuccessBody<PublicExpense> = { success: true, data: expense };
    res.status(201).json(body);
  } catch (error) {
    next(error);
  }
}

export async function listExpensesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const expenses = await listExpenses(req.groupMembership!.groupId);
    const body: ApiSuccessBody<PublicExpense[]> = { success: true, data: expenses };
    res.status(200).json(body);
  } catch (error) {
    next(error);
  }
}

export async function getExpenseHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const expense = getExpense(req.groupExpense!);
    const body: ApiSuccessBody<PublicExpense> = { success: true, data: expense };
    res.status(200).json(body);
  } catch (error) {
    next(error);
  }
}

export async function updateExpenseHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const expense = await updateExpense(req.groupExpense!, req.body);
    const body: ApiSuccessBody<PublicExpense> = { success: true, data: expense };
    res.status(200).json(body);
  } catch (error) {
    next(error);
  }
}

export async function deleteExpenseHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await deleteExpense(req.groupExpense!.expense.id);
    const body: ApiSuccessBody<{ deleted: true; expenseId: string }> = {
      success: true,
      data: { deleted: true, expenseId: req.groupExpense!.expense.id },
    };
    res.status(200).json(body);
  } catch (error) {
    next(error);
  }
}
