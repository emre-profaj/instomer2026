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
    }
};
