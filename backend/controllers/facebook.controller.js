import { validationResult } from 'express-validator';
import prisma from '../lib/prisma.js';
import axios from 'axios';
import crypto from 'crypto';
import { getIO, emitToWorkspace } from '../socket.js';
import { applyChannelRouting, canBotRespond } from '../services/conversationRouting.service.js';

const GRAPH_API_VERSION = process.env.FACEBOOK_GRAPH_API_VERSION || 'v18.0';

// Processing lock to prevent duplicate webhook processing
const processingMessages = new Set();
const processingLockTimeout = 30000; // 30 seconds

const acquireMessageLock = (messageId) => {
    if (processingMessages.has(messageId)) {
        return false;
    }
    processingMessages.add(messageId);
    // Auto-release lock after timeout
    setTimeout(() => processingMessages.delete(messageId), processingLockTimeout);
    return true;
};

const releaseMessageLock = (messageId) => {
    processingMessages.delete(messageId);
};

// Helper to generate Gravatar URL from email
const getGravatarUrl = (email, size = 150) => {
    if (!email) return null;
    const hash = crypto.createHash('md5').update(email.toLowerCase().trim()).digest('hex');
    // d=404 means return 404 if no gravatar found (so we can fallback)
    return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=404`;
};

// Helper to generate UI-Avatars fallback URL
const getAvatarFallback = (name, size = 150) => {
    const encodedName = encodeURIComponent(name || 'User');
    return `https://ui-avatars.com/api/?name=${encodedName}&background=ef4444&color=fff&size=${size}`;
};

export const connectPage = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { pageId, pageAccessToken, pageName, workspaceId, instagramBusinessId, instagramUsername } = req.body;

        // Verify the page access token
        try {
            const response = await axios.get(
                `https://graph.facebook.com/${GRAPH_API_VERSION}/${pageId}`,
                {
                    params: {
                        fields: 'id,name',
                        access_token: pageAccessToken
                    }
                }
            );

            if (response.data.id !== pageId) {
                return res.status(400).json({ error: 'Invalid page credentials' });
            }

            // Only log Instagram info if it was explicitly provided
            if (instagramBusinessId) {
                console.log(`📸 Instagram account provided: ${instagramUsername} (${instagramBusinessId})`);
            } else {
                console.log(`📘 Facebook page only (no Instagram): ${pageName}`);
            }
        } catch (error) {
            console.error('Facebook API verification error:', error.response?.data || error.message);
            return res.status(400).json({ error: 'Failed to verify Facebook page' });
        }

        // Check if page is already connected to THIS workspace
        const existingPage = await prisma.facebookPage.findUnique({
            where: {
                pageId_workspaceId: {
                    pageId,
                    workspaceId
                }
            }
        });

        let page;
        if (existingPage) {
            // Update the page for this workspace
            // Only update Instagram fields if explicitly provided
            const updateData = {
                pageName,
                pageAccessToken
            };

            // Instagram fields: null means clear, undefined means don't touch
            if (instagramBusinessId !== undefined) {
                updateData.instagramBusinessId = instagramBusinessId || null;
                updateData.instagramUsername = instagramUsername || null;
            }

            page = await prisma.facebookPage.update({
                where: {
                    pageId_workspaceId: {
                        pageId,
                        workspaceId
                    }
                },
                data: updateData
            });
        } else {
            // Create new page connection for this workspace
            page = await prisma.facebookPage.create({
                data: {
                    pageId,
                    pageName,
                    pageAccessToken,
                    workspaceId,
                    instagramBusinessId: instagramBusinessId || null,
                    instagramUsername: instagramUsername || null
                }
            });
        }

        // Subscribe to webhooks for Facebook Page
        try {
            await axios.post(
                `https://graph.facebook.com/${GRAPH_API_VERSION}/${pageId}/subscribed_apps`,
                {},
                {
                    params: {
                        subscribed_fields: 'messages,messaging_postbacks,messaging_optins,messaging_referrals,feed,leadgen',
                        access_token: pageAccessToken
                    }
                }
            );
            console.log(`✅ Facebook Page ${pageId} webhook subscription successful`);
        } catch (error) {
            console.error('Facebook webhook subscription error:', error.response?.data);
        }

        // Subscribe to Instagram webhooks if Instagram is connected
        if (instagramBusinessId) {
            try {
                // Instagram uses the page's subscribed_apps but with different fields
                // Instagram messaging is handled through the page webhook with 'messages' field
                console.log(`📸 Instagram ${instagramBusinessId} will receive messages through page webhook`);
            } catch (error) {
                console.error('Instagram webhook subscription error:', error.response?.data);
            }
        }

        res.status(201).json({ page });
    } catch (error) {
        console.error('Connect page error:', error);
        res.status(500).json({ error: 'Failed to connect page' });
    }
};

export const getPages = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        console.log('Get pages request for workspace:', workspaceId);

        const pages = await prisma.facebookPage.findMany({
            where: { workspaceId },
            select: {
                id: true,
                pageId: true,
                pageName: true,
                instagramBusinessId: true,
                instagramUsername: true,
                assignedBotId: true,
                instagramBotId: true,
                commentBotId: true,
                instagramCommentBotId: true,
                createdAt: true,
                _count: {
                    select: {
                        conversations: true
                    }
                }
            }
        });

        console.log(`Found ${pages.length} pages for workspace ${workspaceId}`);
        res.json({ pages });
    } catch (error) {
        console.error('Get pages error:', error);
        res.status(500).json({ error: 'Failed to fetch pages' });
    }
};

// Get available pages from user's Facebook account for selection
export const getAvailablePages = async (req, res) => {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }

        // Get user's Facebook access token from database
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { facebookAccessToken: true, name: true }
        });

        if (!user?.facebookAccessToken) {
            return res.status(400).json({
                error: 'Facebook hesabınız bağlı değil. Lütfen önce Facebook ile bağlantı kurun.',
                requiresAuth: true
            });
        }

        console.log(`📋 Fetching available Facebook pages for user: ${user.name}`);

        // Fetch pages from Facebook Graph API
        const response = await axios.get(
            `https://graph.facebook.com/${GRAPH_API_VERSION}/me/accounts`,
            {
                params: {
                    access_token: user.facebookAccessToken,
                    fields: 'id,name,access_token,category,instagram_business_account{id,username}'
                }
            }
        );

        const pages = response.data.data || [];
        console.log(`✅ Found ${pages.length} available pages`);

        res.json({ pages });
    } catch (error) {
        console.error('Get available pages error:', error.response?.data || error.message);

        // Check if token expired
        if (error.response?.data?.error?.code === 190) {
            return res.status(401).json({
                error: 'Facebook oturumunuz sona ermiş. Lütfen tekrar bağlanın.',
                requiresAuth: true
            });
        }

        res.status(500).json({ error: 'Sayfalar yüklenirken hata oluştu' });
    }
};

// Diagnostic endpoint to check page health
export const checkPageHealth = async (req, res) => {
    try {
        const { pageId } = req.params;

        const page = await prisma.facebookPage.findUnique({
            where: { id: pageId }
        });

        if (!page) {
            return res.status(404).json({ error: 'Page not found' });
        }

        const diagnostics = {
            pageName: page.pageName,
            pageId: page.pageId,
            hasAccessToken: !!page.pageAccessToken,
            instagramConnected: !!page.instagramBusinessId,
            instagramUsername: page.instagramUsername,
            tokenValid: false,
            webhookSubscribed: false,
            permissions: [],
            errors: []
        };

        // Check token validity
        try {
            const tokenCheck = await axios.get(
                `https://graph.facebook.com/${GRAPH_API_VERSION}/debug_token`,
                {
                    params: {
                        input_token: page.pageAccessToken,
                        access_token: page.pageAccessToken
                    }
                }
            );

            if (tokenCheck.data?.data?.is_valid) {
                diagnostics.tokenValid = true;
                diagnostics.tokenExpiry = tokenCheck.data.data.expires_at
                    ? new Date(tokenCheck.data.data.expires_at * 1000).toISOString()
                    : 'Never';
                diagnostics.permissions = tokenCheck.data.data.scopes || [];
            } else {
                diagnostics.errors.push('Token is invalid or expired');
            }
        } catch (error) {
            diagnostics.errors.push(`Token check failed: ${error.response?.data?.error?.message || error.message}`);
        }

        // Check webhook subscription
        try {
            const subCheck = await axios.get(
                `https://graph.facebook.com/${GRAPH_API_VERSION}/${page.pageId}/subscribed_apps`,
                {
                    params: {
                        access_token: page.pageAccessToken
                    }
                }
            );

            if (subCheck.data?.data?.length > 0) {
                diagnostics.webhookSubscribed = true;
                diagnostics.subscribedFields = subCheck.data.data[0]?.subscribed_fields || [];
            } else {
                diagnostics.errors.push('No webhook subscription found');
            }
        } catch (error) {
            diagnostics.errors.push(`Webhook check failed: ${error.response?.data?.error?.message || error.message}`);
        }

        // Check if we can send messages
        try {
            const meCheck = await axios.get(
                `https://graph.facebook.com/${GRAPH_API_VERSION}/${page.pageId}`,
                {
                    params: {
                        fields: 'id,name',
                        access_token: page.pageAccessToken
                    }
                }
            );
            diagnostics.canAccessPage = true;
        } catch (error) {
            diagnostics.canAccessPage = false;
            diagnostics.errors.push(`Cannot access page: ${error.response?.data?.error?.message || error.message}`);
        }

        console.log(`🔍 [DIAGNOSTIC] Page ${page.pageName} health check:`, diagnostics);
        res.json(diagnostics);
    } catch (error) {
        console.error('Page health check error:', error);
        res.status(500).json({ error: 'Failed to check page health' });
    }
};

// Re-subscribe page to webhooks
export const resubscribeWebhook = async (req, res) => {
    try {
        const { pageId } = req.params;

        const page = await prisma.facebookPage.findUnique({
            where: { id: pageId }
        });

        if (!page) {
            return res.status(404).json({ error: 'Page not found' });
        }

        // Subscribe to webhooks
        const response = await axios.post(
            `https://graph.facebook.com/${GRAPH_API_VERSION}/${page.pageId}/subscribed_apps`,
            {},
            {
                params: {
                    subscribed_fields: 'messages,messaging_postbacks,messaging_optins,messaging_referrals,instagram_manage_messages,feed,comments,leadgen',
                    access_token: page.pageAccessToken
                }
            }
        );

        console.log(`✅ [WEBHOOK] Re-subscribed page ${page.pageName}:`, response.data);
        res.json({ success: true, message: 'Webhook re-subscribed successfully', data: response.data });
    } catch (error) {
        console.error('Webhook resubscribe error:', error.response?.data || error.message);
        res.status(500).json({
            error: 'Failed to resubscribe webhook',
            details: error.response?.data?.error?.message || error.message
        });
    }
};

export const disconnectPage = async (req, res) => {
    try {
        const { pageId } = req.params;
        const { channelType } = req.query; // 'facebook' or 'instagram'

        const page = await prisma.facebookPage.findUnique({
            where: { id: pageId },
            include: {
                conversations: {
                    select: { id: true }
                }
            }
        });

        if (!page) {
            return res.status(404).json({ error: 'Page not found' });
        }

        const conversationCount = page.conversations.length;

        // If disconnecting only Instagram, just clear Instagram fields
        if (channelType === 'instagram' && page.pageId) {
            // Count Instagram conversations (for info only, don't delete)
            const instagramConversationCount = await prisma.conversation.count({
                where: {
                    facebookPageId: page.id,
                    channel: 'INSTAGRAM'
                }
            });

            // Just clear Instagram fields, keep conversations
            await prisma.facebookPage.update({
                where: { id: pageId },
                data: {
                    instagramBusinessId: null,
                    instagramUsername: null,
                    instagramBotId: null
                }
            });

            console.log(`📱 Instagram disconnected from page ${page.pageName}, Facebook connection kept`);
            console.log(`💾 Preserved ${instagramConversationCount} Instagram conversations and all contacts`);

            return res.json({
                message: 'Instagram disconnected successfully. Conversations and contacts are preserved.',
                preservedConversations: instagramConversationCount
            });
        }

        // IMPORTANT: Don't delete conversations, messages, contacts, or leads!
        // Just remove the page connection - data is preserved for future reference

        // Unlink conversations from this page (so they're not orphaned by foreign key)
        await prisma.conversation.updateMany({
            where: { facebookPageId: page.id },
            data: { facebookPageId: null }
        });
        console.log(`🔗 Unlinked ${conversationCount} conversations from page (data preserved)`);

        // Unlink leads from this page
        const leadCount = await prisma.facebookLead.count({
            where: { facebookPageId: page.id }
        });
        await prisma.facebookLead.updateMany({
            where: { facebookPageId: page.id },
            data: { facebookPageId: null }
        });
        if (leadCount > 0) {
            console.log(`🔗 Unlinked ${leadCount} leads from page (data preserved)`);
        }

        // If disconnecting Facebook when Instagram is also connected
        if (channelType === 'facebook' && page.instagramBusinessId) {
            console.log(`📱 Disconnecting page ${page.pageName} - Facebook requested, Instagram will also be removed`);
        }

        // Delete the page connection (but keep all data)
        await prisma.facebookPage.delete({
            where: { id: pageId }
        });

        console.log(`✅ Page ${page.pageName} disconnected. All conversations, messages, contacts and leads are PRESERVED.`);

        res.json({
            message: 'Page disconnected successfully. All data (conversations, contacts, leads) is preserved.',
            preservedConversations: conversationCount,
            preservedLeads: leadCount
        });
    } catch (error) {
        console.error('Disconnect page error:', error);
        res.status(500).json({ error: 'Failed to disconnect page' });
    }
};

export const updatePageBot = async (req, res) => {
    try {
        const { id } = req.params;
        const { assignedBotId, type } = req.body; // type is 'facebook', 'instagram', 'comment', or 'instagram_comment'

        const data = {};
        if (type === 'instagram') {
            data.instagramBotId = assignedBotId || null;
        } else if (type === 'comment') {
            data.commentBotId = assignedBotId || null;
        } else if (type === 'instagram_comment') {
            data.instagramCommentBotId = assignedBotId || null;
        } else {
            data.assignedBotId = assignedBotId || null;
        }

        // If a bot is assigned, automatically activate it
        if (assignedBotId) {
            await prisma.aIBot.update({
                where: { id: assignedBotId },
                data: { isActive: true }
            });
            console.log(`✅ Bot ${assignedBotId} automatically activated (assigned to ${type} channel)`);
        }

        const page = await prisma.facebookPage.update({
            where: { id },
            data
        });

        // For DM bots (facebook/instagram), also update all OPEN conversations
        // Comment bots don't need conversation updates as comments don't have conversations
        if (type !== 'comment' && type !== 'instagram_comment') {
            await prisma.conversation.updateMany({
                where: {
                    workspaceId: page.workspaceId,
                    status: 'OPEN',
                    ...(type === 'instagram'
                        ? { instagramBusinessId: page.instagramBusinessId }
                        : { facebookPageId: page.id, instagramBusinessId: null }
                    )
                },
                data: {
                    assignedBotId: assignedBotId || null
                }
            });
        }

        res.json({ page });
    } catch (error) {
        console.error('Update page bot error:', error);
        res.status(500).json({ error: 'Failed to update assigned bot' });
    }
};

// ADMIN ONLY: Get all pages from Facebook Developer account
export const getAdminFacebookPages = async (req, res) => {
    try {
        // Check if user is owner
        if (req.user.role !== 'OWNER' && req.user.role !== 'SUPER_ADMIN') {
            return res.status(403).json({ error: 'Owner access required' });
        }

        const adminAccessToken = process.env.FACEBOOK_ADMIN_ACCESS_TOKEN;

        if (!adminAccessToken) {
            return res.status(500).json({ error: 'Admin Facebook token not configured' });
        }

        // Get all pages managed by the admin token
        const response = await axios.get(
            `https://graph.facebook.com/${GRAPH_API_VERSION}/me/accounts`,
            {
                params: {
                    access_token: adminAccessToken,
                    fields: 'id,name,access_token,category,tasks'
                }
            }
        );

        const pages = response.data.data || [];

        // Check which pages are already connected
        const connectedPageIds = await prisma.facebookPage.findMany({
            select: { pageId: true }
        });

        const connectedIds = new Set(connectedPageIds.map(p => p.pageId));

        const pagesWithStatus = pages.map(page => ({
            id: page.id,
            name: page.name,
            category: page.category,
            accessToken: page.access_token,
            isConnected: connectedIds.has(page.id)
        }));

        res.json({ pages: pagesWithStatus });
    } catch (error) {
        console.error('Get admin Facebook pages error:', error.response?.data || error);
        res.status(500).json({ error: 'Failed to fetch Facebook pages' });
    }
};

// ADMIN ONLY: Connect a page from Facebook Developer account
export const connectAdminPage = async (req, res) => {
    try {
        // Check if user is owner
        if (req.user.role !== 'OWNER' && req.user.role !== 'SUPER_ADMIN') {
            return res.status(403).json({ error: 'Owner access required' });
        }

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { pageId, pageAccessToken, pageName, workspaceId } = req.body;

        // Fetch Instagram info
        let instagramBusinessId = null;
        let instagramUsername = null;
        try {
            const response = await axios.get(
                `https://graph.facebook.com/${GRAPH_API_VERSION}/${pageId}`,
                {
                    params: {
                        fields: 'id,name,instagram_business_account{id,username}',
                        access_token: pageAccessToken
                    }
                }
            );
            if (response.data.instagram_business_account) {
                instagramBusinessId = response.data.instagram_business_account.id;
                instagramUsername = response.data.instagram_business_account.username;
            }
        } catch (error) {
            console.error('Error fetching Instagram info in connectAdminPage:', error.response?.data || error.message);
        }

        // Check if page is already connected to THIS workspace
        const existingPage = await prisma.facebookPage.findUnique({
            where: {
                pageId_workspaceId: {
                    pageId,
                    workspaceId
                }
            }
        });

        let page;
        if (existingPage) {
            // Update the page for this workspace
            page = await prisma.facebookPage.update({
                where: {
                    pageId_workspaceId: {
                        pageId,
                        workspaceId
                    }
                },
                data: {
                    pageName,
                    pageAccessToken,
                    instagramBusinessId,
                    instagramUsername
                }
            });
        } else {
            // Create new page connection for this workspace
            page = await prisma.facebookPage.create({
                data: {
                    pageId,
                    pageName,
                    pageAccessToken,
                    workspaceId,
                    instagramBusinessId,
                    instagramUsername
                }
            });
        }

        // Subscribe to webhooks
        try {
            await axios.post(
                `https://graph.facebook.com/${GRAPH_API_VERSION}/${pageId}/subscribed_apps`,
                {},
                {
                    params: {
                        subscribed_fields: 'messages,messaging_postbacks,messaging_optins,messaging_referrals,instagram_manage_messages,feed,comments,leadgen',
                        access_token: pageAccessToken
                    }
                }
            );
        } catch (error) {
            console.error('Webhook subscription error:', error.response?.data);
        }

        res.status(201).json({ page, message: 'Page connected successfully' });
    } catch (error) {
        console.error('Connect admin page error:', error);
        res.status(500).json({ error: 'Failed to connect page' });
    }
};

export const webhookVerify = (req, res) => {
    const VERIFY_TOKEN = process.env.FACEBOOK_VERIFY_TOKEN || 'chatinstomer_verify_token';

    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    console.log('🔐 Webhook Verify Request:', {
        mode,
        token: token ? `${token.substring(0, 5)}...` : 'missing',
        expectedToken: `${VERIFY_TOKEN.substring(0, 5)}...`,
        challenge: challenge ? 'present' : 'missing',
        tokenMatch: token === VERIFY_TOKEN
    });

    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('✅ Webhook verified successfully');
            res.status(200).send(challenge);
        } else {
            console.log('❌ Webhook verification failed - token mismatch');
            res.sendStatus(403);
        }
    } else {
        console.log('❌ Webhook verification failed - missing mode or token');
        res.sendStatus(400);
    }
};

export const webhookHandler = async (req, res) => {
    // IMPORTANT: Respond immediately to Facebook to avoid timeout
    // Facebook expects a response within 20 seconds
    const body = req.body;
    console.log('📬 Webhook Received:', JSON.stringify(body, null, 2));

    if (body.object === 'page' || body.object === 'instagram') {
        // Send response immediately
        res.status(200).send('EVENT_RECEIVED');

        // Process webhook asynchronously
        processWebhookAsync(body).catch(err => {
            console.error('Async webhook processing error:', err);
        });
    } else {
        res.sendStatus(404);
    }
};

// Async webhook processor
async function processWebhookAsync(body) {
    try {
        for (const entry of body.entry) {
            // Instagram sometimes sends messages in 'messaging', comments in 'changes'
            const messagingEvent = entry.messaging?.[0];
            const changeEvent = entry.changes?.[0];

            // --- HANDLE COMMENTS/FEED CHANGES SEPARATELY ---
            if (changeEvent && (changeEvent.field === 'feed' || changeEvent.field === 'comments')) {
                console.log('📎 Webhook Event Type: changes (feed/comments)');
                const changeValue = changeEvent.value;
                console.log(`📝 [COMMENTS WEBHOOK] Field: ${changeEvent.field}, Item: ${changeValue?.item}, Verb: ${changeValue?.verb}`);
                console.log(`📝 [COMMENTS WEBHOOK] Full value:`, JSON.stringify(changeValue, null, 2));

                // Find ALL workspaces that have this page connected
                const pageIdFromEntry = entry.id;
                const allConnectedPagesForComments = await prisma.facebookPage.findMany({
                    where: {
                        OR: [
                            { pageId: pageIdFromEntry },
                            { instagramBusinessId: pageIdFromEntry }
                        ]
                    }
                });

                if (allConnectedPagesForComments.length === 0) {
                    console.log(`❌ [COMMENTS] Page ${pageIdFromEntry} not found in any workspace`);
                    continue;
                }

                console.log(`📦 [COMMENTS] Found ${allConnectedPagesForComments.length} workspace(s) with this page connected`);

                // Process comment for EACH workspace
                for (const facebookPage of allConnectedPagesForComments) {
                    console.log(`🔄 [COMMENTS] Processing for workspace: ${facebookPage.workspaceId}`);

                    const isInstagram = pageIdFromEntry === facebookPage.instagramBusinessId || body.object === 'instagram';

                    // Instagram comments have different structure than Facebook
                    // Instagram: { id, text, from: { id, username }, media: { id } }
                    // Facebook: { item, verb, comment_id, message, from: { id, name }, post_id }

                    const isCommentEvent = changeValue?.item === 'comment' || changeValue?.id;
                    const isAddVerb = changeValue?.verb === 'add' || !changeValue?.verb; // Instagram doesn't always send verb

                    if (isCommentEvent && isAddVerb) {
                        // Handle both Facebook and Instagram comment formats
                        const commenterId = changeValue.from?.id || changeValue.from?.username;
                        const commentText = changeValue.message || changeValue.text;
                        const commentId = changeValue.comment_id || changeValue.id;
                        const postId = changeValue.post_id || changeValue.media?.id;

                        console.log(`💬 [COMMENTS] isInstagram: ${isInstagram}, Commenter: ${commenterId}, Page: ${facebookPage.pageId}, Instagram: ${facebookPage.instagramBusinessId}`);
                        console.log(`💬 [COMMENTS] Comment ID: ${commentId}, Post ID: ${postId}, Text: ${commentText}`);

                        // Check if comment is from page itself (skip if so)
                        const isFromPage = commenterId === facebookPage.pageId ||
                            commenterId === facebookPage.instagramBusinessId ||
                            commenterId === facebookPage.instagramUsername;

                        if (commenterId && !isFromPage && commentText) {
                            console.log(`💬 New comment from ${commenterId}: "${commentText}"`);

                            // Save comment to database
                            try {
                                // Find or create contact
                                let contact = await prisma.contact.findFirst({
                                    where: {
                                        OR: [
                                            { facebookId: commenterId },
                                            { facebookId: changeValue.from?.username }
                                        ],
                                        workspaceId: facebookPage.workspaceId
                                    }
                                });

                                if (!contact) {
                                    // Fetch commenter info - use name for Facebook, username for Instagram
                                    let commenterName = changeValue.from?.name || changeValue.from?.username || 'Unknown User';

                                    try {
                                        contact = await prisma.contact.create({
                                            data: {
                                                name: commenterName,
                                                facebookId: commenterId,
                                                workspaceId: facebookPage.workspaceId
                                            }
                                        });
                                        console.log(`✅ Created contact for commenter: ${commenterName}`);
                                    } catch (error) {
                                        // Handle race condition where contact was created by another process
                                        if (error.code === 'P2002') {
                                            console.log(`ℹ️ Contact already exists (race condition), fetching existing contact...`);
                                            contact = await prisma.contact.findFirst({
                                                where: {
                                                    OR: [
                                                        { facebookId: commenterId },
                                                        { instagramId: commenterId } // Also check instagramId just in case
                                                    ],
                                                    workspaceId: facebookPage.workspaceId
                                                }
                                            });
                                        } else {
                                            throw error;
                                        }
                                    }
                                }

                                if (!contact) {
                                    console.error(`❌ Could not find or create contact for commenter: ${commenterId}`);
                                    continue;
                                }

                                // Check if contact is blocked - skip processing if blocked
                                if (contact.isBlocked) {
                                    console.log(`🚫 [BLOCKED] Contact ${contact.id} (${contact.name}) is blocked. Ignoring comment.`);
                                    continue; // Skip this comment
                                }

                                // Find or create conversation for this post
                                // NOTE: Removed postId from query as it's not in the schema
                                let conversation = await prisma.conversation.findFirst({
                                    where: {
                                        contactId: contact.id,
                                        workspaceId: facebookPage.workspaceId
                                    }
                                });

                                if (!conversation) {
                                    conversation = await prisma.conversation.create({
                                        data: {
                                            contactId: contact.id,
                                            workspaceId: facebookPage.workspaceId,
                                            channel: isInstagram ? 'INSTAGRAM_COMMENT' : 'FACEBOOK_COMMENT',
                                            status: 'OPEN',
                                            // postId field removed
                                            lastMessageAt: new Date()
                                        }
                                    });
                                    console.log(`✅ Created conversation for comment thread`);
                                }

                                // Save message
                                await prisma.message.create({
                                    data: {
                                        conversationId: conversation.id,
                                        content: commentText,
                                        isFromContact: true,
                                        messageType: 'TEXT',
                                        facebookMessageId: commentId,
                                        createdAt: new Date()
                                    }
                                });

                                // Update conversation lastMessageAt
                                await prisma.conversation.update({
                                    where: { id: conversation.id },
                                    data: {
                                        lastMessageAt: new Date(),
                                        unreadCount: { increment: 1 }
                                    }
                                });

                                console.log(`✅ Comment saved to database: ${commentId}`);
                            } catch (dbError) {
                                console.error('❌ Failed to save comment to database:', dbError);
                            }

                            // Emit WebSocket event for real-time comment updates (workspace-specific)
                            try {
                                emitToWorkspace(facebookPage.workspaceId, 'new_comment', {
                                    workspaceId: facebookPage.workspaceId,
                                    pageId: facebookPage.pageId,
                                    postId: postId,
                                    commentId: commentId,
                                    from: changeValue.from,
                                    message: commentText,
                                    createdTime: new Date().toISOString()
                                });
                            } catch (socketError) {
                                console.error('Socket emit error:', socketError);
                            }

                            // Check if comment bot is assigned to this channel
                            const commentBotId = isInstagram ? facebookPage.instagramCommentBotId : facebookPage.commentBotId;

                            if (!commentBotId) {
                                console.log(`ℹ️ [COMMENTS] No ${isInstagram ? 'Instagram' : 'Facebook'} comment bot assigned - skipping auto-reply`);
                            } else {
                                try {
                                    const { getAutoReply } = await import('./ai.controller.js');
                                    console.log(`🤖 [COMMENTS] Calling getAutoReply for workspace: ${facebookPage.workspaceId}, pageId: ${facebookPage.pageId}`);

                                    // Pass pageId so AI controller can find the assigned comment bot
                                    const aiResponse = await getAutoReply(
                                        facebookPage.workspaceId,
                                        null,
                                        commentText,
                                        isInstagram ? 'instagram' : 'facebook',
                                        'COMMENTS',
                                        isInstagram ? facebookPage.instagramBusinessId : facebookPage.pageId
                                    );

                                    console.log(`🤖 [COMMENTS] AI Response: ${aiResponse ? aiResponse.substring(0, 100) : 'NULL'}`);

                                    if (aiResponse) {
                                        await axios.post(
                                            `https://graph.facebook.com/${GRAPH_API_VERSION}/${commentId}/comments`,
                                            { message: aiResponse },
                                            { params: { access_token: facebookPage.pageAccessToken } }
                                        );
                                        console.log('✅ AI Comment Reply posted successfully!');
                                    } else {
                                        console.log('⚠️ [COMMENTS] No AI response generated');
                                    }
                                } catch (aiError) {
                                    console.error('❌ AI Comment Reply failed:', aiError.message);
                                    console.error('❌ AI Comment Reply stack:', aiError.stack);
                                }
                            }
                        } else {
                            console.log(`ℹ️ [COMMENTS] Skipping - comment from page itself or missing commenter ID`);
                        }
                    }
                } // End of for (const facebookPage of allConnectedPagesForComments)
                continue; // Don't process as messaging event
            }

            // --- HANDLE LEADGEN EVENTS ---
            if (changeEvent && changeEvent.field === 'leadgen') {
                await handleLeadgenEvent(changeEvent.value, entry.id);
                continue;
            }

            // --- HANDLE MESSAGING EVENTS (DMs) ---
            if (!messagingEvent) {
                console.log('⚠️ No messaging event found in entry');
                continue;
            }

            // DEBUG: Log all messaging event types
            const eventTypes = [];
            if (messagingEvent.message) eventTypes.push('message');
            if (messagingEvent.delivery) eventTypes.push('delivery');
            if (messagingEvent.read) eventTypes.push('read');
            if (messagingEvent.postback) eventTypes.push('postback');
            if (messagingEvent.referral) eventTypes.push('referral');
            console.log(`📎 Webhook Event Type: messaging [${eventTypes.join(', ') || 'unknown'}]`);

            // --- HANDLE DELIVERY RECEIPTS ---
            if (messagingEvent.delivery) {
                console.log('📬 Delivery receipt received');
                const mids = messagingEvent.delivery.mids || [];
                for (const mid of mids) {
                    try {
                        const updated = await prisma.message.updateMany({
                            where: { facebookMessageId: mid, status: 'SENT' },
                            data: { status: 'DELIVERED' }
                        });
                        if (updated.count > 0) {
                            console.log(`✅ Message ${mid} marked as DELIVERED`);

                            // Get message for socket event with workspace info
                            const updatedMessage = await prisma.message.findFirst({
                                where: { facebookMessageId: mid },
                                select: {
                                    id: true,
                                    conversationId: true,
                                    conversation: { select: { workspaceId: true } }
                                }
                            });

                            if (updatedMessage && updatedMessage.conversation?.workspaceId) {
                                emitToWorkspace(updatedMessage.conversation.workspaceId, 'message_status', {
                                    messageId: mid,
                                    dbMessageId: updatedMessage.id,
                                    conversationId: updatedMessage.conversationId,
                                    status: 'DELIVERED'
                                });
                            }
                        }
                    } catch (e) {
                        console.error('Delivery update error:', e);
                    }
                }
                continue;
            }

            // --- HANDLE READ RECEIPTS ---
            if (messagingEvent.read) {
                const watermark = messagingEvent.read.watermark;
                const readSenderId = messagingEvent.sender?.id; // Who read the message (the contact)

                console.log(`👁️ Read receipt received - Sender: ${readSenderId}, Watermark: ${watermark}`);

                try {
                    // Find conversations for this contact (who read the messages)
                    const contactConversations = await prisma.conversation.findMany({
                        where: {
                            contact: {
                                facebookId: readSenderId
                            }
                        },
                        select: { id: true, workspaceId: true }
                    });

                    if (contactConversations.length === 0) {
                        console.log(`⚠️ No conversations found for contact ${readSenderId}`);
                        continue;
                    }

                    const conversationIds = contactConversations.map(c => c.id);

                    // Find and update messages in these conversations sent before watermark
                    const messagesToUpdate = await prisma.message.findMany({
                        where: {
                            conversationId: { in: conversationIds },
                            isFromContact: false,
                            status: { in: ['SENT', 'DELIVERED'] },
                            createdAt: { lte: new Date(watermark) }
                        },
                        select: {
                            id: true,
                            conversationId: true,
                            facebookMessageId: true,
                            conversation: { select: { workspaceId: true } }
                        }
                    });

                    if (messagesToUpdate.length > 0) {
                        await prisma.message.updateMany({
                            where: { id: { in: messagesToUpdate.map(m => m.id) } },
                            data: { status: 'READ' }
                        });

                        console.log(`✅ ${messagesToUpdate.length} messages marked as READ for contact ${readSenderId}`);

                        // Emit socket events for each message to its workspace
                        for (const msg of messagesToUpdate) {
                            if (msg.conversation?.workspaceId) {
                                emitToWorkspace(msg.conversation.workspaceId, 'message_status', {
                                    messageId: msg.facebookMessageId,
                                    dbMessageId: msg.id,
                                    conversationId: msg.conversationId,
                                    status: 'READ'
                                });
                            }
                        }
                    } else {
                        console.log(`ℹ️ No unread messages to update for contact ${readSenderId}`);
                    }
                } catch (e) {
                    console.error('Read update error:', e);
                }
                continue;
            }

            const message = messagingEvent.message;
            const senderId = messagingEvent.sender.id;
            // For Instagram, use entry.id as recipient (Instagram Business Account ID)
            // For Facebook, use recipient.id (Page ID)
            const recipientId = body.object === 'instagram' ? entry.id : messagingEvent.recipient.id;

            console.log(`📩 [Webhook] Object: ${body.object}, Sender: ${senderId}, Recipient: ${recipientId}, Entry ID: ${entry.id}, Messaging Recipient: ${messagingEvent.recipient?.id}`);

            // Determine if this is an outgoing message (sent by business)
            // For Facebook: is_echo flag is reliable
            // For Instagram: is_echo is NOT supported in Business API, so we check senderId === entry.id
            // BUT: if message has is_echo = false explicitly, trust it (customer message)
            // ALSO: if senderId === entry.id but recipient.id === entry.id too, that's a self-message edge case - treat as outgoing
            const isExplicitEcho = message?.is_echo === true;
            const isInstagramOutgoing = body.object === 'instagram' &&
                senderId === entry.id &&
                messagingEvent.recipient?.id !== entry.id; // recipient must be different (the customer)
            const isOutgoingMessage = isExplicitEcho || isInstagramOutgoing;

            if (isOutgoingMessage) {
                console.log('📤 [Webhook] Outgoing message detected - will save as sent message');
            }

            // Acquire processing lock to prevent duplicate processing
            // Use message.mid if available, otherwise create a unique key from sender + timestamp
            const lockKey = message?.mid || `${senderId}_${messagingEvent.timestamp || Date.now()}`;

            if (!acquireMessageLock(lockKey)) {
                console.log(`🔒 [${body.object === 'instagram' ? 'Instagram' : 'Facebook'}] Message ${lockKey} already being processed, skipping`);
                continue;
            }

            // Check for duplicate message (retries)
            if (message?.mid) {
                const existingMessage = await prisma.message.findUnique({
                    where: { facebookMessageId: message.mid }
                });
                if (existingMessage) {
                    console.log('♻️ Skipping duplicate message:', message.mid);
                    releaseMessageLock(lockKey);
                    continue;
                }
            }

            // For Instagram, also try to match using messaging recipient
            const messagingRecipientId = messagingEvent.recipient?.id;

            // Find ALL workspaces that have this Facebook page or Instagram account connected
            // Try multiple ID matches for better compatibility
            const allConnectedPagesRaw = await prisma.facebookPage.findMany({
                where: {
                    OR: [
                        { pageId: recipientId },
                        { instagramBusinessId: recipientId },
                        // Also try messaging recipient ID (for Instagram)
                        ...(messagingRecipientId && messagingRecipientId !== recipientId ? [
                            { pageId: messagingRecipientId },
                            { instagramBusinessId: messagingRecipientId }
                        ] : []),
                        // Also try entry.id directly
                        ...(entry.id && entry.id !== recipientId ? [
                            { pageId: entry.id },
                            { instagramBusinessId: entry.id }
                        ] : [])
                    ]
                }
            });

            // DEDUPLICATION: OR sorgusu aynı kaydı birden fazla kez döndürebilir, ID bazında tekilleştir
            const seenPageIds = new Set();
            const allConnectedPages = allConnectedPagesRaw.filter(p => {
                if (seenPageIds.has(p.id)) return false;
                seenPageIds.add(p.id);
                return true;
            });

            if (allConnectedPages.length === 0) {
                console.log(`Page/Instagram ${recipientId} not found in any workspace`);
                console.log(`📋 Tried IDs: recipientId=${recipientId}, messagingRecipientId=${messagingRecipientId}, entryId=${entry.id}`);

                // Debug: Show all connected pages in database
                const allPages = await prisma.facebookPage.findMany({
                    select: {
                        id: true,
                        pageId: true,
                        pageName: true,
                        instagramBusinessId: true,
                        instagramUsername: true,
                        workspaceId: true
                    }
                });
                console.log('📋 All pages in database:', JSON.stringify(allPages, null, 2));

                releaseMessageLock(lockKey);
                continue;
            }

            if (allConnectedPagesRaw.length !== allConnectedPages.length) {
                console.log(`⚠️ [Dedup] Removed ${allConnectedPagesRaw.length - allConnectedPages.length} duplicate page record(s) from query results`);
            }

            console.log(`📦 Found ${allConnectedPages.length} workspace(s) with this page connected`);

            // Process message for EACH workspace that has this page connected
            for (const facebookPage of allConnectedPages) {
                console.log(`🔄 Processing for workspace: ${facebookPage.workspaceId}`);

                const isInstagram = body.object === 'instagram' || recipientId === facebookPage.instagramBusinessId;

                // 🚫 EARLY CHECK: Ignore Instagram Lead Form DMs BEFORE creating contact/conversation
                if (isInstagram && message?.text && !isOutgoingMessage) {
                    const messageText = message.text;
                    const isLeadFormDM = messageText.includes('Full name:') &&
                        (messageText.includes('Phone number:') || messageText.includes('Email:'));

                    if (isLeadFormDM) {
                        console.log('🚫 [Instagram] Lead form DM detected (EARLY CHECK), skipping workspace processing');
                        console.log(`📋 [Instagram] Message preview: ${messageText.substring(0, 100)}...`);
                        continue; // Skip to next workspace
                    }
                }

                const platformBotId = isInstagram ? facebookPage.instagramBotId : facebookPage.assignedBotId;

                // For outgoing messages, the contact is the recipient, not the sender
                // For incoming messages, the contact is the sender
                const contactFacebookId = isOutgoingMessage ? messagingEvent.recipient.id : senderId;

                // Find or create contact
                let contact = await prisma.contact.findUnique({
                    where: { facebookId: contactFacebookId }
                });

                if (!contact) {
                    // Fetch user info from Facebook/Instagram
                    let userName = null;
                    let avatarUrl = null;

                    try {
                        if (isInstagram) {
                            // Instagram: Get username from user endpoint
                            const response = await axios.get(
                                `https://graph.facebook.com/${GRAPH_API_VERSION}/${contactFacebookId}`,
                                {
                                    params: {
                                        fields: 'username,name,profile_pic',
                                        access_token: facebookPage.pageAccessToken
                                    }
                                }
                            );
                            userName = response.data.name || response.data.username;
                            avatarUrl = response.data.profile_pic;
                        } else {
                            // Facebook Messenger: Try multiple approaches
                            // Approach 1: Direct user endpoint with name field
                            try {
                                const response = await axios.get(
                                    `https://graph.facebook.com/${GRAPH_API_VERSION}/${contactFacebookId}`,
                                    {
                                        params: {
                                            fields: 'name,first_name,last_name',
                                            access_token: facebookPage.pageAccessToken
                                        }
                                    }
                                );
                                userName = response.data.name ||
                                    (response.data.first_name && response.data.last_name
                                        ? `${response.data.first_name} ${response.data.last_name}`
                                        : response.data.first_name);
                                console.log(`✅ [FB User API] Got name: "${userName}" for ${contactFacebookId}`);
                            } catch (userApiError) {
                                console.log(`⚠️ [FB User API] Failed for ${contactFacebookId}: ${userApiError.message}`);

                                // Approach 2: Try Conversations API to get participant info
                                try {
                                    const convoResponse = await axios.get(
                                        `https://graph.facebook.com/${GRAPH_API_VERSION}/${facebookPage.pageId}/conversations`,
                                        {
                                            params: {
                                                fields: 'participants',
                                                user_id: contactFacebookId,
                                                access_token: facebookPage.pageAccessToken
                                            }
                                        }
                                    );

                                    if (convoResponse.data?.data?.[0]?.participants?.data) {
                                        const participant = convoResponse.data.data[0].participants.data.find(
                                            p => p.id === contactFacebookId
                                        );
                                        if (participant?.name) {
                                            userName = participant.name;
                                            console.log(`✅ [FB Conversations API] Got name: "${userName}" for ${contactFacebookId}`);
                                        }
                                    }
                                } catch (convoError) {
                                    console.log(`⚠️ [FB Conversations API] Failed: ${convoError.message}`);
                                }
                            }

                            // Get avatar URL for Facebook - try to fetch actual profile pic
                            if (!avatarUrl) {
                                try {
                                    // Try to get profile picture URL (redirect=false returns JSON with url)
                                    const picResponse = await axios.get(
                                        `https://graph.facebook.com/${GRAPH_API_VERSION}/${contactFacebookId}/picture`,
                                        {
                                            params: {
                                                type: 'large',
                                                redirect: 'false',
                                                access_token: facebookPage.pageAccessToken
                                            }
                                        }
                                    );
                                    if (picResponse.data?.data?.url) {
                                        avatarUrl = picResponse.data.data.url;
                                        console.log(`✅ [FB Avatar] Got picture URL for ${contactFacebookId}`);
                                    }
                                } catch (picError) {
                                    console.log(`⚠️ [FB Avatar] Could not get picture for ${contactFacebookId}`);
                                }
                            }
                        }
                    } catch (error) {
                        console.error('Error fetching user info:', error.response?.data || error.message);
                    }

                    // Create contact with best available name
                    const finalName = userName || `Facebook User`;

                    // If no avatar from API, use UI-Avatars fallback
                    if (!avatarUrl) {
                        avatarUrl = getAvatarFallback(finalName);
                    }

                    console.log(`👤 [Contact Create] ID: ${contactFacebookId}, Name: "${finalName}"`);

                    contact = await prisma.contact.create({
                        data: {
                            workspaceId: facebookPage.workspaceId,
                            facebookId: contactFacebookId,
                            name: finalName,
                            avatar: avatarUrl
                        }
                    });
                } else {
                    // Contact exists - check if it has a placeholder name that needs syncing from Meta
                    const currentName = contact.name || '';
                    const isPlaceholder = currentName.startsWith('User ') ||
                        currentName.startsWith('Facebook ') ||
                        !currentName ||
                        /^\d+$/.test(currentName); // Only digits = ID as name

                    if (isPlaceholder) {
                        console.log(`🔍 [FB Name Sync] Placeholder detected: "${currentName}" for ${senderId}`);

                        let metaName = null;
                        let avatarUrl = contact.avatar;

                        try {
                            if (isInstagram) {
                                const response = await axios.get(
                                    `https://graph.facebook.com/${GRAPH_API_VERSION}/${senderId}`,
                                    {
                                        params: {
                                            fields: 'username,name,profile_pic',
                                            access_token: facebookPage.pageAccessToken
                                        }
                                    }
                                );
                                metaName = response.data.name || response.data.username;
                                avatarUrl = response.data.profile_pic || avatarUrl;
                            } else {
                                // Facebook Messenger
                                try {
                                    const response = await axios.get(
                                        `https://graph.facebook.com/${GRAPH_API_VERSION}/${senderId}`,
                                        {
                                            params: {
                                                fields: 'name,first_name,last_name',
                                                access_token: facebookPage.pageAccessToken
                                            }
                                        }
                                    );
                                    metaName = response.data.name ||
                                        (response.data.first_name && response.data.last_name
                                            ? `${response.data.first_name} ${response.data.last_name}`
                                            : response.data.first_name);
                                } catch (userApiError) {
                                    // Try Conversations API
                                    try {
                                        const convoResponse = await axios.get(
                                            `https://graph.facebook.com/${GRAPH_API_VERSION}/${facebookPage.pageId}/conversations`,
                                            {
                                                params: {
                                                    fields: 'participants',
                                                    user_id: senderId,
                                                    access_token: facebookPage.pageAccessToken
                                                }
                                            }
                                        );

                                        if (convoResponse.data?.data?.[0]?.participants?.data) {
                                            const participant = convoResponse.data.data[0].participants.data.find(
                                                p => p.id === senderId
                                            );
                                            if (participant?.name) {
                                                metaName = participant.name;
                                            }
                                        }
                                    } catch (convoError) {
                                        // Silent fail - keep existing name
                                    }
                                }

                                // Try to get profile picture
                                if (!avatarUrl || avatarUrl.includes('ui-avatars')) {
                                    try {
                                        const picResponse = await axios.get(
                                            `https://graph.facebook.com/${GRAPH_API_VERSION}/${senderId}/picture`,
                                            {
                                                params: {
                                                    type: 'large',
                                                    redirect: 'false',
                                                    access_token: facebookPage.pageAccessToken
                                                }
                                            }
                                        );
                                        if (picResponse.data?.data?.url) {
                                            avatarUrl = picResponse.data.data.url;
                                        }
                                    } catch (picError) {
                                        // Use UI-Avatars if no FB picture
                                        if (metaName) {
                                            avatarUrl = getAvatarFallback(metaName);
                                        }
                                    }
                                }
                            }

                            if (metaName && metaName !== currentName) {
                                contact = await prisma.contact.update({
                                    where: { id: contact.id },
                                    data: {
                                        name: metaName,
                                        avatar: avatarUrl
                                    }
                                });
                                console.log(`✅ [FB Sync] Updated: "${currentName}" → "${metaName}"`);
                            }
                        } catch (err) {
                            console.error('❌ [FB Name Sync Error]:', err.message);
                        }
                    }
                }

                // Check if contact is blocked - skip processing if blocked
                if (contact.isBlocked && !isOutgoingMessage) {
                    console.log(`🚫 [BLOCKED] Contact ${contact.id} (${contact.name}) is blocked. Ignoring incoming message.`);
                    continue; // Skip this message, move to next workspace
                }

                // Find or create conversation - always use existing for same contact+channel
                let conversation = await prisma.conversation.findFirst({
                    where: {
                        contactId: contact.id,
                        workspaceId: facebookPage.workspaceId,
                        ...(isInstagram ? { instagramBusinessId: facebookPage.instagramBusinessId } : { facebookPageId: facebookPage.id })
                    },
                    orderBy: { lastMessageAt: 'desc' }
                });

                // 24 saat birleştirme: Aynı contact için herhangi bir kanaldan son 24 saatte açık konuşma ara
                if (!conversation) {
                    const mergeWindow = new Date(Date.now() - 24 * 60 * 60 * 1000);
                    conversation = await prisma.conversation.findFirst({
                        where: {
                            contactId: contact.id,
                            workspaceId: facebookPage.workspaceId,
                            lastMessageAt: { gte: mergeWindow },
                            status: { not: 'RESOLVED' }
                        },
                        orderBy: { lastMessageAt: 'desc' }
                    });
                    if (conversation) {
                        console.log(`🔗 [FB/IG Merge] Reusing existing ${conversation.channel} conversation ${conversation.id} (within 24h)`);
                        // Facebook/Instagram bilgilerini güncelle
                        const updateData = { facebookPageId: facebookPage.id };
                        if (isInstagram) updateData.instagramBusinessId = facebookPage.instagramBusinessId;
                        if (!conversation.facebookPageId) {
                            updateData.channel = isInstagram ? 'INSTAGRAM' : 'FACEBOOK';
                        }
                        conversation = await prisma.conversation.update({
                            where: { id: conversation.id },
                            data: updateData
                        });
                    }
                }

                let isNewConversation = false;
                if (!conversation) {
                    isNewConversation = true;
                    conversation = await prisma.conversation.create({
                        data: {
                            contactId: contact.id,
                            workspaceId: facebookPage.workspaceId,
                            facebookPageId: facebookPage.id,
                            instagramBusinessId: isInstagram ? facebookPage.instagramBusinessId : null,
                            status: 'OPEN',
                            channel: isInstagram ? 'INSTAGRAM' : 'FACEBOOK',
                            assignedBotId: platformBotId,
                            botEnabled: true // Varsayılan olarak bot aktif
                        }
                    });

                    // 🚀 Yeni konuşma için kanal yönlendirmesini uygula
                    const channelType = isInstagram ? 'INSTAGRAM' : 'FACEBOOK';
                    console.log(`📡 [Webhook] Applying channel routing for new ${channelType} conversation...`);
                    const routingResult = await applyChannelRouting(
                        facebookPage.workspaceId,
                        conversation.id,
                        channelType,
                        true
                    );
                    if (routingResult) {
                        // Güncellenmiş conversation'ı al
                        conversation = await prisma.conversation.findUnique({
                            where: { id: conversation.id },
                            include: { contact: true }
                        });
                        console.log(`📡 [Webhook] ✅ Routing applied: Team=${routingResult.teamName}, BotDelay=${routingResult.botDelayedUntil}`);
                    }

                    // 🔄 Flow Engine: FIRST_MSG trigger for new FB/IG conversations
                    try {
                        const { executeFlowsByTrigger } = await import('./flow.controller.js');
                        await executeFlowsByTrigger(facebookPage.workspaceId, 'FIRST_MSG', {
                            contact,
                            conversation
                        });
                    } catch (flowErr) {
                        console.error('⚠️ [FLOW] FIRST_MSG trigger error:', flowErr.message);
                    }
                } else {
                    // Mevcut konuşma - güncelle
                    const updateData = {};
                    if (conversation.status === 'RESOLVED') {
                        updateData.status = 'OPEN';
                    }
                    if (!conversation.assignedBotId && platformBotId) {
                        updateData.assignedBotId = platformBotId;
                    }
                    if (!conversation.facebookPageId) {
                        updateData.facebookPageId = facebookPage.id;
                    }
                    if (Object.keys(updateData).length > 0) {
                        conversation = await prisma.conversation.update({
                            where: { id: conversation.id },
                            data: updateData
                        });
                    }

                    // 🚀 Mevcut konuşma için de yönlendirme kurallarını uygula (her yeni mesajda bot gecikmesini yenile)
                    // Sadece agent atanmamışsa ve bot aktifse
                    if (!conversation.assignedToId && conversation.botEnabled !== false) {
                        const channelType = isInstagram ? 'INSTAGRAM' : 'FACEBOOK';
                        console.log(`📡 [Webhook] Re-applying routing for existing ${channelType} conversation...`);
                        const routingResult = await applyChannelRouting(
                            facebookPage.workspaceId,
                            conversation.id,
                            channelType,
                            false // mevcut konuşma
                        );
                        if (routingResult) {
                            conversation = await prisma.conversation.findUnique({
                                where: { id: conversation.id },
                                include: { contact: true }
                            });
                            console.log(`📡 [Webhook] ✅ Routing re-applied for existing conv: Team=${routingResult.teamName}, BotDelay=${routingResult.botDelayedUntil}`);
                        }
                    }
                }

                // Create message
                // Skip saving echo messages if they're already in the database (bot or manual send already saved them)
                if (message?.text) {
                    // For outgoing messages (echoes), check if already saved
                    if (isOutgoingMessage) {
                        // Check by Facebook message ID first
                        if (message.mid) {
                            const existingByMid = await prisma.message.findUnique({
                                where: { facebookMessageId: message.mid }
                            });
                            if (existingByMid) {
                                console.log(`⏭️ [${isInstagram ? 'Instagram' : 'Facebook'}] Echo message already saved (by mid), skipping`);
                                releaseMessageLock(lockKey);
                                continue;
                            }
                        }

                        // Also check by content + conversation + time (for race conditions)
                        const tenSecondsAgo = new Date(Date.now() - 10000);
                        const existingByContent = await prisma.message.findFirst({
                            where: {
                                conversationId: conversation.id,
                                content: message.text,
                                isFromContact: false,
                                createdAt: { gte: tenSecondsAgo }
                            }
                        });
                        if (existingByContent) {
                            console.log(`⏭️ [${isInstagram ? 'Instagram' : 'Facebook'}] Echo message already saved (by content), skipping`);
                            // Update the existing message with Facebook message ID if missing
                            if (!existingByContent.facebookMessageId && message.mid) {
                                await prisma.message.update({
                                    where: { id: existingByContent.id },
                                    data: { facebookMessageId: message.mid }
                                });
                            }
                            releaseMessageLock(lockKey);
                            continue;
                        }
                    }

                    const newMessage = await prisma.message.create({
                        data: {
                            content: message.text,
                            conversationId: conversation.id,
                            isFromContact: !isOutgoingMessage, // false if sent by business, true if from customer
                            facebookMessageId: message.mid,
                            messageType: isInstagram ? 'INSTAGRAM' : 'TEXT',
                            senderId: isOutgoingMessage ? null : undefined // Explicitly null for bot/echo messages
                        }
                    });

                    // Update conversation last message time and unread count (only increment unread for incoming messages)
                    await prisma.conversation.update({
                        where: { id: conversation.id },
                        data: {
                            lastMessageAt: new Date(),
                            ...(isOutgoingMessage ? {} : { unreadCount: { increment: 1 } })
                        }
                    });

                    // Reset follow-up flags when customer responds (not for outgoing messages)
                    if (!isOutgoingMessage) {
                        try {
                            const { resetFollowUpFlags } = await import('../services/followUp.service.js');
                            await resetFollowUpFlags(conversation.id);
                        } catch (e) { /* ignore */ }
                    }

                    // Emit WebSocket event for real-time update (workspace-specific)
                    try {
                        const messageChannel = isInstagram ? 'INSTAGRAM' : 'FACEBOOK';
                        emitToWorkspace(facebookPage.workspaceId, 'new_message', {
                            workspaceId: facebookPage.workspaceId,
                            conversationId: conversation.id,
                            message: newMessage,
                            contact: contact,
                            channel: messageChannel
                        });
                        console.log(`✅ WebSocket event emitted for new ${messageChannel} message to workspace ${facebookPage.workspaceId}`);
                    } catch (error) {
                        console.error('❌ Error emitting WebSocket event:', error);
                    }

                    // --- AUTOMATION RULES + AUTO-CALL (run before AI reply to avoid being skipped by continue) ---
                    if (!isOutgoingMessage && message?.text) {
                        // Automation rules: phone capture (awaited so status is updated before auto-call)
                        try {
                            const { executePhoneCaptureRule, executeHotKeywordRule } = await import('./rules.controller.js');
                            // IMPORTANT: await phone capture so contact.status is updated before auto-call status check
                            await executePhoneCaptureRule(facebookPage.workspaceId, conversation.id, message.text);
                            executeHotKeywordRule(facebookPage.workspaceId, conversation.id, message.text).catch(e =>
                                console.error('❌ [RULE:HOT_KEYWORD] FB/IG async error:', e.message)
                            );
                        } catch (ruleErr) {
                            console.error('❌ [RULES] FB/IG error:', ruleErr.message);
                        }

                        // --- CHAT CALL DETECTION (beni ara / saat X'de ara) ---
                        try {
                            const { detectCallRequestInMessage, triggerAutoCall } = await import('./retell.controller.js');
                            const callIntent = detectCallRequestInMessage(message.text);
                            if (callIntent && contact?.phone) {
                                if (callIntent.type === 'immediate') {
                                    console.log(`📞 [FB] Chat call request (immediate) for ${contact.phone}`);
                                    triggerAutoCall(facebookPage.workspaceId, contact.phone, contact?.id, contact?.name || 'Müşteri', 'CHAT_REQUEST', message.text).catch(e =>
                                        console.error('⚠️ [FB] Chat immediate call error:', e.message)
                                    );
                                } else if (callIntent.type === 'scheduled') {
                                    const nearby = await prisma.scheduledCall.count({
                                        where: { workspaceId: facebookPage.workspaceId, status: 'PENDING', scheduledAt: { gte: callIntent.scheduledAt, lt: new Date(callIntent.scheduledAt.getTime() + 60 * 60 * 1000) } }
                                    });
                                    const finalAt = new Date(callIntent.scheduledAt.getTime() + nearby * 60 * 1000);
                                    await prisma.scheduledCall.create({
                                        data: { workspaceId: facebookPage.workspaceId, toNumber: contact.phone, contactId: contact.id, contactName: contact.name, scheduledAt: finalAt, status: 'PENDING' }
                                    });
                                    console.log(`📅 [FB] Scheduled call created at ${finalAt.toLocaleString('tr-TR')}`);
                                }
                            } else {
                                // Fallback: original phone-number extraction based auto-call
                                const phoneRegex = /(?:\+90|0090|90)?[\s\-\.(]?(?:5\d{2})[\s\-\.\)]{0,2}\d{3}[\s\-\.]{0,2}\d{2}[\s\-\.]{0,2}\d{2}/g;
                                const matches = message.text.match(phoneRegex);
                                if (matches && matches.length > 0) {
                                    const rawPhone = matches[0];
                                    const digits = rawPhone.replace(/\D/g, '');
                                    const normalizedPhone = digits.startsWith('90') ? '+' + digits :
                                        digits.startsWith('0') ? '+90' + digits.slice(1) : '+90' + digits;
                                    const triggerChan = isInstagram ? 'INSTAGRAM' : 'FACEBOOK';
                                    triggerAutoCall(facebookPage.workspaceId, normalizedPhone, contact?.id, contact?.name || 'Müşteri', triggerChan, message.text)
                                        .catch(e => console.error('❌ [AutoCall] FB/IG phone trigger error:', e.message));
                                }
                            }
                        } catch (acErr) {
                            console.error('❌ [AutoCall] FB/IG detection error:', acErr.message);
                        }

                    }
                    // --- AUTOMATION RULES + AUTO-CALL END ---

                    // --- AI AUTO REPLY START ---
                    // ONLY for incoming messages (from contact)
                    if (!isOutgoingMessage) {
                        // 🛡️ Bot-to-bot loop koruması: Gönderen başka bir Instomer sayfasıysa bot cevabı verme
                        const senderIsInstomerPage = await prisma.facebookPage.findFirst({
                            where: {
                                OR: [
                                    { pageId: senderId },
                                    { instagramBusinessId: senderId }
                                ]
                            },
                            select: { id: true, pageName: true, workspaceId: true }
                        });
                        if (senderIsInstomerPage) {
                            console.log(`🔄 [Bot-Loop] Sender ${senderId} is Instomer page "${senderIsInstomerPage.pageName}" (ws: ${senderIsInstomerPage.workspaceId}). Skipping AI reply to prevent bot-to-bot loop.`);
                        } else {
                            try {
                                // First check if there's a bot assigned to this channel
                                const channelBotId = isInstagram ? facebookPage.instagramBotId : facebookPage.assignedBotId;

                            if (!channelBotId) {
                                console.log(`ℹ️ [${isInstagram ? 'Instagram' : 'Facebook'}] No bot assigned to channel - Manual mode active, skipping AI reply`);
                            } else if (conversation.botEnabled === false) {
                                // Check if bot is disabled for this specific conversation
                                console.log(`🚫 [${isInstagram ? 'Instagram' : 'Facebook'}] Bot disabled for this conversation - skipping AI reply`);
                            } else {
                                const { getAutoReply } = await import('./ai.controller.js');
                                const { scheduleAutoReplyCheck } = await import('../services/autoReplyDelay.service.js');

                                // Check if bot has delay enabled
                                const assignedBot = await prisma.aIBot.findFirst({
                                    where: {
                                        OR: [
                                            { id: conversation.assignedBotId || 'none' },
                                            { id: channelBotId || 'none' }
                                        ]
                                    }
                                });

                                if (assignedBot?.autoReplyDelayEnabled) {
                                    // Schedule delayed auto-reply check
                                    console.log(`⏱️ [${isInstagram ? 'Instagram' : 'Facebook'}] Bot has delay enabled (${assignedBot.autoReplyDelaySeconds}s), scheduling check`);
                                    scheduleAutoReplyCheck(conversation.id, facebookPage.workspaceId, isInstagram ? 'instagram' : 'facebook', message.text);
                                } else {
                                    const aiResponse = await getAutoReply(
                                        facebookPage.workspaceId,
                                        conversation.id,
                                        message.text,
                                        isInstagram ? 'instagram' : 'facebook',
                                        'CHATS'
                                    );

                                    if (aiResponse) {
                                        // 🛡️ RACE CONDITION PROTECTION: Content-based duplicate detection
                                        // Ensures identical AI replies are not sent multiple times if concurrent webhooks fire.
                                        const fiveSecondsAgo2 = new Date(Date.now() - 5000);
                                        const duplicateContent = await prisma.message.findFirst({
                                            where: {
                                                conversationId: conversation.id,
                                                content: aiResponse,
                                                isFromContact: false,
                                                createdAt: { gte: fiveSecondsAgo2 }
                                            }
                                        });

                                        if (duplicateContent) {
                                            console.log(`⏭️ [${isInstagram ? 'Instagram' : 'Facebook'}] Duplicate content detected - same AI response already sent, skipping`);
                                            continue;
                                        }
                                            // --- META 1000 CHARACTER LIMIT FIX ---
                                            // Split message if > 950 characters
                                            const chunks = [];
                                            let currentText = aiResponse;
                                            while (currentText.length > 0) {
                                                if (currentText.length <= 950) {
                                                    chunks.push(currentText);
                                                    break;
                                                }
                                                let breakPoint = currentText.lastIndexOf('\n', 950);
                                                if (breakPoint === -1) breakPoint = currentText.lastIndexOf('. ', 950);
                                                if (breakPoint === -1) breakPoint = currentText.lastIndexOf(' ', 950);
                                                if (breakPoint === -1) breakPoint = 950;
                                                
                                                chunks.push(currentText.substring(0, breakPoint + 1).trim());
                                                currentText = currentText.substring(breakPoint + 1).trim();
                                            }

                                            let sentMessageId = null;
                                            for (let i = 0; i < chunks.length; i++) {
                                                const sendResponse = await axios.post(
                                                    `https://graph.facebook.com/${GRAPH_API_VERSION}/me/messages`,
                                                    {
                                                        recipient: { id: String(senderId) },
                                                        message: { text: chunks[i] }
                                                    },
                                                    {
                                                        params: { access_token: facebookPage.pageAccessToken }
                                                    }
                                                );
                                                if (i === chunks.length - 1) {
                                                    // Save the ID of the last chunk to associate with our DB record
                                                    sentMessageId = sendResponse.data?.message_id;
                                                }
                                                if (chunks.length > 1 && i < chunks.length - 1) {
                                                    // Add 500ms delay between chunks to ensure they arrive in order
                                                    await new Promise(r => setTimeout(r, 500));
                                                }
                                            }
                                            let botMessage;

                                            // 🚀 RACE CONDITION HANDLING:
                                            // Check if Echo Webhook already saved this message while we were waiting for axios
                                            if (sentMessageId) {
                                                botMessage = await prisma.message.findUnique({
                                                    where: { facebookMessageId: sentMessageId }
                                                });
                                                if (botMessage) {
                                                    console.log(`ℹ️ [${isInstagram ? 'Instagram' : 'Facebook'}] Message already saved by webhook (race condition), usage existing DB record.`);
                                                }
                                            }

                                            if (!botMessage) {
                                                try {
                                                    // Save to DB (as outgoing message)
                                                    botMessage = await prisma.message.create({
                                                        data: {
                                                            content: aiResponse,
                                                            conversationId: conversation.id,
                                                            isFromContact: false, // Outgoing
                                                            messageType: isInstagram ? 'INSTAGRAM' : 'TEXT',
                                                            senderId: null, // System/Bot
                                                            facebookMessageId: sentMessageId || null,
                                                            status: 'SENT' // Initial status
                                                        }
                                                    });
                                                } catch (dbError) {
                                                    // If unique constraint failed (race condition between findUnique and create), try to find it again
                                                    if (dbError.code === 'P2002' && sentMessageId) {
                                                        console.log(`ℹ️ [${isInstagram ? 'Instagram' : 'Facebook'}] Constraint failed, fetching existing record...`);
                                                        botMessage = await prisma.message.findUnique({
                                                            where: { facebookMessageId: sentMessageId }
                                                        });
                                                    }

                                                    if (!botMessage) {
                                                        console.error('❌ Failed to save bot message:', dbError);
                                                        continue; // Skip emit if we can't get the message
                                                    }
                                                }
                                            }

                                            // Emit Socket for the reply (workspace-specific)
                                            emitToWorkspace(facebookPage.workspaceId, 'new_message', {
                                                workspaceId: facebookPage.workspaceId,
                                                conversationId: conversation.id,
                                                message: botMessage,
                                                contact: contact,
                                                channel: isInstagram ? 'INSTAGRAM' : 'FACEBOOK'
                                            });
                                        }
                                } // Close autoReplyDelayEnabled else
                            } // Close channelBotId else
                        } catch (aiError) {
                            const errorCode = aiError.response?.data?.error?.code;
                            const errorSubcode = aiError.response?.data?.error?.error_subcode;
                            if (errorCode === 100) {
                                console.warn(`⚠️ [${isInstagram ? 'Instagram' : 'Facebook'}] Auto-Reply send failed (code 100, subcode ${errorSubcode}) for workspace ${facebookPage.workspaceId}, conv: ${conversation.id}, recipient: ${senderId}`);

                                // 2534038: Kullanıcı Instagram gizlilik ayarı nedeniyle API mesajını engelliyor
                                // Konuşmaya sistem notu ekle, ekip manuel dönüş yapabilsin
                                if (errorSubcode === 2534038 && isInstagram) {
                                    try {
                                        const systemNote = await prisma.message.create({
                                            data: {
                                                conversationId: conversation.id,
                                                content: '⚠️ Bot bu kullanıcıya otomatik yanıt gönderemedi. Kullanıcının Instagram gizlilik ayarları API üzerinden mesajı engelliyor (hata 2534038). Lütfen manuel dönüş yapın.',
                                                isFromContact: false,
                                                messageType: 'TEXT',
                                                senderId: null,
                                                status: 'DELIVERED'
                                            }
                                        });
                                        emitToWorkspace(facebookPage.workspaceId, 'new_message', {
                                            workspaceId: facebookPage.workspaceId,
                                            conversationId: conversation.id,
                                            message: systemNote,
                                            contact: contact,
                                            channel: 'INSTAGRAM'
                                        });
                                        console.log(`📝 [Instagram] 2534038 sistem notu eklendi → conv: ${conversation.id}`);
                                    } catch (noteErr) {
                                        console.error('❌ [Instagram] Sistem notu eklenemedi:', noteErr.message);
                                    }
                                }
                            } else {
                                console.error(`❌ [${isInstagram ? 'Instagram' : 'Facebook'}] AI Auto-Reply failed for workspace ${facebookPage.workspaceId}:`, aiError.response?.data || aiError.message);
                            }
                        }
                        } // End of else (senderIsInstomerPage check)
                        // --- AI AUTO REPLY END ---



                        // --- AUTO EXTRACT START ---
                        try {
                            const { autoExtractFromConversation, autoGenerateTopic } = await import('./ai.controller.js');
                            const { autoAssignDefaultFunnel } = await import('./funnel.controller.js');
                            autoExtractFromConversation(facebookPage.workspaceId, conversation.id);
                            autoGenerateTopic(facebookPage.workspaceId, conversation.id, message.text).catch(e =>
                                console.error('❌ [AutoTopic] FB/IG error:', e.message)
                            );
                            autoAssignDefaultFunnel(facebookPage.workspaceId, conversation.id).catch(e =>
                                console.error('❌ [AutoFunnel] FB/IG error:', e.message)
                            );
                        } catch (extractError) {
                            console.error('❌ AI Auto-Extract call failed:', extractError);
                        }
                        // --- AUTO EXTRACT END ---
                    } // End of !isOutgoingMessage check
                }
            } // End of for (const facebookPage of allConnectedPages)
        }
    } catch (error) {
        console.error('Async webhook processing error:', error);
    }
}

// Get detailed contact profile
export const getContactProfile = async (req, res) => {
    try {
        const { conversationId } = req.params;

        // Find conversation with page and contact info
        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
            include: {
                facebookPage: true,
                contact: true
            }
        });

        if (!conversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        // Get local data
        let tags = [];
        try {
            tags = JSON.parse(conversation.contact.tags || '[]');
        } catch (e) {
            tags = [];
        }

        const localData = {
            id: conversation.contact.id,
            facebookId: conversation.contact.facebookId,
            phone: conversation.contact.phone || null,
            email: conversation.contact.email || null,
            fullName: conversation.contact.fullName || null,
            status: conversation.contact.status || 'NEW',
            category: conversation.contact.category || 'NEW',
            assignedToId: conversation.assignedToId,
            tags: tags,
            profile_pic: conversation.contact.avatar, // Use stored avatar if available
            isBlocked: conversation.contact.isBlocked || false,
            blockedAt: conversation.contact.blockedAt || null,
            blockedReason: conversation.contact.blockedReason || null,
            // Notes
            notes: conversation.contact.notes || null,
            // AI Analysis (persisted)
            aiTopic: conversation.aiTopic || null,
            aiSummary: conversation.aiSummary || null
        };

        // Fetch detailed info from Facebook Graph API if possible
        // IMPORTANT: Instagram-Scoped User IDs (IGScopedID) cannot be queried via Graph API
        // They return error: "Object with ID 'xxx' does not exist or cannot be loaded"
        // Only fetch for Facebook Messenger contacts, not Instagram
        // ALSO: Lead contacts (facebookId starting with 'lead_') should not be queried
        const isInstagram = !!conversation.instagramBusinessId;
        const isLead = conversation.contact?.facebookId?.startsWith('lead_');

        if (!isInstagram && !isLead && conversation.facebookPage?.pageAccessToken && conversation.contact?.facebookId) {
            try {
                // Facebook Messenger only - Instagram IDs are not queryable
                const fields = 'name,first_name,last_name,gender,locale,timezone,email,link';

                const response = await axios.get(
                    `https://graph.facebook.com/${GRAPH_API_VERSION}/${conversation.contact.facebookId}`,
                    {
                        params: {
                            fields,
                            access_token: conversation.facebookPage.pageAccessToken
                        }
                    }
                );

                // For Facebook Messenger, use the /picture endpoint
                const profilePicUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/${conversation.contact.facebookId}/picture?type=large&access_token=${conversation.facebookPage.pageAccessToken}`;

                // Merge FB data with local data (Local data takes precedence for phone/email if set)
                const mergedProfile = {
                    ...response.data,
                    ...localData,
                    profile_pic: profilePicUrl,
                    profile_pic_fallback: getAvatarFallback(response.data.name || conversation.contact.name),
                    email: localData.email || response.data.email || null,
                    phone: localData.phone || null,
                    channel: conversation.channel,
                    // Determine a human-readable identifier
                    displayIdentifier: localData.phone || localData.email || response.data.email || localData.facebookId,
                    // Construct Direct Profile URL
                    profileUrl: response.data.link || (localData.facebookId ? `https://www.facebook.com/${localData.facebookId}` : null)
                };

                return res.json({ profile: mergedProfile });
            } catch (fbError) {
                // Only log non-Instagram errors (Instagram errors are expected)
                console.error('Facebook Graph API error:', fbError.response?.data || fbError.message);
                // Continue to local fallback
            }
        }

        // Default / Fallback to local data
        // isInstagram already defined above
        const fallbackProfileUrl = localData.facebookId
            ? (isInstagram
                ? `https://www.instagram.com/${localData.facebookId}/`
                : `https://www.facebook.com/${localData.facebookId}`)
            : null;

        // Generate profile picture: stored avatar > Gravatar (if email) > UI-Avatars fallback
        const contactName = conversation.contact.name || 'User';
        let profilePic = conversation.contact.avatar;

        if (!profilePic) {
            // Try Gravatar if email exists
            if (localData.email) {
                profilePic = getGravatarUrl(localData.email);
            }
            // Always have a fallback
            if (!profilePic) {
                profilePic = getAvatarFallback(contactName);
            }
        }

        res.json({
            profile: {
                name: contactName,
                profile_pic: profilePic,
                profile_pic_fallback: getAvatarFallback(contactName), // Always provide fallback for frontend
                source: 'local',
                first_name: contactName.split(' ')[0] || 'User',
                last_name: contactName.split(' ').slice(1).join(' ') || '',
                email: localData.email,
                phone: localData.phone,
                channel: conversation.channel,
                displayIdentifier: localData.phone || localData.email || localData.facebookId || conversation.contact.id.substring(0, 8),
                profileUrl: fallbackProfileUrl,
                ...localData
            }
        });
    } catch (error) {
        console.error('Get contact profile error:', error);
        res.status(500).json({ error: 'Failed to fetch contact profile' });
    }
};

// Add tag to contact
export const addContactTag = async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { tag } = req.body;

        console.log(`[TAG_DEBUG] Adding tag '${tag}' to conversation ${conversationId}`);

        if (!tag) return res.status(400).json({ error: 'Tag is required' });

        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
            include: { contact: true, facebookPage: true }
        });

        if (!conversation) {
            console.error('[TAG_DEBUG] Conversation not found');
            return res.status(404).json({ error: 'Conversation not found' });
        }

        // Verify workspace access (Security) — SUPER_ADMIN bypasses member check
        if (req.user.role !== 'SUPER_ADMIN') {
            const member = await prisma.workspaceMember.findUnique({
                where: {
                    userId_workspaceId: {
                        userId: req.user.id,
                        workspaceId: conversation.workspaceId
                    }
                }
            });

            if (!member) {
                console.error(`[TAG_DEBUG] Access denied for user ${req.user.id} to workspace ${conversation.workspaceId}`);
                return res.status(403).json({ error: 'Access denied to this workspace' });
            }
        }

        let tags = [];
        try {
            tags = JSON.parse(conversation.contact.tags || '[]');
        } catch (e) {
            console.error('[TAG_DEBUG] JSON parse error for tags:', e);
            tags = [];
        }

        if (!tags.includes(tag)) {
            tags.push(tag);
            console.log('[TAG_DEBUG] Updating tags to:', tags);
            try {
                await prisma.contact.update({
                    where: { id: conversation.contact.id },
                    data: { tags: JSON.stringify(tags) }
                });
            } catch (dbError) {
                console.error('[TAG_DEBUG] Prisma update error:', dbError);
                // Check for "Unknown argument" which implies stale client
                if (dbError.message.includes('Unknown argument')) {
                    return res.status(500).json({ error: 'Database schema mismatch. Please restart the backend server.' });
                }
                throw dbError;
            }
        } else {
            console.log('[TAG_DEBUG] Tag already exists');
        }

        res.json({ tags });
    } catch (error) {
        console.error('[TAG_DEBUG] Add tag error:', error);
        res.status(500).json({ error: 'Failed to add tag: ' + error.message });
    }
};

// Remove tag from contact
export const removeContactTag = async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { tag } = req.body; // or params, logic same

        if (!tag) return res.status(400).json({ error: 'Tag is required' });

        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
            include: { contact: true, facebookPage: true }
        });

        if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

        // Verify workspace access (Security) — SUPER_ADMIN bypasses member check
        if (req.user.role !== 'SUPER_ADMIN') {
            const member = await prisma.workspaceMember.findUnique({
                where: {
                    userId_workspaceId: {
                        userId: req.user.id,
                        workspaceId: conversation.workspaceId
                    }
                }
            });

            if (!member) {
                return res.status(403).json({ error: 'Access denied to this workspace' });
            }
        }

        let tags = [];
        try {
            tags = JSON.parse(conversation.contact.tags || '[]');
        } catch (e) {
            tags = [];
        }

        const newTags = tags.filter(t => t !== tag);

        await prisma.contact.update({
            where: { id: conversation.contact.id },
            data: { tags: JSON.stringify(newTags) }
        });

        res.json({ tags: newTags });
    } catch (error) {
        console.error('Remove tag error:', error);
        res.status(500).json({ error: 'Failed to remove tag: ' + error.message });
    }
};

// Post and Comment Management

// Get recent posts for a page
export const getPosts = async (req, res) => {
    try {
        const { pageId } = req.params;
        const { workspaceId } = req.query;

        // Find the page to get the access token (for this workspace)
        const page = await prisma.facebookPage.findFirst({
            where: workspaceId ? { pageId, workspaceId } : { pageId }
        });

        if (!page) {
            return res.status(404).json({ error: 'Page not found' });
        }

        // Verify workspace access (allow SUPER_ADMIN to bypass)
        if (req.user.role !== 'SUPER_ADMIN') {
            const member = await prisma.workspaceMember.findUnique({
                where: {
                    userId_workspaceId: {
                        userId: req.user.id,
                        workspaceId: page.workspaceId
                    }
                }
            });

            if (!member) {
                return res.status(403).json({ error: 'Access denied' });
            }
        }

        // Only fetch posts created after the page was connected
        const pageConnectedAt = page.createdAt;
        const sinceTimestamp = Math.floor(new Date(pageConnectedAt).getTime() / 1000);

        const response = await axios.get(
            `https://graph.facebook.com/${GRAPH_API_VERSION}/${pageId}/posts`,
            {
                params: {
                    access_token: page.pageAccessToken,
                    fields: 'id,message,created_time,full_picture,permalink_url,comments.summary(true).limit(0)',
                    since: sinceTimestamp
                }
            }
        );

        console.log(`📝 [Posts] Fetched ${response.data.data?.length || 0} posts since ${pageConnectedAt.toISOString()}`);
        res.json({ posts: response.data.data || [] });
    } catch (error) {
        console.error('Get posts error:', error.response?.data || error);
        res.status(500).json({ error: 'Failed to fetch posts' });
    }
};

// Get Instagram media (posts)
export const getInstagramMedia = async (req, res) => {
    try {
        const { instagramBusinessId } = req.params;
        const { workspaceId } = req.query;

        // Find the page that has this Instagram account
        const page = await prisma.facebookPage.findFirst({
            where: {
                instagramBusinessId,
                ...(workspaceId && { workspaceId })
            }
        });

        if (!page) {
            return res.status(404).json({ error: 'Instagram account not found' });
        }

        // Verify workspace access (allow SUPER_ADMIN to bypass)
        if (req.user.role !== 'SUPER_ADMIN') {
            const member = await prisma.workspaceMember.findUnique({
                where: {
                    userId_workspaceId: {
                        userId: req.user.id,
                        workspaceId: page.workspaceId
                    }
                }
            });

            if (!member) {
                return res.status(403).json({ error: 'Access denied' });
            }
        }

        // Only fetch media created after the page was connected
        const pageConnectedAt = page.createdAt;
        const sinceTimestamp = Math.floor(new Date(pageConnectedAt).getTime() / 1000);

        const response = await axios.get(
            `https://graph.facebook.com/${GRAPH_API_VERSION}/${instagramBusinessId}/media`,
            {
                params: {
                    access_token: page.pageAccessToken,
                    fields: 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,comments_count',
                    since: sinceTimestamp
                }
            }
        );

        // Transform to match Facebook posts format for UI consistency
        // Also filter by timestamp (extra safety)
        const posts = (response.data.data || [])
            .filter(media => new Date(media.timestamp) >= pageConnectedAt)
            .map(media => ({
                id: media.id,
                message: media.caption || '',
                created_time: media.timestamp,
                full_picture: media.media_url || media.thumbnail_url,
                permalink_url: media.permalink,
                comments: {
                    summary: {
                        total_count: media.comments_count || 0
                    }
                },
                isInstagram: true
            }));

        console.log(`📸 [Instagram] Fetched ${posts.length} media since ${pageConnectedAt.toISOString()}`);
        res.json({ posts });
    } catch (error) {
        console.error('Get Instagram media error:', error.response?.data || error);
        res.status(500).json({ error: 'Failed to fetch Instagram media' });
    }
};

// Get comments for a post
export const getPostComments = async (req, res) => {
    try {
        const { postId } = req.params;
        const { workspaceId, pageId, instagramBusinessId } = req.query;

        let page = null;

        // 1. Try explicit pageId with workspaceId
        if (pageId && workspaceId) {
            page = await prisma.facebookPage.findUnique({
                where: {
                    pageId_workspaceId: {
                        pageId,
                        workspaceId
                    }
                }
            });
        }

        // 2. Try explicit pageId only (first match)
        if (!page && pageId) {
            page = await prisma.facebookPage.findFirst({
                where: { pageId }
            });
        }

        // 3. Try instagramBusinessId for Instagram posts
        if (!page && instagramBusinessId) {
            page = await prisma.facebookPage.findFirst({
                where: workspaceId ? { instagramBusinessId, workspaceId } : { instagramBusinessId }
            });
        }

        // 4. Try to find page from postId prefix (Facebook posts are pageId_postId format)
        if (!page) {
            const pageIdFromPost = postId.split('_')[0];
            page = await prisma.facebookPage.findFirst({
                where: workspaceId ? { pageId: pageIdFromPost, workspaceId } : { pageId: pageIdFromPost }
            });
        }

        // 5. Fallback: use workspaceId if provided
        if (!page && workspaceId) {
            page = await prisma.facebookPage.findFirst({
                where: { workspaceId }
            });
        }

        if (!page) {
            return res.status(404).json({ error: 'Associated page not found to fetch comments' });
        }

        // Only fetch comments created after the page was connected
        const pageConnectedAt = page.createdAt;
        const sinceTimestamp = Math.floor(new Date(pageConnectedAt).getTime() / 1000);

        // Check if this is an Instagram post (Instagram post IDs don't contain underscore)
        const isInstagramPost = instagramBusinessId || !postId.includes('_');

        let comments = [];

        if (isInstagramPost) {
            // Instagram comments use different fields: text instead of message, username instead of from
            console.log(`📸 [Instagram Comments] Fetching for post ${postId}`);
            const response = await axios.get(
                `https://graph.facebook.com/${GRAPH_API_VERSION}/${postId}/comments`,
                {
                    params: {
                        access_token: page.pageAccessToken,
                        fields: 'id,text,username,timestamp,from{id,username},replies{id,text,username,timestamp,from{id,username}}'
                    }
                }
            );

            // Transform Instagram comments to match Facebook format for UI consistency
            comments = (response.data.data || []).map(c => ({
                id: c.id,
                message: c.text,
                from: {
                    name: c.from?.username || c.username,
                    id: c.from?.id || c.username,
                    username: c.from?.username || c.username,
                    profile_picture_url: c.from?.profile_picture_url || null
                },
                created_time: c.timestamp,
                comments: c.replies ? {
                    data: c.replies.data.map(r => ({
                        id: r.id,
                        message: r.text,
                        from: {
                            name: r.from?.username || r.username,
                            id: r.from?.id || r.username,
                            username: r.from?.username || r.username,
                            profile_picture_url: r.from?.profile_picture_url || null
                        },
                        created_time: r.timestamp
                    }))
                } : null
            }));

            // Filter by page connection date
            comments = comments.filter(c => new Date(c.created_time) >= pageConnectedAt);

            // Batch-fetch profile pictures for unique Instagram commenters
            // (Same mechanism as DM contacts — use IG user ID with page access token)
            try {
                const uniqueUserIds = [...new Set(
                    comments.flatMap(c => {
                        const ids = [];
                        if (c.from?.id && c.from.id !== page.instagramBusinessId) ids.push(c.from.id);
                        c.comments?.data?.forEach(r => {
                            if (r.from?.id && r.from.id !== page.instagramBusinessId) ids.push(r.from.id);
                        });
                        return ids;
                    })
                )].slice(0, 20); // cap at 20 to avoid rate limits

                console.log(`📸 [IG Profiles] Unique commenter IDs found: ${uniqueUserIds.length}`, uniqueUserIds.slice(0, 3));

                if (uniqueUserIds.length > 0) {
                    const picMap = {};
                    await Promise.allSettled(
                        uniqueUserIds.map(async (uid) => {
                            try {
                                const res = await axios.get(
                                    `https://graph.facebook.com/${GRAPH_API_VERSION}/${uid}`,
                                    { params: { fields: 'username,name,profile_pic', access_token: page.pageAccessToken } }
                                );
                                if (res.data?.profile_pic) {
                                    picMap[uid] = res.data.profile_pic;
                                }
                            } catch (_) { /* user may have privacy settings */ }
                        })
                    );

                    // Merge profile pictures into comments
                    comments = comments.map(c => ({
                        ...c,
                        from: { ...c.from, profile_picture_url: picMap[c.from?.id] || c.from?.profile_picture_url },
                        comments: c.comments ? {
                            data: c.comments.data.map(r => ({
                                ...r,
                                from: { ...r.from, profile_picture_url: picMap[r.from?.id] || r.from?.profile_picture_url }
                            }))
                        } : null
                    }));

                    console.log(`📸 [Instagram Comments] Fetched profile pics for ${Object.keys(picMap).length}/${uniqueUserIds.length} users`);
                }
            } catch (picErr) {
                console.warn('[Instagram Comments] Profile picture batch fetch error:', picErr.message);
            }

            console.log(`📸 [Instagram Comments] Fetched ${comments.length} comments since ${pageConnectedAt.toISOString()}`);

        } else {
            // Facebook comments
            console.log(`📘 [Facebook Comments] Fetching for post ${postId}`);
            const response = await axios.get(
                `https://graph.facebook.com/${GRAPH_API_VERSION}/${postId}/comments`,
                {
                    params: {
                        access_token: page.pageAccessToken,
                        fields: 'id,from{id,name,picture{url}},message,created_time,attachment,comment_count,like_count,user_likes,can_comment,comments{id,from{id,name,picture{url}},message,created_time,attachment}',
                        since: sinceTimestamp
                    }
                }
            );

            comments = response.data.data || [];

            // Extra filter: only comments after page connection (in case 'since' doesn't work perfectly)
            comments = comments.filter(c => new Date(c.created_time) >= pageConnectedAt);

            console.log(`📘 [Facebook Comments] Fetched ${comments.length} comments since ${pageConnectedAt.toISOString()}`);
        }

        // Sort comments from oldest to newest
        comments.sort((a, b) => new Date(a.created_time) - new Date(b.created_time));

        // Also sort replies within each comment
        comments.forEach(comment => {
            if (comment.comments?.data) {
                comment.comments.data.sort((a, b) => new Date(a.created_time) - new Date(b.created_time));
            }
        });

        // Auto-reply to new comments using AI bot (async, don't block response)
        processAutoReplyForComments(comments, page, postId, isInstagramPost).catch(err => {
            console.error('Auto-reply processing error:', err);
        });

        res.json({ comments });
    } catch (error) {
        console.error('Get comments error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: error.response?.data?.error?.message || 'Failed to fetch comments',
            details: error.response?.data
        });
    }
};

// Process auto-reply for comments using AI bot
async function processAutoReplyForComments(comments, page, postId, isInstagram) {
    try {
        const { getAutoReply } = await import('./ai.controller.js');

        for (const comment of comments) {
            // Skip if comment is from the page itself
            const commenterId = comment.from?.id;
            if (!commenterId || commenterId === page.pageId || commenterId === page.instagramBusinessId || commenterId === page.instagramUsername) {
                continue;
            }

            // Check if this comment already has a reply from the page
            const hasPageReply = comment.comments?.data?.some(reply =>
                reply.from?.id === page.pageId ||
                reply.from?.id === page.instagramBusinessId ||
                reply.from?.name === page.instagramUsername ||
                reply.from?.name === page.pageName
            );

            if (hasPageReply) {
                console.log(`⏭️ [AUTO-REPLY] Comment ${comment.id} already has a reply, skipping`);
                continue;
            }

            // Check if we've already processed this comment (use a simple cache)
            const cacheKey = `comment_replied_${comment.id}`;
            const alreadyReplied = global.commentReplyCache?.get(cacheKey);
            if (alreadyReplied) {
                continue;
            }

            console.log(`🤖 [AUTO-REPLY] Processing comment ${comment.id}: "${comment.message}"`);

            // Get AI response
            const aiResponse = await getAutoReply(
                page.workspaceId,
                null,
                comment.message,
                isInstagram ? 'instagram' : 'facebook',
                'COMMENTS',
                isInstagram ? page.instagramBusinessId : page.pageId
            );

            if (aiResponse) {
                console.log(`🤖 [AUTO-REPLY] AI Response: ${aiResponse.substring(0, 100)}...`);

                // Post reply to the comment
                // Facebook uses /comments endpoint, Instagram uses /replies
                const replyEndpoint = isInstagram
                    ? `https://graph.facebook.com/${GRAPH_API_VERSION}/${comment.id}/replies`
                    : `https://graph.facebook.com/${GRAPH_API_VERSION}/${comment.id}/comments`;

                console.log(`📤 [AUTO-REPLY] Posting to: ${replyEndpoint}`);

                try {
                    await axios.post(
                        replyEndpoint,
                        { message: aiResponse },
                        { params: { access_token: page.pageAccessToken } }
                    );
                    console.log(`✅ [AUTO-REPLY] Reply posted to comment ${comment.id}`);

                    // Mark as replied in cache (expire after 1 hour)
                    if (!global.commentReplyCache) {
                        global.commentReplyCache = new Map();
                    }
                    global.commentReplyCache.set(cacheKey, true);
                    setTimeout(() => global.commentReplyCache.delete(cacheKey), 3600000);

                } catch (replyError) {
                    console.error(`❌ [AUTO-REPLY] Failed to post reply:`, replyError.response?.data || replyError.message);

                    // Try alternative endpoint if first one fails
                    const altEndpoint = isInstagram
                        ? `https://graph.facebook.com/${GRAPH_API_VERSION}/${comment.id}/comments`
                        : `https://graph.facebook.com/${GRAPH_API_VERSION}/${comment.id}/replies`;

                    console.log(`🔄 [AUTO-REPLY] Trying alternative endpoint: ${altEndpoint}`);

                    try {
                        await axios.post(
                            altEndpoint,
                            { message: aiResponse },
                            { params: { access_token: page.pageAccessToken } }
                        );
                        console.log(`✅ [AUTO-REPLY] Reply posted via alternative endpoint`);

                        if (!global.commentReplyCache) {
                            global.commentReplyCache = new Map();
                        }
                        global.commentReplyCache.set(cacheKey, true);
                        setTimeout(() => global.commentReplyCache.delete(cacheKey), 3600000);
                    } catch (altError) {
                        console.error(`❌ [AUTO-REPLY] Alternative endpoint also failed:`, altError.response?.data || altError.message);
                    }
                }
            } else {
                console.log(`⚠️ [AUTO-REPLY] No AI response for comment ${comment.id} - no bot assigned?`);
            }
        }
    } catch (error) {
        console.error('Auto-reply processing error:', error);
    }
}

// Create a comment or reply
export const createPostComment = async (req, res) => {
    try {
        const { postId } = req.params;
        const { message, workspaceId, pageId } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        let page = null;

        // 1. Try explicit pageId with workspaceId
        if (pageId && workspaceId) {
            page = await prisma.facebookPage.findUnique({
                where: {
                    pageId_workspaceId: {
                        pageId,
                        workspaceId
                    }
                }
            });
        }

        // 2. Try explicit pageId only (first match)
        if (!page && pageId) {
            page = await prisma.facebookPage.findFirst({
                where: { pageId }
            });
        }

        // 3. Try exact prefix match from postId
        if (!page) {
            const pageIdFromPost = postId.split('_')[0];
            page = await prisma.facebookPage.findFirst({
                where: workspaceId ? { pageId: pageIdFromPost, workspaceId } : { pageId: pageIdFromPost }
            });
        }

        // 4. Fallback: use workspaceId
        if (!page && workspaceId) {
            page = await prisma.facebookPage.findFirst({
                where: { workspaceId }
            });
        }

        if (!page) {
            return res.status(404).json({ error: 'Associated page not found to post comment' });
        }

        const response = await axios.post(
            `https://graph.facebook.com/${GRAPH_API_VERSION}/${postId}/comments`,
            { message },
            {
                params: { access_token: page.pageAccessToken }
            }
        );

        res.json({ comment: response.data });
    } catch (error) {
        console.error('Create comment error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: error.response?.data?.error?.message || 'Failed to create comment',
            details: error.response?.data
        });
    }
};

// Update an existing comment
export const updateComment = async (req, res) => {
    try {
        const { commentId } = req.params;
        const { message, workspaceId } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        const effectiveWorkspaceId = workspaceId || req.query.workspaceId;

        if (!effectiveWorkspaceId) {
            return res.status(400).json({ error: 'workspaceId is required' });
        }

        const page = await prisma.facebookPage.findFirst({
            where: { workspaceId: effectiveWorkspaceId }
        });

        if (!page) {
            return res.status(404).json({ error: 'No connected pages found for workspace' });
        }

        const response = await axios.post(
            `https://graph.facebook.com/${GRAPH_API_VERSION}/${commentId}`,
            { message },
            {
                params: { access_token: page.pageAccessToken }
            }
        );

        res.json({ success: response.data.success });
    } catch (error) {
        console.error('Update comment error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: error.response?.data?.error?.message || 'Failed to update comment',
            details: error.response?.data
        });
    }
};

// Delete a comment
export const deleteComment = async (req, res) => {
    try {
        const { commentId } = req.params;
        const { workspaceId } = req.query;

        if (!workspaceId) {
            return res.status(400).json({ error: 'workspaceId is required' });
        }

        const page = await prisma.facebookPage.findFirst({
            where: { workspaceId }
        });

        if (!page) {
            return res.status(404).json({ error: 'No connected pages found for workspace' });
        }

        const response = await axios.delete(
            `https://graph.facebook.com/${GRAPH_API_VERSION}/${commentId}`,
            {
                params: { access_token: page.pageAccessToken }
            }
        );

        res.json({ success: response.data.success });
    } catch (error) {
        console.error('Delete comment error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: error.response?.data?.error?.message || 'Failed to delete comment',
            details: error.response?.data
        });
    }
};

// ============================================
// LEADGEN HANDLER - Facebook Lead Ads
// ============================================
// In-memory dedup cache to prevent Meta's duplicate webhook calls
if (!global.leadgenProcessingCache) {
    global.leadgenProcessingCache = new Map();
}

async function handleLeadgenEvent(leadValue, entryId) {
    const leadgenId = leadValue?.leadgen_id;

    // Dedup check: if this leadgen_id was already processed within 5 minutes, skip
    if (leadgenId && global.leadgenProcessingCache.has(leadgenId)) {
        console.log(`🚫 [LEADGEN] Duplicate webhook for leadgen_id ${leadgenId} — skipping`);
        return;
    }
    // Mark as processing (expires in 5 min)
    if (leadgenId) {
        global.leadgenProcessingCache.set(leadgenId, Date.now());
        setTimeout(() => global.leadgenProcessingCache.delete(leadgenId), 5 * 60 * 1000);
    }

    console.log('📋 =====================================');
    console.log('📋 LEADGEN EVENT RECEIVED');
    console.log('📋 =====================================');
    console.log(`📋 Lead ID: ${leadgenId}`);
    console.log(`📋 Form ID: ${leadValue?.form_id}`);
    console.log(`📋 Page ID: ${leadValue?.page_id || entryId}`);

    const pageId = leadValue?.page_id || entryId;

    // Find page in database - check both pageId and instagramBusinessId
    const facebookPage = await prisma.facebookPage.findFirst({
        where: {
            OR: [
                { pageId: pageId },
                { instagramBusinessId: pageId }
            ]
        }
    });

    if (!facebookPage) {
        console.log(`❌ [LEADGEN] Page ${pageId} not found in database`);
        return;
    }

    // IMPORTANT: Block Instagram leads to prevent duplicates
    // If the pageId matches instagramBusinessId, this is an Instagram lead - skip it
    if (pageId === facebookPage.instagramBusinessId) {
        console.log(`🚫 [LEADGEN] Instagram lead detected (pageId: ${pageId} matches instagramBusinessId). Skipping to prevent duplicate.`);
        console.log(`ℹ️ [LEADGEN] Facebook page ${facebookPage.pageId} will handle this lead instead.`);
        return;
    }

    console.log(`✅ [LEADGEN] Found page: ${facebookPage.pageName} (Workspace: ${facebookPage.workspaceId})`);

    try {
        // Fetch lead details from Facebook Graph API
        const leadResponse = await axios.get(
            `https://graph.facebook.com/${GRAPH_API_VERSION}/${leadValue.leadgen_id}`,
            {
                params: {
                    access_token: facebookPage.pageAccessToken,
                    fields: 'id,created_time,field_data,ad_id,ad_name,campaign_id,campaign_name,form_id'
                }
            }
        );

        const leadData = leadResponse.data;
        console.log(`📋 [LEADGEN] Lead data from API:`, JSON.stringify(leadData, null, 2));

        // Parse field data
        const fieldData = {};
        if (leadData.field_data) {
            for (const field of leadData.field_data) {
                fieldData[field.name] = field.values?.[0] || '';
            }
        }
        console.log(`📋 [LEADGEN] Parsed fields:`, fieldData);

        // Get form name
        let formName = null;
        try {
            const formResponse = await axios.get(
                `https://graph.facebook.com/${GRAPH_API_VERSION}/${leadData.form_id}`,
                { params: { access_token: facebookPage.pageAccessToken, fields: 'name' } }
            );
            formName = formResponse.data.name;
        } catch (formErr) {
            console.log('⚠️ Could not fetch form name:', formErr.message);
        }

        // Extract contact info (handle different field name formats - case insensitive)
        const getField = (...keys) => {
            for (const key of keys) {
                // Check exact match
                if (fieldData[key]) return fieldData[key];
                // Check case-insensitive
                const found = Object.entries(fieldData).find(([k]) => k.toLowerCase() === key.toLowerCase());
                if (found) return found[1];
                // Check partial match (e.g., "lead_phone" contains "phone")
                const partial = Object.entries(fieldData).find(([k]) => k.toLowerCase().includes(key.toLowerCase()));
                if (partial && keys.some(k => k.toLowerCase() === key.toLowerCase())) return partial[1];
            }
            return null;
        };

        // Find email field (various naming conventions)
        let leadEmail = null;
        for (const [key, value] of Object.entries(fieldData)) {
            const lowerKey = key.toLowerCase();
            if (lowerKey.includes('email') || lowerKey.includes('e-mail') || lowerKey.includes('mail') || lowerKey === 'e_mail') {
                if (value && value.includes('@')) {
                    leadEmail = value;
                    break;
                }
            }
        }

        // Find phone field (various naming conventions)
        let leadPhone = null;
        for (const [key, value] of Object.entries(fieldData)) {
            const lowerKey = key.toLowerCase();
            if (lowerKey.includes('phone') || lowerKey.includes('tel') || lowerKey.includes('gsm') || lowerKey.includes('mobile') || lowerKey.includes('cep')) {
                if (value && value.length >= 10) {
                    leadPhone = value;
                    break;
                }
            }
        }

        // Normalize phone number for consistent matching
        const { normalizePhone } = await import('../utils/phoneNormalizer.js');
        if (leadPhone) {
            leadPhone = normalizePhone(leadPhone);
        }

        const leadName = fieldData.full_name || fieldData.name || fieldData.first_name || getField('full_name', 'name', 'first_name', 'isim', 'ad') || 'Facebook Lead';

        // 1. Save to FacebookLead table
        const savedLead = await prisma.facebookLead.upsert({
            where: { leadId: leadData.id },
            create: {
                leadId: leadData.id,
                workspaceId: facebookPage.workspaceId,
                facebookPageId: facebookPage.id,
                formId: leadData.form_id,
                formName: formName,
                adId: leadData.ad_id || null,
                adName: leadData.ad_name || null,
                campaignId: leadData.campaign_id || null,
                campaignName: leadData.campaign_name || null,
                fieldData: JSON.stringify(fieldData),
                name: leadName,
                email: leadEmail,
                phone: leadPhone,
                status: 'NEW',
                createdAt: new Date(leadData.created_time)
            },
            update: {
                fieldData: JSON.stringify(fieldData),
                name: leadName,
                email: leadEmail,
                phone: leadPhone
            }
        });
        console.log(`✅ [LEADGEN] Lead saved to database: ${savedLead.id}`);

        // 2. Create or find Contact - search by multiple phone formats
        const phoneVariants = [];
        if (leadPhone) {
            phoneVariants.push({ phone: leadPhone });
            // Add variants for Turkish numbers
            if (leadPhone.startsWith('+90')) {
                phoneVariants.push({ phone: leadPhone.slice(1) });  // 905xx
                phoneVariants.push({ phone: '0' + leadPhone.slice(3) });  // 05xx
            }
        }

        let contact = await prisma.contact.findFirst({
            where: {
                workspaceId: facebookPage.workspaceId,
                OR: [
                    { facebookId: `lead_${leadData.id}` },
                    ...(leadEmail ? [{ email: leadEmail }] : []),
                    ...phoneVariants
                ]
            }
        });

        if (!contact) {
            contact = await prisma.contact.create({
                data: {
                    workspaceId: facebookPage.workspaceId,
                    name: leadName,
                    email: leadEmail,
                    phone: leadPhone,
                    facebookId: `lead_${leadData.id}`,
                    status: 'OPPORTUNITY', // Lead = Fırsat
                    source: 'FACEBOOK_LEAD'
                }
            });
            console.log(`✅ [LEADGEN] Contact created as OPPORTUNITY: ${contact.id}`);
        } else {
            // Mevcut contact varsa, bilgileri güncelle ve status'ü HOT_OPPORTUNITY yap
            contact = await prisma.contact.update({
                where: { id: contact.id },
                data: {
                    name: leadName || contact.name,
                    email: leadEmail || contact.email,
                    phone: leadPhone || contact.phone,
                    status: 'OPPORTUNITY', // Lead = Fırsat
                    source: contact.source === 'MANUAL' ? 'FACEBOOK_LEAD' : contact.source
                }
            });
            console.log(`✅ [LEADGEN] Contact updated as OPPORTUNITY: ${contact.id}`);
        }

        // 3. Find or Create Conversation for Inbox (prevent duplicates)
        let conversation = await prisma.conversation.findFirst({
            where: {
                contactId: contact.id,
                channel: 'LEAD',
                workspaceId: facebookPage.workspaceId
            }
        });

        if (!conversation) {
            conversation = await prisma.conversation.create({
                data: {
                    workspaceId: facebookPage.workspaceId,
                    contactId: contact.id,
                    facebookPageId: facebookPage.id,
                    channel: 'LEAD',
                    status: 'OPEN',
                    lastMessageAt: new Date()
                }
            });
            console.log(`✅ [LEADGEN] Conversation created: ${conversation.id}`);
        } else {
            // Update lastMessageAt for existing conversation
            await prisma.conversation.update({
                where: { id: conversation.id },
                data: { lastMessageAt: new Date(), status: 'OPEN' }
            });
            console.log(`✅ [LEADGEN] Using existing conversation: ${conversation.id}`);
        }

        // 3.5. Lead Form Routing - Match lead field values against bot routing rules
        try {
            // Find active bot with routing enabled for this workspace
            const routingBot = await prisma.aIBot.findFirst({
                where: {
                    workspaceId: facebookPage.workspaceId,
                    isActive: true,
                    routingEnabled: true
                },
                select: {
                    id: true,
                    name: true,
                    routingRules: true,
                    routingQuestions: true
                }
            });

            if (routingBot && routingBot.routingRules) {
                const rules = JSON.parse(routingBot.routingRules || '[]');
                const allLeadValues = Object.values(fieldData).map(v => String(v).toLowerCase().trim());

                console.log(`🔍 [LEADGEN Routing] Bot: ${routingBot.name}, Rules: ${rules.length}, Lead values: ${JSON.stringify(allLeadValues)}`);

                // Sort by priority (lower = higher priority)
                const sortedRules = [...rules].sort((a, b) => (a.priority || 0) - (b.priority || 0));
                let matchedRule = null;

                for (const rule of sortedRules) {
                    const ruleValue = (rule.value || '').toLowerCase().trim();

                    // Check if ANY lead field value matches the rule value
                    let matched = false;
                    for (const leadVal of allLeadValues) {
                        switch (rule.operator) {
                            case 'equals':
                                matched = leadVal === ruleValue;
                                break;
                            case 'contains':
                                matched = leadVal.includes(ruleValue);
                                break;
                            case 'not_equals':
                                matched = leadVal !== ruleValue;
                                break;
                            default:
                                matched = leadVal === ruleValue;
                        }
                        if (matched) break;
                    }

                    if (matched) {
                        matchedRule = rule;
                        console.log(`✅ [LEADGEN Routing] Matched rule: "${rule.field} ${rule.operator} ${rule.value}" → team=${rule.teamId}`);
                        break;
                    }
                }

                if (matchedRule && matchedRule.teamId) {
                    // Assign conversation to matched team
                    await prisma.conversation.update({
                        where: { id: conversation.id },
                        data: {
                            assignedTeamId: matchedRule.teamId,
                            teamIds: JSON.stringify([matchedRule.teamId]),
                            ...(matchedRule.userId ? { assignedToId: matchedRule.userId } : {})
                        }
                    });
                    console.log(`✅ [LEADGEN Routing] Conversation ${conversation.id} assigned to team ${matchedRule.teamId}`);

                    // Emit socket event for real-time team badge update
                    emitToWorkspace(facebookPage.workspaceId, 'conversation_assigned', {
                        conversationId: conversation.id,
                        assignedToId: matchedRule.userId || null,
                        assignedToName: null,
                        botEnabled: false,
                        teamIds: JSON.stringify([matchedRule.teamId])
                    });
                } else {
                    console.log(`ℹ️ [LEADGEN Routing] No routing rule matched for this lead`);
                }
            } else {
                console.log(`ℹ️ [LEADGEN Routing] No active bot with routing enabled found`);
            }
        } catch (routingErr) {
            console.error('⚠️ [LEADGEN Routing] Error:', routingErr.message);
        }

        // 4. Create Message with lead info (Clean format)
        // Build extra fields - skip contact info fields
        const skipFields = ['full_name', 'name', 'email', 'phone_number', 'phone', 'phonenumber', 'first_name', 'last_name', 'tel', 'telefon', 'e_mail', 'mail'];
        const extraFields = [];
        for (const [key, value] of Object.entries(fieldData)) {
            if (!skipFields.includes(key.toLowerCase()) && value) {
                // Format field name nicely
                const fieldLabel = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                extraFields.push({ label: fieldLabel, value });
            }
        }

        // Create clean formatted lead message
        const lines = [];
        lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        lines.push(`🎯  YENİ LEAD FORMU`);
        lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        lines.push(``);
        if (formName) {
            lines.push(`📋  ${formName}`);
            lines.push(``);
        }
        lines.push(`👤  İsim: ${leadName}`);
        if (leadEmail) lines.push(`📧  E-posta: ${leadEmail}`);
        if (leadPhone) lines.push(`📞  Telefon: ${leadPhone}`);

        if (extraFields.length > 0) {
            lines.push(``);
            lines.push(`──────────────────────────`);
            lines.push(`📝  Ek Bilgiler`);
            lines.push(`──────────────────────────`);
            extraFields.forEach(field => {
                lines.push(`▸  ${field.label}: ${field.value}`);
            });
        }

        const messageContent = lines.join('\n');

        const message = await prisma.message.create({
            data: {
                conversationId: conversation.id,
                content: messageContent,
                isFromContact: true,
                status: 'DELIVERED',
                messageType: 'TEXT'
            }
        });
        console.log(`✅ [LEADGEN] Message created: ${message.id}`);

        // 5. Emit Socket Events (workspace-specific)
        try {
            emitToWorkspace(facebookPage.workspaceId, 'new_conversation', {
                workspaceId: facebookPage.workspaceId,
                conversation: { ...conversation, contact }
            });

            emitToWorkspace(facebookPage.workspaceId, 'new_message', {
                workspaceId: facebookPage.workspaceId,
                conversationId: conversation.id,
                message,
                contact,
                channel: 'LEAD'
            });

            emitToWorkspace(facebookPage.workspaceId, 'new_lead', {
                workspaceId: facebookPage.workspaceId,
                leadId: leadData.id,
                name: leadName,
                email: leadEmail,
                phone: leadPhone,
                formName
            });

            console.log('📡 [LEADGEN] Socket events emitted');
        } catch (socketErr) {
            console.error('Socket error:', socketErr);
        }

        // --- AUTOMATION TRIGGER START ---
        try {
            const { executeLeadAutomation } = await import('./automation.controller.js');
            console.log('🤖 [LEADGEN] Triggering lead automations...');
            console.log('🤖 [LEADGEN] Contact phone:', contact?.phone);
            await executeLeadAutomation(facebookPage.workspaceId, savedLead, contact);
            console.log('✅ [LEADGEN] Automations triggered');
        } catch (automationErr) {
            console.error('❌ [LEADGEN] Automation error:', automationErr);
        }
        // --- AUTOMATION TRIGGER END ---

        // --- FLOW ENGINE TRIGGER ---
        try {
            const { executeFlowsByTrigger } = await import('./flow.controller.js');
            executeFlowsByTrigger(facebookPage.workspaceId, 'NEW_FORM', {
                contact, lead: savedLead, conversation,
                formData: { name: leadName, email: leadEmail, phone: leadPhone }
            });
        } catch (flowErr) {
            console.error('⚠️ [LEADGEN] Flow engine error:', flowErr.message);
        }
        // --- FLOW ENGINE TRIGGER END ---

        // --- AUTO CALL TRIGGER ---
        if (leadPhone) {
            try {
                const { triggerAutoCall } = await import('./retell.controller.js');
                const baseDate = leadData.created_time ? new Date(leadData.created_time) : new Date();

                // Extract preferred call-time window directly from lead form fieldData.
                // We do this here (structured data) rather than relying on message-content parsing,
                // because LEAD triggers intentionally disable message parsing to prevent date strings
                // like "23.03.2026" from being misread as "23:03".
                // Facebook Lead Ads encodes range values with underscores: "12:00_-_15:00"
                let leadPreferredWindow = null;
                for (const [key, value] of Object.entries(fieldData)) {
                    const lk = key.toLowerCase();
                    if (lk.includes('zaman') || lk.includes('saat') || lk.includes('time') || lk.includes('when') || lk.includes('ara')) {
                        if (value) {
                            // Normalize underscored Facebook Lead Ads format: "12:00_-_15:00" → "12:00-15:00"
                            const normalized = String(value).replace(/_/g, ' ').trim();
                            const rangeMatch = normalized.match(/(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/);
                            if (rangeMatch) {
                                const [, sH, sM, eH, eM] = rangeMatch.map((v, i) => i === 0 ? v : parseInt(v));
                                if (sH >= 6 && eH > sH && eH <= 23) {
                                    leadPreferredWindow = { startHour: sH, startMinute: sM, endHour: eH, endMinute: eM };
                                    console.log(`🕐 [LEADGEN] Preferred call window from lead form field "${key}": ${sH}:${String(sM).padStart(2,'0')}-${eH}:${String(eM).padStart(2,'0')}`);
                                    break;
                                }
                            }
                        }
                    }
                }

                triggerAutoCall(facebookPage.workspaceId, leadPhone, contact?.id, leadName, 'LEAD', null, baseDate, leadPreferredWindow);
            } catch (autoCallErr) {
                console.error('⚠️ [LEADGEN] AutoCall trigger error:', autoCallErr.message);
            }
        }

        // --- AUTO TOPIC GENERATION ---
        if (conversation?.id && messageContent) {
            try {
                const { autoGenerateTopic } = await import('./ai.controller.js');
                autoGenerateTopic(facebookPage.workspaceId, conversation.id, messageContent).catch(e =>
                    console.error('❌ [AutoTopic] LEADGEN error:', e.message)
                );
            } catch (topicErr) {
                console.error('⚠️ [LEADGEN] AutoTopic error:', topicErr.message);
            }
        }

        // --- AUTO FUNNEL ASSIGNMENT ---
        if (conversation?.id) {
            try {
                const { autoAssignDefaultFunnel } = await import('./funnel.controller.js');
                autoAssignDefaultFunnel(facebookPage.workspaceId, conversation.id).catch(e =>
                    console.error('❌ [AutoFunnel] LEADGEN error:', e.message)
                );
            } catch (funnelErr) {
                console.error('⚠️ [LEADGEN] AutoFunnel error:', funnelErr.message);
            }
        }

        console.log('✅ [LEADGEN] Processing complete!');

    } catch (error) {
        console.error('❌ [LEADGEN] Error:', error.response?.data || error.message);
        console.error('❌ [LEADGEN] Stack:', error.stack);
    }
}

// Sync historical conversations from Facebook/Instagram/WhatsApp with SSE progress
export const syncHistoricalConversations = async (req, res) => {
    // Set up SSE headers for real-time progress
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    res.flushHeaders();

    // Helper function to send SSE progress
    const sendProgress = (data) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
        const { workspaceId } = req.params;
        const { facebookMonths = 0, instagramMonths = 0, whatsappMonths = 0 } = req.body;

        console.log(`🔄 [SYNC] Starting historical sync for workspace ${workspaceId}`);
        console.log(`🔄 [SYNC] Periods - Facebook: ${facebookMonths} months, Instagram: ${instagramMonths} months, WhatsApp: ${whatsappMonths} months`);

        sendProgress({
            type: 'start',
            message: 'Senkronizasyon başlatılıyor...',
            percent: 0
        });

        // Calculate date ranges for each channel
        // Values less than 1 are treated as weeks (0.25 = 1 week, 0.5 = 2 weeks, 0.75 = 3 weeks)
        const facebookSinceDate = new Date();
        if (facebookMonths < 1 && facebookMonths > 0) {
            // Convert to days (0.25 = 7 days, 0.5 = 14 days, 0.75 = 21 days)
            const days = Math.round(facebookMonths * 28);
            facebookSinceDate.setDate(facebookSinceDate.getDate() - days);
        } else if (facebookMonths >= 1) {
            facebookSinceDate.setMonth(facebookSinceDate.getMonth() - parseInt(facebookMonths));
        }

        const instagramSinceDate = new Date();
        if (instagramMonths < 1 && instagramMonths > 0) {
            const days = Math.round(instagramMonths * 28);
            instagramSinceDate.setDate(instagramSinceDate.getDate() - days);
        } else if (instagramMonths >= 1) {
            instagramSinceDate.setMonth(instagramSinceDate.getMonth() - parseInt(instagramMonths));
        }

        // WhatsApp is limited to 24 hours by API, so we always use 24 hours
        const whatsappSinceDate = new Date();
        whatsappSinceDate.setHours(whatsappSinceDate.getHours() - 24);

        // Log calculated dates for debugging
        console.log(`📅 [SYNC] Date ranges calculated:`);
        console.log(`   - Facebook: ${facebookMonths} months -> Since ${facebookSinceDate.toISOString()}`);
        console.log(`   - Instagram: ${instagramMonths} months -> Since ${instagramSinceDate.toISOString()}`);
        console.log(`   - WhatsApp: 24 hours -> Since ${whatsappSinceDate.toISOString()}`);

        // Get all connected pages for this workspace
        const pages = await prisma.facebookPage.findMany({
            where: { workspaceId }
        });

        console.log(`🔄 [SYNC] Found ${pages.length} connected Facebook/Instagram pages`);
        pages.forEach(p => {
            console.log(`   - ${p.pageName} (FB: ${p.pageId}, IG: ${p.instagramBusinessId || 'none'})`);
        });

        // Check if any channel is selected
        if (facebookMonths === 0 && instagramMonths === 0 && whatsappMonths === 0) {
            sendProgress({
                type: 'error',
                message: 'En az bir kanal için süre seçmelisiniz.',
                error: 'No channel selected'
            });
            return res.end();
        }

        let totalConversations = 0;
        let totalMessages = 0;
        const results = [];

        // Track if we have any pages to process
        if (pages.length === 0 && whatsappMonths === 0) {
            console.log(`⚠️ [SYNC] No connected pages found for workspace ${workspaceId}`);
        }

        let currentPageIndex = 0;
        const totalTasks = pages.length * 2 + (whatsappMonths > 0 ? 1 : 0); // FB + IG per page + WhatsApp

        for (const page of pages) {
            try {
                console.log(`📄 [SYNC] Processing page: ${page.pageName} (${page.pageId})`);

                const pageProgress = ((currentPageIndex) / Math.max(totalTasks, 1)) * 100;
                sendProgress({
                    type: 'progress',
                    message: `${page.pageName} işleniyor...`,
                    percent: Math.round(pageProgress),
                    currentTask: page.pageName,
                    stats: { totalConversations, totalMessages }
                });

                let pageConversations = 0;
                let pageMessages = 0;
                const accessToken = page.pageAccessToken;
                const hasInstagram = !!page.instagramBusinessId;

                // ========== FACEBOOK MESSENGER SYNC ==========
                if (facebookMonths > 0) {
                    console.log(`💬 [SYNC] Fetching Facebook Messenger conversations for ${page.pageId}...`);
                    const fbSinceTimestamp = Math.floor(facebookSinceDate.getTime() / 1000);
                    const fbConversationsUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/${page.pageId}/conversations?fields=id,participants,updated_time,messages.since(${fbSinceTimestamp}){id,message,from,to,created_time}&limit=25&access_token=${accessToken}`;
                    console.log(`💬 [SYNC] Facebook since timestamp: ${fbSinceTimestamp} (${facebookSinceDate.toISOString()})`);

                    let fbNextUrl = fbConversationsUrl;
                    let fbConvCount = 0;
                    let fbMsgCount = 0;
                    let fbPageCount = 0;
                    const MAX_PAGES = 50; // Safety limit to prevent infinite loops
                    const processedConvIds = new Set();

                    while (fbNextUrl && fbPageCount < MAX_PAGES) {
                        try {
                            fbPageCount++;
                            const convResponse = await axios.get(fbNextUrl);
                            const conversations = convResponse.data.data || [];

                            if (fbPageCount === 1) {
                                console.log(`💬 [SYNC] Found Facebook conversations, processing...`);
                            }

                            for (const conv of conversations) {
                                // Skip if already processed (prevent duplicates)
                                if (processedConvIds.has(conv.id)) continue;
                                processedConvIds.add(conv.id);

                                const participant = conv.participants?.data?.find(p => p.id !== page.pageId);
                                if (!participant) continue;

                                let contact = await prisma.contact.findFirst({
                                    where: { facebookId: participant.id, workspaceId }
                                });

                                if (!contact) {
                                    contact = await prisma.contact.create({
                                        data: {
                                            workspaceId,
                                            facebookId: participant.id,
                                            name: participant.name || 'Facebook User',
                                            source: 'FACEBOOK'
                                        }
                                    });
                                }

                                let existingConv = await prisma.conversation.findFirst({
                                    where: {
                                        workspaceId,
                                        facebookPageId: page.id,
                                        contactId: contact.id,
                                        channel: 'FACEBOOK'
                                    }
                                });

                                if (!existingConv) {
                                    existingConv = await prisma.conversation.create({
                                        data: {
                                            workspaceId,
                                            contactId: contact.id,
                                            facebookPageId: page.id,
                                            channel: 'FACEBOOK',
                                            status: 'OPEN'
                                        }
                                    });
                                    fbConvCount++;
                                }

                                const messages = conv.messages?.data || [];
                                for (const msg of messages) {
                                    const msgDate = new Date(msg.created_time);
                                    if (msgDate < facebookSinceDate) continue;

                                    const existingMsg = await prisma.message.findFirst({
                                        where: { facebookMessageId: msg.id }
                                    });

                                    if (!existingMsg && msg.message) {
                                        const isFromContact = msg.from?.id !== page.pageId;
                                        await prisma.message.create({
                                            data: {
                                                conversationId: existingConv.id,
                                                content: msg.message,
                                                isFromContact,
                                                facebookMessageId: msg.id,
                                                createdAt: msgDate,
                                                status: 'DELIVERED'
                                            }
                                        });
                                        fbMsgCount++;
                                    }
                                }

                                if (messages.length > 0) {
                                    const latestMsgDate = new Date(messages[0].created_time);
                                    await prisma.conversation.update({
                                        where: { id: existingConv.id },
                                        data: { lastMessageAt: latestMsgDate }
                                    });
                                }
                            }

                            // Get next page URL, but verify it's different from current
                            const nextPage = convResponse.data.paging?.next || null;
                            if (nextPage === fbNextUrl) {
                                console.log(`⚠️ [SYNC] Same next URL detected, breaking loop`);
                                fbNextUrl = null;
                            } else {
                                fbNextUrl = nextPage;
                            }

                            // If no more conversations, stop
                            if (conversations.length === 0) {
                                fbNextUrl = null;
                            }
                        } catch (fetchErr) {
                            const errorMsg = fetchErr.response?.data?.error?.message || fetchErr.message;
                            console.error(`❌ [SYNC] Error fetching FB conversations:`, fetchErr.response?.data || fetchErr.message);
                            fbNextUrl = null; // Stop on error
                            break;
                        }
                    }

                    console.log(`💬 [SYNC] Processed ${processedConvIds.size} unique Facebook conversations in ${fbPageCount} pages`);

                    // Always add to results for visibility
                    results.push({
                        pageId: page.id,
                        pageName: page.pageName,
                        type: 'Facebook',
                        totalFound: processedConvIds.size,
                        newConversations: fbConvCount,
                        newMessages: fbMsgCount,
                        pagesProcessed: fbPageCount
                    });
                    totalConversations += fbConvCount;
                    totalMessages += fbMsgCount;

                    console.log(`✅ [SYNC] Facebook ${page.pageName}: ${processedConvIds.size} found, ${fbConvCount} new conversations, ${fbMsgCount} new messages`);

                    currentPageIndex++;
                    sendProgress({
                        type: 'progress',
                        message: `Facebook ${page.pageName} tamamlandı`,
                        percent: Math.round((currentPageIndex / Math.max(totalTasks, 1)) * 100),
                        currentTask: `Facebook - ${page.pageName}`,
                        stats: { totalConversations, totalMessages }
                    });
                }

                // ========== INSTAGRAM DM SYNC ==========
                if (hasInstagram && instagramMonths > 0) {
                    // Fetch Instagram conversations
                    // Instagram Messaging API: Use PAGE ID (not Instagram Business ID) with platform=instagram
                    console.log(`📸 [SYNC] Fetching Instagram conversations for page ${page.pageId} (IG: ${page.instagramBusinessId})...`);

                    // Try using Page ID with platform=instagram (recommended by Meta)
                    const igSinceTimestamp = Math.floor(instagramSinceDate.getTime() / 1000);
                    const igConversationsUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/${page.pageId}/conversations?platform=instagram&fields=id,participants,updated_time,messages.since(${igSinceTimestamp}){id,message,from,to,created_time}&limit=25&access_token=${accessToken}`;
                    console.log(`📸 [SYNC] Instagram since timestamp: ${igSinceTimestamp} (${instagramSinceDate.toISOString()})`);

                    let nextUrl = igConversationsUrl;
                    let igPageCount = 0;
                    const MAX_IG_PAGES = 50;
                    const processedIgConvIds = new Set();

                    while (nextUrl && igPageCount < MAX_IG_PAGES) {
                        try {
                            igPageCount++;
                            const convResponse = await axios.get(nextUrl);
                            const conversations = convResponse.data.data || [];

                            if (igPageCount === 1) {
                                console.log(`📸 [SYNC] Found Instagram conversations, processing...`);
                            }

                            for (const conv of conversations) {
                                // Skip if already processed
                                if (processedIgConvIds.has(conv.id)) continue;
                                processedIgConvIds.add(conv.id);

                                // Find participant that is not the page
                                const participant = conv.participants?.data?.find(p => p.id !== page.instagramBusinessId);
                                if (!participant) continue;

                                // Check if we already have this conversation
                                let existingConv = await prisma.conversation.findFirst({
                                    where: {
                                        workspaceId,
                                        instagramBusinessId: page.instagramBusinessId,
                                        contact: {
                                            is: {
                                                instagramId: participant.id
                                            }
                                        }
                                    }
                                });

                                // Find or create contact
                                let contact = await prisma.contact.findFirst({
                                    where: {
                                        instagramId: participant.id,
                                        workspaceId
                                    }
                                });

                                if (!contact) {
                                    // Get Instagram user profile
                                    try {
                                        const profileUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/${participant.id}?fields=name,username,profile_pic&access_token=${accessToken}`;
                                        const profileRes = await axios.get(profileUrl);
                                        const profile = profileRes.data;

                                        contact = await prisma.contact.create({
                                            data: {
                                                workspaceId,
                                                instagramId: participant.id,
                                                name: profile.name || profile.username || 'Instagram User',
                                                instagramUsername: profile.username,
                                                avatar: profile.profile_pic,
                                                source: 'INSTAGRAM'
                                            }
                                        });
                                    } catch (profileErr) {
                                        contact = await prisma.contact.create({
                                            data: {
                                                workspaceId,
                                                instagramId: participant.id,
                                                name: participant.username || 'Instagram User',
                                                source: 'INSTAGRAM'
                                            }
                                        });
                                    }
                                }

                                if (!existingConv) {
                                    existingConv = await prisma.conversation.create({
                                        data: {
                                            workspaceId,
                                            contactId: contact.id,
                                            facebookPageId: page.id,
                                            instagramBusinessId: page.instagramBusinessId,
                                            channel: 'INSTAGRAM',
                                            status: 'OPEN'
                                        }
                                    });
                                    pageConversations++;
                                }

                                // Process messages
                                const messages = conv.messages?.data || [];
                                for (const msg of messages) {
                                    const msgDate = new Date(msg.created_time);
                                    if (msgDate < instagramSinceDate) continue;

                                    // Check if message already exists
                                    const existingMsg = await prisma.message.findFirst({
                                        where: {
                                            facebookMessageId: msg.id
                                        }
                                    });

                                    if (!existingMsg && msg.message) {
                                        const isFromContact = msg.from?.id !== page.instagramBusinessId;
                                        await prisma.message.create({
                                            data: {
                                                conversationId: existingConv.id,
                                                content: msg.message,
                                                isFromContact,
                                                facebookMessageId: msg.id,
                                                createdAt: msgDate,
                                                status: 'DELIVERED'
                                            }
                                        });
                                        pageMessages++;
                                    }
                                }

                                // Update conversation's lastMessageAt
                                if (messages.length > 0) {
                                    const latestMsgDate = new Date(messages[0].created_time);
                                    await prisma.conversation.update({
                                        where: { id: existingConv.id },
                                        data: { lastMessageAt: latestMsgDate }
                                    });
                                }
                            }

                            // Get next page URL with safety checks
                            const igNextPage = convResponse.data.paging?.next || null;
                            if (igNextPage === nextUrl || conversations.length === 0) {
                                nextUrl = null;
                            } else {
                                nextUrl = igNextPage;
                            }
                        } catch (fetchErr) {
                            const errorMsg = fetchErr.response?.data?.error?.message || fetchErr.message;
                            console.error(`❌ [SYNC] Error fetching IG conversations:`, fetchErr.response?.data || fetchErr.message);
                            nextUrl = null; // Stop on error

                            // Check for permission error
                            if (fetchErr.response?.data?.error?.code === 3 || errorMsg.includes('capability')) {
                                results.push({
                                    pageId: page.id,
                                    pageName: page.pageName,
                                    type: 'Instagram',
                                    conversations: 0,
                                    messages: 0,
                                    error: 'API izni yetersiz. Meta Developer Console\'dan "instagram_manage_messages" Advanced Access izni gerekiyor.'
                                });
                            }
                            break;
                        }
                    }

                    console.log(`📸 [SYNC] Processed ${processedIgConvIds.size} unique Instagram conversations in ${igPageCount} pages`);

                    // Always add to results for visibility
                    results.push({
                        pageId: page.id,
                        pageName: page.pageName,
                        type: 'Instagram',
                        totalFound: processedIgConvIds.size,
                        newConversations: pageConversations,
                        newMessages: pageMessages,
                        pagesProcessed: igPageCount
                    });
                    totalConversations += pageConversations;
                    totalMessages += pageMessages;

                    console.log(`✅ [SYNC] Instagram ${page.pageName}: ${processedIgConvIds.size} found, ${pageConversations} new conversations, ${pageMessages} new messages`);

                    currentPageIndex++;
                    sendProgress({
                        type: 'progress',
                        message: `Instagram ${page.pageName} tamamlandı`,
                        percent: Math.round((currentPageIndex / Math.max(totalTasks, 1)) * 100),
                        currentTask: `Instagram - ${page.pageName}`,
                        stats: { totalConversations, totalMessages }
                    });
                }

            } catch (pageErr) {
                console.error(`❌ [SYNC] Error processing page ${page.pageName}:`, pageErr.message);
                results.push({
                    pageId: page.id,
                    pageName: page.pageName,
                    error: pageErr.message
                });
            }
        }

        console.log(`✅ [SYNC] Facebook/Instagram Complete! ${totalConversations} conversations, ${totalMessages} messages`);

        // ========== WHATSAPP SYNC ==========
        // Skip WhatsApp if not selected
        if (whatsappMonths === 0) {
            console.log(`⏭️ [SYNC] Skipping WhatsApp (not selected)`);
        } else {
            // Fetch WhatsApp phone numbers for this workspace
            const whatsappNumbers = await prisma.whatsappPhoneNumber.findMany({
                where: { workspaceId }
            });

            console.log(`📱 [SYNC] Found ${whatsappNumbers.length} WhatsApp numbers to sync`);

            // Use whatsappSinceDate for filtering
            const sinceDate = whatsappSinceDate;

            for (const waNumber of whatsappNumbers) {
                try {
                    console.log(`📱 [SYNC] Processing WhatsApp: ${waNumber.displayPhoneNumber} (${waNumber.phoneNumberId})`);

                    sendProgress({
                        type: 'progress',
                        message: `WhatsApp ${waNumber.displayPhoneNumber} işleniyor...`,
                        percent: Math.round(((currentPageIndex) / Math.max(totalTasks, 1)) * 100),
                        currentTask: `WhatsApp - ${waNumber.displayPhoneNumber}`,
                        stats: { totalConversations, totalMessages }
                    });

                    let waConversations = 0;
                    let waMessages = 0;

                    // WhatsApp Business API doesn't have a direct "get all conversations" endpoint
                    // But we can try to get conversations from the phone number
                    // Note: WhatsApp API has limited historical message access (24-hour window)

                    try {
                        // Try to fetch conversations using the Business API
                        // This endpoint may have limitations based on your WhatsApp tier
                        const waConvUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/${waNumber.phoneNumberId}/conversations?access_token=${waNumber.accessToken}`;

                        const waConvResponse = await axios.get(waConvUrl);
                        const waConversationsList = waConvResponse.data.data || [];

                        for (const waConv of waConversationsList) {
                            // Get conversation details
                            try {
                                const convDetailUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/${waConv.id}?fields=id,messages{id,from,text,timestamp,type}&access_token=${waNumber.accessToken}`;
                                const convDetailRes = await axios.get(convDetailUrl);
                                const convDetail = convDetailRes.data;

                                // Extract customer phone from messages
                                const messages = convDetail.messages?.data || [];
                                if (messages.length === 0) continue;

                                // Find customer phone (not our number)
                                const customerMessage = messages.find(m => m.from !== waNumber.phoneNumberId);
                                if (!customerMessage) continue;

                                const customerPhone = customerMessage.from;

                                // Find or create contact
                                let contact = await prisma.contact.findFirst({
                                    where: {
                                        whatsappId: customerPhone,
                                        workspaceId
                                    }
                                });

                                if (!contact) {
                                    // Try to get profile
                                    try {
                                        const profileUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/${customerPhone}?access_token=${waNumber.accessToken}`;
                                        const profileRes = await axios.get(profileUrl);
                                        const profile = profileRes.data;

                                        contact = await prisma.contact.create({
                                            data: {
                                                workspaceId,
                                                whatsappId: customerPhone,
                                                phone: customerPhone,
                                                name: profile.profile?.name || customerPhone,
                                                source: 'WHATSAPP'
                                            }
                                        });
                                    } catch (profileErr) {
                                        contact = await prisma.contact.create({
                                            data: {
                                                workspaceId,
                                                whatsappId: customerPhone,
                                                phone: customerPhone,
                                                name: customerPhone,
                                                source: 'WHATSAPP'
                                            }
                                        });
                                    }
                                }

                                // Find or create conversation
                                let existingConv = await prisma.conversation.findFirst({
                                    where: {
                                        workspaceId,
                                        whatsappPhoneNumberId: waNumber.id,
                                        contactId: contact.id
                                    }
                                });

                                if (!existingConv) {
                                    existingConv = await prisma.conversation.create({
                                        data: {
                                            workspaceId,
                                            contactId: contact.id,
                                            whatsappPhoneNumberId: waNumber.id,
                                            channel: 'WHATSAPP',
                                            status: 'OPEN'
                                        }
                                    });
                                    waConversations++;
                                }

                                // Process messages
                                for (const msg of messages) {
                                    const msgDate = new Date(parseInt(msg.timestamp) * 1000);
                                    if (msgDate < whatsappSinceDate) continue;

                                    // Check if message already exists
                                    const existingMsg = await prisma.message.findFirst({
                                        where: {
                                            whatsappMessageId: msg.id
                                        }
                                    });

                                    if (!existingMsg && msg.text?.body) {
                                        const isFromContact = msg.from !== waNumber.phoneNumberId;
                                        await prisma.message.create({
                                            data: {
                                                conversationId: existingConv.id,
                                                content: msg.text.body,
                                                isFromContact,
                                                whatsappMessageId: msg.id,
                                                createdAt: msgDate,
                                                status: 'DELIVERED'
                                            }
                                        });
                                        waMessages++;
                                    }
                                }

                                // Update conversation's lastMessageAt
                                if (messages.length > 0) {
                                    const latestMsgDate = new Date(parseInt(messages[0].timestamp) * 1000);
                                    await prisma.conversation.update({
                                        where: { id: existingConv.id },
                                        data: { lastMessageAt: latestMsgDate }
                                    });
                                }

                            } catch (convErr) {
                                console.error(`❌ [SYNC] Error processing WA conversation:`, convErr.response?.data || convErr.message);
                            }
                        }

                    } catch (waApiErr) {
                        // WhatsApp API may not support this endpoint for all accounts
                        console.log(`⚠️ [SYNC] WhatsApp conversations API not available or limited:`, waApiErr.response?.data?.error?.message || waApiErr.message);
                    }

                    results.push({
                        pageId: waNumber.id,
                        pageName: waNumber.displayPhoneNumber,
                        type: 'WhatsApp',
                        conversations: waConversations,
                        messages: waMessages
                    });

                    totalConversations += waConversations;
                    totalMessages += waMessages;

                    console.log(`✅ [SYNC] WhatsApp ${waNumber.displayPhoneNumber}: ${waConversations} conversations, ${waMessages} messages`);

                } catch (waErr) {
                    console.error(`❌ [SYNC] Error processing WhatsApp ${waNumber.displayPhoneNumber}:`, waErr.message);
                    results.push({
                        pageId: waNumber.id,
                        pageName: waNumber.displayPhoneNumber,
                        type: 'WhatsApp',
                        error: waErr.message
                    });
                }
            }
        } // End of WhatsApp sync block

        console.log(`✅ [SYNC] Complete! Total: ${totalConversations} conversations, ${totalMessages} messages`);

        // Send final result
        sendProgress({
            type: 'complete',
            message: 'Senkronizasyon tamamlandı!',
            percent: 100,
            success: true,
            totalConversations,
            totalMessages,
            results,
            note: 'WhatsApp geçmiş mesaj erişimi 24 saatlik pencere ile sınırlı olabilir.'
        });

        res.end();

    } catch (error) {
        console.error('❌ [SYNC] Error:', error);
        sendProgress({
            type: 'error',
            message: 'Senkronizasyon sırasında hata oluştu: ' + error.message,
            error: error.message
        });
        res.end();
    }
}