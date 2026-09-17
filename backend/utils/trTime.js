/**
 * ═══════════════════════════════════════════════════════════════
 * TÜRKİYE SAATİ — ORTAK DÖNÜŞÜM
 * ═══════════════════════════════════════════════════════════════
 *
 * Sunucu Etc/UTC çalışıyor. Bu yüzden saat dilimi bilgisi taşımayan
 * her ifade UTC sanılıyor:
 *
 *   new Date("2026-09-17T15:00:00")   → 15:00 UTC  ❌  (18:00 TR görünür)
 *   d.setHours(15, 0)                 → 15:00 UTC  ❌
 *
 * Müşteri "15:00" dediğinde kastettiği Türkiye saati. Doğrusu 12:00 UTC.
 * Kaydedilen değer +3 kaydığı için takvimde randevular hep ileride
 * görünüyordu (gerçek vaka: bot 15:00 dedi, takvim 18:00 gösterdi).
 *
 * Aynı dönüşüm projede üç ayrı yerde yazılmıştı; biri doğru
 * (appointmentBot.service.js, "+03:00" ekliyor), ikisi yanlıştı.
 * Artık hepsi buradan geçiyor.
 *
 * NOT: Türkiye 2016'dan beri kalıcı UTC+3 kullanıyor, yaz saati
 * uygulaması yok. Sabit ofset bu yüzden güvenli.
 */

/** Türkiye UTC ofseti (saat). Yaz saati yok. */
export const TR_OFFSET_HOURS = 3;

const TR_TZ = 'Europe/Istanbul';

/**
 * Bir Date'in Türkiye takvimindeki gün/ay/yılını verir.
 * @returns {{year:number, month:number, day:number}} month 1-12
 */
export function trDateParts(date = new Date()) {
    // en-CA → "YYYY-MM-DD", ayrıştırması kolay ve yerelden bağımsız
    const [y, m, d] = new Intl.DateTimeFormat('en-CA', {
        timeZone: TR_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(date).split('-').map(Number);
    return { year: y, month: m, day: d };
}

/**
 * Türkiye duvar saatinden gerçek (UTC) Date üretir.
 *
 *   trTimeToDate(2026, 9, 17, 15, 0)  →  2026-09-17T12:00:00.000Z
 *
 * @param {number} year
 * @param {number} month 1-12
 * @param {number} day
 * @param {number} hours   TR saati
 * @param {number} minutes
 */
export function trTimeToDate(year, month, day, hours = 0, minutes = 0) {
    return new Date(Date.UTC(year, month - 1, day, hours - TR_OFFSET_HOURS, minutes, 0, 0));
}

/**
 * Verilen tarihin TÜRKİYE takvim gününde, belirtilen TR saatini döndürür.
 * `setHours` yerine bunu kullan: setHours sunucu yerelinde (UTC) çalışır.
 *
 * @param {Date|string} baseDate — gün bilgisi buradan alınır
 * @param {string|{hours:number,minutes:number}} time — "15:00" veya {hours,minutes}
 * @returns {Date|null}
 */
export function setTrTime(baseDate, time) {
    const base = baseDate instanceof Date ? baseDate : new Date(baseDate);
    if (isNaN(base.getTime())) return null;

    let h, m;
    if (typeof time === 'string') {
        const parts = time.split(':').map(Number);
        h = parts[0]; m = parts[1] || 0;
    } else if (time && typeof time === 'object') {
        h = time.hours; m = time.minutes || 0;
    }
    if (!Number.isFinite(h)) return null;

    const { year, month, day } = trDateParts(base);
    return trTimeToDate(year, month, day, h, m);
}

/**
 * "2026-09-17" + "15:00" → gerçek Date (TR saati olarak yorumlanır).
 * Tarih biçimleri: "YYYY-MM-DD", "DD.MM.YYYY", "DD-MM-YYYY", "DD/MM/YYYY"
 *
 * @returns {Date|null} — ayrıştırılamazsa null (çağıran karar versin;
 *   sessizce "şimdi"ye düşmek yanlış saatli randevu üretiyordu)
 */
export function parseTrDateTime(dateStr, timeStr = '09:00') {
    if (!dateStr) return null;
    const s = String(dateStr).trim();

    let year, month, day;
    const iso = s.match(/^(\d{4})[-.\/](\d{1,2})[-.\/](\d{1,2})/);
    const dmy = s.match(/^(\d{1,2})[-.\/](\d{1,2})[-.\/](\d{4})/);

    if (iso) {
        year = +iso[1]; month = +iso[2]; day = +iso[3];
    } else if (dmy) {
        day = +dmy[1]; month = +dmy[2]; year = +dmy[3];
    } else {
        return null;
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;

    const t = String(timeStr || '09:00').match(/(\d{1,2})[:.](\d{2})/);
    const h = t ? +t[1] : 9;
    const m = t ? +t[2] : 0;
    if (h > 23 || m > 59) return null;

    const d = trTimeToDate(year, month, day, h, m);
    return isNaN(d.getTime()) ? null : d;
}

/** Günlük/mesaj için TR biçimi: "17.09.2026 15:00" */
export function formatTr(date) {
    if (!date) return '-';
    return new Intl.DateTimeFormat('tr-TR', {
        timeZone: TR_TZ, day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    }).format(date);
}
