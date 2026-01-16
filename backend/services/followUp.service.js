/**
 * Conversation Follow-up Processor
 * 
 * Handles:
 * 1. Inactivity Warning (40s) - Bot sends warning if customer doesn't respond
 * 2. Daily Reminder (24h) - Bot sends reminder once if customer doesn't respond
 * 
 * Only for WhatsApp, Facebook, Instagram channels
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Default messages
const DEFAULT_INACTIVITY_MESSAGE = "Merhaba, yanıtınızı bekliyorum. Size nasıl yardımcı olabilirim? 😊";
const DEFAULT_REMINDER_MESSAGE = "Merhaba! Geçen görüşmemizden bu yana size ulaşamadık. Hala yardıma ihtiyacınız var mı? 🙋‍♂️";

/**
 * Process inactivity warnings (40s check)
 * Called every 10 seconds
 */
export const processInactivityWarnings = async () => {
    try {
        const now = new Date();

        // Find conversations where:
        // - Bot is assigned
        // - lastBotMessageAt is set (bot has sent a message)
        // - inactivityWarningSent is false
        // - Last customer message is before lastBotMessageAt (customer hasn't responded)
        // - Time since lastBotMessageAt >= bot's inactivityWarningSeconds
        // - Channel is WHATSAPP, FACEBOOK, or INSTAGRAM

        const conversations = await prisma.conversation.findMany({
            where: {
                assignedBotId: { not: null },
                lastBotMessageAt: { not: null },
                inactivityWarningSent: false,
                status: 'OPEN',
                channel: { in: ['WHATSAPP', 'FACEBOOK', 'INSTAGRAM'] }
            },
            include: {
                assignedBot: true,
                contact: true,
                facebookPage: true,
                whatsappPhoneNumber: true
            }
        });

        // Debug: log how many conversations found
        if (conversations.length > 0) {
            const botNames = [...new Set(conversations.map(c => c.assignedBot?.name || 'No Bot'))];
            console.log(`🔍 [Follow-up] Found ${conversations.length} eligible (bots: ${botNames.join(', ')})`);
        }

        for (const conversation of conversations) {
            const bot = conversation.assignedBot;
            if (!bot) {
                console.log(`⚠️ [Follow-up] No bot for conversation ${conversation.id}`);
                continue;
            }
            if (!bot.inactivityWarningEnabled) {
                // Only log once per unique bot name to avoid spam
                continue;
            }

            console.log(`✅ [Follow-up] Bot ${bot.name} has inactivityWarningEnabled=true, checking timing...`);

            const warningSeconds = bot.inactivityWarningSeconds || 40;
            const warningThreshold = new Date(now.getTime() - warningSeconds * 1000);

            // Check if enough time has passed since bot's last message
            const timePassed = Math.floor((now.getTime() - conversation.lastBotMessageAt.getTime()) / 1000);
            console.log(`⏱️ [Follow-up] Conv ${conversation.id.substring(0, 8)}: ${timePassed}s passed, need ${warningSeconds}s`);

            if (conversation.lastBotMessageAt && conversation.lastBotMessageAt < warningThreshold) {
                // Check if customer has responded after bot's message
                const customerMessage = await prisma.message.findFirst({
                    where: {
                        conversationId: conversation.id,
                        isFromContact: true,
                        createdAt: { gt: conversation.lastBotMessageAt }
                    }
                });

                if (customerMessage) {
                    console.log(`👤 [Follow-up] Conv ${conversation.id.substring(0, 8)}: Customer responded, skipping`);
                } else {
                    // If customer hasn't responded, send warning
                    console.log(`📤 [Follow-up] Conv ${conversation.id.substring(0, 8)}: Sending inactivity warning...`);
                    const message = bot.inactivityWarningMessage || DEFAULT_INACTIVITY_MESSAGE;
                    const sent = await sendFollowUpMessage(conversation, message, 'inactivity');

                    if (sent) {
                        await prisma.conversation.update({
                            where: { id: conversation.id },
                            data: { inactivityWarningSent: true }
                        });
                        console.log(`⏰ [Follow-up] Inactivity warning sent to conversation ${conversation.id}`);
                    }
                }
            }
        }
    } catch (error) {
        console.error('❌ [Follow-up] Inactivity warning error:', error.message);
    }
};

/**
 * Process daily reminders (24h check)
 * Called every 30 minutes
 */
export const processDailyReminders = async () => {
    try {
        const now = new Date();

        // Find conversations where:
        // - Bot is assigned with dailyReminderEnabled
        // - lastBotMessageAt is set
        // - reminderSentAt is null (reminder not sent yet)
        // - Time since lastBotMessageAt >= bot's dailyReminderHours
        // - Channel is WHATSAPP, FACEBOOK, or INSTAGRAM

        const conversations = await prisma.conversation.findMany({
            where: {
                assignedBotId: { not: null },
                lastBotMessageAt: { not: null },
                reminderSentAt: null,
                status: 'OPEN',
                channel: { in: ['WHATSAPP', 'FACEBOOK', 'INSTAGRAM'] }
            },
            include: {
                assignedBot: true,
                contact: true,
                facebookPage: true,
                whatsappPhoneNumber: true
            }
        });

        for (const conversation of conversations) {
            const bot = conversation.assignedBot;
            if (!bot || !bot.dailyReminderEnabled) continue;

            const reminderHours = bot.dailyReminderHours || 24;
            const reminderThreshold = new Date(now.getTime() - reminderHours * 60 * 60 * 1000);

            // Check if enough time has passed since bot's last message
            if (conversation.lastBotMessageAt && conversation.lastBotMessageAt < reminderThreshold) {
                // Check if customer has responded after bot's message
                const customerMessage = await prisma.message.findFirst({
                    where: {
                        conversationId: conversation.id,
                        isFromContact: true,
                        createdAt: { gt: conversation.lastBotMessageAt }
                    }
                });

                // If customer hasn't responded, send reminder (only once)
                if (!customerMessage) {
                    const message = bot.dailyReminderMessage || DEFAULT_REMINDER_MESSAGE;
                    const sent = await sendFollowUpMessage(conversation, message, 'reminder');

                    if (sent) {
                        await prisma.conversation.update({
                            where: { id: conversation.id },
                            data: { reminderSentAt: now }
                        });
                        console.log(`📅 [Follow-up] Daily reminder sent to conversation ${conversation.id}`);
                    }
                }
            }
        }
    } catch (error) {
        console.error('❌ [Follow-up] Daily reminder error:', error.message);
    }
};

/**
 * Send follow-up message based on channel
 */
const sendFollowUpMessage = async (conversation, message, type) => {
    const { channel, contact, facebookPage, whatsappPhoneNumber } = conversation;
    let messageSent = false;
    let waMessageId = null;

    // WhatsApp ID can be in whatsappId or phone field
    const whatsappId = contact?.whatsappId || contact?.phone;

    // Debug: Log channel info
    console.log(`🔍 [Follow-up] Channel: ${channel}, HasWAPhone: ${!!whatsappPhoneNumber}, WaId: ${whatsappId || 'null'}`);

    try {
        if (channel === 'WHATSAPP' && whatsappPhoneNumber && whatsappId) {
            // Send via WhatsApp
            const axios = (await import('axios')).default;
            console.log(`📤 [Follow-up] Sending WhatsApp ${type} to ${whatsappId}...`);

            const response = await axios.post(
                `https://graph.facebook.com/v21.0/${whatsappPhoneNumber.phoneNumberId}/messages`,
                {
                    messaging_product: 'whatsapp',
                    to: whatsappId,
                    type: 'text',
                    text: { body: message }
                },
                {
                    headers: {
                        'Authorization': `Bearer ${whatsappPhoneNumber.accessToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            waMessageId = response.data?.messages?.[0]?.id;
            console.log(`✅ [Follow-up] WhatsApp sent! ID: ${waMessageId}`);
            messageSent = true;

        } else if ((channel === 'FACEBOOK' || channel === 'INSTAGRAM') && facebookPage) {
            // Send via Facebook/Instagram
            const axios = (await import('axios')).default;
            const recipientId = channel === 'INSTAGRAM' ? contact.instagramId : contact.facebookId;

            // Debug token
            console.log(`🔑 [Follow-up] FB Page: ${facebookPage.id}, Token exists: ${!!facebookPage.accessToken}, Token length: ${facebookPage.accessToken?.length || 0}`);

            if (recipientId && facebookPage.accessToken) {
                console.log(`📤 [Follow-up] Sending ${channel} ${type} to ${recipientId}...`);

                await axios.post(
                    `https://graph.facebook.com/v21.0/me/messages`,
                    {
                        recipient: { id: recipientId },
                        message: { text: message }
                    },
                    {
                        headers: {
                            'Authorization': `Bearer ${facebookPage.accessToken}`,
                            'Content-Type': 'application/json'
                        }
                    }
                );

                console.log(`✅ [Follow-up] ${channel} message sent!`);
                messageSent = true;
            }
        }

        // Only save message to database if actually sent
        if (messageSent) {
            await prisma.message.create({
                data: {
                    content: message,
                    conversationId: conversation.id,
                    isFromContact: false,
                    whatsappMessageId: waMessageId || null
                }
            });

            // Update conversation
            await prisma.conversation.update({
                where: { id: conversation.id },
                data: {
                    lastMessageAt: new Date(),
                    lastBotMessageAt: new Date()
                }
            });
        }

        return messageSent;
    } catch (error) {
        console.error(`❌ [Follow-up] Failed to send ${type} message:`, error.response?.data || error.message);
        return false;
    }
};

/**
 * Reset follow-up flags when customer responds
 * Call this when a new customer message arrives
 */
export const resetFollowUpFlags = async (conversationId) => {
    try {
        await prisma.conversation.update({
            where: { id: conversationId },
            data: {
                inactivityWarningSent: false
                // Don't reset reminderSentAt - it should only be sent once
            }
        });
    } catch (error) {
        console.error('❌ [Follow-up] Reset flags error:', error.message);
    }
};

/**
 * Update lastBotMessageAt when bot sends a message
 * Call this after bot sends any message
 */
export const updateLastBotMessageTime = async (conversationId) => {
    try {
        await prisma.conversation.update({
            where: { id: conversationId },
            data: {
                lastBotMessageAt: new Date(),
                inactivityWarningSent: false // Reset warning flag for new bot message
            }
        });
    } catch (error) {
        console.error('❌ [Follow-up] Update bot message time error:', error.message);
    }
};
