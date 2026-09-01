import express from 'express';
import { authenticateJWT, requireWorkspaceAccess } from '../middleware/auth.middleware.js';
import {
    getScheduledMessages,
    createScheduledMessage,
    cancelScheduledMessage
} from '../controllers/scheduledMessage.controller.js';

const router = express.Router();
router.use(authenticateJWT);

router.get('/:workspaceId', requireWorkspaceAccess, getScheduledMessages);
router.post('/:workspaceId', requireWorkspaceAccess, createScheduledMessage);
router.patch('/:workspaceId/:id/cancel', requireWorkspaceAccess, cancelScheduledMessage);

export default router;
