/**
 * Groups feature contracts (Task 5).
 *
 * Response shapes and request-augmentation types for the Groups API. Business
 * rules live in `src/services/groups.service.ts`; these types are the shared
 * vocabulary between middleware, services and controllers.
 */
import type { Group, GroupMember, GroupRole, User } from '@prisma/client';

/** The authenticated actor, resolved from the verified identity (never client input). */
export interface ActorContext {
  user: User;
}

/**
 * Express request augmentation (extends the Task 4 `req.auth` augmentation):
 * `actor` is set after the verified identity is resolved to a PostgreSQL User;
 * `groupMembership` is set on :groupId routes once membership is confirmed.
 * Controllers treat both as present.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      actor?: ActorContext;
      groupMembership?: GroupMember;
    }
  }
}

/** A member as exposed in group details — minimum safe public fields. */
export interface PublicMember {
  /** Internal Splitzy user id — the target identifier for member routes. */
  userId: string | null;
  username: string | null;
  displayName: string;
  isCurrentUser: boolean;
  /** Avatar token. Email is deliberately NOT included (minimum public info). */
  avatarId: string | null;
  role: GroupRole;
  joinedAt: string;
  upiId: string | null;
  upiQrDataUrl: string | null;
}

/** Group details (single-group view). */
export interface GroupDetails {
  id: string;
  name: string;
  description: string | null;
  currencyCode: string;
  isRoommateGroup: boolean;
  createdAt: string;
  updatedAt: string;
  /** The authenticated user's role in this group. */
  viewerRole: GroupRole;
  memberCount: number;
  members: PublicMember[];
}

/** A group as it appears in the current user's list. */
export interface GroupSummary {
  id: string;
  name: string;
  description: string | null;
  currencyCode: string;
  isRoommateGroup: boolean;
  createdAt: string;
  updatedAt: string;
  viewerRole: GroupRole;
  memberCount: number;
  /** The authenticated user's membership row id. */
  membershipId: string;
  joinedAt: string;
}

export type { Group, GroupMember, GroupRole, User };
