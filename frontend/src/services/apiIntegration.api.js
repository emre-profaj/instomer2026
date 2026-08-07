import axios from 'axios';
import { getAuthHeader } from '../utils/auth';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

// --- API Integrations ---

export const getIntegrations = async (workspaceId) => {
    const response = await axios.get(`${API_URL}/integrations/workspace/${workspaceId}`, { headers: getAuthHeader() });
    return response.data;
};

export const createIntegration = async (workspaceId, data) => {
    const response = await axios.post(`${API_URL}/integrations/workspace/${workspaceId}`, data, { headers: getAuthHeader() });
    return response.data;
};

export const updateIntegration = async (workspaceId, id, data) => {
    const response = await axios.put(`${API_URL}/integrations/workspace/${workspaceId}/${id}`, data, { headers: getAuthHeader() });
    return response.data;
};

export const deleteIntegration = async (workspaceId, id) => {
    const response = await axios.delete(`${API_URL}/integrations/workspace/${workspaceId}/${id}`, { headers: getAuthHeader() });
    return response.data;
};

// --- AI Bot Tools ---

export const getBotTools = async (workspaceId, integrationId = null) => {
    const url = integrationId 
        ? `${API_URL}/integrations/workspace/${workspaceId}/tools?integrationId=${integrationId}`
        : `${API_URL}/integrations/workspace/${workspaceId}/tools`;
    const response = await axios.get(url, { headers: getAuthHeader() });
    return response.data;
};

export const createBotTool = async (workspaceId, data) => {
    const response = await axios.post(`${API_URL}/integrations/workspace/${workspaceId}/tools`, data, { headers: getAuthHeader() });
    return response.data;
};

export const updateBotTool = async (workspaceId, toolId, data) => {
    const response = await axios.put(`${API_URL}/integrations/workspace/${workspaceId}/tools/${toolId}`, data, { headers: getAuthHeader() });
    return response.data;
};

export const deleteBotTool = async (workspaceId, toolId) => {
    const response = await axios.delete(`${API_URL}/integrations/workspace/${workspaceId}/tools/${toolId}`, { headers: getAuthHeader() });
    return response.data;
};
