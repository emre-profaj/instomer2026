import prisma from '../lib/prisma.js';
import { emitToWorkspace } from '../socket.js';
import { normalizePhone } from '../utils/phoneNormalizer.js';

// ────────────────────────────────────────────────────────────────────────────
// SMART TIMING PARSER — Müşteri mesajlarından zamanlama tercihini algıla
// "yarın arar mısınız", "pazartesi", "haftaya", "2 gün sonra" gibi ifadeler
// ────────────────────────────────────────────────────────────────────────────
function parseCallTimingFromMessages(messagesText) {
    if (!messagesText) return null;
    const text = messagesText.toLowerCase().replace(/[?!.,]/g, ' ');

    const now = new Date();
    const TR_OFFSET_H = 3; // Turkey UTC+3

    // Helper: Turkey local hour right now
    const turkeyNow = new Date(now.getTime() + TR_OFFSET_H * 3600000);
    const turkeyHour = turkeyNow.getUTCHours();
    const turkeyDay = turkeyNow.getUTCDay(); // 0=Sun

    // Helper: create UTC date from Turkey-local day offset + hour
    const makeDate = (daysFromNow, hour, minute = 0) => {
        const d = new Date(now);
        d.setDate(d.getDate() + daysFromNow);
        d.setUTCHours(hour - TR_OFFSET_H, minute, 0, 0);
        // Ensure we don't schedule in the past
        if (d <= now) d.setDate(d.getDate() + 1);
        return d;
    };

    // ── "yarın" (tomorrow) ──
    if (/yarın/.test(text)) {
        if (/sabah/.test(text)) return makeDate(1, 9, 30);
        if (/öğleden\s*sonra/.test(text)) return makeDate(1, 14, 0);
        if (/akşam/.test(text)) return makeDate(1, 18, 0);
        if (/öğle/.test(text)) return makeDate(1, 12, 0);
        return makeDate(1, 10, 0); // Default: yarın 10:00
    }

    // ── "bugün" + time of day ──
    if (/bugün/.test(text)) {
        if (/akşam/.test(text)) return makeDate(0, 18, 0);
        if (/öğleden\s*sonra/.test(text)) return makeDate(0, 14, 0);
        if (/öğle/.test(text)) return makeDate(0, 12, 0);
        return makeDate(0, turkeyHour + 1, 0); // +1 saat
    }

    // ── Specific day names ──
    const dayNames = {
        'pazartesi': 1, 'salı': 2, 'çarşamba': 3, 'perşembe': 4,
        'cuma': 5, 'cumartesi': 6, 'pazar': 0
    };
    for (const [name, dayNum] of Object.entries(dayNames)) {
        if (text.includes(name)) {
            let daysUntil = dayNum - turkeyDay;
            if (daysUntil <= 0) daysUntil += 7;
            return makeDate(daysUntil, 10, 0);
        }
    }

    // ── "hafta sonu" (weekend) ──
    if (/hafta\s*sonu/.test(text)) {
        let daysUntil = 6 - turkeyDay; // Saturday
        if (daysUntil <= 0) daysUntil += 7;
        return makeDate(daysUntil, 10, 0);
    }

    // ── "haftaya" / "gelecek hafta" (next week) ──
    if (/haftaya|gelecek\s*hafta/.test(text)) {
        let daysUntilMon = 1 - turkeyDay;
        if (daysUntilMon <= 0) daysUntilMon += 7;
        return makeDate(daysUntilMon, 10, 0);
    }

    // ── "X gün sonra" ──
    const gunSonra = text.match(/(\d+)\s*gün\s*sonra/);
    if (gunSonra) {
        const days = parseInt(gunSonra[1]);
        if (days > 0 && days <= 30) return makeDate(days, 10, 0);
    }

    // ── "bir kaç gün" / "birkaç gün" ──
    if (/birka[cç]\s*gün/.test(text)) return makeDate(2, 10, 0);

    // ── "X saat sonra" ──
    const saatSonra = text.match(/(\d+)\s*saat\s*sonra/);
    if (saatSonra) {
        const hours = parseInt(saatSonra[1]);
        if (hours > 0 && hours <= 48) return new Date(now.getTime() + hours * 3600000);
    }

    // ── "bir saat sonra" / "birkaç saat sonra" ──
    if (/bir\s*saat\s*sonra/.test(text)) return new Date(now.getTime() + 3600000);
    if (/birka[cç]\s*saat/.test(text)) return new Date(now.getTime() + 3 * 3600000);

    // ── "sonra" / "daha sonra" (generic later — give 2 hours) ──
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
        isActive: false,
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
        isActive: false,
        config: JSON.stringify({ funnelName: 'Satış Akışı', teamId: null })
    }
];

export const getRules = async (req, res) => {
    try {
        const { workspaceId } = req.params;

        const dbRules = await prisma.workspaceRule.findMany({
            where: { workspaceId }
        });

        // Merge DB rules with defaults so all 3 always appear
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
                createdAt: null,
                updatedAt: null
            };
        });

        res.json({ rules });
    } catch (error) {
        console.error('Get rules error:', error);
        res.status(500).json({ error: 'Kurallar yüklenirken hata oluştu' });
    }
};

export const upsertRule = async (req, res) => {
    try {
        const { workspaceId, ruleType } = req.params;
        const { isActive, config } = req.body;

        const validTypes = ['PHONE_CAPTURE', 'HOT_KEYWORD', 'HOT_OPPORT_EMAIL', 'SALES_PHONE_CALL'];
        if (!validTypes.includes(ruleType)) {
            return res.status(400).json({ error: 'Geçersiz kural tipi' });
        }

        const rule = await prisma.workspaceRule.upsert({
            where: {
                workspaceId_ruleType: { workspaceId, ruleType }
            },
            create: {
                workspaceId,
                ruleType,
                isActive: isActive !== undefined ? isActive : false,
                config: config ? JSON.stringify(config) : '{}'
            },
            update: {
                ...(isActive !== undefined && { isActive }),
                ...(config !== undefined && { config: JSON.stringify(config) })
            }
        });

        res.json({
            rule: {
                ...rule,
                config: safeParseJSON(rule.config, {})
            }
        });
    } catch (error) {
        console.error('Upsert rule error:', error);
        res.status(500).json({ error: 'Kural kaydedilemedi' });
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
        const rule = await prisma.workspaceRule.findUnique({
            where: { workspaceId_ruleType: { workspaceId, ruleType: 'PHONE_CAPTURE' } }
        });
        if (rule && !rule.isActive) return;

        // Detect Turkish / international phone numbers in message
        const phoneRegex = /(?:\+?90|0)?[\s\-\.]?5\d{2}[\s\-\.]?\d{3}[\s\-\.]?\d{2}[\s\-\.]?\d{2}/gi;
        const matches = messageContent.match(phoneRegex);
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
        tags.push('Fırsat');

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
        const rule = await prisma.workspaceRule.findUnique({
            where: { workspaceId_ruleType: { workspaceId, ruleType: 'HOT_KEYWORD' } }
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
        const rule = await prisma.workspaceRule.findUnique({
            where: { workspaceId_ruleType: { workspaceId, ruleType: 'HOT_OPPORT_EMAIL' } }
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
    try {
        // 1. Check if rule is active
        const rule = await prisma.workspaceRule.findUnique({
            where: { workspaceId_ruleType: { workspaceId, ruleType: 'SALES_PHONE_CALL' } }
        });
        if (!rule || !rule.isActive) return;

        const config = safeParseJSON(rule.config, {});
        const salesFunnelName = config.funnelName || 'Satış Akışı';

        // 2. Detect phone number in incoming message
        const phoneRegex = /(?:\+?90|0)?[\s\-\.]?5\d{2}[\s\-\.]?\d{3}[\s\-\.]?\d{2}[\s\-\.]?\d{2}/gi;
        if (!phoneRegex.test(messageContent)) return;

        // 3. Get conversation + contact EARLY (needed for status check)
        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
            include: { contact: true }
        });
        if (!conversation || !conversation.contact) return;

        // 4. Detect call intent in recent conversation messages (last 10)
        //    OR if contact is already an OPPORTUNITY → phone number alone is enough
        const isOpportunity = ['OPPORTUNITY', 'HOT_OPPORTUNITY'].includes(conversation.contact.status);
        const CALL_INTENT_KEYWORDS = [
            'arayalım', 'arayacağız', 'sizi arayalım', 'sizi arayacağız',
            'numaranızı', 'aranacaksınız', 'beni arayın', 'arar mısınız',
            'arar misin', 'arayabilir misiniz', 'iletişime geçelim',
            'arayıp', 'iletişime geçecektir', 'iletişime geçeceğiz',
            'sizinle iletişime', 'sizi arayıp', 'geri arayacağız',
            'geri dönüş yapacağız', 'ekibimiz arayacak', 'uzman ekibimiz',
        ];
        const recentMessages = await prisma.message.findMany({
            where: { conversationId },
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: { content: true, messageType: true }
        });
        const hasCallIntent = recentMessages.some(msg => {
            const lower = (msg.content || '').toLowerCase();
            return CALL_INTENT_KEYWORDS.some(kw => lower.includes(kw));
        });
        // Pass if: explicit call intent in messages OR contact is already an opportunity
        if (!hasCallIntent && !isOpportunity) {
            console.log(`ℹ️ [RULE:SALES_PHONE_CALL] No call intent and contact status is ${conversation.contact.status}, skipping`);
            return;
        }


        // 5. Already in sales funnel? → skip to avoid duplicate
        if (conversation.funnelStageId) {
            const stage = await prisma.funnelStage.findUnique({
                where: { id: conversation.funnelStageId },
                include: { funnel: true }
            });
            if (stage?.funnel?.name?.toLowerCase().includes('satış')) {
                console.log(`ℹ️ [RULE:SALES_PHONE_CALL] Conversation ${conversationId} already in sales funnel, skipping`);
                return;
            }
        }

        // 6. Find "Satış Akışı" funnel
        const salesFunnel = await prisma.funnel.findFirst({
            where: { workspaceId, name: { contains: salesFunnelName.split(' ')[0], mode: 'insensitive' } },
            include: { stages: { orderBy: { order: 'asc' } } }
        });
        if (!salesFunnel || salesFunnel.stages.length === 0) {
            console.log(`⚠️ [RULE:SALES_PHONE_CALL] Sales funnel "${salesFunnelName}" not found`);
            return;
        }
        const firstStage = salesFunnel.stages[0];

        // 7. Find sales team (funnel.assignedTeamId → config.teamId → name match)
        let salesTeamId = salesFunnel.assignedTeamId || config.teamId;
        if (!salesTeamId) {
            const namedTeam = await prisma.team.findFirst({
                where: { workspaceId, name: { contains: 'satış', mode: 'insensitive' } }
            });
            salesTeamId = namedTeam?.id;
        }

        // 8. Round-robin agent selection from sales team
        let assignedUserId = null;
        if (salesTeamId) {
            const teamMembers = await prisma.teamMember.findMany({
                where: { teamId: salesTeamId, userId: { not: null } },
                include: { user: { select: { id: true, name: true } } },
                orderBy: { createdAt: 'asc' }
            });
            const userMembers = teamMembers.filter(m => m.userId);
            if (userMembers.length > 0) {
                // Find last assigned user in this team for round-robin
                const lastConv = await prisma.conversation.findFirst({
                    where: {
                        workspaceId,
                        teamIds: { contains: salesTeamId },
                        assignedToId: { not: null },
                        id: { not: conversationId }
                    },
                    orderBy: { updatedAt: 'desc' },
                    select: { assignedToId: true }
                });
                const lastIdx = lastConv
                    ? userMembers.findIndex(m => m.userId === lastConv.assignedToId)
                    : -1;
                const nextIdx = lastIdx >= 0 && lastIdx < userMembers.length - 1 ? lastIdx + 1 : 0;
                assignedUserId = userMembers[nextIdx].userId;
                console.log(`👤 [RULE:SALES_PHONE_CALL] Round-robin → ${userMembers[nextIdx].user?.name}`);
            }
        }

        // 9. Update conversation: funnel stage + team + agent
        const updateData = {
            funnelStageId: firstStage.id,
            botEnabled: false,
        };
        if (salesTeamId) {
            updateData.teamIds = JSON.stringify([salesTeamId]);
        }
        // Only assign directly if config.assignDirectly is true, otherwise keep it in the team pool
        if (assignedUserId && config.assignDirectly === true) {
            updateData.assignedToId = assignedUserId;
        }
        await prisma.conversation.update({ where: { id: conversationId }, data: updateData });
        console.log(`🔀 [RULE:SALES_PHONE_CALL] Conversation ${conversationId} → "${salesFunnel.name}" / "${firstStage.name}"`);

        // 10. Detect customer-stated time (HH:MM or HH.MM format)
        const timeRegex = /\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/;
        const allMessageContent = recentMessages.map(m => m.content || '').join(' ') + ' ' + messageContent;
        const timeMatch = allMessageContent.match(timeRegex);

        let dueDate;
        if (timeMatch) {
            const [, h, m] = timeMatch;
            const dt = new Date();
            dt.setHours(parseInt(h), parseInt(m), 0, 0);
            if (dt < new Date()) dt.setDate(dt.getDate() + 1); // tomorrow if past
            dueDate = dt;
            console.log(`⏰ [RULE:SALES_PHONE_CALL] Customer-stated time: ${h}:${m}`);
        } else {
            // Business hours check (10:00 - 21:00 Turkey time)
            const now = new Date();
            const nowTR = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
            const hour = nowTR.getHours();
            if (hour >= 10 && hour < 21) {
                // Within business hours → 15 min from now (or dynamically from config if defined)
                const delayMin = config.callDelayMinutes || 15;
                dueDate = new Date(now.getTime() + delayMin * 60 * 1000);
            } else {
                // Outside business hours → next day 10:15
                dueDate = new Date(now);
                dueDate.setDate(dueDate.getDate() + (hour >= 21 ? 1 : 0));
                dueDate.setUTCHours(10 - 3, 15, 0, 0); // 10:15 TR = 07:15 UTC
            }
        }

        // 11. Create CALL activity (in ContactActivity)
        const contact = conversation.contact;
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
                assignedToId: (config.assignDirectly === true && assignedUserId) ? assignedUserId : null,
                source: 'AUTOMATION'
            }
        });
        console.log(`📞 [RULE:SALES_PHONE_CALL] CALL activity created → ${dueDate.toISOString()} for contact ${contact.id}`);

        // 12. Emit socket update so inbox badges refresh instantly
        emitToWorkspace(workspaceId, 'conversation_updated', { conversationId });
        emitToWorkspace(workspaceId, 'activity_created', {
            conversationId,
            contactId: contact.id,
            type: 'CALL',
            status: 'PLANNED',
            dueDate: dueDate.toISOString(),
        });

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
export const executeAutoCallPlanning = async (workspaceId, contactId, source = 'AUTOMATION') => {
    try {
        // SALES_PHONE_CALL config'inden team/funnel bilgisi al (varsa)
        const rule = await prisma.workspaceRule.findUnique({
            where: { workspaceId_ruleType: { workspaceId, ruleType: 'SALES_PHONE_CALL' } }
        });
        const config = rule ? safeParseJSON(rule.config, {}) : {};

        // 2. Get contact + latest conversation for context
        const contact = await prisma.contact.findUnique({
            where: { id: contactId }
        });
        if (!contact || !contact.phone || !contact.phone.trim()) return;

        // Get latest conversation for topic/channel info
        const latestConversation = await prisma.conversation.findFirst({
            where: { workspaceId, contactId },
            orderBy: { updatedAt: 'desc' },
            select: { aiTopic: true, channel: true }
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

        // 3c. Genel cooldown: Son 4 saat içinde Retell araması yapıldıysa tekrar aramayı engelle
        const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
        const recentRetellCall = await prisma.contactActivity.findFirst({
            where: {
                workspaceId,
                contactId,
                type: 'CALL',
                source: 'RETELL',
                status: 'COMPLETED',
                completedAt: { gte: fourHoursAgo }
            }
        });
        if (recentRetellCall) {
            console.log(`ℹ️ [RULE:AUTO_CALL] Contact ${contactId} was called by Retell within last 4 hours, skipping auto-call`);
            return;
        }

        // 4. Find team: SALES_PHONE_CALL config → sohbetin takımı → ChannelRouting → varsayılan takım
        const salesFunnelName = config.funnelName || 'Satış Akışı';
        let salesTeamId = config.teamId;

        // 4a. SALES_PHONE_CALL config'den takım
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

        // 4b. Sohbetin assignedTeamId'sinden takım
        if (!salesTeamId && latestConversation) {
            const convWithTeam = await prisma.conversation.findFirst({
                where: { workspaceId, contactId },
                orderBy: { updatedAt: 'desc' },
                select: { assignedTeamId: true, channel: true }
            });
            if (convWithTeam?.assignedTeamId) {
                salesTeamId = convWithTeam.assignedTeamId;
                console.log(`📋 [RULE:AUTO_CALL] Takım sohbetten bulundu: ${salesTeamId}`);
            }
        }

        // 4c. ChannelRouting'den takım (kanal → takım eşleşmesi)
        if (!salesTeamId) {
            const channel = latestConversation?.channel || source;
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

        // 5. Round-robin agent selection
        let assignedUserId = null;
        if (salesTeamId) {
            const teamMembers = await prisma.teamMember.findMany({
                where: { teamId: salesTeamId, userId: { not: null } },
                include: { user: { select: { id: true, name: true } } },
                orderBy: { createdAt: 'asc' }
            });
            const userMembers = teamMembers.filter(m => m.userId);
            if (userMembers.length > 0) {
                const lastConv = await prisma.conversation.findFirst({
                    where: {
                        workspaceId,
                        teamIds: { contains: salesTeamId },
                        assignedToId: { not: null }
                    },
                    orderBy: { updatedAt: 'desc' },
                    select: { assignedToId: true }
                });
                const lastIdx = lastConv
                    ? userMembers.findIndex(m => m.userId === lastConv.assignedToId)
                    : -1;
                const nextIdx = lastIdx >= 0 && lastIdx < userMembers.length - 1 ? lastIdx + 1 : 0;
                assignedUserId = userMembers[nextIdx].userId;
                console.log(`👤 [RULE:AUTO_CALL] Round-robin → ${userMembers[nextIdx].user?.name}`);
            }
        }

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
                // Mesai dışı → yarın 10:15
                dueDate = new Date(now);
                dueDate.setDate(dueDate.getDate() + (hour >= 21 ? 1 : 0));
                dueDate.setUTCHours(10 - 3, 15, 0, 0); // 10:15 TR = 07:15 UTC
            }
        }

        // 7. Create CALL activity
        const teamLabel = salesTeamId ? salesTeamId : 'YOK';
        const userLabel = assignedUserId ? assignedUserId : 'YOK';
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
                assignedToId: assignedUserId || null,
                source: 'AUTOMATION',
                fallbackToAi: true,
                fallbackDelayMinutes: 0, // Planlanan saat geldiğinde agent aramadıysa Retell HEMEN arar
                aiFallbackTriggered: false
            }
        });
        console.log(`📞 [RULE:AUTO_CALL] CALL activity created → ${dueDate.toISOString()} for contact ${contactId} (source: ${source}, timing: ${timingSource}, team: ${teamLabel}, user: ${userLabel})`);

        // 8. Emit socket events
        emitToWorkspace(workspaceId, 'activity_created', {
            contactId,
            type: 'CALL',
            status: 'PLANNED',
            dueDate: dueDate.toISOString(),
        });

    } catch (error) {
        console.error('❌ [RULE:AUTO_CALL] Error:', error.message);
    }
};
