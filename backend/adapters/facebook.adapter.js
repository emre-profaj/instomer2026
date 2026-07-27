/**
 * ═══════════════════════════════════════════════════════════════
 * FACEBOOK & INSTAGRAM ADAPTER
 * ═══════════════════════════════════════════════════════════════
 * 
 * Facebook Messenger ve Instagram DM webhook payload'larını
 * normalize eder. Comment'ler hariç — sadece DM.
 * 
 * Sorumluluklar:
 *   ✅ Webhook payload parse (FB Messenger + IG DM)
 *   ✅ Echo detection (is_echo flag veya sender === page)
 *   ✅ Meta Graph API ile profil bilgisi çekme
 *   ✅ Reklam/organik etiketleme
 *   ✅ Kişi bulma (facebookId ile)
 * 
 * @module facebookAdapter
 */

import prisma from '../lib/prisma.js';
import axios from 'axios';

const GRAPH_API_VERSION = process.env.FACEBOOK_GRAPH_API_VERSION || 'v18.0';

// ── Avatar yardımcısı ──────────────────────────────────────
const getAvatarFallback = (name, size = 150) => {
  const encodedName = encodeURIComponent(name || 'User');
  return `https://ui-avatars.com/api/?name=${encodedName}&background=1877F2&color=fff&size=${size}`;
};

// ── Mesaj kilit sistemi ────────────────────────────────────
const processingMessages = new Set();
const LOCK_TIMEOUT = 30000;

function acquireMessageLock(lockKey) {
  if (processingMessages.has(lockKey)) return false;
  processingMessages.add(lockKey);
  setTimeout(() => processingMessages.delete(lockKey), LOCK_TIMEOUT);
  return true;
}

/**
 * Facebook/Instagram DM mesajını normalize eder.
 * 
 * @param {Object} messagingEvent - Tek bir messaging event
 * @param {Object} page - Eşleşen FacebookPage kaydı
 * @param {boolean} isInstagram - Instagram mı?
 * @param {string} entryId - Webhook entry ID
 * @returns {Promise<{ normalized: Object|null, error: string|null }>}
 */
export async function normalizeFacebookMessage(messagingEvent, page, isInstagram, entryId) {
  try {
    const message = messagingEvent.message;
    const senderId = messagingEvent.sender?.id;

    if (!message || !senderId) {
      return { normalized: null, error: 'NO_MESSAGE' };
    }

    // ── Echo kontrolü ──────────────────────────────────────
    const isEcho = message.is_echo;
    const isOutgoing = isInstagram ? (senderId === entryId) : isEcho;

    if (isOutgoing) {
      return { normalized: null, error: 'ECHO' };
    }

    // ── Mesaj kilit kontrolü ───────────────────────────────
    const lockKey = message.mid || `${senderId}_${Date.now()}`;
    if (!acquireMessageLock(lockKey)) {
      return { normalized: null, error: 'LOCKED' };
    }

    // ── Mesaj içeriği ──────────────────────────────────────
    let messageText = message.text || '';
    let messageType = 'TEXT';
    let mediaUrl = null;

    // Attachment (resim, video, vb.)
    if (message.attachments?.length > 0) {
      const attachment = message.attachments[0];
      mediaUrl = attachment.payload?.url || null;
      messageType = (attachment.type || 'file').toUpperCase();
      if (!messageText) {
        messageText = `📎 ${
          attachment.type === 'image' ? 'Fotoğraf' :
          attachment.type === 'video' ? 'Video' :
          attachment.type === 'audio' ? 'Ses' : 'Dosya'
        }`;
      }
    }

    // ── Profil bilgisi çek (Meta Graph API) ────────────────
    const contactFacebookId = senderId;
    let senderName = null;
    let senderAvatar = null;

    try {
      if (isInstagram) {
        const response = await axios.get(
          `https://graph.facebook.com/${GRAPH_API_VERSION}/${contactFacebookId}`,
          {
            params: { fields: 'username,name,profile_pic', access_token: page.accessToken },
            timeout: 5000,
          }
        );
        senderName = response.data?.name || response.data?.username || senderId;
        senderAvatar = response.data?.profile_pic || null;
      } else {
        const response = await axios.get(
          `https://graph.facebook.com/${GRAPH_API_VERSION}/${contactFacebookId}`,
          {
            params: { fields: 'name,first_name,last_name', access_token: page.accessToken },
            timeout: 5000,
          }
        );
        senderName = response.data?.name || `${response.data?.first_name || ''} ${response.data?.last_name || ''}`.trim() || senderId;
        
        // Avatar
        try {
          const picResponse = await axios.get(
            `https://graph.facebook.com/${GRAPH_API_VERSION}/${contactFacebookId}/picture`,
            {
              params: { type: 'large', redirect: 'false', access_token: page.accessToken },
              timeout: 5000,
            }
          );
          senderAvatar = picResponse.data?.data?.url || null;
        } catch { /* avatar opsiyonel */ }
      }
    } catch (profileErr) {
      console.warn(`[FBAdapter] Profile fetch failed for ${contactFacebookId}:`, profileErr.message);
      senderName = senderId;
    }

    // ── Reklam bilgisi ─────────────────────────────────────
    const referral = messagingEvent.referral || null;

    // ── Kanal tipi ve referanslar ───────────────────────────
    const channelType = isInstagram ? 'INSTAGRAM' : 'FACEBOOK';
    const channelRef = isInstagram
      ? { instagramBusinessId: page.instagramBusinessId, assignedBotId: page.instagramBotId || page.assignedBotId }
      : { facebookPageId: page.id, assignedBotId: page.assignedBotId };

    // ── Normalize edilmiş mesaj ─────────────────────────────
    const normalized = {
      workspaceId: page.workspaceId,
      channelType,
      senderId: contactFacebookId,
      senderName: senderName || senderId,
      senderAvatar: senderAvatar || getAvatarFallback(senderName || senderId),
      messageText,
      messageType,
      mediaUrl,
      externalMessageId: message.mid,
      contactSource: channelType,
      flowTrigger: 'FIRST_MSG',
      metadata: {
        referral,
        pageId: page.pageId,
        pageName: page.pageName,
      },
      channelRef,

      // ── Kanala özel kişi bulma (facebookId ile) ──────────
      findContact: async (workspaceId, sid) => {
        return prisma.contact.findFirst({
          where: {
            workspaceId,
            facebookId: contactFacebookId,
            isDeleted: false,
          }
        });
      },

      // ── Kanala özel kişi oluşturma verisi ────────────────
      createContactData: async (workspaceId, sid, name, avatar) => {
        return {
          workspaceId,
          name: name || senderId,
          facebookId: contactFacebookId,
          instagramUsername: isInstagram ? senderName : undefined,
          avatar: avatar || senderAvatar || getAvatarFallback(name || senderId),
          tags: `["${channelType.toLowerCase()}"]`,
          status: 'OPPORTUNITY',
          source: channelType,
        };
      },
    };

    return { normalized, error: null };

  } catch (error) {
    console.error('[FBAdapter] Error:', error);
    return { normalized: null, error: error.message };
  }
}

/**
 * Facebook/Instagram kişisine reklam/organik etiketi ekle
 */
export async function tagContactSource(contact, referral, isInstagram) {
  try {
    const rawTags = contact.tags || '[]';
    let tags = [];
    try { tags = JSON.parse(rawTags); } catch { tags = []; }

    if (referral && (referral.source === 'ADS' || referral.ad_id || referral.source_type === 'ad')) {
      const platform = isInstagram ? 'Instagram' : 'Facebook';
      const adTitle = referral.headline || referral.body || null;
      const adTag = adTitle ? `${platform} Reklam: ${adTitle.substring(0, 30)}` : `${platform} Reklam`;
      if (!tags.includes(adTag)) {
        tags.push(adTag);
        await prisma.contact.update({ where: { id: contact.id }, data: { tags: JSON.stringify(tags) } });
      }
    } else {
      if (!tags.includes('Organik')) {
        tags.push('Organik');
        await prisma.contact.update({ where: { id: contact.id }, data: { tags: JSON.stringify(tags) } });
      }
    }
  } catch (e) {
    console.error('[FBAdapter] Tag error:', e.message);
  }
}
