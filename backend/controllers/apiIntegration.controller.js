import prisma from '../lib/prisma.js';
import { encrypt, decrypt } from '../utils/encryption.js';

// --- API INTEGRATIONS (Workspace bazlı dış servis bağlantıları) ---

export const getIntegrations = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const integrations = await prisma.apiIntegration.findMany({
            where: { workspaceId },
            orderBy: { createdAt: 'desc' }
        });

        // Güvenlik: Token ve Key'leri dışarı çıkartırken maskele
        const maskedIntegrations = integrations.map(integration => {
            const masked = { ...integration };
            if (masked.authToken) masked.authToken = '********';
            if (masked.apiKey) masked.apiKey = '********';
            if (masked.apiSecret) masked.apiSecret = '********';
            return masked;
        });

        res.json({ integrations: maskedIntegrations });
    } catch (error) {
        console.error('Get API integrations error:', error);
        res.status(500).json({ error: 'API Entegrasyonları getirilemedi' });
    }
};

export const createIntegration = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { name, baseUrl, authType, authToken, apiKey, apiSecret, headers, isActive } = req.body;

        const data = {
            workspaceId,
            name,
            baseUrl,
            authType: authType || 'NONE',
            isActive: isActive !== undefined ? isActive : true,
            headers: headers ? JSON.stringify(headers) : null
        };

        if (authToken) data.authToken = encrypt(authToken);
        if (apiKey) data.apiKey = encrypt(apiKey);
        if (apiSecret) data.apiSecret = encrypt(apiSecret);

        const integration = await prisma.apiIntegration.create({ data });
        res.status(201).json({ integration });
    } catch (error) {
        console.error('Create API integration error:', error);
        res.status(500).json({ error: 'Entegrasyon oluşturulamadı' });
    }
};

export const updateIntegration = async (req, res) => {
    try {
        const { workspaceId, id } = req.params;
        const { name, baseUrl, authType, authToken, apiKey, apiSecret, headers, isActive } = req.body;

        // Verify existence
        const existing = await prisma.apiIntegration.findFirst({ where: { id, workspaceId } });
        if (!existing) {
            return res.status(404).json({ error: 'Entegrasyon bulunamadı' });
        }

        const data = {};
        if (name) data.name = name;
        if (baseUrl) data.baseUrl = baseUrl;
        if (authType) data.authType = authType;
        if (isActive !== undefined) data.isActive = isActive;
        if (headers !== undefined) data.headers = headers ? JSON.stringify(headers) : null;
        
        // Eğer ******** geldiyse değiştirilmemiş demektir, atla. Yeni değer geldiyse şifrele.
        if (authToken && authToken !== '********') data.authToken = encrypt(authToken);
        if (apiKey && apiKey !== '********') data.apiKey = encrypt(apiKey);
        if (apiSecret && apiSecret !== '********') data.apiSecret = encrypt(apiSecret);

        const integration = await prisma.apiIntegration.update({
            where: { id },
            data
        });

        res.json({ integration });
    } catch (error) {
        console.error('Update API integration error:', error);
        res.status(500).json({ error: 'Entegrasyon güncellenemedi' });
    }
};

export const deleteIntegration = async (req, res) => {
    try {
        const { workspaceId, id } = req.params;
        const existing = await prisma.apiIntegration.findFirst({ where: { id, workspaceId } });
        if (!existing) {
            return res.status(404).json({ error: 'Entegrasyon bulunamadı' });
        }

        await prisma.apiIntegration.delete({ where: { id } });
        res.json({ message: 'Entegrasyon başarıyla silindi' });
    } catch (error) {
        console.error('Delete API integration error:', error);
        res.status(500).json({ error: 'Entegrasyon silinemedi' });
    }
};


// --- AI BOT TOOLS (Botların yetenekleri/fonksiyonları) ---

export const getBotTools = async (req, res) => {
    try {
        const { botId } = req.params;
        const tools = await prisma.aIBotTool.findMany({
            where: { botId },
            include: {
                apiIntegration: {
                    select: { id: true, name: true, baseUrl: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json({ tools });
    } catch (error) {
        console.error('Get bot tools error:', error);
        res.status(500).json({ error: 'Bot yetenekleri getirilemedi' });
    }
};

export const createBotTool = async (req, res) => {
    try {
        const { botId } = req.params;
        const { apiIntegrationId, name, description, method, endpoint, parametersSchema, isActive } = req.body;

        const data = {
            botId,
            apiIntegrationId: apiIntegrationId || null,
            name,
            description,
            method: method || 'GET',
            endpoint,
            parametersSchema: parametersSchema ? JSON.stringify(parametersSchema) : null,
            isActive: isActive !== undefined ? isActive : true
        };

        const tool = await prisma.aIBotTool.create({ data });
        res.status(201).json({ tool });
    } catch (error) {
        console.error('Create bot tool error:', error);
        res.status(500).json({ error: 'Yetenek oluşturulamadı' });
    }
};

export const updateBotTool = async (req, res) => {
    try {
        const { botId, toolId } = req.params;
        const { apiIntegrationId, name, description, method, endpoint, parametersSchema, isActive } = req.body;

        const data = {};
        if (apiIntegrationId !== undefined) data.apiIntegrationId = apiIntegrationId;
        if (name) data.name = name;
        if (description) data.description = description;
        if (method) data.method = method;
        if (endpoint) data.endpoint = endpoint;
        if (isActive !== undefined) data.isActive = isActive;
        if (parametersSchema !== undefined) data.parametersSchema = parametersSchema ? JSON.stringify(parametersSchema) : null;

        const tool = await prisma.aIBotTool.update({
            where: { id: toolId },
            data
        });

        res.json({ tool });
    } catch (error) {
        console.error('Update bot tool error:', error);
        res.status(500).json({ error: 'Yetenek güncellenemedi' });
    }
};

export const deleteBotTool = async (req, res) => {
    try {
        const { botId, toolId } = req.params;
        await prisma.aIBotTool.delete({ where: { id: toolId } });
        res.json({ message: 'Yetenek silindi' });
    } catch (error) {
        console.error('Delete bot tool error:', error);
        res.status(500).json({ error: 'Yetenek silinemedi' });
    }
};
