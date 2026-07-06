import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Funnel Aşama Giriş Kuralları Motoru
 * 
 * Kişinin verilerine göre en uygun funnel aşamasını belirler.
 * Sadece YUKARI yönde ilerleme yapılır, asla geriye düşürülmez.
 */

// ============================================
// KURAL DEĞERLENDİRME
// ============================================

/**
 * Tek bir kuralı kontekst verisine göre değerlendirir.
 * @param {Object} rule - { type, field, values, activityType, status, value }
 * @param {Object} context - { contact, conversations, activities, cases, appointments }
 * @returns {boolean}
 */
function evaluateRule(rule, context) {
    switch (rule.type) {
        case 'FIELD_EXISTS': {
            if (rule.field === 'topic') {
                // Topic konuşmadaki aiTopic'ten gelir
                return context.conversations?.some(c => c.aiTopic && c.aiTopic.trim() !== '');
            }
            const value = context.contact[rule.field];
            return value !== null && value !== undefined && value !== '';
        }

        case 'FIELD_EQUALS': {
            const fieldValue = context.contact[rule.field];
            return fieldValue === rule.value;
        }

        case 'TOPIC_CONTAINS': {
            const topics = context.conversations
                ?.map(c => (c.aiTopic || '').toLowerCase())
                .filter(t => t) || [];
            
            if (topics.length === 0) return false;
            
            return (rule.values || []).some(keyword => 
                topics.some(topic => topic.includes(keyword.toLowerCase()))
            );
        }

        case 'DEAL_EXISTS': {
            return (context.cases || []).length > 0;
        }

        case 'DEAL_STATUS': {
            return (context.cases || []).some(c => c.status === rule.status);
        }

        case 'ACTIVITY_EXISTS': {
            return (context.activities || []).some(a => a.type === rule.activityType);
        }

        case 'ACTIVITY_RESULT': {
            return (context.activities || []).some(
                a => a.type === rule.activityType && a.status === rule.result
            );
        }

        case 'HAS_APPOINTMENT': {
            return (context.appointments || []).length > 0;
        }

        case 'MESSAGE_COUNT_GT': {
            const totalMessages = context.conversations?.reduce(
                (sum, c) => sum + (c._count?.messages || 0), 0
            ) || 0;
            return totalMessages > (rule.value || 0);
        }

        default:
            console.warn(`⚠️ [RuleEngine] Bilinmeyen kural tipi: ${rule.type}`);
            return false;
    }
}

/**
 * Bir aşamanın tüm giriş kurallarını değerlendirir.
 * @param {Object} entryRules - { matchType: 'ALL'|'ANY', rules: [...] }
 * @param {Object} context
 * @returns {boolean}
 */
function evaluateStageEntryRules(entryRules, context) {
    if (!entryRules || !entryRules.rules || entryRules.rules.length === 0) {
        return false; // Kural yoksa otomatik giriş yok
    }

    const { matchType = 'ALL', rules } = entryRules;

    if (matchType === 'ANY') {
        return rules.some(rule => evaluateRule(rule, context));
    }
    // ALL — hepsi eşleşmeli
    return rules.every(rule => evaluateRule(rule, context));
}

// ============================================
// ANA FONKSİYON
// ============================================

/**
 * Bir kişi için en uygun funnel aşamasını belirler.
 * 
 * Kurallar:
 * 1. stageManuallySet = true ise otomatik değişiklik YAPMA
 * 2. Kapanış aşamasındaysa (isClosing) dokunma
 * 3. Sadece YUKARI yönde ilerleme yapılır (order bazlı)
 * 4. En yüksek order'lı eşleşen aşamaya taşınır
 * 
 * @param {string} contactId
 * @param {string} workspaceId
 * @param {Object} options - { funnelId, skipManualCheck }
 * @returns {Object|null} - { stageId, stageName, funnelId } veya null (değişiklik yok)
 */
export async function evaluateStageRules(contactId, workspaceId, options = {}) {
    try {
        const { funnelId, skipManualCheck = false } = options;

        // 1. Kişi bilgilerini yükle
        const contact = await prisma.contact.findUnique({
            where: { id: contactId },
            select: {
                id: true,
                name: true,
                phone: true,
                email: true,
                source: true,
                category: true,
                status: true,
                funnelType: true,
                funnelStageId: true,
                stageManuallySet: true,
                tags: true,
                company: true,
                country: true,
                city: true,
            }
        });

        if (!contact) {
            console.warn(`⚠️ [RuleEngine] Kişi bulunamadı: ${contactId}`);
            return null;
        }

        // 2. Manuel değişiklik kontrolü
        if (!skipManualCheck && contact.stageManuallySet) {
            console.log(`🔒 [RuleEngine] ${contactId}: Manuel aşama — atlanıyor`);
            return null;
        }

        // 3. Mevcut funnel belirle
        const activeFunnelId = funnelId || contact.funnelType;
        if (!activeFunnelId) {
            // Workspace'in varsayılan funnel'ını bul
            const workspace = await prisma.workspace.findUnique({
                where: { id: workspaceId },
                select: { defaultFunnelId: true }
            });
            
            if (!workspace?.defaultFunnelId) {
                console.log(`ℹ️ [RuleEngine] ${contactId}: Funnel yok ve defaultFunnelId yok — atlanıyor`);
                return null;
            }

            // Varsayılan funnel'ın aşamalarını kullan
            return await _evaluateForFunnel(contact, workspace.defaultFunnelId, workspaceId);
        }

        return await _evaluateForFunnel(contact, activeFunnelId, workspaceId);
    } catch (error) {
        console.error(`❌ [RuleEngine] Hata:`, error.message);
        return null;
    }
}

/**
 * Belirli bir funnel için kural değerlendirmesi yapar.
 * @private
 */
async function _evaluateForFunnel(contact, funnelId, workspaceId) {
    // Funnel ve aşamalarını yükle
    const funnel = await prisma.funnel.findUnique({
        where: { id: funnelId },
        include: {
            stages: {
                orderBy: { order: 'asc' }
            }
        }
    });

    if (!funnel?.stages?.length) {
        return null;
    }

    // Kontekst verisi yükle
    const context = await _loadContext(contact.id, workspaceId);
    context.contact = contact;

    // Mevcut aşamanın order'ını bul
    const currentStage = funnel.stages.find(s => s.id === contact.funnelStageId);
    const currentOrder = currentStage?.order ?? -1;

    // Mevcut aşama kapanışsa dokunma
    if (currentStage?.isClosing) {
        console.log(`🔒 [RuleEngine] ${contact.id}: Kapanış aşamasında — atlanıyor`);
        return null;
    }

    // En yüksek eşleşen aşamayı bul (yüksek order = ileri aşama)
    let bestMatch = null;

    // Aşamaları TERS sırada kontrol et (en yüksekten en düşüğe)
    // Böylece ilk eşleşen en yüksek aşama olur
    const sortedStages = [...funnel.stages]
        .filter(s => !s.isClosing) // Kapanış aşamalarını atla — sadece kuralı varsa dene
        .sort((a, b) => b.order - a.order);

    // Kapanış aşamalarını da kuralı varsa dene (WON/LOST gibi)
    const closingStages = funnel.stages
        .filter(s => s.isClosing && s.entryRules)
        .sort((a, b) => b.order - a.order);

    // Önce kapanış aşamalarını kontrol et (WON/LOST öncelikli)
    for (const stage of closingStages) {
        const rules = _parseRules(stage.entryRules);
        if (rules && evaluateStageEntryRules(rules, context)) {
            bestMatch = stage;
            break;
        }
    }

    // Kapanış eşleşmediyse normal aşamaları kontrol et
    if (!bestMatch) {
        for (const stage of sortedStages) {
            if (!stage.entryRules) continue;

            const rules = _parseRules(stage.entryRules);
            if (!rules) continue;

            if (evaluateStageEntryRules(rules, context)) {
                bestMatch = stage;
                break; // En yüksek eşleşeni bulduk
            }
        }
    }

    if (!bestMatch) {
        return null; // Hiçbir kural eşleşmedi
    }

    // Sadece YUKARI yönde ilerleme — mevcut aşamadan yüksek olmalı
    // EXCEPTION: Kapanış aşamaları her zaman atanabilir (WON/LOST)
    if (!bestMatch.isClosing && bestMatch.order <= currentOrder) {
        return null; // Geri gitmeye izin yok
    }

    // Zaten bu aşamadaysa değişiklik yok
    if (bestMatch.id === contact.funnelStageId) {
        return null;
    }

    console.log(`🎯 [RuleEngine] ${contact.id}: "${currentStage?.name || 'Yok'}" → "${bestMatch.name}" (order ${currentOrder} → ${bestMatch.order})`);

    return {
        stageId: bestMatch.id,
        stageName: bestMatch.name,
        funnelId: funnelId,
        isClosing: bestMatch.isClosing,
        statusType: bestMatch.statusType
    };
}

/**
 * Kural değerlendirmesi için kontekst verisi yükler.
 * @private
 */
async function _loadContext(contactId, workspaceId) {
    const [conversations, activities, cases, appointments] = await Promise.all([
        // Konuşmalar
        prisma.conversation.findMany({
            where: { contactId, workspaceId },
            select: {
                id: true,
                aiTopic: true,
                _count: { select: { messages: true } },
                funnelType: true,
                funnelStageId: true,
            },
            orderBy: { lastMessageAt: 'desc' },
            take: 10
        }),
        // Aktiviteler
        prisma.contactActivity.findMany({
            where: { contactId, workspaceId },
            select: {
                id: true,
                type: true,
                status: true,
                result: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 20
        }),
        // Deal'ler (Cases)
        prisma.case.findMany({
            where: { contactId, workspaceId },
            select: {
                id: true,
                status: true,
                funnelStageId: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 10
        }),
        // Randevular
        prisma.appointment ? prisma.appointment.findMany({
            where: { contactId, workspaceId },
            select: { id: true },
            take: 5
        }).catch(() => []) : Promise.resolve([])
    ]);

    return { conversations, activities, cases, appointments };
}

/**
 * JSON string'den rules objesini parse eder.
 * @private
 */
function _parseRules(entryRulesStr) {
    if (!entryRulesStr) return null;
    try {
        return JSON.parse(entryRulesStr);
    } catch {
        console.warn(`⚠️ [RuleEngine] JSON parse hatası:`, entryRulesStr);
        return null;
    }
}

// ============================================
// AŞAMA ATAMA
// ============================================

/**
 * Kural değerlendirmesi sonucu kişiyi yeni aşamaya taşır.
 * Contact + Conversation + Case günceller.
 * 
 * @param {string} contactId
 * @param {string} workspaceId
 * @param {Object} stageResult - evaluateStageRules() sonucu
 */
export async function applyStageChange(contactId, workspaceId, stageResult) {
    if (!stageResult) return;

    const { stageId, funnelId } = stageResult;

    // Contact güncelle
    await prisma.contact.update({
        where: { id: contactId },
        data: {
            funnelType: funnelId,
            funnelStageId: stageId,
            // stageManuallySet = false kalır (otomatik atama)
        }
    });

    // Tüm aktif konuşmaları güncelle
    await prisma.conversation.updateMany({
        where: {
            contactId,
            workspaceId,
            status: { not: 'RESOLVED' }
        },
        data: {
            funnelType: funnelId,
            funnelStageId: stageId,
        }
    });

    // Aktif case'leri de güncelle
    await prisma.case.updateMany({
        where: {
            contactId,
            workspaceId,
            status: { notIn: ['CLOSED', 'CANCELLED'] }
        },
        data: {
            funnelStageId: stageId,
            funnelType: funnelId,
        }
    });

    // Socket ile UI güncelle
    try {
        const { emitToWorkspace } = await import('../socket.js');
        emitToWorkspace(workspaceId, 'funnel_stage_updated', {
            contactId,
            funnelType: funnelId,
            funnelStageId: stageId,
        });
    } catch (_) {}

    // Stage atamalarını uygula (assignedUserId, assignedTeamId, assignedBotId)
    await _applyStageAssignments(contactId, workspaceId, stageId);

    console.log(`✅ [RuleEngine] ${contactId}: Aşama güncellendi → ${stageResult.stageName}`);
}

/**
 * Aşamanın assignedUserId/assignedTeamId/assignedBotId'sini uygular.
 * @private
 */
async function _applyStageAssignments(contactId, workspaceId, stageId) {
    const stage = await prisma.funnelStage.findUnique({
        where: { id: stageId },
        select: { assignedUserId: true, assignedTeamId: true, assignedBotId: true }
    });

    if (!stage) return;

    const updateData = {};
    if (stage.assignedTeamId) updateData.assignedTeamId = stage.assignedTeamId;
    if (stage.assignedUserId) updateData.assignedToId = stage.assignedUserId;

    if (Object.keys(updateData).length > 0) {
        // Sadece atanmamış konuşmaları güncelle
        await prisma.conversation.updateMany({
            where: {
                contactId,
                workspaceId,
                status: { not: 'RESOLVED' },
                ...(updateData.assignedToId ? { assignedToId: null } : {})
            },
            data: updateData
        });
    }
}

// ============================================
// TEK SATIRLIK HOOK
// ============================================

/**
 * Controller'lardan çağrılacak tek fonksiyon.
 * Kural değerlendir → eşleşirse aşama güncelle.
 * 
 * @param {string} contactId
 * @param {string} workspaceId
 * @param {Object} options
 */
export async function evaluateAndApplyRules(contactId, workspaceId, options = {}) {
    try {
        const result = await evaluateStageRules(contactId, workspaceId, options);
        if (result) {
            await applyStageChange(contactId, workspaceId, result);
        }
        return result;
    } catch (error) {
        console.error(`❌ [RuleEngine] evaluateAndApplyRules hatası:`, error.message);
        return null;
    }
}
