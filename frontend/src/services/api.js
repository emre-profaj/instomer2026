import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json'
    }
});

// Add token to requests
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Guard against multiple simultaneous 401 redirects
let isRedirectingToLogin = false;

// Handle response errors
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        // Handle network errors (server down/restarting) — retry once after delay
        if (!error.response && !originalRequest._networkRetried) {
            originalRequest._networkRetried = true;
            console.warn('⚠️ Network error — server may be restarting. Retrying in 3s...');
            await new Promise(resolve => setTimeout(resolve, 3000));
            try {
                return await api(originalRequest);
            } catch (retryError) {
                // Still failing — let it propagate silently, don't redirect
                return Promise.reject(retryError);
            }
        }

        // Handle 401 Unauthorized - retry once before giving up (handles restart transients)
        if (error.response?.status === 401 && !originalRequest._retried) {
            originalRequest._retried = true;
            // Wait 2 seconds and retry — server may be restarting
            await new Promise(resolve => setTimeout(resolve, 2000));
            try {
                return await api(originalRequest);
            } catch (retryError) {
                // Retry also failed — token is genuinely invalid
                if (retryError.response?.status === 401 && !isRedirectingToLogin) {
                    isRedirectingToLogin = true;
                    localStorage.removeItem('token');
                    localStorage.removeItem('user');
                    localStorage.removeItem('currentWorkspace');
                    window.location.replace('/login');
                }
                return Promise.reject(retryError);
            }
        }

        // Already retried 401, prevent duplicate redirects
        if (error.response?.status === 401 && !isRedirectingToLogin) {
            isRedirectingToLogin = true;
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            localStorage.removeItem('currentWorkspace');
            window.location.replace('/login');
            return Promise.reject(error);
        }

        // Handle 429 Too Many Requests - rate limiting
        if (error.response?.status === 429) {
            console.warn('⚠️ Rate limited (429). Too many requests.');
            // Don't retry automatically - just let it fail gracefully
        }

        return Promise.reject(error);
    }
);

// Admin API
export const adminAPI = {
    getStats: () => api.get('/admin/stats'),
    getUsers: () => api.get('/admin/users'),
    createUser: (userData) => api.post('/admin/users', userData),
    updateUserRole: (userId, role) => api.put(`/admin/users/${userId}/role`, { role }),
    updateUser: (userId, data) => api.patch(`/admin/users/${userId}`, data),
    deleteUser: (userId) => api.delete(`/admin/users/${userId}`),
    getWorkspaces: () => api.get('/admin/workspaces'),
    createWorkspace: (data) => api.post('/admin/workspaces', data),
    updateWorkspace: (id, data) => api.put(`/admin/workspaces/${id}`, data),
    deleteWorkspace: (workspaceId) => api.delete(`/admin/workspaces/${workspaceId}`),
    // Workspace Detail & Members
    getWorkspaceDetail: (workspaceId) => api.get(`/admin/workspaces/${workspaceId}`),
    addMemberToWorkspace: (workspaceId, data) => api.post(`/admin/workspaces/${workspaceId}/members`, data),
    removeMemberFromWorkspace: (workspaceId, memberId) => api.delete(`/admin/workspaces/${workspaceId}/members/${memberId}`),
    updateMemberRole: (workspaceId, memberId, data) => api.put(`/admin/workspaces/${workspaceId}/members/${memberId}`, data),
    // Create user directly for a workspace (handles existing users)
    createUserForWorkspace: (workspaceId, userData) => api.post(`/admin/workspaces/${workspaceId}/users`, userData),
    // AI Usage Limit Management
    getSubscriptionPlans: () => api.get('/admin/subscription-plans'),
    getWorkspaceAiUsage: (workspaceId) => api.get(`/admin/workspaces/${workspaceId}/ai-usage`),
    updateWorkspaceAiLimit: (workspaceId, data) => api.put(`/admin/workspaces/${workspaceId}/ai-limit`, data),
    resetWorkspaceAiCounter: (workspaceId) => api.post(`/admin/workspaces/${workspaceId}/ai-reset`),
    // Global Settings (AI API Key, etc.)
    getGlobalSettings: () => api.get('/admin/global-settings'),
    updateGlobalSettings: (data) => api.put('/admin/global-settings', data),
    // Facebook/Instagram Health Check
    checkFacebookHealth: () => api.get('/admin/facebook/health-check')
};

export default api;

// Auth API
export const authAPI = {
    register: (data) => api.post('/auth/register', data),
    login: (data) => api.post('/auth/login', data),
    getCurrentUser: () => api.get('/auth/me'),
    facebookLogin: () => {
        window.location.href = `${API_URL}/auth/facebook`;
    }
};

// Workspace API
export const workspaceAPI = {
    create: (data) => api.post('/workspaces', data),
    getAll: () => api.get('/workspaces'),
    getById: (id) => api.get(`/workspaces/${id}`),
    getMembers: (id) => api.get(`/workspaces/${id}/members`),
    addMember: (id, data) => api.post(`/workspaces/${id}/members`, data),
    updateMemberRole: (workspaceId, userId, data) =>
        api.put(`/workspaces/${workspaceId}/members/${userId}`, data),
    removeMember: (workspaceId, userId) =>
        api.delete(`/workspaces/${workspaceId}/members/${userId}`),
    changeMemberPassword: (workspaceId, userId, newPassword) =>
        api.put(`/workspaces/${workspaceId}/members/${userId}/password`, { newPassword }),
    updateMemberInfo: (workspaceId, userId, data) =>
        api.patch(`/workspaces/${workspaceId}/members/${userId}/info`, data),
    delete: (workspaceId) => api.delete(`/workspaces/${workspaceId}`),
    // Company Info
    getCompanyInfo: (workspaceId) => api.get(`/workspaces/${workspaceId}/company`),
    updateCompanyInfo: (workspaceId, data) => api.put(`/workspaces/${workspaceId}/company`, data),
    uploadCompanyLogo: (workspaceId, formData) => api.post(`/workspaces/${workspaceId}/company/logo`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    }),
    deleteCompanyLogo: (workspaceId) => api.delete(`/workspaces/${workspaceId}/company/logo`),
    // Alt Workspace (Sub-Workspace) API
    getParentStatus: (workspaceId) => api.get(`/workspaces/${workspaceId}/parent-status`),
    getSubWorkspaces: (workspaceId) => api.get(`/workspaces/${workspaceId}/sub-workspaces`),
    createSubWorkspace: (workspaceId, data) => api.post(`/workspaces/${workspaceId}/sub-workspaces`, data),
    updateSubWorkspace: (workspaceId, subWorkspaceId, data) =>
        api.put(`/workspaces/${workspaceId}/sub-workspaces/${subWorkspaceId}`, data),
    deleteSubWorkspace: (workspaceId, subWorkspaceId) =>
        api.delete(`/workspaces/${workspaceId}/sub-workspaces/${subWorkspaceId}`),
    // AI Usage
    getAiUsage: (workspaceId) => api.get(`/workspaces/${workspaceId}/ai-usage`)
};

// Facebook API
export const facebookAPI = {
    connectPage: (data) => api.post('/facebook/pages/connect', data),
    getPages: (workspaceId) => api.get(`/facebook/pages/${workspaceId}`),
    getAvailablePages: () => api.get('/facebook/pages/available'),
    disconnectPage: (pageId, channelType) => api.delete(`/facebook/pages/${pageId}`, { params: { channelType } }),
    getContactProfile: (conversationId) => api.get(`/facebook/contact-profile/${conversationId}`),
    addContactTag: (conversationId, tag) => api.post(`/facebook/contact-profile/${conversationId}/tags`, { tag }),
    removeContactTag: (conversationId, tag) => api.delete(`/facebook/contact-profile/${conversationId}/tags`, { data: { tag } }),

    // Post and Comment Management
    getPosts: (pageId) => api.get(`/facebook/posts/${pageId}`),
    getInstagramPosts: (instagramBusinessId, workspaceId) => api.get(`/facebook/instagram/${instagramBusinessId}/media?workspaceId=${workspaceId}`),
    getPostComments: (postId, workspaceId, pageId, instagramBusinessId) => api.get(`/facebook/posts/${postId}/comments?workspaceId=${workspaceId}&pageId=${pageId || ''}${instagramBusinessId ? `&instagramBusinessId=${instagramBusinessId}` : ''}`),
    createComment: (postId, data) => api.post(`/facebook/posts/${postId}/comments`, data),
    updateComment: (commentId, workspaceId, data) => api.patch(`/facebook/comments/${commentId}?workspaceId=${workspaceId}`, data),
    deleteComment: (commentId, workspaceId) => api.delete(`/facebook/comments/${commentId}?workspaceId=${workspaceId}`),
    updatePageBot: (pageId, data) => api.patch(`/facebook/pages/${pageId}/bot`, data),

    // Diagnostic endpoints
    checkPageHealth: (pageId) => api.get(`/facebook/pages/${pageId}/health`),
    resubscribeWebhook: (pageId) => api.post(`/facebook/pages/${pageId}/resubscribe`),

    // Sync historical conversations with SSE progress
    syncHistoricalConversations: (workspaceId, data, onProgress) => {
        return new Promise((resolve, reject) => {
            const token = localStorage.getItem('token') || sessionStorage.getItem('token');

            fetch(`${api.defaults.baseURL}/facebook/sync-history/${workspaceId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(data)
            }).then(response => {
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';

                const processStream = async () => {
                    try {
                        while (true) {
                            const { done, value } = await reader.read();

                            if (done) {
                                break;
                            }

                            buffer += decoder.decode(value, { stream: true });

                            // Process complete SSE messages
                            const lines = buffer.split('\n');
                            buffer = lines.pop() || ''; // Keep incomplete line in buffer

                            for (const line of lines) {
                                if (line.startsWith('data: ')) {
                                    try {
                                        const data = JSON.parse(line.slice(6));

                                        if (onProgress) {
                                            onProgress(data);
                                        }

                                        if (data.type === 'complete') {
                                            resolve({ data });
                                        } else if (data.type === 'error') {
                                            reject(new Error(data.message));
                                        }
                                    } catch (e) {
                                        console.error('Error parsing SSE data:', e);
                                    }
                                }
                            }
                        }
                    } catch (error) {
                        reject(error);
                    }
                };

                processStream();
            }).catch(reject);
        });
    }
};

// Conversation API
export const conversationAPI = {
    getAll: (workspaceId, params) => api.get(`/conversations/${workspaceId}`, { params }),
    getUnreadCount: (workspaceId) => api.get(`/conversations/${workspaceId}/unread-count`),
    markAllAsRead: (workspaceId) => api.post(`/conversations/${workspaceId}/mark-all-read`),
    deleteAll: (workspaceId) => api.delete(`/conversations/${workspaceId}/delete-all`),
    getById: (workspaceId, conversationId) =>
        api.get(`/conversations/${workspaceId}/${conversationId}`),
    sendMessage: (workspaceId, conversationId, data) =>
        api.post(`/conversations/${workspaceId}/${conversationId}/messages`, data),
    assign: (workspaceId, conversationId, data) =>
        api.put(`/conversations/${workspaceId}/${conversationId}/assign`, data),
    updateStatus: (workspaceId, conversationId, data) =>
        api.put(`/conversations/${workspaceId}/${conversationId}/status`, data),
    delete: (workspaceId, conversationId) =>
        api.delete(`/conversations/${workspaceId}/${conversationId}`),

    // Create manual conversation
    createManual: (workspaceId, data) =>
        api.post(`/conversations/${workspaceId}/manual`, data),

    // Internal Notes
    addNote: (workspaceId, conversationId, data) => api.post(`/conversations/${workspaceId}/${conversationId}/notes`, data),
    getNotes: (workspaceId, conversationId) => api.get(`/conversations/${workspaceId}/${conversationId}/notes`),
    deleteNote: (workspaceId, conversationId, noteId) => api.delete(`/conversations/${workspaceId}/${conversationId}/notes/${noteId}`),

    // Transfer
    transfer: (workspaceId, conversationId, data) => api.post(`/conversations/${workspaceId}/${conversationId}/transfer`, data),
    getPendingTransfers: () => api.get('/conversations/transfers/pending'),
    acceptTransfer: (transferId) => api.post(`/conversations/transfers/${transferId}/accept`),
    rejectTransfer: (transferId) => api.post(`/conversations/transfers/${transferId}/reject`),

    // Bot Toggle
    getBotStatus: (workspaceId, conversationId) => api.get(`/conversations/${workspaceId}/${conversationId}/bot-status`),
    toggleBot: (workspaceId, conversationId, botEnabled) => api.put(`/conversations/${workspaceId}/${conversationId}/bot-toggle`, { botEnabled }),

    // Take Over - Agent kendi kendine üstlenir
    takeOver: (workspaceId, conversationId) => api.post(`/conversations/${workspaceId}/${conversationId}/take-over`),

    // Update aiTopic
    updateTopic: (workspaceId, conversationId, aiTopic) =>
        api.patch(`/conversations/${workspaceId}/${conversationId}/topic`, { aiTopic }),

    // Update funnelType
    updateFunnel: (workspaceId, conversationId, funnelType) =>
        api.patch(`/conversations/${workspaceId}/${conversationId}/funnel`, { funnelType })
};

// AI API
export const aiAPI = {
    updateSettings: (workspaceId, data) => api.put(`/ai/${workspaceId}/settings`, data),
    getSettings: (workspaceId) => api.get(`/ai/${workspaceId}/settings`),
    createBot: (workspaceId, data) => api.post(`/ai/${workspaceId}/bots`, data),
    getBots: (workspaceId) => api.get(`/ai/${workspaceId}/bots`),
    deleteBot: (workspaceId, botId) => api.delete(`/ai/${workspaceId}/bots/${botId}`),
    updateBot: (workspaceId, botId, data) => api.put(`/ai/${workspaceId}/bots/${botId}`, data),
    toggleStatus: (workspaceId, botId, isActive) => api.patch(`/ai/${workspaceId}/bots/${botId}/status`, { isActive }),

    // Documents
    getDocuments: (workspaceId, botId) => api.get(`/ai/${workspaceId}/bots/${botId}/documents`),
    uploadDocument: (workspaceId, botId, formData) => api.post(`/ai/${workspaceId}/bots/${botId}/documents`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    }),
    deleteDocument: (workspaceId, botId, docId) => api.delete(`/ai/${workspaceId}/bots/${botId}/documents/${docId}`),

    generateResponse: (workspaceId, data) => api.post(`/ai/${workspaceId}/generate`, data),
    summarizeConversation: (workspaceId, conversationId) => api.post(`/ai/${workspaceId}/summarize`, { conversationId }),
    updateConversationAnalysis: (workspaceId, conversationId, data) => api.put(`/ai/${workspaceId}/analysis/${conversationId}`, data),
    extractContactInfo: (workspaceId, conversationId) => api.post(`/ai/${workspaceId}/extract-info`, { conversationId }),
    getSuggestedReplies: (workspaceId, conversationId) => api.post(`/ai/${workspaceId}/suggest-replies`, { conversationId }),

    // Widget
    getWidgetSettings: (workspaceId) => api.get(`/ai/${workspaceId}/widget`),
    updateWidgetSettings: (workspaceId, data) => api.put(`/ai/${workspaceId}/widget`, data),

    // İnsto Bot
    instoBotChat: (workspaceId, message, history) => api.post(`/ai/${workspaceId}/insto-bot/chat`, { message, history })
};

export const whatsappAPI = {
    connect: (data) => api.post('/whatsapp/connect', data),
    embeddedSignup: (data) => api.post('/whatsapp/embedded-signup', data),
    listCandidates: (data) => api.post('/whatsapp/list-meta', data), // { userAccessToken }
    getPhoneNumbers: (workspaceId) => api.get(`/whatsapp/${workspaceId}`),
    disconnect: (id) => api.delete(`/whatsapp/${id}`),
    updateBot: (id, data) => api.patch(`/whatsapp/${id}/bot`, data)
};

export const emailAPI = {
    // Gmail OAuth
    getConnectUrl: (workspaceId) => api.get(`/email/google/connect?workspaceId=${workspaceId}`),
    getChannels: (workspaceId) => api.get(`/email/${workspaceId}`),
    sync: (id) => api.post(`/email/${id}/sync`),
    sendNew: (id, data) => api.post(`/email/${id}/send`, data),
    setupWatch: (id) => api.post(`/email/${id}/watch`),
    stopWatch: (id) => api.delete(`/email/${id}/watch`),
    delete: (id) => api.delete(`/email/${id}`),
    updateBot: (id, data) => api.patch(`/email/${id}/bot`, data),
    // IMAP/SMTP (Yandex, Webmail, Outlook)
    getPresets: () => api.get('/email/presets'),
    connectImap: (workspaceId, data) => api.post(`/email/${workspaceId}/connect-imap`, data)
};

export const teamAPI = {
    create: (workspaceId, data) => api.post(`/teams/${workspaceId}`, data),
    getWorkspaceTeams: (workspaceId) => api.get(`/teams/${workspaceId}`),
    update: (workspaceId, teamId, data) => api.put(`/teams/${workspaceId}/${teamId}`, data),
    delete: (workspaceId, teamId) => api.delete(`/teams/${workspaceId}/${teamId}`),
    getMembers: (workspaceId, teamId) => api.get(`/teams/${workspaceId}/${teamId}/members`),
    addMember: (workspaceId, teamId, data) => api.post(`/teams/${workspaceId}/${teamId}/members`, data),
    removeMember: (workspaceId, teamId, memberId, type = 'user') => api.delete(`/teams/${workspaceId}/${teamId}/members/${memberId}?type=${type}`)
};

// Channel Routing API - Kanal → Ekip Yönlendirme
export const channelRoutingAPI = {
    getAll: (workspaceId) => api.get(`/channel-routing/${workspaceId}`),
    upsert: (workspaceId, data) => api.post(`/channel-routing/${workspaceId}`, data),
    delete: (workspaceId, channel) => api.delete(`/channel-routing/${workspaceId}/${channel}`)
};

export const contactAPI = {
    getAll: (workspaceId, params) => api.get(`/contacts/${workspaceId}`, { params }),
    getById: (workspaceId, id) => api.get(`/contacts/${workspaceId}/${id}`),
    create: (workspaceId, data) => api.post(`/contacts/${workspaceId}`, data),
    update: (workspaceId, id, data) => api.put(`/contacts/${workspaceId}/${id}`, data),
    delete: (workspaceId, id) => api.delete(`/contacts/${workspaceId}/${id}`),
    getAnalytics: (workspaceId, params = {}) => api.get(`/contacts/${workspaceId}/analytics`, { params }),
    getAgentPerformance: (workspaceId, params = {}) => api.get(`/contacts/${workspaceId}/agent-performance`, { params }),
    block: (workspaceId, id, reason) => api.post(`/contacts/${workspaceId}/${id}/block`, { reason }),
    unblock: (workspaceId, id) => api.post(`/contacts/${workspaceId}/${id}/unblock`),
    archive: (workspaceId, id) => api.post(`/contacts/${workspaceId}/${id}/archive`),
    unarchive: (workspaceId, id) => api.post(`/contacts/${workspaceId}/${id}/unarchive`),
    addNote: (workspaceId, id, note) => api.post(`/contacts/${workspaceId}/${id}/note`, { note }),
    bulkImport: (workspaceId, data) => api.post(`/contacts/${workspaceId}/import`, data)
};

export const leadsAPI = {
    getAll: (workspaceId, params) => api.get(`/leads/${workspaceId}`, { params }),
    getStats: (workspaceId) => api.get(`/leads/${workspaceId}/stats`),
    sync: (workspaceId, pageId) => api.post(`/leads/${workspaceId}/sync`, { pageId }),
    getForms: (pageId) => api.get(`/leads/forms/${pageId}`),
    updateStatus: (leadId, data) => api.patch(`/leads/${leadId}`, data),
    delete: (leadId) => api.delete(`/leads/${leadId}`)
};

export const knowledgeBaseAPI = {
    getAll: (workspaceId) => api.get(`/knowledgebase/${workspaceId}`),
    addText: (workspaceId, data) => api.post(`/knowledgebase/${workspaceId}/text`, data),
    uploadFile: (workspaceId, formData) => api.post(`/knowledgebase/${workspaceId}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    }),
    update: (workspaceId, id, data) => api.put(`/knowledgebase/${workspaceId}/${id}`, data),
    delete: (workspaceId, id) => api.delete(`/knowledgebase/${workspaceId}/${id}`)
};

export const appointmentAPI = {
    getAll: (workspaceId, params) => api.get(`/appointments/${workspaceId}`, { params }),
    getById: (workspaceId, id) => api.get(`/appointments/${workspaceId}/${id}`),
    create: (workspaceId, data) => api.post(`/appointments/${workspaceId}`, data),
    update: (workspaceId, id, data) => api.put(`/appointments/${workspaceId}/${id}`, data),
    delete: (workspaceId, id) => api.delete(`/appointments/${workspaceId}/${id}`),
    getAvailability: (workspaceId, params) => api.get(`/appointments/${workspaceId}/availability`, { params }),
    getAgents: (workspaceId) => api.get(`/appointments/${workspaceId}/agents`)
};

// Automation & Template API
export const automationAPI = {
    // Templates
    getTemplates: (workspaceId) => api.get(`/automations/${workspaceId}/templates`),
    createTemplate: (workspaceId, data) => api.post(`/automations/${workspaceId}/templates`, data),
    updateTemplate: (workspaceId, templateId, data) => api.put(`/automations/${workspaceId}/templates/${templateId}`, data),
    deleteTemplate: (workspaceId, templateId) => api.delete(`/automations/${workspaceId}/templates/${templateId}`),
    syncTemplates: (workspaceId) => api.post(`/automations/${workspaceId}/templates/sync`),
    sendTemplate: (workspaceId, data) => api.post(`/automations/${workspaceId}/templates/send`, data),
    /**
     * Send template dynamically by name
     * @param {string} workspaceId - Workspace ID
     * @param {Object} data - { templateName, phoneNumber, customerName, variables?, headerMediaUrl? }
     */
    sendTemplateDynamic: (workspaceId, data) => api.post(`/automations/${workspaceId}/templates/send-dynamic`, data),

    // Automations
    getAutomations: (workspaceId) => api.get(`/automations/${workspaceId}/automations`),
    createAutomation: (workspaceId, data) => api.post(`/automations/${workspaceId}/automations`, data),
    updateAutomation: (workspaceId, automationId, data) => api.put(`/automations/${workspaceId}/automations/${automationId}`, data),
    deleteAutomation: (workspaceId, automationId) => api.delete(`/automations/${workspaceId}/automations/${automationId}`),
    toggleAutomation: (workspaceId, automationId, isActive) => api.patch(`/automations/${workspaceId}/automations/${automationId}/toggle`, { isActive })
};

// Form Webhook API
export const formWebhookAPI = {
    getWebhooks: (workspaceId) => api.get(`/form-webhooks/${workspaceId}/webhooks`),
    createWebhook: (workspaceId, data) => api.post(`/form-webhooks/${workspaceId}/webhooks`, data),
    updateWebhook: (workspaceId, webhookId, data) => api.put(`/form-webhooks/${workspaceId}/webhooks/${webhookId}`, data),
    deleteWebhook: (workspaceId, webhookId) => api.delete(`/form-webhooks/${workspaceId}/webhooks/${webhookId}`),

    getSubmissions: (workspaceId, params) => api.get(`/form-webhooks/${workspaceId}/submissions`, { params }),
    updateSubmissionStatus: (workspaceId, submissionId, status) =>
        api.patch(`/form-webhooks/${workspaceId}/submissions/${submissionId}/status`, { status }),
    deleteSubmission: (workspaceId, submissionId) =>
        api.delete(`/form-webhooks/${workspaceId}/submissions/${submissionId}`)
};

// Company (Firma) API
export const companyAPI = {
    // SUPER_ADMIN routes
    getAll: () => api.get('/companies'),
    create: (data) => api.post('/companies', data),
    getById: (companyId) => api.get(`/companies/${companyId}`),
    update: (companyId, data) => api.put(`/companies/${companyId}`, data),
    delete: (companyId) => api.delete(`/companies/${companyId}`),
    getAllUsers: () => api.get('/companies/users'),

    // Workspace management
    createWorkspace: (companyId, data) => api.post(`/companies/${companyId}/workspaces`, data),
    addWorkspace: (companyId, workspaceId) => api.post(`/companies/${companyId}/add-workspace`, { workspaceId }),
    removeWorkspace: (companyId, workspaceId) => api.delete(`/companies/${companyId}/workspaces/${workspaceId}`),

    // User's own companies
    getMyCompanies: () => api.get('/companies/my/companies'),

    // Company user management
    getCompanyUsers: (companyId) => api.get(`/companies/${companyId}/users`),
    assignUserToWorkspaces: (companyId, data) => api.post(`/companies/${companyId}/users/assign`, data),
    removeUserFromWorkspace: (companyId, data) => api.post(`/companies/${companyId}/users/remove`, data)
};

// Web Widget API
export const webWidgetAPI = {
    getAll: (workspaceId) => api.get('/webwidgets', { params: { workspaceId } }),
    getById: (id) => api.get(`/webwidgets/${id}`),
    create: (data) => api.post('/webwidgets', data),
    update: (id, data) => api.put(`/webwidgets/${id}`, data),
    updateBot: (id, botId) => api.put(`/webwidgets/${id}`, { assignedBotId: botId || null }),
    delete: (id) => api.delete(`/webwidgets/${id}`)
};

// Deal (Sales) API
export const dealAPI = {
    // CRUD
    getAll: (workspaceId, params = {}) => api.get(`/workspaces/${workspaceId}/deals`, { params }),
    getById: (workspaceId, dealId) => api.get(`/workspaces/${workspaceId}/deals/${dealId}`),
    create: (workspaceId, data) => api.post(`/workspaces/${workspaceId}/deals`, data),
    update: (workspaceId, dealId, data) => api.put(`/workspaces/${workspaceId}/deals/${dealId}`, data),
    delete: (workspaceId, dealId) => api.delete(`/workspaces/${workspaceId}/deals/${dealId}`),

    // Stage Conversion
    convert: (workspaceId, dealId, targetStage) =>
        api.post(`/workspaces/${workspaceId}/deals/${dealId}/convert`, { targetStage }),

    // Stats
    getStats: (workspaceId) => api.get(`/workspaces/${workspaceId}/deals/stats`),    // Contact Deals
    getByContact: (workspaceId, contactId) =>
        api.get(`/workspaces/${workspaceId}/contacts/${contactId}/deals`)
};

// Notification API
export const notificationAPI = {
    getAll: (workspaceId, limit = 50, offset = 0) => api.get(`/notifications/${workspaceId}?limit=${limit}&offset=${offset}`),
    getUnreadCount: (workspaceId) => api.get(`/notifications/${workspaceId}/unread-count`),
    markAsRead: (workspaceId, notificationId) => api.put(`/notifications/${workspaceId}/${notificationId}/read`),
    markAllAsRead: (workspaceId) => api.put(`/notifications/${workspaceId}/read-all`),
    deleteAll: (workspaceId) => api.delete(`/notifications/${workspaceId}/delete-all`)
};

export const retellAPI = {
    getSettings: (workspaceId) => api.get(`/retell/${workspaceId}/settings`),
    saveSettings: (workspaceId, data) => api.put(`/retell/${workspaceId}/settings`, data),
    getAgents: (workspaceId) => api.get(`/retell/${workspaceId}/agents`),
    makeCall: (workspaceId, data) => api.post(`/retell/${workspaceId}/call`, data),
    getCallHistory: (workspaceId, params = {}) => {
        const query = new URLSearchParams(params).toString();
        return api.get(`/retell/${workspaceId}/calls${query ? `?${query}` : ''}`);
    },
    scheduleCall: (workspaceId, data) => api.post(`/retell/${workspaceId}/schedule-call`, data),
    getScheduledCalls: (workspaceId) => api.get(`/retell/${workspaceId}/scheduled-calls`),
    cancelScheduledCall: (workspaceId, id) => api.delete(`/retell/${workspaceId}/scheduled-calls/${id}`),
    getAnalytics: (workspaceId, params = {}) => {
        const query = new URLSearchParams(params).toString();
        return api.get(`/retell/${workspaceId}/analytics${query ? `?${query}` : ''}`);
    },
    bulkRetryCall: (workspaceId, callIds) => api.post(`/retell/${workspaceId}/bulk-retry`, { callIds }),
    syncCalls: (workspaceId) => api.post(`/retell/${workspaceId}/sync-calls`)
};

// Quick Reply (Hazır Mesaj) API
export const quickReplyAPI = {
    getAll: (workspaceId) => api.get(`/workspaces/${workspaceId}/quick-replies`),
    create: (workspaceId, data) => api.post(`/workspaces/${workspaceId}/quick-replies`, data),
    update: (workspaceId, id, data) => api.put(`/workspaces/${workspaceId}/quick-replies/${id}`, data),
    delete: (workspaceId, id) => api.delete(`/workspaces/${workspaceId}/quick-replies/${id}`)
};

// Workspace Automation Rules (Kurallar)
export const rulesAPI = {
    getAll: (workspaceId) => api.get(`/rules/${workspaceId}/rules`),
    upsert: (workspaceId, ruleType, data) => api.put(`/rules/${workspaceId}/rules/${ruleType}`, data)
};