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
    updateScheduledCall,
    recoverCallConversations,
    bulkRetryCall,
    syncRetellCalls,
    syncSingleCall,
    bulkCall,
    getBulkCallBatches,
    getBulkCallBatch
} from '../controllers/retell.controller.js';
import {
    handleRetellAction,
    getActions,
    createAction,
    updateAction,
    deleteAction
} from '../controllers/retellAction.controller.js';
import {
    getAgent,
    updateAgentPrompt,
    listKnowledgeBases,
    syncKnowledgeBase,
    updateAgentKnowledgeBases,
    listVoices,
    searchVoices,
    createAgent,
    deleteAgent
} from '../controllers/retell.controller.js';

const router = express.Router();

// Public endpoints — no auth (Retell calls these during a live call)
router.post('/webhook', handleWebhook);
router.post('/action/:workspaceId', handleRetellAction);

// Authenticated routes
router.use(authenticateJWT);

// Settings
router.get('/:workspaceId/settings', requireWorkspaceAccess, getSettings);
router.put('/:workspaceId/settings', requireWorkspaceAccess, saveSettings);

// Agents
router.get('/:workspaceId/agents', requireWorkspaceAccess, getAgents);
router.post('/:workspaceId/agents', requireWorkspaceAccess, createAgent);

// Calls
router.post('/:workspaceId/call', requireWorkspaceAccess, makeCall);
router.post('/:workspaceId/call/bulk', requireWorkspaceAccess, bulkCall);
router.post('/:workspaceId/bulk-retry', requireWorkspaceAccess, bulkRetryCall);
router.get('/:workspaceId/calls', requireWorkspaceAccess, getCallHistory);
router.get('/:workspaceId/analytics', requireWorkspaceAccess, getCallAnalytics);
router.get('/:workspaceId/bulk-batches', requireWorkspaceAccess, getBulkCallBatches);
router.get('/:workspaceId/bulk-batches/:batchId', requireWorkspaceAccess, getBulkCallBatch);

// Scheduled Calls
router.post('/:workspaceId/schedule-call', requireWorkspaceAccess, scheduleCall);
router.get('/:workspaceId/scheduled-calls', requireWorkspaceAccess, getScheduledCalls);
router.patch('/:workspaceId/scheduled-calls/:id', requireWorkspaceAccess, updateScheduledCall);
router.delete('/:workspaceId/scheduled-calls/:id', requireWorkspaceAccess, cancelScheduledCall);

// Recovery & Sync
router.post('/:workspaceId/recover-calls', requireWorkspaceAccess, recoverCallConversations);
router.post('/:workspaceId/sync-calls', requireWorkspaceAccess, syncRetellCalls);
router.post('/:workspaceId/sync-single-call', requireWorkspaceAccess, syncSingleCall);

// Retell Actions (Otomatik WhatsApp Gönderimleri) — CRUD
router.get('/:workspaceId/actions', requireWorkspaceAccess, getActions);
router.post('/:workspaceId/actions', requireWorkspaceAccess, createAction);
router.put('/:workspaceId/actions/:id', requireWorkspaceAccess, updateAction);
router.delete('/:workspaceId/actions/:id', requireWorkspaceAccess, deleteAction);

// Agent Management
router.get('/:workspaceId/agents/:agentId', requireWorkspaceAccess, getAgent);
router.patch('/:workspaceId/agents/:agentId/prompt', requireWorkspaceAccess, updateAgentPrompt);
router.delete('/:workspaceId/agents/:agentId', requireWorkspaceAccess, deleteAgent);

// Voice Management
router.get('/:workspaceId/voices', requireWorkspaceAccess, listVoices);
router.get('/:workspaceId/voices/search', requireWorkspaceAccess, searchVoices);

// Knowledge Base Sync
router.get('/:workspaceId/knowledge-bases', requireWorkspaceAccess, listKnowledgeBases);
router.post('/:workspaceId/knowledge-bases/sync', requireWorkspaceAccess, syncKnowledgeBase);
router.patch('/:workspaceId/agents/:agentId/knowledge-bases', requireWorkspaceAccess, updateAgentKnowledgeBases);

export default router;
