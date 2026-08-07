import api from './api';

export const getTopicCategories = (workspaceId, caseTypeId = null) =>
    api.get(`/topic-categories/${workspaceId}${caseTypeId ? `?caseTypeId=${caseTypeId}` : ''}`);

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
    api.post(`/topic-categories/${workspaceId}/backfill`, {}, {
        timeout: 300000 // 5 dakika (AI processing)
    });

export const importFromExcel = (workspaceId, textContent) =>
    api.post(`/topic-categories/${workspaceId}/import-excel`, { textContent }, {
        timeout: 120000
    });

export const mergeCategories = (workspaceId, sourceIds, targetName) =>
    api.post(`/topic-categories/${workspaceId}/merge`, { sourceIds, targetName });

export const simplifyCategories = (workspaceId) =>
    api.post(`/topic-categories/${workspaceId}/simplify`, {}, {
        timeout: 120000
    });

export const aiChatCategories = (workspaceId, message) =>
    api.post(`/topic-categories/${workspaceId}/ai-chat`, { message }, {
        timeout: 60000
    });
