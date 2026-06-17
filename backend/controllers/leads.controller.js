import axios from 'axios';
import prisma from '../lib/prisma.js';


const GRAPH_API_VERSION = 'v21.0';

// Get all leads for a workspace (from connected Facebook pages)
export const getLeads = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { pageId, formId, status, page = 1, limit = 20, startDate, endDate } = req.query;

        // Get leads from database
        const where = { workspaceId };
        if (pageId) where.facebookPageId = pageId;
        if (formId) where.formId = formId;
        if (status) where.status = status;

        // Date range filter
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                where.createdAt.lte = end;
            }
        }

        const [leads, total] = await Promise.all([
            prisma.facebookLead.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (parseInt(page) - 1) * parseInt(limit),
                take: parseInt(limit),
                include: {
                    facebookPage: {
                        select: { pageName: true, pageId: true }
                    }
                }
            }),
            prisma.facebookLead.count({ where })
        ]);

        res.json({ leads, total, page: parseInt(page), limit: parseInt(limit) });
    } catch (error) {
        console.error('Get leads error:', error);
        res.status(500).json({ error: 'Failed to fetch leads' });
    }
};

// Sync leads from Facebook for all connected pages
export const syncLeads = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { pageId } = req.body; // Optional: sync specific page

        // Get Facebook pages with access tokens
        const where = { workspaceId };
        if (pageId) where.id = pageId;

        const pages = await prisma.facebookPage.findMany({
            where,
            select: {
                id: true,
                pageId: true,
                pageName: true,
                pageAccessToken: true
            }
        });

        if (pages.length === 0) {
            return res.status(400).json({ error: 'No connected Facebook pages found' });
        }

        let totalSynced = 0;
        const errors = [];

        for (const page of pages) {
            if (!page.pageAccessToken) {
                errors.push({ page: page.pageName, error: 'No access token' });
                continue;
            }

            try {
                // Get leadgen forms for this page
                const formsResponse = await axios.get(
                    `https://graph.facebook.com/${GRAPH_API_VERSION}/${page.pageId}/leadgen_forms`,
                    {
                        params: {
                            access_token: page.pageAccessToken,
                            fields: 'id,name,status,leads_count,questions'
                        }
                    }
                );

                const forms = formsResponse.data.data || [];

                for (const form of forms) {
                    // Get leads for each form
                    try {
                        const leadsResponse = await axios.get(
                            `https://graph.facebook.com/${GRAPH_API_VERSION}/${form.id}/leads`,
                            {
                                params: {
                                    access_token: page.pageAccessToken,
                                    fields: 'id,created_time,field_data,ad_id,ad_name,campaign_id,campaign_name'
                                }
                            }
                        );

                        const leads = leadsResponse.data.data || [];

                        for (const lead of leads) {
                            // Parse field data
                            const fieldData = {};
                            if (lead.field_data) {
                                for (const field of lead.field_data) {
                                    let value = field.values?.[0] || '';
                                    
                                    // Find if this field matches a question with options
                                    const question = (form.questions || []).find(q => q.key === field.name || q.label === field.name);
                                    if (question && question.options && question.options.length > 0) {
                                        const matchedOption = question.options.find(opt => opt.key === value || opt.value === value);
                                        if (matchedOption) {
                                            value = matchedOption.value || value;
                                        }
                                    } else if (value && typeof value === 'string' && value.includes('_') && !value.includes('@') && !value.includes('/') && !value.includes('http')) {
                                        // Fallback formatting for snake_case values (like dropdown keys)
                                        value = value.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                                    }
                                    
                                    fieldData[field.name] = value;
                                }
                            }

                            // Upsert lead
                            await prisma.facebookLead.upsert({
                                where: { leadId: lead.id },
                                create: {
                                    leadId: lead.id,
                                    workspaceId,
                                    facebookPageId: page.id,
                                    formId: form.id,
                                    formName: form.name,
                                    adId: lead.ad_id || null,
                                    adName: lead.ad_name || null,
                                    campaignId: lead.campaign_id || null,
                                    campaignName: lead.campaign_name || null,
                                    fieldData: JSON.stringify(fieldData),
                                    name: fieldData.full_name || fieldData.name || null,
                                    email: fieldData.email || null,
                                    phone: fieldData.phone_number || fieldData.phone || null,
                                    status: 'NEW',
                                    createdAt: new Date(lead.created_time)
                                },
                                update: {
                                    fieldData: JSON.stringify(fieldData),
                                    name: fieldData.full_name || fieldData.name || null,
                                    email: fieldData.email || null,
                                    phone: fieldData.phone_number || fieldData.phone || null
                                }
                            });
                            totalSynced++;
                        }
                    } catch (formError) {
                        console.error(`Error fetching leads for form ${form.id}:`, formError.response?.data || formError.message);
                    }
                }
            } catch (pageError) {
                console.error(`Error syncing page ${page.pageName}:`, pageError.response?.data || pageError.message);
                errors.push({ 
                    page: page.pageName, 
                    error: pageError.response?.data?.error?.message || pageError.message 
                });
            }
        }

        res.json({ 
            success: true, 
            synced: totalSynced,
            errors: errors.length > 0 ? errors : undefined
        });
    } catch (error) {
        console.error('Sync leads error:', error);
        res.status(500).json({ error: 'Failed to sync leads' });
    }
};

// Update lead status
export const updateLeadStatus = async (req, res) => {
    try {
        const { workspaceId, leadId } = req.params;
        const { status, notes } = req.body;

        // Verify lead belongs to this workspace
        const existing = await prisma.facebookLead.findFirst({ where: { id: leadId, workspaceId } });
        if (!existing) {
            return res.status(404).json({ error: 'Lead not found' });
        }

        const lead = await prisma.facebookLead.update({
            where: { id: leadId },
            data: { 
                status,
                ...(notes !== undefined && { notes })
            }
        });

        res.json({ lead });
    } catch (error) {
        console.error('Update lead status error:', error);
        res.status(500).json({ error: 'Failed to update lead' });
    }
};

// Get lead forms for a page
export const getLeadForms = async (req, res) => {
    try {
        const { workspaceId, pageId } = req.params;

        // Verify page belongs to this workspace
        const page = await prisma.facebookPage.findFirst({
            where: { id: pageId, workspaceId },
            select: { pageId: true, pageAccessToken: true }
        });

        if (!page || !page.pageAccessToken) {
            return res.status(400).json({ error: 'Page not found or no access token' });
        }

        const response = await axios.get(
            `https://graph.facebook.com/${GRAPH_API_VERSION}/${page.pageId}/leadgen_forms`,
            {
                params: {
                    access_token: page.pageAccessToken,
                    fields: 'id,name,status,leads_count,created_time'
                }
            }
        );

        res.json({ forms: response.data.data || [] });
    } catch (error) {
        console.error('Get lead forms error:', error);
        res.status(500).json({ error: 'Failed to fetch lead forms' });
    }
};

// Delete lead
export const deleteLead = async (req, res) => {
    try {
        const { workspaceId, leadId } = req.params;
        console.log(`🗑️ [Delete Lead] START - ID: ${leadId}`);

        // 1. Verify lead belongs to this workspace
        const lead = await prisma.facebookLead.findFirst({
            where: { id: leadId, workspaceId }
        });

        if (!lead) {
            return res.status(404).json({ error: 'Lead not found' });
        }

        // 2. Find contact by facebookId pattern (lead_XXXXX)
        const contact = await prisma.contact.findFirst({
            where: { facebookId: `lead_${lead.leadId}` }
        });

        if (contact) {
            // 3. Find and delete associated conversation(s)
            const conversations = await prisma.conversation.findMany({
                where: { 
                    contactId: contact.id,
                    channel: 'LEAD'
                }
            });

            for (const conv of conversations) {
                // Delete messages
                await prisma.message.deleteMany({
                    where: { conversationId: conv.id }
                });
                console.log(` - Deleted messages for conversation: ${conv.id}`);

                // Delete internal notes
                await prisma.internalNote.deleteMany({
                    where: { conversationId: conv.id }
                });

                // Delete transfers
                await prisma.conversationTransfer.deleteMany({
                    where: { conversationId: conv.id }
                });

                // Delete conversation
                await prisma.conversation.delete({
                    where: { id: conv.id }
                });
                console.log(` - Deleted conversation: ${conv.id}`);
            }

            // 4. Check if contact has other conversations
            const remainingConversations = await prisma.conversation.count({
                where: { contactId: contact.id }
            });

            if (remainingConversations === 0) {
                await prisma.contact.delete({
                    where: { id: contact.id }
                });
                console.log(` - Deleted orphan contact: ${contact.name}`);
            }
        }

        // 5. Delete the facebook lead record
        await prisma.facebookLead.delete({
            where: { id: leadId }
        });
        console.log(`✅ [Delete Lead] SUCCESS - ID: ${leadId}`);

        res.json({ success: true, message: 'Lead and related data deleted successfully' });
    } catch (error) {
        console.error('Delete lead error:', error);
        res.status(500).json({ error: 'Failed to delete lead' });
    }
};

// Get lead statistics
export const getLeadStats = async (req, res) => {
    try {
        const { workspaceId } = req.params;

        const [total, byStatus, byPage] = await Promise.all([
            prisma.facebookLead.count({ where: { workspaceId } }),
            prisma.facebookLead.groupBy({
                by: ['status'],
                where: { workspaceId },
                _count: true
            }),
            prisma.facebookLead.groupBy({
                by: ['facebookPageId'],
                where: { workspaceId },
                _count: true
            })
        ]);

        // Get page names
        const pageIds = byPage.map(p => p.facebookPageId);
        const pages = await prisma.facebookPage.findMany({
            where: { id: { in: pageIds } },
            select: { id: true, pageName: true }
        });

        const pageMap = {};
        pages.forEach(p => pageMap[p.id] = p.pageName);

        res.json({
            total,
            byStatus: byStatus.map(s => ({ status: s.status, count: s._count })),
            byPage: byPage.map(p => ({ 
                pageId: p.facebookPageId, 
                pageName: pageMap[p.facebookPageId] || 'Unknown',
                count: p._count 
            }))
        });
    } catch (error) {
        console.error('Get lead stats error:', error);
        res.status(500).json({ error: 'Failed to fetch lead statistics' });
    }
};

// Export all leads for a workspace (for CSV download)
export const exportLeads = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { startDate, endDate, pageId, formId } = req.query;

        const where = { workspaceId };
        if (pageId) where.facebookPageId = pageId;
        if (formId) where.formId = formId;

        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                where.createdAt.lte = end;
            }
        }

        const leads = await prisma.facebookLead.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            include: {
                facebookPage: {
                    select: { pageName: true, pageId: true }
                }
            }
        });

        // Parse field_data and extract structured columns
        const exportData = leads.map(lead => {
            let parsedFields = {};
            try {
                parsedFields = JSON.parse(lead.fieldData || '{}');
            } catch (e) { /* ignore */ }

            // Find konut tipi field (look for keys containing 'konut', 'tip', 'daire' etc.)
            let konutTipiRaw = '';
            for (const [key, value] of Object.entries(parsedFields)) {
                const lowerKey = key.toLowerCase();
                if (lowerKey.includes('konut') || lowerKey.includes('tip') || lowerKey.includes('daire') || lowerKey.includes('oda')) {
                    konutTipiRaw = value || '';
                    break;
                }
            }

            // Split "Mia Port 5+1" → projeAdi: "Mia Port", konutTipi: "5+1"
            let projeAdi = '';
            let konutTipi = konutTipiRaw;
            const roomMatch = konutTipiRaw.match(/^(.+?)\s*(\d\+\d+)$/);
            if (roomMatch) {
                projeAdi = roomMatch[1].trim();
                konutTipi = roomMatch[2];
            }

            return {
                formName: lead.formName || '',
                name: lead.name || '',
                email: lead.email || '',
                phone: lead.phone || '',
                konutTipi,
                projeAdi,
                createdAt: lead.createdAt
            };
        });

        res.json({ leads: exportData, total: exportData.length });
    } catch (error) {
        console.error('Export leads error:', error);
        res.status(500).json({ error: 'Failed to export leads' });
    }
};
