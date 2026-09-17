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
 * Çalışma saati okuma mantığı companySchedule.service.js'e taşındı:
 * AI'ın bilgi bankası da aynı çizelgeyi okuyor, ikisi ayrı yorumlamasın.
 *
 * Tüm kanallar bu fonksiyonu çağırır.
 */
import prisma from '../lib/prisma.js';
import { executeRule, getActiveRules } from './ruleEngine.service.js';
import { isOutsideWorkingHours, buildWorkingHoursText } from './companySchedule.service.js';

const TAG = '[InboundHooks]';

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

// Geriye dönük uyumluluk: bu isim eskiden buradan dışa veriliyordu.
export { isOutsideWorkingHours };
export default { runInboundMessageHooks, isOutsideWorkingHours };
