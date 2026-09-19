/**
 * Unit tests for the Task 8 API client (no real backend, no real Firebase).
 *
 * `fetch` and the token provider are mocked at the module boundary, so these
 * tests exercise the client's own logic: URL building, header injection,
 * envelope unwrapping, error normalization and the single 401 retry.
 *
 * Run: npm test  (from Frontend/)
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";

const {
  apiGet,
  apiPost,
  apiUrl,
  ApiError,
  setApiTokenProvider,
  clearApiTokenProvider,
} = await import("../src/services/apiClient.js");

const fetchMock = mock.fn();
globalThis.fetch = fetchMock;

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

const SECRET = "fake-id-token-abc123";

/** Installs a provider that yields the queued tokens in order. */
function useTokens(...tokens) {
  const queue = [...tokens];
  setApiTokenProvider(() => Promise.resolve(queue.shift() ?? SECRET));
}

beforeEach(() => {
  fetchMock.mock.resetCalls();
});

afterEach(() => {
  clearApiTokenProvider();
});

describe("apiUrl", () => {
  it("builds URLs from the configured base (env-provided, not hardcoded)", () => {
    const url = apiUrl("/api/v1/groups");
    assert.ok(url.startsWith("http"), url);
    assert.ok(url.endsWith("/api/v1/groups"), url);
  });

  it("rejects paths without a leading slash", () => {
    assert.throws(() => apiUrl("api/v1/groups"), /must start with/);
  });
});

describe("authentication", () => {
  it("adds the Authorization header from the Firebase token provider", async () => {
    useTokens(SECRET);
    fetchMock.mock.mockImplementation(() =>
      Promise.resolve(jsonResponse(200, { success: true, data: [] }))
    );
    await apiGet("/api/v1/groups");
    const init = fetchMock.mock.calls[0].arguments[1];
    assert.equal(init.headers.Authorization, `Bearer ${SECRET}`);
  });

  it("never sends a fake token when unauthenticated (no provider)", async () => {
    clearApiTokenProvider();
    fetchMock.mock.mockImplementation(() =>
      Promise.resolve(jsonResponse(200, { success: true, data: [] }))
    );
    await apiGet("/api/v1/groups");
    const init = fetchMock.mock.calls[0].arguments[1];
    assert.equal(init.headers.Authorization, undefined);
  });

  it("calls the provider once for a normal successful request", async () => {
    let calls = 0;
    setApiTokenProvider(() => {
      calls += 1;
      return Promise.resolve(SECRET);
    });
    fetchMock.mock.mockImplementation(() =>
      Promise.resolve(jsonResponse(200, { success: true, data: 1 }))
    );
    await apiGet("/api/v1/groups");
    assert.equal(calls, 1);
  });
});

describe("response handling", () => {
  it("unwraps the { success, data } envelope", async () => {
    useTokens(SECRET);
    const payload = { id: "u1", displayName: "Test" };
    fetchMock.mock.mockImplementation(() =>
      Promise.resolve(jsonResponse(200, { success: true, data: payload }))
    );
    assert.deepEqual(await apiGet("/api/v1/auth/me"), payload);
  });

  it("normalizes backend error envelopes into ApiError (status/code/message)", async () => {
    useTokens(SECRET);
    fetchMock.mock.mockImplementation(() =>
      Promise.resolve(
        jsonResponse(409, {
          success: false,
          error: { code: "CONFLICT", message: "User is already a member of this group" },
        })
      )
    );
    const error = await apiPost("/api/v1/groups/g1/members", { userId: "u2" }).then(
      () => null,
      (e) => e
    );
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 409);
    assert.equal(error.code, "CONFLICT");
    assert.equal(error.message, "User is already a member of this group");
  });

  it("normalizes non-JSON failures with a user-safe message", async () => {
    useTokens(SECRET);
    fetchMock.mock.mockImplementation(() =>
      Promise.resolve({ ok: false, status: 500, text: async () => "<html>oops</html>" })
    );
    const error = await apiGet("/api/v1/groups").then(() => null, (e) => e);
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 500);
    assert.equal(error.code, "INVALID_RESPONSE");
    assert.match(error.userMessage, /couldn't read/);
  });

  it("normalizes network failures without exposing internals", async () => {
    useTokens(SECRET);
    fetchMock.mock.mockImplementation(() => Promise.reject(new Error("ECONNREFUSED 127.0.0.1:5432")));
    const error = await apiGet("/api/v1/groups").then(() => null, (e) => e);
    assert.equal(error.code, "NETWORK_ERROR");
    assert.ok(!error.userMessage.includes("ECONNREFUSED"));
    assert.ok(!error.userMessage.includes("5432"));
  });
});

describe("401 retry (single, force-refreshed)", () => {
  it("retries exactly once with a fresh token and succeeds", async () => {
    useTokens("stale-token");
    fetchMock.mock.mockImplementation((url, init) =>
      Promise.resolve(
        init.headers.Authorization === "Bearer fresh-token"
          ? jsonResponse(200, { success: true, data: { ok: true } })
          : jsonResponse(401, {
              success: false,
              error: { code: "UNAUTHORIZED", message: "Invalid or expired authentication token" },
            })
      )
    );
    // First call yields the stale token; the retry must get a fresh one.
    setApiTokenProvider(({ forceRefresh }) =>
      Promise.resolve(forceRefresh ? "fresh-token" : "stale-token")
    );
    const data = await apiGet("/api/v1/groups");
    assert.deepEqual(data, { ok: true });
    assert.equal(fetchMock.mock.calls.length, 2);
    const secondInit = fetchMock.mock.calls[1].arguments[1];
    assert.equal(secondInit.headers.Authorization, "Bearer fresh-token");
  });

  it("does not loop: a second 401 surfaces as an error", async () => {
    fetchMock.mock.mockImplementation(() =>
      Promise.resolve(
        jsonResponse(401, {
          success: false,
          error: { code: "UNAUTHORIZED", message: "Invalid or expired authentication token" },
        })
      )
    );
    useTokens(SECRET);
    const error = await apiGet("/api/v1/groups").then(() => null, (e) => e);
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 401);
    assert.equal(fetchMock.mock.calls.length, 2, "must stop after one retry");
  });
});

describe("request building", () => {
  it("sends JSON bodies with the right content type", async () => {
    useTokens(SECRET);
    fetchMock.mock.mockImplementation(() =>
      Promise.resolve(jsonResponse(201, { success: true, data: {} }))
    );
    await apiPost("/api/v1/groups", { name: "Trip", currencyCode: "INR" });
    const init = fetchMock.mock.calls[0].arguments[1];
    assert.equal(init.headers["Content-Type"], "application/json");
    assert.equal(init.method, "POST");
    assert.deepEqual(JSON.parse(init.body), { name: "Trip", currencyCode: "INR" });
  });

  it("error messages and details never contain the token", async () => {
    fetchMock.mock.mockImplementation(() =>
      Promise.resolve(
        jsonResponse(403, {
          success: false,
          error: { code: "FORBIDDEN", message: "denied" },
        })
      )
    );
    useTokens(SECRET);
    const error = await apiGet("/api/v1/groups").then(() => null, (e) => e);
    assert.ok(!JSON.stringify({ m: error.message, d: error.details }).includes(SECRET));
  });
});
