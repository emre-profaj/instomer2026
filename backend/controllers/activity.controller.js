import prisma from '../lib/prisma.js';
import { parseCommentIntent, parseStageIntent } from '../utils/commentIntentParser.js';

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

        // Yetki Kontrolü
        const contact = await prisma.contact.findFirst({
            where: { id: contactId, workspaceId }
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

        const newActivity = await prisma.contactActivity.create({
            data: {
                contactId,
                workspaceId,
                type,
                title,
                description,
                dueDate: dueDate ? new Date(dueDate) : null,
                assignedToId: assignedToId ? assignedToId : null,
                teamId: teamId ? teamId : null,
                createdBy: userId,
                status: resolvedStatus,
                completedAt: resolvedCompletedAt,
                source: req.body.source || 'MANUAL',
                priority: req.body.priority || 'NORMAL',
                isCompleted: resolvedIsCompleted
            },
            include: {
                creator: { select: { name: true, role: true } },
                assignee: { select: { name: true } },
                team: { select: { name: true } }
            }
        });

        // ── Akıllı intent algılama: zamanlama anahtar kelimesi varsa otomatik planlama ──
        // NOT: Tamamlanmış arama notları (call notes) için intent parser ÇALIŞTIRILMAZ
        // çünkü bunlar geçmişe dönük kayıtlardır, gelecek planları değil.
        let autoActivity = null;
        if (newActivity.description && resolvedStatus !== 'COMPLETED') {
            try {
                const intent = parseCommentIntent(newActivity.description);
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
                            source: 'AUTO'
                        }
                    });

                    autoActivity = { id: planned.id, type: intent.action, dueDate: intent.dueDate, summary: intent.summary };
                    console.log(`🤖 [AutoIntent/Activity] ${intent.summary}`);
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
                include: {
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
                    user: { select: { name: true, role: true, teamMemberships: { include: { team: true } } } }
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
                content: summaryContent,
                date: lastMessageDate,
                totalMessages,
                recentMessages,
                conversationId: conv.id,
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
                title: 'Not',
                content: note.content,
                date: note.createdAt,
                labelName,
                raw: note
            });
        });

        // Appointments
        appointments.forEach(apt => {
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
                    const parts = note.timestamp.match(/(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})/);
                    if (parts) {
                        noteDate = new Date(parseInt(parts[3]), parseInt(parts[2]) - 1, parseInt(parts[1]), parseInt(parts[4]), parseInt(parts[5]));
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
        const { title, description, dueDate } = req.body;

        const existing = await prisma.contactActivity.findUnique({ where: { id: activityId } });
        if (!existing) return res.status(404).json({ error: 'Aktivite bulunamadı.' });

        const updated = await prisma.contactActivity.update({
            where: { id: activityId },
            data: {
                title: title !== undefined ? title : existing.title,
                description: description !== undefined ? description : existing.description,
                result: (existing.status === 'COMPLETED' && description !== undefined) ? description : existing.result,
                dueDate: dueDate !== undefined ? (dueDate ? new Date(dueDate) : null) : existing.dueDate,
            },
            include: {
                creator: { select: { name: true, role: true } },
                assignee: { select: { name: true } }
            }
        });

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
        const { result } = req.body;

        const existing = await prisma.contactActivity.findUnique({ where: { id: activityId } });
        if (!existing) return res.status(404).json({ error: 'Aktivite bulunamadı.' });

        const updated = await prisma.contactActivity.update({
            where: { id: activityId },
            data: {
                status: 'COMPLETED',
                isCompleted: true,
                completedAt: new Date(),
                result: result || null
            },
            include: {
                creator: { select: { name: true, role: true } },
                assignee: { select: { name: true } },
                team: { select: { name: true } }
            }
        });

        res.json(updated);
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
        const { type, status, assignedToId, teamId, dateFrom, dateTo, view, limit = 100 } = req.query;

        const where = { workspaceId };

        // Type filter
        if (type && type !== 'ALL') {
            where.type = type;
        }

        // Status filter
        if (status && status !== 'ALL') {
            where.status = status;
        }

        // View filter: mine = assigned to me, team = my team, all = everyone
        if (view === 'mine' && req.user?.id) {
            where.assignedToId = req.user.id;
        } else if (assignedToId) {
            where.assignedToId = assignedToId;
        }

        if (teamId) {
            where.teamId = teamId;
        }

        // Date range filter
        if (dateFrom || dateTo) {
            where.dueDate = {};
            if (dateFrom) where.dueDate.gte = new Date(dateFrom);
            if (dateTo) {
                const end = new Date(dateTo);
                end.setHours(23, 59, 59, 999);
                where.dueDate.lte = end;
            }
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

        // Count by status for summary
        const counts = await prisma.contactActivity.groupBy({
            by: ['status'],
            where: { ...where, status: undefined },
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

        const activities = await prisma.contactActivity.findMany({
            where: {
                workspaceId,
                type: { in: ['CALL', 'MEETING', 'VISIT', 'TASK', 'REMINDER'] },
                status: 'PLANNED',
            },
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
            },
            orderBy: [
                { dueDate: 'asc' },
                { createdAt: 'desc' }
            ],
            take: 500,
        });

        res.json(activities);
    } catch (error) {
        console.error('Call Queue Error:', error);
        res.status(500).json({ error: 'Arama kuyruğu alınırken hata oluştu.' });
    }
};
