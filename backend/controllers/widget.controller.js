import prisma from '../lib/prisma.js';
import { getAutoReply } from './ai.controller.js';
import { getIO, emitToWorkspace } from '../socket.js';
import { applyChannelRouting } from '../services/conversationRouting.service.js';
import { executeWebFormAutomation } from './automation.controller.js';
import { normalizePhone } from '../utils/phoneNormalizer.js';
import { maskSensitiveInfo } from '../utils/masking.js';


// Get widget settings for a workspace
export const getWidgetSettings = async (req, res) => {
    try {
        const { workspaceId } = req.params;

        let settings = await prisma.webWidget.findFirst({
            where: { workspaceId },
            include: {
                assignedBot: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            }
        });

        // Initialize if not exists
        if (!settings) {
            settings = await prisma.webWidget.create({
                data: {
                    workspaceId,
                    title: 'Canlı Destek',
                    subtitle: 'Size nasıl yardımcı olabiliriz?',
                    primaryColor: '#ef4444',
                    greetingMessage: 'Merhaba! Size nasıl yardımcı olabilirim?',
                    isActive: true
                }
            });
        }

        // Get available bots for this workspace
        const bots = await prisma.aIBot.findMany({
            where: { workspaceId },
            select: {
                id: true,
                name: true,
                isActive: true
            },
            orderBy: { name: 'asc' }
        });

        res.json({ settings, bots });
    } catch (error) {
        console.error('Error fetching widget settings:', error);
        res.status(500).json({ error: 'Ayarlar yüklenemedi.' });
    }
};

// Get widget settings by widgetId (for embed script)
export const getWidgetByWidgetId = async (req, res) => {
    try {
        const { widgetId } = req.params;

        const settings = await prisma.webWidget.findUnique({
            where: { id: widgetId },
            include: {
                assignedBot: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            }
        });

        if (!settings) {
            return res.status(404).json({ error: 'Widget bulunamadı.' });
        }

        // Return settings with workspaceId for chat functionality
        res.json({
            settings,
            workspaceId: settings.workspaceId
        });
    } catch (error) {
        console.error('Error fetching widget by widgetId:', error);
        res.status(500).json({ error: 'Widget yüklenemedi.' });
    }
};

// Update widget settings
export const updateWidgetSettings = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const data = req.body;

        // If a bot is assigned, automatically activate it
        if (data.assignedBotId) {
            await prisma.aIBot.update({
                where: { id: data.assignedBotId },
                data: { isActive: true }
            });
            console.log(`✅ Bot ${data.assignedBotId} automatically activated (assigned to Widget)`);
        }

        const settings = await prisma.webWidget.upsert({
            where: { workspaceId },
            update: {
                title: data.title,
                subtitle: data.subtitle,
                primaryColor: data.primaryColor,
                greetingMessage: data.greetingMessage,
                isActive: data.isActive,
                position: data.position,
                width: data.width,
                assignedBotId: data.assignedBotId || null
            },
            create: {
                workspaceId,
                title: data.title || 'Canlı Destek',
                subtitle: data.subtitle || 'Size nasıl yardımcı olabiliriz?',
                primaryColor: data.primaryColor || '#ef4444',
                greetingMessage: data.greetingMessage || 'Merhaba! Size nasıl yardımcı olabilirim?',
                isActive: data.isActive ?? true,
                position: data.position || 'RIGHT',
                width: data.width || 350,
                assignedBotId: data.assignedBotId || null
            }
        });

        // Propagation: Update all OPEN widget conversations for this workspace
        await prisma.conversation.updateMany({
            where: {
                workspaceId: workspaceId,
                channel: 'WIDGET',
                status: 'OPEN'
            },
            data: {
                assignedBotId: data.assignedBotId || null
            }
        });

        res.json({ settings });
    } catch (error) {
        console.error('Error updating widget settings:', error);
        res.status(500).json({ error: 'Ayarlar güncellenemedi.' });
    }
};

// Handle public chat from widget
export const handleWidgetChat = async (req, res) => {
    try {
        const { workspaceId, widgetId, visitorId, message } = req.body;

        if (!message || !workspaceId) {
            return res.status(400).json({ error: 'Eksik bilgi.' });
        }


        // 1. Find or Create Contact for this visitor in this workspace
        let contact = await prisma.contact.findFirst({
            where: {
                workspaceId: workspaceId,
                tags: { contains: visitorId }
            }
        });

        // If contact with this visitorId exists, reuse it (even if it has phone/email from prechat form)
        if (!contact) {
            contact = await prisma.contact.create({
                data: {
                    workspaceId: workspaceId,
                    name: 'Web Ziyaretçisi',
                    tags: JSON.stringify([visitorId])
                }
            });
        }

        // 2. Find or Create Conversation
        let conversation = await prisma.conversation.findFirst({
            where: {
                contactId: contact.id,
                workspaceId,
                status: 'OPEN'
            }
        });

        // 24 saat birleştirme: Herhangi bir kanaldan son 24 saatte konuşma ara
        if (!conversation) {
            const mergeWindow = new Date(Date.now() - 24 * 60 * 60 * 1000);
            conversation = await prisma.conversation.findFirst({
                where: {
                    contactId: contact.id,
                    workspaceId,
                    lastMessageAt: { gte: mergeWindow },
                    status: { not: 'RESOLVED' }
                },
                orderBy: { lastMessageAt: 'desc' }
            });
            if (conversation) {
                console.log(`🔗 [Widget Merge] Reusing existing ${conversation.channel} conversation ${conversation.id} (within 24h)`);
            }
        }

        let isNewConversation = false;
        if (!conversation) {
            // Get widget settings for assignedBotId
            // If widgetId is provided, use that specific widget; otherwise fallback to first
            let widgetSettings = null;
            if (widgetId) {
                widgetSettings = await prisma.webWidget.findUnique({
                    where: { id: widgetId }
                });
            }
            if (!widgetSettings) {
                widgetSettings = await prisma.webWidget.findFirst({
                    where: { workspaceId }
                });
            }

            conversation = await prisma.conversation.create({
                data: {
                    contactId: contact.id,
                    workspaceId,
                    status: 'OPEN',
                    channel: 'WIDGET',
                    assignedBotId: widgetSettings?.assignedBotId
                },
                include: {
                    contact: true
                }
            });
            isNewConversation = true;

            // Apply channel routing for team assignment
            try {
                const routingResult = await applyChannelRouting(
                    workspaceId,
                    conversation.id,
                    'WEB_WIDGET',
                    true
                );
                if (routingResult?.teamId) {
                    console.log(`📍 [Widget] Routed to team ${routingResult.teamId}`);
                }
            } catch (routingError) {
                console.error('❌ [Widget] Routing error:', routingError);
            }

            // Trigger NEW_WEBFORM automations (e.g., send WhatsApp template)
            try {
                executeWebFormAutomation(workspaceId, contact, { message });
                console.log(`🤖 [Widget] Web form automation triggered for contact ${contact.id}`);
            } catch (automationError) {
                console.error('❌ [Widget] Automation trigger error:', automationError);
            }

            // --- FLOW ENGINE TRIGGER ---
            try {
                const { executeFlowsByTrigger } = await import('./flow.controller.js');
                executeFlowsByTrigger(workspaceId, 'FIRST_MSG', {
                    contact, conversation, message
                });
            } catch (flowErr) {
                console.error('⚠️ [Widget] Flow engine error:', flowErr.message);
            }
        } else {
            // Existing conversation - sync bot assignment from widget settings
            let widgetSettings = null;
            if (widgetId) {
                widgetSettings = await prisma.webWidget.findUnique({ where: { id: widgetId } });
            }
            if (!widgetSettings) {
                widgetSettings = await prisma.webWidget.findFirst({ where: { workspaceId } });
            }
            const widgetBotId = widgetSettings?.assignedBotId || null;
            // Update if bot changed or if botEnabled was false
            if (widgetBotId !== conversation.assignedBotId || conversation.botEnabled === false) {
                conversation = await prisma.conversation.update({
                    where: { id: conversation.id },
                    data: {
                        assignedBotId: widgetBotId,
                        botEnabled: widgetBotId ? true : conversation.botEnabled
                    },
                    include: { contact: true }
                });
                console.log(`🤖 [Widget] Synced bot ${widgetBotId} to existing conversation ${conversation.id}`);
            }
        }

        // 3. Save Visitor Message
        const visitorMessage = await prisma.message.create({
            data: {
                content: message,
                conversationId: conversation.id,
                isFromContact: true
            }
        });

        // Update conversation last message time and unread count
        const updatedConversation = await prisma.conversation.update({
            where: { id: conversation.id },
            data: {
                lastMessageAt: new Date(),
                unreadCount: { increment: 1 }
            },
            include: {
                contact: true
            }
        });

        // Emit socket events for real-time updates (workspace-specific)
        try {
            // Emit new_conversation if this is a new conversation
            if (isNewConversation) {
                emitToWorkspace(workspaceId, 'new_conversation', {
                    workspaceId,
                    conversationId: conversation.id,
                    conversation: updatedConversation,
                    channel: 'WIDGET'
                });
                console.log(`📡 [Widget] new_conversation emitted for workspace ${workspaceId}`);
            }

            // Emit new_message for the visitor message
            emitToWorkspace(workspaceId, 'new_message', {
                workspaceId,
                conversationId: conversation.id,
                message: { ...visitorMessage, content: maskSensitiveInfo(visitorMessage.content) },
                conversation: updatedConversation,
                contact: updatedConversation.contact,
                channel: 'WIDGET'
            });
            console.log(`📡 [Widget] new_message emitted for conversation ${conversation.id}`);
        } catch (socketError) {
            console.error('❌ [Widget] Socket emit error:', socketError);
        }

        // --- AUTO EXTRACT START ---
        try {
            const { autoExtractFromConversation } = await import('./ai.controller.js');
            autoExtractFromConversation(workspaceId, conversation.id);
        } catch (extractError) {
            console.error('❌ AI Auto-Extract (Widget) failed:', extractError);
        }
        // --- AUTO EXTRACT END ---

        // --- AUTOMATION RULES (Widget) ---
        try {
            const { executePhoneCaptureRule, executeHotKeywordRule, executeSalesPhoneCallRule, executeAutoCallPlanning } = await import('./rules.controller.js');
            // Await phone capture so contact.phone is updated before auto call planning
            await executePhoneCaptureRule(workspaceId, conversation.id, message);
            executeHotKeywordRule(workspaceId, conversation.id, message).catch(e =>
                console.error('❌ [RULE:HOT_KEYWORD] Widget async error:', e.message)
            );
            executeSalesPhoneCallRule(workspaceId, conversation.id, message).catch(e =>
                console.error('❌ [RULE:SALES_PHONE_CALL] Widget async error:', e.message)
            );
            // Reload contact to get updated phone after capture
            const updatedContact = await prisma.contact.findUnique({ where: { id: contact.id } });
            if (updatedContact?.phone) {
                executeAutoCallPlanning(workspaceId, contact.id, 'WEB_WIDGET').catch(e =>
                    console.error('❌ [RULE:AUTO_CALL] Widget async error:', e.message)
                );
            }
        } catch (ruleErr) {
            console.error('❌ [RULES] Widget error:', ruleErr.message);
        }
        // --- AUTOMATION RULES END ---

        // 4. Get AI response
        const aiResponse = await getAutoReply(workspaceId, conversation.id, message, 'widget', 'WIDGET');

        if (aiResponse) {
            // Save AI Message
            const botMessage = await prisma.message.create({
                data: {
                    content: aiResponse,
                    conversationId: conversation.id,
                    isFromContact: false
                }
            });

            // Emit socket event for bot message so CRM updates in real-time
            try {
                emitToWorkspace(workspaceId, 'new_message', {
                    workspaceId,
                    conversationId: conversation.id,
                    message: botMessage,
                    conversation: updatedConversation,
                    contact: updatedConversation.contact,
                    channel: 'WIDGET'
                });
                console.log(`📡 [Widget] Bot message emitted for conversation ${conversation.id}`);
            } catch (socketError) {
                console.error('❌ [Widget] Bot message socket emit error:', socketError);
            }

            return res.json({ reply: aiResponse });
        }

        res.json({ reply: null });
    } catch (error) {
        console.error('Widget chat error:', error);
        res.status(500).json({ error: 'Mesaj gönderilemedi.' });
    }
};

// Handle pre-chat form submission from widget
export const handlePrechat = async (req, res) => {
    try {
        const { workspaceId, visitorId, name, phone, subject } = req.body;

        if (!workspaceId || !visitorId || !name || !phone) {
            return res.status(400).json({ error: 'Eksik bilgi.' });
        }

        console.log(`📝 [Widget Prechat] Received form: ${name}, ${phone}, ${subject || 'Konu yok'}`);

        // Normalize phone number
        const normalizedPhone = normalizePhone(phone);

        // 1. Find existing contact by phone OR visitorId, or create new one
        let contact = await prisma.contact.findFirst({
            where: {
                workspaceId,
                OR: [
                    { phone: normalizedPhone },
                    { phone: phone }, // Try exact match too
                    { tags: { contains: visitorId } }
                ]
            }
        });

        if (contact) {
            // Update existing contact with new info and mark as HOT_LEAD
            contact = await prisma.contact.update({
                where: { id: contact.id },
                data: {
                    name: name,
                    phone: normalizedPhone,
                    status: 'HOT_OPPORTUNITY',
                    tags: JSON.stringify([visitorId, ...(contact.tags ? JSON.parse(contact.tags).filter(t => t !== visitorId) : [])])
                }
            });
            console.log(`✅ [Widget Prechat] Updated existing contact ${contact.id} as HOT_OPPORTUNITY`);
        } else {
            // Create new contact
            contact = await prisma.contact.create({
                data: {
                    workspaceId,
                    name: name,
                    phone: normalizedPhone,
                    tags: JSON.stringify([visitorId]),
                    source: 'WEB_WIDGET',
                    status: 'HOT_OPPORTUNITY'
                }
            });
            console.log(`✅ [Widget Prechat] Created new contact ${contact.id} as HOT_LEAD`);
        }

        // 2. Check for existing OPEN conversation, or create new one
        let conversation = await prisma.conversation.findFirst({
            where: {
                contactId: contact.id,
                workspaceId,
                status: 'OPEN'
            }
        });

        // 24 saat birleştirme: Herhangi bir kanaldan son 24 saatte konuşma ara
        if (!conversation) {
            const mergeWindow = new Date(Date.now() - 24 * 60 * 60 * 1000);
            conversation = await prisma.conversation.findFirst({
                where: {
                    contactId: contact.id,
                    workspaceId,
                    lastMessageAt: { gte: mergeWindow },
                    status: { not: 'RESOLVED' }
                },
                orderBy: { lastMessageAt: 'desc' }
            });
            if (conversation) {
                console.log(`🔗 [Widget Prechat Merge] Reusing existing ${conversation.channel} conversation ${conversation.id} (within 24h)`);
            }
        }

        let isNewConversation = false;
        if (!conversation) {
            // Get widget settings for assignedBotId
            const settings = await prisma.webWidget.findFirst({
                where: { workspaceId }
            });

            conversation = await prisma.conversation.create({
                data: {
                    contactId: contact.id,
                    workspaceId,
                    status: 'OPEN',
                    channel: 'WIDGET',
                    assignedBotId: settings?.assignedBotId
                },
                include: {
                    contact: true
                }
            });
            isNewConversation = true;

            // Apply channel routing for team assignment
            try {
                const routingResult = await applyChannelRouting(
                    workspaceId,
                    conversation.id,
                    'WEB_WIDGET',
                    true
                );
                if (routingResult?.teamId) {
                    console.log(`📍 [Widget Prechat] Routed to team ${routingResult.teamId}`);
                }
            } catch (routingError) {
                console.error('❌ [Widget Prechat] Routing error:', routingError);
            }

            // Trigger NEW_WEBFORM automations
            try {
                executeWebFormAutomation(workspaceId, contact, { name, phone, subject });
                console.log(`🤖 [Widget Prechat] Web form automation triggered for contact ${contact.id}`);
            } catch (automationError) {
                console.error('❌ [Widget Prechat] Automation trigger error:', automationError);
            }

            // --- FLOW ENGINE TRIGGER ---
            try {
                const { executeFlowsByTrigger } = await import('./flow.controller.js');
                executeFlowsByTrigger(workspaceId, 'NEW_FORM', {
                    contact, conversation,
                    formData: { name, phone: normalizedPhone, subject }
                });
            } catch (flowErr) {
                console.error('⚠️ [Widget Prechat] Flow engine error:', flowErr.message);
            }
        }

        // 3. Save form data as first message (system note)
        const formMessage = `📋 **İletişim Formu**\n• İsim: ${name}\n• Telefon: ${normalizedPhone}${subject ? `\n• Konu: ${subject}` : ''}`;

        const formDataMessage = await prisma.message.create({
            data: {
                content: formMessage,
                conversationId: conversation.id,
                isFromContact: true
            }
        });

        // Update conversation
        const updatedConversation = await prisma.conversation.update({
            where: { id: conversation.id },
            data: {
                lastMessageAt: new Date(),
                unreadCount: { increment: 1 }
            },
            include: {
                contact: true
            }
        });

        // Emit socket events
        try {
            if (isNewConversation) {
                emitToWorkspace(workspaceId, 'new_conversation', {
                    workspaceId,
                    conversationId: conversation.id,
                    conversation: updatedConversation,
                    channel: 'WIDGET'
                });
                console.log(`📡 [Widget Prechat] new_conversation emitted`);
            }

            emitToWorkspace(workspaceId, 'new_message', {
                workspaceId,
                conversationId: conversation.id,
                message: formDataMessage,
                conversation: updatedConversation,
                contact: updatedConversation.contact,
                channel: 'WIDGET'
            });
        } catch (socketError) {
            console.error('❌ [Widget Prechat] Socket emit error:', socketError);
        }

        // --- AUTO CALL TRIGGER ---
        if (normalizedPhone) {
            try {
                const { triggerAutoCall } = await import('./retell.controller.js');
                triggerAutoCall(workspaceId, normalizedPhone, contact?.id, name, 'WIDGET');
            } catch (autoCallErr) {
                console.error('⚠️ [Widget Prechat] AutoCall trigger error:', autoCallErr.message);
            }
        }

        // --- AUTO CALL PLANNING (Prechat Form) ---
        try {
            const { executeAutoCallPlanning } = await import('./rules.controller.js');
            executeAutoCallPlanning(workspaceId, contact.id, 'FORM').catch(e =>
                console.error('❌ [RULE:AUTO_CALL] Prechat async error:', e.message)
            );
        } catch (ruleErr) {
            console.error('❌ [RULES] Prechat error:', ruleErr.message);
        }
        // --- AUTO CALL PLANNING END ---

        // --- 🎯 EVRENSEL SINIFLANDIRICI (Widget Prechat Form) ---
        try {
            const { executeClassificationActions } = await import('../services/universalClassifier.service.js');

            const classResult = {
                classification: 'FIRSAT',
                confidence: 0.95,
                extractedData: {
                    name: name,
                    phone: normalizedPhone,
                    topic: subject || 'Web Widget İletişim',
                    preferredCallTime: null,
                    requestedAction: 'CALL',
                    requestedDate: null,
                    branchInfo: null
                },
                isQualifiedLead: !!(name && normalizedPhone),
                matchedFunnelId: null,
                reasoning: 'Widget Prechat Form — yapılandırılmış veri'
            };

            await prisma.conversation.update({
                where: { id: conversation.id },
                data: {
                    classificationData: JSON.stringify(classResult),
                    classifiedAt: new Date(),
                    isQualifiedLead: classResult.isQualifiedLead
                }
            });

            if (classResult.isQualifiedLead) {
                await executeClassificationActions(
                    workspaceId, conversation.id, contact.id, classResult
                );
            }
        } catch (classifyErr) {
            console.error('⚠️ [Widget Prechat Classifier] Non-fatal error:', classifyErr.message);
        }
        // --- SINIFLANDIRICI END ---

        res.json({
            success: true,
            contactId: contact.id,
            conversationId: conversation.id
        });
    } catch (error) {
        console.error('Widget prechat error:', error);
        res.status(500).json({ error: 'Form işlenemedi.' });
    }
};
