/**
 * Token verification service — the ONLY module that knows how authentication
 * actually works. Controllers and middleware deal exclusively with the
 * `VerifiedIdentity` contract; Firebase SDK types never escape this file.
 *
 * Two verification paths exist:
 *
 * 1. PRODUCTION — Firebase Admin SDK `verifyIdToken()`. Requires deployment
 *    credentials (FIREBASE_PROJECT_ID plus either GOOGLE_APPLICATION_CREDENTIALS
 *    pointing at a service-account JSON, or Application Default Credentials).
 *    Credentials are NEVER committed; they are provided by the environment at
 *    deploy time.
 *
 * 2. DEVELOPMENT/TEST ONLY — a clearly-named `x-dev-user-id` header that
 *    asserts a Firebase UID without any verification. It exists solely so the
 *    API can be exercised before Firebase is configured (and by automated
 *    tests). It is structurally impossible in production: see isDevAuthAllowed().
 *
 * This dev path does not pretend to be Firebase verification — the method
 * field on the resulting identity says `dev-header`, not `firebase`.
 */
import type { VerifiedIdentity } from '../types/auth.js';

/** Claims we read from a verified Firebase ID token. */
interface FirebaseTokenClaims {
  uid: string;
  email?: string;
  name?: string;
  picture?: string;
}

interface FirebaseAdminAuthLike {
  verifyIdToken(idToken: string): Promise<FirebaseTokenClaims>;
}

type VerifyIdTokenFn = (idToken: string) => Promise<VerifiedIdentity>;

const globalForAuth = globalThis as unknown as {
  splitzyVerifyIdToken?: VerifyIdTokenFn | undefined;
  splitzyFirebaseAdminAuth?: FirebaseAdminAuthLike | undefined;
};

/**
 * Dev authentication is allowed ONLY outside production. The check reads the
 * environment at call time so tests can flip NODE_ENV without a restart.
 */
export function isDevAuthAllowed(): boolean {
  return process.env.NODE_ENV !== 'production';
}

/**
 * Firebase Admin verification. The SDK is imported lazily so the process only
 * pays for it when a real token actually needs verifying, and initialization
 * happens at most once per process.
 *
 * Requires at deploy time:
 *   FIREBASE_PROJECT_ID                 — the Firebase project identifier
 *   GOOGLE_APPLICATION_CREDENTIALS      — path to the service-account JSON, OR
 *                                         Application Default Credentials
 *                                         (e.g. GOOGLE_CLOUD_PROJECT metadata)
 * No credential values belong in this repository.
 */
async function getFirebaseAdminAuth(): Promise<FirebaseAdminAuthLike> {
  if (globalForAuth.splitzyFirebaseAdminAuth) {
    return globalForAuth.splitzyFirebaseAdminAuth;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  if (!projectId) {
    throw new Error(
      'FIREBASE_PROJECT_ID is not configured — Firebase ID token verification is unavailable. ' +
        'Set it (with credentials) in the deployment environment; see Backend/.env.example.',
    );
  }

  const { initializeApp, getApps, getApp, cert } = await import(
    'firebase-admin/app'
  );
  const { getAuth } = await import('firebase-admin/auth');

  // Support an explicit service-account JSON path when provided; otherwise
  // fall back to Application Default Credentials.
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  const app = getApps().length
    ? getApp()
    : initializeApp(
        credentialsPath
          ? { credential: cert(credentialsPath), projectId }
          : { projectId },
      );

  const auth = getAuth(app);
  globalForAuth.splitzyFirebaseAdminAuth = auth;
  return auth;
}

/**
 * Production path: verify a Firebase ID token with the Admin SDK and extract
 * the identity claims Splitzy uses. Throws on any invalid/expired token.
 */
async function verifyWithFirebase(idToken: string): Promise<VerifiedIdentity> {
  const auth = await getFirebaseAdminAuth();
  const decoded = await auth.verifyIdToken(idToken);
  return {
    firebaseUid: decoded.uid,
    email: decoded.email ?? undefined,
    displayName: decoded.name ?? undefined,
    photoUrl: decoded.picture ?? undefined,
    method: 'firebase',
  };
}

/**
 * Test hook: replace the verification function (e.g. with a stub that accepts
 * any token) so automated tests never need a real Firebase project.
 */
export function setTokenVerifierForTests(verifyFn: VerifyIdTokenFn): void {
  globalForAuth.splitzyVerifyIdToken = verifyFn;
}

export function resetTokenVerifierForTests(): void {
  globalForAuth.splitzyVerifyIdToken = undefined;
  globalForAuth.splitzyFirebaseAdminAuth = undefined;
}

/**
 * Verify a Bearer token and return the identity it proves.
 *
 * Throws an Error whose message is safe for the middleware to map to 401 —
 * verification failures are authentication failures, never crashes.
 */
export async function verifyIdToken(idToken: string): Promise<VerifiedIdentity> {
  const override = globalForAuth.splitzyVerifyIdToken;
  if (override) {
    return override(idToken);
  }
  return verifyWithFirebase(idToken);
}
