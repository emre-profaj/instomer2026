/**
 * ═══════════════════════════════════════════════════════════════
 * TERCİH EDİLEN ARAMA SAATİ — ORTAK AYRIŞTIRICI
 * ═══════════════════════════════════════════════════════════════
 *
 * Müşterinin "ne zaman aranmak istersiniz?" cevabını
 * { startHour, startMinute, endHour, endMinute } biçimine çevirir.
 *
 * İki kaynak var:
 *   1. Serbest metin — sohbet mesajı ("saat 15-18 arası arayın")
 *   2. Lead formu alanı — yapılandırılmış cevap ("12:00-15:00")
 *
 * Ayrıştırma mantığı daha önce retell.controller.js içinde ÖZELDİ ve
 * yalnızca oradan erişilebiliyordu. Facebook lead formundaki cevap bu
 * yüzden hiç okunamıyordu: veri fieldData'da duruyor, onu çözebilecek
 * tek kod başka dosyada kapalı duruyordu.
 */

/**
 * Serbest metinden saat aralığı çıkarır.
 *
 * Desteklenen biçimler:
 *   "12:00-15:00" · "12:00 – 15:00"   → tam biçim
 *   "saat 15-18 arası" · "saat 15-18" → "saat" bağlamıyla
 *   "15-18 arası"                     → "arası" ekiyle
 *
 * Bağlam şartı kasıtlı: bağlamsız "3-5" gibi ifadeler tarih, kod veya
 * fiyat olabilir; saat sanılıp yanlış zamanda arama yapılmasın.
 *
 * @param {string} text
 * @param {(msg: string) => void} [log] — opsiyonel günlükleyici
 * @returns {{startHour:number,startMinute:number,endHour:number,endMinute:number}|null}
 */
export function parseTimeWindow(text, log = () => {}) {
    if (!text || typeof text !== 'string') return null;
    const lower = text.toLowerCase();

    // 1) "15:00-18:00" — iki nokta üst üste ile tam biçim
    const hhmm = lower.match(/(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/);
    if (hhmm) {
        const sH = parseInt(hhmm[1]), sM = parseInt(hhmm[2]);
        const eH = parseInt(hhmm[3]), eM = parseInt(hhmm[4]);
        if (sH >= 6 && eH > sH && eH <= 23) {
            log(`HH:MM aralığı: ${sH}:${String(sM).padStart(2, '0')}-${eH}:${String(eM).padStart(2, '0')}`);
            return { startHour: sH, startMinute: sM, endHour: eH, endMinute: eM };
        }
    }

    // 2) "saat 15-18" / "saat 15-18 arası"
    const withSaat = lower.match(/saat\s*(\d{1,2})\s*[-–]\s*(\d{1,2})(?:\s*(?:aras[ıi]|saat))?/);
    if (withSaat) {
        const sH = parseInt(withSaat[1]), eH = parseInt(withSaat[2]);
        if (sH >= 6 && eH > sH && eH <= 23 && eH - sH <= 8) {
            log(`"saat X-Y" aralığı: ${sH}-${eH}`);
            return { startHour: sH, startMinute: 0, endHour: eH, endMinute: 0 };
        }
    }

    // 3) "15-18 arası"
    const withArasi = lower.match(/(\d{1,2})\s*[-–]\s*(\d{1,2})\s+aras[ıi]/);
    if (withArasi) {
        const sH = parseInt(withArasi[1]), eH = parseInt(withArasi[2]);
        if (sH >= 6 && eH > sH && eH <= 23 && eH - sH <= 8) {
            log(`"X-Y arası" aralığı: ${sH}-${eH}`);
            return { startHour: sH, startMinute: 0, endHour: eH, endMinute: 0 };
        }
    }

    return null;
}

// ─────────────────────────────────────────────────────────────────────
// LEAD FORMU ALANI
// ─────────────────────────────────────────────────────────────────────

/** İletişim alanları — saat sorusu olarak değerlendirilmez. */
const CONTACT_KEYS = [
    'full_name', 'name', 'first_name', 'last_name', 'ad', 'soyad', 'isim',
    'phone_number', 'phone', 'telefon', 'gsm', 'cep',
    'email', 'e_mail', 'eposta', 'e_posta',
    'city', 'sehir', 'şehir', 'il', 'ilce', 'ilçe', 'adres', 'address',
];

/** Saat sorusuna işaret eden anahtar kelimeler. */
const TIME_HINTS = ['saat', 'zaman', 'dilim', 'ulaş', 'ulas', 'ara', 'müsait', 'musait', 'uygun'];

/** Facebook'un otomatik test lead'leri — gerçek cevap değil. */
const isTestValue = (v) => /^<.*test lead.*>$/i.test(String(v || '').trim());

const normalizeKey = (k) => String(k || '').toLowerCase().replace(/[?_\s-]+/g, '');

/**
 * Lead formu alanlarından tercih edilen arama saatini çıkarır.
 *
 * Her firma soruyu kendi cümlesiyle soruyor
 * ("Size Hangi Saat Diliminde Ulaşalım?", "Ne zaman arayalım?", …),
 * bu yüzden sabit bir alan adına güvenilemez. İki kademeli arama:
 *
 *   1. Anahtarı saat/zaman/ulaş gibi bir ipucu içeren alanlar
 *   2. Bulunamazsa: iletişim alanı OLMAYAN ve değeri saat aralığına
 *      benzeyen herhangi bir alan
 *
 * İkinci kademe, soruyu hiç tahmin edemediğimiz formlarda da çalışır —
 * "12:00-15:00" gibi bir değer isim veya e-posta alanında bulunamaz.
 *
 * @param {object|string} fieldData — lead form alanları (nesne veya JSON metni)
 * @returns {{window:object, fieldKey:string, rawValue:string}|null}
 */
export function extractPreferredWindowFromLead(fieldData) {
    let data = fieldData;
    if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch { return null; }
    }
    if (!data || typeof data !== 'object') return null;

    const entries = Object.entries(data).filter(([, v]) => v && !isTestValue(v));

    // 1. kademe — anahtarda saat ipucu
    for (const [key, value] of entries) {
        const nk = normalizeKey(key);
        if (CONTACT_KEYS.some(c => nk === normalizeKey(c))) continue;
        if (!TIME_HINTS.some(h => nk.includes(normalizeKey(h)))) continue;

        const win = parseTimeWindow(String(value));
        if (win) return { window: win, fieldKey: key, rawValue: String(value) };
    }

    // 2. kademe — değeri saat aralığına benzeyen herhangi bir alan
    for (const [key, value] of entries) {
        const nk = normalizeKey(key);
        if (CONTACT_KEYS.some(c => nk === normalizeKey(c))) continue;

        const win = parseTimeWindow(String(value));
        if (win) return { window: win, fieldKey: key, rawValue: String(value) };
    }

    return null;
}

/** Günlüğe basmak için okunabilir biçim: "12:00–15:00" */
export function formatWindow(w) {
    if (!w) return '-';
    const p = (n) => String(n).padStart(2, '0');
    return `${p(w.startHour)}:${p(w.startMinute)}–${p(w.endHour)}:${p(w.endMinute)}`;
}
