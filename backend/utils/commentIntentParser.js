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
 * Metinden saat çıkarımı yapar: "saat 9", "saat 9 da", "saat 14:30", "9 da ara"
 * @returns {{ hour: number, minute: number } | null}
 */
function parseTime(text) {
    const lower = text.toLowerCase().replace(/ı/g, 'i');

    // "saat 9", "saat 9 da", "saat 14:30", "saat 9:00"
    const saatMatch = lower.match(/saat\s*(\d{1,2})(?::(\d{2}))?/);
    if (saatMatch) {
        const hour = parseInt(saatMatch[1]);
        const minute = parseInt(saatMatch[2] || '0');
        if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
            return { hour, minute };
        }
    }

    // "9 da ara", "9'da ara", "9da ara" (tek başına saat + aksiyon kelimesi)
    const saatAksiyonMatch = lower.match(/\b(\d{1,2})\s*(?:'?\s*da|'?\s*de)\s*(?:ara|görüş|dön|gel)/);
    if (saatAksiyonMatch) {
        const hour = parseInt(saatAksiyonMatch[1]);
        if (hour >= 7 && hour <= 22) { // Makul saat aralığı
            return { hour, minute: 0 };
        }
    }

    return null;
}

// ── Dinamik Saat Dilimi Desteği ─────────────────────────────
const DEFAULT_TIMEZONE = 'Europe/Istanbul';

/**
 * Verilen IANA timezone için UTC'ye göre ofset hesaplar (milisaniye).
 * DST'yi otomatik olarak doğru yönetir.
 * @param {string} timezone - IANA timezone (ör: "Europe/Istanbul", "America/New_York")
 * @returns {number} Ofset (ms) — UTC+3 için +10800000, UTC-5 için -18000000
 */
function getTimezoneOffsetMs(timezone) {
    try {
        const now = new Date();
        const utcStr = now.toLocaleString('en-US', { timeZone: 'UTC' });
        const tzStr = now.toLocaleString('en-US', { timeZone: timezone });
        return new Date(tzStr).getTime() - new Date(utcStr).getTime();
    } catch {
        // Geçersiz timezone → Türkiye varsayılan
        return 3 * 60 * 60 * 1000;
    }
}

/**
 * Verilen saat diliminde "şu anki zamanı" döndürür.
 * getDay(), getHours() vb. metotlar o saat diliminin zamanını yansıtır.
 * @param {string} timezone - IANA timezone
 * @returns {{ now: Date, shiftMs: number }}
 */
function getTimezoneNow(timezone = DEFAULT_TIMEZONE) {
    const tzOffsetMs = getTimezoneOffsetMs(timezone);
    const shiftMs = tzOffsetMs + new Date().getTimezoneOffset() * 60000;
    return { now: new Date(Date.now() + shiftMs), shiftMs };
}

/**
 * Kaydırılmış timezone Date'i gerçek UTC Date'e dönüştürür (DB'ye yazım için).
 */
function timezoneToUTC(tzDate, shiftMs) {
    return new Date(tzDate.getTime() - shiftMs);
}

/**
 * Metinden tarih çıkarımı yapar.
 * Workspace'in saat dilimine göre hesaplar — sunucu herhangi bir timezone'da olsa bile doğru çalışır.
 * Önce tarihi, sonra saati parse eder. Saat belirtilmişse varsayılan 10:00 yerine onu kullanır.
 * @param {string} text - Parse edilecek metin
 * @param {string} timezone - IANA timezone (varsayılan: Europe/Istanbul)
 */
function parseDate(text, timezone = DEFAULT_TIMEZONE) {
    const { now, shiftMs } = getTimezoneNow(timezone);
    const lower = text.toLowerCase().replace(/ı/g, 'i');
    let d = null;

    // ── Bugün ──
    if (/\bbugün\b|\bbugun\b/.test(lower)) {
        d = new Date(now);
        d.setHours(d.getHours() + 1, 0, 0, 0);
    }

    // ── Yarın ──
    if (!d && /\byarın\b|\byarin\b/.test(lower)) {
        d = new Date(now);
        d.setDate(d.getDate() + 1);
        d.setHours(10, 0, 0, 0);
    }

    // ── Öbür gün ──
    if (!d && /\böbür\s*gün\b|\bobur\s*gun\b/.test(lower)) {
        d = new Date(now);
        d.setDate(d.getDate() + 2);
        d.setHours(10, 0, 0, 0);
    }

    // ── X gün/hafta/ay sonra ──
    if (!d) {
        const sonraMatch = lower.match(/(\d+)\s*(saat|gün|gun|hafta|ay)\s*sonra/);
        if (sonraMatch) {
            const n = parseInt(sonraMatch[1]);
            const unit = sonraMatch[2];
            d = new Date(now);
            if (unit === 'saat') d.setHours(d.getHours() + n);
            else if (unit === 'gün' || unit === 'gun') { d.setDate(d.getDate() + n); d.setHours(10, 0, 0, 0); }
            else if (unit === 'hafta') { d.setDate(d.getDate() + (n * 7)); d.setHours(10, 0, 0, 0); }
            else if (unit === 'ay') { d.setMonth(d.getMonth() + n); d.setHours(10, 0, 0, 0); }
        }
    }

    // ── Haftaya [gün] birleşik pattern: "haftaya salı", "önümüzdeki hafta cuma" ──
    if (!d) {
        const haftayaGunRegex = /(?:haftaya|önümüzdeki\s*hafta|onumuzdeki\s*hafta)\s*(pazartesi|sali|salı|çarşamba|çarsamba|perşembe|persembe|cuma|cumartesi|pazar)/i;
        const haftayaGunMatch = lower.match(haftayaGunRegex);
        if (haftayaGunMatch) {
            const matchedGun = haftayaGunMatch[1];
            const normalize = (s) => s.replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ö/g, 'o').replace(/ü/g, 'u');
            let targetDayNo = null;
            for (const [key, val] of Object.entries(GUN_ISIMLERI)) {
                if (normalize(key) === normalize(matchedGun)) {
                    targetDayNo = val;
                    break;
                }
            }
            if (targetDayNo !== null) {
                d = new Date(now);
                const daysUntilMonday = (8 - d.getDay()) % 7 || 7;
                d.setDate(d.getDate() + daysUntilMonday);
                let offsetFromMonday = targetDayNo - 1;
                if (offsetFromMonday < 0) offsetFromMonday += 7;
                d.setDate(d.getDate() + offsetFromMonday);
                d.setHours(10, 0, 0, 0);
            }
        }
    }

    // ── Haftaya (gün belirtmeden) → Pazartesi ──
    if (!d && /\bhaftaya\b|\bönümüzdeki\s*hafta\b|\bonumuzdeki\s*hafta\b/.test(lower)) {
        d = new Date(now);
        const daysUntilMonday = (8 - d.getDay()) % 7 || 7;
        d.setDate(d.getDate() + daysUntilMonday);
        d.setHours(10, 0, 0, 0);
    }

    // ── Önümüzdeki ay ──
    if (!d && /\bönümüzdeki\s*ay\b|\bonumuzdeki\s*ay\b|\bgelecek\s*ay\b/.test(lower)) {
        d = new Date(now);
        d.setMonth(d.getMonth() + 1);
        d.setDate(1);
        d.setHours(10, 0, 0, 0);
    }

    // ── Gün adı (bu haftanın bir sonraki günü): "salı", "cuma" ──
    if (!d) {
        for (const [gunAdi, gunNo] of Object.entries(GUN_ISIMLERI)) {
            const regex = new RegExp(`\\b${gunAdi}\\b`, 'i');
            if (regex.test(lower)) {
                d = new Date(now);
                const currentDay = d.getDay();
                let daysAhead = gunNo - currentDay;
                if (daysAhead <= 0) daysAhead += 7;
                d.setDate(d.getDate() + daysAhead);
                d.setHours(10, 0, 0, 0);
                break;
            }
        }
    }

    // ── Bu hafta ──
    if (!d && /\bbu\s*hafta\b/.test(lower)) {
        d = new Date(now);
        d.setDate(d.getDate() + 2);
        d.setHours(10, 0, 0, 0);
    }

    // ── Saat override: Tarih bulunduysa, saat bilgisi varsa uygula ──
    if (d) {
        const time = parseTime(text);
        if (time) {
            d.setHours(time.hour, time.minute, 0, 0);
        }
        // Kaydırılmış Turkey zamanını gerçek UTC'ye dönüştür
        return timezoneToUTC(d, shiftMs);
    }

    return d;
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
 * @param {string} text - Parse edilecek metin
 * @param {string} timezone - IANA timezone (varsayılan: Europe/Istanbul)
 */
export function parseCommentIntent(text, timezone = 'Europe/Istanbul') {
    if (!text || text.length < 3) {
        return { hasIntent: false, action: null, dueDate: null, mention: null, summary: '' };
    }

    const dueDate = parseDate(text, timezone);
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
            timeZone: timezone,
            weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
        });
        summary = `📅 ${actionLabel} planlandı: ${dateLabel}`;
        if (mention) summary += ` → @${mention}`;
    }

    return { hasIntent, action, dueDate, mention, summary };
}

export default parseCommentIntent;
