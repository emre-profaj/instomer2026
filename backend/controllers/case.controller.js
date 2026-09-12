import prisma from '../lib/prisma.js';
import { evaluateAndApplyRules } from '../services/stageRuleEngine.service.js';

/**
 * Increments suffix in sequence:
 * aa001 -> aa002 -> ... -> aa999 -> ab001 -> ... -> az999 -> ba001 -> ... -> zz999
 */
export function getNextSequence(lastSeq = '') {
    if (!lastSeq) return 'aa001';
    const match = lastSeq.match(/^([a-z]+)(\d+)$/i);
    let letters = 'aa';
    let num = 0;
    if (match) {
        letters = match[1].toLowerCase();
        num = parseInt(match[2], 10);
    }
    num += 1;
    if (num > 999) {
        num = 1;
        let chars = letters.split('');
        let carry = true;
        for (let i = chars.length - 1; i >= 0 && carry; i--) {
            let code = chars[i].charCodeAt(0) + 1;
            if (code > 122) { // 'z'
                chars[i] = 'a';
                carry = true;
            } else {
                chars[i] = String.fromCharCode(code);
                carry = false;
            }
        }
        if (carry) chars.unshift('a');
        letters = chars.join('');
    }
    return `${letters}${String(num).padStart(3, '0')}`;
}

// ─── Async In-Memory Mutex Lock ──────────────────────────────────────────
// Aynı müşteri veya aynı workspace için paralel webhook/classifier isteklerinin
// aynı case numarasını veya mükerrer case üretmesini kesin olarak engeller.
const caseAsyncLocks = new Map();
export const withCaseLock = async (key, fn) => {
    while (caseAsyncLocks.has(key)) {
        await caseAsyncLocks.get(key);
    }
    let resolve;
    const promise = new Promise(r => { resolve = r; });
    caseAsyncLocks.set(key, promise);
    try {
        return await fn();
    } finally {
        caseAsyncLocks.delete(key);
        resolve();
    }
};

/**
 * Standard Case Number Generator:
 * Format: YYYY-MM-DD-aa001 (e.g. 2026-09-03-aa001, 2026-09-03-aa002 ... 2026-09-03-ab001)
 */
export const generateCaseNumber = async (workspaceId) => {
    return await withCaseLock(`gen_num_${workspaceId}`, async () => {
        const now = new Date();
        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Europe/Istanbul',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        const datePrefix = formatter.format(now); // "YYYY-MM-DD" e.g. "2026-09-03"

        const lastCase = await prisma.case.findFirst({
            where: {
                workspaceId,
                caseNumber: { startsWith: `${datePrefix}-` }
            },
            orderBy: { caseNumber: 'desc' }
        });

        let lastSeq = '';
        if (lastCase?.caseNumber) {
            const parts = lastCase.caseNumber.split('-');
            if (parts.length >= 4) {
                lastSeq = parts[3];
            }
        }

        let nextSeq = getNextSequence(lastSeq);
        let candidate = `${datePrefix}-${nextSeq}`;

        // Safety loop against race conditions / duplicate numbers
        let attempts = 0;
        while (attempts < 20) {
            const exists = await prisma.case.findFirst({
                where: { workspaceId, caseNumber: candidate },
                select: { id: true }
            });
            if (!exists) break;
            nextSeq = getNextSequence(nextSeq);
            candidate = `${datePrefix}-${nextSeq}`;
            attempts++;
        }

        return candidate;
    });
};

// ─── Merkezi Auto-Case Helper ────────────────────────────────────────────
// Herhangi bir conversation için case yoksa otomatik oluşturur.
// Tüm webhook controller'lardan fire-and-forget çağrılabilir.
// Örnek: ensureCaseForConversation(workspaceId, conversationId).catch(console.error)
export const ensureCaseForConversation = async (workspaceId, conversationId) => {
    try {
        if (!workspaceId || !conversationId) return null;

        // Kilit mekanizması: Aynı konuşma için eşzamanlı gelen çağrıları sıraya sok
        return await withCaseLock(`conv_case_${conversationId}`, async () => {
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
                    topicCategoryId: true,
                    campaignId: true
                }
            });

            // Zaten case'e bağlıysa veya contact yoksa atla
            if (!conv || conv.caseId || !conv.contactId) return null;

            // Kilit mekanizması: Aynı müşterinin eşzamanlı vaka açmasını engelle
            return await withCaseLock(`contact_case_${conv.contactId}`, async () => {
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

        let caseTypeId = null;
        if (conv.topicCategoryId) {
            const tc = await prisma.topicCategory.findUnique({
                where: { id: conv.topicCategoryId },
                select: { caseTypeId: true }
            });
            caseTypeId = tc?.caseTypeId || null;
        }

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
                caseTypeId,
                campaignId: conv.campaignId || null,
                priority: 'NORMAL'
            }
        });

        await prisma.conversation.update({
            where: { id: conversationId },
            data: { caseId: newCase.id }
        });

        console.log(`📦 [AutoCase] Auto-created case "${caseNumber}" (${title}) for conv ${conversationId}`);
        return newCase;
            });
        });
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
                topicCategoryId: true,
                campaignId: true
            }
        });

        if (orphanConversations.length > 0) {
            console.log(`🔄 [AutoCase] Processing ${orphanConversations.length} orphan conversations for contact ${contactId}`);
            
            // Mevcut aktif bir case var mı kontrol et
            const existingActiveCase = await prisma.case.findFirst({
                where: {
                    workspaceId,
                    contactId,
                    status: 'ACTIVE'
                },
                orderBy: { updatedAt: 'desc' }
            });

            if (existingActiveCase) {
                // Aktif case varsa, konuşmaları bu mevcut case'e bağla (duplicate case oluşturma!)
                await prisma.conversation.updateMany({
                    where: { id: { in: orphanConversations.map(c => c.id) } },
                    data: { caseId: existingActiveCase.id }
                });
                console.log(`✅ [AutoCase] Linked ${orphanConversations.length} orphan conversations to existing active case ${existingActiveCase.caseNumber}`);
            } else {
                // Aktif case yoksa tek bir ana case oluştur ve tüm orphan conversation'ları buna bağla
                const primaryConv = orphanConversations[0];
                try {
                    const caseNumber = await generateCaseNumber(workspaceId);
                    let caseTypeId = null;
                    if (primaryConv.topicCategoryId) {
                        const tc = await prisma.topicCategory.findUnique({
                            where: { id: primaryConv.topicCategoryId },
                            select: { caseTypeId: true }
                        });
                        caseTypeId = tc?.caseTypeId || null;
                    }

                    const newCase = await prisma.case.create({
                        data: {
                            workspaceId,
                            contactId,
                            caseNumber,
                            title: primaryConv.aiTopic.trim().substring(0, 200),
                            assignedToId: primaryConv.assignedToId || null,
                            assignedTeamId: primaryConv.assignedTeamId || null,
                            funnelType: primaryConv.funnelType || null,
                            funnelStageId: primaryConv.funnelStageId || null,
                            categoryId: primaryConv.topicCategoryId || null,
                            caseTypeId,
                            campaignId: primaryConv.campaignId || null,
                            priority: 'NORMAL'
                        }
                    });
                    await prisma.conversation.updateMany({
                        where: { id: { in: orphanConversations.map(c => c.id) } },
                        data: { caseId: newCase.id }
                    });
                    console.log(`✅ [AutoCase] Created single unified case "${newCase.caseNumber}" for all ${orphanConversations.length} orphan conversations`);
                } catch (autoErr) {
                    console.error(`⚠️ [AutoCase] Failed to create unified case:`, autoErr.message);
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
                        source: true,
                        isBulkSend: true,
                        campaignId: true,
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
                },
                branch: {
                    select: { id: true, name: true }
                },
                caseType: {
                    select: { id: true, name: true, color: true, icon: true }
                },
                campaign: {
                    select: { id: true, name: true }
                }
            },
            orderBy: { updatedAt: 'desc' }
        });

        // ── DEDUPLICATION & MERGED FILTER ──
        // Birleştirilmiş (CLOSED & "Birleştirildi") veya aynı caseNumber'a sahip mükerrer kayıtları tekilleştir
        const activeCasesList = cases.filter(c => c.status === 'ACTIVE');
        const candidateCases = activeCasesList.length > 0
            ? cases.filter(c => !c.description?.includes('Birleştirildi'))
            : cases;

        const seenCaseNumbers = new Set();
        const seenIds = new Set();
        const dedupedCases = [];

        for (const c of candidateCases) {
            if (seenIds.has(c.id)) continue;
            const cNum = c.caseNumber ? String(c.caseNumber).trim() : null;
            if (cNum && seenCaseNumbers.has(cNum)) {
                // Aynı case numarasına sahip mükerrer kayıt:
                // Konuşmaları ve aktiviteleri ana case'e dahil et ve veritabanında birleştir
                const primaryCase = dedupedCases.find(dc => dc.caseNumber === c.caseNumber);
                if (primaryCase) {
                    // Eğer primaryCase boş ama bu kayıt doluysa, başlık ve aşama bilgilerini al
                    if ((!primaryCase.conversations?.length && c.conversations?.length) || (primaryCase.title?.startsWith('Yeni') && c.title)) {
                        primaryCase.title = c.title;
                        primaryCase.funnelStageId = primaryCase.funnelStageId || c.funnelStageId;
                        primaryCase.funnelType = primaryCase.funnelType || c.funnelType;
                        primaryCase.categoryId = primaryCase.categoryId || c.categoryId;
                        primaryCase.caseTypeId = primaryCase.caseTypeId || c.caseTypeId;
                    }

                    // Veritabanında mükerrer kaydın tüm ilişkilerini ana case'e aktar ve mükerrer kaydı kapat
                    prisma.conversation.updateMany({
                        where: { caseId: c.id },
                        data: { caseId: primaryCase.id }
                    }).catch(e => console.error('DB merge conv error:', e.message));

                    prisma.contactActivity.updateMany({
                        where: { caseId: c.id },
                        data: { caseId: primaryCase.id }
                    }).catch(e => console.error('DB merge activity error:', e.message));

                    prisma.deal.updateMany({
                        where: { caseId: c.id },
                        data: { caseId: primaryCase.id }
                    }).catch(e => console.error('DB merge deal error:', e.message));

                    prisma.case.update({
                        where: { id: c.id },
                        data: { status: 'CLOSED', description: `[Otomatik Birleştirildi] -> ${primaryCase.id}` }
                    }).catch(e => console.error('DB merge case status error:', e.message));

                    if (c.conversations?.length > 0) {
                        const existingConvIds = new Set((primaryCase.conversations || []).map(cv => cv.id));
                        for (const cv of c.conversations) {
                            if (!existingConvIds.has(cv.id)) {
                                primaryCase.conversations.push(cv);
                            }
                        }
                    }
                    if (c.activities?.length > 0) {
                        const existingActIds = new Set((primaryCase.activities || []).map(a => a.id));
                        for (const act of c.activities) {
                            if (!existingActIds.has(act.id)) {
                                primaryCase.activities.push(act);
                            }
                        }
                    }
                }
                continue;
            }
            seenIds.add(c.id);
            if (cNum) seenCaseNumbers.add(cNum);
            dedupedCases.push(c);
        }

        // ── AUTO-SYNC: Case funnelStageId boşsa ama bağlı conversation'da doluysa, case'i güncelle ──
        // + Case title generic kanal etiketi ise ama conversation'da aiTopic varsa, case title'ı güncelle
        const GENERIC_TITLES = ['💬 WhatsApp', '💬 Facebook', '💬 Instagram', '📧 E-posta', '📞 Telefon', '🌐 Web Widget', '📝 Form', 'Yeni İletişim', 'Yeni Case'];
        const isGenericOrDecorative = (t) => !t || GENERIC_TITLES.includes(t.trim()) || t.includes('━') || t.includes('═') || t.includes('🎯');
        for (const c of dedupedCases) {
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

        // Her case için retell call sayısını + arama özetini de ekle
        const casesWithCounts = await Promise.all(dedupedCases.map(async (c) => {
            const [retellCallCount, totalActivityCount, callActivities] = await Promise.all([
                prisma.retellCall.count({ where: { caseId: c.id } }),
                prisma.contactActivity.count({ where: { caseId: c.id } }),
                prisma.contactActivity.findMany({
                    where: { caseId: c.id, type: 'CALL' },
                    select: {
                        id: true, status: true, callSuccessful: true, callSentiment: true,
                        result: true, dueDate: true, completedAt: true, createdAt: true
                    },
                    orderBy: { createdAt: 'desc' }
                })
            ]);
            const completedCalls = callActivities.filter(a => a.status === 'COMPLETED' || a.status === 'DONE');
            const lastCall = completedCalls[0] || callActivities[0] || null;
            return {
                ...c,
                _retellCallCount: retellCallCount,
                _totalActivityCount: totalActivityCount,
                _conversationCount: c.conversations.length,
                _pendingActivityCount: c.activities.length,
                _callSummary: {
                    totalCalls: callActivities.length,
                    completedCalls: completedCalls.length,
                    reachedCalls: completedCalls.filter(a => a.callSuccessful === true).length,
                    lastCallDate: lastCall?.completedAt || lastCall?.dueDate || lastCall?.createdAt || null,
                    lastCallSuccessful: lastCall?.callSuccessful ?? null,
                    lastCallSentiment: lastCall?.callSentiment ?? null,
                    lastCallNote: lastCall?.result ?? null
                }
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
                branch: { select: { id: true, name: true } },
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
        const { title, description, funnelType, funnelStageId, assignedToId, assignedTeamId, conversationId, priority, caseTypeId, branchId } = req.body;

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
                priority: priority || 'NORMAL',
                caseTypeId: caseTypeId || null,
                branchId: branchId || null
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
        const { title, description, status, priority, type, funnelType, funnelStageId, lostReason, assignedToId, assignedTeamId, products, categoryId, branchId } = req.body;

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
        if (branchId !== undefined) updateData.branchId = branchId || null;
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
            data: updateData,
            include: {
                branch: { select: { id: true, name: true } }
            }
        });

        // CASCADE: title değiştiyse bağlı conversation'ların aiTopic'ini de güncelle
        if (title !== undefined) {
            await prisma.conversation.updateMany({
                where: { caseId },
                data: { aiTopic: title.trim() || null }
            });
            console.log(`🔄 [CaseUpdate] Cascaded title → aiTopic for conversations of case ${caseId}`);
        }

        // CASCADE: branchId değiştiyse bağlı conversation'ların branchId'sini de güncelle
        if (branchId !== undefined) {
            await prisma.conversation.updateMany({
                where: { caseId },
                data: { branchId: branchId || null }
            });
            console.log(`🔄 [CaseUpdate] Cascaded branchId → conversation.branchId for case ${caseId}`);
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
    const { sourceCaseId, targetCaseId, caseIds, contactId } = req.body;
    
    let targetId = targetCaseId;
    let sourceIds = sourceCaseId ? [sourceCaseId] : [];

    if (Array.isArray(caseIds) && caseIds.length > 0) {
      if (!targetId) {
        targetId = caseIds[0];
        sourceIds = caseIds.slice(1);
      } else {
        sourceIds = caseIds.filter(id => id !== targetId);
      }
    }

    if (!targetId || sourceIds.length === 0) {
      return res.status(400).json({ error: 'Birleştirilecek en az iki case belirtilmelidir' });
    }

    // Source case'lerin conversation, activity ve deal'larını target'a taşı
    await prisma.conversation.updateMany({
      where: { caseId: { in: sourceIds } },
      data: { caseId: targetId }
    });
    
    await prisma.contactActivity.updateMany({
      where: { caseId: { in: sourceIds } },
      data: { caseId: targetId }
    });

    try {
      await prisma.deal.updateMany({
        where: { caseId: { in: sourceIds } },
        data: { caseId: targetId }
      });
    } catch (dealErr) {
      // Deal modelinde caseId alanı opsiyonel olabilir
    }
    
    // Source case'leri kapat ve birleştirildi olarak işaretle
    await prisma.case.updateMany({
      where: { id: { in: sourceIds } },
      data: { status: 'CLOSED', description: `Birleştirildi → Case ${targetId}` }
    });
    
    const targetCase = await prisma.case.findUnique({
      where: { id: targetId },
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
    
    const nextNumber = await generateCaseNumber(workspaceId);
    
    const newCase = await prisma.case.create({
      data: {
        workspaceId,
        contactId: sourceCase.contactId,
        caseNumber: nextNumber,
        title: `Talep #${nextNumber} (ayrıştırıldı)`,
        status: 'ACTIVE',
        priority: sourceCase.priority,
        assignedToId: sourceCase.assignedToId,
        assignedTeamId: sourceCase.assignedTeamId,
        caseTypeId: sourceCase.caseTypeId || null,
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
