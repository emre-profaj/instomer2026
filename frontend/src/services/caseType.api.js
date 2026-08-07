import axios from 'axios';
import { getAuthHeader } from '../utils/auth';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

export const getCaseTypes = async (workspaceId) => {
    const response = await axios.get(`${API_URL}/casetypes/${workspaceId}`, { headers: getAuthHeader() });
    return response.data;
};

export const createCaseType = async (workspaceId, data) => {
    const response = await axios.post(`${API_URL}/casetypes/${workspaceId}`, data, { headers: getAuthHeader() });
    return response.data;
};

export const updateCaseType = async (workspaceId, id, data) => {
    const response = await axios.put(`${API_URL}/casetypes/${workspaceId}/${id}`, data, { headers: getAuthHeader() });
    return response.data;
};

export const deleteCaseType = async (workspaceId, id) => {
    const response = await axios.delete(`${API_URL}/casetypes/${workspaceId}/${id}`, { headers: getAuthHeader() });
    return response.data;
};
