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
export async function findResponsible(stageId, explicitFunnelId = null) {
    try {
        let userId = null;
        let teamId = null;
        let botId = null;
        let source = 'NONE';
        let funnelId = explicitFunnelId;

        // 1. Aşama seviyesi
        if (stageId) {
            const stage = await prisma.funnelStage.findUnique({
                where: { id: stageId },
                select: {
                    assignedUserId: true,
                    assignedTeamId: true,
                    assignedBotId: true,
                    funnelId: true,
                }
            });

            if (stage) {
                userId = stage.assignedUserId || null;
                teamId = stage.assignedTeamId || null;
                botId = stage.assignedBotId || null;
                if (!funnelId) funnelId = stage.funnelId;
                if (userId || teamId || botId) {
                    source = 'STAGE';
                }
            }
        }

        // 2. Akış seviyesi ve üst akışlar — recursive
        let depth = 0;
        const maxDepth = 10;

        while (funnelId && depth < maxDepth && (!userId || !teamId || !botId)) {
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

            if (!userId && funnel.assignedUserId) {
                userId = funnel.assignedUserId;
                if (source === 'NONE') source = depth === 0 ? 'FUNNEL' : `PARENT_FUNNEL_${depth}`;
            }
            if (!teamId && funnel.assignedTeamId) {
                teamId = funnel.assignedTeamId;
                if (source === 'NONE') source = depth === 0 ? 'FUNNEL' : `PARENT_FUNNEL_${depth}`;
            }
            if (!botId && funnel.assignedBotId) {
                botId = funnel.assignedBotId;
                if (source === 'NONE') source = depth === 0 ? 'FUNNEL' : `PARENT_FUNNEL_${depth}`;
            }

            // Üst akışa çık
            funnelId = funnel.parentId;
            depth++;
        }

        if (!userId && !teamId && !botId) {
            return { source: 'DEFAULT' };
        }

        return {
            userId: userId || undefined,
            teamId: teamId || undefined,
            botId: botId || undefined,
            source
        };
    } catch (err) {
        console.error('[ResponsibilityLookup] Error:', err.message);
        return { source: 'ERROR' };
    }
}

/**
 * Doğrudan akış ID'si üzerinden hiyerarşik sorumluyu arar.
 */
export async function findResponsibleForFunnel(funnelId) {
    return findResponsible(null, funnelId);
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
                id: true,
                name: true,
                order: true,
                aiGoal: true,
                aiInstruction: true,
                transitionCriteria: true,
                isClosing: true,
                statusType: true,
                funnelId: true,
                funnel: {
                    select: {
                        name: true,
                        stages: {
                            select: { id: true, name: true, order: true, isClosing: true, statusType: true },
                            orderBy: { order: 'asc' }
                        }
                    }
                }
            }
        });

        if (!stage) return {};

        let criteria = null;
        if (stage.transitionCriteria) {
            try { criteria = JSON.parse(stage.transitionCriteria); } catch { }
        }

        // Sonraki aşamayı bul
        const allStages = stage.funnel?.stages || [];
        const currentIndex = allStages.findIndex(s => s.id === stage.id);
        const nextStage = currentIndex >= 0 && currentIndex < allStages.length - 1
            ? allStages[currentIndex + 1]
            : null;

        // Tüm aşama listesini oluştur (mevcut aşama işaretli)
        const stageList = allStages.map((s, i) => {
            const marker = s.id === stage.id ? '👉' : '  ';
            const status = s.isClosing ? (s.statusType === 'WON' ? '✅' : s.statusType === 'LOST' ? '❌' : '⚫') : '⬜';
            return `${marker} ${i + 1}. ${status} ${s.name}`;
        }).join('\n');

        return {
            stageName: stage.name,
            stageOrder: stage.order,
            isClosing: stage.isClosing,
            statusType: stage.statusType,
            funnelName: stage.funnel?.name || null,
            nextStageName: nextStage?.name || null,
            nextStageIsClosing: nextStage?.isClosing || false,
            stageList,
            aiGoal: stage.aiGoal || null,
            aiInstruction: stage.aiInstruction || null,
            transitionCriteria: criteria,
        };
    } catch (err) {
        console.error('[StageAIConfig] Error:', err.message);
        return {};
    }
}
