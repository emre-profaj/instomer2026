import prisma from '../lib/prisma.js';
import { emitToWorkspace } from '../socket.js';

/**
 * Cascade assignment to Case, Sibling Conversations, and Open Activities.
 * 
 * Conversation = Case = aynı sorumlular prensibi.
 * 
 * @param {string} conversationId - Kaynak conversation ID
 * @param {string} workspaceId - Workspace ID
 * @param {Object} options
 * @param {string} [options.assignedToId] - Yeni atanacak kişi
 * @param {string} [options.assignedTeamId] - Yeni takım
 * @param {string} [options.teamIds] - JSON string team IDs (e.g. '["team-id"]')
 * @param {string} [options.source] - Kaynak tanımı (log için)
 */
export async function cascadeAssignment(conversationId, workspaceId, options = {}) {
    const { assignedToId, assignedTeamId, teamIds, source = 'Unknown' } = options;

    if (!assignedToId && !assignedTeamId) return; // Hiçbir şey değişmediyse çık

    try {
        // conversation'dan caseId'yi al
        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
            select: { caseId: true }
        });

        const caseId = conversation?.caseId;
        if (!caseId) {
            console.log(`ℹ️ [Cascade:${source}] Conv ${conversationId} has no case — skipping`);
            return;
        }

        // 1. Case'i güncelle
        const caseUpdate = {};
        if (assignedToId) caseUpdate.assignedToId = assignedToId;
        if (assignedTeamId) caseUpdate.assignedTeamId = assignedTeamId;

        await prisma.case.update({
            where: { id: caseId },
            data: caseUpdate
        });

        // 2. Kardeş conversation'ları güncelle (bu conversation hariç)
        const siblingUpdate = {};
        if (assignedToId) siblingUpdate.assignedToId = assignedToId;
        if (assignedTeamId) siblingUpdate.assignedTeamId = assignedTeamId;
        if (teamIds) siblingUpdate.teamIds = teamIds;

        const siblingResult = await prisma.conversation.updateMany({
            where: {
                caseId,
                id: { not: conversationId },
                status: { not: 'RESOLVED' }
            },
            data: siblingUpdate
        });

        // 3. Açık görevleri yeni kişiye ata
        let activityCount = 0;
        if (assignedToId) {
            const activityResult = await prisma.contactActivity.updateMany({
                where: {
                    caseId,
                    status: { in: ['PLANNED', 'IN_PROGRESS'] }
                },
                data: { assignedToId }
            });
            activityCount = activityResult.count;
        }

        console.log(`🔄 [Cascade:${source}] Case ${caseId} → agent:${assignedToId || 'unchanged'} | ${siblingResult.count} siblings | ${activityCount} activities`);

        // 4. Socket
        try {
            emitToWorkspace(workspaceId, 'case_assignment_updated', {
                caseId,
                ...caseUpdate
            });
        } catch (_) {}

    } catch (err) {
        console.error(`⚠️ [Cascade:${source}] Error (non-blocking):`, err.message);
    }
}
