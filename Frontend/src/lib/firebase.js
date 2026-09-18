/**
 * Splitzy's single shared Firebase initialization.
 *
 * This is the ONLY module in the app allowed to call initializeApp()/getAuth().
 * Everything else goes through `src/services/authService.js`, so Firebase stays
 * swappable (and eventually packageable for Android) behind one service layer.
 *
 * Configuration comes exclusively from Vite environment variables (see
 * `Frontend/.env.local`). The Firebase Web App config is public, client-side
 * configuration by design — it is not a secret — but it is still read from the
 * environment so dev and production projects stay cleanly separated.
 */

let firebaseApp = null;
let firebaseAuth = null;
let initError = null;

export const FIREBASE_ENV_KEYS = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_APP_ID",
];

// Vite statically replaces import.meta.env at build time; plain Node (tests)
// has none, so fall back to an empty object instead of crashing.
const viteEnv = import.meta.env || {};

export function isFirebaseConfigured() {
  return FIREBASE_ENV_KEYS.every((key) => Boolean(viteEnv[key]));
}

function describeMissingConfig() {
  const missing = FIREBASE_ENV_KEYS.filter((key) => !import.meta.env[key]);
  return missing.length > 0
    ? `Missing Firebase configuration: ${missing.join(", ")}. Copy .env.local values into Frontend/.env.local.`
    : "Firebase configuration is present but could not be initialized.";
}

/**
 * Returns the shared Auth instance, initializing the Firebase app on first use.
 * Throws a single, user-safe Error if the environment is misconfigured — never
 * at import time, so the rest of the app can load without Firebase.
 */
export async function getFirebaseAuth() {
  if (firebaseAuth) return firebaseAuth;
  if (initError) throw initError;

  if (!isFirebaseConfigured()) {
    initError = new Error(describeMissingConfig());
    initError.code = "auth/missing-config";
    throw initError;
  }

  try {
    // Imported dynamically so the bundle only pays for Firebase once needed.
    const { initializeApp, getApps, getApp } = await import("firebase/app");
    const { getAuth } = await import("firebase/auth");

    firebaseApp = getApps().length ? getApp() : initializeApp({
      apiKey: viteEnv.VITE_FIREBASE_API_KEY,
      authDomain: viteEnv.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: viteEnv.VITE_FIREBASE_PROJECT_ID,
      storageBucket: viteEnv.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: viteEnv.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: viteEnv.VITE_FIREBASE_APP_ID,
      measurementId: viteEnv.VITE_FIREBASE_MEASUREMENT_ID,
    });

    firebaseAuth = getAuth(firebaseApp);
    return firebaseAuth;
  } catch (err) {
    initError = new Error("Firebase failed to initialize. Check Frontend/.env.local configuration.");
    initError.code = "auth/missing-config";
    initError.cause = err;
    throw initError;
  }
}
