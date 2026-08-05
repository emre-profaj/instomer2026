import axios from 'axios';
import prisma from '../lib/prisma.js';

class DisaoService {
    constructor() {
        this.tokens = new Map();
        this.tokenExpiries = new Map();
        this.baseURL = 'https://disao.net/service/api';
    }

    async getWorkspaceSettings(workspaceId) {
        if (!workspaceId) return null;
        try {
            const workspace = await prisma.workspace.findUnique({
                where: { id: workspaceId },
                select: { disaoCrmEnabled: true, disaoCrmSettings: true }
            });
            if (!workspace || !workspace.disaoCrmEnabled || !workspace.disaoCrmSettings) {
                return null;
            }
            
            // Assuming settings is a JSON object with properties
            const settings = typeof workspace.disaoCrmSettings === 'string' 
                ? JSON.parse(workspace.disaoCrmSettings) 
                : workspace.disaoCrmSettings;
                
            return {
                username: settings.username || '',
                password: settings.password || '',
                nationality: parseInt(settings.nationality || '1', 10),
                recordType: parseInt(settings.recordType || '2', 10),
                projectId: parseInt(settings.projectId || '131', 10),
                userId: parseInt(settings.userId || '471', 10),
            };
        } catch (err) {
            console.error('❌ [DisaoService] Error fetching workspace settings:', err.message);
            return null;
        }
    }

    async login(workspaceId, settings) {
        if (!settings || !settings.username || !settings.password) {
            console.warn(`⚠️ [DisaoService] Missing username/password for workspace ${workspaceId}`);
            return null;
        }

        try {
            console.log(`🔄 [DisaoService] Authenticating with Disao CRM for workspace ${workspaceId}...`);
            const response = await axios.post(`${this.baseURL}/login`, {
                email: settings.username.trim(),
                password: settings.password.trim()
            }, {
                headers: { 'Content-Type': 'application/json' }
            });

            const data = response.data;
            const token = data.accessToken || data.token || data.access_token || (data.data && data.data.token);
            
            if (token) {
                this.tokens.set(workspaceId, token);
                // expires in seconds, subtract a minute for safety
                const expiresIn = data.expiresIn || data.expires_in || 3600;
                const expiresInMs = (expiresIn - 60) * 1000;
                this.tokenExpiries.set(workspaceId, Date.now() + expiresInMs);
                console.log(`✅ [DisaoService] Authentication successful for workspace ${workspaceId}.`);
                return token;
            } else {
                console.warn(`⚠️ [DisaoService] Login succeeded but no token found in response:`, data);
            }
        } catch (error) {
            console.error(`❌ [DisaoService] Login failed for workspace ${workspaceId}:`, error.response?.data || error.message);
        }
        return null;
    }

    async getToken(workspaceId, settings) {
        const token = this.tokens.get(workspaceId);
        const expiry = this.tokenExpiries.get(workspaceId);
        if (token && expiry && Date.now() < expiry) {
            return token;
        }
        return await this.login(workspaceId, settings);
    }

    async testConnection(settings) {
        if (!settings || !settings.username || !settings.password) {
            return { success: false, error: 'Eksik kullanıcı adı veya şifre.' };
        }
        try {
            const response = await axios.post(`${this.baseURL}/login`, {
                email: settings.username.trim(),
                password: settings.password.trim()
            }, {
                headers: { 'Content-Type': 'application/json' }
            });

            const data = response.data;
            const token = data.accessToken || data.token || data.access_token || (data.data && data.data.token);

            if (token) {
                return { success: true };
            }
            return { success: false, error: 'Giriş başarılı ancak token bulunamadı. Gelen veri: ' + JSON.stringify(data) };
        } catch (error) {
            const errorMsg = error.response?.data?.message || error.response?.data?.error || error.message;
            return { success: false, error: `Bağlantı hatası: ${errorMsg} (Durum: ${error.response?.status})` };
        }
    }

    /**
     * Send lead/customer data to Disao CRM
     * @param {string} workspaceId
     * @param {Object} data 
     */
    async addCustomer(workspaceId, data) {
        try {
            const settings = await this.getWorkspaceSettings(workspaceId);
            if (!settings) {
                console.log(`ℹ️ [DisaoService] Disao CRM is not enabled or configured for workspace ${workspaceId}. Skipping.`);
                return false;
            }

            const token = await this.getToken(workspaceId, settings);
            if (!token) {
                console.error(`❌ [DisaoService] Cannot add customer: No access token available for workspace ${workspaceId}.`);
                return false;
            }

            // Split fullname to name and surname
            let name = 'Müşteri';
            let surname = 'Yeni';
            
            if (data.fullName) {
                const parts = data.fullName.trim().split(/\s+/);
                if (parts.length > 1) {
                    surname = parts.pop();
                    name = parts.join(' ');
                } else {
                    name = parts[0] || 'Müşteri';
                    surname = 'Yeni';
                }
            }

            let phone = data.phoneNumber || '';
            let phoneCode = '+90';
            
            // basic cleanup for TR phones if needed
            if (phone.startsWith('+90')) {
                phone = phone.replace('+90', '');
                phoneCode = '+90';
            } else if (phone.startsWith('90') && phone.length === 12) {
                phone = phone.substring(2);
                phoneCode = '+90';
            } else if (phone.startsWith('0')) {
                phone = phone.substring(1);
            }
            
            phone = phone.replace(/\s+/g, '');

            const payload = {
                name: name,
                surname: surname,
                phoneNumber: phone,
                mail: data.mail || '',
                job: "",
                idAdvice: 21,
                note: "Otomatik Sistem Kaydı",
                phoneCode: phoneCode,
                nationality: settings.nationality,
                recordType: settings.recordType,
                idProject: settings.projectId,
                housingUnitType: "",
                customerStatus: 1,
                idUser: settings.userId
            };

            console.log(`📤 [DisaoService] Sending customer data: ${name} ${surname} (Workspace: ${workspaceId})`);
            
            const response = await axios.post(`${this.baseURL}/customer/add`, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });

            console.log(`✅ [DisaoService] Customer added successfully. Response:`, response.data);
            return true;
        } catch (error) {
            console.error('❌ [DisaoService] Add customer failed:', error.response?.data || error.message);
            return false;
        }
    }
}

export const disaoService = new DisaoService();
