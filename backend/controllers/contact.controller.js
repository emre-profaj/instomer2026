import prisma from '../lib/prisma.js';
import { emitToWorkspace } from '../socket.js';
import { executeHotOpportunityEmailRule } from './rules.controller.js';
import { normalizePhone } from '../utils/phoneNormalizer.js';


// Get all contacts in a workspace
export const getContacts = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { search, status, source, category, tag, contactInfo, importGroup, callStatus, showArchived, funnelType, funnelTypes, funnelStageId, limit = 50, offset = 0, dateFilter, dateFrom, dateTo } = req.query;
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

        // Add contactInfo filter (phone/email presence)
        if (contactInfo && contactInfo !== 'ALL') {
            if (contactInfo === 'HAS_PHONE') {
                where = {
                    AND: [
                        where,
                        { phone: { not: null } },
                        { NOT: { phone: '' } }
                    ]
                };
            } else if (contactInfo === 'HAS_EMAIL') {
                where = {
                    AND: [
                        where,
                        { email: { not: null } },
                        { NOT: { email: '' } }
                    ]
                };
            } else if (contactInfo === 'HAS_BOTH') {
                where = {
                    AND: [
                        where,
                        { phone: { not: null } },
                        { NOT: { phone: '' } },
                        { email: { not: null } },
                        { NOT: { email: '' } }
                    ]
                };
            } else if (contactInfo === 'NO_PHONE') {
                where = {
                    AND: [
                        where,
                        { OR: [{ phone: null }, { phone: '' }] }
                    ]
                };
            } else if (contactInfo === 'NO_EMAIL') {
                where = {
                    AND: [
                        where,
                        { OR: [{ email: null }, { email: '' }] }
                    ]
                };
            }
        }

        // Add funnel/stage filter — filter directly on Contact model
        if (funnelStageId && funnelStageId !== 'ALL') {
            where = { 
                AND: [
                    where, 
                    { funnelStageId: funnelStageId }
                ] 
            };
        } else if (funnelTypes && funnelTypes !== 'ALL') {
            // Multi-funnel: comma-separated IDs → OR filter
            const ids = funnelTypes.split(',').map(id => id.trim()).filter(Boolean);
            if (ids.length === 1) {
                where = { AND: [where, { funnelType: ids[0] }] };
            } else if (ids.length > 1) {
                where = { AND: [where, { OR: ids.map(id => ({ funnelType: id })) }] };
            }
        } else if (funnelType && funnelType !== 'ALL') {
            where = { 
                AND: [
                    where, 
                    { funnelType: funnelType }
                ] 
            };
        }

        // Add date filter (createdAt)
        if (dateFilter && dateFilter !== 'ALL') {
            const now = new Date();
            let gte, lte;
            if (dateFilter === 'TODAY') {
                gte = new Date(now); gte.setHours(0, 0, 0, 0);
                lte = new Date(now); lte.setHours(23, 59, 59, 999);
            } else if (dateFilter === 'WEEK') {
                gte = new Date(now); gte.setDate(now.getDate() - now.getDay()); gte.setHours(0, 0, 0, 0);
                lte = new Date(now); lte.setHours(23, 59, 59, 999);
            } else if (dateFilter === 'MONTH') {
                gte = new Date(now.getFullYear(), now.getMonth(), 1);
                lte = new Date(now); lte.setHours(23, 59, 59, 999);
            } else if (dateFilter === 'CUSTOM') {
                if (dateFrom) { gte = new Date(dateFrom); gte.setHours(0, 0, 0, 0); }
                if (dateTo)   { lte = new Date(dateTo);   lte.setHours(23, 59, 59, 999); }
            }
            if (gte || lte) {
                const createdAtFilter = {};
                if (gte) createdAtFilter.gte = gte;
                if (lte) createdAtFilter.lte = lte;
                where = { AND: [where, { createdAt: createdAtFilter }] };
                console.log(`   DateFilter '${dateFilter}' applied: ${gte?.toISOString()} → ${lte?.toISOString()}`);
            }
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
                    if (tag) {
                        let existingTags = [];
                        try { existingTags = JSON.parse(existing.tags || '[]'); } catch(e){}
                        if (!existingTags.includes(tag)) {
                            existingTags.push(tag);
                            await prisma.contact.update({
                                where: { id: existing.id },
                                data: { tags: JSON.stringify(existingTags) }
                            });
                        }
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

                const tagsArray = tag ? [tag] : [];
                const contact = await prisma.contact.create({
                    data: {
                        workspaceId,
                        name,
                        phone: phone || null,
                        email: email || null,
                        notes: notesJson,
                        tags: JSON.stringify(tagsArray),
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
        const { startDate, endDate, funnelId } = req.query;

        console.log(`📊 [Analytics] Getting contact analytics for workspace: ${workspaceId}${funnelId ? ` (Funnel: ${funnelId})` : ''}`);

        // Build date filter
        let dateFilter = {};
        if (startDate || endDate) {
            dateFilter.createdAt = {};
            if (startDate) dateFilter.createdAt.gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                dateFilter.createdAt.lte = end;
            }
        }

        // Base contact where clause
        const contactWhere = {
            conversations: { some: { workspaceId } },
            ...dateFilter
        };

        let activeFunnel = null;
        if (funnelId) {
            activeFunnel = await prisma.funnel.findUnique({
                where: { id: funnelId },
                include: { stages: { orderBy: { order: 'asc' } } }
            });

            if (activeFunnel) {
                // Filter by either funnelStageId OR funnelType (for legacy/inbox consistency)
                contactWhere.OR = [
                    { funnelStageId: { in: activeFunnel.stages.map(s => s.id) } },
                    { funnelType: activeFunnel.name }
                ];
            }
        }

        // Get all contacts
        const contacts = await prisma.contact.findMany({
            where: contactWhere,
            select: {
                id: true,
                status: true,
                funnelType: true,
                funnelStageId: true,
                createdAt: true,
                conversations: {
                    where: { workspaceId },
                    select: { channel: true, id: true }
                }
            }
        });

        // Message metrics (Human vs AI)
        const messageFilter = { conversation: { workspaceId } };
        if (startDate || endDate) messageFilter.createdAt = dateFilter.createdAt;

        const [totalMessages, totalAiMessages, totalHumanMessages] = await Promise.all([
            prisma.message.count({ where: messageFilter }),
            prisma.message.count({ 
                where: { 
                    ...messageFilter, 
                    isFromContact: false, 
                    senderId: null 
                } 
            }),
            prisma.message.count({ 
                where: { 
                    ...messageFilter, 
                    isFromContact: false, 
                    senderId: { not: null } 
                } 
            })
        ]);

        // Conversation metrics
        const conversationFilter = { workspaceId };
        if (startDate || endDate) conversationFilter.createdAt = dateFilter.createdAt;

        const [totalConversations, botLedConversations, handoffConversations] = await Promise.all([
            prisma.conversation.count({ where: conversationFilter }),
            prisma.conversation.count({ 
                where: { 
                    ...conversationFilter, 
                    assignedBotId: { not: null } 
                } 
            }),
            prisma.conversation.count({ 
                where: { 
                    ...conversationFilter, 
                    assignedBotId: { not: null },
                    botEnabled: false 
                } 
            })
        ]);

        // Channel Distribution
        const channelCounts = {};
        contacts.forEach(contact => {
            contact.conversations.forEach(conv => {
                const channel = conv.channel || 'UNKNOWN';
                channelCounts[channel] = (channelCounts[channel] || 0) + 1;
            });
        });

        // Status / Stage Data
        let statusData = [];
        if (activeFunnel) {
            statusData = activeFunnel.stages.map(stage => {
                const count = contacts.filter(c => {
                    // Check direct ID match
                    if (c.funnelStageId === stage.id) return true;
                    
                    // Check name match if contact is in this funnel type but has no stage ID
                    if (c.funnelType === activeFunnel.name) {
                        // Map global status to stage name if applicable
                        const statusToNameMap = {
                            'NEW': 'Yeni Başvuru',
                            'OPPORTUNITY': 'Fırsat',
                            'HOT_OPPORTUNITY': 'Sıcak Fırsat',
                            'PROPOSAL': 'Teklif Aşaması',
                            'CONVERTED': 'Satış'
                        };
                        const mappedName = statusToNameMap[c.status] || c.status;
                        return mappedName === stage.name;
                    }
                    return false;
                }).length;

                return {
                    status: stage.id,
                    label: stage.name,
                    count: count,
                    color: stage.color
                };
            });
        } else {
            // Use global status
            const statusCounts = {
                NEW: 0, OPPORTUNITY: 0, HOT_OPPORTUNITY: 0, INFORMED: 0,
                MEETING_PLANNED: 0, PROPOSAL: 0, CONVERTED: 0, UNREACHABLE: 0, LOST: 0
            };
            const statusLabels = {
                NEW: 'Yeni Başvuru', OPPORTUNITY: 'Fırsat', HOT_OPPORTUNITY: 'Sıcak Fırsat',
                INFORMED: 'Bilgi Verildi', MEETING_PLANNED: 'Görüşme Planlandı',
                PROPOSAL: 'Teklif Aşaması', CONVERTED: 'Satış', UNREACHABLE: 'Ulaşılamadı', LOST: 'Kayıp'
            };

            contacts.forEach(contact => {
                const s = contact.status || 'NEW';
                if (statusCounts.hasOwnProperty(s)) statusCounts[s]++;
            });

            statusData = Object.entries(statusCounts).map(([key, value]) => ({
                status: key,
                label: statusLabels[key] || key,
                count: value
            }));
        }

        const totalContacts = contacts.length;
        const convertedCount = funnelId ? 0 : (contacts.filter(c => c.status === 'CONVERTED').length);
        const conversionRate = totalContacts > 0 ? ((convertedCount / totalContacts) * 100).toFixed(1) : 0;

        // Monthly data
        const monthlyData = [];
        const now = new Date();
        for (let i = 5; i >= 0; i--) {
            const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
            const mName = mStart.toLocaleString('tr-TR', { month: 'short' });
            const count = contacts.filter(c => {
                const d = new Date(c.createdAt);
                return d >= mStart && d <= mEnd;
            }).length;
            monthlyData.push({ month: mName, count });
        }

        // Funnel Summary — tüm kişiler, date filter yok (mevcut durumu gösterir)
        const allFunnels = await prisma.funnel.findMany({
            where: { workspaceId },
            include: { stages: { select: { id: true } } },
            orderBy: { order: 'asc' }
        });

        const funnelSummary = await Promise.all(allFunnels.map(async (f) => {
            const stageIds = f.stages.map(s => s.id);
            const count = await prisma.contact.count({
                where: {
                    conversations: { some: { workspaceId } },
                    OR: [
                        ...(stageIds.length > 0 ? [{ funnelStageId: { in: stageIds } }] : []),
                        { funnelType: f.name }
                    ]
                }
            });
            return { id: f.id, name: f.name, count, color: f.color, icon: f.icon };
        }));

        // "Genel" funnel'ı — hiçbir funnel'a atanmamış kişiler
        if (!funnelSummary.some(f => f.name.toLowerCase() === 'genel')) {
            const allStageIds = allFunnels.flatMap(f => f.stages.map(s => s.id));
            const allFunnelNames = allFunnels.map(f => f.name);
            const generalCount = await prisma.contact.count({
                where: {
                    conversations: { some: { workspaceId } },
                    funnelStageId: allStageIds.length > 0 ? { notIn: allStageIds } : undefined,
                    OR: [
                        { funnelType: null },
                        { funnelType: 'Genel' },
                        ...(allFunnelNames.length > 0 ? [] : [])
                    ]
                }
            });
            funnelSummary.unshift({ id: 'genel', name: 'Genel', count: generalCount, color: '#64748b', icon: '📋' });
        }


        // Appointment Statistics
        const appointmentFilter = { workspaceId };
        if (startDate || endDate) appointmentFilter.createdAt = dateFilter.createdAt;

        const [
            totalAppointments,
            botAppointments,
            agentAppointments,
            scheduledAppointments,
            completedAppointments,
            cancelledAppointments
        ] = await Promise.all([
            prisma.appointment.count({ where: appointmentFilter }),
            prisma.appointment.count({ where: { ...appointmentFilter, createdByBotId: { not: null } } }),
            prisma.appointment.count({ where: { ...appointmentFilter, createdByBotId: null } }),
            prisma.appointment.count({ where: { ...appointmentFilter, status: 'SCHEDULED' } }),
            prisma.appointment.count({ where: { ...appointmentFilter, status: 'COMPLETED' } }),
            prisma.appointment.count({ where: { ...appointmentFilter, status: 'CANCELLED' } })
        ]);

        // Real resolution rate from conversations
        const resolvedConvs = await prisma.conversation.count({ where: { ...conversationFilter, status: 'RESOLVED' } });
        const realResolutionRate = totalConversations > 0
            ? ((resolvedConvs / totalConversations) * 100).toFixed(1)
            : 0;

        // ── Call Tracking Stats ──
        // Telefon numarası olan kişiler (seçili tarih aralığında oluşturulanlar)
        const contactsWithPhone = await prisma.contact.count({
            where: {
                conversations: { some: { workspaceId } },
                phone: { not: null },
                NOT: { phone: '' },
                ...dateFilter
            }
        });

        // CALL aktivitesi olan unique kişi sayısı
        const activityDateFilter = {};
        if (startDate || endDate) {
            activityDateFilter.createdAt = {};
            if (startDate) activityDateFilter.createdAt.gte = new Date(startDate);
            if (endDate) {
                const endD = new Date(endDate);
                endD.setHours(23, 59, 59, 999);
                activityDateFilter.createdAt.lte = endD;
            }
        }

        const callActivities = await prisma.contactActivity.findMany({
            where: {
                workspaceId,
                type: 'CALL',
                ...activityDateFilter
            },
            select: {
                contactId: true,
                status: true,
                dueDate: true,
                createdAt: true,
                assignedToId: true,
                contact: { select: { id: true, name: true, phone: true } },
                assignee: { select: { id: true, name: true } }
            }
        });

        const calledContactIds = new Set(callActivities.map(a => a.contactId));
        const completedCallContactIds = new Set(callActivities.filter(a => a.status === 'COMPLETED').map(a => a.contactId));

        // Kişi bazlı arama detayları (tablo için)
        const callDetailMap = {};
        for (const a of callActivities) {
            if (!callDetailMap[a.contactId]) {
                callDetailMap[a.contactId] = {
                    contactId: a.contactId,
                    contactName: a.contact?.name || 'Bilinmiyor',
                    phone: a.contact?.phone || '',
                    totalCalls: 0,
                    completedCalls: 0,
                    plannedCalls: 0,
                    lastCallDate: null,
                    assigneeName: null
                };
            }
            const d = callDetailMap[a.contactId];
            d.totalCalls++;
            if (a.status === 'COMPLETED') d.completedCalls++;
            if (a.status === 'PLANNED') d.plannedCalls++;
            const dateToCheck = a.dueDate || a.createdAt;
            if (!d.lastCallDate || new Date(dateToCheck) > new Date(d.lastCallDate)) {
                d.lastCallDate = dateToCheck;
            }
            if (a.assignee) d.assigneeName = a.assignee.name;
        }
        // Numaralı tüm kişilerin listesi (popup için)
        const allContactsWithPhone = await prisma.contact.findMany({
            where: {
                conversations: { some: { workspaceId } },
                phone: { not: null },
                NOT: { phone: '' },
                ...dateFilter
            },
            select: {
                id: true,
                name: true,
                phone: true,
                status: true,
                createdAt: true
            },
            orderBy: { createdAt: 'desc' }
        });

        const phoneContactsList = allContactsWithPhone.map(c => {
            const detail = callDetailMap[c.id];
            return {
                contactId: c.id,
                name: c.name || 'İsimsiz',
                phone: c.phone,
                status: c.status,
                createdAt: c.createdAt,
                wasCalled: !!detail,
                totalCalls: detail?.totalCalls || 0,
                completedCalls: detail?.completedCalls || 0,
                plannedCalls: detail?.plannedCalls || 0,
                lastCallDate: detail?.lastCallDate || null,
                assigneeName: detail?.assigneeName || null
            };
        });

        const callTrackingStats = {
            totalWithPhone: contactsWithPhone,
            totalCalled: calledContactIds.size,
            totalCompleted: completedCallContactIds.size,
            totalNotCalled: contactsWithPhone - calledContactIds.size,
            callRate: contactsWithPhone > 0 ? ((calledContactIds.size / contactsWithPhone) * 100).toFixed(1) : 0,
            details: Object.values(callDetailMap).sort((a, b) => new Date(b.lastCallDate) - new Date(a.lastCallDate)),
            phoneContactsList
        };

        res.json({
            totalContacts,
            totalMessages,
            totalAiMessages,
            totalHumanMessages,
            totalConversations,
            botLedConversations,
            handoffConversations,
            handoffRate: botLedConversations > 0 ? ((handoffConversations / botLedConversations) * 100).toFixed(1) : 0,
            conversionRate: parseFloat(conversionRate),
            resolutionRate: parseFloat(realResolutionRate),
            statusData,
            funnelSummary,
            channelData: Object.entries(channelCounts).map(([k, v]) => ({ channel: k, count: v })),
            monthlyData,
            appointmentStats: {
                total: totalAppointments,
                byBot: botAppointments,
                byAgent: agentAppointments,
                scheduled: scheduledAppointments,
                completed: completedAppointments,
                cancelled: cancelledAppointments
            },
            callTrackingStats
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

            // Toplam işlem: agent'ın atandığı VEYA çözdüğü konuşmalar (unique)
            // Prisma'da OR + distinct desteklenmiyor, 2 sorgu alıp birleştiriyoruz
            const [assignedConvIds, resolvedConvIds] = await Promise.all([
                prisma.conversation.findMany({
                    where: { workspaceId, assignedToId: userId, ...dateFilter },
                    select: { id: true }
                }),
                prisma.conversation.findMany({
                    where: { workspaceId, resolvedById: userId, status: 'RESOLVED', ...dateFilter },
                    select: { id: true }
                })
            ]);
            const uniqueConvIds = [...new Set([
                ...assignedConvIds.map(c => c.id),
                ...resolvedConvIds.map(c => c.id)
            ])];
            const totalConversations = uniqueConvIds.length;

            // Çözülen konuşmalar (bu agent'ın çözdükleri)
            const resolvedConversations = resolvedConvIds.length;

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

            // Calculate average response time using all conversations this agent was involved in
            const conversationsWithMessages = await prisma.conversation.findMany({
                where: {
                    workspaceId,
                    id: { in: uniqueConvIds }
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
                resolutionRate: Math.min(resolutionRate, 100)
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

        // Mevcut notları koru — JSON array'e append et (üzerine yazma!)
        const contactRecord = await prisma.contact.findUnique({ where: { id }, select: { notes: true } });
        let existingNotes = [];
        try {
            if (contactRecord?.notes) {
                const parsed = JSON.parse(contactRecord.notes);
                existingNotes = Array.isArray(parsed) ? parsed : [];
            }
        } catch { existingNotes = []; }

        const newNoteEntry = {
            timestamp: new Date().toLocaleString('tr-TR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }),
            title: '',
            content: note
        };
        const updatedNotes = JSON.stringify([newNoteEntry, ...existingNotes]);

        await prisma.contact.update({
            where: { id },
            data: { notes: updatedNotes }
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
