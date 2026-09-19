import assert from "node:assert/strict";
import test from "node:test";
import {
  setFirebaseAuthForTests,
  resetFirebaseAuthForTests,
  signUpWithEmail,
  signInWithEmail,
  resetPassword,
  signInWithGoogle,
  signOut,
  subscribeToAuthState,
} from "../src/services/authService.js";

test("signUpWithEmail: calls createUserWithEmailAndPassword and updateProfile, returning normalized user", async () => {
  let createdEmail = null;
  let createdPassword = null;
  let updatedDisplayName = null;

  const mockUser = {
    uid: "test-user-uid-123",
    email: "newuser@example.com",
    displayName: "",
    photoURL: "https://example.com/photo.png",
  };

  const mockAuthModule = {
    async createUserWithEmailAndPassword(auth, email, password) {
      createdEmail = email;
      createdPassword = password;
      return { user: { ...mockUser } };
    },
    async updateProfile(user, { displayName }) {
      updatedDisplayName = displayName;
      user.displayName = displayName;
    },
  };

  setFirebaseAuthForTests({ currentUser: mockUser }, mockAuthModule);

  try {
    const user = await signUpWithEmail("newuser@example.com", "password123", "Test User");
    assert.equal(createdEmail, "newuser@example.com");
    assert.equal(createdPassword, "password123");
    assert.equal(updatedDisplayName, "Test User");
    assert.deepEqual(user, {
      uid: "test-user-uid-123",
      email: "newuser@example.com",
      displayName: "Test User",
      photoURL: "https://example.com/photo.png",
    });
  } finally {
    resetFirebaseAuthForTests();
  }
});

test("signInWithEmail: calls signInWithEmailAndPassword, returning normalized user", async () => {
  let signedInEmail = null;
  let signedInPassword = null;

  const mockUser = {
    uid: "existing-user-456",
    email: "member@example.com",
    displayName: "Existing Member",
    photoURL: "",
  };

  const mockAuthModule = {
    async signInWithEmailAndPassword(auth, email, password) {
      signedInEmail = email;
      signedInPassword = password;
      return { user: mockUser };
    },
  };

  setFirebaseAuthForTests({ currentUser: mockUser }, mockAuthModule);

  try {
    const user = await signInWithEmail("member@example.com", "mysecretpw");
    assert.equal(signedInEmail, "member@example.com");
    assert.equal(signedInPassword, "mysecretpw");
    assert.deepEqual(user, {
      uid: "existing-user-456",
      email: "member@example.com",
      displayName: "Existing Member",
      photoURL: "",
    });
  } finally {
    resetFirebaseAuthForTests();
  }
});

test("resetPassword: calls sendPasswordResetEmail, returning { success: true }", async () => {
  let resetTargetEmail = null;

  const mockAuthModule = {
    async sendPasswordResetEmail(auth, email) {
      resetTargetEmail = email;
    },
  };

  setFirebaseAuthForTests({}, mockAuthModule);

  try {
    const res = await resetPassword("reset@example.com");
    assert.equal(resetTargetEmail, "reset@example.com");
    assert.deepEqual(res, { success: true });
  } finally {
    resetFirebaseAuthForTests();
  }
});

test("signInWithGoogle: calls signInWithPopup, returning normalized user", async () => {
  let popupCalled = false;

  const mockUser = {
    uid: "google-user-789",
    email: "googleuser@gmail.com",
    displayName: "Google User",
    photoURL: "https://lh3.googleusercontent.com/photo.jpg",
  };

  class MockGoogleAuthProvider {
    setCustomParameters(params) {
      this.params = params;
    }
  }

  const mockAuthModule = {
    GoogleAuthProvider: MockGoogleAuthProvider,
    async signInWithPopup(auth, provider) {
      popupCalled = true;
      assert.ok(provider instanceof MockGoogleAuthProvider);
      return { user: mockUser };
    },
  };

  setFirebaseAuthForTests({}, mockAuthModule);

  try {
    const user = await signInWithGoogle();
    assert.equal(popupCalled, true);
    assert.deepEqual(user, {
      uid: "google-user-789",
      email: "googleuser@gmail.com",
      displayName: "Google User",
      photoURL: "https://lh3.googleusercontent.com/photo.jpg",
    });
  } finally {
    resetFirebaseAuthForTests();
  }
});

test("signOut: calls firebase signOut", async () => {
  let signOutCalled = false;

  const mockAuthModule = {
    async signOut(auth) {
      signOutCalled = true;
    },
  };

  setFirebaseAuthForTests({}, mockAuthModule);

  try {
    await signOut();
    assert.equal(signOutCalled, true);
  } finally {
    resetFirebaseAuthForTests();
  }
});

test("subscribeToAuthState: calls onAuthStateChanged and returns functioning unsubscribe", async () => {
  let callbackRegistered = null;
  let unsubscribed = false;

  const mockAuthModule = {
    onAuthStateChanged(auth, cb) {
      callbackRegistered = cb;
      return () => {
        unsubscribed = true;
      };
    },
  };

  setFirebaseAuthForTests({}, mockAuthModule);

  try {
    let receivedUser = null;
    const unsub = subscribeToAuthState((user) => {
      receivedUser = user;
    });

    // Wait for the async wrapper to invoke onAuthStateChanged
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.ok(typeof callbackRegistered === "function");

    // Simulate auth state change
    callbackRegistered({ uid: "sub-user", email: "sub@example.com" });
    assert.equal(receivedUser.uid, "sub-user");

    unsub();
    assert.equal(unsubscribed, true);
  } finally {
    resetFirebaseAuthForTests();
  }
});
