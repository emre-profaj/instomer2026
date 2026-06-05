/**
 * Smart Reminder System — 5-Step Cascading Follow-up
 * 
 * Replaces the old 2-step system (inactivity warning + daily reminder).
 * 
 * How it works:
 * 1. Bot sends a message to a customer
 * 2. If customer doesn't respond, the system sends up to 5 reminders
 *    at configurable intervals (default: 6min, 60min, 180min, 300min, 1200min)
 * 3. Each reminder message is AI-generated based on conversation context
 * 4. Smart guard checks prevent unnecessary reminders:
 *    - Customer already responded → skip
 *    - Bot's goal already achieved (isQualifiedLead) → skip
 *    - Planned activity/appointment exists → skip
 *    - Conversation not OPEN → skip
 * 5. Each step can be individually enabled/disabled
 * 
 * Cron: Runs every 60 seconds
 */

import prisma from '../lib/prisma.js';

// Default 5-step reminder configuration
const DEFAULT_REMINDER_STEPS = [
    { enabled: true, delayMinutes: 60 },
    { enabled: false, delayMinutes: 180 },
    { enabled: false, delayMinutes: 1440 },
    { enabled: false, delayMinutes: 5760 }
];

/**
 * Parse reminder steps from bot config (JSON string or default)
 */
function parseReminderSteps(bot) {
    // New system: reminderSteps JSON
    if (bot.reminderSteps) {
        try {
            const steps = JSON.parse(bot.reminderSteps);
            if (Array.isArray(steps) && steps.length > 0) return steps;
        } catch (e) { /* fall through to legacy */ }
    }
    
    // Legacy migration: Convert old fields to new format
    if (bot.inactivityWarningEnabled || bot.dailyReminderEnabled) {
        const steps = [];
        if (bot.inactivityWarningEnabled) {
            steps.push({
                enabled: true,
                delayMinutes: Math.round((bot.inactivityWarningSeconds || 40) / 60) || 1
            });
        }
        if (bot.dailyReminderEnabled) {
            steps.push({
                enabled: true,
                delayMinutes: (bot.dailyReminderHours || 24) * 60
            });
        }
        return steps;
    }
    
    return DEFAULT_REMINDER_STEPS;
}

/**
 * Find the next enabled reminder step for a conversation
 * Returns { stepIndex, delayMinutes } or null if no more steps
 */
function findNextStep(steps, currentCount) {
    for (let i = currentCount; i < steps.length; i++) {
        if (steps[i].enabled) {
            return { stepIndex: i, delayMinutes: steps[i].delayMinutes };
        }
    }
    return null; // No more enabled steps
}

/**
 * Generate a reminder message using AI (Gemini)
 */
async function generateReminderMessage(conversation, bot, stepNumber, delayMinutes) {
    try {
        // Get last 10 messages for context
        const recentMessages = await prisma.message.findMany({
            where: { conversationId: conversation.id },
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: { content: true, isFromContact: true, createdAt: true }
        });

        const messageHistory = recentMessages.reverse().map(m => 
            `${m.isFromContact ? 'Müşteri' : 'Bot'}: ${m.content?.substring(0, 200) || ''}`
        ).join('\n');

        const topic = conversation.aiTopic || conversation.aiSummary || '';
        const contactName = conversation.contact?.name || conversation.contact?.fullName || 'Müşteri';
        
        // Build time description
        let timeDesc;
        if (delayMinutes < 60) {
            timeDesc = `${delayMinutes} dakika`;
        } else if (delayMinutes < 1440) {
            timeDesc = `${Math.round(delayMinutes / 60)} saat`;
        } else {
            timeDesc = `${Math.round(delayMinutes / 1440)} gün`;
        }

        const prompt = `Sen "${bot.name}" adında kurumsal bir asistansın. 
Bot Talimatları: ${(bot.prompt || '').substring(0, 500)}

Görevin: Müşteriye ${stepNumber}. hatırlatma mesajı yazmak.
Müşteri ${timeDesc}dır yanıt vermedi.
${topic ? `Konuşma konusu: ${topic}` : ''}
Müşteri adı: ${contactName}

Son mesajlar:
${messageHistory}

Kurallar:
- Kısa ve kurumsal bir mesaj yaz (1-2 cümle max)
- Profesyonel ve resmi bir ton kullan
- ${stepNumber === 1 ? 'Nazik ama kurumsal bir hatırlatma yap' : ''}
- ${stepNumber === 2 ? 'Konuyla ilgili kurumsal bir takip mesajı yaz' : ''}
- ${stepNumber >= 3 ? 'Kibarca son bir bilgilendirme yap, iletişim kanallarının açık olduğunu belirt' : ''}
- Emoji kullanma, sade ve profesyonel ol
- Bot talimatlarındaki amacına uygun davran (numara alma, randevu, bilgi verme vs.)
- Selamlaşma tekrarı yapma, direkt konuya gir
- Samimi değil kurumsal bir dil kullan
- Sadece mesaj metnini yaz, başka hiçbir şey ekleme`;

        // Use Gemini API
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        
        // Get API key from workspace or global
        const workspace = await prisma.workspace.findUnique({
            where: { id: conversation.workspaceId },
            select: { aiApiKey: true }
        });
        
        let apiKey = workspace?.aiApiKey;
        if (!apiKey) {
            const globalSettings = await prisma.globalSettings.findUnique({ where: { id: 'singleton' } });
            apiKey = globalSettings?.globalAiApiKey;
        }
        
        if (!apiKey) {
            // Fallback: simple generic message
            return getGenericMessage(stepNumber);
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        
        const result = await model.generateContent(prompt);
        const text = result.response?.text()?.trim();
        
        if (text && text.length > 5 && text.length < 500) {
            return text;
        }
        
        return getGenericMessage(stepNumber);
    } catch (error) {
        console.error('⚠️ [SmartReminder] AI message generation failed:', error.message);
        return getGenericMessage(stepNumber);
    }
}

/**
 * Fallback generic messages if AI fails
 */
function getGenericMessage(stepNumber) {
    const messages = [
        'Talebinizle ilgili size yardımcı olmak isteriz. Uygun olduğunuzda dönüş yapabilirsiniz.',
        'Görüşmemizle ilgili bilgi vermek isteriz. Müsait olduğunuzda bizimle iletişime geçebilirsiniz.',
        'Talebinizi takip ediyoruz. Detaylı bilgi almak için bize ulaşabilirsiniz.',
        'Sürecinizle ilgili size destek olmaya hazırız. İletişim kanallarımız açıktır.',
        'Talebinizi değerlendirmekten memnuniyet duyarız. Herhangi bir sorunuz için bizimle iletişime geçebilirsiniz.'
    ];
    return messages[Math.min(stepNumber - 1, messages.length - 1)];
}

/**
 * Check if a reminder should be skipped (smart guard checks)
 */
async function shouldSkipReminder(conversation) {
    // Guard 1: Is the customer a qualified lead? (goal achieved)
    if (conversation.isQualifiedLead) {
        return 'qualified_lead';
    }
    
    // Guard 2: Has customer responded after bot's last message?
    if (conversation.lastBotMessageAt) {
        const customerMessage = await prisma.message.findFirst({
            where: {
                conversationId: conversation.id,
                isFromContact: true,
                createdAt: { gt: conversation.lastBotMessageAt }
            }
        });
        if (customerMessage) {
            return 'customer_responded';
        }
    }
    
    // Guard 3: Is there a scheduled appointment for this contact?
    // (Planned CALL/VISIT activities should NOT block reminders — those are for sales team, not bot)
    if (conversation.contactId) {
        const now = new Date();
        const plannedAppointment = await prisma.appointment.findFirst({
            where: {
                contactId: conversation.contactId,
                status: 'SCHEDULED',
                startTime: { gte: now }
            }
        });
        if (plannedAppointment) {
            return 'planned_appointment';
        }
    }
    
    return null; // No skip — send the reminder
}

/**
 * Main processor: Process all smart reminders
 * Called every 60 seconds
 */
export const processSmartReminders = async () => {
    try {
        const now = new Date();
        
        // Fetch conversations that might need reminders:
        // - Status OPEN
        // - Bot is enabled (botEnabled: true)
        // - Has a bot assigned (directly or via channel)
        // - reminderCount < 5
        // - Has lastBotMessageAt (bot has interacted)
        // Time window: Only consider conversations where bot messaged within last 48h
        // This prevents ancient stale conversations from filling the batch limit
        const cutoffDate = new Date(now.getTime() - 48 * 60 * 60 * 1000);
        
        const conversations = await prisma.conversation.findMany({
            where: {
                OR: [
                    { assignedBotId: { not: null } },
                    { facebookPage: { assignedBotId: { not: null } } },
                    { emailChannel: { assignedBotId: { not: null } } },
                    { whatsappPhoneNumber: { assignedBotId: { not: null } } },
                    { botEnabled: true } // Also catch conversations where botEnabled is set directly
                ],
                botEnabled: true, // CRITICAL: Only send reminders if bot is active
                lastBotMessageAt: { not: null, gte: cutoffDate },
                reminderCount: { lt: 5 },
                status: 'OPEN',
                channel: { in: ['WHATSAPP', 'FACEBOOK', 'INSTAGRAM', 'EMAIL', 'WIDGET'] }
            },
            include: {
                assignedBot: true,
                contact: true,
                facebookPage: { include: { assignedBot: true } },
                whatsappPhoneNumber: { include: { assignedBot: true } },
                emailChannel: { include: { assignedBot: true } }
            },
            orderBy: { lastBotMessageAt: 'desc' }, // Process most recent first
            take: 200 // Increased batch limit
        });

        if (conversations.length === 0) return;

        let sent = 0, skipped = { qualified_lead: 0, customer_responded: 0, planned_activity: 0, planned_appointment: 0, no_bot: 0, no_step: 0, time_not_elapsed: 0 };

        for (const conversation of conversations) {
            // Get bot from conversation or channel
            let bot = conversation.assignedBot;
            if (!bot && conversation.facebookPage?.assignedBot) bot = conversation.facebookPage.assignedBot;
            if (!bot && conversation.emailChannel?.assignedBot) bot = conversation.emailChannel.assignedBot;
            if (!bot && conversation.whatsappPhoneNumber?.assignedBot) bot = conversation.whatsappPhoneNumber.assignedBot;

            if (!bot) { skipped.no_bot++; continue; }

            // Parse reminder config
            const steps = parseReminderSteps(bot);
            
            // Find next enabled step
            const nextStep = findNextStep(steps, conversation.reminderCount);
            if (!nextStep) { skipped.no_step++; continue; }

            // Check if enough time has elapsed
            const delayMs = nextStep.delayMinutes * 60 * 1000;
            const referenceTime = conversation.lastBotMessageAt;
            const threshold = new Date(referenceTime.getTime() + delayMs);
            
            if (now < threshold) { skipped.time_not_elapsed++; continue; }

            // Smart guard checks
            const skipReason = await shouldSkipReminder(conversation);
            if (skipReason) { skipped[skipReason] = (skipped[skipReason] || 0) + 1; continue; }

            // Generate AI message
            const stepNumber = nextStep.stepIndex + 1;
            const message = await generateReminderMessage(conversation, bot, stepNumber, nextStep.delayMinutes);

            // Atomic update to prevent duplicates
            const updated = await prisma.conversation.updateMany({
                where: {
                    id: conversation.id,
                    reminderCount: conversation.reminderCount // Optimistic lock
                },
                data: {
                    reminderCount: nextStep.stepIndex + 1,
                    lastReminderAt: now
                }
            });

            if (updated.count > 0) {
                await sendFollowUpMessage(conversation, message, `reminder-${stepNumber}`);
                console.log(`📩 [SmartReminder] Step ${stepNumber} sent → conv ${conversation.id} (bot: ${bot.name}, delay: ${nextStep.delayMinutes}m, contact: ${conversation.contact?.name || 'N/A'})`);
                sent++;

                // Rate limit: 200ms between sends
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }

        // Summary log (only if any activity)
        if (sent > 0 || Object.values(skipped).some(v => v > 0)) {
            const skipSummary = Object.entries(skipped).filter(([_, v]) => v > 0).map(([k, v]) => `${k}=${v}`).join(', ');
            console.log(`📩 [SmartReminder] sent=${sent}, candidates=${conversations.length}${skipSummary ? ', skipped: ' + skipSummary : ''}`);
        }
    } catch (error) {
        console.error('❌ [SmartReminder] Error:', error.message);
    }
};

/**
 * Send follow-up message based on channel
 */
const sendFollowUpMessage = async (conversation, message, type) => {
    const { channel, contact, facebookPage, whatsappPhoneNumber, emailChannel } = conversation;
    let messageSent = false;
    let waMessageId = null;

    const whatsappId = contact?.whatsappId || contact?.phone;

    try {
        if (channel === 'WHATSAPP' && whatsappPhoneNumber && whatsappId) {
            const axios = (await import('axios')).default;

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
            messageSent = true;

        } else if ((channel === 'FACEBOOK' || channel === 'INSTAGRAM') && facebookPage) {
            const axios = (await import('axios')).default;
            const recipientId = channel === 'INSTAGRAM' ? contact.instagramId : contact.facebookId;

            if (!facebookPage.pageAccessToken) return;

            if (recipientId && facebookPage.pageAccessToken) {
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
                messageSent = true;
            }
        } else if (channel === 'EMAIL' && emailChannel && contact?.email) {
            const { sendEmailViaChannel } = await import('./emailSender.service.js');
            const subject = 'Hatırlatma';
            await sendEmailViaChannel(emailChannel.id, contact.email, subject, message);
            messageSent = true;
        }

        // Save message to DB if sent
        if (messageSent) {
            await prisma.message.create({
                data: {
                    content: message,
                    conversationId: conversation.id,
                    isFromContact: false,
                    whatsappMessageId: waMessageId || null
                }
            });

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
        const errorCode = error.response?.data?.error?.code;
        const errorSubcode = error.response?.data?.error?.error_subcode;

        // Silently skip known Facebook/WhatsApp errors
        if (errorCode === 10 && errorSubcode === 2018278) return false; // 24h window expired
        if (errorCode === 551 && errorSubcode === 1545041) return false; // User unreachable

        console.error(`❌ [SmartReminder] Failed to send ${type}:`, error.response?.data || error.message);
        return false;
    }
};

/**
 * Reset reminder flags when customer responds
 * Call this when a new customer message arrives
 */
export const resetFollowUpFlags = async (conversationId) => {
    try {
        await prisma.conversation.update({
            where: { id: conversationId },
            data: {
                inactivityWarningSent: false,
                reminderSentAt: null,
                reminderCount: 0,
                lastReminderAt: null
            }
        });
    } catch (error) {
        console.error('❌ [SmartReminder] Reset flags error:', error.message);
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
                inactivityWarningSent: false,
                reminderCount: 0,
                lastReminderAt: null
            }
        });
    } catch (error) {
        console.error('❌ [SmartReminder] Update bot message time error:', error.message);
    }
};

// Legacy exports for backward compatibility (server.js imports)
export const processInactivityWarnings = processSmartReminders;
export const processDailyReminders = async () => { /* no-op, handled by processSmartReminders */ };
