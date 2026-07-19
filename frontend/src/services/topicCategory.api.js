import api from './api';

export const getTopicCategories = (workspaceId) =>
    api.get(`/topic-categories/${workspaceId}`);

export const createTopicCategory = (workspaceId, data) =>
    api.post(`/topic-categories/${workspaceId}`, data);

export const updateTopicCategory = (workspaceId, categoryId, data) =>
    api.put(`/topic-categories/${workspaceId}/${categoryId}`, data);

export const deleteTopicCategory = (workspaceId, categoryId) =>
    api.delete(`/topic-categories/${workspaceId}/${categoryId}`);

export const reorderTopicCategories = (workspaceId, orderedIds) =>
    api.put(`/topic-categories/${workspaceId}/reorder`, { orderedIds });

export const autoGenerateCategories = (workspaceId) =>
    api.post(`/topic-categories/${workspaceId}/auto-generate`);

export const backfillConversations = (workspaceId) =>
    api.post(`/topic-categories/${workspaceId}/backfill`);

export const importFromExcel = (workspaceId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/topic-categories/${workspaceId}/import-excel`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000 // 2 dakika (AI processing)
    });
};
