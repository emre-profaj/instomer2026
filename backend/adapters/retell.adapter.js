/**
 * ═══════════════════════════════════════════════════════════════
 * RETELL AI ADAPTER
 * ═══════════════════════════════════════════════════════════════
 * 
 * Retell AI sesli arama webhook verilerini normalize eder.
 * Arama tamamlandığında transcript'i mesaj olarak kaydeder.
 * 
 * @module retellAdapter
 */

import prisma from '../lib/prisma.js';

const getAvatarFallback = (name, size = 150) => {
  const encodedName = encodeURIComponent(name || 'User');
  return `https://ui-avatars.com/api/?name=${encodedName}&background=8B5CF6&color=fff&size=${size}`;
};

/**
 * Retell arama verisini normalize eder.
 */
export function normalizeRetellCall(callData, workspaceId) {
  try {
    const { phoneNumber, callerName, transcript, callSummary, callId, sentiment } = callData;

    if (!phoneNumber) {
      return { normalized: null, error: 'NO_PHONE' };
    }

    const senderName = callerName || phoneNumber;

    let messageText = '📞 **Sesli Arama**\n---\n';
    if (callSummary) messageText += `📋 Özet: ${callSummary}\n`;
    if (sentiment) messageText += `🎭 Duygu: ${sentiment}\n`;
    if (transcript) messageText += `\n💬 Transkript:\n${transcript}`;

    const normalized = {
      workspaceId,
      channelType: 'RETELL',
      senderId: phoneNumber,
      senderName,
      senderPhone: phoneNumber,
      senderAvatar: getAvatarFallback(senderName),
      messageText,
      messageType: 'RETELL',
      externalMessageId: callId || null,
      contactSource: 'RETELL',
      flowTrigger: 'FIRST_MSG',
      metadata: {
        callId,
        sentiment,
        callSummary,
      },
      channelRef: {},

      findContact: async (wsId, sid) => {
        return prisma.contact.findFirst({
          where: {
            workspaceId: wsId,
            isDeleted: false,
            OR: [
              { phone: phoneNumber },
              { phone: phoneNumber.startsWith('+') ? phoneNumber.slice(1) : `+${phoneNumber}` },
            ]
          }
        });
      },

      createContactData: async (wsId, sid, name, avatar) => {
        return {
          workspaceId: wsId,
          name: name || senderName,
          phone: phoneNumber,
          avatar: avatar || getAvatarFallback(name || senderName),
          tags: '["retell","telefon"]',
          status: 'OPPORTUNITY',
          source: 'RETELL',
        };
      },
    };

    return { normalized, error: null };

  } catch (error) {
    console.error('[RetellAdapter] Error:', error);
    return { normalized: null, error: error.message };
  }
}
