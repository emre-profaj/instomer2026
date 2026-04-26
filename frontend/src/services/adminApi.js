import api from './api';

// Admin Facebook API methods
export const facebookAdminAPI = {
    getAllPages: () => api.get('/facebook/admin/pages'),
    connectPage: (data) => api.post('/facebook/admin/connect-page', data)
};
