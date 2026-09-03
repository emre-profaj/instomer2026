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
// Kullanıcının bildirim tercihlerini kontrol eder + WhatsApp/Email bildirim gönderir
export const createNotification = async (workspaceId, userId, type, title, body, data = null) => {
    try {
        // Kullanıcının tercihlerini kontrol et
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { notificationPreferences: true, email: true }
        });

        const prefs = user?.notificationPreferences || { assignment: true, newRequest: true, dealStage: true, fbLead: true };

        // Tercih kontrolü — type'a göre
        if (type === 'CONVERSATION_ASSIGNED' && prefs.assignment === false) return null;
        if (['NEW_MESSAGE', 'BOT_ROUTING'].includes(type) && prefs.newRequest === false) return null;
        if (type === 'DEAL_STAGE_CHANGED' && prefs.dealStage === false) return null;
        if (type === 'FB_LEAD' && prefs.fbLead === false) return null;

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

        // E-posta bildirim gönder (isteğe bağlı)
        if (prefs.emailEnabled) {
            try {
                const recipientEmails = new Set();

                // 1. Kullanıcının hesap e-postası
                if (user?.email && user.email.includes('@')) {
                    recipientEmails.add(user.email.trim().toLowerCase());
                }

                // 2. Manuel girilen ek bildirim e-postası (virgül veya noktalı virgül ile birden fazla olabilir)
                if (prefs.notificationEmail) {
                    const customList = String(prefs.notificationEmail)
                        .split(/[,;]+/)
                        .map(e => e.trim().toLowerCase())
                        .filter(e => e && e.includes('@'));

                    for (const email of customList) {
                        recipientEmails.add(email);
                    }
                }

                const targetEmails = Array.from(recipientEmails);

                if (targetEmails.length > 0) {
                    const { sendSystemEmail } = await import('../services/systemEmail.service.js');
                    const emailBody = `
                        <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px;border:1px solid #eaeaea;border-radius:10px;">
                            <h2 style="color:#1a1a2e;font-size:18px;margin-top:0;">🔔 ${title}</h2>
                            <p style="color:#4b5563;font-size:15px;line-height:1.6;">${body}</p>
                            <hr style="border:none;border-top:1px solid #f3f4f6;margin:24px 0;">
                            <p style="color:#9ca3af;font-size:12px;margin-bottom:0;">Bu bildirimi Instomer panelindeki <strong>Ayarlar → Bildirim Ayarları</strong> menüsünden yönetebilirsiniz.</p>
                        </div>
                    `;
                    // Instomer sistem mailinden alıcıların mailine gönder
                    await sendSystemEmail(targetEmails, `Instomer Bildirimi: ${title}`, emailBody, { isHtml: true });
                    console.log(`📧 [Notification] System email sent to [${targetEmails.join(', ')}]: ${title}`);
                }
            } catch (emailErr) {
                console.error('❌ [Notification] System email send error:', emailErr.message);
            }
        }

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

// GET /:workspaceId/preferences — Kullanıcının bildirim tercihlerini getir
export const getNotificationPreferences = async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { notificationPreferences: true }
        });

        const defaults = {
            assignment: true,
            newRequest: true,
            dealStage: true,
            fbLead: true,
            whatsappEnabled: false,
            whatsappPhone: '',
            emailEnabled: false,
            notificationEmail: ''
        };
        const prefs = user?.notificationPreferences || defaults;

        res.json({ preferences: { ...defaults, ...prefs } });
    } catch (error) {
        console.error('Error getting notification preferences:', error);
        res.status(500).json({ error: 'Tercihler alınamadı' });
    }
};

// PUT /:workspaceId/preferences — Kullanıcının bildirim tercihlerini güncelle
export const updateNotificationPreferences = async (req, res) => {
    try {
        const userId = req.user.id;
        const { assignment, newRequest, dealStage, fbLead, whatsappEnabled, whatsappPhone, emailEnabled, notificationEmail } = req.body;

        const prefs = {
            assignment: assignment !== false,
            newRequest: newRequest !== false,
            dealStage: dealStage !== false,
            fbLead: fbLead !== false,
            whatsappEnabled: whatsappEnabled === true,
            whatsappPhone: whatsappPhone || '',
            emailEnabled: emailEnabled === true,
            notificationEmail: notificationEmail ? String(notificationEmail).trim() : ''
        };

        await prisma.user.update({
            where: { id: userId },
            data: { notificationPreferences: prefs }
        });

        res.json({ success: true, preferences: prefs });
    } catch (error) {
        console.error('Error updating notification preferences:', error);
        res.status(500).json({ error: 'Tercihler güncellenemedi' });
    }
};
