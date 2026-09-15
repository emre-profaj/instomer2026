/**
 * Default Quick Replies & Templates Service
 * 
 * Manages standard templates (Arama Başarılı, Arama Başarısız, Konum, Hoşgeldiniz)
 * with dynamic placeholder resolution for Workspace Company & AI Agent information.
 */

import prisma from '../lib/prisma.js';
import axios from 'axios';

const WHATSAPP_API_VERSION = process.env.FACEBOOK_GRAPH_API_VERSION || 'v21.0';

export const STANDARD_TEMPLATES_DEF = [
    {
        key: 'arama_basarili',
        metaName: 'arama_basarili',
        title: 'Arama Başarılı',
        shortcut: '/arama-basarili',
        category: 'UTILITY',
        description: 'Başarılı telefon görüşmesi sonrası müşteriye teşekkür ve bilgilendirme mesajı',
        content: `Merhaba, ben {AI Agent İsmi}. Bugün değerli vaktinizi ayırıp bizimle görüştüğünüz için teşekkür ederiz.

Arama başarıyla gerçekleştirildi. Profesyonel yolculuğunuzda, en doğru sonuçlarla yanınızdayız.

🌐 *Web Sitemiz:* {web site linki}
📍 *Kulüp Konumumuz:* {konum}

Aklınıza takılan her soruda bir mesaj uzağınızdayım. En yakın zamanda görüşmek üzere!`
    },
    {
        key: 'arama_basarisiz',
        metaName: 'arama_basarisiz',
        title: 'Arama Başarısız / Ulaşılamadı',
        shortcut: '/arama-basarisiz',
        category: 'UTILITY',
        description: 'Ulaşılamayan veya meşgule düşen aramalarda otomatik takip mesajı',
        content: `Merhaba, ben {AI Agent İsmi}. Size telefon üzerinden ulaşmaya çalıştık ancak görüşme sağlayamadık.

Müsait olduğunuzda bu mesaj üzerinden bize yazabilir veya doğrudan web sitemizi ziyaret edebilirsiniz:

🌐 *Web Sitemiz:* {web site linki}
📍 *Kulüp Konumumuz:* {konum}

Size yardımcı olmaktan mutluluk duyarız!`
    },
    {
        key: 'konum',
        metaName: 'konum_bilgisi',
        title: 'Konum ve Adres Paylaşımı',
        shortcut: '/konum',
        category: 'UTILITY',
        description: 'Ziyaretçilere firma/kulüp adresini ve Google Maps harita linkini iletme mesajı',
        content: `Merhaba! Şirketimizin / kulübümüzün konum ve adres bilgileri aşağıda yer almaktadır:

🏢 *Adres:* {adres}
📍 *Google Haritalar:* {konum}
🌐 *Web Sitemiz:* {web site linki}

Ziyaretinizi sabırsızlıkla bekliyoruz, her türlü sorunuzda bize buradan ulaşabilirsiniz!`
    },
    {
        key: 'hosgeldiniz',
        metaName: 'hosgeldiniz_mesaji',
        title: 'Hoş Geldiniz',
        shortcut: '/merhaba',
        category: 'MARKETING',
        description: 'Yeni müşterileri karşılama mesajı',
        content: `Merhaba! {Firma Adı}'na hoş geldiniz. Ben {AI Agent İsmi}, size nasıl yardımcı olabilirim?`
    }
];

/**
 * Resolves dynamic placeholders inside text using workspace info.
 * Placeholders:
 * - {AI Agent İsmi}
 * - {web site linki}
 * - {konum}
 * - {adres}
 * - {Firma Adı}
 */
export function resolveTemplatePlaceholders(text, context = {}) {
    if (!text || typeof text !== 'string') return '';

    const agentName = context.agentName || context.botName || 'AI Asistan';
    const website = context.website || context.companyWebsite || '';
    const mapsUrl = context.googleMapsUrl || context.mapsUrl || '';
    const address = context.address || context.companyAddress || '';
    const companyName = context.companyName || context.workspaceName || 'Firmamız';
    const workingHours = context.workingHours || context.companyWorkingHours || '';

    return text
        .replace(/\{AI_AGENT_ISMI\}|\{AI Agent İsmi\}|\{\{AI Agent İsmi\}\}|\{\{agent_name\}\}|\{ASISTAN_ADI\}/gi, agentName)
        .replace(/\{WEB_SITESI\}|\{web site linki\}|\{\{web site linki\}\}|\{\{website\}\}/gi, website || 'Web sitemizden bize ulaşabilirsiniz.')
        .replace(/\{KONUM_LINKI\}|\{konum\}|\{\{konum\}\}|\{\{location\}\}/gi, mapsUrl || address || 'Konum bilgisi için bize yazabilirsiniz.')
        .replace(/\{ADRES\}|\{adres\}|\{\{adres\}\}|\{\{address\}\}/gi, address || 'Adres bilgisi için bize yazabilirsiniz.')
        .replace(/\{FIRMA_ADI\}|\{Firma Adı\}|\{\{Firma Adı\}\}|\{\{firma\}\}|\{\{company_name\}\}/gi, companyName)
        .replace(/\{CALISMA_SAATLERI\}|\{çalışma saatleri\}|\{calisma_saatleri\}|\{\{working_hours\}\}/gi, workingHours || 'Hafta içi 09:00 - 18:00');
}

/**
 * Fetches workspace context for variable resolution.
 */
export async function getWorkspaceTemplateContext(workspaceId) {
    if (!workspaceId) return {};

    try {
        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: {
                id: true,
                name: true,
                companyName: true,
                companyWebsite: true,
                companyAddress: true,
                googleMapsUrl: true,
                companyPhone: true,
                companyWorkingHours: true,
                members: {
                    take: 1,
                    select: { userId: true }
                },
                aiBots: {
                    where: { isActive: true },
                    take: 1,
                    select: { name: true }
                }
            }
        });

        if (!workspace) return {};

        const botName = workspace.aiBots?.[0]?.name || 'Insta';
        return {
            workspaceId: workspace.id,
            workspaceName: workspace.name,
            companyName: workspace.companyName || workspace.name || 'Firmamız',
            companyWebsite: workspace.companyWebsite || '',
            website: workspace.companyWebsite || '',
            companyAddress: workspace.companyAddress || '',
            address: workspace.companyAddress || '',
            googleMapsUrl: workspace.googleMapsUrl || '',
            agentName: botName,
            botName,
            workingHours: workspace.companyWorkingHours || 'Hafta içi 09:00 - 18:00',
            creatorUserId: workspace.members?.[0]?.userId || null
        };
    } catch (error) {
        console.error('Error fetching workspace template context:', error.message);
        return {};
    }
}

/**
 * Ensures standard quick replies exist in QuickReply table for the workspace.
 * Idempotent: checks by title or shortcut.
 * If overwrite is false, only missing ones are created.
 */
export async function ensureDefaultQuickReplies(workspaceId, userId = null, overwrite = false) {
    if (!workspaceId) return [];

    try {
        const context = await getWorkspaceTemplateContext(workspaceId);
        const creatorId = userId || context.creatorUserId;

        const effectiveUserId = creatorId || (await prisma.user.findFirst({ select: { id: true } }))?.id;
        if (!effectiveUserId) return [];

        const existing = await prisma.quickReply.findMany({
            where: { workspaceId }
        });

        const createdOrUpdated = [];

        for (const def of STANDARD_TEMPLATES_DEF) {
            const match = existing.find(
                qr => qr.shortcut === def.shortcut || qr.title === def.title
            );

            const resolvedContent = resolveTemplatePlaceholders(def.content, context);

            if (!match) {
                const newQR = await prisma.quickReply.create({
                    data: {
                        workspaceId,
                        title: def.title,
                        content: resolvedContent,
                        shortcut: def.shortcut,
                        createdById: effectiveUserId
                    }
                });
                createdOrUpdated.push(newQR);
            } else if (overwrite) {
                const updated = await prisma.quickReply.update({
                    where: { id: match.id },
                    data: {
                        title: def.title,
                        content: resolvedContent,
                        shortcut: def.shortcut
                    }
                });
                createdOrUpdated.push(updated);
            }
        }

        return createdOrUpdated;
    } catch (error) {
        console.error('Error in ensureDefaultQuickReplies:', error.message);
        return [];
    }
}

/**
 * Pushes a quick reply or standard template to Meta as a WhatsappTemplate.
 */
export async function pushQuickReplyToMeta(workspaceId, quickReplyId, whatsappPhoneNumberId = null) {
    const quickReply = await prisma.quickReply.findFirst({
        where: { id: quickReplyId, workspaceId }
    });

    if (!quickReply) {
        throw new Error('Hazır mesaj bulunamadı');
    }

    // Find WhatsApp phone
    const whatsappPhone = whatsappPhoneNumberId
        ? await prisma.whatsappPhoneNumber.findUnique({ where: { id: whatsappPhoneNumberId, workspaceId } })
        : await prisma.whatsappPhoneNumber.findFirst({ where: { workspaceId } });

    if (!whatsappPhone) {
        throw new Error('Workspace için bağlı bir WhatsApp numarası bulunamadı. Lütfen önce Kanallar sayfasından WhatsApp bağlayın.');
    }

    // Format template name for Meta (lowercase alphanumeric underscore)
    const sanitizedName = (quickReply.shortcut ? quickReply.shortcut.replace(/^\//, '') : quickReply.title)
        .toLowerCase()
        .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i')
        .replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
        .replace(/[^a-z0-9_]/g, '_')
        .substring(0, 60);

    const bodyText = quickReply.content;

    // Check if template exists locally
    let existingTpl = await prisma.whatsappTemplate.findFirst({
        where: {
            workspaceId,
            name: sanitizedName
        }
    });

    // Call Meta API
    const apiUrl = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${whatsappPhone.wabaId}/message_templates`;

    const components = [
        { type: 'BODY', text: bodyText }
    ];

    let metaTemplateId = null;
    let metaStatus = 'PENDING';

    try {
        const metaRes = await axios.post(apiUrl, {
            name: sanitizedName,
            language: 'tr',
            category: 'UTILITY',
            components
        }, {
            headers: {
                'Authorization': `Bearer ${whatsappPhone.accessToken}`,
                'Content-Type': 'application/json'
            },
            timeout: 15000
        });

        metaTemplateId = metaRes.data?.id;
        metaStatus = metaRes.data?.status || 'PENDING';
    } catch (metaErr) {
        console.warn('Meta API template create warning:', metaErr.response?.data?.error?.message || metaErr.message);
        if (metaErr.response?.data?.error?.message?.includes('already exists')) {
            metaStatus = 'PENDING';
        } else {
            throw new Error(metaErr.response?.data?.error?.message || metaErr.message);
        }
    }

    if (existingTpl) {
        return prisma.whatsappTemplate.update({
            where: { id: existingTpl.id },
            data: {
                bodyText,
                templateId: metaTemplateId || existingTpl.templateId,
                status: metaStatus,
                whatsappPhoneNumberId: whatsappPhone.id
            }
        });
    } else {
        return prisma.whatsappTemplate.create({
            data: {
                workspaceId,
                name: sanitizedName,
                bodyText,
                templateId: metaTemplateId,
                status: metaStatus,
                language: 'tr',
                category: 'UTILITY',
                whatsappPhoneNumberId: whatsappPhone.id
            }
        });
    }
}
