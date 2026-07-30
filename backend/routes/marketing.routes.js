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
    getCampaignRecipients
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

// Campaign routes
router.get('/:workspaceId/campaigns', requireWorkspaceAccess, getCampaigns);
router.get('/:workspaceId/campaigns/:id', requireWorkspaceAccess, getCampaignDetail);
router.post('/:workspaceId/campaigns', requireWorkspaceAccess, requireRole('OWNER', 'ADMIN', 'MANAGER'), createCampaign);
router.post('/:workspaceId/campaigns/:id/send', requireWorkspaceAccess, requireRole('OWNER', 'ADMIN', 'MANAGER'), sendCampaign);
router.delete('/:workspaceId/campaigns/:id', requireWorkspaceAccess, requireRole('OWNER', 'ADMIN'), deleteCampaign);
router.post('/:workspaceId/campaigns/:id/retry', requireWorkspaceAccess, retryCampaignFailed);
router.post('/:workspaceId/campaigns/:id/check-duplicates', requireWorkspaceAccess, checkCampaignDuplicates);
router.get('/:workspaceId/campaigns/:id/recipients', requireWorkspaceAccess, getCampaignRecipients);
router.get('/:workspaceId/segments', requireWorkspaceAccess, getSegments);

export default router;
