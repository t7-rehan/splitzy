/**
 * Port authority (connection-failure fix).
 *
 * ROOT CAUSE this module closes: on this machine, app-spawned shells run with
 * an ambient process-scope `PORT=0` environment variable. `dotenv` NEVER
 * overrides variables that already exist in the environment, so
 * `process.env.PORT` was "0", the backend asked the OS for an ephemeral port,
 * and the frontend — configured for `VITE_API_BASE_URL=http://localhost:5000`
 * — got connection refused. Every API call then failed as a network error
 * ("Couldn't reach the server", create-group failure).
 *
 * The backend's own `Backend/.env` is the project's source of truth for its
 * port. An inherited ambient `PORT` is a generic shell convention (usually
 * belonging to some OTHER process) and must not silently claim Splitzy's API
 * port.
 *
 * Resolution order (highest wins):
 *   1. explicit `--port N` / `--port=N` CLI argument (one-off runs, tests)
 *   2. PORT from the git-ignored Backend/.env (dotenv-injected)
 *   3. ambient process.env.PORT
 *   4. default 5000 (matches the frontend's default VITE_API_BASE_URL)
 *
 * Invalid values fail fast with a descriptive error instead of silently
 * binding somewhere unexpected. PORT=0 remains valid — it explicitly asks
 * the OS for a free port (used by some tests).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The exact PORT value dotenv would inject from Backend/.env ("" if absent).
 * Read directly so resolution does not depend on when `dotenv/config` ran:
 * dotenv never overrides an existing process.env value, so after
 * `import 'dotenv/config'` the ambient value would mask the file's value.
 */
export function envFilePortValue(
  envFilePath: string | undefined = join(process.cwd(), ".env"),
): string | undefined {
  try {
    const text = readFileSync(envFilePath, "utf8");
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (line.length === 0 || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      if (line.slice(0, eq).trim() !== "PORT") continue;
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
        (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
      ) {
        value = value.slice(1, -1);
      }
      return value.trim().length > 0 ? value : undefined;
    }
    return undefined;
  } catch {
    return undefined; // no .env file — fall through to ambient/default
  }
}

/** Parse a port value; returns null for absent/blank, throws on garbage. */
export function parsePortValue(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null;
  const trimmed = value.trim();
  // Strict integer syntax — "12.5" or "0x10" must fail, not silently truncate.
  if (!/^-?\d+$/.test(trimmed)) {
    throw new Error(
      `Invalid PORT "${value}" — expected an integer between 0 and 65535.`,
    );
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (parsed < 0 || parsed > 65_535) {
    throw new Error(
      `Invalid PORT "${value}" — expected an integer between 0 and 65535.`,
    );
  }
  return parsed;
}

/**
 * Resolve the port the API must bind.
 * See the module doc for the precedence rules.
 */
export function resolvePort(
  argv: string[] = process.argv,
  env: NodeJS.ProcessEnv = process.env,
): number {
  // 1. --port N (or --port=N) from the command line wins outright.
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;
    if (arg === "--port") {
      const next = argv[i + 1];
      if (next !== undefined) {
        const fromFlag = parsePortValue(next);
        if (fromFlag !== null) return fromFlag;
      }
    }
    if (arg.startsWith("--port=")) {
      const fromFlag = parsePortValue(arg.slice("--port=".length));
      if (fromFlag !== null) return fromFlag;
    }
  }

  // 2. The project's own .env beats an ambient PORT. (SPLITZY_ENV_FILE
  //    optionally relocates the file — used by tests and unusual deployments.)
  const fromEnvFile = parsePortValue(envFilePortValue(env.SPLITZY_ENV_FILE));
  if (fromEnvFile !== null) return fromEnvFile;

  // 3. Ambient PORT (kept for deployments that configure it deliberately).
  const ambient = parsePortValue(env.PORT);
  if (ambient !== null) return ambient;

  // 4. Default matches the frontend's default VITE_API_BASE_URL.
  return 5000;
}
