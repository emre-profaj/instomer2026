import prisma from '../lib/prisma.js';


// Get all quick replies for a workspace
export const getQuickReplies = async (req, res) => {
    try {
        const { workspaceId } = req.params;

        const quickReplies = await prisma.quickReply.findMany({
            where: { workspaceId },
            orderBy: { createdAt: 'desc' }
        });

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
        const { content } = req.body;

        if (!content) {
            return res.status(400).json({ error: 'İçerik zorunludur' });
        }

        const quickReply = await prisma.quickReply.create({
            data: {
                workspaceId,
                title: content.substring(0, 30),
                content,
                createdById: req.user.id
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
        const { content } = req.body;

        const quickReply = await prisma.quickReply.update({
            where: { id },
            data: {
                ...(content && { content }),
                ...(content && { title: content.substring(0, 30) })
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
