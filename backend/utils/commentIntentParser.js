/**
 * commentIntentParser.js
 * ──────────────────────────────────────────
 * Yorum ve arama notlarından akıllı intent çıkarımı.
 *
 * 1. ZAMANLAMA: "yarın ara", "cuma görüşelim", "önümüzdeki ay gelecek"
 *    → Otomatik CALL / MEETING aktivitesi planlar.
 *
 * 2. AŞAMA DEĞİŞİKLİĞİ: "ilgisiz", "ulaşılamadı", "pahalı buldu"
 *    → Akıştaki aşamayı otomatik değiştirir (kayıp, ulaşılamadı vb.)
 */

// ── Gün İsimleri ───────────────────────────────────────────
const GUN_ISIMLERI = {
    'pazartesi': 1, 'salı': 2, 'çarşamba': 3, 'çarsamba': 3,
    'perşembe': 4, 'persembe': 4, 'cuma': 5, 'cumartesi': 6, 'pazar': 0
};

// ── Aksiyon Anahtar Kelimeleri ──────────────────────────────
const CALL_KEYWORDS = [
    'ara', 'arayın', 'aransın', 'aranacak', 'arayalım', 'ararız',
    'telefon', 'arayacak', 'arayacağız', 'dön', 'dönelim', 'dönüş',
    'dönüş yap', 'geri dön', 'geri arayın', 'tekrar ara'
];

const MEETING_KEYWORDS = [
    'görüş', 'görüşme', 'görüşelim', 'görüşecek', 'görüşeceğiz',
    'randevu', 'toplantı', 'buluş', 'buluşalım', 'gel', 'gelecek',
    'gelebilir', 'gelsin', 'ziyaret', 'görüşme yap', 'uğra'
];

// ── Aşama Değişikliği Algılama ──────────────────────────────
// Her kategori: tetikleyici kelimeler + akışta aranacak aşama isimleri
const STAGE_INTENTS = [
    {
        category: 'LOST',
        label: 'Kayıp',
        triggerWords: [
            'ilgisiz', 'ilgilenmiyor', 'ilgilenmedi', 'istemedi', 'istemiyor',
            'vazgeçti', 'vazgecti', 'iptal', 'reddetti', 'kabul etmedi',
            'almak istemiyor', 'almayacak', 'ilgisi yok'
        ],
        stageSearch: ['kayıp', 'kayip', 'lost', 'kaybedildi', 'reddedildi', 'iptal']
    },
    {
        category: 'LOST_PRICE',
        label: 'Kayıp (Fiyat)',
        triggerWords: [
            'pahalı', 'pahali', 'fiyat yüksek', 'fiyat yuksek', 'bütçe yok',
            'butce yok', 'bütçesi yetmiyor', 'ucuz değil', 'fiyatı beğenmedi',
            'fiyattan vazgeçti', 'pahalı buldu', 'pahali buldu', 'fiyat uymuyor'
        ],
        stageSearch: ['kayıp', 'kayip', 'lost', 'fiyat', 'kaybedildi']
    },
    {
        category: 'UNREACHABLE',
        label: 'Ulaşılamadı',
        triggerWords: [
            'ulaşılamadı', 'ulasilamadi', 'ulaşamadık', 'ulasamadik',
            'cevap yok', 'telefon açmadı', 'telefon acmadi', 'açmıyor',
            'acmiyor', 'meşgul', 'mesgul', 'kapalı', 'kapali',
            'erişilemiyor', 'ulaşılamıyor', 'cevap vermiyor', 'dönmedi',
            'geri dönmedi', 'yanıt yok'
        ],
        stageSearch: ['ulaşılamadı', 'ulasilamadi', 'unreachable', 'ulaşılamıyor', 'cevap yok']
    },
    {
        category: 'LOST_COMPETITOR',
        label: 'Kayıp (Rakip)',
        triggerWords: [
            'rakip', 'rakibe', 'başka firma', 'başka yerden', 'baska yerden',
            'başkasından', 'baskalarindan', 'başka şirket', 'alternatif seçti',
            'rakibe gitti', 'başka yerden aldı'
        ],
        stageSearch: ['kayıp', 'kayip', 'lost', 'rakip', 'kaybedildi']
    },
    {
        category: 'WON',
        label: 'Kazanıldı',
        triggerWords: [
            'müşteri oldu', 'musteri oldu', 'satış yapıldı', 'satis yapildi',
            'kazanıldı', 'kazanildi', 'anlaştık', 'anlastik', 'onayladı',
            'kabul etti', 'sözleşme imzalandı', 'sozlesme imzalandi',
            'ödeme yaptı', 'odeme yapti', 'satın aldı', 'satin aldi'
        ],
        stageSearch: ['kazanıldı', 'kazanildi', 'won', 'müşteri', 'musteri', 'tamamlandı', 'kapatıldı']
    },
    {
        category: 'THINKING',
        label: 'Düşünüyor',
        triggerWords: [
            'düşünecek', 'dusunecek', 'düşünüyor', 'dusunuyor',
            'karar verecek', 'eşiyle görüşecek', 'esiyle gorusecek',
            'ailesine danışacak', 'ailesine danisacak', 'kararsız',
            'kararsiz', 'emin değil', 'emin degil'
        ],
        stageSearch: ['düşünüyor', 'dusunuyor', 'beklemede', 'kararsız', 'kararsiz', 'takipte']
    }
];

/**
 * Metinden tarih çıkarımı yapar.
 */
function parseDate(text) {
    const now = new Date();
    const lower = text.toLowerCase().replace(/ı/g, 'i');

    if (/\bbugün\b|\bbugun\b/.test(lower)) {
        const d = new Date(now);
        d.setHours(d.getHours() + 1, 0, 0, 0);
        return d;
    }

    if (/\byarın\b|\byarin\b/.test(lower)) {
        const d = new Date(now);
        d.setDate(d.getDate() + 1);
        d.setHours(10, 0, 0, 0);
        return d;
    }

    if (/\böbür\s*gün\b|\bobur\s*gun\b/.test(lower)) {
        const d = new Date(now);
        d.setDate(d.getDate() + 2);
        d.setHours(10, 0, 0, 0);
        return d;
    }

    const sonraMatch = lower.match(/(\d+)\s*(saat|gün|gun|hafta|ay)\s*sonra/);
    if (sonraMatch) {
        const n = parseInt(sonraMatch[1]);
        const unit = sonraMatch[2];
        const d = new Date(now);
        if (unit === 'saat') d.setHours(d.getHours() + n);
        else if (unit === 'gün' || unit === 'gun') { d.setDate(d.getDate() + n); d.setHours(10, 0, 0, 0); }
        else if (unit === 'hafta') { d.setDate(d.getDate() + (n * 7)); d.setHours(10, 0, 0, 0); }
        else if (unit === 'ay') { d.setMonth(d.getMonth() + n); d.setHours(10, 0, 0, 0); }
        return d;
    }

    if (/\bhaftaya\b|\bönümüzdeki\s*hafta\b|\bonumuzdeki\s*hafta\b/.test(lower)) {
        const d = new Date(now);
        const daysUntilMonday = (8 - d.getDay()) % 7 || 7;
        d.setDate(d.getDate() + daysUntilMonday);
        d.setHours(10, 0, 0, 0);
        return d;
    }

    if (/\bönümüzdeki\s*ay\b|\bonumuzdeki\s*ay\b|\bgelecek\s*ay\b/.test(lower)) {
        const d = new Date(now);
        d.setMonth(d.getMonth() + 1);
        d.setDate(1);
        d.setHours(10, 0, 0, 0);
        return d;
    }

    for (const [gunAdi, gunNo] of Object.entries(GUN_ISIMLERI)) {
        const regex = new RegExp(`\\b${gunAdi}\\b`, 'i');
        if (regex.test(lower)) {
            const d = new Date(now);
            const currentDay = d.getDay();
            let daysAhead = gunNo - currentDay;
            if (daysAhead <= 0) daysAhead += 7;
            d.setDate(d.getDate() + daysAhead);
            d.setHours(10, 0, 0, 0);
            return d;
        }
    }

    if (/\bbu\s*hafta\b/.test(lower)) {
        const d = new Date(now);
        d.setDate(d.getDate() + 2);
        d.setHours(10, 0, 0, 0);
        return d;
    }

    return null;
}

/**
 * Metinden aksiyon tipini çıkarır.
 */
function parseAction(text) {
    const lower = text.toLowerCase();

    for (const kw of CALL_KEYWORDS) {
        const regex = new RegExp(`\\b${kw}`, 'i');
        if (regex.test(lower)) return 'CALL';
    }

    for (const kw of MEETING_KEYWORDS) {
        const regex = new RegExp(`\\b${kw}`, 'i');
        if (regex.test(lower)) return 'MEETING';
    }

    return null;
}

/**
 * Metinden @mention çıkarır.
 */
function parseMention(text) {
    const match = text.match(/@([a-zA-ZçğıöşüÇĞİÖŞÜ\s]+?)(?:\s+(?:yarın|bugün|haftaya|ara|görüş|cuma|pazartesi|salı|çarşamba|perşembe|cumartesi|pazar|önümüzdeki|\d)|\s*$)/i);
    if (match) return match[1].trim();

    const simpleMatch = text.match(/@([a-zA-ZçğıöşüÇĞİÖŞÜ]+(?:\s+[a-zA-ZçğıöşüÇĞİÖŞÜ]+)?)/);
    if (simpleMatch) return simpleMatch[1].trim();

    return null;
}

/**
 * Metinden aşama değişikliği intent'i çıkarır.
 *
 * @param {string} text
 * @returns {{ hasStageIntent: boolean, category: string|null, label: string|null, stageSearch: string[], reason: string }}
 */
export function parseStageIntent(text) {
    if (!text || text.length < 2) {
        return { hasStageIntent: false, category: null, label: null, stageSearch: [], reason: '' };
    }

    const lower = text.toLowerCase();

    for (const intent of STAGE_INTENTS) {
        for (const trigger of intent.triggerWords) {
            if (lower.includes(trigger)) {
                return {
                    hasStageIntent: true,
                    category: intent.category,
                    label: intent.label,
                    stageSearch: intent.stageSearch,
                    reason: text.substring(0, 200)
                };
            }
        }
    }

    return { hasStageIntent: false, category: null, label: null, stageSearch: [], reason: '' };
}

/**
 * Zamanlama intent'i çıkarır (arama/görüşme planlama).
 */
export function parseCommentIntent(text) {
    if (!text || text.length < 3) {
        return { hasIntent: false, action: null, dueDate: null, mention: null, summary: '' };
    }

    const dueDate = parseDate(text);
    let action = parseAction(text);
    const mention = parseMention(text);

    // Tarih var ama aksiyon yok → varsayılan CALL
    if (dueDate && !action) {
        action = 'CALL';
    }

    const hasIntent = !!(dueDate && action);

    let summary = '';
    if (hasIntent) {
        const actionLabel = action === 'CALL' ? 'Arama' : 'Görüşme';
        const dateLabel = dueDate.toLocaleDateString('tr-TR', {
            weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
        });
        summary = `📅 ${actionLabel} planlandı: ${dateLabel}`;
        if (mention) summary += ` → @${mention}`;
    }

    return { hasIntent, action, dueDate, mention, summary };
}

export default parseCommentIntent;
