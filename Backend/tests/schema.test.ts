import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// Task 2: schema shape checks. These intentionally do NOT connect to
// PostgreSQL — they verify that the generated Prisma Client exposes the
// Task 2 models and enums the rest of the application will build on.

import {
  GroupRole,
  PaymentMethod,
  RecurringFrequency,
  SettlementStatus,
  SplitType,
  Prisma,
} from '@prisma/client';

describe('Prisma schema (Task 2)', () => {
  it('exposes all ten Task 2 models in Prisma.ModelName', () => {
    const modelNames = [
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
    ];
    for (const name of modelNames) {
      assert.ok(
        name in Prisma.ModelName,
        `Prisma.ModelName should contain ${name}`,
      );
    }
  });

  it('defines the expected enum values', () => {
    assert.deepEqual(Object.values(GroupRole), ['OWNER', 'ADMIN', 'MEMBER']);
    assert.deepEqual(Object.values(SplitType), [
      'EQUAL',
      'PERCENTAGE',
      'ITEMIZED',
    ]);
    assert.deepEqual(Object.values(SettlementStatus), [
      'PENDING',
      'COMPLETED',
      'CANCELLED',
    ]);
    assert.deepEqual(Object.values(PaymentMethod), [
      'CASH',
      'UPI',
      'BANK_TRANSFER',
      'OTHER',
    ]);
    assert.deepEqual(Object.values(RecurringFrequency), [
      'DAILY',
      'WEEKLY',
      'MONTHLY',
      'YEARLY',
    ]);
  });

  it('types money fields as BigInt (minor units, never floats)', () => {
    // Compiles only if amountMinor/shareMinor are BigInt-typed fields.
    const data: Prisma.ExpenseUncheckedCreateInput = {
      groupId: '00000000-0000-0000-0000-000000000000',
      description: 'Type probe',
      category: 'Food',
      amountMinor: 10050n,
      currencyCode: 'INR',
      splitType: SplitType.EQUAL,
      participants: {
        create: [{ userId: null, shareMinor: 2513n, percentage: null }],
      },
    };
    assert.equal(typeof data.amountMinor, 'bigint');
    assert.equal(data.amountMinor, 10_050n);
  });

  it('keeps the Task 1 lazy Prisma singleton usable', async () => {
    const { disconnectPrisma } = await import('../src/services/db.js');
    // Disconnect without ever connecting: instantiating the client must not
    // require a live database.
    await assert.doesNotReject(disconnectPrisma);
  });
});
