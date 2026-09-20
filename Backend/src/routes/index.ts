import { Router } from 'express';
import { healthRouter } from './health.routes.js';
import { authRouter } from './auth.routes.js';
import { groupsRouter } from './groups.routes.js';
import { usersRouter } from './users.routes.js';

/**
 * /api/v1 route registry.
 *
 * Every future feature module (auth, groups, expenses, settlements, ...)
 * gets its own `*.routes.ts` and is mounted here exactly once.
 */
const apiV1Router = Router();

apiV1Router.use('/health', healthRouter);
apiV1Router.use('/auth', authRouter);
apiV1Router.use('/groups', groupsRouter);
apiV1Router.use('/users', usersRouter);

export { apiV1Router };
