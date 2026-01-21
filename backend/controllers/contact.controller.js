import { PrismaClient } from '@prisma/client';
import { getIO, emitToWorkspace } from '../socket.js';

const prisma = new PrismaClient();

// Get all contacts in a workspace
export const getContacts = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { search, status, source, category, showArchived, limit = 50, offset = 0 } = req.query;
        const { role } = req.workspaceMember;

        console.log(`🔍 [Get Contacts] START - Workspace: ${workspaceId}, Role: ${role}, Status: ${status || 'ALL'}, Source: ${source || 'ALL'}, Category: ${category || 'ALL'}, ShowArchived: ${showArchived || 'false'}`);

        // Build base conversation filter for this workspace
        let conversationFilter = { workspaceId: workspaceId };

        // Add source/channel filter if provided (but not for MANUAL - that's handled separately)
        if (source && source !== 'ALL' && source !== 'MANUAL') {
            conversationFilter.channel = source;
        }

        // AGENT role: only see contacts from their assigned conversations
        if (role === 'AGENT') {
            // Get agent's team IDs
            const userTeams = await prisma.teamMember.findMany({
                where: { userId: req.user.id },
                select: { teamId: true }
            });
            const myTeamIds = userTeams.map(t => t.teamId);

            // Filter conversations assigned to this agent or their teams
            conversationFilter = {
                workspaceId: workspaceId,
                OR: [
                    { assignedToId: req.user.id },
                    ...myTeamIds.map(tid => ({ teamIds: { contains: `"${tid}"` } }))
                ]
            };
            console.log(`   AGENT filter applied - User: ${req.user.id}, Teams: ${myTeamIds.length}`);
        }

        // Build where clause - show contacts that either:
        // 1. Have conversations in this workspace (filtered by role)
        // 2. OR belong to this workspace directly (workspaceId field)
        let where = {
            OR: [
                // Contacts with conversations in this workspace
                {
                    conversations: {
                        some: conversationFilter
                    }
                },
                // Contacts directly assigned to this workspace
                {
                    workspaceId: workspaceId
                }
            ]
        };

        // If source filter is MANUAL, only show contacts without conversations
        if (source === 'MANUAL') {
            where = {
                workspaceId: workspaceId,
                conversations: {
                    none: {}
                }
            };
        }

        // Add status filter if provided
        if (status && status !== 'ALL') {
            where = {
                AND: [
                    where,
                    { status: status }
                ]
            };
        }

        // Add category filter if provided
        if (category && category !== 'ALL') {
            where = {
                AND: [
                    where,
                    { category: category }
                ]
            };
        }

        // Add search filter if provided
        if (search) {
            where = {
                AND: [
                    where,
                    {
                        OR: [
                            { name: { contains: search } },
                            { phone: { contains: search } },
                            { email: { contains: search } }
                        ]
                    }
                ]
            };
        }

        // Filter by archived status - hide archived by default
        if (showArchived !== 'true') {
            where = {
                AND: [
                    where,
                    { isArchived: false }
                ]
            };
        }

        const contacts = await prisma.contact.findMany({
            where,
            include: {
                _count: {
                    select: { conversations: true }
                },
                conversations: {
                    where: { workspaceId: workspaceId },
                    select: {
                        channel: true,
                        createdAt: true,
                        lastMessageAt: true,
                        assignedTo: {
                            select: {
                                id: true,
                                name: true
                            }
                        }
                    },
                    orderBy: { createdAt: 'asc' }
                }
            },
            orderBy: { createdAt: 'desc' },
            take: parseInt(limit),
            skip: parseInt(offset)
        });

        // Add source field and message dates based on conversations
        const contactsWithSource = contacts.map(contact => {
            // Determine primary source from conversations
            const channels = contact.conversations?.map(c => c.channel) || [];
            let contactSource = 'MANUAL'; // Default for manually added contacts

            // Calculate first and last message dates from conversations
            let firstMessageAt = null;
            let lastMessageAt = null;

            if (contact.conversations?.length > 0) {
                // First message = earliest conversation createdAt (oldest)
                const createdDates = contact.conversations
                    .map(c => c.createdAt)
                    .filter(d => d != null);
                if (createdDates.length > 0) {
                    firstMessageAt = new Date(Math.min(...createdDates.map(d => new Date(d).getTime())));
                }

                // Last message = latest lastMessageAt across all conversations (newest)
                const lastMsgDates = contact.conversations
                    .map(c => c.lastMessageAt || c.createdAt) // Fallback to createdAt if lastMessageAt is null
                    .filter(d => d != null);
                if (lastMsgDates.length > 0) {
                    lastMessageAt = new Date(Math.max(...lastMsgDates.map(d => new Date(d).getTime())));
                }

                // Count channel occurrences
                const channelCounts = channels.reduce((acc, ch) => {
                    acc[ch] = (acc[ch] || 0) + 1;
                    return acc;
                }, {});

                // Find the most common channel
                contactSource = Object.entries(channelCounts)
                    .sort((a, b) => b[1] - a[1])[0][0];
            }

            return {
                ...contact,
                source: contactSource,
                channels: [...new Set(channels)], // Unique channels this contact has
                firstMessageAt,
                lastMessageAt
            };
        });

        // If source filter is applied, filter the results on the application level
        // This is needed because the DB query filters conversations, not contacts directly
        let filteredContacts = contactsWithSource;
        if (source && source !== 'ALL') {
            if (source === 'MANUAL') {
                // MANUAL = contacts with no conversations (manually added)
                filteredContacts = contactsWithSource.filter(c =>
                    c.source === 'MANUAL' || c.channels.length === 0
                );
            } else {
                filteredContacts = contactsWithSource.filter(c =>
                    c.source === source || c.channels.includes(source)
                );
            }
        }

        const total = await prisma.contact.count({ where });
        console.log(`✅ [Get Contacts] Response -> Found ${filteredContacts.length} entries (Filtered Total: ${total})`);

        res.json({ contacts: filteredContacts, total: source && source !== 'ALL' ? filteredContacts.length : total });
    } catch (error) {
        console.error('Get contacts error:', error);
        res.status(500).json({ error: 'Failed to fetch contacts' });
    }
};

// Get single contact details
export const getContactById = async (req, res) => {
    try {
        const { id } = req.params;
        const contact = await prisma.contact.findUnique({
            where: { id },
            include: {
                conversations: {
                    orderBy: { updatedAt: 'desc' },
                    take: 5
                }
            }
        });

        if (!contact) return res.status(404).json({ error: 'Contact not found' });

        res.json({ contact });
    } catch (error) {
        console.error('Get contact error:', error);
        res.status(500).json({ error: 'Failed to fetch contact' });
    }
};

// Update contact
export const updateContact = async (req, res) => {
    try {
        const { workspaceId, id } = req.params;
        const { name, fullName, phone, email, notes, tags, status, company, category } = req.body;

        // Verify contact belongs to this workspace (either directly or via conversation)
        const existing = await prisma.contact.findFirst({
            where: {
                id,
                OR: [
                    { workspaceId: workspaceId },
                    { conversations: { some: { workspaceId: workspaceId } } }
                ]
            }
        });
        if (!existing) {
            return res.status(404).json({ error: 'Contact not found' });
        }

        // Build update data dynamically - only include fields that are provided
        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (fullName !== undefined) updateData.fullName = fullName;
        if (phone !== undefined) updateData.phone = phone;
        if (email !== undefined) updateData.email = email;
        if (company !== undefined) updateData.company = company;
        if (notes !== undefined) updateData.notes = notes;
        if (status !== undefined) updateData.status = status;
        if (category !== undefined) updateData.category = category;
        if (tags !== undefined) {
            updateData.tags = typeof tags === 'string' ? tags : JSON.stringify(tags);
        }

        // Handle phones and emails arrays
        const { phones, emails } = req.body;
        if (phones !== undefined) {
            updateData.phones = typeof phones === 'string' ? phones : JSON.stringify(phones);
        }
        if (emails !== undefined) {
            updateData.emails = typeof emails === 'string' ? emails : JSON.stringify(emails);
        }

        // Auto-upgrade status to HOT_OPPORTUNITY if phone is being added and current status is NEW
        const newPhone = phone !== undefined ? phone : existing.phone;
        const currentStatus = status !== undefined ? status : existing.status;
        if (newPhone && newPhone.trim() && currentStatus === 'NEW' && status === undefined) {
            updateData.status = 'HOT_OPPORTUNITY';
            console.log(`📱 [Contact] Auto-upgrading status to HOT_OPPORTUNITY (phone added): ${id}`);
        }

        const contact = await prisma.contact.update({
            where: { id },
            data: updateData
        });

        // Emit socket event for real-time update (workspace-specific)
        // Find workspaces this contact belongs to
        const conversations = await prisma.conversation.findMany({
            where: { contactId: id },
            select: { workspaceId: true },
            distinct: ['workspaceId']
        });

        for (const conv of conversations) {
            if (conv.workspaceId) {
                emitToWorkspace(conv.workspaceId, 'contact_updated', {
                    workspaceId: conv.workspaceId,
                    contactId: id,
                    updatedFields: { name, phone, email, notes, tags, category, status }
                });
            }
        }

        res.json({ contact });
    } catch (error) {
        console.error('Update contact error:', error);
        res.status(500).json({ error: 'Failed to update contact' });
    }
};

// Create contact manually
export const createContact = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { name, phone, email, notes, company } = req.body;

        // Validation
        if (!name || (!phone && !email)) {
            return res.status(400).json({
                error: 'İsim ve en az bir iletişim bilgisi (telefon veya e-posta) gereklidir'
            });
        }

        // Check if contact already exists with same phone or email IN THIS WORKSPACE
        const existingContact = await prisma.contact.findFirst({
            where: {
                workspaceId: workspaceId,
                OR: [
                    phone ? { phone } : {},
                    email ? { email } : {}
                ].filter(obj => Object.keys(obj).length > 0)
            }
        });

        if (existingContact) {
            return res.status(400).json({
                error: 'Bu telefon veya e-posta ile kayıtlı bir müşteri zaten mevcut'
            });
        }

        // Determine initial status - HOT_OPPORTUNITY if phone exists, otherwise NEW
        const initialStatus = phone && phone.trim() ? 'HOT_OPPORTUNITY' : 'NEW';

        // Handle phones and emails arrays
        const { phones, emails } = req.body;

        // Create contact with workspaceId
        const contact = await prisma.contact.create({
            data: {
                workspaceId: workspaceId,
                name,
                phone,
                email,
                phones: phones ? JSON.stringify(phones) : '[]',
                emails: emails ? JSON.stringify(emails) : '[]',
                company,
                status: initialStatus,
                tags: '[]'
            }
        });

        console.log(`✅ [Create Contact] SUCCESS - ID: ${contact.id}, Name: ${name}, Status: ${initialStatus}`);

        // Emit socket event for real-time update (workspace-specific)
        emitToWorkspace(workspaceId, 'contact_updated', {
            workspaceId,
            contactId: contact.id,
            action: 'created'
        });

        res.status(201).json({ contact });
    } catch (error) {
        console.error('Create contact error:', error);
        res.status(500).json({ error: 'Müşteri oluşturulurken hata oluştu' });
    }
};

// Get analytics for contacts
export const getContactAnalytics = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { startDate, endDate } = req.query;

        console.log(`📊 [Analytics] Getting contact analytics for workspace: ${workspaceId}`);
        console.log(`   Date filter: ${startDate || 'none'} - ${endDate || 'none'}`);

        // Build date filter
        let dateFilter = {};
        if (startDate || endDate) {
            dateFilter.createdAt = {};
            if (startDate) {
                dateFilter.createdAt.gte = new Date(startDate);
            }
            if (endDate) {
                // End of day
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                dateFilter.createdAt.lte = end;
            }
        }

        // Get all contacts with conversations in this workspace
        const contacts = await prisma.contact.findMany({
            where: {
                conversations: {
                    some: {
                        workspaceId: workspaceId
                    }
                },
                ...dateFilter
            },
            select: {
                id: true,
                status: true,
                createdAt: true,
                conversations: {
                    where: { workspaceId },
                    select: { channel: true, id: true }
                }
            }
        });

        // Get total message count for this workspace (with date filter)
        const messageFilter = {
            conversation: {
                workspaceId: workspaceId
            }
        };
        if (startDate || endDate) {
            messageFilter.createdAt = {};
            if (startDate) {
                messageFilter.createdAt.gte = new Date(startDate);
            }
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                messageFilter.createdAt.lte = end;
            }
        }

        const totalMessages = await prisma.message.count({
            where: messageFilter
        });

        // Get lead count - count conversations with channel='LEAD'
        const leadFilter = {
            workspaceId: workspaceId,
            channel: 'LEAD'
        };
        if (startDate || endDate) {
            leadFilter.createdAt = {};
            if (startDate) {
                leadFilter.createdAt.gte = new Date(startDate);
            }
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                leadFilter.createdAt.lte = end;
            }
        }

        const totalLeads = await prisma.conversation.count({
            where: leadFilter
        });

        // Get conversation count
        const conversationFilter = {
            workspaceId: workspaceId
        };
        if (startDate || endDate) {
            conversationFilter.createdAt = {};
            if (startDate) {
                conversationFilter.createdAt.gte = new Date(startDate);
            }
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                conversationFilter.createdAt.lte = end;
            }
        }

        const totalConversations = await prisma.conversation.count({
            where: conversationFilter
        });

        // Count by status
        const statusCounts = {
            NEW: 0,
            HOT_OPPORTUNITY: 0,
            INFORMED: 0,
            NEGOTIATING: 0,
            CONVERTED: 0,
            NEGATIVE: 0,
            LOST: 0
        };

        // Count by channel
        const channelCounts = {
            WHATSAPP: 0,
            FACEBOOK: 0,
            INSTAGRAM: 0,
            EMAIL: 0,
            WIDGET: 0,
            MANUAL: 0,
            UNKNOWN: 0
        };

        // Process contacts
        contacts.forEach(contact => {
            // Count status
            const status = contact.status || 'NEW';
            if (statusCounts.hasOwnProperty(status)) {
                statusCounts[status]++;
            } else {
                statusCounts.NEW++;
            }

            // Count channels
            contact.conversations.forEach(conv => {
                const channel = conv.channel || 'UNKNOWN';
                if (channelCounts.hasOwnProperty(channel)) {
                    channelCounts[channel]++;
                } else {
                    channelCounts.UNKNOWN++;
                }
            });
        });

        // Calculate conversion rate
        const totalContacts = contacts.length;
        const convertedContacts = statusCounts.CONVERTED;
        const conversionRate = totalContacts > 0 ? ((convertedContacts / totalContacts) * 100).toFixed(1) : 0;

        // Calculate contacts by month (last 6 months)
        const monthlyData = [];
        const now = new Date();
        for (let i = 5; i >= 0; i--) {
            const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
            const monthName = monthStart.toLocaleString('tr-TR', { month: 'short' });

            const count = contacts.filter(c => {
                const createdAt = new Date(c.createdAt);
                return createdAt >= monthStart && createdAt <= monthEnd;
            }).length;

            monthlyData.push({ month: monthName, count });
        }

        // Status labels in Turkish
        const statusLabels = {
            NEW: 'Yeni Müşteri',
            HOT_OPPORTUNITY: 'Potansiyel Müşteri',
            INFORMED: 'Bilgi Verildi',
            NEGOTIATING: 'Görüşme Aşamasında',
            CONVERTED: 'Müşteri Oldu',
            NEGATIVE: 'Negatif Müşteri',
            LOST: 'Kaybedildi'
        };

        const statusData = Object.entries(statusCounts).map(([key, value]) => ({
            status: key,
            label: statusLabels[key] || key,
            count: value
        }));

        const channelData = Object.entries(channelCounts)
            .filter(([_, value]) => value > 0)
            .map(([key, value]) => ({
                channel: key,
                count: value
            }));

        res.json({
            totalContacts,
            totalMessages,
            totalLeads,
            totalConversations,
            conversionRate: parseFloat(conversionRate),
            positiveContacts: statusCounts.CONVERTED + statusCounts.NEGOTIATING + statusCounts.HOT_OPPORTUNITY,
            negativeContacts: statusCounts.NEGATIVE + statusCounts.LOST,
            statusData,
            channelData,
            monthlyData
        });
    } catch (error) {
        console.error('Analytics error:', error);
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
};

// Get agent performance metrics
export const getAgentPerformance = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { startDate, endDate } = req.query;

        console.log(`📊 [Agent Performance] Getting metrics for workspace: ${workspaceId}`);

        // Build date filter
        let dateFilter = {};
        if (startDate || endDate) {
            dateFilter.createdAt = {};
            if (startDate) {
                dateFilter.createdAt.gte = new Date(startDate);
            }
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                dateFilter.createdAt.lte = end;
            }
        }

        // Get all workspace members (agents)
        const workspaceMembers = await prisma.workspaceMember.findMany({
            where: { workspaceId },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        avatar: true
                    }
                }
            }
        });

        const agentMetrics = [];

        for (const member of workspaceMembers) {
            const userId = member.user.id;

            // Get total assigned conversations (currently assigned to this user)
            const totalConversations = await prisma.conversation.count({
                where: {
                    workspaceId,
                    assignedToId: userId,
                    ...dateFilter
                }
            });

            // Get resolved conversations BY this user (regardless of current assignment)
            const resolvedConversations = await prisma.conversation.count({
                where: {
                    workspaceId,
                    resolvedById: userId,
                    status: 'RESOLVED',
                    ...dateFilter
                }
            });

            // Get open conversations (assigned to this user)
            const openConversations = await prisma.conversation.count({
                where: {
                    workspaceId,
                    assignedToId: userId,
                    status: 'OPEN',
                    ...dateFilter
                }
            });

            // Get total messages sent by this agent
            const messagesSent = await prisma.message.count({
                where: {
                    senderId: userId,
                    isFromContact: false,
                    conversation: {
                        workspaceId
                    },
                    ...dateFilter
                }
            });

            // Calculate average response time
            // Get conversations with their messages to calculate response times
            const conversationsWithMessages = await prisma.conversation.findMany({
                where: {
                    workspaceId,
                    assignedToId: userId,
                    ...dateFilter
                },
                include: {
                    messages: {
                        orderBy: { createdAt: 'asc' },
                        select: {
                            id: true,
                            isFromContact: true,
                            senderId: true,
                            createdAt: true
                        }
                    }
                }
            });

            let totalResponseTime = 0;
            let responseCount = 0;

            for (const conv of conversationsWithMessages) {
                const messages = conv.messages;

                for (let i = 0; i < messages.length - 1; i++) {
                    const currentMsg = messages[i];
                    const nextMsg = messages[i + 1];

                    // If customer message followed by agent response
                    if (currentMsg.isFromContact && !nextMsg.isFromContact && nextMsg.senderId === userId) {
                        const responseTime = new Date(nextMsg.createdAt) - new Date(currentMsg.createdAt);
                        totalResponseTime += responseTime;
                        responseCount++;
                    }
                }
            }

            // Calculate average response time in minutes
            const avgResponseTimeMs = responseCount > 0 ? totalResponseTime / responseCount : 0;
            const avgResponseTimeMinutes = Math.round(avgResponseTimeMs / (1000 * 60));

            // Calculate average resolution time (from conversation creation to resolvedAt)
            // Use resolvedById to track who actually resolved it
            const resolvedConversationsWithTime = await prisma.conversation.findMany({
                where: {
                    workspaceId,
                    resolvedById: userId,
                    status: 'RESOLVED',
                    resolvedAt: { not: null },
                    ...dateFilter
                },
                select: {
                    createdAt: true,
                    resolvedAt: true
                }
            });

            let totalResolutionTime = 0;
            for (const conv of resolvedConversationsWithTime) {
                if (conv.resolvedAt) {
                    totalResolutionTime += new Date(conv.resolvedAt) - new Date(conv.createdAt);
                }
            }
            const avgResolutionTimeMs = resolvedConversationsWithTime.length > 0
                ? totalResolutionTime / resolvedConversationsWithTime.length
                : 0;
            const avgResolutionTimeMinutes = Math.round(avgResolutionTimeMs / (1000 * 60));

            // Calculate resolution rate
            const resolutionRate = totalConversations > 0
                ? Math.round((resolvedConversations / totalConversations) * 100)
                : 0;

            agentMetrics.push({
                userId: member.user.id,
                name: member.user.name,
                email: member.user.email,
                avatar: member.user.avatar,
                role: member.role,
                totalConversations,
                resolvedConversations,
                openConversations,
                messagesSent,
                avgResponseTimeMinutes,
                avgResolutionTimeMinutes,
                resolutionRate
            });
        }

        // Sort by total conversations (most active first)
        agentMetrics.sort((a, b) => b.totalConversations - a.totalConversations);

        // ========== BOT PERFORMANCE ==========
        // Get all bots in this workspace
        const bots = await prisma.aIBot.findMany({
            where: { workspaceId },
            select: { id: true, name: true, role: true, isActive: true }
        });

        const botMetrics = [];

        for (const bot of bots) {
            // Get messages sent by this bot (senderId is null but has assigned bot reference in conversation)
            // Bot messages are tracked via conversation's assignedBotId
            const botMessages = await prisma.message.count({
                where: {
                    isFromContact: false,
                    senderId: null, // Bot mesajları - kullanıcı olmadan gönderilen
                    conversation: {
                        workspaceId,
                        assignedBotId: bot.id
                    },
                    ...dateFilter
                }
            });

            // Alternative: Count all bot messages (senderId null) in workspace
            // This is a fallback if assignedBotId is not set
            const allBotMessagesInWorkspace = await prisma.message.count({
                where: {
                    isFromContact: false,
                    senderId: null,
                    conversation: {
                        workspaceId
                    },
                    ...dateFilter
                }
            });

            // Get conversations where this bot is assigned
            const botConversations = await prisma.conversation.count({
                where: {
                    workspaceId,
                    assignedBotId: bot.id,
                    ...dateFilter
                }
            });

            // Get conversations handled by bot (via channel assignment)
            // Check WhatsApp, Facebook, Instagram assignments
            const channelConversations = await prisma.conversation.count({
                where: {
                    workspaceId,
                    OR: [
                        { whatsappPhoneNumber: { assignedBotId: bot.id } },
                        { facebookPage: { assignedBotId: bot.id } },
                        { facebookPage: { instagramBotId: bot.id } }
                    ],
                    ...dateFilter
                }
            });

            const totalBotConversations = botConversations + channelConversations;

            botMetrics.push({
                botId: bot.id,
                name: bot.name,
                role: bot.role,
                isActive: bot.isActive,
                isBot: true,
                messagesSent: botMessages || 0,
                totalConversations: totalBotConversations,
                // Bots don't "resolve" - they assist
                resolvedConversations: 0,
                openConversations: totalBotConversations
            });
        }

        // If there are bot messages but no specific bot assignment found, show total
        const totalBotMessages = await prisma.message.count({
            where: {
                isFromContact: false,
                senderId: null,
                conversation: { workspaceId },
                ...dateFilter
            }
        });

        // Sort bots by messages sent
        botMetrics.sort((a, b) => b.messagesSent - a.messagesSent);

        // Calculate team totals
        const agentsWithResponseTime = agentMetrics.filter(a => a.avgResponseTimeMinutes > 0);
        const agentsWithResolutionTime = agentMetrics.filter(a => a.avgResolutionTimeMinutes > 0);

        const teamTotals = {
            totalConversations: agentMetrics.reduce((sum, a) => sum + a.totalConversations, 0),
            resolvedConversations: agentMetrics.reduce((sum, a) => sum + a.resolvedConversations, 0),
            openConversations: agentMetrics.reduce((sum, a) => sum + a.openConversations, 0),
            totalMessages: agentMetrics.reduce((sum, a) => sum + a.messagesSent, 0),
            avgResponseTime: agentsWithResponseTime.length > 0
                ? Math.round(agentsWithResponseTime.reduce((sum, a) => sum + a.avgResponseTimeMinutes, 0) / agentsWithResponseTime.length)
                : 0,
            avgResolutionTime: agentsWithResolutionTime.length > 0
                ? Math.round(agentsWithResolutionTime.reduce((sum, a) => sum + a.avgResolutionTimeMinutes, 0) / agentsWithResolutionTime.length)
                : 0,
            avgResolutionRate: agentMetrics.length > 0
                ? Math.round(agentMetrics.reduce((sum, a) => sum + a.resolutionRate, 0) / agentMetrics.length)
                : 0,
            // Bot totals
            totalBotMessages
        };

        console.log(`✅ [Agent Performance] Found ${agentMetrics.length} agents, ${botMetrics.length} bots`);

        res.json({
            agents: agentMetrics,
            bots: botMetrics,
            teamTotals
        });
    } catch (error) {
        console.error('Agent performance error:', error);
        res.status(500).json({ error: 'Failed to fetch agent performance metrics' });
    }
};

// Delete contact
export const deleteContact = async (req, res) => {
    try {
        const { workspaceId, id } = req.params;
        console.log(`🗑️ [Delete Contact] START - ID: ${id}`);

        // Verify contact belongs to this workspace (either directly or via conversation)
        const existing = await prisma.contact.findFirst({
            where: {
                id,
                OR: [
                    { workspaceId: workspaceId },
                    { conversations: { some: { workspaceId: workspaceId } } }
                ]
            }
        });
        if (!existing) {
            return res.status(404).json({ error: 'Contact not found' });
        }

        // 1. Find all conversations for this contact IN THIS WORKSPACE
        const conversations = await prisma.conversation.findMany({
            where: { contactId: id, workspaceId: workspaceId },
            select: { id: true }
        });

        console.log(` - Deleting ${conversations.length} associated conversations...`);

        // 2. Clear each conversation explicitly (to ensure messages/notes/transfers are gone)
        for (const conv of conversations) {
            await prisma.message.deleteMany({ where: { conversationId: conv.id } });
            await prisma.internalNote.deleteMany({ where: { conversationId: conv.id } });
            await prisma.conversationTransfer.deleteMany({ where: { conversationId: conv.id } });
            await prisma.conversation.delete({ where: { id: conv.id } });
        }

        // 3. Delete the contact
        await prisma.contact.delete({ where: { id } });

        console.log(`✅ [Delete Contact] SUCCESS - ID: ${id}`);
        res.json({ message: 'Contact and all associated conversations deleted successfully' });
    } catch (error) {
        console.error('Delete contact error:', error);
        res.status(500).json({ error: 'Failed to delete contact' });
    }
};

// Block a contact
export const blockContact = async (req, res) => {
    try {
        const { workspaceId, id } = req.params;
        const { reason } = req.body;

        console.log(`🚫 [Block Contact] START - Workspace: ${workspaceId}, Contact: ${id}`);

        // Check if contact exists
        const contact = await prisma.contact.findFirst({
            where: {
                id,
                OR: [
                    { workspaceId },
                    { conversations: { some: { workspaceId } } }
                ]
            }
        });

        if (!contact) {
            return res.status(404).json({ error: 'Contact not found' });
        }

        // Update contact to blocked
        const updatedContact = await prisma.contact.update({
            where: { id },
            data: {
                isBlocked: true,
                blockedAt: new Date(),
                blockedReason: reason || null
            }
        });

        // Close all open conversations for this contact in this workspace
        await prisma.conversation.updateMany({
            where: {
                contactId: id,
                workspaceId,
                status: { not: 'CLOSED' }
            },
            data: {
                status: 'CLOSED'
            }
        });

        // Emit socket event
        emitToWorkspace(workspaceId, 'contact_blocked', {
            contactId: id,
            isBlocked: true
        });

        console.log(`✅ [Block Contact] SUCCESS - ID: ${id}`);
        res.json({
            success: true,
            message: 'Kişi engellendi',
            contact: updatedContact
        });
    } catch (error) {
        console.error('Block contact error:', error);
        res.status(500).json({ error: 'Kişi engellenirken hata oluştu' });
    }
};

// Unblock a contact
export const unblockContact = async (req, res) => {
    try {
        const { workspaceId, id } = req.params;

        console.log(`✅ [Unblock Contact] START - Workspace: ${workspaceId}, Contact: ${id}`);

        // Check if contact exists
        const contact = await prisma.contact.findFirst({
            where: {
                id,
                OR: [
                    { workspaceId },
                    { conversations: { some: { workspaceId } } }
                ]
            }
        });

        if (!contact) {
            return res.status(404).json({ error: 'Contact not found' });
        }

        // Update contact to unblocked
        const updatedContact = await prisma.contact.update({
            where: { id },
            data: {
                isBlocked: false,
                blockedAt: null,
                blockedReason: null
            }
        });

        // Emit socket event
        emitToWorkspace(workspaceId, 'contact_unblocked', {
            contactId: id,
            isBlocked: false
        });

        console.log(`✅ [Unblock Contact] SUCCESS - ID: ${id}`);
        res.json({
            success: true,
            message: 'Kişinin engeli kaldırıldı',
            contact: updatedContact
        });
    } catch (error) {
        console.error('Unblock contact error:', error);
        res.status(500).json({ error: 'Engel kaldırılırken hata oluştu' });
    }
};

// Archive contact
export const archiveContact = async (req, res) => {
    try {
        const { workspaceId, id } = req.params;

        // Verify contact belongs to this workspace
        const existing = await prisma.contact.findFirst({
            where: {
                id,
                OR: [
                    { workspaceId: workspaceId },
                    { conversations: { some: { workspaceId: workspaceId } } }
                ]
            }
        });

        if (!existing) {
            return res.status(404).json({ error: 'Kişi bulunamadı' });
        }

        const updatedContact = await prisma.contact.update({
            where: { id },
            data: {
                isArchived: true,
                archivedAt: new Date()
            }
        });

        // Emit socket event
        emitToWorkspace(workspaceId, 'contact_archived', {
            contactId: id,
            isArchived: true
        });

        console.log(`📦 [Archive Contact] SUCCESS - ID: ${id}`);
        res.json({
            success: true,
            message: 'Kişi arşivlendi',
            contact: updatedContact
        });
    } catch (error) {
        console.error('Archive contact error:', error);
        res.status(500).json({ error: 'Arşivleme sırasında hata oluştu' });
    }
};

// Unarchive contact
export const unarchiveContact = async (req, res) => {
    try {
        const { workspaceId, id } = req.params;

        // Verify contact belongs to this workspace
        const existing = await prisma.contact.findFirst({
            where: {
                id,
                OR: [
                    { workspaceId: workspaceId },
                    { conversations: { some: { workspaceId: workspaceId } } }
                ]
            }
        });

        if (!existing) {
            return res.status(404).json({ error: 'Kişi bulunamadı' });
        }

        const updatedContact = await prisma.contact.update({
            where: { id },
            data: {
                isArchived: false,
                archivedAt: null
            }
        });

        // Emit socket event
        emitToWorkspace(workspaceId, 'contact_unarchived', {
            contactId: id,
            isArchived: false
        });

        console.log(`📤 [Unarchive Contact] SUCCESS - ID: ${id}`);
        res.json({
            success: true,
            message: 'Kişi arşivden çıkarıldı',
            contact: updatedContact
        });
    } catch (error) {
        console.error('Unarchive contact error:', error);
        res.status(500).json({ error: 'Arşivden çıkarılırken hata oluştu' });
    }
};

// Add note to conversation (creates conversation if needed)
export const addNoteToConversation = async (req, res) => {
    try {
        const { workspaceId, id } = req.params;
        const { note } = req.body;

        if (!note || !note.trim()) {
            return res.status(400).json({ error: 'Not içeriği gerekli' });
        }

        console.log(`📝 [Add Note] Contact: ${id}, Workspace: ${workspaceId}`);

        // Check contact exists
        const contact = await prisma.contact.findFirst({
            where: {
                id,
                OR: [
                    { workspaceId },
                    { conversations: { some: { workspaceId } } }
                ]
            }
        });

        if (!contact) {
            return res.status(404).json({ error: 'Kişi bulunamadı' });
        }

        // Find or create an INTERNAL conversation for this contact
        let conversation = await prisma.conversation.findFirst({
            where: {
                contactId: id,
                workspaceId,
                channel: 'INTERNAL'
            }
        });

        if (!conversation) {
            conversation = await prisma.conversation.create({
                data: {
                    contactId: id,
                    workspaceId,
                    channel: 'INTERNAL',
                    status: 'OPEN'
                }
            });
            console.log(`📝 [Add Note] Created new INTERNAL conversation: ${conversation.id}`);
        }

        // Add note as internal message
        const message = await prisma.message.create({
            data: {
                conversationId: conversation.id,
                content: note,
                isFromContact: false,
                messageType: 'NOTE'
            }
        });

        // Update conversation lastMessageAt
        await prisma.conversation.update({
            where: { id: conversation.id },
            data: { lastMessageAt: new Date() }
        });

        // Also save to contact.notes for backward compatibility
        await prisma.contact.update({
            where: { id },
            data: { notes: note }
        });

        // Emit socket events
        emitToWorkspace(workspaceId, 'new_message', {
            workspaceId,
            conversationId: conversation.id,
            message,
            channel: 'INTERNAL'
        });

        console.log(`✅ [Add Note] SUCCESS - Message: ${message.id}`);
        res.json({
            success: true,
            conversationId: conversation.id,
            message
        });
    } catch (error) {
        console.error('Add note to conversation error:', error);
        res.status(500).json({ error: 'Not eklenirken hata oluştu' });
    }
};
