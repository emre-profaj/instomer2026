import prisma from '../lib/prisma.js';

/**
 * Dağıtım metoduna göre uygun üyeyi seç ve ata
 */
async function distributeByMethod(team, conversationId, method) {
    // 🛡️ GUARD: Konuşma zaten birine atanmışsa dağıtım yapma
    const existingConv = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { assignedToId: true }
    });
    if (existingConv?.assignedToId) {
        console.log(`🛡️ [Distribute] Konuşma zaten ${existingConv.assignedToId}'ye atanmış — dağıtım yapılmıyor`);
        return existingConv.assignedToId; // Mevcut atamayı koru
    }

    const humanMembers = team.members.filter(m => m.userId && m.user);
    if (humanMembers.length === 0) return null;

    let assignedUserId = null;
    const effectiveMethod = method || team.distributionMethod || 'ROUND_ROBIN';

    switch (effectiveMethod) {
        case 'ROUND_ROBIN': {
            const idx = (team.roundRobinIndex || 0) % humanMembers.length;
            assignedUserId = humanMembers[idx].userId;
            await prisma.team.update({ where: { id: team.id }, data: { roundRobinIndex: (team.roundRobinIndex || 0) + 1 } });
            console.log(`🔄 [Distribute] "${team.name}" → ROUND ROBIN → ${humanMembers[idx].user.name}`);
            break;
        }
        case 'LEAST_BUSY': {
            let minCount = Infinity, chosen = humanMembers[0];
            for (const m of humanMembers) {
                const cnt = await prisma.conversation.count({ where: { assignedToId: m.userId, status: 'OPEN' } });
                if (cnt < minCount) { minCount = cnt; chosen = m; }
            }
            assignedUserId = chosen.userId;
            console.log(`📊 [Distribute] "${team.name}" → LEAST BUSY → ${chosen.user.name} (${minCount} açık)`);
            break;
        }
        case 'ONLINE_ONLY': {
            const online = humanMembers.filter(m => m.user?.isOnline);
            if (online.length > 0) {
                const idx = (team.roundRobinIndex || 0) % online.length;
                assignedUserId = online[idx].userId;
                await prisma.team.update({ where: { id: team.id }, data: { roundRobinIndex: (team.roundRobinIndex || 0) + 1 } });
                console.log(`🟢 [Distribute] "${team.name}" → ONLINE → ${online[idx].user.name}`);
            } else {
                console.log(`🟢 [Distribute] "${team.name}" → kimse online değil, havuzda`);
            }
            break;
        }
    }

    if (assignedUserId) {
        await prisma.conversation.update({
            where: { id: conversationId },
            data: { assignedToId: assignedUserId, assignedTeamId: team.id }
        });
    }
    return assignedUserId;
}

/**
 * Takım atama kuralına göre konuşmayı bir ekip üyesine atar
 */
export async function assignToTeamMember(teamId, conversationId) {
    try {
        // 🛡️ GUARD: Konuşma zaten birine atanmışsa atamayı değiştirme
        const existingConv = await prisma.conversation.findUnique({
            where: { id: conversationId },
            select: { assignedToId: true }
        });
        if (existingConv?.assignedToId) {
            console.log(`🛡️ [TeamAssign] Konuşma zaten ${existingConv.assignedToId}'ye atanmış — atama korunuyor`);
            return existingConv.assignedToId;
        }

        const team = await prisma.team.findUnique({
            where: { id: teamId },
            include: {
                members: {
                    where: { userId: { not: null } },
                    include: { user: true }
                }
            }
        });

        if (!team || !team.members || team.members.length === 0) {
            console.log(`📋 [TeamAssign] Takım ${team?.name || teamId} — üye yok, havuzda`);
            return null;
        }

        const mode = team.distributionMode || 'POOL';

        switch (mode) {
            case 'POOL': {
                // Havuzda beklet — kimseye atama
                console.log(`📂 [TeamAssign] "${team.name}" → HAVUZDA BEKLET`);
                await prisma.conversation.update({
                    where: { id: conversationId },
                    data: { assignedTeamId: teamId }
                });
                return null;
            }

            case 'DISTRIBUTE': {
                // Hemen dağıt
                console.log(`🔄 [TeamAssign] "${team.name}" → HEMEN DAĞIT`);
                const result = await distributeByMethod(team, conversationId, team.distributionMethod);
                if (!result) {
                    // Dağıtılamadıysa (online yoksa vs) havuzda tut
                    await prisma.conversation.update({
                        where: { id: conversationId },
                        data: { assignedTeamId: teamId }
                    });
                }
                return result;
            }

            case 'CONDITIONAL': {
                // Koşullu dağıt — koşulları kontrol et
                console.log(`⚡ [TeamAssign] "${team.name}" → KOŞULLU DAĞIT, koşulları kontrol ediliyor...`);

                const conversation = await prisma.conversation.findUnique({
                    where: { id: conversationId },
                    include: { contact: true }
                });

                let shouldDistribute = false;

                // Telefon koşulu
                if (team.triggerOnPhone) {
                    const phone = conversation?.contact?.phone || conversation?.contact?.phoneNumber || '';
                    if (phone.trim().length > 0) {
                        console.log(`📱 [Conditional] Telefon var → dağıt`);
                        shouldDistribute = true;
                    }
                }

                // E-posta koşulu
                if (!shouldDistribute && team.triggerOnEmail) {
                    const email = conversation?.contact?.email || '';
                    if (email.trim().length > 0) {
                        console.log(`📧 [Conditional] E-posta var → dağıt`);
                        shouldDistribute = true;
                    }
                }

                // Görüşme planı koşulu
                if (!shouldDistribute && team.triggerOnAppointment) {
                    const hasAppointment = await prisma.appointment.count({
                        where: { contactId: conversation?.contact?.id }
                    }).catch(() => 0);
                    if (hasAppointment > 0) {
                        console.log(`📅 [Conditional] Randevu var → dağıt`);
                        shouldDistribute = true;
                    }
                }

                if (shouldDistribute) {
                    return await distributeByMethod(team, conversationId, team.distributionMethod);
                }

                // Koşul yok — havuzda tut
                console.log(`⏳ [Conditional] Koşul oluşmadı, havuzda bekliyor`);
                await prisma.conversation.update({
                    where: { id: conversationId },
                    data: { assignedTeamId: teamId }
                });
                return null;
            }

            default: {
                // Legacy assignmentRule desteği
                const legacyRule = team.assignmentRule || 'POOL';
                if (legacyRule === 'POOL' || legacyRule === 'MANUAL') {
                    await prisma.conversation.update({
                        where: { id: conversationId },
                        data: { assignedTeamId: teamId }
                    });
                    return null;
                }
                return await distributeByMethod(team, conversationId, legacyRule);
            }
        }
    } catch (error) {
        console.error('❌ [TeamAssign] Hata:', error.message);
        return null;
    }
}

/**
 * Koşullu dağıtım tetikleyicisi — telefon/eposta eklendiğinde çağrılır
 */
export async function checkAndDistributeByTrigger(conversationId, triggerType) {
    try {
        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
            include: { contact: true }
        });

        if (!conversation || conversation.assignedToId) {
            // Zaten birine atanmış
            return null;
        }

        if (!conversation.assignedTeamId) return null;

        const team = await prisma.team.findUnique({
            where: { id: conversation.assignedTeamId },
            include: {
                members: {
                    where: { userId: { not: null } },
                    include: { user: true }
                }
            }
        });

        if (!team || team.distributionMode !== 'CONDITIONAL') return null;

        let triggered = false;

        if (triggerType === 'PHONE' && team.triggerOnPhone) {
            const phone = conversation.contact?.phone || conversation.contact?.phoneNumber || '';
            triggered = phone.trim().length > 0;
        } else if (triggerType === 'EMAIL' && team.triggerOnEmail) {
            const email = conversation.contact?.email || '';
            triggered = email.trim().length > 0;
        } else if (triggerType === 'APPOINTMENT' && team.triggerOnAppointment) {
            triggered = true;
        }

        if (triggered) {
            console.log(`⚡ [Trigger] ${triggerType} tetiklendi → "${team.name}" dağıtılıyor`);
            return await distributeByMethod(team, conversationId, team.distributionMethod);
        }

        return null;
    } catch (error) {
        console.error('❌ [Trigger] Hata:', error.message);
        return null;
    }
}

/**
 * Süre dolan havuz yazışmalarını dağıt (cron ile çağrılır)
 */
export async function processTimeoutDistributions() {
    try {
        const teams = await prisma.team.findMany({
            where: {
                distributionMode: 'CONDITIONAL',
                triggerTimeoutMinutes: { not: null, gt: 0 }
            },
            include: {
                members: {
                    where: { userId: { not: null } },
                    include: { user: true }
                }
            }
        });

        let distributed = 0;

        for (const team of teams) {
            const cutoff = new Date(Date.now() - team.triggerTimeoutMinutes * 60 * 1000);

            const staleConversations = await prisma.conversation.findMany({
                where: {
                    assignedTeamId: team.id,
                    assignedToId: null,
                    status: 'OPEN',
                    assignedAt: { lte: cutoff }
                }
            });

            for (const conv of staleConversations) {
                console.log(`⏰ [Timeout] "${team.name}" → ${conv.id} süresi doldu, dağıtılıyor`);
                const result = await distributeByMethod(team, conv.id, team.distributionMethod);
                if (result) distributed++;
            }
        }

        if (distributed > 0) {
            console.log(`⏰ [Timeout] Toplam ${distributed} yazışma süre aşımıyla dağıtıldı`);
        }
    } catch (error) {
        console.error('❌ [Timeout] Hata:', error.message);
    }
}
