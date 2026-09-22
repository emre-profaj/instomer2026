/**
 * ══════════════════════════════════════════════════════════════════
 * Automation Cron Service — Zaman-Bazlı Otomasyon Kuralları
 * ══════════════════════════════════════════════════════════════════
 * 
 * Her 5 dakikada bir çalışarak tüm workspace'lerdeki aktif zaman-bazlı
 * otomasyon kurallarını kontrol eder ve koşulları sağlayan kişiler için
 * aksiyonları çalıştırır.
 * 
 * server.js'den çağrılır: setInterval(runAutomationCron, 5 * 60 * 1000)
 */
import prisma from '../lib/prisma.js';
import { executeRule, getActiveRules, wasAlreadyExecuted, logExecution } from './ruleEngine.service.js';

const TAG = '[AutomationCron]';
let isRunning = false;

// ── Türkiye saati ────────────────────────────────────────────────
// Sunucu UTC'de çalışıyor. Düz now.getHours() kullanmak raporları
// 3 saat kaydırıyordu (18:00 kuralı Türkiye'de 21:00'da çalışıyordu).
const TZ = 'Europe/Istanbul';
function istanbulParts(now = new Date()) {
    const f = new Intl.DateTimeFormat('en-GB', {
        timeZone: TZ, hour: '2-digit', minute: '2-digit',
        weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour12: false
    }).formatToParts(now);
    const g = (t) => f.find(p => p.type === t)?.value;
    const WD = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 };
    return {
        hour: parseInt(g('hour'), 10),
        weekday: WD[g('weekday')] ?? 0,
        dateKey: `${g('year')}-${g('month')}-${g('day')}`
    };
}

// ── Türk özel günleri (sabit takvim) ─────────────────────────────
const TURKISH_SPECIAL_DAYS = [
    { month: 1, day: 1, name: 'Yılbaşı' },
    { month: 4, day: 23, name: '23 Nisan Ulusal Egemenlik ve Çocuk Bayramı' },
    { month: 5, day: 1, name: '1 Mayıs Emek ve Dayanışma Günü' },
    { month: 5, day: 19, name: '19 Mayıs Atatürk\'ü Anma' },
    { month: 5, day: 12, name: 'Anneler Günü' }, // 2. Pazar yaklaşık
    { month: 6, day: 16, name: 'Babalar Günü' }, // 3. Pazar yaklaşık
    { month: 7, day: 15, name: '15 Temmuz Demokrasi Bayramı' },
    { month: 8, day: 30, name: '30 Ağustos Zafer Bayramı' },
    { month: 10, day: 29, name: '29 Ekim Cumhuriyet Bayramı' },
    { month: 11, day: 24, name: 'Öğretmenler Günü' },
    { month: 2, day: 14, name: 'Sevgililer Günü' },
    { month: 3, day: 8, name: 'Dünya Kadınlar Günü' },
];

// ══════════════════════════════════════════════════════════════════
// ANA CRON FONKSİYONU
// ══════════════════════════════════════════════════════════════════
export async function runAutomationCron() {
    if (isRunning) {
        console.log(`${TAG} Zaten çalışıyor, skip`);
        return;
    }
    isRunning = true;
    const start = Date.now();

    try {
        // Tüm workspace'leri al
        const workspaces = await prisma.workspace.findMany({
            select: { id: true, appointmentSchedule: true, companyWorkingHours: true }
        });

        for (const ws of workspaces) {
            try {
                await processWorkspace(ws);
            } catch (err) {
                console.error(`${TAG} Workspace ${ws.id} error:`, err.message);
            }
        }

        console.log(`${TAG} Cron tamamlandı (${Date.now() - start}ms, ${workspaces.length} workspace)`);
    } catch (error) {
        console.error(`${TAG} Cron genel hata:`, error.message);
    } finally {
        isRunning = false;
    }
}

// ─── Workspace bazlı kural işleme ────────────────────────────────
// ── Gün bazında tek çalışma kapısı (rapor otomasyonları için) ────
// AutomationLog.contactId zorunlu olduğu için workspace seviyesindeki
// raporlar oraya yazılamıyor; işareti kuralın kendi config'inde tutuyoruz.
async function alreadyReported(workspaceId, ruleType, dateKey) {
    const rule = await prisma.workspaceRule.findFirst({
        where: { workspaceId, ruleType }, select: { config: true }
    });
    if (!rule) return false;
    let cfg = {};
    try { cfg = rule.config ? JSON.parse(rule.config) : {}; } catch { cfg = {}; }
    return cfg._lastReportKey === dateKey;
}

async function markReported(workspaceId, ruleType, dateKey) {
    const rule = await prisma.workspaceRule.findFirst({
        where: { workspaceId, ruleType }, select: { id: true, config: true }
    });
    if (!rule) return;
    let cfg = {};
    try { cfg = rule.config ? JSON.parse(rule.config) : {}; } catch { cfg = {}; }
    cfg._lastReportKey = dateKey;
    await prisma.workspaceRule.update({
        where: { id: rule.id }, data: { config: JSON.stringify(cfg) }
    }).catch(e => console.error(`${TAG} markReported hatası:`, e.message));
}

// ── Yöneticilere kalıcı bildirim ─────────────────────────────────
// Raporlar yalnızca socket ile yayınlanıyordu; o an bağlı kimse yoksa
// kayboluyordu. Artık bildirim kutusuna da düşüyor.
async function notifyManagers(workspaceId, type, title, body) {
    try {
        const members = await prisma.workspaceMember.findMany({
            where: { workspaceId, role: { in: ['OWNER', 'ADMIN', 'MANAGER'] } },
            select: { userId: true }
        });
        if (members.length === 0) return;
        await prisma.notification.createMany({
            data: members.map(m => ({ workspaceId, userId: m.userId, type, title, body }))
        });
    } catch (e) {
        console.error(`${TAG} notifyManagers hatası:`, e.message);
    }
}

async function processWorkspace(ws) {
    const workspaceId = ws.id;

    // Tüm aktif kuralları tek sorguda al
    const activeRules = await getActiveRules(workspaceId);
    if (Object.keys(activeRules).length === 0) return;

    const now = new Date();

    // ─── RANDEVU KURALLARI ───────────────────────────────────────
    if (activeRules.APPOINTMENT_REMINDER || activeRules.APPOINTMENT_CONFIRM || activeRules.HEALTH_APPOINTMENT_PREP) {
        await processAppointmentReminders(workspaceId, activeRules, now);
    }
    if (activeRules.NO_SHOW_FOLLOWUP) {
        await processNoShowFollowup(workspaceId, activeRules.NO_SHOW_FOLLOWUP, now);
    }

    // ─── DRIP KAMPANYA ───────────────────────────────────────────
    const dripRules = ['DRIP_DAY_0', 'DRIP_DAY_1', 'DRIP_DAY_3', 'DRIP_DAY_7', 'DRIP_DAY_14', 'DRIP_DAY_30'];
    const activeDrips = dripRules.filter(r => activeRules[r]);
    if (activeDrips.length > 0) {
        await processDripCampaigns(workspaceId, activeRules, activeDrips, now);
    }

    // ─── ÖZEL GÜNLER ─────────────────────────────────────────────
    if (activeRules.BIRTHDAY_GREETING) {
        await processBirthdayGreetings(workspaceId, activeRules.BIRTHDAY_GREETING, now);
    }
    if (activeRules.CUSTOMER_1ST_YEAR) {
        await processAnniversary(workspaceId, 'CUSTOMER_1ST_YEAR', 'createdAt', 365, now);
    }
    if (activeRules.FIRST_PURCHASE_ANNIV) {
        await processFirstPurchaseAnniversary(workspaceId, activeRules.FIRST_PURCHASE_ANNIV, now);
    }
    if (activeRules.SPECIAL_DAY_CAMPAIGN) {
        await processSpecialDayCampaign(workspaceId, activeRules.SPECIAL_DAY_CAMPAIGN, now);
    }

    // ─── SATIŞ TAKİP ────────────────────────────────────────────
    if (activeRules.SATISFACTION_SURVEY) {
        await processPostEventRule(workspaceId, 'SATISFACTION_SURVEY', activeRules.SATISFACTION_SURVEY, 'WON', now);
    }
    if (activeRules.POST_SALE_FOLLOWUP) {
        await processPostEventRule(workspaceId, 'POST_SALE_FOLLOWUP', activeRules.POST_SALE_FOLLOWUP, 'WON', now);
    }
    if (activeRules.REFERRAL_REQUEST) {
        await processPostEventRule(workspaceId, 'REFERRAL_REQUEST', activeRules.REFERRAL_REQUEST, 'WON', now);
    }
    if (activeRules.QUOTE_REMINDER) {
        await processQuoteReminder(workspaceId, 'QUOTE_REMINDER', activeRules.QUOTE_REMINDER, now);
    }
    if (activeRules.QUOTE_EXPIRY_NOTIFY) {
        await processQuoteReminder(workspaceId, 'QUOTE_EXPIRY_NOTIFY', activeRules.QUOTE_EXPIRY_NOTIFY, now);
    }

    // ─── REAKTİVASYON & KAMPANYA ─────────────────────────────────
    if (activeRules.INACTIVE_REACTIVATION) {
        await processInactiveReactivation(workspaceId, activeRules.INACTIVE_REACTIVATION, now);
    }
    if (activeRules.POSITIVE_LEAD_CAMPAIGN) {
        await processPositiveLeadCampaign(workspaceId, activeRules.POSITIVE_LEAD_CAMPAIGN, now);
    }

    // ─── SLA & OPERASYON ─────────────────────────────────────────
    if (activeRules.FIRST_RESPONSE_SLA) {
        await processFirstResponseSLA(workspaceId, activeRules.FIRST_RESPONSE_SLA, now);
    }
    if (activeRules.TASK_OVERDUE_ALERT) {
        await processTaskOverdue(workspaceId, activeRules.TASK_OVERDUE_ALERT, now);
    }
    if (activeRules.UNASSIGNED_TASK_ALERT) {
        await processUnassignedTasks(workspaceId, activeRules.UNASSIGNED_TASK_ALERT, now);
    }
    if (activeRules.TICKET_CLOSE_NOTIFY) {
        await processTicketAutoClose(workspaceId, activeRules.TICKET_CLOSE_NOTIFY, now);
    }

    // ─── RAPORLAMA (günlük/haftalık) ─────────────────────────────
    // Saatler Türkiye saatine göre. Cron 5 dakikada bir çalıştığı için
    // saat eşleşmesi tek başına yetmez — aynı saat diliminde 12 kez
    // tetiklenirdi; alreadyReported() gün bazında tek çalışmayı garanti eder.
    const tr = istanbulParts(now);
    if (activeRules.DAILY_SUMMARY && tr.hour === 18) {
        if (!(await alreadyReported(workspaceId, 'DAILY_SUMMARY', tr.dateKey))) {
            await processDailySummary(workspaceId, activeRules.DAILY_SUMMARY, now);
            await markReported(workspaceId, 'DAILY_SUMMARY', tr.dateKey);
        }
    }
    if (activeRules.TEAM_PERFORMANCE && tr.weekday === 1 && tr.hour === 9) {
        if (!(await alreadyReported(workspaceId, 'TEAM_PERFORMANCE', tr.dateKey))) {
            await processTeamPerformance(workspaceId, activeRules.TEAM_PERFORMANCE, now);
            await markReported(workspaceId, 'TEAM_PERFORMANCE', tr.dateKey);
        }
    }

    // ─── ÖDEME & BELGE ───────────────────────────────────────────
    if (activeRules.PAYMENT_REMINDER) {
        await processPaymentReminder(workspaceId, activeRules.PAYMENT_REMINDER, now);
    }
    if (activeRules.DOCUMENT_REQUEST) {
        await processDocumentRequest(workspaceId, activeRules.DOCUMENT_REQUEST, now);
    }
    if (activeRules.CONTRACT_RENEWAL) {
        await processContractRenewal(workspaceId, activeRules.CONTRACT_RENEWAL, now);
    }
    if (activeRules.UPSELL_SUGGEST) {
        await processUpsellSuggest(workspaceId, activeRules.UPSELL_SUGGEST, now);
    }
}

// ══════════════════════════════════════════════════════════════════
// RANDEVU KURALLARI
// ══════════════════════════════════════════════════════════════════

async function processAppointmentReminders(workspaceId, activeRules, now) {
    const rules = [
        { type: 'APPOINTMENT_REMINDER', config: activeRules.APPOINTMENT_REMINDER },
        { type: 'APPOINTMENT_CONFIRM', config: activeRules.APPOINTMENT_CONFIRM },
        { type: 'HEALTH_APPOINTMENT_PREP', config: activeRules.HEALTH_APPOINTMENT_PREP },
    ].filter(r => r.config);

    if (rules.length === 0) return;

    // En büyük reminderHours'a göre randevuları çek
    const maxHours = Math.max(...rules.map(r => r.config.reminderHours || 24));
    const futureLimit = new Date(now.getTime() + maxHours * 60 * 60 * 1000);

    const appointments = await prisma.appointment.findMany({
        where: {
            workspaceId,
            status: 'SCHEDULED',
            reminderSent: false, // Zaten hatırlatma gönderilmişse tekrar gönderme (dedup)
            startTime: { gt: now, lte: futureLimit }
        },
        select: { id: true, contactId: true, startTime: true, type: true }
    });

    for (const apt of appointments) {
        if (!apt.contactId) continue;
        const hoursUntil = (apt.startTime.getTime() - now.getTime()) / (1000 * 60 * 60);

        for (const rule of rules) {
            const targetHours = rule.config.reminderHours || 24;
            // ±30 dakika tolerans (5 dk cron aralığı için)
            if (Math.abs(hoursUntil - targetHours) < 0.5) {
                await executeRule(workspaceId, rule.type, { contactId: apt.contactId });
            }
        }
    }
}

async function processNoShowFollowup(workspaceId, config, now) {
    const delayMs = (config.delayMinutes || 60) * 60 * 1000;
    const threshold = new Date(now.getTime() - delayMs);

    const noShows = await prisma.appointment.findMany({
        where: {
            workspaceId,
            status: 'NO_SHOW',
            startTime: { lt: threshold, gt: new Date(now.getTime() - 48 * 60 * 60 * 1000) } // son 48 saat
        },
        select: { id: true, contactId: true }
    });

    for (const apt of noShows) {
        if (!apt.contactId) continue;
        await executeRule(workspaceId, 'NO_SHOW_FOLLOWUP', { contactId: apt.contactId });
    }
}

// ══════════════════════════════════════════════════════════════════
// DRIP KAMPANYA
// ══════════════════════════════════════════════════════════════════

async function processDripCampaigns(workspaceId, activeRules, activeDrips, now) {
    const dayMap = { DRIP_DAY_0: 0, DRIP_DAY_1: 1, DRIP_DAY_3: 3, DRIP_DAY_7: 7, DRIP_DAY_14: 14, DRIP_DAY_30: 30 };
    
    for (const ruleType of activeDrips) {
        const days = dayMap[ruleType];
        const targetDate = new Date(now);
        targetDate.setDate(targetDate.getDate() - days);
        const dayStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
        const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

        // O gün oluşturulan kişileri bul
        const contacts = await prisma.contact.findMany({
            where: {
                workspaceId,
                createdAt: { gte: dayStart, lt: dayEnd },
                isBlocked: false,
                isDeleted: false,
                marketingOptOut: false,
                NOT: { consentChannels: { contains: '"messaging":false' } }
            },
            select: { id: true },
            take: 500 // Batch limiti
        });

        for (const c of contacts) {
            await executeRule(workspaceId, ruleType, { contactId: c.id });
        }
    }
}

// ══════════════════════════════════════════════════════════════════
// ÖZEL GÜNLER
// ══════════════════════════════════════════════════════════════════

async function processBirthdayGreetings(workspaceId, config, now) {
    const today = now;
    const month = today.getMonth() + 1;
    const day = today.getDate();

    // birthDate'i bugün olan kişileri bul
    // Prisma'da ay/gün filtreleme raw query gerektirir
    const contacts = await prisma.$queryRaw`
        SELECT id FROM contacts 
        WHERE "workspaceId" = ${workspaceId} 
        AND "birthDate" IS NOT NULL 
        AND EXTRACT(MONTH FROM "birthDate") = ${month} 
        AND EXTRACT(DAY FROM "birthDate") = ${day}
        AND "isDeleted" = false 
        AND "isBlocked" = false
        AND "marketingOptOut" = false
        AND ("consentChannels" IS NULL OR NOT "consentChannels" LIKE '%"messaging":false%')
        LIMIT 500
    `;

    for (const c of contacts) {
        await executeRule(workspaceId, 'BIRTHDAY_GREETING', { contactId: c.id });
    }
}

async function processAnniversary(workspaceId, ruleType, dateField, daysAgo, now) {
    const targetDate = new Date(now);
    targetDate.setFullYear(targetDate.getFullYear() - 1);
    const dayStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const contacts = await prisma.contact.findMany({
        where: {
            workspaceId,
            createdAt: { gte: dayStart, lt: dayEnd },
            isDeleted: false,
            isBlocked: false,
            marketingOptOut: false
        },
        select: { id: true },
        take: 500
    });

    for (const c of contacts) {
        await executeRule(workspaceId, ruleType, { contactId: c.id });
    }
}

async function processFirstPurchaseAnniversary(workspaceId, config, now) {
    const targetDate = new Date(now);
    targetDate.setFullYear(targetDate.getFullYear() - 1);
    const dayStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    // 1 yıl önce bugün WON olan deal'ların kişileri
    const deals = await prisma.deal.findMany({
        where: {
            workspaceId,
            status: 'WON',
            wonAt: { gte: dayStart, lt: dayEnd }
        },
        select: { contactId: true },
        distinct: ['contactId'],
        take: 500
    });

    for (const d of deals) {
        if (!d.contactId) continue;
        await executeRule(workspaceId, 'FIRST_PURCHASE_ANNIV', { contactId: d.contactId });
    }
}

async function processSpecialDayCampaign(workspaceId, config, now) {
    const month = now.getMonth() + 1;
    const day = now.getDate();

    const isSpecialDay = TURKISH_SPECIAL_DAYS.find(sd => sd.month === month && sd.day === day);
    if (!isSpecialDay) return;

    console.log(`🎉 ${TAG} Özel gün: ${isSpecialDay.name}`);

    // Tüm aktif kişilere kampanya gönder (marketing opt-out hariç)
    const contacts = await prisma.contact.findMany({
        where: {
            workspaceId,
            isDeleted: false,
            isBlocked: false,
            marketingOptOut: false
        },
        select: { id: true },
        take: 1000
    });

    for (const c of contacts) {
        await executeRule(workspaceId, 'SPECIAL_DAY_CAMPAIGN', { contactId: c.id }, { duplicateHours: 24 * 30 }); // Ayda 1 kez
    }
}

// ══════════════════════════════════════════════════════════════════
// SATIŞ TAKİP
// ══════════════════════════════════════════════════════════════════

async function processPostEventRule(workspaceId, ruleType, config, dealStatus, now) {
    const delayMs = (config.delayMinutes || 1440) * 60 * 1000; // default 1 gün
    const threshold = new Date(now.getTime() - delayMs);
    const oldLimit = new Date(now.getTime() - delayMs - 6 * 60 * 60 * 1000); // 6 saat pencere

    const deals = await prisma.deal.findMany({
        where: {
            workspaceId,
            status: dealStatus,
            wonAt: { gte: oldLimit, lte: threshold }
        },
        select: { contactId: true },
        distinct: ['contactId'],
        take: 200
    });

    for (const d of deals) {
        if (!d.contactId) continue;
        await executeRule(workspaceId, ruleType, { contactId: d.contactId });
    }
}

async function processQuoteReminder(workspaceId, ruleType, config, now) {
    const delayMs = (config.delayMinutes || 4320) * 60 * 1000; // default 3 gün
    const threshold = new Date(now.getTime() - delayMs);
    const oldLimit = new Date(now.getTime() - delayMs - 6 * 60 * 60 * 1000);

    const deals = await prisma.deal.findMany({
        where: {
            workspaceId,
            stage: 'QUOTE',
            status: 'OPEN',
            createdAt: { gte: oldLimit, lte: threshold }
        },
        select: { contactId: true },
        distinct: ['contactId'],
        take: 200
    });

    for (const d of deals) {
        if (!d.contactId) continue;
        await executeRule(workspaceId, ruleType, { contactId: d.contactId });
    }
}

// ══════════════════════════════════════════════════════════════════
// REAKTİVASYON & KAMPANYA
// ══════════════════════════════════════════════════════════════════

async function processInactiveReactivation(workspaceId, config, now) {
    const delayMs = (config.delayMinutes || 43200) * 60 * 1000; // default 30 gün
    const threshold = new Date(now.getTime() - delayMs);

    const contacts = await prisma.contact.findMany({
        where: {
            workspaceId,
            lastContactedAt: { lt: threshold },
            isDeleted: false,
            isBlocked: false,
            marketingOptOut: false,
            category: { notIn: ['BLACKLIST', 'SPAM'] }
        },
        select: { id: true },
        take: 200
    });

    for (const c of contacts) {
        await executeRule(workspaceId, 'INACTIVE_REACTIVATION', { contactId: c.id }, { duplicateHours: 24 * 7 }); // Haftada 1
    }
}

async function processPositiveLeadCampaign(workspaceId, config, now) {
    const contacts = await prisma.contact.findMany({
        where: {
            workspaceId,
            leadTemperature: { in: ['HOT', 'FIRE'] },
            isDeleted: false,
            isBlocked: false,
            marketingOptOut: false
        },
        select: { id: true },
        take: 200
    });

    for (const c of contacts) {
        await executeRule(workspaceId, 'POSITIVE_LEAD_CAMPAIGN', { contactId: c.id }, { duplicateHours: 24 * 3 }); // 3 günde 1
    }
}

// ══════════════════════════════════════════════════════════════════
// SLA & OPERASYON
// ══════════════════════════════════════════════════════════════════

async function processFirstResponseSLA(workspaceId, config, now) {
    const delayMs = (config.delayMinutes || 30) * 60 * 1000;
    const threshold = new Date(now.getTime() - delayMs);

    // Belirli süredir yanıtlanmamış konuşmalar
    const conversations = await prisma.conversation.findMany({
        where: {
            workspaceId,
            status: 'OPEN',
            lastMessageAt: { lt: threshold },
            // Son mesajı müşteriden gelen (basit yaklaşım: unreadCount > 0)
            unreadCount: { gt: 0 }
        },
        select: { id: true, contactId: true, assignedToId: true },
        take: 100
    });

    for (const conv of conversations) {
        if (!conv.contactId) continue;
        await executeRule(workspaceId, 'FIRST_RESPONSE_SLA', {
            contactId: conv.contactId,
            conversationId: conv.id,
            notificationMessage: `⚠️ SLA İhlali: ${(config.delayMinutes || 30)} dakikadır yanıtlanmamış konuşma`
        });
    }
}

async function processTaskOverdue(workspaceId, config, now) {
    const activities = await prisma.contactActivity.findMany({
        where: {
            workspaceId,
            status: { in: ['PLANNED', 'IN_PROGRESS'] },
            dueDate: { lt: now }
        },
        select: { id: true, contactId: true, title: true, assignedToId: true, type: true },
        take: 100
    });

    for (const act of activities) {
        if (!act.contactId) continue;
        await executeRule(workspaceId, 'TASK_OVERDUE_ALERT', {
            contactId: act.contactId,
            notificationMessage: `⏰ Görev süresi aşıldı: "${act.title}"`
        });
    }
}

async function processUnassignedTasks(workspaceId, config, now) {
    const delayMs = (config.delayMinutes || 60) * 60 * 1000;
    const threshold = new Date(now.getTime() - delayMs);

    const activities = await prisma.contactActivity.findMany({
        where: {
            workspaceId,
            status: 'PLANNED',
            assignedToId: null,
            createdAt: { lt: threshold }
        },
        select: { id: true, contactId: true, title: true },
        take: 50
    });

    for (const act of activities) {
        if (!act.contactId) continue;
        await executeRule(workspaceId, 'UNASSIGNED_TASK_ALERT', {
            contactId: act.contactId,
            notificationMessage: `👤 Sahipsiz görev: "${act.title}"`
        });
    }
}

async function processTicketAutoClose(workspaceId, config, now) {
    const delayMs = (config.delayMinutes || 4320) * 60 * 1000; // default 3 gün
    const threshold = new Date(now.getTime() - delayMs);

    // Uzun süredir yanıt gelmeyen OPEN konuşmalar
    const conversations = await prisma.conversation.findMany({
        where: {
            workspaceId,
            status: 'OPEN',
            lastMessageAt: { lt: threshold },
            unreadCount: 0 // Yanıtlanmış ama müşteri sessiz
        },
        select: { id: true, contactId: true },
        take: 100
    });

    for (const conv of conversations) {
        // Otomatik kapat
        await prisma.conversation.update({
            where: { id: conv.id },
            data: { status: 'RESOLVED', resolvedAt: now }
        });
        if (conv.contactId) {
            await executeRule(workspaceId, 'TICKET_CLOSE_NOTIFY', { contactId: conv.contactId, conversationId: conv.id });
        }
    }
}

// ══════════════════════════════════════════════════════════════════
// RAPORLAMA
// ══════════════════════════════════════════════════════════════════

async function processDailySummary(workspaceId, config, now) {
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [newLeads, newConvs, openTasks, completedCalls] = await Promise.all([
        prisma.contact.count({ where: { workspaceId, createdAt: { gte: dayStart } } }),
        prisma.conversation.count({ where: { workspaceId, createdAt: { gte: dayStart } } }),
        prisma.contactActivity.count({ where: { workspaceId, status: { in: ['PLANNED', 'IN_PROGRESS'] } } }),
        prisma.contactActivity.count({ where: { workspaceId, type: 'CALL', status: 'COMPLETED', updatedAt: { gte: dayStart } } })
    ]);

    const summary = `📊 Günlük Özet (${now.toLocaleDateString('tr-TR')}):\n• Yeni lead: ${newLeads}\n• Yeni konuşma: ${newConvs}\n• Açık görev: ${openTasks}\n• Tamamlanan arama: ${completedCalls}`;

    console.log(`${TAG} ${summary}`);

    const { emitToWorkspace } = await import('../socket.js');
    emitToWorkspace(workspaceId, 'automation:daily-summary', { summary, date: now.toISOString() });
    await notifyManagers(workspaceId, 'DAILY_SUMMARY', '📊 Günlük Özet', summary);
}

async function processTeamPerformance(workspaceId, config, now) {
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - 7);

    const [totalCalls, totalDeals, resolvedConvs] = await Promise.all([
        prisma.contactActivity.count({ where: { workspaceId, type: 'CALL', createdAt: { gte: weekStart } } }),
        prisma.deal.count({ where: { workspaceId, status: 'WON', wonAt: { gte: weekStart } } }),
        prisma.conversation.count({ where: { workspaceId, status: 'RESOLVED', resolvedAt: { gte: weekStart } } })
    ]);

    const report = `📈 Haftalık Performans:\n• Arama: ${totalCalls}\n• Satış: ${totalDeals}\n• Çözülen konuşma: ${resolvedConvs}`;

    console.log(`${TAG} ${report}`);
    const { emitToWorkspace } = await import('../socket.js');
    emitToWorkspace(workspaceId, 'automation:team-performance', { report, date: now.toISOString() });
    await notifyManagers(workspaceId, 'TEAM_PERFORMANCE', '📈 Haftalık Performans', report);
}

// ══════════════════════════════════════════════════════════════════
// ÖDEME & BELGE & SÖZLEŞME
// ══════════════════════════════════════════════════════════════════

async function processPaymentReminder(workspaceId, config, now) {
    const delayMs = (config.delayMinutes || 1440) * 60 * 1000; // default 1 gün
    // Vadesi geçmiş faturalar
    const overdueDeals = await prisma.deal.findMany({
        where: {
            workspaceId,
            stage: 'INVOICE',
            status: 'OPEN',
            createdAt: { lt: new Date(now.getTime() - delayMs) }
        },
        select: { contactId: true },
        distinct: ['contactId'],
        take: 200
    });

    for (const d of overdueDeals) {
        if (!d.contactId) continue;
        await executeRule(workspaceId, 'PAYMENT_REMINDER', { contactId: d.contactId }, { duplicateHours: 48 });
    }
}

async function processDocumentRequest(workspaceId, config, now) {
    // Tag'ı "eksik-belge" olan kişiler
    const contacts = await prisma.contact.findMany({
        where: {
            workspaceId,
            tags: { contains: 'eksik-belge' },
            isDeleted: false,
            isBlocked: false
        },
        select: { id: true },
        take: 100
    });

    for (const c of contacts) {
        await executeRule(workspaceId, 'DOCUMENT_REQUEST', { contactId: c.id }, { duplicateHours: 72 }); // 3 günde 1
    }
}

async function processContractRenewal(workspaceId, config, now) {
    const reminderMs = (config.reminderHours || 720) * 60 * 60 * 1000; // default 30 gün
    // Tag'ı "sozlesme-bitis" olan kişileri veya sözleşme bitiş tarihine yaklaşanları kontrol et
    const contacts = await prisma.contact.findMany({
        where: {
            workspaceId,
            tags: { contains: 'sozlesme' },
            isDeleted: false,
            isBlocked: false
        },
        select: { id: true },
        take: 100
    });

    for (const c of contacts) {
        await executeRule(workspaceId, 'CONTRACT_RENEWAL', { contactId: c.id }, { duplicateHours: 24 * 7 });
    }
}

async function processUpsellSuggest(workspaceId, config, now) {
    // WON deal'ı olan mevcut müşterilere çapraz satış önerisi
    const customers = await prisma.contact.findMany({
        where: {
            workspaceId,
            deals: { some: { status: 'WON' } },
            isDeleted: false,
            isBlocked: false,
            marketingOptOut: false
        },
        select: { id: true },
        take: 100
    });

    for (const c of customers) {
        await executeRule(workspaceId, 'UPSELL_SUGGEST', { contactId: c.id }, { duplicateHours: 24 * 14 }); // 2 haftada 1
    }
}

export default { runAutomationCron };
