import express from 'express';
import { authenticateJWT, requireWorkspaceAccess } from '../middleware/auth.middleware.js';
import {
    // Templates
    getTemplates,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    syncTemplates,
    sendTemplateMessage,
    sendTemplateDynamic,
    // Automations
    getAutomations,
    createAutomation,
    updateAutomation,
    deleteAutomation,
    toggleAutomation
} from '../controllers/automation.controller.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateJWT);

// ============================================
// WhatsApp Template Routes
// ============================================
router.get('/:workspaceId/templates', requireWorkspaceAccess, getTemplates);
router.post('/:workspaceId/templates', requireWorkspaceAccess, createTemplate);
router.put('/:workspaceId/templates/:templateId', requireWorkspaceAccess, updateTemplate);
router.delete('/:workspaceId/templates/:templateId', requireWorkspaceAccess, deleteTemplate);
router.post('/:workspaceId/templates/sync', requireWorkspaceAccess, syncTemplates);
router.post('/:workspaceId/templates/send', requireWorkspaceAccess, sendTemplateMessage);
router.post('/:workspaceId/templates/send-dynamic', requireWorkspaceAccess, sendTemplateDynamic);

// ============================================
// Automation Routes
// ============================================
router.get('/:workspaceId/automations', requireWorkspaceAccess, getAutomations);
router.post('/:workspaceId/automations', requireWorkspaceAccess, createAutomation);
router.put('/:workspaceId/automations/:automationId', requireWorkspaceAccess, updateAutomation);
router.delete('/:workspaceId/automations/:automationId', requireWorkspaceAccess, deleteAutomation);
router.patch('/:workspaceId/automations/:automationId/toggle', requireWorkspaceAccess, toggleAutomation);

export default router;

