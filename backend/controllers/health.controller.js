import prisma from '../lib/prisma.js';
import axios from 'axios';

// ─── Token Cache (workspace bazlı) ──────────────────────────────────────────
const tokenCache = new Map(); // { workspaceId: { token, expiresAt } }

async function getProbelToken(config) {
    const cached = tokenCache.get(config.workspaceId);
    if (cached && cached.expiresAt > Date.now()) return cached.token;

    const baseUrl = config.apiUrl.replace(/\/+$/, '');
    const res = await axios.post(`${baseUrl}/DynamicDataApi/token`, 
        `grant_type=password&username=${encodeURIComponent(config.username)}&password=${encodeURIComponent(config.password)}`,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
    );

    const token = res.data.access_token;
    const expiresIn = res.data.expires_in || 3600;
    tokenCache.set(config.workspaceId, { token, expiresAt: Date.now() + (expiresIn - 60) * 1000 });
    return token;
}

async function callProbel(config, storedProcedure, inputData) {
    const token = await getProbelToken(config);
    const baseUrl = config.apiUrl.replace(/\/+$/, '');
    const res = await axios.post(`${baseUrl}/DynamicDataApi/api/oracle/runasync`, {
        stored_procedure: storedProcedure,
        cursor_list: ['ref_out_list'],
        input_data: inputData,
    }, {
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        timeout: 15000,
    });
    return res.data;
}

async function getConfig(workspaceId) {
    const mod = await prisma.healthModule.findUnique({ where: { workspaceId } });
    if (!mod || !mod.isActive) throw new Error('Sağlık modülü aktif değil.');
    return { workspaceId, apiUrl: mod.apiUrl, username: mod.username, password: mod.password };
}

// ─── Ayarlar CRUD ───────────────────────────────────────────────────────────

const getSettings = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const mod = await prisma.healthModule.findUnique({ where: { workspaceId } });
        if (!mod) return res.json({ success: true, settings: null });
        res.json({ success: true, settings: { ...mod, password: '••••••••' } });
    } catch (error) {
        console.error('health getSettings error:', error);
        res.status(500).json({ success: false, message: 'Ayarlar alınamadı.' });
    }
};

const updateSettings = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { apiUrl, username, password, isActive } = req.body;

        const existing = await prisma.healthModule.findUnique({ where: { workspaceId } });

        const data = {
            apiUrl: apiUrl?.replace(/\/+$/, ''), // trailing slash temizle
            username,
            password: password === '••••••••' ? existing?.password : password,
            isActive: isActive ?? true,
        };

        const mod = await prisma.healthModule.upsert({
            where: { workspaceId },
            update: data,
            create: { workspaceId, ...data },
        });

        tokenCache.delete(workspaceId); // Cache'i temizle
        res.json({ success: true, settings: { ...mod, password: '••••••••' } });
    } catch (error) {
        console.error('health updateSettings error:', error);
        res.status(500).json({ success: false, message: 'Ayarlar kaydedilemedi.' });
    }
};

// ─── Bağlantı Testi ─────────────────────────────────────────────────────────

const testConnection = async (req, res) => {
    try {
        const { apiUrl, username, password } = req.body;
        const url = apiUrl?.replace(/\/+$/, '');

        const tokenRes = await axios.post(`${url}/DynamicDataApi/token`,
            `grant_type=password&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
        );

        if (tokenRes.data?.access_token) {
            res.json({ success: true, message: 'Bağlantı başarılı!' });
        } else {
            res.json({ success: false, message: 'Token alınamadı.' });
        }
    } catch (error) {
        const msg = error.response?.data?.error_description || error.message || 'Bağlantı başarısız.';
        res.json({ success: false, message: msg });
    }
};

// ─── Probel API Proxy Endpoint'leri ─────────────────────────────────────────

const getPatientToken = async (req, res) => {
    try {
        const config = await getConfig(req.params.workspaceId);
        const data = await callProbel(config, 'PKG_HSW_MBL_API.prc_get_hasta_token', req.body);
        res.json({ success: true, data });
    } catch (error) {
        console.error('getPatientToken error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

const getBranches = async (req, res) => {
    try {
        const config = await getConfig(req.params.workspaceId);
        const data = await callProbel(config, 'PKG_HSW_MBL_API.prc_get_sube_list', { SUBE_KODU: req.query.subeKodu || '' });
        res.json({ success: true, data });
    } catch (error) {
        console.error('getBranches error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

const getDepartments = async (req, res) => {
    try {
        const config = await getConfig(req.params.workspaceId);
        const data = await callProbel(config, 'PKG_HSW_MBL_API.prc_get_brans_list', req.body);
        res.json({ success: true, data });
    } catch (error) {
        console.error('getDepartments error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

const getPolyclinics = async (req, res) => {
    try {
        const config = await getConfig(req.params.workspaceId);
        const data = await callProbel(config, 'PKG_HSW_MBL_API.prc_get_poliklinik_list', req.body);
        res.json({ success: true, data });
    } catch (error) {
        console.error('getPolyclinics error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

const getAvailableDays = async (req, res) => {
    try {
        const config = await getConfig(req.params.workspaceId);
        const data = await callProbel(config, 'PKG_HSW_MBL_API.prc_get_uygun_gunler_list', req.body);
        res.json({ success: true, data });
    } catch (error) {
        console.error('getAvailableDays error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

const getAvailableHours = async (req, res) => {
    try {
        const config = await getConfig(req.params.workspaceId);
        const data = await callProbel(config, 'PKG_HSW_MBL_API.prc_get_uygun_saatler_list', req.body);
        res.json({ success: true, data });
    } catch (error) {
        console.error('getAvailableHours error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

const createAppointment = async (req, res) => {
    try {
        const config = await getConfig(req.params.workspaceId);
        const data = await callProbel(config, 'PKG_HSW_MBL_API.prc_set_randevu_bilgisi', req.body);
        res.json({ success: true, data });
    } catch (error) {
        console.error('createAppointment error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

const cancelAppointment = async (req, res) => {
    try {
        const config = await getConfig(req.params.workspaceId);
        const data = await callProbel(config, 'PKG_HSW_MBL_API.prc_set_randevu_iptal', req.body);
        res.json({ success: true, data });
    } catch (error) {
        console.error('cancelAppointment error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

const listAppointments = async (req, res) => {
    try {
        const config = await getConfig(req.params.workspaceId);
        const data = await callProbel(config, 'PKG_HSW_MBL_API.prc_hasta_randevu_listesi', req.body);
        res.json({ success: true, data });
    } catch (error) {
        console.error('listAppointments error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

export default {
    getSettings,
    updateSettings,
    testConnection,
    getPatientToken,
    getBranches,
    getDepartments,
    getPolyclinics,
    getAvailableDays,
    getAvailableHours,
    createAppointment,
    cancelAppointment,
    listAppointments,
};
