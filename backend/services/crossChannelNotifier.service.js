/**
 * Cross-Channel Notifier Service
 * ────────────────────────────────────
 * Bir olay tetiklendiğinde müşterinin tüm kanallarına mesaj gönderir.
 * WA → şablon, IG → DM, SMS → NetGSM, Email → SMTP
 * 
 * Kullanım:
 *   await notifyAllChannels(contactId, workspaceId, 'APPOINTMENT_REMINDER', {
 *     templateName: 'randevu_hatirlat',
 *     templateParams: ['Ahmet', '15 Eylül', '14:00'],
 *     smsBody: 'Randevunuz yarın 14:00'da. İptal için yanıtlayın.',
 *     igMessage: 'Merhaba! Yarınki randevunuzu hatırlatmak istedik 🗓️'
 *   });
 */

import prisma from '../lib/prisma.js';

/**
 * Contact'ın erişilebilir kanallarını tespit eder
 */
async function getContactChannels(contactId, workspaceId) {
    const contact = await prisma.contact.findUnique({
        where: { id: contactId },
        select: {
            id: true,
            phone: true,
            email: true,
            platform: true,
            platformId: true,
            name: true,
            consentChannels: true,
        }
    });
    if (!contact) return { contact: null, channels: [] };

    const channels = [];

    // WhatsApp — telefon numarası varsa
    if (contact.phone) {
        channels.push({ type: 'whatsapp', target: contact.phone });
    }

    // Instagram DM — platform IG ise
    if (contact.platform === 'instagram' && contact.platformId) {
        channels.push({ type: 'instagram', target: contact.platformId });
    }

    // Facebook Messenger — platform FB ise
    if (contact.platform === 'facebook' && contact.platformId) {
        channels.push({ type: 'facebook', target: contact.platformId });
    }

    // Email
    if (contact.email) {
        channels.push({ type: 'email', target: contact.email });
    }

    // SMS (telefon varsa, ayrı olarak)
    if (contact.phone) {
        channels.push({ type: 'sms', target: contact.phone });
    }

    // Consent kontrolü
    let consent = {};
    try { consent = JSON.parse(contact.consentChannels || '{}'); } catch { }

    // Onay reddedilen kanalları filtrele
    const filtered = channels.filter(ch => {
        if (consent[ch.type] === false) return false;
        return true;
    });

    return { contact, channels: filtered };
}

/**
 * Tüm kanallara bildirim gönderir
 * 
 * @param {string} contactId - Kişi ID
 * @param {string} workspaceId - Workspace ID
 * @param {string} event - Olay tipi (APPOINTMENT_REMINDER, QUOTE_FOLLOWUP, vb.)
 * @param {object} data - Kanal bazlı mesaj verileri:
 *   - templateName: WA şablon adı
 *   - templateParams: WA şablon parametreleri
 *   - smsBody: SMS mesaj içeriği
 *   - igMessage: IG DM mesajı
 *   - fbMessage: FB Messenger mesajı
 *   - emailSubject: Email konusu
 *   - emailBody: Email içeriği
 *   - excludeOriginChannel: Orijin kanalı hariç tut (ör: 'instagram' — IG'den geldiyse IG'ye tekrar gönderme)
 * @param {object} options - Ek seçenekler:
 *   - channels: ['whatsapp', 'sms'] — sadece belirli kanallara gönder (boşsa hepsine)
 *   - skipDuplicateCheck: boolean — dedup kontrolünü atla
 */
export async function notifyAllChannels(contactId, workspaceId, event, data = {}, options = {}) {
    const results = [];

    try {
        const { contact, channels } = await getContactChannels(contactId, workspaceId);
        if (!contact || channels.length === 0) {
            console.log(`ℹ️ [CROSS-CHANNEL] No reachable channels for contact ${contactId}`);
            return results;
        }

        // Filtre: sadece belirli kanallar
        let targetChannels = channels;
        if (options.channels && options.channels.length > 0) {
            targetChannels = channels.filter(ch => options.channels.includes(ch.type));
        }
        // Orijin kanalı hariç tut
        if (data.excludeOriginChannel) {
            targetChannels = targetChannels.filter(ch => ch.type !== data.excludeOriginChannel);
        }

        // Workspace config
        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: {
                netgsmConfig: true,
                whatsappPhoneNumbers: { select: { id: true, phoneNumber: true, phoneNumberId: true, accessToken: true }, take: 1 }
            }
        });

        for (const channel of targetChannels) {
            try {
                let result;
                switch (channel.type) {
                    case 'whatsapp':
                        result = await sendWhatsAppTemplate(workspace, channel.target, data);
                        break;
                    case 'sms':
                        result = await sendSMS(workspace, channel.target, data, event);
                        break;
                    case 'instagram':
                    case 'facebook':
                        result = await sendSocialDM(workspaceId, channel, data);
                        break;
                    case 'email':
                        result = await sendCrossEmail(workspaceId, channel.target, data, event);
                        break;
                }
                results.push({ channel: channel.type, status: 'sent', ...result });
            } catch (err) {
                console.error(`❌ [CROSS-CHANNEL] ${channel.type} failed for contact ${contactId}:`, err.message);
                results.push({ channel: channel.type, status: 'error', error: err.message });
            }
        }

        // Log
        console.log(`📢 [CROSS-CHANNEL] ${event} → contact ${contactId}: ${results.filter(r => r.status === 'sent').length}/${results.length} başarılı`);

    } catch (err) {
        console.error(`❌ [CROSS-CHANNEL] Error:`, err);
    }

    return results;
}

// ─── WhatsApp Şablon Gönder ───────────────────────────────
async function sendWhatsAppTemplate(workspace, phone, data) {
    if (!data.templateName) return { skipped: true, reason: 'no template' };

    const waPhone = workspace?.whatsappPhoneNumbers?.[0];
    if (!waPhone) return { skipped: true, reason: 'no WA phone' };

    // Dinamik import — circular dependency önleme
    const { sendWhatsappTemplate } = await import('../controllers/whatsapp.controller.js');

    await sendWhatsappTemplate(
        waPhone.phoneNumberId,
        waPhone.accessToken,
        phone,
        data.templateName,
        data.templateLanguage || 'tr',
        data.templateParams || []
    );

    return { sent: true };
}

// ─── SMS (NetGSM) ─────────────────────────────────────────
async function sendSMS(workspace, phone, data, event) {
    if (!data.smsBody) return { skipped: true, reason: 'no SMS body' };

    const config = workspace?.netgsmConfig;
    if (!config || !config.enabled) return { skipped: true, reason: 'NetGSM disabled' };

    // Dinamik import
    const { sendSms } = await import('./netgsm.service.js');
    await sendSms(config, phone, data.smsBody);

    return { sent: true };
}

// ─── IG/FB Direct Message ──────────────────────────────────
async function sendSocialDM(workspaceId, channel, data) {
    const message = channel.type === 'instagram' ? data.igMessage : data.fbMessage;
    if (!message) return { skipped: true, reason: `no ${channel.type} message` };

    // Facebook/IG Page Access Token bul
    const page = await prisma.facebookPage.findFirst({
        where: {
            workspaceId,
            isActive: true,
            ...(channel.type === 'instagram' ? { instagramAccountId: { not: null } } : {})
        },
        select: { accessToken: true, instagramAccountId: true, pageId: true }
    });
    if (!page) return { skipped: true, reason: 'no active page' };

    const recipientId = channel.target;
    const url = `https://graph.facebook.com/v19.0/me/messages`;

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${page.accessToken}` },
        body: JSON.stringify({
            recipient: { id: recipientId },
            message: { text: message }
        })
    });

    if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`FB API error: ${res.status} — ${errBody}`);
    }

    return { sent: true };
}

// ─── E-posta ───────────────────────────────────────────────
async function sendCrossEmail(workspaceId, email, data, event) {
    if (!data.emailSubject || !data.emailBody) return { skipped: true, reason: 'no email content' };

    // İlk aktif email channel'ı bul
    const emailChannel = await prisma.emailChannel.findFirst({
        where: { workspaceId, isActive: true }
    });
    if (!emailChannel) return { skipped: true, reason: 'no email channel' };

    const { sendEmailViaChannel } = await import('./emailSender.service.js');
    await sendEmailViaChannel(emailChannel.id, email, data.emailSubject, data.emailBody, { isHtml: !!data.emailIsHtml });

    return { sent: true };
}

export default { notifyAllChannels };
