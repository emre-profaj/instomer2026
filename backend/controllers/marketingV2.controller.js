import prisma from '../lib/prisma.js';
import axios from 'axios';
import { randomUUID } from 'crypto';
import Retell from 'retell-sdk';
import { normalizePhone } from '../utils/phoneNormalizer.js';
import { sendSms } from '../services/netgsm.service.js';
import { sendEmailViaChannel } from '../services/emailSender.service.js';

// ══════════════════════════════════════════════════════════════════════════
// 1. CAMPAIGNS CRUD
// ══════════════════════════════════════════════════════════════════════════

export async function ensureDefaultGroupsForLegacyCampaigns(workspaceId) {
    try {
        const emptyCampaigns = await prisma.marketingCampaign.findMany({
            where: {
                workspaceId,
                type: { not: 'ARCHIVE_DEFAULT' },
                groups: { none: {} }
            },
            include: {
                _count: { select: { recipients: true, messagesLegacy: true } }
            }
        });

        let updated = 0;
        for (const camp of emptyCampaigns) {
            if (camp.sentCount > 0 || camp._count.recipients > 0 || camp._count.messagesLegacy > 0 || camp.templateId) {
                const groupName = `${camp.name} - Reklam Grubu`;
                const sentCount = camp.sentCount || camp._count.recipients || 0;
                const deliveredCount = camp.deliveredCount || 0;
                const readCount = camp.readCount || 0;
                const failedCount = camp.failedCount || 0;

                const newGroup = await prisma.campaignGroup.create({
                    data: {
                        campaignId: camp.id,
                        name: groupName,
                        channel: 'WHATSAPP',
                        status: camp.status === 'DRAFT' ? 'COMPLETED' : (camp.status || 'COMPLETED'),
                        sentCount,
                        deliveredCount,
                        readCount,
                        failedCount,
                        sentAt: camp.sentAt || camp.createdAt
                    }
                });

                // Link existing recipients without groupId to this group
                await prisma.marketingRecipient.updateMany({
                    where: {
                        campaignId: camp.id,
                        groupId: null
                    },
                    data: {
                        groupId: newGroup.id
                    }
                }).catch(() => {});

                // Link template message if available
                if (camp.templateId) {
                    let mMsg = await prisma.marketingMessage.findFirst({
                        where: { workspaceId, templateId: camp.templateId }
                    });
                    if (!mMsg) {
                        const waT = await prisma.whatsappTemplate.findUnique({ where: { id: camp.templateId } }).catch(() => null);
                        if (waT) {
                            mMsg = await prisma.marketingMessage.create({
                                data: {
                                    workspaceId,
                                    name: waT.name || 'WhatsApp Şablonu',
                                    channel: 'WHATSAPP',
                                    templateId: waT.id,
                                    templateName: waT.name,
                                    content: waT.bodyText || ''
                                }
                            });
                        }
                    }
                    if (mMsg) {
                        await prisma.campaignGroupMessage.create({
                            data: {
                                groupId: newGroup.id,
                                messageId: mMsg.id
                            }
                        }).catch(() => {});
                    }
                }
                updated++;
            }
        }
        return updated;
    } catch (err) {
        console.warn('⚠️ [ensureDefaultGroupsForLegacyCampaigns]', err.message);
        return 0;
    }
}

export const getCampaigns = async (req, res) => {
    try {
        const { workspaceId } = req.params;

        // Auto-ensure legacy campaigns without groups are given a default group
        await ensureDefaultGroupsForLegacyCampaigns(workspaceId).catch(() => {});

        // Auto-sync past messages and calls into date-based campaigns seamlessly (Zero button click required!)
        await syncPastDataCore(workspaceId).catch(err => console.warn('⚠️ [getCampaigns:autoSync]', err.message));

        const campaigns = await prisma.marketingCampaign.findMany({
            where: { workspaceId },
            include: {
                groups: {
                    include: { groupMessages: { include: { message: true } }, list: true }
                },
                messagesLegacy: true,
                _count: { select: { recipients: true, groups: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        const mapped = campaigns.map(c => {
            const isAutomation = c.type === 'AUTOMATION' || Boolean(c.automationId);
            const isArchive = c.type === 'ARCHIVE_DEFAULT' || c.type === 'LEGACY_DATE_SYNC';
            const isLegacy = !isAutomation && !isArchive && c.groups.length === 0 && (c._count.recipients > 0 || c.messagesLegacy.length > 0 || c.templateId != null);

            const groupsSent = c.groups.reduce((sum, g) => sum + (g.sentCount || 0), 0);
            const groupsDelivered = c.groups.reduce((sum, g) => sum + (g.deliveredCount || 0), 0);
            const groupsRead = c.groups.reduce((sum, g) => sum + (g.readCount || 0), 0);
            const groupsFailed = c.groups.reduce((sum, g) => sum + (g.failedCount || 0), 0);

            const sent = Math.max(c.sentCount || 0, groupsSent);
            const delivered = Math.max(c.deliveredCount || 0, groupsDelivered);
            const read = Math.max(c.readCount || 0, groupsRead);
            const failed = Math.max(c.failedCount || 0, groupsFailed);

            return {
                ...c,
                isLegacy,
                isAutomation,
                isArchive,
                groupsCount: c._count.groups,
                recipientsCount: c._count.recipients,
                stats: {
                    sent,
                    delivered,
                    read,
                    failed,
                    replied: c.repliedCount || 0
                }
            };
        });

        // Aggregate stats for top bar (excluding automation logs from marketing KPIs if desired, or all)
        const stats = {
            total: mapped.length,
            active: mapped.filter(c => c.status === 'ACTIVE').length,
            sent: mapped.reduce((sum, c) => sum + (c.stats.sent || 0), 0),
            delivered: mapped.reduce((sum, c) => sum + (c.stats.delivered || 0), 0),
            read: mapped.reduce((sum, c) => sum + (c.stats.read || 0), 0)
        };

        res.json({ success: true, campaigns: mapped, stats });
    } catch (error) {
        console.error('❌ [getCampaigns]', error);
        res.status(500).json({ error: 'Kampanyalar getirilemedi' });
    }
};

export const createCampaign = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { name, description, budget, startDate, endDate } = req.body;

        const campaign = await prisma.marketingCampaign.create({
            data: {
                workspaceId,
                name,
                description,
                budget,
                startDate: startDate ? new Date(startDate) : null,
                endDate: endDate ? new Date(endDate) : null,
                status: 'DRAFT',
                type: 'MULTI_TIER'
            }
        });

        res.json({ success: true, campaign });
    } catch (error) {
        console.error('❌ [createCampaign]', error);
        res.status(500).json({ error: 'Kampanya oluşturulamadı' });
    }
};

export const getCampaign = async (req, res) => {
    try {
        const { workspaceId, id } = req.params;

        const campaign = await prisma.marketingCampaign.findFirst({
            where: { id, workspaceId },
            include: {
                groups: {
                    include: { groupMessages: { include: { message: true } }, list: true }
                },
                messagesLegacy: true,
                _count: { select: { recipients: true, groups: true } }
            }
        });

        if (!campaign) return res.status(404).json({ error: 'Kampanya bulunamadı' });

        const groupsSent = campaign.groups.reduce((sum, g) => sum + (g.sentCount || 0), 0);
        const groupsDelivered = campaign.groups.reduce((sum, g) => sum + (g.deliveredCount || 0), 0);
        const groupsRead = campaign.groups.reduce((sum, g) => sum + (g.readCount || 0), 0);
        const groupsFailed = campaign.groups.reduce((sum, g) => sum + (g.failedCount || 0), 0);

        const sent = Math.max(campaign.sentCount || 0, groupsSent);
        const delivered = Math.max(campaign.deliveredCount || 0, groupsDelivered);
        const read = Math.max(campaign.readCount || 0, groupsRead);
        const failed = Math.max(campaign.failedCount || 0, groupsFailed);

        const isLegacy = campaign.groups.length === 0 && (campaign._count.recipients > 0 || campaign.messagesLegacy.length > 0 || campaign.templateId != null);

        res.json({
            success: true,
            campaign: {
                ...campaign,
                isLegacy,
                stats: { sent, delivered, read, failed }
            }
        });
    } catch (error) {
        console.error('❌ [getCampaign]', error);
        res.status(500).json({ error: 'Kampanya detayı getirilemedi' });
    }
};

export const updateCampaign = async (req, res) => {
    try {
        const { workspaceId, id } = req.params;
        const { name, description, budget, startDate, endDate, status } = req.body;

        const campaign = await prisma.marketingCampaign.update({
            where: { id, workspaceId },
            data: {
                name,
                description,
                budget,
                status,
                startDate: startDate ? new Date(startDate) : undefined,
                endDate: endDate ? new Date(endDate) : undefined
            }
        });

        res.json({ success: true, campaign });
    } catch (error) {
        console.error('❌ [updateCampaign]', error);
        res.status(500).json({ error: 'Kampanya güncellenemedi' });
    }
};

export const deleteCampaign = async (req, res) => {
    try {
        const { workspaceId, id } = req.params;

        // Bağımlı kayıtları temizle
        await prisma.marketingRecipient.deleteMany({ where: { campaignId: id } }).catch(() => {});
        await prisma.campaignGroup.deleteMany({ where: { campaignId: id } }).catch(() => {});
        await prisma.campaignMessage.deleteMany({ where: { campaignId: id } }).catch(() => {});

        await prisma.marketingCampaign.deleteMany({
            where: { id, workspaceId }
        });

        res.json({ success: true, message: 'Kampanya silindi' });
    } catch (error) {
        console.error('❌ [deleteCampaign]', error);
        res.status(500).json({ error: 'Kampanya silinemedi' });
    }
};


// ══════════════════════════════════════════════════════════════════════════
// 2. GROUPS (Ad Sets) CRUD
// ══════════════════════════════════════════════════════════════════════════

export const getAllGroups = async (req, res) => {
    try {
        const { workspaceId } = req.params;

        const groups = await prisma.campaignGroup.findMany({
            where: { campaign: { workspaceId } },
            include: {
                campaign: { select: { id: true, name: true } },
                groupMessages: { include: { message: true } },
                list: true
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json({ success: true, groups, adSets: groups });
    } catch (error) {
        console.error('❌ [getAllGroups]', error);
        res.status(500).json({ error: 'Gruplar getirilemedi' });
    }
};

export const getGroups = async (req, res) => {
    try {
        const { workspaceId, campaignId } = req.params;

        const groups = await prisma.campaignGroup.findMany({
            where: { campaignId, campaign: { workspaceId } },
            include: {
                groupMessages: { include: { message: true } },
                list: true
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json({ success: true, groups, adSets: groups });
    } catch (error) {
        console.error('❌ [getGroups]', error);
        res.status(500).json({ error: 'Gruplar getirilemedi' });
    }
};

export const createGroup = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const targetCampaignId = req.params.campaignId || req.body.campaignId;
        const { name, channel, listId, segmentId, segmentName, groupTag, budget, sendRate, scheduledAt } = req.body;

        if (!targetCampaignId) {
            return res.status(400).json({ error: 'Kampanya seçilmelidir' });
        }

        const camp = await prisma.marketingCampaign.findFirst({
            where: { id: targetCampaignId, workspaceId }
        });
        if (!camp) {
            return res.status(404).json({ error: 'Geçersiz veya bulunamayan kampanya' });
        }

        const group = await prisma.campaignGroup.create({
            data: {
                campaignId: targetCampaignId,
                name,
                groupTag: groupTag || name, // Varsayılan olarak isim kullanılır
                channel: channel || 'WHATSAPP',
                listId: listId || null,
                segmentId: segmentId || null,
                segmentName: segmentName || null,
                budget: budget ? Number(budget) : null,
                sendRate: sendRate ? Number(sendRate) : 20,
                scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
                status: 'DRAFT'
            },
            include: {
                campaign: { select: { id: true, name: true } },
                groupMessages: { include: { message: true } },
                list: true
            }
        });

        res.json({ success: true, group });
    } catch (error) {
        console.error('❌ [createGroup]', error);
        res.status(500).json({ error: 'Grup oluşturulamadı: ' + error.message });
    }
};

export const updateGroup = async (req, res) => {
    try {
        const { workspaceId, groupId } = req.params;
        const { name, channel, listId, segmentId, segmentName, groupTag, budget, sendRate, scheduledAt, status } = req.body;

        const group = await prisma.campaignGroup.update({
            where: { id: groupId, campaign: { workspaceId } },
            data: {
                name,
                groupTag,
                channel,
                listId,
                segmentId,
                segmentName,
                budget,
                sendRate,
                status,
                scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined
            }
        });

        res.json({ success: true, group });
    } catch (error) {
        console.error('❌ [updateGroup]', error);
        res.status(500).json({ error: 'Grup güncellenemedi' });
    }
};

export const deleteGroup = async (req, res) => {
    try {
        const { workspaceId, groupId } = req.params;

        await prisma.campaignGroup.delete({
            where: { id: groupId, campaign: { workspaceId } }
        });

        res.json({ success: true, message: 'Grup silindi' });
    } catch (error) {
        console.error('❌ [deleteGroup]', error);
        res.status(500).json({ error: 'Grup silinemedi' });
    }
};


// ══════════════════════════════════════════════════════════════════════════
// 3. MESSAGES CRUD
// ══════════════════════════════════════════════════════════════════════════

export const getMessages = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { channel } = req.query;

        const where = { workspaceId };
        if (channel) where.channel = channel;

        const messages = await prisma.marketingMessage.findMany({
            where,
            orderBy: { createdAt: 'desc' }
        });

        res.json({ success: true, messages });
    } catch (error) {
        console.error('❌ [getMessages]', error);
        res.status(500).json({ error: 'Mesajlar getirilemedi' });
    }
};

export const createMessage = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        let { name, channel, templateId, templateName, content, retellAgentId, emailSubject, emailBody, mediaUrl, externalId, subject, bodyText } = req.body;

        channel = channel || 'WHATSAPP';
        if (!templateId && channel === 'WHATSAPP') templateId = externalId;
        if (!retellAgentId && channel === 'AI_CALL') retellAgentId = externalId;
        if (!emailSubject && subject) emailSubject = subject;
        if (!emailBody && bodyText) emailBody = bodyText;

        if (channel === 'WHATSAPP' && templateId && !templateName) {
            const tpl = await prisma.whatsappTemplate.findFirst({ where: { id: templateId } });
            if (tpl) templateName = tpl.name;
        }

        const message = await prisma.marketingMessage.create({
            data: {
                workspaceId,
                name,
                channel,
                templateId: templateId || null,
                templateName: templateName || null,
                content: content || bodyText || null,
                retellAgentId: retellAgentId || null,
                emailSubject: emailSubject || null,
                emailBody: emailBody || null,
                mediaUrl: mediaUrl || null
            }
        });

        res.json({ success: true, message });
    } catch (error) {
        console.error('❌ [createMessage]', error);
        res.status(500).json({ error: 'Mesaj oluşturulamadı: ' + error.message });
    }
};

export const updateMessage = async (req, res) => {
    try {
        const { workspaceId, id } = req.params;
        let { name, channel, templateId, templateName, content, retellAgentId, emailSubject, emailBody, mediaUrl, externalId, subject, bodyText } = req.body;

        if (!templateId && channel === 'WHATSAPP') templateId = externalId;
        if (!retellAgentId && channel === 'AI_CALL') retellAgentId = externalId;
        if (!emailSubject && subject) emailSubject = subject;
        if (!emailBody && bodyText) emailBody = bodyText;

        if (channel === 'WHATSAPP' && templateId && !templateName) {
            const tpl = await prisma.whatsappTemplate.findFirst({ where: { id: templateId } });
            if (tpl) templateName = tpl.name;
        }

        const message = await prisma.marketingMessage.update({
            where: { id, workspaceId },
            data: {
                name,
                channel,
                templateId: templateId || null,
                templateName: templateName || null,
                content: content || bodyText || null,
                retellAgentId: retellAgentId || null,
                emailSubject: emailSubject || null,
                emailBody: emailBody || null,
                mediaUrl: mediaUrl || null
            }
        });

        res.json({ success: true, message });
    } catch (error) {
        console.error('❌ [updateMessage]', error);
        res.status(500).json({ error: 'Mesaj güncellenemedi: ' + error.message });
    }
};

export const deleteMessage = async (req, res) => {
    try {
        const { workspaceId, id } = req.params;

        await prisma.marketingMessage.delete({
            where: { id, workspaceId }
        });

        res.json({ success: true, message: 'Mesaj silindi' });
    } catch (error) {
        console.error('❌ [deleteMessage]', error);
        res.status(500).json({ error: 'Mesaj silinemedi' });
    }
};

export const getMessageUsage = async (req, res) => {
    try {
        const { workspaceId, id } = req.params;

        const usages = await prisma.campaignGroupMessage.findMany({
            where: { messageId: id, group: { campaign: { workspaceId } } },
            include: {
                group: { include: { campaign: true } }
            }
        });

        res.json({ success: true, usages });
    } catch (error) {
        console.error('❌ [getMessageUsage]', error);
        res.status(500).json({ error: 'Mesaj kullanımı getirilemedi' });
    }
};


// ══════════════════════════════════════════════════════════════════════════
// 4. GROUP-MESSAGE LINKING
// ══════════════════════════════════════════════════════════════════════════

export const addMessageToGroup = async (req, res) => {
    try {
        const { workspaceId, groupId } = req.params;
        const { messageId, order } = req.body;

        // Verify group belongs to workspace
        const group = await prisma.campaignGroup.findFirst({
            where: { id: groupId, campaign: { workspaceId } }
        });
        if (!group) return res.status(404).json({ error: 'Grup bulunamadı' });

        const groupMessage = await prisma.campaignGroupMessage.create({
            data: {
                groupId,
                messageId,
                order: order || 0
            },
            include: { message: true }
        });

        res.json({ success: true, groupMessage });
    } catch (error) {
        console.error('❌ [addMessageToGroup]', error);
        if (error.code === 'P2002') {
            return res.status(400).json({ error: 'Bu mesaj zaten gruba ekli' });
        }
        res.status(500).json({ error: 'Mesaj gruba eklenemedi' });
    }
};

export const removeMessageFromGroup = async (req, res) => {
    try {
        const { workspaceId, groupId, messageId } = req.params;

        // Verify group belongs to workspace
        const group = await prisma.campaignGroup.findFirst({
            where: { id: groupId, campaign: { workspaceId } }
        });
        if (!group) return res.status(404).json({ error: 'Grup bulunamadı' });

        await prisma.campaignGroupMessage.delete({
            where: { groupId_messageId: { groupId, messageId } }
        });

        res.json({ success: true, message: 'Mesaj gruptan çıkarıldı' });
    } catch (error) {
        console.error('❌ [removeMessageFromGroup]', error);
        res.status(500).json({ error: 'Mesaj gruptan çıkarılamadı' });
    }
};


// ══════════════════════════════════════════════════════════════════════════
// 5. EXECUTE GROUP SEND (CORE & ENDPOINT)
// ══════════════════════════════════════════════════════════════════════════

export const executeGroupSendCore = async (workspaceId, groupId) => {
    const group = await prisma.campaignGroup.findFirst({
        where: { id: groupId, campaign: { workspaceId } },
        include: {
            campaign: true,
            groupMessages: { include: { message: true }, orderBy: { order: 'asc' } },
            list: { include: { members: { include: { contact: true } } } }
        }
    });

    if (!group) throw new Error('Grup bulunamadı');
    if (group.status === 'SENDING') throw new Error('Grup zaten gönderim aşamasında');

    let contacts = [];
    if (group.listId && group.list) {
        contacts = group.list.members.map(m => m.contact).filter(c => c && !c.isDeleted && !c.isArchived);
    } else if (group.segmentId) {
        const { buildSegmentWhere } = await import('../services/smartSegment.service.js');
        const segResult = await buildSegmentWhere(group.segmentId, workspaceId);
        const where = { workspaceId, isDeleted: false, isArchived: false, ...segResult.where };
        if (segResult.contactIds) where.id = { in: segResult.contactIds };
        contacts = await prisma.contact.findMany({ where });
    }

    if (contacts.length === 0) {
        throw new Error('Gönderilecek kişi bulunamadı (Liste boş)');
    }

    const messages = group.groupMessages.map(gm => gm.message);
    if (messages.length === 0) {
        throw new Error('Gönderilecek mesaj bulunamadı');
    }

    // Update group status
    await prisma.campaignGroup.update({
        where: { id: groupId },
        data: { status: 'SENDING' }
    });

    // ─── Background Processing ───
    setImmediate(async () => {
        const sendRate = group.sendRate || 20;
        const delayMs = Math.floor(60000 / sendRate); // ms between messages

        try {
            if (group.channel === 'WHATSAPP') {
                const whatsappPhone = await prisma.whatsappPhoneNumber.findFirst({ where: { workspaceId } });
                if (!whatsappPhone) throw new Error('WhatsApp numarası bağlı değil');

                const WHATSAPP_API_VERSION = process.env.WHATSAPP_API_VERSION || 'v21.0';
                const apiUrl = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${whatsappPhone.phoneNumberId}/messages`;

                const msgTemplate = messages.find(m => m.channel === 'WHATSAPP');
                if (!msgTemplate || !msgTemplate.templateName) throw new Error('WA mesaj şablonu bulunamadı');

                const waTpl = await prisma.whatsappTemplate.findFirst({
                    where: { name: msgTemplate.templateName, workspaceId }
                }).catch(() => null);

                for (const contact of contacts) {
                    const phone = contact.phone?.replace(/[\s\+\-\(\)]/g, '');
                    if (!phone) continue;

                    try {
                        let formattedPhone = phone;
                        if (formattedPhone.startsWith('0')) formattedPhone = '90' + formattedPhone.substring(1);
                        else if (!formattedPhone.startsWith('90') && formattedPhone.length === 10) formattedPhone = '90' + formattedPhone;

                        const payload = {
                            messaging_product: 'whatsapp',
                            to: formattedPhone,
                            type: 'template',
                            template: {
                                name: msgTemplate.templateName,
                                language: { code: waTpl?.language || 'tr' }
                            }
                        };

                        const components = [];
                        if (waTpl) {
                            if (waTpl.headerType && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(waTpl.headerType)) {
                                const mediaUrl = msgTemplate.mediaUrl || waTpl.headerContent;
                                if (mediaUrl) {
                                    components.push({
                                        type: 'header',
                                        parameters: [{
                                            type: waTpl.headerType.toLowerCase(),
                                            [waTpl.headerType.toLowerCase()]: { link: mediaUrl }
                                        }]
                                    });
                                }
                            }

                            const placeholderCount = (waTpl.bodyText?.match(/\{\{\d+\}\}/g) || []).length;
                            if (placeholderCount > 0) {
                                const bodyParams = [{ type: 'text', text: contact.name || 'Müşteri' }];
                                while (bodyParams.length < placeholderCount) {
                                    bodyParams.push({ type: 'text', text: '' });
                                }
                                components.push({ type: 'body', parameters: bodyParams });
                            }
                        }

                        if (components.length > 0) {
                            payload.template.components = components;
                        }

                        const response = await axios.post(apiUrl, payload, {
                            headers: { Authorization: `Bearer ${whatsappPhone.accessToken}`, 'Content-Type': 'application/json' }
                        });

                        const newWaId = response.data?.messages?.[0]?.id;

                        let conversation = await prisma.conversation.findFirst({
                            where: { contactId: contact.id, workspaceId, channel: 'WHATSAPP' }
                        });

                        if (!conversation) {
                            conversation = await prisma.conversation.create({
                                data: { contactId: contact.id, workspaceId, whatsappPhoneNumberId: whatsappPhone.id, channel: 'WHATSAPP', status: 'OPEN', isBulkSend: true, campaignId: group.campaignId, source: 'MARKETING' }
                            });
                        } else if (!conversation.campaignId) {
                            await prisma.conversation.update({
                                where: { id: conversation.id },
                                data: { campaignId: group.campaignId, source: 'MARKETING' }
                            });
                        }

                        const dbMessage = await prisma.message.create({
                            data: {
                                conversationId: conversation.id,
                                content: `[Otomatik Şablon: ${msgTemplate.templateName}]`,
                                messageType: 'TEMPLATE',
                                isFromContact: false,
                                whatsappMessageId: newWaId,
                                status: 'SENT'
                            }
                        });

                        await prisma.marketingRecipient.create({
                            data: {
                                campaignId: group.campaignId,
                                contactId: contact.id,
                                phone: formattedPhone,
                                name: contact.name,
                                messageId: dbMessage.id,
                                status: 'SENT',
                                groupId: groupId,
                                sentAt: new Date()
                            }
                        });

                        await prisma.marketingCampaign.update({
                            where: { id: group.campaignId },
                            data: { sentCount: { increment: 1 } }
                        });

                        await prisma.campaignGroup.update({
                            where: { id: group.id },
                            data: { sentCount: { increment: 1 } }
                        });

                        await new Promise(r => setTimeout(r, delayMs));

                    } catch (err) {
                        console.error(`❌ [executeGroupSend] Failed for ${phone}:`, err.response?.data || err.message);
                        await prisma.marketingRecipient.create({
                            data: {
                                campaignId: group.campaignId,
                                contactId: contact.id,
                                phone,
                                name: contact.name,
                                status: 'FAILED',
                                groupId: groupId,
                                failReason: err.response?.data?.error?.message || err.message,
                                failedAt: new Date()
                            }
                        });

                        await prisma.marketingCampaign.update({
                            where: { id: group.campaignId },
                            data: { failedCount: { increment: 1 } }
                        });

                        await prisma.campaignGroup.update({
                            where: { id: group.id },
                            data: { failedCount: { increment: 1 } }
                        });
                    }
                }
            } else if (group.channel === 'AI_CALL') {
                const msgTemplate = messages.find(m => m.channel === 'AI_CALL');
                const workspace = await prisma.workspace.findUnique({
                    where: { id: workspaceId },
                    select: { retellApiKey: true, retellAgentId: true, retellFromNumber: true }
                });

                const effectiveAgentId = msgTemplate?.retellAgentId || workspace?.retellAgentId;
                if (!effectiveAgentId) throw new Error('AI sesli arama agent kimliği bulunamadı');

                if (!workspace?.retellApiKey || !workspace?.retellFromNumber) {
                    throw new Error('Retell API anahtarı veya çıkış numarası yapılandırılmamış');
                }

                const client = new Retell({ apiKey: workspace.retellApiKey });

                for (const contact of contacts) {
                    const phone = normalizePhone(contact.phone);
                    if (!phone) continue;

                    try {
                        const callResponse = await client.call.createPhoneCall({
                            from_number: normalizePhone(workspace.retellFromNumber),
                            to_number: phone,
                            override_agent_id: effectiveAgentId,
                            metadata: {
                                workspaceId,
                                contactId: contact.id,
                                contactName: contact.name,
                                campaignId: group.campaignId,
                                groupId: group.id
                            }
                        });

                        await prisma.retellCall.create({
                            data: {
                                workspace: { connect: { id: workspaceId } },
                                contactId: contact.id,
                                callId: callResponse.call_id,
                                agentId: effectiveAgentId,
                                fromNumber: workspace.retellFromNumber,
                                toNumber: phone,
                                direction: 'outbound',
                                status: callResponse.call_status || 'registered'
                            }
                        });

                        await prisma.marketingRecipient.create({
                            data: {
                                campaignId: group.campaignId,
                                contactId: contact.id,
                                phone,
                                name: contact.name,
                                status: 'SENT',
                                groupId: groupId,
                                sentAt: new Date()
                            }
                        });

                        await prisma.marketingCampaign.update({
                            where: { id: group.campaignId },
                            data: { sentCount: { increment: 1 } }
                        });

                        await prisma.campaignGroup.update({
                            where: { id: group.id },
                            data: { sentCount: { increment: 1 } }
                        });

                        await new Promise(r => setTimeout(r, delayMs));

                    } catch (err) {
                        console.error(`❌ [executeGroupSend] AI Call failed for ${phone}:`, err.message);
                        await prisma.marketingRecipient.create({
                            data: {
                                campaignId: group.campaignId,
                                contactId: contact.id,
                                phone,
                                name: contact.name,
                                status: 'FAILED',
                                groupId: groupId,
                                failReason: err.message,
                                failedAt: new Date()
                            }
                        });

                        await prisma.marketingCampaign.update({
                            where: { id: group.campaignId },
                            data: { failedCount: { increment: 1 } }
                        });

                        await prisma.campaignGroup.update({
                            where: { id: group.id },
                            data: { failedCount: { increment: 1 } }
                        });
                    }
                }
            } else if (group.channel === 'SMS') {
                const msgTemplate = messages.find(m => m.channel === 'SMS') || messages[0];
                if (!msgTemplate) throw new Error('SMS mesaj içeriği bulunamadı');

                const workspace = await prisma.workspace.findUnique({
                    where: { id: workspaceId },
                    select: { netgsmConfig: true }
                });
                if (!workspace?.netgsmConfig || !workspace.netgsmConfig.username) {
                    throw new Error('NetGSM SMS entegrasyonu yapılandırılmamış');
                }

                for (const contact of contacts) {
                    const phone = contact?.phone;
                    if (!phone) continue;

                    try {
                        const smsText = msgTemplate.content || msgTemplate.bodyText || '';
                        const smsResult = await sendSms(workspace.netgsmConfig, phone, smsText);

                        if (!smsResult.success) {
                            throw new Error(smsResult.error || smsResult.description || 'SMS gönderilemedi');
                        }

                        await prisma.marketingRecipient.create({
                            data: {
                                campaignId: group.campaignId,
                                contactId: contact.id,
                                phone,
                                name: contact.name,
                                status: 'SENT',
                                groupId: groupId,
                                sentAt: new Date()
                            }
                        });

                        await prisma.marketingCampaign.update({
                            where: { id: group.campaignId },
                            data: { sentCount: { increment: 1 } }
                        });

                        await prisma.campaignGroup.update({
                            where: { id: group.id },
                            data: { sentCount: { increment: 1 } }
                        });

                        await new Promise(r => setTimeout(r, delayMs));

                    } catch (err) {
                        console.error(`❌ [executeGroupSend] SMS failed for ${phone}:`, err.message);
                        await prisma.marketingRecipient.create({
                            data: {
                                campaignId: group.campaignId,
                                contactId: contact.id,
                                phone,
                                name: contact.name,
                                status: 'FAILED',
                                groupId: groupId,
                                failReason: err.message,
                                failedAt: new Date()
                            }
                        });

                        await prisma.marketingCampaign.update({
                            where: { id: group.campaignId },
                            data: { failedCount: { increment: 1 } }
                        });

                        await prisma.campaignGroup.update({
                            where: { id: group.id },
                            data: { failedCount: { increment: 1 } }
                        });
                    }
                }
            } else if (group.channel === 'EMAIL') {
                const msgTemplate = messages.find(m => m.channel === 'EMAIL') || messages[0];
                if (!msgTemplate) throw new Error('E-posta şablonu bulunamadı');

                const emailChannel = await prisma.emailChannel.findFirst({
                    where: { workspaceId, isActive: true }
                });
                if (!emailChannel) {
                    throw new Error('Aktif bir e-posta kanalı (SMTP/Gmail) bulunamadı');
                }

                for (const contact of contacts) {
                    const email = contact?.email;
                    if (!email) continue;

                    try {
                        const subject = msgTemplate.emailSubject || msgTemplate.subject || 'Bilgilendirme';
                        const body = msgTemplate.emailBody || msgTemplate.content || msgTemplate.bodyText || '';

                        await sendEmailViaChannel(emailChannel.id, email, subject, body, { isHtml: true });

                        await prisma.marketingRecipient.create({
                            data: {
                                campaignId: group.campaignId,
                                contactId: contact.id,
                                phone: contact.phone || '',
                                email: email,
                                name: contact.name,
                                status: 'SENT',
                                groupId: groupId,
                                sentAt: new Date()
                            }
                        });

                        await prisma.marketingCampaign.update({
                            where: { id: group.campaignId },
                            data: { sentCount: { increment: 1 } }
                        });

                        await prisma.campaignGroup.update({
                            where: { id: group.id },
                            data: { sentCount: { increment: 1 } }
                        });

                        await new Promise(r => setTimeout(r, delayMs));

                    } catch (err) {
                        console.error(`❌ [executeGroupSend] Email failed for ${email}:`, err.message);
                        await prisma.marketingRecipient.create({
                            data: {
                                campaignId: group.campaignId,
                                contactId: contact.id,
                                phone: contact.phone || '',
                                email: email,
                                name: contact.name,
                                status: 'FAILED',
                                groupId: groupId,
                                failReason: err.message,
                                failedAt: new Date()
                            }
                        });

                        await prisma.marketingCampaign.update({
                            where: { id: group.campaignId },
                            data: { failedCount: { increment: 1 } }
                        });

                        await prisma.campaignGroup.update({
                            where: { id: group.id },
                            data: { failedCount: { increment: 1 } }
                        });
                    }
                }
            }

            await prisma.campaignGroup.update({
                where: { id: groupId },
                data: { status: 'COMPLETED' }
            });

            // If all groups in campaign are done, mark campaign completed
            const incompleteGroups = await prisma.campaignGroup.count({
                where: {
                    campaignId: group.campaignId,
                    status: { notIn: ['COMPLETED', 'FAILED'] }
                }
            });
            if (incompleteGroups === 0) {
                await prisma.marketingCampaign.update({
                    where: { id: group.campaignId },
                    data: { status: 'COMPLETED' }
                }).catch(() => {});
            }

        } catch (err) {
            console.error(`❌ [executeGroupSend] Background process failed:`, err);
            await prisma.campaignGroup.update({
                where: { id: groupId },
                data: { status: 'FAILED' }
            });
        }
    });

    return { contactsCount: contacts.length };
};

export const executeGroupSend = async (req, res) => {
    try {
        const { workspaceId, groupId } = req.params;
        const result = await executeGroupSendCore(workspaceId, groupId);
        res.json({
            success: true,
            message: `${result.contactsCount} kişiye gönderim başlatıldı`,
            queuedCount: result.contactsCount
        });
    } catch (error) {
        console.error('❌ [executeGroupSend]', error);
        res.status(400).json({ error: error.message || 'Grup gönderimi başlatılamadı' });
    }
};

// ══════════════════════════════════════════════════════════════════════════
// 6. AUDIENCE PREVIEW (FOR WIZARD)
// ══════════════════════════════════════════════════════════════════════════

export const previewAudience = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { audienceType, tagNames = [], segmentId, listId } = req.body;

        if (listId || audienceType === 'LIST') {
            const total = await prisma.contactGroupMember.count({
                where: {
                    groupId: listId,
                    contact: { isArchived: false, isDeleted: false }
                }
            });
            const sample = await prisma.contactGroupMember.findMany({
                where: {
                    groupId: listId,
                    contact: { isArchived: false, isDeleted: false }
                },
                take: 5,
                include: { contact: { select: { id: true, name: true, phone: true } } }
            });
            return res.json({
                success: true,
                count: total,
                sampleContacts: sample.map(s => s.contact).filter(Boolean)
            });
        }

        if (segmentId || audienceType === 'SEGMENT') {
            const { buildSegmentWhere } = await import('../services/smartSegment.service.js');
            const segResult = await buildSegmentWhere(segmentId, workspaceId);
            const where = { workspaceId, isDeleted: false, isArchived: false, ...segResult.where };
            if (segResult.contactIds) where.id = { in: segResult.contactIds };
            const total = await prisma.contact.count({ where });
            const sampleContacts = await prisma.contact.findMany({
                where,
                take: 5,
                select: { id: true, name: true, phone: true }
            });
            return res.json({
                success: true,
                count: total,
                sampleContacts
            });
        }

        const tagsList = Array.isArray(tagNames) ? tagNames.filter(Boolean) : (tagNames ? [tagNames] : []);
        if (tagsList.length > 0 || audienceType === 'TAGS') {
            const candidates = await prisma.contact.findMany({
                where: {
                    workspaceId,
                    isArchived: false,
                    isDeleted: false,
                    OR: tagsList.map(t => ({ tags: { contains: t } }))
                },
                select: { id: true, name: true, phone: true, tags: true }
            });

            const matched = candidates.filter(c => {
                try {
                    const parsed = JSON.parse(c.tags || '[]');
                    return parsed.some(t => tagsList.includes(t));
                } catch {
                    return false;
                }
            });

            return res.json({
                success: true,
                count: matched.length,
                sampleContacts: matched.slice(0, 5).map(c => ({ id: c.id, name: c.name, phone: c.phone }))
            });
        }

        // Default: all active contacts
        const total = await prisma.contact.count({
            where: { workspaceId, isArchived: false, isDeleted: false }
        });
        const sampleContacts = await prisma.contact.findMany({
            where: { workspaceId, isArchived: false, isDeleted: false },
            take: 5,
            select: { id: true, name: true, phone: true }
        });

        res.json({
            success: true,
            count: total,
            sampleContacts
        });

    } catch (error) {
        console.error('❌ [previewAudience]', error);
        res.status(500).json({ error: 'Hedef kitle önizlemesi alınamadı' });
    }
};

// ══════════════════════════════════════════════════════════════════════════
// 7. WIZARD LAUNCH CAMPAIGN (DUAL CHANNEL SUPPORT)
// ══════════════════════════════════════════════════════════════════════════

export const wizardLaunchCampaign = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const {
            name,
            description,
            budget,
            // Audience
            audienceType = 'TAGS', // TAGS, SEGMENT, LIST, ALL
            tagNames = [],
            segmentId,
            listId,
            // Channels: ['WHATSAPP', 'AI_CALL'] or either
            channels = ['WHATSAPP'],
            // WhatsApp config
            whatsappConfig = {},
            // AI Call config
            aiCallConfig = {},
            // Schedule & Speed
            sendRate = 20,
            scheduleType = 'IMMEDIATE', // IMMEDIATE, SCHEDULED
            scheduledAt = null
        } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Kampanya adı zorunludur' });
        }

        if (!channels || channels.length === 0) {
            return res.status(400).json({ error: 'En az bir kanal seçilmelidir' });
        }

        // 1. Resolve Target Contact List
        let targetListId = listId;

        if (!targetListId) {
            let matchedContacts = [];

            if (audienceType === 'SEGMENT' && segmentId) {
                const { buildSegmentWhere } = await import('../services/smartSegment.service.js');
                const segResult = await buildSegmentWhere(segmentId, workspaceId);
                const where = { workspaceId, isDeleted: false, isArchived: false, ...segResult.where };
                if (segResult.contactIds) where.id = { in: segResult.contactIds };
                matchedContacts = await prisma.contact.findMany({ where, select: { id: true } });
            } else if (audienceType === 'TAGS' && tagNames.length > 0) {
                const candidates = await prisma.contact.findMany({
                    where: {
                        workspaceId,
                        isArchived: false,
                        isDeleted: false,
                        OR: tagNames.map(t => ({ tags: { contains: t } }))
                    },
                    select: { id: true, tags: true }
                });
                matchedContacts = candidates.filter(c => {
                    try {
                        const parsed = JSON.parse(c.tags || '[]');
                        return parsed.some(t => tagNames.includes(t));
                    } catch {
                        return false;
                    }
                });
            } else {
                matchedContacts = await prisma.contact.findMany({
                    where: { workspaceId, isArchived: false, isDeleted: false },
                    select: { id: true }
                });
            }

            if (matchedContacts.length === 0) {
                return res.status(400).json({ error: 'Hedef kitlede kişi bulunamadı' });
            }

            // Create automatic ContactGroup for this campaign
            const autoGroupList = await prisma.contactGroup.create({
                data: {
                    workspaceId,
                    name: `${name} Hedef Kitlesi`,
                    description: `Otomatik oluşturuldu: ${name} kampanyası`,
                    icon: audienceType === 'TAGS' ? '🏷️' : audienceType === 'SEGMENT' ? '⚡' : '👥',
                    color: '#2563eb',
                    members: {
                        create: matchedContacts.map(c => ({ contactId: c.id }))
                    }
                }
            });
            targetListId = autoGroupList.id;
        }

        // 2. Create the Marketing Campaign
        const campaign = await prisma.marketingCampaign.create({
            data: {
                workspaceId,
                name,
                description,
                budget: budget ? parseFloat(budget) : null,
                startDate: new Date(),
                status: scheduleType === 'IMMEDIATE' ? 'ACTIVE' : 'SCHEDULED',
                type: 'MULTI_TIER'
            }
        });

        const createdGroups = [];

        // 3. Handle WhatsApp channel if selected
        if (channels.includes('WHATSAPP')) {
            const templateName = whatsappConfig.templateName || (whatsappConfig.mode === 'NEW_TEMPLATE' ? `${name.toLowerCase().replace(/[^a-z0-9_]/g, '_')}_tpl` : 'genel_sablon');

            const waMessage = await prisma.marketingMessage.create({
                data: {
                    workspaceId,
                    name: `${name} - WhatsApp (${templateName})`,
                    channel: 'WHATSAPP',
                    templateName,
                    content: whatsappConfig.bodyText || '',
                    mediaUrl: whatsappConfig.headerMediaUrl || null
                }
            });

            const waGroup = await prisma.campaignGroup.create({
                data: {
                    campaignId: campaign.id,
                    name: `${name} - WhatsApp`,
                    channel: 'WHATSAPP',
                    listId: targetListId,
                    sendRate: parseInt(sendRate) || 20,
                    status: scheduleType === 'IMMEDIATE' ? 'PENDING' : 'SCHEDULED',
                    scheduledAt: scheduleType === 'SCHEDULED' && scheduledAt ? new Date(scheduledAt) : null,
                    groupMessages: {
                        create: {
                            messageId: waMessage.id,
                            order: 0
                        }
                    }
                }
            });

            createdGroups.push(waGroup);

            if (scheduleType === 'IMMEDIATE') {
                executeGroupSendCore(workspaceId, waGroup.id).catch(err => {
                    console.error(`❌ [wizardLaunchCampaign] WA execute error:`, err);
                });
            }
        }

        // 4. Handle AI_CALL channel if selected
        if (channels.includes('AI_CALL')) {
            const agentId = aiCallConfig.agentId;
            const agentName = aiCallConfig.agentName || 'Sesli Asistan';

            const callMessage = await prisma.marketingMessage.create({
                data: {
                    workspaceId,
                    name: `${name} - AI Arama (${agentName})`,
                    channel: 'AI_CALL',
                    retellAgentId: agentId,
                    content: aiCallConfig.callTemplate || ''
                }
            });

            const callGroup = await prisma.campaignGroup.create({
                data: {
                    campaignId: campaign.id,
                    name: `${name} - AI Arama`,
                    channel: 'AI_CALL',
                    listId: targetListId,
                    sendRate: parseInt(sendRate) || 20,
                    status: scheduleType === 'IMMEDIATE' ? 'PENDING' : 'SCHEDULED',
                    scheduledAt: scheduleType === 'SCHEDULED' && scheduledAt ? new Date(scheduledAt) : null,
                    groupMessages: {
                        create: {
                            messageId: callMessage.id,
                            order: 0
                        }
                    }
                }
            });

            createdGroups.push(callGroup);

            if (scheduleType === 'IMMEDIATE') {
                executeGroupSendCore(workspaceId, callGroup.id).catch(err => {
                    console.error(`❌ [wizardLaunchCampaign] AI Call execute error:`, err);
                });
            }
        }

        res.json({
            success: true,
            campaign,
            groups: createdGroups,
            message: `${channels.join(' & ')} kanallarıyla ${createdGroups.length} grup oluşturuldu ve kampanya başlatıldı.`
        });

    } catch (error) {
        console.error('❌ [wizardLaunchCampaign]', error);
        res.status(500).json({ error: error.message || 'Kampanya başlatılamadı' });
    }
};

// ══════════════════════════════════════════════════════════════════════════
// 8. SYNC PAST DATA (DATE-BY-DATE AUTOMATIC CAMPAIGN ORGANIZATION)
// ══════════════════════════════════════════════════════════════════════════

export async function syncPastDataCore(workspaceId) {
    // 0. Ensure legacy campaigns without groups get their default groups and messages
    const legacyUpdatedCount = await ensureDefaultGroupsForLegacyCampaigns(workspaceId);

    // Clean up any monolithic ARCHIVE_DEFAULT campaign so past sends are neatly grouped by DATE
    const oldArchiveCampaigns = await prisma.marketingCampaign.findMany({
        where: { workspaceId, type: 'ARCHIVE_DEFAULT' }
    });
    for (const oldCamp of oldArchiveCampaigns) {
        await prisma.marketingRecipient.deleteMany({ where: { campaignId: oldCamp.id } }).catch(() => {});
        await prisma.campaignGroup.deleteMany({ where: { campaignId: oldCamp.id } }).catch(() => {});
        await prisma.marketingCampaign.delete({ where: { id: oldCamp.id } }).catch(() => {});
    }

    // 1. Gather all past WhatsApp TEMPLATE messages
    const pastWaMessages = await prisma.message.findMany({
        where: {
            messageType: 'TEMPLATE',
            isFromContact: false,
            conversation: { workspaceId }
        },
        include: { conversation: { include: { contact: true } } },
        orderBy: { createdAt: 'desc' }
    });

    // Lookup existing recipients belonging to user-created campaigns to avoid double counting
    const existingRecs = await prisma.marketingRecipient.findMany({
        where: {
            campaign: { workspaceId, type: { notIn: ['LEGACY_DATE_SYNC', 'ARCHIVE_DEFAULT'] } },
            messageId: { not: null }
        },
        select: { messageId: true }
    });
    const existingMessageIdSet = new Set(existingRecs.map(r => r.messageId));

    // Group unassigned messages by Date (YYYY-MM-DD) and Template Name
    const messagesByDate = new Map();
    for (const msg of pastWaMessages) {
        if (existingMessageIdSet.has(msg.id)) continue;

        const dateKey = msg.createdAt.toISOString().split('T')[0];
        let tplName = 'WhatsApp Şablonu';
        const match = msg.content?.match(/^\[Şablon:\s*([^\]]+)\]/);
        if (match && match[1]) {
            tplName = match[1].trim();
        }

        if (!messagesByDate.has(dateKey)) {
            messagesByDate.set(dateKey, {
                date: msg.createdAt,
                dateKey,
                templates: new Map()
            });
        }

        const dayGroup = messagesByDate.get(dateKey);
        if (!dayGroup.templates.has(tplName)) {
            dayGroup.templates.set(tplName, []);
        }
        dayGroup.templates.get(tplName).push(msg);
    }

    let syncedWaCampaigns = 0;
    let totalSyncedWaMessages = 0;

    for (const [dateKey, dayGroup] of messagesByDate.entries()) {
        const formattedDate = new Date(dayGroup.date).toLocaleDateString('tr-TR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });

        const tplNames = Array.from(dayGroup.templates.keys());
        const campaignName = tplNames.length === 1
            ? `Eski Kampanya (${tplNames[0]}) - ${formattedDate}`
            : `Eski Kampanya - ${formattedDate}`;

        let campaign = await prisma.marketingCampaign.findFirst({
            where: {
                workspaceId,
                type: 'LEGACY_DATE_SYNC',
                description: `Tarih: ${dateKey}`
            }
        });

        if (!campaign) {
            campaign = await prisma.marketingCampaign.create({
                data: {
                    workspaceId,
                    name: campaignName,
                    description: `Tarih: ${dateKey}`,
                    status: 'COMPLETED',
                    type: 'LEGACY_DATE_SYNC',
                    startDate: dayGroup.date,
                    endDate: dayGroup.date
                }
            });
        }

        for (const [tplName, msgs] of dayGroup.templates.entries()) {
            let group = await prisma.campaignGroup.findFirst({
                where: {
                    campaignId: campaign.id,
                    name: `${tplName} Grubu`
                }
            });

            if (!group) {
                group = await prisma.campaignGroup.create({
                    data: {
                        campaignId: campaign.id,
                        name: `${tplName} Grubu`,
                        channel: 'WHATSAPP',
                        status: 'COMPLETED',
                        sentAt: dayGroup.date
                    }
                });
            }

            const groupRecs = await prisma.marketingRecipient.findMany({
                where: { groupId: group.id },
                select: { messageId: true }
            });
            const groupRecMsgSet = new Set(groupRecs.map(r => r.messageId));

            const toCreate = [];
            for (const msg of msgs) {
                if (groupRecMsgSet.has(msg.id)) continue;
                const status = msg.status || 'SENT';
                toCreate.push({
                    campaignId: campaign.id,
                    groupId: group.id,
                    contactId: msg.conversation?.contactId || null,
                    phone: msg.conversation?.contact?.phone || null,
                    name: msg.conversation?.contact?.name || null,
                    messageId: msg.id,
                    status,
                    deliveredAt: ['DELIVERED', 'READ'].includes(status) ? msg.updatedAt : null,
                    readAt: status === 'READ' ? msg.updatedAt : null,
                    failedAt: status === 'FAILED' ? msg.updatedAt : null,
                    sentAt: msg.createdAt
                });
            }

            if (toCreate.length > 0) {
                for (let i = 0; i < toCreate.length; i += 100) {
                    await prisma.marketingRecipient.createMany({
                        data: toCreate.slice(i, i + 100),
                        skipDuplicates: true
                    });
                }
            }

            // Update group counts
            const [sent, delivered, read, failed] = await Promise.all([
                prisma.marketingRecipient.count({ where: { groupId: group.id } }),
                prisma.marketingRecipient.count({ where: { groupId: group.id, status: { in: ['DELIVERED', 'READ'] } } }),
                prisma.marketingRecipient.count({ where: { groupId: group.id, status: 'READ' } }),
                prisma.marketingRecipient.count({ where: { groupId: group.id, status: 'FAILED' } })
            ]);

            await prisma.campaignGroup.update({
                where: { id: group.id },
                data: { sentCount: sent, deliveredCount: delivered, readCount: read, failedCount: failed }
            });
            totalSyncedWaMessages += sent;
        }

        // Aggregate campaign counts from its groups
        const groups = await prisma.campaignGroup.findMany({ where: { campaignId: campaign.id } });
        await prisma.marketingCampaign.update({
            where: { id: campaign.id },
            data: {
                sentCount: groups.reduce((s, g) => s + g.sentCount, 0),
                deliveredCount: groups.reduce((s, g) => s + g.deliveredCount, 0),
                readCount: groups.reduce((s, g) => s + g.readCount, 0),
                failedCount: groups.reduce((s, g) => s + g.failedCount, 0),
                totalCount: groups.reduce((s, g) => s + g.sentCount, 0)
            }
        });
        syncedWaCampaigns++;
    }

    // 2. Gather past Retell AI calls
    const pastCalls = await prisma.retellCall.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' }
    });

    const callsByDate = new Map();
    for (const call of pastCalls) {
        const dateKey = (call.startedAt || call.createdAt).toISOString().split('T')[0];
        if (!callsByDate.has(dateKey)) {
            callsByDate.set(dateKey, {
                date: call.startedAt || call.createdAt,
                dateKey,
                calls: []
            });
        }
        callsByDate.get(dateKey).calls.push(call);
    }

    let syncedCallCampaigns = 0;
    let totalSyncedCalls = 0;

    for (const [dateKey, dayData] of callsByDate.entries()) {
        const formattedDate = new Date(dayData.date).toLocaleDateString('tr-TR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });

        const campaignName = `Eski Kampanya (AI Arama) - ${formattedDate}`;

        let campaign = await prisma.marketingCampaign.findFirst({
            where: {
                workspaceId,
                type: 'LEGACY_DATE_SYNC',
                description: `Arama Tarihi: ${dateKey}`
            }
        });

        if (!campaign) {
            campaign = await prisma.marketingCampaign.create({
                data: {
                    workspaceId,
                    name: campaignName,
                    description: `Arama Tarihi: ${dateKey}`,
                    status: 'COMPLETED',
                    type: 'LEGACY_DATE_SYNC',
                    startDate: dayData.date,
                    endDate: dayData.date
                }
            });
        }

        let group = await prisma.campaignGroup.findFirst({
            where: {
                campaignId: campaign.id,
                channel: 'AI_CALL'
            }
        });

        if (!group) {
            group = await prisma.campaignGroup.create({
                data: {
                    campaignId: campaign.id,
                    name: 'AI Sesli Arama Grubu',
                    channel: 'AI_CALL',
                    status: 'COMPLETED',
                    sentAt: dayData.date
                }
            });
        }

        const groupRecs = await prisma.marketingRecipient.findMany({
            where: { groupId: group.id },
            select: { messageId: true }
        });
        const groupRecMsgSet = new Set(groupRecs.map(r => r.messageId));

        const callsToCreate = [];
        for (const call of dayData.calls) {
            const callMsgId = `call_${call.callId || call.id}`;
            if (groupRecMsgSet.has(callMsgId)) continue;

            const isSuccess = Boolean(call.callSuccessful || (call.duration && call.duration > 15) || call.status === 'completed');
            callsToCreate.push({
                campaignId: campaign.id,
                groupId: group.id,
                contactId: call.contactId || null,
                phone: call.toNumber || null,
                messageId: callMsgId,
                status: isSuccess ? 'READ' : 'FAILED',
                deliveredAt: isSuccess ? call.createdAt : null,
                readAt: isSuccess ? call.createdAt : null,
                failedAt: !isSuccess ? call.createdAt : null,
                failReason: call.endedReason || null,
                sentAt: call.startedAt || call.createdAt
            });
        }

        if (callsToCreate.length > 0) {
            for (let i = 0; i < callsToCreate.length; i += 100) {
                await prisma.marketingRecipient.createMany({
                    data: callsToCreate.slice(i, i + 100),
                    skipDuplicates: true
                });
            }
        }

        const [totalCalls, successfulCalls, failedCalls] = await Promise.all([
            prisma.marketingRecipient.count({ where: { groupId: group.id } }),
            prisma.marketingRecipient.count({ where: { groupId: group.id, status: { in: ['DELIVERED', 'READ'] } } }),
            prisma.marketingRecipient.count({ where: { groupId: group.id, status: 'FAILED' } })
        ]);

        await prisma.campaignGroup.update({
            where: { id: group.id },
            data: {
                sentCount: totalCalls,
                deliveredCount: successfulCalls,
                readCount: successfulCalls,
                failedCount: failedCalls
            }
        });

        await prisma.marketingCampaign.update({
            where: { id: campaign.id },
            data: {
                sentCount: totalCalls,
                deliveredCount: successfulCalls,
                readCount: successfulCalls,
                failedCount: failedCalls,
                totalCount: totalCalls
            }
        });

        syncedCallCampaigns++;
        totalSyncedCalls += totalCalls;
    }

    // 3. Auto-import approved WhatsApp templates to MarketingMessage
    const waTemplates = await prisma.whatsappTemplate.findMany({
        where: { workspaceId, status: 'APPROVED' }
    }).catch(() => []);

    for (const tpl of waTemplates) {
        const existing = await prisma.marketingMessage.findFirst({
            where: { workspaceId, templateId: tpl.id }
        });
        if (!existing) {
            await prisma.marketingMessage.create({
                data: {
                    workspaceId,
                    name: tpl.name || 'WhatsApp Şablonu',
                    channel: 'WHATSAPP',
                    templateId: tpl.id,
                    templateName: tpl.name,
                    content: tpl.bodyText || ''
                }
            }).catch(() => {});
        }
    }

    return {
        synced: {
            legacyUpdatedCount,
            syncedWaCampaigns,
            totalSyncedWaMessages,
            syncedCallCampaigns,
            totalSyncedCalls
        }
    };
}

export const syncPastData = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const result = await syncPastDataCore(workspaceId);
        res.json({
            success: true,
            message: 'Geçmiş Meta WhatsApp ve AI Sesli Arama verileri tarih bazlı kampanyalar olarak başarıyla eşitlendi',
            ...result
        });
    } catch (error) {
        console.error('❌ [syncPastData]', error);
        res.status(500).json({ error: 'Geçmiş veriler eşitlenemedi' });
    }
};

// ══════════════════════════════════════════════════════════════════════════
// 9. QUICK BULK CAMPAIGN (AUTOMATIC CAMPAIGN & AD SET FROM CONTACTS SCREEN)
// ══════════════════════════════════════════════════════════════════════════

export const quickBulkCampaign = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const {
            channel = 'WHATSAPP', // 'WHATSAPP' | 'AI_CALL' | 'EMAIL' | 'SMS'
            campaignName,
            contactIds = [],
            templateName,
            templateId,
            variables = [],
            headerMediaUrl,
            agentId,
            emailSubject,
            emailBody,
            emailChannelId,
            smsText,
            sendRate = 30
        } = req.body;

        if (!contactIds || !Array.isArray(contactIds) || contactIds.length === 0) {
            return res.status(400).json({ error: 'En az bir kişi seçilmelidir' });
        }

        const now = new Date();
        const dateStr = now.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const timeStr = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        const channelLabel = channel === 'WHATSAPP' ? 'WhatsApp' : channel === 'AI_CALL' ? 'AI Sesli Arama' : channel === 'EMAIL' ? 'E-posta' : 'SMS';
        const defaultName = `Toplu ${channelLabel} - ${dateStr} ${timeStr}`;
        const effectiveName = campaignName?.trim() || defaultName;

        // 1. Fetch eligible contacts
        let contacts = await prisma.contact.findMany({
            where: {
                id: { in: contactIds },
                workspaceId,
                isDeleted: false,
                isArchived: false
            }
        });

        if (channel === 'WHATSAPP' || channel === 'AI_CALL' || channel === 'SMS') {
            contacts = contacts.filter(c => c.phone && c.phone.trim().length >= 7);
        } else if (channel === 'EMAIL') {
            contacts = contacts.filter(c => c.email && c.email.trim().length >= 3);
        }

        if (contacts.length === 0) {
            return res.status(400).json({ error: 'Seçilen kişiler arasında bu kanal için geçerli iletişim bilgisine sahip kişi bulunamadı' });
        }

        // 2. Create target audience ContactGroup
        const contactGroup = await prisma.contactGroup.create({
            data: {
                workspaceId,
                name: `${effectiveName} Hedef Kitlesi`,
                description: `Kişiler ekranından toplu ${channelLabel} işlemiyle oluşturuldu (${contacts.length} kişi)`,
                icon: channel === 'WHATSAPP' ? '📱' : channel === 'AI_CALL' ? '📞' : channel === 'EMAIL' ? '📧' : '💬',
                color: channel === 'WHATSAPP' ? '#25d366' : channel === 'AI_CALL' ? '#8b5cf6' : channel === 'EMAIL' ? '#2563eb' : '#f59e0b',
                members: {
                    create: contacts.map(c => ({ contactId: c.id }))
                }
            }
        });

        // 3. Create MarketingCampaign
        const campaign = await prisma.marketingCampaign.create({
            data: {
                workspaceId,
                name: effectiveName,
                description: `Kişiler ekranından başlatılan hızlı ${channelLabel} gönderimi`,
                status: 'ACTIVE',
                type: 'MANUAL_BULK',
                startDate: now
            }
        });

        // 4. Create MarketingMessage
        let marketingMessage;
        if (channel === 'WHATSAPP') {
            const waTpl = await prisma.whatsappTemplate.findFirst({
                where: {
                    OR: [
                        templateId ? { id: templateId } : null,
                        templateName ? { name: templateName } : null
                    ].filter(Boolean),
                    workspaceId
                }
            }).catch(() => null);

            marketingMessage = await prisma.marketingMessage.create({
                data: {
                    workspaceId,
                    name: `${effectiveName} - WhatsApp (${templateName || waTpl?.name || 'Şablon'})`,
                    channel: 'WHATSAPP',
                    templateId: waTpl?.id || null,
                    templateName: templateName || waTpl?.name || 'genel_sablon',
                    content: waTpl?.bodyText || '',
                    mediaUrl: headerMediaUrl || waTpl?.headerContent || null
                }
            });
        } else if (channel === 'AI_CALL') {
            const ws = await prisma.workspace.findUnique({
                where: { id: workspaceId },
                select: { retellAgentId: true }
            });
            const effectiveAgentId = agentId || ws?.retellAgentId || null;

            marketingMessage = await prisma.marketingMessage.create({
                data: {
                    workspaceId,
                    name: `${effectiveName} - AI Sesli Arama`,
                    channel: 'AI_CALL',
                    retellAgentId: effectiveAgentId,
                    content: `AI Arama Agent (${effectiveAgentId || 'Varsayılan'})`
                }
            });
        } else if (channel === 'EMAIL') {
            marketingMessage = await prisma.marketingMessage.create({
                data: {
                    workspaceId,
                    name: `${effectiveName} - E-posta (${emailSubject || 'Konusuz'})`,
                    channel: 'EMAIL',
                    content: emailBody || '',
                    emailSubject: emailSubject || '',
                    emailBody: emailBody || ''
                }
            });
        } else if (channel === 'SMS') {
            marketingMessage = await prisma.marketingMessage.create({
                data: {
                    workspaceId,
                    name: `${effectiveName} - SMS`,
                    channel: 'SMS',
                    content: smsText || ''
                }
            });
        }

        // 5. Create CampaignGroup (Reklam Grubu)
        const group = await prisma.campaignGroup.create({
            data: {
                campaignId: campaign.id,
                name: `${effectiveName} - ${channelLabel} Reklam Grubu`,
                channel,
                listId: contactGroup.id,
                status: 'SENDING',
                sendRate: parseInt(sendRate) || 30,
                sentAt: now,
                groupMessages: {
                    create: {
                        messageId: marketingMessage.id,
                        order: 0
                    }
                }
            }
        });

        // 6. Launch execution in background via executeGroupSendCore
        executeGroupSendCore(workspaceId, group.id).catch(err => {
            console.error(`❌ [quickBulkCampaign] Background execution error:`, err);
        });

        return res.json({
            success: true,
            campaign,
            group,
            contactGroupId: contactGroup.id,
            totalEligible: contacts.length,
            message: `"${effectiveName}" kampanyası ve "${group.name}" reklam grubu oluşturuldu. ${contacts.length} kişiye gönderim başlatıldı.`
        });

    } catch (error) {
        console.error('❌ [quickBulkCampaign]', error);
        return res.status(500).json({ error: error.message || 'Hızlı kampanya oluşturulamadı' });
    }
};

// ══════════════════════════════════════════════════════════════════════════
// CAMPAIGN DETAIL — Mesaj önizlemesi + alıcı özeti
// ══════════════════════════════════════════════════════════════════════════

export const getCampaignFullDetail = async (req, res) => {
    try {
        const { workspaceId, id } = req.params;

        const campaign = await prisma.marketingCampaign.findFirst({
            where: { id, workspaceId },
            include: {
                groups: {
                    include: {
                        groupMessages: {
                            include: {
                                message: true
                            }
                        },
                        list: { select: { id: true, name: true, icon: true, color: true } }
                    }
                },
                messagesLegacy: true,
                template: true,
                _count: { select: { recipients: true, groups: true } }
            }
        });

        if (!campaign) return res.status(404).json({ error: 'Kampanya bulunamadı' });

        // Alıcı durum özeti
        const statusCounts = await prisma.marketingRecipient.groupBy({
            by: ['status'],
            where: { campaignId: id },
            _count: { id: true }
        });

        const statusSummary = Object.fromEntries(statusCounts.map(s => [s.status, s._count.id]));

        // Mesaj önizlemelerini topla
        const messagePreviews = [];

        // v2 gruplarından mesajları çek
        for (const group of campaign.groups) {
            for (const gm of group.groupMessages) {
                if (gm.message) {
                    messagePreviews.push({
                        id: gm.message.id,
                        name: gm.message.name,
                        channel: gm.message.channel,
                        content: gm.message.content,
                        templateName: gm.message.templateName,
                        groupName: group.name
                    });
                }
            }
        }

        // Legacy mesajlar
        if (campaign.messagesLegacy?.length > 0) {
            for (const msg of campaign.messagesLegacy) {
                messagePreviews.push({
                    id: msg.id,
                    name: msg.name,
                    channel: msg.channel,
                    content: msg.content,
                    templateName: msg.templateName,
                    groupName: '(Legacy)'
                });
            }
        }

        // Template varsa (eski v1 kampanya)
        if (campaign.template) {
            messagePreviews.push({
                id: 'template-' + campaign.template.id,
                name: campaign.template.name,
                channel: 'WHATSAPP',
                content: campaign.template.bodyText || campaign.template.components,
                templateName: campaign.template.name,
                groupName: '(Şablon)'
            });
        }

        // Hedef liste bilgileri
        const targetLists = campaign.groups
            .filter(g => g.list)
            .map(g => ({ id: g.list.id, name: g.list.name, icon: g.list.icon, color: g.list.color, groupName: g.name }));

        // Grup-bazlı istatistikler
        const groupsWithStats = campaign.groups.map(g => ({
            id: g.id,
            name: g.name,
            groupTag: g.groupTag || g.name, // Gruplama için — yoksa isim kullanılır
            channel: g.channel,
            status: g.status,
            listId: g.listId,
            segmentId: g.segmentId,
            segmentName: g.segmentName,
            sendRate: g.sendRate,
            scheduledAt: g.scheduledAt,
            sentAt: g.sentAt,
            createdAt: g.createdAt,
            totalCount: g.totalCount,
            sentCount: g.sentCount,
            deliveredCount: g.deliveredCount,
            readCount: g.readCount,
            failedCount: g.failedCount,
            repliedCount: g.repliedCount,
            list: g.list || null,
            groupMessages: g.groupMessages.map(gm => ({
                id: gm.id,
                messageId: gm.messageId,
                order: gm.order,
                message: gm.message ? {
                    id: gm.message.id,
                    name: gm.message.name,
                    channel: gm.message.channel,
                    templateName: gm.message.templateName,
                    content: gm.message.content
                } : null
            }))
        }));

        res.json({
            success: true,
            campaign: {
                id: campaign.id,
                name: campaign.name,
                description: campaign.description,
                status: campaign.status,
                channel: campaign.channel,
                sentCount: campaign.sentCount,
                deliveredCount: campaign.deliveredCount,
                readCount: campaign.readCount,
                failedCount: campaign.failedCount,
                repliedCount: campaign.repliedCount,
                sentAt: campaign.sentAt,
                createdAt: campaign.createdAt,
                startDate: campaign.startDate,
                endDate: campaign.endDate,
                budget: campaign.budget,
                isAutomation: campaign.type === 'AUTOMATION' || Boolean(campaign.automationId),
                groups: groupsWithStats
            },
            groups: groupsWithStats,
            statusSummary,
            messagePreviews,
            targetLists,
            totalRecipients: campaign._count.recipients,
            totalGroups: campaign._count.groups
        });
    } catch (error) {
        console.error('❌ [getCampaignFullDetail]', error);
        res.status(500).json({ error: 'Kampanya detayı yüklenemedi' });
    }
};

// ══════════════════════════════════════════════════════════════════════════
// CAMPAIGN RECIPIENTS — Sayfalı alıcı listesi
// ══════════════════════════════════════════════════════════════════════════

export const getCampaignRecipients = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, page = 1, limit = 50, search, groupId } = req.query;

        const where = { campaignId: id };
        if (groupId) where.groupId = groupId;
        if (status && status !== 'ALL') where.status = status;
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search } },
                { email: { contains: search, mode: 'insensitive' } }
            ];
        }

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
        const statusWhere = { campaignId: id };
        if (groupId) statusWhere.groupId = groupId;
        const statusCounts = await prisma.marketingRecipient.groupBy({
            by: ['status'],
            where: statusWhere,
            _count: { id: true }
        });

        res.json({
            success: true,
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

// ══════════════════════════════════════════════════════════════════════════
// RETRY FAILED — Başarısız alıcılara tekrar gönderim
// ══════════════════════════════════════════════════════════════════════════

export const retryCampaignFailed = async (req, res) => {
    try {
        const { workspaceId, id } = req.params;

        const campaign = await prisma.marketingCampaign.findFirst({
            where: { id, workspaceId },
            include: {
                template: true,
                groups: {
                    include: {
                        groupMessages: { include: { message: true } }
                    }
                }
            }
        });
        if (!campaign) return res.status(404).json({ error: 'Kampanya bulunamadı' });

        const failedRecipients = await prisma.marketingRecipient.findMany({
            where: { campaignId: id, status: 'FAILED' }
        });

        if (failedRecipients.length === 0) {
            return res.json({ success: true, retried: 0, message: 'Başarısız alıcı yok' });
        }

        // WhatsApp numarasını bul
        const whatsappPhone = await prisma.whatsappPhoneNumber.findFirst({ where: { workspaceId } });
        if (!whatsappPhone) return res.status(400).json({ error: 'WhatsApp numarası bağlı değil' });

        // Template'i bul — önce v2 group mesajlarından, yoksa campaign template'den
        let templateName = null;
        let templateLang = 'tr';

        if (campaign.groups?.length > 0) {
            for (const group of campaign.groups) {
                for (const gm of group.groupMessages) {
                    if (gm.message?.templateName) {
                        templateName = gm.message.templateName;
                        break;
                    }
                }
                if (templateName) break;
            }
        }

        if (!templateName && campaign.template) {
            templateName = campaign.template.name;
            templateLang = campaign.template.language || 'tr';
        }

        if (!templateName) {
            return res.status(400).json({ error: 'Kampanyada WhatsApp şablonu bulunamadı' });
        }

        // Kampanyayı RUNNING yap
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
        const WHATSAPP_API_VERSION = process.env.WHATSAPP_API_VERSION || 'v21.0';
        setImmediate(async () => {
            let retried = 0, stillFailed = 0;

            for (const recipient of failedRecipients) {
                try {
                    await prisma.marketingRecipient.update({
                        where: { id: recipient.id },
                        data: { status: 'PENDING', failReason: null, failedAt: null }
                    });

                    const payload = {
                        messaging_product: 'whatsapp',
                        to: recipient.phone,
                        type: 'template',
                        template: {
                            name: templateName,
                            language: { code: templateLang }
                        }
                    };

                    const apiUrl = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${whatsappPhone.phoneNumberId}/messages`;
                    const response = await axios.post(apiUrl, payload, {
                        headers: { Authorization: `Bearer ${whatsappPhone.accessToken}`, 'Content-Type': 'application/json' }
                    });

                    const waMessageId = response.data?.messages?.[0]?.id;

                    // Message tablosuna kayıt oluştur (webhook takibi için)
                    let dbMessageId = waMessageId;
                    try {
                        const conversation = recipient.contactId
                            ? await prisma.conversation.findFirst({
                                where: { contactId: recipient.contactId, workspaceId }
                            })
                            : null;

                        if (conversation) {
                            const dbMsg = await prisma.message.create({
                                data: {
                                    conversationId: conversation.id,
                                    content: `[Kampanya Tekrar Gönderim] ${templateName}`,
                                    isFromContact: false,
                                    whatsappMessageId: waMessageId,
                                    type: 'TEMPLATE',
                                    status: 'sent',
                                    channel: 'WHATSAPP'
                                }
                            });
                            dbMessageId = dbMsg.id;
                        }
                    } catch (_) {}

                    await prisma.marketingRecipient.update({
                        where: { id: recipient.id },
                        data: { status: 'SENT', messageId: dbMessageId, sentAt: new Date() }
                    });
                    retried++;

                    await new Promise(r => setTimeout(r, 1500));
                } catch (err) {
                    console.error(`❌ [Campaign Retry v2] Failed for ${recipient.phone}:`, err.response?.data?.error?.message || err.message);
                    await prisma.marketingRecipient.update({
                        where: { id: recipient.id },
                        data: { status: 'FAILED', failedAt: new Date(), failReason: err.response?.data?.error?.message || err.message }
                    });
                    stillFailed++;
                }
            }

            // Kampanya sayaçlarını güncelle
            const counts = await prisma.marketingRecipient.groupBy({
                by: ['status'],
                where: { campaignId: id },
                _count: { id: true }
            });
            const countMap = Object.fromEntries(counts.map(c => [c.status, c._count.id]));

            await prisma.marketingCampaign.update({
                where: { id },
                data: {
                    status: 'COMPLETED',
                    sentCount: (countMap.SENT || 0) + (countMap.DELIVERED || 0) + (countMap.READ || 0),
                    deliveredCount: countMap.DELIVERED || 0,
                    readCount: countMap.READ || 0,
                    failedCount: countMap.FAILED || 0
                }
            });

            console.log(`🔄 [Campaign Retry v2] Done: ${retried} resent, ${stillFailed} still failed`);
        });
    } catch (error) {
        console.error('❌ [retryCampaignFailed v2]', error);
        res.status(500).json({ error: 'Tekrar gönderim başlatılamadı' });
    }
};
