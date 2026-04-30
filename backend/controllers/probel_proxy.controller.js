/**
 * Probel Health System Proxy Controller
 * 
 * Sağlık Sistemi (HBYS) API'sine bağlantı kurma, test etme ve bağlantı kesme.
 * Kullanıcıdan API URL, kullanıcı adı ve şifre alınır → token endpoint'ine
 * OAuth Password Grant ile istek atılır → Bearer token DB'ye kaydedilir.
 * 
 * Panel UI'da "Probel" ismi geçmez, "Sağlık Sistemi" olarak gösterilir.
 */

import prisma from '../lib/prisma.js';

/**
 * POST /:workspaceId/connect
 * Body: { apiUrl, username, password, name? }
 * 
 * Token endpoint'ine istek atar ve başarılıysa ApiIntegration kaydı oluşturur.
 */
export const connectHealthSystem = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { apiUrl, username, password, name } = req.body;

        if (!apiUrl || !username || !password) {
            return res.status(400).json({ 
                error: 'API URL, kullanıcı adı ve şifre gereklidir.' 
            });
        }

        // Normalize URL — remove trailing slash and /token if present
        let baseUrl = apiUrl.replace(/\/+$/, '');
        if (baseUrl.endsWith('/token')) {
            baseUrl = baseUrl.replace(/\/token$/, '');
        }
        if (baseUrl.endsWith('/DynamicDataApi')) {
            baseUrl = baseUrl.replace(/\/DynamicDataApi$/, '');
        }
        
        const tokenUrl = `${baseUrl}/DynamicDataApi/token`;

        console.log(`🏥 [HealthSystem] Connecting to: ${tokenUrl}`);

        // Request Bearer token via OAuth Password Grant
        const tokenResponse = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                grant_type: 'password',
                username: username,
                password: password
            }).toString()
        });

        if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text();
            console.error(`❌ [HealthSystem] Token request failed: ${tokenResponse.status}`, errorText);
            return res.status(401).json({
                error: 'Bağlantı başarısız. Kullanıcı adı veya şifre hatalı olabilir.',
                details: tokenResponse.status
            });
        }

        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;

        if (!accessToken) {
            return res.status(400).json({ 
                error: 'Token alınamadı. API yanıtında access_token bulunamadı.' 
            });
        }

        console.log(`✅ [HealthSystem] Token received successfully`);

        // Check if a health system integration already exists for this workspace
        const existing = await prisma.apiIntegration.findFirst({
            where: {
                workspaceId,
                authType: 'OAUTH_PASSWORD',
                isActive: true
            }
        });

        let integration;

        if (existing) {
            // Update existing integration
            integration = await prisma.apiIntegration.update({
                where: { id: existing.id },
                data: {
                    name: name || 'Sağlık Sistemi API',
                    baseUrl,
                    authToken: accessToken,
                    apiKey: username,      // Store username encrypted
                    apiSecret: password,   // Store password encrypted
                    headers: JSON.stringify({
                        tokenExpiresIn: tokenData.expires_in || null,
                        tokenType: tokenData.token_type || 'bearer',
                        connectedAt: new Date().toISOString()
                    }),
                    isActive: true,
                    updatedAt: new Date()
                }
            });
            console.log(`🔄 [HealthSystem] Updated existing integration: ${integration.id}`);
        } else {
            // Create new integration
            integration = await prisma.apiIntegration.create({
                data: {
                    workspaceId,
                    name: name || 'Sağlık Sistemi API',
                    baseUrl,
                    authType: 'OAUTH_PASSWORD',
                    authToken: accessToken,
                    apiKey: username,      // Store username
                    apiSecret: password,   // Store password
                    headers: JSON.stringify({
                        tokenExpiresIn: tokenData.expires_in || null,
                        tokenType: tokenData.token_type || 'bearer',
                        connectedAt: new Date().toISOString()
                    }),
                    isActive: true
                }
            });
            console.log(`✅ [HealthSystem] Created new integration: ${integration.id}`);
        }

        res.json({
            success: true,
            integration: {
                id: integration.id,
                name: integration.name,
                baseUrl: integration.baseUrl,
                authType: integration.authType,
                isActive: integration.isActive,
                connectedAt: new Date().toISOString()
            },
            message: 'Sağlık Sistemi API bağlantısı başarıyla kuruldu.'
        });

    } catch (error) {
        console.error('❌ [HealthSystem] Connect error:', error);
        
        // Network error handling
        if (error.cause?.code === 'ECONNREFUSED' || error.cause?.code === 'ENOTFOUND') {
            return res.status(502).json({ 
                error: 'API adresine bağlanılamadı. URL\'yi kontrol edin.' 
            });
        }
        
        res.status(500).json({ 
            error: 'Bağlantı kurulurken bir hata oluştu.',
            details: error.message 
        });
    }
};


/**
 * POST /:workspaceId/test
 * Mevcut bağlantıyı test eder — token'ı yeniler
 */
export const testConnection = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { integrationId } = req.body;

        const integration = await prisma.apiIntegration.findFirst({
            where: {
                id: integrationId,
                workspaceId,
                authType: 'OAUTH_PASSWORD'
            }
        });

        if (!integration) {
            return res.status(404).json({ error: 'Bağlantı bulunamadı.' });
        }

        const username = integration.apiKey;
        const password = integration.apiSecret;
        const tokenUrl = `${integration.baseUrl}/token`;

        // Try to get a fresh token
        const tokenResponse = await fetch(tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'password',
                username,
                password
            }).toString()
        });

        if (!tokenResponse.ok) {
            return res.json({
                success: false,
                message: 'Token yenilenemedi. Kimlik bilgileri geçersiz olabilir.'
            });
        }

        const tokenData = await tokenResponse.json();
        const newToken = tokenData.access_token;

        // Update stored token
        await prisma.apiIntegration.update({
            where: { id: integration.id },
            data: {
                authToken: newToken,
                headers: JSON.stringify({
                    tokenExpiresIn: tokenData.expires_in || null,
                    tokenType: tokenData.token_type || 'bearer',
                    connectedAt: new Date().toISOString(),
                    lastTestedAt: new Date().toISOString()
                })
            }
        });

        res.json({
            success: true,
            message: 'Bağlantı aktif. Token başarıyla yenilendi.'
        });

    } catch (error) {
        console.error('❌ [HealthSystem] Test error:', error);
        res.json({
            success: false,
            message: 'Bağlantı testi başarısız: ' + error.message
        });
    }
};


/**
 * GET /:workspaceId/status
 * Workspace'deki sağlık sistemi bağlantı durumunu döner
 */
export const getConnectionStatus = async (req, res) => {
    try {
        const { workspaceId } = req.params;

        const integration = await prisma.apiIntegration.findFirst({
            where: {
                workspaceId,
                authType: 'OAUTH_PASSWORD',
                isActive: true
            }
        });

        if (!integration) {
            return res.json({ connected: false });
        }

        let metadata = {};
        try { metadata = JSON.parse(integration.headers || '{}'); } catch (e) {}

        res.json({
            connected: true,
            integration: {
                id: integration.id,
                name: integration.name,
                baseUrl: integration.baseUrl,
                assignedBotId: integration.assignedBotId || null,
                connectedAt: metadata.connectedAt || integration.createdAt,
                lastTestedAt: metadata.lastTestedAt || null
            }
        });

    } catch (error) {
        console.error('❌ [HealthSystem] Status error:', error);
        res.status(500).json({ error: 'Durum sorgulanırken hata oluştu.' });
    }
};


/**
 * DELETE /:workspaceId/disconnect/:id
 * Bağlantıyı siler
 */
export const disconnectHealthSystem = async (req, res) => {
    try {
        const { workspaceId, id } = req.params;

        const integration = await prisma.apiIntegration.findFirst({
            where: { id, workspaceId, authType: 'OAUTH_PASSWORD' }
        });

        if (!integration) {
            return res.status(404).json({ error: 'Bağlantı bulunamadı.' });
        }

        await prisma.apiIntegration.delete({
            where: { id }
        });

        console.log(`🗑️ [HealthSystem] Disconnected: ${id}`);

        res.json({
            success: true,
            message: 'Sağlık Sistemi API bağlantısı kesildi.'
        });

    } catch (error) {
        console.error('❌ [HealthSystem] Disconnect error:', error);
        res.status(500).json({ error: 'Bağlantı kesilirken hata oluştu.' });
    }
};
/**
 * PUT /:workspaceId/bot/:id
 * Body: { assignedBotId }
 * Bot ataması yapar
 */
export const updateHealthBot = async (req, res) => {
    try {
        const { workspaceId, id } = req.params;
        const { assignedBotId } = req.body;

        const integration = await prisma.apiIntegration.findFirst({
            where: { id, workspaceId }
        });

        if (!integration) {
            return res.status(404).json({ error: 'Bağlantı bulunamadı.' });
        }

        await prisma.apiIntegration.update({
            where: { id },
            data: { assignedBotId: assignedBotId || null }
        });

        res.json({ success: true, message: 'Bot ataması güncellendi.' });
    } catch (error) {
        console.error('❌ [HealthSystem] Update bot error:', error);
        res.status(500).json({ error: 'Bot ataması yapılırken hata oluştu.' });
    }
};


/**
 * Token yenileme helper — diğer servisler tarafından çağrılır
 * Mevcut token'ı kullanarak API'ye istek atar, 401 alırsa token'ı yeniler
 */
export async function refreshHealthSystemToken(workspaceId) {
    const integration = await prisma.apiIntegration.findFirst({
        where: { workspaceId, authType: 'OAUTH_PASSWORD', isActive: true }
    });

    if (!integration) return null;

    const tokenUrl = `${integration.baseUrl}/token`;
    
    try {
        const tokenResponse = await fetch(tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'password',
                username: integration.apiKey,
                password: integration.apiSecret
            }).toString()
        });

        if (!tokenResponse.ok) return null;

        const tokenData = await tokenResponse.json();
        const newToken = tokenData.access_token;

        await prisma.apiIntegration.update({
            where: { id: integration.id },
            data: { authToken: newToken }
        });

        return newToken;
    } catch (error) {
        console.error('❌ [HealthSystem] Token refresh failed:', error.message);
        return null;
    }
}
