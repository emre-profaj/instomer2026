import prisma from '../lib/prisma.js';
import { getIO, emitToWorkspace } from '../socket.js';
import { changeFunnelStage } from './funnelStageManager.service.js';
import { evaluateClassifierRules } from './classifier.service.js';


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

            if (conv.contactId) {
                await changeFunnelStage(conv.contactId, workspaceId, funnelId, firstStage.id, {
                    source: 'channel_routing',
                    skipGuards: true,
                    conversationId
                });
            }

            console.log(`✅ [AutoFunnel] "${defaultFunnel.name}" / "${firstStage.name}" → conversation ${conversationId}`);
        }

        return { funnelId, funnelTeamId: null };
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
 * @param {string} pageId - Sayfa ID (opsiyonel)
 * @param {object} options - Ekstra parametreler { messageText, formId } vb.
 * @returns {Object} - Yönlendirme bilgisi
 */
export async function applyChannelRouting(workspaceId, conversationId, channel, isNewConversation = true, pageId = null, options = {}) {
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

        // 1. Önce Classifier Kurallarını kontrol et (Sadece yeni konuşmalarda çalıştır - Faz 1)
        if (isNewConversation) {
            const matchedRule = await evaluateClassifierRules(workspaceId, channel, { ...options, pageId, conversationId });
            
            if (matchedRule) {
                console.log(`📡 [Classifier] Rule matched: ${matchedRule.name}`);
                const updateData = {};
                if (matchedRule.targetTeamId) updateData.assignedTeamId = matchedRule.targetTeamId;
                if (matchedRule.targetFunnelId) updateData.funnelType = matchedRule.targetFunnelId; // Not: funnelType'ı funnelId olarak kullanıyoruz veya ayrıca eşleştiriyoruz.
                if (matchedRule.targetStageId) updateData.funnelStageId = matchedRule.targetStageId;
                
                // Bot ataması
                if (matchedRule.targetBotId) {
                    updateData.assignedBotId = matchedRule.targetBotId;
                    updateData.botEnabled = true;
                }

                // Eger herhangi bir atama varsa, güncelle:
                if (Object.keys(updateData).length > 0) {
                    await prisma.conversation.update({
                        where: { id: conversationId },
                        data: updateData
                    });

                    // Konuşma mevcut bir vakaya bağlıysa vakayı da taşı.
                    // Inbox listesi VAKANIN akışını gösterdiği için, burada
                    // güncellenmezse ekranda eski akış görünüyor.
                    if (updateData.funnelType) {
                        try {
                            const conv = await prisma.conversation.findUnique({
                                where: { id: conversationId },
                                select: { caseId: true }
                            });
                            if (conv?.caseId) {
                                await prisma.case.update({
                                    where: { id: conv.caseId },
                                    data: {
                                        funnelType: updateData.funnelType,
                                        ...(updateData.funnelStageId && { funnelStageId: updateData.funnelStageId }),
                                        ...(updateData.assignedTeamId && { assignedTeamId: updateData.assignedTeamId })
                                    }
                                });
                                console.log(`🔄 [Classifier] Vaka ${conv.caseId} kurala göre taşındı`);
                            }
                        } catch (caseErr) {
                            console.error('⚠️ [Classifier] Vaka güncellenemedi:', caseErr.message);
                        }
                    }
                }
                
                // Otomasyon çağrısı (Opsiyonel)
                if (matchedRule.automationId) {
                    console.log(`🤖 [Classifier] Triggering automation: ${matchedRule.automationId}`);
                    // TODO: trigger automation
                }
                
                return {
                    classifierMatched: true,
                    ruleId: matchedRule.id,
                    teamId: matchedRule.targetTeamId,
                    botEnabled: !!matchedRule.targetBotId
                };
            }
        }

        // 2. Classifier kuralı yoksa veya mevcut konuşmaysa, ESKİ ChannelRouting mantığına fallback
        let routing = null;
        if (pageId) {
            routing = await prisma.channelRouting.findFirst({
                where: { workspaceId, channel, pageId, isActive: true },
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
        }
        // Sayfa bazlı bulunamadıysa genel kanal yönlendirmesine düş
        if (!routing) {
            routing = await prisma.channelRouting.findFirst({
                where: { workspaceId, channel, pageId: null, isActive: true },
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
        }

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

        // ── Akış ataması: routing'de funnelId varsa onu kullan, yoksa varsayılanı ata ──
        if (isNewConversation) {
            if (routing.funnelId) {
                // Routing'deki özel funnel'ı kullan
                const funnel = await prisma.funnel.findUnique({
                    where: { id: routing.funnelId },
                    include: { stages: { orderBy: { order: 'asc' } } }
                });
                if (funnel && funnel.stages.length > 0) {
                    const targetStage = routing.stageId 
                        ? funnel.stages.find(s => s.id === routing.stageId) || funnel.stages[0]
                        : funnel.stages[0];
                    const conv = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { contactId: true } });
                    if (conv?.contactId) {
                        await changeFunnelStage(conv.contactId, workspaceId, funnel.id, targetStage.id, {
                            source: 'channel_routing',
                            skipGuards: true,
                            conversationId
                        });
                    }
                }
            } else {
                await assignDefaultFunnel(workspaceId, conversationId);
            }

            // Re-fetch conversation to get latest assignedTeamId after funnel assignments
            const latestConv = await prisma.conversation.findUnique({
                where: { id: conversationId },
                select: { assignedTeamId: true }
            });
            if (latestConv?.assignedTeamId) {
                updatedConversation.assignedTeamId = latestConv.assignedTeamId;
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

let isProcessingBotResponses = false;

/**
 * Gecikme süresi dolan konuşmaları kontrol et ve bot'u tetikle
 * Bu fonksiyon periyodik olarak çalıştırılmalı (cron job gibi)
 */
export async function processPendingBotResponses() {
    if (isProcessingBotResponses) return;
    isProcessingBotResponses = true;
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
                whatsappPhoneNumber: true,
                assignedBot: true
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

                // Bot adını ve kanal tipini belirle
                const botName = conversation.assignedBot?.name || 'Instomer AI';
                const channel = conversation.channel || 'WHATSAPP';

                // Bot cevabını üret
                const aiResponse = await getAutoReply(
                    conversation.workspaceId,
                    conversation.id,
                    lastMessage.content,
                    channel,
                    'CHATS'
                );

                if (aiResponse) {
                    const safeAiResponse = aiResponse.replace(/\[HANDOFF\]/gi, '').trim();
                    if (!safeAiResponse) return;

                    console.log(`🤖 [Bot Scheduler] AI Response for ${conversation.id}: ${safeAiResponse.substring(0, 50)}...`);

                    // Kanal tipine göre mesaj gönder
                    if (conversation.channel === 'WHATSAPP' && conversation.whatsappPhoneNumber) {
                        const { sendWhatsAppMessage } = await import('../controllers/whatsapp.controller.js');
                        await sendWhatsAppMessage(
                            conversation.whatsappPhoneNumber,
                            conversation.contact.phone,
                            safeAiResponse,
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
                                channel: conversation.channel,
                                assignedToId: conversation.assignedToId || null,
                                assignedTeamId: conversation.assignedTeamId || null
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
    } finally {
        isProcessingBotResponses = false;
    }
}

// ═══════════════════════════════════════════════════════════════
// Madde 5: Takım Bazlı Bot Çözümleme
// ═══════════════════════════════════════════════════════════════

/**
 * Aşama → Takım → Bot zincirini çözer.
 * Öncelik sırası:
 *   1. Aşamanın takımının botu (Stage → Team → Team.assignedBotId)
 *   2. Akışın takımının botu (Funnel → Team → Team.assignedBotId)
 *   3. Kanal yönlendirmesinin takımının botu
 *   4. null (bot yok)
 * 
 * @param {string} workspaceId
 * @param {string} conversationId
 * @returns {Promise<{botId: string|null, teamId: string|null, source: string}>}
 */
export async function resolveTeamBot(workspaceId, conversationId) {
    try {
        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
            select: { funnelType: true, funnelStageId: true, assignedTeamId: true, channel: true }
        });
        if (!conversation) return { botId: null, teamId: null, source: 'none' };

        // 1. Aşamanın takımı
        if (conversation.funnelStageId) {
            const stage = await prisma.funnelStage.findUnique({
                where: { id: conversation.funnelStageId },
                select: { assignedTeamId: true }
            });
            if (stage?.assignedTeamId) {
                const team = await prisma.team.findUnique({
                    where: { id: stage.assignedTeamId },
                    select: { assignedBotId: true }
                });
                if (team?.assignedBotId) {
                    console.log(`🤖 [TeamBot] Stage team bot resolved: ${team.assignedBotId}`);
                    return { botId: team.assignedBotId, teamId: stage.assignedTeamId, source: 'stage_team' };
                }
            }
        }

        // 2. Akışın takımı (ve hiyerarşik üst akışların takımı)
        if (conversation.funnelType) {
            let currentFunnelId = conversation.funnelType;
            let depth = 0;
            while (currentFunnelId && depth < 10) {
                const funnel = await prisma.funnel.findUnique({
                    where: { id: currentFunnelId },
                    select: { assignedTeamId: true, parentId: true }
                });
                if (funnel?.assignedTeamId) {
                    const team = await prisma.team.findUnique({
                        where: { id: funnel.assignedTeamId },
                        select: { assignedBotId: true }
                    });
                    if (team?.assignedBotId) {
                        console.log(`🤖 [TeamBot] Funnel ${depth > 0 ? `parent (depth ${depth}) ` : ''}team bot resolved: ${team.assignedBotId}`);
                        return { botId: team.assignedBotId, teamId: funnel.assignedTeamId, source: depth === 0 ? 'funnel_team' : `parent_funnel_team_${depth}` };
                    }
                }
                currentFunnelId = funnel?.parentId;
                depth++;
            }
        }

        // 3. Konuşmanın mevcut takımı
        if (conversation.assignedTeamId) {
            const team = await prisma.team.findUnique({
                where: { id: conversation.assignedTeamId },
                select: { assignedBotId: true }
            });
            if (team?.assignedBotId) {
                console.log(`🤖 [TeamBot] Assigned team bot resolved: ${team.assignedBotId}`);
                return { botId: team.assignedBotId, teamId: conversation.assignedTeamId, source: 'assigned_team' };
            }
        }

        return { botId: null, teamId: null, source: 'none' };
    } catch (error) {
        console.error('❌ [TeamBot] Resolve error:', error.message);
        return { botId: null, teamId: null, source: 'error' };
    }
}
