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
    if (!config?.templateId) {
        console.warn(`${TAG} sendTemplate: templateId yok`);
        return { success: false, error: 'templateId eksik' };
    }

    const template = await prisma.whatsappTemplate.findFirst({
        where: { id: config.templateId, workspaceId }
    });
    if (!template) return { success: false, error: 'Template bulunamadı' };

    const contact = await prisma.contact.findUnique({ where: { id: contactId } });
    if (!contact?.phone) return { success: false, error: 'Telefon numarası yok' };

    // WhatsApp API ile gönder
    const whatsappPhone = await prisma.whatsappPhoneNumber.findFirst({
        where: { workspaceId, isActive: true }
    });
    if (!whatsappPhone) return { success: false, error: 'WhatsApp numarası bulunamadı' };

    try {
        const { sendWhatsappTemplate } = await import('../controllers/whatsapp.helpers.js');
        await sendWhatsappTemplate(whatsappPhone, contact.phone, template);
        console.log(`📨 ${TAG} Template "${template.name}" → ${contact.phone}`);
        return { success: true, templateName: template.name };
    } catch (err) {
        console.error(`${TAG} sendTemplate error:`, err.message);
        return { success: false, error: err.message };
    }
}

// ─── Mesaj gönder (rule config'e göre) ───────────────────────────
async function sendMessageFromConfig(workspaceId, contactId, config) {
    if (!config?.message) return { success: false, error: 'Mesaj içeriği yok' };

    const contact = await prisma.contact.findUnique({ where: { id: contactId } });
    if (!contact?.phone) return { success: false, error: 'Telefon numarası yok' };

    // WhatsApp session mesajı olarak gönder
    const conversation = await prisma.conversation.findFirst({
        where: { contactId, workspaceId, channel: 'WHATSAPP' },
        orderBy: { lastMessageAt: 'desc' }
    });
    if (!conversation) return { success: false, error: 'Conversation bulunamadı' };

    try {
        const { sendWhatsappTextMessage } = await import('../controllers/whatsapp.helpers.js');
        await sendWhatsappTextMessage(workspaceId, conversation, config.message);
        console.log(`💬 ${TAG} Message → ${contact.phone}: "${config.message.substring(0, 50)}..."`);
        return { success: true };
    } catch (err) {
        console.error(`${TAG} sendMessage error:`, err.message);
        return { success: false, error: err.message };
    }
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

        // Template gönderme
        if (config.templateId) {
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

export default {
    isRuleActive,
    getRuleConfig,
    wasAlreadyExecuted,
    logExecution,
    executeRule,
    executeRules,
    getActiveRules
};
