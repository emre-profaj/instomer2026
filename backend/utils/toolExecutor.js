import axios from 'axios';
import { decrypt } from './encryption.js';

/**
 * Gemini'den gelen fonksiyon çağrısını (function calling) işleyerek dış API'ye istek atar.
 * 
 * @param {Object} tool - Veritabanından gelen AIBotTool kaydı (içinde apiIntegration ile)
 * @param {Object} args - Gemini'nin gönderdiği parametreler (JSON)
 * @returns {Object} - API'den dönen yanıt
 */
export const executeToolRequest = async (tool, args) => {
    try {
        const { apiIntegration, endpoint, method } = tool;
        
        if (!apiIntegration || !apiIntegration.isActive) {
            throw new Error(`Integration for tool ${tool.name} is disabled or not found.`);
        }

        let fullUrl = apiIntegration.baseUrl;
        // baseUrl sonu '/' ile bitiyor mu endpoint '/' ile başlıyor mu kontrolü
        if (fullUrl.endsWith('/') && endpoint.startsWith('/')) {
            fullUrl += endpoint.substring(1);
        } else if (!fullUrl.endsWith('/') && !endpoint.startsWith('/')) {
            fullUrl += '/' + endpoint;
        } else {
            fullUrl += endpoint;
        }

        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };

        // Extra Headers parsing
        if (apiIntegration.headers) {
            try {
                const parsedHeaders = JSON.parse(apiIntegration.headers);
                Object.assign(headers, parsedHeaders);
            } catch (e) {
                console.error('Failed to parse integration headers', e);
            }
        }

        // Auth Header Injection
        if (apiIntegration.authType === 'BEARER' && apiIntegration.authToken) {
            const token = decrypt(apiIntegration.authToken);
            if (token) headers['Authorization'] = `Bearer ${token}`;
        } else if (apiIntegration.authType === 'BASIC' && apiIntegration.authToken && apiIntegration.apiSecret) {
            const username = decrypt(apiIntegration.authToken);
            const password = decrypt(apiIntegration.apiSecret);
            if (username && password) {
                const encoded = Buffer.from(`${username}:${password}`).toString('base64');
                headers['Authorization'] = `Basic ${encoded}`;
            }
        } else if (apiIntegration.authType === 'API_KEY' && apiIntegration.apiKey) {
            const key = decrypt(apiIntegration.apiKey);
            // Default olarak X-API-Key başlığında gönderiliyor (İleride custom başlık yapılabilir)
            if (key) headers['X-API-Key'] = key;
        }

        // Axios request options
        const axiosOptions = {
            method: method.toUpperCase(),
            url: fullUrl,
            headers,
            timeout: 10000 // 10 seconds max
        };

        // Args binding (Params vs Body)
        if (axiosOptions.method === 'GET') {
            axiosOptions.params = args;
        } else {
            axiosOptions.data = args;
        }

        console.log(`[ToolExecutor] 🚀 Sending ${axiosOptions.method} request to ${fullUrl}`);
        
        const response = await axios(axiosOptions);
        
        console.log(`[ToolExecutor] ✅ Received response for ${tool.name}`);
        return response.data;
        
    } catch (error) {
        console.error(`[ToolExecutor] ❌ Error executing tool ${tool.name}:`, error.message);
        if (error.response) {
            return { 
                error: true, 
                message: error.message, 
                status: error.response.status, 
                data: error.response.data 
            };
        }
        return { error: true, message: error.message };
    }
};
