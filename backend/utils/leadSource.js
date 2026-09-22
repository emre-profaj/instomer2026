/**
 * ═══════════════════════════════════════════════════════════════
 * KAYNAK (LEAD SOURCE) ÇÖZÜMLEME
 * ═══════════════════════════════════════════════════════════════
 *
 * Üç katmanlı kaynak modeli:
 *
 *   Kişi  (contact.source / contact.leadSource)
 *         → Bu kişiyi bize İLK ne getirdi. Bir kez yazılır, değişmez.
 *
 *   Case  (case.leadSource)
 *         → BU BAŞVURU nereden geldi. Her başvurunun kendi kaynağı.
 *           Sipariş (Deal) ve randevu bunu devralır.
 *
 *   ContactAttribution
 *         → O temasın detayı (reklam, kampanya, form id). Zaten mevcut.
 *
 * Kişi ile Case'teki değerin aynı olması bilinçli bir tekrardır: kişideki
 * alan ilk başvurunun kaynağının kopyasıdır. Böylece "müşteriyi bize ne
 * getirdi" sorusu tek alandan, "bu başvuru nereden geldi" sorusu case'ten
 * cevaplanır; case silinse bile ilk temas bilgisi kaybolmaz.
 */

// Konuşma kanalı → kaynak kodu
const CHANNEL_TO_SOURCE = {
    WHATSAPP: 'WHATSAPP',
    FACEBOOK: 'FACEBOOK',
    INSTAGRAM: 'INSTAGRAM',
    WIDGET: 'WEB_WIDGET',
    WEB_WIDGET: 'WEB_WIDGET',
    FORM: 'WEB_FORM',
    WEB_FORM: 'WEB_FORM',
    EMAIL: 'EMAIL',
    PHONE: 'INBOUND',
    AI_CALL: 'AI_CALL',
    SMS: 'SMS',
    LEAD: 'FACEBOOK_LEAD',
    FACEBOOK_LEAD: 'FACEBOOK_LEAD'
};

// Otomatik türetilemeyen, yalnızca insan bilgisiyle girilen kaynaklar
const MANUAL_ONLY = ['REFERRAL', 'WALK_IN', 'EVENT', 'GOOGLE', 'SOCIAL_MEDIA', 'OTHER'];

// Kaynak bilgisi taşımayan, "bilinmiyor" sayılması gereken değerler
const MEANINGLESS = ['MANUAL', 'SYSTEM', 'INTERNAL', 'INTERNAL_SYSTEM', 'UNKNOWN', ''];

/** Kanal kodunu kaynak koduna çevirir. */
export function sourceFromChannel(channel) {
    if (!channel) return null;
    return CHANNEL_TO_SOURCE[String(channel).toUpperCase()] || null;
}

/** Bir kaynak değeri gerçekten bilgi taşıyor mu? */
export function isMeaningfulSource(source) {
    if (!source) return false;
    return !MEANINGLESS.includes(String(source).toUpperCase());
}

/**
 * Yeni bir case için kaynağı belirler.
 * Sıra: kullanıcının açık seçimi → konuşma kanalı → kişinin mevcut kaynağı.
 *
 * @param {object} p
 * @param {string} [p.explicit]      - Kullanıcının seçtiği kaynak ("Yeni görüşme")
 * @param {string} [p.channel]       - Konuşma kanalı (otomatik case'ler için)
 * @param {string} [p.contactSource] - Kişinin mevcut kaynağı (son çare)
 * @returns {{leadSource: string|null, inherited: boolean}}
 */
export function resolveCaseLeadSource({ explicit, channel, contactSource } = {}) {
    if (isMeaningfulSource(explicit)) {
        return { leadSource: String(explicit).toUpperCase(), inherited: false };
    }
    const fromChannel = sourceFromChannel(channel);
    if (isMeaningfulSource(fromChannel)) {
        return { leadSource: fromChannel, inherited: false };
    }
    if (isMeaningfulSource(contactSource)) {
        // Kişiden devralındı — girilmiş veri değil, çıkarım
        return { leadSource: String(contactSource).toUpperCase(), inherited: true };
    }
    return { leadSource: null, inherited: false };
}

/** Elle girilmesi gereken (kanaldan türetilemeyen) kaynaklar. */
export function isManualOnlySource(source) {
    return MANUAL_ONLY.includes(String(source || '').toUpperCase());
}

export const LEAD_SOURCE_LABELS = {
    INBOUND: 'Gelen Arama',
    WHATSAPP: 'WhatsApp',
    FACEBOOK: 'Facebook',
    FACEBOOK_LEAD: 'Facebook Lead Form',
    INSTAGRAM: 'Instagram',
    WEB_FORM: 'Web Formu',
    WEB_WIDGET: 'Web Sohbeti',
    EMAIL: 'E-posta',
    AI_CALL: 'AI Arama',
    SMS: 'SMS',
    GOOGLE: 'Google',
    SOCIAL_MEDIA: 'Sosyal Medya',
    REFERRAL: 'Referans',
    WALK_IN: 'Yüz Yüze',
    EVENT: 'Etkinlik/Fuar',
    OTHER: 'Diğer'
};

export default {
    sourceFromChannel,
    isMeaningfulSource,
    resolveCaseLeadSource,
    isManualOnlySource,
    LEAD_SOURCE_LABELS
};
