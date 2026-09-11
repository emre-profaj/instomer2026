import prisma from '../lib/prisma.js';
import axios from 'axios';
import { randomUUID } from 'crypto';
import Retell from 'retell-sdk';
import { normalizePhone } from '../utils/phoneNormalizer.js';

// ══════════════════════════════════════════════════════════════════════════
// 1. CAMPAIGNS CRUD
// ══════════════════════════════════════════════════════════════════════════

export const getCampaigns = async (req, res) => {
    try {
        const { workspaceId } = req.params;

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
            const isArchive = c.type === 'ARCHIVE_DEFAULT';
            const isLegacy = !isAutomation && !isArchive && c.groups.length === 0 && (c._count.recipients > 0 || c.messagesLegacy.length > 0 || c.templateId != null);
            return {
                ...c,
                isLegacy,
                isAutomation,
                isArchive,
                groupsCount: c._count.groups,
                recipientsCount: c._count.recipients,
                stats: {
                    sent: c.sentCount || 0,
                    delivered: c.deliveredCount || 0,
                    read: c.readCount || 0,
                    failed: c.failedCount || 0,
                    replied: c.repliedCount || 0
                }
            };
        });

        // Aggregate stats for top bar
        const stats = {
            total: mapped.length,
            active: mapped.filter(c => c.status === 'ACTIVE').length,
            sent: mapped.reduce((sum, c) => sum + (c.sentCount || 0), 0),
            delivered: mapped.reduce((sum, c) => sum + (c.deliveredCount || 0), 0),
            read: mapped.reduce((sum, c) => sum + (c.readCount || 0), 0)
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

        const isLegacy = campaign.groups.length === 0 && (campaign._count.recipients > 0 || campaign.messagesLegacy.length > 0 || campaign.templateId != null);

        res.json({ success: true, campaign: { ...campaign, isLegacy } });
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
        const { name, channel, listId, segmentId, budget, sendRate, scheduledAt } = req.body;

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
                channel: channel || 'WHATSAPP',
                listId: listId || null,
                segmentId: segmentId || null,
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
        const { name, channel, listId, segmentId, budget, sendRate, scheduledAt, status } = req.body;

        const group = await prisma.campaignGroup.update({
            where: { id: groupId, campaign: { workspaceId } },
            data: {
                name,
                channel,
                listId,
                segmentId,
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
                                language: { code: 'tr' }
                            }
                        };

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
                if (!msgTemplate || !msgTemplate.retellAgentId) throw new Error('AI ajan kimliği bulunamadı');

                const workspace = await prisma.workspace.findUnique({
                    where: { id: workspaceId },
                    select: { retellApiKey: true, retellFromNumber: true }
                });
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
                            override_agent_id: msgTemplate.retellAgentId,
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
                                agentId: msgTemplate.retellAgentId,
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
            }

            await prisma.campaignGroup.update({
                where: { id: groupId },
                data: { status: 'COMPLETED' }
            });

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
// 8. SYNC PAST DATA (META & RETELL ARCHIVE CAMPAIGN)
// ══════════════════════════════════════════════════════════════════════════

export const syncPastData = async (req, res) => {
    try {
        const { workspaceId } = req.params;

        // 1. Find or create default archive campaign
        let archiveCampaign = await prisma.marketingCampaign.findFirst({
            where: { workspaceId, type: 'ARCHIVE_DEFAULT' }
        });

        if (!archiveCampaign) {
            archiveCampaign = await prisma.marketingCampaign.create({
                data: {
                    workspaceId,
                    name: 'Genel & Geçmiş Gönderimler (Arşiv)',
                    description: 'Sistemdeki geçmiş Meta WhatsApp şablonları ve Retell AI aramaları',
                    status: 'COMPLETED',
                    type: 'ARCHIVE_DEFAULT'
                }
            });
        }

        // 2. Find or create default groups under archive campaign
        let waGroup = await prisma.campaignGroup.findFirst({
            where: { campaignId: archiveCampaign.id, channel: 'WHATSAPP' }
        });
        if (!waGroup) {
            waGroup = await prisma.campaignGroup.create({
                data: {
                    campaignId: archiveCampaign.id,
                    name: 'WhatsApp Şablon Gönderimleri (Meta)',
                    channel: 'WHATSAPP',
                    status: 'COMPLETED'
                }
            });
        }

        let callGroup = await prisma.campaignGroup.findFirst({
            where: { campaignId: archiveCampaign.id, channel: 'AI_CALL' }
        });
        if (!callGroup) {
            callGroup = await prisma.campaignGroup.create({
                data: {
                    campaignId: archiveCampaign.id,
                    name: 'AI Sesli Aramalar (Retell)',
                    channel: 'AI_CALL',
                    status: 'COMPLETED'
                }
            });
        }

        // 3. Find all past WhatsApp TEMPLATE messages
        const pastWaMessages = await prisma.message.findMany({
            where: {
                messageType: 'TEMPLATE',
                isFromContact: false,
                conversation: { workspaceId }
            },
            include: { conversation: { include: { contact: true } } }
        });

        let waSent = pastWaMessages.length;
        let waDelivered = 0;
        let waRead = 0;
        let waFailed = 0;

        for (const msg of pastWaMessages) {
            const status = msg.status || 'SENT';
            if (['DELIVERED', 'READ'].includes(status)) waDelivered++;
            if (status === 'READ') waRead++;
            if (status === 'FAILED') waFailed++;

            const existingRec = await prisma.marketingRecipient.findFirst({
                where: { messageId: msg.id }
            });

            if (!existingRec) {
                await prisma.marketingRecipient.create({
                    data: {
                        campaignId: archiveCampaign.id,
                        groupId: waGroup.id,
                        contactId: msg.conversation?.contactId,
                        phone: msg.conversation?.contact?.phone,
                        name: msg.conversation?.contact?.name,
                        messageId: msg.id,
                        status,
                        deliveredAt: ['DELIVERED', 'READ'].includes(status) ? msg.updatedAt : null,
                        readAt: status === 'READ' ? msg.updatedAt : null,
                        failedAt: status === 'FAILED' ? msg.updatedAt : null,
                        sentAt: msg.createdAt
                    }
                });
            }
        }

        await prisma.campaignGroup.update({
            where: { id: waGroup.id },
            data: {
                sentCount: waSent,
                deliveredCount: waDelivered,
                readCount: waRead,
                failedCount: waFailed
            }
        });

        // 4. Find all past Retell AI calls
        const pastCalls = await prisma.retellCall.findMany({
            where: { workspaceId }
        });

        let callsTotal = pastCalls.length;
        let callsSuccessful = pastCalls.filter(c => c.callSuccessful || (c.duration && c.duration > 15)).length;
        let callsFailed = callsTotal - callsSuccessful;

        await prisma.campaignGroup.update({
            where: { id: callGroup.id },
            data: {
                sentCount: callsTotal,
                deliveredCount: callsSuccessful,
                readCount: callsSuccessful,
                failedCount: callsFailed
            }
        });

        // 5. Update overall archive campaign stats
        await prisma.marketingCampaign.update({
            where: { id: archiveCampaign.id },
            data: {
                sentCount: waSent + callsTotal,
                deliveredCount: waDelivered + callsSuccessful,
                readCount: waRead + callsSuccessful,
                failedCount: waFailed + callsFailed
            }
        });

        res.json({
            success: true,
            message: 'Geçmiş Meta & Retell verileri başarıyla eşitlendi',
            archiveCampaign,
            synced: {
                whatsappCount: waSent,
                whatsappDelivered: waDelivered,
                whatsappRead: waRead,
                retellCallsCount: callsTotal,
                retellCallsSuccessful: callsSuccessful
            }
        });

    } catch (error) {
        console.error('❌ [syncPastData]', error);
        res.status(500).json({ error: 'Geçmiş veriler eşitlenemedi' });
    }
};
