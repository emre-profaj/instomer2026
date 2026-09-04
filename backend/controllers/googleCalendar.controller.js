import {
    getAuthUrl,
    handleOAuthCallback,
    getUserGoogleCalendarStatus,
    disconnectCalendar,
    getWorkspaceGoogleConfig,
    saveWorkspaceGoogleConfig,
    deleteWorkspaceGoogleConfig,
    getGoogleCalendarEvents
} from '../services/googleCalendar.service.js';

/**
 * Giriş yapmış temsilci için Google OAuth izin URL'si döner
 */
export const getGoogleAuthUrl = async (req, res) => {
    try {
        const { workspaceId } = req.query;
        if (!workspaceId) {
            return res.status(400).json({ error: 'workspaceId gereklidir' });
        }

        const url = await getAuthUrl(workspaceId, req.user.id, req);
        res.json({ url });
    } catch (error) {
        console.error('getGoogleAuthUrl error:', error);
        res.status(500).json({ error: error.message || 'Google yetkilendirme linki üretilemedi' });
    }
};

/**
 * Google OAuth Callback
 */
export const handleGoogleCallback = async (req, res) => {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    try {
        const { code, state } = req.query;
        if (!code) {
            return res.redirect(`${frontendUrl}/calendar?google_error=Kod_bulunamadi`);
        }

        const result = await handleOAuthCallback(code, state, req);
        res.redirect(`${frontendUrl}/calendar?google_connected=true&workspaceId=${result.workspaceId}&email=${encodeURIComponent(result.userEmail)}`);
    } catch (error) {
        console.error('handleGoogleCallback error:', error);
        res.redirect(`${frontendUrl}/calendar?google_error=${encodeURIComponent(error.message || 'Yetkilendirme_basarisiz')}`);
    }
};

/**
 * Giriş yapmış temsilcinin belirli bir workspace için Google Takvim bağlantı durumu
 */
export const getGoogleCalendarStatus = async (req, res) => {
    try {
        const workspaceId = req.query.workspaceId || req.headers['x-workspace-id'];
        if (!workspaceId) {
            return res.json({ isConnected: false, isWorkspaceConfigured: false, email: null });
        }
        const status = await getUserGoogleCalendarStatus(req.user.id, workspaceId);
        res.json(status);
    } catch (error) {
        console.error('getGoogleCalendarStatus error:', error);
        res.status(500).json({ error: 'Bağlantı durumu alınamadı' });
    }
};

/**
 * Google Takvim bağlantısını belirli bir workspace için kes
 */
export const disconnectGoogleCalendar = async (req, res) => {
    try {
        const workspaceId = req.body.workspaceId || req.query.workspaceId || req.headers['x-workspace-id'];
        if (!workspaceId) {
            return res.status(400).json({ error: 'workspaceId zorunludur' });
        }
        await disconnectCalendar(req.user.id, workspaceId);
        res.json({ success: true, message: 'Google Takvim bağlantısı kesildi' });
    } catch (error) {
        console.error('disconnectGoogleCalendar error:', error);
        res.status(500).json({ error: 'Bağlantı kesilirken hata oluştu' });
    }
};

/**
 * Workspace için Google Takvim entegrasyon yapılandırmasını getirir
 */
export const getWorkspaceConfig = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        if (!workspaceId) return res.status(400).json({ error: 'workspaceId zorunludur' });

        const config = await getWorkspaceGoogleConfig(workspaceId, req);
        res.json(config);
    } catch (error) {
        console.error('getWorkspaceConfig error:', error);
        res.status(500).json({ error: error.message || 'Ayarlar alınamadı' });
    }
};

/**
 * Workspace için Google Takvim entegrasyonunu kaydeder
 */
export const saveWorkspaceConfig = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { clientId, clientSecret } = req.body;

        if (!workspaceId) return res.status(400).json({ error: 'workspaceId zorunludur' });
        if (!clientId || !clientSecret) {
            return res.status(400).json({ error: 'Client ID ve Client Secret zorunludur' });
        }

        const result = await saveWorkspaceGoogleConfig(workspaceId, { clientId, clientSecret });
        res.json(result);
    } catch (error) {
        console.error('saveWorkspaceConfig error:', error);
        res.status(500).json({ error: error.message || 'Ayarlar kaydedilemedi' });
    }
};

/**
 * Workspace için Google Takvim yapılandırmasını siler
 */
export const deleteWorkspaceConfig = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        if (!workspaceId) return res.status(400).json({ error: 'workspaceId zorunludur' });

        const result = await deleteWorkspaceGoogleConfig(workspaceId);
        res.json(result);
    } catch (error) {
        console.error('deleteWorkspaceConfig error:', error);
        res.status(500).json({ error: error.message || 'Ayarlar silinemedi' });
    }
};

/**
 * Temsilcinin Google Takvimindeki etkinlikleri çeker
 */
export const getGoogleEvents = async (req, res) => {
    try {
        const workspaceId = req.query.workspaceId || req.headers['x-workspace-id'];
        const { startDate, endDate, assignedToId } = req.query;

        if (!workspaceId) {
            return res.status(400).json({ error: 'workspaceId zorunludur' });
        }

        const targetUserId = assignedToId || 'all';
        const result = await getGoogleCalendarEvents(targetUserId, workspaceId, { startDate, endDate });

        const events = Array.isArray(result) ? result : (result.events || []);
        const tokenExpired = result.tokenExpired || false;

        res.json({ events, tokenExpired });
    } catch (error) {
        console.error('getGoogleEvents error:', error);
        res.status(500).json({ error: 'Google Takvim etkinlikleri alınamadı', message: error.message });
    }
};
