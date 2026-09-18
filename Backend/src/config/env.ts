/**
 * Environment configuration.
 *
 * Loads and validates process.env exactly once at startup. Only variables the
 * server genuinely needs to boot are required; DATABASE_URL is captured for
 * Task 2 but is NOT required to start — the API foundation must boot without
 * a provisioned PostgreSQL instance.
 */

const rawEnv = process.env;

function parsePort(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  // 0 is valid: it asks the OS to assign a free ephemeral port.
  if (
    !Number.isInteger(parsed) ||
    parsed < 0 ||
    parsed > 65_535
  ) {
    throw new Error(
      `Invalid PORT "${value}" — expected an integer between 0 and 65535.`,
    );
  }
  return parsed;
}

function parseOrigins(value: string | undefined): string[] {
  if (value === undefined || value.trim() === '') {
    return ['http://localhost:5173'];
  }
  const origins = value
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter((origin) => origin.length > 0);
  if (origins.length === 0) {
    throw new Error('Invalid CORS_ORIGIN — expected at least one origin.');
  }
  for (const origin of origins) {
    if (origin === '*') {
      throw new Error(
        'CORS_ORIGIN="*" is not allowed. List explicit origins instead, ' +
          'e.g. CORS_ORIGIN=http://localhost:5173',
      );
    }
  }
  return origins;
}

function parseEnvName(
  value: string | undefined,
): 'development' | 'test' | 'production' {
  const name = value?.trim() ?? 'development';
  if (name !== 'development' && name !== 'test' && name !== 'production') {
    throw new Error(
      `Invalid NODE_ENV "${name}" — expected development, test or production.`,
    );
  }
  return name;
}

export interface Env {
  port: number;
  nodeEnv: 'development' | 'test' | 'production';
  isProduction: boolean;
  corsOrigins: string[];
  databaseUrl: string;
  /** Firebase project id — consumed by token verification (Task 4). Not
   *  required to boot; verification only becomes possible once it is set
   *  together with deployment credentials. */
  firebaseProjectId: string;
}

let cachedEnv: Env | null = null;

/**
 * Parse and cache the environment. Throws a descriptive error when a value
 * needed for startup is missing or malformed.
 */
export function loadEnv(): Env {
  if (cachedEnv) return cachedEnv;

  const nodeEnv = parseEnvName(rawEnv.NODE_ENV);

  cachedEnv = {
    port: parsePort(rawEnv.PORT, 5000),
    nodeEnv,
    isProduction: nodeEnv === 'production',
    corsOrigins: parseOrigins(rawEnv.CORS_ORIGIN),
    databaseUrl: rawEnv.DATABASE_URL?.trim() ?? '',
    firebaseProjectId: rawEnv.FIREBASE_PROJECT_ID?.trim() ?? '',
  };

  return cachedEnv;
}

/** Test hook: drop the cached env so the next loadEnv() re-reads process.env. */
export function resetEnvCacheForTests(): void {
  cachedEnv = null;
}
