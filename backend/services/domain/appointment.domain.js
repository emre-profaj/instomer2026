/**
 * ═══════════════════════════════════════════════════════════════
 * APPOINTMENT DOMAIN — RANDEVU OLUŞTURMANIN TEK KAPISI
 * ═══════════════════════════════════════════════════════════════
 *
 * KURAL: `prisma.appointment.create` SADECE bu dosyada çağrılır.
 * Randevu oluşturan her yol (UI, chat botu, sesli bot, otomasyon,
 * kural motoru) buradaki createAppointment() fonksiyonunu çağırır.
 *
 * Böylece şunlar TEK yerde ve herkes için geçerli olur:
 *   1. İzin kapısı  — panelden "Randevu Talebi Algılama" kapalıysa otomatik yollar durur
 *   2. Çakışma kontrolü — çift rezervasyon engellenir (agent + kaynak)
 *   3. Google Takvim senkronizasyonu
 *   4. Socket bildirimi — takvim canlı güncellenir
 *   5. Bildirim + otomasyon hook'u
 *
 * Önce: 5 ayrı dosyada 5 farklı davranış. Şimdi: 1 davranış.
 */

import prisma from '../../lib/prisma.js';
import { emitToWorkspace } from '../../socket.js';
import { isRuleEnabled, RULES } from '../policy/automationPolicy.service.js';
import { normalizePhone } from '../../utils/phoneNormalizer.js';

/** Randevuyu kimin oluşturduğu. MANUAL dışındakiler izin kapısından geçer. */
export const APPOINTMENT_SOURCE = {
    MANUAL: 'MANUAL',         // Temsilci panelden elle oluşturdu → toggle'dan etkilenmez
    CHAT_BOT: 'CHAT_BOT',     // Yazışma botu (appointmentBot.service)
    VOICE_BOT: 'VOICE_BOT',   // Retell sesli bot (appointmentFunctions.service)
    AUTOMATION: 'AUTOMATION', // Otomasyon aksiyonu (automationExecutor)
    RULE: 'RULE',             // Kural motoru (rules.controller)
};

/** İzin kapısından muaf kaynaklar — insan iradesiyle yapılan işlemler. */
const GATE_EXEMPT = new Set([APPOINTMENT_SOURCE.MANUAL]);

/** Sonuç kodları — çağıranlar buna göre kullanıcıya mesaj verir. */
export const APPOINTMENT_RESULT = {
    CREATED: 'CREATED',
    DISABLED: 'DISABLED',   // Panelden kapatılmış
    CONFLICT: 'CONFLICT',   // Zaman çakışması
    INVALID: 'INVALID',     // Eksik/hatalı girdi
    ERROR: 'ERROR',
};

// ─────────────────────────────────────────────────────────────────
// Çakışma kontrolü
// ─────────────────────────────────────────────────────────────────

/**
 * Bir agent veya kaynak (doktor/oda) için zaman çakışması var mı?
 * Daha önce yalnızca manuel yolda vardı; artık tüm yollarda geçerli.
 */
export async function findConflict({ assignedToId, resourceId, startTime, endTime, excludeId = null }) {
    const owners = [];
    if (assignedToId) owners.push({ assignedToId });
    if (resourceId) owners.push({ resourceId });

    // Takvim sahibi yoksa (havuz randevusu) çakışacak bir şey de yoktur.
    if (owners.length === 0) return null;

    const where = {
        OR: owners,
        status: { notIn: ['CANCELLED', 'COMPLETED'] },
        AND: [{
            OR: [
                { startTime: { lte: startTime }, endTime: { gt: startTime } },
                { startTime: { lt: endTime }, endTime: { gte: endTime } },
                { startTime: { gte: startTime }, endTime: { lte: endTime } },
            ],
        }],
    };
    if (excludeId) where.id = { not: excludeId };

    return prisma.appointment.findFirst({ where });
}

// ─────────────────────────────────────────────────────────────────
// Ana giriş noktası
// ─────────────────────────────────────────────────────────────────

/**
 * Randevu oluşturur. Tek yetkili yol.
 *
 * @returns {Promise<{ok: boolean, result: string, appointment?: object, conflict?: object, message?: string}>}
 *          Hiçbir zaman throw etmez — çağıranlar sonucu okuyup karar verir.
 */
export async function createAppointment(input = {}) {
    const {
        workspaceId,
        source = APPOINTMENT_SOURCE.MANUAL,
        title,
        description = null,
        startTime,
        endTime,
        assignedToId = null,
        resourceId = null,
        contactId = null,
        contactName = '',
        contactPhone = '',
        contactEmail = null,
        doctorName = null,
        branch = null,
        procedure = null,
        color = null,
        notes = null,
        status = 'SCHEDULED',
        createdById = 'system',
        createdByBotId = null,
        conversationId = null,
        // Google takvimine hangi kullanıcının adına yazılsın (yoksa assignedToId)
        syncUserId = null,
        // Sadece güncelleme akışları için: çakışma kontrolünde bu kaydı atla
        excludeId = null,
        // Çok özel durumlar için kaçış kapısı (varsayılan: kontrol yapılır)
        skipConflictCheck = false,
    } = input;

    // ── 0. Girdi doğrulama ───────────────────────────────────────
    if (!workspaceId) {
        return { ok: false, result: APPOINTMENT_RESULT.INVALID, message: 'workspaceId zorunludur' };
    }
    const start = startTime instanceof Date ? startTime : new Date(startTime);
    const end = endTime instanceof Date ? endTime : new Date(endTime);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return { ok: false, result: APPOINTMENT_RESULT.INVALID, message: 'Geçersiz başlangıç/bitiş zamanı' };
    }
    if (start >= end) {
        return { ok: false, result: APPOINTMENT_RESULT.INVALID, message: 'Bitiş zamanı başlangıçtan sonra olmalıdır' };
    }

    // ── 1. İZİN KAPISI ───────────────────────────────────────────
    // Panelden "Randevu Talebi Algılama" kapatıldıysa otomatik yolların hepsi burada durur.
    if (!GATE_EXEMPT.has(source)) {
        const enabled = await isRuleEnabled(workspaceId, RULES.APPOINTMENT_AUTO_PLAN);
        if (!enabled) {
            console.log(`🚫 [Appointment] ${source} randevusu ENGELLENDİ — "Randevu Talebi Algılama" kapalı (ws: ${workspaceId})`);
            return {
                ok: false,
                result: APPOINTMENT_RESULT.DISABLED,
                message: 'Otomatik randevu oluşturma bu çalışma alanında kapalı.',
            };
        }
    }

    // ── 2. ÇAKIŞMA KONTROLÜ ──────────────────────────────────────
    // Eskiden yalnızca manuel yolda vardı; botlar çift rezervasyon yapabiliyordu.
    if (!skipConflictCheck) {
        const conflict = await findConflict({ assignedToId, resourceId, startTime: start, endTime: end, excludeId });
        if (conflict) {
            console.log(`⛔ [Appointment] ${source} çakışma — ${conflict.id} (${conflict.startTime?.toISOString?.()})`);
            return {
                ok: false,
                result: APPOINTMENT_RESULT.CONFLICT,
                conflict,
                message: 'Bu zaman diliminde takvim dolu.',
            };
        }
    }

    // ── 3. Kaynaktan doktor/şube tamamlama ───────────────────────
    let resolvedDoctorName = doctorName || '';
    let resolvedBranch = branch || '';
    if (resourceId && (!resolvedDoctorName || !resolvedBranch)) {
        try {
            const res = await prisma.calendarResource.findUnique({ where: { id: resourceId } });
            if (res) {
                if (!resolvedDoctorName && res.type === 'PERSON') resolvedDoctorName = res.name;
                if (!resolvedBranch && res.description) resolvedBranch = res.description;
            }
        } catch (err) {
            console.warn('⚠️ [Appointment] Kaynak okunamadı:', err.message);
        }
    }

    // ── 4. Kayıt ─────────────────────────────────────────────────
    let resolvedBotId = createdByBotId || null;
    if (!resolvedBotId && (source === APPOINTMENT_SOURCE.CHAT_BOT || source === APPOINTMENT_SOURCE.VOICE_BOT || createdById === 'system')) {
        try {
            if (conversationId) {
                const conv = await prisma.conversation.findUnique({
                    where: { id: conversationId },
                    select: { assignedBotId: true }
                });
                resolvedBotId = conv?.assignedBotId || null;
            }
            if (!resolvedBotId && source === APPOINTMENT_SOURCE.VOICE_BOT) {
                const tmpl = await prisma.retellTemplate.findFirst({
                    where: { workspaceId },
                    select: { agentId: true }
                });
                resolvedBotId = tmpl?.agentId || null;
            }
            if (!resolvedBotId) {
                const activeBot = await prisma.aIBot.findFirst({
                    where: { workspaceId, isActive: true },
                    select: { id: true }
                });
                resolvedBotId = activeBot?.id || null;
            }
        } catch (botLookupErr) {
            console.warn('⚠️ [Appointment] Bot lookup failed:', botLookupErr.message);
        }
    }

    let appointment;
    try {
        appointment = await prisma.appointment.create({
            data: {
                workspaceId,
                title: title || `Randevu — ${contactName || 'Müşteri'}`,
                description,
                startTime: start,
                endTime: end,
                assignedToId: assignedToId || null,
                resourceId: resourceId || null,
                contactId: contactId || null,
                contactName: contactName || '',
                contactPhone: contactPhone ? normalizePhone(contactPhone) : '',
                contactEmail: contactEmail || null,
                doctorName: resolvedDoctorName || null,
                branch: resolvedBranch || null,
                procedure: procedure || null,
                color: color || '#3b82f6',
                notes,
                status,
                createdById: createdById || 'system',
                createdByBotId: resolvedBotId || null,
                conversationId: conversationId || null,
            },
        });
    } catch (err) {
        console.error(`❌ [Appointment] ${source} kayıt hatası:`, err.message);
        return { ok: false, result: APPOINTMENT_RESULT.ERROR, message: err.message };
    }

    console.log(`✅ [Appointment] ${source} → ${appointment.id} | ${contactName || '-'} | ${start.toISOString()}`);

    // ── 5. Yan etkiler (hiçbiri randevuyu iptal ettirmez) ────────
    runSideEffects({ appointment, workspaceId, syncUserId, conversationId, source }).catch(err =>
        console.error('⚠️ [Appointment] Yan etki hatası:', err.message)
    );

    return { ok: true, result: APPOINTMENT_RESULT.CREATED, appointment };
}

// ─────────────────────────────────────────────────────────────────
// Yan etkiler — eskiden 5 dosyada kopyalanmıştı, artık tek yerde
// ─────────────────────────────────────────────────────────────────
async function runSideEffects({ appointment, workspaceId, syncUserId, conversationId, source }) {
    // 5a. Google Takvim
    const targetUserId = syncUserId || appointment.assignedToId || null;
    try {
        const { syncAppointmentToGoogle } = await import('../googleCalendar.service.js');
        await syncAppointmentToGoogle(appointment.id, targetUserId || undefined)
            .catch(e => console.error('[Appointment/GoogleSync]', e.message));
    } catch (err) {
        console.error('[Appointment/GoogleSync] import hatası:', err.message);
    }

    // 5b. Socket — frontend SADECE 'appointment_updated' dinliyor.
    // Bot yolları eskiden yalnızca 'appointment_created' yayınladığı için
    // bot randevuları takvimde canlı görünmüyordu. İkisini birden yayınlıyoruz.
    try {
        emitToWorkspace(workspaceId, 'appointment_updated', { action: 'created', appointmentId: appointment.id });
        emitToWorkspace(workspaceId, 'appointment_created', { appointment });
    } catch (err) {
        console.error('[Appointment/Socket]', err.message);
    }

    // 5c. Otomasyon hook'u (eskiden yalnızca manuel yolda vardı)
    if (appointment.contactId) {
        try {
            const { executeRule } = await import('../ruleEngine.service.js');
            await executeRule(workspaceId, 'APPOINTMENT_PLANNED_NOTIFY', { contactId: appointment.contactId })
                .catch(e => console.error('[Appointment/Hook]', e.message));
        } catch (err) {
            console.error('[Appointment/Hook] import hatası:', err.message);
        }
    }

    // 5d. Bildirim (eskiden yalnızca chat bot yolunda vardı)
    if (source !== APPOINTMENT_SOURCE.MANUAL) {
        try {
            await notifyOwners({ appointment, workspaceId, conversationId });
        } catch (err) {
            console.warn('⚠️ [Appointment/Notify]', err.message);
        }
    }
}

async function notifyOwners({ appointment, workspaceId, conversationId }) {
    const { createNotification, createTeamNotifications } = await import('../../controllers/notification.controller.js');

    const whenTR = appointment.startTime.toLocaleString('tr-TR', {
        timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    });
    const title = `📅 Yeni Randevu — ${appointment.contactName || 'Müşteri'}`;
    const body = `${whenTR}${appointment.branch ? ' | ' + appointment.branch : ''}`;

    if (appointment.assignedToId) {
        await createNotification(workspaceId, appointment.assignedToId, 'APPOINTMENT_CREATED', title, body, { conversationId });
        return;
    }

    if (!conversationId) return;
    const conv = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { assignedToId: true, teamIds: true },
    });
    if (conv?.assignedToId) {
        await createNotification(workspaceId, conv.assignedToId, 'APPOINTMENT_CREATED', title, body, { conversationId });
        return;
    }
    if (conv?.teamIds) {
        let teamIds = [];
        try { teamIds = typeof conv.teamIds === 'string' ? JSON.parse(conv.teamIds || '[]') : (conv.teamIds || []); } catch { teamIds = []; }
        if (teamIds.length > 0) {
            await createTeamNotifications(workspaceId, teamIds[0], 'APPOINTMENT_CREATED', title, body, { conversationId });
        }
    }
}
