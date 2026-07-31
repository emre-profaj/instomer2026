import prisma from '../lib/prisma.js';
import { emitToWorkspace } from '../socket.js';


// Get notifications for current user
export const getNotifications = async (req, res) => {
    try {
        const userId = req.user.id;
        const { workspaceId } = req.params;
        const { limit = 50, offset = 0 } = req.query;

        const notifications = await prisma.notification.findMany({
            where: {
                userId,
                workspaceId
            },
            orderBy: { createdAt: 'desc' },
            take: parseInt(limit),
            skip: parseInt(offset)
        });

        const total = await prisma.notification.count({
            where: { userId, workspaceId }
        });

        res.json({ notifications, total });
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
};

// Get unread count
export const getUnreadCount = async (req, res) => {
    try {
        const userId = req.user.id;
        const { workspaceId } = req.params;

        const count = await prisma.notification.count({
            where: {
                userId,
                workspaceId,
                isRead: false
            }
        });

        res.json({ count });
    } catch (error) {
        console.error('Error fetching unread count:', error);
        res.status(500).json({ error: 'Failed to fetch unread count' });
    }
};

// Mark single notification as read
export const markAsRead = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        await prisma.notification.updateMany({
            where: { id, userId },
            data: { isRead: true }
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({ error: 'Failed to mark as read' });
    }
};

// Mark all notifications as read
export const markAllAsRead = async (req, res) => {
    try {
        const userId = req.user.id;
        const { workspaceId } = req.params;

        await prisma.notification.updateMany({
            where: { userId, workspaceId, isRead: false },
            data: { isRead: true }
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Error marking all as read:', error);
        res.status(500).json({ error: 'Failed to mark all as read' });
    }
};

// Delete all notifications for current user in workspace
export const deleteAllNotifications = async (req, res) => {
    try {
        const userId = req.user.id;
        const { workspaceId } = req.params;

        const result = await prisma.notification.deleteMany({
            where: { userId, workspaceId }
        });

        res.json({ success: true, deleted: result.count });
    } catch (error) {
        console.error('Error deleting notifications:', error);
        res.status(500).json({ error: 'Failed to delete notifications' });
    }
};

// Helper: Create notification and emit via socket
export const createNotification = async (workspaceId, userId, type, title, body, data = null) => {
    try {
        const notification = await prisma.notification.create({
            data: {
                workspaceId,
                userId,
                type,
                title,
                body,
                data: data ? JSON.stringify(data) : null
            }
        });

        // Emit real-time notification to the user via workspace socket
        emitToWorkspace(workspaceId, 'new_notification', {
            notification,
            targetUserId: userId
        });

        console.log(`🔔 [Notification] Created for user ${userId}: ${title}`);
        return notification;
    } catch (error) {
        console.error('❌ [Notification] Error creating notification:', error);
        return null;
    }
};

// Helper: Create notifications for all members of a team
export const createTeamNotifications = async (workspaceId, teamId, type, title, body, data = null) => {
    try {
        // Get all members of the team
        const teamMembers = await prisma.teamMember.findMany({
            where: { teamId },
            select: { userId: true }
        });

        if (teamMembers.length === 0) return [];

        const notifications = [];
        for (const member of teamMembers) {
            if (!member.userId) continue; // Skip bots/agents without a user account
            const notif = await createNotification(workspaceId, member.userId, type, title, body, data);
            if (notif) notifications.push(notif);
        }

        console.log(`🔔 [Notification] Created ${notifications.length} team notifications for team ${teamId}`);
        return notifications;
    } catch (error) {
        console.error('❌ [Notification] Error creating team notifications:', error);
        return [];
    }
};
