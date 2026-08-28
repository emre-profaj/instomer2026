import prisma from '../lib/prisma.js';

// Default case types to seed for new workspaces
const DEFAULT_CASE_TYPES = [
    { name: 'Fırsat', systemCode: 'FIRSAT', color: '#eab308', icon: '💰', order: 0 },
    { name: 'Şikayet', systemCode: 'SIKAYET', color: '#dc2626', icon: '⚠️', order: 1 },
    { name: 'Randevu', systemCode: 'RANDEVU', color: '#1d4ed8', icon: '📅', order: 2 },
    { name: 'Destek', systemCode: 'DESTEK', color: '#0369a1', icon: '🛠️', order: 3 },
    { name: 'İş Başvurusu', systemCode: 'IS_BASVURUSU', color: '#6d28d9', icon: '📋', order: 4 },
    { name: 'Genel', systemCode: 'GENEL', color: '#6b7280', icon: '📁', order: 5 },
];

// Get all case types for a workspace (auto-seeds defaults if empty)
export const getCaseTypes = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        let caseTypes = await prisma.caseType.findMany({
            where: { workspaceId },
            include: {
                categories: {
                    orderBy: { order: 'asc' }
                }
            },
            orderBy: { order: 'asc' }
        });

        // Auto-seed: workspace'te hiç CaseType yoksa varsayılanları oluştur
        if (caseTypes.length === 0) {
            console.log(`🌱 [CaseType] Auto-seeding default case types for workspace ${workspaceId}`);
            await prisma.caseType.createMany({
                data: DEFAULT_CASE_TYPES.map(ct => ({ ...ct, workspaceId }))
            });
            caseTypes = await prisma.caseType.findMany({
                where: { workspaceId },
                include: { categories: { orderBy: { order: 'asc' } } },
                orderBy: { order: 'asc' }
            });
        }

        res.json({ success: true, data: caseTypes });
    } catch (error) {
        console.error('Error in getCaseTypes:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası', error: error.message });
    }
};

// Create case type
export const createCaseType = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { name, systemCode, color, icon, isActive, order } = req.body;

        const data = await prisma.caseType.create({
            data: {
                workspaceId,
                name,
                systemCode,
                color: color || '#eab308',
                icon,
                isActive: isActive ?? true,
                order: order || 0
            }
        });
        res.json({ success: true, data });
    } catch (error) {
        console.error('Error in createCaseType:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası', error: error.message });
    }
};

// Update case type
export const updateCaseType = async (req, res) => {
    try {
        const { workspaceId, id } = req.params;
        const { name, systemCode, color, icon, isActive, order } = req.body;

        const data = await prisma.caseType.update({
            where: { id, workspaceId },
            data: {
                name,
                systemCode,
                color,
                icon,
                isActive,
                order
            }
        });
        res.json({ success: true, data });
    } catch (error) {
        console.error('Error in updateCaseType:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası', error: error.message });
    }
};

// Delete case type
export const deleteCaseType = async (req, res) => {
    try {
        const { workspaceId, id } = req.params;
        await prisma.caseType.delete({
            where: { id, workspaceId }
        });
        res.json({ success: true, message: 'Deleted successfully' });
    } catch (error) {
        console.error('Error in deleteCaseType:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası', error: error.message });
    }
};
