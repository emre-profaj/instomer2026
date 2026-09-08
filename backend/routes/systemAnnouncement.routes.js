import express from 'express';
import { authenticateJWT } from '../middleware/auth.js';
import prisma from '../lib/prisma.js';

const router = express.Router();
router.use(authenticateJWT);

// ══════════════════════════════════════════════════
// POST /broadcast — SUPER_ADMIN: Duyuru yayınla
// Tüm workspace'lerde "Instomer Sistem" kontağı ile sohbet oluşturur/günceller
// ══════════════════════════════════════════════════
router.post('/broadcast', async (req, res) => {
    try {
        if (req.user.role !== 'SUPER_ADMIN') {
            return res.status(403).json({ error: 'Sadece sistem yöneticisi duyuru yayınlayabilir' });
        }

        const { title, message, type = 'UPDATE' } = req.body;
        if (!message) return res.status(400).json({ error: 'Mesaj gerekli' });

        // 1. Duyuruyu kaydet
        const announcement = await prisma.systemAnnouncement.create({
            data: { title: title || 'Sistem Duyurusu', message, type, createdBy: req.user.id }
        });

        // 2. Tüm workspace'leri bul
        const workspaces = await prisma.workspace.findMany({ select: { id: true } });

        const typeEmoji = { UPDATE: '🔄', IMPROVEMENT: '✨', MAINTENANCE: '🔧', INFO: 'ℹ️' };
        const emoji = typeEmoji[type] || 'ℹ️';
        const fullMessage = `${emoji} *${title || 'Sistem Duyurusu'}*\n\n${message}\n\n— Instomer Ekibi`;

        let created = 0;

        for (const ws of workspaces) {
            try {
                // Mevcut "Instomer" sistem sohbetini bul (isInternalChat + isSystemChat)
                let conversation = await prisma.conversation.findFirst({
                    where: { workspaceId: ws.id, isInternalChat: true, isSystemChat: true, channel: 'SYSTEM' }
                });

                if (!conversation) {
                    // Henüz oluşturulmamışsa → oluştur (kullanıcı chat panelini açmamış)
                    let systemContact = await prisma.contact.findFirst({
                        where: { workspaceId: ws.id, source: 'SYSTEM' }
                    });
                    if (!systemContact) {
                        systemContact = await prisma.contact.create({
                            data: {
                                workspaceId: ws.id, name: 'Instomer', fullName: 'Instomer Destek',
                                source: 'SYSTEM', category: 'PARTNER', email: 'destek@instomer.com',
                                tags: JSON.stringify(['sistem']),
                            }
                        });
                    }
                    conversation = await prisma.conversation.create({
                        data: {
                            workspaceId: ws.id, contactId: systemContact.id, channel: 'SYSTEM',
                            isInternalChat: true, isSystemChat: true,
                            participantIds: JSON.stringify(['SYSTEM']),
                            status: 'OPEN', botEnabled: false, lastMessageAt: new Date(),
                        }
                    });
                }

                // Mesajı ekle
                await prisma.message.create({
                    data: {
                        conversationId: conversation.id,
                        content: fullMessage,
                        isFromContact: true,
                        type: 'TEXT',
                    }
                });

                // Conversation'ı güncelle — en üste çıksın
                await prisma.conversation.update({
                    where: { id: conversation.id },
                    data: {
                        status: 'OPEN',
                        lastMessageAt: new Date(),
                        lastContactMessageAt: new Date(),
                        unreadCount: { increment: 1 },
                    }
                });

                // Socket ile real-time bildir
                const io = req.app.get('io');
                if (io) {
                    io.to(`workspace:${ws.id}`).emit('new_message', {
                        conversationId: conversation.id,
                        message: { content: fullMessage, isFromContact: true, type: 'TEXT', createdAt: new Date() }
                    });
                }

                created++;
            } catch (err) {
                console.error(`[SystemAnnouncement] Workspace ${ws.id} hatası:`, err.message);
            }
        }

        res.json({
            success: true,
            announcement,
            broadcastedTo: created,
            totalWorkspaces: workspaces.length
        });
    } catch (error) {
        console.error('[SystemAnnouncement] Broadcast error:', error);
        res.status(500).json({ error: 'Duyuru yayınlanamadı' });
    }
});

// ══════════════════════════════════════════════════
// GET /announcements — Aktif duyuruları listele
// ══════════════════════════════════════════════════
router.get('/announcements', async (req, res) => {
    try {
        const announcements = await prisma.systemAnnouncement.findMany({
            where: { isActive: true },
            orderBy: { createdAt: 'desc' },
            take: 20
        });
        res.json({ announcements });
    } catch (error) {
        res.status(500).json({ error: 'Duyurular yüklenemedi' });
    }
});

// ══════════════════════════════════════════════════
// GET /replies — SUPER_ADMIN: Kullanıcı yanıtlarını gör
// ══════════════════════════════════════════════════
router.get('/replies', async (req, res) => {
    try {
        if (req.user.role !== 'SUPER_ADMIN') {
            return res.status(403).json({ error: 'Yetkisiz' });
        }

        // Tüm sistem sohbetlerindeki kullanıcı yanıtlarını bul
        const replies = await prisma.message.findMany({
            where: {
                isFromContact: false,
                conversation: { isSystemChat: true }
            },
            include: {
                conversation: {
                    include: {
                        workspace: { select: { id: true, name: true } }
                    }
                },
                sender: { select: { id: true, name: true, email: true } }
            },
            orderBy: { createdAt: 'desc' },
            take: 100
        });

        res.json({ replies });
    } catch (error) {
        console.error('[SystemAnnouncement] Replies error:', error);
        res.status(500).json({ error: 'Yanıtlar yüklenemedi' });
    }
});

// ══════════════════════════════════════════════════
// PATCH /announcements/:id — SUPER_ADMIN: Duyuruyu kapat
// ══════════════════════════════════════════════════
router.patch('/announcements/:id', async (req, res) => {
    try {
        if (req.user.role !== 'SUPER_ADMIN') {
            return res.status(403).json({ error: 'Yetkisiz' });
        }

        const updated = await prisma.systemAnnouncement.update({
            where: { id: req.params.id },
            data: { isActive: req.body.isActive ?? false }
        });

        res.json({ announcement: updated });
    } catch (error) {
        res.status(500).json({ error: 'Güncelleme başarısız' });
    }
});

// ══════════════════════════════════════════════════
// GET /conversations — Tüm workspace'lerdeki sistem sohbetleri
// ══════════════════════════════════════════════════
router.get('/conversations', async (req, res) => {
    try {
        if (req.user.role !== 'SUPER_ADMIN') {
            return res.status(403).json({ error: 'Yetkisiz' });
        }

        const conversations = await prisma.conversation.findMany({
            where: { isSystemChat: true, isInternalChat: true, channel: 'SYSTEM' },
            include: {
                workspace: { select: { id: true, name: true } },
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    select: { content: true, createdAt: true, isFromContact: true }
                }
            },
            orderBy: { lastMessageAt: 'desc' }
        });

        res.json({ conversations });
    } catch (error) {
        console.error('[SystemAnnouncement] Conversations error:', error);
        res.status(500).json({ error: 'Sohbetler yüklenemedi' });
    }
});

// ══════════════════════════════════════════════════
// GET /conversation/:conversationId/messages — Bir sohbetin tüm mesajları
// ══════════════════════════════════════════════════
router.get('/conversation/:conversationId/messages', async (req, res) => {
    try {
        if (req.user.role !== 'SUPER_ADMIN') {
            return res.status(403).json({ error: 'Yetkisiz' });
        }

        const messages = await prisma.message.findMany({
            where: { conversationId: req.params.conversationId },
            include: {
                sender: { select: { id: true, name: true, email: true, avatar: true } }
            },
            orderBy: { createdAt: 'asc' }
        });

        res.json({ messages });
    } catch (error) {
        console.error('[SystemAnnouncement] Messages error:', error);
        res.status(500).json({ error: 'Mesajlar yüklenemedi' });
    }
});

// ══════════════════════════════════════════════════
// POST /conversation/:conversationId/reply — Admin yanıt gönder
// ══════════════════════════════════════════════════
router.post('/conversation/:conversationId/reply', async (req, res) => {
    try {
        if (req.user.role !== 'SUPER_ADMIN') {
            return res.status(403).json({ error: 'Yetkisiz' });
        }

        const { content } = req.body;
        if (!content?.trim()) {
            return res.status(400).json({ error: 'Mesaj içeriği gerekli' });
        }

        const conv = await prisma.conversation.findUnique({
            where: { id: req.params.conversationId }
        });
        if (!conv || !conv.isSystemChat) {
            return res.status(404).json({ error: 'Sistem sohbeti bulunamadı' });
        }

        // Mesajı "Instomer'dan" (isFromContact=true) olarak gönder
        const message = await prisma.message.create({
            data: {
                conversationId: conv.id,
                content: content.trim(),
                isFromContact: true, // Instomer tarafından
                type: 'TEXT',
            }
        });

        // Conversation'ı güncelle
        await prisma.conversation.update({
            where: { id: conv.id },
            data: {
                lastMessageAt: new Date(),
                lastContactMessageAt: new Date(),
                unreadCount: { increment: 1 },
            }
        });

        // Socket ile real-time bildir
        const io = req.app.get('io');
        if (io) {
            io.to(`workspace:${conv.workspaceId}`).emit('new_message', {
                conversationId: conv.id,
                message: { content: content.trim(), isFromContact: true, type: 'TEXT', createdAt: new Date() }
            });
        }

        res.status(201).json({ message });
    } catch (error) {
        console.error('[SystemAnnouncement] Reply error:', error);
        res.status(500).json({ error: 'Yanıt gönderilemedi' });
    }
});

export default router;
