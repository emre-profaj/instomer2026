import prisma from '../lib/prisma.js';
import { getAutoReply } from '../controllers/ai.controller.js';


// Store pending auto-reply timers
const pendingTimers = new Map();

/**
 * Schedule an auto-reply check for a conversation
 * If no reply is sent within the delay, trigger auto-reply
 */
export const scheduleAutoReplyCheck = async (conversationId, workspaceId, channel, userMessage) => {
    try {
        // Get the conversation with its assigned bot
        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
            include: {
                assignedBot: true,
                facebookPage: { include: { assignedBot: true, instagramBot: true } },
                whatsappPhoneNumber: { include: { assignedBot: true } },
                emailChannel: { include: { assignedBot: true } }
            }
        });

        if (!conversation) return;

        // Find the relevant bot based on channel
        let bot = null;
        if (conversation.assignedBot) {
            bot = conversation.assignedBot;
        } else if (channel === 'whatsapp' && conversation.whatsappPhoneNumber?.assignedBot) {
            bot = conversation.whatsappPhoneNumber.assignedBot;
        } else if (channel === 'facebook' && conversation.facebookPage?.assignedBot) {
            bot = conversation.facebookPage.assignedBot;
        } else if (channel === 'instagram' && conversation.facebookPage?.instagramBot) {
            bot = conversation.facebookPage.instagramBot;
        } else if (channel === 'email' && conversation.emailChannel?.assignedBot) {
            bot = conversation.emailChannel.assignedBot;
        }

        // If no bot or auto-reply delay not enabled, skip
        if (!bot || !bot.autoReplyDelayEnabled) {
            return;
        }

        const delaySeconds = bot.autoReplyDelaySeconds || 30;
        const timerKey = `${conversationId}`;

        // Clear any existing timer for this conversation
        if (pendingTimers.has(timerKey)) {
            clearTimeout(pendingTimers.get(timerKey));
            pendingTimers.delete(timerKey);
        }

        // Get the last message timestamp
        const lastMessage = await prisma.message.findFirst({
            where: { conversationId, isFromContact: true },
            orderBy: { createdAt: 'desc' }
        });

        if (!lastMessage) return;

        const lastMessageTime = new Date(lastMessage.createdAt).getTime();
        const messageId = lastMessage.id;

        console.log(`⏱️ [AutoReplyDelay] Scheduling check for conversation ${conversationId} in ${delaySeconds} seconds`);

        // Set timer
        const timer = setTimeout(async () => {
            try {
                await checkAndSendAutoReply(conversationId, workspaceId, channel, userMessage, messageId, bot);
            } catch (error) {
                console.error('❌ [AutoReplyDelay] Error in scheduled check:', error);
            } finally {
                pendingTimers.delete(timerKey);
            }
        }, delaySeconds * 1000);

        pendingTimers.set(timerKey, timer);

    } catch (error) {
        console.error('❌ [AutoReplyDelay] Error scheduling auto-reply check:', error);
    }
};

/**
 * Cancel pending auto-reply for a conversation (called when human replies)
 */
export const cancelAutoReplyCheck = (conversationId) => {
    const timerKey = `${conversationId}`;
    if (pendingTimers.has(timerKey)) {
        clearTimeout(pendingTimers.get(timerKey));
        pendingTimers.delete(timerKey);
        console.log(`🚫 [AutoReplyDelay] Cancelled auto-reply for conversation ${conversationId}`);
    }
};

/**
 * Check if reply was sent and send auto-reply if not
 */
const checkAndSendAutoReply = async (conversationId, workspaceId, channel, userMessage, lastContactMessageId, bot) => {
    try {
        // Check if there's a reply after the contact's last message
        const replyExists = await prisma.message.findFirst({
            where: {
                conversationId,
                isFromContact: false,
                createdAt: {
                    gt: (await prisma.message.findUnique({ where: { id: lastContactMessageId } }))?.createdAt
                }
            }
        });

        if (replyExists) {
            console.log(`✅ [AutoReplyDelay] Reply already sent for conversation ${conversationId}, skipping auto-reply`);
            return;
        }

        console.log(`🤖 [AutoReplyDelay] No reply within delay, sending auto-reply for conversation ${conversationId}`);

        // If custom message is set, use it; otherwise use AI
        let replyMessage = null;

        if (bot.autoReplyDelayMessage && bot.autoReplyDelayMessage.trim()) {
            // Use custom message
            replyMessage = bot.autoReplyDelayMessage;
        } else {
            // Use AI to generate response
            replyMessage = await getAutoReply(workspaceId, conversationId, userMessage, channel);
        }

        if (!replyMessage) {
            console.log(`ℹ️ [AutoReplyDelay] No auto-reply message generated for conversation ${conversationId}`);
            return;
        }

        // Get conversation details for sending
        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
            include: {
                contact: true,
                whatsappPhoneNumber: true,
                facebookPage: true,
                emailChannel: true
            }
        });

        if (!conversation) return;

        // Send the message based on channel
        await sendAutoReplyToChannel(conversation, replyMessage, channel);

    } catch (error) {
        console.error('❌ [AutoReplyDelay] Error checking and sending auto-reply:', error);
    }
};

/**
 * Send auto-reply message to the appropriate channel
 */
const sendAutoReplyToChannel = async (conversation, message, channel) => {
    const axios = (await import('axios')).default;
    const { getIO } = await import('../socket.js');

    try {
        // Check for duplicate auto-reply within last 10 seconds
        const tenSecondsAgo = new Date(Date.now() - 10000);
        const recentBotReply = await prisma.message.findFirst({
            where: {
                conversationId: conversation.id,
                isFromContact: false,
                senderId: null, // Bot message
                createdAt: { gte: tenSecondsAgo }
            },
            orderBy: { createdAt: 'desc' }
        });

        if (recentBotReply) {
            console.log(`⏭️ [AutoReplyDelay] Skipping - recent bot message exists for conversation ${conversation.id}`);
            return;
        }

        let sentMessage = null;
        const GRAPH_API_VERSION = process.env.FACEBOOK_GRAPH_API_VERSION || 'v18.0';

        // ⚠️ Güvenlik: [HANDOFF] tagını her kanalda mesajdan soy
        const safeMessage = message.replace(/\[HANDOFF\]/gi, '').trim();
        if (!safeMessage) {
            console.log(`⚠️ [AutoReplyDelay] [HANDOFF]-only mesaj, gönderilmiyor: ${conversation.id}`);
            return;
        }

        if (channel === 'whatsapp' && conversation.whatsappPhoneNumber) {
            const phone = conversation.whatsappPhoneNumber;
            const recipientPhone = conversation.contact?.phone?.replace(/\D/g, '');

            if (recipientPhone && phone.accessToken) {
                await axios.post(
                    `https://graph.facebook.com/${GRAPH_API_VERSION}/${phone.phoneNumberId}/messages`,
                    {
                        messaging_product: 'whatsapp',
                        to: recipientPhone,
                        type: 'text',
                        text: { body: safeMessage }
                    },
                    { headers: { Authorization: `Bearer ${phone.accessToken}` } }
                );
            }
        } else if ((channel === 'facebook' || channel === 'instagram') && conversation.facebookPage) {
            const page = conversation.facebookPage;
            const recipientId = conversation.platformConversationId || conversation.contact?.facebookId;

            if (recipientId && page.pageAccessToken) {
                const response = await axios.post(
                    `https://graph.facebook.com/${GRAPH_API_VERSION}/me/messages`,
                    {
                        recipient: { id: String(recipientId) },
                        message: { text: safeMessage }
                    },
                    { params: { access_token: page.pageAccessToken } }
                );

                // Capture message ID from response
                const fbMessageId = response.data?.message_id;

                // Save message to database with Facebook message ID
                sentMessage = await prisma.message.create({
                    data: {
                        conversationId: conversation.id,
                        content: safeMessage,
                        isFromContact: false,
                        messageType: 'TEXT',
                        senderId: null, // Bot message, no user sender
                        facebookMessageId: fbMessageId || null
                    }
                });
            }
        }

        // Save message to database (for WhatsApp or if Facebook/Instagram failed)
        if (!sentMessage) {
            sentMessage = await prisma.message.create({
                data: {
                    conversationId: conversation.id,
                    content: safeMessage,
                    isFromContact: false,
                    messageType: 'TEXT',
                    senderId: null // Bot message, no user sender
                }
            });
        }

        // Emit via socket - use global emit like other controllers
        const io = getIO();
        if (io && sentMessage) {
            io.emit('new_message', {
                workspaceId: conversation.workspaceId,
                conversationId: conversation.id,
                message: sentMessage,
                channel: conversation.channel
            });
        }

        console.log(`✅ [AutoReplyDelay] Auto-reply sent for conversation ${conversation.id}`);

    } catch (error) {
        console.error('❌ [AutoReplyDelay] Error sending auto-reply to channel:', error.response?.data || error.message);
    }
};

// ============================================================
// MESSAGE BATCHING / DEBOUNCE SYSTEM
// Collects rapid-fire messages from the same conversation and
// triggers AI reply only after a period of silence.
// ============================================================

const MESSAGE_BATCH_DELAY_SECONDS = 8; // Wait 8 seconds of silence before sending to AI
const pendingBatchTimers = new Map(); // conversationId -> timer
const pendingBatchMessages = new Map(); // conversationId -> { messages: string[], workspaceId, channel, meta }

/**
 * Schedule a batched AI reply for a conversation.
 * Each new message resets the timer. When the timer expires (no new messages),
 * all collected messages are combined and sent to the AI as a single request.
 *
 * @param {string} conversationId
 * @param {string} workspaceId
 * @param {string} channel - 'facebook' | 'instagram' | 'whatsapp'
 * @param {string} userMessage - The incoming message text
 * @param {object} meta - Channel-specific metadata needed for sending the reply
 *   For Facebook/Instagram: { senderId, facebookPage, isInstagram, GRAPH_API_VERSION, contact }
 *   For WhatsApp: { from, waNumber, contact }
 */
export const scheduleMessageBatch = (conversationId, workspaceId, channel, userMessage, meta) => {
    const timerKey = `batch_${conversationId}`;

    // Accumulate the message
    if (!pendingBatchMessages.has(conversationId)) {
        pendingBatchMessages.set(conversationId, {
            messages: [],
            workspaceId,
            channel,
            meta
        });
    }
    const batch = pendingBatchMessages.get(conversationId);
    batch.messages.push(userMessage);
    // Update meta to latest (in case contact info changed)
    batch.meta = meta;

    console.log(`📦 [MessageBatch] Collected message ${batch.messages.length} for conversation ${conversationId}: "${userMessage.substring(0, 50)}..."`);

    // Clear any existing timer
    if (pendingBatchTimers.has(timerKey)) {
        clearTimeout(pendingBatchTimers.get(timerKey));
        pendingBatchTimers.delete(timerKey);
    }

    // Set new timer
    const timer = setTimeout(async () => {
        try {
            await processBatchedMessages(conversationId);
        } catch (error) {
            console.error('❌ [MessageBatch] Error processing batched messages:', error);
        } finally {
            pendingBatchTimers.delete(timerKey);
            pendingBatchMessages.delete(conversationId);
        }
    }, MESSAGE_BATCH_DELAY_SECONDS * 1000);

    pendingBatchTimers.set(timerKey, timer);
    console.log(`⏱️ [MessageBatch] Timer reset for conversation ${conversationId} — waiting ${MESSAGE_BATCH_DELAY_SECONDS}s for more messages`);
};

/**
 * Cancel pending message batch (e.g. when a human agent replies)
 */
export const cancelMessageBatch = (conversationId) => {
    const timerKey = `batch_${conversationId}`;
    if (pendingBatchTimers.has(timerKey)) {
        clearTimeout(pendingBatchTimers.get(timerKey));
        pendingBatchTimers.delete(timerKey);
        pendingBatchMessages.delete(conversationId);
        console.log(`🚫 [MessageBatch] Cancelled batch for conversation ${conversationId}`);
    }
};

/**
 * Process all batched messages for a conversation — combine and send to AI
 */
const processBatchedMessages = async (conversationId) => {
    const batch = pendingBatchMessages.get(conversationId);
    if (!batch || batch.messages.length === 0) return;

    const { workspaceId, channel, meta, messages } = batch;

    // Combine all messages into one
    const combinedMessage = messages.length === 1
        ? messages[0]
        : messages.join('\n');

    console.log(`🤖 [MessageBatch] Processing ${messages.length} batched message(s) for conversation ${conversationId}`);
    console.log(`🤖 [MessageBatch] Combined message: "${combinedMessage.substring(0, 200)}..."`);

    try {
        const { getAutoReply } = await import('../controllers/ai.controller.js');
        const axios = (await import('axios')).default;
        const { emitToWorkspace } = await import('../socket.js');

        const aiResponse = await getAutoReply(
            workspaceId,
            conversationId,
            combinedMessage,
            channel,
            'CHATS'
        );

        if (!aiResponse) {
            console.log(`ℹ️ [MessageBatch] No AI response generated for conversation ${conversationId}`);
            return;
        }

        // Check for duplicate content (race condition protection)
        const fiveSecondsAgo = new Date(Date.now() - 5000);
        const duplicateContent = await prisma.message.findFirst({
            where: {
                conversationId,
                content: aiResponse,
                isFromContact: false,
                createdAt: { gte: fiveSecondsAgo }
            }
        });

        if (duplicateContent) {
            console.log(`⏭️ [MessageBatch] Duplicate content detected — skipping`);
            return;
        }

        const GRAPH_API_VERSION = process.env.FACEBOOK_GRAPH_API_VERSION || 'v18.0';

        // --- Send based on channel ---
        if (channel === 'whatsapp' && meta.waNumber) {
            const waReply = await axios.post(
                `https://graph.facebook.com/${GRAPH_API_VERSION}/${meta.waNumber.phoneNumberId}/messages`,
                {
                    messaging_product: 'whatsapp',
                    to: meta.from,
                    text: { body: aiResponse }
                },
                {
                    headers: { Authorization: `Bearer ${meta.waNumber.accessToken}` }
                }
            );

            const waMsgId = waReply.data?.messages?.[0]?.id;

            const botMessage = await prisma.message.create({
                data: {
                    content: aiResponse,
                    conversationId,
                    isFromContact: false,
                    messageType: 'WHATSAPP',
                    senderId: null,
                    whatsappMessageId: waMsgId || null,
                    status: 'SENT'
                }
            });

            emitToWorkspace(workspaceId, 'new_message', {
                workspaceId,
                conversationId,
                message: botMessage,
                contact: meta.contact,
                channel: 'WHATSAPP',
                assignedToId: meta.conversation?.assignedToId || null
            });

        } else if (channel === 'facebook' || channel === 'instagram') {
            // Split message if > 950 characters (Meta limit)
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
                        recipient: { id: String(meta.senderId) },
                        message: { text: chunks[i] }
                    },
                    {
                        params: { access_token: meta.facebookPage.pageAccessToken }
                    }
                );
                if (i === chunks.length - 1) {
                    sentMessageId = sendResponse.data?.message_id;
                }
                if (chunks.length > 1 && i < chunks.length - 1) {
                    await new Promise(r => setTimeout(r, 500));
                }
            }

            let botMessage;
            if (sentMessageId) {
                botMessage = await prisma.message.findUnique({
                    where: { facebookMessageId: sentMessageId }
                });
            }

            if (!botMessage) {
                try {
                    botMessage = await prisma.message.create({
                        data: {
                            content: aiResponse,
                            conversationId,
                            isFromContact: false,
                            messageType: meta.isInstagram ? 'INSTAGRAM' : 'TEXT',
                            senderId: null,
                            facebookMessageId: sentMessageId || null,
                            status: 'SENT'
                        }
                    });
                } catch (dbError) {
                    if (dbError.code === 'P2002' && sentMessageId) {
                        botMessage = await prisma.message.findUnique({
                            where: { facebookMessageId: sentMessageId }
                        });
                    }
                    if (!botMessage) {
                        console.error('❌ [MessageBatch] Failed to save bot message:', dbError);
                        return;
                    }
                }
            }

            emitToWorkspace(workspaceId, 'new_message', {
                workspaceId,
                conversationId,
                message: botMessage,
                contact: meta.contact,
                channel: meta.isInstagram ? 'INSTAGRAM' : 'FACEBOOK',
                assignedToId: meta.conversation?.assignedToId || null
            });
        }

        console.log(`✅ [MessageBatch] Batched AI reply sent for conversation ${conversationId} (${messages.length} messages combined)`);

    } catch (error) {
        const errorCode = error.response?.data?.error?.code;
        const errorSubcode = error.response?.data?.error?.error_subcode;
        console.error(`❌ [MessageBatch] Error sending batched reply (code: ${errorCode}, subcode: ${errorSubcode}):`, error.response?.data || error.message);
    }
};

export default {
    scheduleAutoReplyCheck,
    cancelAutoReplyCheck,
    scheduleMessageBatch,
    cancelMessageBatch
};

