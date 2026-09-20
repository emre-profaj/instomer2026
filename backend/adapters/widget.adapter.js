/**
 * ═══════════════════════════════════════════════════════════════
 * WEB WIDGET ADAPTER
 * ═══════════════════════════════════════════════════════════════
 * 
 * Web sitesindeki canlı sohbet widget'ından gelen mesajları
 * normalize eder. Widget'a özel: visitorId ile kişi tanıma,
 * pre-chat form bilgisi, sync HTTP yanıt.
 * 
 * @module widgetAdapter
 */

import prisma from '../lib/prisma.js';
import { ziyaretciKisiBul, ziyaretciAlanlari } from '../utils/widgetVisitor.js';

const getAvatarFallback = (name, size = 150) => {
  const encodedName = encodeURIComponent(name || 'User');
  return `https://ui-avatars.com/api/?name=${encodedName}&background=7C3AED&color=fff&size=${size}`;
};

/**
 * Web widget mesajını normalize eder.
 * 
 * @param {Object} reqBody - Widget HTTP request body
 * @param {Object} widget - WebWidget kayıt objesi (DB'den)
 * @returns {{ normalized: Object|null, error: string|null }}
 */
export function normalizeWidgetMessage(reqBody, widget) {
  try {
    const { visitorId, message, name, email, phone } = reqBody;

    if (!message || !visitorId) {
      return { normalized: null, error: 'NO_MESSAGE' };
    }

    const senderName = name || 'Web Ziyaretçisi';

    const normalized = {
      workspaceId: widget.workspaceId,
      channelType: 'WEB_WIDGET',
      senderId: visitorId,
      senderName,
      senderPhone: phone || undefined,
      senderEmail: email || undefined,
      senderAvatar: getAvatarFallback(senderName),
      messageText: message,
      messageType: 'TEXT',
      externalMessageId: null, // Widget mesajlarının external ID'si yok
      contactSource: 'WEB_WIDGET',
      flowTrigger: 'FIRST_MSG',
      metadata: {
        visitorId,
        widgetId: widget.id,
        preChatName: name,
        preChatEmail: email,
        preChatPhone: phone,
      },
      channelRef: {
        webWidgetId: widget.id,
        assignedBotId: widget.assignedBotId,
      },

      // Kişi bulma: ziyaretçi kimliği, sonra email/phone
      findContact: async (workspaceId, sid) => {
        // Kimlik artık indeksli kolonda; eski kayıtlar için tags yoluna düşülür
        let contact = await ziyaretciKisiBul({ workspaceId, isDeleted: false }, visitorId);
        if (contact) return contact;

        // Email ile ara
        if (email) {
          contact = await prisma.contact.findFirst({
            where: { workspaceId, email, isDeleted: false }
          });
          if (contact) return contact;
        }

        // Telefon ile ara
        if (phone) {
          contact = await prisma.contact.findFirst({
            where: { workspaceId, phone, isDeleted: false }
          });
          if (contact) return contact;
        }

        return null;
      },

      // Kişi oluşturma
      createContactData: async (workspaceId, sid, cName, avatar) => {
        const ziyaretci = await ziyaretciAlanlari(visitorId);
        return {
          workspaceId,
          name: cName || senderName,
          email: email || undefined,
          phone: phone || undefined,
          avatar: avatar || getAvatarFallback(cName || senderName),
          // Ziyaretçi kimliği artık etikete değil kendi kolonuna yazılıyor.
          // Kolon henüz açılmadıysa ziyaretci boş gelir ve eski davranışa düşülür.
          ...ziyaretci,
          tags: JSON.stringify(ziyaretci.widgetVisitorId ? ['web_widget'] : ['web_widget', visitorId]),
          status: 'OPPORTUNITY',
          source: 'WEB_WIDGET',
        };
      },
    };

    return { normalized, error: null };

  } catch (error) {
    console.error('[WidgetAdapter] Error:', error);
    return { normalized: null, error: error.message };
  }
}
