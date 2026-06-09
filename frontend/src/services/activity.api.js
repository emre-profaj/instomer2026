import api from './api';

export const activityAPI = {
    // Kişi bazlı timeline'ı getir (Mesajlar, Aramalar, Notlar, Görevler vb)
    getTimeline: async (contactId, workspaceId) => {
        const response = await api.get(`/activities/contacts/${contactId}`, {
            params: { workspaceId }
        });
        return response.data;
    },

    // Yeni bir aktivite (Not, Görev, Hatırlatıcı, Toplantı) oluştur
    createActivity: async (contactId, data) => {
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        const response = await api.post(`/activities/contacts/${contactId}`, data, {
            headers: { Authorization: `Bearer ${token}` }
        });
        return response.data;
    },

    // Aktivite güncelle
    updateActivity: async (activityId, data) => {
        const response = await api.put(`/activities/${activityId}`, data);
        return response.data;
    },

    // Aktivite sil
    deleteActivity: async (activityId) => {
        const response = await api.delete(`/activities/${activityId}`);
        return response.data;
    },

    // Aktivite tamamla (not gir + status=COMPLETED)
    completeActivity: async (activityId, result, callSuccessful, callSentiment) => {
        const body = { result };
        if (callSuccessful !== undefined) body.callSuccessful = callSuccessful;
        if (callSentiment) body.callSentiment = callSentiment;
        const response = await api.put(`/activities/${activityId}/complete`, body);
        return response.data;
    },

    // Aktiviteyi üstlen (POOL kuralı)
    claimActivity: async (activityId) => {
        const response = await api.put(`/activities/${activityId}/claim`);
        return response.data;
    },

    // Workspace genelinde planlanmış aktiviteleri getir (sol panel badge için)
    getPlannedActivities: async (workspaceId) => {
        const response = await api.get(`/activities/workspace/${workspaceId}/call-queue`);
        return response.data;
    },

    // Workspace genelinde filtrelenebilir aktivite listesi
    getWorkspaceActivities: async (workspaceId, filters = {}) => {
        const params = {};
        if (filters.type) params.type = filters.type;
        if (filters.status) params.status = filters.status;
        if (filters.view) params.view = filters.view;
        if (filters.assignedToId) params.assignedToId = filters.assignedToId;
        if (filters.teamId) params.teamId = filters.teamId;
        if (filters.dateFrom) params.dateFrom = filters.dateFrom;
        if (filters.dateTo) params.dateTo = filters.dateTo;
        if (filters.source) params.source = filters.source;
        const response = await api.get(`/activities/workspace/${workspaceId}/list`, { params });
        return response.data;
    },

    // Kişi bazlı en son AI arama kaydını getir
    getContactRetellCall: async (contactId, activityCreatedAt) => {
        const params = {};
        if (activityCreatedAt) params.activityCreatedAt = activityCreatedAt;
        const response = await api.get(`/activities/contacts/${contactId}/retell-call`, { params });
        return response.data;
    },

    // Metni Türkçeye çevir
    translateText: async (workspaceId, text) => {
        const response = await api.post(`/activities/workspace/${workspaceId}/translate`, { text });
        return response.data;
    }
};
