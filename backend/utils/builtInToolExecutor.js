import prisma from '../lib/prisma.js';
import axios from 'axios';

const WHATSAPP_API_VERSION = process.env.FACEBOOK_GRAPH_API_VERSION || 'v21.0';

export const executeBuiltInTool = async (functionName, args, context) => {
    const { workspaceId, conversationId, activeBotId } = context;

    if (!conversationId) {
        throw new Error("Conversation ID is required for built-in tools");
    }

    switch (functionName) {
        case 'transfer_to_team': {
            const { team_name } = args;
            
            // 1. Find team by name
            const team = await prisma.team.findFirst({
                where: { 
                    workspaceId, 
                    name: { equals: team_name, mode: 'insensitive' }
                }
            });

            if (!team) {
                return { success: false, error: `Team '${team_name}' not found in workspace.` };
            }

            // 2. Round-robin assignment logic
            const teamMembers = await prisma.teamMember.findMany({
                where: { teamId: team.id, userId: { not: null } },
                orderBy: { createdAt: 'asc' }
            });

            let assignedUserId = null;

            if (teamMembers.length > 0) {
                const lastConv = await prisma.conversation.findFirst({
                    where: { teamId: team.id, assignedToId: { not: null } },
                    orderBy: { updatedAt: 'desc' },
                    select: { assignedToId: true }
                });

                if (!lastConv || !lastConv.assignedToId) {
                    assignedUserId = teamMembers[0].userId;
                } else {
                    const lastIdx = teamMembers.findIndex(m => m.userId === lastConv.assignedToId);
                    if (lastIdx === -1 || lastIdx === teamMembers.length - 1) {
                        assignedUserId = teamMembers[0].userId;
                    } else {
                        assignedUserId = teamMembers[lastIdx + 1].userId;
                    }
                }
            }

            // 3. Transfer conversation to team and round-robin user
            await prisma.conversation.update({
                where: { id: conversationId },
                data: { 
                    teamId: team.id,
                    assignedToId: assignedUserId,
                    botEnabled: false // Disable current channel bot so the team can take over
                }
            });

            const userText = assignedUserId ? ` ve bir temsilciye` : '';
            return { success: true, message: `Görüşme '${team.name}' takımına${userText} devredildi.` };
        }

        case 'change_funnel_stage': {
            const { funnel_name, stage_name } = args;
            
            // 1. Find funnel
            const funnel = await prisma.funnel.findFirst({
                where: { 
                    workspaceId,
                    name: { equals: funnel_name, mode: 'insensitive' }
                },
                include: { stages: true }
            });

            if (!funnel) {
                return { success: false, error: `Funnel '${funnel_name}' not found.` };
            }

            // 2. Find stage
            const stage = funnel.stages.find(s => s.name.toLowerCase() === stage_name.toLowerCase());
            if (!stage) {
                return { success: false, error: `Stage '${stage_name}' not found in funnel '${funnel_name}'.` };
            }

            // 3. Find the conversation's contact
            const conv = await prisma.conversation.findUnique({
                where: { id: conversationId },
                select: { contactId: true }
            });

            if (!conv?.contactId) {
                return { success: false, error: `Conversation has no contact assigned.` };
            }

            const contact = await prisma.contact.findUnique({ where: { id: conv.contactId } });

            // 4. Update or create deal for this contact
            let deal = await prisma.deal.findFirst({
                where: { contactId: conv.contactId, funnelId: funnel.id }
            });

            if (deal) {
                deal = await prisma.deal.update({
                    where: { id: deal.id },
                    data: { stageId: stage.id }
                });
            } else {
                deal = await prisma.deal.create({
                    data: {
                        title: `${contact?.firstName || 'Müşteri'} ${contact?.lastName || ''} - ${funnel.name}`,
                        value: 0,
                        workspaceId,
                        funnelId: funnel.id,
                        stageId: stage.id,
                        contactId: conv.contactId
                    }
                });
            }

            return { success: true, message: `Müşteri '${funnel.name}' akışındaki '${stage.name}' aşamasına taşındı.`, dealId: deal.id };
        }

        case 'send_whatsapp_template': {
            const { template_name } = args;
            
            const conv = await prisma.conversation.findUnique({
                where: { id: conversationId },
                include: { contact: true }
            });

            if (!conv?.contact?.phone) {
                return { success: false, error: `Müşterinin telefon numarası bulunmuyor.` };
            }

            // 1. Find template
            let template = await prisma.whatsappTemplate.findFirst({
                where: {
                    name: { equals: template_name, mode: 'insensitive' },
                    workspaceId
                }
            });

            if (!template) {
                return { success: false, error: `Şablon '${template_name}' bulunamadı.` };
            }

            if (template.status !== 'APPROVED') {
                return { success: false, error: `Şablon onaylı değil.` };
            }

            // 2. Get Whatsapp Phone
            let whatsappPhone = null;
            if (template.whatsappPhoneNumberId) {
                whatsappPhone = await prisma.whatsappPhoneNumber.findUnique({
                    where: { id: template.whatsappPhoneNumberId }
                });
            }

            if (!whatsappPhone) {
                whatsappPhone = await prisma.whatsappPhoneNumber.findFirst({
                    where: { workspaceId }
                });
            }

            if (!whatsappPhone) {
                return { success: false, error: `WhatsApp numarası bağlı değil.` };
            }

            // 3. Clean Phone
            let recipientPhone = conv.contact.phone.replace(/[\s\+\-\(\)]/g, '');
            if (recipientPhone.startsWith('0')) {
                recipientPhone = '90' + recipientPhone.substring(1);
            } else if (!recipientPhone.startsWith('90') && recipientPhone.length === 10) {
                recipientPhone = '90' + recipientPhone;
            }

            // 4. Build payload
            const templatePayload = {
                messaging_product: 'whatsapp',
                to: recipientPhone,
                type: 'template',
                template: {
                    name: template.name,
                    language: { code: template.language || 'tr' }
                }
            };

            // Simplified: No media/header processing for basic AI template triggers
            const placeholderCount = (template.bodyText?.match(/\{\{\d+\}\}/g) || []).length;
            if (placeholderCount > 0) {
                const bodyParams = [];
                // Fill placeholders with customer name or empty strings
                if (conv.contact.firstName) {
                    bodyParams.push({ type: 'text', text: conv.contact.firstName });
                } else {
                    bodyParams.push({ type: 'text', text: 'Müşterimiz' });
                }
                
                while (bodyParams.length < placeholderCount) {
                    bodyParams.push({ type: 'text', text: ' ' });
                }
                
                templatePayload.template.components = [{
                    type: 'body',
                    parameters: bodyParams
                }];
            }

            // 5. Send API request
            try {
                await axios.post(
                    `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${whatsappPhone.phoneNumberId}/messages`,
                    templatePayload,
                    {
                        headers: {
                            'Authorization': `Bearer ${whatsappPhone.accessToken}`,
                            'Content-Type': 'application/json'
                        }
                    }
                );

                // 6. Create Message record
                await prisma.message.create({
                    data: {
                        conversationId: conversationId,
                        content: `[Şablon: ${template.name}]\n${template.bodyText}`,
                        messageType: 'TEMPLATE',
                        isFromContact: false,
                        status: 'SENT'
                    }
                });

                return { success: true, message: `Şablon mesajı başarıyla gönderildi.` };
            } catch (err) {
                console.error(`Error sending template:`, err.response?.data || err);
                return { success: false, error: `Şablon gönderimi başarısız oldu: ${err.response?.data?.error?.message || err.message}` };
            }
        }

        default:
            throw new Error(`Built-in tool ${functionName} is not implemented.`);
    }
};
