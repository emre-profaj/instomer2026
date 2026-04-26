import express from 'express';
import * as emailController from '../controllers/email.controller.js';
import { authenticateJWT as authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();

// Public OAuth transitions
router.get('/google/connect', emailController.googleConnect);
router.get('/google/callback', emailController.googleCallback);

// Pub/Sub Webhook (public - called by Google)
router.post('/webhook', emailController.pubsubWebhook);

// IMAP/SMTP Connection (for Yandex, Webmail, Outlook etc.)
router.get('/presets', emailController.getEmailPresets);
router.post('/:workspaceId/connect-imap', authenticate, emailController.connectImapSmtp);

// Protected management
router.get('/:workspaceId', authenticate, emailController.listEmailChannels);
router.post('/:id/sync', authenticate, emailController.syncEmails);
router.post('/:id/send', authenticate, emailController.sendNewEmail);
router.post('/:id/watch', authenticate, emailController.setupGmailWatch);
router.delete('/:id/watch', authenticate, emailController.stopGmailWatch);
router.delete('/:id', authenticate, emailController.deleteEmailChannel);
router.patch('/:id/bot', authenticate, emailController.updateEmailBot);

export default router;

