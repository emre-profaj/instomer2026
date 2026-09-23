import prisma from '../lib/prisma.js';
import { cascadeAssignment } from './cascadeAssignment.service.js';
import { isWorkingAt, unavailabilityReason } from '../utils/workingHours.js';

/**
 * Dağıtım metoduna göre uygun üyeyi seç ve ata
 */
async function distributeByMethod(team, conversationId, method, force = false) {
    if (!force) {
        // 🛡️ GUARD: Konuşma zaten birine atanmışsa dağıtım yapma
        const existingConv = await prisma.conversation.findUnique({
            where: { id: conversationId },
            select: { assignedToId: true }
        });
        if (existingConv?.assignedToId) {
            console.log(`🛡️ [Distribute] Konuşma zaten ${existingConv.assignedToId}'ye atanmış — dağıtım yapılmıyor`);
            return existingConv.assignedToId; // Mevcut atamayı koru
        }
    }

    // Sıra KARARLI olmalı: members sorgusu sıralama vermiyordu, dolayısıyla
    // artan indeks her seferinde farklı diziye uygulanıyor, aynı kişi üst üste
    // seçilebiliyordu. Üyelik oluşma sırasına göre sabitliyoruz.
    const allHumanMembers = team.members
        .filter(m => m.userId && m.user)
        .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0) || String(a.id).localeCompare(String(b.id)));
    if (allHumanMembers.length === 0) return null;

    // ── ŞUBE FİLTRESİ ──
    // Konuşmanın şubesi varsa, sadece o şubeye atanmış üyeleri tercih et.
    // branchIds null veya [] olan üyeler "tüm şubeler" yetkili kabul edilir.
    // Şube eşleşen kimse yoksa → tüm takıma aç (havuzda beklesin).
    let branchFilteredMembers = allHumanMembers;
    const conv = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { branchId: true }
    });
    if (conv?.branchId) {
        const branchMatched = [];
        for (const m of allHumanMembers) {
            const wsMember = await prisma.workspaceMember.findFirst({
                where: { userId: m.userId, workspaceId: team.workspaceId },
                select: { branchIds: true }
            });
            const memberBranchIds = (() => {
                try { return JSON.parse(wsMember?.branchIds || '[]'); } catch { return []; }
            })();
            // null, [] veya boş = tüm şubeler yetkili
            if (!memberBranchIds || memberBranchIds.length === 0 || memberBranchIds.includes(conv.branchId)) {
                branchMatched.push(m);
            }
        }
        if (branchMatched.length > 0) {
            branchFilteredMembers = branchMatched;
            console.log(`📍 [Distribute] Şube filtresi: ${conv.branchId} → ${branchMatched.length}/${allHumanMembers.length} üye eşleşti`);
        } else {
            console.log(`📍 [Distribute] Şube ${conv.branchId} için eşleşen üye yok → tüm takıma açık`);
        }
    }

    const effectiveMethod = method || team.distributionMethod || 'ROUND_ROBIN';

    // ── KURALA GÖRE ADAYLARI BELİRLE ──
    let candidateMembers = [...branchFilteredMembers];

    if (effectiveMethod === 'WORKING_HOURS_ONLY') {
        // Yalnızca mesai saatindeki üyeler
        candidateMembers = candidateMembers.filter(m => isWorkingAt(m.user?.workingHours));
        if (candidateMembers.length === 0) {
            console.log(`🕒 [Distribute] "${team.name}" → WORKING_HOURS_ONLY seçili ama şu an mesaide üye yok, konuşma havuzda bekletiliyor`);
            return null;
        }
    } else if (effectiveMethod === 'ONLINE_ONLY') {
        // Yalnızca çevrimiçi olan üyeler
        candidateMembers = candidateMembers.filter(m => m.user?.isOnline);
        if (candidateMembers.length === 0) {
            console.log(`🟢 [Distribute] "${team.name}" → ONLINE_ONLY seçili ama şu an online üye yok, konuşma havuzda bekletiliyor`);
            return null;
        }
    } else if (effectiveMethod === 'ROUND_ROBIN') {
        // Sırayla dağıt: Mesai saatindeki üyeleri öncelikle tercih et; mesaide kimse yoksa tüm üyelere dağıt
        const mesaidekiler = candidateMembers.filter(m => isWorkingAt(m.user?.workingHours));
        if (mesaidekiler.length > 0) {
            candidateMembers = mesaidekiler;
        } else {
            console.log(`🕒 [Distribute] "${team.name}" → şu an mesaide üye yok, takımdaki tüm üyelere sırayla dağıtılıyor (${candidateMembers.length} üye)`);
        }
    }

    // ── KAPASİTE (X KADAR AÇIK YAZIŞMA) KONTROLÜ ──
    // "Üzerinde x kadar açık yazışma olana takip ettiği çok müşteri var diye dağıtım yapma"
    // X sınırı: Üyenin kendi maxOpenConversations ayarı varsa o, yoksa takımın maxOpenConversations ayarı.
    const teamLimit = team.maxOpenConversations || null;
    const musaitUyeler = [];

    for (const m of candidateMembers) {
        let limit = teamLimit;
        try {
            const uyelik = await prisma.workspaceMember.findFirst({
                where: { userId: m.userId, workspaceId: team.workspaceId },
                select: { maxOpenConversations: true }
            });
            if (uyelik?.maxOpenConversations !== null && uyelik?.maxOpenConversations !== undefined) {
                limit = uyelik.maxOpenConversations;
            }
        } catch (_) {}

        if (!limit || limit <= 0) {
            // Sınır yok
            musaitUyeler.push(m);
            continue;
        }

        const acik = await prisma.conversation.count({
            where: { assignedToId: m.userId, workspaceId: team.workspaceId, status: 'OPEN' }
        });

        if (acik < limit) {
            musaitUyeler.push(m);
        } else {
            console.log(`📦 [Distribute] ${m.user?.name} açık sohbet kapasitesi dolu (${acik}/${limit}) — takip ettiği çok müşteri var, atlandı`);
        }
    }

    if (musaitUyeler.length === 0) {
        console.log(`📦 [Distribute] "${team.name}" → Tüm adayların açık sohbet kapasitesi dolu (${teamLimit ? 'takım limiti: ' + teamLimit : 'bireysel limitler'}). Konuşma havuzda bekletiliyor.`);
        return null;
    }

    let assignedUserId = null;

    if (effectiveMethod === 'LEAST_BUSY') {
        let minCount = Infinity, chosen = musaitUyeler[0];
        for (const m of musaitUyeler) {
            const cnt = await prisma.conversation.count({ where: { assignedToId: m.userId, workspaceId: team.workspaceId, status: 'OPEN' } });
            if (cnt < minCount) { minCount = cnt; chosen = m; }
        }
        assignedUserId = chosen.userId;
        console.log(`📊 [Distribute] "${team.name}" → LEAST BUSY → ${chosen.user.name} (${minCount} açık)`);
    } else {
        // ROUND_ROBIN, WORKING_HOURS_ONLY, ONLINE_ONLY
        const guncel = await prisma.team.update({
            where: { id: team.id },
            data: { roundRobinIndex: { increment: 1 } },
            select: { roundRobinIndex: true }
        });
        const idx = ((guncel.roundRobinIndex || 1) - 1) % musaitUyeler.length;
        assignedUserId = musaitUyeler[idx].userId;
        console.log(`🔄 [Distribute] "${team.name}" → ${effectiveMethod} → ${musaitUyeler[idx].user.name} (sıra ${idx + 1}/${musaitUyeler.length})`);
    }

    if (assignedUserId) {
        await prisma.conversation.update({
            where: { id: conversationId },
            data: { assignedToId: assignedUserId, assignedTeamId: team.id, teamIds: JSON.stringify([team.id]) }
        });
        // 🔄 Case ve kardeş konuşmalara yansıt
        await cascadeAssignment(conversationId, team.workspaceId, {
            assignedToId: assignedUserId,
            assignedTeamId: team.id,
            teamIds: JSON.stringify([team.id]),
            source: 'TeamDistribution'
        });
    }
    return assignedUserId;
}

/**
 * Takım atama kuralına göre konuşmayı bir ekip üyesine atar
 */
export async function assignToTeamMember(teamId, conversationId, options = {}) {
    const force = typeof options === 'boolean' ? options : !!options?.force;
    try {
        const team = await prisma.team.findUnique({
            where: { id: teamId },
            include: {
                members: {
                    where: { userId: { not: null } },
                    include: { user: true }
                }
            }
        });

        if (!team) return null;

        if (!force) {
            const existingConv = await prisma.conversation.findUnique({
                where: { id: conversationId },
                select: { assignedToId: true, assignedTeamId: true }
            });
            if (existingConv?.assignedToId) {
                const isMember = team.members?.some(m => m.userId === existingConv.assignedToId);
                if (isMember && existingConv.assignedTeamId === teamId) {
                    console.log(`🛡️ [TeamAssign] Konuşma zaten takım üyesi ${existingConv.assignedToId}'ye atanmış — atama korunuyor`);
                    return existingConv.assignedToId;
                }
            }
        }

        if (!team.members || team.members.length === 0) {
            console.log(`📋 [TeamAssign] Takım ${team.name || teamId} — üye yok, havuzda`);
            await prisma.conversation.update({
                where: { id: conversationId },
                data: { assignedTeamId: teamId, teamIds: JSON.stringify([teamId]), assignedToId: null }
            });
            await cascadeAssignment(conversationId, team.workspaceId, {
                assignedTeamId: teamId,
                assignedToId: null,
                teamIds: JSON.stringify([teamId]),
                source: 'TeamEmptyPool'
            });
            return null;
        }

        const mode = team.distributionMode || 'POOL';

        switch (mode) {
            case 'POOL': {
                // Havuzda beklet — kimseye atama
                console.log(`📂 [TeamAssign] "${team.name}" → HAVUZDA BEKLET`);
                await prisma.conversation.update({
                    where: { id: conversationId },
                    data: { assignedTeamId: teamId, teamIds: JSON.stringify([teamId]), assignedToId: null }
                });
                // 🔄 Case'e takım atamasını yansıt
                await cascadeAssignment(conversationId, team.workspaceId, {
                    assignedTeamId: teamId,
                    assignedToId: null,
                    teamIds: JSON.stringify([teamId]),
                    source: 'TeamPool'
                });
                return null;
            }

            case 'DISTRIBUTE': {
                // Hemen dağıt
                console.log(`🔄 [TeamAssign] "${team.name}" → HEMEN DAĞIT`);
                const result = await distributeByMethod(team, conversationId, team.distributionMethod, force);
                if (!result) {
                    // Dağıtılamadıysa (online yoksa vs) havuzda tut
                    await prisma.conversation.update({
                        where: { id: conversationId },
                        data: { assignedTeamId: teamId, teamIds: JSON.stringify([teamId]), assignedToId: null }
                    });
                    // 🔄 Case'e takım atamasını yansıt
                    await cascadeAssignment(conversationId, team.workspaceId, {
                        assignedTeamId: teamId,
                        assignedToId: null,
                        teamIds: JSON.stringify([teamId]),
                        source: 'TeamPoolFallback'
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
                // 🔄 Case'e takım atamasını yansıt
                await cascadeAssignment(conversationId, team.workspaceId, {
                    assignedTeamId: teamId,
                    source: 'TeamConditionalPool'
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
                    // 🔄 Case'e takım atamasını yansıt
                    await cascadeAssignment(conversationId, team.workspaceId, {
                        assignedTeamId: teamId,
                        source: 'TeamLegacyPool'
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

/**
 * Temsilci sohbet kapattığında veya havuzda bekleyen konuşmalar olduğunda
 * takımın havuzundaki bekleyen konuşmaları sırayla dağıtır.
 */
export async function distributeWaitingTeamConversations(teamId) {
    if (!teamId) return;
    try {
        const team = await prisma.team.findUnique({
            where: { id: teamId },
            include: {
                members: {
                    where: { userId: { not: null } },
                    include: { user: true }
                }
            }
        });
        if (!team || team.distributionMode !== 'DISTRIBUTE') return;

        // Havuzda bekleyen (takıma atanmış ama henüz kişiye atanmamış) açık konuşmaları bul
        const waitingConvs = await prisma.conversation.findMany({
            where: {
                assignedTeamId: teamId,
                assignedToId: null,
                status: 'OPEN'
            },
            orderBy: { createdAt: 'asc' },
            take: 10
        });

        for (const conv of waitingConvs) {
            const assigned = await distributeByMethod(team, conv.id, team.distributionMethod, true);
            if (!assigned) {
                // Hâlâ müsait kimse kalmadıysa dur
                break;
            }
        }
    } catch (err) {
        console.error('❌ [DistributeWaiting] Hata:', err.message);
    }
}

