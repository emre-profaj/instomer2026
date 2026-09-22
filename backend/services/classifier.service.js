import prisma from '../lib/prisma.js';
import { channelRuleMatches } from '../utils/channelRuleMatch.js';

/**
 * Runs Classifier Rules on an incoming message or form submission.
 * @param {string} workspaceId 
 * @param {string} channel 
 * @param {object} options - { messageText, formId, pageId }
 * @returns {object|null} - matched rule or null
 */
export async function evaluateClassifierRules(workspaceId, channel, options = {}) {
    try {
        const rules = await prisma.classifierRule.findMany({
            where: { workspaceId, isActive: true },
            orderBy: { priority: 'asc' }
        });

        if (!rules || rules.length === 0) return null;

        // Kanal kuralları hesap kimliğiyle yazılıyor; eşleştirme için
        // konuşmanın kanal kayıtları gerekiyor.
        let convForMatch = { channel };
        if (options.conversationId) {
            try {
                const c = await prisma.conversation.findUnique({
                    where: { id: options.conversationId },
                    select: {
                        channel: true, whatsappPhoneNumberId: true, facebookPageId: true,
                        instagramBusinessId: true, emailChannelId: true
                    }
                });
                if (c) convForMatch = { ...c, channel: c.channel || channel };
            } catch (_) {}
        }
        if (options.pageId && !convForMatch.facebookPageId) convForMatch.facebookPageId = options.pageId;

        for (const rule of rules) {
            const conditions = JSON.parse(rule.conditions || '{}');
            
            switch (rule.conditionType) {
                case 'CHANNEL':
                    // Kural değerleri "wa-<id>", "widget-<id>" biçiminde;
                    // düz tür karşılaştırması hiçbir zaman tutmuyordu.
                    if (channelRuleMatches(conditions.channels, convForMatch, channel)) {
                        console.log(`📡 [Classifier] CHANNEL eşleşti: ${rule.name}`);
                        return rule;
                    }
                    break;
                case 'FORM':
                    // conditions.formIds = ["formId1", "formId2"]
                    if (options.formId && conditions.formIds && conditions.formIds.includes(options.formId)) {
                        return rule;
                    }
                    break;
                case 'KEYWORD':
                    // conditions.keywords = ["kampanya", "destek", ...]
                    if (options.messageText && conditions.keywords && Array.isArray(conditions.keywords)) {
                        const text = options.messageText.toLowerCase();
                        const matched = conditions.keywords.some(kw => text.includes(kw.toLowerCase()));
                        if (matched) return rule;
                    }
                    break;
                case 'DEFAULT':
                    // Her zaman eşleşir (fallback kuralı)
                    return rule;
                case 'TIME': {
                    // Zaman bazlı kural: conditions.timeStart, conditions.timeEnd
                    const { timeStart, timeEnd } = conditions;
                    if (timeStart && timeEnd) {
                        const now = new Date();
                        const currentMinutes = now.getHours() * 60 + now.getMinutes();
                        const [sH, sM] = timeStart.split(':').map(Number);
                        const [eH, eM] = timeEnd.split(':').map(Number);
                        const startMin = sH * 60 + sM;
                        const endMin = eH * 60 + eM;
                        // Handle overnight (e.g. 18:00-09:00)
                        const inRange = startMin <= endMin
                            ? (currentMinutes >= startMin && currentMinutes < endMin)
                            : (currentMinutes >= startMin || currentMinutes < endMin);
                        if (inRange) return rule;
                    }
                    break;
                }
                case 'AI':
                    // Faz 1 için AI'ı atlayabiliriz ya da basic bırakabiliriz. (TODO: LLM ile sınıflandırma)
                    break;
            }
        }
        return null;
    } catch (error) {
        console.error('📡 [Classifier] Error evaluating rules:', error);
        return null;
    }
}
