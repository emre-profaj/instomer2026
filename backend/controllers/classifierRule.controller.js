import prisma from '../lib/prisma.js';

export const getClassifierRules = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const rules = await prisma.classifierRule.findMany({
            where: { workspaceId },
            orderBy: { priority: 'asc' }
        });
        res.json({ rules });
    } catch (error) {
        console.error('getClassifierRules error:', error);
        res.status(500).json({ error: 'Kayıtlar alınamadı' });
    }
};

export const createClassifierRule = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { name, conditionType, conditions, targetFunnelId, targetStageId, targetTeamId, automationId, isActive } = req.body;
        
        // Find highest priority
        const lastRule = await prisma.classifierRule.findFirst({
            where: { workspaceId },
            orderBy: { priority: 'desc' }
        });
        const priority = lastRule ? lastRule.priority + 1 : 0;

        const rule = await prisma.classifierRule.create({
            data: {
                workspaceId,
                name,
                conditionType,
                conditions: conditions ? (typeof conditions === 'string' ? conditions : JSON.stringify(conditions)) : '{}',
                targetFunnelId,
                targetStageId,
                targetTeamId,
                automationId,
                isActive: isActive ?? true,
                priority
            }
        });
        res.json({ rule });
    } catch (error) {
        console.error('createClassifierRule error:', error);
        res.status(500).json({ error: 'Kural oluşturulamadı' });
    }
};

export const updateClassifierRule = async (req, res) => {
    try {
        const { workspaceId, ruleId } = req.params;
        const data = req.body;
        
        if (data.conditions && typeof data.conditions !== 'string') {
            data.conditions = JSON.stringify(data.conditions);
        }

        const rule = await prisma.classifierRule.update({
            where: { id: ruleId, workspaceId },
            data
        });
        res.json({ rule });
    } catch (error) {
        console.error('updateClassifierRule error:', error);
        res.status(500).json({ error: 'Kural güncellenemedi' });
    }
};

export const deleteClassifierRule = async (req, res) => {
    try {
        const { workspaceId, ruleId } = req.params;
        await prisma.classifierRule.delete({
            where: { id: ruleId, workspaceId }
        });
        res.json({ message: 'Kural silindi' });
    } catch (error) {
        console.error('deleteClassifierRule error:', error);
        res.status(500).json({ error: 'Kural silinemedi' });
    }
};

export const reorderClassifierRules = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { rules } = req.body; // Array of { id, priority }

        // Run in transaction
        await prisma.$transaction(
            rules.map(rule => prisma.classifierRule.update({
                where: { id: rule.id, workspaceId },
                data: { priority: rule.priority }
            }))
        );

        res.json({ message: 'Sıralama güncellendi' });
    } catch (error) {
        console.error('reorderClassifierRules error:', error);
        res.status(500).json({ error: 'Sıralama güncellenemedi' });
    }
};

export const toggleClassifierRule = async (req, res) => {
    try {
        const { workspaceId, ruleId } = req.params;
        const { isActive } = req.body;

        const rule = await prisma.classifierRule.update({
            where: { id: ruleId, workspaceId },
            data: { isActive }
        });

        res.json({ rule });
    } catch (error) {
        console.error('toggleClassifierRule error:', error);
        res.status(500).json({ error: 'Kural durumu değiştirilemedi' });
    }
};
