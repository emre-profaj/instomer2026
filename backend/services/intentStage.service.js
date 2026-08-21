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

    // 3.5. Giriş kurallarını kontrol et (entryRules)
    if (targetStage.entryRules) {
      const rulesOk = await evaluateEntryRules(targetStage.entryRules, contactId, conversationId);
      if (!rulesOk) {
        console.log(`🧠 [IntentStage] Entry rules not met for stage "${targetStage.name}", skipping`);
        return null;
      }
    }

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

    const { changeFunnelStage } = await import('./funnelStageManager.service.js');
    const result = await changeFunnelStage(contactId, workspaceId, targetFunnelId, targetStage.id, {
      source: 'intent_stage',
      conversationId,
      skipGuards: false
    });
    if (!result.changed) return { oldStage: oldStageName, suggestedStage: targetStage.name, changed: false };

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

    // Toggle kontrolü: workspace'te bu otomasyon açık mı?
    const ruleTypeForAction = (action === 'CALL') ? 'SALES_PHONE_CALL' : 'APPOINTMENT_AUTO_PLAN';
    const rule = await prisma.workspaceRule.findUnique({
      where: { workspaceId_ruleType: { workspaceId, ruleType: ruleTypeForAction } }
    });
    if (!rule || !rule.isActive) {
      console.log(`📋 [IntentActivity] ${ruleTypeForAction} toggle kapalı veya tanımsız — ${action} görevi oluşturulmayacak`);
      return null;
    }

    const activityTypeMap = {
      'CALL': 'CALL',
      'VISIT': 'MEETING',
      'MEETING': 'MEETING',
    };

    const type = activityTypeMap[action];

    if (!type) return null;

    // Kişinin iletişim bilgisi var mı? Telefon veya e-posta olmadan görüşme planlamak anlamsız
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      select: { phone: true, email: true, name: true }
    });
    if (!contact?.phone && !contact?.email) {
      console.log(`📋 [IntentActivity] ${type} niyeti algılandı ama kişinin telefonu/e-postası yok — atlanıyor`);
      return null;
    }

    // Cross-type dedup: son 5 dk içinde bu kişi için herhangi bir PLANNED aktivite varsa atla
    const recentActivity = await prisma.contactActivity.findFirst({
      where: {
        contactId,
        workspaceId,
        status: 'PLANNED',
        createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) }
      }
    });
    if (recentActivity) {
      console.log(`📋 [IntentActivity] Son 5 dk'da zaten planlı aktivite var (${recentActivity.type}), ${type} atlanıyor`);
      return null;
    }

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
        title: action === 'CALL' ? 'Arama Planlandı (Otomatik)' : action === 'VISIT' ? 'Ziyaret Talebi (Otomatik)' : 'Görüşme Talebi (Otomatik)',
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

/**
 * Giriş kurallarını değerlendir
 * 
 * @param {string} entryRulesJson - JSON string: { matchType: 'ALL'|'ANY', rules: [...] }
 * @param {string} contactId
 * @param {string} conversationId
 * @returns {boolean} - Kurallar sağlanıyor mu?
 */
async function evaluateEntryRules(entryRulesJson, contactId, conversationId) {
  try {
    const parsed = JSON.parse(entryRulesJson);
    if (!parsed || !Array.isArray(parsed.rules) || parsed.rules.length === 0) return true;

    const matchType = parsed.matchType || 'ALL';

    // Gerekli verileri topla
    const [contact, conversation] = await Promise.all([
      prisma.contact.findUnique({
        where: { id: contactId },
        select: { 
          name: true, phone: true, email: true, source: true,
          deals: { select: { status: true }, take: 5 },
          activities: { select: { type: true, status: true, callSuccessful: true }, take: 20 },
          formSubmissions: { select: { id: true }, take: 1 },
        }
      }),
      prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { 
          channel: true,
          _count: { select: { messages: true } }
        }
      })
    ]);

    if (!contact) return false;

    const results = [];

    for (const rule of parsed.rules) {
      let passed = false;

      switch (rule.type) {
        case 'CHANNEL_IS': {
          const channels = rule.channels || [];
          if (channels.length === 0) { passed = true; break; }
          // Conversation kanalını kontrol et
          passed = channels.includes(conversation?.channel);
          // Contact source'u da kontrol et (FORM, META_LEAD gibi conversation'sız olanlar)
          if (!passed && contact.source) {
            passed = channels.includes(contact.source);
          }
          break;
        }

        case 'FIELD_EXISTS': {
          const val = contact[rule.field];
          passed = val !== null && val !== undefined && val !== '';
          break;
        }

        case 'FIELD_EQUALS': {
          const val = contact[rule.field];
          passed = val != null && String(val).toLowerCase() === String(rule.value || '').toLowerCase();
          break;
        }

        case 'TOPIC_CONTAINS': {
          const topic = (contact.topic || '').toLowerCase();
          const keywords = (rule.value || '').split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
          passed = keywords.some(kw => topic.includes(kw));
          break;
        }

        case 'DEAL_EXISTS': {
          passed = contact.deals && contact.deals.length > 0;
          break;
        }

        case 'DEAL_STATUS': {
          passed = contact.deals?.some(d => d.status === rule.value);
          break;
        }

        case 'ACTIVITY_EXISTS': {
          passed = contact.activities?.some(a => a.type === (rule.value || rule.activityType));
          break;
        }

        case 'ACTIVITY_RESULT': {
          const aType = rule.activityType || 'MEETING';
          const aResult = rule.value || 'COMPLETED';
          passed = contact.activities?.some(a => a.type === aType && a.status === aResult);
          break;
        }

        case 'HAS_APPOINTMENT': {
          passed = contact.activities?.some(a => a.type === 'MEETING' || a.type === 'VISIT');
          break;
        }

        case 'MESSAGE_COUNT_GT': {
          const threshold = parseInt(rule.value) || 0;
          passed = (conversation?._count?.messages || 0) > threshold;
          break;
        }

        default:
          passed = true; // Bilinmeyen kural tipi → geç
      }

      results.push(passed);
    }

    // Match type'a göre sonuç
    if (matchType === 'ANY') {
      return results.some(r => r === true);
    }
    return results.every(r => r === true); // ALL

  } catch (error) {
    console.error('❌ [EntryRules] Evaluation error:', error.message);
    return true; // Hata durumunda geçişe izin ver
  }
}
