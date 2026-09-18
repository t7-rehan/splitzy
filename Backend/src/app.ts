import express, { type Express } from 'express';
import cors from 'cors';
import { loadEnv } from './config/env.js';
import { requestLogger } from './middleware/requestLogger.js';
import { notFoundHandler } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';
import { apiV1Router } from './routes/index.js';

/**
 * Express application factory.
 *
 * Kept separate from server.ts so tests (and future integration tooling) can
 * build the app without binding a port.
 */
export function createApp(): Express {
  const env = loadEnv();
  const app = express();

  app.disable('x-powered-by');

  app.use(requestLogger);

  // CORS: only explicitly configured origins are allowed. The allow-list is
  // env-driven (CORS_ORIGIN, comma-separated) so more origins can be added
  // later without code changes. Requests without an Origin header (curl,
  // server-to-server) are never blocked by CORS itself.
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || env.corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(null, false); // omit CORS headers; browser will block
      },
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      credentials: true,
    }),
  );

  app.use(express.json({ limit: '1mb' }));

  app.use('/api/v1', apiV1Router);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
