import prisma from '../lib/prisma.js';

// Get templates by type
export const getTemplates = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { type } = req.query; // EMAIL, SMS, WHATSAPP, QUICK_REPLY

        let data = [];
        if (type === 'EMAIL') {
            data = await prisma.emailTemplate.findMany({
                where: { workspaceId },
                orderBy: { createdAt: 'desc' }
            });
        } else if (type === 'SMS') {
            data = await prisma.smsTemplate.findMany({
                where: { workspaceId },
                orderBy: { createdAt: 'desc' }
            });
        } else if (type === 'WHATSAPP') {
            data = await prisma.whatsappTemplate.findMany({
                where: { workspaceId },
                orderBy: { createdAt: 'desc' }
            });
        } else if (type === 'QUICK_REPLY') {
            data = await prisma.quickReply.findMany({
                where: { workspaceId },
                orderBy: { createdAt: 'desc' }
            });
        } else {
            return res.status(400).json({ success: false, message: 'Invalid template type' });
        }

        res.json({ success: true, data });
    } catch (error) {
        console.error('Error in getTemplates:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası', error: error.message });
    }
};

// Create template
export const createTemplate = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { type, ...payload } = req.body; // type is required in body to know which model to use

        let data = null;
        if (type === 'EMAIL') {
            data = await prisma.emailTemplate.create({
                data: {
                    workspaceId,
                    name: payload.name,
                    subject: payload.subject,
                    bodyHtml: payload.bodyHtml,
                    bodyText: payload.bodyText,
                    variables: payload.variables ? JSON.stringify(payload.variables) : null,
                    isActive: payload.isActive ?? true
                }
            });
        } else if (type === 'SMS') {
            data = await prisma.smsTemplate.create({
                data: {
                    workspaceId,
                    name: payload.name,
                    bodyText: payload.bodyText,
                    variables: payload.variables ? JSON.stringify(payload.variables) : null,
                    isActive: payload.isActive ?? true
                }
            });
        } else if (type === 'QUICK_REPLY') {
            data = await prisma.quickReply.create({
                data: {
                    workspaceId,
                    shortcut: payload.shortcut,
                    message: payload.message
                }
            });
        } else {
            return res.status(400).json({ success: false, message: 'Cannot create this template type directly' });
        }

        res.json({ success: true, data });
    } catch (error) {
        console.error('Error in createTemplate:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası', error: error.message });
    }
};

// Update template
export const updateTemplate = async (req, res) => {
    try {
        const { workspaceId, id } = req.params;
        const { type, ...payload } = req.body;

        let data = null;
        if (type === 'EMAIL') {
            data = await prisma.emailTemplate.update({
                where: { id, workspaceId },
                data: {
                    name: payload.name,
                    subject: payload.subject,
                    bodyHtml: payload.bodyHtml,
                    bodyText: payload.bodyText,
                    variables: payload.variables ? JSON.stringify(payload.variables) : undefined,
                    isActive: payload.isActive
                }
            });
        } else if (type === 'SMS') {
            data = await prisma.smsTemplate.update({
                where: { id, workspaceId },
                data: {
                    name: payload.name,
                    bodyText: payload.bodyText,
                    variables: payload.variables ? JSON.stringify(payload.variables) : undefined,
                    isActive: payload.isActive
                }
            });
        } else if (type === 'QUICK_REPLY') {
            data = await prisma.quickReply.update({
                where: { id, workspaceId },
                data: {
                    shortcut: payload.shortcut,
                    message: payload.message
                }
            });
        } else {
            return res.status(400).json({ success: false, message: 'Cannot update this template type' });
        }

        res.json({ success: true, data });
    } catch (error) {
        console.error('Error in updateTemplate:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası', error: error.message });
    }
};

// Delete template
export const deleteTemplate = async (req, res) => {
    try {
        const { workspaceId, id } = req.params;
        const { type } = req.query; // Need to know type to delete from correct model

        if (type === 'EMAIL') {
            await prisma.emailTemplate.delete({ where: { id, workspaceId } });
        } else if (type === 'SMS') {
            await prisma.smsTemplate.delete({ where: { id, workspaceId } });
        } else if (type === 'QUICK_REPLY') {
            await prisma.quickReply.delete({ where: { id, workspaceId } });
        } else {
            return res.status(400).json({ success: false, message: 'Cannot delete this template type' });
        }

        res.json({ success: true, message: 'Deleted successfully' });
    } catch (error) {
        console.error('Error in deleteTemplate:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası', error: error.message });
    }
};
