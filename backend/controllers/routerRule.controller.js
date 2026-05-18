import prisma from '../lib/prisma.js';

/**
 * GET /:workspaceId/router-rules
 * Workspace'e ait tüm yönlendirici kuralları listeler
 */
export const getRouterRules = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const rules = await prisma.routerRule.findMany({
            where: { workspaceId },
            orderBy: { priority: 'asc' }
        });
        return res.json({ rules });
    } catch (err) {
        console.error('[RouterRule] getAll error:', err);
        return res.status(500).json({ error: 'Kurallar alınamadı' });
    }
};

/**
 * POST /:workspaceId/router-rules
 * Yeni kural oluştur
 */
export const createRouterRule = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { name, isActive = true, priority = 0, conditions = {}, targets = {} } = req.body;

        if (!name?.trim()) {
            return res.status(400).json({ error: 'Kural adı gereklidir' });
        }

        const rule = await prisma.routerRule.create({
            data: {
                workspaceId,
                name: name.trim(),
                isActive,
                priority: Number(priority) || 0,
                conditions: JSON.stringify(conditions),
                targets: JSON.stringify(targets)
            }
        });

        return res.status(201).json({ rule });
    } catch (err) {
        console.error('[RouterRule] create error:', err);
        return res.status(500).json({ error: 'Kural oluşturulamadı' });
    }
};

/**
 * PUT /:workspaceId/router-rules/:ruleId
 * Kuralı güncelle
 */
export const updateRouterRule = async (req, res) => {
    try {
        const { workspaceId, ruleId } = req.params;
        const { name, isActive, priority, conditions, targets } = req.body;

        const existing = await prisma.routerRule.findFirst({
            where: { id: ruleId, workspaceId }
        });
        if (!existing) return res.status(404).json({ error: 'Kural bulunamadı' });

        const updateData = {};
        if (name !== undefined) updateData.name = name.trim();
        if (isActive !== undefined) updateData.isActive = Boolean(isActive);
        if (priority !== undefined) updateData.priority = Number(priority);
        if (conditions !== undefined) updateData.conditions = JSON.stringify(conditions);
        if (targets !== undefined) updateData.targets = JSON.stringify(targets);

        const rule = await prisma.routerRule.update({
            where: { id: ruleId },
            data: updateData
        });

        return res.json({ rule });
    } catch (err) {
        console.error('[RouterRule] update error:', err);
        return res.status(500).json({ error: 'Kural güncellenemedi' });
    }
};

/**
 * DELETE /:workspaceId/router-rules/:ruleId
 */
export const deleteRouterRule = async (req, res) => {
    try {
        const { workspaceId, ruleId } = req.params;
        const existing = await prisma.routerRule.findFirst({
            where: { id: ruleId, workspaceId }
        });
        if (!existing) return res.status(404).json({ error: 'Kural bulunamadı' });

        await prisma.routerRule.delete({ where: { id: ruleId } });
        return res.json({ success: true });
    } catch (err) {
        console.error('[RouterRule] delete error:', err);
        return res.status(500).json({ error: 'Kural silinemedi' });
    }
};

/**
 * PATCH /:workspaceId/router-rules/:ruleId/toggle
 * Aktif/pasif aç-kapat
 */
export const toggleRouterRule = async (req, res) => {
    try {
        const { workspaceId, ruleId } = req.params;
        const existing = await prisma.routerRule.findFirst({
            where: { id: ruleId, workspaceId }
        });
        if (!existing) return res.status(404).json({ error: 'Kural bulunamadı' });

        const rule = await prisma.routerRule.update({
            where: { id: ruleId },
            data: { isActive: !existing.isActive }
        });
        return res.json({ rule });
    } catch (err) {
        console.error('[RouterRule] toggle error:', err);
        return res.status(500).json({ error: 'Durum değiştirilemedi' });
    }
};
