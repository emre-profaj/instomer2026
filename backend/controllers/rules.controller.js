import prisma from '../lib/prisma.js';
import { emitToWorkspace } from '../socket.js';
import { normalizePhone } from '../utils/phoneNormalizer.js';

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
            // Business hours check (09:00 - 18:00 Turkey time, UTC+3)
            const now = new Date();
            const turkeyOffset = 3 * 60;
            const localMs = now.getTime() + (turkeyOffset - now.getTimezoneOffset()) * 60000;
            const localNow = new Date(localMs);
            const hour = localNow.getHours();
            if (hour >= 9 && hour < 18) {
                // Within business hours → 15 min from now (or dynamically from config if defined)
                const delayMin = config.callDelayMinutes || 15;
                dueDate = new Date(now.getTime() + delayMin * 60 * 1000);
            } else {
                // Outside business hours → next day 09:15
                dueDate = new Date(now);
                dueDate.setDate(dueDate.getDate() + (hour >= 18 ? 1 : 0));
                dueDate.setHours(9, 15, 0, 0);
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
                description: `Telefon numarası tespit edildi. Otomatik arama planlandı.\nKişi: ${contact.name || contact.fullName || '-'}\nKonu: ${conversation.subject || conversation.topic || '-'}\nNumara: ${contact.phone || messageContent.match(phoneRegex)?.[0] || '-'}\nKaynak: ${conversation.channel || '-'}`,
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
        // 1. Auto-call planning: workspace ayarından kontrol et
        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { retellAutoCallEnabled: true }
        });
        // retellAutoCallEnabled açıkça false ise atla
        if (workspace?.retellAutoCallEnabled === false) return;

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
            select: { subject: true, topic: true, channel: true }
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

        // 4. Find sales team
        const salesFunnelName = config.funnelName || 'Satış Akışı';
        let salesTeamId = config.teamId;
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

        // 6. Calculate due date (business hours aware)
        let dueDate;
        const now = new Date();
        const turkeyOffset = 3 * 60;
        const localMs = now.getTime() + (turkeyOffset - now.getTimezoneOffset()) * 60000;
        const localNow = new Date(localMs);
        const hour = localNow.getHours();
        if (hour >= 9 && hour < 18) {
            const delayMin = config.callDelayMinutes || 15;
            dueDate = new Date(now.getTime() + delayMin * 60 * 1000);
        } else {
            dueDate = new Date(now);
            dueDate.setDate(dueDate.getDate() + (hour >= 18 ? 1 : 0));
            dueDate.setHours(9, 15, 0, 0);
        }

        // 7. Create CALL activity
        await prisma.contactActivity.create({
            data: {
                workspaceId,
                contactId,
                type: 'CALL',
                title: 'Arama Planlandı (Otomatik)',
                description: `Telefon numarası tespit edildi. Otomatik arama planlandı.\nKişi: ${contact.name || contact.fullName || '-'}\nKonu: ${latestConversation?.subject || latestConversation?.topic || '-'}\nNumara: ${contact.phone}\nKaynak: ${source}${latestConversation?.channel ? ' (' + latestConversation.channel + ')' : ''}`,
                dueDate,
                status: 'PLANNED',
                teamId: salesTeamId || null,
                assignedToId: (config.assignDirectly === true && assignedUserId) ? assignedUserId : null,
                source: 'AUTOMATION'
            }
        });
        console.log(`📞 [RULE:AUTO_CALL] CALL activity created → ${dueDate.toISOString()} for contact ${contactId} (source: ${source})`);

        // 8. Emit socket events
        emitToWorkspace(workspaceId, 'activity_created', {
            contactId,
            type: 'CALL',
            status: 'PLANNED',
        });

    } catch (error) {
        console.error('❌ [RULE:AUTO_CALL] Error:', error.message);
    }
};
