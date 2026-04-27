import prisma from '../lib/prisma.js';
import { getIO, emitToWorkspace } from '../socket.js';


/**
 * Kanal yönlendirmesine göre konuşmayı ekibe ata ve bot gecikmesini ayarla
 * @param {string} workspaceId - Workspace ID
 * @param {string} conversationId - Conversation ID
 * @param {string} channel - Kanal (INSTAGRAM, FACEBOOK, WHATSAPP, etc.)
 * @param {boolean} isNewConversation - Yeni konuşma mı?
 * @returns {Object} - Yönlendirme bilgisi
 */
export async function applyChannelRouting(workspaceId, conversationId, channel, isNewConversation = true) {
    try {
        console.log(`📡 [Routing] Applying routing for channel ${channel} in workspace ${workspaceId} (isNew: ${isNewConversation})`);

        // Önce mevcut konuşmayı kontrol et
        const existingConversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
            select: {
                assignedTeamId: true,
                botEnabled: true,
                botDelayedUntil: true,
                assignedToId: true
            }
        });

        // Eğer mevcut konuşma ise ve zaten yönlendirilmişse (assignedTeamId var)
        // Bot gecikmesini tekrar ayarlama - sadece ilk yönlendirmede gecikme olmalı
        if (!isNewConversation && existingConversation?.assignedTeamId) {
            console.log(`📡 [Routing] Conversation already routed, skipping delay update`);
            return {
                alreadyRouted: true,
                teamId: existingConversation.assignedTeamId,
                botEnabled: existingConversation.botEnabled
            };
        }

        // Kanal yönlendirmesini bul
        const routing = await prisma.channelRouting.findUnique({
            where: {
                workspaceId_channel: {
                    workspaceId,
                    channel
                }
            },
            include: {
                team: {
                    include: {
                        assignedBot: true,
                        members: {
                            include: {
                                user: {
                                    select: { id: true, name: true, email: true }
                                }
                            }
                        }
                    }
                }
            }
        });

        if (!routing) {
            console.log(`📡 [Routing] No routing found for channel ${channel}`);
            return null;
        }

        if (!routing.isActive) {
            console.log(`📡 [Routing] Routing for ${channel} is inactive`);
            return null;
        }

        // Bot gecikmesi SADECE yeni konuşmalarda veya ilk kez yönlendirilenlerde uygulanacak
        const botDelaySeconds = routing.botDelay ?? 30;
        const botDelayedUntil = isNewConversation ? new Date(Date.now() + botDelaySeconds * 1000) : null;

        // Konuşmayı güncelle - ekip ata ve bot gecikmesini ayarla
        const updateData = {
            assignedTeamId: routing.teamId,
            teamIds: JSON.stringify([routing.teamId]),
            botEnabled: routing.botEnabled
        };

        // Bot gecikmesi sadece YENİ konuşmalarda
        if (isNewConversation && routing.botEnabled) {
            updateData.botDelayedUntil = botDelayedUntil;
            updateData.assignedToId = null; // Agent üstlenene kadar null
        }

        const updatedConversation = await prisma.conversation.update({
            where: { id: conversationId },
            data: updateData,
            include: {
                contact: true
            }
        });

        console.log(`📡 [Routing] ✅ Channel ${channel} → Team "${routing.team?.name}" (Bot delay: ${isNewConversation ? botDelaySeconds + 's' : 'SKIPPED'}, Bot: ${routing.botEnabled ? 'Active' : 'Disabled'})`);

        // Socket ile ekip üyelerine bildirim gönder
        const io = getIO();
        if (io && routing.team?.members) {
            // Her ekip üyesine ayrı ayrı bildirim
            for (const member of routing.team.members) {
                if (member.userId) {
                    console.log(`📡 [Routing] Notifying team member: ${member.user?.name || member.userId}`);
                    io.to(`user:${member.userId}`).emit('new_conversation_assigned', {
                        conversationId,
                        conversation: updatedConversation,
                        teamId: routing.teamId,
                        teamName: routing.team.name,
                        channel,
                        botDelayedUntil: botDelayedUntil?.toISOString() || null,
                        botEnabled: routing.botEnabled
                    });
                }
            }

            // Workspace'e de genel bildirim
            emitToWorkspace(workspaceId, 'conversation_routing_applied', {
                conversationId,
                teamId: routing.teamId,
                teamName: routing.team.name,
                channel,
                botDelayedUntil: botDelayedUntil?.toISOString() || null,
                botEnabled: routing.botEnabled
            });
        }

        return {
            routing,
            botDelayedUntil,
            teamId: routing.teamId,
            teamName: routing.team?.name,
            botEnabled: routing.botEnabled
        };
    } catch (error) {
        console.error('❌ [Routing] Apply channel routing error:', error);
        return null;
    }
}

/**
 * Bot'un cevap verebileceğini kontrol et (gecikme süresi dolmuş mu?)
 * @param {string} conversationId - Conversation ID
 * @returns {boolean} - Bot cevap verebilir mi
 */
export async function canBotRespond(conversationId) {
    try {
        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
            select: {
                botEnabled: true,
                botDelayedUntil: true,
                assignedToId: true
            }
        });

        if (!conversation) {
            return false;
        }

        // Bot devre dışıysa cevap verme
        if (!conversation.botEnabled) {
            console.log(`🤖 [Bot] Bot disabled for conversation ${conversationId}`);
            return false;
        }

        // Bir agent üstlendiyse bot cevap vermesin
        if (conversation.assignedToId) {
            console.log(`🤖 [Bot] Agent assigned to conversation ${conversationId}, bot will not respond`);
            return false;
        }

        // Gecikme süresi dolmamışsa cevap verme
        if (conversation.botDelayedUntil && new Date() < conversation.botDelayedUntil) {
            const remainingSeconds = Math.ceil((conversation.botDelayedUntil - new Date()) / 1000);
            console.log(`🤖 [Bot] Bot delayed for ${remainingSeconds} more seconds for conversation ${conversationId}`);
            return false;
        }

        return true;
    } catch (error) {
        console.error('Can bot respond error:', error);
        return false;
    }
}

/**
 * Agent konuşmayı üstlendiğinde bot'u devre dışı bırak
 * @param {string} conversationId - Conversation ID
 * @param {string} agentId - Agent User ID
 */
export async function agentTakesOver(conversationId, agentId) {
    try {
        const conversation = await prisma.conversation.update({
            where: { id: conversationId },
            data: {
                assignedToId: agentId,
                botEnabled: false,
                botDelayedUntil: null
            },
            include: {
                contact: true,
                assignedTo: {
                    select: { id: true, name: true }
                }
            }
        });

        console.log(`👤 [Agent] Agent "${conversation.assignedTo?.name}" took over conversation ${conversationId}`);

        // Socket ile bildirim - diğer agentlar artık bu konuşmayı görmemeli
        emitToWorkspace(conversation.workspaceId, 'conversation_assigned', {
            conversationId,
            assignedToId: agentId,
            assignedToName: conversation.assignedTo?.name,
            botEnabled: false
        });

        return conversation;
    } catch (error) {
        console.error('Agent takes over error:', error);
        throw error;
    }
}

/**
 * Gecikme süresi dolan konuşmaları kontrol et ve bot'u tetikle
 * Bu fonksiyon periyodik olarak çalıştırılmalı (cron job gibi)
 */
export async function processPendingBotResponses() {
    try {
        const now = new Date();

        // Gecikme süresi dolmuş, bot aktif, agent atanmamış konuşmaları bul
        const pendingConversations = await prisma.conversation.findMany({
            where: {
                botEnabled: true,
                assignedToId: null,
                botDelayedUntil: {
                    lte: now,
                    not: null
                },
                status: 'OPEN'
            },
            include: {
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1
                },
                workspace: true,
                contact: true,
                facebookPage: true,
                whatsappPhoneNumber: true
            }
        });

        if (pendingConversations.length === 0) {
            return; // Sessizce çık - log spam yapmamak için
        }

        console.log(`🤖 [Bot Scheduler] Found ${pendingConversations.length} conversations ready for bot response`);

        for (const conversation of pendingConversations) {
            // Son mesaj müşteriden mi kontrol et
            const lastMessage = conversation.messages[0];
            if (!lastMessage || !lastMessage.isFromContact) {
                // Son mesaj müşteriden değilse atla
                await prisma.conversation.update({
                    where: { id: conversation.id },
                    data: { botDelayedUntil: null }
                });
                continue;
            }

            console.log(`🤖 [Bot Scheduler] Triggering bot response for conversation ${conversation.id}`);

            // botDelayedUntil'i null yap ki tekrar tetiklenmesin
            await prisma.conversation.update({
                where: { id: conversation.id },
                data: { botDelayedUntil: null }
            });

            // Bot cevabını tetikle
            try {
                const { getAutoReply } = await import('../controllers/ai.controller.js');

                // Kanal tipini belirle
                let channel = conversation.channel?.toLowerCase() || 'facebook';
                if (channel === 'instagram') channel = 'instagram';
                else if (channel === 'whatsapp') channel = 'whatsapp';
                else channel = 'facebook';

                const aiResponse = await getAutoReply(
                    conversation.workspaceId,
                    conversation.id,
                    lastMessage.content,
                    channel,
                    'CHATS'
                );

                if (aiResponse) {
                    console.log(`🤖 [Bot Scheduler] AI Response for ${conversation.id}: ${aiResponse.substring(0, 50)}...`);

                    // Kanal tipine göre mesaj gönder
                    if (conversation.channel === 'WHATSAPP' && conversation.whatsappPhoneNumber) {
                        const { sendWhatsAppMessage } = await import('../controllers/whatsapp.controller.js');
                        await sendWhatsAppMessage(
                            conversation.whatsappPhoneNumber,
                            conversation.contact.phone,
                            aiResponse,
                            conversation.id
                        );
                    } else if ((conversation.channel === 'FACEBOOK' || conversation.channel === 'INSTAGRAM') && conversation.facebookPage) {
                        const axios = (await import('axios')).default;
                        const GRAPH_API_VERSION = process.env.FACEBOOK_GRAPH_API_VERSION || 'v18.0';

                        // Alıcı ID'sini belirle
                        const recipientId = conversation.contact.facebookId || conversation.contact.instagramId;

                        if (recipientId) {
                            const sendResponse = await axios.post(
                                `https://graph.facebook.com/${GRAPH_API_VERSION}/me/messages`,
                                {
                                    recipient: { id: String(recipientId) },
                                    message: { text: aiResponse }
                                },
                                {
                                    params: { access_token: conversation.facebookPage.pageAccessToken }
                                }
                            );

                            const sentMessageId = sendResponse.data?.message_id;

                            // Mesajı kaydet
                            const botMessage = await prisma.message.create({
                                data: {
                                    content: aiResponse,
                                    conversationId: conversation.id,
                                    isFromContact: false,
                                    messageType: conversation.channel === 'INSTAGRAM' ? 'INSTAGRAM' : 'TEXT',
                                    senderId: null,
                                    facebookMessageId: sentMessageId || null,
                                    status: 'SENT'
                                }
                            });

                            // Socket event gönder
                            emitToWorkspace(conversation.workspaceId, 'new_message', {
                                workspaceId: conversation.workspaceId,
                                conversationId: conversation.id,
                                message: botMessage,
                                contact: conversation.contact,
                                channel: conversation.channel
                            });

                            console.log(`✅ [Bot Scheduler] Bot response sent for conversation ${conversation.id}`);
                        }
                    }
                }
            } catch (aiError) {
                console.error(`❌ [Bot Scheduler] AI response error for ${conversation.id}:`, aiError.message);
            }
        }
    } catch (error) {
        console.error('❌ [Bot Scheduler] Process pending bot responses error:', error);
    }
}

