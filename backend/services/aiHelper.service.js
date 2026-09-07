import prisma from '../lib/prisma.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

// =============================================
// MERKEZİ AI HELPER SERVİSİ
// Tüm Gemini çağrıları bu helper üzerinden geçer
// Model seçimi, toggle kontrolü, token takibi
// =============================================

// Fiyatlandırma tablosu (per 1M token, USD)
const PRICING = {
    'gemini-2.0-flash-lite': { input: 0.02, output: 0.08 },
    'gemini-2.5-flash-lite': { input: 0.02, output: 0.08 },
    'gemini-2.5-flash':      { input: 0.15, output: 0.60 },
    'gemini-3.5-flash':      { input: 0.15, output: 0.60 }, // Eski isim uyumu
    'gemini-2.5-pro':        { input: 1.25, output: 10.00 },
};

// Maliyet hesaplama
function calculateCost(model, inputTokens, outputTokens) {
    const p = PRICING[model] || PRICING['gemini-2.5-flash'];
    return ((inputTokens || 0) * p.input + (outputTokens || 0) * p.output) / 1_000_000;
}

// Workspace + Company AI config'ini çöz
export async function getAIConfig(workspaceId) {
    const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: {
            aiApiKey: true,
            aiModel: true,
            aiClassifierEnabled: true,
            aiAutoReplyEnabled: true,
            aiScorerEnabled: true,
            aiFollowUpEnabled: true,
            companyId: true,
            company: {
                select: {
                    id: true,
                    aiModel: true,
                    aiApiKey: true,
                }
            }
        }
    });

    if (!workspace) throw new Error(`Workspace ${workspaceId} bulunamadı`);

    // Global key
    const globalSettings = await prisma.globalSettings.findUnique({
        where: { id: 'singleton' }
    });

    // Hiyerarşi: Workspace → Company → Global → env
    const apiKey = workspace.aiApiKey
        || workspace.company?.aiApiKey
        || globalSettings?.globalAiApiKey
        || process.env.GEMINI_API_KEY
        || null;

    // Model hiyerarşi: Workspace → Company → varsayılan
    const aiModel = workspace.aiModel
        || workspace.company?.aiModel
        || 'gemini-2.5-flash';

    return {
        apiKey,
        aiModel,
        companyId: workspace.companyId || null,
        aiClassifierEnabled: workspace.aiClassifierEnabled,
        aiAutoReplyEnabled: workspace.aiAutoReplyEnabled,
        aiScorerEnabled: workspace.aiScorerEnabled,
        aiFollowUpEnabled: workspace.aiFollowUpEnabled,
    };
}

// Toggle kontrolü — service kapalıysa null döner
const SERVICE_TOGGLE_MAP = {
    'classifier': 'aiClassifierEnabled',
    'auto_reply': 'aiAutoReplyEnabled',
    'scorer': 'aiScorerEnabled',
    'follow_up': 'aiFollowUpEnabled',
};

function isServiceEnabled(config, service) {
    const toggleKey = SERVICE_TOGGLE_MAP[service];
    if (!toggleKey) return true; // bot, manual, routing vb. her zaman açık
    return config[toggleKey] !== false;
}

// Token log kaydet (fire-and-forget)
async function logUsage(workspaceId, companyId, service, model, usage, conversationId) {
    try {
        const inputTokens = usage?.promptTokenCount || 0;
        const outputTokens = usage?.candidatesTokenCount || 0;
        const totalTokens = usage?.totalTokenCount || inputTokens + outputTokens;
        const costUsd = calculateCost(model, inputTokens, outputTokens);

        await prisma.aIUsageLog.create({
            data: {
                companyId: companyId || null,
                workspaceId,
                service,
                model,
                inputTokens,
                outputTokens,
                totalTokens,
                costUsd,
                conversationId: conversationId || null,
            }
        });
    } catch (err) {
        console.error('⚠️ AI usage log kaydedilemedi:', err.message);
    }
}

// =============================================
// ANA FONKSİYON — callGemini
// =============================================
/**
 * @param {string} workspaceId
 * @param {object} options
 * @param {string} options.service - "classifier" | "auto_reply" | "scorer" | "follow_up" | "bot" | "manual" | "routing" | "note_analysis"
 * @param {string|Array} options.prompt - İçerik (string veya parts array)
 * @param {string} [options.systemInstruction] - Sistem talimatı
 * @param {Array} [options.tools] - Function calling araçları
 * @param {boolean} [options.jsonMode] - JSON çıktı modu
 * @param {string} [options.conversationId] - İlgili konuşma
 * @param {object} [options.generationConfig] - Ek generationConfig
 * @returns {object|null} result - Gemini yanıtı veya null (toggle kapalı / key yok)
 */
export async function callGemini(workspaceId, options = {}) {
    const {
        service = 'manual',
        prompt,
        systemInstruction,
        tools,
        jsonMode = false,
        conversationId,
        generationConfig = {},
    } = options;

    // 1. Config al
    const config = await getAIConfig(workspaceId);

    // 2. Toggle kontrolü
    if (!isServiceEnabled(config, service)) {
        return null;
    }

    // 3. API key kontrolü
    if (!config.apiKey) {
        console.warn(`⚠️ AI API key bulunamadı — workspace: ${workspaceId}`);
        return null;
    }

    // 4. Model + Gemini instance
    const model = config.aiModel;
    const genAI = new GoogleGenerativeAI(config.apiKey);

    const modelConfig = {
        model,
        ...(systemInstruction && { systemInstruction }),
        ...(tools && { tools }),
    };

    const gemini = genAI.getGenerativeModel(modelConfig);

    // 5. GenerationConfig
    const genConfig = {
        ...generationConfig,
        ...(jsonMode && { responseMimeType: 'application/json' }),
    };

    // 6. Çağrı
    const result = await gemini.generateContent({
        contents: Array.isArray(prompt) ? prompt : [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: genConfig,
    });

    // 7. Token log
    const usage = result.response?.usageMetadata;
    logUsage(workspaceId, config.companyId, service, model, usage, conversationId);

    return result;
}

/**
 * Chat oturumu ile çağrı — çok turlu konuşmalar için
 */
export async function createGeminiChat(workspaceId, options = {}) {
    const {
        service = 'bot',
        systemInstruction,
        tools,
        history = [],
        generationConfig = {},
        jsonMode = false,
    } = options;

    const config = await getAIConfig(workspaceId);

    if (!isServiceEnabled(config, service)) return null;
    if (!config.apiKey) return null;

    const model = config.aiModel;
    const genAI = new GoogleGenerativeAI(config.apiKey);

    const modelConfig = {
        model,
        ...(systemInstruction && { systemInstruction }),
        ...(tools && { tools }),
    };

    const gemini = genAI.getGenerativeModel(modelConfig);

    const chat = gemini.startChat({
        history,
        generationConfig: {
            ...generationConfig,
            ...(jsonMode && { responseMimeType: 'application/json' }),
        },
    });

    // Wrap sendMessage to track tokens
    const originalSend = chat.sendMessage.bind(chat);
    chat.sendMessage = async (...args) => {
        const result = await originalSend(...args);
        const usage = result.response?.usageMetadata;
        logUsage(workspaceId, config.companyId, service, model, usage, null);
        return result;
    };

    return { chat, model, config };
}

/**
 * Sadece API key'i çöz (eski kodla uyumluluk)
 */
export async function getEffectiveAiApiKey(workspaceId) {
    const config = await getAIConfig(workspaceId);
    return config.apiKey;
}

/**
 * Model adını çöz
 */
export async function getEffectiveModel(workspaceId) {
    const config = await getAIConfig(workspaceId);
    return config.aiModel;
}

// Dışa aç
export { calculateCost, PRICING };
