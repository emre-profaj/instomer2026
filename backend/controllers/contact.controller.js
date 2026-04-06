import prisma from '../lib/prisma.js';
import { emitToWorkspace } from '../socket.js';
import { executeHotOpportunityEmailRule } from './rules.controller.js';
import { normalizePhone } from '../utils/phoneNormalizer.js';


// Get all contacts in a workspace
export const getContacts = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { search, status, source, category, tag, importGroup, callStatus, showArchived, funnelType, funnelStageId, limit = 50, offset = 0 } = req.query;
        const { role } = req.workspaceMember;

        console.log(`🔍 [Get Contacts] START - Workspace: ${workspaceId}, Role: ${role}, Status: ${status || 'ALL'}, Source: ${source || 'ALL'}, Category: ${category || 'ALL'}, Tag: ${tag || 'ALL'}, ShowArchived: ${showArchived || 'false'}`);

        // Build base conversation filter for this workspace
        let conversationFilter = { workspaceId: workspaceId };

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

        // Build where clause based on role
        let where;
        if (role === 'AGENT') {
            // AGENT: only see contacts that have conversations assigned to them or their teams
            where = {
                conversations: {
                    some: conversationFilter
                }
            };
        } else {
            // ADMIN/OWNER: see all contacts - either via conversations or directly assigned to workspace
            where = {
                OR: [
                    {
                        conversations: {
                            some: conversationFilter
                        }
                    },
                    {
                        workspaceId: workspaceId
                    }
                ]
            };
        }

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

        // Add tag filter if provided
        if (tag && tag !== 'ALL') {
            where = {
                AND: [
                    where,
                    { tags: { contains: tag } }
                ]
            };
        }

        // Add importGroup filter if provided
        if (importGroup && importGroup !== 'ALL') {
            where = {
                AND: [
                    where,
                    { importGroup: importGroup }
                ]
            };
        }

        // Add funnel/stage filter — filter directly on Contact model
        if (funnelStageId && funnelStageId !== 'ALL') {
            where = { 
                AND: [
                    where, 
                    { funnelStageId: funnelStageId }
                ] 
            };
        } else if (funnelType && funnelType !== 'ALL') {
            where = { 
                AND: [
                    where, 
                    { funnelType: funnelType }
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

        // Filter by AI call status (join with retellCall table)
        if (callStatus && callStatus !== 'ALL') {
            let callWhere = { workspaceId };

            if (callStatus === 'not_connected') {
                callWhere.status = 'not_connected';
            } else if (callStatus === 'ended') {
                callWhere.status = 'ended';
            } else if (callStatus === 'positive') {
                callWhere.sentiment = 'Positive';
            } else if (callStatus === 'negative') {
                callWhere.sentiment = 'Negative';
            } else if (callStatus === 'no_call') {
                // Contacts with NO calls at all - handled below
                callWhere = null;
            }

            if (callStatus === 'no_call') {
                // Get all contacts that have at least one call
                const calledContacts = await prisma.retellCall.findMany({
                    where: { workspaceId, contactId: { not: null } },
                    select: { contactId: true },
                    distinct: ['contactId']
                });
                const calledIds = calledContacts.map(c => c.contactId).filter(Boolean);
                where = {
                    AND: [
                        where,
                        { id: { notIn: calledIds } }
                    ]
                };
            } else {
                const matchingCalls = await prisma.retellCall.findMany({
                    where: callWhere,
                    select: { contactId: true },
                    distinct: ['contactId']
                });
                const matchedIds = matchingCalls.map(c => c.contactId).filter(Boolean);

                if (matchedIds.length === 0) {
                    // No contacts match - return empty
                    return res.json({ contacts: [], total: 0, allImportGroups: [], allTags: [] });
                }

                where = {
                    AND: [
                        where,
                        { id: { in: matchedIds } }
                    ]
                };
            }
            console.log(`   CallStatus filter '${callStatus}' applied`);
        }

        // Helper function to add source field and message dates
        const enrichContactWithSource = (contact) => {
            const channels = contact.conversations?.map(c => c.channel) || [];
            let contactSource = 'MANUAL';

            let firstMessageAt = null;
            let lastMessageAt = null;

            if (contact.conversations?.length > 0) {
                const createdDates = contact.conversations
                    .map(c => c.createdAt)
                    .filter(d => d != null);
                if (createdDates.length > 0) {
                    firstMessageAt = new Date(Math.min(...createdDates.map(d => new Date(d).getTime())));
                }

                const lastMsgDates = contact.conversations
                    .map(c => c.lastMessageAt || c.createdAt)
                    .filter(d => d != null);
                if (lastMsgDates.length > 0) {
                    lastMessageAt = new Date(Math.max(...lastMsgDates.map(d => new Date(d).getTime())));
                }

                const channelCounts = channels.reduce((acc, ch) => {
                    acc[ch] = (acc[ch] || 0) + 1;
                    return acc;
                }, {});
                contactSource = Object.entries(channelCounts)
                    .sort((a, b) => b[1] - a[1])[0][0];
            }

            return {
                ...contact,
                source: contactSource,
                channels: [...new Set(channels)],
                firstMessageAt,
                lastMessageAt
            };
        };

        // Check if source filter is applied (not 'ALL')
        const hasSourceFilter = source && source !== 'ALL';

        let finalContacts = [];
        let totalCount = 0;

        if (hasSourceFilter) {
            // SOURCE FILTER ACTIVE: Fetch ALL contacts, filter by source, then paginate at app level
            // This ensures consistent page sizes (e.g., always 15 per page)
            const allContacts = await prisma.contact.findMany({
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
                orderBy: { createdAt: 'desc' }
                // NO take/skip here - we get all and paginate after filtering
            });

            // Enrich with source info
            const allContactsWithSource = allContacts.map(enrichContactWithSource);

            // Apply source filter
            let filteredContacts;
            if (source === 'MANUAL') {
                filteredContacts = allContactsWithSource.filter(c =>
                    c.source === 'MANUAL' || c.channels.length === 0
                );
            } else {
                filteredContacts = allContactsWithSource.filter(c =>
                    c.source === source
                );
            }

            // Get total BEFORE pagination
            totalCount = filteredContacts.length;

            // Apply pagination at application level
            const parsedLimit = parseInt(limit);
            const parsedOffset = parseInt(offset);
            finalContacts = filteredContacts.slice(parsedOffset, parsedOffset + parsedLimit);

            console.log(`✅ [Get Contacts] Source filter '${source}' -> ${totalCount} total, showing ${finalContacts.length} (offset: ${parsedOffset})`);
        } else {
            // NO SOURCE FILTER: Use normal DB pagination
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

            finalContacts = contacts.map(enrichContactWithSource);
            totalCount = await prisma.contact.count({ where });

            console.log(`✅ [Get Contacts] No source filter -> ${totalCount} total, showing ${finalContacts.length}`);
        }

        // Fetch all distinct import groups
        const allContactsForGroups = await prisma.contact.findMany({
            where: { workspaceId, isArchived: false, importGroup: { not: null } },
            select: { importGroup: true },
            distinct: ['importGroup']
        });
        const allImportGroups = allContactsForGroups
            .map(c => c.importGroup)
            .filter(Boolean)
            .sort();

        // Fetch all distinct tags (filtered)
        const allContactsForTags = await prisma.contact.findMany({
            where: { workspaceId, isArchived: false },
            select: { tags: true }
        });
        const allTags = new Set();
        allContactsForTags.forEach(c => {
            try {
                const tags = JSON.parse(c.tags || '[]');
                tags.forEach(t => {
                    if (t && !t.startsWith('v_') && t.length > 2) allTags.add(t);
                });
            } catch { }
        });

        res.json({ contacts: finalContacts, total: totalCount, allImportGroups, allTags: Array.from(allTags).sort() });
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
        const { name, fullName, phone, email, notes, tags, status, company, category, funnelType, funnelStageId } = req.body;

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
        if (phone !== undefined) updateData.phone = normalizePhone(phone);
        if (email !== undefined) updateData.email = email;
        if (company !== undefined) updateData.company = company;
        if (notes !== undefined) updateData.notes = notes;
        if (status !== undefined) updateData.status = status;
        if (category !== undefined) updateData.category = category;
        if (funnelType !== undefined) updateData.funnelType = funnelType;
        if (funnelStageId !== undefined) updateData.funnelStageId = funnelStageId;
        if (tags !== undefined) {
            updateData.tags = typeof tags === 'string' ? tags : JSON.stringify(tags);
        }

        // Handle phones and emails arrays
        const { phones, emails } = req.body;
        if (phones !== undefined) {
            const phonesArr = typeof phones === 'string' ? JSON.parse(phones) : phones;
            updateData.phones = JSON.stringify(phonesArr.map(p => normalizePhone(p)));
        }
        if (emails !== undefined) {
            updateData.emails = typeof emails === 'string' ? emails : JSON.stringify(emails);
        }

        // Auto-upgrade status to OPPORTUNITY if phone is being added and current status is NEW
        const newPhone = phone !== undefined ? phone : existing.phone;
        const currentStatus = status !== undefined ? status : existing.status;
        if (newPhone && newPhone.trim() && currentStatus === 'NEW' && status === undefined) {
            updateData.status = 'OPPORTUNITY';
            console.log(`📱 [Contact] Auto-upgrading status to OPPORTUNITY (phone added): ${id}`);
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
                    updatedFields: { name, phone, email, notes, tags, category, status, funnelStageId: updateData.funnelStageId, funnelType: updateData.funnelType }
                });
            }
        }

        // 🔥 Rule 3: HOT_OPPORT_EMAIL - trigger email to team if category became HOT_OPPORTUNITY
        if (category === 'HOT_OPPORTUNITY' && existing.category !== 'HOT_OPPORTUNITY') {
            const contactWorkspaceId = workspaceId ||
                (await prisma.conversation.findFirst({ where: { contactId: id }, select: { workspaceId: true } }))?.workspaceId;
            if (contactWorkspaceId) {
                executeHotOpportunityEmailRule(contactWorkspaceId, id).catch(e =>
                    console.error('❌ [RULE:HOT_OPPORT_EMAIL] async error:', e.message)
                );
            }
        }

        // 🔥 HAS_PHONE Flow Trigger: fire when phone is newly added
        const hadPhone = !!(existing.phone && existing.phone.trim());
        const nowHasPhone = !!(contact.phone && contact.phone.trim());
        if (!hadPhone && nowHasPhone) {
            const contactWorkspaceId = workspaceId ||
                (await prisma.conversation.findFirst({ where: { contactId: id }, select: { workspaceId: true } }))?.workspaceId;
            if (contactWorkspaceId) {
                const { executeFlowsByTrigger } = await import('./flow.controller.js');
                executeFlowsByTrigger(contactWorkspaceId, 'HAS_PHONE', {
                    contact,
                    conversation: null
                }).catch(e => console.error('❌ [FLOW:HAS_PHONE] error:', e.message));
                console.log(`📞 [FLOW:HAS_PHONE] Triggered for contact ${id}`);
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
        const { name, phone: rawPhone, email, notes, company, funnelType, funnelStageId } = req.body;
        const phone = normalizePhone(rawPhone);

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

        // Determine initial status - OPPORTUNITY if phone exists, otherwise NEW
        const initialStatus = phone && phone.trim() ? 'OPPORTUNITY' : 'NEW';

        // Handle phones and emails arrays
        const { phones, emails } = req.body;

        // Create contact with workspaceId
        const contact = await prisma.contact.create({
            data: {
                workspaceId: workspaceId,
                name,
                phone,
                email,
                phones: phones ? JSON.stringify(phones.map(p => normalizePhone(p))) : '[]',
                emails: emails ? JSON.stringify(emails) : '[]',
                company,
                status: initialStatus,
                funnelType: funnelType || null,
                funnelStageId: funnelStageId || null,
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

// Bulk import contacts (Excel import)
export const bulkImportContacts = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { contacts, tag } = req.body;

        if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
            return res.status(400).json({ error: 'İçe aktarılacak kişi bulunamadı' });
        }

        let imported = 0;
        let skipped = 0;
        const errors = [];

        for (const row of contacts) {
            try {
                const name = (row.name || '').trim();
                const phone = normalizePhone(row.phone);
                const email = (row.email || '').trim();
                const notes = (row.notes || '').trim();
                const originalDate = row.createdAt ? new Date(row.createdAt) : new Date();
                // Validate date
                const contactDate = isNaN(originalDate.getTime()) ? new Date() : originalDate;

                if (!name || (!phone && !email)) {
                    skipped++;
                    continue;
                }

                // Check duplicate by phone or email
                const orConditions = [];
                if (phone) orConditions.push({ phone });
                if (email) orConditions.push({ email });

                const existing = await prisma.contact.findFirst({
                    where: {
                        workspaceId,
                        OR: orConditions
                    }
                });

                if (existing) {
                    // If existing, set importGroup if not already set
                    if (tag && !existing.importGroup) {
                        await prisma.contact.update({
                            where: { id: existing.id },
                            data: { importGroup: tag }
                        });
                    }
                    skipped++;
                    continue;
                }

                const initialStatus = phone && phone.trim() ? 'OPPORTUNITY' : 'NEW';

                // Build notes as JSON array
                let notesJson = null;
                if (notes) {
                    notesJson = JSON.stringify([{
                        id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                        text: notes,
                        createdAt: new Date().toISOString(),
                        createdBy: 'Excel İçe Aktarma'
                    }]);
                }

                const contact = await prisma.contact.create({
                    data: {
                        workspaceId,
                        name,
                        phone: phone || null,
                        email: email || null,
                        notes: notesJson,
                        importGroup: tag || null,
                        status: initialStatus,
                        source: 'IMPORT',
                        createdAt: contactDate
                    }
                });

                // Create a LEAD conversation so the contact appears in Inbox
                const conversation = await prisma.conversation.create({
                    data: {
                        workspaceId,
                        contactId: contact.id,
                        channel: 'LEAD',
                        status: 'OPEN',
                        lastMessageAt: contactDate,
                        createdAt: contactDate
                    }
                });

                imported++;
            } catch (rowErr) {
                errors.push(rowErr.message);
            }
        }

        console.log(`📥 [Import] ${imported} imported, ${skipped} skipped for workspace ${workspaceId}`);

        // Emit socket event
        emitToWorkspace(workspaceId, 'contact_updated', {
            workspaceId,
            action: 'bulk_import',
            imported,
            skipped
        });

        res.json({ imported, skipped, errors: errors.slice(0, 5), total: contacts.length });
    } catch (error) {
        console.error('Bulk import error:', error);
        res.status(500).json({ error: 'İçe aktarma sırasında hata oluştu' });
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
