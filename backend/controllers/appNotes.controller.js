import prisma from '../lib/prisma.js';

// ══════════════════════════════════════════════════════════════════════════
// APP NOTES — Changelog & WhatsNext CRUD
// ══════════════════════════════════════════════════════════════════════════

export const getNotes = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { type } = req.query; // CHANGELOG or WHATSNEXT

        const where = { workspaceId };
        if (type) where.type = type;

        const notes = await prisma.appNote.findMany({
            where,
            orderBy: { createdAt: 'desc' }
        });

        res.json({ success: true, notes });
    } catch (error) {
        console.error('❌ [getNotes]', error);
        res.status(500).json({ error: 'Notlar getirilemedi' });
    }
};

export const createNote = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { type, title, content, version, status, priority } = req.body;

        if (!title?.trim() || !type) {
            return res.status(400).json({ error: 'Başlık ve tip zorunlu' });
        }

        const note = await prisma.appNote.create({
            data: {
                workspaceId,
                type,
                title: title.trim(),
                content: content || null,
                version: version || null,
                status: status || (type === 'WHATSNEXT' ? 'IDEA' : 'DONE'),
                priority: priority || 0,
                authorId: req.user?.id || null
            }
        });

        res.json({ success: true, note });
    } catch (error) {
        console.error('❌ [createNote]', error);
        res.status(500).json({ error: 'Not oluşturulamadı' });
    }
};

export const updateNote = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, content, version, status, priority } = req.body;

        const note = await prisma.appNote.update({
            where: { id },
            data: {
                ...(title !== undefined && { title }),
                ...(content !== undefined && { content }),
                ...(version !== undefined && { version }),
                ...(status !== undefined && { status }),
                ...(priority !== undefined && { priority })
            }
        });

        res.json({ success: true, note });
    } catch (error) {
        console.error('❌ [updateNote]', error);
        res.status(500).json({ error: 'Not güncellenemedi' });
    }
};

export const deleteNote = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.appNote.delete({ where: { id } });
        res.json({ success: true });
    } catch (error) {
        console.error('❌ [deleteNote]', error);
        res.status(500).json({ error: 'Not silinemedi' });
    }
};
