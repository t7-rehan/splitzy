/**
 * Current-user service (Task 4).
 *
 * Resolves a verified identity (Firebase UID) to the internal PostgreSQL User:
 *
 *   verified Firebase UID -> find User by firebaseUid -> return User
 *                                               |
 *                                       not found -> provision User
 *
 * Provisioning (first login) uses ONLY verified token claims — never
 * client-supplied body/header values. User-editable application profile
 * fields (avatarId, currencyCode, timezone) are NOT touched on subsequent
 * logins; only identity-derived fields may be backfilled if they were empty.
 *
 * Concurrency: two concurrent first logins race through `findUnique` and both
 * attempt `create`. The database-level UNIQUE constraint on User.firebaseUid
 * is the source of truth — the loser of the race catches Prisma's P2002 and
 * simply re-reads the winner's row. No duplicates are possible.
 */
import type { User } from '@prisma/client';
import { getPrismaClient } from './db.js';
import type { VerifiedIdentity } from '../types/auth.js';

/** Minimal repository surface the service needs — swappable in tests. */
export interface UserRepository {
  findUnique(args: { where: { firebaseUid: string } }): Promise<User | null>;
  create(args: {
    data: {
      firebaseUid: string;
      email: string;
      name: string;
      photoUrl?: string | null;
    };
  }): Promise<User>;
  update(args: {
    where: { firebaseUid: string };
    data: {
      email?: string;
      name?: string;
      photoUrl?: string;
    };
  }): Promise<User>;
}

const globalForUserRepo = globalThis as unknown as {
  splitzyUserRepository?: UserRepository | undefined;
};

function defaultRepository(): UserRepository {
  return getPrismaClient().user;
}

/** Test hook: substitute an in-memory repository so tests need no database. */
export function setUserRepositoryForTests(repository: UserRepository): void {
  globalForUserRepo.splitzyUserRepository = repository;
}

export function resetUserRepositoryForTests(): void {
  globalForUserRepo.splitzyUserRepository = undefined;
}

function repository(): UserRepository {
  return globalForUserRepo.splitzyUserRepository ?? defaultRepository();
}

/** Derive a non-empty display name from verified claims. */
function displayNameFrom(identity: VerifiedIdentity): string {
  if (identity.displayName && identity.displayName.trim().length > 0) {
    return identity.displayName.trim();
  }
  if (identity.email && identity.email.includes('@')) {
    return identity.email.split('@')[0] ?? 'Splitzy User';
  }
  return 'Splitzy User';
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

/**
 * Find the Splitzy User for a verified identity, provisioning one on first
 * login. Returns the internal PostgreSQL User record.
 */
export async function findOrProvisionUser(
  identity: VerifiedIdentity,
): Promise<User> {
  const repo = repository();

  const existing = await repo.findUnique({
    where: { firebaseUid: identity.firebaseUid },
  });
  if (existing) {
    // Backfill identity-derived fields that were empty at provision time.
    // Deliberately does NOT overwrite user-editable profile fields.
    const email = identity.email !== undefined && existing.email !== identity.email ? identity.email : undefined;
    const name =
      identity.displayName !== undefined &&
      existing.name.length === 0 &&
      identity.displayName.trim().length > 0
        ? identity.displayName.trim()
        : undefined;
    const photoUrl =
      identity.photoUrl !== undefined && existing.photoUrl === null
        ? identity.photoUrl
        : undefined;

    if (email !== undefined || name !== undefined || photoUrl !== undefined) {
      return repo.update({
        where: { firebaseUid: identity.firebaseUid },
        data: {
          ...(email !== undefined ? { email } : {}),
          ...(name !== undefined ? { name } : {}),
          ...(photoUrl !== undefined ? { photoUrl } : {}),
        },
      });
    }
    return existing;
  }

  // First login: provision from verified claims only. If two requests race,
  // the UNIQUE(firebaseUid) constraint rejects the loser with P2002 and we
  // re-read the winner's row — exactly one user exists per Firebase UID.
  try {
    return await repo.create({
      data: {
        firebaseUid: identity.firebaseUid,
        email: identity.email ?? `${identity.firebaseUid}@users.splitzy.local`,
        name: displayNameFrom(identity),
        photoUrl: identity.photoUrl ?? null,
      },
    });
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      const winner = await repo.findUnique({
        where: { firebaseUid: identity.firebaseUid },
      });
      if (winner) return winner;
    }
    throw error;
  }
}

/** Safe client-facing projection — contains no credentials or tokens. */
export function toPublicUser(user: User): {
  id: string;
  firebaseUid: string;
  email: string;
  displayName: string;
  photoUrl: string | null;
} {
  return {
    id: user.id,
    firebaseUid: user.firebaseUid,
    email: user.email,
    displayName: user.name,
    photoUrl: user.photoUrl,
  };
}
