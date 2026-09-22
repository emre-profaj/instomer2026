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

    // Mesai dışındaki temsilciye konuşma atanmasın. Saati girilmemiş
    // kişilerde kısıt yok sayılır (isWorkingAt true döner).
    const humanMembers = branchFilteredMembers.filter(m => isWorkingAt(m.user?.workingHours));
    if (humanMembers.length === 0) {
        const kapali = branchFilteredMembers
            .map(m => `${m.user?.name}: ${unavailabilityReason(m.user?.workingHours) || 'uygun değil'}`)
            .join(', ');
        console.log(`🕒 [Distribute] "${team.name}" → şu an çalışan üye yok, havuzda bekliyor (${kapali})`);
        return null;
    }
    if (humanMembers.length < branchFilteredMembers.length) {
        const atlanan = branchFilteredMembers
            .filter(m => !humanMembers.includes(m))
            .map(m => m.user?.name)
            .join(', ');
        console.log(`🕒 [Distribute] "${team.name}" → mesai dışı atlandı: ${atlanan}`);
    }

    // Kapasitesi dolmuş temsilciye yeni iş verilmez. Sınır tanımlı değilse
    // (null) kısıt yok. Herkes doluysa konuşma havuzda bekler — birine
    // zorla yığmaktansa görünür şekilde beklemesi daha iyi.
    const musaitUyeler = [];
    for (const m of humanMembers) {
        const uyelik = await prisma.workspaceMember.findFirst({
            where: { userId: m.userId, workspaceId: team.workspaceId },
            select: { maxOpenConversations: true }
        });
        const limit = uyelik?.maxOpenConversations || null;
        if (!limit) { musaitUyeler.push(m); continue; }
        const acik = await prisma.conversation.count({
            where: { assignedToId: m.userId, status: 'OPEN' }
        });
        if (acik < limit) musaitUyeler.push(m);
        else console.log(`📦 [Distribute] ${m.user?.name} kapasitesi dolu (${acik}/${limit}) — atlandı`);
    }
    if (musaitUyeler.length === 0) {
        console.log(`📦 [Distribute] "${team.name}" → herkesin kapasitesi dolu, havuzda bekliyor`);
        return null;
    }
    humanMembers.length = 0;
    humanMembers.push(...musaitUyeler);

    let assignedUserId = null;
    const effectiveMethod = method || team.distributionMethod || 'ROUND_ROBIN';

    switch (effectiveMethod) {
        case 'ROUND_ROBIN': {
            // İndeksi ÖNCE atomik artır, sonra dönen değeri kullan. Eski hâlde
            // iki mesaj aynı anda gelince ikisi de aynı indeksi okuyup aynı
            // kişiye atanıyordu.
            const guncel = await prisma.team.update({
                where: { id: team.id },
                data: { roundRobinIndex: { increment: 1 } },
                select: { roundRobinIndex: true }
            });
            const idx = ((guncel.roundRobinIndex || 1) - 1) % humanMembers.length;
            assignedUserId = humanMembers[idx].userId;
            console.log(`🔄 [Distribute] "${team.name}" → ROUND ROBIN → ${humanMembers[idx].user.name} (sıra ${idx + 1}/${humanMembers.length})`);
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
                const guncel = await prisma.team.update({
                    where: { id: team.id },
                    data: { roundRobinIndex: { increment: 1 } },
                    select: { roundRobinIndex: true }
                });
                const idx = ((guncel.roundRobinIndex || 1) - 1) % online.length;
                assignedUserId = online[idx].userId;
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
