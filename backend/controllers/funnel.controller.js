import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// GET /funnels/:workspaceId
export const getFunnels = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const funnels = await prisma.funnel.findMany({
            where: { workspaceId },
            orderBy: { order: 'asc' }
        });
        res.json({ funnels });
    } catch (error) {
        console.error('Get funnels error:', error);
        res.status(500).json({ error: 'Funnellar alınamadı' });
    }
};

// POST /funnels/:workspaceId
export const createFunnel = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { name, color, icon } = req.body;
        if (!name?.trim()) return res.status(400).json({ error: 'Funnel adı zorunludur' });

        const maxOrder = await prisma.funnel.aggregate({ where: { workspaceId }, _max: { order: true } });
        const nextOrder = (maxOrder._max.order || 0) + 1;

        const funnel = await prisma.funnel.create({
            data: { workspaceId, name: name.trim(), color: color || '#3b82f6', icon: icon || '📁', order: nextOrder }
        });
        res.status(201).json({ funnel });
    } catch (error) {
        console.error('Create funnel error:', error);
        res.status(500).json({ error: 'Funnel oluşturulamadı' });
    }
};

// PUT /funnels/:workspaceId/:funnelId
export const updateFunnel = async (req, res) => {
    try {
        const { workspaceId, funnelId } = req.params;
        const { name, color, icon, order } = req.body;
        const existing = await prisma.funnel.findFirst({ where: { id: funnelId, workspaceId } });
        if (!existing) return res.status(404).json({ error: 'Funnel bulunamadı' });
        const funnel = await prisma.funnel.update({
            where: { id: funnelId },
            data: {
                ...(name && { name: name.trim() }),
                ...(color && { color }),
                ...(icon && { icon }),
                ...(order !== undefined && { order })
            }
        });
        res.json({ funnel });
    } catch (error) {
        console.error('Update funnel error:', error);
        res.status(500).json({ error: 'Funnel güncellenemedi' });
    }
};

// DELETE /funnels/:workspaceId/:funnelId
export const deleteFunnel = async (req, res) => {
    try {
        const { workspaceId, funnelId } = req.params;
        const existing = await prisma.funnel.findFirst({ where: { id: funnelId, workspaceId } });
        if (!existing) return res.status(404).json({ error: 'Funnel bulunamadı' });
        await prisma.funnel.delete({ where: { id: funnelId } });
        res.json({ success: true });
    } catch (error) {
        console.error('Delete funnel error:', error);
        res.status(500).json({ error: 'Funnel silinemedi' });
    }
};
