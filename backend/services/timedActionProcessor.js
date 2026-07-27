import prisma from '../lib/prisma.js';
import { executeSingleAction } from './stageAutomation.service.js';

/**
 * Timed Action Processor
 * Runs periodically to check for and execute pending timed actions.
 * Call this from a cron job or setInterval.
 */

export async function processTimedActions() {
    const now = new Date();
    
    try {
        // Find all pending REMINDER activities that are due
        const pendingActions = await prisma.contactActivity.findMany({
            where: {
                type: 'REMINDER',
                status: 'PENDING',
                dueDate: { lte: now }
            },
            include: {
                contact: {
                    select: { id: true, workspaceId: true, funnelStageId: true, name: true }
                }
            },
            take: 100 // Process in batches
        });
        
        if (pendingActions.length === 0) return { processed: 0 };
        
        console.log(`[TimedActionProcessor] Processing ${pendingActions.length} pending actions...`);
        
        let processed = 0;
        let errors = 0;
        
        for (const action of pendingActions) {
            try {
                // Parse the action config
                let config;
                try {
                    config = JSON.parse(action.description);
                } catch {
                    // Not a timed action JSON — skip
                    continue;
                }
                
                if (config.automationType !== 'STAGE_TIMED_ACTION') continue;
                
                // Check if contact is still in the same stage
                if (action.contact?.funnelStageId !== config.stageId) {
                    // Contact has moved — cancel this action
                    await prisma.contactActivity.update({
                        where: { id: action.id },
                        data: { status: 'CANCELLED', description: action.description + ' [Aşama değiştiği için iptal]' }
                    });
                    processed++;
                    continue;
                }
                
                const workspaceId = action.contact?.workspaceId || action.workspaceId;
                const contactId = action.contactId;
                
                // Execute the action based on type
                switch (config.actionType || config.actionConfig?.type) {
                    case 'CREATE_TASK': {
                        await prisma.contactActivity.create({
                            data: {
                                contactId,
                                workspaceId,
                                type: 'TASK',
                                title: config.actionConfig?.title || action.title || 'Zamanlı görev',
                                description: `Otomatik oluşturuldu — ${config.stageId} aşamasından`,
                                status: 'PENDING'
                            }
                        });
                        break;
                    }
                    
                    case 'NOTIFY_TEAM': {
                        // Find the stage's assigned team
                        const stage = await prisma.funnelStage.findUnique({
                            where: { id: config.stageId },
                            select: { assignedTeamId: true, name: true, funnelId: true }
                        });
                        
                        if (stage?.assignedTeamId) {
                            const members = await prisma.teamMember.findMany({
                                where: { teamId: stage.assignedTeamId },
                                select: { userId: true }
                            });
                            
                            for (const m of members) {
                                if (m.userId) {
                                    await prisma.notification.create({
                                        data: {
                                            userId: m.userId,
                                            workspaceId,
                                            type: 'STAGE_AUTOMATION',
                                            title: config.actionConfig?.title || 'Zamanlı hatırlatma',
                                            message: `${action.contact?.firstName || 'Müşteri'} "${stage.name}" aşamasında ${config.actionConfig?.delayDays || '?'} gündür bekliyor`,
                                            isRead: false
                                        }
                                    });
                                }
                            }
                        }
                        break;
                    }
                    
                    case 'MOVE_STAGE': {
                        // Auto-move to next stage if configured
                        if (config.actionConfig?.targetStageId) {
                            await prisma.contact.update({
                                where: { id: contactId },
                                data: { funnelStageId: config.actionConfig.targetStageId }
                            });
                        }
                        break;
                    }
                    
                    case 'WA_SEND_TEMPLATE':
                    case 'WA_SEND_MESSAGE':
                    case 'IG_SEND_MESSAGE':
                    case 'RETELL_CALL':
                    case 'SEND_EMAIL':
                    case 'AUTO_CHANNEL_MESSAGE': {
                        // Delegate channel-based actions to stageAutomation
                        const actionConfig = config.actionConfig || {};
                        actionConfig.type = config.actionType || config.actionConfig?.type;
                        await executeSingleAction(actionConfig, contactId, workspaceId);
                        break;
                    }

                    default:
                        console.log(`[TimedActionProcessor] Unknown action type: ${config.actionType}`);
                }
                
                // Mark as completed
                await prisma.contactActivity.update({
                    where: { id: action.id },
                    data: { status: 'COMPLETED' }
                });
                
                processed++;
            } catch (err) {
                errors++;
                console.error(`[TimedActionProcessor] Error processing action ${action.id}:`, err.message);
                
                // Mark as failed
                await prisma.contactActivity.update({
                    where: { id: action.id },
                    data: { status: 'FAILED' }
                }).catch(() => {});
            }
        }
        
        console.log(`[TimedActionProcessor] Done: ${processed} processed, ${errors} errors`);
        return { processed, errors };
    } catch (err) {
        console.error('[TimedActionProcessor] Fatal error:', err.message);
        return { processed: 0, errors: 1 };
    }
}
