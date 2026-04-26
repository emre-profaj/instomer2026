import express from 'express';
import { authenticateJWT, requireWorkspaceAccess } from '../middleware/auth.middleware.js';
import {
    getFormWebhooks,
    createFormWebhook,
    updateFormWebhook,
    deleteFormWebhook,
    handleFormSubmission,
    getFormSubmissions,
    updateFormSubmissionStatus,
    deleteFormSubmission,
    testFormWebhook
} from '../controllers/formWebhook.controller.js';

const router = express.Router();

// Protected routes (require authentication)
router.get('/:workspaceId/webhooks', authenticateJWT, requireWorkspaceAccess, getFormWebhooks);
router.post('/:workspaceId/webhooks', authenticateJWT, requireWorkspaceAccess, createFormWebhook);
router.put('/:workspaceId/webhooks/:webhookId', authenticateJWT, requireWorkspaceAccess, updateFormWebhook);
router.delete('/:workspaceId/webhooks/:webhookId', authenticateJWT, requireWorkspaceAccess, deleteFormWebhook);

router.get('/:workspaceId/submissions', authenticateJWT, requireWorkspaceAccess, getFormSubmissions);
router.patch('/:workspaceId/submissions/:submissionId/status', authenticateJWT, requireWorkspaceAccess, updateFormSubmissionStatus);
router.delete('/:workspaceId/submissions/:submissionId', authenticateJWT, requireWorkspaceAccess, deleteFormSubmission);

// Public webhook endpoint (no authentication required)
router.post('/submit/:urlSlug', handleFormSubmission);
router.post('/test/:urlSlug', testFormWebhook);

export default router;

