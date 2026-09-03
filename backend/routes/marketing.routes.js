import express from 'express';
import { authenticateJWT, requireWorkspaceAccess } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/roleAuth.js';
import {
    getTemplateAnalytics,
    clearTemplateHistory,
    getMarketingContacts,
    bulkSendTemplate,
    getBulkSendStatus,
    getCampaigns,
    getCampaignDetail,
    createCampaign,
    sendCampaign,
    deleteCampaign,
    getSegments,
    retryCampaignFailed,
    retryTemplateFailed,
    checkCampaignDuplicates,
    getCampaignRecipients,
    // Yeni: Kampanya > Mesaj > Gönderim
    getCampaignMessages,
    addCampaignMessage,
    deleteCampaignMessage,
    getMessageSends,
    addMessageSend,
    executeMessageSend,
    getSendRecipients,
    getCampaignStats
} from '../controllers/marketing.controller.js';

const router = express.Router();

router.use(authenticateJWT);

// Template analytics
router.get('/:workspaceId/template-analytics', requireWorkspaceAccess, getTemplateAnalytics);
router.post('/:workspaceId/template-analytics/retry', requireWorkspaceAccess, retryTemplateFailed);
router.delete('/:workspaceId/template-analytics', requireWorkspaceAccess, clearTemplateHistory);

// Contacts (for bulk send)
router.get('/:workspaceId/contacts', requireWorkspaceAccess, getMarketingContacts);

// Bulk send (OWNER, ADMIN, MANAGER only)
router.post('/:workspaceId/bulk-send', requireWorkspaceAccess, requireRole('OWNER', 'ADMIN', 'MANAGER'), bulkSendTemplate);
router.get('/:workspaceId/bulk-send-status/:jobId', requireWorkspaceAccess, getBulkSendStatus);

// Campaign routes (mevcut)
router.get('/:workspaceId/campaigns', requireWorkspaceAccess, getCampaigns);
router.get('/:workspaceId/campaigns/:id', requireWorkspaceAccess, getCampaignDetail);
router.post('/:workspaceId/campaigns', requireWorkspaceAccess, requireRole('OWNER', 'ADMIN', 'MANAGER'), createCampaign);
router.post('/:workspaceId/campaigns/:id/send', requireWorkspaceAccess, requireRole('OWNER', 'ADMIN', 'MANAGER'), sendCampaign);
router.delete('/:workspaceId/campaigns/:id', requireWorkspaceAccess, requireRole('OWNER', 'ADMIN'), deleteCampaign);
router.post('/:workspaceId/campaigns/:id/retry', requireWorkspaceAccess, retryCampaignFailed);
router.post('/:workspaceId/campaigns/:id/check-duplicates', requireWorkspaceAccess, checkCampaignDuplicates);
router.get('/:workspaceId/campaigns/:id/recipients', requireWorkspaceAccess, getCampaignRecipients);

// Yeni: Kampanya > Mesaj > Gönderim hiyerarşisi
router.get('/:workspaceId/campaigns/:id/stats', requireWorkspaceAccess, getCampaignStats);
router.get('/:workspaceId/campaigns/:id/messages', requireWorkspaceAccess, getCampaignMessages);
router.post('/:workspaceId/campaigns/:id/messages', requireWorkspaceAccess, requireRole('OWNER', 'ADMIN', 'MANAGER'), addCampaignMessage);
router.delete('/:workspaceId/campaigns/:id/messages/:msgId', requireWorkspaceAccess, requireRole('OWNER', 'ADMIN'), deleteCampaignMessage);
router.get('/:workspaceId/campaigns/:id/messages/:msgId/sends', requireWorkspaceAccess, getMessageSends);
router.post('/:workspaceId/campaigns/:id/messages/:msgId/sends', requireWorkspaceAccess, requireRole('OWNER', 'ADMIN', 'MANAGER'), addMessageSend);
router.post('/:workspaceId/campaigns/:id/messages/:msgId/sends/:sendId/execute', requireWorkspaceAccess, requireRole('OWNER', 'ADMIN', 'MANAGER'), executeMessageSend);
router.get('/:workspaceId/campaigns/:id/messages/:msgId/sends/:sendId/recipients', requireWorkspaceAccess, getSendRecipients);

// Segments
router.get('/:workspaceId/segments', requireWorkspaceAccess, getSegments);

export default router;

