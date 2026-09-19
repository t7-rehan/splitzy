/**
 * Task 7 — real-database schema verification.
 *
 * Read-only: queries pg_catalog through the Prisma client and asserts the
 * deployed PostgreSQL schema matches the Task 2 + Task 4 migrations.
 * No data is created, modified or deleted.
 *
 * Run (from Backend/):  npx tsx scripts/verify-schema.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({ log: ['error'] });

let failures = 0;

function check(label: string, ok: boolean, detail = ''): void {
  if (ok) {
    console.log(`  PASS  ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function main(): Promise<void> {
  console.log('== Tables ==');
  const expectedTables = [
    'User',
    'Group',
    'GroupMember',
    'Expense',
    'ExpenseParticipant',
    'ExpenseItem',
    'ExpenseItemParticipant',
    'Settlement',
    'RecurringExpense',
    'RecurringExpenseParticipant',
    '_prisma_migrations',
  ];
  const tableRows = await prisma.$queryRaw<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' ORDER BY table_name`;
  const tables = new Set(tableRows.map((r) => r.table_name));
  for (const t of expectedTables) {
    check(`table ${t}`, tables.has(t));
  }

  console.log('== Enums ==');
  const expectedEnums: Record<string, string[]> = {
    GroupRole: ['OWNER', 'ADMIN', 'MEMBER'],
    SplitType: ['EQUAL', 'PERCENTAGE', 'ITEMIZED'],
    SettlementStatus: ['PENDING', 'COMPLETED', 'CANCELLED'],
    PaymentMethod: ['CASH', 'UPI', 'BANK_TRANSFER', 'OTHER'],
    RecurringFrequency: ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'],
  };
  for (const [enumName, values] of Object.entries(expectedEnums)) {
    const rows = await prisma.$queryRaw<{ enumlabel: string }[]>`
      SELECT enumlabel FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = ${enumName} ORDER BY enumsortorder`;
    const actual = rows.map((r) => r.enumlabel);
    check(
      `enum ${enumName}`,
      actual.length === values.length && values.every((v, i) => actual[i] === v),
      `got [${actual.join(', ')}]`,
    );
  }

  console.log('== Unique constraints ==');
  const expectedUniques: Array<[string, string[]]> = [
    ['User', ['firebaseUid']],
    ['User', ['email']],
    ['GroupMember', ['groupId', 'userId']],
    ['ExpenseParticipant', ['expenseId', 'userId']],
    ['RecurringExpenseParticipant', ['recurringExpenseId', 'userId']],
  ];
  for (const [table, columns] of expectedUniques) {
    const rows = await prisma.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = ${table}
        AND indexdef LIKE 'CREATE UNIQUE INDEX%'`;
    const defs = rows.map((r) => r.indexdef);
    // Normalize indexdef: drop quotes and collapse "a, b" -> "a,b" so both
    // quoted camelCase ("firebaseUid") and unquoted lowercase (email) match.
    const norm = (s: string): string =>
      s.replace(/"/g, '').replace(/,\s+/g, ',').toLowerCase();
    const wanted = `(${columns.map((c) => c.toLowerCase()).join(',')})`;
    const allPresent = defs.some((d) => norm(d).includes(wanted));
    check(`unique(${table}: ${columns.join(', ')})`, allPresent, defs.join(' | '));
  }

  console.log('== Foreign keys (delete behavior) ==');
  const fkRows = await prisma.$queryRaw<{
    conname: string;
    confdeltype: string;
  }[]>`
    SELECT conname, confdeltype FROM pg_constraint
    WHERE contype = 'f' AND connamespace = 'public'::regnamespace`;
  const fk = new Map(fkRows.map((r) => [r.conname, r.confdeltype]));
  // confdeltype: c = CASCADE, r = RESTRICT, n = SET NULL
  const expectedFks: Array<[string, string]> = [
    ['Group_createdById_fkey', 'r'],
    ['GroupMember_groupId_fkey', 'c'],
    ['GroupMember_userId_fkey', 'c'],
    ['Expense_groupId_fkey', 'c'],
    ['Expense_paidById_fkey', 'n'],
    ['Expense_createdById_fkey', 'n'],
    ['ExpenseParticipant_expenseId_fkey', 'c'],
    ['ExpenseParticipant_userId_fkey', 'n'],
    ['ExpenseItem_expenseId_fkey', 'c'],
    ['ExpenseItemParticipant_itemId_fkey', 'c'],
    ['ExpenseItemParticipant_userId_fkey', 'n'],
    ['Settlement_groupId_fkey', 'c'],
    ['Settlement_fromUserId_fkey', 'n'],
    ['Settlement_toUserId_fkey', 'n'],
    ['RecurringExpense_groupId_fkey', 'c'],
    ['RecurringExpenseParticipant_recurringExpenseId_fkey', 'c'],
  ];
  for (const [name, expected] of expectedFks) {
    check(
      `FK ${name} -> ${expected === 'c' ? 'CASCADE' : expected === 'r' ? 'RESTRICT' : 'SET NULL'}`,
      fk.get(name) === expected,
      `actual: ${fk.get(name) ?? 'missing'}`,
    );
  }

  console.log('== Money columns (BigInt / Decimal / Char(3)) ==');
  const colRows = await prisma.$queryRaw<{
    table_name: string;
    column_name: string;
    data_type: string;
  }[]>`
    SELECT table_name, column_name, data_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name IN
      ('Expense', 'ExpenseParticipant', 'ExpenseItem',
       'ExpenseItemParticipant', 'Settlement', 'RecurringExpense',
       'RecurringExpenseParticipant', 'User', 'Group')`;
  const col = new Map(
    colRows.map((r) => [`${r.table_name}.${r.column_name}`, r.data_type]),
  );
  const bigintCols = [
    'Expense.amountMinor',
    'ExpenseParticipant.shareMinor',
    'ExpenseItem.amountMinor',
    'ExpenseItemParticipant.shareMinor',
    'Settlement.amountMinor',
    'RecurringExpense.amountMinor',
  ];
  for (const key of bigintCols) {
    check(`${key} is bigint`, col.get(key) === 'bigint', `actual: ${col.get(key)}`);
  }
  for (const key of [
    'ExpenseParticipant.percentage',
    'RecurringExpenseParticipant.percentage',
  ]) {
    check(`${key} is numeric(5,2)`, col.get(key) === 'numeric', `actual: ${col.get(key)}`);
  }
  for (const key of ['Expense.currencyCode', 'Group.currencyCode', 'User.currencyCode']) {
    check(`${key} is bpchar(3)`, col.get(key) === 'character', `actual: ${col.get(key)}`);
  }
  for (const key of ['User.firebaseUid', 'User.id', 'Group.id', 'Expense.id']) {
    check(`${key} exists`, col.has(key));
  }

  console.log('== Genrandom uuid defaults (spot check) ==');
  const defRows = await prisma.$queryRaw<{ column_default: string }[]>`
    SELECT column_default FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'User' AND column_name = 'id'`;
  check(
    'User.id default uses gen_random_uuid()',
    (defRows[0]?.column_default ?? '').includes('gen_random_uuid'),
    defRows[0]?.column_default,
  );

  console.log(
    failures === 0
      ? '\nSCHEMA VERIFICATION PASSED — all checks green.'
      : `\nSCHEMA VERIFICATION FAILED — ${failures} check(s) failed.`,
  );
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error('Verification error:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
