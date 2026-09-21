/**
 * Splitzy API client (Task 8) — the single seam between the frontend and the
 * Express/PostgreSQL backend.
 *
 * Responsibilities:
 *   - build request URLs from VITE_API_BASE_URL (never hardcoded per-env URLs)
 *   - attach `Authorization: Bearer <Firebase ID token>` via the token
 *     provider registered by authService (Firebase identity ONLY — the client
 *     never sends PostgreSQL user ids, firebaseUid bodies, or dev headers)
 *   - unwrap the backend's { success, data } / { success, error } envelopes
 *   - normalize every failure into an ApiError with a user-safe message
 *   - on exactly one 401, retry once with a force-refreshed Firebase token
 *
 * Security: tokens are never logged, never stored, and never included in
 * error messages. Errors carry only status/code/message/details.
 */

// Vite statically replaces import.meta.env at build time; plain Node (tests)
// has none, so fall back to an empty object instead of crashing.
const viteEnv = import.meta.env || {};

// Local-development default matches the backend's default PORT (5000).
const DEFAULT_BASE_URL = "http://localhost:5000";
const REQUEST_TIMEOUT_MS = 15000;

export const API_BASE_URL = String(
  viteEnv.VITE_API_BASE_URL || DEFAULT_BASE_URL
).replace(/\/+$/, "");

/** Build a safe request URL. Throws on malformed paths (never silently mis-routes). */
export function apiUrl(path) {
  if (typeof path !== "string" || !path.startsWith("/")) {
    throw new Error("API path must start with '/'");
  }
  return `${API_BASE_URL}${path}`;
}

/** Normalized API failure. `userMessage` is always safe to show in the UI. */
export class ApiError extends Error {
  constructor(message, { status = 0, code = "UNKNOWN", details = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    // UI-facing alias — guaranteed free of tokens/secrets by construction.
    this.userMessage = message;
  }
}

// ---------------------------------------------------------------------------
// Token provider (registered once by authService — the only Firebase-aware
// component of the client; keeps this module free of Firebase imports).
// ---------------------------------------------------------------------------

let tokenProvider = null;
let devUserProvider = null;

/**
 * Register the async token provider. Called with ({ forceRefresh }) and must
 * resolve to a Firebase ID token string or null. Passing null unregisters.
 */
export function setApiTokenProvider(provider) {
  tokenProvider = typeof provider === "function" ? provider : null;
}

export function clearApiTokenProvider() {
  tokenProvider = null;
}

export function setApiDevUserProvider(provider) {
  devUserProvider = typeof provider === "function" ? provider : null;
}

async function getAuthToken(forceRefresh) {
  if (!tokenProvider) return null;
  try {
    const token = await tokenProvider({ forceRefresh });
    return typeof token === "string" && token.length > 0 ? token : null;
  } catch {
    // Provider failures (e.g. Firebase unavailable) mean "unauthenticated",
    // not "crash the request chain" — the server will answer 401 if needed.
    return null;
  }
}

async function getDevUserId() {
  if (!devUserProvider) return null;
  try {
    const userId = await devUserProvider();
    return typeof userId === "string" && userId.length > 0 ? userId : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Error normalization
// ---------------------------------------------------------------------------

function normalizeApiError(status, body) {
  if (
    body &&
    typeof body === "object" &&
    body.success === false &&
    body.error &&
    typeof body.error.message === "string"
  ) {
    return new ApiError(body.error.message, {
      status,
      code: typeof body.error.code === "string" ? body.error.code : "UNKNOWN",
      details: body.error.details ?? null,
    });
  }
  const fallbacks = {
    400: "The request was invalid.",
    401: "Your session has expired. Please sign in again.",
    403: "You don't have permission to do that.",
    404: "That item could not be found.",
    409: "That change conflicts with the current state. Refresh and try again.",
  };
  return new ApiError(fallbacks[status] || `Request failed (HTTP ${status}).`, {
    status,
    code: "HTTP_ERROR",
  });
}

function normalizeNetworkError(error) {
  return new ApiError(
    "Can't reach the Splitzy servers. Check your connection and try again.",
    { status: 0, code: "NETWORK_ERROR", details: undefined }
  );
}

async function parseResponseBody(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError("The server sent a response we couldn't read.", {
      status: response.status,
      code: "INVALID_RESPONSE",
    });
  }
}

// ---------------------------------------------------------------------------
// Core request
// ---------------------------------------------------------------------------

async function execute(method, path, body, auth, forceRefresh) {
  const headers = {};
  let payload;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  let hadToken = false;
  if (auth) {
    const devUserId = viteEnv.DEV ? await getDevUserId() : null;
    if (devUserId) {
      headers["x-dev-user-id"] = devUserId;
    } else {
      const token = await getAuthToken(forceRefresh);
      if (token) {
        headers.Authorization = `Bearer ${token}`;
        hadToken = true;
      }
    }
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(apiUrl(path), {
      method,
      headers,
      signal: controller.signal,
      ...(payload === undefined ? {} : { body: payload }),
    });
    return { response, hadToken };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Perform an API request and resolve with the envelope's `data`.
 * Retries at most once on 401 with a force-refreshed Firebase token.
 */
async function request(method, path, { body, auth = true } = {}) {
  let result;
  try {
    result = await execute(method, path, body, auth, false);
  } catch (error) {
    throw normalizeNetworkError(error);
  }

  let { response, hadToken } = result;

  // One-shot retry with a fresh token: Firebase ID tokens expire (~1h); the
  // SDK may hold an expired cached token when idle. Never loops — if the
  // retry also fails, the error surfaces normally.
  if (auth && hadToken && response.status === 401) {
    try {
      result = await execute(method, path, body, auth, true);
    } catch (error) {
      throw normalizeNetworkError(error);
    }
    ({ response } = result);
  }

  const parsed = await parseResponseBody(response);
  if (!response.ok) {
    throw normalizeApiError(response.status, parsed);
  }
  if (parsed && typeof parsed === "object" && "success" in parsed) {
    if (parsed.success === true) return parsed.data;
    throw normalizeApiError(response.status, parsed);
  }
  return parsed;
}

export function apiGet(path, options = {}) {
  return request("GET", path, options);
}

export function apiPost(path, body, options = {}) {
  return request("POST", path, { body, ...options });
}

export function apiPatch(path, body, options = {}) {
  return request("PATCH", path, { body, ...options });
}

export function apiDelete(path, options = {}) {
  return request("DELETE", path, options);
}
