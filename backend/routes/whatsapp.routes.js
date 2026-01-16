import express from 'express';
import * as whatsappController from '../controllers/whatsapp.controller.js';
import { authenticateJWT, requireWorkspaceAccess } from '../middleware/auth.middleware.js';

const router = express.Router();

// Public Webhook Routes (Meta calls these)
router.get('/webhook', whatsappController.webhookVerify);
router.post('/webhook', whatsappController.webhookHandler);

// Protected Routes (Frontend calls these)
router.post('/connect', authenticateJWT, whatsappController.connectPhoneNumber);
router.post('/embedded-signup', authenticateJWT, whatsappController.handleEmbeddedSignup);
router.post('/list-meta', authenticateJWT, whatsappController.getAvailablePhoneNumbers);
router.get('/:workspaceId', authenticateJWT, requireWorkspaceAccess, whatsappController.getPhoneNumbers);
router.delete('/:id', authenticateJWT, whatsappController.disconnectPhoneNumber);
router.patch('/:id/bot', authenticateJWT, whatsappController.updateWhatsappBot);

export default router;
