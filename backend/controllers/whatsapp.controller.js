import prisma from '../lib/prisma.js';
import { executeRule } from '../services/ruleEngine.service.js';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getIO, emitToWorkspace } from '../socket.js';
import { applyChannelRouting, canBotRespond } from '../services/conversationRouting.service.js';
import { normalizePhone } from '../utils/phoneNormalizer.js';
import { isEmojiOrIconOnly } from '../utils/messageClassifier.js';
import { hasProfanity, censorProfanity } from '../utils/profanityFilter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MEDIA_DIR = path.join(__dirname, '..', 'uploads', 'media');

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

// Helper to generate UI-Avatars fallback URL
const getAvatarFallback = (name, size = 150) => {
    const encodedName = encodeURIComponent(name || 'User');
    return `https://ui-avatars.com/api/?name=${encodedName}&background=25D366&color=fff&size=${size}`;
};

// List Available WhatsApp Numbers from Meta (using User Token)
export const getAvailablePhoneNumbers = async (req, res) => {
    try {
        console.log('📱 [WhatsApp] getAvailablePhoneNumbers called by user:', req.user?.id);

        let { userAccessToken } = req.body;

        // Always fetch fresh token from database (OAuth might have just updated it)
        if (!userAccessToken && req.user) {
            const freshUser = await prisma.user.findUnique({
                where: { id: req.user.id },
                select: { facebookAccessToken: true }
            });
            userAccessToken = freshUser?.facebookAccessToken;
            console.log('📱 [WhatsApp] Using fresh token from DB for user:', req.user.id, '| Has token:', !!userAccessToken);
        }

        if (!userAccessToken) {
            console.log('📱 [WhatsApp] ERROR: No access token available');
            return res.status(400).json({ error: 'User access token required. Please connect with Facebook first.' });
        }

        console.log('📱 [WhatsApp] Token available, starting phone number fetch...');

        const availableNumbers = [];

        // Method 1: Try using debug_token to get WABA info
        try {
            console.log('📱 [WhatsApp] Trying Method 1: debug_token approach');

            // Get the app-scoped user ID and check granular scopes
            const debugResponse = await axios.get(
                `https://graph.facebook.com/${GRAPH_API_VERSION}/debug_token`,
                {
                    params: {
                        input_token: userAccessToken,
                        access_token: userAccessToken
                    }
                }
            );

            const tokenData = debugResponse.data?.data;
            console.log('📱 [WhatsApp] Token debug info:', JSON.stringify(tokenData?.granular_scopes || []));

            // Look for whatsapp_business_management scope which contains WABA IDs
            const waScope = tokenData?.granular_scopes?.find(s => s.scope === 'whatsapp_business_management');

            if (waScope?.target_ids?.length > 0) {
                console.log('📱 [WhatsApp] Found WABA IDs from token:', waScope.target_ids);

                // Fetch phone numbers for each WABA
                for (const wabaId of waScope.target_ids) {
                    try {
                        const wabaResponse = await axios.get(
                            `https://graph.facebook.com/${GRAPH_API_VERSION}/${wabaId}`,
                            {
                                params: {
                                    fields: 'id,name,phone_numbers{id,display_phone_number,verified_name,quality_rating}',
                                    access_token: userAccessToken
                                }
                            }
                        );

                        const waba = wabaResponse.data;
                        const phones = waba.phone_numbers?.data || [];

                        phones.forEach(phone => {
                            availableNumbers.push({
                                id: phone.id,
                                display_phone_number: phone.display_phone_number,
                                verified_name: phone.verified_name,
                                quality_rating: phone.quality_rating,
                                waba_id: wabaId,
                                waba_name: waba.name,
                                business_name: waba.name
                            });
                        });

                        console.log(`📱 [WhatsApp] Found ${phones.length} phone numbers for WABA ${wabaId}`);
                    } catch (wabaError) {
                        console.error(`📱 [WhatsApp] Error fetching WABA ${wabaId}:`, wabaError.response?.data?.error?.message || wabaError.message);
                    }
                }
            }
        } catch (debugError) {
            console.log('📱 [WhatsApp] Method 1 failed:', debugError.response?.data?.error?.message || debugError.message);
        }

        // Method 2: If Method 1 didn't find anything, try shared_whatsapp_business_accounts
        if (availableNumbers.length === 0) {
            try {
                console.log('📱 [WhatsApp] Trying Method 2: shared_whatsapp_business_accounts');

                const sharedResponse = await axios.get(
                    `https://graph.facebook.com/${GRAPH_API_VERSION}/me`,
                    {
                        params: {
                            fields: 'id,name',
                            access_token: userAccessToken
                        }
                    }
                );

                console.log('📱 [WhatsApp] User info:', sharedResponse.data);

                // Try to get WABAs the user has access to via client_whatsapp_business_accounts
                const clientWabaResponse = await axios.get(
                    `https://graph.facebook.com/${GRAPH_API_VERSION}/me/client_whatsapp_business_accounts`,
                    {
                        params: {
                            access_token: userAccessToken
                        }
                    }
                );

                const clientWabas = clientWabaResponse.data?.data || [];
                console.log('📱 [WhatsApp] Found client WABAs:', clientWabas.length);

                for (const waba of clientWabas) {
                    try {
                        const phoneResponse = await axios.get(
                            `https://graph.facebook.com/${GRAPH_API_VERSION}/${waba.id}/phone_numbers`,
                            {
                                params: {
                                    access_token: userAccessToken
                                }
                            }
                        );

                        const phones = phoneResponse.data?.data || [];
                        phones.forEach(phone => {
                            availableNumbers.push({
                                id: phone.id,
                                display_phone_number: phone.display_phone_number,
                                waba_id: waba.id,
                                waba_name: waba.name || 'WhatsApp Business',
                                business_name: waba.name || 'WhatsApp Business'
                            });
                        });
                    } catch (phoneError) {
                        console.error(`📱 [WhatsApp] Error fetching phones for WABA ${waba.id}:`, phoneError.response?.data?.error?.message);
                    }
                }
            } catch (method2Error) {
                console.log('📱 [WhatsApp] Method 2 failed:', method2Error.response?.data?.error?.message || method2Error.message);
            }
        }

        // Method 3: Original method - businesses endpoint (fallback)
        if (availableNumbers.length === 0) {
            try {
                console.log('📱 [WhatsApp] Trying Method 3: businesses endpoint (original)');

                const response = await axios.get(
                    `https://graph.facebook.com/${GRAPH_API_VERSION}/me`,
                    {
                        params: {
                            fields: 'businesses{id,name,owned_whatsapp_business_accounts{id,name,phone_numbers{id,display_phone_number,name_status}}}',
                            access_token: userAccessToken
                        }
                    }
                );

                const businesses = response.data.businesses?.data || [];

                businesses.forEach(business => {
                    const wabas = business.owned_whatsapp_business_accounts?.data || [];
                    wabas.forEach(waba => {
                        const phones = waba.phone_numbers?.data || [];
                        phones.forEach(phone => {
                            availableNumbers.push({
                                id: phone.id,
                                display_phone_number: phone.display_phone_number,
                                waba_id: waba.id,
                                waba_name: waba.name,
                                business_name: business.name
                            });
                        });
                    });
                });
            } catch (method3Error) {
                console.log('📱 [WhatsApp] Method 3 failed:', method3Error.response?.data?.error?.message || method3Error.message);
            }
        }

        console.log(`📱 [WhatsApp] Total available numbers found: ${availableNumbers.length}`);
        res.json({ availableNumbers });

    } catch (error) {
        console.error('Fetch Meta WhatsApp numbers error:', error.response?.data || error);
        const errorMessage = error.response?.data?.error?.message || error.message || 'Unknown error';
        console.error('📱 [WhatsApp] Error details:', errorMessage);

        if (errorMessage.includes('permission') || errorMessage.includes('scope')) {
            return res.status(403).json({
                error: 'WhatsApp izinleri eksik. Lütfen WhatsApp sekmesinden tekrar bağlantı yapın.',
                availableNumbers: []
            });
        }

        res.json({ availableNumbers: [], error: errorMessage });
    }
};

// Handle WhatsApp Embedded Signup callback
// This function processes the callback from Meta's Embedded Signup flow
// and exchanges the temporary code for permanent access token
export const handleEmbeddedSignup = async (req, res) => {
    console.log('📱 [WhatsApp Embedded Signup] Callback received');
    try {
        const { code, workspaceId } = req.body;

        if (!code || !workspaceId) {
            console.log('📱 [Embedded Signup] Missing required fields:', { code: !!code, workspaceId: !!workspaceId });
            return res.status(400).json({ error: 'Missing code or workspaceId' });
        }

        const appId = process.env.FACEBOOK_APP_ID;
        const appSecret = process.env.FACEBOOK_APP_SECRET;

        if (!appId || !appSecret) {
            console.error('📱 [Embedded Signup] Facebook App credentials not configured');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        // Step 1: Exchange the code for access token
        console.log('📱 [Embedded Signup] Exchanging code for access token...');
        const tokenResponse = await axios.get(
            `https://graph.facebook.com/${GRAPH_API_VERSION}/oauth/access_token`,
            {
                params: {
                    client_id: appId,
                    client_secret: appSecret,
                    code: code
                }
            }
        );

        const accessToken = tokenResponse.data.access_token;
        if (!accessToken) {
            console.error('📱 [Embedded Signup] Failed to get access token');
            return res.status(400).json({ error: 'Failed to exchange code for access token' });
        }
        console.log('📱 [Embedded Signup] ✅ Access token obtained');

        // Step 2: Debug token to find WABA IDs the user granted access to
        console.log('📱 [Embedded Signup] Debugging token to find WABAs...');
        const debugResponse = await axios.get(
            `https://graph.facebook.com/${GRAPH_API_VERSION}/debug_token`,
            {
                params: {
                    input_token: accessToken,
                    access_token: `${appId}|${appSecret}`
                }
            }
        );

        const tokenData = debugResponse.data.data;
        console.log('📱 [Embedded Signup DEBUG] full tokenData:', JSON.stringify(tokenData));
        const scopes = tokenData.granular_scopes || [];

        // Find WABA IDs from whatsapp_business_management scope
        const wabaScope = scopes.find(s => s.scope === 'whatsapp_business_management');
        let wabaIds = wabaScope?.target_ids || [];

        if (wabaIds.length === 0) {
            console.log('⚠️ [Embedded Signup] Target IDs empty in debug_token. Trying fallback discovery methods...');
            
            // Fallback 1: Try client_whatsapp_business_accounts
            try {
                const clientWabaResponse = await axios.get(
                    `https://graph.facebook.com/${GRAPH_API_VERSION}/me/client_whatsapp_business_accounts`,
                    { params: { access_token: accessToken } }
                );
                const clientWabas = clientWabaResponse.data?.data || [];
                if (clientWabas.length > 0) {
                    wabaIds = clientWabas.map(w => w.id);
                    console.log('✅ [Embedded Signup] Found WABA IDs via client_wabas:', wabaIds);
                }
            } catch (e1) {
                console.log('⚠️ [Embedded Signup] Fallback 1 failed:', e1.response?.data || e1.message);
            }
            
            // Fallback 2: Try businesses owned WABAs
            if (wabaIds.length === 0) {
                try {
                    const bizResponse = await axios.get(
                        `https://graph.facebook.com/${GRAPH_API_VERSION}/me`,
                        {
                            params: {
                                fields: 'businesses{id,name,owned_whatsapp_business_accounts{id,name}}',
                                access_token: accessToken
                            }
                        }
                    );
                    const businesses = bizResponse.data.businesses?.data || [];
                    for (const biz of businesses) {
                        const ownedWabas = biz.owned_whatsapp_business_accounts?.data || [];
                        if (ownedWabas.length > 0) {
                            wabaIds = [...wabaIds, ...ownedWabas.map(w => w.id)];
                        }
                    }
                    if (wabaIds.length > 0) {
                        console.log('✅ [Embedded Signup] Found WABA IDs via businesses owned accounts:', wabaIds);
                    }
                } catch (e2) {
                    console.log('⚠️ [Embedded Signup] Fallback 2 failed:', e2.response?.data || e2.message);
                }
            }
        }

        if (wabaIds.length === 0) {
            console.error('📱 [Embedded Signup] No WABAs found in token');
            return res.status(400).json({ error: 'No WhatsApp Business Accounts found in authorization' });
        }

        console.log('📱 [Embedded Signup] Found WABAs:', wabaIds);

        // Step 3: Discover phone numbers for each WABA (don't save yet — let user choose)
        let availableNumbers = [];
        for (const wabaId of wabaIds) {
            try {
                const wabaResponse = await axios.get(
                    `https://graph.facebook.com/${GRAPH_API_VERSION}/${wabaId}`,
                    {
                        params: {
                            fields: 'id,name,phone_numbers{id,display_phone_number,verified_name,quality_rating}',
                            access_token: accessToken
                        }
                    }
                );

                const wabaName = wabaResponse.data.name || 'WhatsApp Business Account';
                const phoneNumbers = wabaResponse.data.phone_numbers?.data || [];

                console.log(`📱 [Embedded Signup] WABA ${wabaId}: ${wabaName}, ${phoneNumbers.length} phone(s)`);

                for (const phone of phoneNumbers) {
                    // Check if already connected to another workspace
                    const existing = await prisma.whatsappPhoneNumber.findUnique({
                        where: { phoneNumberId: phone.id }
                    });

                    if (existing && existing.workspaceId !== workspaceId) {
                        // Update token for other workspace's number (don't steal it)
                        await prisma.whatsappPhoneNumber.update({
                            where: { phoneNumberId: phone.id },
                            data: { accessToken }
                        });
                        console.log(`🔄 [Embedded Signup] Token updated for ${phone.display_phone_number} (other workspace, skipping)`);
                        continue;
                    }

                    availableNumbers.push({
                        id: phone.id,
                        display_phone_number: phone.display_phone_number || 'Unknown',
                        verified_name: phone.verified_name || wabaName,
                        waba_id: wabaId,
                        waba_name: wabaName,
                        quality_rating: phone.quality_rating,
                        already_connected: !!existing
                    });
                }

                // Subscribe WABA to webhooks
                try {
                    await axios.post(
                        `https://graph.facebook.com/${GRAPH_API_VERSION}/${wabaId}/subscribed_apps`,
                        {},
                        { headers: { Authorization: `Bearer ${accessToken}` } }
                    );
                    console.log(`✅ [Embedded Signup] WABA ${wabaId} subscribed to webhooks`);
                } catch (webhookError) {
                    console.error('⚠️ [Embedded Signup] Webhook subscription warning:', webhookError.response?.data?.error?.message || webhookError.message);
                }

            } catch (wabaError) {
                console.error(`⚠️ [Embedded Signup] Error processing WABA ${wabaId}:`, wabaError.response?.data?.error?.message || wabaError.message);
            }
        }

        // Store the access token on the user for the subsequent connect call
        if (req.user?.id) {
            await prisma.user.update({
                where: { id: req.user.id },
                data: { facebookAccessToken: accessToken }
            });
        }

        console.log(`✅ [Embedded Signup] Discovery complete! Found ${availableNumbers.length} available number(s)`);

        res.json({
            success: true,
            availableNumbers,
            message: `${availableNumbers.length} numara bulundu. Bağlamak istediğinizi seçin.`
        });

    } catch (error) {
        console.error('❌ [Embedded Signup] Error:', error.response?.data || error.message);
        res.status(500).json({
            error: 'Failed to complete Embedded Signup',
            details: error.response?.data?.error?.message || error.message
        });
    }
};

// Connect WhatsApp Phone Number
export const connectPhoneNumber = async (req, res) => {
    console.log('📱 [WhatsApp] connectPhoneNumber CALLED with body:', JSON.stringify(req.body, null, 2));
    try {
        let { phoneNumberId, wabaId, name, displayPhoneNumber, accessToken, workspaceId } = req.body;

        // Priority: 1. System User Token (never expires), 2. User's Facebook Token from middleware
        const systemUserToken = process.env.WHATSAPP_SYSTEM_USER_TOKEN;

        if (systemUserToken) {
            accessToken = systemUserToken;
            console.log('📱 [WhatsApp] Using System User Token (permanent)');
        } else if (!accessToken || accessToken === 'backend_will_handle') {
            // Use token from middleware (already fetched in authenticateJWT)
            if (req.user?.facebookAccessToken) {
                accessToken = req.user.facebookAccessToken;
                console.log('📱 [WhatsApp] Using User Facebook Token from middleware (60 day expiry)');
            }
        }

        if (!phoneNumberId || !wabaId || !workspaceId) {
            console.log('📱 [WhatsApp] Missing fields:', { phoneNumberId: !!phoneNumberId, wabaId: !!wabaId, workspaceId: !!workspaceId });
            return res.status(400).json({ error: 'Missing required fields.' });
        }

        if (!accessToken) {
            console.log('📱 [WhatsApp] No access token available');
            return res.status(400).json({ error: 'Facebook token not found. Please reconnect with Facebook first.' });
        }

        console.log('📱 [WhatsApp] Checking for existing number...');
        // Check if already connected
        const existingNumber = await prisma.whatsappPhoneNumber.findUnique({
            where: { phoneNumberId }
        });
        console.log('📱 [WhatsApp] existingNumber result:', existingNumber ? 'FOUND' : 'NOT FOUND');

        if (existingNumber) {
            console.log('📱 [WhatsApp] Updating existing number...');
            const updated = await prisma.whatsappPhoneNumber.update({
                where: { phoneNumberId },
                data: {
                    name,
                    displayPhoneNumber,
                    accessToken,
                    workspaceId
                }
            });
            console.log('📱 [WhatsApp] Update complete, now subscribing...');

            // Also subscribe to webhooks when updating (in case it wasn't done before)
            try {
                console.log(`📱 [WhatsApp] Subscribing WABA ${wabaId} to webhooks...`);
                await axios.post(
                    `https://graph.facebook.com/${GRAPH_API_VERSION}/${wabaId}/subscribed_apps`,
                    {},
                    { headers: { Authorization: `Bearer ${accessToken}` } }
                );
                console.log(`✅ [WhatsApp] WABA ${wabaId} webhook subscription successful`);
            } catch (webhookError) {
                console.error('⚠️ [WhatsApp] Webhook subscription warning:', webhookError.response?.data || webhookError.message);
            }

            // Share WABA with ChatCRM Business Portfolio (for webhook access)
            const CHATCRM_BUSINESS_ID = process.env.CHATCRM_BUSINESS_ID || '594240510685022';
            try {
                console.log(`📱 [WhatsApp] Sharing WABA ${wabaId} with ChatCRM Business (${CHATCRM_BUSINESS_ID})...`);
                await axios.post(
                    `https://graph.facebook.com/${GRAPH_API_VERSION}/${wabaId}/share_whatsapp_business_account`,
                    { partner_id: CHATCRM_BUSINESS_ID },
                    { headers: { Authorization: `Bearer ${accessToken}` } }
                );
                console.log(`✅ [WhatsApp] WABA ${wabaId} shared with ChatCRM`);
            } catch (shareError) {
                console.error('⚠️ [WhatsApp] Share WABA warning:', shareError.response?.data?.error?.message || shareError.message);
            }

            return res.json({ phoneNumber: updated, message: 'Phone number updated' });
        }

        console.log('📱 [WhatsApp] Creating NEW number...');
        const newNumber = await prisma.whatsappPhoneNumber.create({
            data: {
                phoneNumberId,
                wabaId,
                name,
                displayPhoneNumber,
                accessToken,
                workspaceId
            }
        });
        console.log('📱 [WhatsApp] Create complete:', newNumber.id);

        // Subscribe to webhooks (messages)
        try {
            console.log(`📱 [WhatsApp] Subscribing NEW WABA ${wabaId} to webhooks...`);
            const subResponse = await axios.post(
                `https://graph.facebook.com/${GRAPH_API_VERSION}/${wabaId}/subscribed_apps`,
                {},
                {
                    headers: { Authorization: `Bearer ${accessToken}` }
                }
            );
            console.log(`✅ [WhatsApp] NEW WABA ${wabaId} subscription response:`, subResponse.data);
        } catch (webhookError) {
            console.error('⚠️ [WhatsApp] NEW Webhook subscription warning:', webhookError.response?.data || webhookError.message);
        }

        // Share WABA with ChatCRM Business Portfolio (for webhook access)
        const CHATCRM_BUSINESS_ID = process.env.CHATCRM_BUSINESS_ID || '594240510685022';
        try {
            console.log(`📱 [WhatsApp] Sharing WABA ${wabaId} with ChatCRM Business (${CHATCRM_BUSINESS_ID})...`);

            // Try share_whatsapp_business_account endpoint
            const shareResponse = await axios.post(
                `https://graph.facebook.com/${GRAPH_API_VERSION}/${wabaId}/share_whatsapp_business_account`,
                {
                    partner_id: CHATCRM_BUSINESS_ID
                },
                {
                    headers: { Authorization: `Bearer ${accessToken}` }
                }
            );
            console.log(`✅ [WhatsApp] WABA ${wabaId} shared with ChatCRM:`, shareResponse.data);
        } catch (shareError) {
            console.error('⚠️ [WhatsApp] Share WABA warning:', shareError.response?.data || shareError.message);

            // Fallback: Try assigned_users if share fails
            try {
                console.log(`📱 [WhatsApp] Fallback: Trying assigned_users for WABA ${wabaId}...`);
                await axios.post(
                    `https://graph.facebook.com/${GRAPH_API_VERSION}/${wabaId}/assigned_users`,
                    {
                        user: CHATCRM_BUSINESS_ID,
                        tasks: ['MANAGE']
                    },
                    { headers: { Authorization: `Bearer ${accessToken}` } }
                );
                console.log(`✅ [WhatsApp] Fallback assigned_users succeeded`);
            } catch (fallbackError) {
                console.error('⚠️ [WhatsApp] Fallback also failed:', fallbackError.response?.data?.error?.message || fallbackError.message);
            }
        }

        res.status(201).json({ phoneNumber: newNumber });

    } catch (error) {
        console.error('Connect WhatsApp number error:', error);
        res.status(500).json({ error: 'Failed to connect phone number' });
    }
};

// Get Connected Numbers
export const getPhoneNumbers = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const numbers = await prisma.whatsappPhoneNumber.findMany({
            where: { workspaceId }
        });
        res.json({ phoneNumbers: numbers });
    } catch (error) {
        console.error('Get WhatsApp numbers error:', error);
        res.status(500).json({ error: 'Failed to fetch phone numbers' });
    }
};

// Disconnect Number
export const disconnectPhoneNumber = async (req, res) => {
    try {
        const { id } = req.params;

        console.log(`🔌 [Disconnect WhatsApp] START - ID: ${id}`);

        // Find phone number with conversations
        const phoneNumber = await prisma.whatsappPhoneNumber.findUnique({
            where: { id },
            include: {
                conversations: {
                    select: { id: true }
                }
            }
        });

        if (!phoneNumber) {
            return res.status(404).json({ error: 'Phone number not found' });
        }

        const conversationCount = phoneNumber.conversations.length;
        console.log(`💾 Found ${conversationCount} conversations - will be PRESERVED`);

        // IMPORTANT: Don't delete conversations, messages, or contacts!
        // Just unlink them from the phone number and delete the connection

        // Unlink conversations from this phone number
        await prisma.conversation.updateMany({
            where: { whatsappPhoneNumberId: phoneNumber.id },
            data: { whatsappPhoneNumberId: null }
        });
        console.log(`🔗 Unlinked ${conversationCount} conversations from phone number (data preserved)`);

        // Delete the phone number connection
        await prisma.whatsappPhoneNumber.delete({ where: { id } });

        console.log(`✅ [Disconnect WhatsApp] COMPLETE - Phone number disconnected. All data preserved.`);

        res.json({
            message: 'Disconnected successfully. All conversations, messages, and contacts are preserved.',
            preservedConversations: conversationCount
        });
    } catch (error) {
        console.error('Disconnect WhatsApp error:', error);
        res.status(500).json({ error: 'Failed to disconnect number' });
    }
};

export const updateWhatsappBot = async (req, res) => {
    try {
        const { id } = req.params;
        const { assignedBotId } = req.body;

        // If a bot is assigned, automatically activate it
        if (assignedBotId) {
            await prisma.aIBot.update({
                where: { id: assignedBotId },
                data: { isActive: true }
            });
            console.log(`✅ Bot ${assignedBotId} automatically activated (assigned to WhatsApp channel)`);
        }

        const number = await prisma.whatsappPhoneNumber.update({
            where: { id },
            data: { assignedBotId: assignedBotId || null }
        });

        // Propagation: Update all OPEN conversations for this WA number
        await prisma.conversation.updateMany({
            where: {
                whatsappPhoneNumberId: number.id,
                status: 'OPEN'
            },
            data: {
                assignedBotId: assignedBotId || null
            }
        });

        res.json({ phoneNumber: number });
    } catch (error) {
        console.error('Update WhatsApp bot error:', error);
        res.status(500).json({ error: 'Failed to update assigned bot' });
    }
};

// Webhook Verification
export const webhookVerify = (req, res) => {
    const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || process.env.FACEBOOK_VERIFY_TOKEN || 'chatinstomer_verify_token';

    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('WhatsApp Webhook verified');
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    } else {
        res.sendStatus(400);
    }
};

// Webhook Handler (Incoming Messages)
export const webhookHandler = async (req, res) => {
    try {
        const body = req.body;

        if (body.object) {
            console.log('📱 WhatsApp Webhook Received:', JSON.stringify(body, null, 2));

            const value = body.entry?.[0]?.changes?.[0]?.value;

            // Handle status updates (sent, delivered, read)
            if (value?.statuses && value.statuses.length > 0) {
                console.log(`📊 [WA STATUS] Received ${value.statuses.length} status updates`);

                for (const statusUpdate of value.statuses) {
                    const messageId = statusUpdate.id;
                    const rawStatus = statusUpdate.status;
                    const status = rawStatus?.toUpperCase(); // sent, delivered, read, failed

                    console.log(`📊 [WA STATUS] Message: ${messageId}, Raw: ${rawStatus}, Parsed: ${status}`);

                    if (messageId && status) {
                        // Skip 'SENT' status as we already set it when sending
                        if (status === 'SENT') {
                            console.log(`ℹ️ [WA STATUS] Skipping SENT status (already set)`);
                            continue;
                        }

                        // Map status to our enum
                        const newStatus = status === 'READ' ? 'READ' :
                            status === 'DELIVERED' ? 'DELIVERED' :
                                status === 'FAILED' ? 'FAILED' : null;

                        if (!newStatus) {
                            console.log(`⚠️ [WA STATUS] Unknown status: ${status}`);
                            continue;
                        }

                        // Update message status in database
                        // WhatsApp uses wamid, we store it in whatsappMessageId for outgoing messages
                        const updated = await prisma.message.updateMany({
                            where: {
                                OR: [
                                    { facebookMessageId: messageId },
                                    { whatsappMessageId: messageId }
                                ]
                            },
                            data: { status: newStatus }
                        });

                        console.log(`📊 [WA STATUS] DB Update result: ${updated.count} rows affected`);

                        if (updated.count > 0) {
                            console.log(`✅ [WA STATUS] Message ${messageId} -> ${newStatus}`);

                            // Find the updated message to get conversation info with workspace
                            const updatedMessage = await prisma.message.findFirst({
                                where: {
                                    OR: [
                                        { facebookMessageId: messageId },
                                        { whatsappMessageId: messageId }
                                    ]
                                },
                                select: {
                                    id: true,
                                    conversationId: true,
                                    status: true,
                                    whatsappMessageId: true,
                                    facebookMessageId: true,
                                    conversation: { select: { workspaceId: true } }
                                }
                            });

                            // Emit socket event for real-time UI update (workspace-specific)
                            try {
                                if (updatedMessage?.conversation?.workspaceId) {
                                    emitToWorkspace(updatedMessage.conversation.workspaceId, 'message_status', {
                                        messageId,  // WhatsApp message ID
                                        dbMessageId: updatedMessage?.id, // Database message ID
                                        conversationId: updatedMessage?.conversationId,
                                        status: newStatus
                                    });
                                    console.log(`📡 [WA STATUS] Socket event emitted for workspace: ${updatedMessage.conversation.workspaceId}`);
                                }
                            } catch (socketErr) {
                                console.error('Socket emit error:', socketErr);
                            }
                        } else {
                            console.log(`⚠️ [WA STATUS] No message found with ID: ${messageId}`);
                        }

                        // Always try to update campaign recipient (if this was a campaign message)
                        try {
                            const { updateCampaignRecipientStatus } = await import('./marketing.controller.js');
                            await updateCampaignRecipientStatus(messageId, rawStatus);
                        } catch (campaignErr) {
                            // Non-critical
                        }
                    }
                }
                return res.sendStatus(200);
            }

            // Ensure this is a message event and not a status update or other notification
            if (body.entry &&
                body.entry[0].changes &&
                body.entry[0].changes[0].value.messages &&
                body.entry[0].changes[0].value.messages[0]) {

                const value = body.entry[0].changes[0].value;
                const message = value.messages[0];
                const contactInfo = value.contacts?.[0];

                const phone_number_id = value.metadata.phone_number_id;
                const display_phone_number = value.metadata.display_phone_number;
                const from = message.from; // sender phone number
                const wamid = message.id;

                if (!from) {
                    console.log('⚠️ [WhatsApp] Message missing "from" field, skipping');
                    return res.sendStatus(200);
                }

                // 0. Acquire processing lock to prevent duplicate processing
                if (!acquireMessageLock(wamid)) {
                    console.log(`🔒 [WhatsApp] Message ${wamid} already being processed, skipping`);
                    return res.sendStatus(200);
                }

                // Get WhatsApp profile name from contacts array
                const waProfileName = contactInfo?.profile?.name;

                // DEBUG: Log what we received
                console.log('📋 [WA Contact Debug]:', {
                    contactInfo: contactInfo,
                    profileName: waProfileName,
                    from: from,
                    messageBody: message.text?.body?.substring(0, 50) // First 50 chars of message
                });

                // Use profile name if available, otherwise use phone number
                // NEVER use message content as name!
                const name = waProfileName || from;

                const cleanPhone = (num) => num ? num.replace(/\D/g, '') : '';
                const sanitizedDisplay = cleanPhone(display_phone_number);
                const sanitizedFrom = cleanPhone(from);

                // 0.1 Skip if this is an echo (message sent from this WABA account itself)
                if (sanitizedDisplay === sanitizedFrom && sanitizedDisplay !== '') {
                    console.log(`🗣️ Skipping WhatsApp echo (outgoing from ${sanitizedDisplay})`);
                    releaseMessageLock(wamid);
                    return res.sendStatus(200);
                }

                // 0.2 Check for duplicate delivery (WhatsApp retries)
                const existingMessage = await prisma.message.findUnique({
                    where: { facebookMessageId: wamid }
                });
                if (existingMessage) {
                    console.log('♻️ Skipping duplicate WhatsApp message:', wamid);
                    releaseMessageLock(wamid);
                    return res.sendStatus(200);
                }

                let msg_body = '';
                let mediaUrl = null;
                let mediaType = null;

                if (message.type === 'text') {
                    msg_body = message.text?.body || '';
                } else if (['image', 'video', 'audio', 'document', 'sticker'].includes(message.type)) {
                    mediaType = message.type;
                    const mediaObj = message[message.type];
                    msg_body = mediaObj?.caption || `📎 ${message.type === 'image' ? 'Fotoğraf' : message.type === 'video' ? 'Video' : message.type === 'audio' ? 'Ses' : message.type === 'document' ? 'Dosya' : 'Sticker'}`;

                    // Media URL will be fetched after waNumber is available (needs accessToken)
                    if (mediaObj?.id) {
                        mediaUrl = mediaObj.id; // Store media ID temporarily, will be resolved below
                    }
                } else {
                    msg_body = `[${message.type} message]`;
                }

                // Find connected phone number in DB
                const waNumber = await prisma.whatsappPhoneNumber.findUnique({
                    where: { phoneNumberId: phone_number_id }
                });

                if (waNumber) {
                    // Download media and save locally
                    if (mediaUrl && mediaType) {
                        try {
                            // Ensure media directory exists
                            if (!fs.existsSync(MEDIA_DIR)) {
                                fs.mkdirSync(MEDIA_DIR, { recursive: true });
                            }

                            // Step 1: Get download URL from WhatsApp
                            const mediaResponse = await fetch(
                                `https://graph.facebook.com/v21.0/${mediaUrl}`,
                                { headers: { Authorization: `Bearer ${waNumber.accessToken}` } }
                            );
                            const mediaData = await mediaResponse.json();

                            if (mediaData?.url) {
                                // Step 2: Download the actual media binary
                                const downloadResponse = await fetch(mediaData.url, {
                                    headers: { Authorization: `Bearer ${waNumber.accessToken}` }
                                });

                                if (downloadResponse.ok) {
                                    const contentType = downloadResponse.headers.get('content-type') || '';
                                    const ext = contentType.includes('jpeg') || contentType.includes('jpg') ? '.jpg'
                                        : contentType.includes('png') ? '.png'
                                            : contentType.includes('webp') ? '.webp'
                                                : contentType.includes('mp4') ? '.mp4'
                                                    : contentType.includes('ogg') || contentType.includes('opus') ? '.ogg'
                                                        : contentType.includes('pdf') ? '.pdf'
                                                            : contentType.includes('audio') ? '.mp3'
                                                                : '.bin';

                                    const fileName = `${Date.now()}_${wamid.replace(/[^a-zA-Z0-9]/g, '')}${ext}`;
                                    const filePath = path.join(MEDIA_DIR, fileName);

                                    const buffer = Buffer.from(await downloadResponse.arrayBuffer());
                                    fs.writeFileSync(filePath, buffer);

                                    mediaUrl = `/api/uploads/media/${fileName}`;
                                    console.log(`📸 [WA] Media saved: ${mediaUrl} (${(buffer.length / 1024).toFixed(1)}KB)`);
                                } else {
                                    console.warn(`⚠️ [WA] Media download failed: ${downloadResponse.status}`);
                                    mediaUrl = null;
                                }
                            } else {
                                console.warn('⚠️ [WA] No URL in media response:', JSON.stringify(mediaData).substring(0, 200));
                                mediaUrl = null;
                            }
                        } catch (mediaErr) {
                            console.error('❌ [WA] Failed to download media:', mediaErr.message);
                            mediaUrl = null;
                        }
                    }

                    // Find or create contact - search multiple phone formats
                    const normalizedFrom = normalizePhone(from);
                    const phoneVariants = [...new Set([from, normalizedFrom])];
                    // Add common Turkish variants
                    if (from.startsWith('90') && from.length === 12) {
                        phoneVariants.push('+' + from, '0' + from.slice(2));
                    }
                    if (normalizedFrom.startsWith('+90')) {
                        phoneVariants.push(normalizedFrom.slice(1), '0' + normalizedFrom.slice(3));
                    }

                    let contact = await prisma.contact.findFirst({
                        where: {
                            workspaceId: waNumber.workspaceId,
                            OR: phoneVariants.map(p => ({ phone: p }))
                        }
                    });

                    if (!contact) {
                        // Create new contact with avatar
                        const contactName = name || from;
                        const avatarUrl = getAvatarFallback(contactName);

                        contact = await prisma.contact.create({
                            data: {
                                workspaceId: waNumber.workspaceId,
                                name: contactName,
                                phone: normalizedFrom,
                                avatar: avatarUrl,
                                tags: '["whatsapp"]',
                                status: 'OPPORTUNITY',
                                source: 'WHATSAPP'
                            }
                        });
                        console.log(`👤 [WA Contact] Created as OPPORTUNITY: ${contactName} (${from})`);
                    } else {
                        // Contact exists - check if it has a placeholder name (phone number or social label)
                        const currentName = contact.name || '';
                        const isPlaceholder = !currentName ||
                            currentName === from ||
                            currentName.toLowerCase().includes('whatsapp') ||
                            /^\d+$/.test(currentName); // Only digits

                        // Telefon numarası var ve status NEW ise HOT_OPPORTUNITY yap
                        const shouldUpgradeStatus = contact.status === 'NEW' && contact.phone;

                        if (isPlaceholder && name && name !== currentName) {
                            // Update name and avatar
                            const newAvatarUrl = getAvatarFallback(name);
                            const updateData = {
                                name: name,
                                avatar: contact.avatar || newAvatarUrl
                            };
                            if (shouldUpgradeStatus) {
                                updateData.status = 'OPPORTUNITY';
                                console.log(`📱 [WA] Upgrading status to OPPORTUNITY: ${contact.id}`);
                            }
                            contact = await prisma.contact.update({
                                where: { id: contact.id },
                                data: updateData
                            });
                            console.log(`✅ [WA Sync] Updated: "${currentName}" → "${name}"`);
                        } else if (!contact.avatar || shouldUpgradeStatus) {
                            // Contact has name but no avatar or needs status upgrade
                            const updateData = {};
                            if (!contact.avatar) updateData.avatar = getAvatarFallback(contact.name);
                            if (shouldUpgradeStatus) updateData.status = 'OPPORTUNITY';

                            if (Object.keys(updateData).length > 0) {
                                contact = await prisma.contact.update({
                                    where: { id: contact.id },
                                    data: updateData
                                });
                            }
                        }
                    }

                    // Reklam kaynagi tespiti (Click-to-WhatsApp Ads)
                    const waReferral = message.referral || null;
                    if (waReferral && (waReferral.source_type === "ad" || waReferral.ctwa_clid || waReferral.source_id)) {
                        const adTitle = waReferral.headline || waReferral.body || null;
                        const adTag = adTitle ? ("Reklam: " + adTitle.substring(0, 30)) : "WhatsApp Reklam";
                        try {
                            const rawTags = contact.tags || "[]";
                            let tags = []; 
                            try { tags = JSON.parse(rawTags); } catch { tags = []; }
                            if (!tags.includes(adTag)) {
                                tags.push(adTag);
                                await prisma.contact.update({ where: { id: contact.id }, data: { tags: JSON.stringify(tags) } });
                                console.log("[AdTag] Added: " + adTag);
                            }
                        } catch (tagErr) { console.error("❌ [AdTag] Error:", tagErr.message); }
                    } else {
                        // Reklam yoksa Organik etiketi ekle
                        try {
                            const rawTags = contact.tags || "[]";
                            let tags = [];
                            try { tags = JSON.parse(rawTags); } catch { tags = []; }
                            const organicTag = "Organik";
                            if (!tags.includes(organicTag)) {
                                tags.push(organicTag);
                                await prisma.contact.update({ where: { id: contact.id }, data: { tags: JSON.stringify(tags) } });
                                console.log("[AdTag] Organik etiketi eklendi");
                            }
                        } catch (tagErr) { console.error("❌ [AdTag] Organik error:", tagErr.message); }
                    }

                    // ── Madde 10: Attribution kaydet (yapısal veri) ──────
                    try {
                        const { saveWhatsAppAttribution } = await import('../services/attribution.service.js');
                        await saveWhatsAppAttribution(contact.id, waNumber.workspaceId, waReferral);
                    } catch (attrErr) {
                        console.error('❌ [Attribution] WhatsApp save error:', attrErr.message);
                    }

                    // Check if contact is blocked - skip processing if blocked
                    if (contact.isBlocked) {
                        console.log(`🚫 [BLOCKED] WhatsApp contact ${contact.id} (${contact.name}) is blocked. Ignoring incoming message.`);
                        releaseMessageLock(wamid);
                        return res.sendStatus(200);
                    }

                    let conversation = await prisma.conversation.findFirst({
                        where: {
                            contactId: contact.id,
                            whatsappPhoneNumberId: waNumber.id
                        },
                        orderBy: { lastMessageAt: 'desc' }
                    });

                    // 24 saat birleştirme: Aynı contact için herhangi bir kanaldan son 24 saatte açık konuşma ara
                    if (!conversation) {
                        const mergeWindow = new Date(Date.now() - 24 * 60 * 60 * 1000);
                        conversation = await prisma.conversation.findFirst({
                            where: {
                                contactId: contact.id,
                                workspaceId: waNumber.workspaceId,
                                lastMessageAt: { gte: mergeWindow },
                                status: { not: 'RESOLVED' }
                            },
                            orderBy: { lastMessageAt: 'desc' }
                        });
                        if (conversation) {
                            console.log(`🔗 [WA Merge] Reusing existing ${conversation.channel} conversation ${conversation.id} (within 24h)`);
                            // WhatsApp bilgilerini güncelle
                            if (!conversation.whatsappPhoneNumberId) {
                                conversation = await prisma.conversation.update({
                                    where: { id: conversation.id },
                                    data: { whatsappPhoneNumberId: waNumber.id, channel: 'WHATSAPP' }
                                });
                            }
                        }
                    }

                    let isNewConversation = false;
                    if (!conversation) {
                        isNewConversation = true;
                        conversation = await prisma.conversation.create({
                            data: {
                                contactId: contact.id,
                                workspaceId: waNumber.workspaceId,
                                whatsappPhoneNumberId: waNumber.id,
                                status: 'OPEN',
                                channel: 'WHATSAPP',
                                assignedBotId: waNumber.assignedBotId,
                                botEnabled: true // Varsayılan olarak bot aktif
                            }
                        });

                        // 🚀 Yeni konuşma için kanal yönlendirmesini uygula
                        console.log(`📡 [Webhook] Applying channel routing for new WHATSAPP conversation...`);
                        const routingResult = await applyChannelRouting(
                            waNumber.workspaceId,
                            conversation.id,
                            'WHATSAPP',
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

                        // 🔄 Flow Engine: FIRST_MSG trigger for new WhatsApp conversations
                        try {
                            const { executeFlowsByTrigger } = await import('./flow.controller.js');
                            await executeFlowsByTrigger(waNumber.workspaceId, 'FIRST_MSG', {
                                contact,
                                conversation,
                                message: { content: msg_body }
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
                        if (!conversation.assignedBotId && waNumber.assignedBotId) {
                            updateData.assignedBotId = waNumber.assignedBotId;
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
                            console.log(`📡 [Webhook] Re-applying routing for existing WHATSAPP conversation...`);
                            const routingResult = await applyChannelRouting(
                                waNumber.workspaceId,
                                conversation.id,
                                'WHATSAPP',
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

                    // Check for profanity in incoming messages
                    let hasProfanityDetected = false;
                    if (msg_body) {
                        hasProfanityDetected = hasProfanity(msg_body);
                        if (hasProfanityDetected) {
                            console.log(`⚠️ Profanity detected in incoming WhatsApp message from contact ${contact.id}`);
                            // Censor the message body before saving to DB
                            msg_body = censorProfanity(msg_body);
                            // Disable bot for this conversation
                            conversation = await prisma.conversation.update({
                                where: { id: conversation.id },
                                data: { botEnabled: false }
                            });
                        }
                    }

                    // Create Message
                    const newMessage = await prisma.message.create({
                        data: {
                            content: msg_body,
                            conversationId: conversation.id,
                            isFromContact: true,
                            messageType: 'WHATSAPP',
                            facebookMessageId: wamid,
                            mediaUrl: mediaUrl || null,
                            mediaType: mediaType || null
                        }
                    });

                    // Madde 0: Pipeline post-processing (niyet→aşama, lead puanlama, auto case, takım bot)
                    try {
                        const { runChannelPostProcessing } = await import('./inbox.controller.js');
                        runChannelPostProcessing(waNumber.workspaceId, conversation.id, contact.id, msg_body, 'WHATSAPP').catch(() => {});
                    } catch (e) { /* pipeline opsiyonel */ }

                    // Update conversation last message time and unread count
                    await prisma.conversation.update({
                        where: { id: conversation.id },
                        data: {
                            lastMessageAt: new Date(),
                            unreadCount: { increment: 1 }
                        }
                    });

                    // Reset follow-up flags when customer responds
                    try {
                        const { resetFollowUpFlags } = await import('../services/followUp.service.js');
                        await resetFollowUpFlags(conversation.id);
                    } catch (e) { /* ignore */ }

                    // Emit Socket Event (workspace-specific)
                    emitToWorkspace(waNumber.workspaceId, 'new_message', {
                        workspaceId: waNumber.workspaceId,
                        conversationId: conversation.id,
                        message: newMessage,
                        contact: contact,
                        channel: 'WHATSAPP'
                    });

                    // If profanity was detected, send warning, save warning to DB, and skip AI auto-reply/rules
                    if (hasProfanityDetected) {
                        try {
                            const warningText = "Lütfen saygılı bir dil kullanın, size bu şekilde yardımcı olamayız.";
                            console.log(`Sending profanity warning to WhatsApp user: ${from}`);
                            const waReply = await axios.post(
                                `https://graph.facebook.com/${GRAPH_API_VERSION}/${waNumber.phoneNumberId}/messages`,
                                {
                                    messaging_product: 'whatsapp',
                                    to: from,
                                    text: { body: warningText }
                                },
                                {
                                    headers: { Authorization: `Bearer ${waNumber.accessToken}` }
                                }
                            );

                            const waMsgId = waReply.data?.messages?.[0]?.id;

                            // Save warning message to DB (as outgoing message)
                            const botMessage = await prisma.message.create({
                                data: {
                                    content: warningText,
                                    conversationId: conversation.id,
                                    isFromContact: false,
                                    messageType: 'WHATSAPP',
                                    senderId: null,
                                    whatsappMessageId: waMsgId || null,
                                    status: 'SENT'
                                }
                            });

                            // Emit Socket for the warning message
                            emitToWorkspace(waNumber.workspaceId, 'new_message', {
                                workspaceId: waNumber.workspaceId,
                                conversationId: conversation.id,
                                message: botMessage,
                                contact: contact,
                                channel: 'WHATSAPP'
                            });
                        } catch (warningError) {
                            console.error('❌ Error sending WhatsApp profanity warning message:', warningError.response?.data || warningError.message);
                        }

                        releaseMessageLock(wamid);
                        return res.sendStatus(200);
                    }

                    // --- CHAT CALL DETECTION — Satış ekibine görev aç (direkt robot araması DEĞİL) ---
                    // Robot araması için: satış ekibi görevi tamamlamazsa, planlanan arama üzerinden robot arar
                    // Burada sadece executeSalesPhoneCallRule + executeAutoCallPlanning çalışır (aşağıda zaten var)
                    // triggerAutoCall KALDIRILDI — direkt robot araması yapılmaz


                    // --- AI AUTO REPLY START ---
                    try {
                        // First check if there's a bot assigned
                        if (!waNumber.assignedBotId && !conversation.assignedBotId) {
                            console.log(`ℹ️ [WhatsApp] No bot assigned to channel - Manual mode active, skipping AI reply`);
                        } else if (conversation.botEnabled === false) {
                            // Check if bot is disabled for this specific conversation
                            console.log(`🚫 [WhatsApp] Bot disabled for this conversation - skipping AI reply`);
                        } else if (isEmojiOrIconOnly(msg_body)) {
                            console.log(`ℹ️ [WhatsApp] Message consists only of emojis/icons/symbols ("${msg_body}") - skipping AI reply`);
                        } else {
                            // 🚀 Kanal yönlendirmesi kontrolü - Bot gecikme süresi ve agent atama kontrolü
                            const botCanRespond = await canBotRespond(conversation.id);
                            if (!botCanRespond) {
                                console.log(`⏳ [WhatsApp] Bot waiting for delay or agent assigned - skipping AI reply`);
                            } else {
                                const { getAutoReply } = await import('./ai.controller.js');
                                const { scheduleAutoReplyCheck } = await import('../services/autoReplyDelay.service.js');

                                // Check if bot has delay enabled
                                const assignedBot = await prisma.aIBot.findFirst({
                                    where: {
                                        OR: [
                                            { id: conversation.assignedBotId || 'none' },
                                            { id: waNumber.assignedBotId || 'none' }
                                        ]
                                    }
                                });

                                if (assignedBot?.autoReplyDelayEnabled) {
                                    // Schedule delayed auto-reply check
                                    console.log(`⏱️ [WhatsApp] Bot has delay enabled (${assignedBot.autoReplyDelaySeconds}s), scheduling check`);
                                    scheduleAutoReplyCheck(conversation.id, waNumber.workspaceId, 'whatsapp', msg_body);
                                } else {
                                    // Use message batching/debounce to prevent replying to each fragment separately
                                    const { scheduleMessageBatch } = await import('../services/autoReplyDelay.service.js');
                                    scheduleMessageBatch(
                                        conversation.id,
                                        waNumber.workspaceId,
                                        'whatsapp',
                                        msg_body,
                                        {
                                            from,
                                            waNumber,
                                            contact
                                        }
                                    );
                                }
                            } // Close canBotRespond else
                        }
                    } catch (aiError) {
                        console.error('❌ AI Auto-Reply (WhatsApp) failed:', aiError);
                    }
                    // --- AI AUTO REPLY END ---

                    // --- AUTO EXTRACT START ---
                    try {
                        const { autoExtractFromConversation, autoGenerateTopic } = await import('./ai.controller.js');
                        autoExtractFromConversation(waNumber.workspaceId, conversation.id);
                        autoGenerateTopic(waNumber.workspaceId, conversation.id, msg_body).catch(e =>
                            console.error('❌ [AutoTopic] WA error:', e.message)
                        );
                        // autoAssignDefaultFunnel artık applyChannelRouting içinde merkezi olarak çalışıyor

                        // 📦 AUTO-CASE: Conversation için case yoksa oluştur
                        const { ensureCaseForConversation } = await import('./case.controller.js');
                        ensureCaseForConversation(waNumber.workspaceId, conversation.id).catch(e =>
                            console.error('⚠️ [AutoCase] WA error:', e.message)
                        );
                    } catch (extractError) {
                        console.error('❌ AI Auto-Extract (WhatsApp) call failed:', extractError);
                    }
                    // --- AUTO EXTRACT END ---

                    // --- AUTOMATION RULES START ---
                    // Run for ALL message types with text content (text, image captions, doc captions, etc.)
                    if (msg_body && msg_body.trim()) {
                        try {
                            const { executePhoneCaptureRule, executeHotKeywordRule, executeSalesPhoneCallRule, executeAppointmentPlanning } = await import('./rules.controller.js');
                            // Phone capture MUST run first and be awaited
                            await executePhoneCaptureRule(waNumber.workspaceId, conversation.id, msg_body).catch(e =>
                                console.error('❌ [RULE:PHONE_CAPTURE] error:', e.message)
                            );
                            // Other rules can run async
                            executeHotKeywordRule(waNumber.workspaceId, conversation.id, msg_body).catch(e =>
                                console.error('❌ [RULE:HOT_KEYWORD] async error:', e.message)
                            );
                            // executeSalesPhoneCallRule: Arama niyeti + numara kontrolü yapar
                            // Sadece müşteri "beni arayın" vb. dediğinde görev oluşturur
                            executeSalesPhoneCallRule(waNumber.workspaceId, conversation.id, msg_body).catch(e =>
                                console.error('❌ [RULE:SALES_PHONE_CALL] async error:', e.message)
                            );
                            // executeAutoCallPlanning burada ÇAĞRILMAZ
                            // Her mesajda arama planlamak çok agresif — müşteri aranma istememiş olabilir
                            // Auto-call sadece: manuel kişi ekleme, form, lead form için çalışır

                            // Randevu niyeti algılama — keyword ön filtre
                            const msgLower = msg_body.toLowerCase();
                            const apptKeywords = ['randevu', 'görüşme', 'toplantı', 'ziyaret', 'gelmek istiyorum', 'ne zaman müsait', 'appointment', 'meeting'];
                            if (apptKeywords.some(kw => msgLower.includes(kw)) && conversation.contactId) {
                                executeAppointmentPlanning(waNumber.workspaceId, conversation.contactId, 'WHATSAPP_MSG').catch(e =>
                                    console.error('❌ [RULE:APPOINTMENT] WA async error:', e.message)
                                );
                            }
                        } catch (ruleErr) {
                            console.error('❌ [RULES] Import error:', ruleErr.message);
                        }

                        // 🤖 Otomasyon Hook'ları — Mesaj bazlı kurallar
                        try {
                            const workspaceId = waNumber.workspaceId;
                            const messageBody = msg_body;
                            const ruleCtx = { contactId: contact.id, conversationId: conversation.id, message: messageBody };
                            
                            // Mesai dışı otomatik cevap
                            executeRule(workspaceId, 'AFTER_HOURS_REPLY', ruleCtx).catch(e => console.error('[AutoHook] AFTER_HOURS_REPLY error:', e.message));
                            
                            // VIP müşteri uyarısı
                            if (contact.category === 'VIP') {
                                executeRule(workspaceId, 'VIP_CUSTOMER_ALERT', ruleCtx).catch(e => console.error('[AutoHook] VIP_CUSTOMER_ALERT error:', e.message));
                            }
                            
                            // Şikayet eskalasyonu (sentiment negatif ise)
                            if (conversation.sentimentScore !== null && conversation.sentimentScore < 30) {
                                executeRule(workspaceId, 'COMPLAINT_ESCALATION', ruleCtx).catch(e => console.error('[AutoHook] COMPLAINT_ESCALATION error:', e.message));
                            }
                        } catch (hookErr) {
                            console.error('[AutoHook] WhatsApp message hooks error:', hookErr.message);
                        }
                    }
                    // --- AUTOMATION RULES END ---
                }
            }
            res.sendStatus(200);
        } else {
            res.sendStatus(404);
        }
    } catch (error) {
        console.error('WhatsApp webhook error:', error);
        res.sendStatus(500);
    }
};

// ═══════════════════════════════════════════════════════════════
// Reusable helper: send a WhatsApp text message via Graph API
// Used by: conversationRouting.service.js (Bot Scheduler),
//          flow.controller.js (Flow SEND_MESSAGE step)
// ═══════════════════════════════════════════════════════════════
export const sendWhatsAppMessage = async (workspaceIdOrWaNumber, recipientPhone, messageText, conversationId = null) => {
    try {
        let waNumber;

        // Support two calling conventions:
        //   1) sendWhatsAppMessage(workspaceId: string, phone, text)  — flow.controller.js
        //   2) sendWhatsAppMessage(waNumberObj: object, phone, text, convId)  — conversationRouting.service.js
        if (typeof workspaceIdOrWaNumber === 'string') {
            // Caller passed a workspaceId — look up the connected WA number
            waNumber = await prisma.whatsappPhoneNumber.findFirst({
                where: { workspaceId: workspaceIdOrWaNumber, isConnected: true }
            });
            if (!waNumber) {
                console.error(`❌ [sendWhatsAppMessage] No connected WhatsApp number for workspace ${workspaceIdOrWaNumber}`);
                return null;
            }
        } else if (workspaceIdOrWaNumber && typeof workspaceIdOrWaNumber === 'object') {
            // Caller passed the waNumber object directly
            waNumber = workspaceIdOrWaNumber;
        } else {
            console.error('❌ [sendWhatsAppMessage] Invalid first argument');
            return null;
        }

        if (!recipientPhone) {
            console.error('❌ [sendWhatsAppMessage] No recipient phone provided');
            return null;
        }

        // Normalize the phone number (remove spaces, dashes, leading zeros, etc.)
        const normalizedPhone = normalizePhone(recipientPhone);

        const response = await axios.post(
            `https://graph.facebook.com/${GRAPH_API_VERSION}/${waNumber.phoneNumberId}/messages`,
            {
                messaging_product: 'whatsapp',
                to: normalizedPhone,
                text: { body: messageText }
            },
            {
                headers: { Authorization: `Bearer ${waNumber.accessToken}` }
            }
        );

        const waMsgId = response.data?.messages?.[0]?.id;

        // If a conversationId was provided, save the message to DB and emit socket event
        if (conversationId) {
            const botMessage = await prisma.message.create({
                data: {
                    content: messageText,
                    conversationId,
                    isFromContact: false,
                    messageType: 'WHATSAPP',
                    senderId: null,
                    whatsappMessageId: waMsgId || null,
                    status: 'SENT'
                }
            });

            // Emit socket event
            try {
                emitToWorkspace(waNumber.workspaceId, 'new_message', {
                    workspaceId: waNumber.workspaceId,
                    conversationId,
                    message: botMessage,
                    channel: 'WHATSAPP'
                });
            } catch (socketErr) {
                console.error('⚠️ [sendWhatsAppMessage] Socket emit error:', socketErr.message);
            }

            return botMessage;
        }

        return { success: true, wamid: waMsgId };
    } catch (error) {
        console.error('❌ [sendWhatsAppMessage] Error:', error.response?.data || error.message);
        return null;
    }
};
