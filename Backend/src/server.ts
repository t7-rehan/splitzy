import 'dotenv/config';
import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { resolvePort } from './config/port.js';
import { disconnectPrisma } from './services/db.js';

/**
 * Server entry point.
 *
 * Note: importing the db module does NOT connect to PostgreSQL — the Prisma
 * client is lazy. The API starts successfully even before a database exists
 * (Task 1 requirement); Task 2 will introduce schema/migration handling.
 */
const env = loadEnv();
const app = createApp();

// Port authority: the project's own Backend/.env PORT wins over an ambient
// process-scope PORT (e.g. PORT=0 inherited from a parent shell), which
// otherwise silently sends the API to a random ephemeral port while the
// frontend calls its fixed VITE_API_BASE_URL. See src/config/port.ts.
const port = resolvePort();

const server = app.listen(port, () => {
  const address = server.address();
  const boundPort =
    typeof address === 'object' && address !== null ? address.port : port;
  console.log(
    `[splitzy-api] ${env.nodeEnv} server listening on http://localhost:${boundPort}`,
  );
});

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`[splitzy-api] Port ${port} is already in use.`);
  } else {
    console.error('[splitzy-api] Server failed to start:', error);
  }
  process.exit(1);
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`[splitzy-api] ${signal} received — shutting down...`);
  server.close(() => {
    console.log('[splitzy-api] HTTP server closed.');
  });
  server.closeAllConnections();

  try {
    await disconnectPrisma();
  } catch (error) {
    console.error('[splitzy-api] Error while closing Prisma client:', error);
  }
  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});
process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
