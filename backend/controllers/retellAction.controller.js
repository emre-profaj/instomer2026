import prisma from '../lib/prisma.js';
import axios from 'axios';

const WHATSAPP_API_VERSION = process.env.FACEBOOK_GRAPH_API_VERSION || 'v21.0';

// ─── Helpers ────────────────────────────────────────────────────────────────

function normalizePhone(phone) {
    if (!phone) return null;
    let p = String(phone).replace(/[\s\+\-\(\)]/g, '');
    if (p.startsWith('0') && p.length === 11) p = '90' + p.substring(1);
    else if (!p.startsWith('90') && p.length === 10) p = '90' + p;
    return p;
}

async function getWhatsappPhone(workspaceId) {
    return prisma.whatsappPhoneNumber.findFirst({ where: { workspaceId } });
}

/**
 * Müşterinin WhatsApp numarasını bul.
 * Önce call_id ile RetellCall kaydına bak, bulamazsa from_number'ı kullan.
 */
async function resolveCustomerPhone(workspaceId, callId, fromNumber) {
    if (callId) {
        const callRecord = await prisma.retellCall.findFirst({
            where: { callId, workspaceId }
        });
        if (callRecord?.toNumber) return callRecord.toNumber;
        // Inbound call: customer is the from_number
        if (callRecord?.fromNumber) return callRecord.fromNumber;
    }
    // Fallback: use from_number directly (inbound)
    return fromNumber ? normalizePhone(fromNumber) : null;
}

// ─── WhatsApp Send Helpers ───────────────────────────────────────────────────

async function sendWhatsAppPayload(whatsappPhone, payload) {
    const response = await axios.post(
        `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${whatsappPhone.phoneNumberId}/messages`,
        payload,
        {
            headers: {
                'Authorization': `Bearer ${whatsappPhone.accessToken}`,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        }
    );
    return response.data;
}

async function sendTextMessage(whatsappPhone, toNumber, text) {
    return sendWhatsAppPayload(whatsappPhone, {
        messaging_product: 'whatsapp',
        to: toNumber,
        type: 'text',
        text: { body: text, preview_url: true }
    });
}

async function sendLocationMessage(whatsappPhone, toNumber, { lat, lng, name, address }) {
    return sendWhatsAppPayload(whatsappPhone, {
        messaging_product: 'whatsapp',
        to: toNumber,
        type: 'location',
        location: {
            latitude: lat,
            longitude: lng,
            name: name || '',
            address: address || ''
        }
    });
}

async function sendMediaMessage(whatsappPhone, toNumber, { type, url, caption, filename }) {
    // type: 'document' | 'video' | 'image'
    const mediaPayload = { link: url };
    if (caption) mediaPayload.caption = caption;
    if (filename && type === 'document') mediaPayload.filename = filename;

    return sendWhatsAppPayload(whatsappPhone, {
        messaging_product: 'whatsapp',
        to: toNumber,
        type,
        [type]: mediaPayload
    });
}

async function sendTemplateMessage(whatsappPhone, toNumber, templateName, workspaceId, extraText) {
    const template = await prisma.whatsappTemplate.findFirst({
        where: {
            name: { equals: templateName, mode: 'insensitive' },
            workspaceId,
            status: 'APPROVED'
        }
    });

    if (!template) throw new Error(`Template "${templateName}" bulunamadı veya onaylı değil`);

    const payload = {
        messaging_product: 'whatsapp',
        to: toNumber,
        type: 'template',
        template: {
            name: template.name,
            language: { code: template.language || 'tr' }
        }
    };

    const placeholderCount = (template.bodyText?.match(/\{\{\d+\}\}/g) || []).length;
    if (placeholderCount > 0 && extraText) {
        payload.template.components = [{
            type: 'body',
            parameters: [{ type: 'text', text: extraText }]
        }];
    }

    return sendWhatsAppPayload(whatsappPhone, payload);
}

// ─── PUBLIC: Retell Function Calling Endpoint ────────────────────────────────

/**
 * POST /api/retell/action/:workspaceId
 * Retell agent bu endpoint'i arama sırasında çağırır.
 * 
 * Beklenen body (Retell Function Calling format):
 * {
 *   "call": { "call_id": "...", "from_number": "...", "to_number": "..." },
 *   "name": "send_to_customer",
 *   "args": { "action": "location", "note": "Randevunuz oluşturuldu!" }
 * }
 */
export const handleRetellAction = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const body = req.body;

        // Retell birden fazla format gönderebilir
        const call = body.call || body;
        const callId = call.call_id || body.call_id;
        const fromNumber = call.from_number || body.from_number;
        const args = body.args || body.arguments || body;
        const actionKey = args.action || args.action_key;
        const note = args.note || args.message || args.extra || '';

        console.log(`[RetellAction] workspace=${workspaceId} call=${callId} action=${actionKey}`);

        if (!actionKey) {
            return res.status(200).json({ result: 'Hata: action parametresi eksik.' });
        }

        // ── Built-in Fonksiyonlar: Randevu Sistemi ──
        const APPOINTMENT_FUNCTIONS = ['check_availability', 'book_appointment', 'cancel_appointment', 'list_appointments'];
        if (APPOINTMENT_FUNCTIONS.includes(actionKey)) {
            try {
                const { executeAppointmentFunction } = await import('../services/appointmentFunctions.service.js');
                
                // Retell'den gelen parametreleri düzenle
                const fnParams = { ...args };
                delete fnParams.action;
                delete fnParams.action_key;
                
                // Eğer müşteri telefonu args'ta yoksa, call'dan al
                if (!fnParams.customer_phone && (actionKey === 'book_appointment' || actionKey === 'cancel_appointment' || actionKey === 'list_appointments')) {
                    const customerPhone = await resolveCustomerPhone(workspaceId, callId, fromNumber);
                    if (customerPhone) fnParams.customer_phone = customerPhone;
                }
                
                // conversation_id bul (eğer varsa)
                if (!fnParams.conversation_id && callId) {
                    const callRecord = await prisma.retellCall.findFirst({ where: { callId, workspaceId } });
                    if (callRecord?.contactId) {
                        const conv = await prisma.conversation.findFirst({ where: { workspaceId, contactId: callRecord.contactId } });
                        if (conv) fnParams.conversation_id = conv.id;
                    }
                }

                const result = await executeAppointmentFunction(actionKey, workspaceId, fnParams);
                console.log(`[RetellAction] ✅ ${actionKey} → ${result.success ? 'başarılı' : 'hata'}`);
                
                // Retell'e okunabilir sonuç döndür
                return res.status(200).json({ 
                    result: result.success 
                        ? (result.message || result.summary || JSON.stringify(result)) 
                        : (result.error || 'İşlem başarısız')
                });
            } catch (fnErr) {
                console.error(`[RetellAction] ❌ ${actionKey} error:`, fnErr.message);
                return res.status(200).json({ result: `Randevu işlemi sırasında hata: ${fnErr.message}` });
            }
        }

        // 1. Aksiyon konfigürasyonunu bul
        const action = await prisma.retellAction.findFirst({
            where: {
                workspaceId,
                actionKey: { equals: actionKey, mode: 'insensitive' },
                isActive: true
            }
        });

        if (!action) {
            console.warn(`[RetellAction] Action "${actionKey}" not found for workspace ${workspaceId}`);
            return res.status(200).json({
                result: `"${actionKey}" aksiyonu tanımlanmamış. Lütfen Instomer ayarlarından ekleyin.`
            });
        }

        // 2. Müşteri telefon numarasını bul
        const customerPhone = await resolveCustomerPhone(workspaceId, callId, fromNumber);
        if (!customerPhone) {
            console.warn(`[RetellAction] Could not resolve customer phone for call ${callId}`);
            return res.status(200).json({ result: 'Müşteri telefon numarası bulunamadı.' });
        }

        // 3. WhatsApp hattını bul
        const whatsappPhone = await getWhatsappPhone(workspaceId);
        if (!whatsappPhone) {
            return res.status(200).json({ result: 'WhatsApp hattı bağlı değil.' });
        }

        // 4. Mesaj tipine göre gönder
        let successMsg = 'Gönderildi.';

        switch (action.messageType) {
            case 'TEXT': {
                let text = action.textContent || '';
                if (note) text = `${text}\n\n${note}`.trim();
                await sendTextMessage(whatsappPhone, customerPhone, text);
                successMsg = `"${action.name}" mesajı WhatsApp'tan gönderildi.`;
                break;
            }

            case 'LOCATION': {
                // Önce konum mesajı
                await sendLocationMessage(whatsappPhone, customerPhone, {
                    lat: action.locationLat,
                    lng: action.locationLng,
                    name: action.locationName,
                    address: action.locationAddress
                });
                // Eğer ek not varsa (randevu bilgisi vb.) ayrıca text gönder
                if (note) {
                    await sendTextMessage(whatsappPhone, customerPhone, note);
                } else if (action.textContent) {
                    await sendTextMessage(whatsappPhone, customerPhone, action.textContent);
                }
                successMsg = `Konum WhatsApp'tan gönderildi.`;
                break;
            }

            case 'DOCUMENT': {
                const caption = note || action.mediaCaption || '';
                await sendMediaMessage(whatsappPhone, customerPhone, {
                    type: 'document',
                    url: action.mediaUrl,
                    caption,
                    filename: action.mediaFilename || 'dokuman.pdf'
                });
                successMsg = `Doküman WhatsApp'tan gönderildi.`;
                break;
            }

            case 'VIDEO': {
                const caption = note || action.mediaCaption || '';
                await sendMediaMessage(whatsappPhone, customerPhone, {
                    type: 'video',
                    url: action.mediaUrl,
                    caption
                });
                successMsg = `Video WhatsApp'tan gönderildi.`;
                break;
            }

            case 'IMAGE': {
                const caption = note || action.mediaCaption || '';
                await sendMediaMessage(whatsappPhone, customerPhone, {
                    type: 'image',
                    url: action.mediaUrl,
                    caption
                });
                successMsg = `Görsel WhatsApp'tan gönderildi.`;
                break;
            }

            case 'TEMPLATE': {
                await sendTemplateMessage(
                    whatsappPhone,
                    customerPhone,
                    action.templateName,
                    workspaceId,
                    note || action.textContent
                );
                successMsg = `Şablon mesajı WhatsApp'tan gönderildi.`;
                break;
            }

            default:
                return res.status(200).json({ result: `Bilinmeyen mesaj tipi: ${action.messageType}` });
        }

        console.log(`[RetellAction] ✅ ${successMsg} → ${customerPhone}`);
        // Retell function calling: result alanına string döndür
        return res.status(200).json({ result: successMsg });

    } catch (error) {
        console.error('[RetellAction] ❌ Error:', error.message);
        // Retell'e hata dönme — arama kesilmesin, başarı mesajı ver
        return res.status(200).json({ result: 'İşlem sırasında bir hata oluştu, lütfen manuel kontrol edin.' });
    }
};

// ─── CRUD: Workspace Actions ─────────────────────────────────────────────────

export const getActions = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const actions = await prisma.retellAction.findMany({
            where: { workspaceId },
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
        });
        res.json({ actions });
    } catch (error) {
        console.error('[RetellAction] getActions error:', error.message);
        res.status(500).json({ error: 'Aksiyonlar yüklenirken hata oluştu.' });
    }
};

export const createAction = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const data = req.body;

        // actionKey benzersizliği (workspace içinde)
        const existing = await prisma.retellAction.findFirst({
            where: { workspaceId, actionKey: data.actionKey }
        });
        if (existing) {
            return res.status(400).json({ error: `"${data.actionKey}" action key zaten kullanılıyor.` });
        }

        const action = await prisma.retellAction.create({
            data: {
                workspaceId,
                name: data.name,
                actionKey: data.actionKey.toLowerCase().replace(/\s+/g, '_'),
                description: data.description || '',
                messageType: data.messageType,
                textContent: data.textContent || null,
                locationLat: data.locationLat ? parseFloat(data.locationLat) : null,
                locationLng: data.locationLng ? parseFloat(data.locationLng) : null,
                locationName: data.locationName || null,
                locationAddress: data.locationAddress || null,
                mediaUrl: data.mediaUrl || null,
                mediaCaption: data.mediaCaption || null,
                mediaFilename: data.mediaFilename || null,
                templateName: data.templateName || null,
                isActive: data.isActive !== false,
                sortOrder: data.sortOrder || 0
            }
        });

        res.status(201).json({ action });
    } catch (error) {
        console.error('[RetellAction] createAction error:', error.message);
        res.status(500).json({ error: 'Aksiyon oluşturulurken hata oluştu.' });
    }
};

export const updateAction = async (req, res) => {
    try {
        const { workspaceId, id } = req.params;
        const data = req.body;

        const existing = await prisma.retellAction.findFirst({
            where: { id, workspaceId }
        });
        if (!existing) return res.status(404).json({ error: 'Aksiyon bulunamadı.' });

        const updated = await prisma.retellAction.update({
            where: { id },
            data: {
                name: data.name ?? existing.name,
                actionKey: data.actionKey ? data.actionKey.toLowerCase().replace(/\s+/g, '_') : existing.actionKey,
                description: data.description ?? existing.description,
                messageType: data.messageType ?? existing.messageType,
                textContent: data.textContent !== undefined ? data.textContent : existing.textContent,
                locationLat: data.locationLat !== undefined ? parseFloat(data.locationLat) : existing.locationLat,
                locationLng: data.locationLng !== undefined ? parseFloat(data.locationLng) : existing.locationLng,
                locationName: data.locationName !== undefined ? data.locationName : existing.locationName,
                locationAddress: data.locationAddress !== undefined ? data.locationAddress : existing.locationAddress,
                mediaUrl: data.mediaUrl !== undefined ? data.mediaUrl : existing.mediaUrl,
                mediaCaption: data.mediaCaption !== undefined ? data.mediaCaption : existing.mediaCaption,
                mediaFilename: data.mediaFilename !== undefined ? data.mediaFilename : existing.mediaFilename,
                templateName: data.templateName !== undefined ? data.templateName : existing.templateName,
                isActive: data.isActive !== undefined ? data.isActive : existing.isActive,
                sortOrder: data.sortOrder !== undefined ? data.sortOrder : existing.sortOrder
            }
        });

        res.json({ action: updated });
    } catch (error) {
        console.error('[RetellAction] updateAction error:', error.message);
        res.status(500).json({ error: 'Aksiyon güncellenirken hata oluştu.' });
    }
};

export const deleteAction = async (req, res) => {
    try {
        const { workspaceId, id } = req.params;
        const existing = await prisma.retellAction.findFirst({ where: { id, workspaceId } });
        if (!existing) return res.status(404).json({ error: 'Aksiyon bulunamadı.' });

        await prisma.retellAction.delete({ where: { id } });
        res.json({ success: true });
    } catch (error) {
        console.error('[RetellAction] deleteAction error:', error.message);
        res.status(500).json({ error: 'Aksiyon silinirken hata oluştu.' });
    }
};
