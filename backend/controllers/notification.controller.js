import prisma from '../lib/prisma.js';
import { emitToWorkspace, emitToUser } from '../socket.js';


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

// Get notifications across ALL workspaces for current user
export const getAllUserNotifications = async (req, res) => {
    try {
        const userId = req.user.id;
        const { limit = 50, offset = 0 } = req.query;

        const notifications = await prisma.notification.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: parseInt(limit),
            skip: parseInt(offset),
            include: {
                user: false
            }
        });

        // Fetch workspace names for the notifications
        const workspaceIds = [...new Set(notifications.map(n => n.workspaceId))];
        const workspaces = await prisma.workspace.findMany({
            where: { id: { in: workspaceIds } },
            select: { id: true, name: true }
        });
        const workspaceMap = Object.fromEntries(workspaces.map(w => [w.id, w.name]));

        // Attach workspace name to each notification
        const enrichedNotifications = notifications.map(n => ({
            ...n,
            workspaceName: workspaceMap[n.workspaceId] || 'Bilinmeyen'
        }));

        const total = await prisma.notification.count({
            where: { userId }
        });

        // Also compute total unread across all workspaces
        const totalUnread = await prisma.notification.count({
            where: { userId, isRead: false }
        });

        res.json({ notifications: enrichedNotifications, total, totalUnread });
    } catch (error) {
        console.error('Error fetching all user notifications:', error);
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
    // userId null/undefined olabiliyor: havuzdaki (kimseye atanmamış) randevu
    // hatırlatıcıları buraya assignedToId=null ile geliyordu ve
    // prisma.user.findUnique({ where: { id: undefined } }) çağrısı
    // PrismaClientValidationError fırlatıyordu. Sessizce atla.
    if (!userId) {
        console.warn('⚠️ [Notification] userId yok — bildirim atlandı:', type || '');
        return null;
    }

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

        // Emit real-time notification to the user via user room (workspace-agnostic)
        emitToUser(userId, 'new_notification', {
            notification,
            targetUserId: userId
        });

        // E-posta bildirim gönder (isteğe bağlı)
        if (prefs.emailEnabled) {
            try {
                // Manuel adres alanı doluysa YALNIZCA oraya gider; hesap
                // e-postası eklenmez. Önceden ikisine birden gidiyordu ve
                // kullanıcı istemediği adresi listeden çıkaramıyordu.
                const manuelListe = String(prefs.notificationEmail || '')
                    .split(/[,;]+/)
                    .map(e => e.trim().toLowerCase())
                    .filter(e => e && e.includes('@'));

                const targetEmails = manuelListe.length > 0
                    ? Array.from(new Set(manuelListe))
                    : (user?.email && user.email.includes('@') ? [user.email.trim().toLowerCase()] : []);

                if (targetEmails.length > 0) {
                    const { sendSystemEmail } = await import('../services/systemEmail.service.js');
                    const { bildirimMaili } = await import('../utils/emailTemplate.js');

                    const panelUrl = process.env.FRONTEND_URL || 'https://app.instomer.com';
                    const emailBody = bildirimMaili({
                        baslik: title,
                        ozet: body,
                        butonMetni: 'Panelde aç',
                        butonUrl: panelUrl
                    });
                    // Konu satırındaki emoji istemcilerde çöp karakter olabiliyor;
                    // şablon başlığı zaten temizliyor, konuyu da sade tutuyoruz.
                    const konu = String(title || 'Bildirim')
                        .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
                        .replace(/\s+/g, ' ')
                        .trim();
                    await sendSystemEmail(targetEmails, `Instomer · ${konu}`, emailBody, { isHtml: true });
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
