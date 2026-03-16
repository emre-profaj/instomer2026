import express from 'express';
import { authenticateJWT, requireWorkspaceAccess } from '../middleware/auth.middleware.js';
import {
    getNotifications,
    getUnreadCount,
    markAsRead,
    markAllAsRead,
    deleteAllNotifications
} from '../controllers/notification.controller.js';

const router = express.Router();

router.use(authenticateJWT);

// Get notifications for workspace
router.get('/:workspaceId', requireWorkspaceAccess, getNotifications);

// Get unread count
router.get('/:workspaceId/unread-count', requireWorkspaceAccess, getUnreadCount);

// Mark single notification as read
router.put('/:workspaceId/:id/read', requireWorkspaceAccess, markAsRead);

// Mark all as read
router.put('/:workspaceId/read-all', requireWorkspaceAccess, markAllAsRead);

// Delete all notifications
router.delete('/:workspaceId/delete-all', requireWorkspaceAccess, deleteAllNotifications);

export default router;
