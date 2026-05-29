/**
 * Conversation Follow-up Processor
 * 
 * Handles:
 * 1. Inactivity Warning (40s) - Bot sends warning if customer doesn't respond
 * 2. Daily Reminder (24h) - Bot sends reminder once if customer doesn't respond
 * 
 * Only for WhatsApp, Facebook, Instagram channels
 */

import prisma from '../lib/prisma.js';


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

        // Pre-filter: Only fetch conversations where lastBotMessageAt is old enough
        // Max possible warning threshold is 300s (5 min), use that as upper bound
        // This dramatically reduces result set (989 → only actionable ones)
        const maxThreshold = new Date(now.getTime() - 30 * 1000); // Min 30s old (most bots use 40s)

        const conversations = await prisma.conversation.findMany({
            where: {
                OR: [
                    { assignedBotId: { not: null } },
                    { facebookPage: { assignedBotId: { not: null } } },
                    { emailChannel: { assignedBotId: { not: null } } },
                    { whatsappPhoneNumber: { assignedBotId: { not: null } } }
                ],
                lastBotMessageAt: {
                    not: null,
                    lte: maxThreshold  // Only conversations where bot message is old enough
                },
                inactivityWarningSent: false,
                status: 'OPEN',
                channel: { in: ['WHATSAPP', 'FACEBOOK', 'INSTAGRAM', 'EMAIL'] }
            },
            include: {
                assignedBot: true,
                contact: true,
                facebookPage: { include: { assignedBot: true } },
                whatsappPhoneNumber: { include: { assignedBot: true } },
                emailChannel: { include: { assignedBot: true } }
            },
            take: 100  // Hard limit to prevent memory spikes
        });

        // Summary log (only if conversations found)
        if (conversations.length > 0) {
            const botNames = [...new Set(conversations.map(c => c.assignedBot?.name || 'No Bot'))];
            console.log(`🔍 [Follow-up] Processing ${conversations.length} conversations (bots: ${botNames.join(', ')})`);
        }

        // Process in batches to avoid rate limiting (max 50 per cycle)
        const BATCH_SIZE = 50;
        const conversationsBatch = conversations.slice(0, BATCH_SIZE);

        if (conversations.length > BATCH_SIZE) {
            console.log(`⚠️ [Follow-up] Rate limit protection: Processing ${BATCH_SIZE} of ${conversations.length} conversations`);
        }

        let processedCount = 0;
        for (const conversation of conversationsBatch) {
            // Get bot from conversation, page, or email channel
            let bot = conversation.assignedBot;
            if (!bot && conversation.facebookPage?.assignedBot) {
                bot = conversation.facebookPage.assignedBot;
            }
            if (!bot && conversation.emailChannel?.assignedBot) {
                bot = conversation.emailChannel.assignedBot;
            }
            if (!bot && conversation.whatsappPhoneNumber?.assignedBot) {
                bot = conversation.whatsappPhoneNumber.assignedBot;
            }

            if (!bot) {
                continue; // No bot assigned anywhere
            }
            if (!bot.inactivityWarningEnabled) {
                continue;
            }

            // Removed verbose logging - only log when actually sending
            const warningSeconds = bot.inactivityWarningSeconds || 40;
            const warningThreshold = new Date(now.getTime() - warningSeconds * 1000);

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
                    // Customer responded, skip (no log to reduce spam)
                } else {
                    // Use transaction to prevent race condition - mark as sent BEFORE sending
                    const updated = await prisma.conversation.updateMany({
                        where: {
                            id: conversation.id,
                            inactivityWarningSent: false // Only update if still false
                        },
                        data: { inactivityWarningSent: true }
                    });

                    // Only send if we successfully marked it (prevents duplicates)
                    if (updated.count > 0) {
                        const message = bot.inactivityWarningMessage || DEFAULT_INACTIVITY_MESSAGE;
                        await sendFollowUpMessage(conversation, message, 'inactivity');
                        processedCount++;

                        // Add delay between API calls to avoid rate limiting (200ms)
                        await new Promise(resolve => setTimeout(resolve, 200));
                    }
                }
            }
        }

        if (processedCount > 0) {
            console.log(`✅ [Follow-up] Sent ${processedCount} inactivity warnings`);
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

        // Pre-filter: Only fetch conversations where lastBotMessageAt is old enough
        // Minimum reminder threshold dynamically — support short intervals (e.g., 4 hours)
        const minReminderThreshold = new Date(now.getTime() - 1 * 60 * 60 * 1000); // 1h minimum (actual check per bot below)

        const conversations = await prisma.conversation.findMany({
            where: {
                OR: [
                    { assignedBotId: { not: null } },
                    { facebookPage: { assignedBotId: { not: null } } },
                    { emailChannel: { assignedBotId: { not: null } } },
                    { whatsappPhoneNumber: { assignedBotId: { not: null } } }
                ],
                lastBotMessageAt: {
                    not: null,
                    lte: minReminderThreshold  // Only old enough conversations
                },
                reminderSentAt: null,
                status: 'OPEN',
                channel: { in: ['WHATSAPP', 'FACEBOOK', 'INSTAGRAM', 'EMAIL'] }
            },
            include: {
                assignedBot: true,
                contact: true,
                facebookPage: { include: { assignedBot: true } },
                whatsappPhoneNumber: { include: { assignedBot: true } },
                emailChannel: { include: { assignedBot: true } }
            },
            take: 50  // Hard limit
        });

        // Process in batches to avoid rate limiting (max 30 per cycle for daily reminders)
        const BATCH_SIZE = 30;
        const conversationsBatch = conversations.slice(0, BATCH_SIZE);

        if (conversations.length > BATCH_SIZE) {
            console.log(`⚠️ [Follow-up] Rate limit protection: Processing ${BATCH_SIZE} of ${conversations.length} daily reminders`);
        }

        let processedCount = 0;
        for (const conversation of conversationsBatch) {
            // Get bot from conversation, page, or email channel
            let bot = conversation.assignedBot;
            if (!bot && conversation.facebookPage?.assignedBot) {
                bot = conversation.facebookPage.assignedBot;
            }
            if (!bot && conversation.emailChannel?.assignedBot) {
                bot = conversation.emailChannel.assignedBot;
            }
            if (!bot && conversation.whatsappPhoneNumber?.assignedBot) {
                bot = conversation.whatsappPhoneNumber.assignedBot;
            }

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
                    // Use transaction to prevent race condition - mark as sent BEFORE sending
                    const updated = await prisma.conversation.updateMany({
                        where: {
                            id: conversation.id,
                            reminderSentAt: null // Only update if still null
                        },
                        data: { reminderSentAt: now }
                    });

                    // Only send if we successfully marked it (prevents duplicates)
                    if (updated.count > 0) {
                        const message = bot.dailyReminderMessage || DEFAULT_REMINDER_MESSAGE;
                        await sendFollowUpMessage(conversation, message, 'reminder');
                        console.log(`📅 [Follow-up] Daily reminder sent to conversation ${conversation.id}`);
                        processedCount++;

                        // Add delay between API calls to avoid rate limiting (200ms)
                        await new Promise(resolve => setTimeout(resolve, 200));
                    }
                }
            }
        }

        if (processedCount > 0) {
            console.log(`✅ [Follow-up] Sent ${processedCount} daily reminders`);
        }
    } catch (error) {
        console.error('❌ [Follow-up] Daily reminder error:', error.message);
    }
};

/**
 * Send follow-up message based on channel
 */
const sendFollowUpMessage = async (conversation, message, type) => {
    const { channel, contact, facebookPage, whatsappPhoneNumber, emailChannel } = conversation;
    let messageSent = false;
    let waMessageId = null;

    // WhatsApp ID can be in whatsappId or phone field
    const whatsappId = contact?.whatsappId || contact?.phone;

    // Removed verbose channel logging to reduce spam

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

            // Skip silently if no token (old/deleted pages)
            if (!facebookPage.pageAccessToken) {
                return; // Don't log, don't send
            }

            if (recipientId && facebookPage.pageAccessToken) {
                console.log(`📤 [Follow-up] Sending ${channel} ${type} to ${recipientId}...`);

                await axios.post(
                    `https://graph.facebook.com/v21.0/me/messages`,
                    {
                        recipient: { id: String(recipientId) },
                        message: { text: message }
                    },
                    {
                        headers: {
                            'Authorization': `Bearer ${facebookPage.pageAccessToken}`,
                            'Content-Type': 'application/json'
                        }
                    }
                );

                console.log(`✅ [Follow-up] ${channel} message sent!`);
                messageSent = true;
            }
        } else if (channel === 'EMAIL' && emailChannel && contact?.email) {
            // Send via Email
            const { sendEmailViaChannel } = await import('./emailSender.service.js');
            console.log(`📤 [Follow-up] Sending Email ${type} to ${contact.email}...`);

            const subject = type === 'reminder' ? 'Hatırlatma: Mesajınızı Bekliyoruz' : 'Yanıtınızı Bekliyoruz';
            await sendEmailViaChannel(emailChannel.id, contact.email, subject, message);

            console.log(`✅ [Follow-up] Email sent!`);
            messageSent = true;
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
        // Silently skip Facebook 24-hour policy errors (code 10, subcode 2018278)
        // and unreachable user errors (code 551, subcode 1545041)
        const errorCode = error.response?.data?.error?.code;
        const errorSubcode = error.response?.data?.error?.error_subcode;

        if (errorCode === 10 && errorSubcode === 2018278) {
            // 24-hour messaging window expired - this is expected, don't log
            return false;
        }
        if (errorCode === 551 && errorSubcode === 1545041) {
            // User unreachable - this is expected, don't log
            return false;
        }

        // Log other unexpected errors
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
