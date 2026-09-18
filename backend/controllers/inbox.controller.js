/**
 * ═══════════════════════════════════════════════════════════════
 * EVRENSEL INBOX CONTROLLER
 * ═══════════════════════════════════════════════════════════════
 * 
 * Tüm kanallardan (WhatsApp, Facebook, Instagram, Web Widget,
 * Email, Form, Retell, Manuel) gelen mesajları tek bir noktadan
 * işleyen ana controller.
 * 
 * Her kanal kendi adapter'ı ile mesajı normalize eder ve bu
 * controller'a gönderir. İş mantığı burada TEK yerde çalışır.
 * 
 * Akış:
 *   Webhook → Adapter (normalize) → inboxController.processIncoming()
 *     1. Duplikasyon kontrolü
 *     2. Kişi bul/oluştur
 *     3. Engel kontrolü
 *     4. Konuşma bul/oluştur (24h cross-channel merge)
 *     5. Kanal yönlendirme
 *     6. Akış tetikle (FIRST_MSG / NEW_FORM)
 *     7. Mesajı kaydet
 *     8. Konuşma güncelle
 *     9. Follow-up sıfırla
 *    10. WebSocket bildirim
 *    11. Bot yanıtı
 *    12. AI çıkarım
 *    13. Case yönetimi
 *    14. Kurallar (telefon yakalama, sıcak anahtar kelime, arama talebi)
 * 
 * @module inboxController
 */

import prisma from '../lib/prisma.js';
import { emitToWorkspace } from '../socket.js';
import { applyChannelRouting, canBotRespond } from '../services/conversationRouting.service.js';
import { normalizePhone } from '../utils/phoneNormalizer.js';

// ── Avatar yardımcısı ──────────────────────────────────────
const getAvatarFallback = (name, size = 150) => {
  const encodedName = encodeURIComponent(name || 'User');
  return `https://ui-avatars.com/api/?name=${encodedName}&background=25D366&color=fff&size=${size}`;
};

// ═══════════════════════════════════════════════════════════════
// ANA İŞLEM FONKSİYONU
// ═══════════════════════════════════════════════════════════════

/**
 * Tüm kanallardan gelen mesajları işler.
 * 
 * @param {Object} normalizedMsg - Adapter tarafından normalize edilmiş mesaj
 * @returns {Promise<Object>} - { success, contact, conversation, message, isNewConversation, isNewContact }
 */
export async function processIncoming(normalizedMsg) {
  const {
    workspaceId,
    channelType,
    senderId,
    senderName,
    senderPhone,
    senderEmail,
    senderAvatar,
    messageText,
    messageType = 'TEXT',
    mediaUrl,
    externalMessageId,
    contactSource,
    metadata = {},
    channelRef = {},
    flowTrigger = 'FIRST_MSG',
    isFormSubmission = false,
  } = normalizedMsg;

  try {
    // ── 1. Duplikasyon kontrolü ────────────────────────────
    if (externalMessageId) {
      const existing = await prisma.message.findUnique({
        where: { facebookMessageId: externalMessageId }
      });
      if (existing) {
        return { success: false, error: 'DUPLICATE_MESSAGE' };
      }
    }

    // ── 2. Kişi bul/oluştur ───────────────────────────────
    let contact;
    let isNewContact = false;

    if (normalizedMsg.findContact) {
      contact = await normalizedMsg.findContact(workspaceId, senderId);
    } else {
      contact = await findContactDefault(workspaceId, senderId, senderPhone, senderEmail, channelType);
    }

    if (!contact) {
      isNewContact = true;
      const contactData = normalizedMsg.createContactData
        ? await normalizedMsg.createContactData(workspaceId, senderId, senderName, senderAvatar)
        : buildDefaultContactData(workspaceId, senderId, senderName, senderPhone, senderEmail, senderAvatar, contactSource || channelType);
      
      contact = await prisma.contact.create({ data: contactData });
    } else {
      contact = await syncContactInfo(contact, senderName, senderAvatar, channelType);
    }

    // ── 3. Engel kontrolü ─────────────────────────────────
    if (contact.isBlocked) {
      return { success: false, error: 'CONTACT_BLOCKED', contact };
    }

    // ── 4. Konuşma bul/oluştur ────────────────────────────
    let conversation;
    let isNewConversation = false;

    conversation = await findConversation(workspaceId, contact.id, channelType, channelRef);

    if (!conversation) {
      conversation = await find24hMergeConversation(workspaceId, contact.id);

      if (conversation) {
        conversation = await linkConversationToChannel(conversation.id, channelType, channelRef);
      } else {
        isNewConversation = true;
        conversation = await createConversation(workspaceId, contact.id, channelType, channelRef);
      }
    } else {
      if (conversation.status === 'RESOLVED') {
        conversation = await prisma.conversation.update({
          where: { id: conversation.id },
          data: { status: 'OPEN' }
        });
      }
    }

    // ── 5. Kanal yönlendirme ──────────────────────────────
    const channelForRouting = mapChannelForRouting(channelType);
    await applyChannelRouting(workspaceId, conversation.id, channelForRouting, isNewConversation, null, { messageText });

    // Konuşmayı yeniden oku
    conversation = await prisma.conversation.findUnique({ where: { id: conversation.id } });

    // ── 6. Akış tetikle (sadece yeni konuşmalarda) ────────
    if (isNewConversation) {
      try {
        const flowModule = await import('./flow.controller.js');
        const executeFlows = flowModule.executeFlowsByTrigger || flowModule.default?.executeFlowsByTrigger;
        if (executeFlows) {
          await executeFlows(workspaceId, flowTrigger, {
            contact,
            conversation,
            message: { content: messageText }
          });
        }
      } catch (flowErr) {
        console.error('[InboxController] Flow trigger error:', flowErr.message);
      }
    }

    // ── 7. Mesajı kaydet ──────────────────────────────────
    const savedMessage = await prisma.message.create({
      data: {
        content: messageText || '',
        conversationId: conversation.id,
        isFromContact: true,
        messageType: mapMessageType(channelType, messageType),
        facebookMessageId: externalMessageId || undefined,
        mediaUrl: mediaUrl || undefined,
      }
    });

    // ── 8. Konuşma güncelle ───────────────────────────────
    const convUpdateData = {
      lastMessageAt: new Date(),
      lastContactMessageAt: new Date(),
      unreadCount: { increment: 1 }
    };
    // Bulk gönderimden gelen sohbetleri müşteri cevap verince aktifleştir
    if (conversation.isBulkSend) {
      convUpdateData.isBulkSend = false;
    }
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: convUpdateData
    });

    // ── 9. Follow-up sıfırla ──────────────────────────────
    try {
      const followUpModule = await import('../services/followUp.service.js');
      const resetFlags = followUpModule.resetFollowUpFlags || followUpModule.default?.resetFollowUpFlags;
      if (resetFlags) await resetFlags(conversation.id);
    } catch (e) { /* opsiyonel */ }

    // ── 9b. Kampanya cevap sayısını artır ────────────────
    if (conversation.campaignId) {
      try {
        await prisma.marketingCampaign.update({
          where: { id: conversation.campaignId },
          data: { repliedCount: { increment: 1 } }
        });
      } catch (_) {}
    }

    // ── 10. WebSocket bildirim ─────────────────────────────
    emitToWorkspace(workspaceId, 'new_message', {
      workspaceId,
      conversationId: conversation.id,
      message: savedMessage,
      contact,
      channel: channelType,
      assignedToId: conversation.assignedToId || null,
      assignedTeamId: conversation.assignedTeamId || null
    });

    // ── 11-14. Arka plan işlemleri (async, beklemeden) ─────
    processPostSave(workspaceId, conversation, contact, messageText, channelType, normalizedMsg)
      .catch(err => console.error('[InboxController] Post-save error:', err.message));

    return {
      success: true,
      contact,
      conversation,
      message: savedMessage,
      isNewConversation,
      isNewContact,
    };

  } catch (error) {
    console.error('[InboxController] processIncoming error:', error);
    return { success: false, error: error.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// ARKA PLAN İŞLEMLERİ (Mesaj kaydedildikten sonra)
// ═══════════════════════════════════════════════════════════════

async function processPostSave(workspaceId, conversation, contact, messageText, channelType, normalizedMsg) {
  // ── 11. Bot yanıtı ────────────────────────────────────────
  try {
    const botCanRespond = await canBotRespond(conversation.id);
    if (botCanRespond && messageText && messageText.trim()) {
      const classifierModule = await import('../utils/messageClassifier.js');
      const isEmojiOrIconOnly = classifierModule.isEmojiOrIconOnly || classifierModule.default?.isEmojiOrIconOnly;
      
      if (isEmojiOrIconOnly && !isEmojiOrIconOnly(messageText)) {
        let botId = conversation.assignedBotId;
        
        // Madde 5: Takım bazlı bot çözümleme — assignedBotId yoksa takımdan bul
        if (!botId) {
          try {
            const { resolveTeamBot } = await import('../services/conversationRouting.service.js');
            const teamResult = await resolveTeamBot(workspaceId, conversation.id);
            if (teamResult?.botId) {
              botId = teamResult.botId;
              console.log(`🤖 [InboxController] Team bot resolved: ${botId} (source: ${teamResult.source})`);
            }
          } catch (e) { /* opsiyonel */ }
        }
        
        const bot = botId ? await prisma.aIBot.findFirst({
          where: { id: botId, isActive: true }
        }) : null;

        if (bot) {
          const delayModule = await import('../services/autoReplyDelay.service.js');
          const scheduleAutoReplyCheck = delayModule.scheduleAutoReplyCheck || delayModule.default?.scheduleAutoReplyCheck;
          const scheduleMessageBatch = delayModule.scheduleMessageBatch || delayModule.default?.scheduleMessageBatch;
          
          if (bot.autoReplyDelayEnabled && scheduleAutoReplyCheck) {
            scheduleAutoReplyCheck(conversation.id, workspaceId, channelType.toLowerCase(), messageText);
          } else if (scheduleMessageBatch) {
            scheduleMessageBatch(conversation.id, workspaceId, channelType.toLowerCase(), messageText, {
              contact,
              ...(normalizedMsg.metadata || {})
            });
          }
        }
      }
    }
  } catch (botErr) {
    console.error('[InboxController] Bot response error:', botErr.message);
  }

  // ── 12. AI çıkarım ───────────────────────────────────────
  try {
    const aiModule = await import('./ai.controller.js');
    const aiCtrl = aiModule.default || aiModule;
    if (aiCtrl.autoExtractFromConversation) {
      aiCtrl.autoExtractFromConversation(workspaceId, conversation.id);
    }
    if (aiCtrl.autoGenerateTopic && messageText) {
      aiCtrl.autoGenerateTopic(workspaceId, conversation.id, messageText);
    }
  } catch (e) { /* opsiyonel */ }

  // ── 13. Case yönetimi ─────────────────────────────────────
  try {
    const caseModule = await import('./case.controller.js');
    const ensureCase = caseModule.ensureCaseForConversation || caseModule.default?.ensureCaseForConversation;
    if (ensureCase) {
      await ensureCase(workspaceId, conversation.id, { reopenIfClosed: true });
    }
  } catch (e) { /* opsiyonel */ }

  // ── 14. Kurallar ──────────────────────────────────────────
  if (messageText && messageText.trim()) {
    try {
      const rulesModule = await import('./rules.controller.js');
      const rules = rulesModule.default || rulesModule;
      
      // Telefon yakalama (await — sıralı)
      if (rules.executePhoneCaptureRule) {
        await rules.executePhoneCaptureRule(workspaceId, conversation.id, messageText);
      }
      
      // Sıcak anahtar kelime (async — paralel)
      if (rules.executeHotKeywordRule) {
        rules.executeHotKeywordRule(workspaceId, conversation.id, messageText).catch(() => {});
      }
      
      // Satış arama talebi (async — paralel)
      if (rules.executeSalesPhoneCallRule) {
        rules.executeSalesPhoneCallRule(workspaceId, conversation.id, messageText).catch(() => {});
      }
    } catch (rulesErr) {
      console.error('[InboxController] Rules error:', rulesErr.message);
    }
  }

  // ── 15. Attribution (kaynak takibi) ─────────────────────────
  try {
    const { saveAttribution } = await import('../services/attribution.service.js');
    if (normalizedMsg.metadata) {
      const meta = normalizedMsg.metadata;
      
      // WhatsApp referral
      if (meta.referral && channelType === 'WHATSAPP') {
        const { saveWhatsAppAttribution } = await import('../services/attribution.service.js');
        await saveWhatsAppAttribution(contact.id, workspaceId, meta.referral);
      }
      
      // Facebook/Instagram referral
      if (meta.referral && (channelType === 'FACEBOOK' || channelType === 'INSTAGRAM')) {
        const { saveFacebookAttribution } = await import('../services/attribution.service.js');
        await saveFacebookAttribution(contact.id, workspaceId, meta.referral, channelType === 'INSTAGRAM');
      }
      
      // Form submission
      if (normalizedMsg.isFormSubmission && meta.rawFields) {
        const { saveFormAttribution } = await import('../services/attribution.service.js');
        await saveFormAttribution(contact.id, workspaceId, meta.rawFields, {
          id: meta.formId,
          name: meta.formName,
        });
      }
    }
  } catch (attrErr) {
    console.error('[InboxController] Attribution error:', attrErr.message);
  }

  // ── 16. Niyet → Aşama geçişi ──────────────────────────────
  // ⚠️ KALDIRILDI: classifyAndExtract burada çağrılıyordu ama classifiedAt kaydetmiyordu.
  // ai.controller.js getAutoReply() içinde tek seferde çalışıyor (30dk cooldown + classifiedAt kaydı).
  // Çift Gemini çağrısı → %50+ gereksiz AI maliyetine neden oluyordu.

  // ── 17. Lead Puanlama (Madde 3) ──────────────────────────
  try {
    const { updateLeadScore } = await import('../services/leadScoring.service.js');
    // Non-blocking — arka planda güncelle
    updateLeadScore(contact.id).catch(() => {});
  } catch (scoreErr) {
    // leadScore alanı henüz yoksa bile çökmesin
  }

  // ── 18. Auto Case Opening (Madde 2) ──────────────────────
  try {
    const { autoOpenCaseIfNeeded } = await import('../services/caseAutoOpen.service.js');
    await autoOpenCaseIfNeeded(workspaceId, contact.id, conversation.id, { reopenIfClosed: true });
  } catch (caseErr) {
    console.error('[InboxController] Auto case error:', caseErr.message);
  }
}

/**
 * Mevcut kanal controller'larından çağrılacak hafif wrapper.
 * Parametreler: workspaceId, conversationId, contactId, messageText, channelType
 * 
 * Bu fonksiyon mevcut controller mantığını DEĞİŞTİRMEZ — 
 * sadece Madde 1-5 pipeline adımlarını (niyet→aşama, lead puanlama, auto case, takım bot) tetikler.
 * 
 * Kullanım (WhatsApp/Facebook/Form controller'larda):
 *   import { runChannelPostProcessing } from './inbox.controller.js';
 *   runChannelPostProcessing(workspaceId, conversationId, contactId, messageText, 'WHATSAPP').catch(() => {});
 */
export async function runChannelPostProcessing(workspaceId, conversationId, contactId, messageText, channelType) {
  try {
    // Otomatik arşivden çıkar — yeni mesaj geldi
    try {
        const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
        if (conversation?.isArchived) {
            await prisma.conversation.update({
                where: { id: conversationId },
                data: { isArchived: false, archivedAt: null, archivedById: null }
            });
            console.log(`📤 [Auto-Unarchive] Yeni mesaj geldi, arşivden çıkarıldı: ${conversationId}`);
        }
    } catch (unarchiveErr) {
        console.error('Auto-unarchive error:', unarchiveErr);
    }

    // ── 1. Niyet → Aşama geçişi ──────────────────────────────
    // ⚠️ KALDIRILDI: classifyAndExtract burada çağrılıyordu ama classifiedAt kaydetmiyordu.
    // ai.controller.js getAutoReply() içinde tek seferde çalışıyor (30dk cooldown + classifiedAt kaydı).
    // Çift Gemini çağrısı → %50+ gereksiz AI maliyetine neden oluyordu.

    // ── 2. Lead Puanlama (Madde 3) ──────────────────────────
    try {
      const { updateLeadScore } = await import('../services/leadScoring.service.js');
      updateLeadScore(contactId).catch(() => {});
    } catch (e) { /* opsiyonel */ }

    // ── 3. Auto Case Opening (Madde 2) ──────────────────────
    try {
      const { autoOpenCaseIfNeeded } = await import('../services/caseAutoOpen.service.js');
      await autoOpenCaseIfNeeded(workspaceId, contactId, conversationId, { reopenIfClosed: true });
    } catch (e) { /* opsiyonel */ }

    // ── 4. Takım Bot Çözümleme (Madde 5) ────────────────────
    try {
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { assignedBotId: true }
      });
      if (conversation && !conversation.assignedBotId) {
        const { resolveTeamBot } = await import('../services/conversationRouting.service.js');
        const teamResult = await resolveTeamBot(workspaceId, conversationId);
        if (teamResult?.botId) {
          await prisma.conversation.update({
            where: { id: conversationId },
            data: { assignedBotId: teamResult.botId }
          });
          console.log(`🤖 [PostProcess] Team bot assigned: ${teamResult.botId}`);
        }
      }
    } catch (e) { /* opsiyonel */ }

    // ── 5. Konuşma İçeriğinden Kategori Algılama & Senkronizasyon ────────────
    try {
        const { matchCategoryFromConversation } = await import('../services/categoryMatcher.service.js');
        await matchCategoryFromConversation(workspaceId, conversationId);
    } catch (e) { /* opsiyonel */ }

  } catch (err) {
    console.error('[PostProcess] Pipeline error:', err.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// YARDIMCI FONKSİYONLAR
// ═══════════════════════════════════════════════════════════════

/**
 * Varsayılan kişi bulma — telefon, email veya platform ID ile
 */
export async function findContactDefault(workspaceId, senderId, phone, email, channelType) {
  const conditions = [];

  if (channelType === 'FACEBOOK' || channelType === 'INSTAGRAM') {
    conditions.push({ facebookId: senderId });
  }
  if (channelType === 'WHATSAPP' && phone) {
    const normalized = normalizePhone(phone);
    conditions.push(
      { phone: phone },
      { phone: normalized },
      { whatsappId: phone },
      { whatsappId: normalized }
    );
  }
  if (email) {
    conditions.push({ email: email });
  }
  if (phone && channelType !== 'WHATSAPP') {
    conditions.push({ phone: phone });
  }

  if (conditions.length === 0) return null;

  return prisma.contact.findFirst({
    where: {
      workspaceId,
      isDeleted: false,
      OR: conditions,
    }
  });
}

/**
 * Varsayılan kişi oluşturma verisi
 */
export function buildDefaultContactData(workspaceId, senderId, name, phone, email, avatar, source) {
  const data = {
    workspaceId,
    name: name || senderId,
    avatar: avatar || getAvatarFallback(name || senderId),
    status: 'OPPORTUNITY',
    source: source || 'MANUAL',
    tags: JSON.stringify([source?.toLowerCase() || 'manual']),
  };

  if (phone) data.phone = phone;
  if (email) data.email = email;
  
  if (source === 'WHATSAPP') data.whatsappId = senderId;
  if (source === 'FACEBOOK' || source === 'INSTAGRAM') data.facebookId = senderId;

  return data;
}

/**
 * Mevcut kişi bilgilerini senkronize et
 */
export async function syncContactInfo(contact, newName, newAvatar, channelType) {
  const updates = {};
  
  if (newName && contact.name && /^[\d+\s]+$/.test(contact.name)) {
    updates.name = newName;
  }
  
  if (newAvatar && !contact.avatar) {
    updates.avatar = newAvatar;
  }

  if (contact.status === 'NEW') {
    updates.status = 'OPPORTUNITY';
  }

  if (Object.keys(updates).length > 0) {
    return prisma.contact.update({
      where: { id: contact.id },
      data: updates,
    });
  }

  return contact;
}

/**
 * Konuşma bul — kanalın kendi referansı ile
 */
export async function findConversation(workspaceId, contactId, channelType, channelRef) {
  const where = {
    contactId,
    workspaceId,
    status: { not: 'RESOLVED' },
  };

  if (channelRef.whatsappPhoneNumberId) where.whatsappPhoneNumberId = channelRef.whatsappPhoneNumberId;
  if (channelRef.facebookPageId) where.facebookPageId = channelRef.facebookPageId;
  if (channelRef.instagramBusinessId) where.instagramBusinessId = channelRef.instagramBusinessId;

  return prisma.conversation.findFirst({
    where,
    orderBy: { lastMessageAt: 'desc' },
  });
}

/**
 * 24 saat içinde cross-channel aktif konuşma ara
 */
export async function find24hMergeConversation(workspaceId, contactId) {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

  return prisma.conversation.findFirst({
    where: {
      contactId,
      workspaceId,
      status: { not: 'RESOLVED' },
      lastMessageAt: { gte: cutoff },
    },
    orderBy: { lastMessageAt: 'desc' },
  });
}

/**
 * Mevcut konuşmayı yeni kanala bağla
 */
export async function linkConversationToChannel(conversationId, channelType, channelRef) {
  const data = { channel: channelType };

  if (channelRef.whatsappPhoneNumberId) data.whatsappPhoneNumberId = channelRef.whatsappPhoneNumberId;
  if (channelRef.facebookPageId) data.facebookPageId = channelRef.facebookPageId;
  if (channelRef.instagramBusinessId) data.instagramBusinessId = channelRef.instagramBusinessId;

  return prisma.conversation.update({
    where: { id: conversationId },
    data,
  });
}

/**
 * Yeni konuşma oluştur
 */
export async function createConversation(workspaceId, contactId, channelType, channelRef) {
  const data = {
    workspaceId,
    contactId,
    channel: channelType,
    status: 'OPEN',
    lastMessageAt: new Date(),
    botEnabled: true,
  };

  if (channelRef.assignedBotId) data.assignedBotId = channelRef.assignedBotId;
  if (channelRef.whatsappPhoneNumberId) data.whatsappPhoneNumberId = channelRef.whatsappPhoneNumberId;
  if (channelRef.facebookPageId) data.facebookPageId = channelRef.facebookPageId;
  if (channelRef.instagramBusinessId) data.instagramBusinessId = channelRef.instagramBusinessId;
  if (channelRef.emailChannelId) data.emailChannelId = channelRef.emailChannelId;
  if (channelRef.webWidgetId) data.webWidgetId = channelRef.webWidgetId;

  return prisma.conversation.create({ data });
}

/**
 * Kanal tipini routing servisi için eşleştir
 */
export function mapChannelForRouting(channelType) {
  const map = {
    'WHATSAPP': 'WHATSAPP',
    'FACEBOOK': 'FACEBOOK',
    'INSTAGRAM': 'INSTAGRAM',
    'WEB_WIDGET': 'WEB_WIDGET',
    'EMAIL': 'EMAIL',
    'FORM': 'FORM',
    'RETELL': 'WHATSAPP',
    'MANUAL': 'FORM',
  };
  return map[channelType] || channelType;
}

/**
 * Mesaj tipini veritabanı formatına eşleştir
 */
export function mapMessageType(channelType, messageType) {
  if (messageType && messageType !== 'TEXT') return messageType;

  const map = {
    'WHATSAPP': 'WHATSAPP',
    'FACEBOOK': 'TEXT',
    'INSTAGRAM': 'INSTAGRAM',
    'WEB_WIDGET': 'WIDGET',
    'EMAIL': 'EMAIL',
    'FORM': 'FORM',
    'RETELL': 'RETELL',
    'MANUAL': 'TEXT',
  };
  return map[channelType] || 'TEXT';
}
