/**
 * ═══════════════════════════════════════════════════════════════
 * WHATSAPP ADAPTER
 * ═══════════════════════════════════════════════════════════════
 * 
 * WhatsApp Cloud API webhook payload'ını normalize eder.
 * Media indirme ve reklam etiketleme gibi kanala özel
 * işlemleri burada yapar, sonra InboxController'a gönderir.
 * 
 * Sorumluluklar:
 *   ✅ Webhook payload parse
 *   ✅ Echo detection (kendi gönderdiğimiz mesaj mı?)
 *   ✅ Message lock (aynı mesaj birden fazla gelmesin)
 *   ✅ Media indirme (2-step: mediaId → URL → dosya)
 *   ✅ Reklam/organik etiketleme
 *   ✅ Kişi bulma (Türk telefon varyantları ile)
 * 
 *   ❌ Kişi oluşturma → InboxController
 *   ❌ Konuşma oluşturma → InboxController
 *   ❌ Bot yanıtı → InboxController
 *   ❌ Kurallar/akışlar → InboxController
 * 
 * @module whatsappAdapter
 */

import prisma from '../lib/prisma.js';
import { normalizePhone } from '../utils/phoneNormalizer.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MEDIA_DIR = path.join(__dirname, '..', 'uploads', 'media');

// ── Avatar yardımcısı ──────────────────────────────────────
const getAvatarFallback = (name, size = 150) => {
  const encodedName = encodeURIComponent(name || 'User');
  return `https://ui-avatars.com/api/?name=${encodedName}&background=25D366&color=fff&size=${size}`;
};

// ── Mesaj kilit sistemi ────────────────────────────────────
const processingMessages = new Set();
const LOCK_TIMEOUT = 30000;

function acquireMessageLock(messageId) {
  if (processingMessages.has(messageId)) return false;
  processingMessages.add(messageId);
  setTimeout(() => processingMessages.delete(messageId), LOCK_TIMEOUT);
  return true;
}

function releaseMessageLock(messageId) {
  processingMessages.delete(messageId);
}

/**
 * WhatsApp webhook payload'ını normalize eder.
 * 
 * @param {Object} webhookBody - Meta webhook req.body
 * @returns {Promise<{ normalized: Object|null, waNumber: Object|null, error: string|null, httpStatus: number }>}
 */
export async function normalizeWhatsAppMessage(webhookBody) {
  try {
    const entry = webhookBody?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    // Status update kontrolü (mesaj değil, durum güncellemesi)
    if (value?.statuses) {
      return { normalized: null, waNumber: null, error: 'STATUS_UPDATE', httpStatus: 200 };
    }

    if (!value?.messages?.[0]) {
      return { normalized: null, waNumber: null, error: 'NO_MESSAGE', httpStatus: 200 };
    }

    const message = value.messages[0];
    const contactInfo = value.contacts?.[0];
    const phone_number_id = value.metadata.phone_number_id;
    const display_phone_number = value.metadata.display_phone_number;
    const from = message.from;
    const wamid = message.id;

    // ── Mesaj kilit kontrolü ───────────────────────────────
    if (!acquireMessageLock(wamid)) {
      return { normalized: null, waNumber: null, error: 'LOCKED', httpStatus: 200 };
    }

    // ── Echo kontrolü ──────────────────────────────────────
    const cleanPhone = (num) => num ? num.replace(/\D/g, '') : '';
    const sanitizedDisplay = cleanPhone(display_phone_number);
    const sanitizedFrom = cleanPhone(from);

    if (sanitizedDisplay === sanitizedFrom && sanitizedDisplay !== '') {
      releaseMessageLock(wamid);
      return { normalized: null, waNumber: null, error: 'ECHO', httpStatus: 200 };
    }

    // ── WhatsApp numara kaydını bul ────────────────────────
    const waNumber = await prisma.whatsappPhoneNumber.findUnique({
      where: { phoneNumberId: phone_number_id }
    });

    if (!waNumber) {
      releaseMessageLock(wamid);
      return { normalized: null, waNumber: null, error: 'UNKNOWN_PHONE_NUMBER', httpStatus: 200 };
    }

    // ── Profil adı ─────────────────────────────────────────
    const waProfileName = contactInfo?.profile?.name;
    const senderName = waProfileName || from;

    // ── Mesaj içeriği çıkar ────────────────────────────────
    let messageText = '';
    let mediaUrl = null;
    let messageType = 'TEXT';

    if (message.type === 'text') {
      messageText = message.text?.body || '';
    } else if (['image', 'video', 'audio', 'document', 'sticker'].includes(message.type)) {
      messageType = message.type.toUpperCase();
      const mediaObj = message[message.type];
      messageText = mediaObj?.caption || `📎 ${
        message.type === 'image' ? 'Fotoğraf' :
        message.type === 'video' ? 'Video' :
        message.type === 'audio' ? 'Ses' :
        message.type === 'document' ? 'Dosya' : 'Sticker'
      }`;

      // Media indirme (2-step)
      if (mediaObj?.id) {
        mediaUrl = await downloadWhatsAppMedia(mediaObj.id, wamid, waNumber.accessToken);
      }
    } else {
      messageText = `[${message.type} message]`;
    }

    // ── Reklam/organik bilgisi ─────────────────────────────
    const referral = message.referral || null;
    const metadata = {
      referral,
      waProfileName,
      phone_number_id,
      display_phone_number,
    };

    // ── Normalize edilmiş mesaj ─────────────────────────────
    const normalizedFrom = normalizePhone(from);

    const normalized = {
      workspaceId: waNumber.workspaceId,
      channelType: 'WHATSAPP',
      senderId: from,
      senderName,
      senderPhone: normalizedFrom,
      senderAvatar: null, // WhatsApp profil resmi API ile alınamıyor
      messageText,
      messageType,
      mediaUrl,
      externalMessageId: wamid,
      contactSource: 'WHATSAPP',
      flowTrigger: 'FIRST_MSG',
      metadata,
      channelRef: {
        whatsappPhoneNumberId: waNumber.id,
        assignedBotId: waNumber.assignedBotId,
      },

      // ── Kanala özel kişi bulma (Türk telefon varyantları) ─
      findContact: async (workspaceId, senderId) => {
        const phoneVariants = [...new Set([from, normalizedFrom])];
        // Türk telefon varyantları
        if (from.startsWith('90') && from.length === 12) {
          phoneVariants.push('+' + from, '0' + from.slice(2));
        }
        if (normalizedFrom.startsWith('+90')) {
          phoneVariants.push(normalizedFrom.slice(1), '0' + normalizedFrom.slice(3));
        }

        return prisma.contact.findFirst({
          where: {
            workspaceId,
            isDeleted: false,
            OR: phoneVariants.map(p => ({ phone: p }))
          }
        });
      },

      // ── Kanala özel kişi oluşturma verisi ─────────────────
      createContactData: async (workspaceId, senderId, name, avatar) => {
        return {
          workspaceId,
          name: name || from,
          phone: normalizedFrom,
          avatar: avatar || getAvatarFallback(name || from),
          tags: '["whatsapp"]',
          status: 'OPPORTUNITY',
          source: 'WHATSAPP',
        };
      },
    };

    return { normalized, waNumber, error: null, httpStatus: 200 };

  } catch (error) {
    console.error('[WhatsAppAdapter] Error:', error);
    return { normalized: null, waNumber: null, error: error.message, httpStatus: 200 };
  }
}

/**
 * Reklam/organik etiketleme — kişi oluşturulduktan sonra çağrılır
 */
export async function tagContactSource(contact, referral) {
  try {
    const rawTags = contact.tags || '[]';
    let tags = [];
    try { tags = JSON.parse(rawTags); } catch { tags = []; }

    if (referral && (referral.source_type === 'ad' || referral.ctwa_clid || referral.source_id)) {
      const adTitle = referral.headline || referral.body || null;
      const adTag = adTitle ? `Reklam: ${adTitle.substring(0, 30)}` : 'WhatsApp Reklam';
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
    console.error('[WhatsAppAdapter] Tag error:', e.message);
  }
}

/**
 * WhatsApp medya indirme (2-step: mediaId → URL → dosya)
 */
async function downloadWhatsAppMedia(mediaId, wamid, accessToken) {
  try {
    if (!fs.existsSync(MEDIA_DIR)) {
      fs.mkdirSync(MEDIA_DIR, { recursive: true });
    }

    // Step 1: Media ID'den URL al
    const mediaResponse = await fetch(
      `https://graph.facebook.com/v21.0/${mediaId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const mediaData = await mediaResponse.json();

    if (!mediaData?.url) {
      console.warn('[WhatsAppAdapter] No URL in media response');
      return null;
    }

    // Step 2: URL'den dosyayı indir
    const downloadResponse = await fetch(mediaData.url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!downloadResponse.ok) {
      console.warn(`[WhatsAppAdapter] Media download failed: ${downloadResponse.status}`);
      return null;
    }

    const contentType = downloadResponse.headers.get('content-type') || '';
    const ext = contentType.includes('jpeg') || contentType.includes('jpg') ? '.jpg'
      : contentType.includes('png') ? '.png'
      : contentType.includes('webp') ? '.webp'
      : contentType.includes('mp4') ? '.mp4'
      : contentType.includes('ogg') || contentType.includes('opus') ? '.ogg'
      : contentType.includes('pdf') ? '.pdf'
      : contentType.includes('audio') ? '.mp3'
      : '.bin';

    const fileName = `${Date.now()}_${wamid.replace(/[^a-zA-Z0-9]/g, '')}${ext}`;
    const filePath = path.join(MEDIA_DIR, fileName);

    const buffer = Buffer.from(await downloadResponse.arrayBuffer());
    fs.writeFileSync(filePath, buffer);

    console.log(`📸 [WA] Media saved: /api/uploads/media/${fileName} (${(buffer.length / 1024).toFixed(1)}KB)`);
    return `/api/uploads/media/${fileName}`;
  } catch (err) {
    console.error('[WhatsAppAdapter] Media download error:', err.message);
    return null;
  }
}
