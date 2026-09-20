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

import { apiGet, apiPatch } from "./apiClient.js";

/** Safe public projection returned by GET /auth/me (Task 4 contract). */
export function mapUserFromApi(payload) {
  if (!payload || typeof payload !== "object") return null;
  return {
    id: payload.id,
    email: payload.email,
    displayName: payload.displayName,
    username: payload.username ?? null,
    photoUrl: payload.photoUrl ?? null,
    birthdate: payload.birthdate ?? null,
    profileCompleted: Boolean(payload.profileCompleted),
    upiId: payload.upiId ?? null,
    upiQrDataUrl: payload.upiQrDataUrl ?? null,
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

export async function saveBackendProfile(profilePatch = {}) {
  const payload = {};
  if (profilePatch.name !== undefined) payload.name = profilePatch.name;
  if (profilePatch.username !== undefined) payload.username = profilePatch.username;
  if (profilePatch.birthdate !== undefined) payload.birthdate = profilePatch.birthdate;
  if (profilePatch.avatarId !== undefined) payload.avatarId = profilePatch.avatarId;
  if (profilePatch.homeCurrency !== undefined) payload.currencyCode = profilePatch.homeCurrency;
  if (profilePatch.theme !== undefined) payload.theme = profilePatch.theme;
  if (profilePatch.upiId !== undefined) payload.upiId = profilePatch.upiId;
  if (profilePatch.upiQrDataUrl !== undefined) payload.upiQrDataUrl = profilePatch.upiQrDataUrl;
  if (Object.keys(payload).length === 0) {
    return fetchBackendUser();
  }
  const data = await apiPatch("/api/v1/auth/me", payload);
  return mapUserFromApi(data);
}
