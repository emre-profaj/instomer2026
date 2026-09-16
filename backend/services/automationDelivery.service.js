/**
 * ═══════════════════════════════════════════════════════════════
 * OTOMASYON TESLİMİ — TEK KAPI
 * ═══════════════════════════════════════════════════════════════
 *
 * Otomasyon kuralları müşteriye mesaj göndermek için YALNIZCA burayı
 * kullanır. Daha önce gönderim doğrudan WhatsApp'a gömülüydü; arayüzdeki
 * "Kanal" seçimi hiçbir yerde okunmuyordu ve WhatsApp dışındaki kanallara
 * hiç mesaj gitmiyordu.
 *
 * Kanal seçimi:
 *   1. Kuralın config.channel değeri (AUTO değilse) — kullanıcının seçimi
 *   2. Kişinin en son konuşmasının kanalı — "geldiği kanaldan yanıtla"
 *   3. Elde ne varsa: telefon → WHATSAPP, e-posta → EMAIL
 *
 * Şablon (templateId) yalnızca WhatsApp'ta gerçek şablon olarak gider;
 * diğer kanallarda şablonun bodyText'i düz metin olarak kullanılır.
 */
import prisma from '../lib/prisma.js';
import { emitToWorkspace } from '../socket.js';

const TAG = '[AutoDelivery]';

// Mesaj gönderilebilen kanallar — PHONE/AI_CALL/FORM/SYSTEM gibi kanallara yazılamaz
const SENDABLE = ['WHATSAPP', 'WIDGET', 'EMAIL', 'FACEBOOK', 'INSTAGRAM'];
// SMS bir konuşma kanalı değil, doğrudan gönderim yolu — kişide telefon yeterli
const DIRECT = ['SMS'];

/**
 * Kişiye hangi kanaldan ulaşılacağını belirler.
 * @returns {Promise<{channel: string|null, conversation: object|null}>}
 */
export async function resolveChannel(workspaceId, contactId, preferred = null) {
    const contact = await prisma.contact.findUnique({
        where: { id: contactId },
        select: { id: true, phone: true, email: true }
    });
    if (!contact) return { channel: null, conversation: null };

    // Kişinin konuşmaları — en yeniden eskiye
    const conversations = await prisma.conversation.findMany({
        where: { contactId, workspaceId },
        orderBy: { lastMessageAt: 'desc' },
        select: {
            id: true, channel: true, whatsappPhoneNumberId: true,
            facebookPageId: true, instagramBusinessId: true, emailChannelId: true
        }
    });

    // 1. Kullanıcının açık seçimi
    const want = String(preferred || '').toUpperCase();
    if (DIRECT.includes(want)) return { channel: want, conversation: null };
    if (want && want !== 'AUTO' && SENDABLE.includes(want)) {
        const conv = conversations.find(c => c.channel === want) || null;
        // Konuşma yoksa bile WhatsApp şablonu ve e-posta konuşmasız gönderilebilir
        if (conv || want === 'WHATSAPP' || want === 'EMAIL') {
            return { channel: want, conversation: conv };
        }
        console.warn(`${TAG} ${want} seçildi ama o kanalda konuşma yok → otomatik seçime düşülüyor`);
    }

    // 2. Geldiği kanal
    const lastSendable = conversations.find(c => SENDABLE.includes(c.channel));
    if (lastSendable) return { channel: lastSendable.channel, conversation: lastSendable };

    // 3. Elde ne varsa
    if (contact.phone) return { channel: 'WHATSAPP', conversation: null };
    if (contact.email) return { channel: 'EMAIL', conversation: null };

    return { channel: null, conversation: null };
}

/**
 * Otomasyon mesajını kişiye teslim eder.
 * @param {string} workspaceId
 * @param {string} contactId
 * @param {object} opts - { templateId, message, channel }
 * @returns {Promise<{success: boolean, channel?: string, error?: string}>}
 */
export async function deliverToContact(workspaceId, contactId, opts = {}) {
    const { templateId, message, channel: preferred } = opts;

    if (!templateId && !message) {
        return { success: false, error: 'Gönderilecek şablon veya mesaj yok' };
    }

    const contact = await prisma.contact.findUnique({ where: { id: contactId } });
    if (!contact) return { success: false, error: 'Kişi bulunamadı' };

    // Şablonu çöz — metni her kanalda kullanılabilir
    let template = null;
    if (templateId) {
        template = await prisma.whatsappTemplate.findFirst({
            where: { id: templateId, workspaceId }
        });
        if (!template) return { success: false, error: 'Şablon bulunamadı' };
    }

    const text = message || template?.bodyText || null;

    // "Her İkisi" — WhatsApp ve e-postaya ayrı ayrı gönder
    if (String(preferred || '').toUpperCase() === 'BOTH') {
        const results = [];
        for (const ch of ['WHATSAPP', 'EMAIL']) {
            const r = await deliverToContact(workspaceId, contactId, { templateId, message, channel: ch });
            results.push({ channel: ch, ...r });
        }
        const ok = results.filter(r => r.success).map(r => r.channel);
        return ok.length
            ? { success: true, channel: ok.join('+'), results }
            : { success: false, error: results.map(r => `${r.channel}: ${r.error}`).join(' | '), results };
    }

    const { channel, conversation } = await resolveChannel(workspaceId, contactId, preferred);
    if (!channel) {
        return { success: false, error: 'Kişiye ulaşılabilecek kanal yok (telefon/e-posta/konuşma bulunamadı)' };
    }

    try {
        switch (channel) {
            case 'WHATSAPP':
                return await sendWhatsapp(workspaceId, contact, conversation, template, text);
            case 'EMAIL':
                return await sendEmail(workspaceId, contact, conversation, template, text);
            case 'WIDGET':
                return await sendWidget(workspaceId, conversation, text);
            case 'SMS':
                return await sendSmsMessage(workspaceId, contact, text);
            case 'FACEBOOK':
            case 'INSTAGRAM':
                return await sendMeta(workspaceId, conversation, text, channel);
            default:
                return { success: false, error: `Desteklenmeyen kanal: ${channel}` };
        }
    } catch (err) {
        console.error(`${TAG} ${channel} gönderim hatası:`, err.message);
        return { success: false, channel, error: err.message };
    }
}

// ─── WhatsApp ────────────────────────────────────────────────────
async function sendWhatsapp(workspaceId, contact, conversation, template, text) {
    if (!contact.phone) return { success: false, channel: 'WHATSAPP', error: 'Telefon numarası yok' };

    const waNumber = await prisma.whatsappPhoneNumber.findFirst({
        where: { workspaceId, isActive: true }
    });
    if (!waNumber) return { success: false, channel: 'WHATSAPP', error: 'Aktif WhatsApp numarası yok' };

    // Onaylı şablon varsa şablonla gönder — 24 saat penceresi dışında tek yol bu
    if (template) {
        if (template.status && template.status !== 'APPROVED') {
            return { success: false, channel: 'WHATSAPP', error: `Şablon onaylı değil (${template.status})` };
        }
        const { sendWhatsappTemplate } = await import('../controllers/whatsapp.helpers.js');
        await sendWhatsappTemplate(waNumber, contact.phone, template);
        return { success: true, channel: 'WHATSAPP', via: 'template', templateName: template.name };
    }

    // Serbest metin — WhatsApp yalnızca açık konuşma penceresinde izin verir
    if (!conversation) {
        return {
            success: false, channel: 'WHATSAPP',
            error: 'Açık WhatsApp konuşması yok — serbest metin gönderilemez, onaylı şablon gerekir'
        };
    }
    const { sendWhatsAppMessage } = await import('../controllers/whatsapp.controller.js');
    await sendWhatsAppMessage(waNumber, contact.phone, text, conversation.id);
    return { success: true, channel: 'WHATSAPP', via: 'text' };
}

// ─── E-posta ─────────────────────────────────────────────────────
async function sendEmail(workspaceId, contact, conversation, template, text) {
    if (!contact.email) return { success: false, channel: 'EMAIL', error: 'E-posta adresi yok' };

    let emailChannelId = conversation?.emailChannelId || null;
    if (!emailChannelId) {
        const ch = await prisma.emailChannel.findFirst({
            where: { workspaceId, isActive: true },
            select: { id: true }
        });
        emailChannelId = ch?.id || null;
    }
    if (!emailChannelId) return { success: false, channel: 'EMAIL', error: 'Aktif e-posta kanalı yok' };

    const subject = template?.name
        ? template.name.replace(/_/g, ' ')
        : 'Bilgilendirme';

    const { sendEmailReply } = await import('../controllers/email.controller.js');
    await sendEmailReply(emailChannelId, contact.email, subject, text);

    if (conversation?.id) await recordOutgoing(workspaceId, conversation.id, text, 'EMAIL');
    return { success: true, channel: 'EMAIL' };
}

// ─── Web Widget ──────────────────────────────────────────────────
// Ziyaretçinin tarayıcısı getWidgetMessages ile mesajları çekiyor;
// Message satırı oluşturmak teslim için yeterli.
async function sendWidget(workspaceId, conversation, text) {
    if (!conversation?.id) {
        return { success: false, channel: 'WIDGET', error: 'Açık web sohbeti yok' };
    }
    await recordOutgoing(workspaceId, conversation.id, text, 'TEXT');
    return { success: true, channel: 'WIDGET' };
}

// ─── SMS (NetGSM) ────────────────────────────────────────────────
async function sendSmsMessage(workspaceId, contact, text) {
    if (!contact.phone) return { success: false, channel: 'SMS', error: 'Telefon numarası yok' };

    const ws = await prisma.workspace.findUnique({
        where: { id: workspaceId }, select: { netgsmConfig: true }
    });
    const cfg = typeof ws?.netgsmConfig === 'string'
        ? (() => { try { return JSON.parse(ws.netgsmConfig); } catch { return null; } })()
        : ws?.netgsmConfig;
    if (!cfg?.username || !cfg?.password) {
        return { success: false, channel: 'SMS', error: 'NetGSM ayarları eksik' };
    }
    if (!cfg.enabled) {
        return { success: false, channel: 'SMS', error: 'SMS gönderimi kapalı (Ayarlar → SMS)' };
    }

    const { sendSms } = await import('./netgsm.service.js');
    const res = await sendSms(cfg, contact.phone, text);
    return res?.success === false
        ? { success: false, channel: 'SMS', error: res.error || res.reason || 'SMS gönderilemedi' }
        : { success: true, channel: 'SMS' };
}

// ─── Facebook / Instagram ────────────────────────────────────────
async function sendMeta(workspaceId, conversation, text, channel) {
    if (!conversation?.id) {
        return { success: false, channel, error: `Açık ${channel} konuşması yok` };
    }

    const full = await prisma.conversation.findUnique({
        where: { id: conversation.id },
        select: { id: true, contact: { select: { facebookId: true, instagramId: true } } }
    });

    const page = await prisma.facebookPage.findFirst({
        where: channel === 'INSTAGRAM'
            ? { workspaceId, instagramBusinessId: { not: null } }
            : { workspaceId },
        select: { pageAccessToken: true }
    });
    if (!page?.pageAccessToken) {
        return { success: false, channel, error: `${channel} sayfa erişim anahtarı yok` };
    }

    const recipientId = channel === 'INSTAGRAM'
        ? full?.contact?.instagramId
        : full?.contact?.facebookId;
    if (!recipientId) {
        return { success: false, channel, error: `Kişinin ${channel} kimliği yok` };
    }

    const axios = (await import('axios')).default;
    const version = process.env.FACEBOOK_GRAPH_API_VERSION || 'v18.0';
    await axios.post(
        `https://graph.facebook.com/${version}/me/messages`,
        { recipient: { id: recipientId }, message: { text } },
        { params: { access_token: page.pageAccessToken } }
    );

    await recordOutgoing(workspaceId, conversation.id, text, 'TEXT');
    return { success: true, channel };
}

// ─── Giden mesajı sohbet geçmişine yaz ───────────────────────────
// Temsilci Inbox'ta otomasyonun ne gönderdiğini görebilsin.
async function recordOutgoing(workspaceId, conversationId, content, messageType) {
    try {
        const msg = await prisma.message.create({
            data: {
                conversationId,
                content,
                messageType: messageType || 'TEXT',
                isFromContact: false,
                status: 'SENT'
            }
        });
        await prisma.conversation.update({
            where: { id: conversationId },
            data: { lastMessageAt: new Date() }
        }).catch(() => { });
        emitToWorkspace(workspaceId, 'new_message', {
            conversationId,
            message: { id: msg.id, content, isFromContact: false, createdAt: msg.createdAt }
        });
        return msg;
    } catch (e) {
        console.error(`${TAG} mesaj kaydı hatası:`, e.message);
        return null;
    }
}

export default { deliverToContact, resolveChannel };
