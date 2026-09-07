import prisma from '../lib/prisma.js';
import axios from 'axios';
import { randomUUID } from 'crypto';

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
            const isLegacy = c.groups.length === 0 && (c._count.recipients > 0 || c.messagesLegacy.length > 0 || c.templateId != null);
            return {
                ...c,
                isLegacy,
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

        await prisma.marketingCampaign.delete({
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

        res.json({ success: true, groups });
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

        res.json({ success: true, groups });
    } catch (error) {
        console.error('❌ [getGroups]', error);
        res.status(500).json({ error: 'Gruplar getirilemedi' });
    }
};

export const createGroup = async (req, res) => {
    try {
        const { workspaceId, campaignId } = req.params;
        const { name, channel, listId, segmentId, budget, sendRate, scheduledAt } = req.body;

        const group = await prisma.campaignGroup.create({
            data: {
                campaignId,
                name,
                channel: channel || 'WHATSAPP',
                listId,
                segmentId,
                budget,
                sendRate: sendRate || 20,
                scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
                status: 'DRAFT'
            }
        });

        res.json({ success: true, group });
    } catch (error) {
        console.error('❌ [createGroup]', error);
        res.status(500).json({ error: 'Grup oluşturulamadı' });
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
        const { name, channel, templateId, templateName, content, retellAgentId, emailSubject, emailBody, mediaUrl } = req.body;

        const message = await prisma.marketingMessage.create({
            data: {
                workspaceId,
                name,
                channel: channel || 'WHATSAPP',
                templateId,
                templateName,
                content,
                retellAgentId,
                emailSubject,
                emailBody,
                mediaUrl
            }
        });

        res.json({ success: true, message });
    } catch (error) {
        console.error('❌ [createMessage]', error);
        res.status(500).json({ error: 'Mesaj oluşturulamadı' });
    }
};

export const updateMessage = async (req, res) => {
    try {
        const { workspaceId, id } = req.params;
        const { name, channel, templateId, templateName, content, retellAgentId, emailSubject, emailBody, mediaUrl } = req.body;

        const message = await prisma.marketingMessage.update({
            where: { id, workspaceId },
            data: {
                name,
                channel,
                templateId,
                templateName,
                content,
                retellAgentId,
                emailSubject,
                emailBody,
                mediaUrl
            }
        });

        res.json({ success: true, message });
    } catch (error) {
        console.error('❌ [updateMessage]', error);
        res.status(500).json({ error: 'Mesaj güncellenemedi' });
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
// 5. EXECUTE GROUP SEND
// ══════════════════════════════════════════════════════════════════════════

export const executeGroupSend = async (req, res) => {
    try {
        const { workspaceId, groupId } = req.params;

        const group = await prisma.campaignGroup.findFirst({
            where: { id: groupId, campaign: { workspaceId } },
            include: {
                campaign: true,
                groupMessages: { include: { message: true }, orderBy: { order: 'asc' } },
                list: { include: { members: { include: { contact: true } } } }
            }
        });

        if (!group) return res.status(404).json({ error: 'Grup bulunamadı' });
        if (group.status === 'SENDING') return res.status(400).json({ error: 'Grup zaten gönderim aşamasında' });
        
        let contacts = [];
        if (group.listId && group.list) {
            contacts = group.list.members.map(m => m.contact).filter(c => c && !c.isDeleted);
        } else if (group.segmentId) {
            const { buildSegmentWhere } = await import('../services/smartSegment.service.js');
            const segResult = await buildSegmentWhere(group.segmentId, workspaceId);
            const where = { workspaceId, isDeleted: false, ...segResult.where };
            if (segResult.contactIds) where.id = { in: segResult.contactIds };
            contacts = await prisma.contact.findMany({ where });
        }

        if (contacts.length === 0) {
            return res.status(400).json({ error: 'Gönderilecek kişi bulunamadı (Liste boş)' });
        }

        const messages = group.groupMessages.map(gm => gm.message);
        if (messages.length === 0) {
            return res.status(400).json({ error: 'Gönderilecek mesaj bulunamadı' });
        }

        // Update group status
        await prisma.campaignGroup.update({
            where: { id: groupId },
            data: { status: 'SENDING' }
        });
        
        // Respond immediately, execute in background
        res.json({
            success: true,
            message: `${contacts.length} kişiye gönderim başlatıldı`,
            queuedCount: contacts.length
        });

        // ─── Background Processing ───
        setImmediate(async () => {
            const sendRate = group.sendRate || 20;
            const delayMs = Math.floor(60000 / sendRate); // ms between messages

            try {
                // Sadece WHATSAPP veya AI_CALL kanalları için basit implementasyon:
                if (group.channel === 'WHATSAPP') {
                    const whatsappPhone = await prisma.whatsappPhoneNumber.findFirst({ where: { workspaceId } });
                    if (!whatsappPhone) throw new Error('WhatsApp numarası bağlı değil');
                    
                    const WHATSAPP_API_VERSION = process.env.WHATSAPP_API_VERSION || 'v21.0';
                    const apiUrl = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${whatsappPhone.phoneNumberId}/messages`;

                    // İlk mesajı alalım:
                    const msgTemplate = messages.find(m => m.channel === 'WHATSAPP');
                    if (!msgTemplate || !msgTemplate.templateName) throw new Error('WA mesaj şablonu bulunamadı');

                    let sent = 0;
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
                                    language: { code: 'tr' } // Varsayılan TR (gerektiğinde DB'den alınabilir)
                                }
                            };

                            const response = await axios.post(apiUrl, payload, {
                                headers: { Authorization: `Bearer ${whatsappPhone.accessToken}`, 'Content-Type': 'application/json' }
                            });

                            const newWaId = response.data?.messages?.[0]?.id;

                            // Mesaj kaydı ve MarketingRecipient
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

                            // Create MarketingRecipient
                            await prisma.marketingRecipient.create({
                                data: {
                                    campaignId: group.campaignId,
                                    contactId: contact.id,
                                    messageId: dbMessage.id,
                                    status: 'SENT',
                                    groupId: groupId,
                                    sentAt: new Date()
                                }
                            });

                            sent++;

                            // Update stats occasionally or at end
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
                    // AI Arama mantığı
                    const msgTemplate = messages.find(m => m.channel === 'AI_CALL');
                    if (!msgTemplate || !msgTemplate.retellAgentId) throw new Error('AI ajan kimliği bulunamadı');

                    const { initiateRetellCallCore } = await import('../controllers/retell.controller.js');
                    
                    for (const contact of contacts) {
                        const phone = contact.phone?.replace(/[\s\+\-\(\)]/g, '');
                        if (!phone) continue;
                        
                        try {
                            const callData = await initiateRetellCallCore(workspaceId, contact.id, msgTemplate.retellAgentId, phone);
                            
                            await prisma.marketingRecipient.create({
                                data: {
                                    campaignId: group.campaignId,
                                    contactId: contact.id,
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
                                    status: 'FAILED',
                                    groupId: groupId,
                                    failReason: err.message,
                                    failedAt: new Date()
                                }
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

    } catch (error) {
        console.error('❌ [executeGroupSend]', error);
        res.status(500).json({ error: 'Grup gönderimi başlatılamadı' });
    }
};
