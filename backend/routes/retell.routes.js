import express from 'express';
import multer from 'multer';
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
    getBulkCallBatch,
    pushCallTasks
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
    deleteAgent,
    listRetellKnowledgeBases,
    createRetellKnowledgeBase,
    deleteRetellKnowledgeBase,
    addRetellKBSource,
    uploadRetellKBFile,
    deleteRetellKBSource
} from '../controllers/retell.controller.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

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

// Push: Açık arama görevlerini hemen işle
router.post('/:workspaceId/push-calls', requireWorkspaceAccess, pushCallTasks);

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

// Knowledge Base Sync (Instomer → Retell)
router.get('/:workspaceId/knowledge-bases', requireWorkspaceAccess, listKnowledgeBases);
router.post('/:workspaceId/knowledge-bases/sync', requireWorkspaceAccess, syncKnowledgeBase);
router.patch('/:workspaceId/agents/:agentId/knowledge-bases', requireWorkspaceAccess, updateAgentKnowledgeBases);

// Retell Knowledge Base CRUD
router.get('/:workspaceId/knowledge-bases/retell', requireWorkspaceAccess, listRetellKnowledgeBases);
router.post('/:workspaceId/knowledge-bases/retell', requireWorkspaceAccess, createRetellKnowledgeBase);
router.delete('/:workspaceId/knowledge-bases/retell/:kbId', requireWorkspaceAccess, deleteRetellKnowledgeBase);
router.post('/:workspaceId/knowledge-bases/retell/:kbId/sources', requireWorkspaceAccess, addRetellKBSource);
router.post('/:workspaceId/knowledge-bases/retell/:kbId/upload', requireWorkspaceAccess, upload.single('file'), uploadRetellKBFile);
router.delete('/:workspaceId/knowledge-bases/retell/:kbId/sources/:sourceId', requireWorkspaceAccess, deleteRetellKBSource);

export default router;
