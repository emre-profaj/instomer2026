/**
 * ═══════════════════════════════════════════════════════════════
 * FİRMA ÇALIŞMA ÇİZELGESİ — TEK OKUMA NOKTASI
 * ═══════════════════════════════════════════════════════════════
 *
 * Ayarlardaki 7 günlük çizelge (`companyWeeklySchedule`) üç yerde
 * birbirinden habersiz okunuyordu:
 *
 *   • baseKnowledge.service    → AI'ın gördüğü bilgi bankasına
 *                                "Cumartesi: KAPALI" satırı basıyordu
 *   • isOutsideWorkingHours    → "şu an kapalıyız" otomatik cevabı
 *   • buildWorkingHoursText    → "çalışma saatleriniz?" cevabı
 *
 * GERÇEK VAKA (Fes Spa): Çizelgede cumartesi/pazar kapalı kalmış, ama
 * salon o günler çalışıyor ve doğru saatler bilgi bankası belgelerinde
 * yazılı. Çizelge belgeden daha güçlü konuştuğu için AI yazan müşterilere
 * "kapalıyız" dedi. Üstelik Fes Spa'da kadınlar ve erkekler bölümünün
 * saatleri farklı — tek bir 7 günlük tablo bunu hiç anlatamıyor.
 *
 * Çözüm: çizelgenin kendisi bir anahtara bağlandı.
 *
 *   companyScheduleEnabled = true  (varsayılan) → bugünkü davranış
 *   companyScheduleEnabled = false             → çizelge YOK SAYILIR
 *
 * Kapalıyken çalışma saatleri yalnızca bilgi bankasından okunur ve
 * saate dayalı otomasyonlar (mesai dışı cevabı, saat bildirme) sessizce
 * atlanır. Bu kasıtlı: saatleri bilmeden "kapalıyız" demek, hiç
 * cevap vermemekten daha zararlı.
 */
import prisma from '../lib/prisma.js';

const TZ = 'Europe/Istanbul';

const GUN_ADLARI = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

/** Bu servisin ihtiyaç duyduğu workspace alanları. */
export const SCHEDULE_SELECT = {
    companyScheduleEnabled: true,
    companyWeeklySchedule: true,
    companyWorkingHours: true,
};

/**
 * Anahtar açık mı? Sütun henüz yoksa (eski kayıt) açık sayılır —
 * 44 canlı çalışma alanının davranışı sessizce değişmesin.
 */
export function isScheduleEnabled(workspace) {
    return workspace?.companyScheduleEnabled !== false;
}

/**
 * Çizelgeyi normalize eder. Anahtar kapalıysa, çizelge boşsa veya
 * bozuksa null döner — çağıran "bilgi yok" diye davranır.
 *
 * @param {object} workspace — SCHEDULE_SELECT alanlarını içeren kayıt
 * @returns {{days: Array, holidays: object|null}|null}
 */
export function readSchedule(workspace) {
    if (!workspace || !isScheduleEnabled(workspace)) return null;
    if (!workspace.companyWeeklySchedule) return null;

    let raw;
    try {
        raw = typeof workspace.companyWeeklySchedule === 'string'
            ? JSON.parse(workspace.companyWeeklySchedule)
            : workspace.companyWeeklySchedule;
    } catch { return null; }

    const days = Array.isArray(raw) ? raw : (raw?.schedule || []);
    if (!Array.isArray(days) || !days.length) return null;

    return { days, holidays: Array.isArray(raw) ? null : (raw?.holidays || null) };
}

/** Yalnızca workspaceId elindeyken kullan. */
export async function getSchedule(workspaceId) {
    if (!workspaceId) return null;
    const ws = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: SCHEDULE_SELECT,
    });
    return readSchedule(ws);
}

/**
 * Şu an Türkiye saatiyle mesai dışı mı?
 *
 * @returns {Promise<boolean|null>} null → bilinmiyor, kural çalıştırılmamalı
 */
export async function isOutsideWorkingHours(workspaceId) {
    const sched = await getSchedule(workspaceId);
    if (!sched) return null;

    const f = new Intl.DateTimeFormat('en-GB', {
        timeZone: TZ, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(new Date());
    const g = (t) => f.find(p => p.type === t)?.value;
    const WD = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 };
    const jsDay = WD[g('weekday')] ?? 0;

    // Şemada 0 = Pazartesi … 6 = Pazar (JS'te 0 = Pazar) — eşleme şart
    const schedDay = (jsDay + 6) % 7;
    const today = sched.days.find(d => Number(d.day) === schedDay);
    if (!today) return null;
    if (!today.enabled) return true; // bugün kapalı

    const nowMin = parseInt(g('hour'), 10) * 60 + parseInt(g('minute'), 10);
    const toMin = (v, dflt) => {
        const [h, m] = String(v || dflt).split(':').map(Number);
        return (h || 0) * 60 + (m || 0);
    };
    return nowMin < toMin(today.start, '09:00') || nowMin >= toMin(today.end, '18:00');
}

const gunAdi = (d) => d.label || GUN_ADLARI[Number(d.day)] || `Gün ${d.day}`;

/**
 * Müşteriye gönderilecek çalışma saatleri metni.
 *
 * Anahtar kapalıyken `companyWorkingHours` özetine DÜŞMÜYORUZ: o metin
 * her kayıtta aynı çizelgeden türetiliyor, yani aynı yanlış bilgi.
 * Saatleri bilmiyorsak susmak doğrusu.
 *
 * @returns {Promise<string|null>}
 */
export async function buildWorkingHoursText(workspaceId) {
    const ws = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: SCHEDULE_SELECT,
    });
    const sched = readSchedule(ws);
    if (!sched) {
        // Anahtar açık ama çizelge hiç girilmemişse elde kalan tek şey özet metni
        return isScheduleEnabled(ws) ? (ws?.companyWorkingHours || null) : null;
    }

    const lines = sched.days
        .slice()
        .sort((a, b) => Number(a.day) - Number(b.day))
        .map(d => d.enabled
            ? `${gunAdi(d)}: ${d.start || '09:00'} - ${d.end || '18:00'}`
            : `${gunAdi(d)}: Kapalı`);

    return `Çalışma saatlerimiz:\n${lines.join('\n')}`;
}

/**
 * AI'ın gördüğü bilgi bankası metnine eklenecek satırlar.
 * Workspace zaten çekilmiş olduğu için senkron.
 *
 * Anahtar kapalıyken BOŞ döner — özet satırı dahil. Böylece AI çalışma
 * saatlerini yalnızca bilgi bankası belgelerinden okur; Fes Spa gibi
 * bölümlere göre farklı saat işleyen yerler kendi metnini yazabilir.
 *
 * @param {object} workspace
 * @returns {string[]}
 */
export function buildScheduleKnowledgeLines(workspace) {
    if (!isScheduleEnabled(workspace)) return [];

    const lines = [];
    if (workspace?.companyWorkingHours) {
        lines.push(`Haftalık Çalışma Saatleri Özeti: ${workspace.companyWorkingHours}`);
    }

    const sched = readSchedule(workspace);
    if (!sched) return lines;

    const schedLines = sched.days.map(d => d.enabled
        ? `  • ${gunAdi(d)}: ${d.start || '09:00'} - ${d.end || '18:00'}`
        : `  • ${gunAdi(d)}: KAPALI`);
    lines.push(`Detaylı 7 Günlük Çalışma Çizelgesi:\n${schedLines.join('\n')}`);

    if (sched.holidays) {
        if (sched.holidays.closedOnPublicHolidays !== false) {
            lines.push(`Resmi Tatiller & Bayramlar: Resmi tatil günlerinde ve dini bayramlarda (1 Ocak, 23 Nisan, 1 Mayıs, 19 Mayıs, 15 Temmuz, 30 Ağustos, 29 Ekim, Ramazan Bayramı, Kurban Bayramı) firmamız KAPALIDIR / hizmet vermemektedir.`);
        } else {
            lines.push(`Resmi Tatiller & Bayramlar: Resmi tatil günlerinde hizmet verilmektedir (${sched.holidays.holidayWorkingHours || 'Özel saatler geçerlidir'}).`);
        }
    } else {
        lines.push(`Resmi Tatiller: Resmi tatiller ve bayram günlerinde kapalıdır.`);
    }

    return lines;
}

export default {
    SCHEDULE_SELECT,
    isScheduleEnabled,
    readSchedule,
    getSchedule,
    isOutsideWorkingHours,
    buildWorkingHoursText,
    buildScheduleKnowledgeLines,
};
