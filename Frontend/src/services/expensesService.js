/**
 * Expenses API service (Task 9) — server-backed expense operations.
 *
 * Implemented against the Task 6 API (verified routes/middleware):
 *   GET    /api/v1/groups/:groupId/expenses            → list (member)
 *   GET    /api/v1/groups/:groupId/expenses/:expenseId → detail (member)
 *   POST   /api/v1/groups/:groupId/expenses            → create (member)
 *   PATCH  /api/v1/groups/:groupId/expenses/:expenseId → update (creator or OWNER/ADMIN)
 *   DELETE /api/v1/groups/:groupId/expenses/:expenseId → delete (creator or OWNER/ADMIN)
 *
 * Reuses the Task 8 apiClient (single HTTP seam, Firebase bearer auth,
 * envelope unwrapping, ApiError normalization, one 401 token-refresh retry).
 * No second HTTP client, no second Firebase init.
 *
 * Identity/authorization: exclusively the Firebase ID token via apiClient.
 * No expense/group/creator/user id fields are ever sent in bodies — the
 * backend derives creator from the verified token and members from the DB.
 */

import { apiGet, apiPost, apiPatch, apiDelete } from "./apiClient.js";
import { assertGroupId } from "./groupsService.js";

/** Validate a server-assigned expense id (UUID) before using it in a path. */
function assertExpenseId(expenseId) {
  if (typeof expenseId !== "string" || expenseId.length === 0) {
    throw new Error("A server-backed expense id is required");
  }
}

/**
 * List a group's expenses (PublicExpense[] envelope data, newest first).
 * The caller must supply a server-backed group id (UUID).
 */
export function fetchGroupExpenses(groupId) {
  assertGroupId(groupId);
  return apiGet(`/api/v1/groups/${encodeURIComponent(groupId)}/expenses`);
}

/** Fetch one expense (the backend scopes it to the group server-side). */
export function fetchExpenseDetails(groupId, expenseId) {
  assertGroupId(groupId);
  assertExpenseId(expenseId);
  return apiGet(
    `/api/v1/groups/${encodeURIComponent(groupId)}/expenses/${encodeURIComponent(expenseId)}`
  );
}

/**
 * Create an expense. The payload must be fully API-shaped (see
 * expenseMapper.buildExpenseApiPayload): description, category, currencyCode,
 * paidByUserId, amountMinor (string of integer minor units), splitType and
 * the split fields for its type. The server computes creator, id and
 * timestamps and validates/calculate all shares.
 */
export function createExpense(groupId, payload) {
  assertGroupId(groupId);
  if (!payload || typeof payload !== "object") {
    throw new Error("An expense payload is required");
  }
  return apiPost(`/api/v1/groups/${encodeURIComponent(groupId)}/expenses`, payload);
}

/**
 * Update an expense (PATCH). The backend merges partial bodies against the
 * stored expense and re-validates the whole split when split fields are
 * present; a fields-only body preserves participant/item rows.
 */
export function updateExpense(groupId, expenseId, payload) {
  assertGroupId(groupId);
  assertExpenseId(expenseId);
  if (!payload || typeof payload !== "object") {
    throw new Error("An expense payload is required");
  }
  return apiPatch(
    `/api/v1/groups/${encodeURIComponent(groupId)}/expenses/${encodeURIComponent(expenseId)}`,
    payload
  );
}

/** Delete an expense (dependent rows cascade server-side). */
export function deleteExpense(groupId, expenseId) {
  assertGroupId(groupId);
  assertExpenseId(expenseId);
  return apiDelete(
    `/api/v1/groups/${encodeURIComponent(groupId)}/expenses/${encodeURIComponent(expenseId)}`
  );
}
