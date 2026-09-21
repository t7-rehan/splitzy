import { Router } from 'express';
import {
  addMemberHandler,
  changeRoleHandler,
  createGroupHandler,
  deleteGroupHandler,
  getGroupHandler,
  leaveGroupHandler,
  listGroupsHandler,
  removeMemberHandler,
  updateGroupHandler,
} from '../controllers/groups.controller.js';
import { expensesRouter } from './expenses.routes.js';
import { requireAuth } from '../middleware/auth.js';
import {
  loadGroupMembership,
  requireActor,
  requireRole,
} from '../middleware/groupAuthorization.js';

/**
 * Groups API routes (Task 5) — every route requires authentication.
 *
 * Middleware chain per route:
 *   requireAuth          verify token (Firebase in production; dev header in dev)
 *   requireActor         verified identity -> PostgreSQL User (req.actor)
 *   loadGroupMembership  :groupId + req.actor -> GroupMember (404 if absent)
 *   requireRole(...)     GroupRole gate (403 if insufficient)
 *
 * Role policy:
 *   create   any authenticated user
 *   read     any member
 *   update   OWNER or ADMIN
 *   leave    any member except OWNER (rule enforced in service)
 *   add      OWNER or ADMIN
 *   remove   OWNER or ADMIN (owner/admin protections enforced in service)
 *   role     OWNER only
 */
export const groupsRouter = Router();

// Collection routes (no :groupId).
groupsRouter.post(
  '/',
  requireAuth,
  requireActor,
  createGroupHandler,
);
groupsRouter.get('/', requireAuth, requireActor, listGroupsHandler);

// Expense sub-resource: inherits member authorization for every nested route.
groupsRouter.use(
  '/:groupId/expenses',
  requireAuth,
  requireActor,
  loadGroupMembership,
  expensesRouter,
);

// Group-scoped routes: membership is mandatory for every one of them.
groupsRouter.get(
  '/:groupId',
  requireAuth,
  requireActor,
  loadGroupMembership,
  getGroupHandler,
);

groupsRouter.patch(
  '/:groupId',
  requireAuth,
  requireActor,
  loadGroupMembership,
  requireRole('OWNER', 'ADMIN'),
  updateGroupHandler,
);

groupsRouter.delete(
  '/:groupId',
  requireAuth,
  requireActor,
  loadGroupMembership,
  requireRole('OWNER'),
  deleteGroupHandler,
);

groupsRouter.post(
  '/:groupId/leave',
  requireAuth,
  requireActor,
  loadGroupMembership,
  leaveGroupHandler,
);

groupsRouter.post(
  '/:groupId/members',
  requireAuth,
  requireActor,
  loadGroupMembership,
  requireRole('OWNER', 'ADMIN'),
  addMemberHandler,
);

groupsRouter.delete(
  '/:groupId/members/:userId',
  requireAuth,
  requireActor,
  loadGroupMembership,
  requireRole('OWNER', 'ADMIN'),
  removeMemberHandler,
);

groupsRouter.patch(
  '/:groupId/members/:userId/role',
  requireAuth,
  requireActor,
  loadGroupMembership,
  requireRole('OWNER'),
  changeRoleHandler,
);
