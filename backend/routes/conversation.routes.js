import express from 'express';
import { body } from 'express-validator';
import {
    getConversations,
    getConversation,
    getUnreadCount,
    markAllAsRead,
    sendMessage,
    assignConversation,
    takeOverConversation,
    updateConversationStatus,
    deleteConversation,
    deleteAllConversations,
    addInternalNote,
    getInternalNotes,
    deleteInternalNote,
    transferConversation,
    acceptTransfer,
    rejectTransfer,
    getPendingTransfers,
    createManualConversation,
    toggleBotEnabled,
    getBotStatus,
    updateTopic,
    updateFunnel,
    markUnread,
    claimConversation,
    smartAssignConversation,
    getUnifiedTimeline,
    getContactGroupedConversations,
    archiveConversation,
    unarchiveConversation,
    createInternalConversation,
    toggleStarConversation
} from '../controllers/conversation.controller.js';
import { authenticateJWT, requireWorkspaceAccess } from '../middleware/auth.middleware.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateJWT);

// Transfer Routes (Must be before generic /:workspaceId routes)
router.get('/transfers/pending', getPendingTransfers);
router.post('/transfers/:transferId/accept', acceptTransfer);
router.post('/transfers/:transferId/reject', rejectTransfer);

// Create manual conversation (must be before /:workspaceId/:conversationId to avoid conflict)
router.post('/:workspaceId/manual', requireWorkspaceAccess, createManualConversation);

// Internal Agent Chat
router.post('/:workspaceId/internal', requireWorkspaceAccess, createInternalConversation);

// Get unread count for workspace (messages only: Facebook, Instagram, WhatsApp)
// IMPORTANT: Must be before /:workspaceId/:conversationId to avoid "unread-count" being treated as conversationId
router.get('/:workspaceId/unread-count', requireWorkspaceAccess, getUnreadCount);

// Mark all conversations as read for workspace
router.post('/:workspaceId/mark-all-read', requireWorkspaceAccess, markAllAsRead);

// Delete ALL conversations for workspace (admin only)
router.delete('/:workspaceId/delete-all', requireWorkspaceAccess, deleteAllConversations);

// Contact-grouped conversations (Birleşik Inbox)
router.get('/:workspaceId/contact-grouped', requireWorkspaceAccess, getContactGroupedConversations);

// Unified timeline for a contact
router.get('/:workspaceId/unified-timeline/:contactId', requireWorkspaceAccess, getUnifiedTimeline);

// Get conversations for workspace
router.get('/:workspaceId', requireWorkspaceAccess, getConversations);

// Get conversation details
router.get('/:workspaceId/:conversationId', requireWorkspaceAccess, getConversation);

// Send message
router.post(
    '/:workspaceId/:conversationId/messages',
    requireWorkspaceAccess,
    [
        body('content').custom((value, { req }) => {
            if (!value && !req.body.mediaUrl) {
                throw new Error('Message content or media is required');
            }
            return true;
        })
    ],
    sendMessage
);

// Internal Notes
router.post('/:workspaceId/:conversationId/notes', requireWorkspaceAccess, addInternalNote);
router.get('/:workspaceId/:conversationId/notes', requireWorkspaceAccess, getInternalNotes);
router.delete('/:workspaceId/:conversationId/notes/:noteId', requireWorkspaceAccess, deleteInternalNote);

// Assign conversation (OWNER only)
router.put(
    '/:workspaceId/:conversationId/assign',
    requireWorkspaceAccess,
    assignConversation
);

// Take over conversation (self-assign - any agent)
router.post(
    '/:workspaceId/:conversationId/take-over',
    requireWorkspaceAccess,
    takeOverConversation
);

// Update conversation status
router.put(
    '/:workspaceId/:conversationId/status',
    requireWorkspaceAccess,
    [
        body('status').isIn(['OPEN', 'PENDING', 'RESOLVED']).withMessage('Valid status is required')
    ],
    updateConversationStatus
);

// Delete conversation
router.delete('/:workspaceId/:conversationId', requireWorkspaceAccess, deleteConversation);

// Transfer conversation
router.post('/:workspaceId/:conversationId/transfer', requireWorkspaceAccess, transferConversation);

// Bot toggle for conversation
router.get('/:workspaceId/:conversationId/bot-status', requireWorkspaceAccess, getBotStatus);
router.put('/:workspaceId/:conversationId/bot-toggle', requireWorkspaceAccess, toggleBotEnabled);

// Update aiTopic
router.patch('/:workspaceId/:conversationId/topic', requireWorkspaceAccess, updateTopic);

// Update funnelType
router.patch('/:workspaceId/:conversationId/funnel', requireWorkspaceAccess, updateFunnel);

// Mark conversation as unread
router.patch('/:workspaceId/:conversationId/mark-unread', requireWorkspaceAccess, markUnread);
router.post('/:workspaceId/:conversationId/claim', requireWorkspaceAccess, claimConversation);
router.post('/:workspaceId/:conversationId/smart-assign', requireWorkspaceAccess, smartAssignConversation);

router.patch('/:workspaceId/:conversationId/archive', requireWorkspaceAccess, archiveConversation);
router.patch('/:workspaceId/:conversationId/unarchive', requireWorkspaceAccess, unarchiveConversation);

// Star / Pin conversation (keep pinned to top)
router.patch('/:workspaceId/:conversationId/star', requireWorkspaceAccess, toggleStarConversation);
router.put('/:workspaceId/:conversationId/star', requireWorkspaceAccess, toggleStarConversation);

export default router;
