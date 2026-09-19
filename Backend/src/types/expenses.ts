/**
 * Expenses feature contracts (Task 6).
 *
 * Safe response shapes for the Expenses API plus the request augmentation for
 * middleware-resolved expense context. Money is always exposed as a string of
 * integer minor units (BigInt is not JSON-serializable). Percentages are
 * exposed as fixed 2-decimal strings, matching the database Decimal(5,2).
 */
import type {
  Expense,
  ExpenseItem,
  ExpenseItemParticipant,
  ExpenseParticipant,
  GroupRole,
  SplitType,
  User,
} from '@prisma/client';

/** One participant of an expense as returned to clients. */
export interface PublicExpenseParticipant {
  userId: string | null;
  displayName: string;
  /** Owed share in integer minor units (string form of BigInt). */
  shareMinor: string;
  /** PERCENTAGE splits only: fixed 2-decimal string, e.g. "33.33". */
  percentage: string | null;
}

/** One itemized line as returned to clients. */
export interface PublicExpenseItem {
  id: string;
  description: string;
  amountMinor: string;
  participants: Array<{
    userId: string | null;
    displayName: string;
    shareMinor: string;
  }>;
}

/** Safe user reference inside an expense (never email/firebaseUid). */
export interface PublicExpenseActor {
  userId: string | null;
  displayName: string;
}

/** The full expense as returned to clients. */
export interface PublicExpense {
  id: string;
  groupId: string;
  description: string;
  category: string;
  amountMinor: string;
  currencyCode: string;
  splitType: SplitType;
  /** When the expense occurred (user-selected; distinct from createdAt). */
  expenseDate: string;
  createdAt: string;
  updatedAt: string;
  paidBy: PublicExpenseActor | null;
  createdBy: PublicExpenseActor | null;
  participants: PublicExpenseParticipant[];
  items: PublicExpenseItem[];
}

/** An expense with everything needed for serialization/authorization.
 *  Participant rows include their User so serialization needs no extra queries. */
export interface ExpenseWithRelations {
  expense: Expense;
  participants: Array<ExpenseParticipant & { user: User | null }>;
  items: Array<
    ExpenseItem & {
      participants: Array<ExpenseItemParticipant & { user: User | null }>;
    }
  >;
  paidBy: User | null;
  createdBy: User | null;
}

/**
 * Express request augmentation (extends Task 4/5): `groupExpense` is set by
 * the expense middleware after membership and expense-in-group are verified.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      groupExpense?: ExpenseWithRelations;
    }
  }
}

export type { GroupRole, SplitType };
