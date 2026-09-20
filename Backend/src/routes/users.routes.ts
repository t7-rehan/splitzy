import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { searchUserHandler } from '../controllers/users.controller.js';

export const usersRouter = Router();
usersRouter.get('/search', requireAuth, searchUserHandler);