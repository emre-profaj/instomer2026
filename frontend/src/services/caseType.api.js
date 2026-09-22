import api from './api';

export const getCaseTypes = async (workspaceId) => {
    const response = await api.get(`/casetypes/${workspaceId}`);
    return response.data;
};

export const createCaseType = async (workspaceId, data) => {
    const response = await api.post(`/casetypes/${workspaceId}`, data);
    return response.data;
};

export const updateCaseType = async (workspaceId, id, data) => {
    const response = await api.put(`/casetypes/${workspaceId}/${id}`, data);
    return response.data;
};

export const deleteCaseType = async (workspaceId, id) => {
    const response = await api.delete(`/casetypes/${workspaceId}/${id}`);
    return response.data;
};
