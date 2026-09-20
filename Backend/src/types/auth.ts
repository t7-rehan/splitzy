/**
 * Authentication contracts (Task 4).
 *
 * The rest of the application sees ONLY `VerifiedIdentity` — a plain object
 * produced by the auth service after successful token verification. Nothing
 * about Firebase (SDK types, decoded-token internals, credentials) leaks
 * beyond `src/services/authService.ts`, and controllers never touch raw tokens.
 */

/** Which path produced the verified identity. `dev-header` never exists in production. */
export type AuthMethod = 'firebase' | 'dev-header';

/** Identity extracted from a verified Firebase ID token (or the dev path). */
export interface VerifiedIdentity {
  /** Firebase Authentication UID — the stable external identity key. */
  firebaseUid: string;
  /** Email claim from the verified token (may be absent for some providers). */
  email?: string | undefined;
  /** Display name claim from the verified token. */
  displayName?: string | undefined;
  /** Photo URL claim from the verified token. */
  photoUrl?: string | undefined;
  /** How this identity was verified. Diagnostics only — not client data. */
  method: AuthMethod;
}

/** The PostgreSQL User as exposed to authenticated clients. Never includes credentials. */
export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  username: string | null;
  photoUrl: string | null;
  birthdate: string | null;
  profileCompleted: boolean;
  upiId: string | null;
  upiQrDataUrl: string | null;
}

/**
 * Express request augmentation. `req.auth` is set ONLY by the auth middleware
 * after successful verification; handlers can treat it as present.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: VerifiedIdentity;
    }
  }
}
