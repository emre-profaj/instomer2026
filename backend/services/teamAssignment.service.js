import prisma from '../lib/prisma.js';

/**
 * Takım atama kuralına göre konuşmayı bir ekip üyesine atar
 * @param {string} teamId - Takım ID
 * @param {string} conversationId - Konuşma ID
 * @returns {string|null} Atanan kullanıcı ID veya null (havuzda kalır)
 */
export async function assignToTeamMember(teamId, conversationId) {
    try {
        const team = await prisma.team.findUnique({
            where: { id: teamId },
            include: {
                members: {
                    where: { userId: { not: null } }, // Sadece insan üyeler (bot hariç)
                    include: { user: true }
                }
            }
        });

        if (!team || !team.members || team.members.length === 0) {
            console.log(`📋 [TeamAssign] Takım ${team?.name || teamId} — üye yok, havuzda kalıyor`);
            return null;
        }

        const rule = team.assignmentRule || 'POOL';
        const humanMembers = team.members.filter(m => m.userId && m.user);

        if (humanMembers.length === 0) {
            console.log(`📋 [TeamAssign] Takım "${team.name}" — insan üye yok, havuzda kalıyor`);
            return null;
        }

        let assignedUserId = null;

        switch (rule) {
            case 'POOL':
                // Havuz: Kimseye otomatik atama yok, ekip havuzunda kalır
                console.log(`🏊 [TeamAssign] "${team.name}" → HAVUZ modu, konuşma havuzda`);
                // Sadece takım ataması yap
                await prisma.conversation.update({
                    where: { id: conversationId },
                    data: { assignedTeamId: teamId }
                });
                return null;

            case 'ROUND_ROBIN':
                // Sırayla dağıt
                const rrIndex = (team.roundRobinIndex || 0) % humanMembers.length;
                const rrMember = humanMembers[rrIndex];
                assignedUserId = rrMember.userId;

                // Index'i bir artır
                await prisma.team.update({
                    where: { id: teamId },
                    data: { roundRobinIndex: (team.roundRobinIndex || 0) + 1 }
                });

                console.log(`🔄 [TeamAssign] "${team.name}" → ROUND ROBIN → ${rrMember.user.name} (index: ${rrIndex})`);
                break;

            case 'LEAST_BUSY':
                // En az açık görüşmesi olan üyeye ata
                let minCount = Infinity;
                let leastBusyMember = humanMembers[0];

                for (const member of humanMembers) {
                    const openCount = await prisma.conversation.count({
                        where: {
                            assignedToId: member.userId,
                            status: 'OPEN'
                        }
                    });
                    if (openCount < minCount) {
                        minCount = openCount;
                        leastBusyMember = member;
                    }
                }

                assignedUserId = leastBusyMember.userId;
                console.log(`📊 [TeamAssign] "${team.name}" → EN AZ YOĞUN → ${leastBusyMember.user.name} (${minCount} açık)`);
                break;

            default:
                console.log(`⚠️ [TeamAssign] Bilinmeyen kural: ${rule}, havuzda kalıyor`);
                return null;
        }

        if (assignedUserId) {
            await prisma.conversation.update({
                where: { id: conversationId },
                data: {
                    assignedToId: assignedUserId,
                    assignedTeamId: teamId
                }
            });
            return assignedUserId;
        }

        return null;
    } catch (error) {
        console.error('❌ [TeamAssign] Hata:', error.message);
        return null;
    }
}
