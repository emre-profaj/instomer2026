import express from 'express';
import { authenticateJWT } from '../middleware/auth.middleware.js';
import * as marketingV2Controller from '../controllers/marketingV2.controller.js';

const router = express.Router();
router.use(authenticateJWT);

// CAMPAIGNS
router.get('/:workspaceId/campaigns', marketingV2Controller.getCampaigns);
router.post('/:workspaceId/campaigns', marketingV2Controller.createCampaign);
router.get('/:workspaceId/campaigns/:id', marketingV2Controller.getCampaign);
router.put('/:workspaceId/campaigns/:id', marketingV2Controller.updateCampaign);
router.delete('/:workspaceId/campaigns/:id', marketingV2Controller.deleteCampaign);

// GROUPS (Ad Sets)
router.get('/:workspaceId/groups', marketingV2Controller.getAllGroups);
router.post('/:workspaceId/groups', marketingV2Controller.createGroup);
router.get('/:workspaceId/campaigns/:campaignId/groups', marketingV2Controller.getGroups);
router.post('/:workspaceId/campaigns/:campaignId/groups', marketingV2Controller.createGroup);
router.put('/:workspaceId/groups/:groupId', marketingV2Controller.updateGroup);
router.delete('/:workspaceId/groups/:groupId', marketingV2Controller.deleteGroup);
router.post('/:workspaceId/groups/:groupId/execute', marketingV2Controller.executeGroupSend);

// MESSAGES (Independent, Reusable)
router.get('/:workspaceId/messages', marketingV2Controller.getMessages);
router.post('/:workspaceId/messages', marketingV2Controller.createMessage);
router.put('/:workspaceId/messages/:id', marketingV2Controller.updateMessage);
router.delete('/:workspaceId/messages/:id', marketingV2Controller.deleteMessage);
router.get('/:workspaceId/messages/:id/usage', marketingV2Controller.getMessageUsage);

// GROUP-MESSAGE LINKING
router.post('/:workspaceId/groups/:groupId/messages', marketingV2Controller.addMessageToGroup);
router.delete('/:workspaceId/groups/:groupId/messages/:messageId', marketingV2Controller.removeMessageFromGroup);

// WIZARD & SYNC
router.post('/:workspaceId/preview-audience', marketingV2Controller.previewAudience);
router.post('/:workspaceId/wizard-launch', marketingV2Controller.wizardLaunchCampaign);
router.post('/:workspaceId/sync-past-data', marketingV2Controller.syncPastData);

export default router;

