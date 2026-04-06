/**
 * NO_REPLY Cron Job
 * Runs every 5 minutes. For each active flow with trigger=NO_REPLY,
 * finds conversations where no outgoing message was sent within the configured time window,
 * and fires the flow execution.
 */
import prisma from '../lib/prisma.js';
import { executeFlowsByTrigger } from '../controllers/flow.controller.js';


// Tracks already-triggered conversation+flow combos to avoid re-firing in the same window
// Reset on server restart (intentional — re-check is safe)
const recentlyFired = new Set();

export async function processNoReplyFlows() {
    try {
        // Get all workspaces that have at least one active NO_REPLY flow
        const noReplyFlows = await prisma.flow.findMany({
            where: {
                isActive: true,
                trigger: 'NO_REPLY'
            }
        });

        if (noReplyFlows.length === 0) return;

        console.log(`⏰ [NO_REPLY CRON] Checking ${noReplyFlows.length} active NO_REPLY flow(s)...`);

        for (const flow of noReplyFlows) {
            try {
                // Parse steps to find the NO_REPLY trigger config
                const steps = Array.isArray(flow.steps) ? flow.steps : JSON.parse(flow.steps || '[]');
                const triggerStep = steps.find(s => s.type === 'NO_REPLY');
                if (!triggerStep) continue;

                const amount = triggerStep.config?.amount || 1;
                const unit = triggerStep.config?.unit || 'saat';

                let msThreshold = amount * 60 * 60 * 1000; // default: hours
                if (unit === 'dakika') msThreshold = amount * 60 * 1000;
                if (unit === 'gün')    msThreshold = amount * 24 * 60 * 60 * 1000;

                const cutoffTime = new Date(Date.now() - msThreshold);

                // Find open conversations in this workspace where:
                // - Last message was FROM contact (no agent reply since)
                // - Last message time is older than the threshold
                const staleConversations = await prisma.conversation.findMany({
                    where: {
                        workspaceId: flow.workspaceId,
                        status: 'OPEN',
                        lastMessageAt: { lte: cutoffTime }
                    },
                    include: {
                        contact: true,
                        messages: {
                            orderBy: { createdAt: 'desc' },
                            take: 1
                        }
                    }
                });

                for (const conv of staleConversations) {
                    // Check last message is from contact (no outgoing reply yet)
                    const lastMsg = conv.messages[0];
                    if (!lastMsg || !lastMsg.isFromContact) continue;

                    // Dedup key: don't re-fire same conv+flow within same hour
                    const dedupeKey = `${flow.id}:${conv.id}:${Math.floor(Date.now() / (60 * 60 * 1000))}`;
                    if (recentlyFired.has(dedupeKey)) continue;
                    recentlyFired.add(dedupeKey);

                    // Clean up old dedup keys (keep set small)
                    if (recentlyFired.size > 5000) recentlyFired.clear();

                    console.log(`⏰ [NO_REPLY CRON] Firing flow "${flow.name}" for conversation ${conv.id} (silent ${amount} ${unit})`);

                    // Fire the flow (this handles finding the right active flows)
                    await executeFlowsByTrigger(flow.workspaceId, 'NO_REPLY', {
                        conversation: conv,
                        contact: conv.contact
                    });
                }
            } catch (flowErr) {
                console.error(`❌ [NO_REPLY CRON] Error processing flow "${flow.name}":`, flowErr.message);
            }
        }
    } catch (err) {
        console.error('❌ [NO_REPLY CRON] Fatal error:', err.message);
    }
}
