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

// AI Bot Tools
router.get('/bot/:botId', getBotTools);
router.post('/bot/:botId', createBotTool);
router.put('/bot/:botId/:toolId', updateBotTool);
router.delete('/bot/:botId/:toolId', deleteBotTool);

export default router;
