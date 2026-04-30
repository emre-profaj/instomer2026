import express from 'express';
import { authenticateJWT, requireWorkspaceAccess } from '../middleware/auth.middleware.js';
import {
    getIntegrations,
    createIntegration,
    updateIntegration,
    deleteIntegration,
    getBotTools,
    createBotTool,
    updateBotTool,
    deleteBotTool
} from '../controllers/apiIntegration.controller.js';

const router = express.Router();

router.use(authenticateJWT);

// API Integrations (Workspace based)
router.get('/workspace/:workspaceId', requireWorkspaceAccess, getIntegrations);
router.post('/workspace/:workspaceId', requireWorkspaceAccess, createIntegration);
router.put('/workspace/:workspaceId/:id', requireWorkspaceAccess, updateIntegration);
router.delete('/workspace/:workspaceId/:id', requireWorkspaceAccess, deleteIntegration);

// AI Bot Tools (Workspace Level)
router.get('/workspace/:workspaceId/tools', requireWorkspaceAccess, getBotTools);
router.post('/workspace/:workspaceId/tools', requireWorkspaceAccess, createBotTool);
router.put('/workspace/:workspaceId/tools/:toolId', requireWorkspaceAccess, updateBotTool);
router.delete('/workspace/:workspaceId/tools/:toolId', requireWorkspaceAccess, deleteBotTool);

export default router;
