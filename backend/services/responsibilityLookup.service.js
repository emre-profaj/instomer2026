import prisma from '../lib/prisma.js';

/**
 * Hiyerarşik Sorumluluk Lookup
 * 
 * Bir konuşma belirli bir aşamaya düştüğünde, sorumluyu şu sırayla arar:
 * 1. Aşama seviyesi (stage.assignedUserId / assignedTeamId / assignedBotId)
 * 2. Akış seviyesi (funnel.assignedUserId / assignedTeamId / assignedBotId)
 * 3. Üst akış seviyesi (funnel.parent.assigned...)
 * 4. Varsayılan (null — kuyrukta kalır)
 * 
 * @param {string} stageId - Hedef aşama ID
 * @returns {{ userId?: string, teamId?: string, botId?: string, source: string }}
 */
export async function findResponsible(stageId) {
    try {
        const stage = await prisma.funnelStage.findUnique({
            where: { id: stageId },
            select: {
                assignedUserId: true,
                assignedTeamId: true,
                assignedBotId: true,
                funnelId: true,
            }
        });

        if (!stage) return { source: 'NOT_FOUND' };

        // 1. Aşama seviyesi
        if (stage.assignedUserId || stage.assignedTeamId || stage.assignedBotId) {
            return {
                userId: stage.assignedUserId,
                teamId: stage.assignedTeamId,
                botId: stage.assignedBotId,
                source: 'STAGE'
            };
        }

        // 2. Akış seviyesi (ve üst akışlar — recursive)
        let funnelId = stage.funnelId;
        let depth = 0;
        const maxDepth = 5; // Sonsuz döngü koruması

        while (funnelId && depth < maxDepth) {
            const funnel = await prisma.funnel.findUnique({
                where: { id: funnelId },
                select: {
                    assignedUserId: true,
                    assignedTeamId: true,
                    assignedBotId: true,
                    parentId: true,
                    name: true,
                }
            });

            if (!funnel) break;

            if (funnel.assignedUserId || funnel.assignedTeamId || funnel.assignedBotId) {
                return {
                    userId: funnel.assignedUserId,
                    teamId: funnel.assignedTeamId,
                    botId: funnel.assignedBotId,
                    source: depth === 0 ? 'FUNNEL' : `PARENT_FUNNEL_${depth}`
                };
            }

            // Üst akışa çık
            funnelId = funnel.parentId;
            depth++;
        }

        // 3. Bulunamadı
        return { source: 'DEFAULT' };
    } catch (err) {
        console.error('[ResponsibilityLookup] Error:', err.message);
        return { source: 'ERROR' };
    }
}

/**
 * Bir aşamanın AI davranış konfigürasyonunu döndürür.
 * 
 * @param {string} stageId
 * @returns {{ aiGoal?: string, aiInstruction?: string, transitionCriteria?: object }}
 */
export async function getStageAIConfig(stageId) {
    try {
        const stage = await prisma.funnelStage.findUnique({
            where: { id: stageId },
            select: {
                aiGoal: true,
                aiInstruction: true,
                transitionCriteria: true,
            }
        });

        if (!stage) return {};

        let criteria = null;
        if (stage.transitionCriteria) {
            try { criteria = JSON.parse(stage.transitionCriteria); } catch { }
        }

        return {
            aiGoal: stage.aiGoal || null,
            aiInstruction: stage.aiInstruction || null,
            transitionCriteria: criteria,
        };
    } catch (err) {
        console.error('[StageAIConfig] Error:', err.message);
        return {};
    }
}
