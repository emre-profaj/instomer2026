import prisma from '../lib/prisma.js';

/**
 * Run classifier rules for a workspace.
 * Called when a new conversation is created or first message arrives.
 * 
 * @param {string} workspaceId
 * @param {object} context - { channel, message, formId, formName, contactId, conversationId, subChannel }
 * @returns {object|null} - { rule, funnelId, stageId, teamId, automationId } or null
 */
export async function runClassifier(workspaceId, context) {
    const rules = await prisma.classifierRule.findMany({
        where: { workspaceId, isActive: true },
        orderBy: { priority: 'asc' }
    });

    for (const rule of rules) {
        const conditions = JSON.parse(rule.conditions || '{}');
        let matched = false;

        switch (rule.conditionType) {
            case 'FORM':
                // Match by form ID or form name
                matched = conditions.formIds?.includes(context.formId) ||
                          conditions.formNames?.some(n => context.formName?.toLowerCase().includes(n.toLowerCase()));
                break;
            
            case 'CHANNEL':
                // Match by channel type
                matched = conditions.channels?.includes(context.channel);
                break;

            case 'SUB_CHANNEL':
                // Match by sub-channel (FACEBOOK_COMMENT, INSTAGRAM_COMMENT, LEAD)
                matched = conditions.subChannels?.includes(context.subChannel);
                break;

            case 'KEYWORD':
                // Match by keywords in message
                if (context.message && conditions.keywords?.length > 0) {
                    const msgLower = context.message.toLowerCase();
                    const matchMode = conditions.matchMode || 'ANY';
                    if (matchMode === 'ANY') {
                        matched = conditions.keywords.some(kw => msgLower.includes(kw.toLowerCase()));
                    } else {
                        matched = conditions.keywords.every(kw => msgLower.includes(kw.toLowerCase()));
                    }
                }
                break;

            case 'AI':
                // AI-based classification using Gemini
                // For now, skip AI matching (will be implemented later)
                // matched = await aiClassify(context.message, conditions.aiDescription);
                matched = false;
                break;

            case 'DEFAULT':
                // Always matches — catch-all
                matched = true;
                break;
        }

        if (matched) {
            console.log(`🏷️ [Classifier] Rule matched: "${rule.name}" (${rule.conditionType})`);
            return {
                rule,
                funnelId: rule.targetFunnelId,
                stageId: rule.targetStageId,
                teamId: rule.targetTeamId,
                automationId: rule.automationId
            };
        }
    }

    console.log('🏷️ [Classifier] No rules matched, falling back to channel routing');
    return null;
}

/**
 * Apply classifier result to a conversation.
 * Updates conversation's funnel, stage, and team assignment.
 */
export async function applyClassifierResult(conversationId, contactId, result) {
    if (!result) return;

    const updateData = {};
    if (result.funnelId) updateData.funnelType = result.funnelId;
    if (result.stageId) updateData.funnelStageId = result.stageId;

    // Update conversation
    if (Object.keys(updateData).length > 0) {
        await prisma.conversation.update({
            where: { id: conversationId },
            data: updateData
        });
    }

    // Update contact funnel stage if provided
    if (result.stageId && contactId) {
        await prisma.contact.update({
            where: { id: contactId },
            data: { funnelStageId: result.stageId }
        });
    }

    console.log(`🏷️ [Classifier] Applied: conversation=${conversationId}, funnel=${result.funnelId}, stage=${result.stageId}`);
}
