import prisma from '../lib/prisma.js';
import { GoogleGenerativeAI } from '@google/generative-ai';


// Helper to get effective AI API key
const getEffectiveAiApiKey = async (workspaceId) => {
    const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { aiApiKey: true }
    });
    if (workspace?.aiApiKey) return workspace.aiApiKey;
    const globalSettings = await prisma.globalSettings.findUnique({ where: { id: 'singleton' } });
    if (globalSettings?.globalAiApiKey) return globalSettings.globalAiApiKey;
    return null;
};

// ========== ALL CALLABLE FUNCTIONS ==========

const dataFunctions = {

    // ───────── KİŞİLER / CONTACTS ─────────

    searchContacts: async (workspaceId, { query, limit = 10 }) => {
        const contacts = await prisma.contact.findMany({
            where: {
                workspaceId,
                OR: [
                    { name: { contains: query, mode: 'insensitive' } },
                    { fullName: { contains: query, mode: 'insensitive' } },
                    { phone: { contains: query } },
                    { email: { contains: query, mode: 'insensitive' } },
                    { company: { contains: query, mode: 'insensitive' } },
                    { notes: { contains: query, mode: 'insensitive' } }
                ]
            },
            select: { id: true, name: true, phone: true, email: true, source: true, category: true, status: true, company: true, notes: true, tags: true, createdAt: true, isArchived: true, isBlocked: true },
            take: limit,
            orderBy: { createdAt: 'desc' }
        });
        return contacts.length > 0 ? contacts : 'Sonuç bulunamadı.';
    },

    getContactStats: async (workspaceId, { source, category, startDate, endDate }) => {
        const where = { workspaceId };
        if (source) where.source = source;
        if (category) where.category = category;
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = new Date(startDate);
            if (endDate) { const ed = new Date(endDate); ed.setHours(23, 59, 59, 999); where.createdAt.lte = ed; }
        }
        const contacts = await prisma.contact.findMany({ where, select: { source: true, category: true } });
        const bySource = {}, byCategory = {};
        contacts.forEach(c => {
            bySource[c.source || 'UNKNOWN'] = (bySource[c.source || 'UNKNOWN'] || 0) + 1;
            byCategory[c.category || 'NEW'] = (byCategory[c.category || 'NEW'] || 0) + 1;
        });
        return { total: contacts.length, bySource, byCategory };
    },

    // ───────── ARAMALAR / CALLS ─────────

    getCallStats: async (workspaceId, { startDate, endDate }) => {
        const where = { workspaceId };
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = new Date(startDate);
            if (endDate) { const ed = new Date(endDate); ed.setHours(23, 59, 59, 999); where.createdAt.lte = ed; }
        }
        const calls = await prisma.retellCall.findMany({
            where,
            select: { status: true, direction: true, duration: true, toNumber: true, fromNumber: true, summary: true, sentiment: true, callSuccessful: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
            take: 50
        });
        return {
            total: calls.length,
            outbound: calls.filter(c => c.direction === 'outbound').length,
            inbound: calls.filter(c => c.direction === 'inbound').length,
            answered: calls.filter(c => ['ended', 'completed'].includes(c.status)).length,
            missed: calls.filter(c => ['no-answer', 'busy', 'failed'].includes(c.status)).length,
            avgDuration: calls.length > 0 ? Math.round(calls.reduce((s, c) => s + (c.duration || 0), 0) / calls.length) : 0,
            successful: calls.filter(c => c.callSuccessful).length,
            recentCalls: calls.slice(0, 10).map(c => ({
                to: c.toNumber, from: c.fromNumber, status: c.status, duration: c.duration,
                summary: c.summary?.substring(0, 150), sentiment: c.sentiment, date: c.createdAt
            }))
        };
    },

    getScheduledCalls: async (workspaceId, { status }) => {
        const where = { workspaceId };
        if (status) where.status = status;
        const calls = await prisma.scheduledCall.findMany({
            where,
            orderBy: { scheduledAt: 'asc' },
            take: 20
        });
        return calls;
    },

    // ───────── MESAJLAR / MESSAGES ─────────

    getMessageStats: async (workspaceId, { startDate, endDate, channel }) => {
        const where = { conversation: { workspaceId } };
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = new Date(startDate);
            if (endDate) { const ed = new Date(endDate); ed.setHours(23, 59, 59, 999); where.createdAt.lte = ed; }
        }
        if (channel) where.conversation.channel = channel;
        const messages = await prisma.message.findMany({ where, select: { messageType: true, isFromContact: true } });
        const byChannel = {};
        messages.forEach(m => { byChannel[m.messageType || 'OTHER'] = (byChannel[m.messageType || 'OTHER'] || 0) + 1; });
        return {
            total: messages.length,
            fromCustomers: messages.filter(m => m.isFromContact).length,
            fromAgents: messages.filter(m => !m.isFromContact).length,
            byChannel
        };
    },

    // ───────── SOHBETLER / CONVERSATIONS ─────────

    getConversationStats: async (workspaceId, { status, channel, startDate, endDate }) => {
        const where = { workspaceId };
        if (status) where.status = status;
        if (channel) where.channel = channel;
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = new Date(startDate);
            if (endDate) { const ed = new Date(endDate); ed.setHours(23, 59, 59, 999); where.createdAt.lte = ed; }
        }
        const conversations = await prisma.conversation.findMany({ where, select: { channel: true, status: true } });
        const byChannel = {}, byStatus = {};
        conversations.forEach(c => {
            byChannel[c.channel || 'OTHER'] = (byChannel[c.channel || 'OTHER'] || 0) + 1;
            byStatus[c.status || 'UNKNOWN'] = (byStatus[c.status || 'UNKNOWN'] || 0) + 1;
        });
        return { total: conversations.length, byChannel, byStatus };
    },

    getRecentConversations: async (workspaceId, { limit = 10, channel, status }) => {
        const where = { workspaceId };
        if (channel) where.channel = channel;
        if (status) where.status = status;
        const conversations = await prisma.conversation.findMany({
            where,
            include: {
                contact: { select: { name: true, phone: true, email: true } },
                assignedTo: { select: { name: true } }
            },
            orderBy: { lastMessageAt: 'desc' },
            take: limit
        });
        return conversations.map(c => ({
            channel: c.channel, status: c.status,
            contact: c.contact?.name || 'Bilinmeyen',
            contactPhone: c.contact?.phone,
            contactEmail: c.contact?.email,
            assignedTo: c.assignedTo?.name || 'Atanmamış',
            topic: c.aiTopic,
            lastMessage: c.lastMessageAt,
            unread: c.unreadCount
        }));
    },

    // ───────── AGENT PERFORMANSI ─────────

    getAgentPerformance: async (workspaceId, { }) => {
        const members = await prisma.workspaceMember.findMany({
            where: { workspaceId },
            include: { user: { select: { id: true, name: true, isOnline: true, lastSeenAt: true } } }
        });
        const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const results = [];
        for (const m of members) {
            if (!m.user?.id) continue;
            const msgCount = await prisma.message.count({
                where: { conversation: { workspaceId, assignedToId: m.user.id }, isFromContact: false, createdAt: { gte: monthStart } }
            });
            const openConvs = await prisma.conversation.count({ where: { workspaceId, assignedToId: m.user.id, status: 'OPEN' } });
            const totalConvs = await prisma.conversation.count({ where: { workspaceId, assignedToId: m.user.id } });
            results.push({
                name: m.user.name, role: m.role, isOnline: m.user.isOnline,
                lastSeen: m.user.lastSeenAt, messagesThisMonth: msgCount,
                openConversations: openConvs, totalConversations: totalConvs
            });
        }
        return results;
    },

    // ───────── SATIŞ / DEALS ─────────

    getDealStats: async (workspaceId, { stage, status, startDate, endDate }) => {
        const where = { workspaceId };
        if (stage) where.stage = stage;
        if (status) where.status = status;
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = new Date(startDate);
            if (endDate) { const ed = new Date(endDate); ed.setHours(23, 59, 59, 999); where.createdAt.lte = ed; }
        }
        const deals = await prisma.deal.findMany({
            where,
            select: { title: true, amount: true, currency: true, stage: true, status: true, quoteNumber: true, orderNumber: true, invoiceNumber: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
            take: 20
        });
        const totalAmount = deals.reduce((s, d) => s + (d.amount || 0), 0);
        const byStage = {};
        deals.forEach(d => {
            if (!byStage[d.stage]) byStage[d.stage] = { count: 0, total: 0 };
            byStage[d.stage].count++;
            byStage[d.stage].total += d.amount || 0;
        });
        return { total: deals.length, totalAmount, byStage, recentDeals: deals.slice(0, 5) };
    },

    // ───────── FORMLAR ─────────

    getFormSubmissions: async (workspaceId, { startDate, endDate, limit = 10 }) => {
        const where = { workspaceId };
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = new Date(startDate);
            if (endDate) { const ed = new Date(endDate); ed.setHours(23, 59, 59, 999); where.createdAt.lte = ed; }
        }
        const submissions = await prisma.formSubmission.findMany({
            where,
            select: { name: true, email: true, phone: true, message: true, status: true, source: true, createdAt: true },
            orderBy: { createdAt: 'desc' }, take: limit
        });
        const totalAll = await prisma.formSubmission.count({ where: { workspaceId } });
        return { totalAll, returned: submissions.length, submissions };
    },

    getFormWebhooks: async (workspaceId, { }) => {
        const forms = await prisma.formWebhook.findMany({
            where: { workspaceId },
            select: { name: true, siteUrl: true, webhookUrl: true, isActive: true, createdAt: true }
        });
        return forms;
    },

    // ───────── TAKVİM / RANDEVULAR ─────────

    getAppointments: async (workspaceId, { startDate, endDate, status }) => {
        const where = { workspaceId };
        if (status) where.status = status;
        if (startDate || endDate) {
            where.startTime = {};
            if (startDate) where.startTime.gte = new Date(startDate);
            if (endDate) where.startTime.lte = new Date(endDate);
        }
        const appointments = await prisma.appointment.findMany({
            where,
            select: { title: true, description: true, startTime: true, endTime: true, contactName: true, contactPhone: true, status: true, notes: true },
            orderBy: { startTime: 'asc' },
            take: 20
        });
        return appointments;
    },

    // ───────── TAKIMLAR / TEAMS ─────────

    getTeams: async (workspaceId, { }) => {
        const teams = await prisma.team.findMany({
            where: { workspaceId },
            include: {
                members: {
                    include: {
                        user: { select: { name: true, isOnline: true } },
                        bot: { select: { name: true, isActive: true } }
                    }
                }
            }
        });
        return teams.map(t => ({
            name: t.name, description: t.description, color: t.color,
            memberCount: t.members.length,
            members: t.members.map(m => ({
                name: m.user?.name || m.bot?.name || 'Bilinmeyen',
                type: m.user ? 'Agent' : 'Bot',
                isOnline: m.user?.isOnline,
                role: m.role
            }))
        }));
    },

    // ───────── OTOMASYON ─────────

    getAutomations: async (workspaceId, { }) => {
        const automations = await prisma.automation.findMany({
            where: { workspaceId },
            select: { name: true, description: true, isActive: true, trigger: true, triggerChannel: true, action: true, delayMinutes: true, createdAt: true }
        });
        return {
            total: automations.length,
            active: automations.filter(a => a.isActive).length,
            inactive: automations.filter(a => !a.isActive).length,
            automations
        };
    },

    // ───────── AI BOTLAR ─────────

    getBots: async (workspaceId, { }) => {
        const bots = await prisma.aIBot.findMany({
            where: { workspaceId },
            select: {
                name: true, role: true, isActive: true, botType: true,
                whatsappEnabled: true, facebookEnabled: true, instagramEnabled: true, widgetEnabled: true,
                schedulerEnabled: true, scheduleStartTime: true, scheduleEndTime: true,
                routingEnabled: true, createdAt: true
            }
        });
        return bots;
    },

    // ───────── WHATSAPP ŞABLONLARI ─────────

    getWhatsappTemplates: async (workspaceId, { status }) => {
        const where = { workspaceId };
        if (status) where.status = status;
        const templates = await prisma.whatsappTemplate.findMany({
            where,
            select: { name: true, language: true, category: true, status: true, bodyText: true, createdAt: true },
            orderBy: { createdAt: 'desc' }
        });
        return templates;
    },

    // ───────── FACEBOOK LEADLER ─────────

    getFacebookLeads: async (workspaceId, { startDate, endDate, status, limit = 20 }) => {
        const where = { workspaceId };
        if (status) where.status = status;
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = new Date(startDate);
            if (endDate) { const ed = new Date(endDate); ed.setHours(23, 59, 59, 999); where.createdAt.lte = ed; }
        }
        const leads = await prisma.facebookLead.findMany({
            where,
            select: { name: true, email: true, phone: true, formName: true, campaignName: true, status: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
            take: limit
        });
        const totalAll = await prisma.facebookLead.count({ where: { workspaceId } });
        return { totalAll, returned: leads.length, leads };
    },

    // ───────── KANALLAR / CHANNELS ─────────

    getChannels: async (workspaceId, { }) => {
        const [whatsapp, facebook, email, widgets] = await Promise.all([
            prisma.whatsappPhoneNumber.findMany({ where: { workspaceId }, select: { displayPhoneNumber: true, name: true, createdAt: true } }),
            prisma.facebookPage.findMany({ where: { workspaceId }, select: { pageName: true, instagramUsername: true, createdAt: true } }),
            prisma.emailChannel.findMany({ where: { workspaceId }, select: { email: true, provider: true, isActive: true, createdAt: true } }),
            prisma.webWidget.findMany({ where: { workspaceId }, select: { name: true, title: true, isActive: true, siteUrl: true, createdAt: true } })
        ]);
        return {
            whatsapp: { count: whatsapp.length, numbers: whatsapp },
            facebook: { count: facebook.length, pages: facebook },
            email: { count: email.length, channels: email },
            webWidget: { count: widgets.length, widgets: widgets }
        };
    },

    // ───────── WORKSPACE BİLGİSİ ─────────

    getWorkspaceInfo: async (workspaceId, { }) => {
        const ws = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: {
                name: true, slug: true, description: true,
                companyName: true, companyDescription: true, companyAddress: true,
                companyPhone: true, companyEmail: true, companyWebsite: true, companyWorkingHours: true,
                retellAutoCallEnabled: true, retellAutoCallTriggers: true,
                aiSubscriptionType: true, dailyAiChatLimit: true, dailyAiChatCount: true,
                createdAt: true
            }
        });
        const memberCount = await prisma.workspaceMember.count({ where: { workspaceId } });
        const contactCount = await prisma.contact.count({ where: { workspaceId } });
        const conversationCount = await prisma.conversation.count({ where: { workspaceId } });
        return { ...ws, memberCount, contactCount, conversationCount };
    },

    // ───────── HAZIR MESAJLAR ─────────

    getQuickReplies: async (workspaceId, { }) => {
        const replies = await prisma.quickReply.findMany({
            where: { workspaceId },
            select: { title: true, content: true, shortcut: true, createdAt: true }
        });
        return replies;
    },

    // ───────── BİLGİ BANKASI ─────────

    getKnowledgeBase: async (workspaceId, { query }) => {
        const where = { workspaceId };
        if (query) {
            where.OR = [
                { title: { contains: query, mode: 'insensitive' } },
                { content: { contains: query, mode: 'insensitive' } }
            ];
        }
        const entries = await prisma.knowledgeBase.findMany({
            where,
            select: { title: true, sourceType: true, filename: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
            take: 20
        });
        const total = await prisma.knowledgeBase.count({ where: { workspaceId } });
        return { total, entries };
    },

    // ───────── BİLDİRİMLER ─────────

    getNotifications: async (workspaceId, { limit = 10 }) => {
        // Get workspace member user IDs, then get their notifications
        const members = await prisma.workspaceMember.findMany({ where: { workspaceId }, select: { userId: true } });
        const userIds = members.map(m => m.userId);
        const notifications = await prisma.notification.findMany({
            where: { userId: { in: userIds } },
            select: { type: true, title: true, message: true, isRead: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
            take: limit
        });
        return notifications;
    },

    // ───────── KANAL YÖNLENDİRME ─────────

    getChannelRoutings: async (workspaceId, { }) => {
        const routings = await prisma.channelRouting.findMany({
            where: { workspaceId },
            include: { team: { select: { name: true } } }
        });
        return routings.map(r => ({
            channel: r.channel,
            team: r.team?.name,
            botEnabled: r.botEnabled,
            botDelay: r.botDelay,
            isActive: r.isActive
        }));
    },

    // ───────── DAVETKLER ─────────

    getInvitations: async (workspaceId, { }) => {
        const invitations = await prisma.invitation.findMany({
            where: { workspaceId },
            select: { email: true, role: true, status: true, expiresAt: true, createdAt: true }
        });
        return invitations;
    },

    // ───────── MESAJ ARAMA ─────────

    searchMessages: async (workspaceId, { query, limit = 15 }) => {
        const messages = await prisma.message.findMany({
            where: {
                conversation: { workspaceId },
                content: { contains: query, mode: 'insensitive' }
            },
            select: {
                content: true, isFromContact: true, createdAt: true, messageType: true,
                conversation: {
                    select: { channel: true, contact: { select: { name: true, phone: true } } }
                }
            },
            orderBy: { createdAt: 'desc' },
            take: limit
        });
        return {
            total: messages.length, messages: messages.map(m => ({
                content: m.content.substring(0, 200),
                from: m.isFromContact ? (m.conversation?.contact?.name || 'Müşteri') : 'Agent',
                contactPhone: m.conversation?.contact?.phone,
                channel: m.conversation?.channel,
                type: m.messageType,
                date: m.createdAt
            }))
        };
    },

    // ───────── SOHBET MESAJLARI ─────────

    getConversationMessages: async (workspaceId, { contactName, contactPhone, limit = 20 }) => {
        const where = { workspaceId };
        if (contactName) where.contact = { name: { contains: contactName, mode: 'insensitive' } };
        if (contactPhone) where.contact = { ...where.contact, phone: { contains: contactPhone } };

        const conversation = await prisma.conversation.findFirst({
            where,
            orderBy: { lastMessageAt: 'desc' },
            include: {
                contact: { select: { name: true, phone: true } },
                messages: {
                    select: { content: true, isFromContact: true, messageType: true, createdAt: true },
                    orderBy: { createdAt: 'desc' },
                    take: limit
                }
            }
        });

        if (!conversation) return 'Sohbet bulunamadı.';
        return {
            contact: conversation.contact?.name,
            contactPhone: conversation.contact?.phone,
            channel: conversation.channel,
            status: conversation.status,
            messages: conversation.messages.reverse().map(m => ({
                from: m.isFromContact ? 'Müşteri' : 'Agent',
                content: m.content.substring(0, 300),
                type: m.messageType,
                date: m.createdAt
            }))
        };
    },

    // ───────── KİŞİNİN SOHBETLERİ ─────────

    getContactConversations: async (workspaceId, { contactName, contactPhone }) => {
        const where = { workspaceId };
        if (contactName) where.contact = { name: { contains: contactName, mode: 'insensitive' } };
        if (contactPhone) where.contact = { ...where.contact, phone: { contains: contactPhone } };

        const conversations = await prisma.conversation.findMany({
            where,
            include: {
                contact: { select: { name: true, phone: true } },
                assignedTo: { select: { name: true } }
            },
            orderBy: { lastMessageAt: 'desc' },
            take: 10
        });
        return conversations.map(c => ({
            channel: c.channel, status: c.status,
            contact: c.contact?.name, contactPhone: c.contact?.phone,
            assignedTo: c.assignedTo?.name || 'Atanmamış',
            topic: c.aiTopic, summary: c.aiSummary,
            unread: c.unreadCount, lastMessage: c.lastMessageAt
        }));
    },

    // ───────── KİŞİNİN SATIŞLARI ─────────

    getContactDeals: async (workspaceId, { contactName, contactPhone }) => {
        const contactWhere = { workspaceId };
        if (contactName) contactWhere.name = { contains: contactName, mode: 'insensitive' };
        if (contactPhone) contactWhere.phone = { contains: contactPhone };

        const contact = await prisma.contact.findFirst({
            where: contactWhere,
            include: {
                deals: {
                    select: { title: true, amount: true, currency: true, stage: true, status: true, quoteNumber: true, orderNumber: true, invoiceNumber: true, createdAt: true }
                }
            }
        });
        if (!contact) return 'Kişi bulunamadı.';
        return { contact: contact.name, phone: contact.phone, deals: contact.deals };
    },

    // ───────── SOHBET TRANSFERLERİ ─────────

    getConversationTransfers: async (workspaceId, { limit = 20 }) => {
        const conversations = await prisma.conversation.findMany({ where: { workspaceId }, select: { id: true } });
        const convIds = conversations.map(c => c.id);

        const transfers = await prisma.conversationTransfer.findMany({
            where: { conversationId: { in: convIds } },
            include: {
                fromUser: { select: { name: true } },
                toUser: { select: { name: true } },
                team: { select: { name: true } }
            },
            orderBy: { createdAt: 'desc' },
            take: limit
        });
        return transfers.map(t => ({
            from: t.fromUser?.name, to: t.toUser?.name || t.team?.name,
            note: t.note, status: t.status, date: t.createdAt
        }));
    },

    // ───────── DAHİLİ NOTLAR ─────────

    getInternalNotes: async (workspaceId, { contactName, contactPhone, limit = 10 }) => {
        const convWhere = { workspaceId };
        if (contactName) convWhere.contact = { name: { contains: contactName, mode: 'insensitive' } };
        if (contactPhone) convWhere.contact = { ...convWhere.contact, phone: { contains: contactPhone } };

        const conversations = await prisma.conversation.findMany({ where: convWhere, select: { id: true } });
        const convIds = conversations.map(c => c.id);

        const notes = await prisma.internalNote.findMany({
            where: { conversationId: { in: convIds } },
            include: { user: { select: { name: true } } },
            orderBy: { createdAt: 'desc' },
            take: limit
        });
        return notes.map(n => ({ author: n.user?.name, content: n.content, date: n.createdAt }));
    },

    // ───────── ARAMA TRANSKRİPTİ ─────────

    getCallTranscript: async (workspaceId, { phoneNumber, limit = 1 }) => {
        const where = { workspaceId };
        if (phoneNumber) {
            where.OR = [
                { toNumber: { contains: phoneNumber } },
                { fromNumber: { contains: phoneNumber } }
            ];
        }
        const calls = await prisma.retellCall.findMany({
            where,
            select: { toNumber: true, fromNumber: true, transcript: true, summary: true, sentiment: true, duration: true, status: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
            take: limit
        });
        return calls.map(c => ({
            to: c.toNumber, from: c.fromNumber,
            transcript: c.transcript?.substring(0, 2000),
            summary: c.summary, sentiment: c.sentiment,
            duration: c.duration, status: c.status, date: c.createdAt
        }));
    },

    // ───────── ENGELLİ KİŞİLER ─────────

    getBlockedContacts: async (workspaceId, { }) => {
        const blocked = await prisma.contact.findMany({
            where: { workspaceId, isBlocked: true },
            select: { name: true, phone: true, email: true, blockedReason: true, blockedAt: true }
        });
        return { total: blocked.length, contacts: blocked };
    },

    // ───────── ARŞİVLENMİŞ KİŞİLER ─────────

    getArchivedContacts: async (workspaceId, { limit = 20 }) => {
        const archived = await prisma.contact.findMany({
            where: { workspaceId, isArchived: true },
            select: { name: true, phone: true, email: true, archivedAt: true, source: true },
            take: limit
        });
        return { total: archived.length, contacts: archived };
    },

    // ───────── AGENT ÇALIŞMA SAATLERİ ─────────

    getUserSchedules: async (workspaceId, { }) => {
        const members = await prisma.workspaceMember.findMany({
            where: { workspaceId },
            include: {
                user: {
                    select: {
                        name: true,
                        schedules: { select: { dayOfWeek: true, startTime: true, endTime: true, isActive: true } }
                    }
                }
            }
        });
        const days = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
        return members.map(m => ({
            name: m.user?.name,
            schedules: m.user?.schedules?.map(s => ({
                day: days[s.dayOfWeek], start: s.startTime, end: s.endTime, active: s.isActive
            })) || []
        }));
    },

    // ───────── GÜNLÜK TREND ─────────

    getDailyTrend: async (workspaceId, { metric, days = 7 }) => {
        const results = [];
        for (let i = days - 1; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const start = new Date(date); start.setHours(0, 0, 0, 0);
            const end = new Date(date); end.setHours(23, 59, 59, 999);
            const dateStr = start.toISOString().split('T')[0];

            let count = 0;
            switch (metric) {
                case 'contacts':
                    count = await prisma.contact.count({ where: { workspaceId, createdAt: { gte: start, lte: end } } });
                    break;
                case 'messages':
                    count = await prisma.message.count({ where: { conversation: { workspaceId }, createdAt: { gte: start, lte: end } } });
                    break;
                case 'conversations':
                    count = await prisma.conversation.count({ where: { workspaceId, createdAt: { gte: start, lte: end } } });
                    break;
                case 'calls':
                    count = await prisma.retellCall.count({ where: { workspaceId, createdAt: { gte: start, lte: end } } });
                    break;
                case 'forms':
                    count = await prisma.formSubmission.count({ where: { workspaceId, createdAt: { gte: start, lte: end } } });
                    break;
                default:
                    count = await prisma.message.count({ where: { conversation: { workspaceId }, createdAt: { gte: start, lte: end } } });
            }
            results.push({ date: dateStr, count });
        }
        return results;
    },

    // ───────── EN AKTİF KİŞİLER ─────────

    getTopActiveContacts: async (workspaceId, { limit = 10 }) => {
        const contacts = await prisma.contact.findMany({
            where: { workspaceId },
            include: {
                conversations: { select: { id: true, channel: true, status: true, _count: { select: { messages: true } } } }
            },
            orderBy: { updatedAt: 'desc' },
            take: 50
        });
        const ranked = contacts.map(c => ({
            name: c.name, phone: c.phone, email: c.email, source: c.source,
            totalConversations: c.conversations.length,
            totalMessages: c.conversations.reduce((s, cv) => s + cv._count.messages, 0),
            channels: [...new Set(c.conversations.map(cv => cv.channel))]
        })).sort((a, b) => b.totalMessages - a.totalMessages).slice(0, limit);
        return ranked;
    },

    // ───────── ATANMAMIŞ SOHBETLER ─────────

    getUnassignedConversations: async (workspaceId, { limit = 15 }) => {
        const conversations = await prisma.conversation.findMany({
            where: { workspaceId, assignedToId: null, status: 'OPEN' },
            include: { contact: { select: { name: true, phone: true } } },
            orderBy: { lastMessageAt: 'desc' },
            take: limit
        });
        return {
            total: conversations.length,
            conversations: conversations.map(c => ({
                contact: c.contact?.name || 'Bilinmeyen',
                contactPhone: c.contact?.phone,
                channel: c.channel, unread: c.unreadCount,
                lastMessage: c.lastMessageAt
            }))
        };
    },

    // ───────── SAATLİK DAĞILIM ─────────

    getHourlyDistribution: async (workspaceId, { metric = 'messages', startDate, endDate }) => {
        const where = metric === 'messages'
            ? { conversation: { workspaceId } }
            : { workspaceId };
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = new Date(startDate);
            if (endDate) { const ed = new Date(endDate); ed.setHours(23, 59, 59, 999); where.createdAt.lte = ed; }
        }

        const model = metric === 'messages' ? prisma.message : metric === 'calls' ? prisma.retellCall : prisma.conversation;
        const records = await model.findMany({ where, select: { createdAt: true } });

        const hourly = Array(24).fill(0);
        records.forEach(r => {
            const hour = new Date(r.createdAt).getHours();
            hourly[hour]++;
        });
        return hourly.map((count, hour) => ({ hour: `${hour.toString().padStart(2, '0')}:00`, count }));
    }
};

// ========== FUNCTION DECLARATIONS FOR GEMINI ==========
const functionDeclarations = [
    {
        name: 'searchContacts',
        description: 'Kişiler tablosunda isim, telefon, email, firma adı veya notlara göre arama yapar.',
        parameters: {
            type: 'OBJECT',
            properties: {
                query: { type: 'STRING', description: 'Aranacak metin (isim, telefon numarası, email, firma adı)' },
                limit: { type: 'NUMBER', description: 'Maksimum sonuç sayısı (varsayılan: 10)' }
            },
            required: ['query']
        }
    },
    {
        name: 'getContactStats',
        description: 'Kişi/lead istatistiklerini getirir. Kaynak (source) ve kategori bazlı filtreleme.',
        parameters: {
            type: 'OBJECT',
            properties: {
                source: { type: 'STRING', description: 'Kaynak: MANUAL, WHATSAPP, WEB_FORM, FACEBOOK_LEAD, INSTAGRAM' },
                category: { type: 'STRING', description: 'Kategori: NEW, CUSTOMER, OPPORTUNITY, VIP, SPAM, BLACKLIST, PARTNER' },
                startDate: { type: 'STRING', description: 'Başlangıç tarihi (ISO: 2026-02-26)' },
                endDate: { type: 'STRING', description: 'Bitiş tarihi' }
            }
        }
    },
    {
        name: 'getCallStats',
        description: 'AI arama istatistiklerini getirir (toplam, giden, gelen, cevaplanan, cevapsız, ortalama süre, son aramalar).',
        parameters: {
            type: 'OBJECT',
            properties: {
                startDate: { type: 'STRING', description: 'Başlangıç tarihi' },
                endDate: { type: 'STRING', description: 'Bitiş tarihi' }
            }
        }
    },
    {
        name: 'getScheduledCalls',
        description: 'Planlanmış/zamanlanmış aramaları getirir.',
        parameters: {
            type: 'OBJECT',
            properties: {
                status: { type: 'STRING', description: 'Durum filtresi: PENDING, COMPLETED, FAILED' }
            }
        }
    },
    {
        name: 'getMessageStats',
        description: 'Mesaj istatistiklerini getirir (toplam, müşteriden, agentten, kanal dağılımı).',
        parameters: {
            type: 'OBJECT',
            properties: {
                startDate: { type: 'STRING', description: 'Başlangıç tarihi' },
                endDate: { type: 'STRING', description: 'Bitiş tarihi' },
                channel: { type: 'STRING', description: 'Kanal filtresi' }
            }
        }
    },
    {
        name: 'getConversationStats',
        description: 'Sohbet/konuşma istatistiklerini getirir (kanal ve durum bazlı).',
        parameters: {
            type: 'OBJECT',
            properties: {
                status: { type: 'STRING', description: 'OPEN veya RESOLVED' },
                channel: { type: 'STRING', description: 'WHATSAPP, INSTAGRAM, FACEBOOK, EMAIL, FORM, WIDGET' },
                startDate: { type: 'STRING', description: 'Başlangıç tarihi' },
                endDate: { type: 'STRING', description: 'Bitiş tarihi' }
            }
        }
    },
    {
        name: 'getRecentConversations',
        description: 'Son konuşmaları kişi bilgileriyle birlikte listeler.',
        parameters: {
            type: 'OBJECT',
            properties: {
                limit: { type: 'NUMBER', description: 'Sonuç sayısı (varsayılan: 10)' },
                channel: { type: 'STRING', description: 'Kanal filtresi' },
                status: { type: 'STRING', description: 'Durum filtresi' }
            }
        }
    },
    {
        name: 'getAgentPerformance',
        description: 'Tüm agent/kullanıcıların performans metriklerini getirir (mesaj sayısı, açık sohbet, online durumu).',
        parameters: { type: 'OBJECT', properties: {} }
    },
    {
        name: 'getDealStats',
        description: 'Satış/teklif/sipariş/fatura istatistiklerini getirir.',
        parameters: {
            type: 'OBJECT',
            properties: {
                stage: { type: 'STRING', description: 'QUOTE, ORDER, INVOICE' },
                status: { type: 'STRING', description: 'OPEN, WON, LOST' },
                startDate: { type: 'STRING', description: 'Başlangıç tarihi' },
                endDate: { type: 'STRING', description: 'Bitiş tarihi' }
            }
        }
    },
    {
        name: 'getFormSubmissions',
        description: 'Web form gönderimlerini getirir (isim, email, telefon, mesaj).',
        parameters: {
            type: 'OBJECT',
            properties: {
                startDate: { type: 'STRING', description: 'Başlangıç tarihi' },
                endDate: { type: 'STRING', description: 'Bitiş tarihi' },
                limit: { type: 'NUMBER', description: 'Sonuç sayısı' }
            }
        }
    },
    {
        name: 'getFormWebhooks',
        description: 'Tanımlı web form webhook\'larını listeler.',
        parameters: { type: 'OBJECT', properties: {} }
    },
    {
        name: 'getAppointments',
        description: 'Takvim randevularını getirir.',
        parameters: {
            type: 'OBJECT',
            properties: {
                startDate: { type: 'STRING', description: 'Başlangıç tarihi' },
                endDate: { type: 'STRING', description: 'Bitiş tarihi' },
                status: { type: 'STRING', description: 'SCHEDULED, COMPLETED, CANCELLED, NO_SHOW' }
            }
        }
    },
    {
        name: 'getTeams',
        description: 'Tüm takımları ve üyelerini getirir.',
        parameters: { type: 'OBJECT', properties: {} }
    },
    {
        name: 'getAutomations',
        description: 'Otomasyon kurallarını listeler (aktif/pasif, tetikleyici, aksiyon bilgisi).',
        parameters: { type: 'OBJECT', properties: {} }
    },
    {
        name: 'getBots',
        description: 'AI botları ve yapılandırmalarını listeler.',
        parameters: { type: 'OBJECT', properties: {} }
    },
    {
        name: 'getWhatsappTemplates',
        description: 'WhatsApp mesaj şablonlarını listeler.',
        parameters: {
            type: 'OBJECT',
            properties: {
                status: { type: 'STRING', description: 'APPROVED, PENDING, REJECTED' }
            }
        }
    },
    {
        name: 'getFacebookLeads',
        description: 'Facebook reklam leadlerini getirir.',
        parameters: {
            type: 'OBJECT',
            properties: {
                startDate: { type: 'STRING', description: 'Başlangıç tarihi' },
                endDate: { type: 'STRING', description: 'Bitiş tarihi' },
                status: { type: 'STRING', description: 'NEW, CONTACTED, CONVERTED' },
                limit: { type: 'NUMBER', description: 'Sonuç sayısı' }
            }
        }
    },
    {
        name: 'getChannels',
        description: 'Bağlı tüm kanalları getirir (WhatsApp numaraları, Facebook sayfaları, Email kanalları, Web Widget\'lar).',
        parameters: { type: 'OBJECT', properties: {} }
    },
    {
        name: 'getWorkspaceInfo',
        description: 'Workspace genel bilgilerini getirir (firma bilgileri, ayarlar, istatistik özeti).',
        parameters: { type: 'OBJECT', properties: {} }
    },
    {
        name: 'getQuickReplies',
        description: 'Hazır mesaj şablonlarını listeler.',
        parameters: { type: 'OBJECT', properties: {} }
    },
    {
        name: 'getKnowledgeBase',
        description: 'Bilgi bankası kayıtlarını arar ve listeler.',
        parameters: {
            type: 'OBJECT',
            properties: {
                query: { type: 'STRING', description: 'Arama terimi (başlık veya içerik)' }
            }
        }
    },
    {
        name: 'getNotifications',
        description: 'Son bildirimleri getirir.',
        parameters: {
            type: 'OBJECT',
            properties: {
                limit: { type: 'NUMBER', description: 'Sonuç sayısı (varsayılan: 10)' }
            }
        }
    },
    {
        name: 'getChannelRoutings',
        description: 'Kanal yönlendirme kurallarını getirir (hangi kanal hangi takıma).',
        parameters: { type: 'OBJECT', properties: {} }
    },
    {
        name: 'getInvitations',
        description: 'Workspace davetiyelerini listeler.',
        parameters: { type: 'OBJECT', properties: {} }
    },
    {
        name: 'searchMessages',
        description: 'Tüm mesajlar içinde metin araması yapar. İçerik, gönderen ve kanal bilgisiyle döner.',
        parameters: {
            type: 'OBJECT',
            properties: {
                query: { type: 'STRING', description: 'Aranacak metin' },
                limit: { type: 'NUMBER', description: 'Sonuç sayısı (varsayılan: 15)' }
            },
            required: ['query']
        }
    },
    {
        name: 'getConversationMessages',
        description: 'Belirli bir kişinin sohbet mesajlarını getirir. Kişi adı veya telefon ile aranır.',
        parameters: {
            type: 'OBJECT',
            properties: {
                contactName: { type: 'STRING', description: 'Kişi adı' },
                contactPhone: { type: 'STRING', description: 'Telefon numarası' },
                limit: { type: 'NUMBER', description: 'Mesaj sayısı (varsayılan: 20)' }
            }
        }
    },
    {
        name: 'getContactConversations',
        description: 'Bir kişinin tüm sohbetlerini listeler (tüm kanallar).',
        parameters: {
            type: 'OBJECT',
            properties: {
                contactName: { type: 'STRING', description: 'Kişi adı' },
                contactPhone: { type: 'STRING', description: 'Telefon numarası' }
            }
        }
    },
    {
        name: 'getContactDeals',
        description: 'Bir kişiye ait teklif/sipariş/faturaları getirir.',
        parameters: {
            type: 'OBJECT',
            properties: {
                contactName: { type: 'STRING', description: 'Kişi adı' },
                contactPhone: { type: 'STRING', description: 'Telefon numarası' }
            }
        }
    },
    {
        name: 'getConversationTransfers',
        description: 'Sohbet transferlerini listeler (kimden kime/hangi takıma aktarıldı).',
        parameters: {
            type: 'OBJECT',
            properties: {
                limit: { type: 'NUMBER', description: 'Sonuç sayısı' }
            }
        }
    },
    {
        name: 'getInternalNotes',
        description: 'Dahili notları getirir. Kişi adı veya telefon ile filtrelenebilir.',
        parameters: {
            type: 'OBJECT',
            properties: {
                contactName: { type: 'STRING', description: 'Kişi adı' },
                contactPhone: { type: 'STRING', description: 'Telefon numarası' },
                limit: { type: 'NUMBER', description: 'Sonuç sayısı' }
            }
        }
    },
    {
        name: 'getCallTranscript',
        description: 'Bir aramanın tam dökümünü (transcript), özetini ve duygu analizini getirir.',
        parameters: {
            type: 'OBJECT',
            properties: {
                phoneNumber: { type: 'STRING', description: 'Telefon numarasıyla ara' },
                limit: { type: 'NUMBER', description: 'Kaç arama getir (varsayılan: 1)' }
            }
        }
    },
    {
        name: 'getBlockedContacts',
        description: 'Engellenen kişileri listeler.',
        parameters: { type: 'OBJECT', properties: {} }
    },
    {
        name: 'getArchivedContacts',
        description: 'Arşivlenmiş kişileri listeler.',
        parameters: {
            type: 'OBJECT',
            properties: {
                limit: { type: 'NUMBER', description: 'Sonuç sayısı' }
            }
        }
    },
    {
        name: 'getUserSchedules',
        description: 'Agent/kullanıcıların çalışma saatlerini ve programlarını getirir.',
        parameters: { type: 'OBJECT', properties: {} }
    },
    {
        name: 'getDailyTrend',
        description: 'Son N gün için günlük trend verisi getirir (mesaj, kişi, sohbet, arama veya form sayıları).',
        parameters: {
            type: 'OBJECT',
            properties: {
                metric: { type: 'STRING', description: 'Metrik: messages, contacts, conversations, calls, forms' },
                days: { type: 'NUMBER', description: 'Kaç gün geriye git (varsayılan: 7)' }
            },
            required: ['metric']
        }
    },
    {
        name: 'getTopActiveContacts',
        description: 'En aktif kişileri mesaj sayısına göre sıralar.',
        parameters: {
            type: 'OBJECT',
            properties: {
                limit: { type: 'NUMBER', description: 'Sonuç sayısı (varsayılan: 10)' }
            }
        }
    },
    {
        name: 'getUnassignedConversations',
        description: 'Hiçbir agente atanmamış açık sohbetleri listeler.',
        parameters: {
            type: 'OBJECT',
            properties: {
                limit: { type: 'NUMBER', description: 'Sonuç sayısı' }
            }
        }
    },
    {
        name: 'getHourlyDistribution',
        description: 'Mesaj, arama veya sohbetlerin saat bazlı dağılımını getirir (00:00-23:00). Yoğun saatleri anlamak için.',
        parameters: {
            type: 'OBJECT',
            properties: {
                metric: { type: 'STRING', description: 'Metrik: messages, calls, conversations' },
                startDate: { type: 'STRING', description: 'Başlangıç tarihi' },
                endDate: { type: 'STRING', description: 'Bitiş tarihi' }
            }
        }
    }
];

// ========== MAIN CHAT ENDPOINT ==========

export const chat = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { message, history = [] } = req.body;

        if (!message?.trim()) {
            return res.status(400).json({ error: 'Mesaj gerekli' });
        }

        // Check role
        const userId = req.user?.id;
        const member = await prisma.workspaceMember.findFirst({ where: { workspaceId, userId } });
        if (!member || !['OWNER', 'ADMIN'].includes(member.role)) {
            if (req.user?.role !== 'SUPER_ADMIN') {
                return res.status(403).json({ error: 'Bu özellik sadece workspace sahipleri için.' });
            }
        }

        const aiApiKey = await getEffectiveAiApiKey(workspaceId);
        if (!aiApiKey) {
            return res.status(400).json({ error: 'AI API key yapılandırılmamış.' });
        }

        console.log(`🤖 [İnsto Bot] Message: "${message.substring(0, 60)}..."`);

        const genAI = new GoogleGenerativeAI(aiApiKey);
        const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            tools: [{ functionDeclarations }]
        });

        const systemPrompt = `Sen "İnsto Bot" adlı güçlü bir dahili CRM asistanısın. Instomer CRM platformunda çalışıyorsun.

KURALLAR:
- Her zaman Türkçe yanıt ver.
- Kısa, net ve okunaklı yanıtlar ver.
- Sayısal verileri verirken emoji kullan (📞 📊 👥 💰 📋 🤖 📧 vb.)
- Kullanıcıya "siz" diye hitap et.
- Veri getirmek için sana verilen TÜM fonksiyonları kullan. Tahmin yapma, her zaman gerçek veriyi çek.
- Kişi arama, telefon sorgu, istatistik, takım bilgisi, bot durumu, otomasyon, randevu, kanal bilgisi — HER ŞEYİ fonksiyonlar aracılığıyla yanıtla.
- Bir soruyu yanıtlamak için birden fazla fonksiyon gerekiyorsa, hepsini çağır.
- Tarih filtresi gerektiğinde ISO format kullan (ör: 2026-02-26).
- Bugünün tarihi: ${new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' })}
- Bugünün ISO tarihi: ${new Date().toISOString().split('T')[0]}`;

        // Build chat history
        const historyParts = [
            { role: 'user', parts: [{ text: systemPrompt }] },
            { role: 'model', parts: [{ text: 'Anladım! İnsto Bot olarak tüm CRM verilerinize tam erişimim var. Kişi arama, arama istatistikleri, mesajlar, sohbetler, satışlar, takımlar, botlar, otomasyonlar, randevular, formlar ve daha fazlası — her konuda yardımcı olabilirim. 🤖' }] }
        ];

        if (history && history.length > 0) {
            let lastRole = 'model';
            for (const h of history) {
                const currentRole = h.role === 'user' ? 'user' : 'model';
                if (currentRole === lastRole) {
                    historyParts[historyParts.length - 1].parts[0].text += '\n\n' + h.content;
                } else {
                    historyParts.push({ role: currentRole, parts: [{ text: h.content }] });
                    lastRole = currentRole;
                }
            }
        }

        const chatSession = model.startChat({ history: historyParts });

        // Send message - may trigger function calls
        let result = await chatSession.sendMessage(message);
        let response = result.response;

        // Handle function calling loop (max 8 iterations for complex multi-function queries)
        let iterations = 0;
        while (response.candidates?.[0]?.content?.parts?.some(p => p.functionCall) && iterations < 8) {
            iterations++;
            const functionCalls = response.candidates[0].content.parts.filter(p => p.functionCall);

            const functionResponses = [];
            for (const fc of functionCalls) {
                const fnName = fc.functionCall.name;
                const fnArgs = fc.functionCall.args || {};
                console.log(`🔧 [İnsto Bot] → ${fnName}(${JSON.stringify(fnArgs).substring(0, 100)})`);

                let fnResult;
                try {
                    if (dataFunctions[fnName]) {
                        fnResult = await dataFunctions[fnName](workspaceId, fnArgs);
                    } else {
                        fnResult = { error: `Bilinmeyen fonksiyon: ${fnName}` };
                    }
                } catch (err) {
                    console.error(`❌ [İnsto Bot] Fn error: ${err.message}`);
                    fnResult = { error: err.message };
                }

                functionResponses.push({
                    functionResponse: { name: fnName, response: { result: JSON.stringify(fnResult) } }
                });
            }

            result = await chatSession.sendMessage(functionResponses);
            response = result.response;
        }

        const textResponse = response.text();
        console.log(`🤖 [İnsto Bot] ✅ Done (${iterations} fn calls)`);

        res.json({ reply: textResponse, timestamp: new Date().toISOString() });

    } catch (error) {
        console.error('❌ [İnsto Bot] Error:', error.message);
        res.status(500).json({
            error: 'Yanıt üretilirken bir hata oluştu.',
            reply: 'Üzgünüm, şu an yanıt veremiyorum. Lütfen tekrar deneyin. 🙏'
        });
    }
};
