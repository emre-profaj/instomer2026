/**
 * WorkspaceRouter Service
 * ─────────────────────────────────────────────────────────────
 * Gelen mesajı analiz eder ve eşleşen RouterRule'a göre
 * konuşmayı ilgili Funnel'a taşır + bot/takım atar.
 *
 * Eşleşme sırası:
 *   1. Anahtar kelime (ANY/ALL)
 *   2. AI intent analizi (Gemini) — useAI=true ise
 */

import prisma from '../lib/prisma.js';
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
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

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
async function moveConversationToFunnel(conversation, funnelId, botId = null, teamId = null, workspaceId = null) {
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
            firstStage = await prisma.funnelStage.findFirst({
                where: { funnelId },
                orderBy: { order: 'asc' }
            });
            console.log(`🚦 [ROUTER:MOVE] İlk aşama: ${firstStage?.name || 'yok'}`);
        } catch (stageErr) {
            console.error(`🚦 [ROUTER:MOVE] Aşama sorgusu hatası:`, stageErr.message);
        }

        // Sadece kesinlikle var olan kolonları güncelle
        const updateData = {
            funnelType: funnelId,
            updatedAt: new Date()
        };
        if (firstStage?.id) updateData.funnelStageId = firstStage.id;

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

            // Round-robin ile takımdan kişi ata (kişi henüz belirlenmediyse)
            if (!effectiveUserId) {
                try {
                    const rrUserId = await assignRoundRobin(effectiveTeamId, conversation.id);
                    if (rrUserId) {
                        effectiveUserId = rrUserId;
                        console.log(`👥 [ROUTER:MOVE] Round-Robin → user: ${rrUserId}`);
                    }
                } catch (rrErr) {
                    console.error(`[ROUTER:MOVE] Round-robin error:`, rrErr.message);
                }
            }
        }
        if (effectiveUserId) updateData.assignedToId = effectiveUserId;

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

// ─── Ana Router Fonksiyonu ────────────────────────────────────
/**
 * Gelen mesajı RouterRule'larla karşılaştırır.
 * Eşleşen ilk kural uygulanır ve konuşma yönlendirilir.
 *
 * @returns {{ matched: boolean, rule?: object, result?: object }}
 */
export async function runWorkspaceRouter(workspaceId, conversationId, message) {
    try {
        console.log('\n🚦 [ROUTER] ===== START =====');
        console.log(`🚦 [ROUTER] workspaceId=${workspaceId} convId=${conversationId} msg="${message?.substring(0,80)}"`);

        const rules = await prisma.routerRule.findMany({
            where: { workspaceId, isActive: true },
            orderBy: { priority: 'asc' }
        });

        console.log(`🚦 [ROUTER] ${rules.length} aktif kural bulundu`);
        if (!rules.length) return { matched: false };

        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
            select: { id: true, funnelType: true }
        });

        console.log(`🚦 [ROUTER] conversation: ${JSON.stringify(conversation)}`);
        if (!conversation) { console.log('🚦 [ROUTER] conversation bulunamadı!'); return { matched: false }; }

        for (const rule of rules) {
            let conditions = {};
            let targets = {};
            try { conditions = JSON.parse(rule.conditions || '{}'); } catch { }
            try { targets = JSON.parse(rule.targets || '{}'); } catch { }

            console.log(`🚦 [ROUTER] Kural: "${rule.name}" | keywords=${JSON.stringify(conditions.keywords)} | funnelId=${targets.funnelId}`);

            const keywords = conditions.keywords || [];
            const matchMode = conditions.matchMode || 'ANY';
            const useAI = conditions.useAI || false;
            const aiDesc = conditions.aiDescription || '';

            let matched = false;

            if (keywords.length) {
                matched = keywordMatch(message, keywords, matchMode);
                console.log(`🚦 [ROUTER] keyword match: ${matched}`);
            }

            if (!matched && useAI && aiDesc) {
                matched = await aiIntentMatch(message, aiDesc, workspaceId);
                console.log(`🚦 [ROUTER] AI match: ${matched}`);
            }

            if (!keywords.length && !useAI) {
                matched = true;
                console.log('🚦 [ROUTER] koşulsuz kural → matched');
            }

            if (!matched) { console.log('🚦 [ROUTER] eşleşmedi'); continue; }

            console.log(`✅ [ROUTER] Kural "${rule.name}" EŞLEŞTİ! funnelId=${targets.funnelId}`);

            if (targets.funnelId) {
                console.log(`🚦 [ROUTER] Funnel'a taşınıyor: ${targets.funnelId}`);
                const result = await moveConversationToFunnel(
                    conversation,
                    targets.funnelId,
                    targets.botId || null,
                    targets.teamId || null,
                    workspaceId
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
