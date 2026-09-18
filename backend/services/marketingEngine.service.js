/**
 * ══════════════════════════════════════════════════════════════════
 * Marketing Engine Service — Pazarlama v3 Otomasyon Motoru
 * ══════════════════════════════════════════════════════════════════
 * 
 * 1. processAutoRetryWorker: Başarısız (FAILED) alıcılara otomatik yeniden deneme (her 5-15 dk).
 * 2. processRecurringCampaigns: Tekrarlı gönderimler (haftalık/aylık bültenler).
 * 3. processDayBasedMilestones: Gün bazlı kampanyalar (90-100-120 gün pasif, 60 gün müşteri, doğum günü).
 * 4. processUncontactedLeads: Olay bazlı potansiyel müşteri takibi (30 gündür aranmayan leadler).
 */

import prisma from '../lib/prisma.js';
import axios from 'axios';
import Retell from 'retell-sdk';
import { sendSms } from './netgsm.service.js';
import { sendEmailViaChannel } from './emailSender.service.js';
import { normalizePhone } from '../utils/phoneNormalizer.js';
import { executeGroupSendCore } from '../controllers/marketingV2.controller.js';

const TAG = '[MarketingEngine]';
let isAutoRetryRunning = false;
let isRecurringRunning = false;
let isDayBasedRunning = false;

// ── Türkiye saati yardımcıları ──────────────────────────────────
const TZ = 'Europe/Istanbul';
function getIstanbulNow(date = new Date()) {
    const f = new Intl.DateTimeFormat('en-GB', {
        timeZone: TZ, hour: '2-digit', minute: '2-digit',
        weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour12: false
    }).formatToParts(date);
    const g = (t) => f.find(p => p.type === t)?.value;
    const WD = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
    return {
        year: parseInt(g('year'), 10),
        month: parseInt(g('month'), 10),
        day: parseInt(g('day'), 10),
        hour: parseInt(g('hour'), 10),
        minute: parseInt(g('minute'), 10),
        weekday: WD[g('weekday')] ?? 1,
        dateKey: `${g('year')}-${g('month')}-${g('day')}`
    };
}

/**
 * Sonraki tekrarlı gönderim tarihini hesaplar.
 */
export function calculateNextRun({ frequency, dayOfWeek, dayOfMonth, time = '10:00', fromDate = new Date() }) {
    const [hStr, mStr] = String(time).split(':');
    const targetHour = parseInt(hStr || '10', 10);
    const targetMin = parseInt(mStr || '0', 10);

    const next = new Date(fromDate);
    next.setSeconds(0, 0);

    if (frequency === 'DAILY') {
        next.setDate(next.getDate() + 1);
        next.setHours(targetHour, targetMin, 0, 0);
    } else if (frequency === 'WEEKLY') {
        const targetDay = dayOfWeek ? parseInt(dayOfWeek, 10) : 1; // 1 = Mon
        let daysToAdd = 7;
        const currentDay = next.getDay() === 0 ? 7 : next.getDay();
        if (currentDay !== targetDay) {
            daysToAdd = (targetDay - currentDay + 7) % 7;
            if (daysToAdd === 0) daysToAdd = 7;
        }
        next.setDate(next.getDate() + daysToAdd);
        next.setHours(targetHour, targetMin, 0, 0);
    } else if (frequency === 'BIWEEKLY') {
        next.setDate(next.getDate() + 14);
        next.setHours(targetHour, targetMin, 0, 0);
    } else if (frequency === 'MONTHLY') {
        const targetDom = dayOfMonth ? parseInt(dayOfMonth, 10) : 1;
        next.setMonth(next.getMonth() + 1);
        next.setDate(targetDom);
        next.setHours(targetHour, targetMin, 0, 0);
    } else {
        next.setDate(next.getDate() + 7);
        next.setHours(targetHour, targetMin, 0, 0);
    }

    return next;
}

// ══════════════════════════════════════════════════════════════════
// 1. OTOMATİK YENİDEN DENEME (AUTO-RETRY WORKER)
// ══════════════════════════════════════════════════════════════════
export async function processAutoRetryWorker() {
    if (isAutoRetryRunning) return;
    isAutoRetryRunning = true;

    try {
        const now = new Date();
        const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);

        // AutoRetry aktif olan ve FAILED alıcıları bul
        const failedRecipients = await prisma.marketingRecipient.findMany({
            where: {
                status: 'FAILED',
                campaign: {
                    autoRetry: true,
                    status: { in: ['ACTIVE', 'RUNNING', 'COMPLETED'] }
                },
                OR: [
                    { lastRetryAt: null },
                    { lastRetryAt: { lte: fifteenMinutesAgo } }
                ]
            },
            include: {
                campaign: true,
                group: {
                    include: {
                        groupMessages: { include: { message: true } }
                    }
                },
                contact: true
            },
            take: 50,
            orderBy: { createdAt: 'asc' }
        });

        if (failedRecipients.length === 0) {
            return;
        }

        console.log(`${TAG} [AutoRetry] ${failedRecipients.length} başarısız alıcı tekrar deneniyor...`);

        for (const r of failedRecipients) {
            const maxRetries = r.campaign.maxRetries || 3;
            if (r.retryCount >= maxRetries) {
                continue;
            }

            // Kalıcı hataları ayıkla (geçersiz numara, kara liste vb.)
            const reason = String(r.failReason || '').toLowerCase();
            if (reason.includes('invalid phone') || reason.includes('gecersiz numara') || reason.includes('kara liste') || reason.includes('unsubscribed')) {
                continue;
            }

            const channel = r.group?.channel || 'WHATSAPP';
            const workspaceId = r.campaign.workspaceId;

            try {
                if (channel === 'WHATSAPP') {
                    const whatsappPhone = await prisma.whatsappPhoneNumber.findFirst({ where: { workspaceId } });
                    if (!whatsappPhone) continue;

                    // Şablon bul
                    let templateName = null;
                    let templateLang = 'tr';
                    if (r.group?.groupMessages?.length > 0) {
                        for (const gm of r.group.groupMessages) {
                            if (gm.message?.templateName) {
                                templateName = gm.message.templateName;
                                break;
                            }
                        }
                    }

                    if (!templateName) continue;

                    const WHATSAPP_API_VERSION = process.env.WHATSAPP_API_VERSION || 'v21.0';
                    const apiUrl = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${whatsappPhone.phoneNumberId}/messages`;

                    const payload = {
                        messaging_product: 'whatsapp',
                        to: r.phone,
                        type: 'template',
                        template: {
                            name: templateName,
                            language: { code: templateLang }
                        }
                    };

                    const resp = await axios.post(apiUrl, payload, {
                        headers: { Authorization: `Bearer ${whatsappPhone.accessToken}`, 'Content-Type': 'application/json' },
                        timeout: 15000
                    });

                    const waId = resp.data?.messages?.[0]?.id;

                    await prisma.marketingRecipient.update({
                        where: { id: r.id },
                        data: {
                            status: 'SENT',
                            sentAt: new Date(),
                            failReason: null,
                            retryCount: { increment: 1 },
                            lastRetryAt: new Date(),
                            autoRetried: true
                        }
                    });

                    // Kampanya ve grup sayaçlarını güncelle
                    await prisma.marketingCampaign.update({
                        where: { id: r.campaignId },
                        data: {
                            sentCount: { increment: 1 },
                            failedCount: { decrement: 1 }
                        }
                    }).catch(() => {});

                    if (r.groupId) {
                        await prisma.campaignGroup.update({
                            where: { id: r.groupId },
                            data: {
                                sentCount: { increment: 1 },
                                failedCount: { decrement: 1 }
                            }
                        }).catch(() => {});
                    }

                    console.log(`✅ [AutoRetry:WA] ${r.phone} için başarılı (deneme: ${r.retryCount + 1})`);

                } else if (channel === 'AI_CALL') {
                    const ws = await prisma.workspace.findUnique({
                        where: { id: workspaceId },
                        select: { retellApiKey: true, retellAgentId: true, retellPhoneNumber: true }
                    });

                    const agentMsg = r.group?.groupMessages?.find(gm => gm.message?.retellAgentId)?.message;
                    const agentId = agentMsg?.retellAgentId || ws?.retellAgentId;

                    if (ws?.retellApiKey && agentId && ws?.retellPhoneNumber) {
                        const retellClient = new Retell({ apiKey: ws.retellApiKey });
                        let formattedPhone = r.phone;
                        if (!formattedPhone.startsWith('+')) {
                            formattedPhone = '+' + (formattedPhone.startsWith('90') ? formattedPhone : '90' + formattedPhone);
                        }

                        await retellClient.call.createPhoneCall({
                            from_number: ws.retellPhoneNumber,
                            to_number: formattedPhone,
                            override_agent_id: agentId,
                            retell_llm_dynamic_variables: {
                                customer_name: r.name || 'Müşterimiz',
                                campaign_name: r.campaign.name
                            }
                        });

                        await prisma.marketingRecipient.update({
                            where: { id: r.id },
                            data: {
                                status: 'SENT',
                                sentAt: new Date(),
                                failReason: null,
                                retryCount: { increment: 1 },
                                lastRetryAt: new Date(),
                                autoRetried: true
                            }
                        });
                        console.log(`✅ [AutoRetry:Call] ${r.phone} arandı (deneme: ${r.retryCount + 1})`);
                    }
                }
            } catch (retryErr) {
                console.warn(`⚠️ [AutoRetry:Fail] ${r.phone} deneme başarısız:`, retryErr.response?.data || retryErr.message);
                await prisma.marketingRecipient.update({
                    where: { id: r.id },
                    data: {
                        retryCount: { increment: 1 },
                        lastRetryAt: new Date(),
                        failReason: retryErr.response?.data?.error?.message || retryErr.message,
                        autoRetried: true
                    }
                }).catch(() => {});
            }
        }
    } catch (err) {
        console.error(`${TAG} [AutoRetry] genel hata:`, err.message);
    } finally {
        isAutoRetryRunning = false;
    }
}

// ══════════════════════════════════════════════════════════════════
// 2. TEKRARLI GÖNDERİMLER (RECURRING CAMPAIGNS - Haftalık / Aylık Bülten)
// ══════════════════════════════════════════════════════════════════
export async function processRecurringCampaigns() {
    if (isRecurringRunning) return;
    isRecurringRunning = true;

    try {
        const now = new Date();

        // Çalışma zamanı gelmiş aktif tekrarlı kampanyaları al
        const dueCampaigns = await prisma.marketingCampaign.findMany({
            where: {
                status: 'ACTIVE',
                campaignType: 'RECURRING',
                nextRunAt: { lte: now }
            },
            include: {
                groups: {
                    include: {
                        groupMessages: { include: { message: true } }
                    }
                }
            }
        });

        for (const camp of dueCampaigns) {
            try {
                console.log(`${TAG} [Recurring] "${camp.name}" bülten kampanyası çalıştırılıyor...`);

                // Her bir grubunu çalıştır
                for (const grp of camp.groups) {
                    try {
                        await executeGroupSendCore(camp.workspaceId, grp.id);
                    } catch (grpErr) {
                        console.error(`❌ [Recurring] Grup "${grp.name}" çalıştırma hatası:`, grpErr.message);
                    }
                }

                // Bir sonraki çalışma zamanını hesapla
                const nextRun = calculateNextRun({
                    frequency: camp.recurringFrequency || 'WEEKLY',
                    dayOfWeek: camp.recurringDayOfWeek || 1,
                    dayOfMonth: camp.recurringDayOfMonth || 1,
                    time: camp.recurringTime || '10:00',
                    fromDate: now
                });

                await prisma.marketingCampaign.update({
                    where: { id: camp.id },
                    data: {
                        lastRunAt: now,
                        nextRunAt: nextRun
                    }
                });

                console.log(`✅ [Recurring] "${camp.name}" tamamlandı. Sonraki çalışma: ${nextRun.toISOString()}`);
            } catch (campErr) {
                console.error(`❌ [Recurring] Kampanya "${camp.name}" hatası:`, campErr.message);
            }
        }
    } catch (err) {
        console.error(`${TAG} [Recurring] genel hata:`, err.message);
    } finally {
        isRecurringRunning = false;
    }
}

// ══════════════════════════════════════════════════════════════════
// 3. GÜN BAZLI KAMPANYALAR (DAY_BASED: 90-100-120 Gün Pasif, 60 Gün Müşteri, Doğum Günü)
// ══════════════════════════════════════════════════════════════════
export async function processDayBasedMilestones() {
    if (isDayBasedRunning) return;
    isDayBasedRunning = true;

    try {
        const now = new Date();
        const tr = getIstanbulNow(now);

        const dayCampaigns = await prisma.marketingCampaign.findMany({
            where: {
                status: 'ACTIVE',
                campaignType: 'DAY_BASED'
            },
            include: {
                groups: {
                    include: {
                        groupMessages: { include: { message: true } },
                        list: true
                    }
                }
            }
        });

        for (const camp of dayCampaigns) {
            const trigger = camp.dayTrigger || camp.triggerType || 'INACTIVE_DAYS';

            // A) PASİF MÜŞTERİ / HATIRLATICI (90 GÜN, 100 GÜN, 120 GÜN)
            if (trigger === 'INACTIVE_DAYS') {
                for (const grp of camp.groups) {
                    const delayDays = grp.delayDays || 90;
                    const cutoffDate = new Date(now.getTime() - delayDays * 24 * 60 * 60 * 1000);

                    // Bu gruba daha önce gönderilmemiş ve pasif olan kişileri bul
                    const alreadySent = await prisma.marketingRecipient.findMany({
                        where: { groupId: grp.id },
                        select: { contactId: true }
                    });
                    const alreadySentContactIds = alreadySent.map(r => r.contactId).filter(Boolean);

                    const inactiveContacts = await prisma.contact.findMany({
                        where: {
                            workspaceId: camp.workspaceId,
                            isDeleted: false,
                            isArchived: false,
                            id: { notIn: alreadySentContactIds },
                            OR: [
                                { lastContactedAt: { lte: cutoffDate } },
                                { lastContactedAt: null, createdAt: { lte: cutoffDate } }
                            ]
                        },
                        take: 50
                    });

                    if (inactiveContacts.length > 0) {
                        console.log(`${TAG} [DayBased:Inactive] "${camp.name}" -> Grup: "${grp.name}" (${delayDays}. Gün) için ${inactiveContacts.length} pasif kişi bulundu.`);
                        // Alıcıları oluştur ve gönderim başlat
                        for (const contact of inactiveContacts) {
                            await sendIndividualGroupMessage(camp, grp, contact);
                        }
                    }
                }
            }

            // B) DOĞUM GÜNÜ KUTLAMASI
            else if (trigger === 'BIRTHDAY') {
                const birthdayContacts = await prisma.contact.findMany({
                    where: {
                        workspaceId: camp.workspaceId,
                        isDeleted: false,
                        isArchived: false,
                        birthday: { not: null }
                    }
                });

                const todayMatches = birthdayContacts.filter(c => {
                    if (!c.birthday) return false;
                    const b = new Date(c.birthday);
                    return b.getUTCDate() === tr.day && (b.getUTCMonth() + 1) === tr.month;
                });

                for (const grp of camp.groups) {
                    const alreadySent = await prisma.marketingRecipient.findMany({
                        where: {
                            groupId: grp.id,
                            createdAt: { gte: new Date(now.getFullYear(), 0, 1) } // Bu yıl zaten gönderilmiş mi
                        },
                        select: { contactId: true }
                    });
                    const sentIds = alreadySent.map(r => r.contactId);

                    const targetContacts = todayMatches.filter(c => !sentIds.includes(c.id));
                    for (const contact of targetContacts) {
                        await sendIndividualGroupMessage(camp, grp, contact);
                    }
                }
            }

            // C) MÜŞTERİ YAŞI (Örn. 60 Günlük Müşteri)
            else if (trigger === 'CUSTOMER_AGE_DAYS') {
                for (const grp of camp.groups) {
                    const days = grp.delayDays || 60;
                    const minDate = new Date(now.getTime() - (days + 1) * 24 * 60 * 60 * 1000);
                    const maxDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

                    const alreadySent = await prisma.marketingRecipient.findMany({
                        where: { groupId: grp.id },
                        select: { contactId: true }
                    });
                    const sentIds = alreadySent.map(r => r.contactId);

                    const contacts = await prisma.contact.findMany({
                        where: {
                            workspaceId: camp.workspaceId,
                            isDeleted: false,
                            isArchived: false,
                            createdAt: { gte: minDate, lte: maxDate },
                            id: { notIn: sentIds }
                        },
                        take: 50
                    });

                    for (const contact of contacts) {
                        await sendIndividualGroupMessage(camp, grp, contact);
                    }
                }
            }
        }
    } catch (err) {
        console.error(`${TAG} [DayBased] genel hata:`, err.message);
    } finally {
        isDayBasedRunning = false;
    }
}

// ══════════════════════════════════════════════════════════════════
// 4. OLAY BAZLI POTANSİYEL TAKİBİ (30 Gündür Aranmayan Leadler)
// ══════════════════════════════════════════════════════════════════
export async function processUncontactedLeads() {
    try {
        const now = new Date();

        const uncontactedCampaigns = await prisma.marketingCampaign.findMany({
            where: {
                status: 'ACTIVE',
                campaignType: 'EVENT_BASED',
                eventTrigger: 'UNCONTACTED_LEAD'
            },
            include: {
                groups: {
                    include: {
                        groupMessages: { include: { message: true } }
                    }
                }
            }
        });

        for (const camp of uncontactedCampaigns) {
            let uncontactedDays = 30;
            try {
                const cfg = camp.eventConfig ? JSON.parse(camp.eventConfig) : {};
                if (cfg.uncontactedDays) uncontactedDays = parseInt(cfg.uncontactedDays, 10);
            } catch {}

            const cutoffDate = new Date(now.getTime() - uncontactedDays * 24 * 60 * 60 * 1000);

            for (const grp of camp.groups) {
                const alreadySent = await prisma.marketingRecipient.findMany({
                    where: { groupId: grp.id },
                    select: { contactId: true }
                });
                const sentIds = alreadySent.map(r => r.contactId).filter(Boolean);

                // 30 gündür aranmamış potansiyeller:
                // Category: OPPORTUNITY veya NEW, veya hiç aranmamış olanlar
                const candidateContacts = await prisma.contact.findMany({
                    where: {
                        workspaceId: camp.workspaceId,
                        isDeleted: false,
                        isArchived: false,
                        createdAt: { lte: cutoffDate },
                        id: { notIn: sentIds },
                        OR: [
                            { category: 'OPPORTUNITY' },
                            { category: 'NEW' },
                            { leadScore: { gt: 0 } }
                        ]
                    },
                    take: 30
                });

                // Son 30 gün içinde CALL aktivitesi var mı kontrol et
                for (const contact of candidateContacts) {
                    const recentCall = await prisma.contactActivity.findFirst({
                        where: {
                            contactId: contact.id,
                            type: 'CALL',
                            createdAt: { gte: cutoffDate }
                        }
                    });

                    if (!recentCall) {
                        console.log(`${TAG} [UncontactedLead] ${contact.name} (${uncontactedDays} gündür aranmamış) -> Kampanya tetikleniyor`);
                        await sendIndividualGroupMessage(camp, grp, contact);
                    }
                }
            }
        }
    } catch (err) {
        console.error(`${TAG} [UncontactedLeads] hata:`, err.message);
    }
}

// ─── Bireysel Grup Mesajı Gönderme Yardımcısı ────────────────────
async function sendIndividualGroupMessage(campaign, group, contact) {
    const phone = contact.phone?.replace(/[\s\+\-\(\)]/g, '');
    if (!phone) return;

    let formattedPhone = phone;
    if (formattedPhone.startsWith('0')) formattedPhone = '90' + formattedPhone.substring(1);
    else if (!formattedPhone.startsWith('90') && formattedPhone.length === 10) formattedPhone = '90' + formattedPhone;

    const channel = group.channel || 'WHATSAPP';
    const workspaceId = campaign.workspaceId;
    const messages = group.groupMessages?.map(gm => gm.message).filter(Boolean) || [];

    try {
        if (channel === 'WHATSAPP') {
            const whatsappPhone = await prisma.whatsappPhoneNumber.findFirst({ where: { workspaceId } });
            if (!whatsappPhone) return;

            const msgTemplate = messages.find(m => m.channel === 'WHATSAPP') || messages[0];
            if (!msgTemplate?.templateName) return;

            const WHATSAPP_API_VERSION = process.env.WHATSAPP_API_VERSION || 'v21.0';
            const apiUrl = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${whatsappPhone.phoneNumberId}/messages`;

            const payload = {
                messaging_product: 'whatsapp',
                to: formattedPhone,
                type: 'template',
                template: {
                    name: msgTemplate.templateName,
                    language: { code: 'tr' }
                }
            };

            const response = await axios.post(apiUrl, payload, {
                headers: { Authorization: `Bearer ${whatsappPhone.accessToken}`, 'Content-Type': 'application/json' },
                timeout: 15000
            });

            const newWaId = response.data?.messages?.[0]?.id;

            await prisma.marketingRecipient.create({
                data: {
                    campaignId: campaign.id,
                    groupId: group.id,
                    contactId: contact.id,
                    phone: formattedPhone,
                    name: contact.name,
                    status: 'SENT',
                    sentAt: new Date()
                }
            });

            await prisma.campaignGroup.update({
                where: { id: group.id },
                data: { sentCount: { increment: 1 } }
            }).catch(() => {});

            await prisma.marketingCampaign.update({
                where: { id: campaign.id },
                data: { sentCount: { increment: 1 } }
            }).catch(() => {});

        } else if (channel === 'AI_CALL') {
            const ws = await prisma.workspace.findUnique({
                where: { id: workspaceId },
                select: { retellApiKey: true, retellAgentId: true, retellPhoneNumber: true }
            });

            const msg = messages.find(m => m.channel === 'AI_CALL') || messages[0];
            const agentId = msg?.retellAgentId || ws?.retellAgentId;

            if (ws?.retellApiKey && agentId && ws?.retellPhoneNumber) {
                const retellClient = new Retell({ apiKey: ws.retellApiKey });
                let callTo = formattedPhone;
                if (!callTo.startsWith('+')) callTo = '+' + (callTo.startsWith('90') ? callTo : '90' + callTo);

                await retellClient.call.createPhoneCall({
                    from_number: ws.retellPhoneNumber,
                    to_number: callTo,
                    override_agent_id: agentId,
                    retell_llm_dynamic_variables: {
                        customer_name: contact.name || 'Müşterimiz',
                        campaign_name: campaign.name
                    }
                });

                await prisma.marketingRecipient.create({
                    data: {
                        campaignId: campaign.id,
                        groupId: group.id,
                        contactId: contact.id,
                        phone: formattedPhone,
                        name: contact.name,
                        status: 'SENT',
                        sentAt: new Date()
                    }
                });

                await prisma.campaignGroup.update({
                    where: { id: group.id },
                    data: { sentCount: { increment: 1 } }
                }).catch(() => {});
            }
        }
    } catch (err) {
        console.error(`❌ [sendIndividualGroupMessage] Hata (${contact.name} - ${phone}):`, err.response?.data || err.message);
        await prisma.marketingRecipient.create({
            data: {
                campaignId: campaign.id,
                groupId: group.id,
                contactId: contact.id,
                phone: formattedPhone,
                name: contact.name,
                status: 'FAILED',
                failReason: err.response?.data?.error?.message || err.message,
                failedAt: new Date()
            }
        }).catch(() => {});

        await prisma.campaignGroup.update({
            where: { id: group.id },
            data: { failedCount: { increment: 1 } }
        }).catch(() => {});
    }
}
