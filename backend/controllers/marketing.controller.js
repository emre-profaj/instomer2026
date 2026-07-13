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

        // Parse template name from content "[Şablon: templateName]\n..."
        const templateMap = {};
        for (const msg of messages) {
            const match = msg.content?.match(/\[Şablon:\s*(.+?)\]/);
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
