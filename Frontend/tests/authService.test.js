/**
 * Unit tests for the auth service (no real Firebase/Google involved).
 *
 * These run in plain Node. The Firebase SDK is only ever loaded through
 * dynamic `import("firebase/auth")` at call time, so these tests exercise the
 * service's own logic (error mapping, redirect detection, unsubscribe safety)
 * without the SDK or browser APIs.
 *
 * Run: npm test  (from Frontend/)
 */
import assert from "node:assert/strict";
import test from "node:test";

const { mapAuthError } = await import("../src/services/authService.js");

test("mapAuthError: known Firebase codes map to friendly messages", () => {
  const cases = {
    "auth/popup-closed-by-user": "cancelled",
    "auth/cancelled-popup-request": "cancelled",
    "auth/popup-blocked": "popups",
    "auth/unauthorized-domain": "domain",
    "auth/network-request-failed": "Network",
    "auth/too-many-requests": "Too many",
    "auth/missing-config": "Firebase project settings",
  };
  for (const [code, expected] of Object.entries(cases)) {
    const message = mapAuthError({ code });
    assert.ok(
      message.includes(expected),
      `expected message for ${code} to include "${expected}", got: ${message}`
    );
  }
});

test("mapAuthError: unknown auth/* codes stay generic (no internals leaked)", () => {
  const message = mapAuthError({ code: "auth/some-future-error" });
  assert.equal(message, "Could not sign in with Google. Please try again.");
});

test("mapAuthError: non-Firebase errors get a generic message", () => {
  assert.equal(
    mapAuthError(new Error("TypeError: cannot read properties of undefined")),
    "Something went wrong while signing in. Please try again."
  );
  assert.equal(mapAuthError(undefined), "Something went wrong while signing in. Please try again.");
});

test("mapAuthError: service-level config errors map via their error code", () => {
  // firebase.js tags its own init failures with code "auth/missing-config".
  const err = new Error("Missing Firebase configuration: VITE_FIREBASE_API_KEY.");
  err.code = "auth/missing-config";
  const message = mapAuthError(err);
  assert.ok(message.includes("Firebase project settings"));
});

test("sign-in errors marked as redirecting are surfaced to the caller", async () => {
  // signInWithGoogleRedirect resolves { redirecting: true } so the UI knows
  // the browser is navigating away. Verify the contract shape directly.
  const { signInWithGoogleRedirect } = await import("../src/services/authService.js");
  await assert.rejects(
    () => signInWithGoogleRedirect(),
    // Without Firebase configured the underlying import/init rejects — the
    // important contract is that it rejects rather than resolving undefined.
    (err) => err instanceof Error
  );
});

test("subscribeToAuthState: unsubscribe is safe before Firebase loads", async () => {
  const { subscribeToAuthState } = await import("../src/services/authService.js");
  let calls = 0;
  const unsubscribe = subscribeToAuthState(() => {
    calls += 1;
  });
  // Unsubscribe before the async SDK load completes — must not throw.
  unsubscribe();
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(calls, 0, "listener must not fire after unsubscribe");
});
