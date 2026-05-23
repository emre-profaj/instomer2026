/**
 * commentIntentParser.js
 * ──────────────────────────────────────────
 * Yorum ve arama notlarından akıllı intent çıkarımı.
 *
 * "yarın ara", "cuma görüşelim", "önümüzdeki ay gelecek",
 * "3 gün sonra arayın", "@satış ekibi haftaya ara" gibi
 * ifadelerden otomatik CALL / MEETING aktivitesi planlar.
 */

// ── Gün İsimleri ───────────────────────────────────────────
const GUN_ISIMLERI = {
    'pazartesi': 1, 'salı': 2, 'salı': 2, 'çarşamba': 3, 'çarsamba': 3,
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

/**
 * Metinden tarih çıkarımı yapar.
 * @param {string} text - Kullanıcının yazdığı metin
 * @returns {Date|null} - Çıkarılan tarih veya null
 */
function parseDate(text) {
    const now = new Date();
    const lower = text.toLowerCase().replace(/ı/g, 'i');

    // ── "bugün" ──
    if (/\bbugün\b|\bbugun\b/.test(lower)) {
        const d = new Date(now);
        d.setHours(d.getHours() + 1, 0, 0, 0); // 1 saat sonra
        return d;
    }

    // ── "yarın" ──
    if (/\byarın\b|\byarin\b/.test(lower)) {
        const d = new Date(now);
        d.setDate(d.getDate() + 1);
        d.setHours(10, 0, 0, 0);
        return d;
    }

    // ── "öbür gün" / "2 gün sonra" ──
    if (/\böbür\s*gün\b|\bobur\s*gun\b/.test(lower)) {
        const d = new Date(now);
        d.setDate(d.getDate() + 2);
        d.setHours(10, 0, 0, 0);
        return d;
    }

    // ── "N saat/gün/hafta/ay sonra" ──
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

    // ── "haftaya" / "önümüzdeki hafta" ──
    if (/\bhaftaya\b|\bönümüzdeki\s*hafta\b|\bonumuzdeki\s*hafta\b/.test(lower)) {
        const d = new Date(now);
        const daysUntilMonday = (8 - d.getDay()) % 7 || 7;
        d.setDate(d.getDate() + daysUntilMonday);
        d.setHours(10, 0, 0, 0);
        return d;
    }

    // ── "önümüzdeki ay" / "gelecek ay" ──
    if (/\bönümüzdeki\s*ay\b|\bonumuzdeki\s*ay\b|\bgelecek\s*ay\b/.test(lower)) {
        const d = new Date(now);
        d.setMonth(d.getMonth() + 1);
        d.setDate(1);
        d.setHours(10, 0, 0, 0);
        return d;
    }

    // ── Belirli gün isimleri: "cuma", "pazartesi" vb. ──
    for (const [gunAdi, gunNo] of Object.entries(GUN_ISIMLERI)) {
        const regex = new RegExp(`\\b${gunAdi}\\b`, 'i');
        if (regex.test(lower)) {
            const d = new Date(now);
            const currentDay = d.getDay();
            let daysAhead = gunNo - currentDay;
            if (daysAhead <= 0) daysAhead += 7; // Gelecek haftayı al
            d.setDate(d.getDate() + daysAhead);
            d.setHours(10, 0, 0, 0);
            return d;
        }
    }

    // ── "bu hafta" ──
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
 * @param {string} text - Kullanıcının yazdığı metin
 * @returns {'CALL'|'MEETING'|null}
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
 * @param {string} text
 * @returns {string|null} - Mention edilen isim (@'den sonra)
 */
function parseMention(text) {
    const match = text.match(/@([a-zA-ZçğıöşüÇĞİÖŞÜ\s]+?)(?:\s+(?:yarın|bugün|haftaya|ara|görüş|cuma|pazartesi|salı|çarşamba|perşembe|cumartesi|pazar|önümüzdeki|\d)|\s*$)/i);
    if (match) {
        return match[1].trim();
    }
    // Basit @mention: @isim
    const simpleMatch = text.match(/@([a-zA-ZçğıöşüÇĞİÖŞÜ]+(?:\s+[a-zA-ZçğıöşüÇĞİÖŞÜ]+)?)/);
    if (simpleMatch) {
        return simpleMatch[1].trim();
    }
    return null;
}

/**
 * Ana fonksiyon: Metni analiz edip intent döner.
 *
 * @param {string} text - Yorum veya görüşme notu metni
 * @returns {{ hasIntent: boolean, action: 'CALL'|'MEETING'|null, dueDate: Date|null, mention: string|null, summary: string }}
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
