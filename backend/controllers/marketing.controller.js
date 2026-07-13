import prisma from '../lib/prisma.js';
import axios from 'axios';

// ─────────────────────────────────────────────────────────────────────────────
// GET /marketing/:workspaceId/template-analytics
// WhatsApp template message statistics grouped by template name
// ─────────────────────────────────────────────────────────────────────────────
export const getTemplateAnalytics = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { days = 30 } = req.query;

        const since = new Date();
        since.setDate(since.getDate() - parseInt(days));

        // Get all TEMPLATE messages with contact/conversation info
        const messages = await prisma.message.findMany({
            where: {
                messageType: 'TEMPLATE',
                isFromContact: false,
                createdAt: { gte: since },
                conversation: { workspaceId }
            },
            select: {
                id: true,
                content: true,
                status: true,
                createdAt: true,
                whatsappMessageId: true,
                conversation: {
                    select: {
                        id: true,
                        contact: {
                            select: {
                                id: true,
                                name: true,
                                phone: true,
                                email: true,
                                tags: true
                            }
                        }
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        // Parse template name from content
        // Format 1: "[Şablon: templateName]\n..."         (manual send)
        // Format 2: "[Otomatik Şablon: templateName]\n..." (automation send)
        const templateMap = {};
        for (const msg of messages) {
            const match = msg.content?.match(/\[(?:Otomatik\s+)?[Şş]ablon:\s*(.+?)\]/i);
            const tplName = match ? match[1].trim() : 'Bilinmeyen';

            if (!templateMap[tplName]) {
                templateMap[tplName] = {
                    templateName: tplName,
                    total: 0,
                    delivered: 0,
                    read: 0,
                    failed: 0,
                    sent: 0,
                    lastSentAt: null,
                    recipients: []
                };
            }

            const t = templateMap[tplName];
            t.total++;
            if (msg.status === 'DELIVERED') t.delivered++;
            else if (msg.status === 'READ') t.read++;
            else if (msg.status === 'FAILED') t.failed++;
            else t.sent++; // SENT = reached WhatsApp but not yet delivered

            if (!t.lastSentAt || msg.createdAt > t.lastSentAt) {
                t.lastSentAt = msg.createdAt;
            }

            const contact = msg.conversation?.contact;
            t.recipients.push({
                messageId: msg.id,
                whatsappMessageId: msg.whatsappMessageId,
                conversationId: msg.conversation?.id,
                status: msg.status,
                sentAt: msg.createdAt,
                contactId: contact?.id || null,
                name: contact?.name || '—',
                phone: contact?.phone || '—',
                email: contact?.email || null,
                tags: contact?.tags || []
            });
        }

        // Compute rates for each template
        for (const t of Object.values(templateMap)) {
            t.readRate     = t.total > 0 ? Math.round((t.read / t.total) * 100) : 0;
            t.deliveryRate = t.total > 0 ? Math.round(((t.delivered + t.read) / t.total) * 100) : 0;
            t.failRate     = t.total > 0 ? Math.round((t.failed / t.total) * 100) : 0;
        }

        const templates = Object.values(templateMap).sort((a, b) => b.total - a.total);

        // Overall stats
        const overall = {
            totalSent:       messages.length,
            totalDelivered:  messages.filter(m => ['DELIVERED', 'READ'].includes(m.status)).length,
            totalRead:       messages.filter(m => m.status === 'READ').length,
            totalFailed:     messages.filter(m => m.status === 'FAILED').length,
            uniqueTemplates: templates.length,
        };

        res.json({ templates, overall, days: parseInt(days) });
    } catch (error) {
        console.error('❌ [getTemplateAnalytics]', error);
        res.status(500).json({ error: 'Analiz verileri yüklenemedi' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /marketing/:workspaceId/template-analytics
// Clear template message history (all or specific template name)
// Query: ?templateName=xxx  → clears only that template
// No query                  → clears ALL template messages
// ─────────────────────────────────────────────────────────────────────────────
export const clearTemplateHistory = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { templateName } = req.query;

        // Build content filter based on template name
        let contentFilter = {};
        if (templateName) {
            // Match both [Şablon: name] and [Otomatik Şablon: name]
            contentFilter = {
                OR: [
                    { content: { contains: `[Şablon: ${templateName}]` } },
                    { content: { contains: `[Otomatik Şablon: ${templateName}]` } }
                ]
            };
        }

        const deleted = await prisma.message.deleteMany({
            where: {
                messageType: 'TEMPLATE',
                isFromContact: false,
                conversation: { workspaceId },
                ...contentFilter
            }
        });

        console.log(`🗑️ [clearTemplateHistory] Deleted ${deleted.count} messages. workspace: ${workspaceId}, template: ${templateName || 'ALL'}`);

        res.json({
            success: true,
            deleted: deleted.count,
            message: templateName
                ? `"${templateName}" şablonuna ait ${deleted.count} kayıt silindi`
                : `Tüm şablon geçmişi silindi (${deleted.count} kayıt)`
        });
    } catch (error) {
        console.error('❌ [clearTemplateHistory]', error);
        res.status(500).json({ error: 'Geçmiş silinemedi' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /marketing/:workspaceId/contacts
// Paginated contact list with search & filters (only contacts with phone)
// ─────────────────────────────────────────────────────────────────────────────
export const getMarketingContacts = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { search = '', status = '', source = '', tag = '', page = 1, limit = 50 } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const where = {
            workspaceId,
            isDeleted: false,
            isBlocked: false,
            phone: { not: null },  // Only contacts with phone (for WhatsApp)
        };

        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { fullName: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search } },
                { email: { contains: search, mode: 'insensitive' } },
            ];
        }
        if (status) where.status = status;
        if (source) where.source = source;
        if (tag) where.tags = { contains: tag };

        const [contacts, total] = await Promise.all([
            prisma.contact.findMany({
                where,
                select: {
                    id: true,
                    name: true,
                    fullName: true,
                    phone: true,
                    email: true,
                    status: true,
                    source: true,
                    tags: true,
                    category: true,
                    createdAt: true,
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: parseInt(limit),
            }),
            prisma.contact.count({ where }),
        ]);

        // Parse tags JSON string
        const parsed = contacts.map(c => ({
            ...c,
            name: c.fullName || c.name || c.phone,
            tags: (() => { try { return JSON.parse(c.tags || '[]'); } catch { return []; } })()
        }));

        // Get distinct values for filter dropdowns
        const [statuses, sources] = await Promise.all([
            prisma.contact.findMany({
                where: { workspaceId, isDeleted: false, phone: { not: null } },
                select: { status: true },
                distinct: ['status']
            }),
            prisma.contact.findMany({
                where: { workspaceId, isDeleted: false, phone: { not: null } },
                select: { source: true },
                distinct: ['source']
            }),
        ]);

        res.json({
            contacts: parsed,
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(total / parseInt(limit)),
            filters: {
                statuses: statuses.map(s => s.status).filter(Boolean),
                sources: sources.map(s => s.source).filter(Boolean),
            }
        });
    } catch (error) {
        console.error('❌ [getMarketingContacts]', error);
        res.status(500).json({ error: 'Kişiler yüklenemedi' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /marketing/:workspaceId/bulk-send
// Send a WhatsApp template to multiple contacts (queued with delay)
// Body: { contactIds: [...], templateId: "xxx", variables: [] }
//    OR { selectAll: true, filters: { search, status, source }, templateId, variables }
// ─────────────────────────────────────────────────────────────────────────────
export const bulkSendTemplate = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { contactIds, selectAll, filters = {}, templateId, variables = [] } = req.body;

        if (!selectAll && !contactIds?.length) return res.status(400).json({ error: 'Kişi seçilmedi' });
        if (!templateId) return res.status(400).json({ error: 'Şablon seçilmedi' });

        // Fetch template
        const template = await prisma.whatsappTemplate.findFirst({
            where: { id: templateId, workspaceId, status: 'APPROVED' }
        });
        if (!template) return res.status(404).json({ error: 'Onaylı şablon bulunamadı' });

        // Fetch WhatsApp phone
        let whatsappPhone = null;
        if (template.whatsappPhoneNumberId) {
            whatsappPhone = await prisma.whatsappPhoneNumber.findUnique({
                where: { id: template.whatsappPhoneNumberId }
            });
        }
        if (!whatsappPhone) {
            whatsappPhone = await prisma.whatsappPhoneNumber.findFirst({ where: { workspaceId } });
        }
        if (!whatsappPhone) return res.status(400).json({ error: 'WhatsApp numarası bağlı değil' });

        // Build contact query
        let contactWhere = { workspaceId, isDeleted: false, isBlocked: false, phone: { not: null } };

        if (selectAll) {
            // Filter-based: fetch all matching contacts (no pagination)
            const { search = '', status = '', source = '' } = filters;
            if (search) {
                contactWhere.OR = [
                    { name:     { contains: search, mode: 'insensitive' } },
                    { fullName: { contains: search, mode: 'insensitive' } },
                    { phone:    { contains: search } },
                    { email:    { contains: search, mode: 'insensitive' } },
                ];
            }
            if (status) contactWhere.status = status;
            if (source) contactWhere.source = source;
        } else {
            // ID-based: specific selected contacts
            contactWhere.id = { in: contactIds };
        }

        // Fetch contacts
        const contacts = await prisma.contact.findMany({
            where: contactWhere,
            select: { id: true, name: true, fullName: true, phone: true }
        });

        // Respond immediately — send in background
        res.json({
            success: true,
            queued: contacts.length,
            templateName: template.name,
            message: `${contacts.length} kişiye "${template.name}" şablonu gönderiliyor...`
        });

        // Background send with 1.5s delay between messages (WhatsApp rate limit)
        setImmediate(async () => {
            let sent = 0, failed = 0;

            for (const contact of contacts) {
                try {
                    // Clean phone
                    let phone = contact.phone.replace(/[\s\+\-\(\)]/g, '');
                    if (phone.startsWith('0')) phone = '90' + phone.substring(1);
                    else if (!phone.startsWith('90') && phone.length === 10) phone = '90' + phone;

                    // Build payload
                    const payload = {
                        messaging_product: 'whatsapp',
                        to: phone,
                        type: 'template',
                        template: {
                            name: template.name,
                            language: { code: template.language || 'tr' }
                        }
                    };

                    // Body variables: {{1}} = contact name
                    const placeholderCount = (template.bodyText?.match(/\{\{\d+\}\}/g) || []).length;
                    if (placeholderCount > 0) {
                        const params = [];
                        const contactName = contact.fullName || contact.name || phone;
                        params.push({ type: 'text', text: contactName });
                        variables.forEach(v => { if (v?.trim()) params.push({ type: 'text', text: v }); });
                        while (params.length < placeholderCount) params.push({ type: 'text', text: '' });
                        payload.template.components = [{ type: 'body', parameters: params }];
                    }

                    const response = await axios.post(
                        `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${whatsappPhone.phoneNumberId}/messages`,
                        payload,
                        { headers: { 'Authorization': `Bearer ${whatsappPhone.accessToken}`, 'Content-Type': 'application/json' } }
                    );

                    const waMessageId = response.data.messages?.[0]?.id;

                    // Save to DB
                    let conversation = await prisma.conversation.findFirst({
                        where: { contactId: contact.id, workspaceId, channel: 'WHATSAPP' }
                    });
                    if (!conversation) {
                        conversation = await prisma.conversation.create({
                            data: { contactId: contact.id, workspaceId, whatsappPhoneNumberId: whatsappPhone.id, channel: 'WHATSAPP', status: 'OPEN' }
                        });
                    }
                    await prisma.message.create({
                        data: {
                            conversationId: conversation.id,
                            content: `[Şablon: ${template.name}]\n${template.bodyText}`,
                            messageType: 'TEMPLATE',
                            isFromContact: false,
                            whatsappMessageId: waMessageId,
                            status: 'SENT'
                        }
                    });
                    await prisma.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date() } });

                    sent++;
                    console.log(`📤 [BulkSend] ${sent}/${contacts.length} sent to ${phone}`);
                } catch (err) {
                    failed++;
                    console.error(`❌ [BulkSend] Failed for contact ${contact.id}:`, err.response?.data?.error?.message || err.message);
                }

                // Rate limit delay
                if (contacts.indexOf(contact) < contacts.length - 1) {
                    await new Promise(r => setTimeout(r, 1500));
                }
            }

            console.log(`✅ [BulkSend] Done. Sent: ${sent}, Failed: ${failed}, Template: ${template.name}`);
        });

    } catch (error) {
        console.error('❌ [bulkSendTemplate]', error);
        res.status(500).json({ error: 'Toplu gönderim başlatılamadı' });
    }
};

const WHATSAPP_API_VERSION = 'v22.0';

// Helper: convert relative URL to absolute
function toAbsoluteUrl(url) {
    if (!url) return null;
    if (url.startsWith('/api/uploads') || url.startsWith('/uploads')) {
        return `https://app.instomer.com${url}`;
    }
    return url;
}

// Helper: upload media to Meta and get media_id
async function uploadMediaToMeta(mediaUrl, mediaType, phoneNumberId, accessToken) {
    try {
        console.log(`📤 [Marketing/MediaUpload] Downloading media from: ${mediaUrl}`);
        const mediaRes = await axios.get(mediaUrl, { responseType: 'arraybuffer', timeout: 30000 });
        const buffer = Buffer.from(mediaRes.data);
        const mimeType = mediaRes.headers['content-type'] || 'image/jpeg';
        console.log(`📦 [Marketing/MediaUpload] Downloaded ${buffer.length} bytes, mime: ${mimeType}`);

        const { FormData, Blob } = await import('formdata-node');
        const form = new FormData();
        form.append('file', new Blob([buffer], { type: mimeType }), `media.${mimeType.split('/')[1] || 'jpg'}`);
        form.append('type', mimeType);
        form.append('messaging_product', 'whatsapp');

        const uploadRes = await axios.post(
            `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/media`,
            form,
            { headers: { ...form.headers, Authorization: `Bearer ${accessToken}` }, timeout: 30000 }
        );
        console.log(`✅ [Marketing/MediaUpload] Uploaded, media_id: ${uploadRes.data?.id}`);
        return uploadRes.data?.id || null;
    } catch (err) {
        console.error(`❌ [Marketing/MediaUpload] Failed:`, err.response?.data || err.message);
        return null;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /marketing/:workspaceId/campaigns
// ─────────────────────────────────────────────────────────────────────────────
export const getCampaigns = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const campaigns = await prisma.marketingCampaign.findMany({
            where: { workspaceId },
            orderBy: { createdAt: 'desc' },
            include: {
                template: { select: { name: true, headerType: true, bodyText: true } },
                recipients: { select: { status: true } }
            }
        });

        // Enrich with stats
        const enriched = campaigns.map(c => ({
            ...c,
            totalCount: c.recipients.length,
            sentCount: c.recipients.filter(r => ['SENT', 'DELIVERED', 'READ'].includes(r.status)).length,
            deliveredCount: c.recipients.filter(r => ['DELIVERED', 'READ'].includes(r.status)).length,
            readCount: c.recipients.filter(r => r.status === 'READ').length,
            failedCount: c.recipients.filter(r => r.status === 'FAILED').length,
            recipients: undefined
        }));

        res.json({ campaigns: enriched });
    } catch (error) {
        console.error('❌ [getCampaigns]', error);
        res.status(500).json({ error: 'Kampanyalar yüklenemedi' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /marketing/:workspaceId/campaigns/:id
// ─────────────────────────────────────────────────────────────────────────────
export const getCampaignDetail = async (req, res) => {
    try {
        const { workspaceId, id } = req.params;
        const campaign = await prisma.marketingCampaign.findFirst({
            where: { id, workspaceId },
            include: {
                template: true,
                recipients: {
                    orderBy: { createdAt: 'asc' },
                    take: 500
                }
            }
        });
        if (!campaign) return res.status(404).json({ error: 'Kampanya bulunamadı' });
        res.json({ campaign });
    } catch (error) {
        console.error('❌ [getCampaignDetail]', error);
        res.status(500).json({ error: 'Kampanya detayı yüklenemedi' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /marketing/:workspaceId/campaigns
// ─────────────────────────────────────────────────────────────────────────────
export const createCampaign = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { name, description, templateId, scheduledAt } = req.body;

        if (!name || !templateId) {
            return res.status(400).json({ error: 'Kampanya adı ve şablon zorunludur' });
        }

        const template = await prisma.whatsappTemplate.findFirst({ where: { id: templateId, workspaceId } });
        if (!template) return res.status(404).json({ error: 'Şablon bulunamadı' });

        const campaign = await prisma.marketingCampaign.create({
            data: {
                workspaceId,
                name,
                description,
                templateId,
                status: scheduledAt ? 'SCHEDULED' : 'DRAFT',
                scheduledAt: scheduledAt ? new Date(scheduledAt) : null
            },
            include: { template: { select: { name: true } } }
        });

        res.status(201).json({ campaign });
    } catch (error) {
        console.error('❌ [createCampaign]', error);
        res.status(500).json({ error: 'Kampanya oluşturulamadı' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /marketing/:workspaceId/campaigns/:id/send
// Body: { contactIds?: [], phones?: [], segmentFilter?: { tags, status, source } }
// ─────────────────────────────────────────────────────────────────────────────
export const sendCampaign = async (req, res) => {
    try {
        const { workspaceId, id } = req.params;
        const { contactIds, phones, segmentFilter } = req.body;

        const campaign = await prisma.marketingCampaign.findFirst({
            where: { id, workspaceId },
            include: { template: true }
        });
        if (!campaign) return res.status(404).json({ error: 'Kampanya bulunamadı' });
        if (campaign.status === 'RUNNING') return res.status(400).json({ error: 'Kampanya zaten çalışıyor' });

        const template = campaign.template;

        // Get WhatsApp phone number
        const whatsappPhone = await prisma.whatsappPhoneNumber.findFirst({
            where: { workspaceId }
        });
        if (!whatsappPhone) return res.status(400).json({ error: 'Bağlı WhatsApp numarası bulunamadı' });

        // Build recipient list
        let recipients = [];

        if (contactIds && contactIds.length > 0) {
            const contacts = await prisma.contact.findMany({
                where: { id: { in: contactIds }, workspaceId, phone: { not: null } },
                select: { id: true, phone: true, name: true }
            });
            recipients = contacts.map(c => ({ contactId: c.id, phone: c.phone, name: c.name || '' }));
        } else if (segmentFilter) {
            const where = { workspaceId, phone: { not: null } };
            if (segmentFilter.tags?.length) where.tags = { hasSome: segmentFilter.tags };
            if (segmentFilter.status) where.status = segmentFilter.status;
            if (segmentFilter.source) where.source = segmentFilter.source;

            const contacts = await prisma.contact.findMany({
                where,
                select: { id: true, phone: true, name: true },
                take: 1000
            });
            recipients = contacts.map(c => ({ contactId: c.id, phone: c.phone, name: c.name || '' }));
        } else if (phones && phones.length > 0) {
            recipients = phones.map(p => ({ contactId: null, phone: p, name: '' }));
        }

        if (recipients.length === 0) {
            return res.status(400).json({ error: 'Gönderilecek alıcı bulunamadı' });
        }

        // Update campaign status
        await prisma.marketingCampaign.update({
            where: { id },
            data: { status: 'RUNNING', sentAt: new Date(), totalCount: recipients.length }
        });

        // Create recipient records
        await prisma.marketingRecipient.createMany({
            data: recipients.map(r => ({
                campaignId: id,
                contactId: r.contactId,
                phone: r.phone.replace(/[\s\+\-]/g, ''),
                name: r.name,
                status: 'PENDING'
            }))
        });

        // Respond immediately — send in background
        res.json({ success: true, totalRecipients: recipients.length, message: 'Kampanya gönderimi başladı' });

        // Background send
        setImmediate(async () => {
            let sentCount = 0, failedCount = 0;

            // Prepare media_id if template has media header
            let cachedMediaId = null;
            if (template.headerType && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(template.headerType)) {
                const rawUrl = toAbsoluteUrl(template.headerContent);
                if (rawUrl) {
                    const needsUpload = rawUrl.includes('scontent.whatsapp.net') || rawUrl.includes('drive.google.com');
                    if (needsUpload || rawUrl.startsWith('https://app.instomer.com')) {
                        cachedMediaId = await uploadMediaToMeta(rawUrl, template.headerType, whatsappPhone.phoneNumberId, whatsappPhone.accessToken);
                    }
                }
            }

            const dbRecipients = await prisma.marketingRecipient.findMany({ where: { campaignId: id } });

            for (const recipient of dbRecipients) {
                try {
                    const components = [];

                    // Header
                    if (template.headerType && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(template.headerType)) {
                        let headerParam;
                        if (cachedMediaId) {
                            headerParam = { type: template.headerType.toLowerCase(), [template.headerType.toLowerCase()]: { id: cachedMediaId } };
                        } else {
                            const url = toAbsoluteUrl(template.headerContent);
                            if (url) headerParam = { type: template.headerType.toLowerCase(), [template.headerType.toLowerCase()]: { link: url } };
                        }
                        if (headerParam) components.push({ type: 'header', parameters: [headerParam] });
                    }

                    const payload = {
                        messaging_product: 'whatsapp',
                        to: recipient.phone,
                        type: 'template',
                        template: {
                            name: template.name,
                            language: { code: template.language || 'tr' },
                            ...(components.length > 0 && { components })
                        }
                    };

                    const apiUrl = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${whatsappPhone.phoneNumberId}/messages`;
                    const response = await axios.post(apiUrl, payload, {
                        headers: { Authorization: `Bearer ${whatsappPhone.accessToken}`, 'Content-Type': 'application/json' }
                    });

                    const messageId = response.data?.messages?.[0]?.id;
                    await prisma.marketingRecipient.update({
                        where: { id: recipient.id },
                        data: { status: 'SENT', messageId, sentAt: new Date() }
                    });
                    sentCount++;

                    // Rate limiting: 80 msg/sec max for WhatsApp Biz API
                    await new Promise(r => setTimeout(r, 100));
                } catch (err) {
                    console.error(`❌ [Campaign] Failed for ${recipient.phone}:`, err.response?.data || err.message);
                    await prisma.marketingRecipient.update({
                        where: { id: recipient.id },
                        data: { status: 'FAILED', failedAt: new Date(), failReason: err.response?.data?.error?.message || err.message }
                    });
                    failedCount++;
                }
            }

            await prisma.marketingCampaign.update({
                where: { id },
                data: { status: 'COMPLETED', sentCount, failedCount }
            });
            console.log(`✅ [Campaign] Completed: ${sentCount} sent, ${failedCount} failed`);
        });

    } catch (error) {
        console.error('❌ [sendCampaign]', error);
        res.status(500).json({ error: 'Kampanya gönderilemedi' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /marketing/:workspaceId/campaigns/:id
// ─────────────────────────────────────────────────────────────────────────────
export const deleteCampaign = async (req, res) => {
    try {
        const { workspaceId, id } = req.params;
        await prisma.marketingCampaign.deleteMany({ where: { id, workspaceId } });
        res.json({ success: true });
    } catch (error) {
        console.error('❌ [deleteCampaign]', error);
        res.status(500).json({ error: 'Kampanya silinemedi' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /marketing/:workspaceId/segments
// Returns contacts grouped by tags/status/source for segmentation
// ─────────────────────────────────────────────────────────────────────────────
export const getSegments = async (req, res) => {
    try {
        const { workspaceId } = req.params;

        const [statusCounts, sourceCounts, totalWithPhone] = await Promise.all([
            prisma.contact.groupBy({
                by: ['status'],
                where: { workspaceId, phone: { not: null } },
                _count: { id: true }
            }),
            prisma.contact.groupBy({
                by: ['source'],
                where: { workspaceId, phone: { not: null }, source: { not: null } },
                _count: { id: true }
            }),
            prisma.contact.count({ where: { workspaceId, phone: { not: null } } })
        ]);

        res.json({ statusCounts, sourceCounts, totalWithPhone });
    } catch (error) {
        console.error('❌ [getSegments]', error);
        res.status(500).json({ error: 'Segmentler yüklenemedi' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// Called from WhatsApp webhook status handler to update read/delivered
// ─────────────────────────────────────────────────────────────────────────────
export const updateCampaignRecipientStatus = async (messageId, status) => {
    try {
        const recipient = await prisma.marketingRecipient.findUnique({ where: { messageId } });
        if (!recipient) return;

        const updateData = {};
        if (status === 'delivered') { updateData.status = 'DELIVERED'; updateData.deliveredAt = new Date(); }
        else if (status === 'read') { updateData.status = 'READ'; updateData.readAt = new Date(); }
        else if (status === 'failed') { updateData.status = 'FAILED'; updateData.failedAt = new Date(); }

        if (Object.keys(updateData).length > 0) {
            await prisma.marketingRecipient.update({ where: { messageId }, data: updateData });

            // Update campaign aggregate counts
            const [delivered, read, failed] = await Promise.all([
                prisma.marketingRecipient.count({ where: { campaignId: recipient.campaignId, status: 'DELIVERED' } }),
                prisma.marketingRecipient.count({ where: { campaignId: recipient.campaignId, status: 'READ' } }),
                prisma.marketingRecipient.count({ where: { campaignId: recipient.campaignId, status: 'FAILED' } })
            ]);
            await prisma.marketingCampaign.update({
                where: { id: recipient.campaignId },
                data: { deliveredCount: delivered, readCount: read, failedCount: failed }
            });
        }
    } catch (err) {
        // Non-critical — don't throw
        console.warn(`⚠️ [Campaign] Could not update recipient status for ${messageId}:`, err.message);
    }
};
