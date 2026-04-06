import prisma from '../lib/prisma.js';


// Get all resources for a workspace
export const getResources = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { type, isActive } = req.query;

        let where = { workspaceId };
        if (type) where.type = type;
        if (isActive !== undefined) where.isActive = isActive === 'true';

        const resources = await prisma.calendarResource.findMany({
            where,
            orderBy: { name: 'asc' }
        });

        res.json({ resources });
    } catch (error) {
        console.error('Get resources error:', error);
        res.status(500).json({ error: 'Kaynaklar yüklenirken hata oluştu' });
    }
};

// Create resource
export const createResource = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { name, description, type, color, availableStart, availableEnd, availableDays } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Kaynak adı gereklidir' });
        }

        const resource = await prisma.calendarResource.create({
            data: {
                workspaceId,
                name,
                description: description || null,
                type: type || 'ROOM',
                color: color || '#8b5cf6',
                availableStart: availableStart || null,
                availableEnd: availableEnd || null,
                availableDays: availableDays || null
            }
        });

        res.status(201).json({ resource });
    } catch (error) {
        console.error('Create resource error:', error);
        res.status(500).json({ error: 'Kaynak oluşturulurken hata oluştu' });
    }
};

// Update resource
export const updateResource = async (req, res) => {
    try {
        const { workspaceId, resourceId } = req.params;
        const { name, description, type, color, isActive, availableStart, availableEnd, availableDays } = req.body;

        const existing = await prisma.calendarResource.findFirst({
            where: { id: resourceId, workspaceId }
        });

        if (!existing) {
            return res.status(404).json({ error: 'Kaynak bulunamadı' });
        }

        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (description !== undefined) updateData.description = description;
        if (type !== undefined) updateData.type = type;
        if (color !== undefined) updateData.color = color;
        if (isActive !== undefined) updateData.isActive = isActive;
        if (availableStart !== undefined) updateData.availableStart = availableStart;
        if (availableEnd !== undefined) updateData.availableEnd = availableEnd;
        if (availableDays !== undefined) updateData.availableDays = availableDays;

        const resource = await prisma.calendarResource.update({
            where: { id: resourceId },
            data: updateData
        });

        res.json({ resource });
    } catch (error) {
        console.error('Update resource error:', error);
        res.status(500).json({ error: 'Kaynak güncellenirken hata oluştu' });
    }
};

// Delete resource
export const deleteResource = async (req, res) => {
    try {
        const { workspaceId, resourceId } = req.params;

        const existing = await prisma.calendarResource.findFirst({
            where: { id: resourceId, workspaceId }
        });

        if (!existing) {
            return res.status(404).json({ error: 'Kaynak bulunamadı' });
        }

        // Clear resourceId from appointments that reference this resource
        await prisma.appointment.updateMany({
            where: { resourceId },
            data: { resourceId: null }
        });

        await prisma.calendarResource.delete({ where: { id: resourceId } });

        res.json({ success: true, message: 'Kaynak silindi' });
    } catch (error) {
        console.error('Delete resource error:', error);
        res.status(500).json({ error: 'Kaynak silinirken hata oluştu' });
    }
};
