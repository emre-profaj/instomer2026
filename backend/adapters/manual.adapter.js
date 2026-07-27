/**
 * ═══════════════════════════════════════════════════════════════
 * MANUEL KAYIT ADAPTER
 * ═══════════════════════════════════════════════════════════════
 * 
 * Manuel eklenen kişileri Inbox Controller'a gönderir.
 * Kişi eklendiğinde otomatik olarak:
 *   → Inbox'a düşer → Akışa atanır → Aşamaya yerleşir
 *   → Görev açılır → Temsilciye bildirim gider
 * 
 * @module manualAdapter
 */

import prisma from '../lib/prisma.js';

/**
 * Manuel kişi kaydını InboxController formatına normalize eder
 */
export function normalizeManualEntry(workspaceId, contact, options = {}) {
  const { note, createdByName } = options;

  let messageText = '➕ Manuel kayıt oluşturuldu';
  if (createdByName) {
    messageText += ` (${createdByName} tarafından)`;
  }
  if (note) {
    messageText += `\n📝 ${note}`;
  }

  return {
    workspaceId,
    channelType: 'MANUAL',
    senderId: contact.phone || contact.email || contact.id,
    senderName: contact.name || 'Yeni Kişi',
    senderPhone: contact.phone || undefined,
    senderEmail: contact.email || undefined,
    senderAvatar: contact.avatar || undefined,
    messageText,
    messageType: 'SYSTEM',
    contactSource: 'MANUAL',
    flowTrigger: 'FIRST_MSG',
    channelRef: {},
    metadata: {
      isManualEntry: true,
      createdByName,
      note,
    },
    // Kişi zaten oluşturuldu — tekrar oluşturmaya gerek yok
    findContact: async (wsId, sid) => {
      return prisma.contact.findUnique({ where: { id: contact.id } });
    },
  };
}
