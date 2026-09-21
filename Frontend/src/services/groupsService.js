/**
 * Groups API service (Task 8) — server-backed group operations.
 *
 * Implemented (used by the existing UI in this task):
 *   GET    /api/v1/groups                → list the signed-in user's groups
 *   GET    /api/v1/groups/:groupId       → authoritative group details
 *   POST   /api/v1/groups                → create (server assigns id/creator/OWNER)
 *   PATCH  /api/v1/groups/:groupId       → update name/description/currency
 *
 * Deliberately NOT implemented yet (documented, not wired to any UI):
 *   POST /leave, POST /members, DELETE /members/:userId, PATCH members role —
 *   the current member UI manages free-text local names ("Rahul"), which cannot
 *   identify an existing server User (the backend requires a real user ID and
 *   rejects arbitrary names/emails). Wiring member mutations needs the later
 *   member-identity task; inventing an invitation system is out of scope.
 *
 * Identity/authorization: exclusively the Firebase ID token via apiClient.
 * No creator/user/firebaseUid fields are ever sent in bodies.
 */

import { apiGet, apiPost, apiPatch, apiDelete } from "./apiClient.js";

/** Validate a server-assigned group id (UUID) before using it in a path. */
export function assertGroupId(groupId) {
  if (typeof groupId !== "string" || groupId.length === 0) {
    throw new Error("A server-backed group id is required");
  }
}

/**
 * List the authenticated user's server groups (GroupSummary[] envelope data).
 */
export function fetchMyGroups() {
  return apiGet("/api/v1/groups");
}

/** Fetch authoritative group details (members, roles, metadata). */
export function fetchGroupDetails(groupId) {
  assertGroupId(groupId);
  return apiGet(`/api/v1/groups/${encodeURIComponent(groupId)}`);
}

export function searchUsersByUsername(username) {
  const value = String(username || '').trim().replace(/^@+/, '');
  if (!value) throw new Error('Username is required');
  return apiGet(`/api/v1/users/search?username=${encodeURIComponent(value)}`);
}

export function addGroupMember(groupId, username) {
  assertGroupId(groupId);
  return apiPost(`/api/v1/groups/${encodeURIComponent(groupId)}/members`, { username });
}

export function removeGroupMember(groupId, userId) {
  assertGroupId(groupId);
  return apiDelete(`/api/v1/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}`);
}

/**
 * Create a group. The backend determines creator, OWNER membership, id and
 * timestamps — the request body carries only the group's content fields.
 */
export function createGroup({ name, currencyCode, isRoommateGroup }) {
  const payload = { name };
  if (currencyCode !== undefined) payload.currencyCode = currencyCode;
  if (isRoommateGroup !== undefined) payload.isRoommateGroup = isRoommateGroup;
  return apiPost("/api/v1/groups", payload);
}

/**
 * Update group fields. Only whitelisted fields are ever sent — identity,
 * membership, timestamps and roles are server-controlled.
 */
export function updateGroup(groupId, { name, description, currencyCode } = {}) {
  assertGroupId(groupId);
  const payload = {};
  if (name !== undefined) payload.name = name;
  if (description !== undefined) payload.description = description;
  if (currencyCode !== undefined) payload.currencyCode = currencyCode;
  if (Object.keys(payload).length === 0) {
    throw new Error("No updatable fields provided");
  }
  return apiPatch(`/api/v1/groups/${encodeURIComponent(groupId)}`, payload);
}

/** Delete a server-backed group after the backend verifies creator ownership. */
export function deleteGroup(groupId) {
  assertGroupId(groupId);
  return apiDelete(`/api/v1/groups/${encodeURIComponent(groupId)}`);
}
