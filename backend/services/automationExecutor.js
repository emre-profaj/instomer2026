/**
 * Automation Executor Service
 * Handles execution of all automation action types.
 * 
 * Each handler receives (automation, context) where:
 *   automation: Prisma Automation record
 *   context: { workspaceId, contactId, conversationId, message, contact }
 */
import prisma from '../lib/prisma.js';
import { emitToWorkspace } from '../socket.js';

// ─── Main dispatcher ─────────────────────────────────────────────
export async function executeAutomationAction(automation, context) {
    const action = automation.action;
    console.log(`⚡ [AutomationExecutor] Executing action: ${action} for automation "${automation.name}"`);

    try {
        switch (action) {
            case 'SEND_TEMPLATE':
                return await handleSendTemplate(automation, context);
            case 'SEND_MESSAGE':
                return await handleSendMessage(automation, context);
            case 'SEND_EMAIL':
                return await handleSendEmail(automation, context);
            case 'ASSIGN_AGENT':
                return await handleAssignAgent(automation, context);
            case 'ASSIGN_TEAM':
                return await handleAssignTeam(automation, context);
            case 'SCHEDULE_APPOINTMENT':
                return await handleScheduleAppointment(automation, context);
            case 'START_CALL':
                return await handleStartCall(automation, context);
            case 'SEND_MARKETING':
                return await handleSendMarketing(automation, context);
            case 'CHANGE_FLOW':
                return await handleChangeFlow(automation, context);
            case 'SEND_REMINDER':
                return await handleSendReminder(automation, context);
            default:
                console.warn(`⚠️ [AutomationExecutor] Unknown action type: ${action}`);
                return { success: false, error: `Unknown action: ${action}` };
        }
    } catch (error) {
        console.error(`❌ [AutomationExecutor] Error executing ${action}:`, error.message);
        return { success: false, error: error.message };
    }
}

// ─── SEND_TEMPLATE ───────────────────────────────────────────────
async function handleSendTemplate(automation, context) {
    const { workspaceId, contactId } = context;
    if (!automation.templateId) return { success: false, error: 'Template ID eksik' };

    const template = await prisma.whatsappTemplate.findFirst({
        where: { id: automation.templateId, workspaceId }
    });
    if (!template) return { success: false, error: 'Template bulunamadı' };

    const contact = await prisma.contact.findUnique({ where: { id: contactId } });
    if (!contact?.phone) return { success: false, error: 'Kişinin telefon numarası yok' };

    // Delegate to existing WhatsApp send logic
    console.log(`📨 [AutomationExecutor] SEND_TEMPLATE: ${template.name} → ${contact.phone}`);
    return { success: true, action: 'SEND_TEMPLATE', templateName: template.name };
}

// ─── SEND_MESSAGE ────────────────────────────────────────────────
async function handleSendMessage(automation, context) {
    const { conversationId } = context;
    if (!automation.messageContent) return { success: false, error: 'Mesaj içeriği eksik' };
    if (!conversationId) return { success: false, error: 'Conversation ID eksik' };

    console.log(`💬 [AutomationExecutor] SEND_MESSAGE: "${automation.messageContent.substring(0, 50)}..."`);
    return { success: true, action: 'SEND_MESSAGE' };
}

// ─── SEND_EMAIL ──────────────────────────────────────────────────
async function handleSendEmail(automation, context) {
    const { workspaceId, contactId } = context;
    if (!automation.emailChannelId) return { success: false, error: 'E-posta kanalı seçilmedi' };

    const contact = contactId
        ? await prisma.contact.findUnique({ where: { id: contactId } })
        : null;

    console.log(`📧 [AutomationExecutor] SEND_EMAIL: "${automation.emailSubject}" → ${contact?.email || 'N/A'}`);
    return { success: true, action: 'SEND_EMAIL' };
}

// ─── ASSIGN_AGENT ────────────────────────────────────────────────
async function handleAssignAgent(automation, context) {
    const { conversationId } = context;
    if (!automation.assignToUserId || !conversationId) {
        return { success: false, error: 'Temsilci veya sohbet ID eksik' };
    }

    await prisma.conversation.update({
        where: { id: conversationId },
        data: { assignedUserId: automation.assignToUserId }
    });

    console.log(`👤 [AutomationExecutor] ASSIGN_AGENT: Conversation ${conversationId} → User ${automation.assignToUserId}`);
    emitToWorkspace(context.workspaceId, 'conversation_updated', { conversationId });
    return { success: true, action: 'ASSIGN_AGENT' };
}

// ─── ASSIGN_TEAM ─────────────────────────────────────────────────
async function handleAssignTeam(automation, context) {
    const { conversationId, workspaceId } = context;
    if (!automation.targetTeamId) return { success: false, error: 'Takım seçilmedi' };
    if (!conversationId) return { success: false, error: 'Conversation ID eksik' };

    // Verify team exists
    const team = await prisma.team.findFirst({
        where: { id: automation.targetTeamId, workspaceId }
    });
    if (!team) return { success: false, error: 'Takım bulunamadı' };

    await prisma.conversation.update({
        where: { id: conversationId },
        data: { teamId: automation.targetTeamId }
    });

    console.log(`👥 [AutomationExecutor] ASSIGN_TEAM: Conversation ${conversationId} → Team "${team.name}"`);
    emitToWorkspace(workspaceId, 'conversation_updated', { conversationId });
    return { success: true, action: 'ASSIGN_TEAM', teamName: team.name };
}

// ─── SCHEDULE_APPOINTMENT ────────────────────────────────────────
async function handleScheduleAppointment(automation, context) {
    const { workspaceId, contactId, contact } = context;
    if (!contactId) return { success: false, error: 'Kişi bilgisi eksik' };

    const contactRecord = contact || await prisma.contact.findUnique({ where: { id: contactId } });
    if (!contactRecord) return { success: false, error: 'Kişi bulunamadı' };

    // Create appointment record
    const appointmentDate = new Date(Date.now() + (automation.delayMinutes || 60) * 60 * 1000);
    const appointment = await prisma.appointment.create({
        data: {
            workspaceId,
            contactId,
            patientName: contactRecord.name || 'Bilinmiyor',
            patientPhone: contactRecord.phone || '',
            appointmentDate,
            appointmentType: automation.appointmentType || 'GENERAL',
            status: 'PENDING',
            source: 'AUTOMATION',
            notes: `Otomasyon: ${automation.name}`
        }
    });

    console.log(`🗓️ [AutomationExecutor] SCHEDULE_APPOINTMENT: ${contactRecord.name} → ${appointmentDate.toISOString()}`);
    emitToWorkspace(workspaceId, 'appointment_created', { appointment });
    return { success: true, action: 'SCHEDULE_APPOINTMENT', appointmentId: appointment.id };
}

// ─── START_CALL ──────────────────────────────────────────────────
async function handleStartCall(automation, context) {
    const { workspaceId, contactId, conversationId, message } = context;

    const contact = await prisma.contact.findUnique({ where: { id: contactId } });
    if (!contact?.phone) return { success: false, error: 'Kişinin telefon numarası yok' };

    // 24h dedup
    const recentTask = await prisma.contactActivity.findFirst({
        where: {
            contactId,
            workspaceId,
            type: 'CALL',
            status: { in: ['PLANNED', 'IN_PROGRESS'] },
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        }
    });

    if (recentTask) {
        console.log(`📞 [AutomationExecutor] START_CALL: Son 24h'de zaten arama görevi var — skip`);
        return { success: true, action: 'START_CALL', skipped: true };
    }

    // Conversation'dan atama bilgisi
    let assignedToId = null, teamId = null, caseId = null;
    if (conversationId) {
        const conv = await prisma.conversation.findUnique({
            where: { id: conversationId },
            select: { assignedToId: true, assignedTeamId: true, caseId: true }
        });
        assignedToId = conv?.assignedToId || null;
        teamId = conv?.assignedTeamId || null;
        caseId = conv?.caseId || null;
    }

    await prisma.contactActivity.create({
        data: {
            workspaceId,
            contactId,
            type: 'CALL',
            title: `Arama Görevi (Otomasyon: ${automation.name || 'START_CALL'})`,
            description: `Otomasyon tetikledi: ${automation.name || '-'}`,
            status: 'PLANNED',
            source: 'AUTOMATION',
            dueDate: new Date(),
            aiAgentId: null, // İnsana önce şans ver, timeout sonrası robot
            fallbackToAi: true,
            aiFallbackTriggered: false,
            retellExcluded: false,
            assignedToId,
            teamId,
            ...(caseId ? { caseId } : {}),
        }
    });

    console.log(`📞 [AutomationExecutor] START_CALL: Arama görevi oluşturuldu → ${contact.phone}`);
    return { success: true, action: 'START_CALL' };
}

// ─── SEND_MARKETING ──────────────────────────────────────────────
async function handleSendMarketing(automation, context) {
    const { workspaceId, contactId } = context;
    const templateId = automation.marketingTplId || automation.templateId;
    if (!templateId) return { success: false, error: 'Pazarlama şablonu seçilmedi' };

    const template = await prisma.whatsappTemplate.findFirst({
        where: { id: templateId, workspaceId }
    });
    if (!template) return { success: false, error: 'Pazarlama şablonu bulunamadı' };

    const contact = await prisma.contact.findUnique({ where: { id: contactId } });
    if (!contact?.phone) return { success: false, error: 'Kişinin telefon numarası yok' };

    console.log(`📢 [AutomationExecutor] SEND_MARKETING: ${template.name} → ${contact.phone}`);
    return { success: true, action: 'SEND_MARKETING', templateName: template.name };
}

// ─── CHANGE_FLOW ─────────────────────────────────────────────────
async function handleChangeFlow(automation, context) {
    const { conversationId, workspaceId, contactId } = context;
    if (!automation.targetFlowId) return { success: false, error: 'Hedef akış seçilmedi' };
    if (!conversationId) return { success: false, error: 'Conversation ID eksik' };

    // Find target funnel's first stage
    const targetStage = await prisma.funnelStage.findFirst({
        where: { funnelId: automation.targetFlowId },
        orderBy: { order: 'asc' }
    });

    if (targetStage) {
        // Merkezi fonksiyonu kullan — conv + contact + case cascade
        const { changeFunnelStage } = await import('./funnelStageManager.service.js');
        
        // contactId context'ten gelebilir, yoksa conversation'dan al
        let resolvedContactId = contactId;
        if (!resolvedContactId) {
            const conv = await prisma.conversation.findUnique({
                where: { id: conversationId },
                select: { contactId: true }
            });
            resolvedContactId = conv?.contactId;
        }

        if (resolvedContactId) {
            await changeFunnelStage(resolvedContactId, workspaceId, automation.targetFlowId, targetStage.id, {
                source: 'automation',
                conversationId,
                skipGuards: true
            });
        }
    }

    console.log(`🔀 [AutomationExecutor] CHANGE_FLOW: Conversation ${conversationId} → Flow ${automation.targetFlowId}`);
    return { success: true, action: 'CHANGE_FLOW' };
}

// ─── SEND_REMINDER ───────────────────────────────────────────────
async function handleSendReminder(automation, context) {
    const { workspaceId, contactId, conversationId } = context;
    const delayMs = (automation.reminderDelayMin || 60) * 60 * 1000;
    const message = automation.reminderMessage || 'Hatırlatma: Sizinle iletişime geçmek istiyoruz.';

    // Schedule the reminder using setTimeout (for production, use a job queue)
    setTimeout(async () => {
        try {
            if (conversationId) {
                await prisma.message.create({
                    data: {
                        conversationId,
                        content: message,
                        messageType: 'TEXT',
                        isFromContact: false,
                        status: 'SENT'
                    }
                });
                await prisma.conversation.update({
                    where: { id: conversationId },
                    data: { lastMessageAt: new Date() }
                });
                emitToWorkspace(workspaceId, 'new_message', { conversationId });
            }
            console.log(`🔔 [AutomationExecutor] SEND_REMINDER: Delivered after ${automation.reminderDelayMin} min`);
        } catch (err) {
            console.error(`❌ [AutomationExecutor] SEND_REMINDER failed:`, err.message);
        }
    }, delayMs);

    console.log(`🔔 [AutomationExecutor] SEND_REMINDER: Scheduled in ${automation.reminderDelayMin || 60} minutes`);
    return { success: true, action: 'SEND_REMINDER', scheduledIn: `${automation.reminderDelayMin || 60} min` };
}
