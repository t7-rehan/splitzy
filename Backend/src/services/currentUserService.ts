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
import { AppError, ErrorCodes } from '../utils/appError.js';
import { getPrismaClient } from './db.js';
import type { VerifiedIdentity } from '../types/auth.js';

/** Minimal repository surface the service needs — swappable in tests. */
export interface UserRepository {
  findUnique(args: { where: { firebaseUid?: string; username?: string } }): Promise<User | null>;
  create(args: {
    data: {
      firebaseUid: string;
      email: string;
      name: string;
      username?: string | null;
      photoUrl?: string | null;
      birthdate?: Date | string | null;
      upiId?: string | null;
      upiQrDataUrl?: string | null;
    };
  }): Promise<User>;
  update(args: {
    where: { firebaseUid: string };
    data: {
      email?: string;
      name?: string;
      username?: string | null;
      photoUrl?: string;
      birthdate?: Date | string | null;
      avatarId?: string | null;
      currencyCode?: string;
      timezone?: string;
      upiId?: string | null;
      upiQrDataUrl?: string | null;
    };
  }): Promise<User>;
}

const globalForUserRepo = globalThis as unknown as {
  splitzyUserRepository?: UserRepository | undefined;
};

function defaultRepository(): UserRepository {
  const user = getPrismaClient().user;
  return {
    findUnique: ({ where }) => user.findUnique({ where: where as any }),
    create: (args) => user.create(args),
    update: (args) => user.update(args),
  };
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

export const USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/;

export function normalizeUsername(value: unknown): string {
  if (typeof value !== 'string') {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, {
      message: 'Username is required',
      details: { username: ['Use 3-24 lowercase letters, numbers, or underscores'] },
    });
  }
  const username = value.trim().replace(/^@+/, '').toLowerCase();
  if (!USERNAME_PATTERN.test(username)) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, {
      message: 'Username must be 3-24 characters using lowercase letters, numbers, or underscores',
      details: { username: ['Only lowercase letters, numbers, and underscores are allowed'] },
    });
  }
  return username;
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
function normalizeBirthdate(value: unknown): Date | null | undefined {
  if (value === undefined || value === null || value === '') {
    return value === undefined ? undefined : null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const date = new Date(trimmed);
    if (Number.isNaN(date.getTime())) {
      throw new Error('birthdate must be a valid ISO date string');
    }
    return date;
  }
  throw new Error('birthdate must be a valid ISO date string');
}

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
        username: null,
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
export async function updateCurrentUserProfile(
  identity: VerifiedIdentity,
  patch: Record<string, unknown>,
): Promise<User> {
  const repo = repository();
  const existing = await repo.findUnique({
    where: { firebaseUid: identity.firebaseUid },
  });
  if (!existing) {
    throw new Error('User not found');
  }

  const nextName = typeof patch.name === 'string' ? patch.name.trim() : undefined;
  const nextUsername = 'username' in patch ? normalizeUsername(patch.username) : undefined;
  const nextBirthdate = 'birthdate' in patch ? normalizeBirthdate(patch.birthdate) : undefined;
  const nextAvatarId = typeof patch.avatarId === 'string' ? patch.avatarId : undefined;
  const nextCurrencyCode = typeof patch.currencyCode === 'string' ? patch.currencyCode : undefined;
  const nextTimezone = typeof patch.timezone === 'string' ? patch.timezone : undefined;
  const nextUpiId = typeof patch.upiId === 'string' ? patch.upiId.trim() || null : undefined;
  const nextUpiQrDataUrl = typeof patch.upiQrDataUrl === 'string' ? patch.upiQrDataUrl.trim() || null : undefined;

  const data: Record<string, unknown> = {};
  if (nextName !== undefined && nextName.length > 0) data.name = nextName;
  if (nextUsername !== undefined) data.username = nextUsername;
  if (nextBirthdate !== undefined) data.birthdate = nextBirthdate;
  if (nextAvatarId !== undefined) data.avatarId = nextAvatarId;
  if (nextCurrencyCode !== undefined) data.currencyCode = nextCurrencyCode;
  if (nextTimezone !== undefined) data.timezone = nextTimezone;
  if (nextUpiId !== undefined) data.upiId = nextUpiId;
  if (nextUpiQrDataUrl !== undefined) data.upiQrDataUrl = nextUpiQrDataUrl;

  if (Object.keys(data).length === 0) {
    return existing;
  }

  try {
    return await repo.update({
      where: { firebaseUid: identity.firebaseUid },
      data: data as {
      email?: string;
      name?: string;
      username?: string | null;
      photoUrl?: string;
      birthdate?: Date | string | null;
      upiId?: string | null;
      upiQrDataUrl?: string | null;
      avatarId?: string | null;
      currencyCode?: string;
      timezone?: string;
      },
    });
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      throw new AppError(ErrorCodes.CONFLICT, { message: 'That username is already taken' });
    }
    throw error;
  }
}

export async function findUserByUsername(value: unknown): Promise<User | null> {
  const username = normalizeUsername(value);
  return repository().findUnique({ where: { username } });
}

export function toPublicUserSearchResult(user: User): {
  id: string;
  username: string;
  name: string;
} {
  return { id: user.id, username: user.username!, name: user.name };
}

export function toPublicUser(user: User): {
  id: string;
  email: string;
  displayName: string;
  username: string | null;
  photoUrl: string | null;
  birthdate: string | null;
  profileCompleted: boolean;
  upiId: string | null;
  upiQrDataUrl: string | null;
} {
  return {
    id: user.id,
    email: user.email,
    displayName: user.name,
    username: user.username ?? null,
    photoUrl: user.photoUrl,
    birthdate: user.birthdate ? user.birthdate.toISOString() : null,
    profileCompleted: Boolean(user.name && user.username && user.birthdate),
    upiId: user.upiId ?? null,
    upiQrDataUrl: user.upiQrDataUrl ?? null,
  };
}
