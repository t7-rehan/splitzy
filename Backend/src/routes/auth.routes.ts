import { Router } from 'express';
import { getMe } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';

/**
 * Authentication routes (Task 4).
 *
 * Every route requires a verified identity. Production verifies Firebase ID
 * tokens; non-production additionally accepts the x-dev-user-id development
 * header (see src/middleware/auth.ts).
 */
export const authRouter = Router();

authRouter.get('/me', requireAuth, getMe);
