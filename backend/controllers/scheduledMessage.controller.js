import prisma from '../lib/prisma.js';

// ─────────────────────────────────────────────────────────────────────────────
// Zamanlanmış Mesaj CRUD
// ─────────────────────────────────────────────────────────────────────────────

export const getScheduledMessages = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { status, botId, page = 1, limit = 50 } = req.query;

        const where = { workspaceId };
        if (status) where.status = status;
        if (botId) where.botId = botId;

        const [messages, total] = await Promise.all([
            prisma.scheduledMessage.findMany({
                where,
                orderBy: { scheduledAt: 'desc' },
                skip: (parseInt(page) - 1) * parseInt(limit),
                take: parseInt(limit),
                include: {
                    contact: { select: { id: true, name: true, phone: true } },
                    conversation: { select: { id: true, channel: true } }
                }
            }),
            prisma.scheduledMessage.count({ where })
        ]);

        res.json({
            success: true,
            data: messages,
            pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) }
        });
    } catch (error) {
        console.error('❌ [ScheduledMessage] getAll:', error.message);
        res.status(500).json({ error: 'Zamanlanmış mesajlar alınamadı' });
    }
};

export const createScheduledMessage = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { conversationId, contactId, botId, automationId, content, scheduledAt } = req.body;

        if (!conversationId || !contactId || !content || !scheduledAt) {
            return res.status(400).json({ error: 'conversationId, contactId, content ve scheduledAt zorunludur' });
        }

        const msg = await prisma.scheduledMessage.create({
            data: {
                workspaceId,
                conversationId,
                contactId,
                botId: botId || null,
                automationId: automationId || null,
                content,
                scheduledAt: new Date(scheduledAt),
                status: 'PENDING'
            }
        });

        res.status(201).json({ success: true, data: msg });
    } catch (error) {
        console.error('❌ [ScheduledMessage] create:', error.message);
        res.status(500).json({ error: 'Zamanlanmış mesaj oluşturulamadı' });
    }
};

export const cancelScheduledMessage = async (req, res) => {
    try {
        const { workspaceId, id } = req.params;
        const msg = await prisma.scheduledMessage.update({
            where: { id, workspaceId, status: 'PENDING' },
            data: { status: 'CANCELLED' }
        });
        res.json({ success: true, data: msg });
    } catch (error) {
        console.error('❌ [ScheduledMessage] cancel:', error.message);
        res.status(500).json({ error: 'İptal edilemedi' });
    }
};

let isProcessingScheduledMessages = false;

// ─────────────────────────────────────────────────────────────────────────────
// Cron Job: Her dakika çalışır ve PENDING mesajları gönderir
// ─────────────────────────────────────────────────────────────────────────────
export const processScheduledMessages = async () => {
    if (isProcessingScheduledMessages) return;
    isProcessingScheduledMessages = true;
    try {
        const now = new Date();
        const pendingMessages = await prisma.scheduledMessage.findMany({
            where: {
                status: 'PENDING',
                scheduledAt: { lte: now }
            },
            include: {
                conversation: { select: { id: true, channel: true, whatsappPhoneNumberId: true, workspaceId: true } },
                contact: { select: { id: true, phone: true, name: true } }
            },
            take: 50 // Batch limit
        });

        if (pendingMessages.length === 0) return;

        console.log(`⏰ [ScheduledMsg] ${pendingMessages.length} mesaj gönderiliyor...`);

        for (const msg of pendingMessages) {
            try {
                // Mesajı conversation'a yaz
                await prisma.message.create({
                    data: {
                        conversationId: msg.conversationId,
                        content: msg.content,
                        isFromContact: false,
                        messageType: 'TEXT',
                        isManual: false
                    }
                });

                // Conversation güncelle
                await prisma.conversation.update({
                    where: { id: msg.conversationId },
                    data: { lastMessageAt: now }
                });

                // Durumu güncelle
                await prisma.scheduledMessage.update({
                    where: { id: msg.id },
                    data: { status: 'SENT', sentAt: now }
                });

                console.log(`✅ [ScheduledMsg] Sent: ${msg.id} → conv: ${msg.conversationId}`);
            } catch (sendErr) {
                console.error(`❌ [ScheduledMsg] Failed: ${msg.id}:`, sendErr.message);
                await prisma.scheduledMessage.update({
                    where: { id: msg.id },
                    data: { status: 'FAILED', failReason: sendErr.message }
                }).catch(() => {});
            }
        }
    } catch (error) {
        console.error('❌ [ScheduledMsg] processScheduledMessages error:', error.message);
    } finally {
        isProcessingScheduledMessages = false;
    }
};
