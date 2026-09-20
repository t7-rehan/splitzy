/**
 * Groups service (Task 5).
 *
 * All Groups API business rules live here; controllers stay thin and the
 * authorization middleware (groupAuthorization.ts) resolves actor + membership
 * before calling into these functions.
 *
 * Authorization model:
 *   verified identity -> PostgreSQL User (actor) -> GroupMember -> GroupRole
 * Client-supplied ownerId/createdBy/firebaseUid/actor userId are never trusted.
 *
 * The repository interface is the only database seam, so the whole service is
 * testable without PostgreSQL (injected in-memory repository, mirroring the
 * Task 4 strategy). Production wires the real Prisma client.
 */
import type { Group, GroupMember, GroupRole, User } from '@prisma/client';
import { AppError, ErrorCodes } from '../utils/appError.js';
import { getPrismaClient } from './db.js';
import type {
  GroupDetails,
  GroupSummary,
  PublicMember,
} from '../types/groups.js';

// ---------------------------------------------------------------------------
// Domain constants
// ---------------------------------------------------------------------------

export const GROUP_NAME_MAX = 60;
export const GROUP_DESCRIPTION_MAX = 280;

/** Currencies Splitzy supports (mirrors Frontend/src/services/currency.js). */
export const SUPPORTED_CURRENCY_CODES = [
  'INR',
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'AUD',
] as const;

export type SupportedCurrencyCode = (typeof SUPPORTED_CURRENCY_CODES)[number];

// ---------------------------------------------------------------------------
// Repository seam (production: Prisma; tests: injected in-memory)
// ---------------------------------------------------------------------------

export interface GroupCreateData {
  name: string;
  description: string | null;
  currencyCode: string;
  isRoommateGroup: boolean;
  createdById: string;
}

export interface GroupUpdateData {
  name?: string;
  description?: string | null;
  currencyCode?: string;
  isRoommateGroup?: boolean;
}

export interface GroupsRepository {
  findUserById(id: string): Promise<User | null>;
  findUserByUsername?(username: string): Promise<User | null>;
  findMembership(groupId: string, userId: string): Promise<GroupMember | null>;
  findGroupById(id: string): Promise<Group | null>;
  findMembershipByGroupAndUser(
    groupId: string,
    userId: string,
  ): Promise<GroupMember | null>;
  listMembershipsForUser(
    userId: string,
  ): Promise<Array<{ membership: GroupMember; group: Group; memberCount: number }>>;
  listMembers(groupId: string): Promise<Array<GroupMember & { user: User | null }>>;
  createGroupWithOwner(
    data: GroupCreateData,
    ownerUserId: string,
  ): Promise<{ group: Group; membership: GroupMember }>;
  createMembership(args: {
    groupId: string;
    userId: string;
    role: GroupRole;
  }): Promise<GroupMember>;
  deleteMembership(groupId: string, userId: string): Promise<void>;
  updateMembershipRole(
    groupId: string,
    userId: string,
    role: GroupRole,
  ): Promise<GroupMember>;
  updateGroup(id: string, data: GroupUpdateData): Promise<Group>;
}

const globalForGroupsRepo = globalThis as unknown as {
  splitzyGroupsRepository?: GroupsRepository | undefined;
};

/** Test hook: substitute an in-memory repository (no PostgreSQL needed). */
export function setGroupsRepositoryForTests(repository: GroupsRepository): void {
  globalForGroupsRepo.splitzyGroupsRepository = repository;
}

export function resetGroupsRepositoryForTests(): void {
  globalForGroupsRepo.splitzyGroupsRepository = undefined;
}

export function groupsRepository(): GroupsRepository {
  if (globalForGroupsRepo.splitzyGroupsRepository) {
    return globalForGroupsRepo.splitzyGroupsRepository;
  }
  if (!prismaRepoSingleton) {
    prismaRepoSingleton = createPrismaGroupsRepository();
  }
  return prismaRepoSingleton;
}

let prismaRepoSingleton: GroupsRepository | null = null;

function createPrismaGroupsRepository(): GroupsRepository {
  // getPrismaClient() is lazy (see services/db.ts): importing the module never
  // constructs a client, and repository methods are only invoked in
  // production paths — injected test doubles bypass this entirely.
  const prisma = getPrismaClient();

  return {
    async findUserById(id) {
      return prisma.user.findUnique({ where: { id } });
    },
    async findUserByUsername(username) {
      return prisma.user.findUnique({ where: { username } });
    },
    async findMembership(groupId, userId) {
      return prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId } },
      });
    },
    async findGroupById(id) {
      return prisma.group.findUnique({ where: { id } });
    },
    findMembershipByGroupAndUser(groupId, userId) {
      return this.findMembership(groupId, userId);
    },
    async listMembershipsForUser(userId) {
      const rows = await prisma.groupMember.findMany({
        where: { userId },
        orderBy: { joinedAt: 'desc' },
        include: {
          group: { include: { _count: { select: { members: true } } } },
        },
      });
      return rows.map((row) => ({
        membership: row,
        group: row.group,
        memberCount: row.group._count.members,
      }));
    },
    async listMembers(groupId) {
      return prisma.groupMember.findMany({
        where: { groupId },
        orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
        include: { user: true },
      });
    },
    async createGroupWithOwner(data, ownerUserId) {
      return prisma.$transaction(async (tx) => {
        const group = await tx.group.create({ data });
        const membership = await tx.groupMember.create({
          data: { groupId: group.id, userId: ownerUserId, role: 'OWNER' },
        });
        return { group, membership };
      });
    },
    async createMembership({ groupId, userId, role }) {
      return prisma.groupMember.create({ data: { groupId, userId, role } });
    },
    async deleteMembership(groupId, userId) {
      await prisma.groupMember.delete({
        where: { groupId_userId: { groupId, userId } },
      });
    },
    async updateMembershipRole(groupId, userId, role) {
      return prisma.groupMember.update({
        where: { groupId_userId: { groupId, userId } },
        data: { role },
      });
    },
    async updateGroup(id, data) {
      return prisma.group.update({ where: { id }, data });
    },
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function asTrimmedString(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim() : undefined;
}

export interface GroupInput {
  name: string;
  description: string | null;
  currencyCode: string;
  isRoommateGroup: boolean;
}

/**
 * Validate a group creation payload. Unknown/forbidden fields (id, ownerId,
 * createdBy, createdAt, ...) are ignored — the API derives them from the
 * authenticated context; the whitelist below is everything a client may set.
 */
export function validateGroupCreate(body: unknown): GroupInput {
  if (typeof body !== 'object' || body === null) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, {
      message: 'Request body must be a JSON object',
      details: { body: ['Expected an object with a "name" field'] },
    });
  }
  const raw = body as Record<string, unknown>;

  const name = asTrimmedString(raw.name);
  if (name === undefined || name.length === 0) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, {
      message: 'Group name is required',
      details: { name: ['Provide a non-empty group name'] },
    });
  }
  if (name.length > GROUP_NAME_MAX) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, {
      message: `Group name must be at most ${GROUP_NAME_MAX} characters`,
      details: { name: [`Maximum ${GROUP_NAME_MAX} characters`] },
    });
  }

  const description = validateOptionalDescription(raw.description);
  const currencyCode = normalizeCurrencyCode(raw.currencyCode ?? 'INR');
  const isRoommateGroup = normalizeRoommateFlag(raw.isRoommateGroup ?? false);

  return { name, description, currencyCode, isRoommateGroup };
}

export interface GroupPatchInput {
  name?: string;
  description?: string | null;
  currencyCode?: string;
  isRoommateGroup?: boolean;
}

/** Validate a group update payload; only provided fields are returned. */
export function validateGroupPatch(body: unknown): GroupPatchInput {
  if (typeof body !== 'object' || body === null) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, {
      message: 'Request body must be a JSON object',
    });
  }
  const raw = body as Record<string, unknown>;
  const patch: GroupPatchInput = {};

  if (raw.name !== undefined) {
    const name = asTrimmedString(raw.name);
    if (name === undefined || name.length === 0) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, {
        message: 'Group name cannot be blank',
        details: { name: ['Provide a non-empty group name'] },
      });
    }
    if (name.length > GROUP_NAME_MAX) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, {
        message: `Group name must be at most ${GROUP_NAME_MAX} characters`,
        details: { name: [`Maximum ${GROUP_NAME_MAX} characters`] },
      });
    }
    patch.name = name;
  }

  if (raw.description !== undefined) {
    patch.description = validateOptionalDescription(raw.description);
  }

  if (raw.currencyCode !== undefined) {
    patch.currencyCode = normalizeCurrencyCode(raw.currencyCode);
  }

  if (raw.isRoommateGroup !== undefined) {
    patch.isRoommateGroup = normalizeRoommateFlag(raw.isRoommateGroup);
  }

  if (Object.keys(patch).length === 0) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, {
      message: 'No updatable fields provided',
      details: {
        body: [
          'Provide at least one of: name, description, currencyCode, isRoommateGroup',
        ],
      },
    });
  }

  return patch;
}

function validateOptionalDescription(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const desc = asTrimmedString(value);
  if (desc === undefined) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, {
      message: 'description must be a string',
      details: { description: ['Expected a string'] },
    });
  }
  if (desc.length > GROUP_DESCRIPTION_MAX) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, {
      message: `description must be at most ${GROUP_DESCRIPTION_MAX} characters`,
      details: { description: [`Maximum ${GROUP_DESCRIPTION_MAX} characters`] },
    });
  }
  return desc.length > 0 ? desc : null;
}

function normalizeCurrencyCode(value: unknown): string {
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

function normalizeRoommateFlag(value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, {
      message: 'isRoommateGroup must be a boolean',
      details: { isRoommateGroup: ['Expected true or false'] },
    });
  }
  return value;
}

/** Validate a membership target: must be a non-empty internal user id. */
export function validateUserIdInput(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, {
      message: 'userId is required',
      details: {
        userId: ['Provide the internal Splitzy user id of an existing user'],
      },
    });
  }
  return value.trim();
}

export function validateUsernameInput(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, {
      message: 'username is required',
      details: { username: ['Provide an existing Splitzy username'] },
    });
  }
  return value.trim().replace(/^@+/, '').toLowerCase();
}

/** Validate a role-change payload against GroupRole (OWNER never allowed). */
export function validateRoleInput(value: unknown): 'ADMIN' | 'MEMBER' {
  if (typeof value !== 'string') {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, {
      message: 'role must be a string',
      details: { role: ['Allowed: ADMIN, MEMBER'] },
    });
  }
  const role = value.trim().toUpperCase();
  if (role === 'OWNER') {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, {
      message: 'Ownership cannot be assigned or transferred',
      details: { role: ['Allowed: ADMIN, MEMBER'] },
    });
  }
  if (role !== 'ADMIN' && role !== 'MEMBER') {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, {
      message: 'Invalid role',
      details: { role: ['Allowed: ADMIN, MEMBER'] },
    });
  }
  return role;
}

// ---------------------------------------------------------------------------
// Safe projections
// ---------------------------------------------------------------------------

export function toPublicMember(
  member: Pick<GroupMember, 'userId' | 'role' | 'joinedAt'>,
  user: Pick<User, 'name' | 'username' | 'avatarId' | 'upiId' | 'upiQrDataUrl'> | null,
  viewerId: string | null = null,
): PublicMember {
  return {
    userId: member.userId,
    username: user?.username ?? null,
    displayName: user?.name ?? 'Former member',
    isCurrentUser: Boolean(viewerId && member.userId === viewerId),
    avatarId: user?.avatarId ?? null,
    role: member.role,
    joinedAt: member.joinedAt.toISOString(),
    upiId: user?.upiId ?? null,
    upiQrDataUrl: user?.upiQrDataUrl ?? null,
  };
}

export function toGroupDetails(
  group: Group,
  members: Array<GroupMember & { user: User | null }>,
  viewerRole: GroupRole,
  viewerId: string | null = null,
): GroupDetails {
  return {
    id: group.id,
    name: group.name,
    description: group.description,
    currencyCode: group.currencyCode,
    isRoommateGroup: group.isRoommateGroup,
    createdAt: group.createdAt.toISOString(),
    updatedAt: group.updatedAt.toISOString(),
    viewerRole,
    memberCount: members.length,
    members: members.map((m) => toPublicMember(m, m.user, viewerId)),
  };
}

export function toGroupSummary(
  group: Group,
  membership: Pick<GroupMember, 'role' | 'joinedAt' | 'id'>,
  memberCount: number,
): GroupSummary {
  return {
    id: group.id,
    name: group.name,
    description: group.description,
    currencyCode: group.currencyCode,
    isRoommateGroup: group.isRoommateGroup,
    createdAt: group.createdAt.toISOString(),
    updatedAt: group.updatedAt.toISOString(),
    viewerRole: membership.role,
    memberCount,
    membershipId: membership.id,
    joinedAt: membership.joinedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Use cases (controllers call these behind the authorization middleware)
// ---------------------------------------------------------------------------

/** Create a group; the actor becomes its OWNER member (single transaction). */
export async function createGroup(
  actor: { user: User },
  input: GroupInput,
): Promise<GroupDetails> {
  const repo = groupsRepository();
  const { group } = await repo.createGroupWithOwner(
    {
      name: input.name,
      description: input.description,
      currencyCode: input.currencyCode,
      isRoommateGroup: input.isRoommateGroup,
      createdById: actor.user.id, // from req.auth — never client input
    },
    actor.user.id,
  );
  const members = await repo.listMembers(group.id);
  return toGroupDetails(group, members, 'OWNER', actor.user.id);
}

/** List only groups where the actor has a GroupMember row. */
export async function listMyGroups(actor: {
  user: User;
}): Promise<GroupSummary[]> {
  const repo = groupsRepository();
  const rows = await repo.listMembershipsForUser(actor.user.id);
  return rows.map((row) =>
    toGroupSummary(row.group, row.membership, row.memberCount),
  );
}

/** Full details of a group the actor belongs to (membership pre-verified). */
export async function getGroupDetails(
  groupId: string,
  viewerRole: GroupRole,
  viewerId: string | null = null,
): Promise<GroupDetails> {
  const repo = groupsRepository();
  const group = await repo.findGroupById(groupId);
  if (!group) {
    // Membership exists but the group row is gone — treat as not found.
    throw new AppError(ErrorCodes.NOT_FOUND);
  }
  const members = await repo.listMembers(groupId);
  return toGroupDetails(group, members, viewerRole, viewerId);
}

/** Update group fields (caller role pre-verified by the route policy). */
export async function updateGroup(
  groupId: string,
  patch: GroupPatchInput,
  viewerRole: GroupRole,
  viewerId: string | null = null,
): Promise<GroupDetails> {
  const repo = groupsRepository();
  const group = await repo.updateGroup(groupId, patch);
  const members = await repo.listMembers(groupId);
  return toGroupDetails(group, members, viewerRole, viewerId);
}

/**
 * Add an existing Splitzy user to a group as MEMBER. The target is identified
 * ONLY by normalized username; duplicate membership (unique constraint) → 409.
 */
export async function addMember(
  groupId: string,
  username: string,
  actorUserId: string,
): Promise<PublicMember> {
  const repo = groupsRepository();
  const targetUserByUsername = repo.findUserByUsername
    ? await repo.findUserByUsername(username)
    : await repo.findUserById(username);
  const targetUser = targetUserByUsername ?? await repo.findUserById(username);
  if (!targetUser) {
    throw new AppError(ErrorCodes.NOT_FOUND, {
      message: 'No Splitzy user found with this username',
      details: { username: ['Register this username before adding the user'] },
    });
  }
  if (targetUser.id === actorUserId) {
    throw new AppError(ErrorCodes.CONFLICT, {
      message: 'You are already a member of this group',
    });
  }
  const existingMembership = await repo.findMembershipByGroupAndUser(groupId, targetUser.id);
  if (existingMembership) {
    throw new AppError(ErrorCodes.CONFLICT, {
      message: 'This user is already a member of this group',
    });
  }
  try {
    const membership = await repo.createMembership({
      groupId,
      userId: targetUser.id,
      role: 'MEMBER',
    });
    return toPublicMember(membership, targetUser);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(ErrorCodes.CONFLICT, {
        message: 'User is already a member of this group',
      });
    }
    throw error;
  }
}

/**
 * Remove a member (caller role pre-verified). Business rules: nobody removes
 * the OWNER; an ADMIN cannot remove another ADMIN.
 */
export async function removeMember(
  groupId: string,
  targetUserId: string,
  actorRole: GroupRole,
): Promise<void> {
  const repo = groupsRepository();
  const target = await repo.findMembershipByGroupAndUser(
    groupId,
    targetUserId,
  );
  if (!target) {
    throw new AppError(ErrorCodes.NOT_FOUND, { message: 'Member not found' });
  }
  if (target.role === 'OWNER') {
    throw new AppError(ErrorCodes.CONFLICT, {
      message: 'The group owner cannot be removed',
    });
  }
  if (actorRole === 'ADMIN' && target.role === 'ADMIN') {
    throw new AppError(ErrorCodes.FORBIDDEN, {
      message: 'Admins cannot remove other admins',
    });
  }
  await repo.deleteMembership(groupId, targetUserId);
}

/**
 * Change a member's role (OWNER only, pre-verified). Only MEMBER <-> ADMIN is
 * possible; ownership can never be assigned or transferred.
 */
export async function changeMemberRole(
  groupId: string,
  targetUserId: string,
  newRole: 'ADMIN' | 'MEMBER',
): Promise<PublicMember> {
  const repo = groupsRepository();
  const target = await repo.findMembershipByGroupAndUser(
    groupId,
    targetUserId,
  );
  if (!target) {
    throw new AppError(ErrorCodes.NOT_FOUND, { message: 'Member not found' });
  }
  if (target.role === 'OWNER') {
    throw new AppError(ErrorCodes.CONFLICT, {
      message: 'The owner role cannot be changed',
    });
  }
  const updated = await repo.updateMembershipRole(
    groupId,
    targetUserId,
    newRole,
  );
  const memberUser = target.userId ? await repo.findUserById(target.userId) : null;
  return toPublicMember(updated, memberUser);
}

/**
 * Leave a group. Rules: the OWNER cannot leave (no ownership transfer in this
 * task); anyone else deletes their own membership. The group and all financial
 * records are untouched.
 */
export async function leaveGroup(
  groupId: string,
  actor: { user: User },
): Promise<{ membershipId: string }> {
  const repo = groupsRepository();
  const membership = await repo.findMembership(groupId, actor.user.id);
  if (!membership) {
    throw new AppError(ErrorCodes.NOT_FOUND, {
      message: 'You are not a member of this group',
    });
  }
  if (membership.role === 'OWNER') {
    throw new AppError(ErrorCodes.CONFLICT, {
      message:
        'The group owner cannot leave. Ownership transfer is not supported yet.',
    });
  }
  await repo.deleteMembership(groupId, actor.user.id);
  return { membershipId: membership.id };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'P2002'
  );
}
