/**
 * Splitzy authentication service — the single seam between the app and Firebase
 * Authentication. Components call these functions only; no Firebase SDK details
 * leak into the UI layer.
 *
 * Two identities coexist by design (backend integration — Task 8):
 *   1. Firebase identity  — real Google account, authoritative for sign-in and
 *      the ONLY credential source for API calls (ID token -> Bearer header).
 *   2. Splitzy app data   — existing localStorage profile data, untouched.
 *
 * All Firebase imports are dynamic so the SDK loads only when auth is used.
 */
import { setApiTokenProvider } from "./apiClient.js";

let googleProvider = null;

async function getFirebaseAuth() {
  return (await import("../lib/firebase")).getFirebaseAuth();
}

async function getGoogleProvider() {
  if (googleProvider) return googleProvider;
  const { GoogleAuthProvider } = await import("firebase/auth");
  googleProvider = new GoogleAuthProvider();
  googleProvider.setCustomParameters({ prompt: "select_account" });
  return googleProvider;
}

/** Maps Firebase error codes to short, user-friendly messages. */
export function mapAuthError(error) {
  const code = error?.code || "";
  const messages = {
    "auth/popup-closed-by-user": "Sign-in was cancelled.",
    "auth/cancelled-popup-request": "Sign-in was cancelled.",
    "auth/popup-blocked": "Your browser blocked the Google sign-in window. Allow popups and try again.",
    "auth/operation-not-allowed": "Google sign-in is not enabled for this project yet.",
    "auth/unauthorized-domain": "This domain isn't authorized for sign-in. Add it in Firebase Authentication settings.",
    "auth/network-request-failed": "Network problem. Check your connection and try again.",
    "auth/too-many-requests": "Too many attempts. Please wait a moment and try again.",
    "auth/internal-error": "Google sign-in hit an unexpected error. Please try again.",
    "auth/missing-config": "Google sign-in isn't configured yet. Add your Firebase project settings to Frontend/.env.local (the placeholder list is in that file).",
  };
  if (messages[code]) return messages[code];
  if (code.startsWith("auth/")) return "Could not sign in with Google. Please try again.";
  // Non-Firebase errors (or unknown codes) never leak their internals to the UI.
  return "Something went wrong while signing in. Please try again.";
}

/** { uid, email, displayName, photoURL } | null */
function toAppUser(user) {
  if (!user) return null;
  return {
    uid: user.uid,
    email: user.email || "",
    displayName: user.displayName || (user.email ? user.email.split("@")[0] : "You"),
    photoURL: user.photoURL || "",
  };
}

/**
 * Opens the Google sign-in popup and resolves with the app user.
 * Environments without popup support (embedded webviews, future Android
 * WebView packaging) automatically fall back to a full-page redirect.
 */
export async function signInWithGoogle() {
  const { signInWithPopup } = await import("firebase/auth");
  const auth = await getFirebaseAuth();
  const provider = await getGoogleProvider();
  try {
    const credential = await signInWithPopup(auth, provider);
    return toAppUser(credential.user);
  } catch (error) {
    if (
      error?.code === "auth/popup-blocked" ||
      error?.code === "auth/operation-not-supported-in-this-environment"
    ) {
      return signInWithGoogleRedirect();
    }
    throw error;
  }
}

/** Redirect-based Google sign-in fallback. Resolves with { redirecting: true }. */
export async function signInWithGoogleRedirect() {
  const { signInWithRedirect } = await import("firebase/auth");
  const auth = await getFirebaseAuth();
  const provider = await getGoogleProvider();
  await signInWithRedirect(auth, provider);
  return { redirecting: true };
}

/**
 * Signs the Firebase user out. Splitzy app data (localStorage profile/groups)
 * is deliberately untouched — Firebase identity and local app data are separate.
 */
export async function signOut() {
  try {
    const { signOut: firebaseSignOut } = await import("firebase/auth");
    const auth = await getFirebaseAuth();
    await firebaseSignOut(auth);
  } catch {
    // Never block the local logout flow on a network failure.
  }
}

/** { uid, email, displayName, photoURL } | null — resolved immediately. */
export async function getCurrentUser() {
  const auth = await getFirebaseAuth();
  return toAppUser(auth.currentUser);
}

/**
 * Firebase ID token for the signed-in user (Task 8). This token — never the
 * Firebase UID, never a PostgreSQL user id — is the credential the API client
 * sends as `Authorization: Bearer ...`. `forceRefresh` asks the Firebase SDK
 * for a freshly minted token (used for the client's single 401 retry).
 * Returns null when nobody is signed in; throws only if Firebase is broken.
 */
export async function getCurrentIdToken({ forceRefresh = false } = {}) {
  const auth = await getFirebaseAuth();
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken(forceRefresh);
}

// Bridge: the API client pulls its bearer tokens through this service, so it
// never touches the Firebase SDK and no second Firebase initialization exists.
setApiTokenProvider(({ forceRefresh }) =>
  getCurrentIdToken({ forceRefresh })
);

/**
 * Subscribes to Firebase auth changes. Fires once with the current state
 * (possibly null), then on every sign-in/sign-out. Returns an unsubscribe
 * function; safe against the async SDK-load race (late unsubscribe still works).
 */
export function subscribeToAuthState(callback) {
  let unsubscribe = null;
  let disposed = false;

  (async () => {
    try {
      const { onAuthStateChanged } = await import("firebase/auth");
      const auth = await getFirebaseAuth();
      if (disposed) return;
      unsubscribe = onAuthStateChanged(auth, callback);
      if (disposed && unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    } catch (error) {
      if (!disposed) callback(null, error);
    }
  })();

  return () => {
    disposed = true;
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  };
}
