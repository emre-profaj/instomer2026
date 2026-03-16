import express from 'express';
import { authenticateJWT, requireWorkspaceAccess } from '../middleware/auth.middleware.js';
import { getRules, upsertRule } from '../controllers/rules.controller.js';

const router = express.Router();

router.use(authenticateJWT);

// GET  /api/rules/:workspaceId/rules       → Get all 3 rules for workspace
router.get('/:workspaceId/rules', requireWorkspaceAccess, getRules);

// PUT  /api/rules/:workspaceId/rules/:type → Create or update a rule
router.put('/:workspaceId/rules/:ruleType', requireWorkspaceAccess, upsertRule);

export default router;
