/**
 * WorkspaceRouter Service
 * ─────────────────────────────────────────────────────────────
 * Gelen mesajı analiz eder ve eşleşen ClassifierRule'a göre
 * konuşmayı ilgili Funnel'a taşır + bot/takım atar.
 *
 * Eşleşme sırası (conditionType):
 *   - KEYWORD: Anahtar kelime (ANY/ALL)
 *   - AI: AI intent analizi (Gemini)
 *   - CHANNEL: Kanal bazlı eşleşme
 *   - TIME: Zaman bazlı eşleşme
 *   - DEFAULT: Her zaman eşleşir (fallback)
 */

import prisma from '../lib/prisma.js';
import { channelRuleMatches } from '../utils/channelRuleMatch.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

// ─── Round-Robin yardımcısı ────────────────────────────────────
async function assignRoundRobin(teamId, conversationId) {
    const members = await prisma.teamMember.findMany({
        where: { teamId, userId: { not: null } },
        orderBy: { createdAt: 'asc' },
        select: { userId: true }
    });
    if (!members.length) return null;

    const last = await prisma.conversation.findFirst({
        where: { teamId, assignedToId: { not: null } },
        orderBy: { updatedAt: 'desc' },
        select: { assignedToId: true }
    });

    const idx = last?.assignedToId
        ? members.findIndex(m => m.userId === last.assignedToId)
        : -1;

    return members[(idx + 1) % members.length].userId;
}

// ─── Keyword eşleşme ──────────────────────────────────────────
function keywordMatch(message, keywords = [], mode = 'ANY') {
    if (!keywords.length) return true; // koşul yoksa hep eşleşir
    const lower = message.toLowerCase();
    if (mode === 'ALL') return keywords.every(kw => lower.includes(kw.toLowerCase()));
    return keywords.some(kw => lower.includes(kw.toLowerCase()));
}

// ─── AI Intent analizi ────────────────────────────────────────
async function aiIntentMatch(message, aiDescription, workspaceId) {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return false;

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });

        const prompt = `Kullanıcı mesajı: "${message}"
Hedef niyet açıklaması: "${aiDescription}"
Bu mesaj belirtilen niyetle örtüşüyor mu? Sadece "EVET" veya "HAYIR" ile cevap ver.`;

        const result = await model.generateContent(prompt);
        const text = result.response.text().trim().toUpperCase();
        return text.startsWith('EVET');
    } catch (err) {
        console.error('[WorkspaceRouter] AI intent error:', err.message);
        return false;
    }
}

// ─── Funnel Stage'e taşıma ────────────────────────────────────
async function moveConversationToFunnel(conversation, funnelId, botId = null, teamId = null, workspaceId = null, skipAssignment = false, targetStageId = null) {
    try {
        console.log(`🚦 [ROUTER:MOVE] Funnel aranıyor: ${funnelId}`);

        // Funnel'ı stages olmadan bul (schema uyumsuzluğunu önle)
        const funnel = await prisma.funnel.findFirst({
            where: { id: funnelId }
        });
        if (!funnel) {
            console.log(`🚦 [ROUTER:MOVE] Funnel bulunamadı: ${funnelId}`);
            return null;
        }
        console.log(`🚦 [ROUTER:MOVE] Funnel bulundu: "${funnel.name}"`);

        // Aşamaları ayrı sorguda çek (assignedBotId olmayabilir)
        let firstStage = null;
        try {
            // Kuralda aşama seçildiyse ONU kullan; kullanıcı ekranda
            // "Satış Akışı > Yeni Fırsat" derken aşamayı da seçiyor.
            if (targetStageId) {
                firstStage = await prisma.funnelStage.findFirst({
                    where: { id: targetStageId, funnelId }
                });
                if (firstStage) console.log(`🚦 [ROUTER:MOVE] Kuraldaki aşama: ${firstStage.name}`);
            }
            if (!firstStage) firstStage = await prisma.funnelStage.findFirst({
                where: { funnelId },
                orderBy: { order: 'asc' }
            });
            console.log(`🚦 [ROUTER:MOVE] İlk aşama: ${firstStage?.name || 'yok'}`);
        } catch (stageErr) {
            console.error(`🚦 [ROUTER:MOVE] Aşama sorgusu hatası:`, stageErr.message);
        }

        // Stage yoksa akış ataması yapma
        if (!firstStage?.id) {
            console.log(`⚠️ [ROUTER:MOVE] Funnel "${funnel.name}" has no stages — skipping assignment`);
            return null;
        }

        // Sadece kesinlikle var olan kolonları güncelle
        const updateData = {
            funnelType: funnelId,
            funnelStageId: firstStage.id,
            updatedAt: new Date()
        };

        // ── Atama mantığı: Manuel atanmış konuşmaları EZMEMELİ ──
        if (skipAssignment) {
            console.log(`🚦 [ROUTER:MOVE] skipAssignment=true → mevcut atama korunuyor`);
        } else {
            // Opsiyonel atamalar — doğru kolon adlarıyla
            const effectiveBotId = botId || firstStage?.assignedBotId || null;

            // Takım atama: Rule target > Stage > Funnel fallback
            let effectiveTeamId = teamId || firstStage?.assignedTeamId || null;
            let effectiveUserId = firstStage?.assignedUserId || null;

            // Stage'de takım/kişi yoksa, Funnel seviyesine bak
            if (!effectiveTeamId && funnel.assignedTeamId) {
                effectiveTeamId = funnel.assignedTeamId;
                console.log(`📂 [ROUTER:MOVE] Funnel-level takım kullanılıyor: ${effectiveTeamId}`);
            }
            if (!effectiveUserId && funnel.assignedUserId) {
                effectiveUserId = funnel.assignedUserId;
                console.log(`📂 [ROUTER:MOVE] Funnel-level kişi kullanılıyor: ${effectiveUserId}`);
            }

            if (effectiveBotId) updateData.assignedBotId = effectiveBotId;
            if (effectiveTeamId) {
                updateData.assignedTeamId = effectiveTeamId;
                updateData.teamIds = JSON.stringify([effectiveTeamId]);

                // Takım atama kuralına göre kişi ata (POOL/ROUND_ROBIN/LEAST_BUSY)
                if (!effectiveUserId) {
                    try {
                        const { assignToTeamMember } = await import('./teamAssignment.service.js');
                        const rrUserId = await assignToTeamMember(effectiveTeamId, conversation.id);
                        if (rrUserId) {
                            effectiveUserId = rrUserId;
                            console.log(`👥 [ROUTER:MOVE] TeamAssignment → user: ${rrUserId}`);
                        }
                    } catch (rrErr) {
                        console.error(`[ROUTER:MOVE] Team assignment error:`, rrErr.message);
                    }
                }
            }
            if (effectiveUserId) updateData.assignedToId = effectiveUserId;
        }

        console.log(`🚦 [ROUTER:MOVE] Güncelleme yapılıyor:`, JSON.stringify(updateData));

        await prisma.conversation.update({
            where: { id: conversation.id },
            data: updateData
        });

        console.log(`✅ [ROUTER:MOVE] Conversation ${conversation.id} → "${funnel.name}" taşındı`);

        // UI'ı anlık güncelle
        try {
            const { emitToWorkspace } = await import('../socket.js');
            emitToWorkspace(workspaceId, 'conversation_updated', { conversationId: conversation.id });

            // Ekip ataması değiştiyse conversation_assigned event'i de gönder
            if (effectiveTeamId || effectiveUserId) {
                let assignedToName = null;
                if (effectiveUserId) {
                    try {
                        const u = await prisma.user.findUnique({ where: { id: effectiveUserId }, select: { name: true } });
                        assignedToName = u?.name || null;
                    } catch (_) {}
                }
                emitToWorkspace(workspaceId, 'conversation_assigned', {
                    conversationId: conversation.id,
                    assignedToId: effectiveUserId || null,
                    assignedToName,
                    teamIds: effectiveTeamId ? JSON.stringify([effectiveTeamId]) : '[]',
                    botEnabled: !!effectiveBotId
                });
            }
        } catch (_) {}

        // FLOW_ENTERED eventi
        if (workspaceId) {
            try {
                const { executeFlowsByTrigger } = await import('../controllers/flow.controller.js');
                await executeFlowsByTrigger(workspaceId, 'FLOW_ENTERED', {
                    conversation: { id: conversation.id },
                    funnelId,
                    funnelName: funnel.name
                });
            } catch (flowErr) {
                console.error('[WorkspaceRouter] FLOW_ENTERED trigger error:', flowErr.message);
            }
        }

        return { funnel, stage: firstStage };
    } catch (err) {
        console.error(`❌ [ROUTER:MOVE] Hata:`, err.message, err.stack?.split('\n').slice(0,3).join(' | '));
        return null;
    }
}

// ─── Zaman eşleşme ───────────────────────────────────────────
function timeMatch(timeStart, timeEnd) {
    if (!timeStart || !timeEnd) return false;
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    
    const [startH, startM] = timeStart.split(':').map(Number);
    const [endH, endM] = timeEnd.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    
    // Handle overnight ranges (e.g. 18:00 - 09:00)
    if (startMinutes <= endMinutes) {
        return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    } else {
        return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }
}

// ─── Ana Router Fonksiyonu ────────────────────────────────────
/**
 * Gelen mesajı ClassifierRule'larla karşılaştırır.
 * Eşleşen ilk kural uygulanır ve konuşma yönlendirilir.
 *
 * @returns {{ matched: boolean, rule?: object, result?: object }}
 */
export async function runWorkspaceRouter(workspaceId, conversationId, message, channel = null) {
    try {
        console.log('\n🚦 [ROUTER] ===== START =====');
        console.log(`🚦 [ROUTER] workspaceId=${workspaceId} convId=${conversationId} msg="${message?.substring(0,80)}"`);

        // ClassifierRule kullan (RouterRule yerine)
        const rules = await prisma.classifierRule.findMany({
            where: { workspaceId, isActive: true },
            orderBy: { priority: 'asc' }
        });

        console.log(`🚦 [ROUTER] ${rules.length} aktif kural bulundu`);
        if (!rules.length) return { matched: false };

        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
            select: {
                id: true, funnelType: true, assignedToId: true,
                // Kanal kuralları hesap KİMLİĞİNE göre yazılıyor
                // (ör. "wa-<numara kaydı>"), bu yüzden bunlar da gerekli.
                channel: true,
                whatsappPhoneNumberId: true,
                facebookPageId: true,
                instagramBusinessId: true,
                emailChannelId: true
            }
        });

        console.log(`🚦 [ROUTER] conversation: ${JSON.stringify(conversation)}`);
        if (!conversation) { console.log('🚦 [ROUTER] conversation bulunamadı!'); return { matched: false }; }

        // ── Zaten bir funnel'da ve birine atanmışsa, tekrar yönlendirme! ──
        const alreadyRouted = !!conversation.funnelType;
        const alreadyAssigned = !!conversation.assignedToId;
        if (alreadyRouted && alreadyAssigned) {
            console.log(`🚦 [ROUTER] Konuşma zaten funnel'da (${conversation.funnelType}) ve atanmış (${conversation.assignedToId}) → ATLANIYOR`);
            return { matched: false };
        }

        for (const rule of rules) {
            let conditions = {};
            try { conditions = JSON.parse(rule.conditions || '{}'); } catch { }

            const condType = rule.conditionType || 'KEYWORD';
            console.log(`🚦 [ROUTER] Kural: "${rule.name}" | type=${condType} | funnelId=${rule.targetFunnelId}`);

            let matched = false;

            switch (condType) {
                case 'KEYWORD': {
                    const kws = conditions.keywords;
                    const keywords = Array.isArray(kws) ? kws : (typeof kws === 'string' && kws ? kws.split(',').map(k => k.trim()).filter(Boolean) : []);
                    const matchMode = conditions.matchMode || 'ANY';
                    if (keywords.length) {
                        matched = keywordMatch(message, keywords, matchMode);
                    }
                    console.log(`🚦 [ROUTER] keyword match: ${matched}`);
                    break;
                }
                case 'AI': {
                    const aiDesc = conditions.aiDescription || '';
                    if (aiDesc) {
                        matched = await aiIntentMatch(message, aiDesc, workspaceId);
                    }
                    console.log(`🚦 [ROUTER] AI match: ${matched}`);
                    break;
                }
                case 'CHANNEL': {
                    const ruleChannels = conditions.channels || [];
                    if (ruleChannels.length) {
                        matched = channelRuleMatches(ruleChannels, conversation, channel);
                    }
                    console.log(`🚦 [ROUTER] channel match: ${matched} (kural: ${ruleChannels.join(',')})`);
                    break;
                }
                case 'TIME': {
                    matched = timeMatch(conditions.timeStart, conditions.timeEnd);
                    console.log(`🚦 [ROUTER] time match: ${matched} (${conditions.timeStart}-${conditions.timeEnd})`);
                    break;
                }
                case 'DEFAULT': {
                    matched = true;
                    console.log('🚦 [ROUTER] DEFAULT kural → matched');
                    break;
                }
                default: {
                    // Legacy RouterRule compat: keywords + useAI
                    const keywords = conditions.keywords || [];
                    const useAI = conditions.useAI || false;
                    const aiDesc = conditions.aiDescription || '';
                    
                    if (keywords.length) {
                        matched = keywordMatch(message, keywords, conditions.matchMode || 'ANY');
                    }
                    if (!matched && useAI && aiDesc) {
                        matched = await aiIntentMatch(message, aiDesc, workspaceId);
                    }
                    if (!keywords.length && !useAI) {
                        matched = true;
                    }
                    break;
                }
            }

            if (!matched) { console.log('🚦 [ROUTER] eşleşmedi'); continue; }

            console.log(`✅ [ROUTER] Kural "${rule.name}" EŞLEŞTİ! funnelId=${rule.targetFunnelId}`);

            // ClassifierRule doğrudan targetFunnelId alanı kullanır
            const funnelId = rule.targetFunnelId;
            
            if (funnelId) {
                console.log(`🚦 [ROUTER] Funnel'a taşınıyor: ${funnelId}`);
                const result = await moveConversationToFunnel(
                    conversation,
                    funnelId,
                    null, // botId — ClassifierRule'da yok, takım/stage'den miras alınır
                    rule.targetTeamId || null,
                    workspaceId,
                    alreadyAssigned,
                    rule.targetStageId || null
                );
                console.log('🚦 [ROUTER] Taşıma tamamlandı:', result ? 'başarılı' : 'sonuç yok');
                return { matched: true, rule, result };
            }

            console.log('🚦 [ROUTER] funnelId yok, taşıma yapılmadı');
            return { matched: true, rule, result: null };
        }

        console.log('🚦 [ROUTER] Hiçbir kural eşleşmedi');
        return { matched: false };
    } catch (err) {
        console.error('[WorkspaceRouter] Error:', err.message, err.stack?.split('\n').slice(0,3).join(' | '));
        return { matched: false };
    }
}

// Alias for backward compatibility (ai.controller.js imports this name)
export const routeConversationToFunnel = runWorkspaceRouter;

