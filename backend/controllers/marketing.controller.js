import prisma from '../lib/prisma.js';
import axios from 'axios';
import { randomUUID } from 'crypto';
import { generateCaseNumber } from './case.controller.js';

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
        const { search = '', status = '', source = '', tag = '', segment = '', page = 1, limit = 50 } = req.query;

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

        // Smart Segment filter
        if (segment) {
            const { buildSegmentWhere } = await import('../services/smartSegment.service.js');
            const segResult = await buildSegmentWhere(segment, workspaceId);
            if (segResult.contactIds) {
                where.id = { in: segResult.contactIds };
            } else if (segResult.where) {
                Object.assign(where, segResult.where);
            }
        }

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

        // Get distinct tags for filter dropdown
        const allContactTags = await prisma.contact.findMany({
            where: { workspaceId, isDeleted: false, phone: { not: null }, tags: { not: '[]' } },
            select: { tags: true }
        });
        const tagSet = new Set();
        allContactTags.forEach(c => {
            try { JSON.parse(c.tags || '[]').forEach(t => { if (t && !t.startsWith('v_')) tagSet.add(t); }); } catch {}
        });

        res.json({
            contacts: parsed,
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(total / parseInt(limit)),
            filters: {
                statuses: statuses.map(s => s.status).filter(Boolean),
                sources: sources.map(s => s.source).filter(Boolean),
                tags: [...tagSet].sort()
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
        // Build contact query
        let contactWhere = { 
            workspaceId, 
            isDeleted: false, 
            isBlocked: false, 
            marketingOptOut: false, 
            phone: { not: null },
            NOT: { consentChannels: { contains: '"messaging":false' } }
        };

        if (selectAll) {
            // Filter-based: fetch all matching contacts (no pagination)
            const { search = '', status = '', source = '', tag = '', segment = '' } = filters;
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
            if (tag) contactWhere.tags = { contains: tag };
            if (segment) {
                const { buildSegmentWhere } = await import('../services/smartSegment.service.js');
                const segResult = await buildSegmentWhere(segment, workspaceId);
                if (segResult.contactIds) {
                    contactWhere.id = { in: segResult.contactIds };
                } else if (segResult.where) {
                    Object.assign(contactWhere, segResult.where);
                }
            }
        } else {
            // ID-based: specific selected contacts
            contactWhere.id = { in: contactIds };
        }

        // Fetch contacts
        const contacts = await prisma.contact.findMany({
            where: contactWhere,
            select: { id: true, name: true, fullName: true, phone: true }
        });

        // ── DEDUP: Aynı kişiye aynı şablonu 24 saat içinde tekrar gönderme ──
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const recentlySent = await prisma.message.findMany({
            where: {
                content: { startsWith: `[Şablon: ${template.name}]` },
                messageType: 'TEMPLATE',
                isFromContact: false,
                createdAt: { gte: twentyFourHoursAgo },
                conversation: { workspaceId }
            },
            select: { conversation: { select: { contactId: true } } }
        });
        const recentContactIds = new Set(recentlySent.map(m => m.conversation?.contactId).filter(Boolean));
        
        // Telefon numarasına göre de dedup (aynı numara farklı contact kayıtları)
        const seenPhones = new Set();
        const dedupedContacts = contacts.filter(c => {
            if (recentContactIds.has(c.id)) {
                console.log(`⏭️ [BulkSend] Skipping ${c.id} — template "${template.name}" already sent in last 24h`);
                return false;
            }
            const phone = c.phone?.replace(/[\s\+\-\(\)]/g, '');
            if (seenPhones.has(phone)) {
                console.log(`⏭️ [BulkSend] Skipping duplicate phone ${phone}`);
                return false;
            }
            seenPhones.add(phone);
            return true;
        });

        const skippedCount = contacts.length - dedupedContacts.length;
        if (skippedCount > 0) {
            console.log(`📋 [BulkSend] ${skippedCount} contact(s) skipped (already sent or duplicate)`);
        }

        // Create job tracker entry
        const jobId = randomUUID();
        bulkSendJobs.set(jobId, {
            sent: 0,
            failed: 0,
            skipped: skippedCount,
            total: dedupedContacts.length,
            done: false,
            templateName: template.name,
            lastError: null,
            errors: [],
            startedAt: Date.now()
        });

        // ── Kampanya kaydı oluştur ──
        let campaign = null;
        try {
            campaign = await prisma.marketingCampaign.create({
                data: {
                    workspaceId,
                    name: `${template.name} - ${new Date().toLocaleDateString('tr-TR')}`,
                    templateId: template.id,
                    type: 'BULK',
                    status: 'SENDING',
                    totalCount: dedupedContacts.length
                }
            });
            // campaignId'yi job tracker'a da ekle (sonradan conversation'lara bağlamak için)
            bulkSendJobs.get(jobId).campaignId = campaign.id;
        } catch (campErr) {
            console.error('❌ [BulkSend] Campaign creation failed:', campErr.message);
        }

        // Respond immediately with jobId — send in background
        res.json({
            success: true,
            jobId,
            queued: dedupedContacts.length,
            skipped: skippedCount,
            templateName: template.name,
            message: skippedCount > 0
                ? `${dedupedContacts.length} kişiye "${template.name}" şablonu gönderiliyor... (${skippedCount} kişi atlandı — 24 saat içinde zaten gönderilmiş)`
                : `${dedupedContacts.length} kişiye "${template.name}" şablonu gönderiliyor...`
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

            for (let i = 0; i < dedupedContacts.length; i++) {
                const contact = dedupedContacts[i];
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
                            data: { contactId: contact.id, workspaceId, whatsappPhoneNumberId: whatsappPhone.id, channel: 'WHATSAPP', status: 'OPEN', isBulkSend: true, ...(campaign?.id && { campaignId: campaign.id }) }
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

                    // ─── Auto-Case: Toplu gönderimde otomatik case oluştur/güncelle ───
                    try {
                        // Bu kişinin bu şablonla ilgili aktif case'i var mı?
                        const existingCase = await prisma.case.findFirst({
                            where: {
                                contactId: contact.id,
                                workspaceId,
                                status: 'ACTIVE',
                                title: { contains: template.name }
                            },
                            orderBy: { createdAt: 'desc' }
                        });

                        if (existingCase) {
                            // Mevcut case'e hatırlatma aktivitesi ekle
                            await prisma.contactActivity.create({
                                data: {
                                    contactId: contact.id,
                                    workspaceId,
                                    caseId: existingCase.id,
                                    type: 'NOTE',
                                    title: 'Hatırlatma Gönderildi',
                                    description: `[Toplu Gönderim] Şablon: ${template.name} tekrar gönderildi.`,
                                    status: 'COMPLETED',
                                    completedAt: new Date(),
                                    source: 'AUTOMATION'
                                }
                            });
                            // Conversation'ı bu case'e bağla
                            if (!conversation.caseId) {
                                await prisma.conversation.update({
                                    where: { id: conversation.id },
                                    data: { caseId: existingCase.id }
                                });
                            }
                            console.log(`📦 [BulkSend-AutoCase] Reminder added to case ${existingCase.caseNumber} for contact ${contact.id}`);
                        } else {
                            // Yeni case oluştur
                            const caseNumber = await generateCaseNumber(workspaceId);

                            let caseTypeId = null;
                            try {
                                const frsatType = await prisma.caseType.findFirst({ where: { workspaceId, systemCode: 'FIRSAT' } });
                                caseTypeId = frsatType?.id || null;
                            } catch (_) {}

                            const newCase = await prisma.case.create({
                                data: {
                                    workspaceId,
                                    contactId: contact.id,
                                    caseNumber,
                                    title: `WA: ${template.name}`,
                                    type: 'FIRSAT',
                                    status: 'ACTIVE',
                                    priority: 'NORMAL',
                                    caseTypeId
                                }
                            });
                            // Conversation'ı case'e bağla
                            await prisma.conversation.update({
                                where: { id: conversation.id },
                                data: { caseId: newCase.id }
                            });
                            // İlk aktiviteyi ekle
                            await prisma.contactActivity.create({
                                data: {
                                    contactId: contact.id,
                                    workspaceId,
                                    caseId: newCase.id,
                                    type: 'NOTE',
                                    title: 'Kayıt Oluşturuldu',
                                    description: `[Toplu Gönderim] Şablon: ${template.name} gönderildi.`,
                                    status: 'COMPLETED',
                                    completedAt: new Date(),
                                    source: 'AUTOMATION'
                                }
                            });
                            console.log(`📦 [BulkSend-AutoCase] Created case ${caseNumber} for contact ${contact.id}`);
                        }
                    } catch (caseErr) {
                        console.error(`⚠️ [BulkSend-AutoCase] Case error for contact ${contact.id}:`, caseErr.message);
                    }
                    // ─── End Auto-Case ───

                    sent++;
                    // Update job progress
                    if (job) { job.sent = sent; job.failed = failed; }
                    console.log(`📤 [BulkSend] ${sent}/${dedupedContacts.length} sent to ${phone}`);
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
                                data: { contactId: contact.id, workspaceId, whatsappPhoneNumberId: whatsappPhone.id, channel: 'WHATSAPP', status: 'OPEN', isBulkSend: true, ...(campaign?.id && { campaignId: campaign.id }) }
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
                if (i < dedupedContacts.length - 1) {
                    await new Promise(r => setTimeout(r, 1500));
                }
            }

            // Mark job as done
            if (job) { job.done = true; job.sent = sent; job.failed = failed; }
            // Kampanya kaydını güncelle
            if (campaign?.id) {
                try {
                    await prisma.marketingCampaign.update({
                        where: { id: campaign.id },
                        data: { status: 'COMPLETED', sentCount: sent, failedCount: failed, sentAt: new Date() }
                    });
                } catch (_) {}
            }
            console.log(`✅ [BulkSend] Done. Sent: ${sent}, Failed: ${failed}, Template: ${template.name}`);
        });

    } catch (error) {
        console.error('❌ [bulkSendTemplate]', error);
        res.status(500).json({ error: 'Toplu gönderim başlatılamadı' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /marketing/:workspaceId/campaigns
// Birleşik kampanya listesi — Bulk, Otomasyon, Arama
// ─────────────────────────────────────────────────────────────────────────────
export const getCampaigns = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { type, days = 30, page = 1, limit = 50 } = req.query;

        const where = { workspaceId };
        if (type) where.type = type;
        where.createdAt = { gte: new Date(Date.now() - parseInt(days) * 86400000) };

        const [campaigns, total] = await Promise.all([
            prisma.marketingCampaign.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (parseInt(page) - 1) * parseInt(limit),
                take: parseInt(limit),
                include: {
                    template: { select: { name: true } },
                    _count: { select: { conversations: true, cases: true } },
                    messages: {
                        select: { id: true, channel: true, name: true, order: true },
                        orderBy: { order: 'asc' }
                    }
                }
            }),
            prisma.marketingCampaign.count({ where })
        ]);

        // Özet istatistikler
        const stats = await prisma.marketingCampaign.aggregate({
            where: { workspaceId, createdAt: { gte: new Date(Date.now() - 30 * 86400000) } },
            _sum: { totalCount: true, sentCount: true, deliveredCount: true, readCount: true, repliedCount: true, convertedCount: true }
        });

        res.json({
            success: true,
            data: campaigns,
            stats: {
                totalSent: stats._sum.sentCount || 0,
                totalDelivered: stats._sum.deliveredCount || 0,
                totalRead: stats._sum.readCount || 0,
                totalReplied: stats._sum.repliedCount || 0,
                totalConverted: stats._sum.convertedCount || 0,
                replyRate: stats._sum.sentCount ? ((stats._sum.repliedCount || 0) / stats._sum.sentCount * 100).toFixed(1) : '0',
                conversionRate: stats._sum.sentCount ? ((stats._sum.convertedCount || 0) / stats._sum.sentCount * 100).toFixed(1) : '0'
            },
            pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) }
        });
    } catch (error) {
        console.error('❌ [getCampaigns]', error);
        res.status(500).json({ error: 'Kampanyalar alınamadı' });
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

// (getCampaigns is now defined earlier in the file with type/date filters + stats)
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

        if (!name) {
            return res.status(400).json({ error: 'Kampanya adı zorunludur' });
        }

        // templateId opsiyonel (yeni sistem: mesaj seviyesinde seçilir)
        let validTemplateId = null;
        if (templateId) {
            const template = await prisma.whatsappTemplate.findFirst({ where: { id: templateId, workspaceId } });
            if (!template) return res.status(404).json({ error: 'Şablon bulunamadı' });
            validTemplateId = templateId;
        }

        const campaign = await prisma.marketingCampaign.create({
            data: {
                workspaceId,
                name,
                description,
                templateId: validTemplateId,
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
            if (segmentFilter.tags?.length) {
                where.AND = (where.AND || []).concat(
                    segmentFilter.tags.map(t => ({ tags: { contains: t } }))
                );
            }
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

        const [statusCounts, sourceCounts, totalWithPhone, contactGroups] = await Promise.all([
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
            prisma.contact.count({ where: { workspaceId, phone: { not: null } } }),
            prisma.contactGroup.findMany({
                where: { workspaceId },
                select: { id: true, name: true, _count: { select: { members: true } } }
            })
        ]);

        const { getSegmentGroups, getSegmentCount, getSegmentList } = await import('../services/smartSegment.service.js');
        const segmentList = getSegmentList();
        const segmentCounts = {};
        await Promise.all(segmentList.map(async (s) => {
            try { segmentCounts[s.id] = await getSegmentCount(s.id, workspaceId); } catch { segmentCounts[s.id] = 0; }
        }));

        // Düzleştirilmiş hedef kitle listesi (frontend gönderim seçimi için)
        const targetOptions = [];

        // Tüm kişiler
        targetOptions.push({ id: 'all', name: 'Tüm Kişiler', icon: '👥', count: totalWithPhone, type: 'all' });

        // Smart segmentler
        for (const seg of segmentList) {
            targetOptions.push({
                id: seg.id,
                name: seg.label,
                icon: seg.icon,
                count: segmentCounts[seg.id] || 0,
                type: 'segment',
                group: seg.group
            });
        }

        // Gruplar
        for (const g of contactGroups) {
            targetOptions.push({
                id: `group:${g.id}`,
                name: g.name,
                icon: '📁',
                count: g._count.members,
                type: 'group',
                groupId: g.id
            });
        }

        // Durumlara göre
        for (const sc of statusCounts) {
            const statusIcons = { NEW: '🔵', CUSTOMER: '🟢', OPPORTUNITY: '🟡', SPAM: '🔴', VIP: '⭐' };
            targetOptions.push({
                id: `status:${sc.status}`,
                name: sc.status,
                icon: statusIcons[sc.status] || '⚪',
                count: sc._count.id,
                type: 'status'
            });
        }

        res.json({
            statusCounts,
            sourceCounts,
            totalWithPhone,
            segments: getSegmentGroups(),
            segmentCounts,
            contactGroups: contactGroups.map(g => ({ id: g.id, name: g.name, count: g._count.members })),
            targetOptions // Yeni: düzleştirilmiş liste
        });
    } catch (error) {
        console.error('❌ [getSegments]', error);
        res.status(500).json({ error: 'Segmentler yüklenemedi' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// Called from WhatsApp webhook status handler to update read/delivered
// ─────────────────────────────────────────────────────────────────────────────
export const updateCampaignRecipientStatus = async (whatsappMsgId, status) => {
    try {
        // WhatsApp webhook sends wamid, but MarketingRecipient.messageId stores DB UUID
        // First resolve wamid → DB message record
        const dbMessage = await prisma.message.findFirst({
            where: { OR: [{ whatsappMessageId: whatsappMsgId }, { facebookMessageId: whatsappMsgId }] },
            select: { id: true }
        });
        if (!dbMessage) return;

        const recipient = await prisma.marketingRecipient.findUnique({ where: { messageId: dbMessage.id } });
        if (!recipient) return;

        const updateData = {};
        if (status === 'delivered') { updateData.status = 'DELIVERED'; updateData.deliveredAt = new Date(); }
        else if (status === 'read') { updateData.status = 'READ'; updateData.readAt = new Date(); }
        else if (status === 'failed') { updateData.status = 'FAILED'; updateData.failedAt = new Date(); }

        if (Object.keys(updateData).length > 0) {
            await prisma.marketingRecipient.update({ where: { messageId: dbMessage.id }, data: updateData });

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

            // Update group aggregate counts (if recipient belongs to a group)
            if (recipient.groupId) {
                const [groupDelivered, groupRead, groupFailed] = await Promise.all([
                    prisma.marketingRecipient.count({ where: { groupId: recipient.groupId, status: 'DELIVERED' } }),
                    prisma.marketingRecipient.count({ where: { groupId: recipient.groupId, status: 'READ' } }),
                    prisma.marketingRecipient.count({ where: { groupId: recipient.groupId, status: 'FAILED' } })
                ]);
                await prisma.campaignGroup.update({
                    where: { id: recipient.groupId },
                    data: { deliveredCount: groupDelivered, readCount: groupRead, failedCount: groupFailed }
                });
            }
        }
    } catch (err) {
        // Non-critical — don't throw
        console.warn(`⚠️ [Campaign] Could not update recipient status for ${whatsappMsgId}:`, err.message);
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

// ═══════════════════════════════════════════════════════════════════════════════
// YENİ: Kampanya > Mesaj > Gönderim Hiyerarşisi
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GET campaigns/:id/messages — Kampanyanın mesajlarını listele ────────────
export const getCampaignMessages = async (req, res) => {
    try {
        const messages = await prisma.campaignMessage.findMany({
            where: { campaignId: req.params.id },
            include: {
                sends: {
                    include: { _count: { select: { recipients: true } } },
                    orderBy: { createdAt: 'asc' }
                }
            },
            orderBy: { order: 'asc' }
        });

        // Her mesaj için toplam istatistik hesapla
        const enriched = messages.map(msg => {
            const stats = msg.sends.reduce((acc, s) => ({
                totalCount: acc.totalCount + s.totalCount,
                sentCount: acc.sentCount + s.sentCount,
                deliveredCount: acc.deliveredCount + s.deliveredCount,
                readCount: acc.readCount + s.readCount,
                failedCount: acc.failedCount + s.failedCount,
                repliedCount: acc.repliedCount + s.repliedCount,
                sendCount: acc.sendCount + 1,
            }), { totalCount: 0, sentCount: 0, deliveredCount: 0, readCount: 0, failedCount: 0, repliedCount: 0, sendCount: 0 });

            return { ...msg, stats };
        });

        res.json({ messages: enriched });
    } catch (error) {
        console.error('❌ [getCampaignMessages]', error);
        res.status(500).json({ error: 'Mesajlar yüklenemedi' });
    }
};

// ─── POST campaigns/:id/messages — Kampanyaya mesaj ekle ─────────────────────
export const addCampaignMessage = async (req, res) => {
    try {
        const { channel, name, templateId, templateName, emailSubject, emailBody,
                retellAgentId, retellTemplateId, content, mediaUrl } = req.body;

        if (!channel) {
            return res.status(400).json({ error: 'Kanal seçimi gerekli' });
        }

        // Sıra numarasını belirle
        const maxOrder = await prisma.campaignMessage.aggregate({
            where: { campaignId: req.params.id },
            _max: { order: true }
        });

        const message = await prisma.campaignMessage.create({
            data: {
                campaignId: req.params.id,
                channel,
                name: name || `Mesaj ${(maxOrder._max.order ?? -1) + 2}`,
                templateId,
                templateName,
                emailSubject,
                emailBody,
                retellAgentId,
                retellTemplateId,
                content,
                mediaUrl,
                order: (maxOrder._max.order ?? -1) + 1
            }
        });

        res.status(201).json({ message });
    } catch (error) {
        console.error('❌ [addCampaignMessage]', error);
        res.status(500).json({ error: 'Mesaj eklenemedi' });
    }
};

// ─── DELETE campaigns/:id/messages/:msgId — Mesaj sil ────────────────────────
export const deleteCampaignMessage = async (req, res) => {
    try {
        await prisma.campaignMessage.delete({
            where: { id: req.params.msgId }
        });
        res.json({ success: true });
    } catch (error) {
        console.error('❌ [deleteCampaignMessage]', error);
        res.status(500).json({ error: 'Mesaj silinemedi' });
    }
};

// ─── GET campaigns/:id/messages/:msgId/sends — Mesajın gönderimlerini listele
export const getMessageSends = async (req, res) => {
    try {
        const sends = await prisma.campaignSend.findMany({
            where: { messageId: req.params.msgId },
            include: { _count: { select: { recipients: true } } },
            orderBy: { createdAt: 'asc' }
        });
        res.json({ sends });
    } catch (error) {
        console.error('❌ [getMessageSends]', error);
        res.status(500).json({ error: 'Gönderimler yüklenemedi' });
    }
};

// ─── POST campaigns/:id/messages/:msgId/sends — Gönderim ekle (liste + tarih)
export const addMessageSend = async (req, res) => {
    try {
        const { segmentId, segmentName, tagIds, groupId, filterSnapshot, scheduledAt, sendRate } = req.body;

        if (!segmentId && !tagIds && !groupId && !filterSnapshot) {
            return res.status(400).json({ error: 'Hedef kitle seçimi gerekli' });
        }

        // Hız sınırı: min 1, max 120, default 20
        const rate = Math.max(1, Math.min(120, parseInt(sendRate) || 20));

        const send = await prisma.campaignSend.create({
            data: {
                messageId: req.params.msgId,
                segmentId,
                segmentName,
                tagIds: tagIds ? JSON.stringify(tagIds) : null,
                groupId,
                filterSnapshot: filterSnapshot ? JSON.stringify(filterSnapshot) : null,
                scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
                sendRate: rate,
            }
        });

        res.status(201).json({ send });
    } catch (error) {
        console.error('❌ [addMessageSend]', error);
        res.status(500).json({ error: 'Gönderim eklenemedi' });
    }
};

// ─── POST campaigns/:id/messages/:msgId/sends/:sendId/execute — Gönderimi başlat
export const executeMessageSend = async (req, res) => {
    try {
        const { workspaceId, id: campaignId, msgId, sendId } = req.params;

        const send = await prisma.campaignSend.findUnique({
            where: { id: sendId },
            include: {
                message: {
                    include: { campaign: true }
                }
            }
        });

        if (!send) return res.status(404).json({ error: 'Gönderim bulunamadı' });
        if (send.status !== 'PENDING') {
            return res.status(400).json({ error: `Bu gönderim zaten ${send.status} durumunda` });
        }

        const channel = send.message.channel;
        const rate = send.sendRate || 20; // dk başına mesaj
        const delayMs = Math.round(60000 / rate); // mesajlar arası bekleme

        // ── Alıcı listesi oluştur ──
        let contacts = [];

        const safeFilter = { workspaceId, phone: { not: null }, isDeleted: false, isBlocked: false, marketingOptOut: false };

        if (send.segmentId === 'all') {
            contacts = await prisma.contact.findMany({
                where: safeFilter,
                select: { id: true, phone: true, name: true },
                take: 5000
            });
        } else if (send.segmentId?.startsWith('status:')) {
            const status = send.segmentId.replace('status:', '');
            contacts = await prisma.contact.findMany({
                where: { ...safeFilter, status },
                select: { id: true, phone: true, name: true },
                take: 5000
            });
        } else if (send.segmentId?.startsWith('group:')) {
            const groupId = send.segmentId.replace('group:', '');
            const members = await prisma.contactGroupMember.findMany({
                where: { groupId },
                select: { contactId: true }
            });
            const memberIds = members.map(m => m.contactId);
            if (memberIds.length > 0) {
                contacts = await prisma.contact.findMany({
                    where: { ...safeFilter, id: { in: memberIds } },
                    select: { id: true, phone: true, name: true }
                });
            }
        } else if (send.segmentId) {
            // Smart segment
            try {
                const { buildSegmentWhere } = await import('../services/smartSegment.service.js');
                const segResult = await buildSegmentWhere(send.segmentId, workspaceId);
                let where = { ...safeFilter };
                if (segResult.contactIds) {
                    where.id = { in: segResult.contactIds };
                } else if (segResult.where) {
                    where = { ...where, ...segResult.where };
                }
                contacts = await prisma.contact.findMany({
                    where,
                    select: { id: true, phone: true, name: true },
                    take: 5000
                });
            } catch (e) {
                console.error('❌ [executeMessageSend] Segment çözümlenemedi:', e);
                return res.status(400).json({ error: 'Segment bulunamadı: ' + send.segmentId });
            }
        }

        if (contacts.length === 0) {
            return res.status(400).json({ error: 'Bu hedef kitle için gönderilecek kişi bulunamadı' });
        }

        // ── Durumu güncelle ──
        await prisma.campaignSend.update({
            where: { id: sendId },
            data: { status: 'SENDING', sentAt: new Date(), totalCount: contacts.length }
        });

        await prisma.marketingCampaign.update({
            where: { id: campaignId },
            data: { status: 'ACTIVE' }
        });

        // ── Alıcı kayıtları oluştur ──
        await prisma.marketingRecipient.createMany({
            data: contacts.map(c => ({
                campaignId,
                sendId,
                contactId: c.id,
                phone: c.phone.replace(/[\s\+\-]/g, ''),
                name: c.name || '',
                status: 'PENDING'
            }))
        });

        // Hemen yanıt dön
        res.json({
            success: true,
            status: 'SENDING',
            sendId,
            totalRecipients: contacts.length,
            sendRate: rate,
            estimatedMinutes: Math.ceil(contacts.length / rate)
        });

        // ── Background gönderim ──
        setImmediate(async () => {
            let sentCount = 0, failedCount = 0;

            try {
                if (channel === 'WHATSAPP') {
                    // WA şablon gönderimi
                    const template = send.message.templateId
                        ? await prisma.whatsappTemplate.findUnique({ where: { id: send.message.templateId } })
                        : null;

                    if (!template) {
                        await prisma.campaignSend.update({ where: { id: sendId }, data: { status: 'FAILED' } });
                        console.error('❌ [executeMessageSend] Template bulunamadı');
                        return;
                    }

                    const whatsappPhone = await prisma.whatsappPhoneNumber.findFirst({ where: { workspaceId } });
                    if (!whatsappPhone) {
                        await prisma.campaignSend.update({ where: { id: sendId }, data: { status: 'FAILED' } });
                        console.error('❌ [executeMessageSend] WA numarası bulunamadı');
                        return;
                    }

                    // Media hazırla
                    let cachedMediaId = null;
                    if (template.headerType && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(template.headerType)) {
                        const rawUrl = toAbsoluteUrl(template.headerContent);
                        if (rawUrl) {
                            try {
                                cachedMediaId = await uploadMediaToMeta(rawUrl, template.headerType, whatsappPhone.phoneNumberId, whatsappPhone.accessToken);
                            } catch (e) { console.warn('⚠️ Media yüklenemedi:', e.message); }
                        }
                    }

                    const dbRecipients = await prisma.marketingRecipient.findMany({ where: { sendId } });

                    for (const recipient of dbRecipients) {
                        try {
                            const components = [];
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
                        } catch (err) {
                            console.error(`❌ [CampaignSend] Failed ${recipient.phone}:`, err.response?.data || err.message);
                            await prisma.marketingRecipient.update({
                                where: { id: recipient.id },
                                data: { status: 'FAILED', failedAt: new Date(), failReason: err.response?.data?.error?.message || err.message }
                            });
                            failedCount++;
                        }

                        // Rate limiting
                        await new Promise(r => setTimeout(r, delayMs));
                    }

                } else if (channel === 'CALL') {
                    // AI Arama — Retell entegrasyonu
                    // TODO: Retell API bağlantısı eklenecek
                    // Şimdilik sadece durum güncelleme
                    console.log(`📞 [CampaignSend] CALL gönderimi: ${contacts.length} kişi, hız: ${rate}/dk`);
                    await prisma.campaignSend.update({ where: { id: sendId }, data: { status: 'COMPLETED' } });
                    return;

                } else {
                    // EMAIL, CUSTOM — gelecek
                    console.log(`📧 [CampaignSend] ${channel} gönderimi: ${contacts.length} kişi`);
                    await prisma.campaignSend.update({ where: { id: sendId }, data: { status: 'COMPLETED' } });
                    return;
                }

                // Gönderim tamamlandı
                await prisma.campaignSend.update({
                    where: { id: sendId },
                    data: { status: 'COMPLETED', sentCount, failedCount }
                });

                // Kampanya toplam sayıları güncelle
                const counts = await getCampaignCounts(campaignId);
                const totalRecipients = await prisma.marketingRecipient.count({ where: { campaignId } });
                await prisma.marketingCampaign.update({
                    where: { id: campaignId },
                    data: { ...counts, totalCount: totalRecipients }
                });

                console.log(`✅ [CampaignSend] ${sendId} tamamlandı: ${sentCount} gönderildi, ${failedCount} hata`);
            } catch (err) {
                console.error('❌ [CampaignSend] Background hata:', err);
                await prisma.campaignSend.update({ where: { id: sendId }, data: { status: 'FAILED' } });
            }
        });

    } catch (error) {
        console.error('❌ [executeMessageSend]', error);
        res.status(500).json({ error: 'Gönderim başlatılamadı' });
    }
};

// ─── GET campaigns/:id/messages/:msgId/sends/:sendId/recipients — Alıcı listesi
export const getSendRecipients = async (req, res) => {
    try {
        const { page = 1, limit = 50 } = req.query;

        const [recipients, total] = await Promise.all([
            prisma.marketingRecipient.findMany({
                where: { sendId: req.params.sendId },
                orderBy: { createdAt: 'desc' },
                skip: (parseInt(page) - 1) * parseInt(limit),
                take: parseInt(limit)
            }),
            prisma.marketingRecipient.count({
                where: { sendId: req.params.sendId }
            })
        ]);

        res.json({ recipients, total, page: parseInt(page), limit: parseInt(limit) });
    } catch (error) {
        console.error('❌ [getSendRecipients]', error);
        res.status(500).json({ error: 'Alıcılar yüklenemedi' });
    }
};

// ─── GET campaigns/:id/stats — Kampanya toplam istatistikleri ────────────────
export const getCampaignStats = async (req, res) => {
    try {
        const campaign = await prisma.marketingCampaign.findUnique({
            where: { id: req.params.id },
            include: {
                messages: {
                    include: {
                        sends: {
                            select: {
                                id: true, status: true, totalCount: true,
                                sentCount: true, deliveredCount: true,
                                readCount: true, failedCount: true, repliedCount: true,
                                scheduledAt: true, sentAt: true,
                                segmentName: true
                            }
                        }
                    }
                }
            }
        });

        if (!campaign) {
            return res.status(404).json({ error: 'Kampanya bulunamadı' });
        }

        // Toplam istatistik
        let totals = { totalCount: 0, sentCount: 0, deliveredCount: 0, readCount: 0, failedCount: 0, repliedCount: 0 };
        let messageStats = [];

        for (const msg of campaign.messages) {
            let msgTotals = { totalCount: 0, sentCount: 0, deliveredCount: 0, readCount: 0, failedCount: 0, repliedCount: 0 };
            for (const send of msg.sends) {
                msgTotals.totalCount += send.totalCount;
                msgTotals.sentCount += send.sentCount;
                msgTotals.deliveredCount += send.deliveredCount;
                msgTotals.readCount += send.readCount;
                msgTotals.failedCount += send.failedCount;
                msgTotals.repliedCount += send.repliedCount;
            }
            messageStats.push({
                messageId: msg.id,
                channel: msg.channel,
                name: msg.name,
                sendCount: msg.sends.length,
                ...msgTotals
            });
            // Global toplam
            totals.totalCount += msgTotals.totalCount;
            totals.sentCount += msgTotals.sentCount;
            totals.deliveredCount += msgTotals.deliveredCount;
            totals.readCount += msgTotals.readCount;
            totals.failedCount += msgTotals.failedCount;
            totals.repliedCount += msgTotals.repliedCount;
        }

        res.json({
            campaignId: campaign.id,
            name: campaign.name,
            status: campaign.status,
            messageCount: campaign.messages.length,
            totals,
            messageStats
        });
    } catch (error) {
        console.error('❌ [getCampaignStats]', error);
        res.status(500).json({ error: 'İstatistikler yüklenemedi' });
    }
};

// ─── DELETE campaigns/:id/messages/:msgId/sends/:sendId — Gönderim sil ───────
export const deleteCampaignSend = async (req, res) => {
    try {
        await prisma.campaignSend.delete({ where: { id: req.params.sendId } });
        res.json({ success: true });
    } catch (error) {
        console.error('❌ [deleteCampaignSend]', error);
        res.status(500).json({ error: 'Gönderim silinemedi' });
    }
};

// ─── PUT campaigns/:id/messages/:msgId — Mesaj güncelle ──────────────────────
export const updateCampaignMessage = async (req, res) => {
    try {
        const { name, templateId, templateName, emailSubject, emailBody,
                retellAgentId, retellTemplateId, content, mediaUrl } = req.body;

        const updated = await prisma.campaignMessage.update({
            where: { id: req.params.msgId },
            data: {
                ...(name !== undefined && { name }),
                ...(templateId !== undefined && { templateId }),
                ...(templateName !== undefined && { templateName }),
                ...(emailSubject !== undefined && { emailSubject }),
                ...(emailBody !== undefined && { emailBody }),
                ...(retellAgentId !== undefined && { retellAgentId }),
                ...(retellTemplateId !== undefined && { retellTemplateId }),
                ...(content !== undefined && { content }),
                ...(mediaUrl !== undefined && { mediaUrl }),
            }
        });

        res.json({ message: updated });
    } catch (error) {
        console.error('❌ [updateCampaignMessage]', error);
        res.status(500).json({ error: 'Mesaj güncellenemedi' });
    }
};
