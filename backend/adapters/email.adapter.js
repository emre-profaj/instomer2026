/**
 * ═══════════════════════════════════════════════════════════════
 * EMAIL ADAPTER
 * ═══════════════════════════════════════════════════════════════
 * 
 * Gmail/IMAP email mesajlarını normalize eder.
 * 
 * @module emailAdapter
 */

import prisma from '../lib/prisma.js';

const getAvatarFallback = (name, size = 150) => {
  const encodedName = encodeURIComponent(name || 'User');
  return `https://ui-avatars.com/api/?name=${encodedName}&background=EA4335&color=fff&size=${size}`;
};

/**
 * Email mesajını normalize eder.
 */
export function normalizeEmailMessage(emailData, emailChannel) {
  try {
    const { fromEmail, fromName, subject, body, messageId } = emailData;

    if (!fromEmail) {
      return { normalized: null, error: 'NO_SENDER' };
    }

    const senderName = fromName || fromEmail.split('@')[0];
    let messageText = '';
    if (subject) messageText += `📧 **${subject}**\n---\n`;
    messageText += body || '';

    const normalized = {
      workspaceId: emailChannel.workspaceId,
      channelType: 'EMAIL',
      senderId: fromEmail,
      senderName,
      senderEmail: fromEmail,
      senderAvatar: getAvatarFallback(senderName),
      messageText,
      messageType: 'EMAIL',
      externalMessageId: messageId || null,
      contactSource: 'EMAIL',
      flowTrigger: 'FIRST_MSG',
      metadata: {
        subject,
        emailChannelId: emailChannel.id,
      },
      channelRef: {
        emailChannelId: emailChannel.id,
        assignedBotId: emailChannel.assignedBotId,
      },

      findContact: async (workspaceId, sid) => {
        return prisma.contact.findFirst({
          where: { workspaceId, email: fromEmail, isDeleted: false }
        });
      },

      createContactData: async (workspaceId, sid, name, avatar) => {
        return {
          workspaceId,
          name: name || senderName,
          email: fromEmail,
          avatar: avatar || getAvatarFallback(name || senderName),
          tags: '["email"]',
          status: 'NEW',
          source: 'EMAIL',
        };
      },
    };

    return { normalized, error: null };

  } catch (error) {
    console.error('[EmailAdapter] Error:', error);
    return { normalized: null, error: error.message };
  }
}
