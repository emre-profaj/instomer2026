/**
 * ═══════════════════════════════════════════════════════════════
 * GELEN MESAJ OTOMASYON KANCALARI — TEK KAPI
 * ═══════════════════════════════════════════════════════════════
 *
 * Müşteriden mesaj geldiğinde çalışan mesaj-bazlı otomasyonlar burada.
 * Daha önce bu kancalar yalnızca whatsapp.controller ve facebook.controller
 * içinde kopyalanmıştı; web widget, e-posta ve Instagram'da hiç çalışmıyordu.
 * Ayrıca AFTER_HOURS_REPLY hiçbir saat kontrolü yapmadan tetikleniyordu —
 * mesai içinde de "şu an kapalıyız" mesajı gidiyordu.
 *
 * Tüm kanallar bu fonksiyonu çağırır.
 */
import prisma from '../lib/prisma.js';
import { executeRule, getActiveRules } from './ruleEngine.service.js';

const TAG = '[InboundHooks]';
const TZ = 'Europe/Istanbul';

const HOOK_RULES = [
    'AFTER_HOURS_REPLY', 'VIP_CUSTOMER_ALERT', 'COMPLAINT_ESCALATION',
    'FAQ_AUTO_REPLY', 'PRICE_AUTO_REPLY', 'SEND_CATALOG', 'SEND_WORKING_HOURS',
    'SEND_LOCATION'
];

// Anahtar kelime varsayılanları — kural config'inde keywords varsa o kullanılır
const DEFAULT_KEYWORDS = {
    PRICE_AUTO_REPLY: ['fiyat', 'ücret', 'kaç para', 'ne kadar', 'tarife', 'kaça'],
    SEND_CATALOG: ['katalog', 'ürün listesi', 'broşür', 'menü', 'hizmetleriniz', 'ürünleriniz'],
    SEND_WORKING_HOURS: ['çalışma saat', 'kaçta aç', 'kaçta kapan', 'açık mısınız', 'mesai', 'saat kaça kadar', 'ne zaman açık'],
    SEND_LOCATION: ['adres', 'konum', 'yol tarifi', 'neredesiniz', 'nerede', 'nasıl gelebilir', 'nasıl gelinir'],
    FAQ_AUTO_REPLY: [] // anlamlı bir varsayılanı yok — yönetici kendi kelimelerini girer
};

/**
 * Şu an Türkiye saatiyle mesai dışı mı?
 * Çalışma saatleri yapılandırılmamışsa null döner (kural çalıştırılmaz —
 * bilgi yokken "kapalıyız" demek yanlış bilgi vermek olur).
 */
export async function isOutsideWorkingHours(workspaceId) {
    const ws = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { companyWeeklySchedule: true }
    });
    if (!ws?.companyWeeklySchedule) return null;

    let days;
    try {
        const raw = typeof ws.companyWeeklySchedule === 'string'
            ? JSON.parse(ws.companyWeeklySchedule)
            : ws.companyWeeklySchedule;
        days = Array.isArray(raw) ? raw : (raw?.schedule || []);
    } catch { return null; }
    if (!days.length) return null;

    const f = new Intl.DateTimeFormat('en-GB', {
        timeZone: TZ, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(new Date());
    const g = (t) => f.find(p => p.type === t)?.value;
    const WD = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 };
    const jsDay = WD[g('weekday')] ?? 0;

    // Şemada 0 = Pazartesi … 6 = Pazar (JS'te 0 = Pazar) — eşleme şart
    const schedDay = (jsDay + 6) % 7;
    const today = days.find(d => Number(d.day) === schedDay);
    if (!today) return null;
    if (!today.enabled) return true; // bugün kapalı

    const nowMin = parseInt(g('hour'), 10) * 60 + parseInt(g('minute'), 10);
    const toMin = (v, dflt) => {
        const [h, m] = String(v || dflt).split(':').map(Number);
        return (h || 0) * 60 + (m || 0);
    };
    return nowMin < toMin(today.start, '09:00') || nowMin >= toMin(today.end, '18:00');
}

/** Çalışma saatlerini müşteriye gönderilecek metne çevirir. */
async function buildWorkingHoursText(workspaceId) {
    const ws = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { companyWeeklySchedule: true, companyWorkingHours: true }
    });
    let days = [];
    try {
        const raw = typeof ws?.companyWeeklySchedule === 'string'
            ? JSON.parse(ws.companyWeeklySchedule)
            : ws?.companyWeeklySchedule;
        days = Array.isArray(raw) ? raw : (raw?.schedule || []);
    } catch { days = []; }

    if (!days.length) return ws?.companyWorkingHours || null;

    const LABELS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
    const lines = days
        .slice()
        .sort((a, b) => Number(a.day) - Number(b.day))
        .map(d => {
            const label = d.label || LABELS[Number(d.day)] || `Gün ${d.day}`;
            return d.enabled
                ? `${label}: ${d.start || '09:00'} - ${d.end || '18:00'}`
                : `${label}: Kapalı`;
        });
    return `Çalışma saatlerimiz:\n${lines.join('\n')}`;
}

function matches(text, ruleType, config) {
    const list = Array.isArray(config?.keywords) && config.keywords.length
        ? config.keywords
        : DEFAULT_KEYWORDS[ruleType];
    if (!list || !list.length) return false;
    return list.some(k => text.includes(String(k).toLowerCase()));
}

/**
 * Gelen mesaj için tüm mesaj-bazlı otomasyonları çalıştırır.
 * Her kanal (WhatsApp, Facebook, Instagram, Widget, E-posta) bunu çağırır.
 */
export async function runInboundMessageHooks(ctx = {}) {
    const { workspaceId, contactId, conversationId, message } = ctx;
    if (!workspaceId || !contactId) return;

    try {
        const rules = await getActiveRules(workspaceId, HOOK_RULES);
        if (!Object.keys(rules).length) return;

        const ruleCtx = { contactId, conversationId, message };
        const text = String(message || '').toLowerCase();

        // ── Mesai dışı otomatik cevap ────────────────────────────
        if (rules.AFTER_HOURS_REPLY) {
            const outside = await isOutsideWorkingHours(workspaceId);
            if (outside === true) {
                await executeRule(workspaceId, 'AFTER_HOURS_REPLY', ruleCtx);
            } else if (outside === null) {
                console.warn(`${TAG} AFTER_HOURS_REPLY aktif ama çalışma saatleri tanımlı değil → atlandı`);
            }
        }

        // ── VIP müşteri uyarısı ──────────────────────────────────
        if (rules.VIP_CUSTOMER_ALERT) {
            const contact = ctx.contact || await prisma.contact.findUnique({
                where: { id: contactId }, select: { category: true }
            });
            if (contact?.category === 'VIP') {
                await executeRule(workspaceId, 'VIP_CUSTOMER_ALERT', ruleCtx);
            }
        }

        // ── Şikayet eskalasyonu ──────────────────────────────────
        if (rules.COMPLAINT_ESCALATION && conversationId) {
            const conv = ctx.conversation || await prisma.conversation.findUnique({
                where: { id: conversationId }, select: { sentimentScore: true }
            });
            if (conv?.sentimentScore !== null && conv?.sentimentScore !== undefined && conv.sentimentScore < 30) {
                await executeRule(workspaceId, 'COMPLAINT_ESCALATION', ruleCtx);
            }
        }

        if (!text) return;

        // ── Anahtar kelime tabanlı otomatik cevaplar ─────────────
        for (const rt of ['PRICE_AUTO_REPLY', 'SEND_CATALOG', 'FAQ_AUTO_REPLY', 'SEND_LOCATION']) {
            if (rules[rt] && matches(text, rt, rules[rt])) {
                await executeRule(workspaceId, rt, ruleCtx);
            }
        }

        // ── Çalışma saatleri bildir ──────────────────────────────
        // Şablon/mesaj girilmemişse saatleri firma bilgisinden üretir.
        if (rules.SEND_WORKING_HOURS && matches(text, 'SEND_WORKING_HOURS', rules.SEND_WORKING_HOURS)) {
            const cfg = rules.SEND_WORKING_HOURS;
            if (cfg.templateId || cfg.message) {
                await executeRule(workspaceId, 'SEND_WORKING_HOURS', ruleCtx);
            } else {
                const hours = await buildWorkingHoursText(workspaceId);
                if (hours) {
                    const { deliverToContact } = await import('./automationDelivery.service.js');
                    const res = await deliverToContact(workspaceId, contactId, {
                        message: hours, channel: cfg.channel
                    });
                    const { logExecution } = await import('./ruleEngine.service.js');
                    await logExecution(
                        workspaceId, 'SEND_WORKING_HOURS', contactId,
                        res.success ? 'SUCCESS' : 'FAILED', { result: res }
                    );
                } else {
                    console.warn(`${TAG} SEND_WORKING_HOURS: çalışma saatleri tanımlı değil → atlandı`);
                }
            }
        }
    } catch (err) {
        console.error(`${TAG} hata:`, err.message);
    }
}

export default { runInboundMessageHooks, isOutsideWorkingHours };
