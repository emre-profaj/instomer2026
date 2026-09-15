import prisma from '../lib/prisma.js';
import { emitToWorkspace } from '../socket.js';
import { normalizePhone } from '../utils/phoneNormalizer.js';
import { createTeamNotifications, createNotification } from './notification.controller.js';
import { createAppointment, APPOINTMENT_SOURCE } from '../services/domain/appointment.domain.js';
import { invalidatePolicyCache } from '../services/policy/automationPolicy.service.js';

// ────────────────────────────────────────────────────────────────────────────
// SMART TIMING PARSER — Müşteri mesajlarından zamanlama tercihini algıla
// "yarın arar mısınız", "pazartesi", "haftaya", "2 gün sonra" gibi ifadeler
// ────────────────────────────────────────────────────────────────────────────
function parseCallTimingFromMessages(messagesText) {
    if (!messagesText) return null;
    const text = messagesText.toLowerCase();

    const now = new Date();
    const TR_OFFSET_H = 3; // Turkey UTC+3

    // Current Turkey local date/time
    const turkeyNow = new Date(now.getTime() + TR_OFFSET_H * 3600000);
    const currentYear = turkeyNow.getUTCFullYear();
    const currentDay = turkeyNow.getUTCDay(); // 0=Sun, 1=Mon, ...
    const currentHour = turkeyNow.getUTCHours();
    const currentMinute = turkeyNow.getUTCMinutes();

    // Helper: make UTC Date from Turkey local components
    const makeTRDate = (year, month, day, hour, minute = 0) => {
        return new Date(Date.UTC(year, month, day, hour - TR_OFFSET_H, minute, 0, 0));
    };

    // Helper: make date relative to today in Turkey
    const makeDate = (daysFromNow, hour, minute = 0) => {
        const targetTR = new Date(turkeyNow.getTime() + daysFromNow * 86400000);
        return makeTRDate(targetTR.getUTCFullYear(), targetTR.getUTCMonth(), targetTR.getUTCDate(), hour, minute);
    };

    // 1. Extract explicit hour & minute
    let explicitHour = null;
    let explicitMinute = 0;

    // Pattern A: '14:00', '14.30', 'saat 14:00', 'saat 14.30', '14:00te', '14:00 a', '14:00 da'
    const hmMatch = text.match(/(?:saat\s*)?([01]?\d|2[0-3])[.:]([0-5]\d)/i);
    if (hmMatch) {
        explicitHour = parseInt(hmMatch[1], 10);
        explicitMinute = parseInt(hmMatch[2], 10);
    } else {
        // Pattern B: 'saat 14', 'saat 2', 'saat 14 te', 'saat 14 e'
        const hMatch = text.match(/\bsaat\s*([01]?\d|2[0-3])\b/i);
        if (hMatch) {
            explicitHour = parseInt(hMatch[1], 10);
            explicitMinute = 0;
        } else {
            // Pattern C: '14 te', '14 teki', '14 de', '14 e', '14 a'
            const suffixMatch = text.match(/\b([01]?\d|2[0-3])\s*(?:'|’)?\s*(?:te|ta|de|da|ye|ya|e|a)\b/i);
            if (suffixMatch) {
                const val = parseInt(suffixMatch[1], 10);
                if (val >= 8 && val <= 22) { // realistic appointment hours
                    explicitHour = val;
                    explicitMinute = 0;
                }
            }
        }
    }

    // Default hours for times of day if no explicit hour given
    const getPeriodHour = () => {
        if (/sabah/.test(text)) return { hour: 9, min: 30 };
        if (/öğleden\s*sonra/.test(text)) return { hour: 14, min: 0 };
        if (/akşam/.test(text)) return { hour: 18, min: 0 };
        if (/öğle/.test(text)) return { hour: 12, min: 0 };
        return null;
    };

    const period = getPeriodHour();
    const finalHour = explicitHour !== null ? explicitHour : (period ? period.hour : null);
    const finalMinute = explicitHour !== null ? explicitMinute : (period ? period.min : 0);

    // 2. Determine Day / Date
    // 2a. Explicit Turkish month: '10 eylül', '15 ekim', etc.
    const monthNames = {
        'ocak': 0, 'şubat': 1, 'mart': 2, 'nisan': 3, 'mayıs': 4, 'haziran': 5,
        'temmuz': 6, 'ağustos': 7, 'eylül': 8, 'ekim': 9, 'kasım': 10, 'aralık': 11
    };
    const monthMatch = text.match(/(\d{1,2})\s*(ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık)/i);
    if (monthMatch) {
        const d = parseInt(monthMatch[1], 10);
        const m = monthNames[monthMatch[2].toLowerCase()];
        let y = currentYear;
        const candidate = makeTRDate(y, m, d, finalHour !== null ? finalHour : 10, finalMinute);
        if (candidate <= now) {
            y += 1;
        }
        return makeTRDate(y, m, d, finalHour !== null ? finalHour : 10, finalMinute);
    }

    // 2b. 'öbür gün' / 'ertesi gün' / 'yarından sonra'
    if (/öbür\s*gün|ertesi\s*gün|yarından\s*sonra/.test(text)) {
        return makeDate(2, finalHour !== null ? finalHour : 10, finalMinute);
    }

    // 2c. 'yarın'
    if (/yarın/.test(text)) {
        return makeDate(1, finalHour !== null ? finalHour : 10, finalMinute);
    }

    // 2d. 'bugün'
    if (/bugün/.test(text)) {
        if (finalHour !== null) {
            return makeDate(0, finalHour, finalMinute);
        }
        return makeDate(0, currentHour + 1, 0);
    }

    // 2e. Specific day names
    const dayNames = {
        'pazartesi': 1, 'salı': 2, 'çarşamba': 3, 'perşembe': 4,
        'cuma': 5, 'cumartesi': 6, 'pazar': 0
    };
    for (const [name, dayNum] of Object.entries(dayNames)) {
        if (text.includes(name)) {
            let daysUntil = dayNum - currentDay;
            if (daysUntil <= 0) daysUntil += 7;
            return makeDate(daysUntil, finalHour !== null ? finalHour : 10, finalMinute);
        }
    }

    // 2f. 'hafta sonu'
    if (/hafta\s*sonu/.test(text)) {
        let daysUntil = 6 - currentDay; // Saturday
        if (daysUntil <= 0) daysUntil += 7;
        return makeDate(daysUntil, finalHour !== null ? finalHour : 10, finalMinute);
    }

    // 2g. 'haftaya' / 'gelecek hafta'
    if (/haftaya|gelecek\s*hafta/.test(text)) {
        let daysUntilMon = 1 - currentDay;
        if (daysUntilMon <= 0) daysUntilMon += 7;
        return makeDate(daysUntilMon, finalHour !== null ? finalHour : 10, finalMinute);
    }

    // 2h. 'X gün sonra'
    const gunSonra = text.match(/(\d+)\s*gün\s*sonra/);
    if (gunSonra) {
        const days = parseInt(gunSonra[1], 10);
        if (days > 0 && days <= 30) return makeDate(days, finalHour !== null ? finalHour : 10, finalMinute);
    }

    // 2i. 'birkaç gün'
    if (/birka[cç]\s*gün/.test(text)) return makeDate(2, finalHour !== null ? finalHour : 10, finalMinute);

    // 2j. If explicit hour was found without day:
    if (explicitHour !== null) {
        if (explicitHour > currentHour || (explicitHour === currentHour && explicitMinute > currentMinute)) {
            return makeDate(0, explicitHour, explicitMinute);
        } else {
            return makeDate(1, explicitHour, explicitMinute);
        }
    }

    // 2k. Relative hours: 'X saat sonra'
    const saatSonra = text.match(/(\d+)\s*saat\s*sonra/);
    if (saatSonra) {
        const hours = parseInt(saatSonra[1], 10);
        if (hours > 0 && hours <= 48) return new Date(now.getTime() + hours * 3600000);
    }
    if (/bir\s*saat\s*sonra/.test(text)) return new Date(now.getTime() + 3600000);
    if (/birka[cç]\s*saat/.test(text)) return new Date(now.getTime() + 3 * 3600000);
    if (/daha\s*sonra|sonra\s*arayın|sonra\s*ara/.test(text)) {
        return new Date(now.getTime() + 2 * 3600000);
    }

    return null; // No timing preference found
}

// Default keyword list for HOT_KEYWORD rule
const DEFAULT_HOT_KEYWORDS = [
    'randevu planla',
    'randevu almak istiyorum',
    'beni ara',
    'beni arayın',
    'bilgi almak istiyorum',
    'fiyat öğrenmek istiyorum',
    'fiyat alabilir miyim',
    'görüşmek istiyorum',
    'toplantı',
    'ne zaman müsaitsiniz',
    'irtibata geçin',
    'iletişime geçin',
    'satın almak istiyorum',
    'sipariş vermek istiyorum'
];

// ============================================
// CRUD: Get / Upsert Rules
// ============================================

// Default rule definitions (shown even when DB has no entry yet)
const DEFAULT_RULES = [
    {
        ruleType: 'PHONE_CAPTURE',
        isActive: true,
        config: '{}'
    },
    {
        ruleType: 'HOT_KEYWORD',
        isActive: false,
        config: JSON.stringify({ keywords: DEFAULT_HOT_KEYWORDS })
    },
    {
        ruleType: 'HOT_OPPORT_EMAIL',
        isActive: false,
        config: JSON.stringify({ teamId: null, emailChannelId: null })
    },
    {
        ruleType: 'SALES_PHONE_CALL',
        isActive: true,
        config: JSON.stringify({ funnelName: 'Satış Akışı', teamId: null })
    },
    {
        ruleType: 'APPOINTMENT_AUTO_PLAN',
        isActive: true,
        config: JSON.stringify({ teamId: null })
    }
];


export const getRules = async (req, res) => {
    try {
        const { workspaceId } = req.params;

        const dbRules = await prisma.workspaceRule.findMany({
            where: { workspaceId },
            include: {
                linkedStage: {
                    select: { id: true, name: true, funnel: { select: { id: true, name: true } } }
                }
            }
        });

        // Merge DB rules with defaults so all always appear
        const rules = DEFAULT_RULES.map(def => {
            const dbRule = dbRules.find(r => r.ruleType === def.ruleType);
            if (dbRule) {
                return {
                    ...dbRule,
                    config: safeParseJSON(dbRule.config, {})
                };
            }
            return {
                id: null,
                workspaceId,
                ruleType: def.ruleType,
                isActive: def.isActive,
                config: safeParseJSON(def.config, {}),
                linkedStageId: null,
                linkedStage: null,
                createdAt: null,
                updatedAt: null
            };
        });

        // DB'de olan ama DEFAULT_RULES'da olmayan kuralları da ekle (universalDefaults'tan gelen)
        for (const dbRule of dbRules) {
            if (!rules.find(r => r.ruleType === dbRule.ruleType)) {
                rules.push({
                    ...dbRule,
                    config: safeParseJSON(dbRule.config, {})
                });
            }
        }

        res.json({ rules });
    } catch (error) {
        console.error('Get rules error:', error);
        res.status(500).json({ error: 'Kurallar yüklenirken hata oluştu' });
    }
};

export const upsertRule = async (req, res) => {
    try {
        const { workspaceId, ruleType } = req.params;
        const { isActive, config, linkedStageId } = req.body;

        // Expanded valid types — universalDefaults'tan gelen tipleri de kabul et
        const validTypes = [
            'PHONE_CAPTURE', 'HOT_KEYWORD', 'HOT_OPPORT_EMAIL', 'SALES_PHONE_CALL', 'APPOINTMENT_AUTO_PLAN',
            // universalDefaults kuralları
            'DRIP_DAY_0', 'DRIP_DAY_1', 'DRIP_DAY_3', 'DRIP_DAY_7', 'DRIP_DAY_14', 'DRIP_DAY_30',
            'APPOINTMENT_REMINDER', 'APPOINTMENT_CONFIRM', 'NO_SHOW_FOLLOWUP',
            'QUOTE_REMINDER', 'QUOTE_EXPIRY_NOTIFY',
            'POST_SALE_FOLLOWUP', 'SATISFACTION_SURVEY', 'REFERRAL_REQUEST',
            'BIRTHDAY_GREETING', 'CUSTOMER_1ST_YEAR',
            'INACTIVE_REACTIVATION', 'POSITIVE_LEAD_CAMPAIGN',
            'FIRST_RESPONSE_SLA', 'TASK_OVERDUE_ALERT', 'UNASSIGNED_TASK_ALERT',
            'DAILY_SUMMARY', 'TEAM_PERFORMANCE', 'PAYMENT_REMINDER', 'DOCUMENT_REQUEST',
            'CONTRACT_RENEWAL', 'UPSELL_SUGGEST', 'TICKET_CLOSE_NOTIFY',
            'HEALTH_APPOINTMENT_PREP', 'FIRST_PURCHASE_ANNIV', 'SPECIAL_DAY_CAMPAIGN',
            'CALL_SUCCESS_NOTIFY', 'CALL_FAILED_NOTIFY', 'CALL_RETRY', 'MISSED_CALL_NOTIFY', 'VOICE_MESSAGE_TRANSCRIBE',
            'APPOINTMENT_PLANNED_NOTIFY', 'APPOINTMENT_CANCEL_NOTIFY',
            'REQUEST_RECEIVED_NOTIFY', 'LEAD_WELCOME', 'LEAD_SCORING', 'LEAD_AUTO_ASSIGN', 'FUNNEL_STAGE_NOTIFY', 'NEW_LEAD_NOTIFY',
            'SEND_LOCATION', 'SEND_CATALOG', 'PRICE_AUTO_REPLY', 'FAQ_AUTO_REPLY', 'SEND_WORKING_HOURS',
            'COMPLAINT_ESCALATION', 'AFTER_HOURS_REPLY', 'VIP_CUSTOMER_ALERT'
        ];
        if (!validTypes.includes(ruleType)) {
            return res.status(400).json({ error: 'Geçersiz kural tipi' });
        }

        const existingRule = await prisma.workspaceRule.findFirst({
            where: {
                workspaceId,
                ruleType,
                linkedStageId: linkedStageId || null
            }
        });

        let rule;
        if (existingRule) {
            rule = await prisma.workspaceRule.update({
                where: { id: existingRule.id },
                data: {
                    ...(isActive !== undefined && { isActive }),
                    ...(config !== undefined && { config: JSON.stringify(config) }),
                    ...(linkedStageId !== undefined && { linkedStageId: linkedStageId || null })
                }
            });
        } else {
            rule = await prisma.workspaceRule.create({
                data: {
                    workspaceId,
                    ruleType,
                    isActive: isActive !== undefined ? isActive : false,
                    config: config ? JSON.stringify(config) : '{}',
                    ...(linkedStageId !== undefined && { linkedStageId: linkedStageId || null })
                }
            });
        }

        // Policy cache'i temizle — panelden yapılan değişiklik anında geçerli olsun
        invalidatePolicyCache(workspaceId, ruleType);

        res.json({
            rule: {
                ...rule,
                config: safeParseJSON(rule.config, {})
            }
        });

        // ── Auto-sync workspace AI fallback settings when SALES_PHONE_CALL config changes ──
        // NOT: retellAutoCallEnabled KASITLI OLARAK sync EDİLMİYOR
        // retellAutoCallEnabled → triggerAutoCall'ı aktive eder (mesaj gelince anında arar)
        // Biz sadece checkOverdueAgentCalls'daki HUMAN_TIMEOUT senaryosu için aiFallbackEnabled yeterli
        if (ruleType === 'SALES_PHONE_CALL' && config) {
            try {
                const wsUpdate = {};
                if (config.aiFallbackEnabled !== undefined) {
                    wsUpdate.aiFallbackEnabled = config.aiFallbackEnabled;
                    if (config.aiFallbackDelayMinutes) {
                        wsUpdate.aiFallbackDelayMinutes = config.aiFallbackDelayMinutes;
                    }
                }
                if (Object.keys(wsUpdate).length > 0) {
                    await prisma.workspace.update({
                        where: { id: workspaceId },
                        data: wsUpdate
                    });
                    console.log(`🔄 [SALES_PHONE_CALL] Workspace AI fallback synced:`, wsUpdate);
                }
            } catch (syncErr) {
                console.error('Workspace AI sync error (non-blocking):', syncErr.message);
            }
        }
    } catch (error) {
        console.error('Upsert rule error:', error);
        res.status(500).json({ error: 'Kural kaydedilemedi' });
    }
};

export const getRulesByStage = async (req, res) => {
    try {
        const { workspaceId, stageId } = req.params;

        const rules = await prisma.workspaceRule.findMany({
            where: { workspaceId, linkedStageId: stageId },
            include: {
                linkedStage: {
                    select: { id: true, name: true, funnel: { select: { id: true, name: true } } }
                }
            }
        });

        res.json({
            rules: rules.map(r => ({
                ...r,
                config: safeParseJSON(r.config, {})
            }))
        });
    } catch (error) {
        console.error('Get rules by stage error:', error);
        res.status(500).json({ error: 'Aşama kuralları yüklenirken hata oluştu' });
    }
};

// ============================================
// Rule Execution: Called from other controllers
// ============================================

/**
 * Rule 1 - PHONE_CAPTURE
 * If an incoming message contains a phone number AND the contact does not yet
 * have a phone number, update the contact (phone + category=OPPORTUNITY + tag "Fırsat")
 */
export const executePhoneCaptureRule = async (workspaceId, conversationId, messageContent) => {
    try {
        // Check if rule exists — if explicitly disabled, skip. If not in DB, proceed by default.
        const rule = await prisma.workspaceRule.findFirst({
            where: { workspaceId, ruleType: 'PHONE_CAPTURE' }
        });
        if (!rule || !rule.isActive) return;

        // Detect Turkish / international phone numbers in message
        // Supports: 05XX XXX XX XX, 05XXXXXXXXX, 0XXXXXXXXX (10-11 digits), +90...
        const phoneRegex = /(?:\+?90|0)?[\s\-\.]?5\d{2}[\s\-\.]?\d{3}[\s\-\.]?\d{2}[\s\-\.]?\d{2}/gi;
        // Also try a simpler pattern for fully concatenated numbers (e.g. 0561090832)
        const simplePhoneRegex = /(?:\+?90|0)5\d{8,9}/gi;
        const matches = messageContent.match(phoneRegex) || messageContent.match(simplePhoneRegex);
        if (!matches || matches.length === 0) return;

        // Get conversation + contact
        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
            include: { contact: true }
        });
        if (!conversation || !conversation.contact) return;

        // 🛡️ İş başvurusu olarak sınıflandırılmışsa Fırsat yapma
        if (conversation.classificationData) {
            try {
                const cls = JSON.parse(conversation.classificationData);
                if (cls.classification === 'IS_BASVURUSU') {
                    console.log(`ℹ️ [RULE:PHONE_CAPTURE] Skipping — conversation classified as IS_BASVURUSU`);
                    return;
                }
            } catch (_) { /* parse hatası, devam et */ }
        }

        const contact = conversation.contact;

        // Clean and normalize detected phone number (adds +90 prefix)
        const cleanPhone = normalizePhone(matches[0]);

        // Parse existing tags
        let tags = [];
        try { tags = JSON.parse(contact.tags || '[]'); } catch (_) { tags = []; }

        // Already has Sıcak Fırsat tag → skip
        if (tags.includes('Sıcak Fırsat')) return;

        // Add tag + update category
        if (!tags.includes('Fırsat')) tags.push('Fırsat');

        const updateData = {
            tags: JSON.stringify(tags),
            status: 'OPPORTUNITY',
            category: 'OPPORTUNITY'
        };

        // If contact has no phone yet → also save the detected number
        if (!contact.phone) {
            updateData.phone = cleanPhone;
        }

        await prisma.contact.update({
            where: { id: contact.id },
            data: updateData
        });

        console.log(`✅ [RULE:PHONE_CAPTURE] Contact ${contact.id} tagged as Fırsat (phone: ${cleanPhone})`);
    } catch (error) {
        console.error('❌ [RULE:PHONE_CAPTURE] Error:', error.message);
    }
};

/**
 * Rule 2 - HOT_KEYWORD
 * If incoming message contains a hot keyword, update contact to HOT_OPPORTUNITY + tag "Sıcak Fırsat"
 */
export const executeHotKeywordRule = async (workspaceId, conversationId, messageContent) => {
    try {
        // Check if rule is active
        const rule = await prisma.workspaceRule.findFirst({
            where: { workspaceId, ruleType: 'HOT_KEYWORD' }
        });
        if (!rule || !rule.isActive) return;

        const config = safeParseJSON(rule.config, {});
        const keywords = config.keywords || DEFAULT_HOT_KEYWORDS;

        const contentLower = messageContent.toLowerCase().trim();
        const matched = keywords.some(kw => contentLower.includes(kw.toLowerCase()));
        if (!matched) return;

        // Get conversation + contact
        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
            include: { contact: true }
        });
        if (!conversation || !conversation.contact) return;

        const contact = conversation.contact;

        // Parse existing tags
        let tags = [];
        try { tags = JSON.parse(contact.tags || '[]'); } catch (_) { tags = []; }

        // Already has Sıcak Fırsat tag → skip
        if (tags.includes('Sıcak Fırsat')) return;

        // Add tag
        if (!tags.includes('Sıcak Fırsat')) tags.push('Sıcak Fırsat');

        await prisma.contact.update({
            where: { id: contact.id },
            data: {
                tags: JSON.stringify(tags),
                status: 'HOT_OPPORTUNITY',
                category: 'HOT_OPPORTUNITY'
            }
        });

        console.log(`✅ [RULE:HOT_KEYWORD] Contact ${contact.id} tagged as Sıcak Fırsat`);

        // Also trigger the email rule if contact becomes HOT_OPPORTUNITY
        await executeHotOpportunityEmailRule(workspaceId, contact.id);
    } catch (error) {
        console.error('❌ [RULE:HOT_KEYWORD] Error:', error.message);
    }
};

/**
 * Rule 3 - HOT_OPPORT_EMAIL
 * When contact becomes HOT_OPPORTUNITY, send email to all members of the configured team
 */
export const executeHotOpportunityEmailRule = async (workspaceId, contactId) => {
    try {
        const rule = await prisma.workspaceRule.findFirst({
            where: { workspaceId, ruleType: 'HOT_OPPORT_EMAIL' }
        });
        if (!rule || !rule.isActive) return;

        const config = safeParseJSON(rule.config, {});
        const { teamId, emailChannelId } = config;

        if (!teamId || !emailChannelId) {
            console.log('ℹ️ [RULE:HOT_OPPORT_EMAIL] No team or email channel configured, skipping');
            return;
        }

        // Get team members (users only)
        const teamMembers = await prisma.teamMember.findMany({
            where: { teamId },
            include: {
                user: { select: { id: true, name: true, email: true } }
            }
        });

        const userEmails = teamMembers
            .filter(m => m.user && m.user.email)
            .map(m => ({ name: m.user.name, email: m.user.email }));

        if (userEmails.length === 0) {
            console.log('ℹ️ [RULE:HOT_OPPORT_EMAIL] No team members with emails found');
            return;
        }

        // Get contact details
        const contact = await prisma.contact.findUnique({
            where: { id: contactId }
        });
        if (!contact) return;

        // Send email to each team member
        const { sendEmailViaChannel } = await import('../services/emailSender.service.js');

        const subject = `🔥 Sıcak Fırsat: ${contact.name || contact.phone || 'Yeni Müşteri'}`;
        const body = `Merhaba,

Bir konuşma Sıcak Fırsat olarak işaretlendi. Lütfen en kısa sürede iletişime geçin.

Müşteri Bilgileri:
- Ad: ${contact.name || '-'}
- Telefon: ${contact.phone || '-'}
- E-posta: ${contact.email || '-'}

Bu e-posta Instomer otomasyonu tarafından gönderilmiştir.`;

        for (const member of userEmails) {
            try {
                await sendEmailViaChannel(emailChannelId, member.email, subject, body, { isHtml: false });
                console.log(`✅ [RULE:HOT_OPPORT_EMAIL] Email sent to ${member.email}`);
            } catch (emailErr) {
                console.error(`❌ [RULE:HOT_OPPORT_EMAIL] Failed to send to ${member.email}:`, emailErr.message);
            }
        }
    } catch (error) {
        console.error('❌ [RULE:HOT_OPPORT_EMAIL] Error:', error.message);
    }
};

// ============================================
// Helpers
// ============================================

function safeParseJSON(str, fallback) {
    try {
        return JSON.parse(str);
    } catch (_) {
        return fallback;
    }
}

// ============================================
// Rule 4 — SALES_PHONE_CALL
// ============================================
/**
 * Triggered when an incoming message contains a phone number AND
 * there is a recent "we'll call you" intent in conversation messages.
 * Actions:
 *   1. Move conversation to "Satış Akışı" funnel (first stage)
 *   2. Assign to sales team (round-robin)
 *   3. Create CALL activity (15 min from now, or customer-stated time)
 */
export const executeSalesPhoneCallRule = async (workspaceId, conversationId, messageContent) => {
    // DEPRECATED: Bu fonksiyon kaldırılacak. Aşama motoru + giriş aksiyonları aynı işi yapar.
    // TODO: executeSalesPhoneCallRule yerine changeFunnelStage() + stage entry actions kullanılacak.
    try {
        // 1. Check if rule is active
        const rule = await prisma.workspaceRule.findFirst({
            where: { workspaceId, ruleType: 'SALES_PHONE_CALL' }
        });
        if (!rule || !rule.isActive) return;

        const config = safeParseJSON(rule.config, {});
        const salesFunnelName = config.funnelName || 'Satış Akışı';

        // 1b. CRITICAL: Verify the LAST message is from the CUSTOMER, not outgoing/template
        // This prevents triggering on bulk/template messages that contain business phone numbers
        const lastMessage = await prisma.message.findFirst({
            where: { conversationId },
            orderBy: { createdAt: 'desc' },
            select: { isFromContact: true, messageType: true, content: true }
        });
        if (!lastMessage || !lastMessage.isFromContact) {
            console.log(`ℹ️ [RULE:SALES_PHONE_CALL] Last message is NOT from contact (outgoing/system), skipping`);
            return;
        }
        // Skip if last message is a template message
        if (lastMessage.messageType === 'TEMPLATE') {
            console.log(`ℹ️ [RULE:SALES_PHONE_CALL] Last message is a TEMPLATE, skipping`);
            return;
        }
        // Skip if message starts with [Şablon: — template prefix
        if (messageContent.startsWith('[Şablon:') || messageContent.startsWith('[Sablon:')) {
            console.log(`ℹ️ [RULE:SALES_PHONE_CALL] Message is a template (prefix), skipping`);
            return;
        }

        // 2. Detect phone number in incoming message
        // Supports: 05XX XXX XX XX, 05XXXXXXXXX, 0XXXXXXXXX (10-11 digits), +90...
        const phoneRegex = /(?:\+?90|0)?[\s\-\.]?5\d{2}[\s\-\.]?\d{3}[\s\-\.]?\d{2}[\s\-\.]?\d{2}/gi;
        const simplePhoneRegex2 = /(?:\+?90|0)5\d{8,9}/gi;
        if (!phoneRegex.test(messageContent) && !simplePhoneRegex2.test(messageContent)) return;

        // 3. Get conversation + contact EARLY (needed for status check)
        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
            include: { contact: true }
        });
        if (!conversation || !conversation.contact) return;

        // 3b. Check Marketing Consent for CALL
        if (conversation.contact.consentChannels) {
            try {
                const consent = JSON.parse(conversation.contact.consentChannels);
                if (consent.call === false) {
                    console.log(`ℹ️ [RULE:SALES_PHONE_CALL] Contact ${conversation.contact.id} has opted out of CALL marketing/tasks. Skipping call scheduling.`);
                    return;
                }
            } catch (e) {
                // Ignore parse errors, default is true
            }
        }

        // 4. Detect call intent in recent conversation messages (last 10)
        //    OR if contact is already an OPPORTUNITY → phone number alone is enough
        const isOpportunity = ['OPPORTUNITY', 'HOT_OPPORTUNITY'].includes(conversation.contact.status);
        const CALL_INTENT_KEYWORDS = [
            // Agent/bot side
            'arayalım', 'arayacağız', 'sizi arayalım', 'sizi arayacağız',
            'aranacaksınız', 'arayıp', 'sizi arayıp', 'geri arayacağız',
            'geri dönüş yapacağız', 'ekibimiz arayacak', 'uzman ekibimiz',
            // Customer side — natural speech patterns
            'beni arayın', 'beni arasın', 'beni ara', 'bana ulaşın', 'bana ulaşsın',
            'arar mısınız', 'arar misin', 'arayabilir mi', // covers "arayabilirmi", "arayabilir misiniz", "arayabilir mi"
            'numaranızı', 'numaramı', 'bu numaradan',
            'görüşmek için', 'görüşmek istiyorum', 'konuşmak istiyorum', 'konuşmak için',
            // Both sides (broad stems — covers geçsin, geçelim, geçecektir, geçeceğiz, geçebilir)
            'iletişime geç', 'irtibata geç',
            // Customer requesting contact
            'bana dönün', 'bana dönsün', 'geri dönün', 'geri dönsün',
            'bilgi verin', 'bilgi versin', 'bilgi alabilir miyim',
            'yetkili biri', 'yetkiliniz', 'danışman',
        ];
        const recentMessages = await prisma.message.findMany({
            where: { conversationId },
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: { content: true, messageType: true, isFromContact: true }
        });
        // Check call intent in BOTH customer AND agent messages, but NEVER in template messages
        // Template messages contain marketing copy like "iletişime geçin" which is NOT real call intent
        const hasCallIntent = recentMessages.some(msg => {
            if (msg.messageType === 'TEMPLATE') return false; // Skip template messages
            if ((msg.content || '').startsWith('[Şablon:')) return false; // Skip template prefix
            const lower = (msg.content || '').toLowerCase();
            return CALL_INTENT_KEYWORDS.some(kw => lower.includes(kw));
        });
        // Pass if: explicit call intent in messages OR contact is already an opportunity
        if (!hasCallIntent && !isOpportunity) {
            console.log(`ℹ️ [RULE:SALES_PHONE_CALL] No call intent and contact status is ${conversation.contact.status}, skipping`);
            return;
        }


        // 5. DO NOT MOVE FUNNEL STAGE. Just use current team!
        let salesTeamId = null;
        if (conversation.caseId) {
            const cse = await prisma.case.findUnique({ where: { id: conversation.caseId } });
            if (cse && cse.assignedTeamId) salesTeamId = cse.assignedTeamId;
        }
        if (!salesTeamId && conversation.teamIds) {
            try {
                const parsed = JSON.parse(conversation.teamIds);
                if (Array.isArray(parsed) && parsed.length > 0) salesTeamId = parsed[0];
            } catch (_) {}
        }
        
        console.log(`ℹ️ [RULE:PHONE_CALL] Creating call task in current stage. Team: ${salesTeamId}`);

        // FETCH AGENT SPECIFIC CONFIG
        let agentConfigOverrides = {};
        let aiFallbackTriggered = false; // We just pass this field to the Activity creation if fallbackToAi is explicitly false? Actually fallbackToAi goes into fallbackToAi field.
        let agentFallbackToAi = null;
        let agentFallbackDelay = null;
        
        try {
            // Find the agent assigned to this team
            let resolvedAgentId = null;
            if (salesTeamId) {
                const teamMember = await prisma.teamMember.findFirst({
                    where: { teamId: salesTeamId, retellAgentId: { not: null } }
                });
                resolvedAgentId = teamMember?.retellAgentId;
            }
            if (!resolvedAgentId) {
                const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { retellAgentId: true } });
                resolvedAgentId = ws?.retellAgentId;
            }
            
            if (resolvedAgentId) {
                const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { retellAutoCallTriggers: true } });
                const allAgentConfigs = ws?.retellAutoCallTriggers?.agentConfigs || {};
                const ac = allAgentConfigs[resolvedAgentId];
                if (ac) {
                    agentConfigOverrides = ac;
                    agentFallbackToAi = ac.fallbackToAi;
                    agentFallbackDelay = ac.fallbackDelayMinutes;
                    console.log(`ℹ️ [RULE:PHONE_CALL] Using custom config for AI Agent ${resolvedAgentId}: `, ac);
                }
            }
        } catch(e) {
            console.error('Error fetching agent specific config:', e);
        }

        // 10. Detect customer-stated time — önce saat aralığı (18:00-19:00), sonra tek saat (18:00)
        const allMessageContent = recentMessages.map(m => m.content || '').join(' ') + ' ' + messageContent;
        // Facebook Lead Ads'den gelen alt çizgili formatı normalize et: "18:00_-_19:00" → "18:00 - 19:00"
        const normalizedContent = allMessageContent.replace(/_/g, ' ');

        let dueDate;
        // 10a. Saat aralığı: "18:00-19:00", "18:00 - 19:00", "18.00-19.00"
        const rangeRegex = /(\d{1,2})[:.](\d{2})\s*[-–]\s*(\d{1,2})[:.](\d{2})/;
        const rangeMatch = normalizedContent.match(rangeRegex);
        if (rangeMatch) {
            const [, sH, sM] = rangeMatch.map((v, i) => i === 0 ? v : parseInt(v));
            if (sH >= 6 && sH <= 23) {
                const nowTR = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
                const nowMinutes = nowTR.getHours() * 60 + nowTR.getMinutes();
                const windowStartMin = sH * 60 + sM;
                if (nowMinutes < windowStartMin) {
                    // Pencere başlamadı → bugün o saate planla
                    dueDate = new Date();
                    dueDate.setUTCHours(sH - 3, sM, 0, 0); // TR = UTC+3
                } else {
                    // Pencere geçti → yarın o saate planla
                    dueDate = new Date();
                    dueDate.setDate(dueDate.getDate() + 1);
                    dueDate.setUTCHours(sH - 3, sM, 0, 0);
                }
                console.log(`⏰ [RULE:SALES_PHONE_CALL] Saat aralığı algılandı: ${rangeMatch[0]} → ${dueDate.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}`);
            }
        }

        // 10b. Tek saat: "18:00", "15.30" (aralık bulunamadıysa)
        if (!dueDate) {
            const timeRegex = /\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/;
            const timeMatch = normalizedContent.match(timeRegex);
            if (timeMatch) {
                const [, h, m] = timeMatch;
                const dt = new Date();
                dt.setHours(parseInt(h), parseInt(m), 0, 0);
                if (dt < new Date()) dt.setDate(dt.getDate() + 1); // tomorrow if past
                dueDate = dt;
                console.log(`⏰ [RULE:SALES_PHONE_CALL] Customer-stated time: ${h}:${m}`);
            }
        }

        // 10c. Ne aralık ne tek saat bulunamadıysa → default business hours
        if (!dueDate) {
            const fallbackMin = agentConfigOverrides.fallbackDelayMinutes;
            const isImmediate = fallbackMin === 0 || agentConfigOverrides.immediateCall === true;
            if (isImmediate) {
                dueDate = new Date();
                console.log(`⏰ [RULE:SALES_PHONE_CALL] Hemen arama (immediateCall / fallbackDelay=0) → dueDate: ${dueDate.toISOString()}`);
            } else {
                // Business hours check (Agent config > Rule config > defaults)
                const businessStart = agentConfigOverrides.businessHourStart ?? config.businessHourStart ?? 10;
                const businessEnd = agentConfigOverrides.businessHourEnd ?? config.businessHourEnd ?? 21;
                const now = new Date();
                const nowTR = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
                const hour = nowTR.getHours();
                if (hour >= businessStart && hour < businessEnd) {
                    // Within business hours → delay from config
                    const delayMin = fallbackMin ?? agentConfigOverrides.callDelayMinutes ?? config.callDelayMinutes ?? 15;
                    dueDate = new Date(now.getTime() + delayMin * 60 * 1000);
                } else {
                    // Outside business hours → next day at businessStart:15
                    dueDate = new Date(now);
                    dueDate.setDate(dueDate.getDate() + 1); // Her zaman yarın
                    dueDate.setUTCHours(businessStart - 3, 15, 0, 0); // TR = UTC+3
                }

                // 🚨 Güvenlik: dueDate her zaman gelecekte olmalı
                if (dueDate <= now) {
                    dueDate = new Date(now);
                    dueDate.setDate(dueDate.getDate() + 1);
                    dueDate.setUTCHours(businessStart - 3, 15, 0, 0);
                }
            }
        }

        // 11. Create CALL activity (in ContactActivity)
        // Atama mirası: Conversation kime atandıysa, arama da ona atansın
        const contact = conversation.contact;
        const inheritedAssigneeId = conversation.assignedToId || null;
        const inheritedCaseId = conversation.caseId || null;

        // ─── GUARD: Zaten PLANNED veya aktif bir arama görevi varsa tekrar oluşturma ──
        const existingPlannedCall = await prisma.contactActivity.findFirst({
            where: {
                workspaceId,
                contactId: contact.id,
                type: 'CALL',
                status: 'PLANNED'
            }
        });
        if (existingPlannedCall) {
            console.log(`ℹ️ [RULE:SALES_PHONE_CALL] Contact ${contact.id} already has a PLANNED call (${existingPlannedCall.id}), skipping`);
            return;
        }

        // ─── GUARD: Aktif retry zinciri varsa (PENDING ScheduledCall) tekrar oluşturma ──
        if (contact.phone) {
            const pendingRetry = await prisma.scheduledCall.findFirst({
                where: {
                    workspaceId,
                    toNumber: contact.phone.trim(),
                    status: 'PENDING'
                }
            });
            if (pendingRetry) {
                console.log(`🔄 [RULE:SALES_PHONE_CALL] Contact ${contact.id} has a pending scheduled call (${pendingRetry.id}), skipping`);
                return;
            }
        }

        // ─── GUARD: Dinamik cooldown — retrySteps toplam süresine göre ──
        let cooldownMinutes = 240; // varsayılan 4 saat
        try {
            const wsCooldown = await prisma.workspace.findUnique({
                where: { id: workspaceId },
                select: { retellAutoCallTriggers: true }
            });
            const agentConfigs = wsCooldown?.retellAutoCallTriggers?.agentConfigs || {};
            const allCooldowns = Object.values(agentConfigs)
                .filter(cfg => cfg?.retrySteps?.length > 0)
                .map(cfg => cfg.retrySteps.reduce((sum, step) => sum + (step.delay || 60), 0));
            if (allCooldowns.length > 0) {
                cooldownMinutes = Math.max(...allCooldowns);
            }
        } catch (_) {}

        const cooldownAgo = new Date(Date.now() - cooldownMinutes * 60 * 1000);
        const recentRetellCall = await prisma.contactActivity.findFirst({
            where: {
                workspaceId,
                contactId: contact.id,
                type: 'CALL',
                source: { in: ['RETELL', 'AI_CALL'] },
                status: { in: ['COMPLETED', 'CANCELLED'] },
                completedAt: { gte: cooldownAgo }
            }
        });
        if (recentRetellCall) {
            const cooldownLabel = cooldownMinutes >= 1440 ? `${Math.round(cooldownMinutes / 1440)} gün`
                : cooldownMinutes >= 60 ? `${Math.round(cooldownMinutes / 60)} saat`
                : `${cooldownMinutes} dk`;
            console.log(`ℹ️ [RULE:SALES_PHONE_CALL] Contact ${contact.id} was called within last ${cooldownLabel} (retrySteps cooldown), skipping`);
            return;
        }

        // ─── Cross-type dedup: son 5 dk içinde bu kişi için herhangi bir PLANNED aktivite varsa atla ──
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
        const recentActivity = await prisma.contactActivity.findFirst({
            where: {
                workspaceId,
                contactId: contact.id,
                status: 'PLANNED',
                createdAt: { gte: fiveMinAgo }
            }
        });
        if (recentActivity) {
            console.log(`ℹ️ [RULE:SALES_PHONE_CALL] Contact ${contact.id} already has a planned activity (${recentActivity.type}) from last 5 min, skipping`);
            return;
        }

        await prisma.contactActivity.create({
            data: {
                workspaceId,
                contactId: contact.id,
                type: 'CALL',
                title: 'Arama Planlandı (Otomatik)',
                description: `Telefon numarası tespit edildi. Otomatik arama planlandı.\nKişi: ${contact.name || contact.fullName || '-'}\nKonu: ${conversation.aiTopic || '-'}\nNumara: ${contact.phone || messageContent.match(phoneRegex)?.[0] || '-'}\nKaynak: ${conversation.channel || '-'}`,
                dueDate,
                status: 'PLANNED',
                teamId: salesTeamId || null,
                assignedToId: inheritedAssigneeId,
                aiAgentId: (resolvedAgentId && (agentConfigOverrides.fallbackDelayMinutes === 0 || agentConfigOverrides.immediateCall === true)) ? resolvedAgentId : undefined,
                source: 'AUTOMATION',
                fallbackToAi: agentFallbackToAi !== null ? agentFallbackToAi : true,
                fallbackDelayMinutes: agentFallbackDelay !== null ? agentFallbackDelay : (agentConfigOverrides.fallbackDelayMinutes ?? 15),
                ...(inheritedCaseId ? { caseId: inheritedCaseId } : {}),
                ...(inheritedAssigneeId ? {
                    assignedById: null,
                    assignedByType: 'SYSTEM',
                    assignedAt: new Date()
                } : {})
            }
        });
        console.log(`📞 [RULE:SALES_PHONE_CALL] CALL activity created → ${dueDate.toISOString()} for contact ${contact.id} (user: ${inheritedAssigneeId || 'HAVUZ'}, case: ${inheritedCaseId || 'YOK'})`);

        // 12. Emit socket update so inbox badges refresh instantly
        emitToWorkspace(workspaceId, 'conversation_updated', { conversationId });
        emitToWorkspace(workspaceId, 'activity_created', {
            conversationId,
            contactId: contact.id,
            type: 'CALL',
            status: 'PLANNED',
            dueDate: dueDate.toISOString(),
        });

        // 13. Send notification to team members
        const dueDateTR = dueDate.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        if (salesTeamId) {
            await createTeamNotifications(
                workspaceId,
                salesTeamId,
                'CALL',
                '📞 Yeni arama planlandı',
                `${contact.name || contact.phone || 'Müşteri'} için ${dueDateTR} tarihinde arama planlandı.`,
                { contactId: contact.id, conversationId, dueDate: dueDate.toISOString() }
            );
        }

    } catch (error) {
        console.error('❌ [RULE:SALES_PHONE_CALL] Error:', error.message);
    }
};

/**
 * Rule 4b — AUTO CALL PLANNING (simplified)
 * Creates a CALL activity for a contact that has a phone number.
 * Used for: Widget messages, pre-chat forms, and manually created contacts.
 * Unlike executeSalesPhoneCallRule, this does NOT require call intent in messages.
 */
// In-memory lock to prevent race condition (Prisma hook + leadgen handler both fire simultaneously)
if (!global._autoCallPlanningLocks) {
    global._autoCallPlanningLocks = new Map();
}

export const executeAutoCallPlanning = async (workspaceId, contactId, source = 'AUTOMATION') => {
    // Race-condition guard: Only one execution per contactId at a time
    const lockKey = `${workspaceId}:${contactId}`;
    if (global._autoCallPlanningLocks.has(lockKey)) {
        console.log(`⚠️ [RULE:AUTO_CALL] Lock active for ${contactId}, skipping duplicate call`);
        return;
    }
    global._autoCallPlanningLocks.set(lockKey, Date.now());
    // Auto-release lock after 30 seconds
    setTimeout(() => global._autoCallPlanningLocks.delete(lockKey), 30000);
    try {
        // SALES_PHONE_CALL config'inden team/funnel bilgisi al (varsa)
        const rule = await prisma.workspaceRule.findFirst({
            where: { workspaceId, ruleType: 'SALES_PHONE_CALL' }
        });
        if (!rule || !rule.isActive) {
            console.log(`ℹ️ [RULE:AUTO_CALL] Rule is disabled or missing for workspace ${workspaceId}`);
            return;
        }
        const config = rule ? safeParseJSON(rule.config, {}) : {};

        // 2. Get contact + latest conversation for context
        const contact = await prisma.contact.findUnique({
            where: { id: contactId }
        });
        if (!contact || !contact.phone || !contact.phone.trim()) return;

        // 2a. Check Marketing Consent for aiCall (auto call is AI)
        if (contact.consentChannels) {
            try {
                const consent = JSON.parse(contact.consentChannels);
                if (consent.aiCall === false) {
                    console.log(`ℹ️ [RULE:AUTO_CALL] Contact ${contact.id} has opted out of AI CALL marketing/tasks. Skipping auto call.`);
                    return;
                }
            } catch (e) {
                // Ignore
            }
        }

        // 2b. CRITICAL: Skip ONLY if last message is an outgoing TEMPLATE (bulk send protection)
        // Normal bot replies, agent messages etc. should NOT block auto-call
        const latestMsg = await prisma.message.findFirst({
            where: { conversation: { workspaceId, contactId } },
            orderBy: { createdAt: 'desc' },
            select: { isFromContact: true, messageType: true, content: true }
        });
        // Only block if last message is a template (toplu mesaj koruması)
        if (latestMsg && !latestMsg.isFromContact && 
            (latestMsg.messageType === 'TEMPLATE' || (latestMsg.content || '').startsWith('[Şablon:'))) {
            console.log(`ℹ️ [RULE:AUTO_CALL] Last message is outgoing TEMPLATE for contact ${contactId}, skipping`);
            return;
        }
        // Allow MANUEL, TELEFON_EKLENDI sources even without messages (yeni eklenen kişi)
        const MANUAL_SOURCES = ['MANUEL', 'TELEFON_EKLENDI', 'LEAD_FORM', 'WEB_FORM', 'FORM', 'FACEBOOK_LEAD', 'LEAD'];
        if (!latestMsg && !MANUAL_SOURCES.includes(source)) {
            console.log(`ℹ️ [RULE:AUTO_CALL] No messages and source=${source} for contact ${contactId}, skipping`);
            return;
        }

        // Get latest conversation for topic/channel info + atama mirası için assignedToId/caseId
        const latestConversation = await prisma.conversation.findFirst({
            where: { workspaceId, contactId },
            orderBy: { updatedAt: 'desc' },
            select: { aiTopic: true, channel: true, assignedToId: true, caseId: true }
        });

        // 3. Check if there's already a PLANNED call activity for this contact (avoid duplicates)
        const existingCall = await prisma.contactActivity.findFirst({
            where: {
                workspaceId,
                contactId,
                type: 'CALL',
                status: 'PLANNED'
            }
        });
        if (existingCall) {
            console.log(`ℹ️ [RULE:AUTO_CALL] Contact ${contactId} already has a planned call, skipping`);
            return;
        }

        // 3b. Anti-loop: Müşteri insan callback istemiş (HUMAN_REQUESTED) ise
        // bu görev tamamlanana kadar AI tekrar aramasın (zamandan bağımsız)
        const humanCallback = await prisma.contactActivity.findFirst({
            where: {
                workspaceId,
                contactId,
                type: 'CALL',
                source: 'HUMAN_REQUESTED',
                status: 'PLANNED'
            }
        });
        if (humanCallback) {
            console.log(`🚫 [RULE:AUTO_CALL] Contact ${contactId} has a pending human-requested callback (due: ${humanCallback.dueDate}) — AI call blocked`);
            return;
        }

        // 3c. Aktif retry zinciri kontrolü: Devam eden retry varsa yeni arama oluşturma
        const pendingRetryCall = await prisma.scheduledCall.findFirst({
            where: {
                workspaceId,
                toNumber: contact.phone.trim(),
                status: 'PENDING',
                parentCallId: { not: null }
            }
        });
        if (pendingRetryCall) {
            console.log(`🔄 [RULE:AUTO_CALL] Contact ${contactId} has an active retry chain (sc: ${pendingRetryCall.id}), skipping auto-call`);
            return;
        }

        // 3d. Dinamik cooldown: Agent kartındaki retrySteps toplam süresine göre cooldown uygula
        let cooldownMinutes = 240; // varsayılan 4 saat (retrySteps yoksa fallback)
        try {
            const wsCooldown = await prisma.workspace.findUnique({
                where: { id: workspaceId },
                select: { retellAutoCallTriggers: true }
            });
            const agentConfigs = wsCooldown?.retellAutoCallTriggers?.agentConfigs || {};
            // Tüm agent'ların retrySteps toplam sürelerinden en büyüğünü al
            const allCooldowns = Object.values(agentConfigs)
                .filter(cfg => cfg?.retrySteps?.length > 0)
                .map(cfg => cfg.retrySteps.reduce((sum, step) => sum + (step.delay || 60), 0));
            if (allCooldowns.length > 0) {
                cooldownMinutes = Math.max(...allCooldowns);
            }
        } catch (_) {}

        const cooldownAgo = new Date(Date.now() - cooldownMinutes * 60 * 1000);
        const recentRetellCall = await prisma.contactActivity.findFirst({
            where: {
                workspaceId,
                contactId,
                type: 'CALL',
                source: 'RETELL',
                status: 'COMPLETED',
                completedAt: { gte: cooldownAgo }
            }
        });
        if (recentRetellCall) {
            const cooldownLabel = cooldownMinutes >= 1440 ? `${Math.round(cooldownMinutes / 1440)} gün`
                : cooldownMinutes >= 60 ? `${Math.round(cooldownMinutes / 60)} saat`
                : `${cooldownMinutes} dk`;
            console.log(`ℹ️ [RULE:AUTO_CALL] Contact ${contactId} was called by Retell within last ${cooldownLabel} (retrySteps cooldown), skipping auto-call`);
            return;
        }

        // 4. Find team: Sohbetin takımı → SALES_PHONE_CALL config → ChannelRouting → varsayılan takım
        const salesFunnelName = config.funnelName || 'Satış Akışı';
        let salesTeamId = null;

        // 4a. ÖNCELİK 1: Sohbetin kendi assignedTeamId'si (zaten atanmış takım varsa onu kullan)
        const convWithTeam = await prisma.conversation.findFirst({
            where: { workspaceId, contactId },
            orderBy: { updatedAt: 'desc' },
            select: { assignedTeamId: true, teamIds: true, channel: true, assignedToId: true, caseId: true }
        });
        if (convWithTeam?.assignedTeamId) {
            salesTeamId = convWithTeam.assignedTeamId;
            console.log(`📋 [RULE:AUTO_CALL] Takım sohbetten bulundu (öncelikli): ${salesTeamId}`);
        }
        // teamIds JSON array'inden de kontrol et
        if (!salesTeamId && convWithTeam?.teamIds) {
            try {
                const teamIdsArr = JSON.parse(convWithTeam.teamIds);
                if (Array.isArray(teamIdsArr) && teamIdsArr.length > 0) {
                    salesTeamId = teamIdsArr[0];
                    console.log(`📋 [RULE:AUTO_CALL] Takım sohbet teamIds'den bulundu: ${salesTeamId}`);
                }
            } catch(e) {}
        }

        // 4b. SALES_PHONE_CALL config'den takım (sohbette takım yoksa)
        if (!salesTeamId && config.teamId) {
            salesTeamId = config.teamId;
        }
        if (!salesTeamId) {
            const salesFunnel = await prisma.funnel.findFirst({
                where: { workspaceId, name: { contains: salesFunnelName.split(' ')[0], mode: 'insensitive' } }
            });
            salesTeamId = salesFunnel?.assignedTeamId;
        }
        if (!salesTeamId) {
            const namedTeam = await prisma.team.findFirst({
                where: { workspaceId, name: { contains: 'satış', mode: 'insensitive' } }
            });
            salesTeamId = namedTeam?.id;
        }

        // 4c. ChannelRouting'den takım (kanal → takım eşleşmesi)
        if (!salesTeamId) {
            const channel = convWithTeam?.channel || latestConversation?.channel || source;
            if (channel) {
                const channelRouting = await prisma.channelRouting.findFirst({
                    where: { workspaceId, channel, isActive: true },
                    select: { teamId: true, team: { select: { name: true } } }
                });
                if (channelRouting?.teamId) {
                    salesTeamId = channelRouting.teamId;
                    console.log(`📋 [RULE:AUTO_CALL] Takım ChannelRouting'den bulundu: ${channelRouting.team?.name} (kanal: ${channel})`);
                }
            }
        }

        // 4d. Varsayılan takım (workspace'teki ilk takım)
        if (!salesTeamId) {
            const defaultTeam = await prisma.team.findFirst({
                where: { workspaceId },
                orderBy: { createdAt: 'asc' },
                select: { id: true, name: true }
            });
            if (defaultTeam) {
                salesTeamId = defaultTeam.id;
                console.log(`📋 [RULE:AUTO_CALL] Varsayılan takım: ${defaultTeam.name} (${defaultTeam.id})`);
            }
        }

        // 5. Atama mirası: Conversation/case kime atandıysa, arama da ona atansın
        // Atanmış kişi yoksa → havuza düşsün
        const inheritedAssigneeId = convWithTeam?.assignedToId || latestConversation?.assignedToId || null;
        const inheritedCaseId = convWithTeam?.caseId || latestConversation?.caseId || null;
        console.log(`📋 [RULE:AUTO_CALL] Arama atanacak: ${inheritedAssigneeId || 'HAVUZ'} (takım: ${salesTeamId || 'YOK'}, case: ${inheritedCaseId || 'YOK'})`);

        // 6. Calculate due date — first check customer messages for timing preference
        let dueDate;
        const now = new Date();
        let timingSource = 'DEFAULT';

        // 6a. For LEAD_FORM source, parse preferred call window from lead form message content
        //     e.g. "Sizi Ne Zaman Arayalım?: 15:00 - 18:00" or "15:00_-_18:00"
        if (source === 'LEAD_FORM' || source === 'LEAD') {
            try {
                const recentMsgs = await prisma.message.findMany({
                    where: {
                        conversation: { workspaceId, contactId },
                    },
                    orderBy: { createdAt: 'desc' },
                    take: 5,
                    select: { content: true }
                });
                const combinedText = recentMsgs.map(m => m.content || '').join(' ');
                // Normalize underscored Facebook Lead Ads format: "15:00_-_18:00" → "15:00 - 18:00"
                const normalizedText = combinedText.replace(/_/g, ' ');
                // Match time range pattern: "15:00 - 18:00", "15:00-18:00", "15.00 - 18.00"
                const rangeMatch = normalizedText.match(/(\d{1,2})[:.:](\d{2})\s*[-–]\s*(\d{1,2})[:.:](\d{2})/);
                if (rangeMatch) {
                    const [, sH, sM, eH, eM] = rangeMatch.map((v, i) => i === 0 ? v : parseInt(v));
                    if (sH >= 6 && eH > sH && eH <= 23) {
                        // Türkiye saatine göre şu anda pencere içinde mi kontrol et
                        const nowTR = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
                        const nowMinutes = nowTR.getHours() * 60 + nowTR.getMinutes();
                        const windowStartMin = sH * 60 + sM;
                        const windowEndMin = eH * 60 + eM;

                        if (nowMinutes < windowStartMin) {
                            // Pencere henüz başlamadı → bugün pencere başlangıcına planla
                            dueDate = new Date(now);
                            // Türkiye saatini UTC'ye çevir (UTC+3)
                            dueDate.setUTCHours(sH - 3, sM, 0, 0);
                            timingSource = 'LEAD_FORM_WINDOW';
                            console.log(`🕐 [RULE:AUTO_CALL] Lead form tercih penceresi: ${sH}:${String(sM).padStart(2,'0')}-${eH}:${String(eM).padStart(2,'0')} → bugün ${sH}:${String(sM).padStart(2,'0')}'e planlandı`);
                        } else if (nowMinutes < windowEndMin) {
                            // Pencere içindeyiz → 1 dk sonra planla
                            dueDate = new Date(now.getTime() + 60 * 1000);
                            timingSource = 'LEAD_FORM_WINDOW_NOW';
                            console.log(`🕐 [RULE:AUTO_CALL] Lead form tercih penceresi içindeyiz (${sH}:${String(sM).padStart(2,'0')}-${eH}:${String(eM).padStart(2,'0')}) → hemen aranacak`);
                        } else {
                            // Pencere geçti → yarın pencere başlangıcına planla
                            dueDate = new Date(now);
                            dueDate.setDate(dueDate.getDate() + 1);
                            dueDate.setUTCHours(sH - 3, sM, 0, 0);
                            timingSource = 'LEAD_FORM_WINDOW_TOMORROW';
                            console.log(`🕐 [RULE:AUTO_CALL] Lead form tercih penceresi geçti → yarın ${sH}:${String(sM).padStart(2,'0')}'e planlandı`);
                        }
                    }
                }
            } catch (err) {
                console.error('⚠️ [RULE:AUTO_CALL] Lead form window parse error (non-blocking):', err.message);
            }
        }

        // 6b. If no lead form window found, check customer messages for general timing
        if (!dueDate) {
            try {
                const recentMsgs = await prisma.message.findMany({
                    where: {
                        conversation: { workspaceId, contactId },
                        isFromContact: true,
                    },
                    orderBy: { createdAt: 'desc' },
                    take: 5,
                    select: { content: true }
                });
                const combinedText = recentMsgs.map(m => m.content || '').join(' ');
                const customerTiming = parseCallTimingFromMessages(combinedText);
                if (customerTiming) {
                    dueDate = customerTiming;
                    timingSource = 'CUSTOMER_PREFERENCE';
                    console.log(`🕐 [RULE:AUTO_CALL] Müşteri zamanlama tercihi algılandı: ${dueDate.toISOString()} (metin: "${combinedText.substring(0, 100)}")`);
                }
            } catch (err) {
                console.error('⚠️ [RULE:AUTO_CALL] Timing parse error (non-blocking):', err.message);
            }
        }

        // 6c. Fallback: default business hours delay
        if (!dueDate) {
            const nowTR = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
            const hour = nowTR.getHours();
            if (hour >= 10 && hour < 21) {
                const delayMin = config.callDelayMinutes || 15;
                dueDate = new Date(now.getTime() + delayMin * 60 * 1000);
            } else {
                // Mesai dışı → yarın 10:15 Türkiye saati
                dueDate = new Date(now);
                dueDate.setDate(dueDate.getDate() + 1); // Her zaman yarın
                dueDate.setUTCHours(10 - 3, 15, 0, 0); // 10:15 TR = 07:15 UTC
            }
        }

        // 🚨 Güvenlik: dueDate her zaman gelecekte olmalı
        if (dueDate <= now) {
            console.log(`⚠️ [RULE:AUTO_CALL] dueDate geçmişte (${dueDate.toISOString()}), yarın 10:15'e çekiliyor`);
            dueDate = new Date(now);
            dueDate.setDate(dueDate.getDate() + 1);
            dueDate.setUTCHours(10 - 3, 15, 0, 0);
        }

        // 7. Create CALL activity — atama mirası ile
        const teamLabel = salesTeamId ? salesTeamId : 'YOK';
        await prisma.contactActivity.create({
            data: {
                workspaceId,
                contactId,
                type: 'CALL',
                title: 'Arama Planlandı (Otomatik)',
                description: `Telefon numarası tespit edildi. Otomatik arama planlandı.\nKişi: ${contact.name || contact.fullName || '-'}\nKonu: ${latestConversation?.aiTopic || '-'}\nNumara: ${contact.phone}\nKaynak: ${source}${latestConversation?.channel ? ' (' + latestConversation.channel + ')' : ''}`,
                dueDate,
                status: 'PLANNED',
                teamId: salesTeamId || null,
                assignedToId: inheritedAssigneeId,
                source: 'AUTOMATION',
                fallbackToAi: config.aiFallbackEnabled ?? true,
                fallbackDelayMinutes: config.aiFallbackDelayMinutes ?? 15,
                aiFallbackTriggered: false,
                ...(inheritedCaseId ? { caseId: inheritedCaseId } : {}),
                ...(inheritedAssigneeId ? {
                    assignedById: null,
                    assignedByType: 'SYSTEM',
                    assignedAt: new Date()
                } : {})
            }
        });
        console.log(`📞 [RULE:AUTO_CALL] CALL activity created → ${dueDate.toISOString()} for contact ${contactId} (source: ${source}, timing: ${timingSource}, team: ${teamLabel}, user: ${inheritedAssigneeId || 'HAVUZ'})`);

        // 8. Emit socket events
        emitToWorkspace(workspaceId, 'activity_created', {
            contactId,
            type: 'CALL',
            status: 'PLANNED',
            dueDate: dueDate.toISOString(),
        });

        // 9. Send notification to team members
        const dueDateTR = dueDate.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        if (salesTeamId) {
            await createTeamNotifications(
                workspaceId,
                salesTeamId,
                'CALL',
                '📞 Yeni arama planlandı',
                `${contact.name || contact.phone || 'Müşteri'} için ${dueDateTR} tarihinde arama planlandı.`,
                { contactId, dueDate: dueDate.toISOString() }
            );
        }

    } catch (error) {
        console.error('❌ [RULE:AUTO_CALL] Error:', error.message);
    }
};

// ============================================
// Rule 5 — APPOINTMENT_AUTO_PLAN
// ============================================
/**
 * Triggered when appointment intent is detected in a conversation.
 * Creates an APPOINTMENT activity for the contact.
 * Sources: AI response detection, Retell call result, form submission with "randevu" topic.
 */
const APPOINTMENT_INTENT_KEYWORDS = [
    'randevu', 'randevu almak', 'randevu istiyorum', 'randevu planla',
    'randevu ayarla', 'randevumu', 'randevu oluştur',
    'görüşme ayarla', 'görüşme planla', 'görüşmek istiyorum',
    'ne zaman müsaitsiniz', 'ne zaman gelebilirim', 'ne zaman uygun',
    'ziyaret etmek', 'gelip görmek', 'gelip bakabilir miyim',
    'toplantı ayarla', 'toplantı planla',
    'appointment', 'meeting',
    'hangi gün uygun', 'müsait misiniz',
    'gelmek istiyorum', 'uğramak istiyorum',
];

if (!global._appointmentPlanningLocks) {
    global._appointmentPlanningLocks = new Map();
}

export const executeAppointmentPlanning = async (workspaceId, contactId, source = 'AUTOMATION', appointmentDetails = null, incomingMessageText = null) => {
    // Race-condition guard
    const lockKey = `${workspaceId}:${contactId}`;
    if (global._appointmentPlanningLocks.has(lockKey)) {
        console.log(`⚠️ [RULE:APPOINTMENT] Lock active for ${contactId}, skipping`);
        return;
    }
    global._appointmentPlanningLocks.set(lockKey, Date.now());
    setTimeout(() => global._appointmentPlanningLocks.delete(lockKey), 30000);

    try {
        // 1. Check if rule is active
        const rule = await prisma.workspaceRule.findFirst({
            where: { workspaceId, ruleType: 'APPOINTMENT_AUTO_PLAN' }
        });
        if (!rule || !rule.isActive) {
            console.log(`ℹ️ [RULE:APPOINTMENT] Rule is disabled or missing for workspace ${workspaceId}`);
            return;
        }
        const config = rule ? safeParseJSON(rule.config, {}) : {};

        // 2. Get contact
        const contact = await prisma.contact.findUnique({
            where: { id: contactId }
        });
        if (!contact) return;

        // 3. Cross-type dedup: son 5 dk içinde bu kişi için herhangi bir PLANNED aktivite veya randevu varsa atla
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
        const [existingActivity, existingAppt] = await Promise.all([
            prisma.contactActivity.findFirst({
                where: {
                    workspaceId,
                    contactId,
                    status: 'PLANNED',
                    createdAt: { gte: fiveMinAgo }
                }
            }),
            prisma.appointment.findFirst({
                where: {
                    workspaceId,
                    contactId,
                    createdAt: { gte: fiveMinAgo }
                }
            })
        ]);
        if (existingActivity || existingAppt) {
            console.log(`ℹ️ [RULE:APPOINTMENT] Contact ${contactId} already has a planned activity or appointment from last 5 min, skipping`);
            return;
        }

        // 4. Get latest conversation for context + assignment inheritance
        const latestConversation = await prisma.conversation.findFirst({
            where: { workspaceId, contactId },
            orderBy: { updatedAt: 'desc' },
            select: { id: true, aiTopic: true, channel: true, assignedToId: true, assignedTeamId: true, teamIds: true, caseId: true }
        });

        // 5. Detect appointment intent in recent messages (if not explicitly triggered)
        if (!appointmentDetails) {
            const recentMessages = await prisma.message.findMany({
                where: { conversation: { workspaceId, contactId } },
                orderBy: { createdAt: 'desc' },
                take: 15,
                select: { content: true, isFromContact: true, messageType: true }
            });

            const hasAppointmentIntent = (incomingMessageText && APPOINTMENT_INTENT_KEYWORDS.some(kw => incomingMessageText.toLowerCase().includes(kw))) ||
                recentMessages.some(msg => {
                    if (msg.messageType === 'TEMPLATE') return false;
                    const lower = (msg.content || '').toLowerCase();
                    return APPOINTMENT_INTENT_KEYWORDS.some(kw => lower.includes(kw));
                });

            if (!hasAppointmentIntent) {
                console.log(`ℹ️ [RULE:APPOINTMENT] No appointment intent detected for contact ${contactId}, skipping`);
                return;
            }
        }

        // 6. Find team: conversation team → config team → 'Randevu' team → default
        let teamId = null;

        // 6a. Conversation team
        if (latestConversation?.assignedTeamId) {
            teamId = latestConversation.assignedTeamId;
        }
        if (!teamId && latestConversation?.teamIds) {
            try {
                const arr = JSON.parse(latestConversation.teamIds);
                if (Array.isArray(arr) && arr.length > 0) teamId = arr[0];
            } catch(e) {}
        }

        // 6b. Config team
        if (!teamId && config.teamId) {
            teamId = config.teamId;
        }

        // 6c. 'Randevu' named team
        if (!teamId) {
            const randevuTeam = await prisma.team.findFirst({
                where: { workspaceId, name: { contains: 'randevu', mode: 'insensitive' } }
            });
            teamId = randevuTeam?.id;
        }

        // 6d. Default team
        if (!teamId) {
            const defaultTeam = await prisma.team.findFirst({
                where: { workspaceId },
                orderBy: { createdAt: 'asc' },
                select: { id: true }
            });
            teamId = defaultTeam?.id;
        }

        // 7. Assignment inheritance
        const inheritedAssigneeId = latestConversation?.assignedToId || null;
        const inheritedCaseId = latestConversation?.caseId || null;

        // 8. Calculate due date from appointmentDetails or messages
        let dueDate;
        const now = new Date();

        if (appointmentDetails?.dateTime) {
            dueDate = new Date(appointmentDetails.dateTime);
        } else {
            // Try to parse timing from messages
            try {
                let combinedText = incomingMessageText ? incomingMessageText + ' ' : '';
                const recentMsgs = await prisma.message.findMany({
                    where: { conversation: { workspaceId, contactId }, isFromContact: true },
                    orderBy: { createdAt: 'desc' },
                    take: 10,
                    select: { content: true }
                });
                combinedText += recentMsgs.map(m => m.content || '').join(' ');
                const customerTiming = parseCallTimingFromMessages(combinedText);
                if (customerTiming) {
                    dueDate = customerTiming;
                    console.log(`🕐 [RULE:APPOINTMENT] Customer timing preference: ${dueDate.toISOString()} (TR: ${dueDate.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })})`);
                }
            } catch (err) {
                console.error('⚠️ [RULE:APPOINTMENT] Timing parse error:', err.message);
            }
        }

        // Fallback: next business day 10:00
        if (!dueDate) {
            const nowTR = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
            const hour = nowTR.getHours();
            if (hour >= 9 && hour < 18) {
                // Business hours — 1 hour from now
                dueDate = new Date(now.getTime() + 60 * 60 * 1000);
            } else {
                // After hours — next day 10:00
                dueDate = new Date(now);
                dueDate.setDate(dueDate.getDate() + 1);
                dueDate.setUTCHours(10 - 3, 0, 0, 0); // 10:00 TR = 07:00 UTC
            }
        }

        // Safety: dueDate must be in the future
        if (dueDate <= now) {
            dueDate = new Date(now);
            dueDate.setDate(dueDate.getDate() + 1);
            dueDate.setUTCHours(10 - 3, 0, 0, 0);
        }

        // 9. Build description
        const topicText = appointmentDetails?.topic || latestConversation?.aiTopic || '-';
        const description = `Randevu talebi algılandı. Otomatik randevu görevi oluşturuldu.\nKişi: ${contact.name || contact.fullName || '-'}\nKonu: ${topicText}\nTelefon: ${contact.phone || '-'}\nKaynak: ${source}${latestConversation?.channel ? ' (' + latestConversation.channel + ')' : ''}`;

        // 10. Create APPOINTMENT activity
        await prisma.contactActivity.create({
            data: {
                workspaceId,
                contactId,
                type: 'APPOINTMENT',
                title: appointmentDetails?.title || 'Randevu Planlandı (Otomatik)',
                description,
                dueDate,
                status: 'PLANNED',
                teamId: teamId || null,
                assignedToId: inheritedAssigneeId,
                source: 'AUTOMATION',
                ...(inheritedCaseId ? { caseId: inheritedCaseId } : {}),
                ...(inheritedAssigneeId ? {
                    assignedById: null,
                    assignedByType: 'SYSTEM',
                    assignedAt: new Date()
                } : {})
            }
        });
        console.log(`📅 [RULE:APPOINTMENT] APPOINTMENT activity created → ${dueDate.toISOString()} for contact ${contactId} (source: ${source}, team: ${teamId || 'YOK'}, user: ${inheritedAssigneeId || 'HAVUZ'})`);

        // 10b. Takvim randevusu — TEK KAPI üzerinden
        // (izin kapısı zaten yukarıda kontrol edildi, ama domain katmanı da
        //  bağımsız olarak doğrular; çakışma + google sync + socket orada.)
        try {
            const endApptTime = new Date(dueDate.getTime() + 30 * 60 * 1000);
            const apptOutcome = await createAppointment({
                workspaceId,
                source: APPOINTMENT_SOURCE.RULE,
                title: appointmentDetails?.title || `Randevu — ${contact.name || contact.fullName || contact.phone || 'Müşteri'}`,
                description,
                startTime: dueDate,
                endTime: endApptTime,
                contactId,
                contactName: contact.name || contact.fullName || '',
                contactPhone: contact.phone || '',
                contactEmail: contact.email || null,
                assignedToId: inheritedAssigneeId || null,
                createdById: inheritedAssigneeId || 'system',
                conversationId: latestConversation?.id || null,
                notes: `Otomasyon (APPOINTMENT_AUTO_PLAN) tarafından planlandı.`,
            });
            if (!apptOutcome.ok) {
                console.warn(`⚠️ [RULE:APPOINTMENT] Takvim randevusu oluşturulamadı (${apptOutcome.result}): ${apptOutcome.message || ''}`);
            }
        } catch (calApptErr) {
            console.error('⚠️ [RULE:APPOINTMENT] Calendar appointment creation error:', calApptErr.message);
        }

        // 11. Emit socket events
        emitToWorkspace(workspaceId, 'activity_created', {
            contactId,
            type: 'APPOINTMENT',
            status: 'PLANNED',
            dueDate: dueDate.toISOString(),
        });

        // 12. Send notification to team
        const dueDateTR = dueDate.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        if (teamId) {
            await createTeamNotifications(
                workspaceId,
                teamId,
                'APPOINTMENT',
                '📅 Yeni randevu talebi',
                `${contact.name || contact.phone || 'Müşteri'} için ${dueDateTR} tarihinde randevu planlandı.`,
                { contactId, dueDate: dueDate.toISOString() }
            );
        }

    } catch (error) {
        console.error('❌ [RULE:APPOINTMENT] Error:', error.message);
    }
};
