import { PrismaClient } from '@prisma/client';
import type { PrismaClient as PrismaClientType } from '@prisma/client';

/**
 * Shared Prisma client singleton.
 *
 * The rest of the application imports `getPrismaClient()` (or the `prisma`
 * alias) rather than constructing its own client, so exactly one connection
 * pool exists per process. Instantiation is lazy: merely importing this module
 * does not connect to PostgreSQL, so the API foundation can boot (and serve
 * /api/v1/health) before a database is provisioned in Task 2.
 */

const globalForPrisma = globalThis as unknown as {
  // Explicit `| undefined` is required under exactOptionalPropertyTypes.
  splitzyPrisma?: PrismaClientType | undefined;
};

function createClient(): PrismaClientType {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

export function getPrismaClient(): PrismaClientType {
  if (!globalForPrisma.splitzyPrisma) {
    globalForPrisma.splitzyPrisma = createClient();
  }
  return globalForPrisma.splitzyPrisma;
}

/** Convenience alias used by future services/controllers. */
export const prisma: PrismaClientType = new Proxy({} as PrismaClientType, {
  get(_target, prop, receiver) {
    return Reflect.get(getPrismaClient(), prop, receiver);
  },
});

/** Graceful-shutdown helper: close the connection pool. */
export async function disconnectPrisma(): Promise<void> {
  await globalForPrisma.splitzyPrisma?.$disconnect();
  globalForPrisma.splitzyPrisma = undefined;
}
