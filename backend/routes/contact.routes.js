import express from 'express';
import { getContacts, getContactById, createContact, updateContact, deleteContact, getContactAnalytics, getAgentPerformance, blockContact, unblockContact, archiveContact, unarchiveContact, addNoteToConversation, bulkImportContacts } from '../controllers/contact.controller.js';
import { authenticateJWT, requireWorkspaceAccess } from '../middleware/auth.middleware.js';

const router = express.Router();

// Apply auth middleware to all routes
router.use(authenticateJWT);

// Analytics endpoint (must be before /:workspaceId/:id to avoid conflict)
router.get('/:workspaceId/analytics', requireWorkspaceAccess, getContactAnalytics);

// Agent performance metrics
router.get('/:workspaceId/agent-performance', requireWorkspaceAccess, getAgentPerformance);

// List contacts in workspace
router.get('/:workspaceId', requireWorkspaceAccess, getContacts);

// Create contact manually
router.post('/:workspaceId', requireWorkspaceAccess, createContact);

// Bulk import contacts
router.post('/:workspaceId/import', requireWorkspaceAccess, bulkImportContacts);

// Get contact details
router.get('/:workspaceId/:id', requireWorkspaceAccess, getContactById);

// Update contact
router.put('/:workspaceId/:id', requireWorkspaceAccess, updateContact);

// Delete contact
router.delete('/:workspaceId/:id', requireWorkspaceAccess, deleteContact);

// Block contact
router.post('/:workspaceId/:id/block', requireWorkspaceAccess, blockContact);

// Unblock contact
router.post('/:workspaceId/:id/unblock', requireWorkspaceAccess, unblockContact);

// Archive contact
router.post('/:workspaceId/:id/archive', requireWorkspaceAccess, archiveContact);

// Unarchive contact
router.post('/:workspaceId/:id/unarchive', requireWorkspaceAccess, unarchiveContact);

// Add note to conversation
router.post('/:workspaceId/:id/note', requireWorkspaceAccess, addNoteToConversation);

export default router;
