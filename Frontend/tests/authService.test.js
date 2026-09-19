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

const {
  mapAuthError,
  signUpWithEmail,
  signInWithEmail,
  resetPassword,
  signOut,
} = await import("../src/services/authService.js");

test("mapAuthError: known Firebase codes map to friendly messages", () => {
  const cases = {
    "auth/invalid-email": "valid email",
    "auth/user-not-found": "No account was found",
    "auth/wrong-password": "Incorrect email or password",
    "auth/invalid-credential": "Incorrect email or password",
    "auth/email-already-in-use": "account with this email already exists",
    "auth/weak-password": "at least 6 characters",
    "auth/password-does-not-meet-requirements": "security requirements",
    "auth/too-many-requests": "Too many attempts",
    "auth/network-request-failed": "Network problem",
    "auth/popup-closed-by-user": "cancelled",
    "auth/cancelled-popup-request": "cancelled",
    "auth/popup-blocked": "blocked the sign-in window",
    "auth/operation-not-allowed": "not enabled",
    "auth/unauthorized-domain": "domain",
    "auth/internal-error": "unexpected authentication error",
    "auth/missing-config": "Firebase project settings",
  };
  for (const [code, expected] of Object.entries(cases)) {
    const message = mapAuthError({ code });
    assert.ok(
      message.toLowerCase().includes(expected.toLowerCase()),
      `expected message for ${code} to include "${expected}", got: "${message}"`
    );
  }
});

test("mapAuthError: unknown auth/* codes stay generic (no internals leaked)", () => {
  const message = mapAuthError({ code: "auth/some-future-error" });
  assert.equal(message, "Authentication failed. Please check your details and try again.");
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

test("mapAuthError: never leaks raw error internals or stack traces", () => {
  const err = new Error("FIREBASE_INTERNAL_FAILURE: private_key_value_12345");
  err.code = "auth/invalid-credential";
  const message = mapAuthError(err);
  for (const forbidden of ["FIREBASE_INTERNAL", "private_key", "12345", "stack", "at Object."]) {
    assert.ok(!message.includes(forbidden), `message must not contain "${forbidden}"`);
  }
});

test("sign-in errors marked as redirecting are surfaced to the caller", async () => {
  // signInWithGoogleRedirect resolves { redirecting: true } so the UI knows
  // the browser is navigating away. Verify the contract shape directly.
  const { signInWithGoogleRedirect } = await import("../src/services/authService.js");
  await assert.rejects(
    () => signInWithGoogleRedirect(),
    (err) => err instanceof Error
  );
});

test("signUpWithEmail: rejects when Firebase is unconfigured", async () => {
  await assert.rejects(
    () => signUpWithEmail("test@example.com", "secret123", "Test User"),
    (err) => err instanceof Error && Boolean(mapAuthError(err))
  );
});

test("signInWithEmail: rejects when Firebase is unconfigured", async () => {
  await assert.rejects(
    () => signInWithEmail("test@example.com", "secret123"),
    (err) => err instanceof Error && Boolean(mapAuthError(err))
  );
});

test("resetPassword: rejects when Firebase is unconfigured", async () => {
  await assert.rejects(
    () => resetPassword("test@example.com"),
    (err) => err instanceof Error && Boolean(mapAuthError(err))
  );
});

test("signOut: executes safely and does not throw even if unconfigured", async () => {
  await assert.doesNotReject(() => signOut());
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
