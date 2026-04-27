import express from 'express';
import { authenticateJWT } from '../middleware/auth.middleware.js';
import {
    connectHealthSystem,
    testConnection,
    getConnectionStatus,
    disconnectHealthSystem,
    updateHealthBot
} from '../controllers/probel_proxy.controller.js';

const router = express.Router();

// Connect — login with API URL + username + password → get Bearer token
router.post('/:workspaceId/connect', authenticateJWT, connectHealthSystem);

// Test — re-validate connection by refreshing token
router.post('/:workspaceId/test', authenticateJWT, testConnection);

// Status — check if workspace has active health system connection
router.get('/:workspaceId/status', authenticateJWT, getConnectionStatus);

// Bot assignment — assign/unassign bot to health system channel
router.put('/:workspaceId/bot/:id', authenticateJWT, updateHealthBot);

// Disconnect — remove health system connection
router.delete('/:workspaceId/disconnect/:id', authenticateJWT, disconnectHealthSystem);

export default router;
