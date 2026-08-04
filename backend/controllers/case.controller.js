import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
import { evaluateAndApplyRules } from '../services/stageRuleEngine.service.js';

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
                funnelStageId: true,
                topicCategoryId: true
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
        
        // aiTopic'ten dekoratif başlıkları temizle (form mesaj headerları)
        let topic = conv.aiTopic;
        if (topic && (topic.includes('━') || topic.includes('═') || topic.includes('🎯'))) {
            topic = null; // Dekoratif başlık, gerçek konu değil
        }
        
        // FORM kanalı için topic boşsa, formSubmission'dan konu çek
        if (!topic && conv.channel === 'FORM') {
            const latestSubmission = await prisma.formSubmission.findFirst({
                where: { conversationId },
                orderBy: { createdAt: 'desc' },
                select: { message: true, formWebhook: { select: { name: true } } }
            });
            topic = latestSubmission?.message || latestSubmission?.formWebhook?.name || null;
        }
        const title = topic || channelLabel;

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
                categoryId: conv.topicCategoryId || null,
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
                createdAt: true,
                topicCategoryId: true
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
                            categoryId: conv.topicCategoryId || null,
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
        // + Case title generic kanal etiketi ise ama conversation'da aiTopic varsa, case title'ı güncelle
        const GENERIC_TITLES = ['💬 WhatsApp', '💬 Facebook', '💬 Instagram', '📧 E-posta', '📞 Telefon', '🌐 Web Widget', '📝 Form', 'Yeni İletişim', 'Yeni Case'];
        const isGenericOrDecorative = (t) => !t || GENERIC_TITLES.includes(t.trim()) || t.includes('━') || t.includes('═') || t.includes('🎯');
        for (const c of cases) {
            let needsUpdate = false;
            const updateData = {};

            // Funnel stage sync
            if (!c.funnelStageId) {
                const convWithStage = c.conversations?.find(cv => cv.funnelStageId);
                if (convWithStage) {
                    updateData.funnelStageId = convWithStage.funnelStageId;
                    updateData.funnelType = convWithStage.funnelType || null;
                    c.funnelStageId = convWithStage.funnelStageId;
                    c.funnelType = convWithStage.funnelType || null;
                    needsUpdate = true;
                    console.log(`🔄 [AutoSync] Backfilled case ${c.caseNumber} funnelStageId from conversation`);
                } else {
                    // Try from contact or legacy status
                    const contactInfo = await prisma.contact.findUnique({
                        where: { id: contactId },
                        select: { funnelStageId: true, funnelType: true, status: true }
                    });
                    
                    if (contactInfo?.funnelStageId) {
                        updateData.funnelStageId = contactInfo.funnelStageId;
                        updateData.funnelType = contactInfo.funnelType || null;
                        c.funnelStageId = contactInfo.funnelStageId;
                        c.funnelType = contactInfo.funnelType || null;
                        needsUpdate = true;
                        console.log(`🔄 [AutoSync] Backfilled case ${c.caseNumber} funnelStageId from contact`);
                    } else if (contactInfo?.status) {
                        // Legacy status mapping
                        let targetFunnelName = null;
                        let targetStageName = null;
                        if (contactInfo.status === 'OPPORTUNITY') { targetFunnelName = 'Satış Akışı'; targetStageName = 'Fırsat'; }
                        else if (contactInfo.status === 'HOT_OPPORTUNITY') { targetFunnelName = 'Satış Akışı'; targetStageName = 'Sıcak Fırsat'; }
                        else if (contactInfo.status === 'WON') { targetFunnelName = 'Satış Akışı'; targetStageName = 'Kazanıldı'; }
                        else if (contactInfo.status === 'LOST') { targetFunnelName = 'Satış Akışı'; targetStageName = 'Kaybedildi'; }

                        if (targetFunnelName && targetStageName) {
                            const funnel = await prisma.funnel.findFirst({
                                where: { workspaceId, name: targetFunnelName },
                                include: { stages: true }
                            });
                            if (funnel) {
                                const stage = funnel.stages.find(s => s.name === targetStageName);
                                if (stage) {
                                    updateData.funnelStageId = stage.id;
                                    updateData.funnelType = funnel.id;
                                    c.funnelStageId = stage.id;
                                    c.funnelType = funnel.id;
                                    needsUpdate = true;
                                    console.log(`🔄 [AutoSync] Backfilled case ${c.caseNumber} funnelStageId from legacy status (${contactInfo.status})`);
                                    
                                    // Also update contact to keep it clean
                                    await prisma.contact.update({
                                        where: { id: contactId },
                                        data: { funnelStageId: stage.id, funnelType: funnel.id }
                                    });
                                }
                            }
                        }
                    }
                }
            }

            // Title sync: generic/dekoratif başlık → conversation aiTopic
            if (c.conversations?.length > 0 && isGenericOrDecorative(c.title)) {
                const convWithTopic = c.conversations
                    .filter(cv => cv.aiTopic && !isGenericOrDecorative(cv.aiTopic))
                    .sort((a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0))[0];
                if (convWithTopic) {
                    updateData.title = convWithTopic.aiTopic.trim().substring(0, 200);
                    c.title = updateData.title;
                    needsUpdate = true;
                    console.log(`🔄 [AutoSync] Backfilled case ${c.caseNumber} title: "${updateData.title}"`);
                }
            }

            if (needsUpdate) {
                try {
                    await prisma.case.update({ where: { id: c.id }, data: updateData });
                } catch (syncErr) {
                    console.warn(`⚠️ [AutoSync] Failed for case ${c.id}:`, syncErr.message);
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

        // Entry Rules: Deal oluşturulunca aşama kurallarını değerlendir
        if (contactId) {
            evaluateAndApplyRules(contactId, workspaceId).catch(err => 
                console.error('⚠️ [CaseCreate] Entry rules hatası:', err.message)
            );
        }
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
        const { title, description, status, priority, type, funnelType, funnelStageId, lostReason, assignedToId, assignedTeamId, products, categoryId } = req.body;

        const existing = await prisma.case.findUnique({ where: { id: caseId } });
        if (!existing) {
            return res.status(404).json({ error: 'Case bulunamadı' });
        }

        const updateData = {};
        if (title !== undefined) updateData.title = title.trim();
        if (description !== undefined) updateData.description = description;
        if (priority !== undefined) updateData.priority = priority;
        if (type !== undefined) {
            const validTypes = ['FIRSAT', 'SIKAYET', 'RANDEVU', 'DESTEK', 'IS_BASVURUSU', 'GENEL'];
            if (validTypes.includes(type)) updateData.type = type;
        }
        if (funnelType !== undefined) updateData.funnelType = funnelType;
        if (funnelStageId !== undefined) updateData.funnelStageId = funnelStageId;
        if (assignedToId !== undefined) updateData.assignedToId = assignedToId || null;
        if (assignedTeamId !== undefined) updateData.assignedTeamId = assignedTeamId || null;
        if (products !== undefined) {
            // JSON array formatı doğrula
            if (typeof products === 'string') {
                try { JSON.parse(products); } catch (_) { return res.status(400).json({ error: 'Geçersiz ürün formatı' }); }
            }
            updateData.products = products;
        }
        if (categoryId !== undefined) {
            if (categoryId) {
                const cat = await prisma.topicCategory.findUnique({ where: { id: categoryId }, select: { id: true } });
                if (!cat) return res.status(400).json({ error: 'Geçersiz kategori ID' });
            }
            updateData.categoryId = categoryId || null;
        }

        // Status değişiklikleri
        if (status !== undefined) {
            updateData.status = status;
            if (status === 'WON') updateData.wonAt = new Date();
            if (status === 'LOST') {
                updateData.lostAt = new Date();
                if (lostReason) updateData.lostReason = lostReason;
            }
            if (status === 'CLOSED') updateData.closedAt = new Date();
            if (status === 'ACTIVE') { updateData.closedAt = null; updateData.wonAt = null; updateData.lostAt = null; }
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

        // CASCADE: assignedToId/assignedTeamId değiştiyse conversation + activities güncelle
        if (assignedToId !== undefined || assignedTeamId !== undefined) {
            const convAssignUpdate = {};
            if (assignedToId !== undefined) convAssignUpdate.assignedToId = assignedToId || null;
            if (assignedTeamId !== undefined) {
                convAssignUpdate.assignedTeamId = assignedTeamId || null;
                convAssignUpdate.teamIds = assignedTeamId ? JSON.stringify([assignedTeamId]) : '[]';
            }

            await prisma.conversation.updateMany({
                where: { caseId, status: { not: 'RESOLVED' } },
                data: convAssignUpdate
            });

            // Açık aktiviteleri de güncelle
            if (assignedToId !== undefined) {
                await prisma.contactActivity.updateMany({
                    where: { caseId, status: { in: ['PLANNED', 'IN_PROGRESS'] } },
                    data: { assignedToId: assignedToId || null }
                });
            }
            console.log(`🔄 [CaseUpdate] Cascaded assignment to conversations+activities of case ${caseId}`);
        }

        // CASCADE: status değiştiyse conversation'ları da güncelle
        if (status !== undefined) {
            const closedStatuses = ['CLOSED', 'WON', 'LOST'];
            if (closedStatuses.includes(status)) {
                // Case kapatıldı → açık conversation'ları da kapat
                await prisma.conversation.updateMany({
                    where: { caseId, status: { not: 'RESOLVED' } },
                    data: { status: 'RESOLVED', resolvedAt: new Date(), botEnabled: false }
                });
                console.log(`🔄 [CaseUpdate] Case ${status} → conversations RESOLVED`);
            } else if (status === 'ACTIVE') {
                // Case yeniden açıldı → conversation'ları da aç
                await prisma.conversation.updateMany({
                    where: { caseId, status: 'RESOLVED' },
                    data: { status: 'OPEN', resolvedAt: null }
                });
                console.log(`🔄 [CaseUpdate] Case ACTIVE → conversations OPEN`);
            }
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

            // funnelStageId veya atama değişikliğini Inbox'a da bildir
            if (funnelType !== undefined || funnelStageId !== undefined || assignedToId !== undefined || assignedTeamId !== undefined || status !== undefined) {
                const linkedConvs = await prisma.conversation.findMany({
                    where: { caseId },
                    select: { id: true, assignedToId: true, assignedTeamId: true, teamIds: true, botEnabled: true, status: true, funnelType: true, funnelStageId: true }
                });
                for (const conv of linkedConvs) {
                    io.to(`workspace:${workspaceId}`).emit('conversation_assigned', {
                        conversationId: conv.id,
                        assignedToId: conv.assignedToId,
                        assignedToName: null,
                        botEnabled: conv.botEnabled,
                        teamIds: conv.teamIds,
                        funnelType: conv.funnelType,
                        funnelStageId: conv.funnelStageId,
                        status: conv.status
                    });
                }

                // Contact güncellemesini de bildir
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

        // Entry Rules: Deal durumu değişince (WON/LOST) aşama kurallarını değerlendir
        if (status !== undefined && updated.contactId) {
            evaluateAndApplyRules(updated.contactId, workspaceId).catch(err => 
                console.error('⚠️ [CaseUpdate] Entry rules hatası:', err.message)
            );
        }
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

// ─── Sync Closing Stages ─────────────────────────────────────────────
// Kapanış aşamasında olup status'u hâlâ ACTIVE olan case'leri düzeltir
export const syncClosingStages = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const dryRun = req.query.dryRun === 'true';

        // 1. Bu workspace'teki kapanış aşamalarını bul
        const closingStages = await prisma.funnelStage.findMany({
            where: {
                isClosing: true,
                funnel: { workspaceId }
            },
            include: { funnel: { select: { name: true } } }
        });

        const closingStageIds = closingStages.map(s => s.id);
        if (closingStageIds.length === 0) {
            return res.json({ message: 'Kapanış aşaması bulunamadı', fixed: 0 });
        }

        // 2. Tutarsız case'leri bul
        const mismatchedCases = await prisma.case.findMany({
            where: {
                workspaceId,
                status: 'ACTIVE',
                funnelStageId: { in: closingStageIds }
            },
            include: {
                conversations: { select: { id: true, status: true } },
                contact: { select: { name: true } }
            }
        });

        if (dryRun) {
            return res.json({
                message: `${mismatchedCases.length} tutarsız case bulundu (dry-run)`,
                count: mismatchedCases.length,
                cases: mismatchedCases.map(c => ({
                    caseNumber: c.caseNumber,
                    contact: c.contact?.name,
                    currentStage: closingStages.find(s => s.id === c.funnelStageId)?.name,
                    newStatus: closingStages.find(s => s.id === c.funnelStageId)?.statusType || 'CLOSED'
                }))
            });
        }

        // 3. Güncelle
        let updatedCases = 0;
        let updatedConversations = 0;

        for (const c of mismatchedCases) {
            const stage = closingStages.find(s => s.id === c.funnelStageId);
            const newStatus = stage?.statusType || 'CLOSED';

            await prisma.case.update({
                where: { id: c.id },
                data: {
                    status: newStatus,
                    closedAt: newStatus === 'CLOSED' ? new Date() : undefined,
                    wonAt: newStatus === 'WON' ? new Date() : undefined,
                    lostAt: newStatus === 'LOST' ? new Date() : undefined
                }
            });
            updatedCases++;

            for (const conv of c.conversations) {
                if (conv.status === 'OPEN') {
                    await prisma.conversation.update({
                        where: { id: conv.id },
                        data: { status: 'RESOLVED' }
                    });
                    updatedConversations++;
                }
            }
        }

        res.json({
            message: 'Senkronizasyon tamamlandı',
            updatedCases,
            updatedConversations
        });
    } catch (err) {
        console.error('syncClosingStages error:', err);
        res.status(500).json({ error: 'Senkronizasyon hatası' });
    }
};

// Case birleştirme
export const mergeCases = async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { sourceCaseId, targetCaseId } = req.body;
    
    // Source case'in conversation ve activity'lerini target'a taşı
    await prisma.conversation.updateMany({
      where: { caseId: sourceCaseId },
      data: { caseId: targetCaseId }
    });
    
    await prisma.contactActivity.updateMany({
      where: { caseId: sourceCaseId },
      data: { caseId: targetCaseId }
    });
    
    // Source case'i kapat
    await prisma.case.update({
      where: { id: sourceCaseId },
      data: { status: 'CLOSED', description: `Birleştirildi → Case ${targetCaseId}` }
    });
    
    const targetCase = await prisma.case.findUnique({
      where: { id: targetCaseId },
      include: { conversations: true, activities: true }
    });
    
    res.json({ success: true, case: targetCase });
  } catch (error) {
    console.error('Case merge error:', error);
    res.status(500).json({ error: 'Case birleştirme hatası' });
  }
};

// Case ayrıştırma
export const splitCase = async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { caseId, conversationIds } = req.body;
    
    const sourceCase = await prisma.case.findUnique({ where: { id: caseId } });
    if (!sourceCase) return res.status(404).json({ error: 'Case bulunamadı' });
    
    const nextNumber = await getNextCaseNumber(workspaceId);
    
    const newCase = await prisma.case.create({
      data: {
        workspaceId,
        contactId: sourceCase.contactId,
        caseNumber: String(nextNumber), // Ensuring string if caseNumber is string
        title: `Talep #${nextNumber} (ayrıştırıldı)`,
        status: 'ACTIVE',
        priority: sourceCase.priority,
        assignedToId: sourceCase.assignedToId,
        assignedTeamId: sourceCase.assignedTeamId,
      }
    });
    
    await prisma.conversation.updateMany({
      where: { id: { in: conversationIds } },
      data: { caseId: newCase.id }
    });
    
    res.json({ success: true, case: newCase });
  } catch (error) {
    console.error('Case split error:', error);
    res.status(500).json({ error: 'Case ayrıştırma hatası' });
  }
};

async function getNextCaseNumber(workspaceId) {
  const lastCase = await prisma.case.findFirst({
    where: { workspaceId },
    orderBy: { caseNumber: 'desc' }
  });
  // Safely parse caseNumber if it's a string, or just use 0 if not parsable
  let currentNum = 0;
  if (lastCase?.caseNumber) {
    const parsed = parseInt(lastCase.caseNumber, 10);
    if (!isNaN(parsed)) currentNum = parsed;
    else if (lastCase.caseNumber.includes('-')) {
        const parts = lastCase.caseNumber.split('-');
        const lastPart = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(lastPart)) currentNum = lastPart;
    }
  }
  return currentNum + 1;
}
