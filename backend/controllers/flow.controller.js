import prisma from '../lib/prisma.js';


// ============================================
// CRUD: Flow Management
// ============================================

export const getFlows = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const flows = await prisma.flow.findMany({
            where: { workspaceId },
            orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
            include: {
                children: {
                    orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
                    include: {
                        children: {
                            orderBy: [{ order: 'asc' }, { createdAt: 'desc' }]
                        }
                    }
                }
            }
        });
        res.json({ flows });
    } catch (error) {
        console.error('Get flows error:', error);
        res.status(500).json({ error: 'Akışlar yüklenirken hata oluştu' });
    }
};

export const createFlow = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { name, steps, trigger, isActive, parentId, flowType, icon, color, description } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Akış adı gereklidir' });
        }

        // Validate parent hierarchy (max 3 levels)
        if (parentId) {
            const parent = await prisma.flow.findUnique({ where: { id: parentId } });
            if (!parent) return res.status(400).json({ error: 'Üst akış bulunamadı' });
            if (parent.parentId) {
                const grandparent = await prisma.flow.findUnique({ where: { id: parent.parentId } });
                if (grandparent?.parentId) {
                    return res.status(400).json({ error: 'Maksimum 3 seviye hiyerarşi desteklenir' });
                }
            }
        }

        // Extract trigger from steps if not provided directly
        let flowTrigger = trigger || null;
        if (!flowTrigger && Array.isArray(steps)) {
            const triggerStep = steps.find(s =>
                ['NEW_FORM', 'FIRST_MSG', 'TAG_ADDED', 'HAS_PHONE', 'NO_REPLY', 'STAGE_CHANGED', 'FLOW_ENTERED'].includes(s.type)
            );
            if (triggerStep) flowTrigger = triggerStep.type;
        }

        // Auto-set order: next in parent's children
        let flowOrder = 0;
        const siblings = await prisma.flow.findMany({
            where: { workspaceId, parentId: parentId || null },
            orderBy: { order: 'desc' },
            take: 1
        });
        if (siblings.length > 0) flowOrder = siblings[0].order + 1;

        const flow = await prisma.flow.create({
            data: {
                workspaceId,
                name,
                steps: steps || [],
                trigger: flowTrigger,
                isActive: isActive || false,
                parentId: parentId || null,
                flowType: flowType || 'SUB',
                order: flowOrder,
                icon: icon || null,
                color: color || null,
                description: description || null
            }
        });

        res.status(201).json({ flow });
    } catch (error) {
        console.error('Create flow error:', error);
        res.status(500).json({ error: 'Akış oluşturulurken hata oluştu' });
    }
};

export const updateFlow = async (req, res) => {
    try {
        const { workspaceId, flowId } = req.params;
        const { name, steps, trigger, isActive, parentId, flowType, order, icon, color, description } = req.body;

        const existing = await prisma.flow.findFirst({
            where: { id: flowId, workspaceId }
        });
        if (!existing) {
            return res.status(404).json({ error: 'Akış bulunamadı' });
        }

        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (steps !== undefined) {
            updateData.steps = steps;
            // Auto-extract trigger from steps
            const triggerStep = (Array.isArray(steps) ? steps : []).find(s =>
                ['NEW_FORM', 'FIRST_MSG', 'TAG_ADDED', 'HAS_PHONE', 'NO_REPLY', 'STAGE_CHANGED', 'FLOW_ENTERED'].includes(s.type)
            );
            updateData.trigger = triggerStep ? triggerStep.type : existing.trigger;
        }
        if (trigger !== undefined) updateData.trigger = trigger;
        if (isActive !== undefined) updateData.isActive = isActive;
        if (parentId !== undefined) updateData.parentId = parentId || null;
        if (flowType !== undefined) updateData.flowType = flowType;
        if (order !== undefined) updateData.order = order;
        if (icon !== undefined) updateData.icon = icon;
        if (color !== undefined) updateData.color = color;
        if (description !== undefined) updateData.description = description;

        const flow = await prisma.flow.update({
            where: { id: flowId },
            data: updateData
        });

        res.json({ flow });
    } catch (error) {
        console.error('Update flow error:', error);
        res.status(500).json({ error: 'Akış güncellenirken hata oluştu' });
    }
};

export const deleteFlow = async (req, res) => {
    try {
        const { workspaceId, flowId } = req.params;

        const existing = await prisma.flow.findFirst({
            where: { id: flowId, workspaceId }
        });
        if (!existing) {
            return res.status(404).json({ error: 'Akış bulunamadı' });
        }

        await prisma.flow.delete({ where: { id: flowId } });
        res.json({ message: 'Akış silindi' });
    } catch (error) {
        console.error('Delete flow error:', error);
        res.status(500).json({ error: 'Akış silinirken hata oluştu' });
    }
};

export const toggleFlow = async (req, res) => {
    try {
        const { workspaceId, flowId } = req.params;
        const { isActive } = req.body;

        const existing = await prisma.flow.findFirst({
            where: { id: flowId, workspaceId }
        });
        if (!existing) {
            return res.status(404).json({ error: 'Akış bulunamadı' });
        }

        const flow = await prisma.flow.update({
            where: { id: flowId },
            data: { isActive }
        });

        res.json({ flow });
    } catch (error) {
        console.error('Toggle flow error:', error);
        res.status(500).json({ error: 'Akış güncellenirken hata oluştu' });
    }
};

/**
 * Ensure a MAIN (Triyaj) flow exists for the workspace.
 * If not, create it and link all existing orphan flows as children.
 * Called from frontend on first load.
 */
export const ensureMainFlow = async (req, res) => {
    try {
        const { workspaceId } = req.params;

        // Check if MAIN flow already exists
        let mainFlow = await prisma.flow.findFirst({
            where: { workspaceId, flowType: 'MAIN' },
            include: {
                children: {
                    orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
                    include: {
                        children: { orderBy: [{ order: 'asc' }, { createdAt: 'desc' }] }
                    }
                }
            }
        });

        if (!mainFlow) {
            // Create the main Triyaj flow
            mainFlow = await prisma.flow.create({
                data: {
                    workspaceId,
                    name: 'Genel Akış (Triyaj)',
                    flowType: 'MAIN',
                    isActive: true,
                    icon: '🔀',
                    color: '#6366f1',
                    description: 'Tüm müşterilerin ilk girdiği ana akış. Sınıflandırma ve yönlendirme burada yapılır.',
                    order: 0,
                    steps: [
                        {
                            id: Date.now(),
                            type: 'FIRST_MSG',
                            config: {}
                        }
                    ],
                    trigger: 'FIRST_MSG'
                }
            });

            // Link all existing orphan flows (no parent) as children of MAIN
            const orphanFlows = await prisma.flow.findMany({
                where: {
                    workspaceId,
                    parentId: null,
                    id: { not: mainFlow.id }
                }
            });

            for (let i = 0; i < orphanFlows.length; i++) {
                await prisma.flow.update({
                    where: { id: orphanFlows[i].id },
                    data: {
                        parentId: mainFlow.id,
                        order: i + 1
                    }
                });
            }

            // Re-fetch with children
            mainFlow = await prisma.flow.findUnique({
                where: { id: mainFlow.id },
                include: {
                    children: {
                        orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
                        include: {
                            children: { orderBy: [{ order: 'asc' }, { createdAt: 'desc' }] }
                        }
                    }
                }
            });

            console.log(`🔀 [FLOW] Created MAIN flow for workspace ${workspaceId}, linked ${orphanFlows.length} orphan flows`);
        }

        res.json({ flow: mainFlow });
    } catch (error) {
        console.error('Ensure main flow error:', error);
        res.status(500).json({ error: 'Ana akış oluşturulurken hata oluştu' });
    }
};

/**
 * Reorder flows (drag-drop support)
 */
export const reorderFlows = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { updates } = req.body; // [{ id, order, parentId }]

        if (!Array.isArray(updates)) {
            return res.status(400).json({ error: 'updates dizisi gereklidir' });
        }

        for (const update of updates) {
            await prisma.flow.updateMany({
                where: { id: update.id, workspaceId },
                data: {
                    order: update.order,
                    ...(update.parentId !== undefined && { parentId: update.parentId || null })
                }
            });
        }

        res.json({ message: 'Sıralama güncellendi' });
    } catch (error) {
        console.error('Reorder flows error:', error);
        res.status(500).json({ error: 'Sıralama güncellenirken hata oluştu' });
    }
};

// ============================================
// FLOW EXECUTION ENGINE
// ============================================

/**
 * Main entry point: find and execute all active flows matching a trigger type.
 * Called from webhook controllers when events occur.
 *
 * @param {string} workspaceId
 * @param {string} triggerType - NEW_FORM | FIRST_MSG | TAG_ADDED
 * @param {object} context - { contact, conversation, lead, formData, message, tagName }
 */
export const executeFlowsByTrigger = async (workspaceId, triggerType, context = {}) => {
    try {
        console.log(`🔄 [FLOW ENGINE] Trigger: ${triggerType} for workspace ${workspaceId}`);

        const flows = await prisma.flow.findMany({
            where: {
                workspaceId,
                isActive: true,
                trigger: triggerType
            }
        });

        if (flows.length === 0) {
            console.log(`ℹ️ [FLOW ENGINE] No active flows for trigger ${triggerType}`);
            return;
        }

        console.log(`🔄 [FLOW ENGINE] Found ${flows.length} active flow(s) for ${triggerType}`);

        for (const flow of flows) {
            try {
                console.log(`▶️ [FLOW ENGINE] Executing flow: "${flow.name}" (${flow.id})`);
                const steps = Array.isArray(flow.steps) ? flow.steps : JSON.parse(flow.steps || '[]');

                // Filter out the trigger step itself, execute only actions/logic
                const actionSteps = steps.filter(s =>
                    !['NEW_FORM', 'FIRST_MSG', 'TAG_ADDED', 'HAS_PHONE', 'NO_REPLY', 'STAGE_CHANGED', 'FLOW_ENTERED'].includes(s.type)
                );

                await executeSteps(workspaceId, actionSteps, context);
                console.log(`✅ [FLOW ENGINE] Flow "${flow.name}" completed`);
            } catch (flowErr) {
                console.error(`❌ [FLOW ENGINE] Flow "${flow.name}" failed:`, flowErr.message);
            }
        }
    } catch (error) {
        console.error('❌ [FLOW ENGINE] executeFlowsByTrigger error:', error);
    }
};

/**
 * Execute an array of steps sequentially.
 * Handles WAIT (delay), CONDITION (branching), and action steps.
 */
async function executeSteps(workspaceId, steps, context) {
    for (const step of steps) {
        try {
            console.log(`  ⚙️ [FLOW STEP] Executing: ${step.type}`);

            switch (step.type) {
                case 'WAIT':
                    await executeWait(step);
                    break;

                case 'CONDITION':
                    await executeCondition(workspaceId, step, context);
                    break;

                case 'WA_SEND':
                    await executeWhatsAppSend(workspaceId, step, context);
                    break;

                case 'AI_CALL':
                    await executeAICall(workspaceId, step, context);
                    break;

                case 'ASSIGN_AGENT':
                    await executeAssignAgent(workspaceId, step, context);
                    break;

                case 'ASSIGN_TEAM':
                    await executeAssignTeam(workspaceId, step, context);
                    break;

                case 'ASSIGN_BOT':
                    await executeAssignBot(workspaceId, step, context);
                    break;

                case 'CONVERT_TO_OPP':
                    await executeConvertToOpportunity(workspaceId, step, context);
                    break;

                case 'SWITCH_FLOW':
                    await executeSwitchFlow(workspaceId, step, context);
                    break;

                case 'SEND_MESSAGE':
                    await executeSendMessage(workspaceId, step, context);
                    break;

                case 'RETRY_CALL':
                    await executeRetryCall(workspaceId, step, context);
                    break;

                default:
                    console.log(`  ⚠️ [FLOW STEP] Unknown step type: ${step.type}`);
            }
        } catch (stepErr) {
            console.error(`  ❌ [FLOW STEP] ${step.type} failed:`, stepErr.message);
            // Continue to next step even if one fails
        }
    }
}

// ── Action Executors ─────────────────────────────────────────

/**
 * WAIT: Pause execution for the configured duration
 */
async function executeWait(step) {
    const amount = step.config?.amount || 5;
    const unit = step.config?.unit || 'dakika';

    let ms = amount * 60 * 1000; // default: minutes
    if (unit === 'saniye') ms = amount * 1000;
    if (unit === 'saat') ms = amount * 60 * 60 * 1000;
    if (unit === 'gün') ms = amount * 24 * 60 * 60 * 1000;

    // Cap at 24 hours for in-memory waits
    const maxMs = 24 * 60 * 60 * 1000;
    const actualMs = Math.min(ms, maxMs);

    console.log(`  ⏱️ [FLOW STEP] WAIT: ${amount} ${unit} (${actualMs}ms)`);
    await new Promise(resolve => setTimeout(resolve, actualMs));
}

/**
 * CONDITION: Check a condition and execute the appropriate branch
 */
async function executeCondition(workspaceId, step, context) {
    const condition = step.config?.condition || 'MSG_READ';
    let result = false;

    switch (condition) {
        case 'MSG_READ': {
            // Check if latest message in conversation is read
            if (context.conversation?.id) {
                const latestMsg = await prisma.message.findFirst({
                    where: { conversationId: context.conversation.id, isFromContact: true },
                    orderBy: { createdAt: 'desc' }
                });
                result = latestMsg?.status === 'READ';
            }
            break;
        }
        case 'MSG_REPLIED': {
            // Check if there's an outgoing message after the trigger
            if (context.conversation?.id) {
                const outMsg = await prisma.message.findFirst({
                    where: { conversationId: context.conversation.id, isFromContact: false },
                    orderBy: { createdAt: 'desc' }
                });
                result = !!outMsg;
            }
            break;
        }
        case 'MSG_CONTAINS': {
            // Check if the latest incoming message contains the configured keywords
            const keywords = (step.config?.keywords || '')
                .split(',')
                .map(k => k.trim().toLowerCase())
                .filter(k => k.length > 0);

            if (keywords.length > 0 && context.conversation?.id) {
                const latestMsg = await prisma.message.findFirst({
                    where: { conversationId: context.conversation.id, isFromContact: true },
                    orderBy: { createdAt: 'desc' }
                });
                const msgText = (latestMsg?.content || latestMsg?.text || '').toLowerCase();
                const matchMode = step.config?.matchMode || 'any';
                if (matchMode === 'all') {
                    result = keywords.every(kw => msgText.includes(kw));
                } else {
                    result = keywords.some(kw => msgText.includes(kw));
                }
            } else if (keywords.length > 0 && context.message) {
                // fallback: check message from context directly
                const msgText = (context.message.content || context.message.text || '').toLowerCase();
                const matchMode = step.config?.matchMode || 'any';
                if (matchMode === 'all') {
                    result = keywords.every(kw => msgText.includes(kw));
                } else {
                    result = keywords.some(kw => msgText.includes(kw));
                }
            }
            console.log(`  🔍 [FLOW STEP] MSG_CONTAINS keywords=[${keywords.join(',')}] mode=${step.config?.matchMode||'any'}: ${result}`);
            break;
        }
        case 'HAS_TAG': {
            if (context.contact?.id) {
                const contact = await prisma.contact.findUnique({ where: { id: context.contact.id } });
                const tags = JSON.parse(contact?.tags || '[]');
                result = tags.length > 0;
            }
            break;
        }
        case 'IS_LEAD': {
            result = !!context.lead || context.contact?.status === 'LEAD';
            break;
        }
        case 'HAS_PHONE': {
            const phone = context.contact?.phone || context.formData?.phone || null;
            result = !!(phone && phone.trim().length > 5);
            break;
        }
        case 'IS_OPPORTUNITY': {
            // Check if conversation is in an Opportunity (Fırsat) funnel stage
            if (context.conversation?.id) {
                const conv = await prisma.conversation.findUnique({
                    where: { id: context.conversation.id },
                    include: { funnelStage: { include: { funnel: true } } }
                });
                result = !!(conv?.funnelStage?.funnel?.name?.includes('Fırsat') ||
                           conv?.funnelStage?.name?.toLowerCase().includes('fırsat') ||
                           conv?.funnelStage?.name?.toLowerCase().includes('firsat'));
            }
            break;
        }
        case 'CALL_UNANSWERED': {
            // Check if the last Retell call for this contact was unanswered
            if (context.contact?.id) {
                const lastCall = await prisma.retellCallLog.findFirst({
                    where: { contactId: context.contact.id },
                    orderBy: { createdAt: 'desc' }
                }).catch(() => null);
                result = lastCall?.status === 'UNANSWERED' || lastCall?.status === 'NO_ANSWER' ||
                         lastCall?.callStatus === 'unanswered' || lastCall?.callStatus === 'no-answer';
            }
            break;
        }
        default:
            console.log(`  ⚠️ [FLOW STEP] Unknown condition: ${condition}`);
    }

    console.log(`  🔀 [FLOW STEP] CONDITION(${condition}): ${result ? 'YES' : 'NO'}`);

    const branch = result ? (step.config?.yesBranch || []) : (step.config?.noBranch || []);
    if (branch.length > 0) {
        await executeSteps(workspaceId, branch, context);
    }
}

/**
 * WA_SEND: Send a WhatsApp template message
 */
async function executeWhatsAppSend(workspaceId, step, context) {
    const templateName = step.config?.templateName;
    if (!templateName) {
        console.log(`  ⚠️ [FLOW STEP] WA_SEND: No template name configured`);
        return;
    }

    const phone = context.contact?.phone || context.formData?.phone;
    if (!phone) {
        console.log(`  ⚠️ [FLOW STEP] WA_SEND: No phone number available`);
        return;
    }

    // Find template by name
    const template = await prisma.whatsappTemplate.findFirst({
        where: {
            name: { equals: templateName, mode: 'insensitive' },
            workspaceId
        },
        include: { whatsappPhoneNumber: true }
    });

    if (!template) {
        console.log(`  ⚠️ [FLOW STEP] WA_SEND: Template "${templateName}" not found`);
        return;
    }

    // Use the existing sendTemplateToContact helper from automation.controller
    try {
        const { default: axios } = await import('axios');
        const WHATSAPP_API_VERSION = process.env.FACEBOOK_GRAPH_API_VERSION || 'v21.0';

        let whatsappPhone = template.whatsappPhoneNumber;
        if (!whatsappPhone) {
            whatsappPhone = await prisma.whatsappPhoneNumber.findFirst({ where: { workspaceId } });
        }
        if (!whatsappPhone) {
            console.log(`  ⚠️ [FLOW STEP] WA_SEND: No WhatsApp phone number configured`);
            return;
        }

        const recipientPhone = phone.replace(/[\s\+\-]/g, '');
        const payload = {
            messaging_product: 'whatsapp',
            to: recipientPhone,
            type: 'template',
            template: {
                name: template.name,
                language: { code: template.language || 'tr' }
            }
        };

        // Handle body placeholders
        const placeholderCount = (template.bodyText?.match(/\{\{\d+\}\}/g) || []).length;
        if (placeholderCount > 0) {
            const customerName = context.contact?.name || context.formData?.name || 'Değerli Müşterimiz';
            const bodyParams = [{ type: 'text', text: customerName }];
            for (let i = 1; i < placeholderCount; i++) {
                bodyParams.push({ type: 'text', text: '' });
            }
            payload.template.components = [{ type: 'body', parameters: bodyParams }];
        }

        await axios.post(
            `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${whatsappPhone.phoneNumberId}/messages`,
            payload,
            { headers: { 'Authorization': `Bearer ${whatsappPhone.accessToken}`, 'Content-Type': 'application/json' } }
        );

        console.log(`  ✅ [FLOW STEP] WA_SEND: Template "${templateName}" sent to ${recipientPhone}`);
    } catch (err) {
        console.error(`  ❌ [FLOW STEP] WA_SEND error:`, err.response?.data || err.message);
    }
}

/**
 * AI_CALL: Trigger an AI phone call via Retell
 */
async function executeAICall(workspaceId, step, context) {
    const phone = context.contact?.phone || context.formData?.phone;
    if (!phone) {
        console.log(`  ⚠️ [FLOW STEP] AI_CALL: No phone number available`);
        return;
    }

    const contactId = context.contact?.id;
    if (!contactId) {
        console.log(`  ⚠️ [FLOW STEP] AI_CALL: No contact ID available`);
        return;
    }

    try {
        // Workspace AI agent bilgisi
        const ws = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { retellAgentId: true }
        });

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

        if (!recentTask) {
            // Case miras al → cascade atama için
            let flowCaseId = null;
            try {
                const activeCase = await prisma.case.findFirst({
                    where: { contactId, workspaceId, status: 'ACTIVE' },
                    orderBy: { updatedAt: 'desc' },
                    select: { id: true }
                });
                flowCaseId = activeCase?.id || null;
            } catch (_) {}

            await prisma.contactActivity.create({
                data: {
                    workspaceId,
                    contactId,
                    type: 'CALL',
                    title: `Arama Görevi (Flow: ${step.config?.label || 'AI_CALL'})`,
                    description: `Flow otomasyon adımı: AI_CALL`,
                    status: 'PLANNED',
                    source: 'AUTOMATION',
                    dueDate: new Date(),
                    aiAgentId: null,
                    fallbackToAi: true,
                    aiFallbackTriggered: false,
                    retellExcluded: false,
                    ...(flowCaseId ? { caseId: flowCaseId } : {}),
                }
            });
            console.log(`  ✅ [FLOW STEP] AI_CALL: Arama görevi oluşturuldu → cron arayacak: ${phone}`);
        } else {
            console.log(`  ⏭️ [FLOW STEP] AI_CALL: Son 24h'de zaten arama görevi var — skip`);
        }
    } catch (err) {
        console.error(`  ❌ [FLOW STEP] AI_CALL error:`, err.message);
    }
}

/**
 * ASSIGN_AGENT: Assign conversation to an agent by name
 */
async function executeAssignAgent(workspaceId, step, context) {
    const agentName = step.config?.agentName;
    if (!agentName) {
        console.log(`  ⚠️ [FLOW STEP] ASSIGN_AGENT: No agent name configured`);
        return;
    }

    // Find conversation
    let conversationId = context.conversation?.id;
    if (!conversationId && context.contact?.id) {
        const conv = await prisma.conversation.findFirst({
            where: { contactId: context.contact.id, workspaceId },
            orderBy: { lastMessageAt: 'desc' }
        });
        conversationId = conv?.id;
    }

    if (!conversationId) {
        console.log(`  ⚠️ [FLOW STEP] ASSIGN_AGENT: No conversation found`);
        return;
    }

    // Find agent by name within workspace members
    const member = await prisma.workspaceMember.findFirst({
        where: {
            workspaceId,
            user: { name: { contains: agentName, mode: 'insensitive' } }
        },
        include: { user: { select: { id: true, name: true } } }
    });

    // Also try finding by team name
    if (!member) {
        const team = await prisma.team.findFirst({
            where: {
                workspaceId,
                name: { contains: agentName, mode: 'insensitive' }
            }
        });
        if (team) {
            await prisma.conversation.update({
                where: { id: conversationId },
                data: { teamId: team.id }
            });
            console.log(`  ✅ [FLOW STEP] ASSIGN_AGENT: Conversation assigned to team "${team.name}"`);
            return;
        }
        console.log(`  ⚠️ [FLOW STEP] ASSIGN_AGENT: Agent/Team "${agentName}" not found`);
        return;
    }

    await prisma.conversation.update({
        where: { id: conversationId },
        data: { assignedToId: member.user.id }
    });

    console.log(`  ✅ [FLOW STEP] ASSIGN_AGENT: Conversation assigned to ${member.user.name}`);
};

/**
 * ASSIGN_TEAM: Assign conversation to a team by name
 */
async function executeAssignTeam(workspaceId, step, context) {
    const teamId   = step.config?.teamId;
    const teamName = step.config?.teamName;
    const useRoundRobin = step.config?.useRoundRobin || false;

    if (!teamId && !teamName) {
        console.log(`  ⚠️ [FLOW STEP] ASSIGN_TEAM: No team configured`);
        return;
    }

    let conversationId = context.conversation?.id;
    if (!conversationId && context.contact?.id) {
        const conv = await prisma.conversation.findFirst({
            where: { contactId: context.contact.id, workspaceId },
            orderBy: { lastMessageAt: 'desc' }
        });
        conversationId = conv?.id;
    }
    if (!conversationId) {
        console.log(`  ⚠️ [FLOW STEP] ASSIGN_TEAM: No conversation found`);
        return;
    }

    // Takımı bul — önce ID ile, yoksa isimle
    let team = null;
    if (teamId) {
        team = await prisma.team.findUnique({ where: { id: teamId } });
    }
    if (!team && teamName) {
        team = await prisma.team.findFirst({
            where: { workspaceId, name: { contains: teamName, mode: 'insensitive' } }
        });
    }
    if (!team) {
        console.log(`  ⚠️ [FLOW STEP] ASSIGN_TEAM: Team not found`);
        return;
    }

    const updateData = { teamIds: JSON.stringify([team.id]) };

    // Round-Robin: takım üyelerine sırayla ata
    if (useRoundRobin) {
        const members = await prisma.teamMember.findMany({
            where: { teamId: team.id, userId: { not: null } },
            orderBy: { createdAt: 'asc' },
            select: { userId: true }
        });

        if (members.length > 0) {
            // Son bu takımdan atanan kişiyi bul (workspaceId ile filtrele, yoksa diğer workspace'ler karışır)
            const lastConv = await prisma.conversation.findFirst({
                where: {
                    workspaceId,
                    teamIds: { contains: team.id },
                    assignedToId: { not: null }
                },
                orderBy: { updatedAt: 'desc' },
                select: { assignedToId: true }
            });

            const lastIdx = lastConv?.assignedToId
                ? members.findIndex(m => m.userId === lastConv.assignedToId)
                : -1;

            const nextUserId = members[(lastIdx + 1) % members.length].userId;
            updateData.assignedToId = nextUserId;
            console.log(`  🔄 [FLOW STEP] ASSIGN_TEAM: Round-Robin → user ${nextUserId}`);
        }
    }

    await prisma.conversation.update({
        where: { id: conversationId },
        data: updateData
    });

    console.log(`  ✅ [FLOW STEP] ASSIGN_TEAM: Conversation → team "${team.name}"${useRoundRobin ? ' (Round-Robin)' : ''}`);
}

/**
 * ASSIGN_BOT: Assign a specific AI bot to the conversation
 */
async function executeAssignBot(workspaceId, step, context) {
    const botId = step.config?.botId;

    let conversationId = context.conversation?.id;
    if (!conversationId && context.contact?.id) {
        const conv = await prisma.conversation.findFirst({
            where: { contactId: context.contact.id, workspaceId },
            orderBy: { lastMessageAt: 'desc' }
        });
        conversationId = conv?.id;
    }
    if (!conversationId) {
        console.log(`  ⚠️ [FLOW STEP] ASSIGN_BOT: No conversation found`);
        return;
    }
    if (!botId) {
        console.log(`  ⚠️ [FLOW STEP] ASSIGN_BOT: No bot ID configured`);
        return;
    }

    const bot = await prisma.aIBot.findUnique({
        where: { id: botId }
    });

    if (!bot) {
        console.log(`  ⚠️ [FLOW STEP] ASSIGN_BOT: Target bot not found (${botId})`);
        return;
    }

    await prisma.conversation.update({
        where: { id: conversationId },
        data: {
            assignedBotId: bot.id,
            botEnabled: true
        }
    });

    try {
        const { emitToWorkspace } = await import('../socket.js');
        emitToWorkspace(workspaceId, 'conversation_updated', { conversationId });
    } catch (e) {}

    console.log(`  ✅ [FLOW STEP] ASSIGN_BOT: Conversation assigned to AI Bot "${bot.name}"`);
}

/**
 * CONVERT_TO_OPP: Move conversation to a specific funnel stage (Opportunity)
 */
async function executeConvertToOpportunity(workspaceId, step, context) {
    const targetStage = step.config?.targetStage;

    let conversationId = context.conversation?.id;
    if (!conversationId && context.contact?.id) {
        const conv = await prisma.conversation.findFirst({
            where: { contactId: context.contact.id, workspaceId },
            orderBy: { lastMessageAt: 'desc' }
        });
        conversationId = conv?.id;
    }
    if (!conversationId) {
        console.log(`  ⚠️ [FLOW STEP] CONVERT_TO_OPP: No conversation found`);
        return;
    }

    // Find the Firsat (Opportunity) funnel
    const fursatFunnel = await prisma.funnel.findFirst({
        where: { workspaceId, name: { contains: 'F', mode: 'insensitive' } },
        orderBy: { order: 'asc' },
        include: { stages: { orderBy: { order: 'asc' } } }
    });

    if (!fursatFunnel) {
        console.log(`  ⚠️ [FLOW STEP] CONVERT_TO_OPP: No funnel found`);
        return;
    }

    // Find the target stage (or use first stage if none specified)
    let stage = null;
    if (targetStage) {
        stage = fursatFunnel.stages.find(s =>
            s.name.toLowerCase().includes(targetStage.toLowerCase())
        );
    }
    if (!stage) {
        stage = fursatFunnel.stages[0];
    }

    await prisma.conversation.update({
        where: { id: conversationId },
        data: {
            funnelType: fursatFunnel.id,
            ...(stage && { funnelStageId: stage.id })
        }
    });
    console.log(`  ✅ [FLOW STEP] CONVERT_TO_OPP: Conversation moved to funnel "${fursatFunnel.name}" stage "${stage?.name || 'default'}"`);
}

/**
 * SWITCH_FLOW: Move conversation to a specific funnel pipeline
 */
async function executeSwitchFlow(workspaceId, step, context) {
    const targetFunnelId = step.config?.flowId;

    let conversationId = context.conversation?.id;
    if (!conversationId && context.contact?.id) {
        const conv = await prisma.conversation.findFirst({
            where: { contactId: context.contact.id, workspaceId },
            orderBy: { lastMessageAt: 'desc' }
        });
        conversationId = conv?.id;
    }
    if (!conversationId) {
        console.log(`  ⚠️ [FLOW STEP] SWITCH_FLOW: No conversation found`);
        return;
    }
    if (!targetFunnelId) {
        console.log(`  ⚠️ [FLOW STEP] SWITCH_FLOW: No target funnel ID configured`);
        return;
    }

    // Find the target funnel and its first stage
    const funnel = await prisma.funnel.findUnique({
        where: { id: targetFunnelId },
        include: { stages: { orderBy: { order: 'asc' } } }
    });

    if (!funnel) {
        console.log(`  ⚠️ [FLOW STEP] SWITCH_FLOW: Target funnel not found (${targetFunnelId})`);
        return;
    }

    const firstStage = funnel.stages[0];

    await prisma.conversation.update({
        where: { id: conversationId },
        data: {
            funnelType: funnel.id,
            ...(firstStage && { funnelStageId: firstStage.id })
        }
    });
    
    // Also emit to UI to update the view
    try {
        const { emitToWorkspace } = await import('../socket.js');
        emitToWorkspace(workspaceId, 'conversation_updated', { conversationId });
    } catch (e) {
        // Safe to ignore
    }

    console.log(`  ✅ [FLOW STEP] SWITCH_FLOW: Conversation moved to funnel "${funnel.name}" stage "${firstStage?.name || 'default'}"`);
}

/**
 * SEND_MESSAGE: Send a standard text message
 */
async function executeSendMessage(workspaceId, step, context) {
    const messageContent = step.config?.message;
    if (!messageContent) {
        console.log(`  ⚠️ [FLOW STEP] SEND_MESSAGE: No message content configured`);
        return;
    }

    let conversationId = context.conversation?.id;
    if (!conversationId && context.contact?.id) {
        const conv = await prisma.conversation.findFirst({
            where: { contactId: context.contact.id, workspaceId },
            orderBy: { lastMessageAt: 'desc' }
        });
        conversationId = conv?.id;
    }

    if (!conversationId) {
        console.log(`  ⚠️ [FLOW STEP] SEND_MESSAGE: No conversation found`);
        return;
    }

    try {
        const message = await prisma.message.create({
            data: {
                conversationId,
                content: messageContent,
                messageType: 'TEXT',
                isFromContact: false,
                status: 'SENT'
            }
        });

        await prisma.conversation.update({
            where: { id: conversationId },
            data: { lastMessageAt: new Date() }
        });

        // Trigger webhook to send real message based on channel
        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
            include: { contact: true }
        });

        if (conversation && conversation.channel === 'WHATSAPP') {
            const { sendWhatsAppMessage } = await import('./whatsapp.controller.js');
            await sendWhatsAppMessage(workspaceId, conversation.contact.phone, messageContent);
        } else if (conversation && conversation.channel === 'FACEBOOK') {
            const { sendFacebookMessage } = await import('./facebook.controller.js');
            await sendFacebookMessage(conversation.id, messageContent);
        } else if (conversation && conversation.channel === 'INSTAGRAM') {
            const { sendInstagramMessage } = await import('./facebook.controller.js');
            await sendInstagramMessage(conversation.id, messageContent);
        }

        try {
            const { emitToWorkspace } = await import('../socket.js');
            emitToWorkspace(workspaceId, 'new_message', { conversationId, message });
        } catch (e) {}

        console.log(`  ✅ [FLOW STEP] SEND_MESSAGE: "${messageContent.substring(0, 30)}..."`);
    } catch (err) {
        console.error(`  ❌ [FLOW STEP] SEND_MESSAGE failed:`, err.message);
    }
}

/**
 * RETRY_CALL: Retry AI call up to maxRetries times with waitAmount delay between attempts
 */
async function executeRetryCall(workspaceId, step, context) {
    const maxRetries = step.config?.maxRetries || 3;
    const waitAmount = step.config?.waitAmount || 1;
    const waitUnit = step.config?.waitUnit || 'saat';

    const phone = context.contact?.phone || context.formData?.phone;
    if (!phone) {
        console.log(`  ⚠️ [FLOW STEP] RETRY_CALL: No phone number available`);
        return;
    }

    let msDelay = waitAmount * 60 * 60 * 1000; // default saat
    if (waitUnit === 'dakika') msDelay = waitAmount * 60 * 1000;
    if (waitUnit === 'gün') msDelay = waitAmount * 24 * 60 * 60 * 1000;
    // Cap at 24 hours for in-memory (longer delays should use a job queue)
    msDelay = Math.min(msDelay, 24 * 60 * 60 * 1000);

    console.log(`  🔁 [FLOW STEP] RETRY_CALL: Will retry up to ${maxRetries} times every ${waitAmount} ${waitUnit}`);

    // Case miras al → cascade atama için (loop dışında bir kez resolve et)
    let retryCaseId = null;
    try {
        const activeCase = await prisma.case.findFirst({
            where: { contactId: context.contact?.id, workspaceId, status: 'ACTIVE' },
            orderBy: { updatedAt: 'desc' },
            select: { id: true }
        });
        retryCaseId = activeCase?.id || null;
    } catch (_) {}

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await prisma.contactActivity.create({
                data: {
                    workspaceId,
                    contactId: context.contact?.id,
                    type: 'CALL',
                    title: `Arama Görevi (Flow Retry ${attempt}/${maxRetries})`,
                    description: `Flow RETRY_CALL: Deneme ${attempt}/${maxRetries}`,
                    status: 'PLANNED',
                    source: 'AUTOMATION',
                    dueDate: new Date(),
                    aiAgentId: null,
                    fallbackToAi: true,
                    aiFallbackTriggered: false,
                    retellExcluded: false,
                    ...(retryCaseId ? { caseId: retryCaseId } : {}),
                }
            });
            console.log(`  ✅ [FLOW STEP] RETRY_CALL: Attempt ${attempt}/${maxRetries} — arama görevi oluşturuldu`);

            // Wait between retries (but not after the last one)
            if (attempt < maxRetries) {
                console.log(`  ⏳ [FLOW STEP] RETRY_CALL: Waiting ${waitAmount} ${waitUnit} before next attempt...`);
                await new Promise(resolve => setTimeout(resolve, msDelay));
            }
        } catch (err) {
            console.error(`  ❌ [FLOW STEP] RETRY_CALL attempt ${attempt} failed:`, err.message);
            // Continue to next attempt even on failure
            if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, msDelay));
            }
        }
    }
    console.log(`  📵 [FLOW STEP] RETRY_CALL: Completed all ${maxRetries} attempts for ${phone}`);
}
