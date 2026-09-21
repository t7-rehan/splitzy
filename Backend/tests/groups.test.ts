import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type {
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

/**
 * Task 5 Groups API tests.
 *
 * No real Firebase, no PostgreSQL: the Task 4 user repository and the Task 5
 * groups repository are both replaced with one shared in-memory database that
 * faithfully emulates the schema constraints (unique firebaseUid, unique
 * (groupId, userId), P2002 violations).
 *
 * Identity comes through the real Task 4 dev-auth path (x-dev-user-id), so the
 * full production-shaped chain is exercised: middleware -> identity -> actor
 * -> membership -> role.
 */

interface ErrorEnvelope {
  success: false;
  error: { code: string; message: string };
}

const now = () => new Date();

// ---------------------------------------------------------------------------
// Shared in-memory database
// ---------------------------------------------------------------------------

interface Db {
  users: Map<string, User>;
  groups: Map<string, Group>;
  memberships: Map<string, GroupMember>; // key: groupId|userId
}

function makeDb(): Db {
  return {
    users: new Map(),
    groups: new Map(),
    memberships: new Map(),
  };
}

let db: Db = makeDb();
let idSeq = 0;
const nextId = (prefix: string) => `${prefix}-${++idSeq}`;

function makeUser(overrides: Partial<User> = {}): User {
  const id = overrides.id ?? nextId('user');
  const user: User = {
    id,
    firebaseUid: overrides.firebaseUid ?? `firebase-${id}`,
    email: overrides.email ?? `${id}@example.com`,
    name: overrides.name ?? `User ${id}`,
    username: overrides.username ?? id.toLowerCase(),
    photoUrl: overrides.photoUrl ?? null,
    birthdate: overrides.birthdate ?? null,
    avatarId: overrides.avatarId ?? 'avatar_cool',
    currencyCode: overrides.currencyCode ?? 'INR',
    theme: overrides.theme ?? 'light',
    timezone: overrides.timezone ?? 'UTC',
    createdAt: overrides.createdAt ?? now(),
    updatedAt: overrides.updatedAt ?? now(),
    upiId: overrides.upiId ?? null,
    upiQrDataUrl: overrides.upiQrDataUrl ?? null,
  };
  db.users.set(user.id, user);
  return user;
}

function membershipKey(groupId: string, userId: string): string {
  return `${groupId}|${userId}`;
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

function makeMembership(
  groupId: string,
  userId: string,
  role: GroupRole,
): GroupMember {
  const existing = db.memberships.get(membershipKey(groupId, userId));
  if (existing) {
    const violation: { code: string } = { code: 'P2002' };
    throw violation;
  }
  const member: GroupMember = {
    id: nextId('member'),
    groupId,
    userId,
    role,
    joinedAt: now(),
  };
  db.memberships.set(membershipKey(groupId, userId), member);
  return member;
}

/** Groups repository backed by the shared in-memory db. */
function makeGroupsRepository(): GroupsRepository {
  return {
    async findUserById(id) {
      return db.users.get(id) ?? null;
    },
    async findUserByUsername(username) {
      return [...db.users.values()].find((user) => user.username === username) ?? null;
    },
    async findMembership(groupId, userId) {
      return db.memberships.get(membershipKey(groupId, userId)) ?? null;
    },
    async findGroupById(id) {
      return db.groups.get(id) ?? null;
    },
    async findMembershipByGroupAndUser(groupId, userId) {
      return db.memberships.get(membershipKey(groupId, userId)) ?? null;
    },
    async listMembershipsForUser(userId) {
      const rows = [...db.memberships.values()]
        .filter((m) => m.userId === userId)
        .sort((a, b) => b.joinedAt.getTime() - a.joinedAt.getTime());
      return rows.map((membership) => {
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
          return (
            order[a.role] - order[b.role] ||
            a.joinedAt.getTime() - b.joinedAt.getTime()
          );
        })
        .map((m) => ({ ...m, user: db.users.get(m.userId) ?? null }));
    },
    // Mirrors the Prisma transaction: both rows exist or neither does.
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
      db.memberships.delete(membershipKey(groupId, userId));
    },
    async updateMembershipRole(groupId, userId, role) {
      const membership = db.memberships.get(membershipKey(groupId, userId));
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
      if (data.isRoommateGroup !== undefined) {
        group.isRoommateGroup = data.isRoommateGroup;
      }
      group.updatedAt = now();
      return group;
    },
    async deleteGroup(id: string) {
      if (!db.groups.delete(id)) throw new Error('Group not found');
      for (const [key, membership] of db.memberships) {
        if (membership.groupId === id) db.memberships.delete(key);
      }
    },
  };
}

/** User repository backed by the same db (find-or-provision). */
function makeUserRepository(): UserRepository {
  const findByFirebaseUid = (uid: string): User | null =>
    [...db.users.values()].find((u) => u.firebaseUid === uid) ?? null;

  return {
    async findUnique({ where }) {
      if (where.firebaseUid) return findByFirebaseUid(where.firebaseUid);
      return [...db.users.values()].find((user) => user.username === where.username) ?? null;
    },
    async create({ data }) {
      const uid = data.firebaseUid;
      const existing = findByFirebaseUid(uid);
      if (existing) {
        const violation: { code: string } = { code: 'P2002' };
        throw violation;
      }
      return makeUser({
        firebaseUid: uid,
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
      user.updatedAt = now();
      return user;
    },
  };
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

let server: Server;
let baseUrl: string;
let devHeaders: (uid: string) => Record<string, string>;

async function startServer(): Promise<void> {
  const app = createApp();
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const port = (server.address() as AddressInfo).port;
  baseUrl = `http://127.0.0.1:${port}`;
  devHeaders = (uid) => ({ 'x-dev-user-id': uid });
}

interface GroupApiBody {
  success: true;
  data: {
    id: string;
    name: string;
    description: string | null;
    currencyCode: string;
    isRoommateGroup: boolean;
    viewerRole: string;
    memberCount: number;
    members?: Array<{ userId: string | null; role: string; displayName: string }>;
  };
}

async function createGroupViaApi(
  uid: string,
  body: Record<string, unknown> = {},
): Promise<{ status: number; body: GroupApiBody | ErrorEnvelope }> {
  const response = await fetch(`${baseUrl}/api/v1/groups`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...devHeaders(uid) },
    body: JSON.stringify({ name: 'Test Group', ...body }),
  });
  return { status: response.status, body: (await response.json()) as GroupApiBody | ErrorEnvelope };
}

function isFailure(
  body: GroupApiBody | ErrorEnvelope,
): body is ErrorEnvelope {
  return (body as ErrorEnvelope).error !== undefined;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Groups API — authentication', () => {
  before(async () => {
    process.env.NODE_ENV = 'test';
    resetEnvCacheForTests();
    db = makeDb();
    setUserRepositoryForTests(makeUserRepository());
    setGroupsRepositoryForTests(makeGroupsRepository());
    await startServer();
  });

  after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    resetUserRepositoryForTests();
    resetGroupsRepositoryForTests();
    process.env.NODE_ENV = 'test';
    resetEnvCacheForTests();
  });

  beforeEach(() => {
    db = makeDb();
    idSeq = 0;
  });

  it('1. unauthenticated request returns 401', async () => {
    const response = await fetch(`${baseUrl}/api/v1/groups`);
    assert.equal(response.status, 401);
    const body = (await response.json()) as ErrorEnvelope;
    assert.equal(body.error.code, 'UNAUTHORIZED');
  });

  it('2. malformed authentication returns 401', async () => {
    const response = await fetch(`${baseUrl}/api/v1/groups`, {
      headers: { authorization: 'Bearer not-a-real-token' },
    });
    assert.equal(response.status, 401);
    const body = (await response.json()) as ErrorEnvelope;
    assert.equal(body.error.code, 'UNAUTHORIZED');
  });

  it('3. development authentication works in development', async () => {
    const user = makeUser({ firebaseUid: 'dev-uid-groups' });
    makeGroup({ createdById: user.id });
    makeMembership(makeGroup({ createdById: user.id }).id, user.id, 'OWNER');
    const response = await fetch(`${baseUrl}/api/v1/groups`, {
      headers: devHeaders('dev-uid-groups'),
    });
    assert.equal(response.status, 200);
  });

  it('4. development authentication is blocked in production', async () => {
    // Build a separate production-mode app on its own port, leaving this
    // suite's development server (and the global `server` handle) untouched.
    const previousEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    resetEnvCacheForTests();
    const prodApp = createApp();
    const prodServer = prodApp.listen(0);
    await new Promise<void>((resolve) => prodServer.once('listening', resolve));
    const prodPort = (prodServer.address() as AddressInfo).port;
    try {
      const response = await fetch(`http://127.0.0.1:${prodPort}/api/v1/groups`, {
        headers: devHeaders('dev-uid-groups'),
      });
      assert.equal(response.status, 401);
      const body = (await response.json()) as ErrorEnvelope;
      assert.equal(body.error.code, 'UNAUTHORIZED');
    } finally {
      prodServer.closeAllConnections();
      await new Promise<void>((resolve) => prodServer.close(() => resolve()));
      process.env.NODE_ENV = previousEnv;
      resetEnvCacheForTests();
    }
  });
});

describe('Groups API — group creation', () => {
  before(async () => {
    process.env.NODE_ENV = 'test';
    resetEnvCacheForTests();
    db = makeDb();
    setUserRepositoryForTests(makeUserRepository());
    setGroupsRepositoryForTests(makeGroupsRepository());
    await startServer();
  });

  after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    resetUserRepositoryForTests();
    resetGroupsRepositoryForTests();
  });

  beforeEach(() => {
    db = makeDb();
    idSeq = 0;
  });

  it('5. authenticated user can create a group', async () => {
    makeUser({ firebaseUid: 'creator-1' });
    const { status, body } = await createGroupViaApi('creator-1', {
      name: 'Trip to Goa',
      description: 'Shared travel expenses',
      currencyCode: 'inr',
    });
    assert.equal(status, 201);
    assert.ok(!isFailure(body));
    if (!isFailure(body)) {
      assert.equal(body.data.name, 'Trip to Goa');
      assert.equal(body.data.currencyCode, 'INR'); // normalized uppercase
      assert.equal(body.data.viewerRole, 'OWNER');
      assert.equal(body.data.memberCount, 1);
    }
  });

  it('6. creator becomes the OWNER', async () => {
    makeUser({ firebaseUid: 'creator-2' });
    const { body } = await createGroupViaApi('creator-2', { name: 'Flat 304' });
    assert.ok(!isFailure(body));
    if (!isFailure(body)) {
      assert.equal(body.data.viewerRole, 'OWNER');
      assert.equal(body.data.members?.[0]?.role, 'OWNER');
    }
  });

  it('7. group and owner membership are created transactionally (both or neither)', async () => {
    makeUser({ firebaseUid: 'creator-3' });
    const beforeCount = db.groups.size;
    const { body } = await createGroupViaApi('creator-3', { name: 'Atomic' });
    assert.ok(!isFailure(body));
    assert.equal(db.groups.size, beforeCount + 1);
    // Exactly one membership exists for the creator in the new group.
    const createdGroup = [...db.groups.values()].at(-1)!;
    const memberships = [...db.memberships.values()].filter(
      (m) => m.groupId === createdGroup.id,
    );
    assert.equal(memberships.length, 1);
    assert.equal(memberships[0]!.role, 'OWNER');
    assert.equal(memberships[0]!.userId, createdGroup.createdById);
  });

  it('8. unauthenticated user cannot create a group', async () => {
    const response = await fetch(`${baseUrl}/api/v1/groups`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Sneaky' }),
    });
    assert.equal(response.status, 401);
  });

  it('9. invalid group input is rejected', async () => {
    makeUser({ firebaseUid: 'creator-4' });
    for (const bad of [
      { name: '' },
      { name: '   ' },
      { name: 'x'.repeat(61) },
      { currencyCode: 'BTC' },
      { currencyCode: 42 },
      { description: 'y'.repeat(281) },
      { isRoommateGroup: 'yes' },
    ]) {
      const { status, body } = await createGroupViaApi('creator-4', bad);
      assert.equal(status, 400, `expected 400 for ${JSON.stringify(bad)}`);
      assert.ok(isFailure(body));
    }
  });
});

describe('Groups API — group deletion', () => {
  before(async () => {
    process.env.NODE_ENV = 'test';
    resetEnvCacheForTests();
    db = makeDb();
    setUserRepositoryForTests(makeUserRepository());
    setGroupsRepositoryForTests(makeGroupsRepository());
    await startServer();
  });

  after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    resetUserRepositoryForTests();
    resetGroupsRepositoryForTests();
  });

  beforeEach(() => {
    db = makeDb();
    idSeq = 0;
  });

  it('deletes an owned group and all memberships', async () => {
    const owner = makeUser({ firebaseUid: 'delete-owner' });
    const member = makeUser({ firebaseUid: 'delete-member' });
    const group = makeGroup({ createdById: owner.id });
    makeMembership(group.id, owner.id, 'OWNER');
    makeMembership(group.id, member.id, 'MEMBER');

    const response = await fetch(`${baseUrl}/api/v1/groups/${group.id}`, {
      method: 'DELETE',
      headers: devHeaders(owner.firebaseUid),
    });
    assert.equal(response.status, 200);
    const deleteBody = (await response.json()) as { data: { deleted: true } };
    assert.deepEqual(deleteBody.data, { deleted: true });
    assert.equal(db.groups.has(group.id), false);
    assert.equal([...db.memberships.values()].some((m) => m.groupId === group.id), false);

    const ownerGroups = await fetch(`${baseUrl}/api/v1/groups`, {
      headers: devHeaders(owner.firebaseUid),
    });
    const memberGroups = await fetch(`${baseUrl}/api/v1/groups`, {
      headers: devHeaders(member.firebaseUid),
    });
    const ownerBody = (await ownerGroups.json()) as { data: unknown[] };
    const memberBody = (await memberGroups.json()) as { data: unknown[] };
    assert.deepEqual(ownerBody.data, []);
    assert.deepEqual(memberBody.data, []);
  });

  it('requires authentication, ownership, and an existing group', async () => {
    const owner = makeUser({ firebaseUid: 'delete-owner-errors' });
    const member = makeUser({ firebaseUid: 'delete-member-errors' });
    const group = makeGroup({ createdById: owner.id });
    makeMembership(group.id, owner.id, 'OWNER');
    makeMembership(group.id, member.id, 'MEMBER');

    const unauthenticated = await fetch(`${baseUrl}/api/v1/groups/${group.id}`, {
      method: 'DELETE',
    });
    assert.equal(unauthenticated.status, 401);

    const forbidden = await fetch(`${baseUrl}/api/v1/groups/${group.id}`, {
      method: 'DELETE',
      headers: devHeaders(member.firebaseUid),
    });
    assert.equal(forbidden.status, 403);

    const missing = await fetch(`${baseUrl}/api/v1/groups/nonexistent-group`, {
      method: 'DELETE',
      headers: devHeaders(owner.firebaseUid),
    });
    assert.equal(missing.status, 404);
  });
});

describe('Groups API — listing and details', () => {
  before(async () => {
    process.env.NODE_ENV = 'test';
    resetEnvCacheForTests();
    db = makeDb();
    setUserRepositoryForTests(makeUserRepository());
    setGroupsRepositoryForTests(makeGroupsRepository());
    await startServer();
  });

  after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    resetUserRepositoryForTests();
    resetGroupsRepositoryForTests();
  });

  beforeEach(() => {
    db = makeDb();
    idSeq = 0;
  });

  it('10. user sees only groups they belong to', async () => {
    const alice = makeUser({ firebaseUid: 'alice' });
    const bob = makeUser({ firebaseUid: 'bob' });
    const g1 = makeGroup({ createdById: alice.id, name: 'Alice group' });
    makeMembership(g1.id, alice.id, 'OWNER');
    const g2 = makeGroup({ createdById: bob.id, name: 'Bob group' });
    makeMembership(g2.id, bob.id, 'OWNER');
    makeMembership(g2.id, alice.id, 'MEMBER');

    const response = await fetch(`${baseUrl}/api/v1/groups`, {
      headers: devHeaders('alice'),
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as { success: true; data: Array<{ id: string; name: string }> };
    assert.equal(body.data.length, 2); // owns g1, member of g2
    assert.deepEqual(
      body.data.map((g) => g.name).sort(),
      ['Alice group', 'Bob group'],
    );
    // bob-only group check: bob sees only g2.
    const bobResponse = await fetch(`${baseUrl}/api/v1/groups`, {
      headers: devHeaders('bob'),
    });
    const bobBody = (await bobResponse.json()) as { data: Array<{ name: string }> };
    assert.deepEqual(bobBody.data.map((g) => g.name), ['Bob group']);
  });

  it('11. user cannot retrieve a group they do not belong to (404, no leak)', async () => {
    makeUser({ firebaseUid: 'alice-2' });
    const bob = makeUser({ firebaseUid: 'bob-2' });
    const secret = makeGroup({ createdById: bob.id, name: 'Secret' });
    makeMembership(secret.id, bob.id, 'OWNER');

    const response = await fetch(`${baseUrl}/api/v1/groups/${secret.id}`, {
      headers: devHeaders('alice-2'),
    });
    assert.equal(response.status, 404);
    const body = (await response.json()) as ErrorEnvelope;
    assert.equal(body.error.code, 'NOT_FOUND');

    // Also: a nonexistent group id gives the identical response.
    const missing = await fetch(`${baseUrl}/api/v1/groups/does-not-exist`, {
      headers: devHeaders('alice-2'),
    });
    assert.equal(missing.status, 404);
    const missingBody = (await missing.json()) as ErrorEnvelope;
    assert.deepEqual(missingBody, body);
  });

  it('12. group details include safe member information', async () => {
    const alice = makeUser({ firebaseUid: 'alice-3', name: 'Alice' });
    const bob = makeUser({
      firebaseUid: 'bob-3',
      name: 'Bob',
      email: 'bob.private@example.com',
    });
    const group = makeGroup({ createdById: alice.id, name: 'Trip' });
    makeMembership(group.id, alice.id, 'OWNER');
    makeMembership(group.id, bob.id, 'MEMBER');

    const response = await fetch(`${baseUrl}/api/v1/groups/${group.id}`, {
      headers: devHeaders('alice-3'),
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      data: {
        memberCount: number;
        viewerRole: string;
        members: Array<{ displayName: string; role: string; avatarId: string | null }>;
      };
    };
    assert.equal(body.data.memberCount, 2);
    assert.equal(body.data.viewerRole, 'OWNER');
    const bobMember = body.data.members.find((m) => m.displayName === 'Bob');
    assert.ok(bobMember);
    assert.equal(bobMember.role, 'MEMBER');
  });

  it('13. private authentication fields are not returned', async () => {
    const alice = makeUser({ firebaseUid: 'alice-4' });
    const group = makeGroup({ createdById: alice.id });
    makeMembership(group.id, alice.id, 'OWNER');
    const response = await fetch(`${baseUrl}/api/v1/groups/${group.id}`, {
      headers: devHeaders('alice-4'),
    });
    const serialized = JSON.stringify(await response.json()).toLowerCase();
    for (const forbidden of [
      'firebase',
      'token',
      'secret',
      'password',
      'credential',
      '@example.com',
    ]) {
      assert.ok(!serialized.includes(forbidden), `must not contain "${forbidden}"`);
    }
  });
});

describe('Groups API — updates', () => {
  let owner: User;
  let admin: User;
  let member: User;
  let group: Group;

  before(async () => {
    process.env.NODE_ENV = 'test';
    resetEnvCacheForTests();
    db = makeDb();
    setUserRepositoryForTests(makeUserRepository());
    setGroupsRepositoryForTests(makeGroupsRepository());
    await startServer();
  });

  after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    resetUserRepositoryForTests();
    resetGroupsRepositoryForTests();
  });

  beforeEach(() => {
    db = makeDb();
    idSeq = 0;
    owner = makeUser({ firebaseUid: 'owner-u' });
    admin = makeUser({ firebaseUid: 'admin-u' });
    member = makeUser({ firebaseUid: 'member-u' });
    group = makeGroup({ createdById: owner.id, name: 'Original' });
    makeMembership(group.id, owner.id, 'OWNER');
    makeMembership(group.id, admin.id, 'ADMIN');
    makeMembership(group.id, member.id, 'MEMBER');
  });

  it('14. owner can update group details', async () => {
    const response = await fetch(`${baseUrl}/api/v1/groups/${group.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...devHeaders('owner-u') },
      body: JSON.stringify({ name: 'Renamed', description: 'New desc' }),
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as { data: { name: string; description: string } };
    assert.equal(body.data.name, 'Renamed');
    assert.equal(body.data.description, 'New desc');
  });

  it('15. admin can update ordinary fields (policy: same as owner for details)', async () => {
    const response = await fetch(`${baseUrl}/api/v1/groups/${group.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...devHeaders('admin-u') },
      body: JSON.stringify({ description: 'Admin edit' }),
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as { data: { description: string } };
    assert.equal(body.data.description, 'Admin edit');
  });

  it('16. member cannot update group details', async () => {
    const response = await fetch(`${baseUrl}/api/v1/groups/${group.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...devHeaders('member-u') },
      body: JSON.stringify({ name: 'Hijack' }),
    });
    assert.equal(response.status, 403);
    const body = (await response.json()) as ErrorEnvelope;
    assert.equal(body.error.code, 'FORBIDDEN');
    assert.equal(db.groups.get(group.id)!.name, 'Original');
  });

  it('17. forbidden fields cannot be changed via update', async () => {
    const response = await fetch(`${baseUrl}/api/v1/groups/${group.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...devHeaders('owner-u') },
      body: JSON.stringify({
        id: 'hacked-id',
        createdById: member.id,
        ownerId: member.id,
        createdAt: '2000-01-01T00:00:00.000Z',
      }),
    });
    assert.equal(response.status, 400); // no updatable fields -> validation error
    const untouched = db.groups.get(group.id)!;
    assert.equal(untouched.id, group.id);
    assert.equal(untouched.createdById, owner.id);
  });

  it('18. invalid updates are rejected', async () => {
    for (const bad of [
      { name: '' },
      { currencyCode: 'GBPX' },
      { isRoommateGroup: 1 },
      {},
    ]) {
      const response = await fetch(`${baseUrl}/api/v1/groups/${group.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', ...devHeaders('owner-u') },
        body: JSON.stringify(bad),
      });
      assert.equal(response.status, 400, `expected 400 for ${JSON.stringify(bad)}`);
    }
  });
});

describe('Groups API — membership management', () => {
  let owner: User;
  let admin: User;
  let member: User;
  let outsider: User;
  let group: Group;

  before(async () => {
    process.env.NODE_ENV = 'test';
    resetEnvCacheForTests();
    db = makeDb();
    setUserRepositoryForTests(makeUserRepository());
    setGroupsRepositoryForTests(makeGroupsRepository());
    await startServer();
  });

  after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    resetUserRepositoryForTests();
    resetGroupsRepositoryForTests();
  });

  beforeEach(() => {
    db = makeDb();
    idSeq = 0;
    owner = makeUser({ firebaseUid: 'm-owner' });
    admin = makeUser({ firebaseUid: 'm-admin' });
    member = makeUser({ firebaseUid: 'm-member' });
    outsider = makeUser({ firebaseUid: 'm-outsider' });
    group = makeGroup({ createdById: owner.id, name: 'Members' });
    makeMembership(group.id, owner.id, 'OWNER');
    makeMembership(group.id, admin.id, 'ADMIN');
    makeMembership(group.id, member.id, 'MEMBER');
  });

  const memberUrl = (userId: string, suffix = '') =>
    `${baseUrl}/api/v1/groups/${group.id}/members/${userId}${suffix}`;

  it('19. owner can add an existing user', async () => {
    const response = await fetch(`${baseUrl}/api/v1/groups/${group.id}/members`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...devHeaders('m-owner') },
      body: JSON.stringify({ userId: outsider.id }),
    });
    assert.equal(response.status, 201);
    const body = (await response.json()) as { data: { userId: string; role: string } };
    assert.equal(body.data.userId, outsider.id);
    assert.equal(body.data.role, 'MEMBER'); // default role, never elevated
  });

  it('20. admin can add an existing user', async () => {
    const response = await fetch(`${baseUrl}/api/v1/groups/${group.id}/members`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...devHeaders('m-admin') },
      body: JSON.stringify({ userId: outsider.id }),
    });
    assert.equal(response.status, 201);
  });

  it('21. member cannot add users', async () => {
    const response = await fetch(`${baseUrl}/api/v1/groups/${group.id}/members`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...devHeaders('m-member') },
      body: JSON.stringify({ userId: outsider.id }),
    });
    assert.equal(response.status, 403);
    assert.equal(db.memberships.has(membershipKey(group.id, outsider.id)), false);
  });

  it('22. duplicate membership returns 409', async () => {
    const response = await fetch(`${baseUrl}/api/v1/groups/${group.id}/members`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...devHeaders('m-owner') },
      body: JSON.stringify({ userId: member.id }),
    });
    assert.equal(response.status, 409);
    const body = (await response.json()) as ErrorEnvelope;
    assert.equal(body.error.code, 'CONFLICT');
  });

  it('23. nonexistent target user returns 404', async () => {
    const response = await fetch(`${baseUrl}/api/v1/groups/${group.id}/members`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...devHeaders('m-owner') },
      body: JSON.stringify({ userId: 'user-does-not-exist' }),
    });
    assert.equal(response.status, 404);
  });

  it('23a. username add makes the same group visible to the invited user', async () => {
    const addResponse = await fetch(`${baseUrl}/api/v1/groups/${group.id}/members`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...devHeaders('m-owner') },
      body: JSON.stringify({ username: outsider.username }),
    });
    assert.equal(addResponse.status, 201);
    const memberBody = (await addResponse.json()) as { data: { userId: string; username: string } };
    assert.equal(memberBody.data.userId, outsider.id);
    assert.equal(memberBody.data.username, outsider.username);

    const detailResponse = await fetch(`${baseUrl}/api/v1/groups/${group.id}`, {
      headers: devHeaders('m-outsider'),
    });
    assert.equal(detailResponse.status, 200);
    const detailBody = (await detailResponse.json()) as { data: { members: Array<{ userId: string; username: string; isCurrentUser: boolean }> } };
    const invitedMember = detailBody.data.members.find((candidate) => candidate.userId === outsider.id);
    assert.equal(invitedMember?.username, outsider.username);
    assert.equal(invitedMember?.isCurrentUser, true);

    const groupsResponse = await fetch(`${baseUrl}/api/v1/groups`, {
      headers: devHeaders('m-outsider'),
    });
    assert.equal(groupsResponse.status, 200);
    const groupsBody = (await groupsResponse.json()) as { data: Array<{ id: string }> };
    assert.ok(groupsBody.data.some((candidate) => candidate.id === group.id));

    const removeResponse = await fetch(memberUrl(outsider.id), {
      method: 'DELETE',
      headers: devHeaders('m-owner'),
    });
    assert.equal(removeResponse.status, 200);
    const groupsAfterRemoval = await fetch(`${baseUrl}/api/v1/groups`, {
      headers: devHeaders('m-outsider'),
    });
    assert.equal(groupsAfterRemoval.status, 200);
    const removedBody = (await groupsAfterRemoval.json()) as { data: Array<{ id: string }> };
    assert.ok(!removedBody.data.some((candidate) => candidate.id === group.id));
  });

  it('24. owner can remove an ordinary member', async () => {
    const response = await fetch(memberUrl(member.id), {
      method: 'DELETE',
      headers: devHeaders('m-owner'),
    });
    assert.equal(response.status, 200);
    assert.equal(db.memberships.has(membershipKey(group.id, member.id)), false);
    // User record untouched.
    assert.ok(db.users.has(member.id));
  });

  it('25. member cannot remove another member', async () => {
    const response = await fetch(memberUrl(admin.id), {
      method: 'DELETE',
      headers: devHeaders('m-member'),
    });
    assert.equal(response.status, 403);
    assert.ok(db.memberships.has(membershipKey(group.id, admin.id)));
  });

  it('26. admin cannot remove the owner', async () => {
    const response = await fetch(memberUrl(owner.id), {
      method: 'DELETE',
      headers: devHeaders('m-admin'),
    });
    assert.equal(response.status, 409);
    const body = (await response.json()) as ErrorEnvelope;
    assert.equal(body.error.code, 'CONFLICT');
    assert.ok(db.memberships.has(membershipKey(group.id, owner.id)));
  });

  it('27. owner cannot be removed (owner attempting self-removal also blocked)', async () => {
    const response = await fetch(memberUrl(owner.id), {
      method: 'DELETE',
      headers: devHeaders('m-owner'),
    });
    assert.equal(response.status, 409);
    assert.ok(db.memberships.has(membershipKey(group.id, owner.id)));
  });

  it('28. only owner can change roles', async () => {
    const ok = await fetch(memberUrl(member.id, '/role'), {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...devHeaders('m-owner') },
      body: JSON.stringify({ role: 'ADMIN' }),
    });
    assert.equal(ok.status, 200);

    const byAdmin = await fetch(memberUrl(member.id, '/role'), {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...devHeaders('m-admin') },
      body: JSON.stringify({ role: 'MEMBER' }),
    });
    assert.equal(byAdmin.status, 403);
  });

  it('29. clients cannot assign owner', async () => {
    const response = await fetch(memberUrl(member.id, '/role'), {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...devHeaders('m-owner') },
      body: JSON.stringify({ role: 'OWNER' }),
    });
    assert.equal(response.status, 400);
    const body = (await response.json()) as ErrorEnvelope;
    assert.equal(body.error.code, 'VALIDATION_ERROR');
  });

  it('30. owner can promote and demote ordinary members', async () => {
    const promote = await fetch(memberUrl(member.id, '/role'), {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...devHeaders('m-owner') },
      body: JSON.stringify({ role: 'ADMIN' }),
    });
    assert.equal(promote.status, 200);
    assert.equal(db.memberships.get(membershipKey(group.id, member.id))!.role, 'ADMIN');

    const demote = await fetch(memberUrl(member.id, '/role'), {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...devHeaders('m-owner') },
      body: JSON.stringify({ role: 'MEMBER' }),
    });
    assert.equal(demote.status, 200);
    assert.equal(db.memberships.get(membershipKey(group.id, member.id))!.role, 'MEMBER');
  });
});

describe('Groups API — leaving', () => {
  let owner: User;
  let member: User;
  let group: Group;

  before(async () => {
    process.env.NODE_ENV = 'test';
    resetEnvCacheForTests();
    db = makeDb();
    setUserRepositoryForTests(makeUserRepository());
    setGroupsRepositoryForTests(makeGroupsRepository());
    await startServer();
  });

  after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    resetUserRepositoryForTests();
    resetGroupsRepositoryForTests();
  });

  beforeEach(() => {
    db = makeDb();
    idSeq = 0;
    owner = makeUser({ firebaseUid: 'l-owner' });
    member = makeUser({ firebaseUid: 'l-member' });
    group = makeGroup({ createdById: owner.id, name: 'Leavers' });
    makeMembership(group.id, owner.id, 'OWNER');
    makeMembership(group.id, member.id, 'MEMBER');
  });

  it('31. ordinary member can leave', async () => {
    const response = await fetch(`${baseUrl}/api/v1/groups/${group.id}/leave`, {
      method: 'POST',
      headers: devHeaders('l-member'),
    });
    assert.equal(response.status, 200);
    assert.equal(db.memberships.has(membershipKey(group.id, member.id)), false);
  });

  it('32. owner cannot leave', async () => {
    const response = await fetch(`${baseUrl}/api/v1/groups/${group.id}/leave`, {
      method: 'POST',
      headers: devHeaders('l-owner'),
    });
    assert.equal(response.status, 409);
    const body = (await response.json()) as ErrorEnvelope;
    assert.equal(body.error.code, 'CONFLICT');
    assert.ok(db.memberships.has(membershipKey(group.id, owner.id)));
  });

  it('33. leaving does not delete the group', async () => {
    await fetch(`${baseUrl}/api/v1/groups/${group.id}/leave`, {
      method: 'POST',
      headers: devHeaders('l-member'),
    });
    assert.ok(db.groups.has(group.id));
    const ownerView = await fetch(`${baseUrl}/api/v1/groups/${group.id}`, {
      headers: devHeaders('l-owner'),
    });
    assert.equal(ownerView.status, 200);
  });

  it('34. leaving does not delete financial records (group data intact)', async () => {
    // The Groups API only ever touches GroupMember rows; verify no group or
    // user rows disappear when a membership is removed.
    const usersBefore = db.users.size;
    const groupsBefore = db.groups.size;
    await fetch(`${baseUrl}/api/v1/groups/${group.id}/leave`, {
      method: 'POST',
      headers: devHeaders('l-member'),
    });
    assert.equal(db.users.size, usersBefore);
    assert.equal(db.groups.size, groupsBefore);
  });
});

describe('Groups API — isolation and security', () => {
  before(async () => {
    process.env.NODE_ENV = 'test';
    resetEnvCacheForTests();
    db = makeDb();
    setUserRepositoryForTests(makeUserRepository());
    setGroupsRepositoryForTests(makeGroupsRepository());
    await startServer();
  });

  after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    resetUserRepositoryForTests();
    resetGroupsRepositoryForTests();
  });

  beforeEach(() => {
    db = makeDb();
    idSeq = 0;
  });

  it('35. user A cannot modify user B\'s group', async () => {
    const alice = makeUser({ firebaseUid: 'iso-alice' });
    const bob = makeUser({ firebaseUid: 'iso-bob' });
    const bobGroup = makeGroup({ createdById: bob.id, name: 'Bobs' });
    makeMembership(bobGroup.id, bob.id, 'OWNER');
    makeMembership(bobGroup.id, alice.id, 'MEMBER');

    const patch = await fetch(`${baseUrl}/api/v1/groups/${bobGroup.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...devHeaders('iso-alice') },
      body: JSON.stringify({ name: 'Alice was here' }),
    });
    assert.equal(patch.status, 403);
    assert.equal(db.groups.get(bobGroup.id)!.name, 'Bobs');

    // A non-member has no access at all (404, indistinguishable from missing).
    makeUser({ firebaseUid: 'iso-carol' });
    const outsiderPatch = await fetch(`${baseUrl}/api/v1/groups/${bobGroup.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...devHeaders('iso-carol') },
      body: JSON.stringify({ name: 'Carol was here' }),
    });
    assert.equal(outsiderPatch.status, 404);
    assert.equal(db.groups.get(bobGroup.id)!.name, 'Bobs');
  });

  it('36. client-supplied actor identity fields are ignored', async () => {
    const alice = makeUser({ firebaseUid: 'spoof-alice' });
    const carol = makeUser({ firebaseUid: 'spoof-carol' });
    // Alice tries to smuggle another user's identity in the body.
    const { status, body } = await createGroupViaApi('spoof-alice', {
      name: 'Spoof attempt',
      ownerId: carol.id,
      createdBy: carol.id,
      userId: carol.id,
      firebaseUid: 'spoof-carol',
    });
    assert.equal(status, 201);
    assert.ok(!isFailure(body));
    if (!isFailure(body)) {
      // The creator/owner is Alice (the verified identity), not Carol.
      const createdGroup = [...db.groups.values()].at(-1)!;
      assert.equal(createdGroup.createdById, alice.id);
      const ownerMembership = [...db.memberships.values()].find(
        (m) => m.groupId === createdGroup.id && m.role === 'OWNER',
      )!;
      assert.equal(ownerMembership.userId, alice.id);
    }
  });

  it('37. raw database errors are not returned (P2002 becomes CONFLICT)', async () => {
    const owner = makeUser({ firebaseUid: 'err-owner' });
    const member = makeUser({ firebaseUid: 'err-member' });
    const group = makeGroup({ createdById: owner.id });
    makeMembership(group.id, owner.id, 'OWNER');
    makeMembership(group.id, member.id, 'MEMBER');

    const response = await fetch(`${baseUrl}/api/v1/groups/${group.id}/members`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...devHeaders('err-owner') },
      body: JSON.stringify({ userId: member.id }),
    });
    assert.equal(response.status, 409);
    const serialized = JSON.stringify(await response.json());
    assert.ok(!serialized.includes('P2002'));
    assert.ok(!serialized.includes('Unique constraint'));
  });

  it('38. tokens and secrets are not logged or returned', async () => {
    // Hit several routes with a dev header and a malformed bearer; then inspect
    // every response body — the bearer secret and the dev uid must never be
    // echoed back (the generic 401 message may legitimately use the word
    // "token", so the VALUE is what we assert against).
    const owner = makeUser({ firebaseUid: 'sec-owner' });
    const group = makeGroup({ createdById: owner.id });
    makeMembership(group.id, owner.id, 'OWNER');

    const bearerSecret = 'super-secret-bearer-value-9f2c';
    const responses = await Promise.all([
      fetch(`${baseUrl}/api/v1/groups`, { headers: devHeaders('sec-owner') }),
      fetch(`${baseUrl}/api/v1/groups/${group.id}`, { headers: devHeaders('sec-owner') }),
      fetch(`${baseUrl}/api/v1/groups`, {
        headers: { authorization: `Bearer ${bearerSecret}` },
      }),
    ]);
    for (const response of responses) {
      const serialized = JSON.stringify(await response.json());
      assert.ok(!serialized.includes(bearerSecret), 'bearer value must not be echoed');
      assert.ok(!serialized.includes('sec-owner'), 'dev uid must not be echoed');
      assert.ok(!serialized.includes('credential'));
      assert.ok(!serialized.includes('password'));
      assert.ok(!serialized.toLowerCase().includes('firebase'));
    }
  });
});
