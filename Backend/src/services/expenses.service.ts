/**
 * Expenses service (Task 6).
 *
 * All expense business rules live here: payload validation, server-side split
 * validation in INTEGER minor units (never floating point), the update/delete
 * policy, transactional persistence, and safe serialization.
 *
 * Contract established with the frontend (AddExpenseModal.jsx):
 *   - amounts:      integer minor units (string at the API edge; ₹100.50 -> "10050")
 *   - percentages:  integer basis points, 1 bp = 0.01% ("3300" bp = 33.00%),
 *                   matching the schema's Decimal(5,2) precision
 *   - EQUAL:        server divides amountMinor across participants; the LAST
 *                   listed participant absorbs the rounding remainder
 *                   (deterministic, matches the client's amount/count model)
 *   - ITEMIZED:     each item's amountMinor divides equally across its
 *                   participants (last absorbs the remainder), exactly like   *                   the frontend's `getShares`; item amounts must sum to the
   *                   expense total exactly; a user may appear on several items
   *                   (duplicates only rejected within a single item)
 *
 * Authorization inputs arrive exclusively from middleware context
 * (req.actor, req.groupMembership). Client-supplied creator/identity/role
 * fields are never trusted.
 */
import type {
  Expense,
  ExpenseItem,
  ExpenseItemParticipant,
  ExpenseParticipant,
  Group,
  Prisma,
  SplitType,
  User,
} from '@prisma/client';
import { AppError, ErrorCodes } from '../utils/appError.js';
import { getPrismaClient } from './db.js';
import { SUPPORTED_CURRENCY_CODES } from './groups.service.js';
import type {
  ExpenseWithRelations,
  PublicExpense,
  PublicExpenseItem,
  PublicExpenseParticipant,
} from '../types/expenses.js';

// ---------------------------------------------------------------------------
// Domain constants
// ---------------------------------------------------------------------------

export const EXPENSE_DESCRIPTION_MAX = 140;
export const ITEM_NAME_MAX = 80;
/** Maximum absolute amount: 10^15 minor units (10^13 major units). */
export const MAX_AMOUNT_MINOR = 1_000_000_000_000_000n;

export const EXPENSE_CATEGORIES = [
  'Food',
  'Travel',
  'Rent',
  'Utilities',
  'Shopping',
  'Entertainment',
  'Other',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/** Percentage basis points: integer, 0 <= bp <= 10_000 (100.00%). */
export const TOTAL_PERCENTAGE_BP = 10_000n;

// ---------------------------------------------------------------------------
// Repository seam (production: Prisma; tests: injected in-memory)
// ---------------------------------------------------------------------------

export interface ExpenseCreateData {
  groupId: string;
  description: string;
  category: string;
  amountMinor: bigint;
  currencyCode: string;
  paidById: string;
  splitType: SplitType;
  expenseDate: Date;
  createdById: string;
}

export interface ExpenseUpdateData {
  description?: string;
  category?: string;
  amountMinor?: bigint;
  currencyCode?: string;
  paidById?: string;
  splitType?: SplitType;
  expenseDate?: Date;
}

export interface ValidatedSplit {
  splitType: SplitType;
  /** One row per ExpenseParticipant (all three split types produce these). */
  participants: Array<{ userId: string; shareMinor: bigint; percentageBp: bigint | null }>;
  /** ITEMIZED only: item rows with per-item participant shares. */
  items: Array<{
    description: string;
    amountMinor: bigint;
    participants: Array<{ userId: string; shareMinor: bigint }>;
  }>;
}

export interface ExpensesRepository {
  findGroupById(id: string): Promise<Group | null>;
  listMemberUserIds(groupId: string): Promise<Set<string>>;
  findExpenseInGroup(
    expenseId: string,
    groupId: string,
  ): Promise<ExpenseWithRelations | null>;
  listExpensesForGroup(groupId: string): Promise<ExpenseWithRelations[]>;
  createExpenseWithRelations(
    expense: ExpenseCreateData,
    split: ValidatedSplit,
  ): Promise<ExpenseWithRelations>;
  updateExpenseWithRelations(
    expenseId: string,
    patch: ExpenseUpdateData,
    split: ValidatedSplit,
  ): Promise<ExpenseWithRelations>;
  deleteExpense(expenseId: string): Promise<void>;
}

const globalForExpensesRepo = globalThis as unknown as {
  splitzyExpensesRepository?: ExpensesRepository | undefined;
};

/** Test hook: substitute an in-memory repository (no PostgreSQL needed). */
export function setExpensesRepositoryForTests(
  repository: ExpensesRepository,
): void {
  globalForExpensesRepo.splitzyExpensesRepository = repository;
}

export function resetExpensesRepositoryForTests(): void {
  globalForExpensesRepo.splitzyExpensesRepository = undefined;
}

export function expensesRepository(): ExpensesRepository {
  if (globalForExpensesRepo.splitzyExpensesRepository) {
    return globalForExpensesRepo.splitzyExpensesRepository;
  }
  if (!prismaRepoSingleton) {
    prismaRepoSingleton = createPrismaExpensesRepository();
  }
  return prismaRepoSingleton;
}

let prismaRepoSingleton: ExpensesRepository | null = null;

function createPrismaExpensesRepository(): ExpensesRepository {
  // getPrismaClient() is lazy (see services/db.ts) — importing is free and
  // constructing the client only happens on first real use.
  const prisma = getPrismaClient();

  const expenseInclude = {
    participants: {
      orderBy: [{ createdAt: 'asc' } as Prisma.ExpenseParticipantOrderByWithRelationInput],
      include: { user: true },
    },
    items: {
      orderBy: [{ createdAt: 'asc' } as Prisma.ExpenseItemOrderByWithRelationInput],
      include: {
        participants: {
          orderBy: [{ createdAt: 'asc' } as Prisma.ExpenseItemParticipantOrderByWithRelationInput],
          include: { user: true },
        },
      },
    },
    paidBy: true,
    createdBy: true,
  } satisfies Prisma.ExpenseInclude;

  /** Prisma query result shape for an expense with all relations. */
  type ExpenseRow = Prisma.ExpenseGetPayload<{ include: typeof expenseInclude }>;

  /** Reshape Prisma's flat include result into ExpenseWithRelations. */
  function toRelations(row: ExpenseRow): ExpenseWithRelations {
    return {
      expense: row,
      participants: row.participants,
      items: row.items,
      paidBy: row.paidBy,
      createdBy: row.createdBy,
    };
  }

  /**
   * Load one expense with all relations through the given database handle.
   * Accepts either the main Prisma client or an interactive-transaction
   * client: re-loads inside create/update transactions MUST go through the
   * transaction's own connection, because a separate pool connection cannot
   * see the transaction's uncommitted writes (PostgreSQL READ COMMITTED).
   * Using the main client there made every transactional create/update fail
   * against a real database — invisible to the in-memory test repository,
   * which has no transactions (found and fixed during Task 7).
   */
  async function loadOneWith(
    db: Prisma.TransactionClient | ReturnType<typeof getPrismaClient>,
    expenseId: string,
  ): Promise<ExpenseWithRelations> {
    const row = await db.expense.findUnique({
      where: { id: expenseId },
      include: expenseInclude,
    });
    if (!row) {
      throw new AppError(ErrorCodes.INTERNAL_SERVER_ERROR);
    }
    return toRelations(row);
  }

  return {
    findGroupById(id) {
      return prisma.group.findUnique({ where: { id } });
    },
    async listMemberUserIds(groupId) {
      const rows = await prisma.groupMember.findMany({
        where: { groupId },
        select: { userId: true },
      });
      return new Set(rows.map((r) => r.userId));
    },
    async findExpenseInGroup(expenseId, groupId) {
      const row = await prisma.expense.findFirst({
        where: { id: expenseId, groupId },
        include: expenseInclude,
      });
      return row ? toRelations(row) : null;
    },
    async listExpensesForGroup(groupId) {
      const rows = await prisma.expense.findMany({
        where: { groupId },
        orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
        include: expenseInclude,
      });
      return rows.map(toRelations);
    },
    createExpenseWithRelations(expense, split) {
      return prisma.$transaction(async (tx) => {
        const created = await tx.expense.create({ data: expense });
        await writeSplit(tx, created.id, split);
        return loadOneWith(tx, created.id);
      });
    },
    updateExpenseWithRelations(expenseId, patch, split) {
      return prisma.$transaction(async (tx) => {
        await tx.expense.update({ where: { id: expenseId }, data: patch });
        if (split.participants.length > 0 || split.items.length > 0) {
          // Split touched: replace derived rows wholesale inside the
          // transaction so the final state is always internally consistent.
          await tx.expenseParticipant.deleteMany({ where: { expenseId } });
          await tx.expenseItem.deleteMany({ where: { expenseId } });
          await writeSplit(tx, expenseId, split);
        }
        return loadOneWith(tx, expenseId);
      });
    },
    async deleteExpense(expenseId) {
      // Dependents (participants/items/item-participants) disappear through
      // the schema's Cascade relations — nothing else is touched.
      await prisma.expense.delete({ where: { id: expenseId } });
    },
  };
}

async function writeSplit(
  tx: Prisma.TransactionClient,
  expenseId: string,
  split: ValidatedSplit,
): Promise<void> {
  if (split.participants.length > 0) {
    await tx.expenseParticipant.createMany({
      data: split.participants.map((p) => ({
        expenseId,
        userId: p.userId,
        shareMinor: p.shareMinor,
        percentage: p.percentageBp === null ? null : bpToDecimalString(p.percentageBp),
      })),
    });
  }
  for (const item of split.items) {
    const createdItem = await tx.expenseItem.create({
      data: { expenseId, description: item.description, amountMinor: item.amountMinor },
    });
    if (item.participants.length > 0) {
      await tx.expenseItemParticipant.createMany({
        data: item.participants.map((ip) => ({
          itemId: createdItem.id,
          userId: ip.userId,
          shareMinor: ip.shareMinor,
        })),
      });
    }
  }
}

/** Percentage as a 2-decimal string — Prisma's Decimal accepts it on create. */
function bpToDecimalString(bp: bigint): string {
  const whole = bp / 100n;
  const frac = bp % 100n;
  return `${whole}.${frac.toString().padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Integer parsing helpers (strict — no floats anywhere)
// ---------------------------------------------------------------------------

/** Parse a strict positive integer minor-unit string. Rejects 0, floats, signs. */
export function parseMinorAmount(value: unknown): bigint {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw invalidAmount('amountMinor must be a string of integer minor units');
  }
  const raw = typeof value === 'number' ? String(value) : value;
  if (!/^\d+$/.test(raw)) {
    throw invalidAmount(
      'amountMinor must be an integer in minor units (e.g. "10050" = 100.50)',
    );
  }
  if (raw.length > 1 && raw.startsWith('0')) {
    throw invalidAmount('amountMinor must not have leading zeros');
  }
  const parsed = BigInt(raw);
  if (parsed === 0n) {
    throw invalidAmount('amountMinor must be greater than zero');
  }
  if (parsed > MAX_AMOUNT_MINOR) {
    throw invalidAmount('amountMinor exceeds the maximum supported value');
  }
  return parsed;
}

/** Parse a strict integer basis-point string (0..10000). */
export function parsePercentageBp(value: unknown): bigint {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw bpError('percentageBp must be a string of integer basis points');
  }
  const raw = typeof value === 'number' ? String(value) : value;
  if (!/^\d+$/.test(raw)) {
    throw bpError('percentageBp must be a non-negative integer (basis points)');
  }
  const parsed = BigInt(raw);
  if (parsed > TOTAL_PERCENTAGE_BP) {
    throw bpError('percentageBp cannot exceed 10000 (100%)');
  }
  return parsed;
}

function bpError(message: string): AppError {
  return new AppError(ErrorCodes.VALIDATION_ERROR, {
    message,
    details: { percentages: ['1 bp = 0.01%; totals must equal 10000 bp'] },
  });
}

/** Parse an ISO-8601 date; must be a real date within 2000–2100. */
export function parseExpenseDate(value: unknown): Date {
  if (value === undefined || value === null) {
    return new Date();
  }
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(value)) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, {
      message: 'expenseDate must be an ISO-8601 date string',
      details: { expenseDate: ['Example: 2026-09-19 or 2026-09-19T19:30:00.000Z'] },
    });
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, {
      message: 'expenseDate is not a valid date',
      details: { expenseDate: ['Provide a real calendar date'] },
    });
  }
  const year = parsed.getUTCFullYear();
  if (year < 2000 || year > 2100) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, {
      message: 'expenseDate is outside the supported range',
      details: { expenseDate: ['Year must be between 2000 and 2100'] },
    });
  }
  return parsed;
}

function invalidAmount(message: string): AppError {
  return new AppError(ErrorCodes.VALIDATION_ERROR, {
    message,
    details: { amountMinor: ['Integer minor units, > 0'] },
  });
}

// ---------------------------------------------------------------------------
// Payload validation
// ---------------------------------------------------------------------------

export interface ExpenseInputContext {
  /** Member userIds of the target group (server-computed, never client input). */
  memberUserIds: Set<string>;
  /** The group's configured currency — expenses must match it. */
  groupCurrencyCode: string;
}

export interface ValidatedExpensePayload {
  description: string;
  category: ExpenseCategory;
  amountMinor: bigint;
  currencyCode: string;
  paidById: string;
  splitType: SplitType;
  expenseDate: Date;
  split: ValidatedSplit;
}

function requireObject(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, {
      message: 'Request body must be a JSON object',
    });
  }
  return body as Record<string, unknown>;
}

function requiredString(
  raw: Record<string, unknown>,
  field: string,
  max: number,
): string {
  const value = raw[field];
  if (typeof value !== 'string') {
    throw fieldError(field, `${field} is required`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw fieldError(field, `${field} cannot be blank`);
  }
  if (trimmed.length > max) {
    throw fieldError(field, `${field} must be at most ${max} characters`);
  }
  return trimmed;
}

function fieldError(field: string, message: string): AppError {
  return new AppError(ErrorCodes.VALIDATION_ERROR, {
    message,
    details: { [field]: [message] },
  });
}

function normalizeCategory(value: unknown): ExpenseCategory {
  if (typeof value !== 'string') throw invalidCategory();
  const match = EXPENSE_CATEGORIES.find(
    (c) => c.toLowerCase() === value.trim().toLowerCase(),
  );
  if (!match) throw invalidCategory();
  return match;
}

function invalidCategory(): AppError {
  return new AppError(ErrorCodes.VALIDATION_ERROR, {
    message: 'Unsupported category',
    details: { category: [`Supported: ${EXPENSE_CATEGORIES.join(', ')}`] },
  });
}

function normalizeSplitType(value: unknown): SplitType {
  if (typeof value !== 'string') {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, {
      message: 'splitType must be a string',
      details: { splitType: ['Allowed: EQUAL, PERCENTAGE, ITEMIZED'] },
    });
  }
  const normalized = value.trim().toUpperCase();
  if (
    normalized !== 'EQUAL' &&
    normalized !== 'PERCENTAGE' &&
    normalized !== 'ITEMIZED'
  ) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, {
      message: 'Unsupported splitType',
      details: { splitType: ['Allowed: EQUAL, PERCENTAGE, ITEMIZED'] },
    });
  }
  return normalized;
}

function normalizeCurrency(value: unknown): string {
  if (typeof value !== 'string') {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, {
      message: 'currencyCode must be a string',
      details: {
        currencyCode: [`Supported: ${SUPPORTED_CURRENCY_CODES.join(', ')}`],
      },
    });
  }
  const code = value.trim().toUpperCase();
  if (!(SUPPORTED_CURRENCY_CODES as readonly string[]).includes(code)) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, {
      message: 'Unsupported currency code',
      details: {
        currencyCode: [`Supported: ${SUPPORTED_CURRENCY_CODES.join(', ')}`],
      },
    });
  }
  return code;
}

/** Validate paidByUserId: required, must reference a current group member. */
function validatePaidBy(
  raw: Record<string, unknown>,
  ctx: ExpenseInputContext,
): string {
  const paidBy = raw.paidByUserId;
  if (typeof paidBy !== 'string' || paidBy.trim().length === 0) {
    throw fieldError('paidByUserId', 'paidByUserId is required');
  }
  const userId = paidBy.trim();
  if (!ctx.memberUserIds.has(userId)) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, {
      message: 'paidByUserId must be a current member of the group',
      details: { paidByUserId: ['Unknown or non-member user'] },
    });
  }
  return userId;
}

/** Validate a plain userId list: non-empty, all members, unique. */
export function validateUserIdList(
  value: unknown,
  field: string,
  ctx: ExpenseInputContext,
): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, {
      message: `${field} must contain at least one member`,
      details: { [field]: ['At least one participant is required'] },
    });
  }
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.trim().length === 0) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, {
        message: `${field} entries must be user ids`,
        details: { [field]: ['Every entry must be a non-empty user id string'] },
      });
    }
    const userId = entry.trim();
    if (!ctx.memberUserIds.has(userId)) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, {
        message: `${field} contains a user who is not a member of this group`,
        details: { [field]: [`Unknown or non-member user: ${userId}`] },
      });
    }
    if (seen.has(userId)) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, {
        message: `${field} contains a duplicate user`,
        details: { [field]: [`Duplicate user: ${userId}`] },
      });
    }
    seen.add(userId);
  }
  return [...seen];
}

/** Integer floor-division; `absorberIndex` receives the rounding remainder. */
export function divideEvenly(
  total: bigint,
  parts: number,
  absorberIndex: number,
): bigint[] {
  const base = total / BigInt(parts);
  const remainder = total - base * BigInt(parts);
  const shares = Array.from({ length: parts }, () => base);
  shares[absorberIndex]! += remainder;
  return shares;
}

// ---------------------------------------------------------------------------
// Split validation (per split type) — the heart of Task 6
// ---------------------------------------------------------------------------

/** EQUAL: allocations are computed by the server, never trusted from client. */
export function validateEqualSplit(
  amountMinor: bigint,
  participantUserIds: string[],
): ValidatedSplit {
  const shares = divideEvenly(
    amountMinor,
    participantUserIds.length,
    participantUserIds.length - 1,
  );
  return {
    splitType: 'EQUAL',
    participants: participantUserIds.map((userId, index) => ({
      userId,
      shareMinor: shares[index]!,
      percentageBp: null,
    })),
    items: [],
  };
}

/** PERCENTAGE: total must be exactly 10000 bp; shares reconcile exactly. */
export function validatePercentageSplit(
  amountMinor: bigint,
  entries: Array<{ userId: string; percentageBp: bigint }>,
): ValidatedSplit {
  const totalBp = entries.reduce((sum, e) => sum + e.percentageBp, 0n);
  if (totalBp !== TOTAL_PERCENTAGE_BP) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, {
      message: 'Percentages must total exactly 100%',
      details: {
        percentages: [
          `Total is ${bpToLabel(totalBp)} — expected ${bpToLabel(TOTAL_PERCENTAGE_BP)}`,
        ],
      },
    });
  }
  const participants = entries.map((e) => ({
    userId: e.userId,
    shareMinor: (amountMinor * e.percentageBp) / TOTAL_PERCENTAGE_BP,
    percentageBp: e.percentageBp,
  }));
  // Deterministic remainder: the largest percentage (ties → earlier entry)
  // absorbs leftover minor units so the sum is exactly amountMinor.
  const allocated = participants.reduce((sum, p) => sum + p.shareMinor, 0n);
  const remainder = amountMinor - allocated;
  if (remainder > 0n) {
    let bestIndex = 0;
    for (let i = 1; i < participants.length; i += 1) {
      if (participants[i]!.percentageBp! > participants[bestIndex]!.percentageBp!) {
        bestIndex = i;
      }
    }
    participants[bestIndex]!.shareMinor += remainder;
  }
  return { splitType: 'PERCENTAGE', participants, items: [] };
}

function bpToLabel(bp: bigint): string {
  const whole = bp / 100n;
  const frac = bp % 100n;
  return `${whole}.${frac.toString().padStart(2, '0')}%`;
}

/** ITEMIZED: every level must reconcile exactly to the expense total. */
export function validateItemizedSplit(
  amountMinor: bigint,
  rawItems: unknown,
  ctx: ExpenseInputContext,
): ValidatedSplit {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, {
      message: 'ITEMIZED expenses require at least one item',
      details: { items: ['Add at least one item'] },
    });
  }

  // NOTE: unlike a single participant list, one user MAY appear on several
  // items (frontend allows user on Pizza AND Burger); duplicates are only
  // rejected within a single item (validateUserIdList handles that).
  const items: ValidatedSplit['items'] = [];
  let itemsTotal = 0n;

  rawItems.forEach((rawItem, itemIndex) => {
    if (typeof rawItem !== 'object' || rawItem === null) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, {
        message: 'Each item must be an object',
        details: { [`items[${itemIndex}]`]: ['Invalid item structure'] },
      });
    }
    const item = rawItem as Record<string, unknown>;

    const description = requiredString(item, 'name', ITEM_NAME_MAX);
    const itemAmount = parseMinorAmount(item.amountMinor);
    itemsTotal += itemAmount;

    const participantUserIds = validateUserIdList(
      item.participantUserIds,
      `items[${itemIndex}].participantUserIds`,
      ctx,
    );
    const shares = divideEvenly(
      itemAmount,
      participantUserIds.length,
      participantUserIds.length - 1,
    );
    items.push({
      description,
      amountMinor: itemAmount,
      participants: participantUserIds.map((userId, index) => ({
        userId,
        shareMinor: shares[index]!,
      })),
    });
  });

  if (itemsTotal !== amountMinor) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, {
      message: 'Item amounts must sum to the expense total exactly',
      details: {
        items: [
          `Items total ${itemsTotal} minor units — expense total is ${amountMinor}`,
        ],
      },
    });
  }

  // Expense participants derive from item shares (frontend getShares
  // semantics): one row per user, share = sum of that user's item shares.
  const totalsByUser = new Map<string, bigint>();
  for (const item of items) {
    for (const ip of item.participants) {
      totalsByUser.set(ip.userId, (totalsByUser.get(ip.userId) ?? 0n) + ip.shareMinor);
    }
  }
  const participants = [...totalsByUser.entries()].map(([userId, shareMinor]) => ({
    userId,
    shareMinor,
    percentageBp: null,
  }));

  return { splitType: 'ITEMIZED', participants, items };
}

/** Validate only the split portion (amount + splitType + split fields).
 *  Shared by the full create payload and the PATCH merge-revalidation path
 *  (which must NOT demand create-only fields like description/paidByUserId). */
function validateSplitOnly(
  amountMinor: bigint,
  splitType: SplitType,
  raw: Record<string, unknown>,
  ctx: ExpenseInputContext,
): ValidatedSplit {
  if (splitType === 'EQUAL') {
    const participantUserIds = validateUserIdList(raw.participants, 'participants', ctx);
    return validateEqualSplit(amountMinor, participantUserIds);
  }
  if (splitType === 'PERCENTAGE') {
    return validatePercentageSplitFromRaw(raw, amountMinor, ctx);
  }
  return validateItemizedSplit(amountMinor, raw.items, ctx);
}

/** Validate a complete create payload against server-side rules. */
export function validateExpensePayload(
  body: unknown,
  ctx: ExpenseInputContext,
): ValidatedExpensePayload {
  const raw = requireObject(body);

  const description = requiredString(raw, 'description', EXPENSE_DESCRIPTION_MAX);
  const category = normalizeCategory(raw.category ?? 'Other');
  const amountMinor = parseMinorAmount(raw.amountMinor);
  const currencyCode = normalizeCurrency(
    raw.currencyCode ?? ctx.groupCurrencyCode,
  );
  if (currencyCode !== ctx.groupCurrencyCode) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, {
      message: 'Expense currency must match the group currency',
      details: {
        currencyCode: [`Group uses ${ctx.groupCurrencyCode}; got ${currencyCode}`],
      },
    });
  }
  const paidById = validatePaidBy(raw, ctx);
  const splitType = normalizeSplitType(raw.splitType ?? 'EQUAL');
  const expenseDate = parseExpenseDate(raw.expenseDate);

  const split = validateSplitOnly(amountMinor, splitType, raw, ctx);

  return {
    description,
    category,
    amountMinor,
    currencyCode,
    paidById,
    splitType,
    expenseDate,
    split,
  };
}

function validatePercentageSplitFromRaw(
  raw: Record<string, unknown>,
  amountMinor: bigint,
  ctx: ExpenseInputContext,
): ValidatedSplit {
  const rawMap = raw.percentages;
  if (typeof rawMap !== 'object' || rawMap === null || Array.isArray(rawMap)) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, {
      message: 'PERCENTAGE expenses require a percentages object',
      details: { percentages: ['Map of userId -> percentageBp (integer basis points)'] },
    });
  }
  const entries: Array<{ userId: string; percentageBp: bigint }> = [];
  const seen = new Set<string>();
  for (const [userId, bpValue] of Object.entries(rawMap as Record<string, unknown>)) {
    if (!ctx.memberUserIds.has(userId)) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, {
        message: 'percentages contains a user who is not a member of this group',
        details: { percentages: [`Unknown or non-member user: ${userId}`] },
      });
    }
    if (seen.has(userId)) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, {
        message: 'percentages contains a duplicate user',
        details: { percentages: [`Duplicate user: ${userId}`] },
      });
    }
    seen.add(userId);
    entries.push({ userId, percentageBp: parsePercentageBp(bpValue) });
  }
  if (entries.length === 0) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, {
      message: 'PERCENTAGE expenses require at least one participant',
      details: { percentages: ['At least one participant is required'] },
    });
  }
  return validatePercentageSplit(amountMinor, entries);
}

// ---------------------------------------------------------------------------
// Update policy + payload
// ---------------------------------------------------------------------------

/** True when the actor may edit/delete (creator or group OWNER/ADMIN). */
export function canModifyExpense(
  actorUserId: string,
  actorRole: 'OWNER' | 'ADMIN' | 'MEMBER',
  expense: Pick<Expense, 'createdById'>,
): boolean {
  return (
    actorRole === 'OWNER' ||
    actorRole === 'ADMIN' ||
    (expense.createdById !== null && expense.createdById === actorUserId)
  );
}

/**
 * Validate a PATCH payload. Identity/server fields in the body are ignored
 * (id, groupId, createdById, createdAt, updatedAt are never read). When the
 * split is touched, the FULL merged split must re-reconcile: the caller
 * supplies currentValues so omitted split fields are taken from the stored
 * expense — a partial split update can never produce an invalid state.
 */
export function validateExpensePatch(
  body: unknown,
  ctx: ExpenseInputContext,
  current: {
    amountMinor: bigint;
    currencyCode: string;
    splitType: SplitType;
    participants: string[];
    percentages: Record<string, string> | null;
    items: Array<{ name: unknown; amountMinor: unknown; participantUserIds: unknown }> | null;
  },
): { fields: ExpenseUpdateData; split: ValidatedSplit } {
  const raw = requireObject(body);

  const fields: ExpenseUpdateData = {};

  if (raw.description !== undefined) {
    fields.description = requiredString(raw, 'description', EXPENSE_DESCRIPTION_MAX);
  }
  if (raw.category !== undefined) {
    fields.category = normalizeCategory(raw.category);
  }
  if (raw.expenseDate !== undefined) {
    fields.expenseDate = parseExpenseDate(raw.expenseDate);
  }
  if (raw.paidByUserId !== undefined) {
    fields.paidById = validatePaidBy(raw, ctx);
  }

  const touchesSplit =
    raw.amountMinor !== undefined ||
    raw.splitType !== undefined ||
    raw.participants !== undefined ||
    raw.percentages !== undefined ||
    raw.items !== undefined;

  let split: ValidatedSplit;
  if (touchesSplit) {
    // Merge: client values win, stored values fill the gaps, then the whole
    // split re-validates. The currency always stays the group's currency.
    const amountMinor = raw.amountMinor !== undefined
      ? parseMinorAmount(raw.amountMinor)
      : current.amountMinor;
    const splitType = raw.splitType !== undefined
      ? normalizeSplitType(raw.splitType)
      : current.splitType;
    // The Expense row itself must follow the new split state.
    fields.amountMinor = amountMinor;
    fields.splitType = splitType;

    const merged: Record<string, unknown> = {
      amountMinor: amountMinor.toString(),
      splitType,
      currencyCode: ctx.groupCurrencyCode,
    };
    if (splitType === 'EQUAL') {
      merged.participants = raw.participants ?? current.participants;
    } else if (splitType === 'PERCENTAGE') {
      merged.percentages = raw.percentages ?? current.percentages;
    } else {
      merged.items = raw.items ?? current.items;
    }
    // Validate ONLY the split — create-only fields (description, paidBy, date)
    // are irrelevant here and the patch may not carry them.
    split = validateSplitOnly(amountMinor, splitType, merged, ctx);
  } else if (Object.keys(fields).length === 0) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, {
      message: 'No updatable fields provided',
      details: {
        body: [
          'Provide any of: description, category, expenseDate, paidByUserId, or split fields (amountMinor, splitType, participants/percentages/items)',
        ],
      },
    });
  } else {
    // Fields-only patch: existing rows stay untouched.
    split = {
      splitType: current.splitType,
      participants: [],
      items: [],
    };
  }

  return { fields, split };
}

// ---------------------------------------------------------------------------
// Use cases (controllers call these behind authorization middleware)
// ---------------------------------------------------------------------------

export async function createExpense(
  groupId: string,
  actor: { user: User },
  body: unknown,
): Promise<PublicExpense> {
  const repo = expensesRepository();
  const group = await repo.findGroupById(groupId);
  if (!group) {
    throw new AppError(ErrorCodes.NOT_FOUND, { message: 'Group not found' });
  }
  const memberUserIds = await repo.listMemberUserIds(groupId);
  const payload = validateExpensePayload(body, {
    memberUserIds,
    groupCurrencyCode: group.currencyCode,
  });

  const created = await repo.createExpenseWithRelations(
    {
      groupId,
      description: payload.description,
      category: payload.category,
      amountMinor: payload.amountMinor,
      currencyCode: payload.currencyCode,
      paidById: payload.paidById,
      splitType: payload.splitType,
      expenseDate: payload.expenseDate,
      createdById: actor.user.id, // verified identity — never client input
    },
    payload.split,
  );
  return serializeExpense(created);
}

export async function listExpenses(groupId: string): Promise<PublicExpense[]> {
  const rows = await expensesRepository().listExpensesForGroup(groupId);
  return rows.map(serializeExpense);
}

/** Detail use case: the middleware already loaded and scope-checked the row. */
export function getExpense(relations: ExpenseWithRelations): PublicExpense {
  return serializeExpense(relations);
}

export async function updateExpense(
  relations: ExpenseWithRelations,
  body: unknown,
): Promise<PublicExpense> {
  const repo = expensesRepository();
  const groupId = relations.expense.groupId;
  const group = await repo.findGroupById(groupId);
  if (!group) {
    throw new AppError(ErrorCodes.NOT_FOUND, { message: 'Group not found' });
  }
  const ctx: ExpenseInputContext = {
    memberUserIds: await repo.listMemberUserIds(groupId),
    groupCurrencyCode: group.currencyCode,
  };
  const expense = relations.expense;
  const { fields, split } = validateExpensePatch(body, ctx, {
    amountMinor: expense.amountMinor,
    currencyCode: expense.currencyCode,
    splitType: expense.splitType,
    participants: relations.participants
      .map((p) => p.userId)
      .filter((id): id is string => id !== null),
    percentages: buildCurrentPercentages(relations),
    items: relations.items.map((item) => ({
      name: item.description,
      amountMinor: item.amountMinor.toString(),
      participantUserIds: item.participants
        .map((ip) => ip.userId)
        .filter((id): id is string => id !== null),
    })),
  });

  const updated = await repo.updateExpenseWithRelations(
    expense.id,
    fields,
    split,
  );
  return serializeExpense(updated);
}

function buildCurrentPercentages(
  relations: ExpenseWithRelations,
): Record<string, string> | null {
  const map: Record<string, string> = {};
  for (const p of relations.participants) {
    if (!p.userId || p.percentage === null || p.percentage === undefined) continue;
    // Prisma Decimal exposes toFixed; plain numbers fall back to String.
    const label =
      typeof p.percentage === 'object' && p.percentage !== null && 'toFixed' in p.percentage
        ? (p.percentage as { toFixed(d: number): string }).toFixed(2)
        : String(p.percentage);
    const [whole, frac = '00'] = label.split('.');
    map[p.userId] = `${whole ?? '0'}${frac.padEnd(2, '0').slice(0, 2)}`;
  }
  return Object.keys(map).length > 0 ? map : null;
}

export async function deleteExpense(expenseId: string): Promise<void> {
  await expensesRepository().deleteExpense(expenseId);
}

// ---------------------------------------------------------------------------
// Serialization (safe public projection)
// ---------------------------------------------------------------------------

function actorRef(
  user: User | null,
): { userId: string | null; displayName: string } | null {
  if (!user) return null;
  return { userId: user.id, displayName: user.name };
}

function decimalLabel(value: ExpenseParticipant['percentage']): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object' && value !== null && 'toFixed' in value) {
    return (value as { toFixed(d: number): string }).toFixed(2);
  }
  return String(value);
}

function serializeParticipant(
  participant: ExpenseParticipant & { user: User | null },
): PublicExpenseParticipant {
  return {
    userId: participant.userId,
    displayName: participant.user?.name ?? 'Former member',
    shareMinor: participant.shareMinor.toString(),
    percentage: decimalLabel(participant.percentage),
  };
}

function serializeItem(
  item: ExpenseItem & {
    participants: Array<ExpenseItemParticipant & { user: User | null }>;
  },
): PublicExpenseItem {
  return {
    id: item.id,
    description: item.description,
    amountMinor: item.amountMinor.toString(),
    participants: item.participants.map((ip) => ({
      userId: ip.userId,
      displayName: ip.user?.name ?? 'Former member',
      shareMinor: ip.shareMinor.toString(),
    })),
  };
}

/** Safe public projection of an expense with all relations. */
export function serializeExpense(relations: ExpenseWithRelations): PublicExpense {
  const { expense, participants, items, paidBy, createdBy } = relations;
  return {
    id: expense.id,
    groupId: expense.groupId,
    description: expense.description,
    category: expense.category,
    amountMinor: expense.amountMinor.toString(),
    currencyCode: expense.currencyCode,
    splitType: expense.splitType,
    expenseDate: expense.expenseDate.toISOString(),
    createdAt: expense.createdAt.toISOString(),
    updatedAt: expense.updatedAt.toISOString(),
    paidBy: actorRef(paidBy),
    createdBy: actorRef(createdBy),
    participants: participants.map(serializeParticipant),
    items: items.map(serializeItem),
  };
}
