import { Router } from 'express';
import { authenticateJWT } from '../middleware/auth.middleware.js';
import * as telsamController from '../controllers/telsam.controller.js';

const router = Router();

// All routes require auth except webhook
router.get('/:workspaceId/settings', authenticateJWT, telsamController.getSettings);
router.put('/:workspaceId/settings', authenticateJWT, telsamController.saveSettings);
router.delete('/:workspaceId/settings', authenticateJWT, telsamController.deleteSettings);
router.post('/:workspaceId/test', authenticateJWT, telsamController.testConnection);
router.post('/:workspaceId/call', authenticateJWT, telsamController.initiateCall);
router.get('/:workspaceId/active-calls', authenticateJWT, telsamController.getActiveCalls);
router.get('/:workspaceId/cdr', authenticateJWT, telsamController.getCDRRecords);
router.get('/:workspaceId/recording/:cdrId', authenticateJWT, telsamController.getCallRecording);
router.post('/:workspaceId/sync-cdr', authenticateJWT, telsamController.syncCDR);
router.post('/webhook/:workspaceId', telsamController.handleWebhook); // No auth - external webhook
router.get('/:workspaceId/extensions', authenticateJWT, telsamController.getExtensions);
router.put('/:workspaceId/extensions', authenticateJWT, telsamController.saveExtensions);
router.get('/:workspaceId/call-logs', authenticateJWT, telsamController.getCallLogs);

export default router;

