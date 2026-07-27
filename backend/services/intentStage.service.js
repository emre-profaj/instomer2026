/**
 * ═══════════════════════════════════════════════════════════════
 * NİYET → AŞAMA OTOMATİK GEÇİŞ SERVİSİ (Madde 1)
 * ═══════════════════════════════════════════════════════════════
 * 
 * universalClassifier çıktısını alır, kişiyi uygun aşamaya taşır.
 * Aşama değişikliğini ConversationEvent olarak kaydeder.
 * 
 * İş mantığı:
 *   classification + requestedAction → FunnelStage eşleşmesi
 *   - FIRSAT → "Fırsat" aşaması
 *   - FIRSAT + CALL → "Görüşme Planlandı" aşaması
 *   - FIRSAT + fiyat konuşuldu → "Sıcak Fırsat"
 *   - RANDEVU → "Randevu" aşaması
 *   - SIKAYET → "Şikayet" aşaması
 * 
 * @module intentStageService
 */

import prisma from '../lib/prisma.js';
import { emitToWorkspace } from '../socket.js';

/**
 * Niyet → Aşama eşleşme tablosu
 * Workspace ayarı ile override edilebilir
 */
const DEFAULT_INTENT_STAGE_MAP = {
  // classification → aşama anahtar kelimeleri (ilk eşleşen kullanılır)
  'FIRSAT': ['Fırsat', 'Yeni Fırsat', 'Opportunity'],
  'RANDEVU': ['Randevu', 'Görüşme', 'Appointment'],
  'DESTEK': ['Destek', 'Talep', 'Support'],
  'IS_BASVURUSU': ['Başvuru', 'İK', 'HR'],
  'SIKAYET': ['Şikayet', 'Complaint'],
  'GENEL': [] // Genel için aşama değişikliği yapma
};

/**
 * requestedAction → aşama override
 */
const ACTION_STAGE_MAP = {
  'CALL': ['Görüşme Planlandı', 'Arama Bekleniyor', 'Call Scheduled'],
  'VISIT': ['Ziyaret Planlandı', 'Randevu'],
  'MEETING': ['Görüşme Planlandı', 'Randevu'],
};

/**
 * Classifier sonucuna göre aşama geçişi yap
 * 
 * @param {string} workspaceId
 * @param {string} conversationId
 * @param {string} contactId
 * @param {Object} classifierResult - classifyAndExtract() çıktısı
 * @returns {Object|null} - { oldStage, newStage, changed: boolean }
 */
export async function applyIntentStageTransition(workspaceId, conversationId, contactId, classifierResult) {
  try {
    if (!classifierResult || classifierResult.classification === 'GENEL') return null;

    const { classification, extractedData, matchedFunnelId, confidence } = classifierResult;

    // Düşük güvenlik → değişiklik yapma
    if ((confidence || 0) < 0.6) {
      console.log(`🧠 [IntentStage] Confidence too low (${confidence}), skipping`);
      return null;
    }

    // Mevcut durumları al
    const [conversation, contact, workspace] = await Promise.all([
      prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { funnelType: true, funnelStageId: true }
      }),
      prisma.contact.findUnique({
        where: { id: contactId },
        select: { stageManuallySet: true, funnelStageId: true }
      }),
      prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { stageAutoMode: true }
      })
    ]);

    if (!conversation) return null;

    // Manuel aşama değişikliği yapılmışsa → otomatik değiştirme
    if (contact?.stageManuallySet) {
      console.log(`🧠 [IntentStage] Contact ${contactId} has manual stage, skipping auto-transition`);
      return null;
    }

    // Hedef akışı belirle
    let targetFunnelId = matchedFunnelId || conversation.funnelType;
    if (!targetFunnelId) return null;

    // Hedef akışın aşamalarını al
    const stages = await prisma.funnelStage.findMany({
      where: { funnelId: targetFunnelId },
      orderBy: { order: 'asc' }
    });
    if (stages.length === 0) return null;

    // Uygun aşamayı bul
    let targetStage = null;

    // 1. requestedAction varsa önce onu dene
    if (extractedData?.requestedAction && ACTION_STAGE_MAP[extractedData.requestedAction]) {
      const actionKeywords = ACTION_STAGE_MAP[extractedData.requestedAction];
      targetStage = findStageByKeywords(stages, actionKeywords);
    }

    // 2. Classification'dan aşama bul
    if (!targetStage && DEFAULT_INTENT_STAGE_MAP[classification]) {
      const classKeywords = DEFAULT_INTENT_STAGE_MAP[classification];
      targetStage = findStageByKeywords(stages, classKeywords);
    }

    // 3. Eşleşme yoksa veya zaten o aşamadaysa → geç
    if (!targetStage) return null;
    if (targetStage.id === conversation.funnelStageId) return null;

    // Mevcut aşamadan geri gitmeyi engelle (order bazlı)
    const currentStage = stages.find(s => s.id === conversation.funnelStageId);
    if (currentStage && targetStage.order <= currentStage.order) {
      console.log(`🧠 [IntentStage] Would go backwards (${currentStage.name} → ${targetStage.name}), skipping`);
      return null;
    }

    // Aşama geçişini uygula
    const oldStageName = currentStage?.name || 'Yok';

    // Madde 4.4: stageAutoMode Workspace Ayarı kontrolü
    if (workspace && workspace.stageAutoMode === false) {
      console.log(`🧠 [IntentStage] stageAutoMode is false, suggesting transition ${oldStageName} → ${targetStage.name}`);
      emitToWorkspace(workspaceId, 'stage_suggestion', {
        conversationId,
        contactId,
        suggestedStage: targetStage.name,
        suggestedStageId: targetStage.id,
        classification,
        confidence
      });
      return {
        oldStage: oldStageName,
        suggestedStage: targetStage.name,
        changed: false,
        classification,
        confidence
      };
    }

    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        funnelStageId: targetStage.id,
        ...(matchedFunnelId && matchedFunnelId !== conversation.funnelType ? { funnelType: matchedFunnelId } : {})
      }
    });

    // Contact'ı da güncelle
    await prisma.contact.update({
      where: { id: contactId },
      data: {
        funnelStageId: targetStage.id,
        ...(matchedFunnelId && matchedFunnelId !== conversation.funnelType ? { funnelType: matchedFunnelId } : {})
      }
    });

    // ConversationEvent oluştur
    try {
      await prisma.conversationEvent.create({
        data: {
          conversationId,
          eventType: 'STAGE_CHANGED',
          details: JSON.stringify({
            oldStage: oldStageName,
            newStage: targetStage.name,
            trigger: 'AI_INTENT',
            classification,
            confidence,
            intent: extractedData?.requestedAction || null,
          })
        }
      });
    } catch { /* ConversationEvent tablosu yoksa atla */ }

    // Socket bildirim
    emitToWorkspace(workspaceId, 'conversation_updated', {
      conversationId,
      contactId,
      stageChanged: true,
      oldStage: oldStageName,
      newStage: targetStage.name
    });

    console.log(`🧠 [IntentStage] ${oldStageName} → ${targetStage.name} (${classification}, confidence: ${confidence})`);

    return {
      oldStage: oldStageName,
      newStage: targetStage.name,
      changed: true,
      classification,
      confidence,
    };

  } catch (error) {
    console.error('❌ [IntentStage] Error:', error.message);
    return null;
  }
}

/**
 * Anahtar kelimelerle aşama bul
 */
function findStageByKeywords(stages, keywords) {
  for (const keyword of keywords) {
    const lower = keyword.toLowerCase();
    const match = stages.find(s => s.name.toLowerCase().includes(lower));
    if (match) return match;
  }
  return null;
}

/**
 * Niyet'e göre otomatik görev oluştur (ContactActivity)
 * 
 * @param {string} workspaceId
 * @param {string} contactId
 * @param {Object} classifierResult
 * @param {string} conversationId
 */
export async function createIntentActivity(workspaceId, contactId, classifierResult, conversationId) {
  try {
    if (!classifierResult?.extractedData?.requestedAction) return null;

    const { classification, extractedData } = classifierResult;
    const action = extractedData.requestedAction;

    // CALL zaten executeSalesPhoneCallRule tarafından yönetiliyor
    if (action === 'CALL') return null;

    const activityTypeMap = {
      'VISIT': 'MEETING',
      'MEETING': 'MEETING',
    };

    const type = activityTypeMap[action];
    if (!type) return null;

    // Çakışma kontrolü: Son 24 saatte aynı tip aktivite oluşturulmuş mu
    const recentActivity = await prisma.contactActivity.findFirst({
      where: {
        contactId,
        workspaceId,
        type,
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      }
    });
    if (recentActivity) return null;

    // Conversation'dan takım/agent bilgisini al
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { assignedToId: true, assignedTeamId: true, caseId: true }
    });

    const activity = await prisma.contactActivity.create({
      data: {
        workspaceId,
        contactId,
        type,
        title: action === 'VISIT' ? 'Ziyaret Talebi (Otomatik)' : 'Görüşme Talebi (Otomatik)',
        description: `AI niyet algılama: ${classification}\nKonu: ${extractedData.topic || '-'}\nTarih: ${extractedData.requestedDate || 'Belirtilmedi'}`,
        status: 'PLANNED',
        source: 'AUTOMATION',
        assignedToId: conversation?.assignedToId || null,
        teamId: conversation?.assignedTeamId || null,
        ...(conversation?.caseId ? { caseId: conversation.caseId } : {}),
        dueDate: extractedData.requestedDate ? new Date(extractedData.requestedDate) : null,
      }
    });

    console.log(`📋 [IntentActivity] ${type} activity created for contact ${contactId}`);
    return activity;

  } catch (error) {
    console.error('❌ [IntentActivity] Error:', error.message);
    return null;
  }
}
