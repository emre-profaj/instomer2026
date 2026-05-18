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

export default {
    scheduleAutoReplyCheck,
    cancelAutoReplyCheck
};

