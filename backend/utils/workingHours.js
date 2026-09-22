/**
 * ═══════════════════════════════════════════════════════════════
 * ÇALIŞMA SAATLERİ — TEK YER
 * ═══════════════════════════════════════════════════════════════
 *
 * Kullanıcı kartındaki "Çalışma Saatleri" tablosu users.workingHours
 * alanına şu biçimde yazıyor:
 *
 *   { "monday": { "enabled": true, "start": "09:30", "end": "18:30" }, ... }
 *
 * Bu bilgi bugüne kadar YALNIZCA randevu uygunluğunda okunuyordu; takım
 * dağıtımı ve elle atama saatlere hiç bakmıyordu. Yani mesai dışındaki
 * temsilciye konuşma atanabiliyordu.
 *
 * Saat karşılaştırması İstanbul saatine göre yapılır: sunucu UTC
 * çalışıyor, tabloya girilen saatler ise yerel saat.
 */

const GUN_ADLARI = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const VARSAYILAN_TZ = 'Europe/Istanbul';

/** Json, string veya nesne olabilen alanı güvenle nesneye çevirir. */
export function parseWorkingHours(raw) {
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    try {
        const v = JSON.parse(raw);
        return v && typeof v === 'object' ? v : null;
    } catch {
        return null;
    }
}

/** "09:30" → 570 dakika. Geçersizse null. */
function dakikaya(hhmm) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
    if (!m) return null;
    const saat = Number(m[1]);
    const dk = Number(m[2]);
    if (saat > 23 || dk > 59) return null;
    return saat * 60 + dk;
}

/** Verilen anın İstanbul saatine göre gün adı ve dakikası. */
function yerelAn(at = new Date(), timeZone = VARSAYILAN_TZ) {
    try {
        const f = new Intl.DateTimeFormat('en-US', {
            timeZone, weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
        });
        const p = Object.fromEntries(f.formatToParts(at).map(x => [x.type, x.value]));
        return {
            gun: String(p.weekday || '').toLowerCase(),
            dakika: Number(p.hour) * 60 + Number(p.minute)
        };
    } catch {
        const d = at instanceof Date ? at : new Date(at);
        return { gun: GUN_ADLARI[d.getDay()], dakika: d.getHours() * 60 + d.getMinutes() };
    }
}

/**
 * O anda çalışıyor mu?
 *
 * Tanım yoksa KISIT YOK sayılır ve true döner — saat girmemiş bir
 * temsilciyi dağıtımdan düşürmek mevcut davranışı bozar.
 */
export function isWorkingAt(workingHoursRaw, at = new Date(), timeZone = VARSAYILAN_TZ) {
    const wh = parseWorkingHours(workingHoursRaw);
    if (!wh) return true;

    const { gun, dakika } = yerelAn(at, timeZone);

    // Günlük biçim: { monday: { enabled, start, end } }
    const gunKaydi = wh[gun];
    if (gunKaydi && typeof gunKaydi === 'object') {
        if (gunKaydi.enabled === false) return false;
        const bas = dakikaya(gunKaydi.start);
        const bit = dakikaya(gunKaydi.end);
        if (bas == null || bit == null) return true;      // saat bozuksa engellemeyelim
        if (bit <= bas) return dakika >= bas || dakika <= bit;  // gece yarısını aşan vardiya
        return dakika >= bas && dakika <= bit;
    }

    // Düz biçim: { days: ['monday', ...], start, end }
    if (Array.isArray(wh.days)) {
        if (!wh.days.map(d => String(d).toLowerCase()).includes(gun)) return false;
        const bas = dakikaya(wh.start);
        const bit = dakikaya(wh.end);
        if (bas == null || bit == null) return true;
        if (bit <= bas) return dakika >= bas || dakika <= bit;
        return dakika >= bas && dakika <= bit;
    }

    // Tanınmayan biçim → kısıt uygulamıyoruz
    return true;
}

/**
 * Neden uygun değil? Uyarı metni için.
 * Uygunsa null döner.
 */
export function unavailabilityReason(workingHoursRaw, at = new Date(), timeZone = VARSAYILAN_TZ) {
    const wh = parseWorkingHours(workingHoursRaw);
    if (!wh) return null;
    if (isWorkingAt(wh, at, timeZone)) return null;

    const { gun } = yerelAn(at, timeZone);
    const gunTR = {
        monday: 'Pazartesi', tuesday: 'Salı', wednesday: 'Çarşamba', thursday: 'Perşembe',
        friday: 'Cuma', saturday: 'Cumartesi', sunday: 'Pazar'
    }[gun] || gun;

    const gunKaydi = wh[gun];
    if (gunKaydi && typeof gunKaydi === 'object') {
        if (gunKaydi.enabled === false) return `${gunTR} günü çalışmıyor`;
        if (gunKaydi.start && gunKaydi.end) return `${gunTR} çalışma saati ${gunKaydi.start} - ${gunKaydi.end} dışında`;
    }
    if (Array.isArray(wh.days) && !wh.days.map(d => String(d).toLowerCase()).includes(gun)) {
        return `${gunTR} günü çalışmıyor`;
    }
    if (wh.start && wh.end) return `Çalışma saati ${wh.start} - ${wh.end} dışında`;
    return 'Çalışma saatleri dışında';
}

export default { parseWorkingHours, isWorkingAt, unavailabilityReason };
