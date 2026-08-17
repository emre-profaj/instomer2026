import prisma from '../lib/prisma.js';
import * as telsamService from '../services/telsam.service.js';

export const getSettings = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const config = await telsamService.getTelsamConfig(workspaceId);
        res.json({ success: true, data: config });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const saveSettings = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { siteUrl, username, password, isActive } = req.body;

        const config = await prisma.telsamConfig.upsert({
            where: { workspaceId },
            update: { siteUrl, username, password, isActive },
            create: { workspaceId, siteUrl, username, password, isActive }
        });

        res.json({ success: true, data: config });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const deleteSettings = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        await prisma.telsamConfig.delete({
            where: { workspaceId }
        });
        res.json({ success: true, message: 'Settings deleted' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const testConnection = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        // Try DB config first, fall back to req.body for pre-save testing
        let config = await telsamService.getTelsamConfig(workspaceId);
        if (!config) {
            const { siteUrl, username, password } = req.body;
            if (!siteUrl || !username || !password) {
                return res.status(400).json({ success: false, error: 'Bağlantı bilgileri eksik.' });
            }
            config = { siteUrl, username, password };
        }
        const result = await telsamService.testConnection(config);
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const initiateCall = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { phoneNumber, userExtension } = req.body;
        const result = await telsamService.initiateCall(workspaceId, phoneNumber, userExtension);
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const getActiveCalls = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const calls = await telsamService.getActiveCalls(workspaceId);
        res.json({ success: true, data: calls });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const getCDRRecords = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { dateFrom, dateTo, phoneNumber } = req.query;
        const records = await telsamService.getCDRRecords(workspaceId, dateFrom, dateTo, phoneNumber);
        res.json({ success: true, data: records });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const getCallRecording = async (req, res) => {
    try {
        const { workspaceId, cdrId } = req.params;
        const buffer = await telsamService.getCallRecording(workspaceId, cdrId);
        res.setHeader('Content-Type', 'audio/gsm'); // Adjust based on actual type
        res.send(buffer);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const syncCDR = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { dateFrom, dateTo } = req.body;
        const result = await telsamService.syncCDRRecords(workspaceId, dateFrom, dateTo);
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const handleWebhook = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const eventData = req.body;
        await telsamService.processWebhookEvent(workspaceId, eventData);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const getExtensions = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const config = await telsamService.getTelsamConfig(workspaceId);
        if (!config) return res.status(404).json({ success: false, error: 'Config not found' });

        const extensions = await prisma.telsamExtension.findMany({
            where: { configId: config.id }
        });
        res.json({ success: true, data: extensions });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const saveExtensions = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { extensions } = req.body; // Array of { userId, internal, label }
        
        const config = await telsamService.getTelsamConfig(workspaceId);
        if (!config) return res.status(404).json({ success: false, error: 'Config not found' });

        // Simple approach: delete existing and recreate
        await prisma.telsamExtension.deleteMany({
            where: { configId: config.id }
        });

        if (extensions && extensions.length > 0) {
            const dataToInsert = extensions.map(ext => ({
                configId: config.id,
                userId: ext.userId,
                internal: ext.internal,
                label: ext.label
            }));
            await prisma.telsamExtension.createMany({
                data: dataToInsert
            });
        }

        const newExtensions = await prisma.telsamExtension.findMany({
            where: { configId: config.id }
        });

        res.json({ success: true, data: newExtensions });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const getCallLogs = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const logs = await prisma.telsamCallLog.findMany({
            where: { workspaceId },
            orderBy: { callDate: 'desc' },
            take: 100
        });
        res.json({ success: true, data: logs });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
