import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type {
  Expense,
  ExpenseItem,
  ExpenseItemParticipant,
  ExpenseParticipant,
  Group,
  GroupMember,
  GroupRole,
  User,
} from '@prisma/client';
import { createApp } from '../src/app.js';
import { resetEnvCacheForTests } from '../src/config/env.js';
import {
  resetUserRepositoryForTests,
  setUserRepositoryForTests,
  type UserRepository,
} from '../src/services/currentUserService.js';
import {
  resetGroupsRepositoryForTests,
  setGroupsRepositoryForTests,
  type GroupsRepository,
  type GroupCreateData,
  type GroupUpdateData,
} from '../src/services/groups.service.js';
import {
  resetExpensesRepositoryForTests,
  setExpensesRepositoryForTests,
  type ExpensesRepository,
  type ExpenseCreateData,
  type ExpenseUpdateData,
  type ValidatedSplit,
} from '../src/services/expenses.service.js';

/**
 * Task 6 Expenses API tests.
 *
 * No real Firebase, no PostgreSQL: one shared in-memory database backs the
 * Task 4 user repo, Task 5 groups repo and Task 6 expenses repo, faithfully
 * emulating schema constraints (unique firebaseUid, unique (groupId, userId),
 * unique (expenseId, userId), P2002). All scenarios run through the real HTTP
 * chain: requireAuth -> requireActor -> loadGroupMembership -> expenses router.
 */

interface ErrorEnvelope {
  success: false;
  error: { code: string; message: string };
}

interface ExpenseData {
  id: string;
  groupId: string;
  description: string;
  category: string;
  amountMinor: string;
  currencyCode: string;
  splitType: string;
  expenseDate: string;
  createdAt: string;
  updatedAt: string;
  paidBy: { userId: string; displayName: string } | null;
  createdBy: { userId: string; displayName: string } | null;
  participants: Array<{
    userId: string | null;
    displayName: string;
    shareMinor: string;
    percentage: string | null;
  }>;
  items: Array<{
    id: string;
    description: string;
    amountMinor: string;
    participants: Array<{ userId: string | null; displayName: string; shareMinor: string }>;
  }>;
}

type ApiResponse =
  | { success: true; data: ExpenseData | ExpenseData[] | Record<string, unknown> }
  // `data?: undefined` on the failure branch lets tests read `.data` after a
  // status assertion without repeating narrowing at every call site.
  | (ErrorEnvelope & { data?: undefined });

const now = () => new Date();

// ---------------------------------------------------------------------------
// Shared in-memory database
// ---------------------------------------------------------------------------

interface Db {
  users: Map<string, User>;
  groups: Map<string, Group>;
  memberships: Map<string, GroupMember>; // key: groupId|userId
  expenses: Map<string, Expense>;
  expenseParticipants: Map<string, ExpenseParticipant>; // key: expenseId|userId
  expenseItems: Map<string, ExpenseItem>;
  itemParticipants: Map<string, ExpenseItemParticipant>; // key: itemId|userId
}

function makeDb(): Db {
  return {
    users: new Map(),
    groups: new Map(),
    memberships: new Map(),
    expenses: new Map(),
    expenseParticipants: new Map(),
    expenseItems: new Map(),
    itemParticipants: new Map(),
  };
}

let db: Db = makeDb();
let idSeq = 0;
const nextId = (prefix: string) => `${prefix}-${++idSeq}`;
const mKey = (a: string, b: string) => `${a}|${b}`;

function makeUser(overrides: Partial<User> = {}): User {
  const id = overrides.id ?? nextId('user');
  const user: User = {
    id,
    firebaseUid: overrides.firebaseUid ?? `firebase-${id}`,
    email: overrides.email ?? `${id}@example.com`,
    name: overrides.name ?? `User ${id}`,
    photoUrl: overrides.photoUrl ?? null,
    avatarId: overrides.avatarId ?? 'avatar_cool',
    currencyCode: overrides.currencyCode ?? 'INR',
    timezone: overrides.timezone ?? 'UTC',
    createdAt: overrides.createdAt ?? now(),
    updatedAt: overrides.updatedAt ?? now(),
  };
  db.users.set(user.id, user);
  return user;
}

function makeGroup(overrides: Partial<Group> & { createdById: string }): Group {
  const id = overrides.id ?? nextId('group');
  const group: Group = {
    id,
    name: overrides.name ?? 'Group',
    description: overrides.description ?? null,
    currencyCode: overrides.currencyCode ?? 'INR',
    isRoommateGroup: overrides.isRoommateGroup ?? false,
    createdById: overrides.createdById,
    createdAt: overrides.createdAt ?? now(),
    updatedAt: overrides.updatedAt ?? now(),
  };
  db.groups.set(group.id, group);
  return group;
}

function assertNoDuplicateMembership(groupId: string, userId: string): void {
  if (db.memberships.has(mKey(groupId, userId))) {
    throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
  }
}

function makeMembership(groupId: string, userId: string, role: GroupRole): GroupMember {
  assertNoDuplicateMembership(groupId, userId);
  const member: GroupMember = {
    id: nextId('member'),
    groupId,
    userId,
    role,
    joinedAt: now(),
  };
  db.memberships.set(mKey(groupId, userId), member);
  return member;
}

function makeExpenseRow(data: ExpenseCreateData): Expense {
  const expense: Expense = {
    id: nextId('expense'),
    groupId: data.groupId,
    description: data.description,
    category: data.category,
    amountMinor: data.amountMinor,
    currencyCode: data.currencyCode,
    paidById: data.paidById,
    splitType: data.splitType,
    expenseDate: data.expenseDate,
    createdById: data.createdById,
    createdAt: now(),
    updatedAt: now(),
  };
  db.expenses.set(expense.id, expense);
  return expense;
}

function makeParticipantRow(
  expenseId: string,
  userId: string,
  shareMinor: bigint,
  percentageBp: bigint | null,
): ExpenseParticipant {
  const key = mKey(expenseId, userId);
  if (db.expenseParticipants.has(key)) {
    throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
  }
  const row: ExpenseParticipant = {
    id: nextId('ep'),
    expenseId,
    userId,
    shareMinor,
    percentage:
      percentageBp === null
        ? null
        : (
            // Emulate Prisma's Decimal with a plain object carrying toFixed.
            {
              toFixed: () =>
                `${percentageBp / 100n}.${(percentageBp % 100n).toString().padStart(2, '0')}`,
            } as unknown as ExpenseParticipant['percentage']
          ),
    createdAt: now(),
  };
  db.expenseParticipants.set(key, row);
  return row;
}

function makeItemRow(expenseId: string, description: string, amountMinor: bigint): ExpenseItem {
  const item: ExpenseItem = {
    id: nextId('item'),
    expenseId,
    description,
    amountMinor,
    createdAt: now(),
    updatedAt: now(),
  };
  db.expenseItems.set(item.id, item);
  return item;
}

function makeItemParticipantRow(
  itemId: string,
  userId: string,
  shareMinor: bigint,
): ExpenseItemParticipant {
  const key = mKey(itemId, userId);
  if (db.itemParticipants.has(key)) {
    throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
  }
  const row: ExpenseItemParticipant = {
    id: nextId('eip'),
    itemId,
    userId,
    shareMinor,
    createdAt: now(),
  };
  db.itemParticipants.set(key, row);
  return row;
}

function writeSplitRows(expenseId: string, split: ValidatedSplit): void {
  for (const p of split.participants) {
    makeParticipantRow(expenseId, p.userId, p.shareMinor, p.percentageBp);
  }
  for (const item of split.items) {
    const row = makeItemRow(expenseId, item.description, item.amountMinor);
    for (const ip of item.participants) {
      makeItemParticipantRow(row.id, ip.userId, ip.shareMinor);
    }
  }
}

function loadRelations(expenseId: string) {
  const expense = db.expenses.get(expenseId);
  if (!expense) return null;
  const participants = [...db.expenseParticipants.values()]
    .filter((p) => p.expenseId === expenseId)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((p) => ({ ...p, user: p.userId ? db.users.get(p.userId) ?? null : null }));
  const items = [...db.expenseItems.values()]
    .filter((i) => i.expenseId === expenseId)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((item) => ({
      ...item,
      participants: [...db.itemParticipants.values()]
        .filter((ip) => ip.itemId === item.id)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((ip) => ({ ...ip, user: ip.userId ? db.users.get(ip.userId) ?? null : null })),
    }));
  return {
    expense,
    participants,
    items,
    paidBy: expense.paidById ? db.users.get(expense.paidById) ?? null : null,
    createdBy: expense.createdById ? db.users.get(expense.createdById) ?? null : null,
  };
}

function makeExpensesRepository(): ExpensesRepository {
  return {
    async findGroupById(id) {
      return db.groups.get(id) ?? null;
    },
    async listMemberUserIds(groupId) {
      return new Set(
        [...db.memberships.values()].filter((m) => m.groupId === groupId).map((m) => m.userId),
      );
    },
    async findExpenseInGroup(expenseId, groupId) {
      const expense = db.expenses.get(expenseId);
      if (!expense || expense.groupId !== groupId) return null;
      return loadRelations(expenseId);
    },
    async listExpensesForGroup(groupId) {
      return [...db.expenses.values()]
        .filter((e) => e.groupId === groupId)
        .sort(
          (a, b) =>
            b.expenseDate.getTime() - a.expenseDate.getTime() ||
            b.createdAt.getTime() - a.createdAt.getTime(),
        )
        .map((e) => loadRelations(e.id)!);
    },
    // Mirrors the Prisma transaction: all rows or none.
    async createExpenseWithRelations(data: ExpenseCreateData, split: ValidatedSplit) {
      const expense = makeExpenseRow(data);
      writeSplitRows(expense.id, split);
      return loadRelations(expense.id)!;
    },
    async updateExpenseWithRelations(expenseId: string, patch: ExpenseUpdateData, split: ValidatedSplit) {
      const expense = db.expenses.get(expenseId);
      if (!expense) throw new Error('Expense not found');
      // Mirrors the real repository: apply the Expense-row patch first, and
      // replace derived rows ONLY when the split was touched — a fields-only
      // patch must leave participants/items untouched.
      if (patch.description !== undefined) expense.description = patch.description;
      if (patch.category !== undefined) expense.category = patch.category;
      if (patch.amountMinor !== undefined) expense.amountMinor = patch.amountMinor;
      if (patch.currencyCode !== undefined) expense.currencyCode = patch.currencyCode;
      if (patch.paidById !== undefined) expense.paidById = patch.paidById;
      if (patch.splitType !== undefined) expense.splitType = patch.splitType;
      if (patch.expenseDate !== undefined) expense.expenseDate = patch.expenseDate;
      expense.updatedAt = now();
      if (split.participants.length > 0 || split.items.length > 0) {
        [...db.expenseParticipants.values()]
          .filter((p) => p.expenseId === expenseId)
          .forEach((p) => db.expenseParticipants.delete(mKey(p.expenseId, p.userId ?? '')));
        [...db.expenseItems.values()]
          .filter((i) => i.expenseId === expenseId)
          .forEach((i) => {
            [...db.itemParticipants.values()].filter((ip) => ip.itemId === i.id).forEach((ip) => db.itemParticipants.delete(mKey(ip.itemId, ip.userId ?? '')));
            db.expenseItems.delete(i.id);
          });
        writeSplitRows(expenseId, split);
      }
      return loadRelations(expenseId)!;
    },
    async deleteExpense(expenseId: string) {
      const expense = db.expenses.get(expenseId);
      if (!expense) throw new Error('Expense not found');
      [...db.expenseParticipants.values()]
        .filter((p) => p.expenseId === expenseId)
        .forEach((p) => db.expenseParticipants.delete(mKey(p.expenseId, p.userId ?? '')));
      [...db.expenseItems.values()]
        .filter((i) => i.expenseId === expenseId)
        .forEach((i) => {
          [...db.itemParticipants.values()].filter((ip) => ip.itemId === i.id).forEach((ip) => db.itemParticipants.delete(mKey(ip.itemId, ip.userId ?? '')));
          db.expenseItems.delete(i.id);
        });
      db.expenses.delete(expenseId);
    },
  };
}

function makeGroupsRepository(): GroupsRepository {
  return {
    async findUserById(id) {
      return db.users.get(id) ?? null;
    },
    async findMembership(groupId, userId) {
      return db.memberships.get(mKey(groupId, userId)) ?? null;
    },
    async findGroupById(id) {
      return db.groups.get(id) ?? null;
    },
    async findMembershipByGroupAndUser(groupId, userId) {
      return db.memberships.get(mKey(groupId, userId)) ?? null;
    },
    async listMembershipsForUser(userId) {
      return [...db.memberships.values()]
        .filter((m) => m.userId === userId)
        .sort((a, b) => b.joinedAt.getTime() - a.joinedAt.getTime())
        .map((membership) => {
          const group = db.groups.get(membership.groupId)!;
          const memberCount = [...db.memberships.values()].filter(
            (m) => m.groupId === membership.groupId,
          ).length;
          return { membership, group, memberCount };
        });
    },
    async listMembers(groupId) {
      return [...db.memberships.values()]
        .filter((m) => m.groupId === groupId)
        .sort((a, b) => {
          const order: Record<GroupRole, number> = { OWNER: 0, ADMIN: 1, MEMBER: 2 };
          return order[a.role] - order[b.role] || a.joinedAt.getTime() - b.joinedAt.getTime();
        })
        .map((m) => ({ ...m, user: db.users.get(m.userId) ?? null }));
    },
    async createGroupWithOwner(data: GroupCreateData, ownerUserId: string) {
      const group: Group = {
        id: nextId('group'),
        name: data.name,
        description: data.description,
        currencyCode: data.currencyCode,
        isRoommateGroup: data.isRoommateGroup,
        createdById: data.createdById,
        createdAt: now(),
        updatedAt: now(),
      };
      db.groups.set(group.id, group);
      const membership = makeMembership(group.id, ownerUserId, 'OWNER');
      return { group, membership };
    },
    async createMembership({ groupId, userId, role }) {
      return makeMembership(groupId, userId, role);
    },
    async deleteMembership(groupId, userId) {
      db.memberships.delete(mKey(groupId, userId));
    },
    async updateMembershipRole(groupId, userId, role) {
      const membership = db.memberships.get(mKey(groupId, userId));
      if (!membership) throw new Error('Membership not found');
      membership.role = role;
      return membership;
    },
    async updateGroup(id: string, data: GroupUpdateData) {
      const group = db.groups.get(id);
      if (!group) throw new Error('Group not found');
      if (data.name !== undefined) group.name = data.name;
      if (data.description !== undefined) group.description = data.description;
      if (data.currencyCode !== undefined) group.currencyCode = data.currencyCode;
      if (data.isRoommateGroup !== undefined) group.isRoommateGroup = data.isRoommateGroup;
      group.updatedAt = now();
      return group;
    },
  };
}

function makeUserRepository(): UserRepository {
  const findByFirebaseUid = (uid: string): User | null =>
    [...db.users.values()].find((u) => u.firebaseUid === uid) ?? null;
  return {
    async findUnique({ where }) {
      return findByFirebaseUid(where.firebaseUid);
    },
    async create({ data }) {
      const existing = findByFirebaseUid(data.firebaseUid);
      if (existing) {
        throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
      }
      return makeUser({
        firebaseUid: data.firebaseUid,
        email: data.email,
        name: data.name,
        photoUrl: data.photoUrl ?? null,
      });
    },
    async update({ where, data }) {
      const user = findByFirebaseUid(where.firebaseUid);
      if (!user) throw new Error('User not found');
      if (data.email !== undefined) user.email = data.email;
      if (data.name !== undefined) user.name = data.name;
      if (data.photoUrl !== undefined) user.photoUrl = data.photoUrl;
      return user;
    },
  };
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

let server: Server;
let baseUrl: string;
const dev = (uid: string) => ({ 'x-dev-user-id': uid });

async function startServer(): Promise<void> {
  const app = createApp();
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const port = (server.address() as AddressInfo).port;
  baseUrl = `http://127.0.0.1:${port}`;
}

async function json(
  method: string,
  path: string,
  body?: unknown,
  uid?: string,
): Promise<{ status: number; body: ApiResponse }> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(uid ? dev(uid) : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: (await response.json()) as ApiResponse };
}

function isFailure(r: ApiResponse): r is ErrorEnvelope {
  return (r as ErrorEnvelope).error !== undefined;
}

const expensesUrl = (groupId: string, suffix = '') =>
  `${baseUrl}/api/v1/groups/${groupId}/expenses${suffix}`;
void expensesUrl;

/** Standard fixtures: owner, admin, member, outsider + one INR group. */
function setupWorld(): {
  owner: User;
  admin: User;
  member: User;
  outsider: User;
  group: Group;
} {
  const owner = makeUser({ firebaseUid: 'w-owner', name: 'Olga Owner' });
  const admin = makeUser({ firebaseUid: 'w-admin', name: 'Andy Admin' });
  const member = makeUser({ firebaseUid: 'w-member', name: 'Mia Member' });
  const outsider = makeUser({ firebaseUid: 'w-outsider', name: 'Ollie Outsider' });
  const group = makeGroup({ createdById: owner.id, name: 'Goa Trip', currencyCode: 'INR' });
  makeMembership(group.id, owner.id, 'OWNER');
  makeMembership(group.id, admin.id, 'ADMIN');
  makeMembership(group.id, member.id, 'MEMBER');
  return { owner, admin, member, outsider, group };
}

const validEqualPayload = (paidByUserId: string, participantUserIds: string[]) => ({
  description: 'Dinner',
  category: 'Food',
  amountMinor: '90000',
  paidByUserId,
  splitType: 'EQUAL',
  participants: participantUserIds,
  expenseDate: '2026-09-19T19:30:00.000Z',
});

interface World {
  owner: User;
  admin: User;
  member: User;
  outsider: User;
  group: Group;
}

describe('Expenses API — authentication (401)', () => {
  before(async () => {
    process.env.NODE_ENV = 'test';
    resetEnvCacheForTests();
    db = makeDb();
    setUserRepositoryForTests(makeUserRepository());
    setGroupsRepositoryForTests(makeGroupsRepository());
    setExpensesRepositoryForTests(makeExpensesRepository());
    await startServer();
  });

  after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    resetUserRepositoryForTests();
    resetGroupsRepositoryForTests();
    resetExpensesRepositoryForTests();
  });

  beforeEach(() => {
    db = makeDb();
    idSeq = 0;
  });

  it('1. unauthenticated create -> 401', async () => {
    const { group } = setupWorld();
    const { status } = await json('POST', `/api/v1/groups/${group.id}/expenses`, validEqualPayload('x', ['x']));
    assert.equal(status, 401);
  });

  it('2. unauthenticated list -> 401', async () => {
    const { group } = setupWorld();
    const { status } = await json('GET', `/api/v1/groups/${group.id}/expenses`);
    assert.equal(status, 401);
  });

  it('3. unauthenticated detail -> 401', async () => {
    const { group } = setupWorld();
    const { status } = await json('GET', `/api/v1/groups/${group.id}/expenses/some-id`);
    assert.equal(status, 401);
  });

  it('4. unauthenticated update -> 401', async () => {
    const { group } = setupWorld();
    const { status } = await json('PATCH', `/api/v1/groups/${group.id}/expenses/some-id`, { description: 'X' });
    assert.equal(status, 401);
  });

  it('5. unauthenticated delete -> 401', async () => {
    const { group } = setupWorld();
    const { status } = await json('DELETE', `/api/v1/groups/${group.id}/expenses/some-id`);
    assert.equal(status, 401);
  });
});

describe('Expenses API — group authorization', () => {
  before(async () => {
    process.env.NODE_ENV = 'test';
    resetEnvCacheForTests();
    db = makeDb();
    setUserRepositoryForTests(makeUserRepository());
    setGroupsRepositoryForTests(makeGroupsRepository());
    setExpensesRepositoryForTests(makeExpensesRepository());
    await startServer();
  });

  after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    resetUserRepositoryForTests();
    resetGroupsRepositoryForTests();
    resetExpensesRepositoryForTests();
  });

  beforeEach(() => {
    db = makeDb();
    idSeq = 0;
  });

  it('6. non-member create -> 404 (no existence leak)', async () => {
    const { member, group } = setupWorld();
    const { status, body } = await json(
      'POST',
      `/api/v1/groups/${group.id}/expenses`,
      validEqualPayload(member.id, [member.id]),
      'w-outsider',
    );
    assert.equal(status, 404);
    assert.ok(isFailure(body));
  });

  it('7. non-member list -> 404', async () => {
    const { group } = setupWorld();
    const { status } = await json('GET', `/api/v1/groups/${group.id}/expenses`, undefined, 'w-outsider');
    assert.equal(status, 404);
  });

  it('8. non-member detail -> 404', async () => {
    const { member, group } = setupWorld();
    const created = await json('POST', `/api/v1/groups/${group.id}/expenses`, validEqualPayload(member.id, [member.id]), 'w-member');
    assert.ok(!isFailure(created.body));
    const expenseId = (created.body.data as ExpenseData).id;
    const { status } = await json('GET', `/api/v1/groups/${group.id}/expenses/${expenseId}`, undefined, 'w-outsider');
    assert.equal(status, 404);
  });

  it('9. non-member update -> 404', async () => {
    const { member, group } = setupWorld();
    const created = await json('POST', `/api/v1/groups/${group.id}/expenses`, validEqualPayload(member.id, [member.id]), 'w-member');
    const expenseId = (created.body.data as ExpenseData).id;
    const { status } = await json('PATCH', `/api/v1/groups/${group.id}/expenses/${expenseId}`, { description: 'X' }, 'w-outsider');
    assert.equal(status, 404);
  });

  it('10. non-member delete -> 404', async () => {
    const { member, group } = setupWorld();
    const created = await json('POST', `/api/v1/groups/${group.id}/expenses`, validEqualPayload(member.id, [member.id]), 'w-member');
    const expenseId = (created.body.data as ExpenseData).id;
    const { status } = await json('DELETE', `/api/v1/groups/${group.id}/expenses/${expenseId}`, undefined, 'w-outsider');
    assert.equal(status, 404);
  });

  it('11. cross-group expense ID access -> 404, identical body (no leak)', async () => {
    const { member, group } = setupWorld();
    const created = await json('POST', `/api/v1/groups/${group.id}/expenses`, validEqualPayload(member.id, [member.id]), 'w-member');
    const expenseId = (created.body.data as ExpenseData).id;

    const otherOwner = makeUser({ firebaseUid: 'other-owner' });
    const otherGroup = makeGroup({ createdById: otherOwner.id, name: 'Other' });
    makeMembership(otherGroup.id, otherOwner.id, 'OWNER');

    const viaOtherGroup = await json('GET', `/api/v1/groups/${otherGroup.id}/expenses/${expenseId}`, undefined, 'other-owner');
    assert.equal(viaOtherGroup.status, 404);
    const missing = await json('GET', `/api/v1/groups/${otherGroup.id}/expenses/does-not-exist`, undefined, 'other-owner');
    assert.equal(missing.status, 404);
    // Identical generic bodies: existence is not leaked.
    assert.deepEqual(viaOtherGroup.body, missing.body);
  });
});

describe('Expenses API — creation', () => {
  before(async () => {
    process.env.NODE_ENV = 'test';
    resetEnvCacheForTests();
    db = makeDb();
    setUserRepositoryForTests(makeUserRepository());
    setGroupsRepositoryForTests(makeGroupsRepository());
    setExpensesRepositoryForTests(makeExpensesRepository());
    await startServer();
  });

  after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    resetUserRepositoryForTests();
    resetGroupsRepositoryForTests();
    resetExpensesRepositoryForTests();
  });

  beforeEach(() => {
    db = makeDb();
    idSeq = 0;
  });

  it('12. valid equal expense -> 201 with computed shares', async () => {
    const { member, group } = setupWorld();
    const { status, body } = await json(
      'POST',
      `/api/v1/groups/${group.id}/expenses`,
      validEqualPayload(member.id, [member.id]),
      'w-member',
    );
    assert.equal(status, 201);
    assert.ok(!isFailure(body));
    const data = body.data as ExpenseData;
    assert.equal(data.amountMinor, '90000');
    assert.equal(data.currencyCode, 'INR');
    assert.equal(data.splitType, 'EQUAL');
    assert.equal(data.createdBy?.userId, member.id);
    assert.equal(data.participants.length, 1);
    assert.equal(data.participants[0]!.shareMinor, '90000');
  });

  it('13. valid percentage expense -> 201 with basis-point precision', async () => {
    const { owner, admin, member, group } = setupWorld();
    const { status, body } = await json(
      'POST',
      `/api/v1/groups/${group.id}/expenses`,
      {
        description: 'Rent',
        category: 'Rent',
        amountMinor: '10000',
        paidByUserId: owner.id,
        splitType: 'PERCENTAGE',
        percentages: {
          [owner.id]: '5000', // 50.00%
          [admin.id]: '3000', // 30.00%
          [member.id]: '2000', // 20.00%
        },
      },
      'w-owner',
    );
    assert.equal(status, 201);
    assert.ok(!isFailure(body));
    const data = body.data as ExpenseData;
    assert.equal(data.splitType, 'PERCENTAGE');
    assert.deepEqual(
      data.participants.map((p) => p.shareMinor),
      ['5000', '3000', '2000'],
    );
    assert.equal(data.participants[0]!.percentage, '50.00');
  });

  it('14. valid itemized expense -> 201 with items and reconciled participants', async () => {
    const { member, group } = setupWorld();
    const { status, body } = await json(
      'POST',
      `/api/v1/groups/${group.id}/expenses`,
      {
        description: 'Groceries',
        category: 'Food',
        amountMinor: '90000',
        paidByUserId: member.id,
        splitType: 'ITEMIZED',
        items: [
          { name: 'Pizza', amountMinor: '60000', participantUserIds: [member.id] },
          { name: 'Salad', amountMinor: '30000', participantUserIds: [member.id] },
        ],
      },
      'w-member',
    );
    assert.equal(status, 201);
    assert.ok(!isFailure(body));
    const data = body.data as ExpenseData;
    assert.equal(data.items.length, 2);
    assert.equal(data.items[0]!.amountMinor, '60000');
    assert.equal(data.participants.length, 1);
    assert.equal(data.participants[0]!.shareMinor, '90000');
  });

  it('15. creator comes from authenticated identity', async () => {
    const { member, group } = setupWorld();
    const { body } = await json(
      'POST',
      `/api/v1/groups/${group.id}/expenses`,
      validEqualPayload(member.id, [member.id]),
      'w-member',
    );
    const data = body.data as ExpenseData;
    assert.equal(data.createdBy?.userId, member.id);
    assert.equal(data.createdBy?.displayName, 'Mia Member');
  });

  it('16. spoofed creator fields are ignored', async () => {
    const { member, outsider, group } = setupWorld();
    const { status, body } = await json(
      'POST',
      `/api/v1/groups/${group.id}/expenses`,
      {
        ...validEqualPayload(member.id, [member.id]),
        createdById: outsider.id,
        userId: outsider.id,
        firebaseUid: 'w-outsider',
      },
      'w-member',
    );
    assert.equal(status, 201);
    const data = body.data as ExpenseData;
    assert.equal(data.createdBy?.userId, member.id);
  });

  it('17. invalid group ID -> 404', async () => {
    const { status } = await json(
      'POST',
      '/api/v1/groups/nope/expenses',
      validEqualPayload('u', ['u']),
      'w-owner',
    );
    assert.equal(status, 404);
  });

  it('18. invalid expense amount -> 400', async () => {
    const { member, group } = setupWorld();
    for (const amountMinor of ['0', '-500', '10.50', 'abc', '1e6', '007', '', 90000.5, null]) {
      const { status } = await json(
        'POST',
        `/api/v1/groups/${group.id}/expenses`,
        { ...validEqualPayload(member.id, [member.id]), amountMinor },
        'w-owner',
      );
      assert.equal(status, 400, `expected 400 for amountMinor=${String(amountMinor)}`);
    }
  });

  it('19. unsupported currency -> 400', async () => {
    const { member, group } = setupWorld();
    const { status } = await json(
      'POST',
      `/api/v1/groups/${group.id}/expenses`,
      { ...validEqualPayload(member.id, [member.id]), currencyCode: 'BTC' },
      'w-owner',
    );
    assert.equal(status, 400);
  });

  it('20. currency mismatch with group -> 400', async () => {
    const { member, group } = setupWorld(); // INR group
    const { status, body } = await json(
      'POST',
      `/api/v1/groups/${group.id}/expenses`,
      { ...validEqualPayload(member.id, [member.id]), currencyCode: 'USD' },
      'w-owner',
    );
    assert.equal(status, 400);
    assert.ok(isFailure(body) && body.error.message.includes('group currency'));
  });

  it('21. invalid category -> 400', async () => {
    const { member, group } = setupWorld();
    const { status } = await json(
      'POST',
      `/api/v1/groups/${group.id}/expenses`,
      { ...validEqualPayload(member.id, [member.id]), category: 'Crypto' },
      'w-owner',
    );
    assert.equal(status, 400);
  });

  it('22. paymentMethod is not an expense field (whitelist ignores it)', async () => {
    const { member, group } = setupWorld();
    const { status, body } = await json(
      'POST',
      `/api/v1/groups/${group.id}/expenses`,
      { ...validEqualPayload(member.id, [member.id]), paymentMethod: 'UPI' },
      'w-owner',
    );
    // The expense model carries no payment method (the frontend has none
    // either — only Settlement does); unknown fields are never persisted.
    assert.equal(status, 201);
    assert.ok(!isFailure(body));
    assert.equal('paymentMethod' in (body.data as ExpenseData), false);
  });
});

describe('Expenses API — EQUAL split', () => {
  let world: World;
  before(async () => {
    process.env.NODE_ENV = 'test';
    resetEnvCacheForTests();
    db = makeDb();
    setUserRepositoryForTests(makeUserRepository());
    setGroupsRepositoryForTests(makeGroupsRepository());
    setExpensesRepositoryForTests(makeExpensesRepository());
    await startServer();
  });
  after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    resetUserRepositoryForTests();
    resetGroupsRepositoryForTests();
    resetExpensesRepositoryForTests();
  });
  beforeEach(() => {
    db = makeDb();
    idSeq = 0;
    world = setupWorld();
  });

  const create = (uid: string, payload: Record<string, unknown>) =>
    json('POST', `/api/v1/groups/${world.group.id}/expenses`, payload, uid);

  it('23. equal split across 2 users', async () => {
    const { member, admin } = world;
    const { body } = await create('w-member', validEqualPayload(member.id, [member.id, admin.id]));
    const data = body.data as ExpenseData;
    assert.deepEqual(data.participants.map((p) => p.shareMinor), ['45000', '45000']);
  });

  it('24. equal split across 3 users', async () => {
    const { member, admin, owner } = world;
    const { body } = await create('w-member', validEqualPayload(member.id, [member.id, admin.id, owner.id]));
    const data = body.data as ExpenseData;
    assert.deepEqual(data.participants.map((p) => p.shareMinor), ['30000', '30000', '30000']);
  });

  it('25. uneven amount remainder -> deterministic last-participant absorbs', async () => {
    const { member, admin } = world;
    const { body } = await create('w-member', {
      ...validEqualPayload(member.id, [member.id, admin.id]),
      amountMinor: '10001',
    });
    const data = body.data as ExpenseData;
    assert.deepEqual(data.participants.map((p) => p.shareMinor), ['5000', '5001']);
    // Sum reconciles exactly.
    assert.equal(
      data.participants.reduce((s, p) => s + BigInt(p.shareMinor), 0n),
      10001n,
    );
  });

  it('26. duplicate participant rejected', async () => {
    const { member } = world;
    const { status } = await create('w-member', validEqualPayload(member.id, [member.id, member.id]));
    assert.equal(status, 400);
  });

  it('27. participant outside group rejected', async () => {
    const { member, outsider } = world;
    const { status } = await create('w-member', validEqualPayload(member.id, [member.id, outsider.id]));
    assert.equal(status, 400);
  });

  it('28. zero participants rejected', async () => {
    const { member } = world;
    const { status } = await create('w-member', validEqualPayload(member.id, []));
    assert.equal(status, 400);
  });

  it('29. smuggled client allocations are never trusted', async () => {
    const { member } = world;
    const { status, body } = await create('w-member', {
      ...validEqualPayload(member.id, [member.id]),
      shares: [{ userId: member.id, shareMinor: '1' }], // smuggled allocation
    });
    // The whitelist ignores unknown fields; the server computed the share.
    assert.equal(status, 201);
    const data = body.data as ExpenseData;
    assert.equal(data.participants[0]!.shareMinor, '90000');
  });

  it('30. malformed allocation rejected', async () => {
    const { member } = world;
    for (const participants of ['not-an-array', [42], [null], [''], [undefined]]) {
      const { status } = await create('w-member', validEqualPayload(member.id, participants as string[]));
      assert.equal(status, 400, `expected 400 for participants=${JSON.stringify(participants)}`);
    }
  });
});

describe('Expenses API — PERCENTAGE split', () => {
  let world: World;
  before(async () => {
    process.env.NODE_ENV = 'test';
    resetEnvCacheForTests();
    db = makeDb();
    setUserRepositoryForTests(makeUserRepository());
    setGroupsRepositoryForTests(makeGroupsRepository());
    setExpensesRepositoryForTests(makeExpensesRepository());
    await startServer();
  });
  after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    resetUserRepositoryForTests();
    resetGroupsRepositoryForTests();
    resetExpensesRepositoryForTests();
  });
  beforeEach(() => {
    db = makeDb();
    idSeq = 0;
    world = setupWorld();
  });

  const pct = (entries: Record<string, string>, amountMinor = '10000') => ({
    description: 'Split',
    category: 'Other',
    amountMinor,
    paidByUserId: world.owner.id,
    splitType: 'PERCENTAGE',
    percentages: entries,
  });

  it('31. valid 100% total -> 201', async () => {
    const { owner, member } = world;
    const { status, body } = await json('POST', `/api/v1/groups/${world.group.id}/expenses`, pct({ [owner.id]: '7500', [member.id]: '2500' }), 'w-owner');
    assert.equal(status, 201);
    const data = body.data as ExpenseData;
    assert.deepEqual(data.participants.map((p) => p.shareMinor), ['7500', '2500']);
  });

  it('32. percentages below 100 rejected', async () => {
    const { owner, member } = world;
    const { status } = await json('POST', `/api/v1/groups/${world.group.id}/expenses`, pct({ [owner.id]: '5000', [member.id]: '4000' }), 'w-owner');
    assert.equal(status, 400);
  });

  it('33. percentages above 100 rejected', async () => {
    const { owner, member } = world;
    const { status } = await json('POST', `/api/v1/groups/${world.group.id}/expenses`, pct({ [owner.id]: '6000', [member.id]: '5000' }), 'w-owner');
    assert.equal(status, 400);
  });

  it('34. negative percentage rejected', async () => {
    const { owner, member } = world;
    const { status } = await json('POST', `/api/v1/groups/${world.group.id}/expenses`, pct({ [owner.id]: '11000', [member.id]: '-1000' }), 'w-owner');
    assert.equal(status, 400);
  });

  it('35. percentage keys are validated against membership (spoofed key rejected)', async () => {
    const { owner } = world;
    const { status } = await json('POST', `/api/v1/groups/${world.group.id}/expenses`, pct({ [owner.id]: '10000', ' user-dup': '0' }), 'w-owner');
    assert.equal(status, 400);
  });

  it('36. participant outside group rejected', async () => {
    const { owner, outsider } = world;
    const { status } = await json('POST', `/api/v1/groups/${world.group.id}/expenses`, pct({ [owner.id]: '9000', [outsider.id]: '1000' }), 'w-owner');
    assert.equal(status, 400);
  });

  it('37. rounding remainder handled deterministically', async () => {
    const { owner, admin, member } = world;
    // 1/3 each: 3333.33... bp is impossible in integers; use 33.33/33.33/33.34.
    const { body } = await json(
      'POST',
      `/api/v1/groups/${world.group.id}/expenses`,
      pct({ [owner.id]: '3333', [admin.id]: '3333', [member.id]: '3334' }, '10001'),
      'w-owner',
    );
    const data = body.data as ExpenseData;
    const total = data.participants.reduce((s, p) => s + BigInt(p.shareMinor), 0n);
    assert.equal(total, 10001n); // exact reconciliation
    // Floors: 3333/3333/3334 (sum 10000); the largest percentage (member,
    // 3334 bp) absorbs the single leftover minor unit -> 3335.
    const byOwner = data.participants.find((p) => p.userId === owner.id)!;
    const byMember = data.participants.find((p) => p.userId === member.id)!;
    assert.equal(byOwner.shareMinor, '3333');
    assert.equal(byMember.shareMinor, '3335');
  });

  it('38. calculated allocations reconcile exactly to the expense amount', async () => {
    const { owner, admin, member } = world;
    const { body } = await json(
      'POST',
      `/api/v1/groups/${world.group.id}/expenses`,
      pct({ [owner.id]: '1000', [admin.id]: '8000', [member.id]: '1000' }, '99999'),
      'w-owner',
    );
    const data = body.data as ExpenseData;
    const total = data.participants.reduce((s, p) => s + BigInt(p.shareMinor), 0n);
    assert.equal(total, 99999n);
    // Floors: 9999/79999/9999 (sum 99997); the largest percentage (admin,
    // 8000 bp) absorbs the 2 leftover minor units -> 80001.
    const byAdmin = data.participants.find((p) => p.userId === admin.id)!;
    assert.equal(byAdmin.shareMinor, '80001');
  });
});

describe('Expenses API — ITEMIZED split', () => {
  let world: World;
  before(async () => {
    process.env.NODE_ENV = 'test';
    resetEnvCacheForTests();
    db = makeDb();
    setUserRepositoryForTests(makeUserRepository());
    setGroupsRepositoryForTests(makeGroupsRepository());
    setExpensesRepositoryForTests(makeExpensesRepository());
    await startServer();
  });
  after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    resetUserRepositoryForTests();
    resetGroupsRepositoryForTests();
    resetExpensesRepositoryForTests();
  });
  beforeEach(() => {
    db = makeDb();
    idSeq = 0;
    world = setupWorld();
  });

  const itemized = (items: unknown[], amountMinor = '90000') => ({
    description: 'Groceries',
    category: 'Food',
    amountMinor,
    paidByUserId: world.member.id,
    splitType: 'ITEMIZED',
    items,
  });

  it('39. valid itemized expense -> 201', async () => {
    const { member, admin } = world;
    const { status, body } = await json('POST', `/api/v1/groups/${world.group.id}/expenses`, itemized([
      { name: 'Pizza', amountMinor: '60000', participantUserIds: [member.id, admin.id] },
      { name: 'Burger', amountMinor: '30000', participantUserIds: [admin.id] },
    ]), 'w-member');
    assert.equal(status, 201);
    const data = body.data as ExpenseData;
    assert.equal(data.items.length, 2);
    // Pizza 60000 across 2 -> 30000 each; Burger 30000 to admin.
    const pizza = data.items[0]!;
    assert.deepEqual(pizza.participants.map((p) => p.shareMinor), ['30000', '30000']);
    const totals = new Map(data.participants.map((p) => [p.userId, p.shareMinor]));
    assert.equal(totals.get(member.id), '30000');
    assert.equal(totals.get(admin.id), '60000');
  });

  it('40. item totals mismatch expense total -> 400', async () => {
    const { member } = world;
    const { status } = await json('POST', `/api/v1/groups/${world.group.id}/expenses`, itemized([
      { name: 'Pizza', amountMinor: '60000', participantUserIds: [member.id] },
    ]), 'w-member');
    assert.equal(status, 400);
  });

  it('41. zero/negative item amount -> 400', async () => {
    const { member } = world;
    const { status } = await json('POST', `/api/v1/groups/${world.group.id}/expenses`, itemized([
      { name: 'Pizza', amountMinor: '0', participantUserIds: [member.id] },
    ]), 'w-member');
    assert.equal(status, 400);
  });

  it('42. missing item name -> 400', async () => {
    const { member } = world;
    const { status } = await json('POST', `/api/v1/groups/${world.group.id}/expenses`, itemized([
      { amountMinor: '90000', participantUserIds: [member.id] },
    ]), 'w-member');
    assert.equal(status, 400);
  });

  it('43. item participant outside group -> 400', async () => {
    const { member, outsider } = world;
    const { status } = await json('POST', `/api/v1/groups/${world.group.id}/expenses`, itemized([
      { name: 'Pizza', amountMinor: '90000', participantUserIds: [member.id, outsider.id] },
    ]), 'w-member');
    assert.equal(status, 400);
  });

  it('44. duplicate participant within one item -> 400 (across items is allowed)', async () => {
    const { member, admin } = world;
    // Same user twice on ONE item: rejected.
    const dup = await json('POST', `/api/v1/groups/${world.group.id}/expenses`, itemized([
      { name: 'Pizza', amountMinor: '90000', participantUserIds: [member.id, member.id] },
    ]), 'w-member');
    assert.equal(dup.status, 400);
    // Same user on TWO different items: allowed (frontend permits this).
    const ok = await json('POST', `/api/v1/groups/${world.group.id}/expenses`, itemized([
      { name: 'Pizza', amountMinor: '60000', participantUserIds: [member.id, admin.id] },
      { name: 'Burger', amountMinor: '30000', participantUserIds: [member.id] },
    ]), 'w-member');
    assert.equal(ok.status, 201);
    const data = ok.body.data as ExpenseData;
    // member: 30000 (Pizza) + 30000 (Burger); admin: 30000 (Pizza).
    const totals = new Map(data.participants.map((p) => [p.userId, p.shareMinor]));
    assert.equal(totals.get(member.id), '60000');
    assert.equal(totals.get(admin.id), '30000');
  });

  it('45. item allocation mismatch rejected', async () => {
    const { member } = world;
    // Items sum to 89000, declared total 90000.
    const { status } = await json('POST', `/api/v1/groups/${world.group.id}/expenses`, itemized([
      { name: 'Pizza', amountMinor: '59000', participantUserIds: [member.id] },
      { name: 'Burger', amountMinor: '30000', participantUserIds: [member.id] },
    ]), 'w-member');
    assert.equal(status, 400);
  });

  it('46. multiple items reconcile correctly (uneven divisions)', async () => {
    const { member, admin, owner } = world;
    const { status, body } = await json('POST', `/api/v1/groups/${world.group.id}/expenses`, itemized([
      { name: 'A', amountMinor: '10001', participantUserIds: [member.id, admin.id] },
      { name: 'B', amountMinor: '99999', participantUserIds: [owner.id, admin.id, member.id] },
    ], '110000'), 'w-member');
    assert.equal(status, 201);
    const data = body.data as ExpenseData;
    const total = data.participants.reduce((s, p) => s + BigInt(p.shareMinor), 0n);
    assert.equal(total, 110000n);
  });
});

describe('Expenses API — read', () => {
  let world: World;
  before(async () => {
    process.env.NODE_ENV = 'test';
    resetEnvCacheForTests();
    db = makeDb();
    setUserRepositoryForTests(makeUserRepository());
    setGroupsRepositoryForTests(makeGroupsRepository());
    setExpensesRepositoryForTests(makeExpensesRepository());
    await startServer();
  });
  after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    resetUserRepositoryForTests();
    resetGroupsRepositoryForTests();
    resetExpensesRepositoryForTests();
  });
  beforeEach(() => {
    db = makeDb();
    idSeq = 0;
    world = setupWorld();
  });

  it('47. list only returns expenses from requested group (newest first)', async () => {
    const { member, admin, group } = world;
    await json('POST', expensesUrlPath(group.id), equalFor(member.id, [member.id], '2026-09-10'), 'w-member');
    await json('POST', expensesUrlPath(group.id), equalFor(admin.id, [admin.id], '2026-09-15'), 'w-admin');
    const otherOwner = makeUser({ firebaseUid: 'ro-owner' });
    const otherGroup = makeGroup({ createdById: otherOwner.id, name: 'Other' });
    makeMembership(otherGroup.id, otherOwner.id, 'OWNER');
    await json('POST', expensesUrlPath(otherGroup.id), equalFor(otherOwner.id, [otherOwner.id]), 'ro-owner');

    const { status, body } = await json('GET', expensesUrlPath(group.id), undefined, 'w-member');
    assert.equal(status, 200);
    const list = body.data as ExpenseData[];
    assert.equal(list.length, 2);
    assert.equal(list[0]!.expenseDate, '2026-09-15T00:00:00.000Z');
    assert.ok(list.every((e) => e.groupId === group.id));
  });

  it('48. list does not expose private user fields', async () => {
    const { member, group } = world;
    await json('POST', expensesUrlPath(group.id), equalFor(member.id, [member.id]), 'w-member');
    const { body } = await json('GET', expensesUrlPath(group.id), undefined, 'w-member');
    const serialized = JSON.stringify(body).toLowerCase();
    for (const forbidden of ['firebase', '@example.com', 'photo', 'timezone', 'currency_user']) {
      assert.ok(!serialized.includes(forbidden), `must not contain "${forbidden}"`);
    }
  });

  it('49. detail returns participants/items', async () => {
    const { member, admin, group } = world;
    const created = await json('POST', expensesUrlPath(group.id), itemizedFor(member.id, [
      { name: 'Pizza', amountMinor: '60000', participantUserIds: [member.id, admin.id] },
      { name: 'Burger', amountMinor: '30000', participantUserIds: [admin.id] },
    ]), 'w-member');
    const expenseId = (created.body.data as ExpenseData).id;
    const { status, body } = await json('GET', `${expensesUrlPath(group.id)}/${expenseId}`, undefined, 'w-admin');
    assert.equal(status, 200);
    const data = body.data as ExpenseData;
    assert.equal(data.items.length, 2);
    assert.equal(data.participants.length, 2);
    assert.ok(data.items.every((i) => i.participants.length > 0));
  });

  it('50. detail cannot access another group expense (identical 404)', async () => {
    const { member, group } = world;
    const created = await json('POST', expensesUrlPath(group.id), equalFor(member.id, [member.id]), 'w-member');
    const expenseId = (created.body.data as ExpenseData).id;
    const otherOwner = makeUser({ firebaseUid: 'd-other' });
    const otherGroup = makeGroup({ createdById: otherOwner.id });
    makeMembership(otherGroup.id, otherOwner.id, 'OWNER');
    const leaked = await json('GET', `${expensesUrlPath(otherGroup.id)}/${expenseId}`, undefined, 'd-other');
    const missing = await json('GET', `${expensesUrlPath(otherGroup.id)}/nope`, undefined, 'd-other');
    assert.equal(leaked.status, 404);
    assert.deepEqual(leaked.body, missing.body);
  });

  // local payload helpers bound to `world`
  function equalFor(paidBy: string, participants: string[], date = '2026-09-19') {
    return {
      description: 'Dinner', category: 'Food', amountMinor: '90000',
      paidByUserId: paidBy, splitType: 'EQUAL', participants, expenseDate: date,
    };
  }
  function itemizedFor(paidBy: string, items: unknown[]) {
    return {
      description: 'Groceries', category: 'Food', amountMinor: '90000',
      paidByUserId: paidBy, splitType: 'ITEMIZED', items,
    };
  }
  function expensesUrlPath(groupId: string) {
    return `/api/v1/groups/${groupId}/expenses`;
  }
});

describe('Expenses API — update', () => {
  let world: World;
  before(async () => {
    process.env.NODE_ENV = 'test';
    resetEnvCacheForTests();
    db = makeDb();
    setUserRepositoryForTests(makeUserRepository());
    setGroupsRepositoryForTests(makeGroupsRepository());
    setExpensesRepositoryForTests(makeExpensesRepository());
    await startServer();
  });
  after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    resetUserRepositoryForTests();
    resetGroupsRepositoryForTests();
    resetExpensesRepositoryForTests();
  });
  beforeEach(() => {
    db = makeDb();
    idSeq = 0;
    world = setupWorld();
  });

  const path = () => expensesUrlFor(world.group.id);

  function expensesUrlFor(groupId: string) {
    return `/api/v1/groups/${groupId}/expenses`;
  }

  async function seedExpense() {
    const { member, admin } = world;
    const created = await json('POST', path(), {
      description: 'Original',
      category: 'Food',
      amountMinor: '90000',
      paidByUserId: member.id,
      splitType: 'EQUAL',
      participants: [member.id, admin.id],
      expenseDate: '2026-09-01T10:00:00.000Z',
    }, 'w-member');
    assert.ok(!isFailure(created.body));
    return (created.body.data as ExpenseData).id;
  }

  it('51. creator can update', async () => {
    const id = await seedExpense();
    const { status, body } = await json('PATCH', `${path()}/${id}`, { description: 'Edited by creator' }, 'w-member');
    assert.equal(status, 200);
    assert.equal((body.data as ExpenseData).description, 'Edited by creator');
  });

  it('52. owner can update', async () => {
    const id = await seedExpense();
    const { status } = await json('PATCH', `${path()}/${id}`, { description: 'Edited by owner' }, 'w-owner');
    assert.equal(status, 200);
  });

  it('53. admin can update', async () => {
    const id = await seedExpense();
    const { status } = await json('PATCH', `${path()}/${id}`, { description: 'Edited by admin' }, 'w-admin');
    assert.equal(status, 200);
  });

  it('54. unrelated member cannot update', async () => {
    const id = await seedExpense();
    // plainMember is a MEMBER but not the creator -> 403.
    const plainMember = makeUser({ firebaseUid: 'plain-member' });
    makeMembership(world.group.id, plainMember.id, 'MEMBER');
    const { status, body } = await json('PATCH', `${path()}/${id}`, { description: 'Nope' }, 'plain-member');
    assert.equal(status, 403);
    assert.ok(isFailure(body));
  });

  it('55. forbidden identity fields cannot be changed', async () => {
    const id = await seedExpense();
    const before = (await json('GET', `${path()}/${id}`, undefined, 'w-owner')).body.data as ExpenseData;
    const { status, body } = await json('PATCH', `${path()}/${id}`, {
      description: 'Legit edit',
      id: 'hacked',
      groupId: 'other-group',
      createdById: 'someone-else',
      createdAt: '2000-01-01',
      updatedAt: '2000-01-01',
      createdBy: { userId: 'someone-else' },
    }, 'w-owner');
    assert.equal(status, 200); // identity fields are ignored, not applied
    const after = body.data as ExpenseData;
    assert.equal(after.id, before.id);
    assert.equal(after.groupId, before.groupId);
    assert.equal(after.createdBy?.userId, before.createdBy?.userId);
  });

  it('56. invalid updated split rejected', async () => {
    const id = await seedExpense();
    const { status } = await json('PATCH', `${path()}/${id}`, { amountMinor: '0' }, 'w-owner');
    assert.equal(status, 400);
    const after = (await json('GET', `${path()}/${id}`, undefined, 'w-owner')).body.data as ExpenseData;
    assert.equal(after.amountMinor, '90000'); // unchanged
  });

  it('57. participant replacement remains group-valid', async () => {
    const id = await seedExpense();
    const { member, admin, owner } = world;
    const good = await json('PATCH', `${path()}/${id}`, {
      amountMinor: '10000',
      splitType: 'EQUAL',
      participants: [member.id, admin.id, owner.id],
    }, 'w-member');
    assert.equal(good.status, 200);
    const data = good.body.data as ExpenseData;
    // 10000 / 3: floors 3333 each; the LAST listed participant absorbs the
    // remainder of 1 -> member, admin 3333 each, owner (last) 3334.
    assert.deepEqual(data.participants.map((p) => p.shareMinor), ['3333', '3333', '3334']);

    const bad = await json('PATCH', `${path()}/${id}`, {
      participants: [member.id, 'not-a-member'],
    }, 'w-member');
    assert.equal(bad.status, 400);
  });

  it('58. item replacement remains transactionally consistent', async () => {
    const id = await seedExpense();
    const { member, admin } = world;
    const { status, body } = await json('PATCH', `${path()}/${id}`, {
      splitType: 'ITEMIZED',
      amountMinor: '90000',
      items: [
        { name: 'Pizza', amountMinor: '60000', participantUserIds: [member.id, admin.id] },
        { name: 'Burger', amountMinor: '30000', participantUserIds: [admin.id] },
      ],
    }, 'w-owner');
    assert.equal(status, 200);
    const data = body.data as ExpenseData;
    assert.equal(data.splitType, 'ITEMIZED');
    assert.equal(data.items.length, 2);
    assert.equal(data.participants.length, 2);
    const totals = new Map(data.participants.map((p) => [p.userId, p.shareMinor]));
    assert.equal(totals.get(member.id), '30000');
    assert.equal(totals.get(admin.id), '60000');
  });
});

describe('Expenses API — delete', () => {
  let world: World;
  before(async () => {
    process.env.NODE_ENV = 'test';
    resetEnvCacheForTests();
    db = makeDb();
    setUserRepositoryForTests(makeUserRepository());
    setGroupsRepositoryForTests(makeGroupsRepository());
    setExpensesRepositoryForTests(makeExpensesRepository());
    await startServer();
  });
  after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    resetUserRepositoryForTests();
    resetGroupsRepositoryForTests();
    resetExpensesRepositoryForTests();
  });
  beforeEach(() => {
    db = makeDb();
    idSeq = 0;
    world = setupWorld();
  });

  const path = () => `/api/v1/groups/${world.group.id}/expenses`;

  async function seedExpense() {
    const { member } = world;
    const created = await json('POST', path(), equalFor(member.id, [member.id]), 'w-member');
    return (created.body.data as ExpenseData).id;
  }

  function equalFor(paidBy: string, participants: string[]) {
    return {
      description: 'Dinner', category: 'Food', amountMinor: '90000',
      paidByUserId: paidBy, splitType: 'EQUAL', participants,
      expenseDate: '2026-09-19',
    };
  }

  it('59. creator can delete', async () => {
    const id = await seedExpense();
    const { status } = await json('DELETE', `${path()}/${id}`, undefined, 'w-member');
    assert.equal(status, 200);
    const detail = await json('GET', `${path()}/${id}`, undefined, 'w-owner');
    assert.equal(detail.status, 404);
  });

  it('60. owner can delete', async () => {
    const id = await seedExpense();
    const { status } = await json('DELETE', `${path()}/${id}`, undefined, 'w-owner');
    assert.equal(status, 200);
  });

  it('61. admin can delete', async () => {
    const id = await seedExpense();
    const { status } = await json('DELETE', `${path()}/${id}`, undefined, 'w-admin');
    assert.equal(status, 200);
  });

  it('62. unrelated member cannot delete', async () => {
    const { admin } = world;
    const id = await seedExpense();
    // admin is ADMIN -> allowed; use a plain MEMBER who is not the creator.
    const plainMember = makeUser({ firebaseUid: 'plain-member' });
    makeMembership(world.group.id, plainMember.id, 'MEMBER');
    void admin;
    const { status } = await json('DELETE', `${path()}/${id}`, undefined, 'plain-member');
    assert.equal(status, 403);
    const still = await json('GET', `${path()}/${id}`, undefined, 'w-owner');
    assert.equal(still.status, 200);
  });

  it('63. deleting expense does not delete unrelated group/member records', async () => {
    const { group, member, admin } = world;
    const id = await seedExpense();
    const groupsBefore = db.groups.size;
    const membershipsBefore = db.memberships.size;
    const usersBefore = db.users.size;
    await json('DELETE', `${path()}/${id}`, undefined, 'w-owner');
    assert.equal(db.groups.size, groupsBefore);
    assert.equal(db.memberships.size, membershipsBefore);
    assert.equal(db.users.size, usersBefore);
    void member; void admin; void group;
  });
});
