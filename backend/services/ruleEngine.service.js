/**
 * ══════════════════════════════════════════════════════════════════
 * Rule Engine Service — Merkezi Otomasyon Kural Motoru
 * ══════════════════════════════════════════════════════════════════
 * 
 * Tüm WorkspaceRule kurallarının aktiflik kontrolü, config okuma,
 * çalıştırma ve duplikasyon korumasını sağlar.
 * 
 * Kullanım:
 *   import { executeRule } from './ruleEngine.service.js';
 *   await executeRule(workspaceId, 'CALL_SUCCESS_NOTIFY', { contactId, ... });
 */
import prisma from '../lib/prisma.js';
import { executeAutomationAction } from './automationExecutor.js';
import { emitToWorkspace } from '../socket.js';

const TAG = '[RuleEngine]';

// ─── Kural aktif mi kontrol et ───────────────────────────────────
export async function isRuleActive(workspaceId, ruleType) {
    try {
        const rule = await prisma.workspaceRule.findFirst({
            where: { workspaceId, ruleType }
        });
        return rule?.isActive === true;
    } catch (e) {
        console.error(`${TAG} isRuleActive error:`, e.message);
        return false;
    }
}

// ─── Kural config'ini getir ──────────────────────────────────────
export async function getRuleConfig(workspaceId, ruleType) {
    try {
        const rule = await prisma.workspaceRule.findFirst({
            where: { workspaceId, ruleType }
        });
        if (!rule || !rule.isActive) return null;
        let config = {};
        try { config = rule.config ? JSON.parse(rule.config) : {}; } catch { config = {}; }
        config._linkedStageId = rule.linkedStageId || null; // Çapraz dedup için
        return config;
    } catch (e) {
        console.error(`${TAG} getRuleConfig error:`, e.message);
        return null;
    }
}

// ─── Duplikasyon kontrolü — aynı kişiye aynı kural belirli sürede tekrar gönderilmesin ──
// linkedStageId varsa, stage aksiyonları da kontrol edilir (çapraz dedup)
export async function wasAlreadyExecuted(workspaceId, ruleType, contactId, withinHours = 24, linkedStageId = null) {
    try {
        const since = new Date(Date.now() - withinHours * 60 * 60 * 1000);

        // 1. Kendi ruleType'ı ile çalıştı mı?
        const existing = await prisma.automationLog.findFirst({
            where: {
                workspaceId,
                ruleType,
                contactId,
                executedAt: { gte: since },
                result: 'SUCCESS'
            }
        });
        if (existing) return true;

        // 2. Bağlı aşama varsa → stage aksiyonları da çalıştı mı? (çapraz dedup)
        if (linkedStageId) {
            const stageLog = await prisma.automationLog.findFirst({
                where: {
                    workspaceId,
                    contactId,
                    ruleType: { startsWith: `STAGE_ACTION:${linkedStageId}:` },
                    executedAt: { gte: since },
                    result: 'SUCCESS'
                }
            });
            if (stageLog) {
                console.log(`⏭️ [RuleEngine] ${ruleType} → contact ${contactId} zaten stage aksiyonuyla yapıldı, skip`);
                return true;
            }
        }

        return false;
    } catch (e) {
        console.error(`${TAG} wasAlreadyExecuted error:`, e.message);
        return false;
    }
}

// ─── Çalışma logu kaydet ─────────────────────────────────────────
export async function logExecution(workspaceId, ruleType, contactId, result = 'SUCCESS', metadata = null) {
    try {
        await prisma.automationLog.create({
            data: {
                workspaceId,
                ruleType,
                contactId,
                result,
                metadata: metadata ? JSON.stringify(metadata) : null
            }
        });
    } catch (e) {
        console.error(`${TAG} logExecution error:`, e.message);
    }
}

// ─── WhatsApp şablon gönder (rule config'e göre) ─────────────────
async function sendTemplateFromConfig(workspaceId, contactId, config) {
    // Teslim tek kapıdan — kanal seçimi ve WhatsApp dışı kanallar orada
    const { deliverToContact } = await import('./automationDelivery.service.js');
    return deliverToContact(workspaceId, contactId, {
        templateId: config.templateId,
        channel: config.channel
    });
}

// ─── Mesaj gönder (rule config'e göre) ───────────────────────────
async function sendMessageFromConfig(workspaceId, contactId, config) {
    const { deliverToContact } = await import('./automationDelivery.service.js');
    return deliverToContact(workspaceId, contactId, {
        message: config.message,
        channel: config.channel
    });
}

// ─── Takıma bildirim gönder ──────────────────────────────────────
async function notifyTeam(workspaceId, config, payload) {
    const teamId = config?.teamId;
    if (!teamId) {
        // Tüm workspace'e yayınla
        emitToWorkspace(workspaceId, 'automation:notification', payload);
        return;
    }
    // Belirli takıma yayınla
    const teamMembers = await prisma.teamMember.findMany({
        where: { teamId },
        select: { userId: true }
    });
    for (const tm of teamMembers) {
        emitToWorkspace(workspaceId, 'automation:notification', { ...payload, userId: tm.userId });
    }

    // Kalıcı bildirim — socket yayını o an bağlı olmayan kullanıcıya ulaşmıyordu,
    // uyarı tamamen kayboluyordu.
    if (teamMembers.length > 0) {
        try {
            await prisma.notification.createMany({
                data: teamMembers.map(tm => ({
                    workspaceId,
                    userId: tm.userId,
                    type: 'AUTOMATION',
                    title: `🤖 ${payload.ruleType}`,
                    body: String(payload.message || 'Otomasyon tetiklendi').substring(0, 500),
                    data: JSON.stringify({ contactId: payload.contactId || null, ruleType: payload.ruleType })
                }))
            });
        } catch (e) {
            console.error(`${TAG} bildirim kaydı hatası:`, e.message);
        }
    }
}

// ─── Aktivite oluştur ────────────────────────────────────────────
async function createActivity(workspaceId, contactId, type, title, config = {}) {
    try {
        await prisma.contactActivity.create({
            data: {
                workspaceId,
                contactId,
                type,
                title,
                status: 'PLANNED',
                assignedToId: config.assignedToId || null,
                dueDate: config.dueDate || new Date(Date.now() + 24 * 60 * 60 * 1000) // yarın
            }
        });
        console.log(`📋 ${TAG} Activity created: "${title}" for contact ${contactId}`);
    } catch (e) {
        console.error(`${TAG} createActivity error:`, e.message);
    }
}

// ══════════════════════════════════════════════════════════════════
// ANA FONKSİYON — Kuralı kontrol et ve çalıştır
// ══════════════════════════════════════════════════════════════════
/**
 * @param {string} workspaceId
 * @param {string} ruleType - CALL_SUCCESS_NOTIFY, BIRTHDAY_GREETING, vs
 * @param {object} ctx - { contactId, conversationId, message, contact, ... }
 * @param {object} opts - { skipDuplicateCheck, duplicateHours }
 */
// ─── Tipe özel aksiyonlar ────────────────────────────────────────
// Bir tip burada ele alınıyorsa genel şablon/mesaj yoluna düşmez.
// null dönerse genel yol çalışır.
async function runTypeSpecificAction(workspaceId, ruleType, contactId, config, ctx) {
    switch (ruleType) {
        // Lead skorunu gerçekten hesapla
        case 'LEAD_SCORING': {
            try {
                const { updateLeadScore } = await import('./leadScoring.service.js');
                const score = await updateLeadScore(contactId);
                return { success: true, action: 'LEAD_SCORED', score: score?.score ?? score ?? null };
            } catch (e) {
                return { success: false, error: `Puanlama hatası: ${e.message}` };
            }
        }

        // Leadi gerçekten ata — takım üyeleri arasında round-robin
        case 'LEAD_AUTO_ASSIGN': {
            try {
                const conversation = await prisma.conversation.findFirst({
                    where: { contactId, workspaceId },
                    orderBy: { lastMessageAt: 'desc' },
                    select: { id: true, assignedToId: true }
                });
                if (!conversation) return { success: false, error: 'Atanacak konuşma yok' };
                if (conversation.assignedToId) {
                    return { success: true, action: 'ALREADY_ASSIGNED' };
                }

                // Aday havuzu: kural bir takım işaret ediyorsa o takımın üyeleri,
                // yoksa workspace'in temsilcileri
                let candidates = [];
                if (config.teamId) {
                    const members = await prisma.teamMember.findMany({
                        where: { teamId: config.teamId }, select: { userId: true }
                    });
                    candidates = members.map(m => m.userId);
                } else {
                    const members = await prisma.workspaceMember.findMany({
                        where: { workspaceId, role: { in: ['AGENT', 'MANAGER', 'ADMIN', 'OWNER'] } },
                        select: { userId: true }
                    });
                    candidates = members.map(m => m.userId);
                }
                if (candidates.length === 0) return { success: false, error: 'Atanacak kişi bulunamadı' };

                // Round-robin: en az açık konuşması olan kişiye ver
                const loads = await prisma.conversation.groupBy({
                    by: ['assignedToId'],
                    where: { workspaceId, assignedToId: { in: candidates }, status: { not: 'RESOLVED' } },
                    _count: true
                });
                const loadMap = new Map(loads.map(l => [l.assignedToId, l._count]));
                candidates.sort((a, b) => (loadMap.get(a) || 0) - (loadMap.get(b) || 0));
                const target = candidates[0];

                const { cascadeAssignment } = await import('./cascadeAssignment.service.js');
                await cascadeAssignment(conversation.id, workspaceId, {
                    assignedToId: target,
                    ...(config.teamId ? { assignedTeamId: config.teamId } : {}),
                    source: 'LEAD_AUTO_ASSIGN'
                });
                return { success: true, action: 'LEAD_ASSIGNED', assignedToId: target };
            } catch (e) {
                return { success: false, error: `Atama hatası: ${e.message}` };
            }
        }

        // Gerçek işletme konumunu gönder
        case 'SEND_LOCATION': {
            try {
                const ws = await prisma.workspace.findUnique({
                    where: { id: workspaceId },
                    select: { googleMapsUrl: true, companyAddress: true, companyName: true }
                });
                // Şube konumu varsa onu tercih et.
                //
                // DİKKAT: Şubeler İKİ ayrı yerde tutuluyor.
                //   1) WorkspaceRule / CLINIC_LOCATIONS JSON — Ayarlar >
                //      "Merkez ve Şubeler" ekranının yazdığı yer.
                //   2) appointment_branches tablosu — randevu akışının kullandığı.
                // Burası yalnız (2)'ye bakıyordu; kullanıcı ekrandan konum linki
                // girse bile bot göremiyordu. Önce ekranın yazdığı yere bakılır.
                let branch = null;
                try {
                    const locRule = await prisma.workspaceRule.findFirst({
                        where: { workspaceId, ruleType: 'CLINIC_LOCATIONS' },
                        select: { config: true }
                    });
                    const loclar = locRule?.config ? (JSON.parse(locRule.config).locations || []) : [];
                    branch = loclar.find(l => l.isActive !== false && l.googleMapsUrl) || null;
                } catch (_) { /* bozuk JSON: tabloya düşülür */ }

                if (!branch) {
                    branch = await prisma.appointmentBranch.findFirst({
                        where: { workspaceId, isActive: true, googleMapsUrl: { not: null } },
                        select: { name: true, address: true, googleMapsUrl: true },
                        orderBy: { order: 'asc' }
                    }).catch(() => null);
                }

                const mapsUrl = branch?.googleMapsUrl || ws?.googleMapsUrl || null;
                const address = branch?.address || ws?.companyAddress || null;
                if (!mapsUrl && !address) {
                    return { success: false, error: 'Konum tanımlı değil (şube/firma Google Maps adresi yok)' };
                }

                const parts = [];
                if (config.message) parts.push(config.message);
                if (address) parts.push(`📍 ${branch?.name ? branch.name + ' — ' : ''}${address}`);
                if (mapsUrl) parts.push(mapsUrl);

                const { deliverToContact } = await import('./automationDelivery.service.js');
                const res = await deliverToContact(workspaceId, contactId, {
                    message: parts.join('\n'), channel: config.channel
                });
                return { ...res, action: 'LOCATION_SENT' };
            } catch (e) {
                return { success: false, error: `Konum gönderim hatası: ${e.message}` };
            }
        }

        default:
            return null; // genel şablon/mesaj yolu
    }
}

export async function executeRule(workspaceId, ruleType, ctx = {}, opts = {}) {
    try {
        // 1. Config al (aktif değilse null döner)
        const config = await getRuleConfig(workspaceId, ruleType);
        if (!config) return null;

        const contactId = ctx.contactId;
        if (!contactId) {
            console.warn(`${TAG} executeRule(${ruleType}): contactId yok, skip`);
            return null;
        }

        // 2. Duplikasyon kontrolü (linkedStageId varsa stage aksiyonlarını da kontrol et)
        const dupHours = opts.duplicateHours || 24;
        if (!opts.skipDuplicateCheck) {
            const alreadyDone = await wasAlreadyExecuted(workspaceId, ruleType, contactId, dupHours, config._linkedStageId);
            if (alreadyDone) {
                console.log(`⏭️ ${TAG} ${ruleType} → contact ${contactId} zaten ${dupHours}h içinde çalıştı, skip`);
                return null;
            }
        }

        // 3. Aksiyonu çalıştır
        let result = { success: false };

        // 3a. Tipe özel aksiyonlar — adı iş vaat eden kurallar.
        // Daha önce bunlar da yalnızca şablon/mesaj gönderiyordu; "Otomatik
        // Lead Atama" atama yapmıyor, "Lead Puanlama" puanlamıyor, "Konum
        // Gönder" konum göndermiyordu.
        const special = await runTypeSpecificAction(workspaceId, ruleType, contactId, config, ctx);
        if (special) {
            result = special;
        }
        // Template gönderme
        else if (config.templateId) {
            result = await sendTemplateFromConfig(workspaceId, contactId, config);
        }
        // Mesaj gönderme
        else if (config.message) {
            result = await sendMessageFromConfig(workspaceId, contactId, config);
        }
        // Takım bildirimi
        else if (config.teamId && !config.templateId) {
            await notifyTeam(workspaceId, config, {
                ruleType,
                contactId,
                message: ctx.notificationMessage || `Otomasyon tetiklendi: ${ruleType}`,
                contact: ctx.contact || null
            });
            result = { success: true };
        }
        // Genel kural — sadece log ve bildirim
        else {
            console.log(`ℹ️ ${TAG} ${ruleType} aktif ama aksiyon config'i yok, log kaydediliyor`);
            result = { success: true, action: 'LOG_ONLY' };
        }

        // 4. Log kaydet
        await logExecution(workspaceId, ruleType, contactId, result.success ? 'SUCCESS' : 'FAILED', {
            ruleType,
            config,
            result,
            context: { conversationId: ctx.conversationId || null }
        });

        // 4b. Pazarlama kampanyasına da kaydet (drip/triggered/recurring kurallar)
        try {
            await writeToMarketingRecipient(workspaceId, ruleType, contactId, result, ctx);
        } catch (mrErr) {
            console.warn(`${TAG} writeToMarketingRecipient error:`, mrErr.message);
        }

        if (result.success) {
            console.log(`✅ ${TAG} ${ruleType} başarıyla çalıştı → contact ${contactId}`);
        }

        return result;
    } catch (error) {
        console.error(`❌ ${TAG} executeRule(${ruleType}) error:`, error.message);
        try {
            if (ctx.contactId) {
                await logExecution(workspaceId, ruleType, ctx.contactId, 'FAILED', { error: error.message });
            }
        } catch { /* ignore log error */ }
        return null;
    }
}

// ── Toplu kural çalıştırma (birden fazla kural aynı anda) ────────
export async function executeRules(workspaceId, ruleTypes, ctx = {}) {
    const results = {};
    for (const rt of ruleTypes) {
        results[rt] = await executeRule(workspaceId, rt, ctx);
    }
    return results;
}

// ── Tüm aktif kuralları getir ────────────────────────────────────
export async function getActiveRules(workspaceId, ruleTypes = []) {
    try {
        const where = { workspaceId, isActive: true };
        if (ruleTypes.length > 0) {
            where.ruleType = { in: ruleTypes };
        }
        const rules = await prisma.workspaceRule.findMany({ where });
        const result = {};
        for (const r of rules) {
            let config = {};
            try { config = r.config ? JSON.parse(r.config) : {}; } catch { config = {}; }
            config._linkedStageId = r.linkedStageId || null; // Bağlı aşama ID
            result[r.ruleType] = config;
        }
        return result;
    } catch (e) {
        console.error(`${TAG} getActiveRules error:`, e.message);
        return {};
    }
}
// ─── WorkspaceRule → MarketingCampaign Triggertype Eşleme ────────
const RULE_TO_TRIGGER = {
    'DRIP_DAY_0':             { triggerType: 'NEW_CONTACT', delayDays: 0 },
    'DRIP_DAY_1':             { triggerType: 'NEW_CONTACT', delayDays: 1 },
    'DRIP_DAY_3':             { triggerType: 'NEW_CONTACT', delayDays: 3 },
    'DRIP_DAY_7':             { triggerType: 'NEW_CONTACT', delayDays: 7 },
    'DRIP_DAY_14':            { triggerType: 'NEW_CONTACT', delayDays: 14 },
    'DRIP_DAY_30':            { triggerType: 'NEW_CONTACT', delayDays: 30 },
    'INACTIVE_REACTIVATION':  { triggerType: 'INACTIVE_DAYS', delayDays: 0 },
    'BIRTHDAY_GREETING':      { triggerType: 'BIRTHDAY', delayDays: 0 },
    'POSITIVE_LEAD_CAMPAIGN': { triggerType: 'HOT_LEAD', delayDays: 0 },
    'SATISFACTION_SURVEY':    { triggerType: 'POST_SALE', delayDays: 3 },
    'POST_SALE_FOLLOWUP':     { triggerType: 'POST_SALE', delayDays: 1 },
    'REFERRAL_REQUEST':       { triggerType: 'POST_SALE', delayDays: 7 },
};

/**
 * Otomasyon kuralı çalıştığında sonucu pazarlama kampanyasına da yazar.
 * Bu sayede Marketing modülünde otomasyon gönderimlerini de görebiliriz.
 * Ayrıca conversation.campaignId ve conversation.source'u set eder (attribution).
 */
async function writeToMarketingRecipient(workspaceId, ruleType, contactId, result, ctx) {
    const mapping = RULE_TO_TRIGGER[ruleType];
    if (!mapping || !result?.success) return; // Pazarlama kuralı değil veya başarısız

    // İlgili şablon kampanyayı bul
    const campaign = await prisma.marketingCampaign.findFirst({
        where: {
            workspaceId,
            isSystemTemplate: true,
            triggerType: mapping.triggerType,
            status: 'ACTIVE', // Sadece aktifleştirilmiş kampanyalar
        },
        include: {
            groups: {
                where: { delayDays: mapping.delayDays },
                take: 1
            }
        }
    });

    if (!campaign || campaign.groups.length === 0) return;

    const group = campaign.groups[0];

    // MarketingRecipient oluştur (duplikasyon kontrolü)
    const existingRecipient = await prisma.marketingRecipient.findFirst({
        where: {
            campaignId: campaign.id,
            groupId: group.id,
            contactId: contactId,
        }
    });

    if (!existingRecipient) {
        await prisma.marketingRecipient.create({
            data: {
                campaignId: campaign.id,
                groupId: group.id,
                contactId: contactId,
                status: 'SENT',
                sentAt: new Date(),
            }
        });

        // İstatistikleri güncelle
        await prisma.campaignGroup.update({
            where: { id: group.id },
            data: {
                totalCount: { increment: 1 },
                sentCount: { increment: 1 },
            }
        });
        await prisma.marketingCampaign.update({
            where: { id: campaign.id },
            data: {
                totalCount: { increment: 1 },
                sentCount: { increment: 1 },
            }
        });
    }

    // Attribution: Conversation'a campaignId ve source ata
    if (ctx.conversationId) {
        await prisma.conversation.update({
            where: { id: ctx.conversationId },
            data: {
                campaignId: campaign.id,
                source: 'MARKETING',
            }
        }).catch(() => {}); // Conversation bulunamazsa sessizce geç
    }
}

export default {
    isRuleActive,
    getRuleConfig,
    wasAlreadyExecuted,
    logExecution,
    executeRule,
    executeRules,
    getActiveRules
};
