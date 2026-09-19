/**
 * Backend user bootstrap service (Task 8).
 *
 * Firebase
 *   = authentication identity (who you are — Google account).
 *
 * Splitzy backend User (PostgreSQL)
 *   = application user record (provisioned server-side on first /auth/me call;
 *     the backend is authoritative — the frontend never creates or assigns it).
 *
 * This service resolves (1) into (2) via GET /api/v1/auth/me after Firebase
 * sign-in succeeds. The returned `firebaseUid` inside the payload is the link
 * between the two; it is never used as a credential (the Firebase ID token is).
 */

import { apiGet } from "./apiClient.js";

/** Safe public projection returned by GET /auth/me (Task 4 contract). */
export function mapUserFromApi(payload) {
  if (!payload || typeof payload !== "object") return null;
  return {
    id: payload.id,
    firebaseUid: payload.firebaseUid,
    email: payload.email,
    displayName: payload.displayName,
    photoUrl: payload.photoUrl ?? null,
  };
}

/**
 * Fetch the backend's Splitzy user for the currently authenticated Firebase
 * identity. Throws ApiError on failure (caller decides how to surface it).
 */
export async function fetchBackendUser() {
  const data = await apiGet("/api/v1/auth/me");
  const user = mapUserFromApi(data);
  if (!user || !user.id) {
    throw new Error("Malformed user payload from server");
  }
  return user;
}
