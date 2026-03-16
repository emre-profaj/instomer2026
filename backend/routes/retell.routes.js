import express from 'express';
import { authenticateJWT, requireWorkspaceAccess } from '../middleware/auth.middleware.js';
import {
    getSettings,
    saveSettings,
    getAgents,
    makeCall,
    getCallHistory,
    getCallAnalytics,
    handleWebhook,
    scheduleCall,
    getScheduledCalls,
    cancelScheduledCall,
    recoverCallConversations,
    bulkRetryCall,
    syncRetellCalls
} from '../controllers/retell.controller.js';

const router = express.Router();

// Public webhook endpoint (no auth — Retell calls this)
router.post('/webhook', handleWebhook);

// Authenticated routes
router.use(authenticateJWT);

// Settings
router.get('/:workspaceId/settings', requireWorkspaceAccess, getSettings);
router.put('/:workspaceId/settings', requireWorkspaceAccess, saveSettings);

// Agents
router.get('/:workspaceId/agents', requireWorkspaceAccess, getAgents);

// Calls
router.post('/:workspaceId/call', requireWorkspaceAccess, makeCall);
router.post('/:workspaceId/bulk-retry', requireWorkspaceAccess, bulkRetryCall);
router.get('/:workspaceId/calls', requireWorkspaceAccess, getCallHistory);
router.get('/:workspaceId/analytics', requireWorkspaceAccess, getCallAnalytics);

// Scheduled Calls
router.post('/:workspaceId/schedule-call', requireWorkspaceAccess, scheduleCall);
router.get('/:workspaceId/scheduled-calls', requireWorkspaceAccess, getScheduledCalls);
router.delete('/:workspaceId/scheduled-calls/:id', requireWorkspaceAccess, cancelScheduledCall);

// Recovery: create conversations for past calls
router.post('/:workspaceId/recover-calls', requireWorkspaceAccess, recoverCallConversations);

// Sync: fetch historical calls from Retell API → DB → Inbox
router.post('/:workspaceId/sync-calls', requireWorkspaceAccess, syncRetellCalls);

export default router;

