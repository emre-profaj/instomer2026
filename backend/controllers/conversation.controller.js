import { validationResult } from 'express-validator';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import { sendEmailReply } from './email.controller.js';
import { getIO, emitToWorkspace, emitToUser } from '../socket.js';

const prisma = new PrismaClient();
const GRAPH_API_VERSION = process.env.FACEBOOK_GRAPH_API_VERSION || 'v18.0';

export const getConversations = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { status, assignedToId, teamId, channel, contactId, page = 1, limit = 20 } = req.query;

        const { role } = req.workspaceMember; // Available from requireWorkspaceAccess middleware

        const where = {
            workspaceId,
            ...(channel === 'WHATSAPP' && {
                OR: [{ channel: 'WHATSAPP' }, { whatsappPhoneNumberId: { not: null } }]
            }),
            ...(channel === 'FACEBOOK' && {
                OR: [{ channel: 'FACEBOOK' }, { facebookPageId: { not: null }, instagramBusinessId: null }]
            }),
            ...(channel === 'INSTAGRAM' && {
                OR: [{ channel: 'INSTAGRAM' }, { instagramBusinessId: { not: null } }]
            }),
            ...(channel === 'EMAIL' && {
                channel: 'EMAIL'
            }),
            ...(channel === 'WIDGET' && {
                channel: 'WIDGET'
            }),
            ...(status && { status }),
            ...(contactId && { contactId })
        };

        // Handle teamId if explicitly provided
        if (teamId) {
            where.teamIds = { contains: `"${teamId}"` };
        }

        // Role-based visibility and explicit assignment filtering
        if (role === 'AGENT') {
            // Agents see conversations assigned to them OR their teams (but NOT assigned to someone else)
            const userTeams = await prisma.teamMember.findMany({
                where: { userId: req.user.id },
                select: { teamId: true }
            });
            const myTeamIds = userTeams.map(t => t.teamId);

            // 🚀 LEAD Kanalı için özel kural:
            // LEAD'ler için agent sadece kendisine atanmış olanları görebilir
            // Diğer kanallar için: kendisine atanmış VEYA takımında atanmamış olanlar
            const isLeadChannel = channel === 'LEAD';

            let accessCondition;
            if (isLeadChannel) {
                // LEAD: Sadece kendisine atanmış lead'ler
                accessCondition = {
                    assignedToId: req.user.id
                };
                console.log(`🔒 [LEAD Filter] Agent ${req.user.id} can only see assigned leads`);
            } else {
                // Diğer kanallar: Kendisine atanmış VEYA takımında atanmamış
                accessCondition = {
                    OR: [
                        { assignedToId: req.user.id }, // Kendisine atanmış
                        ...myTeamIds.map(tid => ({
                            AND: [
                                { teamIds: { contains: `"${tid}"` } },
                                { assignedToId: null } // Takımında VE kimseye atanmamış
                            ]
                        }))
                    ]
                };
            }

            // Combine access control with requested filters
            if (assignedToId) {
                if (assignedToId === 'mine') {
                    where.assignedToId = req.user.id;
                    console.log(`🔍 [MINE Filter - AGENT] User ${req.user.id} looking for their assigned conversations`);
                } else if (assignedToId === 'my_teams') {
                    // Takımındaki tüm konuşmalar (kimseye atanmamış olanlar)
                    // LEAD için bu filtre çalışmaz - sadece atanmış lead'ler
                    if (isLeadChannel) {
                        where.assignedToId = req.user.id;
                    } else {
                        where.AND = [
                            { OR: myTeamIds.map(tid => ({ teamIds: { contains: `"${tid}"` } })) },
                            { assignedToId: null }
                        ];
                    }
                } else if (assignedToId === 'unassigned') {
                    // LEAD için atanmamışları gösterme
                    if (isLeadChannel) {
                        where.AND = [{ assignedToId: req.user.id }, { id: 'impossible' }]; // Boş sonuç
                    } else {
                        where.AND = [accessCondition, { assignedToId: null, teamIds: { equals: '[]' } }];
                    }
                } else if (assignedToId.startsWith('team:')) {
                    const tid = assignedToId.split(':')[1];
                    where.AND = [accessCondition, { teamIds: { contains: `"${tid}"` } }];
                } else {
                    where.AND = [accessCondition, { assignedToId }];
                }
            } else if (!teamId) {
                // No specific filter, show everything available to agent
                where.AND = [accessCondition];
            } else if (teamId) {
                where.AND = [accessCondition, { teamIds: { contains: `"${teamId}"` } }];
            }
        } else {
            // ADMIN/OWNER logic
            if (assignedToId) {
                if (assignedToId === 'unassigned') {
                    where.assignedToId = null;
                    where.teamIds = { equals: '[]' };
                } else if (assignedToId === 'mine') {
                    where.assignedToId = req.user.id;
                    console.log(`🔍 [MINE Filter - OWNER] User ${req.user.id} looking for their assigned conversations`);
                } else if (assignedToId === 'my_teams') {
                    const userTeams = await prisma.teamMember.findMany({
                        where: { userId: req.user.id },
                        select: { teamId: true }
                    });
                    const myTeamIds = userTeams.map(t => t.teamId);
                    where.OR = myTeamIds.map(tid => ({ teamIds: { contains: `"${tid}"` } }));
                } else if (assignedToId.startsWith('team:')) {
                    const tid = assignedToId.split(':')[1];
                    where.teamIds = { contains: `"${tid}"` };
                } else {
                    where.assignedToId = assignedToId;
                }
            }
        }

        const conversations = await prisma.conversation.findMany({
            where,
            include: {
                contact: {
                    select: {
                        id: true,
                        name: true,
                        fullName: true,
                        avatar: true,
                        email: true,
                        phone: true,
                        facebookId: true,
                        instagramUsername: true,
                        company: true,
                        status: true
                    }
                },
                assignedTo: {
                    select: {
                        id: true,
                        name: true,
                        avatar: true
                    }
                },
                assignedBot: {
                    select: {
                        id: true,
                        name: true,
                        role: true
                    }
                },
                facebookPage: {
                    select: {
                        id: true,
                        pageName: true,
                        instagramUsername: true,
                        instagramBusinessId: true
                    }
                },
                whatsappPhoneNumber: {
                    select: {
                        id: true,
                        displayPhoneNumber: true
                    }
                },
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    select: {
                        id: true,
                        content: true,
                        createdAt: true,
                        isFromContact: true
                    }
                },
                _count: {
                    select: {
                        messages: true
                    }
                }
            },
            orderBy: { lastMessageAt: 'desc' },
            skip: (parseInt(page) - 1) * parseInt(limit),
            take: parseInt(limit)
        });

        const total = await prisma.conversation.count({ where });

        console.log(`📋 [getConversations] Found ${conversations.length} conversations (total: ${total}), filter: assignedToId=${req.query.assignedToId}`);
        if (req.query.assignedToId === 'mine') {
            console.log(`📋 [MINE] Where clause:`, JSON.stringify(where, null, 2));
        }

        res.json({
            conversations,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                totalPages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Get conversations error:', error);
        res.status(500).json({ error: 'Failed to fetch conversations' });
    }
};

// Get total unread count for messages only (FACEBOOK, INSTAGRAM, WHATSAPP)
export const getUnreadCount = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { role } = req.workspaceMember;

        // Only count direct message channels (not WIDGET, EMAIL, LEAD, etc.)
        const messageChannels = ['FACEBOOK', 'INSTAGRAM', 'WHATSAPP', 'PHONE'];

        let where = {
            workspaceId,
            channel: { in: messageChannels },
            unreadCount: { gt: 0 }
        };

        // Agents only see their own assigned conversations
        if (role === 'AGENT') {
            const userTeams = await prisma.teamMember.findMany({
                where: { userId: req.user.id },
                select: { teamId: true }
            });
            const myTeamIds = userTeams.map(t => t.teamId);

            where = {
                ...where,
                OR: [
                    { assignedToId: req.user.id },
                    ...(myTeamIds.length > 0 ? myTeamIds.map(tid => ({
                        teamIds: { contains: `"${tid}"` }
                    })) : [])
                ]
            };
        }

        const result = await prisma.conversation.aggregate({
            where,
            _sum: { unreadCount: true }
        });

        const totalUnread = result._sum.unreadCount || 0;

        res.json({ unreadCount: totalUnread });
    } catch (error) {
        console.error('Get unread count error:', error);
        res.status(500).json({ error: 'Failed to get unread count' });
    }
};

// Mark all conversations as read for a workspace
export const markAllAsRead = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const role = req.user.role;

        // Build query based on user role
        let where = {
            workspaceId,
            unreadCount: { gt: 0 }
        };

        // Agents only mark their own assigned conversations as read
        if (role === 'AGENT') {
            const userTeams = await prisma.teamMember.findMany({
                where: { userId: req.user.id },
                select: { teamId: true }
            });
            const teamIds = userTeams.map(t => t.teamId);

            where.OR = [
                { assignedToId: req.user.id },
                ...(teamIds.length > 0 ? teamIds.map(teamId => ({
                    teamIds: { contains: teamId }
                })) : [])
            ];
        }

        // Update all matching conversations
        const result = await prisma.conversation.updateMany({
            where,
            data: { unreadCount: 0 }
        });

        console.log(`✅ Marked ${result.count} conversations as read for workspace ${workspaceId}`);

        res.json({
            success: true,
            markedCount: result.count,
            message: `${result.count} sohbet okundu olarak işaretlendi`
        });
    } catch (error) {
        console.error('Mark all as read error:', error);
        res.status(500).json({ error: 'Tümünü okundu olarak işaretleme başarısız' });
    }
};

export const getConversation = async (req, res) => {
    try {
        const { workspaceId, conversationId } = req.params;

        // Verify conversation belongs to this workspace
        const existing = await prisma.conversation.findFirst({ where: { id: conversationId, workspaceId } });
        if (!existing) {
            console.log(`❌ [getConversation] Conversation not found: ${conversationId} in workspace ${workspaceId}`);
            return res.status(404).json({ error: 'Conversation not found' });
        }

        console.log(`📋 [getConversation] User ${req.user.id} (role: ${req.workspaceMember?.role}) loading conversation ${conversationId}, assignedToId: ${existing.assignedToId}`);

        const conversation = await prisma.conversation.update({
            where: { id: conversationId },
            data: { unreadCount: 0 },
            include: {
                contact: true,
                assignedTo: {
                    select: {
                        id: true,
                        name: true,
                        avatar: true,
                        email: true
                    }
                },
                assignedBot: {
                    select: {
                        id: true,
                        name: true,
                        role: true
                    }
                },
                facebookPage: true,
                whatsappPhoneNumber: true,
                internalNotes: {
                    orderBy: { createdAt: 'asc' },
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                avatar: true
                            }
                        }
                    }
                },
                messages: {
                    orderBy: { createdAt: 'asc' },
                    include: {
                        sender: {
                            select: {
                                id: true,
                                name: true,
                                avatar: true
                            }
                        }
                    }
                },
                transfers: {
                    orderBy: { createdAt: 'desc' },
                    include: {
                        fromUser: {
                            select: { id: true, name: true, avatar: true }
                        },
                        toUser: {
                            select: { id: true, name: true, avatar: true }
                        },
                        team: {
                            select: { id: true, name: true }
                        }
                    }
                }
            }
        });

        if (!conversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        console.log(`✅ [getConversation] Returning conversation with ${conversation.messages?.length || 0} messages, ${conversation.internalNotes?.length || 0} notes`);
        res.json({ conversation });
    } catch (error) {
        console.error('Get conversation error:', error);
        res.status(500).json({ error: 'Failed to fetch conversation' });
    }
};

export const sendMessage = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { conversationId } = req.params;
        const { content, cc, bcc } = req.body;

        // Cancel any pending auto-reply since human is replying
        try {
            const { cancelAutoReplyCheck } = await import('../services/autoReplyDelay.service.js');
            cancelAutoReplyCheck(conversationId);
        } catch (e) {
            // Service might not be available, continue
        }

        // Get conversation with necessary relations
        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
            include: {
                contact: true,
                facebookPage: true,
                whatsappPhoneNumber: true,
                emailChannel: true,
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1
                }
            }
        });

        if (!conversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        // Check for duplicate message within last 5 seconds (same content, same sender)
        const fiveSecondsAgo = new Date(Date.now() - 5000);
        const duplicateMessage = await prisma.message.findFirst({
            where: {
                conversationId,
                content: content,
                senderId: req.user.id,
                isFromContact: false,
                createdAt: { gte: fiveSecondsAgo }
            }
        });

        if (duplicateMessage) {
            console.log(`⏭️ [SendMessage] Duplicate message detected, skipping. Content: ${content.substring(0, 50)}...`);
            return res.status(200).json({ message: duplicateMessage, duplicate: true });
        }

        // Determine message type
        let messageType = 'TEXT';
        if (conversation.instagramBusinessId) {
            messageType = 'INSTAGRAM';
        } else if (conversation.whatsappPhoneNumberId) {
            messageType = 'WHATSAPP';
        } else if (conversation.emailChannelId) {
            messageType = 'EMAIL';
        }

        // Create message in database with initial SENT status
        const message = await prisma.message.create({
            data: {
                content,
                conversationId,
                senderId: req.user.id,
                isFromContact: false,
                messageType,
                status: 'SENT' // Initial status - will be updated to DELIVERED/READ by webhook
            },
            include: {
                sender: {
                    select: {
                        id: true,
                        name: true,
                        avatar: true
                    }
                }
            }
        });

        // Send message via Facebook/Instagram API
        if (conversation.facebookPage && conversation.contact.facebookId) {
            try {
                const isInstagram = !!conversation.instagramBusinessId;
                console.log(`📤 Sending ${isInstagram ? 'Instagram' : 'Facebook'} message to ${conversation.contact.facebookId}`);

                const fbResponse = await axios.post(
                    `https://graph.facebook.com/${GRAPH_API_VERSION}/me/messages`,
                    {
                        recipient: { id: conversation.contact.facebookId },
                        message: { text: content }
                    },
                    {
                        params: {
                            access_token: conversation.facebookPage.pageAccessToken
                        }
                    }
                );

                // Save Facebook message ID and set status to SENT
                const fbMessageId = fbResponse.data?.message_id;
                if (fbMessageId) {
                    await prisma.message.update({
                        where: { id: message.id },
                        data: {
                            facebookMessageId: fbMessageId,
                            status: 'SENT'
                        }
                    });
                    console.log(`✅ ${isInstagram ? 'Instagram' : 'Facebook'} message sent, ID: ${fbMessageId}`);
                }
            } catch (error) {
                console.error(`${conversation.instagramBusinessId ? 'Instagram' : 'Facebook'} send message error:`, error.response?.data || error.message);
            }
        }

        // Send message via WhatsApp API
        if (conversation.whatsappPhoneNumber && (conversation.contact.phone || conversation.contact.email)) {
            const targetPhone = conversation.contact.phone;
            if (targetPhone) {
                // Sanitize phone number (remove +, spaces, etc.) - Meta expects only digits
                const sanitizedPhone = targetPhone.replace(/\D/g, '');

                // Use System User Token if available, otherwise use stored token
                const whatsappToken = process.env.WHATSAPP_SYSTEM_USER_TOKEN || conversation.whatsappPhoneNumber.accessToken;

                try {
                    console.log(`📤 Sending WhatsApp message to ${sanitizedPhone} using Waba ${conversation.whatsappPhoneNumber.phoneNumberId}`);

                    const waResponse = await axios.post(
                        `https://graph.facebook.com/${GRAPH_API_VERSION}/${conversation.whatsappPhoneNumber.phoneNumberId}/messages`,
                        {
                            messaging_product: 'whatsapp',
                            to: sanitizedPhone,
                            type: 'text',
                            text: { body: content }
                        },
                        {
                            headers: {
                                Authorization: `Bearer ${whatsappToken}`
                            }
                        }
                    );

                    console.log('✅ WhatsApp API Success:', waResponse.data);

                    // Get WhatsApp message ID from response
                    const wamid = waResponse.data?.messages?.[0]?.id;

                    // Update message with WhatsApp ID and status
                    await prisma.message.update({
                        where: { id: message.id },
                        data: {
                            messageType: 'WHATSAPP',
                            whatsappMessageId: wamid || null,
                            status: 'SENT'
                        }
                    });
                } catch (error) {
                    console.error('❌ WhatsApp Send Error Details:', {
                        data: error.response?.data,
                        status: error.response?.status,
                        message: error.message
                    });
                }
            }
        }

        // Send message via Email API
        if (conversation.emailChannelId && conversation.contact.email) {
            try {
                const subject = `Re: ${conversation.messages[0]?.emailSubject || 'Hesabınız hakkında'}`;
                await sendEmailReply(
                    conversation.emailChannelId,
                    conversation.contact.email,
                    subject,
                    content,
                    { cc, bcc }
                );
                console.log('✅ Email sent successfully');
            } catch (error) {
                console.error('❌ Email Send Error:', error.message);
            }
        }

        // Update conversation last message time AND disable bot (human took over)
        await prisma.conversation.update({
            where: { id: conversationId },
            data: {
                lastMessageAt: new Date(),
                // 🚀 Kullanıcı manuel mesaj gönderdiğinde bot'u kapat
                botEnabled: false,
                botDelayedUntil: null,
                assignedToId: req.user.id // Otomatik olarak bu kullanıcıya ata
            }
        });

        console.log(`👤 [SendMessage] User ${req.user.name} sent message, bot disabled for conversation ${conversationId}`);

        // --- AUTO EXTRACT START ---
        try {
            const { autoExtractFromConversation } = await import('./ai.controller.js');
            autoExtractFromConversation(conversation.workspaceId, conversationId);
        } catch (extractError) {
            console.error('❌ AI Auto-Extract (Dashboard) failed:', extractError);
        }
        // --- AUTO EXTRACT END ---

        // Get the latest message state (with updated status, messageId, etc.)
        const updatedMessage = await prisma.message.findUnique({
            where: { id: message.id },
            include: {
                sender: {
                    select: {
                        id: true,
                        name: true,
                        avatar: true
                    }
                }
            }
        });

        // Emit WebSocket event for real-time update (workspace-specific)
        try {
            emitToWorkspace(conversation.workspaceId, 'new_message', {
                workspaceId: conversation.workspaceId,
                conversationId: conversationId,
                message: updatedMessage,
                contact: conversation.contact,
                channel: conversation.channel
            });
            console.log(`📡 [SendMessage] WebSocket event emitted for conversation ${conversationId}`);
        } catch (socketError) {
            console.error('❌ WebSocket emit error:', socketError);
        }

        res.status(201).json({ message: updatedMessage });
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
};

export const assignConversation = async (req, res) => {
    try {
        console.log('--- ASSIGN START ---');
        console.log('Body:', req.body);
        console.log('userId from body:', req.body.userId, 'type:', typeof req.body.userId);
        console.log('teamId from body:', req.body.teamId, 'type:', typeof req.body.teamId);
        const { conversationId, workspaceId } = req.params;
        const { userId, teamId } = req.body;

        // Check if requester has permission
        // OWNER ve SUPER_ADMIN her zaman atama yapabilir
        // Agent ise sadece kendi üstlendiği konuşmayı başkasına atayabilir
        const isOwnerOrAdmin = ['OWNER', 'SUPER_ADMIN'].includes(req.workspaceMember.role);

        if (!isOwnerOrAdmin) {
            // Agent ise, konuşmayı kontrol et - kendisine atanmış mı?
            const conversation = await prisma.conversation.findUnique({
                where: { id: conversationId },
                select: { assignedToId: true }
            });

            if (!conversation) {
                return res.status(404).json({ error: 'Konuşma bulunamadı.' });
            }

            // Agent sadece kendi üstlendiği konuşmayı başkasına atayabilir
            if (conversation.assignedToId !== req.user.id) {
                return res.status(403).json({ error: 'Bu konuşmayı atama yetkiniz yok. Sadece üstlendiğiniz konuşmaları atayabilirsiniz.' });
            }
        }

        const updateData = {};

        // Handle User Assignment
        if (userId !== undefined) {
            if (!userId || userId === 'null' || userId === 'unassign' || userId === '') {
                updateData.assignedToId = null;
            } else {
                // Verify member
                const member = await prisma.workspaceMember.findUnique({
                    where: { userId_workspaceId: { userId, workspaceId } }
                });
                if (!member) {
                    return res.status(400).json({ error: 'Seçilen kişi bu çalışma alanının üyesi değil.' });
                }
                updateData.assignedToId = userId;
                // Agent üstlendiğinde bot'u devre dışı bırak
                updateData.botEnabled = false;
                updateData.botDelayedUntil = null;
                console.log(`👤 [Assign] Agent ${userId} taking over, disabling bot`);
            }
        }

        // Handle Team Assignment
        if (teamId !== undefined) {
            if (!teamId || teamId === 'null' || teamId === 'unassign' || teamId === '') {
                updateData.teamIds = '[]';
            } else {
                // Verify team
                const team = await prisma.team.findUnique({ where: { id: teamId } });
                if (!team) {
                    return res.status(404).json({ error: 'Takım bulunamadı.' });
                }
                updateData.teamIds = JSON.stringify([teamId]);
            }
        }

        // Handle Bot Assignment
        const { botId } = req.body;
        if (botId !== undefined) {
            if (!botId || botId === 'null' || botId === 'unassign' || botId === '') {
                updateData.assignedBotId = null;
            } else {
                // Verify bot
                const bot = await prisma.aIBot.findUnique({ where: { id: botId, workspaceId } });
                if (!bot) {
                    return res.status(404).json({ error: 'AI Bot bulunamadı veya bu çalışma alanına ait değil.' });
                }
                updateData.assignedBotId = botId;
                // If assigned to a bot, clear human assignment? 
                // Let's decide to clear human assignment to avoid confusion, OR keep it.
                // For now, let's keep them independent but maybe UI should show Bot taking over.
                // Actually, if a bot is assigned, it usually means auto-pilot.
                updateData.assignedToId = null; // Clear human assignment when bot is assigned
            }
        }

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ error: 'Atama bilgisi gönderilmedi.' });
        }

        const conversation = await prisma.conversation.update({
            where: { id: conversationId },
            data: updateData,
            include: {
                assignedTo: {
                    select: {
                        id: true,
                        name: true,
                        avatar: true
                    }
                },
                assignedBot: {
                    select: {
                        id: true,
                        name: true,
                        role: true
                    }
                },
                contact: {
                    select: {
                        id: true,
                        name: true,
                        fullName: true,
                        avatar: true
                    }
                }
            }
        });

        console.log('✅ Assign success:', updateData);

        // 🚀 Socket bildirimi gönder
        // Workspace'e genel bildirim (tüm kullanıcılar listelerini güncellesin)
        emitToWorkspace(workspaceId, 'conversation_assigned', {
            conversationId,
            assignedToId: conversation.assignedToId,
            assignedToName: conversation.assignedTo?.name,
            assignedBotId: conversation.assignedBotId,
            botEnabled: conversation.botEnabled,
            teamIds: conversation.teamIds,
            contact: conversation.contact,
            assignedBy: req.user.name
        });
        console.log(`📡 [Assign] Emitted conversation_assigned to workspace ${workspaceId}`);

        // Atanan kişiye özel bildirim (browser notification + in-app notification)
        if (conversation.assignedToId && conversation.assignedToId !== req.user.id) {
            const contactName = conversation.contact?.name || conversation.contact?.fullName || 'Müşteri';

            emitToUser(conversation.assignedToId, 'conversation_assigned_to_you', {
                conversationId,
                workspaceId,
                contact: conversation.contact,
                assignedBy: req.user.name,
                message: `${req.user.name} size bir konuşma atadı: ${contactName}`
            });

            // Create in-app notification
            try {
                const { createNotification } = await import('./notification.controller.js');
                await createNotification(
                    workspaceId,
                    conversation.assignedToId,
                    'CONVERSATION_ASSIGNED',
                    `${contactName} — konuşma atandı`,
                    `${req.user.name} tarafından size atandı.`,
                    { conversationId }
                );
            } catch (notifErr) {
                console.error('Notification error:', notifErr);
            }

            console.log(`📬 [Assign] Notification sent to user ${conversation.assignedToId}`);
        }

        // Takım atandıysa, takım üyelerine bildirim gönder
        if (updateData.teamIds && updateData.teamIds !== '[]') {
            const teamIds = JSON.parse(updateData.teamIds);
            for (const tId of teamIds) {
                // Takım bilgisi al
                let teamName = 'Takım';
                try {
                    const team = await prisma.team.findUnique({ where: { id: tId }, select: { name: true } });
                    teamName = team?.name || 'Takım';
                } catch (e) { /* ignore */ }

                // Takım üyelerini bul
                const teamMembers = await prisma.teamMember.findMany({
                    where: { teamId: tId },
                    include: { user: { select: { id: true, name: true } } }
                });

                const contactName = conversation.contact?.name || conversation.contact?.fullName || 'Müşteri';

                // Her takım üyesine bildirim gönder (atayan kişi hariç)
                for (const member of teamMembers) {
                    if (member.userId !== req.user.id) {
                        emitToUser(member.userId, 'conversation_assigned_to_you', {
                            conversationId,
                            workspaceId,
                            contact: conversation.contact,
                            assignedBy: req.user.name,
                            message: `${req.user.name} takımınıza bir konuşma atadı: ${contactName}`
                        });

                        // Create in-app notification
                        try {
                            const { createNotification } = await import('./notification.controller.js');
                            await createNotification(
                                workspaceId,
                                member.userId,
                                'CONVERSATION_ASSIGNED',
                                `${contactName} — takıma atandı`,
                                `${req.user.name} tarafından ${teamName} takımına atandı.`,
                                { conversationId, teamId: tId }
                            );
                        } catch (notifErr) {
                            console.error('Notification error:', notifErr);
                        }

                        console.log(`📬 [Assign] Team notification sent to user ${member.userId}`);
                    }
                }
            }
        }

        res.json({ conversation });
    } catch (error) {
        console.error('❌ Assign conversation error:', error);
        res.status(500).json({ error: 'Atama sırasında sunucu hatası oluştu.' });
    } finally {
        console.log('--- ASSIGN END ---');
    }
};

// Agent kendi kendine konuşmayı üstlenir (self-assign)
export const takeOverConversation = async (req, res) => {
    try {
        const { workspaceId, conversationId } = req.params;
        const userId = req.user.id;

        // Konuşmayı bul
        const conversation = await prisma.conversation.findFirst({
            where: { id: conversationId, workspaceId }
        });

        if (!conversation) {
            return res.status(404).json({ error: 'Konuşma bulunamadı' });
        }

        // Zaten başka birine atanmışsa kontrol et
        if (conversation.assignedToId && conversation.assignedToId !== userId) {
            const assignedUser = await prisma.user.findUnique({
                where: { id: conversation.assignedToId },
                select: { name: true }
            });
            return res.status(400).json({
                error: `Bu konuşma zaten ${assignedUser?.name || 'başka bir kullanıcıya'} atanmış.`,
                assignedTo: assignedUser?.name
            });
        }

        // Konuşmayı üstlen - bot'u devre dışı bırak
        const updatedConversation = await prisma.conversation.update({
            where: { id: conversationId },
            data: {
                assignedToId: userId,
                botEnabled: false,
                botDelayedUntil: null
            },
            include: {
                contact: true,
                assignedTo: {
                    select: { id: true, name: true, avatar: true }
                }
            }
        });

        console.log(`👤 [TakeOver] User ${req.user.name} took over conversation ${conversationId}`);

        // Socket ile bildirim gönder
        emitToWorkspace(workspaceId, 'conversation_taken_over', {
            conversationId,
            assignedToId: userId,
            assignedToName: req.user.name,
            botEnabled: false
        });

        res.json({
            conversation: updatedConversation,
            message: 'Konuşma başarıyla üstlenildi'
        });
    } catch (error) {
        console.error('Take over conversation error:', error);
        res.status(500).json({ error: 'Konuşma üstlenilirken hata oluştu' });
    }
};

export const updateConversationStatus = async (req, res) => {
    console.log(`🔄 [updateConversationStatus] START`);
    console.log(`   Params:`, req.params);
    console.log(`   Body:`, req.body);
    console.log(`   User:`, req.user?.id, req.user?.name);

    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            console.log(`❌ Validation errors:`, errors.array());
            return res.status(400).json({ errors: errors.array() });
        }

        const { workspaceId, conversationId } = req.params;
        const { status } = req.body;
        const userId = req.user?.id;

        console.log(`   Conversation ID: ${conversationId}`);
        console.log(`   New Status: ${status}`);
        console.log(`   Resolved By: ${userId}`);

        // Verify conversation belongs to this workspace
        const existing = await prisma.conversation.findFirst({ where: { id: conversationId, workspaceId } });
        if (!existing) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        // Prepare update data
        const updateData = { status };

        // Set resolvedAt and resolvedById when marking as RESOLVED
        if (status === 'RESOLVED') {
            updateData.resolvedAt = new Date();
            updateData.resolvedById = userId;
        } else {
            // Clear resolvedAt if reopening
            updateData.resolvedAt = null;
            updateData.resolvedById = null;
        }

        const conversation = await prisma.conversation.update({
            where: { id: conversationId },
            data: updateData
        });

        console.log(`✅ [Conversation Status] ${conversationId} -> ${status}${status === 'RESOLVED' ? ` (resolvedAt set, resolvedBy: ${userId})` : ''}`);
        console.log(`   Updated conversation:`, conversation.id, conversation.status);

        res.json({ conversation });
    } catch (error) {
        console.error('❌ Update conversation status error:', error);
        res.status(500).json({ error: 'Failed to update conversation status' });
    }
};
export const deleteConversation = async (req, res) => {
    try {
        const { workspaceId, conversationId } = req.params;
        console.log(`🗑️ [Delete Conversation] START - ID: ${conversationId}`);

        // Verify conversation belongs to this workspace
        const conversation = await prisma.conversation.findFirst({
            where: { id: conversationId, workspaceId },
            include: { contact: true }
        });

        if (!conversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        // Although Prisma schema has onDelete: Cascade, we'll explicitly delete 
        // to be 100% sure and handle potential SQLite/Prisma edge cases.

        // 1. Delete Messages
        const msgDeleted = await prisma.message.deleteMany({
            where: { conversationId }
        });
        console.log(` - Deleted ${msgDeleted.count} messages`);

        // 2. Delete Internal Notes
        const notesDeleted = await prisma.internalNote.deleteMany({
            where: { conversationId }
        });
        console.log(` - Deleted ${notesDeleted.count} internal notes`);

        // 3. Delete Transfers
        const transfersDeleted = await prisma.conversationTransfer.deleteMany({
            where: { conversationId }
        });
        console.log(` - Deleted ${transfersDeleted.count} transfers`);

        // 4. If it's a LEAD conversation, delete the facebook_lead record
        if (conversation.channel === 'LEAD' && conversation.contact?.facebookId) {
            // facebookId for leads is stored as "lead_XXXXX"
            const leadIdMatch = conversation.contact.facebookId.match(/^lead_(.+)$/);
            if (leadIdMatch) {
                const leadId = leadIdMatch[1];
                const leadDeleted = await prisma.facebookLead.deleteMany({
                    where: { leadId: leadId }
                });
                console.log(` - Deleted ${leadDeleted.count} facebook lead records`);
            }
        }

        // 5. Clear contact notes and AI analysis
        if (conversation.contactId) {
            await prisma.contact.update({
                where: { id: conversation.contactId },
                data: { notes: null }
            });
            console.log(` - Cleared contact notes`);
        }

        // 6. Delete the conversation
        await prisma.conversation.delete({
            where: { id: conversationId }
        });

        // 6. Check if contact has other conversations, if not delete the contact too
        const remainingConversations = await prisma.conversation.count({
            where: { contactId: conversation.contactId }
        });

        if (remainingConversations === 0) {
            await prisma.contact.delete({
                where: { id: conversation.contactId }
            });
            console.log(` - Deleted orphan contact: ${conversation.contact?.name}`);
        }

        console.log(`✅ [Delete Conversation] SUCCESS - ID: ${conversationId}`);
        res.json({ message: 'Conversation and all related data deleted successfully' });
    } catch (error) {
        console.error('Delete conversation error:', error);
        res.status(500).json({ error: 'Failed to delete conversation' });
    }
};

// Delete ALL conversations for a workspace (admin only)
export const deleteAllConversations = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const role = req.workspaceMember?.role || req.user.role;

        // Only OWNER or SUPER_ADMIN can delete all conversations
        if (!['OWNER', 'SUPER_ADMIN'].includes(role)) {
            return res.status(403).json({ error: 'Tüm sohbetleri silme yetkiniz yok.' });
        }

        console.log(`🗑️ [Delete All Conversations] START - Workspace: ${workspaceId}`);

        // 1. Get all conversation IDs for this workspace
        const conversations = await prisma.conversation.findMany({
            where: { workspaceId },
            select: { id: true, contactId: true }
        });

        if (conversations.length === 0) {
            return res.json({ message: 'Silinecek sohbet bulunamadı.', deletedCount: 0 });
        }

        const conversationIds = conversations.map(c => c.id);
        const contactIds = [...new Set(conversations.map(c => c.contactId).filter(Boolean))];

        // 2. Delete all messages
        const msgDeleted = await prisma.message.deleteMany({
            where: { conversationId: { in: conversationIds } }
        });
        console.log(` - Deleted ${msgDeleted.count} messages`);

        // 3. Delete all internal notes
        const notesDeleted = await prisma.internalNote.deleteMany({
            where: { conversationId: { in: conversationIds } }
        });
        console.log(` - Deleted ${notesDeleted.count} internal notes`);

        // 4. Delete all transfers
        const transfersDeleted = await prisma.conversationTransfer.deleteMany({
            where: { conversationId: { in: conversationIds } }
        });
        console.log(` - Deleted ${transfersDeleted.count} transfers`);

        // 5. Delete all conversations
        const convDeleted = await prisma.conversation.deleteMany({
            where: { workspaceId }
        });
        console.log(` - Deleted ${convDeleted.count} conversations`);

        // 6. Delete orphan contacts (contacts with no remaining conversations)
        let contactsDeleted = 0;
        for (const contactId of contactIds) {
            const remaining = await prisma.conversation.count({ where: { contactId } });
            if (remaining === 0) {
                await prisma.contact.delete({ where: { id: contactId } }).catch(() => { });
                contactsDeleted++;
            }
        }
        console.log(` - Deleted ${contactsDeleted} orphan contacts`);

        console.log(`✅ [Delete All Conversations] SUCCESS - ${convDeleted.count} conversations deleted`);

        res.json({
            message: `${convDeleted.count} sohbet başarıyla silindi.`,
            deletedCount: convDeleted.count,
            messagesDeleted: msgDeleted.count,
            contactsDeleted
        });
    } catch (error) {
        console.error('Delete all conversations error:', error);
        res.status(500).json({ error: 'Sohbetler silinirken hata oluştu.' });
    }
};

// ============================================
// Internal Notes Methods
// ============================================

export const addInternalNote = async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { content, mentionedUsers } = req.body;
        const userId = req.user.id;

        const note = await prisma.internalNote.create({
            data: {
                conversationId,
                userId,
                content,
                mentionedUsers: JSON.stringify(mentionedUsers || [])
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        avatar: true
                    }
                }
            }
        });

        // Notify mentioned users (TODO: WebSocket implementation)
        // const mentions = JSON.parse(note.mentionedUsers);
        // if (mentions.length > 0) { ... }

        res.status(201).json({ note });
    } catch (error) {
        console.error('Add internal note error:', error);
        res.status(500).json({ error: 'Failed to add internal note' });
    }
};

export const getInternalNotes = async (req, res) => {
    try {
        const { workspaceId, conversationId } = req.params;

        // Verify conversation belongs to this workspace
        const conversation = await prisma.conversation.findFirst({ where: { id: conversationId, workspaceId } });
        if (!conversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        const notes = await prisma.internalNote.findMany({
            where: { conversationId },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        avatar: true
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        res.json({ notes });
    } catch (error) {
        console.error('Get internal notes error:', error);
        res.status(500).json({ error: 'Failed to fetch internal notes' });
    }
};

export const deleteInternalNote = async (req, res) => {
    try {
        const { workspaceId, noteId } = req.params;
        const userId = req.user.id;
        const userRole = req.workspaceMember?.role; // Requires workspace middleware

        // Verify note's conversation belongs to this workspace
        const note = await prisma.internalNote.findUnique({
            where: { id: noteId },
            include: { conversation: { select: { workspaceId: true } } }
        });

        if (!note || note.conversation.workspaceId !== workspaceId) {
            return res.status(404).json({ error: 'Note not found' });
        }

        // Allow owner or the author to delete
        if (note.userId !== userId && userRole !== 'OWNER' && req.user.role !== 'SUPER_ADMIN') {
            return res.status(403).json({ error: 'Not authorized to delete this note' });
        }

        await prisma.internalNote.delete({
            where: { id: noteId }
        });

        res.json({ message: 'Note deleted successfully' });
    } catch (error) {
        console.error('Delete note error:', error);
        res.status(500).json({ error: 'Failed to delete note' });
    }
};

// ============================================
// Transfer Methods
// ============================================

export const transferConversation = async (req, res) => {
    try {
        const { workspaceId, conversationId } = req.params;
        const { toUserId, toTeamId, note } = req.body;

        // Verify conversation belongs to this workspace
        const existing = await prisma.conversation.findFirst({ where: { id: conversationId, workspaceId } });
        if (!existing) {
            return res.status(404).json({ error: 'Conversation not found' });
        }
        const fromUserId = req.user.id;

        console.log(`🔄 [Transfer] Starting transfer for conversation ${conversationId}`);
        console.log(`   From: ${fromUserId}, To User: ${toUserId}, To Team: ${toTeamId}`);

        // Use transaction to ensure both operations succeed
        const result = await prisma.$transaction(async (tx) => {
            // 1. Create transfer record
            const transfer = await tx.conversationTransfer.create({
                data: {
                    conversationId,
                    fromUserId,
                    toUserId,
                    toTeamId,
                    note,
                    status: 'COMPLETED' // Direct transfer, no approval needed
                },
                include: {
                    fromUser: { select: { id: true, name: true, avatar: true } },
                    toUser: { select: { id: true, name: true, avatar: true } },
                    team: { select: { id: true, name: true } },
                    conversation: { select: { id: true, contact: { select: { name: true } } } }
                }
            });

            // 2. Update conversation assignment
            const updateData = {};

            if (toUserId) {
                updateData.assignedToId = toUserId;
            }

            if (toTeamId) {
                // Get current teamIds and add/replace
                const conversation = await tx.conversation.findUnique({
                    where: { id: conversationId },
                    select: { teamIds: true }
                });

                // Set the new team (replace existing)
                updateData.teamIds = JSON.stringify([toTeamId]);
            }

            const updatedConversation = await tx.conversation.update({
                where: { id: conversationId },
                data: updateData
            });

            return { transfer, conversation: updatedConversation };
        });

        console.log(`✅ [Transfer] Completed - Conversation ${conversationId} transferred`);

        // Notify via WebSocket (workspace-specific)
        try {
            if (toUserId) {
                emitToWorkspace(workspaceId, 'conversation_transferred', {
                    conversationId,
                    toUserId,
                    fromUserId,
                    transfer: result.transfer
                });
            }
        } catch (socketError) {
            console.error('Socket notification error:', socketError);
        }

        res.status(201).json({
            transfer: result.transfer,
            message: 'Sohbet başarıyla devredildi'
        });
    } catch (error) {
        console.error('Transfer conversation error:', error);
        res.status(500).json({ error: 'Failed to transfer conversation' });
    }
};

export const acceptTransfer = async (req, res) => {
    try {
        const { transferId } = req.params;
        const userId = req.user.id;

        const transfer = await prisma.conversationTransfer.findUnique({
            where: { id: transferId },
            include: { conversation: true }
        });

        if (!transfer) {
            return res.status(404).json({ error: 'Transfer request not found' });
        }

        if (transfer.status !== 'PENDING') {
            return res.status(400).json({ error: 'Transfer request is not pending' });
        }

        // Verify user is the target
        if (transfer.toUserId && transfer.toUserId !== userId) {
            return res.status(403).json({ error: 'Not authorized to accept this transfer' });
        }

        // If team transfer, check if user is in team (Phase 4: need team membership check)
        // For now, assume if toUserId is null, it's a team transfer, and we should check membership
        // Skipped for now until Team implementation is fully ready

        await prisma.$transaction([
            // Update transfer status
            prisma.conversationTransfer.update({
                where: { id: transferId },
                data: { status: 'ACCEPTED' }
            }),
            // Update conversation assignment
            prisma.conversation.update({
                where: { id: transfer.conversationId },
                data: { assignedToId: userId } // Assign to the user accepting it
            })
        ]);

        res.json({ message: 'Transfer accepted' });
    } catch (error) {
        console.error('Accept transfer error:', error);
        res.status(500).json({ error: 'Failed to accept transfer' });
    }
};

export const rejectTransfer = async (req, res) => {
    try {
        const { transferId } = req.params;
        const userId = req.user.id;

        const transfer = await prisma.conversationTransfer.findUnique({
            where: { id: transferId }
        });

        if (!transfer) {
            return res.status(404).json({ error: 'Transfer request not found' });
        }

        if (transfer.toUserId && transfer.toUserId !== userId) {
            return res.status(403).json({ error: 'Not authorized to reject this transfer' });
        }

        await prisma.conversationTransfer.update({
            where: { id: transferId },
            data: { status: 'REJECTED' }
        });

        res.json({ message: 'Transfer rejected' });
    } catch (error) {
        console.error('Reject transfer error:', error);
        res.status(500).json({ error: 'Failed to reject transfer' });
    }
};

export const getPendingTransfers = async (req, res) => {
    try {
        const userId = req.user.id;

        // Fetch teams the user belongs to
        const userTeams = await prisma.teamMember.findMany({
            where: { userId },
            select: { teamId: true }
        });
        const myTeamIds = userTeams.map(t => t.teamId);

        // Fetch transfers where toUserId is me OR toTeamId is one of my teams
        const transfers = await prisma.conversationTransfer.findMany({
            where: {
                OR: [
                    { toUserId: userId },
                    { toTeamId: { in: myTeamIds } }
                ],
                status: 'PENDING'
            },
            include: {
                fromUser: { select: { id: true, name: true, avatar: true } },
                conversation: {
                    select: {
                        id: true,
                        channel: true,
                        contact: { select: { name: true, avatar: true } }
                    }
                },
                team: { select: { id: true, name: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json({ transfers });
    } catch (error) {
        console.error('Get pending transfers error:', error);
        res.status(500).json({ error: 'Failed to fetch transfers' });
    }
};

// Create manual conversation
export const createManualConversation = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { name, phone, email, description, channel } = req.body;

        console.log(`📝 [Manual Conversation] Creating for workspace: ${workspaceId}`);

        // Validate required fields
        if (!name?.trim()) {
            return res.status(400).json({ error: 'İsim alanı zorunludur.' });
        }

        if (!phone?.trim() && !email?.trim()) {
            return res.status(400).json({ error: 'Telefon veya e-posta alanlarından en az biri zorunludur.' });
        }

        // Check if contact already exists with same phone or email
        let contact = null;

        if (phone?.trim()) {
            contact = await prisma.contact.findFirst({
                where: { phone: phone.trim() }
            });
        }

        if (!contact && email?.trim()) {
            contact = await prisma.contact.findFirst({
                where: { email: email.trim() }
            });
        }

        // Create or update contact
        if (contact) {
            console.log(`📝 [Manual Conversation] Found existing contact: ${contact.id}`);
            // Update contact with new info if provided
            contact = await prisma.contact.update({
                where: { id: contact.id },
                data: {
                    name: name.trim(),
                    ...(phone?.trim() && { phone: phone.trim() }),
                    ...(email?.trim() && { email: email.trim() })
                }
            });
        } else {
            console.log(`📝 [Manual Conversation] Creating new contact`);
            contact = await prisma.contact.create({
                data: {
                    workspaceId: workspaceId,
                    name: name.trim(),
                    phone: phone?.trim() || null,
                    email: email?.trim() || null,
                    status: 'NEW',
                    tags: '[]'
                }
            });
        }

        // Check if there's already a conversation with this contact in this workspace
        let conversation = await prisma.conversation.findFirst({
            where: {
                contactId: contact.id,
                workspaceId: workspaceId,
                channel: 'MANUAL'
            }
        });

        if (conversation) {
            console.log(`📝 [Manual Conversation] Found existing conversation: ${conversation.id}`);
            // Update last message time to bring it to top
            conversation = await prisma.conversation.update({
                where: { id: conversation.id },
                data: { lastMessageAt: new Date() },
                include: {
                    contact: true,
                    messages: {
                        orderBy: { createdAt: 'desc' },
                        take: 1
                    }
                }
            });
        } else {
            console.log(`📝 [Manual Conversation] Creating new conversation`);
            conversation = await prisma.conversation.create({
                data: {
                    workspaceId: workspaceId,
                    contactId: contact.id,
                    channel: 'MANUAL',
                    status: 'OPEN',
                    lastMessageAt: new Date(),
                    teamIds: '[]',
                    assignedToId: req.user.id
                },
                include: {
                    contact: true
                }
            });
        }

        // Add description as first message if provided
        if (description?.trim()) {
            await prisma.message.create({
                data: {
                    conversationId: conversation.id,
                    content: description.trim(),
                    senderId: req.user.id,
                    isFromContact: false,
                    messageType: 'TEXT'
                }
            });
            console.log(`📝 [Manual Conversation] Added initial message`);
        }

        console.log(`✅ [Manual Conversation] Created successfully - ID: ${conversation.id}`);

        res.status(201).json({
            conversation,
            message: 'Sohbet başarıyla oluşturuldu.'
        });

    } catch (error) {
        console.error('Create manual conversation error:', error);
        res.status(500).json({ error: 'Sohbet oluşturulurken hata oluştu.' });
    }
};

// Toggle bot enabled/disabled for a specific conversation
export const toggleBotEnabled = async (req, res) => {
    try {
        const { workspaceId, conversationId } = req.params;
        const { botEnabled } = req.body;

        console.log(`🤖 [Bot Toggle] Conversation: ${conversationId}, Enabled: ${botEnabled}`);

        // Verify conversation belongs to this workspace
        const existing = await prisma.conversation.findFirst({
            where: { id: conversationId, workspaceId }
        });

        if (!existing) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        // Bot aktif edilirken:
        // 1. assignedToId'yi null yap (bot cevap verebilsin)
        // 2. botDelayedUntil'i null yap (hemen cevap verebilsin)
        const isBotEnabled = botEnabled === true || botEnabled === 'true';

        const updateData = {
            botEnabled: isBotEnabled
        };

        if (isBotEnabled) {
            // Bot aktif edildiğinde:
            // - assignedToId'yi NULL yap ki bot cevap verebilsin
            // - botDelayedUntil'i NULL yap ki bekleme olmasın
            updateData.assignedToId = null;
            updateData.botDelayedUntil = null;
            console.log(`🤖 [Bot Toggle] Enabling bot, clearing assignment and delay`);
        }

        const conversation = await prisma.conversation.update({
            where: { id: conversationId },
            data: updateData,
            select: {
                id: true,
                botEnabled: true,
                assignedToId: true,
                botDelayedUntil: true
            }
        });

        // Emit socket event for real-time update
        emitToWorkspace(workspaceId, 'conversation_updated', {
            conversationId,
            botEnabled: conversation.botEnabled,
            assignedToId: conversation.assignedToId
        });

        console.log(`✅ [Bot Toggle] Success - Conversation: ${conversationId}, Bot: ${conversation.botEnabled ? 'ON' : 'OFF'}, AssignedTo: ${conversation.assignedToId || 'NULL'}`);

        res.json({
            success: true,
            botEnabled: conversation.botEnabled,
            assignedToId: conversation.assignedToId,
            message: conversation.botEnabled ? 'Bot aktif edildi' : 'Bot devre dışı bırakıldı'
        });
    } catch (error) {
        console.error('Toggle bot enabled error:', error);
        res.status(500).json({ error: 'Bot durumu değiştirilemedi' });
    }
};

// Get bot enabled status for a conversation
export const getBotStatus = async (req, res) => {
    try {
        const { workspaceId, conversationId } = req.params;

        const conversation = await prisma.conversation.findFirst({
            where: { id: conversationId, workspaceId },
            select: { botEnabled: true }
        });

        if (!conversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        res.json({ botEnabled: conversation.botEnabled });
    } catch (error) {
        console.error('Get bot status error:', error);
        res.status(500).json({ error: 'Bot durumu alınamadı' });
    }
};

// Update aiTopic for a conversation
export const updateTopic = async (req, res) => {
    try {
        const { workspaceId, conversationId } = req.params;
        const { aiTopic } = req.body;

        const existing = await prisma.conversation.findFirst({ where: { id: conversationId, workspaceId } });
        if (!existing) return res.status(404).json({ error: 'Conversation not found' });

        const conversation = await prisma.conversation.update({
            where: { id: conversationId },
            data: { aiTopic: aiTopic || null }
        });

        res.json({ success: true, aiTopic: conversation.aiTopic });
    } catch (error) {
        console.error('Update topic error:', error);
        res.status(500).json({ error: 'Konu başlığı güncellenemedi' });
    }
};

// Update funnelType for a conversation
export const updateFunnel = async (req, res) => {
    try {
        const { workspaceId, conversationId } = req.params;
        const { funnelType } = req.body;

        const existing = await prisma.conversation.findFirst({ where: { id: conversationId, workspaceId } });
        if (!existing) return res.status(404).json({ error: 'Conversation not found' });

        const conversation = await prisma.conversation.update({
            where: { id: conversationId },
            data: { funnelType: funnelType || null }
        });

        res.json({ success: true, funnelType: conversation.funnelType });
    } catch (error) {
        console.error('Update funnel error:', error);
        res.status(500).json({ error: 'Funnel güncellenemedi' });
    }
};
