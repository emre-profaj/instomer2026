/**
 * WorkspaceRouter Service
 * 
 * Hibrit yönlendirme motoru:
 * 1. Kanal kuralı  (META_LEAD, WHATSAPP vs.) — hızlı, maliyetsiz
 * 2. Kelime listesi (keyword matching)        — hızlı, maliyetsiz
 * 3. AI niyet analizi (Gemini fallback)       — yalnızca eşleşme yoksa
 * 4. Varsayılan funnel                        — hiçbiri eşleşmezse
 * 
 * Funnel'a düşünce:
 *   - conversation.funnelStageId → İlk aşama
 *   - conversation.assignedBotId → Funnel'ın botu (varsa)
 *   - conversation.assignedTeamId → Funnel'ın takımı (varsa)
 *   - Giriş otomasyonu tetiklenir (varsa)
 */

import prisma from '../lib/prisma.js';
import { emitToWorkspace } from '../socket.js';
import { executeAutomationAction } from './automationExecutor.js';
import { getEffectiveAiApiKey } from '../controllers/ai.controller.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

// ─── ANA ROUTER FONKSİYONU ───────────────────────────────────────────────────

/**
 * Gelen mesajı analiz edip uygun funnel'a yönlendirir.
 * Conversation zaten bir funnelda ise hiçbir şey yapmaz.
 * 
 * @param {string} workspaceId
 * @param {string} conversationId
 * @param {string} message - Kullanıcının mesajı
 * @param {string} channel - INSTAGRAM | FACEBOOK | WHATSAPP | WIDGET | META_LEAD
 * @returns {Object|null} - Eşleşen funnel veya null
 */
export async function routeConversationToFunnel(workspaceId, conversationId, message, channel) {
    try {
        // 1. Conversation zaten bir funnelda mı?
        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
            select: { funnelStageId: true, funnelType: true }
        });

        if (conversation?.funnelStageId) {
            // Zaten yönlendirilmiş, dokunma
            return null;
        }

        // 2. Workspace'teki tüm aktif funnel'ları al (öncelik sırasına göre)
        const funnels = await prisma.funnel.findMany({
            where: { workspaceId },
            orderBy: { priority: 'desc' },
            include: {
                stages: {
                    orderBy: { order: 'asc' },
                    take: 1 // Sadece ilk aşama
                }
            }
        });

        if (funnels.length === 0) return null;

        let matchedFunnel = null;
        let defaultFunnel = null;

        for (const funnel of funnels) {
            if (funnel.isDefault) {
                defaultFunnel = funnel;
                continue; // Varsayılanı sona bırak
            }

            const entryRules = parseJson(funnel.entryRules, []);
            if (entryRules.length === 0) continue;

            const matched = await evaluateRules(
                entryRules,
                funnel.entryRuleLogic || 'OR',
                funnel.aiIntentDescription,
                message,
                channel,
                workspaceId
            );

            if (matched) {
                matchedFunnel = funnel;
                break; // İlk eşleşmede dur
            }
        }

        // Eşleşme yoksa varsayılan funnel
        const targetFunnel = matchedFunnel || defaultFunnel;
        if (!targetFunnel) return null;

        // 3. Funnel'a ata
        await assignToFunnel(conversationId, targetFunnel, workspaceId);

        console.log(`🎯 [Router] Conversation ${conversationId} → Funnel "${targetFunnel.name}" (${matchedFunnel ? 'rule match' : 'default'})`);

        return targetFunnel;

    } catch (error) {
        console.error('❌ [WorkspaceRouter] Error:', error.message);
        return null;
    }
}

// ─── KURAL DEĞERLENDİRME ─────────────────────────────────────────────────────

/**
 * Funnel giriş kurallarını değerlendirir.
 * Rule types: KEYWORD | CHANNEL | AI_INTENT
 */
async function evaluateRules(rules, logic, aiDescription, message, channel, workspaceId) {
    const results = [];

    for (const rule of rules) {
        let result = false;

        switch (rule.type) {
            case 'CHANNEL':
                result = evaluateChannelRule(rule, channel);
                break;

            case 'KEYWORD':
                result = evaluateKeywordRule(rule, message);
                break;

            case 'AI_INTENT':
                // AI fallback — sadece bu kural tipi için çağırılır
                result = await evaluateAiIntentRule(rule, aiDescription, message, workspaceId);
                break;

            default:
                console.warn(`⚠️ [Router] Unknown rule type: ${rule.type}`);
        }

        results.push(result);

        // OR logic: İlk true'da dur
        if (logic === 'OR' && result === true) return true;

        // AND logic: İlk false'da dur
        if (logic === 'AND' && result === false) return false;
    }

    // AND: Hepsi true ise true
    // OR: Hiçbiri true değilse false
    return logic === 'AND' ? results.every(r => r) : results.some(r => r);
}

// CHANNEL kuralı — kanal eşleşmesi
function evaluateChannelRule(rule, channel) {
    if (!channel || !rule.value) return false;
    const ruleChannel = rule.value.toUpperCase();
    const msgChannel = channel.toUpperCase();

    // META_LEAD özel durumu
    if (ruleChannel === 'META_LEAD') {
        return msgChannel === 'META_LEAD' || msgChannel === 'LEAD';
    }

    return msgChannel === ruleChannel;
}

// KEYWORD kuralı — kelime eşleştirme (hızlı, maliyetsiz)
function evaluateKeywordRule(rule, message) {
    if (!message || !rule.value) return false;
    const msgLower = message.toLowerCase().trim();

    // Virgülle ayrılmış kelimeler
    const keywords = rule.value.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);

    return keywords.some(keyword => {
        // Tam kelime eşleşmesi veya içerme
        return msgLower.includes(keyword);
    });
}

// AI_INTENT kuralı — Gemini ile niyet analizi (fallback)
async function evaluateAiIntentRule(rule, aiDescription, message, workspaceId) {
    if (!message || (!rule.value && !aiDescription)) return false;

    try {
        const apiKey = await getEffectiveAiApiKey(workspaceId);
        if (!apiKey) return false;

        const intentDescription = aiDescription || rule.value;
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        const prompt = `Aşağıdaki müşteri mesajı belirtilen kategoriyle ilgili mi? 
        
KATEGORI: "${intentDescription}"

MÜŞTERİ MESAJI: "${message}"

SADECE "EVET" veya "HAYIR" yaz. Başka hiçbir şey yazma.`;

        const result = await model.generateContent(prompt);
        const response = result.response.text().trim().toUpperCase();

        const matched = response.startsWith('EVET') || response === 'YES';
        console.log(`🤖 [Router] AI intent check for "${intentDescription.substring(0, 30)}...": ${matched ? '✅ MATCH' : '❌ NO MATCH'}`);

        return matched;

    } catch (error) {
        console.error('❌ [Router] AI intent evaluation error:', error.message);
        return false;
    }
}

// ─── FUNNEL'A ATAMA ───────────────────────────────────────────────────────────

/**
 * Conversation'ı funnel'a atar ve tüm yan etkileri tetikler:
 * - Funnel + aşama ataması
 * - Bot değiştirme (varsa)
 * - Takım ataması (varsa)
 * - Giriş otomasyonu tetikleme (varsa)
 */
async function assignToFunnel(conversationId, funnel, workspaceId) {
    const firstStage = funnel.stages?.[0];

    // 1. Conversation'ı güncelle
    const updateData = {};

    if (firstStage) {
        updateData.funnelStageId = firstStage.id;
    }

    // Bot değiştirme — funnel'ın kendi botu varsa
    if (funnel.assignedBotId) {
        updateData.assignedBotId = funnel.assignedBotId;
        console.log(`🤖 [Router] Switching bot to funnel bot: ${funnel.assignedBotId}`);
    }

    // Takım ataması — funnel'ın takımı varsa
    if (funnel.assignedTeamId) {
        updateData.assignedTeamId = funnel.assignedTeamId;
        updateData.teamIds = JSON.stringify([funnel.assignedTeamId]);
        console.log(`👥 [Router] Assigning team: ${funnel.assignedTeamId}`);
    }

    const updatedConversation = await prisma.conversation.update({
        where: { id: conversationId },
        data: updateData,
        include: { contact: true }
    });

    // 2. Socket ile bildir
    emitToWorkspace(workspaceId, 'conversation_updated', {
        conversationId,
        funnelId: funnel.id,
        funnelName: funnel.name,
        funnelStageId: firstStage?.id,
        assignedBotId: funnel.assignedBotId,
        assignedTeamId: funnel.assignedTeamId
    });

    // 3. Giriş otomasyonunu tetikle
    if (funnel.entryAutomationId) {
        await triggerAutomationById(
            funnel.entryAutomationId,
            {
                workspaceId,
                conversationId,
                contactId: updatedConversation.contactId,
                contact: updatedConversation.contact,
                message: null,
                funnelId: funnel.id,
                funnelName: funnel.name
            }
        );
    }

    // 4. İlk aşamanın kendi otomasyonu varsa onu da tetikle
    if (firstStage?.onEnterAutomationId) {
        await triggerAutomationById(
            firstStage.onEnterAutomationId,
            {
                workspaceId,
                conversationId,
                contactId: updatedConversation.contactId,
                contact: updatedConversation.contact,
                funnelStageId: firstStage.id,
                stageName: firstStage.name
            }
        );
    }

    return updatedConversation;
}

// ─── STAGE DEĞİŞİKLİĞİNDE OTOMASYON ─────────────────────────────────────────

/**
 * Conversation bir aşamaya taşındığında çağrılır.
 * O aşamanın onEnterAutomationId'si varsa tetikler.
 * 
 * @param {string} conversationId
 * @param {string} newStageId - Yeni aşama ID'si
 * @param {string} workspaceId
 */
export async function triggerStageAutomation(conversationId, newStageId, workspaceId) {
    try {
        const stage = await prisma.funnelStage.findUnique({
            where: { id: newStageId },
            select: { id: true, name: true, onEnterAutomationId: true }
        });

        if (!stage?.onEnterAutomationId) return; // Bu aşamanın otomasyonu yok

        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
            include: { contact: true }
        });

        if (!conversation) return;

        console.log(`⚡ [Router] Stage automation triggered: "${stage.name}" → automation ${stage.onEnterAutomationId}`);

        await triggerAutomationById(
            stage.onEnterAutomationId,
            {
                workspaceId,
                conversationId,
                contactId: conversation.contactId,
                contact: conversation.contact,
                funnelStageId: stage.id,
                stageName: stage.name
            }
        );

    } catch (error) {
        console.error('❌ [Router] Stage automation error:', error.message);
    }
}

// ─── YARDIMCI FONKSİYONLAR ───────────────────────────────────────────────────

/**
 * Otomasyon ID'si ile mevcut automationExecutor'ı çalıştırır
 */
async function triggerAutomationById(automationId, context) {
    try {
        const automation = await prisma.automation.findUnique({
            where: { id: automationId }
        });

        if (!automation || !automation.isActive) {
            console.warn(`⚠️ [Router] Automation ${automationId} not found or inactive`);
            return;
        }

        console.log(`⚡ [Router] Triggering automation: "${automation.name}"`);

        // Multi-action support
        if (automation.actions) {
            const actions = parseJson(automation.actions, []);
            for (const actionDef of actions) {
                const syntheticAutomation = { ...automation, ...actionDef, action: actionDef.type };
                await executeAutomationAction(syntheticAutomation, context);
            }
        } else {
            // Single action (legacy)
            await executeAutomationAction(automation, context);
        }

    } catch (error) {
        console.error(`❌ [Router] Failed to trigger automation ${automationId}:`, error.message);
    }
}

function parseJson(str, fallback) {
    if (!str) return fallback;
    try { return JSON.parse(str); } catch { return fallback; }
}
