import axios from 'axios';
import { getAuthHeader } from '../utils/auth';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

export const getTemplates = async (workspaceId, type) => {
    const response = await axios.get(`${API_URL}/templates/${workspaceId}?type=${type}`, { headers: getAuthHeader() });
    return response.data;
};

export const createTemplate = async (workspaceId, data) => {
    const response = await axios.post(`${API_URL}/templates/${workspaceId}`, data, { headers: getAuthHeader() });
    return response.data;
};

export const updateTemplate = async (workspaceId, id, data) => {
    const response = await axios.put(`${API_URL}/templates/${workspaceId}/${id}`, data, { headers: getAuthHeader() });
    return response.data;
};

export const deleteTemplate = async (workspaceId, id, type) => {
    const response = await axios.delete(`${API_URL}/templates/${workspaceId}/${id}?type=${type}`, { headers: getAuthHeader() });
    return response.data;
};
