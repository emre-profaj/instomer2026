import prisma from '../lib/prisma.js';
import { isAgentRole, getAgentTeamIds, buildAgentActivityFilter } from '../utils/rbac.helper.js';
import { parseCommentIntent, parseStageIntent } from '../utils/commentIntentParser.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { evaluateAndApplyRules } from '../services/stageRuleEngine.service.js';

// ─── Turkey Timezone Helpers (UTC+3) ───────────────────────────
const TZ_OFFSET_MS = 3 * 60 * 60 * 1000;
function parseDateStartTR(dateStr) {
    const dateOnly = String(dateStr).includes('T') ? String(dateStr).split('T')[0] : dateStr;
    const d = new Date(dateOnly + 'T00:00:00.000Z');
    if (isNaN(d.getTime())) return new Date();
    return new Date(d.getTime() - TZ_OFFSET_MS);
}
function parseDateEndTR(dateStr) {
    const dateOnly = String(dateStr).includes('T') ? String(dateStr).split('T')[0] : dateStr;
    const d = new Date(dateOnly + 'T00:00:00.000Z');
    if (isNaN(d.getTime())) return new Date();
    return new Date(d.getTime() - TZ_OFFSET_MS + 24 * 60 * 60 * 1000 - 1);
}

// ────────────────────────────────────────────────────────────────────────────
// CREATE ACTIVITY
// ────────────────────────────────────────────────────────────────────────────
export const createActivity = async (req, res) => {
    try {
        const { contactId } = req.params;
        const { workspaceId, type, title, description, dueDate, assignedToId, teamId } = req.body;
        const userId = req.user.id;

        // Frontend can explicitly set status (e.g. call notes → COMPLETED)
        const explicitStatus = req.body.status;
        const explicitCompletedAt = req.body.completedAt;

        // Geçmiş tarih kontrolü
        if (dueDate) {
            const now = new Date();
            const dueDateObj = new Date(dueDate);
            const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
            if (dueDateObj < fiveMinutesAgo) {
                return res.status(400).json({ error: 'Geçmiş tarihli aktivite oluşturulamaz' });
            }
        }

        // Yetki Kontrolü
        const contact = await prisma.contact.findFirst({
            where: { 
                id: contactId, 
                OR: [
                    { workspaceId: workspaceId },
                    { conversations: { some: { workspaceId: workspaceId } } }
                ]
            }
        });

        if (!contact) {
            return res.status(404).json({ error: 'Kişi bulunamadı veya bu workspace\'e ait değil.' });
        }

        // Status belirleme: frontend gönderiyorsa onu kullan, yoksa oto-belirle
        // CALL ve MEETING her zaman PLANNED başlar (tarih girilmese bile), sadece NOTE COMPLETED
        const resolvedStatus = explicitStatus || (
            type === 'NOTE' ? 'COMPLETED' :
            (type === 'CALL' || type === 'MEETING') ? 'PLANNED' :
            (dueDate ? 'PLANNED' : 'COMPLETED')
        );
        const resolvedIsCompleted = resolvedStatus === 'COMPLETED';
        const resolvedCompletedAt = resolvedIsCompleted
            ? (explicitCompletedAt ? new Date(explicitCompletedAt) : new Date())
            : null;

        // ── Planlanmış arama varsa onu tamamla (yeni kayıt oluşturmak yerine) ──
        // Kullanıcı "Görüşme Notu Ekle" ile CALL+COMPLETED gönderdiğinde,
        // aynı kişi için açık (PLANNED) bir arama varsa onu güncelle.
        // Frontend'den completePlannedCall flag'i gelmezse yeni kayıt oluştur.
        if (type === 'CALL' && resolvedStatus === 'COMPLETED' && req.body.completePlannedCall) {
            const existingPlannedCall = await prisma.contactActivity.findFirst({
                where: {
                    contactId,
                    workspaceId,
                    type: { in: ['CALL', 'REMINDER'] },
                    status: { in: ['PLANNED', 'IN_PROGRESS'] }
                },
                orderBy: { dueDate: 'asc' } // En eski planlanmış aramayı al
            });

            if (existingPlannedCall) {
                const updatedActivity = await prisma.contactActivity.update({
                    where: { id: existingPlannedCall.id },
                    data: {
                        status: 'COMPLETED',
                        isCompleted: true,
                        completedAt: new Date(),
                        result: description,
                        description: description || existingPlannedCall.description,
                        assignedToId: assignedToId || userId,
                        ...(req.body.callSuccessful !== undefined ? { callSuccessful: req.body.callSuccessful } : {}),
                        ...(req.body.callSentiment ? { callSentiment: req.body.callSentiment } : {}),
                        ...(req.body.caseId ? { caseId: req.body.caseId } : {}),
                        assignedById: req.user?.id || null,
                        assignedByType: 'USER',
                        assignedAt: new Date()
                    },
                    include: {
                        creator: { select: { name: true, role: true } },
                        assignee: { select: { name: true } },
                        team: { select: { name: true } }
                    }
                });

                console.log(`✅ [CallNote] Planlanmış arama tamamlandı (${existingPlannedCall.id}) — yeni kayıt oluşturulmadı`);

                try {
                    const io = req.app.get('io');
                    if (io) {
                        io.to(`workspace_${workspaceId}`).emit('activity_completed', {
                            activityId: existingPlannedCall.id,
                            type: existingPlannedCall.type,
                            completedByName: req.user?.name || 'Sistem'
                        });
                    }
                } catch (err) {
                    console.error('Activity completion socket error:', err);
                }

                // 🔔 CALL AUTOMATION: Arama tamamlandıysa başarılı/başarısız otomasyonunu tetikle
                if (existingPlannedCall.type === 'CALL' && existingPlannedCall.contactId) {
                    try {
                        const { executeRetellAutomation } = await import('./automation.controller.js');
                        const callRecord = {
                            callId: `activity_${existingPlannedCall.id}`,
                            contactId: existingPlannedCall.contactId || contactId,
                            callSuccessful: req.body.callSuccessful === true || req.body.callSuccessful === 'true',
                            workspaceId
                        };
                        await executeRetellAutomation(workspaceId, callRecord);
                        console.log(`🔔 [CallNote] Call automation triggered (${req.body.callSuccessful ? 'SUCCESS' : 'FAIL'}) for completed planned call`);
                    } catch (autoErr) {
                        console.error('⚠️ [CallNote] Call automation error:', autoErr.message);
                    }
                }

                return res.status(201).json({
                    data: updatedActivity,
                    completedPlannedCall: existingPlannedCall.id
                });
            }
        }

        const newActivity = await prisma.contactActivity.create({
            data: {
                contactId,
                workspaceId,
                type,
                title,
                description,
                dueDate: dueDate ? new Date(dueDate) : null,
                assignedToId: assignedToId ? assignedToId : (resolvedIsCompleted ? userId : null),
                teamId: teamId ? teamId : null,
                createdBy: userId,
                status: resolvedStatus,
                completedAt: resolvedCompletedAt,
                source: req.body.source || 'MANUAL',
                priority: req.body.priority || 'NORMAL',
                isCompleted: resolvedIsCompleted,
                caseId: req.body.caseId || null,
                // Arama sonuç bilgileri (insan aramaları için)
                ...(req.body.callSuccessful !== undefined ? { callSuccessful: req.body.callSuccessful } : {}),
                ...(req.body.callSentiment ? { callSentiment: req.body.callSentiment } : {}),
                // Atama bilgisi — açıkça atama yapıldıysa ya da oto-atama varsa
                ...((assignedToId || resolvedIsCompleted) ? {
                    assignedById: req.user?.id || null,
                    assignedByType: req.user?.id ? 'USER' : 'SYSTEM',
                    assignedAt: new Date()
                } : {})
            },
            include: {
                creator: { select: { name: true, role: true } },
                assignee: { select: { name: true } },
                team: { select: { name: true } }
            }
        });

        // ━━━ Aktivite Bildirimleri ━━━
        try {
            const io = req.app.get('io');
            if (io) {
                io.to(`workspace_${workspaceId}`).emit('activity_created', {
                    activity: { id: newActivity.id, type: newActivity.type, title: newActivity.title, status: newActivity.status },
                    contactId,
                    contactName: contact?.name || 'Bilinmeyen',
                    createdByName: req.user?.name || 'Sistem',
                    type: newActivity.type
                });
                if (newActivity.assignedToId && newActivity.assignedToId !== req.user?.id) {
                    io.to(`workspace_${workspaceId}`).emit('activity_assigned', {
                        activity: { id: newActivity.id, type: newActivity.type, title: newActivity.title },
                        assignedToId: newActivity.assignedToId,
                        assignedByName: req.user?.name || 'Sistem',
                        contactName: contact?.name || 'Bilinmeyen',
                    });
                }
            }
        } catch (socketErr) {
            console.error('Activity socket emit error:', socketErr);
        }

        // Note: We no longer create a redundant 'SYSTEM' message in the Conversation here.
        // Activities are rendered via the dedicated Activity Card UI using ContactActivity timeline.

        if (newActivity.status === 'COMPLETED') {
            try {
                const io = req.app.get('io');
                if (io) {
                    io.to(`workspace_${workspaceId}`).emit('activity_completed', {
                        activityId: newActivity.id,
                        type: newActivity.type,
                        completedByName: req.user?.name || 'Sistem'
                    });
                }
            } catch (err) {
                console.error('Activity completion socket error:', err);
            }

            // 🔔 CALL AUTOMATION: Yeni CALL+COMPLETED oluşturulduğunda otomasyonu tetikle
            if (type === 'CALL' && contactId) {
                try {
                    const { executeRetellAutomation } = await import('./automation.controller.js');
                    const callRecord = {
                        callId: `activity_${newActivity.id}`,
                        contactId,
                        callSuccessful: req.body.callSuccessful === true || req.body.callSuccessful === 'true',
                        workspaceId
                    };
                    await executeRetellAutomation(workspaceId, callRecord);
                    console.log(`🔔 [CreateActivity] Call automation triggered (${req.body.callSuccessful ? 'SUCCESS' : 'FAIL'}) for new call activity`);
                } catch (autoErr) {
                    console.error('⚠️ [CreateActivity] Call automation error:', autoErr.message);
                }
            }
        }

        // ── Akıllı intent algılama: zamanlama anahtar kelimesi varsa otomatik planlama ──
        // Tamamlanmış arama notlarında da çalışır — "haftaya salı saat 9 da ara" gibi
        // gelecek planları içerebilir.
        let autoActivity = null;
        if (newActivity.description) {
            try {
                // Workspace timezone'unu al (intent parser doğru saat dilimiyle çalışsın)
                const ws = await prisma.workspace.findUnique({
                    where: { id: workspaceId },
                    select: { timezone: true }
                });
                const tz = ws?.timezone || 'Europe/Istanbul';
                const intent = parseCommentIntent(newActivity.description, tz);
                if (intent.hasIntent) {
                    let assignToUserId = null;
                    let assignToTeamId = teamId || null;

                    if (intent.mention) {
                        const matchedTeam = await prisma.team.findFirst({
                            where: { workspaceId, name: { contains: intent.mention, mode: 'insensitive' } }
                        });
                        if (matchedTeam) {
                            assignToTeamId = matchedTeam.id;
                        } else {
                            const matchedUser = await prisma.user.findFirst({
                                where: {
                                    name: { contains: intent.mention, mode: 'insensitive' },
                                    memberships: { some: { workspaceId } }
                                }
                            });
                            if (matchedUser) assignToUserId = matchedUser.id;
                        }
                    }

                    // Atama mirası: Mention yoksa conversation'dan miras al
                    let inheritedCaseId = null;
                    if (!assignToUserId) {
                        const conv = await prisma.conversation.findFirst({
                            where: { contactId, workspaceId },
                            orderBy: { updatedAt: 'desc' },
                            select: { assignedToId: true, caseId: true }
                        });
                        if (conv?.assignedToId) assignToUserId = conv.assignedToId;
                        inheritedCaseId = conv?.caseId || null;
                    }

                    const planned = await prisma.contactActivity.create({
                        data: {
                            contactId,
                            workspaceId,
                            type: intent.action,
                            title: intent.action === 'CALL' ? 'Planlanan Arama' : 'Planlanan Görüşme',
                            description: `Otomatik oluşturuldu: "${newActivity.description.substring(0, 200)}"`,
                            status: 'PLANNED',
                            dueDate: intent.dueDate,
                            assignedToId: assignToUserId || null,
                            createdBy: userId,
                            ...(assignToTeamId && { teamId: assignToTeamId }),
                            ...(inheritedCaseId ? { caseId: inheritedCaseId } : {}),
                            source: 'AUTO',
                            ...(assignToUserId ? {
                                assignedById: userId,
                                assignedByType: 'SYSTEM',
                                assignedAt: new Date()
                            } : {})
                        }
                    });

                    autoActivity = { id: planned.id, type: intent.action, dueDate: intent.dueDate, summary: intent.summary };
                    console.log(`🤖 [AutoIntent/Activity] ${intent.summary}`);

                    // Nottan algılanan intent'e göre rule engine tetikle
                    // (takım ataması, bildirimler, socket event'ler için)
                    try {
                        if (intent.action === 'CALL') {
                            const { executeAutoCallPlanning } = await import('./rules.controller.js');
                            executeAutoCallPlanning(workspaceId, contactId, 'NOT_INTENT').catch(e =>
                                console.error('⚠️ [AutoIntent] Call planning error:', e.message)
                            );
                        } else if (intent.action === 'MEETING') {
                            const { executeAppointmentPlanning } = await import('./rules.controller.js');
                            executeAppointmentPlanning(workspaceId, contactId, 'NOT_INTENT', {
                                topic: newActivity.description?.substring(0, 100) || 'Randevu Talebi',
                                dateTime: intent.dueDate
                            }).catch(e =>
                                console.error('⚠️ [AutoIntent] Appointment planning error:', e.message)
                            );
                        }
                    } catch (ruleErr) {
                        console.error('⚠️ [AutoIntent] Rule trigger error:', ruleErr.message);
                    }
                }
            } catch (intentErr) {
                console.error('Intent parser error in createActivity (non-blocking):', intentErr);
            }
        }

        // ── Aşama değişikliği algılama: ilgisiz, ulaşılamadı, pahalı vb. ──
        let stageChange = null;
        if (newActivity.description) {
            try {
                const stageIntent = parseStageIntent(newActivity.description);
                if (stageIntent.hasStageIntent) {
                    // Contact'ın konuşmasını bul
                    const conv = await prisma.conversation.findFirst({
                        where: { contactId, workspaceId },
                        select: { id: true, funnelStageId: true },
                        orderBy: { updatedAt: 'desc' }
                    });

                    if (conv) {
                        const funnels = await prisma.funnel.findMany({
                            where: { workspaceId },
                            include: { stages: true }
                        });

                        // Mevcut akışı bul
                        let currentFunnel = null;
                        if (conv.funnelStageId) {
                            for (const f of funnels) {
                                if ((f.stages || []).some(s => s.id === conv.funnelStageId)) {
                                    currentFunnel = f;
                                    break;
                                }
                            }
                        }

                        const searchInStages = (stages) => {
                            for (const term of stageIntent.stageSearch) {
                                const found = stages.find(s => s.name.toLowerCase().includes(term));
                                if (found) return found;
                            }
                            return null;
                        };

                        let matchedStage = currentFunnel ? searchInStages(currentFunnel.stages || []) : null;
                        if (!matchedStage) {
                            for (const f of funnels) {
                                matchedStage = searchInStages(f.stages || []);
                                if (matchedStage) break;
                            }
                        }

                        if (matchedStage) {
                            await prisma.conversation.update({
                                where: { id: conv.id },
                                data: { funnelStageId: matchedStage.id }
                            });

                            stageChange = {
                                stageId: matchedStage.id,
                                stageName: matchedStage.name,
                                stageColor: matchedStage.color,
                                category: stageIntent.category,
                                label: stageIntent.label,
                                summary: `🏷️ Aşama değişti → ${matchedStage.name} (${stageIntent.label})`
                            };

                            console.log(`🏷️ [AutoStage/Activity] ${stageChange.summary}`);

                            // 📋 Yazışma ekranına otomatik log notu düş
                            try {
                                await prisma.internalNote.create({
                                    data: {
                                        conversationId: conv.id,
                                        userId,
                                        content: `🏷️ ${stageIntent.label} olarak işaretlendi → ${matchedStage.name}\nSebep: "${description.substring(0, 200)}"`,
                                        mentionedUsers: '[]'
                                    }
                                });
                            } catch (logErr) {
                                console.error('Auto stage log error:', logErr);
                            }
                        }
                    }
                }
            } catch (stageErr) {
                console.error('Stage intent error in createActivity (non-blocking):', stageErr);
            }
        }

        res.status(201).json({ ...newActivity, autoActivity, stageChange });

        // Entry Rules: Aktivite oluşturuldu/tamamlandı → aşama kurallarını değerlendir
        if (contactId && req.body.workspaceId) {
            evaluateAndApplyRules(contactId, req.body.workspaceId).catch(err =>
                console.error('⚠️ [CreateActivity] Entry rules hatası:', err.message)
            );
        }

        // Lead skorunu güncelle (aktivite eklendi → puan değişmiş olabilir)
        if (contactId) {
            import('../services/leadScoring.service.js').then(({ updateLeadScore }) => {
                updateLeadScore(contactId).catch(err =>
                    console.error('⚠️ [CreateActivity] Score update hatası:', err.message)
                );
            });
        }
    } catch (error) {
        console.error('Create Activity Error:', error);
        res.status(500).json({ error: 'Etkinlik oluşturulurken bir hata oluştu.' });
    }
};

// ────────────────────────────────────────────────────────────────────────────
// GET CONTACT TIMELINE
// ────────────────────────────────────────────────────────────────────────────
export const getContactTimeline = async (req, res) => {
    try {
        const { contactId } = req.params;
        const { workspaceId } = req.query; // Query'den veya token'dan gelebilir

        let activities = [];
        let conversations = [];
        let internalNotes = [];
        let appointments = [];

        // 1. Contact Activities (Not, Görev, Hatırlatıcı, Görüşme)
        try {
            activities = await prisma.contactActivity.findMany({
                where: { contactId },
                include: {
                    creator: { select: { name: true, role: true, teamMemberships: { include: { team: true } } } },
                    assignee: { select: { name: true } }
                },
                orderBy: { createdAt: 'desc' }
            });
        } catch (e) {
            console.error('Timeline Activities Error:', e.message);
        }

        // 2. Mesajlar (WhatsApp, E-posta, vb.)
        try {
            conversations = await prisma.conversation.findMany({
                where: { contactId },
                select: {
                    id: true,
                    channel: true,
                    status: true,
                    lastMessageAt: true,
                    createdAt: true,
                    aiTopic: true,
                    caseId: true,
                    messages: {
                        include: {
                            sender: { select: { name: true, role: true, teamMemberships: { include: { team: true } } } }
                        },
                        orderBy: { createdAt: 'desc' }
                    }
                }
            });
        } catch (e) {
            console.error('Timeline Conversations Error:', e.message);
        }

        // 3. Mevcut İç Notlar (Internal Notes)
        try {
            internalNotes = await prisma.internalNote.findMany({
                where: { conversation: { contactId } },
                include: {
                    user: { select: { name: true, role: true, teamMemberships: { include: { team: true } } } },
                    conversation: { select: { caseId: true } }
                },
                orderBy: { createdAt: 'desc' }
            });
        } catch (e) {
            console.error('Timeline InternalNotes Error:', e.message);
        }

        // 4. Eski Randevu ve Görevler (Appointments)
        try {
            appointments = await prisma.appointment.findMany({
                where: { contactId },
                orderBy: { startTime: 'desc' }
            });
            // Appointment modelinde assignedTo relation yok, manuel olarak çek
            if (appointments.length > 0) {
                const agentIds = [...new Set(appointments.map(a => a.assignedToId).filter(Boolean))];
                const agents = agentIds.length > 0 ? await prisma.user.findMany({
                    where: { id: { in: agentIds } },
                    select: { id: true, name: true, role: true, teamMemberships: { include: { team: true } } }
                }) : [];
                const agentMap = {};
                agents.forEach(a => { agentMap[a.id] = a; });
                appointments = appointments.map(apt => ({ ...apt, assignedTo: agentMap[apt.assignedToId] || null }));
            }
        } catch (e) {
            console.error('Timeline Appointments Error:', e.message);
        }

        // 5. Contact.notes JSON alanındaki manuel notlar
        let contactNotes = [];
        try {
            const contactRecord = await prisma.contact.findUnique({
                where: { id: contactId },
                select: { notes: true }
            });
            if (contactRecord?.notes) {
                const parsed = JSON.parse(contactRecord.notes);
                if (Array.isArray(parsed)) {
                    contactNotes = parsed;
                }
            }
        } catch (e) {
            console.error('Timeline ContactNotes Error:', e.message);
        }


        // Tümünü tek bir timeline array'inde birleştir
        const timeline = [];

        // Aktiviteleri ekle
        activities.forEach(act => {
            let labelName = act.creator?.name || 'Sistem';
            // Eğer takım bilgisi varsa ismin yanına (Satış) gibi ekle
            if (act.creator?.teamMemberships && act.creator.teamMemberships.length > 0) {
                labelName += ` (${act.creator.teamMemberships[0].team.name})`;
            }

            timeline.push({
                id: `act_${act.id}`,
                sourceType: 'ACTIVITY',
                type: act.type,
                title: act.title,
                content: act.result || act.description,
                date: act.createdAt,
                dueDate: act.dueDate,
                status: act.status,
                isCompleted: act.isCompleted,
                result: act.result,
                labelName,
                assignedToName: act.assignee?.name,
                assignedToId: act.assignedToId,
                callTopic: act.callTopic,
                callSuccessful: act.callSuccessful,
                callSentiment: act.callSentiment,
                completedByName: act.assignee?.name || act.creator?.name,
                assignedById: act.assignedById,
                assignedByType: act.assignedByType,
                assignedByName: act.creator?.name,
                caseId: act.caseId || null,
                raw: act
            });
        });

        // Mesajları ekle — her konuşma için özet + son 2 mesaj
        conversations.forEach(conv => {
            let type = 'MESSAGE';
            if (conv.channel === 'WHATSAPP') type = 'WHATSAPP';
            else if (conv.channel === 'EMAIL') type = 'EMAIL';
            else if (conv.channel === 'FACEBOOK') type = 'FACEBOOK';
            else if (conv.channel === 'INSTAGRAM') type = 'INSTAGRAM';
            else if (conv.channel === 'WIDGET') type = 'WIDGET';

            const recentMessages = (conv.messages || []).slice(0, 2).map(msg => {
                let senderName = 'Sistem';
                if (msg.isFromContact) {
                    senderName = 'Müşteri';
                } else if (msg.sender) {
                    senderName = msg.sender.name;
                    if (msg.sender.teamMemberships && msg.sender.teamMemberships.length > 0) {
                        senderName += ` (${msg.sender.teamMemberships[0].team.name})`;
                    }
                }
                return {
                    id: msg.id,
                    content: msg.content?.substring(0, 120) || '',
                    senderName,
                    isFromContact: msg.isFromContact,
                    date: msg.createdAt
                };
            });

            const totalMessages = conv.messages?.length || 0;
            const lastMessage = conv.messages?.[0];
            const lastMessageDate = lastMessage?.createdAt || conv.lastMessageAt || conv.createdAt;

            let summaryContent = '';
            if (recentMessages.length > 0) {
                summaryContent = recentMessages.map(m => `${m.senderName}: ${m.content}`).join('\n');
            }

            timeline.push({
                id: `conv_${conv.id}`,
                sourceType: 'CONVERSATION',
                type: type,
                title: type === 'EMAIL' ? (lastMessage?.emailSubject || 'E-posta') :
                    (conv.channel === 'WHATSAPP' ? 'WhatsApp' :
                        conv.channel === 'FACEBOOK' ? 'Facebook' :
                            conv.channel === 'INSTAGRAM' ? 'Instagram' :
                                conv.channel === 'WIDGET' ? 'Web Widget' : 'Sohbet'),
                aiTopic: conv.aiTopic || null,
                lastMessageContent: lastMessage?.content?.substring(0, 80) || null,
                content: summaryContent,
                date: lastMessageDate,
                createdAt: conv.createdAt,
                totalMessages,
                recentMessages,
                conversationId: conv.id,
                caseId: conv.caseId || null,
                labelName: `${totalMessages} mesaj`,
                raw: { id: conv.id, channel: conv.channel }
            });
        });

        // Internal Notes
        internalNotes.forEach(note => {
            let labelName = note.user?.name || 'Sistem';
            if (note.user?.teamMemberships && note.user.teamMemberships.length > 0) {
                labelName += ` (${note.user.teamMemberships[0].team.name})`;
            }
            timeline.push({
                id: `inote_${note.id}`,
                sourceType: 'ACTIVITY',
                type: 'NOTE',
                title: 'Dahili Not',
                content: note.content,
                date: note.createdAt,
                labelName,
                caseId: note.conversation?.caseId || null,
                raw: note
            });
        });

        // Appointments
        appointments.forEach(apt => {
            // Dedup: Eğer activities içinde bu randevuyu temsil eden bir APPOINTMENT veya MEETING aktivitesi varsa timeline'a mükerrer kart ekleme
            const aptTime = apt.startTime ? new Date(apt.startTime).getTime() : 0;
            const isAlreadyRepresented = activities.some(act => {
                if (!['APPOINTMENT', 'MEETING'].includes(act.type)) return false;
                const actDueTime = act.dueDate ? new Date(act.dueDate).getTime() : 0;
                if (aptTime && actDueTime && Math.abs(aptTime - actDueTime) <= 5 * 60 * 1000) {
                    return true;
                }
                return false;
            });
            if (isAlreadyRepresented) {
                return;
            }

            let labelName = apt.assignedTo?.name || 'Sistem';
            if (apt.assignedTo?.teamMemberships && apt.assignedTo.teamMemberships.length > 0) {
                labelName += ` (${apt.assignedTo.teamMemberships[0].team.name})`;
            }
            timeline.push({
                id: `apt_${apt.id}`,
                sourceType: 'ACTIVITY',
                type: 'MEETING',
                title: apt.title || 'Planlanan',
                content: apt.description,
                date: apt.createdAt || apt.startTime,
                dueDate: apt.startTime,
                isCompleted: apt.status === 'COMPLETED',
                labelName,
                assignedToName: apt.assignedTo?.name,
                assignedToId: apt.assignedToId,
                raw: apt
            });
        });

        // Contact.notes JSON
        contactNotes.forEach((note, idx) => {
            if (!note?.content) return;
            let noteDate = new Date();
            try {
                if (note.timestamp) {
                    if (note.timestamp.includes('T')) {
                        noteDate = new Date(note.timestamp);
                    } else {
                        const parts = note.timestamp.match(/(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})/);
                        if (parts) {
                            noteDate = new Date(parseInt(parts[3]), parseInt(parts[2]) - 1, parseInt(parts[1]), parseInt(parts[4]), parseInt(parts[5]));
                        }
                    }
                }
            } catch {}
            timeline.push({
                id: `cnote_${contactId}_${idx}`,
                sourceType: 'ACTIVITY',
                type: 'NOTE',
                title: note.title || 'Not',
                content: note.content,
                date: noteDate,
                labelName: 'Kişi Notu',
                raw: note
            });
        });

        // 6. Conversation Events (Atama, Transfer, Aşama Değişikliği)
        let conversationEvents = [];
        try {
            const convIds = conversations.map(c => c.id);
            if (convIds.length > 0) {
                conversationEvents = await prisma.conversationEvent.findMany({
                    where: {
                        contactId,
                        eventType: { in: ['ASSIGNED', 'TRANSFERRED', 'FUNNEL_CHANGED', 'STAGE_CHANGED', 'CLAIMED'] }
                    },
                    orderBy: { createdAt: 'desc' }
                });
            }
        } catch (e) {
            // ConversationEvent tablosu henüz yoksa sessizce geç
            if (e.code !== 'P2021') {
                console.error('Timeline ConversationEvents Error:', e.message);
            }
        }

        // Conversation Events'leri timeline'a ekle
        conversationEvents.forEach(evt => {
            // HTML tag'lerini temizle (title <b>Dilan</b>'a atandı gibi gelebilir)
            const cleanTitle = (evt.title || '').replace(/<[^>]*>/g, '');
            let details = null;
            try { details = evt.details ? JSON.parse(evt.details) : null; } catch {}

            timeline.push({
                id: `evt_${evt.id}`,
                sourceType: 'EVENT',
                type: evt.eventType,
                title: cleanTitle,
                content: cleanTitle,
                date: evt.createdAt,
                status: 'COMPLETED',
                isCompleted: true,
                eventType: evt.eventType,
                actorType: evt.actorType,
                actorId: evt.actorId,
                details,
                labelName: evt.actorType === 'SYSTEM' ? 'Sistem' : evt.actorType === 'BOT' ? 'Bot' : evt.actorType === 'AUTOMATION' ? 'Otomasyon' : 'Agent',
                raw: evt
            });
        });

        const planned = [];
        const past = [];

        timeline.forEach(item => {
            const isStillPlanned = item.status === 'PLANNED' && !item.isCompleted && item.type !== 'NOTE' && item.sourceType === 'ACTIVITY';
            item.isPlanned = isStillPlanned;
            if (isStillPlanned) {
                planned.push(item);
            } else {
                past.push(item);
            }
        });

        planned.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
        past.sort((a, b) => new Date(b.date) - new Date(a.date));

        res.json({ planned, past });
    } catch (error) {
        console.error('Get Timeline Error:', error);
        res.status(500).json({ error: 'Aktivite geçmişi alınırken bir hata oluştu.' });
    }
};

// ────────────────────────────────────────────────────────────────────────────
// UPDATE ACTIVITY
// ────────────────────────────────────────────────────────────────────────────
export const updateActivity = async (req, res) => {
    try {
        const { activityId } = req.params;
        const { title, description, dueDate, assignedToId, teamId, topicCategoryId, caseId, aiAgentId } = req.body;

        const existing = await prisma.contactActivity.findUnique({
            where: { id: activityId },
            include: { contact: { select: { phone: true, name: true, fullName: true } } }
        });
        if (!existing) return res.status(404).json({ error: 'Aktivite bulunamadı.' });

        const updateData = {
            title: title !== undefined ? title : existing.title,
            description: description !== undefined ? description : existing.description,
            result: (existing.status === 'COMPLETED' && description !== undefined) ? description : existing.result,
            dueDate: dueDate !== undefined ? (dueDate ? new Date(dueDate) : null) : existing.dueDate,
            topicCategoryId: topicCategoryId !== undefined ? topicCategoryId : existing.topicCategoryId,
            caseId: caseId !== undefined ? caseId : existing.caseId,
            teamId: teamId !== undefined ? (teamId || null) : existing.teamId,
        };

        // assignedToId değiştiyse atama bilgisini güncelle
        // "bot:agent_xxx" formatıyla gelirse → bot ataması olarak işle
        if (assignedToId !== undefined) {
            if (assignedToId && assignedToId.startsWith('bot:')) {
                // Bot seçildi → aiAgentId set et, assignedToId temizle
                const botAgentId = assignedToId.replace('bot:', '');
                updateData.aiAgentId = botAgentId;
                updateData.assignedToId = null; // Bot user değil, atanan kişi yok
                updateData.assignedById = req.user?.id || null;
                updateData.assignedByType = 'USER';
                updateData.assignedAt = new Date();
                console.log(`🤖 [Activity] Bot atandı: ${botAgentId} (activity: ${activityId})`);
            } else {
                // Normal insan ataması
                updateData.assignedToId = assignedToId || null;
                if (assignedToId !== existing.assignedToId) {
                    // İnsan atandığında bot atamasını temizle
                    if (existing.aiAgentId) {
                        updateData.aiAgentId = null;
                        updateData.aiFallbackTriggered = false;
                    }
                    updateData.assignedById = req.user?.id || null;
                    updateData.assignedByType = req.user?.id ? 'USER' : 'SYSTEM';
                    updateData.assignedAt = new Date();
                }
            }
        }

        // Doğrudan aiAgentId gönderildiyse (eski API uyumluluğu)
        if (aiAgentId !== undefined && !assignedToId?.startsWith('bot:')) {
            updateData.aiAgentId = aiAgentId || null;
        }

        const updated = await prisma.contactActivity.update({
            where: { id: activityId },
            data: updateData,
            include: {
                creator: { select: { name: true, role: true } },
                assignee: { select: { name: true } }
            }
        });

        // ─── BOT'A ATANDI → HEMEN ARA ───────────────────────────────────────
        // aiAgentId yeni set edildiyse ve görev CALL tipinde PLANNED ise → direkt ScheduledCall oluştur
        const botJustAssigned = aiAgentId && aiAgentId !== existing.aiAgentId;
        const isCallableActivity = existing.type === 'CALL' && existing.status === 'PLANNED' && !existing.aiFallbackTriggered;
        const contactPhone = existing.contact?.phone?.trim();

        if (botJustAssigned && isCallableActivity && contactPhone) {
            try {
                // Daha önce bu activity için ScheduledCall var mı?
                const existingSC = await prisma.scheduledCall.findFirst({
                    where: { createdById: `activity_${activityId}`, status: { in: ['PENDING', 'IN_PROGRESS'] } }
                });

                if (!existingSC) {
                    const workspace = await prisma.workspace.findUnique({
                        where: { id: existing.workspaceId },
                        select: { retellAutoCallTriggers: true }
                    });
                    const agentCfgs = workspace?.retellAutoCallTriggers?.agentConfigs || {};
                    const agentCfg = agentCfgs[aiAgentId];
                    const retrySteps = agentCfg?.retrySteps || [{ delay: 60 }, { delay: 240 }, { delay: 1440 }];

                    await prisma.scheduledCall.create({
                        data: {
                            workspaceId: existing.workspaceId,
                            contactId: existing.contactId,
                            contactName: existing.contact?.name || existing.contact?.fullName || 'Müşteri',
                            toNumber: contactPhone,
                            agentId: aiAgentId,
                            scheduledAt: (() => {
                                const trNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
                                const h = trNow.getHours();
                                if (h >= 10 && h < 21) return new Date();
                                const next = new Date();
                                if (h >= 21) next.setDate(next.getDate() + 1);
                                next.setUTCHours(7, 15, 0, 0); // 10:15 TR
                                console.log(`⏸️ [Activity] Bot atandı ama mesai dışı → ${next.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}'e ertelendi`);
                                return next;
                            })(),
                            status: 'PENDING',
                            createdById: `activity_${activityId}`,
                            maxAttempts: retrySteps.length + 1,
                            retryDelayMin: retrySteps[0]?.delay || 60,
                            attemptNumber: 1
                        }
                    });

                    // Activity'yi triggered olarak işaretle
                    await prisma.contactActivity.update({
                        where: { id: activityId },
                        data: { aiFallbackTriggered: true }
                    });

                    console.log(`🚀 [Activity] Bot atandı → hemen arama planlandı: ${contactPhone} (agent: ${aiAgentId})`);
                }
            } catch (botCallErr) {
                console.error('⚠️ [Activity] Bot atama auto-call error:', botCallErr.message);
            }
        }

        res.json(updated);
    } catch (error) {
        console.error('Update Activity Error:', error);
        res.status(500).json({ error: 'Aktivite güncellenirken bir hata oluştu.' });
    }
};

// ────────────────────────────────────────────────────────────────────────────
// DELETE ACTIVITY
// ────────────────────────────────────────────────────────────────────────────
export const deleteActivity = async (req, res) => {
    try {
        const { activityId } = req.params;

        const existing = await prisma.contactActivity.findUnique({ where: { id: activityId } });
        if (!existing) return res.status(404).json({ error: 'Aktivite bulunamadı.' });

        await prisma.contactActivity.delete({ where: { id: activityId } });

        res.json({ success: true });
    } catch (error) {
        console.error('Delete Activity Error:', error);
        res.status(500).json({ error: 'Aktivite silinirken bir hata oluştu.' });
    }
};

// ────────────────────────────────────────────────────────────────────────────
// COMPLETE ACTIVITY — Tamamla + sonuç notu gir
// ────────────────────────────────────────────────────────────────────────────
export const completeActivity = async (req, res) => {
    try {
        const { activityId } = req.params;
        const { result, callSuccessful, callSentiment } = req.body;
        const userId = req.user?.id || null;

        const existing = await prisma.contactActivity.findUnique({ where: { id: activityId } });
        if (!existing) return res.status(404).json({ error: 'Aktivite bulunamadı.' });

        const updateData = {
            status: 'COMPLETED',
            isCompleted: true,
            completedAt: new Date(),
            result: result || null
        };

        // Arama sonuç bilgileri (insan aramaları için)
        if (callSuccessful !== undefined) updateData.callSuccessful = callSuccessful;
        if (callSentiment) updateData.callSentiment = callSentiment;

        // Eğer henüz kimseye atanmamışsa → tamamlayan kişi = atanan kişi
        if (!existing.assignedToId && userId) {
            updateData.assignedToId = userId;
        }

        const updated = await prisma.contactActivity.update({
            where: { id: activityId },
            data: updateData,
            include: {
                creator: { select: { name: true, role: true } },
                assignee: { select: { name: true } },
                team: { select: { name: true } }
            }
        });

        try {
            const io = req.app.get('io');
            if (io) {
                io.to(`workspace_${existing.workspaceId}`).emit('activity_completed', {
                    activityId: existing.id,
                    type: existing.type,
                    completedByName: req.user?.name || 'Sistem'
                });
            }
        } catch (err) {
            console.error('Activity completion socket error:', err);
        }

        res.json(updated);

        // Entry Rules: Aktivite tamamlandı → aşama kurallarını değerlendir
        if (existing.contactId && existing.workspaceId) {
            evaluateAndApplyRules(existing.contactId, existing.workspaceId).catch(err =>
                console.error('⚠️ [CompleteActivity] Entry rules hatası:', err.message)
            );
        }

        // 🔔 CALL AUTOMATION: Arama tamamlandıysa başarılı/başarısız otomasyonunu tetikle
        // Hem AI hem insan aramaları için çalışır
        if (existing.type === 'CALL' && existing.contactId) {
            try {
                const { executeRetellAutomation } = await import('./automation.controller.js');
                const callRecord = {
                    callId: `activity_${activityId}`,
                    contactId: existing.contactId,
                    callSuccessful: callSuccessful === true || callSuccessful === 'true',
                    workspaceId: existing.workspaceId
                };
                await executeRetellAutomation(existing.workspaceId, callRecord);
                console.log(`🔔 [CompleteActivity] Call automation triggered (${callSuccessful ? 'SUCCESS' : 'FAIL'}) for activity ${activityId}`);
            } catch (autoErr) {
                console.error('⚠️ [CompleteActivity] Call automation error:', autoErr.message);
            }
        }

        // Lead skorunu güncelle (aktivite tamamlandı → başarılı arama, ziyaret vb. puan etkiler)
        if (existing.contactId) {
            import('../services/leadScoring.service.js').then(({ updateLeadScore }) => {
                updateLeadScore(existing.contactId).catch(err =>
                    console.error('⚠️ [CompleteActivity] Score update hatası:', err.message)
                );
            });
        }
    } catch (error) {
        console.error('Complete Activity Error:', error);
        res.status(500).json({ error: 'Aktivite tamamlanırken bir hata oluştu.' });
    }
};

// ────────────────────────────────────────────────────────────────────────────
// CLAIM ACTIVITY — Havuzdan üstlen (POOL kuralı)
// ────────────────────────────────────────────────────────────────────────────
export const claimActivity = async (req, res) => {
    try {
        const { activityId } = req.params;
        const userId = req.user.id;

        const existing = await prisma.contactActivity.findUnique({ where: { id: activityId } });
        if (!existing) return res.status(404).json({ error: 'Aktivite bulunamadı.' });

        if (existing.status === 'COMPLETED' || existing.status === 'CANCELLED') {
            return res.status(400).json({ error: 'Tamamlanmış veya iptal edilmiş bir aktivite üstlenilemez.' });
        }

        const updated = await prisma.contactActivity.update({
            where: { id: activityId },
            data: {
                assignedToId: userId
            },
            include: {
                creator: { select: { name: true, role: true } },
                assignee: { select: { name: true } },
                team: { select: { name: true } }
            }
        });

        res.json(updated);
    } catch (error) {
        console.error('Claim Activity Error:', error);
        res.status(500).json({ error: 'Aktivite üstlenilirken bir hata oluştu.' });
    }
};

// ────────────────────────────────────────────────────────────────────────────
// WORKSPACE ACTIVITIES — Workspace genelinde aktivite listesi (filtrelenebilir)
// ────────────────────────────────────────────────────────────────────────────
// Workspace genelinde aktivite listesi (filtrelenebilir)
export const getWorkspaceActivities = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { type, status, assignedToId, teamId, dateFrom, dateTo, view, source, limit = 100 } = req.query;

        const where = { workspaceId };

        // Type filter
        if (type && type !== 'ALL') {
            where.type = type;
        }

        // Status filter (supports comma-separated: 'PLANNED,IN_PROGRESS')
        if (status && status !== 'ALL') {
            if (status.includes(',')) {
                where.status = { in: status.split(',').map(s => s.trim()) };
            } else {
                where.status = status;
            }
        }

        // View filter: mine = assigned to me, team = my team, all = everyone
        if (view === 'mine' && req.user?.id) {
            where.assignedToId = req.user.id;
        } else if (assignedToId) {
            // Support comma-separated agent IDs (for multi-agent calendar filter)
            if (assignedToId.includes(',')) {
                where.assignedToId = { in: assignedToId.split(',').map(id => id.trim()) };
            } else {
                where.assignedToId = assignedToId;
            }
        }

        // Source filter: AI_CALL, MANUAL, AUTO, AGENT (= NOT AI_CALL)
        if (source === 'AI_CALL') {
            where.source = 'AI_CALL';
        } else if (source === 'AGENT') {
            where.source = { not: 'AI_CALL' };
        } else if (source) {
            where.source = source;
        }

        if (teamId) {
            where.teamId = teamId;
        }

        // Date range filter — also include items where dueDate is null (use createdAt as fallback)
        if (dateFrom || dateTo) {
            const field = req.query.dateField || 'dueDate';
            const dateRange = {};
            if (dateFrom) dateRange.gte = parseDateStartTR(dateFrom);
            if (dateTo) dateRange.lte = parseDateEndTR(dateTo);

            if (field === 'dueDate') {
                // OR: dueDate in range OR (dueDate is null AND createdAt in range)
                where.OR = [
                    { dueDate: dateRange },
                    { dueDate: null, createdAt: dateRange }
                ];
            } else {
                where[field] = dateRange;
            }
        }

        // AGENT RBAC: Sadece kendi + takım havuzu
        if (isAgentRole(req)) {
            const myTeamIds = await getAgentTeamIds(req.user.id);
            const agentFilter = buildAgentActivityFilter(req.user.id, myTeamIds);
            // Merge with existing where using AND
            Object.assign(where, { AND: [agentFilter] });
        }

        const activities = await prisma.contactActivity.findMany({
            where,
            include: {
                contact: {
                    select: { id: true, name: true, phone: true, email: true, company: true }
                },
                assignee: {
                    select: { id: true, name: true, avatar: true }
                },
                creator: {
                    select: { id: true, name: true }
                },
                team: {
                    select: { id: true, name: true }
                }
            },
            orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
            take: parseInt(limit)
        });

        // Count by status for summary — status filtresini kaldırarak tüm durumları say
        const summaryWhere = { ...where };
        delete summaryWhere.status;
        const counts = await prisma.contactActivity.groupBy({
            by: ['status'],
            where: summaryWhere,
            _count: true
        });

        const summary = {
            planned: counts.find(c => c.status === 'PLANNED')?._count || 0,
            inProgress: counts.find(c => c.status === 'IN_PROGRESS')?._count || 0,
            completed: counts.find(c => c.status === 'COMPLETED')?._count || 0,
            cancelled: counts.find(c => c.status === 'CANCELLED')?._count || 0
        };

        res.json({ activities, summary });
    } catch (error) {
        console.error('Get workspace activities error:', error);
        res.status(500).json({ error: 'Aktiviteler yüklenirken hata oluştu' });
    }
};

// ────────────────────────────────────────────────────────────────────────────
// WORKSPACE CALL QUEUE — CALL + MEETING activities (planned & recent completed)
// ────────────────────────────────────────────────────────────────────────────
export const getWorkspaceCallQueue = async (req, res) => {
    try {
        const { workspaceId } = req.params;

        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const where = {
            workspaceId,
            type: { in: ['CALL', 'MEETING', 'VISIT', 'TASK', 'REMINDER', 'APPOINTMENT'] },
            OR: [
                { status: 'PLANNED' },
                { status: 'COMPLETED', updatedAt: { gte: twentyFourHoursAgo } }
            ]
        };

        // AGENT RBAC: Sadece kendi + takım aktiviteleri
        if (isAgentRole(req)) {
            const myTeamIds = await getAgentTeamIds(req.user.id);
            const agentFilter = buildAgentActivityFilter(req.user.id, myTeamIds);
            where.AND = [agentFilter];
        }

        const activities = await prisma.contactActivity.findMany({
            where,
            include: {
                contact: {
                    select: {
                        id: true,
                        name: true,
                        phone: true,
                        conversations: {
                            select: { id: true },
                            take: 1,
                            orderBy: { updatedAt: 'desc' }
                        }
                    }
                },
                assignee: { select: { name: true } },
                creator: { select: { name: true } },
            },
            orderBy: [
                { status: 'asc' }, // PLANNED comes before COMPLETED
                { dueDate: 'asc' },
                { createdAt: 'desc' }
            ],
            take: 1500,
        });

        res.json(activities);
    } catch (error) {
        console.error('Call Queue Error:', error);
        res.status(500).json({ error: 'Arama kuyruğu alınırken hata oluştu.' });
    }
};

// ────────────────────────────────────────────────────────────────────────────
// GET ACTIVITY BY ID — Tekil aktivite detayı
// ────────────────────────────────────────────────────────────────────────────
export const getActivityById = async (req, res) => {
    try {
        const { activityId } = req.params;
        const activity = await prisma.contactActivity.findUnique({
            where: { id: activityId },
            include: {
                contact: { select: { id: true, name: true, phone: true, email: true, company: true } },
                assignee: { select: { id: true, name: true, avatar: true } },
                creator: { select: { id: true, name: true } },
                team: { select: { id: true, name: true } }
            }
        });
        if (!activity) return res.status(404).json({ error: 'Aktivite bulunamadı' });
        res.json(activity);
    } catch (error) {
        console.error('Get activity by id error:', error);
        res.status(500).json({ error: 'Aktivite yüklenirken hata oluştu' });
    }
};

// ────────────────────────────────────────────────────────────────────────────
// GET CONTACT RETELL CALL — En son AI arama kaydını getir
// ────────────────────────────────────────────────────────────────────────────
export const getContactRetellCall = async (req, res) => {
    try {
        const { contactId } = req.params;
        const { activityCreatedAt } = req.query;

        // Find the retell call closest to the activity creation time
        const where = { contactId };
        if (activityCreatedAt) {
            const actDate = new Date(activityCreatedAt);
            const before = new Date(actDate.getTime() - 5 * 60 * 1000); // 5 min before
            const after = new Date(actDate.getTime() + 5 * 60 * 1000); // 5 min after
            where.createdAt = { gte: before, lte: after };
        }

        const call = await prisma.retellCall.findFirst({
            where,
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                callId: true,
                recordingUrl: true,
                transcript: true,
                summary: true,
                duration: true,
                status: true,
                startedAt: true,
                createdAt: true
            }
        });

        if (!call) {
            // Fallback: get the most recent call for this contact
            const latestCall = await prisma.retellCall.findFirst({
                where: { contactId },
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    callId: true,
                    recordingUrl: true,
                    transcript: true,
                    summary: true,
                    duration: true,
                    status: true,
                    startedAt: true,
                    createdAt: true
                }
            });
            return res.json(latestCall || null);
        }

        res.json(call);
    } catch (error) {
        console.error('Get contact retell call error:', error);
        res.status(500).json({ error: 'Arama kaydı yüklenirken hata oluştu' });
    }
};

// ────────────────────────────────────────────────────────────────────────────
// TRANSLATE TEXT — Metni Türkçeye çevir (Gemini ile)
// ────────────────────────────────────────────────────────────────────────────
export const translateText = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { text } = req.body;

        if (!text) return res.status(400).json({ error: 'Çevrilecek metin gerekli' });

        // Get AI API key
        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { aiApiKey: true }
        });
        let apiKey = workspace?.aiApiKey;
        if (!apiKey) {
            const global = await prisma.globalSettings.findUnique({ where: { id: 'singleton' } });
            apiKey = global?.globalAiApiKey;
        }
        if (!apiKey) return res.status(400).json({ error: 'AI API Key yapılandırılmamış' });

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });

        const prompt = `Aşağıdaki metni Türkçeye çevir. Sadece çeviriyi yaz, başka hiçbir açıklama ekleme.

Metin:
${text}

Türkçe Çeviri:`;

        const result = await model.generateContent(prompt);
        const translation = result.response.text().trim();

        res.json({ translation });
    } catch (error) {
        console.error('Translate error:', error);
        res.status(500).json({ error: 'Çeviri yapılırken hata oluştu' });
    }
};
