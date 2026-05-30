import express from 'express';
import { authenticateJWT, requireWorkspaceAccess } from '../middleware/auth.middleware.js';
import {
    getFlows, createFlow, updateFlow, deleteFlow, toggleFlow,
    ensureMainFlow, reorderFlows
} from '../controllers/flow.controller.js';

const router = express.Router();

// All routes require authentication + workspace authorization
router.get('/:workspaceId/flows', authenticateJWT, requireWorkspaceAccess, getFlows);
router.post('/:workspaceId/flows', authenticateJWT, requireWorkspaceAccess, createFlow);
router.post('/:workspaceId/flows/ensure-main', authenticateJWT, requireWorkspaceAccess, ensureMainFlow);
router.put('/:workspaceId/flows/reorder', authenticateJWT, requireWorkspaceAccess, reorderFlows);
router.put('/:workspaceId/flows/:flowId', authenticateJWT, requireWorkspaceAccess, updateFlow);
router.delete('/:workspaceId/flows/:flowId', authenticateJWT, requireWorkspaceAccess, deleteFlow);
router.patch('/:workspaceId/flows/:flowId/toggle', authenticateJWT, requireWorkspaceAccess, toggleFlow);

export default router;
