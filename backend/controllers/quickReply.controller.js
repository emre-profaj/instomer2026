import prisma from '../lib/prisma.js';
import {
    ensureDefaultQuickReplies,
    pushQuickReplyToMeta,
    STANDARD_TEMPLATES_DEF
} from '../services/defaultQuickReplies.service.js';

// Get all quick replies for a workspace
export const getQuickReplies = async (req, res) => {
    try {
        const { workspaceId } = req.params;

        let quickReplies = await prisma.quickReply.findMany({
            where: { workspaceId },
            orderBy: { createdAt: 'desc' }
        });

        // Automatically seed standard templates if workspace has no quick replies yet
        if (quickReplies.length === 0) {
            await ensureDefaultQuickReplies(workspaceId, req.user?.id);
            quickReplies = await prisma.quickReply.findMany({
                where: { workspaceId },
                orderBy: { createdAt: 'desc' }
            });
        }

        res.json(quickReplies);
    } catch (error) {
        console.error('Error fetching quick replies:', error);
        res.status(500).json({ error: 'Hazır mesajlar yüklenirken hata oluştu' });
    }
};

// Create a new quick reply
export const createQuickReply = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { title, name, content, message, shortcut } = req.body;

        const finalContent = content || message;
        if (!finalContent) {
            return res.status(400).json({ error: 'İçerik zorunludur' });
        }

        const finalTitle = title || name || finalContent.substring(0, 30);
        const creatorId = req.user?.id || (await prisma.user.findFirst({ select: { id: true } }))?.id;

        const quickReply = await prisma.quickReply.create({
            data: {
                workspaceId,
                title: finalTitle,
                content: finalContent,
                shortcut: shortcut || null,
                createdById: creatorId
            }
        });

        res.status(201).json(quickReply);
    } catch (error) {
        console.error('Error creating quick reply:', error);
        res.status(500).json({ error: 'Hazır mesaj oluşturulurken hata oluştu' });
    }
};

// Update a quick reply
export const updateQuickReply = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, name, content, message, shortcut } = req.body;

        const finalContent = content || message;
        const finalTitle = title || name;

        const quickReply = await prisma.quickReply.update({
            where: { id },
            data: {
                ...(finalContent && { content: finalContent }),
                ...(finalTitle && { title: finalTitle }),
                ...(shortcut !== undefined && { shortcut: shortcut || null })
            }
        });

        res.json(quickReply);
    } catch (error) {
        console.error('Error updating quick reply:', error);
        res.status(500).json({ error: 'Hazır mesaj güncellenirken hata oluştu' });
    }
};

// Delete a quick reply
export const deleteQuickReply = async (req, res) => {
    try {
        const { id } = req.params;

        await prisma.quickReply.delete({
            where: { id }
        });

        res.json({ message: 'Hazır mesaj silindi' });
    } catch (error) {
        console.error('Error deleting quick reply:', error);
        res.status(500).json({ error: 'Hazır mesaj silinirken hata oluştu' });
    }
};

// Manually seed or reset standard templates
export const seedDefaultTemplates = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { overwrite } = req.body;

        const seeded = await ensureDefaultQuickReplies(workspaceId, req.user?.id, overwrite === true);

        const allReplies = await prisma.quickReply.findMany({
            where: { workspaceId },
            orderBy: { createdAt: 'desc' }
        });

        res.json({
            success: true,
            message: 'Standart hazır mesaj şablonları başarıyla oluşturuldu.',
            data: allReplies
        });
    } catch (error) {
        console.error('Error seeding default templates:', error);
        res.status(500).json({ error: 'Standart şablonlar oluşturulurken hata oluştu: ' + error.message });
    }
};

// Push a single quick reply to Meta WhatsApp as a WhatsappTemplate
export const pushToMetaTemplate = async (req, res) => {
    try {
        const { workspaceId, id } = req.params;
        const { whatsappPhoneNumberId } = req.body;

        const result = await pushQuickReplyToMeta(workspaceId, id, whatsappPhoneNumberId);

        res.json({
            success: true,
            message: 'Şablon Meta Business API onayına başarıyla gönderildi.',
            data: result
        });
    } catch (error) {
        console.error('Error pushing quick reply to Meta:', error);
        res.status(400).json({
            success: false,
            error: error.message || 'Meta şablonu oluşturulamadı.'
        });
    }
};
