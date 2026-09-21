/**
 * ═══════════════════════════════════════════════════════════════
 * WHATSAPP ŞABLON GÖNDERİMİ — BİLEŞEN KURUCU
 * ═══════════════════════════════════════════════════════════════
 *
 * Şablon mesajı gönderen altı ayrı yol var (kampanya, otomasyon, akış,
 * AI, kural motoru, çapraz kanal bildirimi). Her biri `components`
 * dizisini kendi elinde kuruyordu; carousel'i hepsine ayrı ayrı yazmak
 * yerine kurucu burada.
 *
 * ── CAROUSEL HAKKINDA ──────────────────────────────────────────
 * Meta kuralları:
 *   • 1-10 kart, kategori MARKETING
 *   • BÜTÜN KARTLAR AYNI YAPIDA: aynı başlık türü, aynı buton sayısı
 *   • Her kartın başlığı ZORUNLU ve gönderirken bağlantı verilmeli
 *
 * Son madde önemli: şablon oluştururken Meta "handle" ister (resumable
 * upload'tan gelir), gönderirken ise "link". Handle'dan link üretilemez,
 * bu yüzden oluştururken yüklediğimiz dosyanın URL'ini
 * whatsapp_templates.carouselCards içinde kendimiz saklıyoruz.
 * Meta panelinden oluşturulmuş şablonlarda o bilgi bizde yok — gönderen
 * taraf kart görselini kendisi vermek zorunda.
 */

/**
 * Göreli yüklenme yolunu Meta'nın çekebileceği mutlak adrese çevirir.
 *
 * Kart görsellerini `/api/uploads/templates/...` olarak saklıyoruz; Meta
 * gönderimde bu bağlantıyı KENDİSİ indiriyor, dolayısıyla dışarıdan
 * erişilebilir tam adres şart. Taban adres FRONTEND_URL'den gelir.
 */
export function toPublicUrl(url) {
    if (!url || typeof url !== 'string') return url || null;
    if (/^https?:\/\//i.test(url)) return url;
    if (!url.startsWith('/')) return url;
    const base = (process.env.FRONTEND_URL || '').replace(/\/+$/, '');
    if (!base) return url;
    const path = url.startsWith('/uploads') ? `/api${url}` : url;
    return `${base}${path}`;
}

/** Şablonun ham Meta bileşenlerini güvenle çözer. */
export function parseComponents(template) {
    if (!template?.components) return [];
    try {
        const c = typeof template.components === 'string'
            ? JSON.parse(template.components)
            : template.components;
        return Array.isArray(c) ? c : [];
    } catch {
        return [];
    }
}

/** Şablonda carousel var mı? */
export function hasCarousel(template) {
    return parseComponents(template).some(c => String(c.type).toUpperCase() === 'CAROUSEL');
}

/** Şablonun carousel kartları (Meta tanımı). */
export function getCarouselCards(template) {
    const comp = parseComponents(template)
        .find(c => String(c.type).toUpperCase() === 'CAROUSEL');
    return comp?.cards || [];
}

/** Bizim sakladığımız kart bilgileri (görsel URL'leri dahil). */
export function getLocalCards(template) {
    if (!template?.carouselCards) return [];
    try {
        const c = typeof template.carouselCards === 'string'
            ? JSON.parse(template.carouselCards)
            : template.carouselCards;
        return Array.isArray(c) ? c : [];
    } catch {
        return [];
    }
}

/**
 * Gönderim için `components` dizisini kurar.
 *
 * @param {object}   p
 * @param {object}   p.template      - WhatsappTemplate kaydı
 * @param {string}   [p.mediaUrl]    - Ana başlık medyası (carousel dışı)
 * @param {string[]} [p.bodyParams]  - Ana gövde değişkenleri
 * @param {Array}    [p.cardInputs]  - Kart başına { mediaUrl, bodyParams, buttonPayloads }
 * @returns {Array} Meta'ya gönderilecek components dizisi
 */
export function buildSendComponents({ template, mediaUrl, bodyParams = [], cardInputs = [] } = {}) {
    const components = [];

    // ── Ana başlık (carousel dışı medya) ────────────────────────
    const headerType = String(template?.headerType || '').toUpperCase();
    if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerType)) {
        const link = toPublicUrl(mediaUrl || template?.headerContent);
        if (link) {
            components.push({
                type: 'header',
                parameters: [{ type: headerType.toLowerCase(), [headerType.toLowerCase()]: { link } }]
            });
        }
    }

    // ── Ana gövde değişkenleri ──────────────────────────────────
    if (bodyParams.length > 0) {
        components.push({
            type: 'body',
            parameters: bodyParams.map(t => ({ type: 'text', text: String(t ?? '') }))
        });
    }

    // ── Carousel ────────────────────────────────────────────────
    const metaKartlar = getCarouselCards(template);
    if (metaKartlar.length > 0) {
        const yerelKartlar = getLocalCards(template);
        const cards = [];

        for (let i = 0; i < metaKartlar.length; i++) {
            const girdi = cardInputs[i] || {};
            const yerel = yerelKartlar[i] || {};
            const metaKart = metaKartlar[i] || {};

            const kartBilesenleri = [];

            // Başlık: gönderen verdiyse o, yoksa şablonu kurarken sakladığımız URL.
            const metaHeader = (metaKart.components || [])
                .find(c => String(c.type).toUpperCase() === 'HEADER');
            const format = String(girdi.headerFormat || yerel.headerFormat || metaHeader?.format || 'IMAGE').toLowerCase();
            const kartMedya = toPublicUrl(girdi.mediaUrl || yerel.mediaUrl || null);
            if (kartMedya) {
                kartBilesenleri.push({
                    type: 'header',
                    parameters: [{ type: format, [format]: { link: kartMedya } }]
                });
            }

            // Gövde değişkenleri — kartın metnindeki {{n}} sayısı kadar.
            const metaBody = (metaKart.components || [])
                .find(c => String(c.type).toUpperCase() === 'BODY');
            const degiskenSayisi = ((metaBody?.text || yerel.bodyText || '').match(/\{\{\d+\}\}/g) || []).length;
            if (degiskenSayisi > 0) {
                const degerler = girdi.bodyParams || [];
                kartBilesenleri.push({
                    type: 'body',
                    parameters: Array.from({ length: degiskenSayisi }, (_, x) => ({
                        type: 'text',
                        text: String(degerler[x] ?? '')
                    }))
                });
            }

            // Butonlar: quick_reply için payload zorunlu. Gönderen vermediyse
            // kart indeksinden üretiyoruz ki yanıt geldiğinde hangi karttan
            // geldiği anlaşılsın.
            const metaButtons = (metaKart.components || [])
                .find(c => String(c.type).toUpperCase() === 'BUTTONS');
            (metaButtons?.buttons || []).forEach((btn, bIdx) => {
                const tur = String(btn.type || '').toUpperCase();
                if (tur === 'QUICK_REPLY') {
                    kartBilesenleri.push({
                        type: 'button',
                        sub_type: 'quick_reply',
                        index: String(bIdx),
                        parameters: [{
                            type: 'payload',
                            payload: girdi.buttonPayloads?.[bIdx] || `kart_${i}_buton_${bIdx}`
                        }]
                    });
                } else if (tur === 'URL' && btn.example) {
                    // Değişkenli URL butonu: son parçayı gönderen doldurur.
                    const deger = girdi.buttonUrlParams?.[bIdx];
                    if (deger) {
                        kartBilesenleri.push({
                            type: 'button',
                            sub_type: 'url',
                            index: String(bIdx),
                            parameters: [{ type: 'text', text: String(deger) }]
                        });
                    }
                }
            });

            cards.push({ card_index: i, components: kartBilesenleri });
        }

        components.push({ type: 'carousel', cards });
    }

    return components;
}

export default { parseComponents, hasCarousel, getCarouselCards, getLocalCards, buildSendComponents, toPublicUrl };
