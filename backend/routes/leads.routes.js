import express from 'express';
import { authenticateJWT, requireWorkspaceAccess } from '../middleware/auth.middleware.js';
import {
    getLeads,
    syncLeads,
    updateLeadStatus,
    getLeadForms,
    deleteLead,
    getLeadStats,
    exportLeads,
    getLeadsByForm
} from '../controllers/leads.controller.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateJWT);

// Get leads for workspace
router.get('/:workspaceId', requireWorkspaceAccess, getLeads);

// Get lead statistics
router.get('/:workspaceId/stats', requireWorkspaceAccess, getLeadStats);

// Export leads for CSV download
router.get('/:workspaceId/export', requireWorkspaceAccess, exportLeads);

// Form bazlı lead istatistiği (Genel Rapor)
router.get('/:workspaceId/by-form', requireWorkspaceAccess, getLeadsByForm);

// Sync leads from Facebook
router.post('/:workspaceId/sync', requireWorkspaceAccess, syncLeads);

// Get lead forms for a page
router.get('/forms/:pageId', getLeadForms);

// Update lead status
router.patch('/:leadId', updateLeadStatus);

// Delete lead
router.delete('/:leadId', deleteLead);

export default router;

