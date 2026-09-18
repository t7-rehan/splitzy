import { Router } from 'express';
import { healthRouter } from './health.routes.js';
import { authRouter } from './auth.routes.js';

/**
 * /api/v1 route registry.
 *
 * Every future feature module (auth, groups, expenses, settlements, ...)
 * gets its own `*.routes.ts` and is mounted here exactly once.
 */
const apiV1Router = Router();

apiV1Router.use('/health', healthRouter);
apiV1Router.use('/auth', authRouter);

export { apiV1Router };
