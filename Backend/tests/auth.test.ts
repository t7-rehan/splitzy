import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { resetEnvCacheForTests } from '../src/config/env.js';
import {
  resetTokenVerifierForTests,
  setTokenVerifierForTests,
} from '../src/services/authService.js';
import {
  findOrProvisionUser,
  resetUserRepositoryForTests,
  setUserRepositoryForTests,
  toPublicUser,
  type UserRepository,
} from '../src/services/currentUserService.js';
import type { VerifiedIdentity } from '../src/types/auth.js';

/**
 * Task 4 authentication tests.
 *
 * No real Firebase project and no PostgreSQL are required:
 *  - Bearer-token verification is exercised through the injected test
 *    verifier (setTokenVerifierForTests), the same seam production Firebase
 *    Admin verification plugs into.
 *  - User provisioning runs against an in-memory repository that emulates
 *    the UNIQUE(firebaseUid) constraint (P2002 on duplicate create).
 */

interface ErrorEnvelope {
  success: false;
  error: { code: string; message: string };
}

interface MeBody {
  success: true;
  data: {
    id: string;
    firebaseUid: string;
    email: string;
    displayName: string;
    photoUrl: string | null;
  };
}

/** In-memory User table emulating UNIQUE(firebaseUid). */
function makeFakeUserRepository(): UserRepository & { counts: Map<string, number> } {
  const rows = new Map<string, import('@prisma/client').User>();
  const counts = new Map<string, number>();
  let idSeq = 0;

  const now = () => new Date();

  return {
    counts,
    async findUnique({ where }) {
      return rows.get(where.firebaseUid) ?? null;
    },
    async create({ data }) {
      // Force interleaving FIRST, then run the constraint check + insert
      // synchronously (atomic in JS, mirroring PostgreSQL serializing the
      // unique-constraint decision).
      await new Promise((resolve) => setTimeout(resolve, 5));
      counts.set(data.firebaseUid, (counts.get(data.firebaseUid) ?? 0) + 1);
      // Emulate the UNIQUE(firebaseUid) constraint exactly like PostgreSQL:
      // the loser of the race rejects with P2002.
      if (rows.has(data.firebaseUid)) {
        const violation: { code: string } = { code: 'P2002' };
        throw violation;
      }
      const row: import('@prisma/client').User = {
        id: `user-${++idSeq}`,
        firebaseUid: data.firebaseUid,
        email: data.email,
        name: data.name,
        photoUrl: data.photoUrl ?? null,
        avatarId: null,
        currencyCode: 'INR',
        timezone: 'UTC',
        createdAt: now(),
        updatedAt: now(),
      };
      rows.set(data.firebaseUid, row);
      return row;
    },
    async update({ where, data }) {
      const row = rows.get(where.firebaseUid);
      if (!row) throw new Error('Record not found');
      if (data.email !== undefined) row.email = data.email;
      if (data.name !== undefined) row.name = data.name;
      if (data.photoUrl !== undefined) row.photoUrl = data.photoUrl;
      row.updatedAt = now();
      return row;
    },
  };
}

function withProductionEnv(): void {
  process.env.NODE_ENV = 'production';
  resetEnvCacheForTests();
}

function withTestEnv(): void {
  process.env.NODE_ENV = 'test';
  resetEnvCacheForTests();
}

async function startServer(): Promise<{ server: Server; baseUrl: string }> {
  const app = createApp();
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

describe('Authentication foundation (Task 4)', () => {
  let server: Server;
  let baseUrl: string;

  before(async () => {
    withTestEnv();
    ({ server, baseUrl } = await startServer());
  });

  after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    resetTokenVerifierForTests();
    resetUserRepositoryForTests();
    withTestEnv();
  });

  it('1. unauthenticated request to /auth/me returns 401', async () => {
    const response = await fetch(`${baseUrl}/api/v1/auth/me`);
    assert.equal(response.status, 401);
    const body = (await response.json()) as ErrorEnvelope;
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'UNAUTHORIZED');
  });

  it('2. malformed Authorization header returns 401', async () => {
    for (const value of ['Basic abc123', 'Bearer', 'Bearer    ', 'Token xyz']) {
      const response = await fetch(`${baseUrl}/api/v1/auth/me`, {
        headers: { authorization: value },
      });
      assert.equal(response.status, 401, `expected 401 for "${value}"`);
      const body = (await response.json()) as ErrorEnvelope;
      assert.equal(body.error.code, 'UNAUTHORIZED');
    }
  });

  it('3. development authentication (x-dev-user-id) works outside production', async () => {
    const repo = makeFakeUserRepository();
    setUserRepositoryForTests(repo);
    const response = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { 'x-dev-user-id': 'dev-firebase-uid-1' },
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as MeBody;
    assert.equal(body.data.firebaseUid, 'dev-firebase-uid-1');
    // Provisioned from the dev identity alone — no email claim exists.
    assert.ok(body.data.email.endsWith('@users.splitzy.local'));
  });

  it('4. development authentication is rejected when NODE_ENV=production', async () => {
    withProductionEnv();
    const prodApp = createApp();
    const prodServer = prodApp.listen(0);
    await new Promise<void>((resolve) => prodServer.once('listening', resolve));
    const port = (prodServer.address() as AddressInfo).port;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/v1/auth/me`, {
        headers: { 'x-dev-user-id': 'dev-firebase-uid-1' },
      });
      assert.equal(response.status, 401);
      const body = (await response.json()) as ErrorEnvelope;
      assert.equal(body.error.code, 'UNAUTHORIZED');
    } finally {
      prodServer.closeAllConnections();
      await new Promise<void>((resolve) => prodServer.close(() => resolve()));
      withTestEnv();
    }
  });

  it('5. verified token identity reaches the request context (Bearer path)', async () => {
    const repo = makeFakeUserRepository();
    setUserRepositoryForTests(repo);
    // Stub the production verification seam: this is exactly where the
    // Firebase Admin verifyIdToken() result appears.
    setTokenVerifierForTests(async (idToken) => {
      assert.equal(idToken, 'valid-firebase-id-token');
      const identity: VerifiedIdentity = {
        firebaseUid: 'firebase-uid-from-token',
        email: 'ada@example.com',
        displayName: 'Ada Lovelace',
        photoUrl: 'https://photos.example.com/ada.png',
        method: 'firebase',
      };
      return identity;
    });

    const response = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { authorization: 'Bearer valid-firebase-id-token' },
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as MeBody;
    // Identity fields come from the VERIFIED token, not from any client header.
    assert.equal(body.data.firebaseUid, 'firebase-uid-from-token');
    assert.equal(body.data.displayName, 'Ada Lovelace');
    assert.equal(body.data.email, 'ada@example.com');
  });

  it('6. invalid token under the verifier returns 401 with the error envelope', async () => {
    setTokenVerifierForTests(async () => {
      throw new Error('ID token expired');
    });
    const response = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { authorization: 'Bearer expired-token' },
    });
    assert.equal(response.status, 401);
    const body = (await response.json()) as ErrorEnvelope;
    assert.equal(body.error.code, 'UNAUTHORIZED');
    // The raw verifier error must not leak into the response.
    assert.ok(!JSON.stringify(body).includes('ID token expired'));
  });

  it('7. first-login provisioning creates a User from verified claims', async () => {
    const repo = makeFakeUserRepository();
    setUserRepositoryForTests(repo);
    const user = await findOrProvisionUser({
      firebaseUid: 'uid-first-login',
      email: 'grace@example.com',
      displayName: 'Grace Hopper',
      photoUrl: 'https://photos.example.com/grace.png',
      method: 'firebase',
    });
    assert.equal(user.firebaseUid, 'uid-first-login');
    assert.equal(user.email, 'grace@example.com');
    assert.equal(user.name, 'Grace Hopper');
    assert.equal(user.photoUrl, 'https://photos.example.com/grace.png');
    assert.ok(user.id.length > 0);
    assert.equal(repo.counts.get('uid-first-login'), 1);
  });

  it('8. existing User is reused for the same Firebase UID (no rewrite)', async () => {
    const repo = makeFakeUserRepository();
    setUserRepositoryForTests(repo);
    const identity: VerifiedIdentity = {
      firebaseUid: 'uid-returning',
      email: 'alan@example.com',
      displayName: 'Alan Turing',
      method: 'firebase',
    };
    const first = await findOrProvisionUser(identity);
    const second = await findOrProvisionUser(identity);
    assert.equal(first.id, second.id);
    // Exactly one create happened for this UID.
    assert.equal(repo.counts.get('uid-returning'), 1);
  });

  it('9. concurrent first logins for one UID cannot create duplicate users', async () => {
    const repo = makeFakeUserRepository();
    setUserRepositoryForTests(repo);
    const identity: VerifiedIdentity = {
      firebaseUid: 'uid-race',
      email: 'race@example.com',
      method: 'firebase',
    };
    const [a, b, c] = await Promise.all([
      findOrProvisionUser(identity),
      findOrProvisionUser(identity),
      findOrProvisionUser(identity),
    ]);
    assert.equal(a.id, b.id);
    assert.equal(b.id, c.id);
    assert.equal(repo.counts.get('uid-race'), 3, 'all three raced into create');
    // The P2002 losers re-read the winner's row: one user, three identical results.
    assert.equal(repo.counts.size, 1);
  });

  it('10. /auth/me returns only safe public fields (no tokens or internals)', async () => {
    const repo = makeFakeUserRepository();
    setUserRepositoryForTests(repo);
    const response = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { 'x-dev-user-id': 'uid-privacy' },
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as MeBody;
    assert.deepEqual(body.data, {
      id: body.data.id,
      firebaseUid: 'uid-privacy',
      email: body.data.email,
      displayName: body.data.displayName,
      photoUrl: null,
    });
    assert.deepEqual(Object.keys(body.data).sort(), [
      'displayName',
      'email',
      'firebaseUid',
      'id',
      'photoUrl',
    ]);
    const serialized = JSON.stringify(body).toLowerCase();
    for (const forbidden of ['token', 'secret', 'credential', 'password']) {
      assert.ok(!serialized.includes(forbidden), `response must not contain "${forbidden}"`);
    }
  });

  it('toPublicUser never exposes more than the public projection', () => {
    const publicUser = toPublicUser({
      id: 'u1',
      firebaseUid: 'f1',
      email: 'e@x.com',
      name: 'N',
      photoUrl: null,
      avatarId: null,
      currencyCode: 'INR',
      timezone: 'UTC',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    assert.deepEqual(Object.keys(publicUser).sort(), [
      'displayName',
      'email',
      'firebaseUid',
      'id',
      'photoUrl',
    ]);
  });
});
