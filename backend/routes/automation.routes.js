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
    templateMediaUpload,
    uploadTemplateMedia,
    // Automations
    getAutomations,
    createAutomation,
    updateAutomation,
    deleteAutomation,
    toggleAutomation,
    getUnifiedAutomationPanel,
    toggleUnifiedAutomation,
    getAutomationLogs,
} from '../controllers/automation.controller.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateJWT);

// ============================================
// WhatsApp Template Routes
// ============================================
router.get('/:workspaceId/templates', requireWorkspaceAccess, getTemplates);
router.post('/:workspaceId/templates', requireWorkspaceAccess, createTemplate);
router.post('/:workspaceId/templates/upload-media', requireWorkspaceAccess, templateMediaUpload.single('file'), uploadTemplateMedia);
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

// Birleşik Otomasyon Paneli
router.get('/:workspaceId/unified-panel', requireWorkspaceAccess, getUnifiedAutomationPanel);

// Otomasyon çalışma kayıtları (başarı/başarısızlık geçmişi)
router.get('/:workspaceId/automation-logs', requireWorkspaceAccess, getAutomationLogs);
router.patch('/:workspaceId/unified-toggle', requireWorkspaceAccess, toggleUnifiedAutomation);

export default router;

