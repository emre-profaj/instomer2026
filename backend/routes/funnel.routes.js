import express from 'express';
import { getFunnels, createFunnel, updateFunnel, deleteFunnel } from '../controllers/funnel.controller.js';
import { authenticateJWT, requireWorkspaceAccess } from '../middleware/auth.middleware.js';

const router = express.Router();
router.use(authenticateJWT);

router.get('/:workspaceId', requireWorkspaceAccess, getFunnels);
router.post('/:workspaceId', requireWorkspaceAccess, createFunnel);
router.put('/:workspaceId/:funnelId', requireWorkspaceAccess, updateFunnel);
router.delete('/:workspaceId/:funnelId', requireWorkspaceAccess, deleteFunnel);

export default router;
