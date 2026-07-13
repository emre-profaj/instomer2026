import express from 'express';
import { authenticateJWT, requireWorkspaceAccess } from '../middleware/auth.middleware.js';
import {
    getCampaigns,
    getCampaignDetail,
    createCampaign,
    sendCampaign,
    deleteCampaign,
    getSegments
} from '../controllers/marketing.controller.js';

const router = express.Router();

router.use(authenticateJWT);

router.get('/:workspaceId/campaigns', requireWorkspaceAccess, getCampaigns);
router.get('/:workspaceId/campaigns/:id', requireWorkspaceAccess, getCampaignDetail);
router.post('/:workspaceId/campaigns', requireWorkspaceAccess, createCampaign);
router.post('/:workspaceId/campaigns/:id/send', requireWorkspaceAccess, sendCampaign);
router.delete('/:workspaceId/campaigns/:id', requireWorkspaceAccess, deleteCampaign);
router.get('/:workspaceId/segments', requireWorkspaceAccess, getSegments);

export default router;
