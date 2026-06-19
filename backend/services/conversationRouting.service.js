import prisma from '../lib/prisma.js';
import { getIO, emitToWorkspace } from '../socket.js';


/**
 * Varsayılan akışı ata ve akışın takımını uygula
 * Bu fonksiyon TÜM kanallar için merkezi olarak çalışır
 * 
 * İKİ İŞ YAPAR:
 * 1) funnelType boşsa → varsayılan akışı atar
 * 2) Akışın takımı varsa → konuşmanın takımını OVERRIDE eder (her zaman)
 */
export async function assignDefaultFunnel(workspaceId, conversationId) {
    try {
        const conv = await prisma.conversation.findUnique({
            where: { id: conversationId },
            select: { funnelType: true, contactId: true }
        });
        if (!conv) return null;

        let funnelId = conv.funnelType;

        // 1) Akış atanmamışsa → varsayılan akışı bul ve ata
        if (!funnelId) {
            let defaultFunnel = await prisma.funnel.findFirst({
                where: { workspaceId, name: { in: ['Genel', 'Genel CRM', 'Genel CRM (Otomatik İşlem)'] } }
            });
            if (!defaultFunnel) {
                defaultFunnel = await prisma.funnel.findFirst({
                    where: { workspaceId },
                    orderBy: { order: 'asc' }
                });
            }
            if (!defaultFunnel) return null;

            funnelId = defaultFunnel.id;

            // İlk aşamayı bul
            let firstStage = null;
            try {
                firstStage = await prisma.funnelStage.findFirst({
                    where: { funnelId: funnelId },
                    orderBy: { order: 'asc' }
                });
            } catch {}

            // Stage yoksa akış ataması yapma
            if (!firstStage) {
                console.log(`⚠️ [AutoFunnel] "${defaultFunnel.name}" has no stages — skipping assignment`);
                return null;
            }

            const updateData = {
                funnelType: funnelId,
                funnelStageId: firstStage.id
            };

            await prisma.conversation.update({
                where: { id: conversationId },
                data: updateData
            });

            // Contact'ı da güncelle (Customers sayfasında akış/aşama gösterilmesi için)
            if (conv.contactId) {
                try {
                    await prisma.contact.update({
                        where: { id: conv.contactId },
                        data: { funnelType: funnelId, funnelStageId: firstStage.id }
                    });
                } catch (contactErr) {
                    console.error('⚠️ [AutoFunnel] Contact update error:', contactErr.message);
                }
            }

            console.log(`✅ [AutoFunnel] "${defaultFunnel.name}" / "${firstStage.name}" → conversation ${conversationId}`);
        }

        // 2) Akışın takımını OVERRIDE et (her zaman çalışır)
        const funnel = await prisma.funnel.findUnique({
            where: { id: funnelId },
            select: { assignedTeamId: true, name: true }
        });

        // Aşama seviyesinde takım var mı?
        let funnelTeamId = null;
        const currentConv = await prisma.conversation.findUnique({
            where: { id: conversationId },
            select: { funnelStageId: true }
        });
        if (currentConv?.funnelStageId) {
            const stage = await prisma.funnelStage.findUnique({
                where: { id: currentConv.funnelStageId },
                select: { assignedTeamId: true }
            });
            funnelTeamId = stage?.assignedTeamId || null;
        }

        // Aşamada yoksa akış seviyesinden al
        if (!funnelTeamId) {
            funnelTeamId = funnel?.assignedTeamId || null;
        }

        if (funnelTeamId) {
            await prisma.conversation.update({
                where: { id: conversationId },
                data: {
                    assignedTeamId: funnelTeamId,
                    teamIds: JSON.stringify([funnelTeamId])
                }
            });
            console.log(`✅ [AutoFunnel] Team override: ${funnelTeamId} for "${funnel?.name}" → conversation ${conversationId}`);
        }

        return { funnelId, funnelTeamId };
    } catch (err) {
        console.error('❌ [AutoFunnel] Error:', err.message);
        return null;
    }
}


/**
 * Kanal yönlendirmesine göre konuşmayı ekibe ata ve bot gecikmesini ayarla
 * + Varsayılan akışı ata (akışın takımı kanal yönlendirmesini ezer)
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

        if (!routing || !routing.isActive) {
            console.log(`📡 [Routing] No active routing for channel ${channel}`);
            // Kanal yönlendirmesi yoksa bile varsayılan akışı ata
            if (isNewConversation) {
                await assignDefaultFunnel(workspaceId, conversationId);
            }
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
            // 🛡️ Sadece henüz kimseye atanmamışsa null yap — mevcut atamayı silme
            if (!existingConversation?.assignedToId) {
                updateData.assignedToId = null; // Agent üstlenene kadar null
            }
        }

        const updatedConversation = await prisma.conversation.update({
            where: { id: conversationId },
            data: updateData,
            include: {
                contact: true
            }
        });

        // Takım atama kuralına göre kişi ata (POOL modunda assignedToId null kalır)
        if (isNewConversation && routing.teamId) {
            try {
                const { assignToTeamMember } = await import('./teamAssignment.service.js');
                const assignedUserId = await assignToTeamMember(routing.teamId, conversationId);
                if (assignedUserId) {
                    // updatedConversation'a da ekle socket eventleri için
                    updatedConversation.assignedToId = assignedUserId;
                }
            } catch (e) {
                console.error('❌ [Routing] Team assignment error:', e.message);
            }
        }

        console.log(`📡 [Routing] ✅ Channel ${channel} → Team "${routing.team?.name}" (Bot delay: ${isNewConversation ? botDelaySeconds + 's' : 'SKIPPED'}, Bot: ${routing.botEnabled ? 'Active' : 'Disabled'})`);

        // ── Varsayılan akış ataması (akışın takımı kanal yönlendirmesini ezer) ──
        if (isNewConversation) {
            const funnelResult = await assignDefaultFunnel(workspaceId, conversationId);
            if (funnelResult?.funnelTeamId) {
                // Akışın takımı varsa, son durumu güncelle
                updatedConversation.assignedTeamId = funnelResult.funnelTeamId;
            }
        }

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
                        teamId: updatedConversation.assignedTeamId, // Funnel override sonrası
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
                teamId: updatedConversation.assignedTeamId,
                teamName: routing.team.name,
                channel,
                botDelayedUntil: botDelayedUntil?.toISOString() || null,
                botEnabled: routing.botEnabled
            });
        }

        return {
            routing,
            botDelayedUntil,
            teamId: updatedConversation.assignedTeamId,
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
                botPausedUntil: true,
                assignedToId: true
            }
        });

        if (!conversation) {
            return false;
        }

        // Bot kalıcı olarak kapatılmışsa (manuel "Oto Pilot Kapat") cevap verme
        if (!conversation.botEnabled) {
            console.log(`🔴 [Bot] Bot KALICI KAPALI for conversation ${conversationId}`);
            return false;
        }

        // Agent geçici duraklama süresi dolmamışsa bot sussun
        if (conversation.botPausedUntil && new Date() < conversation.botPausedUntil) {
            const remainingMin = Math.ceil((conversation.botPausedUntil - new Date()) / 60000);
            console.log(`🟡 [Bot] Agent duraklama aktif — ${remainingMin} dk kaldı (conversation ${conversationId})`);
            return false;
        }

        // Gecikme süresi dolmamışsa cevap verme (ilk 30sn gecikme)
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

