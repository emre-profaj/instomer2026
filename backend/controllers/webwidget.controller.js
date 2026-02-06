import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Get all widgets for workspace
export const getWidgets = async (req, res) => {
    try {
        const { workspaceId } = req.query;

        if (!workspaceId) {
            return res.status(400).json({ error: 'workspaceId is required' });
        }

        const widgets = await prisma.webWidget.findMany({
            where: { workspaceId },
            include: {
                assignedBot: {
                    select: {
                        id: true,
                        name: true,
                        isActive: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json({ widgets });
    } catch (error) {
        console.error('Get widgets error:', error);
        res.status(500).json({ error: 'Failed to fetch widgets' });
    }
};

// Get single widget
export const getWidget = async (req, res) => {
    try {
        const { id } = req.params;

        const widget = await prisma.webWidget.findUnique({
            where: { id },
            include: {
                assignedBot: {
                    select: {
                        id: true,
                        name: true,
                        isActive: true
                    }
                }
            }
        });

        if (!widget) {
            return res.status(404).json({ error: 'Widget not found' });
        }

        res.json({ widget });
    } catch (error) {
        console.error('Get widget error:', error);
        res.status(500).json({ error: 'Failed to fetch widget' });
    }
};

// Create new widget
export const createWidget = async (req, res) => {
    try {
        const { workspaceId, name, siteUrl, title, subtitle, primaryColor, greetingMessage, isActive, position, width, assignedBotId, prechatFormEnabled } = req.body;

        if (!workspaceId || !name) {
            return res.status(400).json({ error: 'workspaceId and name are required' });
        }

        const widget = await prisma.webWidget.create({
            data: {
                workspaceId,
                name,
                siteUrl,
                title: title || 'Müşteri Destek',
                subtitle,
                primaryColor: primaryColor || '#ef4444',
                greetingMessage,
                isActive: isActive !== undefined ? isActive : true,
                position: position || 'RIGHT',
                width: width || 350,
                assignedBotId: assignedBotId || null,
                prechatFormEnabled: prechatFormEnabled !== undefined ? prechatFormEnabled : false
            },
            include: {
                assignedBot: {
                    select: {
                        id: true,
                        name: true,
                        isActive: true
                    }
                }
            }
        });

        res.json({ widget });
    } catch (error) {
        console.error('Create widget error:', error);
        res.status(500).json({ error: 'Failed to create widget' });
    }
};

// Update widget
export const updateWidget = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, siteUrl, title, subtitle, primaryColor, greetingMessage, isActive, position, width, assignedBotId, prechatFormEnabled } = req.body;

        const widget = await prisma.webWidget.update({
            where: { id },
            data: {
                ...(name !== undefined && { name }),
                ...(siteUrl !== undefined && { siteUrl }),
                ...(title !== undefined && { title }),
                ...(subtitle !== undefined && { subtitle }),
                ...(primaryColor !== undefined && { primaryColor }),
                ...(greetingMessage !== undefined && { greetingMessage }),
                ...(isActive !== undefined && { isActive }),
                ...(position !== undefined && { position }),
                ...(width !== undefined && { width }),
                ...(assignedBotId !== undefined && { assignedBotId: assignedBotId || null }),
                ...(prechatFormEnabled !== undefined && { prechatFormEnabled })
            },
            include: {
                assignedBot: {
                    select: {
                        id: true,
                        name: true,
                        isActive: true
                    }
                }
            }
        });

        res.json({ widget });
    } catch (error) {
        console.error('Update widget error:', error);
        res.status(500).json({ error: 'Failed to update widget' });
    }
};

// Delete widget
export const deleteWidget = async (req, res) => {
    try {
        const { id } = req.params;

        await prisma.webWidget.delete({
            where: { id }
        });

        res.json({ message: 'Widget deleted successfully' });
    } catch (error) {
        console.error('Delete widget error:', error);
        res.status(500).json({ error: 'Failed to delete widget' });
    }
};
