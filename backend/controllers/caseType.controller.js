import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Get all case types for a workspace
export const getCaseTypes = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const caseTypes = await prisma.caseType.findMany({
            where: { workspaceId },
            include: {
                categories: {
                    orderBy: { order: 'asc' }
                }
            },
            orderBy: { order: 'asc' }
        });
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
