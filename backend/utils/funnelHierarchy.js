import prisma from '../lib/prisma.js';

/**
 * Returns an array of keys (both IDs and names) representing a funnel and all of its recursive descendants.
 * E.g., if parent is "Genel" with children "Satış" and grandchild "Bornova",
 * it returns [genelId, "Genel", satisId, "Satış", bornovaId, "Bornova"].
 */
export async function getDescendantFunnelKeys(workspaceId, funnelKey) {
    if (!funnelKey) return [];
    try {
        const allFunnels = await prisma.funnel.findMany({
            where: { workspaceId },
            select: { id: true, name: true, parentId: true }
        });

        const startFunnel = allFunnels.find(f => f.id === funnelKey || f.name === funnelKey);
        if (!startFunnel) return [funnelKey];

        const targetKeys = new Set();
        targetKeys.add(startFunnel.id);
        if (startFunnel.name) targetKeys.add(startFunnel.name);

        const queue = [startFunnel.id];
        while (queue.length > 0) {
            const currentId = queue.shift();
            const children = allFunnels.filter(f => f.parentId === currentId);
            for (const child of children) {
                targetKeys.add(child.id);
                if (child.name) targetKeys.add(child.name);
                queue.push(child.id);
            }
        }

        return Array.from(targetKeys);
    } catch (err) {
        console.error('getDescendantFunnelKeys error:', err.message);
        return [funnelKey];
    }
}

/**
 * For an AGENT: determines which funnel keys they are permitted to see based on funnel assignments.
 * - If neither the agent nor their teams are assigned to ANY funnel in the workspace,
 *   returns null (indicating no funnel-level restriction is active for this agent).
 * - If assigned to one or more funnels:
 *   For each assigned funnel, top-down inheritance applies: the agent can see that funnel + all its descendants.
 *   Upper funnels (parents) and sibling funnels are excluded.
 *   Returns an array of permitted funnel keys (IDs and names).
 */
export async function getAllowedFunnelKeysForAgent(workspaceId, userId, userTeamIds = []) {
    try {
        const allFunnels = await prisma.funnel.findMany({
            where: { workspaceId },
            select: { id: true, name: true, parentId: true, assignedUserId: true, assignedTeamId: true }
        });

        // 1. Direct assignments: funnels explicitly assigned to this user or their teams
        const directlyAssignedFunnels = allFunnels.filter(f =>
            (f.assignedUserId && f.assignedUserId === userId) ||
            (f.assignedTeamId && userTeamIds.includes(f.assignedTeamId))
        );

        // If no funnels are assigned to this user or team, no funnel restriction is enforced
        if (directlyAssignedFunnels.length === 0) {
            return null;
        }

        // 2. Top-down inheritance: for each assigned funnel, add it and ALL its descendants
        const allowedKeys = new Set();
        for (const assigned of directlyAssignedFunnels) {
            allowedKeys.add(assigned.id);
            if (assigned.name) allowedKeys.add(assigned.name);

            const queue = [assigned.id];
            while (queue.length > 0) {
                const currentId = queue.shift();
                const children = allFunnels.filter(f => f.parentId === currentId);
                for (const child of children) {
                    allowedKeys.add(child.id);
                    if (child.name) allowedKeys.add(child.name);
                    queue.push(child.id);
                }
            }
        }

        return Array.from(allowedKeys);
    } catch (err) {
        console.error('getAllowedFunnelKeysForAgent error:', err.message);
        return null;
    }
}

/**
 * Climbs up parentId chain to resolve inherited assignedTeamId, assignedUserId, and assignedBotId.
 */
export async function resolveInheritedResponsibility(funnelId) {
    if (!funnelId) return { teamId: null, userId: null, botId: null, sourceFunnel: null };
    try {
        let currentId = funnelId;
        let depth = 0;
        let teamId = null;
        let userId = null;
        let botId = null;
        let sourceFunnel = null;

        while (currentId && depth < 10 && (!teamId || !userId || !botId)) {
            const funnel = await prisma.funnel.findUnique({
                where: { id: currentId },
                select: { id: true, name: true, assignedTeamId: true, assignedUserId: true, assignedBotId: true, parentId: true }
            });
            if (!funnel) break;

            if (!teamId && funnel.assignedTeamId) teamId = funnel.assignedTeamId;
            if (!userId && funnel.assignedUserId) userId = funnel.assignedUserId;
            if (!botId && funnel.assignedBotId) botId = funnel.assignedBotId;

            if ((funnel.assignedTeamId || funnel.assignedUserId || funnel.assignedBotId) && !sourceFunnel) {
                sourceFunnel = funnel;
            }

            currentId = funnel.parentId;
            depth++;
        }

        return { teamId, userId, botId, sourceFunnel };
    } catch (err) {
        console.error('resolveInheritedResponsibility error:', err.message);
        return { teamId: null, userId: null, botId: null, sourceFunnel: null };
    }
}
