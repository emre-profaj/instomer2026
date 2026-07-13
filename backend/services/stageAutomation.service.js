import prisma from '../lib/prisma.js';

/**
 * Stage Automation Service
 * Handles entry actions, timed actions, and exit actions for funnel stages.
 */

// Action types that can be configured per stage
export const ACTION_TYPES = {
    SEND_MESSAGE: 'SEND_MESSAGE',           // Send a WhatsApp/chat message
    SEND_TEMPLATE: 'SEND_TEMPLATE',         // Send a WhatsApp template
    CREATE_TASK: 'CREATE_TASK',             // Create a task/activity
    NOTIFY_TEAM: 'NOTIFY_TEAM',             // Notify team/person
    REQUIRE_NOTE: 'REQUIRE_NOTE',           // Require a note entry
    REQUIRE_DEAL: 'REQUIRE_DEAL',           // Require a deal/quote
    REQUIRE_APPOINTMENT: 'REQUIRE_APPOINTMENT', // Require an appointment
    MOVE_STAGE: 'MOVE_STAGE',               // Auto-move to another stage
    ADD_TAG: 'ADD_TAG',                     // Add tag to contact
    ASSIGN_TEAM: 'ASSIGN_TEAM',             // Assign to team
    ASSIGN_USER: 'ASSIGN_USER',             // Assign to user
    WA_SEND_TEMPLATE: 'WA_SEND_TEMPLATE',   // Send WhatsApp template message
    WA_SEND_MESSAGE: 'WA_SEND_MESSAGE',     // Send WhatsApp free-form message
    IG_SEND_MESSAGE: 'IG_SEND_MESSAGE',     // Send Instagram DM
    RETELL_CALL: 'RETELL_CALL',             // Trigger Retell AI call
    SEND_EMAIL: 'SEND_EMAIL',               // Send email
    AUTO_CHANNEL_MESSAGE: 'AUTO_CHANNEL_MESSAGE', // Send message via last conversation channel
};

// Required field modes
export const REQUIREMENT_MODES = {
    MANDATORY: 'MANDATORY',   // Must complete before entering stage
    SUGGESTED: 'SUGGESTED',   // Show warning but allow skip
    FREE: 'FREE',             // No requirement
};

/**
 * Execute entry actions when a contact enters a stage
 */
export async function executeEntryActions(stageId, contactId, workspaceId) {
    try {
        const stage = await prisma.funnelStage.findUnique({ where: { id: stageId } });
        if (!stage?.entryActions) return;

        const config = JSON.parse(stage.entryActions);
        const actions = config.actions || [];

        for (const action of actions) {
            try {
                await executeSingleAction(action, contactId, workspaceId);
            } catch (err) {
                console.error(`[StageAutomation] Entry action failed:`, action.type, err.message);
            }
        }
    } catch (err) {
        console.error('[StageAutomation] executeEntryActions error:', err.message);
    }
}

/**
 * Schedule timed actions when a contact enters a stage
 */
export async function scheduleTimedActions(stageId, contactId, workspaceId) {
    try {
        const stage = await prisma.funnelStage.findUnique({ where: { id: stageId } });
        if (!stage?.timedActions) return;

        const config = JSON.parse(stage.timedActions);
        const actions = config.actions || [];

        for (const action of actions) {
            const delayMs = (action.delayDays || 0) * 24 * 60 * 60 * 1000
                          + (action.delayHours || 0) * 60 * 60 * 1000;
            
            if (delayMs <= 0) continue;

            const scheduledAt = new Date(Date.now() + delayMs);

            // Create a scheduled action record
            await prisma.contactActivity.create({
                data: {
                    contactId,
                    workspaceId,
                    type: 'REMINDER',
                    title: action.title || `Otomatik hatırlatma - ${stage.name}`,
                    description: JSON.stringify({
                        automationType: 'STAGE_TIMED_ACTION',
                        stageId,
                        actionType: action.type,
                        actionConfig: action
                    }),
                    dueDate: scheduledAt,
                    status: 'PENDING'
                }
            });
        }
    } catch (err) {
        console.error('[StageAutomation] scheduleTimedActions error:', err.message);
    }
}

/**
 * Execute exit actions when a contact leaves a stage
 */
export async function executeExitActions(stageId, contactId, workspaceId) {
    try {
        const stage = await prisma.funnelStage.findUnique({ where: { id: stageId } });
        if (!stage?.exitActions) return;

        const config = JSON.parse(stage.exitActions);
        const actions = config.actions || [];

        for (const action of actions) {
            try {
                await executeSingleAction(action, contactId, workspaceId);
            } catch (err) {
                console.error(`[StageAutomation] Exit action failed:`, action.type, err.message);
            }
        }

        // Cancel any pending timed actions for this stage
        await cancelTimedActions(stageId, contactId, workspaceId);
    } catch (err) {
        console.error('[StageAutomation] executeExitActions error:', err.message);
    }
}

/**
 * Check required fields before allowing stage entry
 * Returns { allowed: true } or { allowed: false, message: '...', mode: 'MANDATORY'|'SUGGESTED' }
 */
export async function checkRequiredFields(stageId, contactId, workspaceId) {
    try {
        const stage = await prisma.funnelStage.findUnique({ where: { id: stageId } });
        if (!stage?.requiredFields) return { allowed: true };

        const config = JSON.parse(stage.requiredFields);
        const mode = config.mode || 'FREE';
        if (mode === 'FREE') return { allowed: true };

        const fields = config.fields || [];
        const missing = [];

        for (const field of fields) {
            const isMet = await checkSingleRequirement(field, contactId, workspaceId);
            if (!isMet) {
                missing.push(field.prompt || field.type);
            }
        }

        if (missing.length === 0) return { allowed: true };

        return {
            allowed: mode !== 'MANDATORY',
            mode,
            missing,
            message: missing.join(', ')
        };
    } catch (err) {
        console.error('[StageAutomation] checkRequiredFields error:', err.message);
        return { allowed: true };
    }
}

/**
 * Cancel pending timed actions for a contact leaving a stage
 */
async function cancelTimedActions(stageId, contactId, workspaceId) {
    try {
        const pendingActions = await prisma.contactActivity.findMany({
            where: {
                contactId,
                workspaceId,
                type: 'REMINDER',
                status: 'PENDING',
                description: { contains: stageId }
            }
        });

        for (const action of pendingActions) {
            try {
                const desc = JSON.parse(action.description);
                if (desc.automationType === 'STAGE_TIMED_ACTION' && desc.stageId === stageId) {
                    await prisma.contactActivity.update({
                        where: { id: action.id },
                        data: { status: 'CANCELLED' }
                    });
                }
            } catch { /* skip non-JSON descriptions */ }
        }
    } catch (err) {
        console.error('[StageAutomation] cancelTimedActions error:', err.message);
    }
}

/**
 * Execute a single action
 */
export async function executeSingleAction(action, contactId, workspaceId) {
    switch (action.type) {
        case ACTION_TYPES.CREATE_TASK: {
            await prisma.contactActivity.create({
                data: {
                    contactId,
                    workspaceId,
                    type: 'TASK',
                    title: action.title || 'Otomatik görev',
                    description: action.description || '',
                    assignedToId: action.assignToUserId || null,
                    status: 'PENDING',
                    dueDate: action.dueDays ? new Date(Date.now() + action.dueDays * 86400000) : null
                }
            });
            break;
        }

        case ACTION_TYPES.ADD_TAG: {
            if (!action.tagName) break;
            const contact = await prisma.contact.findUnique({
                where: { id: contactId },
                select: { tags: true }
            });
            let tags = [];
            try { tags = JSON.parse(contact?.tags || '[]'); } catch { tags = []; }
            if (!tags.includes(action.tagName)) {
                tags.push(action.tagName);
                await prisma.contact.update({
                    where: { id: contactId },
                    data: { tags: JSON.stringify(tags) }
                });
            }
            break;
        }

        case ACTION_TYPES.NOTIFY_TEAM: {
            // Create a notification for the team
            if (action.teamId) {
                const members = await prisma.teamMember.findMany({
                    where: { teamId: action.teamId },
                    select: { userId: true }
                });
                for (const m of members) {
                    if (m.userId) {
                        await prisma.notification.create({
                            data: {
                                userId: m.userId,
                                workspaceId,
                                type: 'STAGE_AUTOMATION',
                                title: action.title || 'Aşama bildirimi',
                                message: action.message || `Bir kişi yeni aşamaya geçti`,
                                isRead: false
                            }
                        });
                    }
                }
            }
            break;
        }

        case ACTION_TYPES.SEND_MESSAGE: {
            // Just create a note for now — actual message sending requires conversation context
            await prisma.contactActivity.create({
                data: {
                    contactId,
                    workspaceId,
                    type: 'NOTE',
                    title: 'Otomatik mesaj planlandı',
                    description: action.message || '',
                    status: 'PENDING'
                }
            });
            break;
        }

        case 'WA_SEND_TEMPLATE': {
            // Import sendTemplateToContact pattern from automation.controller.js
            // That function is NOT exported, so replicate the logic:
            const contact = await prisma.contact.findUnique({ where: { id: contactId } });
            if (contact?.phone && action.templateId) {
                const template = await prisma.messageTemplate.findUnique({ where: { id: action.templateId } });
                if (template) {
                    // Get workspace WhatsApp config
                    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { whatsappPhoneId: true, whatsappToken: true } });
                    if (workspace?.whatsappPhoneId && workspace?.whatsappToken) {
                        const axios = (await import('axios')).default;
                        const payload = {
                            messaging_product: 'whatsapp',
                            to: contact.phone.replace(/\D/g, ''),
                            type: 'template',
                            template: {
                                name: template.name,
                                language: { code: template.language || 'tr' }
                            }
                        };
                        await axios.post(
                            `https://graph.facebook.com/v21.0/${workspace.whatsappPhoneId}/messages`,
                            payload,
                            { headers: { Authorization: `Bearer ${workspace.whatsappToken}` } }
                        );
                        console.log(`[StageAutomation] WA template '${template.name}' sent to ${contact.phone}`);
                    }
                }
            }
            break;
        }

        case 'WA_SEND_MESSAGE': {
            const contactWa = await prisma.contact.findUnique({ where: { id: contactId } });
            if (contactWa?.phone && action.message) {
                const workspaceWa = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { whatsappPhoneId: true, whatsappToken: true } });
                if (workspaceWa?.whatsappPhoneId && workspaceWa?.whatsappToken) {
                    const axios = (await import('axios')).default;
                    await axios.post(
                        `https://graph.facebook.com/v21.0/${workspaceWa.whatsappPhoneId}/messages`,
                        {
                            messaging_product: 'whatsapp',
                            to: contactWa.phone.replace(/\D/g, ''),
                            type: 'text',
                            text: { body: action.message }
                        },
                        { headers: { Authorization: `Bearer ${workspaceWa.whatsappToken}` } }
                    );
                    console.log(`[StageAutomation] WA message sent to ${contactWa.phone}`);
                }
            }
            break;
        }

        case 'IG_SEND_MESSAGE': {
            const contactIg = await prisma.contact.findUnique({ where: { id: contactId } });
            if (contactIg?.instagramId && action.message) {
                const page = await prisma.facebookPage.findFirst({
                    where: { workspaceId, instagramBusinessId: { not: null } }
                });
                if (page) {
                    const axios = (await import('axios')).default;
                    await axios.post(
                        `https://graph.facebook.com/v21.0/${page.pageId}/messages`,
                        {
                            recipient: { id: contactIg.instagramId },
                            message: { text: action.message }
                        },
                        { headers: { Authorization: `Bearer ${page.pageAccessToken}` } }
                    );
                    console.log(`[StageAutomation] IG message sent to ${contactIg.instagramId}`);
                }
            }
            break;
        }

        case 'RETELL_CALL': {
            const contactRetell = await prisma.contact.findUnique({ where: { id: contactId } });
            if (contactRetell?.phone) {
                try {
                    const { triggerAutoCall } = await import('../controllers/retell.controller.js');
                    await triggerAutoCall(workspaceId, contactRetell.phone, contactId, contactRetell.firstName || contactRetell.name || 'Müşteri', 'STAGE_AUTOMATION');
                    console.log(`[StageAutomation] Retell call triggered for ${contactRetell.phone}`);
                } catch (err) {
                    console.error('[StageAutomation] Retell call failed:', err.message);
                }
            }
            break;
        }

        case 'SEND_EMAIL': {
            const contactEmail = await prisma.contact.findUnique({ where: { id: contactId } });
            if (contactEmail?.email && action.subject) {
                try {
                    const { sendEmail } = await import('./emailSender.service.js');
                    await sendEmail({ to: contactEmail.email, subject: action.subject, html: action.content || '' });
                    console.log(`[StageAutomation] Email sent to ${contactEmail.email}`);
                } catch (err) {
                    console.error('[StageAutomation] Email send failed:', err.message);
                }
            }
            break;
        }

        case 'AUTO_CHANNEL_MESSAGE': {
            if (!action.message) break;
            const conv = await prisma.conversation.findFirst({
                where: { contactId, workspaceId },
                orderBy: { lastMessageAt: 'desc' },
                include: { contact: true }
            });
            if (!conv) break;

            try {
                if (conv.channel === 'WHATSAPP' && conv.contact?.phone) {
                    const workspaceAuto = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { whatsappPhoneId: true, whatsappToken: true } });
                    if (workspaceAuto?.whatsappPhoneId) {
                        const axios = (await import('axios')).default;
                        await axios.post(`https://graph.facebook.com/v21.0/${workspaceAuto.whatsappPhoneId}/messages`, {
                            messaging_product: 'whatsapp', to: conv.contact.phone.replace(/\D/g, ''), type: 'text', text: { body: action.message }
                        }, { headers: { Authorization: `Bearer ${workspaceAuto.whatsappToken}` } });
                    }
                } else if (conv.channel === 'INSTAGRAM') {
                    const { sendInstagramMessage } = await import('../controllers/facebook.controller.js');
                    await sendInstagramMessage(conv.id, action.message);
                } else if (conv.channel === 'FACEBOOK') {
                    const { sendFacebookMessage } = await import('../controllers/facebook.controller.js');
                    await sendFacebookMessage(conv.id, action.message);
                }
                console.log(`[StageAutomation] AUTO_CHANNEL message sent via ${conv.channel}`);
            } catch (err) {
                console.error(`[StageAutomation] AUTO_CHANNEL failed:`, err.message);
            }
            break;
        }

        default:
            console.log(`[StageAutomation] Unknown action type: ${action.type}`);
    }
}

/**
 * Check a single requirement
 */
async function checkSingleRequirement(field, contactId, workspaceId) {
    switch (field.type) {
        case 'NOTE': {
            const note = await prisma.contactActivity.findFirst({
                where: { contactId, workspaceId, type: 'NOTE' },
                orderBy: { createdAt: 'desc' }
            });
            return !!note;
        }

        case 'DEAL_EXISTS': {
            const deal = await prisma.deal.findFirst({
                where: { contactId, workspaceId }
            });
            return !!deal;
        }

        case 'APPOINTMENT': {
            const appointment = await prisma.contactActivity.findFirst({
                where: { contactId, workspaceId, type: 'MEETING', status: { not: 'CANCELLED' } }
            });
            return !!appointment;
        }

        case 'PHONE': {
            const contact = await prisma.contact.findUnique({
                where: { id: contactId },
                select: { phone: true }
            });
            return !!contact?.phone;
        }

        default:
            return true;
    }
}
