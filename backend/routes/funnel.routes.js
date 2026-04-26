import express from 'express';
import { getFunnels, createFunnel, updateFunnel, deleteFunnel, createStage, updateStage, deleteStage } from '../controllers/funnel.controller.js';
import { authenticateJWT, requireWorkspaceAccess } from '../middleware/auth.middleware.js';

const router = express.Router();
router.use(authenticateJWT);

router.get('/:workspaceId', requireWorkspaceAccess, getFunnels);
router.post('/:workspaceId', requireWorkspaceAccess, createFunnel);
router.put('/:workspaceId/:funnelId', requireWorkspaceAccess, updateFunnel);
router.delete('/:workspaceId/:funnelId', requireWorkspaceAccess, deleteFunnel);

// Stage routes
router.post('/:workspaceId/:funnelId/stages', requireWorkspaceAccess, createStage);
router.put('/:workspaceId/:funnelId/stages/:stageId', requireWorkspaceAccess, updateStage);
router.delete('/:workspaceId/:funnelId/stages/:stageId', requireWorkspaceAccess, deleteStage);

export default router;
