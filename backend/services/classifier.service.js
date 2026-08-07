import prisma from '../lib/prisma.js';

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

        for (const rule of rules) {
            const conditions = JSON.parse(rule.conditions || '{}');
            
            switch (rule.conditionType) {
                case 'CHANNEL':
                    // conditions.channels = ["WHATSAPP", "FACEBOOK", "FACEBOOK_COMMENT", ...]
                    if (conditions.channels && conditions.channels.includes(channel)) {
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
