import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// ─── Case Number Generator ───────────────────────────────────────────────
const generateCaseNumber = async (workspaceId) => {
    const year = new Date().getFullYear();
    const prefix = 'CSE';

    const lastCase = await prisma.case.findFirst({
        where: {
            workspaceId,
            caseNumber: { startsWith: `${prefix}-${year}` }
        },
        orderBy: { createdAt: 'desc' }
    });

    let nextNum = 1;
    if (lastCase?.caseNumber) {
        const parts = lastCase.caseNumber.split('-');
        if (parts[2]) {
            nextNum = parseInt(parts[2], 10) + 1;
        }
    }

    return `${prefix}-${year}-${String(nextNum).padStart(4, '0')}`;
};

// ─── Merkezi Auto-Case Helper ────────────────────────────────────────────
// Herhangi bir conversation için case yoksa otomatik oluşturur.
// Tüm webhook controller'lardan fire-and-forget çağrılabilir.
// Örnek: ensureCaseForConversation(workspaceId, conversationId).catch(console.error)
export const ensureCaseForConversation = async (workspaceId, conversationId) => {
    try {
        if (!workspaceId || !conversationId) return null;

        const conv = await prisma.conversation.findUnique({
            where: { id: conversationId },
            select: {
                caseId: true,
                contactId: true,
                channel: true,
                aiTopic: true,
                assignedToId: true,
                assignedTeamId: true,
                funnelType: true,
                funnelStageId: true
            }
        });

        // Zaten case'e bağlıysa veya contact yoksa atla
        if (!conv || conv.caseId || !conv.contactId) return null;

        // Bu kişinin zaten aktif case'i varsa, conversation'ı ona bağla
        const existingCase = await prisma.case.findFirst({
            where: {
                contactId: conv.contactId,
                workspaceId,
                status: { in: ['ACTIVE', 'PENDING', 'IN_PROGRESS'] }
            },
            orderBy: { updatedAt: 'desc' }
        });

        if (existingCase) {
            await prisma.conversation.update({
                where: { id: conversationId },
                data: { caseId: existingCase.id }
            });
            console.log(`📦 [AutoCase] Linked conv ${conversationId} to existing case ${existingCase.caseNumber}`);
            return existingCase;
        }

        // Aktif case yoksa yeni oluştur
        const caseNumber = await generateCaseNumber(workspaceId);
        const channelLabels = {
            WHATSAPP: '💬 WhatsApp',
            FACEBOOK: '💬 Facebook',
            INSTAGRAM: '💬 Instagram',
            EMAIL: '📧 E-posta',
            PHONE: '📞 Telefon',
            WIDGET: '🌐 Web Widget',
            FORM: '📝 Form',
            WEB_WIDGET: '🌐 Web Widget'
        };
        const channelLabel = channelLabels[conv.channel] || conv.channel || 'Yeni İletişim';
        const title = conv.aiTopic || channelLabel;

        const newCase = await prisma.case.create({
            data: {
                workspaceId,
                contactId: conv.contactId,
                caseNumber,
                title,
                assignedToId: conv.assignedToId || null,
                assignedTeamId: conv.assignedTeamId || null,
                funnelType: conv.funnelType || null,
                funnelStageId: conv.funnelStageId || null,
                priority: 'NORMAL'
            }
        });

        await prisma.conversation.update({
            where: { id: conversationId },
            data: { caseId: newCase.id }
        });

        console.log(`📦 [AutoCase] Auto-created case "${caseNumber}" (${title}) for conv ${conversationId}`);
        return newCase;
    } catch (err) {
        console.error(`⚠️ [AutoCase] ensureCaseForConversation error:`, err.message);
        return null;
    }
};

// ─── GET /contact-cases/:workspaceId/contact/:contactId ──────────────────
// Kişinin tüm case'lerini getir (conversations dahil)
export const getContactCases = async (req, res) => {
    try {
        const { workspaceId, contactId } = req.params;
        const { status } = req.query;

        // ── AUTO-CASE: topic'li ama case'siz conversation'lar için otomatik case oluştur ──
        const orphanConversations = await prisma.conversation.findMany({
            where: {
                workspaceId,
                contactId,
                caseId: null,
                aiTopic: { not: null }
            },
            select: {
                id: true,
                aiTopic: true,
                assignedToId: true,
                assignedTeamId: true,
                funnelType: true,
                funnelStageId: true,
                channel: true,
                createdAt: true
            }
        });

        if (orphanConversations.length > 0) {
            console.log(`🔄 [AutoCase] Creating ${orphanConversations.length} cases for orphan conversations of contact ${contactId}`);
            for (const conv of orphanConversations) {
                try {
                    const caseNumber = await generateCaseNumber(workspaceId);
                    const newCase = await prisma.case.create({
                        data: {
                            workspaceId,
                            contactId,
                            caseNumber,
                            title: conv.aiTopic.trim().substring(0, 200),
                            assignedToId: conv.assignedToId || null,
                            assignedTeamId: conv.assignedTeamId || null,
                            funnelType: conv.funnelType || null,
                            funnelStageId: conv.funnelStageId || null,
                            priority: 'NORMAL'
                        }
                    });
                    await prisma.conversation.update({
                        where: { id: conv.id },
                        data: { caseId: newCase.id }
                    });
                    console.log(`✅ [AutoCase] Created case "${newCase.caseNumber}" (${conv.aiTopic}) for conversation ${conv.id}`);
                } catch (autoErr) {
                    console.error(`⚠️ [AutoCase] Failed for conv ${conv.id}:`, autoErr.message);
                }
            }
        }
        // ── AUTO-CASE END ──

        const where = { workspaceId, contactId };
        if (status) where.status = status;

        const cases = await prisma.case.findMany({
            where,
            include: {
                conversations: {
                    select: {
                        id: true,
                        channel: true,
                        aiTopic: true,
                        status: true,
                        lastMessageAt: true,
                        funnelType: true,
                        funnelStageId: true,
                        assignedToId: true,
                        assignedTeamId: true
                    }
                },
                activities: {
                    where: { status: { in: ['PLANNED', 'IN_PROGRESS'] } },
                    select: { id: true, type: true, title: true, status: true, dueDate: true }
                },
                assignedTo: {
                    select: { id: true, name: true, avatar: true }
                },
                team: {
                    select: { id: true, name: true, color: true }
                }
            },
            orderBy: { updatedAt: 'desc' }
        });

        // ── AUTO-SYNC: Case funnelStageId boşsa ama bağlı conversation'da doluysa, case'i güncelle ──
        for (const c of cases) {
            if (!c.funnelStageId && c.conversations?.length > 0) {
                const convWithStage = c.conversations.find(cv => cv.funnelStageId);
                if (convWithStage) {
                    try {
                        await prisma.case.update({
                            where: { id: c.id },
                            data: {
                                funnelStageId: convWithStage.funnelStageId,
                                funnelType: convWithStage.funnelType || null
                            }
                        });
                        // Reflect in local object for response
                        c.funnelStageId = convWithStage.funnelStageId;
                        c.funnelType = convWithStage.funnelType || null;
                        console.log(`🔄 [AutoSync] Backfilled case ${c.caseNumber} funnelStageId from conversation ${convWithStage.id}`);
                    } catch (syncErr) {
                        console.warn(`⚠️ [AutoSync] Failed for case ${c.id}:`, syncErr.message);
                    }
                }
            }
        }
        // ── AUTO-SYNC END ──

        // Her case için retell call sayısını da ekle
        const casesWithCounts = await Promise.all(cases.map(async (c) => {
            const retellCallCount = await prisma.retellCall.count({
                where: { caseId: c.id }
            });
            const totalActivityCount = await prisma.contactActivity.count({
                where: { caseId: c.id }
            });
            return {
                ...c,
                _retellCallCount: retellCallCount,
                _totalActivityCount: totalActivityCount,
                _conversationCount: c.conversations.length,
                _pendingActivityCount: c.activities.length
            };
        }));

        res.json(casesWithCounts);
    } catch (err) {
        console.error('getContactCases error:', err);
        res.status(500).json({ error: 'Case listesi alınamadı' });
    }
};

// ─── GET /contact-cases/:workspaceId/:caseId ─────────────────────────────
// Tek case detayı
export const getCase = async (req, res) => {
    try {
        const { workspaceId, caseId } = req.params;

        const caseData = await prisma.case.findFirst({
            where: { id: caseId, workspaceId },
            include: {
                conversations: {
                    select: {
                        id: true,
                        channel: true,
                        aiTopic: true,
                        status: true,
                        lastMessageAt: true,
                        funnelStageId: true,
                        funnelType: true,
                        assignedToId: true,
                        assignedTeamId: true
                    }
                },
                activities: {
                    orderBy: { createdAt: 'desc' },
                    include: {
                        assignee: { select: { id: true, name: true, avatar: true } },
                        team: { select: { id: true, name: true } }
                    }
                },
                assignedTo: { select: { id: true, name: true, avatar: true } },
                team: { select: { id: true, name: true, color: true } },
                contact: { select: { id: true, name: true, fullName: true, phone: true } }
            }
        });

        if (!caseData) return res.status(404).json({ error: 'Case bulunamadı' });

        res.json(caseData);
    } catch (err) {
        console.error('getCase error:', err);
        res.status(500).json({ error: 'Case detayı alınamadı' });
    }
};

// ─── POST /contact-cases/:workspaceId/contact/:contactId ─────────────────
// Yeni case oluştur
export const createCase = async (req, res) => {
    try {
        const { workspaceId, contactId } = req.params;
        const { title, description, funnelType, funnelStageId, assignedToId, assignedTeamId, conversationId, priority } = req.body;

        if (!title?.trim()) {
            return res.status(400).json({ error: 'Case başlığı gerekli' });
        }

        const caseNumber = await generateCaseNumber(workspaceId);

        const newCase = await prisma.case.create({
            data: {
                workspaceId,
                contactId,
                caseNumber,
                title: title.trim(),
                description: description || null,
                funnelType: funnelType || null,
                funnelStageId: funnelStageId || null,
                assignedToId: assignedToId || null,
                assignedTeamId: assignedTeamId || null,
                priority: priority || 'NORMAL'
            }
        });

        // Eğer conversationId verilmişse, conversation'ı case'e bağla
        if (conversationId) {
            await prisma.conversation.update({
                where: { id: conversationId },
                data: { caseId: newCase.id }
            });
        }

        // Socket event
        const io = req.app.get('io');
        if (io) {
            io.to(`workspace:${workspaceId}`).emit('case_created', {
                caseId: newCase.id,
                contactId,
                caseNumber: newCase.caseNumber,
                title: newCase.title
            });
        }

        res.status(201).json(newCase);
    } catch (err) {
        console.error('createCase error:', err);
        res.status(500).json({ error: 'Case oluşturulamadı' });
    }
};

// ─── PATCH /contact-cases/:workspaceId/:caseId ───────────────────────────
// Case güncelle (title, stage, status, priority)
export const updateCase = async (req, res) => {
    try {
        const { workspaceId, caseId } = req.params;
        const { title, description, status, priority, funnelType, funnelStageId, lostReason } = req.body;

        const updateData = {};
        if (title !== undefined) updateData.title = title.trim();
        if (description !== undefined) updateData.description = description;
        if (priority !== undefined) updateData.priority = priority;
        if (funnelType !== undefined) updateData.funnelType = funnelType;
        if (funnelStageId !== undefined) updateData.funnelStageId = funnelStageId;

        // Status değişiklikleri
        if (status !== undefined) {
            updateData.status = status;
            if (status === 'WON') updateData.wonAt = new Date();
            if (status === 'LOST') {
                updateData.lostAt = new Date();
                if (lostReason) updateData.lostReason = lostReason;
            }
            if (status === 'CLOSED') updateData.closedAt = new Date();
        }

        const updated = await prisma.case.update({
            where: { id: caseId },
            data: updateData
        });

        // CASCADE: title değiştiyse bağlı conversation'ların aiTopic'ini de güncelle
        if (title !== undefined) {
            await prisma.conversation.updateMany({
                where: { caseId },
                data: { aiTopic: title.trim() || null }
            });
            console.log(`🔄 [CaseUpdate] Cascaded title → aiTopic for conversations of case ${caseId}`);
        }

        // CASCADE: funnelStageId veya funnelType değiştiyse bağlı conversation'ları da güncelle
        if (funnelType !== undefined || funnelStageId !== undefined) {
            const convUpdatePayload = {};
            if (funnelType !== undefined) convUpdatePayload.funnelType = funnelType;
            if (funnelStageId !== undefined) convUpdatePayload.funnelStageId = funnelStageId;

            await prisma.conversation.updateMany({
                where: { caseId },
                data: convUpdatePayload
            });
            console.log(`🔄 [CaseUpdate] Cascaded funnel stage to conversations of case ${caseId}`);

            // CASCADE: Contact'ın funnelStageId/funnelType'ını da güncelle
            // Kişiler tablosundaki DURUM sütunu contact.funnelStageId'den okur
            if (updated.contactId) {
                const contactUpdatePayload = {};
                if (funnelType !== undefined) contactUpdatePayload.funnelType = funnelType;
                if (funnelStageId !== undefined) contactUpdatePayload.funnelStageId = funnelStageId;

                await prisma.contact.update({
                    where: { id: updated.contactId },
                    data: contactUpdatePayload
                });
                console.log(`🔄 [CaseUpdate] Cascaded funnel stage to contact ${updated.contactId}`);
            }
        }

        // Socket event
        const io = req.app.get('io');
        if (io) {
            io.to(`workspace:${workspaceId}`).emit('case_updated', {
                caseId,
                contactId: updated.contactId,
                changes: updateData
            });

            // funnelStageId değişikliğini Inbox'a da bildir: bağlı conversation'lar için emit et
            if (funnelType !== undefined || funnelStageId !== undefined) {
                const linkedConvs = await prisma.conversation.findMany({
                    where: { caseId },
                    select: { id: true, assignedToId: true, assignedTeamId: true, teamIds: true, botEnabled: true }
                });
                for (const conv of linkedConvs) {
                    io.to(`workspace:${workspaceId}`).emit('conversation_assigned', {
                        conversationId: conv.id,
                        assignedToId: conv.assignedToId,
                        assignedToName: null,
                        botEnabled: conv.botEnabled,
                        teamIds: conv.teamIds,
                        funnelType: funnelType ?? updated.funnelType,
                        funnelStageId: funnelStageId ?? updated.funnelStageId
                    });
                }

                // Contact güncellemesini de bildir — Kişiler tablosu gerçek zamanlı güncellensin
                if (updated.contactId) {
                    io.to(`workspace:${workspaceId}`).emit('contact_updated', {
                        contactId: updated.contactId,
                        workspaceId,
                        updatedFields: {
                            funnelStageId: funnelStageId ?? updated.funnelStageId,
                            funnelType: funnelType ?? updated.funnelType
                        }
                    });
                }
            }
        }

        res.json(updated);
    } catch (err) {
        console.error('updateCase error:', err);
        res.status(500).json({ error: 'Case güncellenemedi' });
    }
};


// ─── PATCH /contact-cases/:workspaceId/:caseId/assign ────────────────────
// Atama değiştir + CASCADE (pending aktiviteleri güncelle)
export const assignCase = async (req, res) => {
    try {
        const { workspaceId, caseId } = req.params;
        const { assignedToId, assignedTeamId } = req.body;

        // 1. Case atamasını güncelle
        const updated = await prisma.case.update({
            where: { id: caseId },
            data: {
                assignedToId: assignedToId || null,
                assignedTeamId: assignedTeamId || null
            }
        });

        // 2. CASCADE: Bağlı conversation'ların atamasını güncelle
        // Not: Conversation modeli hem assignedTeamId (tekil) hem teamIds (JSON array string) kullanır
        const teamIdsJson = assignedTeamId ? JSON.stringify([assignedTeamId]) : '[]';
        const convUpdateResult = await prisma.conversation.updateMany({
            where: { caseId },
            data: {
                assignedToId: assignedToId || null,
                assignedTeamId: assignedTeamId || null,
                teamIds: teamIdsJson
            }
        });

        // 3. CASCADE: Bağlı PLANNED/IN_PROGRESS aktivitelerin atamasını güncelle
        const activityUpdateResult = await prisma.contactActivity.updateMany({
            where: {
                caseId,
                status: { in: ['PLANNED', 'IN_PROGRESS'] }
            },
            data: {
                assignedToId: assignedToId || null,
                teamId: assignedTeamId || null
            }
        });

        // Socket event
        const io = req.app.get('io');
        if (io) {
            io.to(`workspace:${workspaceId}`).emit('case_assignment_updated', {
                caseId,
                contactId: updated.contactId,
                assignedToId,
                assignedTeamId,
                updatedConversations: convUpdateResult.count,
                updatedActivities: activityUpdateResult.count
            });

            // Inbox'ın mevcut 'conversation_assigned' listener'ına bildir
            const linkedConvs = await prisma.conversation.findMany({
                where: { caseId },
                select: { id: true, botEnabled: true }
            });
            // Atanan kişinin adını bul
            let assignedToName = null;
            if (assignedToId) {
                const assignee = await prisma.user.findUnique({ where: { id: assignedToId }, select: { name: true } });
                assignedToName = assignee?.name || null;
            }
            for (const conv of linkedConvs) {
                io.to(`workspace:${workspaceId}`).emit('conversation_assigned', {
                    conversationId: conv.id,
                    assignedToId: assignedToId || null,
                    assignedToName,
                    botEnabled: conv.botEnabled,
                    teamIds: teamIdsJson
                });
            }
        }

        res.json({
            case: updated,
            cascaded: {
                conversations: convUpdateResult.count,
                activities: activityUpdateResult.count
            }
        });
    } catch (err) {
        console.error('assignCase error:', err);
        res.status(500).json({ error: 'Case ataması güncellenemedi' });
    }
};


// ─── POST /contact-cases/:workspaceId/:caseId/link ───────────────────────
// Conversation'ı case'e bağla
export const linkConversation = async (req, res) => {
    try {
        const { workspaceId, caseId } = req.params;
        const { conversationId } = req.body;

        if (!conversationId) {
            return res.status(400).json({ error: 'conversationId gerekli' });
        }

        // Case'in varlığını kontrol et
        const caseData = await prisma.case.findFirst({
            where: { id: caseId, workspaceId }
        });
        if (!caseData) return res.status(404).json({ error: 'Case bulunamadı' });

        // Conversation'ı case'e bağla
        const conversation = await prisma.conversation.update({
            where: { id: conversationId },
            data: { caseId }
        });

        // O conversation'a ait mevcut aktiviteleri de case'e bağla (conversationId ile eşleşen)
        // Not: ContactActivity'de conversationId yok, ama retell_calls'da var
        // RetellCall'ları da bağla
        await prisma.retellCall.updateMany({
            where: { conversationId, workspaceId },
            data: { caseId }
        });

        // Socket event
        const io = req.app.get('io');
        if (io) {
            io.to(`workspace:${workspaceId}`).emit('case_conversation_linked', {
                caseId,
                conversationId,
                contactId: caseData.contactId
            });
        }

        res.json({ success: true, conversation });
    } catch (err) {
        console.error('linkConversation error:', err);
        res.status(500).json({ error: 'Conversation bağlanamadı' });
    }
};

// ─── DELETE /contact-cases/:workspaceId/:caseId/unlink/:conversationId ───
// Conversation'ı case'den çıkar
export const unlinkConversation = async (req, res) => {
    try {
        const { workspaceId, caseId, conversationId } = req.params;

        await prisma.conversation.update({
            where: { id: conversationId },
            data: { caseId: null }
        });

        // RetellCall'ları da çıkar
        await prisma.retellCall.updateMany({
            where: { conversationId, caseId },
            data: { caseId: null }
        });

        // Socket event
        const io = req.app.get('io');
        if (io) {
            io.to(`workspace:${workspaceId}`).emit('case_conversation_unlinked', {
                caseId,
                conversationId
            });
        }

        res.json({ success: true });
    } catch (err) {
        console.error('unlinkConversation error:', err);
        res.status(500).json({ error: 'Conversation bağlantısı kaldırılamadı' });
    }
};

// ─── DELETE /contact-cases/:workspaceId/:caseId ──────────────────────────
// Case sil (conversation'ların caseId'si null yapılır)
export const deleteCase = async (req, res) => {
    try {
        const { workspaceId, caseId } = req.params;

        // Önce bağlı conversation ve aktivitelerin caseId'sini null yap
        await prisma.conversation.updateMany({
            where: { caseId },
            data: { caseId: null }
        });
        await prisma.contactActivity.updateMany({
            where: { caseId },
            data: { caseId: null }
        });
        await prisma.retellCall.updateMany({
            where: { caseId },
            data: { caseId: null }
        });

        // Case'i sil
        await prisma.case.delete({
            where: { id: caseId }
        });

        // Socket event
        const io = req.app.get('io');
        if (io) {
            io.to(`workspace:${workspaceId}`).emit('case_deleted', { caseId });
        }

        res.json({ success: true });
    } catch (err) {
        console.error('deleteCase error:', err);
        res.status(500).json({ error: 'Case silinemedi' });
    }
};
