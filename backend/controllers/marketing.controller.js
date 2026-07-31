import prisma from '../lib/prisma.js';
import axios from 'axios';
import { randomUUID } from 'crypto';

// ─── In-memory bulk-send job tracker ───────────────────────────────────────────
// Maps jobId → { sent, failed, total, done, templateName, startedAt }
const bulkSendJobs = new Map();

// Clean up jobs older than 2 hours to avoid memory leak
setInterval(() => {
    const cutoff = Date.now() - 2 * 60 * 60 * 1000;
    for (const [id, job] of bulkSendJobs.entries()) {
        if (job.startedAt < cutoff) bulkSendJobs.delete(id);
    }
}, 15 * 60 * 1000);

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
            // Parse error reason from content for FAILED messages: "[HATA: ...]"
            let errorReason = null;
            if (msg.status === 'FAILED') {
                const errMatch = msg.content?.match(/\[HATA:\s*(.+?)\]$/s);
                if (errMatch) errorReason = errMatch[1].trim();
            }
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
                tags: contact?.tags || [],
                errorReason
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
// POST /marketing/:workspaceId/template-analytics/retry
// ─────────────────────────────────────────────────────────────────────────────
export const retryTemplateFailed = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { templateName, messageIds } = req.body;

        if (!templateName || !messageIds || !Array.isArray(messageIds) || messageIds.length === 0) {
            return res.status(400).json({ error: 'Geçersiz parametreler' });
        }

        const template = await prisma.whatsappTemplate.findFirst({
            where: { workspaceId, name: templateName }
        });
        if (!template) return res.status(404).json({ error: 'Şablon bulunamadı' });

        const whatsappPhone = await prisma.whatsappPhoneNumber.findFirst({ where: { workspaceId } });
        if (!whatsappPhone) return res.status(400).json({ error: 'WhatsApp numarası bağlı değil' });

        // Find failed messages matching these IDs
        const failedMessages = await prisma.message.findMany({
            where: {
                id: { in: messageIds },
                workspaceId,
                status: 'FAILED',
                messageType: 'TEMPLATE'
            },
            include: {
                conversation: { include: { contact: true } }
            }
        });

        if (failedMessages.length === 0) {
            return res.json({ success: true, retried: 0, message: 'Başarısız mesaj bulunamadı' });
        }

        res.json({
            success: true,
            retrying: failedMessages.length,
            message: `${failedMessages.length} başarısız mesaja tekrar gönderiliyor...`
        });

        // Background send
        setImmediate(async () => {
            let retried = 0, stillFailed = 0;
            const WHATSAPP_API_VERSION = process.env.WHATSAPP_API_VERSION || 'v21.0';
            const apiUrl = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${whatsappPhone.phoneNumberId}/messages`;

            for (const msg of failedMessages) {
                const phone = msg.conversation?.contact?.phone;
                if (!phone) continue;

                try {
                    // Reset status to SENDING temporarily
                    await prisma.message.update({
                        where: { id: msg.id },
                        data: { status: 'SENDING' }
                    });

                    const payload = {
                        messaging_product: 'whatsapp',
                        to: phone,
                        type: 'template',
                        template: {
                            name: template.name,
                            language: { code: template.language || 'tr' }
                        }
                    };

                    const response = await axios.post(apiUrl, payload, {
                        headers: { Authorization: `Bearer ${whatsappPhone.accessToken}`, 'Content-Type': 'application/json' }
                    });

                    const newWaId = response.data?.messages?.[0]?.id;
                    await prisma.message.update({
                        where: { id: msg.id },
                        data: { status: 'SENT', whatsappMessageId: newWaId, createdAt: new Date() }
                    });
                    retried++;
                    
                    // If this was originally sent via a campaign, we might want to update the recipient status
                    // But in this view it's just general template analytics, so updating the message table is enough.
                    // Wait, MarketingRecipient has a messageId. Let's update it if exists!
                    await prisma.marketingRecipient.updateMany({
                        where: { messageId: msg.id },
                        data: { status: 'SENT', messageId: newWaId, sentAt: new Date(), failReason: null, failedAt: null }
                    });

                    await new Promise(r => setTimeout(r, 1500));
                } catch (err) {
                    const failReason = err.response?.data?.error?.message || err.message;
                    console.error(`❌ [Template Retry] Failed again for ${phone}:`, failReason);
                    await prisma.message.update({
                        where: { id: msg.id },
                        data: { status: 'FAILED' }
                    });
                    
                    await prisma.marketingRecipient.updateMany({
                        where: { messageId: msg.id },
                        data: { status: 'FAILED', failedAt: new Date(), failReason }
                    });
                    stillFailed++;
                }
            }
            console.log(`🔄 [Template Retry] Done: ${retried} resent, ${stillFailed} still failed`);
        });

    } catch (error) {
        console.error('❌ [retryTemplateFailed]', error);
        res.status(500).json({ error: 'Tekrar gönderim başlatılamadı' });
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

        // Create job tracker entry
        const jobId = randomUUID();
        bulkSendJobs.set(jobId, {
            sent: 0,
            failed: 0,
            total: contacts.length,
            done: false,
            templateName: template.name,
            lastError: null,
            errors: [],
            startedAt: Date.now()
        });

        // Respond immediately with jobId — send in background
        res.json({
            success: true,
            jobId,
            queued: contacts.length,
            templateName: template.name,
            message: `${contacts.length} kişiye "${template.name}" şablonu gönderiliyor...`
        });

        // Background send with 1.5s delay between messages (WhatsApp rate limit)
        setImmediate(async () => {
            const job = bulkSendJobs.get(jobId);
            let sent = 0, failed = 0;

            // ── Pre-upload media header ONCE before the loop (VIDEO/IMAGE/DOCUMENT) ──
            let prebuiltHeaderParam = null;
            if (template.headerType && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(template.headerType)) {
                const mediaUrl = toAbsoluteUrl(template.headerContent);

                if (mediaUrl) {
                    const needsUpload = mediaUrl.includes('scontent.whatsapp.net')
                        || mediaUrl.includes('scontent.cdninstagram.com')
                        || mediaUrl.includes('drive.google.com')
                        || mediaUrl.includes('drive.usercontent.google.com');

                    if (needsUpload) {
                        console.log(`☁️ [BulkSend] Uploading media to Meta once for all contacts...`);
                        const mediaId = await uploadMediaToMeta(mediaUrl, template.headerType, whatsappPhone.phoneNumberId, whatsappPhone.accessToken);
                        if (mediaId) {
                            prebuiltHeaderParam = { type: template.headerType.toLowerCase(), [template.headerType.toLowerCase()]: { id: mediaId } };
                            console.log(`✅ [BulkSend] Media uploaded, id: ${mediaId}`);
                        } else {
                            prebuiltHeaderParam = { type: template.headerType.toLowerCase(), [template.headerType.toLowerCase()]: { link: mediaUrl } };
                        }
                    } else {
                        prebuiltHeaderParam = { type: template.headerType.toLowerCase(), [template.headerType.toLowerCase()]: { link: mediaUrl } };
                    }
                    console.log(`📎 [BulkSend] Header param ready:`, JSON.stringify(prebuiltHeaderParam));
                } else {
                    console.warn(`⚠️ [BulkSend] Template has media header but no headerContent stored — skipping header component`);
                }
            }

            for (let i = 0; i < contacts.length; i++) {
                const contact = contacts[i];
                try {
                    // Clean phone — same as automation controller
                    let phone = contact.phone.replace(/[\s\+\-\(\)]/g, '');
                    if (phone.startsWith('0')) phone = '90' + phone.substring(1);
                    else if (!phone.startsWith('90') && phone.length === 10) phone = '90' + phone;

                    // Build payload — EXACT same structure as automation sendTemplateMessage
                    const payload = {
                        messaging_product: 'whatsapp',
                        to: phone,
                        type: 'template',
                        template: {
                            name: template.name,
                            language: { code: template.language || 'tr' }
                        }
                    };

                    const components = [];

                    // Header component (pre-built above)
                    if (prebuiltHeaderParam) {
                        components.push({ type: 'header', parameters: [prebuiltHeaderParam] });
                    }

                    // Body: only add parameters if template has {{N}} placeholders
                    // (same condition as automation: variables.length > 0)
                    const bodyPlaceholders = (template.bodyText?.match(/\{\{\d+\}\}/g) || []);
                    if (bodyPlaceholders.length > 0) {
                        const contactName = contact.fullName || contact.name || phone;
                        const bodyParams = bodyPlaceholders.map((_, idx) => ({
                            type: 'text',
                            text: idx === 0 ? contactName : ''
                        }));
                        components.push({ type: 'body', parameters: bodyParams });
                    }

                    // Only attach components if there are any (same as automation)
                    if (components.length > 0) {
                        payload.template.components = components;
                    }

                    // Debug log for first contact
                    if (i === 0) {
                        console.log(`🔍 [BulkSend] First contact payload:`, JSON.stringify(payload, null, 2));
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
                    // Update job progress
                    if (job) { job.sent = sent; job.failed = failed; }
                    console.log(`📤 [BulkSend] ${sent}/${contacts.length} sent to ${phone}`);
                } catch (err) {
                    failed++;
                    // Extract detailed error info from WhatsApp API response
                    const waError = err.response?.data?.error;
                    const errMsg = waError?.error_user_msg || waError?.message || err.message || 'Bilinmeyen hata';
                    const errCode = waError?.code || err.response?.status || '';
                    const fullErrLog = `[${errCode}] ${errMsg}`;
                    if (job) {
                        job.sent = sent;
                        job.failed = failed;
                        job.lastError = fullErrLog;
                        if (job.errors.length < 5) job.errors.push({ phone: contact.phone, msg: fullErrLog });
                    }
                    console.error(`❌ [BulkSend] Failed for contact ${contact.id} (${contact.phone}):`, JSON.stringify(waError || err.message));

                    // Save FAILED message to DB so it appears in analytics with the error reason
                    try {
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
                                content: `[Şablon: ${template.name}]\n${template.bodyText}\n\n[HATA: ${fullErrLog}]`,
                                messageType: 'TEMPLATE',
                                isFromContact: false,
                                status: 'FAILED'
                            }
                        });
                    } catch (dbErr) {
                        console.error(`⚠️ [BulkSend] Failed to save FAILED message to DB:`, dbErr.message);
                    }
                } // end catch(err)

                // Rate limit delay (skip after last contact)
                if (i < contacts.length - 1) {
                    await new Promise(r => setTimeout(r, 1500));
                }
            }

            // Mark job as done
            if (job) { job.done = true; job.sent = sent; job.failed = failed; }
            console.log(`✅ [BulkSend] Done. Sent: ${sent}, Failed: ${failed}, Template: ${template.name}`);
        });

    } catch (error) {
        console.error('❌ [bulkSendTemplate]', error);
        res.status(500).json({ error: 'Toplu gönderim başlatılamadı' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /marketing/:workspaceId/bulk-send-status/:jobId
// Poll for live progress of a running bulk send job
// ─────────────────────────────────────────────────────────────────────────────
export const getBulkSendStatus = async (req, res) => {
    const { jobId } = req.params;
    const job = bulkSendJobs.get(jobId);
    if (!job) return res.status(404).json({ error: 'Job bulunamadı' });
    res.json({
        sent: job.sent,
        failed: job.failed,
        total: job.total,
        done: job.done,
        templateName: job.templateName,
        lastError: job.lastError || null,
        errors: job.errors || []
    });
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

// ═══════════════════════════════════════════════════════════════════════════════
// Madde 9: Pazarlama İyileştirmeleri
// ═══════════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// POST /marketing/:workspaceId/campaigns/:id/retry
// Başarısız (FAILED) alıcılara tekrar gönderim yap
// ─────────────────────────────────────────────────────────────────────────────
export const retryCampaignFailed = async (req, res) => {
    try {
        const { workspaceId, id } = req.params;
        const { messageIds } = req.body;

        const campaign = await prisma.marketingCampaign.findFirst({
            where: { id, workspaceId },
            include: { template: true }
        });
        if (!campaign) return res.status(404).json({ error: 'Kampanya bulunamadı' });

        // Başarısız alıcıları bul
        const whereClause = { campaignId: id, status: 'FAILED' };
        if (messageIds && Array.isArray(messageIds) && messageIds.length > 0) {
            whereClause.messageId = { in: messageIds };
        }

        const failedRecipients = await prisma.marketingRecipient.findMany({
            where: whereClause
        });

        if (failedRecipients.length === 0) {
            return res.json({ success: true, retried: 0, message: 'Başarısız alıcı yok' });
        }

        const template = campaign.template;
        const whatsappPhone = await prisma.whatsappPhoneNumber.findFirst({ where: { workspaceId } });
        if (!whatsappPhone) return res.status(400).json({ error: 'WhatsApp numarası bağlı değil' });

        // Kampanyayı tekrar RUNNING yap
        await prisma.marketingCampaign.update({
            where: { id },
            data: { status: 'RUNNING' }
        });

        res.json({
            success: true,
            retrying: failedRecipients.length,
            message: `${failedRecipients.length} başarısız alıcıya tekrar gönderiliyor...`
        });

        // Arka planda gönder
        setImmediate(async () => {
            let retried = 0, stillFailed = 0;

            for (const recipient of failedRecipients) {
                try {
                    // Alıcıyı PENDING'e çevir
                    await prisma.marketingRecipient.update({
                        where: { id: recipient.id },
                        data: { status: 'PENDING', failReason: null, failedAt: null }
                    });

                    const payload = {
                        messaging_product: 'whatsapp',
                        to: recipient.phone,
                        type: 'template',
                        template: {
                            name: template.name,
                            language: { code: template.language || 'tr' }
                        }
                    };

                    const WHATSAPP_API_VERSION = process.env.WHATSAPP_API_VERSION || 'v21.0';
                    const apiUrl = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${whatsappPhone.phoneNumberId}/messages`;
                    const response = await axios.post(apiUrl, payload, {
                        headers: { Authorization: `Bearer ${whatsappPhone.accessToken}`, 'Content-Type': 'application/json' }
                    });

                    const messageId = response.data?.messages?.[0]?.id;
                    await prisma.marketingRecipient.update({
                        where: { id: recipient.id },
                        data: { status: 'SENT', messageId, sentAt: new Date() }
                    });
                    retried++;

                    await new Promise(r => setTimeout(r, 1500));
                } catch (err) {
                    console.error(`❌ [Campaign Retry] Failed again for ${recipient.phone}:`, err.response?.data?.error?.message || err.message);
                    await prisma.marketingRecipient.update({
                        where: { id: recipient.id },
                        data: { status: 'FAILED', failedAt: new Date(), failReason: err.response?.data?.error?.message || err.message }
                    });
                    stillFailed++;
                }
            }

            // Kampanya durumunu güncelle
            const counts = await getCampaignCounts(id);
            await prisma.marketingCampaign.update({
                where: { id },
                data: { status: 'COMPLETED', ...counts }
            });

            console.log(`🔄 [Campaign Retry] Done: ${retried} resent, ${stillFailed} still failed`);
        });

    } catch (error) {
        console.error('❌ [retryCampaignFailed]', error);
        res.status(500).json({ error: 'Tekrar gönderim başlatılamadı' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /marketing/:workspaceId/campaigns/:id/check-duplicates
// Kampanya göndermeden önce duplikasyon kontrolü
// Aynı kişiye aynı şablonun X saat içinde gönderilip gönderilmediğini kontrol eder
// ─────────────────────────────────────────────────────────────────────────────
export const checkCampaignDuplicates = async (req, res) => {
    try {
        const { workspaceId, id } = req.params;
        const { contactIds = [], windowHours = 24 } = req.body;

        const campaign = await prisma.marketingCampaign.findFirst({
            where: { id, workspaceId },
            select: { templateId: true }
        });
        if (!campaign) return res.status(404).json({ error: 'Kampanya bulunamadı' });

        // Son X saat içinde aynı şablonla gönderilmiş kişileri bul
        const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

        const alreadySent = await prisma.marketingRecipient.findMany({
            where: {
                campaign: { templateId: campaign.templateId, workspaceId },
                contactId: { in: contactIds },
                status: { in: ['SENT', 'DELIVERED', 'READ'] },
                sentAt: { gte: since }
            },
            select: { contactId: true, phone: true, sentAt: true }
        });

        const duplicateIds = [...new Set(alreadySent.map(r => r.contactId).filter(Boolean))];
        const safeIds = contactIds.filter(id => !duplicateIds.includes(id));

        res.json({
            total: contactIds.length,
            duplicates: duplicateIds.length,
            safe: safeIds.length,
            duplicateContactIds: duplicateIds,
            safeContactIds: safeIds,
            windowHours,
            message: duplicateIds.length > 0
                ? `${duplicateIds.length} kişiye son ${windowHours} saat içinde zaten gönderilmiş`
                : 'Duplikasyon yok, güvenle gönderilebilir'
        });

    } catch (error) {
        console.error('❌ [checkCampaignDuplicates]', error);
        res.status(500).json({ error: 'Duplikasyon kontrolü yapılamadı' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /marketing/:workspaceId/campaigns/:id/recipients
// Kampanya alıcılarının durumlarını detaylı göster
// ─────────────────────────────────────────────────────────────────────────────
export const getCampaignRecipients = async (req, res) => {
    try {
        const { workspaceId, id } = req.params;
        const { status, page = 1, limit = 50 } = req.query;

        const where = { campaignId: id };
        if (status) where.status = status;

        const [recipients, total] = await Promise.all([
            prisma.marketingRecipient.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (parseInt(page) - 1) * parseInt(limit),
                take: parseInt(limit),
                include: {
                    contact: { select: { id: true, name: true, phone: true, avatar: true } }
                }
            }),
            prisma.marketingRecipient.count({ where })
        ]);

        // Durum özeti
        const statusCounts = await prisma.marketingRecipient.groupBy({
            by: ['status'],
            where: { campaignId: id },
            _count: { id: true }
        });

        res.json({
            recipients,
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            statusCounts: Object.fromEntries(statusCounts.map(s => [s.status, s._count.id]))
        });

    } catch (error) {
        console.error('❌ [getCampaignRecipients]', error);
        res.status(500).json({ error: 'Alıcılar yüklenemedi' });
    }
};

// Yardımcı: Kampanya sayılarını güncelle
async function getCampaignCounts(campaignId) {
    const [sent, delivered, read, failed] = await Promise.all([
        prisma.marketingRecipient.count({ where: { campaignId, status: 'SENT' } }),
        prisma.marketingRecipient.count({ where: { campaignId, status: 'DELIVERED' } }),
        prisma.marketingRecipient.count({ where: { campaignId, status: 'READ' } }),
        prisma.marketingRecipient.count({ where: { campaignId, status: 'FAILED' } }),
    ]);
    return { sentCount: sent, deliveredCount: delivered, readCount: read, failedCount: failed };
}
