import prisma from '../lib/prisma.js';

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

        const validTypes = ['PHONE_CAPTURE', 'HOT_KEYWORD', 'HOT_OPPORT_EMAIL'];
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
        // Check if rule is active
        const rule = await prisma.workspaceRule.findUnique({
            where: { workspaceId_ruleType: { workspaceId, ruleType: 'PHONE_CAPTURE' } }
        });
        if (!rule || !rule.isActive) return;

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

        const contact = conversation.contact;

        // Clean detected phone number
        const rawPhone = matches[0].replace(/[\s\-\.]/g, '');
        let cleanPhone = rawPhone.replace(/^\+/, '');
        if (cleanPhone.startsWith('0') && cleanPhone.length === 11) {
            cleanPhone = '90' + cleanPhone.substring(1);
        } else if (cleanPhone.length === 10 && !cleanPhone.startsWith('90')) {
            cleanPhone = '90' + cleanPhone;
        }

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
