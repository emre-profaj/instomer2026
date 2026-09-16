/**
 * Default WhatsApp Templates Service
 * ─────────────────────────────────────────────────────────────
 * Tüm workspace'ler için otomatik oluşturulan standart WA şablonları.
 * Workspace'e WhatsApp bağlandığında veya ilk kullanımda çağrılır.
 * 
 * Kullanım:
 *   await ensureDefaultWhatsAppTemplates(workspaceId);
 */

import prisma from '../lib/prisma.js';

const WHATSAPP_API_VERSION = process.env.FACEBOOK_GRAPH_API_VERSION || 'v21.0';

// ─── ŞABLON TANIMLARI ────────────────────────────────────────

export const DEFAULT_TEMPLATES = [
    {
        name: 'randevu_hatirlatma',
        category: 'UTILITY',
        body: 'Merhaba {{1}}, yarın saat {{2}}\'deki {{3}} randevunuzu hatırlatmak isteriz.\n{{4}}\nSorularınız için bize yazabilirsiniz. İyi günler! 🙏',
        example: [['Ahmet Yılmaz', '14:00', 'muayene', 'Doktor: Dr. Mehmet Öz']],
        description: 'Randevu hatırlatma — yarınki randevular için otomatik gönderilir'
    },
    {
        name: 'arama_basarili',
        category: 'UTILITY',
        body: 'Merhaba {{1}}, az önce gerçekleştirdiğimiz görüşme hakkında bilgilendirmek isteriz.\n\n{{2}}\n\nSorularınız için bize ulaşabilirsiniz. İyi günler! 🙏',
        example: [['Ayşe Kaya', 'Randevunuz 20 Eylül Cuma saat 10:00 olarak oluşturulmuştur.']],
        description: 'Başarılı arama sonrası — özet veya onay bilgisi gönderir'
    },
    {
        name: 'arama_basarisiz',
        category: 'UTILITY',
        body: 'Merhaba {{1}}, size ulaşmaya çalıştık ancak ulaşamadık.\n\n{{2}}\n\nUygun olduğunuzda bize dönüş yapabilirsiniz. İyi günler!',
        example: [['Mehmet Demir', 'Randevunuzla ilgili bilgi vermek istemiştik.']],
        description: 'Başarısız arama sonrası — kaçırılan arama bildirimi'
    },
    {
        name: 'konum_gonder',
        category: 'UTILITY',
        body: 'Merhaba {{1}}, randevunuz için adres bilgilerimiz:\n\n📍 {{2}}\n{{3}}\n\nYol tarifi: {{4}}',
        example: [['Ali Yıldız', 'Özel Metropol Hastanesi Çiğli Şubesi', 'Atatürk Mah. 123 Sok. No:5 Çiğli/İzmir', 'https://maps.google.com/xyz']],
        description: 'Konum/adres bilgisi gönderimi — randevu veya ziyaret öncesi'
    },
    {
        name: 'talep_alindi',
        category: 'UTILITY',
        body: 'Merhaba {{1}}, talebiniz alınmıştır. ✅\n\nKonu: {{2}}\n{{3}}\n\nEn kısa sürede sizinle iletişime geçeceğiz. İyi günler!',
        example: [['Fatma Şen', 'Psikiyatri Randevu Talebi', 'Talebiniz değerlendirme aşamasındadır.']],
        description: 'Talep/başvuru alındı bildirimi — form, bot veya manuel'
    },
    {
        name: 'genel_bilgilendirme',
        category: 'UTILITY',
        body: 'Merhaba {{1}},\n\n{{2}}\n\nSorularınız için bize yazabilirsiniz. İyi günler! 🙏',
        example: [['Hasan Ak', 'Randevunuz onaylanmıştır. 15 Eylül Pazartesi saat 09:00.']],
        description: 'Genel bilgilendirme — her amaçla kullanılabilir'
    }
];

// ─── ŞABLON OLUŞTURUCU ──────────────────────────────────────

/**
 * Tek bir şablonu kontrol et, yoksa Meta API'ye gönderip oluştur.
 * @returns {object|null} Oluşturulan/mevcut şablon kaydı
 */
async function ensureSingleTemplate(workspaceId, waPhone, template) {
    try {
        // Zaten var mı?
        const existing = await prisma.whatsappTemplate.findFirst({
            where: { workspaceId, name: template.name }
        });
        if (existing) return existing;

        // Meta API'ye gönder
        const { default: axios } = await import('axios');
        const apiUrl = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${waPhone.wabaId}/message_templates`;

        let metaTemplateId = null;
        let metaStatus = 'PENDING';

        try {
            const metaRes = await axios.post(apiUrl, {
                name: template.name,
                language: 'tr',
                category: template.category,
                components: [
                    {
                        type: 'BODY',
                        text: template.body,
                        example: { body_text: template.example }
                    }
                ]
            }, {
                headers: { Authorization: `Bearer ${waPhone.accessToken}` },
                timeout: 15000
            });

            metaTemplateId = metaRes.data?.id;
            metaStatus = metaRes.data?.status || 'PENDING';
        } catch (metaErr) {
            const errMsg = metaErr.response?.data?.error?.message || metaErr.message;
            if (errMsg?.includes('already exists')) {
                metaStatus = 'APPROVED';
            } else {
                console.warn(`⚠️ [DefaultTemplates] ${template.name} Meta hatası: ${errMsg}`);
                return null;
            }
        }

        // DB'ye kaydet
        const created = await prisma.whatsappTemplate.create({
            data: {
                workspaceId,
                name: template.name,
                bodyText: template.body,
                templateId: metaTemplateId,
                status: metaStatus,
                language: 'tr',
                category: template.category,
                whatsappPhoneNumberId: waPhone.id
            }
        });

        console.log(`✅ [DefaultTemplates] ${template.name} oluşturuldu (status: ${metaStatus})`);
        return created;
    } catch (err) {
        console.warn(`⚠️ [DefaultTemplates] ${template.name} hatası: ${err.message}`);
        return null;
    }
}

// ─── ANA FONKSİYON ──────────────────────────────────────────

/**
 * Workspace için tüm varsayılan WA şablonlarını kontrol eder ve eksik olanları oluşturur.
 * WhatsApp bağlandığında veya ilk kullanımda çağrılır.
 * 
 * @param {string} workspaceId
 * @returns {{ created: string[], skipped: string[], failed: string[] }}
 */
export async function ensureDefaultWhatsAppTemplates(workspaceId) {
    const result = { created: [], skipped: [], failed: [] };

    try {
        // WA numarası bul
        const waPhone = await prisma.whatsappPhoneNumber.findFirst({
            where: { workspaceId },
            select: { id: true, wabaId: true, accessToken: true }
        });

        if (!waPhone || !waPhone.wabaId) {
            console.log(`ℹ️ [DefaultTemplates] Workspace ${workspaceId.slice(0, 8)} için WA numarası yok`);
            return result;
        }

        // Mevcut şablonları toplu kontrol et (N+1 query önleme)
        const existingTemplates = await prisma.whatsappTemplate.findMany({
            where: {
                workspaceId,
                name: { in: DEFAULT_TEMPLATES.map(t => t.name) }
            },
            select: { name: true }
        });
        const existingNames = new Set(existingTemplates.map(t => t.name));

        for (const template of DEFAULT_TEMPLATES) {
            if (existingNames.has(template.name)) {
                result.skipped.push(template.name);
                continue;
            }

            const created = await ensureSingleTemplate(workspaceId, waPhone, template);
            if (created) {
                result.created.push(template.name);
            } else {
                result.failed.push(template.name);
            }
        }

        const summary = `✅ ${result.created.length} oluşturuldu, ⏭ ${result.skipped.length} zaten var, ❌ ${result.failed.length} başarısız`;
        console.log(`📋 [DefaultTemplates] Workspace ${workspaceId.slice(0, 8)}: ${summary}`);

    } catch (err) {
        console.error(`❌ [DefaultTemplates] ensureDefaultWhatsAppTemplates error:`, err.message);
    }

    return result;
}

export default { ensureDefaultWhatsAppTemplates, DEFAULT_TEMPLATES };
