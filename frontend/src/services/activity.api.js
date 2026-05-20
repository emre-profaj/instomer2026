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
    completeActivity: async (activityId, result) => {
        const response = await api.put(`/activities/${activityId}/complete`, { result });
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
    }
};
