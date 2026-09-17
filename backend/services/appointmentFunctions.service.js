/**
 * Appointment Functions Service
 * ─────────────────────────────────────────────────────────────
 * Generic randevu fonksiyonları — her sektör için çalışır:
 *   - Klinik: Doktor randevusu
 *   - Gayrimenkul: Satış temsilcisi görüşmesi
 *   - Danışmanlık: Danışman randevusu
 *
 * AI Bot (WhatsApp/Web) ve Retell (Telefon) tarafından
 * function calling ile çağrılır.
 */
import prisma from '../lib/prisma.js';
import { createAppointment, APPOINTMENT_SOURCE, APPOINTMENT_RESULT } from './domain/appointment.domain.js';
import { ensureDefaultWhatsAppTemplates } from './defaultWhatsAppTemplates.service.js';
import { setTrTime, parseTrDateTime } from '../utils/trTime.js';

const REMINDER_TEMPLATE_NAME = 'randevu_hatirlatma';

// ─── Yardımcılar ─────────────────────────────────────────────

/**
 * Gün adını Türkçe'den veya İngilizce'den day-of-week index'e çevir (0=Pazar, 1=Pazartesi...)
 */
const DAY_MAP = {
    'monday': 1, 'pazartesi': 1,
    'tuesday': 2, 'salı': 2, 'sali': 2,
    'wednesday': 3, 'çarşamba': 3, 'carsamba': 3,
    'thursday': 4, 'perşembe': 4, 'persembe': 4,
    'friday': 5, 'cuma': 5,
    'saturday': 6, 'cumartesi': 6,
    'sunday': 0, 'pazar': 0
};

const DAY_NAMES_TR = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

function parseTime(timeStr) {
    if (!timeStr) return null;
    const [h, m] = timeStr.split(':').map(Number);
    return { hours: h, minutes: m || 0 };
}

/**
 * Verilen günün TÜRKİYE saatiyle belirtilen saatini döndürür.
 *
 * Eskiden d.setHours(...) kullanıyordu. Sunucu Etc/UTC çalıştığı için
 * "15:00" doğrudan 15:00 UTC oluyordu; takvim TR'ye çevirip gösterince
 * randevular +3 saat ileri görünüyordu (gerçek vaka: bot 15:00 dedi,
 * takvimde 18:00 çıktı). Artık ortak yardımcıdan geçiyor.
 */
function setTime(date, timeStr) {
    const t = parseTime(timeStr);
    if (!t) return date;
    return setTrTime(date, t) || date;
}

function addMinutes(date, mins) {
    return new Date(date.getTime() + mins * 60000);
}

function formatDate(date) {
    return date.toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Europe/Istanbul' });
}

function formatTime(date) {
    return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });
}

// ─── 1. MÜSAIT SLOT SORGULAMA ───────────────────────────────

/**
 * check_availability
 * 
 * Bir kişi (doktor/temsilci) veya takımdaki herkes için müsait slotları döner.
 * 
 * @param {string} workspaceId
 * @param {object} params
 * @param {string} [params.person_id]    - Belirli kişi ID (user veya doctor)
 * @param {string} [params.person_name]  - Kişi adı (arama ile bulur)
 * @param {string} [params.team_id]      - Takım ID (takımdaki herkesi kontrol eder)
 * @param {string} [params.date]         - Tarih (YYYY-MM-DD) — boşsa bugün + 7 gün
 * @param {string} [params.date_range]   - Gün sayısı (varsayılan 3)
 * @param {string} [params.branch]       - Branş adı (klinik modu)
 */
export async function checkAvailability(workspaceId, params = {}) {
    try {
        console.log(`📅 [AppointmentFn] check_availability:`, JSON.stringify(params));

        const dateRangeDays = parseInt(params.date_range) || 3;
        let startDate = params.date ? new Date(params.date) : new Date();
        // Bugünden daha önceyse bugünü kullan
        if (startDate < new Date()) {
            startDate = new Date();
        }
        startDate.setHours(0, 0, 0, 0);

        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + dateRangeDays);
        endDate.setHours(23, 59, 59, 999);

        // ── Kişileri belirle ──
        let providers = []; // [{ id, name, workStart, workEnd, workingDays, slotMinutes, type }]

        if (params.person_id) {
            // Önce AppointmentDoctor'da ara
            const doctor = await prisma.appointmentDoctor.findUnique({
                where: { id: params.person_id },
                include: { branch: true }
            });
            if (doctor) {
                providers.push({
                    id: doctor.id, name: doctor.name,
                    workStart: doctor.workStart || '09:00',
                    workEnd: doctor.workEnd || '18:00',
                    workingDays: tryParseJSON(doctor.workingDays) || ['monday','tuesday','wednesday','thursday','friday'],
                    slotMinutes: doctor.slotMinutes || 30,
                    type: 'doctor'
                });
            } else {
                // CalendarResource olarak ara
                const resource = await prisma.calendarResource.findUnique({
                    where: { id: params.person_id }
                });
                if (resource) {
                    providers.push({
                        id: resource.id, name: resource.name,
                        workStart: resource.workStart || '09:00',
                        workEnd: resource.workEnd || '18:00',
                        workingDays: tryParseJSON(resource.workingDays) || ['monday','tuesday','wednesday','thursday','friday'],
                        slotMinutes: resource.slotMinutes || 30,
                        type: 'doctor'
                    });
                } else {
                    // User olarak ara
                    const user = await prisma.user.findUnique({ where: { id: params.person_id } });
                    if (user) {
                        const wh = tryParseJSON(user.workingHours) || {};
                        providers.push({
                            id: user.id, name: user.name,
                            workStart: wh.start || '09:00',
                            workEnd: wh.end || '18:00',
                            workingDays: wh.days || ['monday','tuesday','wednesday','thursday','friday'],
                            slotMinutes: wh.slotMinutes || 30,
                            type: 'user'
                        });
                    }
                }
            }
        } else if (params.person_name) {
            // İsimle arama — doktor veya user
            const doctors = await prisma.appointmentDoctor.findMany({
                where: {
                    name: { contains: params.person_name, mode: 'insensitive' },
                    branch: { workspaceId },
                    isActive: true
                }
            });
            for (const d of doctors) {
                providers.push({
                    id: d.id, name: d.name,
                    workStart: d.workStart || '09:00',
                    workEnd: d.workEnd || '18:00',
                    workingDays: tryParseJSON(d.workingDays) || ['monday','tuesday','wednesday','thursday','friday'],
                    slotMinutes: d.slotMinutes || 30,
                    type: 'doctor'
                });
            }
            if (!providers.length) {
                // CalendarResource'da ara
                const resources = await prisma.calendarResource.findMany({
                    where: {
                        name: { contains: params.person_name, mode: 'insensitive' },
                        workspaceId,
                        type: 'PERSON',
                        isActive: true
                    }
                });
                for (const r of resources) {
                    providers.push({
                        id: r.id, name: r.name,
                        workStart: r.workStart || '09:00',
                        workEnd: r.workEnd || '18:00',
                        workingDays: tryParseJSON(r.workingDays) || ['monday','tuesday','wednesday','thursday','friday'],
                        slotMinutes: r.slotMinutes || 30,
                        type: 'doctor'
                    });
                }
            }
            if (!providers.length) {
                // User'da ara
                const users = await prisma.user.findMany({
                    where: {
                        name: { contains: params.person_name, mode: 'insensitive' },
                        workspaceMembers: { some: { workspaceId } }
                    }
                });
                for (const u of users) {
                    const wh = tryParseJSON(u.workingHours) || {};
                    providers.push({
                        id: u.id, name: u.name,
                        workStart: wh.start || '09:00',
                        workEnd: wh.end || '18:00',
                        workingDays: wh.days || ['monday','tuesday','wednesday','thursday','friday'],
                        slotMinutes: wh.slotMinutes || 30,
                        type: 'user'
                    });
                }
            }
        } else if (params.team_id) {
            // Takımdaki tüm üyeleri al
            const teamMembers = await prisma.teamMember.findMany({
                where: { teamId: params.team_id, userId: { not: null } },
                include: { user: true }
            });
            for (const tm of teamMembers) {
                if (!tm.user) continue;
                const wh = tryParseJSON(tm.user.workingHours) || {};
                providers.push({
                    id: tm.user.id, name: tm.user.name,
                    workStart: wh.start || '09:00',
                    workEnd: wh.end || '18:00',
                    workingDays: wh.days || ['monday','tuesday','wednesday','thursday','friday'],
                    slotMinutes: wh.slotMinutes || 30,
                    type: 'user'
                });
            }
        } else if (params.branch) {
            // Branştaki tüm doktorları al
            const branch = await prisma.appointmentBranch.findFirst({
                where: { workspaceId, name: { contains: params.branch, mode: 'insensitive' }, isActive: true },
                include: { doctors: { where: { isActive: true } } }
            });
            if (branch) {
                for (const d of branch.doctors) {
                    providers.push({
                        id: d.id, name: d.name,
                        workStart: d.workStart || '09:00',
                        workEnd: d.workEnd || '18:00',
                        workingDays: tryParseJSON(d.workingDays) || ['monday','tuesday','wednesday','thursday','friday'],
                        slotMinutes: d.slotMinutes || 30,
                        type: 'doctor'
                    });
                }
            }
        } else {
            // Hiçbir filtre yoksa — workspace çalışma saatlerini kullan
            // Workspace'in genel ayarı üzerinden çalışır
            return {
                success: false,
                error: 'Lütfen bir kişi adı, takım veya branş belirtin. Kimi aramak istediğinizi söyleyebilir misiniz?'
            };
        }

        if (!providers.length) {
            return { success: false, error: 'Belirtilen kriterlere uygun kişi bulunamadı.' };
        }

        // ── Mevcut randevuları çek (çakışma kontrolü) ──
        const providerIds = providers.map(p => p.id);
        const existingAppointments = await prisma.appointment.findMany({
            where: {
                workspaceId,
                status: { in: ['SCHEDULED', 'PENDING'] },
                startTime: { gte: startDate, lte: endDate },
                OR: [
                    { assignedToId: { in: providerIds.filter(id => providers.find(p => p.id === id && p.type === 'user')) } },
                    { doctorName: { in: providers.filter(p => p.type === 'doctor').map(p => p.name) } }
                ]
            }
        });

        // ── Slotları hesapla ──
        const allSlots = [];

        for (const provider of providers) {
            const busySlots = existingAppointments.filter(a => 
                a.assignedToId === provider.id || 
                (a.doctorName && a.doctorName.toLowerCase() === provider.name.toLowerCase())
            );

            for (let day = 0; day < dateRangeDays; day++) {
                const currentDay = new Date(startDate);
                currentDay.setDate(currentDay.getDate() + day);
                
                const dayOfWeek = currentDay.getDay();
                const dayName = Object.keys(DAY_MAP).find(k => DAY_MAP[k] === dayOfWeek && !k.match(/[çşğüöı]/));
                
                // Çalışma günü mü?
                const workDays = provider.workingDays.map(d => d.toLowerCase());
                if (!workDays.some(wd => DAY_MAP[wd] === dayOfWeek)) continue;

                // Slot'ları oluştur
                let slotStart = setTime(currentDay, provider.workStart);
                const dayEnd = setTime(currentDay, provider.workEnd);

                // Geçmişi atla (bugün ise şu andan sonrasını al)
                const now = new Date();
                const nowTRDate = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
                const slotTRDate = currentDay.toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });

                if (slotTRDate <= nowTRDate) {
                    const nowTRTime = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });
                    // formatTime, '09:00' formatında döner (Eğer setHours UTC ise bu TR karşılığı farklı olabilir, bu yüzden string yerine kendi oluşturduğu saati alalım)
                    const slotTimeStr = `${String(slotStart.getHours()).padStart(2, '0')}:${String(slotStart.getMinutes()).padStart(2, '0')}`;
                    // Daha iyisi, setTime ile ayarlandığı için provider.workStart saatine göre kıyaslama yapalım
                    
                    // Doğru TR saati kıyaslaması için manuel diff hesabı:
                    // slotStart nesnesinin İstanbul'daki saatine bakalım:
                    const slotTRTimeFull = slotStart.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });
                    
                    if (slotTRDate < nowTRDate || slotTRTimeFull < nowTRTime) {
                        // Eğer sunucu saat farkından dolayı nesneler kaydıysa, 
                        // Slot'u 'now' nesnesinden sonraki geçerli ilk dilime çek:
                        const diffMins = Math.ceil((now - slotStart) / 60000);
                        if (diffMins > 0) {
                            const slotsToSkip = Math.ceil(diffMins / provider.slotMinutes);
                            slotStart = addMinutes(slotStart, slotsToSkip * provider.slotMinutes);
                        }
                    }
                }

                while (slotStart < dayEnd) {
                    const slotEnd = addMinutes(slotStart, provider.slotMinutes);
                    
                    // Çakışma var mı?
                    const isBusy = busySlots.some(a => {
                        const aStart = new Date(a.startTime);
                        const aEnd = new Date(a.endTime);
                        return slotStart < aEnd && slotEnd > aStart;
                    });

                    if (!isBusy) {
                        allSlots.push({
                            provider_id: provider.id,
                            provider_name: provider.name,
                            provider_type: provider.type,
                            date: currentDay.toISOString().split('T')[0],
                            date_formatted: formatDate(currentDay),
                            day_name: DAY_NAMES_TR[dayOfWeek],
                            start_time: formatTime(slotStart),
                            end_time: formatTime(slotEnd),
                            start_iso: slotStart.toISOString(),
                            end_iso: slotEnd.toISOString()
                        });
                    }

                    slotStart = slotEnd;
                }
            }
        }

        // Tarihe göre sırala
        allSlots.sort((a, b) => new Date(a.start_iso) - new Date(b.start_iso));

        // Sonuçları grupla (gün bazında, max 10 slot per day)
        const grouped = {};
        for (const slot of allSlots) {
            if (!grouped[slot.date]) {
                grouped[slot.date] = {
                    date: slot.date,
                    date_formatted: slot.date_formatted,
                    day_name: slot.day_name,
                    slots: []
                };
            }
            if (grouped[slot.date].slots.length < 10) {
                grouped[slot.date].slots.push(slot);
            }
        }

        const summary = Object.values(grouped).map(day => {
            const slotList = day.slots.map(s => {
                const personInfo = providers.length > 1 ? ` (${s.provider_name})` : '';
                return `${s.start_time}${personInfo}`;
            }).join(', ');
            return `${day.day_name} ${day.date}: ${slotList}`;
        }).join('\n');

        return {
            success: true,
            total_available_slots: allSlots.length,
            providers: providers.map(p => ({ id: p.id, name: p.name, type: p.type })),
            days: Object.values(grouped),
            summary: allSlots.length > 0 
                ? `${providers.length > 1 ? providers.map(p => p.name).join(', ') : providers[0]?.name} için müsait saatler:\n${summary}`
                : 'Belirtilen tarih aralığında müsait slot bulunamadı. Başka bir tarih denemek ister misiniz?'
        };
    } catch (err) {
        console.error('❌ [AppointmentFn] check_availability error:', err);
        return { success: false, error: 'Müsaitlik sorgulanırken bir hata oluştu: ' + err.message };
    }
}

// ─── 2. RANDEVU OLUŞTURMA ────────────────────────────────────

/**
 * book_appointment
 * 
 * @param {string} workspaceId
 * @param {object} params
 * @param {string} params.provider_id     - Kişi ID (doktor/user)
 * @param {string} params.provider_type   - 'doctor' veya 'user'
 * @param {string} params.start_time      - ISO datetime veya "HH:MM"
 * @param {string} params.date            - YYYY-MM-DD (start_time sadece saat ise)
 * @param {string} params.customer_name   - Müşteri adı
 * @param {string} params.customer_phone  - Müşteri telefonu
 * @param {string} [params.customer_email]
 * @param {string} [params.title]         - Randevu başlığı
 * @param {string} [params.notes]         - Notlar
 * @param {string} [params.branch]        - Branş adı
 * @param {string} [params.procedure]     - İşlem türü
 * @param {string} [params.duration]      - Dakika (varsayılan 30)
 * @param {string} [params.conversation_id]
 * @param {string} [params.bot_id]
 */
export async function bookAppointment(workspaceId, params = {}) {
    try {
        console.log(`📅 [AppointmentFn] book_appointment:`, JSON.stringify(params));

        // ── Parametreleri doğrula ──
        // ── HİZMET ZORUNLULUĞU ────────────────────────────────────────────────
        // Hizmet seçilmeden randevu, takvimde konusu belirsiz bir kayıt
        // oluşturuyordu. Yalnızca firmanın tanımlı ürünü varsa zorunlu:
        // ürün girmemiş firmalarda ve sesli bot akışında kapıyı kilitlemez.
        if (!params.service && !params.procedure) {
            const svcCount = await prisma.product.count({
                where: { workspaceId, isActive: true, isGroup: false }
            });
            if (svcCount > 0) {
                return {
                    success: false,
                    error: 'Hangi hizmet için randevu istendiği belirtilmedi. Önce list_services ile hizmetleri sun ve müşteriye seçtir.'
                };
            }
        }

        if (!params.customer_name) {
            return { success: false, error: 'Müşteri adı gerekli. Adınızı öğrenebilir miyim?' };
        }
        if (!params.customer_phone) {
            return { success: false, error: 'Telefon numarası gerekli. Telefon numaranızı alabilir miyim?' };
        }
        if (!params.start_time && !params.date) {
            return { success: false, error: 'Randevu tarihi ve saati gerekli. Hangi gün ve saat uygun?' };
        }

        // ── Tarih/saati parse et ──
        let startTime;
        const duration = parseInt(params.duration) || 30;

        if (params.start_time && params.start_time.includes('T')) {
            // ISO format — saat dilimi taşıyorsa (Z veya +03:00) olduğu gibi,
            // taşımıyorsa TR duvar saati kabul edilir.
            startTime = /[Zz]|[+-]\d{2}:?\d{2}$/.test(params.start_time)
                ? new Date(params.start_time)
                : (parseTrDateTime(params.start_time.split('T')[0], params.start_time.split('T')[1]) || new Date(params.start_time));
        } else if (params.date && params.start_time) {
            // date + HH:MM — TR saati
            startTime = parseTrDateTime(params.date, params.start_time) || setTime(new Date(params.date), params.start_time);
        } else if (params.date) {
            // Sadece tarih — varsayılan 09:00 TR
            startTime = parseTrDateTime(params.date, '09:00') || setTime(new Date(params.date), '09:00');
        } else {
            return { success: false, error: 'Geçerli bir tarih formatı belirtin.' };
        }

        if (isNaN(startTime.getTime())) {
            return { success: false, error: 'Geçersiz tarih/saat formatı.' };
        }

        // Geçmiş tarih kontrolü
        if (startTime < new Date()) {
            return { success: false, error: 'Geçmiş bir tarihe randevu alınamaz. Lütfen gelecek bir tarih seçin.' };
        }

        const endTime = addMinutes(startTime, duration);

        // ── Kişiyi belirle ──
        let assignedToId = null;
        let doctorName = null;
        let providerName = 'Temsilci';

        if (params.provider_id) {
            if (params.provider_type === 'doctor') {
                const doctor = await prisma.appointmentDoctor.findUnique({ where: { id: params.provider_id } });
                if (doctor) {
                    doctorName = doctor.name;
                    providerName = doctor.name;
                    if (doctor.userId) {
                        assignedToId = doctor.userId;
                    }
                } else {
                    const resource = await prisma.calendarResource.findUnique({ where: { id: params.provider_id } });
                    if (resource) {
                        doctorName = resource.name;
                        providerName = resource.name;
                        if (resource.userId) {
                            assignedToId = resource.userId;
                        }
                    }
                }
            } else {
                assignedToId = params.provider_id;
                const user = await prisma.user.findUnique({ where: { id: params.provider_id }, select: { name: true } });
                if (user) providerName = user.name;
            }
        }

        // ── Çakışma kontrolü ──
        const conflictWhere = {
            workspaceId,
            status: { in: ['SCHEDULED', 'PENDING'] },
            startTime: { lt: endTime },
            endTime: { gt: startTime }
        };
        if (assignedToId) conflictWhere.assignedToId = assignedToId;
        if (doctorName) conflictWhere.doctorName = doctorName;

        const conflict = await prisma.appointment.findFirst({ where: conflictWhere });
        if (conflict) {
            return {
                success: false,
                error: `Bu saat dolu! ${providerName} için ${formatTime(startTime)} saati müsait değil. Lütfen başka bir saat seçin.`
            };
        }

        // ── Contact bul veya oluştur ──
        let contactId = null;
        const normalizedPhone = params.customer_phone.replace(/\D/g, '');
        
        if (normalizedPhone) {
            const existing = await prisma.contact.findFirst({
                where: {
                    workspaceId,
                    OR: [
                        { phone: { contains: normalizedPhone.slice(-10) } },
                        { phone: normalizedPhone }
                    ]
                }
            });
            if (existing) {
                contactId = existing.id;
            } else {
                const newContact = await prisma.contact.create({
                    data: {
                        workspaceId,
                        name: params.customer_name,
                        phone: normalizedPhone,
                        email: params.customer_email || null,
                        source: 'APPOINTMENT_BOT'
                    }
                });
                contactId = newContact.id;
            }
        }

        // ── Workspace'ten bir admin bul (createdById için) ──
        const adminMember = await prisma.workspaceMember.findFirst({
            where: { workspaceId, role: { in: ['OWNER', 'ADMIN'] } },
            select: { userId: true }
        });
        const createdById = assignedToId || adminMember?.userId || 'system';

        // ── TEK KAPI: izin kapısı + çakışma + google sync + socket + bildirim ──
        const outcome = await createAppointment({
            workspaceId,
            source: APPOINTMENT_SOURCE.VOICE_BOT,
            title: params.title || `${params.customer_name} - Randevu`,
            description: params.notes || null,
            startTime,
            endTime,
            assignedToId,
            contactId,
            contactName: params.customer_name,
            contactPhone: normalizedPhone,
            contactEmail: params.customer_email || null,
            notes: params.notes || null,
            createdById,
            createdByBotId: params.bot_id || null,
            conversationId: params.conversation_id || null,
            branch: params.branch || null,
            procedure: params.procedure || params.service || null,
            doctorName,
        });

        if (!outcome.ok) {
            // Bu metin sesli bota döner ve müşteriye okunur.
            if (outcome.result === APPOINTMENT_RESULT.DISABLED) {
                console.log('🚫 [AppointmentFn] "Randevu Talebi Algılama" kapalı — randevu oluşturulmadı');
                return {
                    success: false,
                    error: 'APPOINTMENT_DISABLED',
                    message: 'Şu anda telefon üzerinden randevu oluşturamıyorum. Talebinizi ekibimize iletiyorum, sizi en kısa sürede arayacaklar.'
                };
            }
            if (outcome.result === APPOINTMENT_RESULT.CONFLICT) {
                console.log('⛔ [AppointmentFn] Seçilen saat dolu — randevu oluşturulmadı');
                return {
                    success: false,
                    error: 'SLOT_TAKEN',
                    message: 'Maalesef o saat dolu görünüyor. Size başka bir saat önerebilir miyim?'
                };
            }
            console.warn(`⚠️ [AppointmentFn] Randevu oluşturulamadı (${outcome.result}): ${outcome.message || ''}`);
            return {
                success: false,
                error: outcome.result,
                message: 'Randevuyu kaydederken bir sorun oluştu. Birazdan tekrar deneyelim.'
            };
        }

        const appointment = outcome.appointment;
        console.log(`✅ [AppointmentFn] Randevu oluşturuldu: ${appointment.id} | ${providerName} | ${formatDate(startTime)} ${formatTime(startTime)}`);

        return {
            success: true,
            appointment_id: appointment.id,
            provider_name: providerName,
            date: startTime.toISOString().split('T')[0],
            date_formatted: formatDate(startTime),
            start_time: formatTime(startTime),
            end_time: formatTime(endTime),
            customer_name: params.customer_name,
            customer_phone: normalizedPhone,
            message: `Randevunuz başarıyla oluşturuldu! ${formatDate(startTime)}, ${formatTime(startTime)} - ${formatTime(endTime)} saatleri arasında ${providerName} ile görüşmeniz planlandı.`
        };
    } catch (err) {
        console.error('❌ [AppointmentFn] book_appointment error:', err);
        return { success: false, error: 'Randevu oluşturulurken hata: ' + err.message };
    }
}

// ─── 3. RANDEVU İPTALİ ───────────────────────────────────────

/**
 * cancel_appointment
 */
export async function cancelAppointment(workspaceId, params = {}) {
    try {
        console.log(`📅 [AppointmentFn] cancel_appointment:`, JSON.stringify(params));

        let appointment = null;

        if (params.appointment_id) {
            appointment = await prisma.appointment.findFirst({
                where: { id: params.appointment_id, workspaceId }
            });
        } else if (params.customer_phone) {
            const normalizedPhone = params.customer_phone.replace(/\D/g, '');
            appointment = await prisma.appointment.findFirst({
                where: {
                    workspaceId,
                    contactPhone: { contains: normalizedPhone.slice(-10) },
                    status: 'SCHEDULED',
                    startTime: { gte: new Date() }
                },
                orderBy: { startTime: 'asc' }
            });
        }

        if (!appointment) {
            return { success: false, error: 'Aktif randevu bulunamadı.' };
        }

        await prisma.appointment.update({
            where: { id: appointment.id },
            data: { status: 'CANCELLED', updatedAt: new Date() }
        });

        console.log(`🚫 [AppointmentFn] Randevu iptal edildi: ${appointment.id}`);

        try {
            const { emitToWorkspace } = await import('../socket.js');
            emitToWorkspace(workspaceId, 'appointment_updated', { appointmentId: appointment.id, status: 'CANCELLED' });
        } catch (_) {}

        return {
            success: true,
            message: `${formatDate(new Date(appointment.startTime))} ${formatTime(new Date(appointment.startTime))} tarihli randevunuz iptal edildi.`,
            appointment_id: appointment.id
        };
    } catch (err) {
        console.error('❌ [AppointmentFn] cancel_appointment error:', err);
        return { success: false, error: 'Randevu iptal edilirken hata: ' + err.message };
    }
}

// ─── 4. RANDEVULARI LİSTELE ──────────────────────────────────

/**
 * list_appointments
 * Belirli bir kişinin yaklaşan randevularını listeler
 */
export async function listAppointments(workspaceId, params = {}) {
    try {
        const where = {
            workspaceId,
            status: 'SCHEDULED',
            startTime: { gte: new Date() }
        };

        if (params.customer_phone) {
            const normalizedPhone = params.customer_phone.replace(/\D/g, '');
            where.contactPhone = { contains: normalizedPhone.slice(-10) };
        }
        if (params.provider_id) {
            where.assignedToId = params.provider_id;
        }

        const appointments = await prisma.appointment.findMany({
            where,
            orderBy: { startTime: 'asc' },
            take: 10
        });

        if (!appointments.length) {
            return { success: true, count: 0, message: 'Yaklaşan randevunuz bulunmuyor.', appointments: [] };
        }

        const list = appointments.map(a => ({
            id: a.id,
            date: formatDate(new Date(a.startTime)),
            time: `${formatTime(new Date(a.startTime))} - ${formatTime(new Date(a.endTime))}`,
            provider: a.doctorName || a.assignedToId || '-',
            customer: a.contactName,
            status: a.status
        }));

        return {
            success: true,
            count: appointments.length,
            appointments: list,
            message: `${appointments.length} yaklaşan randevunuz var:\n` +
                list.map((a, i) => `${i + 1}. ${a.date} ${a.time} — ${a.customer}`).join('\n')
        };
    } catch (err) {
        console.error('❌ [AppointmentFn] list_appointments error:', err);
        return { success: false, error: err.message };
    }
}

// ─── 5. RANDEVU HATIRLATMA TARAMA ────────────────────────────

/**
 * checkAndSendReminders
 * Her gün çalıştırılacak — yarınki randevular için WhatsApp hatırlatma gönderir
 * @param {string} [workspaceId] - Belirli bir workspace için çalıştır (opsiyonel, verilmezse tüm workspace'leri işler)
 */
export async function checkAndSendReminders(workspaceId = null) {
    try {
        // Calculate "now" and "tomorrow" in Turkey timezone (UTC+3)
        const TZ_OFFSET_MS = 3 * 60 * 60 * 1000; // Turkey is UTC+3
        const nowTR = new Date(Date.now() + TZ_OFFSET_MS);
        const tomorrowTR = new Date(nowTR);
        tomorrowTR.setUTCDate(tomorrowTR.getUTCDate() + 1);
        // Tomorrow 00:00 Turkey time = Tomorrow 00:00 UTC - 3h = Previous day 21:00 UTC
        const tomorrow = new Date(Date.UTC(tomorrowTR.getUTCFullYear(), tomorrowTR.getUTCMonth(), tomorrowTR.getUTCDate()) - TZ_OFFSET_MS);
        const tomorrowEnd = new Date(tomorrow.getTime() + 24 * 60 * 60 * 1000 - 1);

        const whereClause = {
            status: 'SCHEDULED',
            reminderSent: false,
            startTime: { gte: tomorrow, lte: tomorrowEnd }
        };

        // Workspace filtresi — belirli workspace verilmişse sadece onu işle
        if (workspaceId) {
            whereClause.workspaceId = workspaceId;
        }

        const appointments = await prisma.appointment.findMany({
            where: whereClause
        });

        console.log(`🔔 [Reminder] ${appointments.length} randevu için hatırlatma gönderilecek${workspaceId ? ` (workspace: ${workspaceId.slice(0, 8)}...)` : ' (tüm workspace\'ler)'}`);

        // Workspace başına şablon kontrolü (bir kere — tüm varsayılan şablonları oluşturur)
        const checkedWorkspaces = new Set();
        for (const appt of appointments) {
            if (appt.workspaceId && !checkedWorkspaces.has(appt.workspaceId)) {
                await ensureDefaultWhatsAppTemplates(appt.workspaceId);
                checkedWorkspaces.add(appt.workspaceId);
            }
        }

        for (const appt of appointments) {
            try {
                const reminderTime = formatTime(new Date(appt.startTime));

                // Mesaj metni (düzgün formatlı)
                const reminderLines = [
                    `Merhaba ${appt.contactName || ''},`,
                    `Yarın saat ${reminderTime}'deki randevunuzu hatırlatmak isteriz.`,
                    appt.doctorName ? `Doktor: ${appt.doctorName}` : '',
                    appt.branch ? `Bölüm: ${appt.branch}` : '',
                    '',
                    `Sorularınız için bize yazabilirsiniz. İyi günler! 🙏`
                ].filter(line => line !== false && line !== undefined);
                const reminderMsg = reminderLines.join('\n');

                // 1. Contact bilgisi bul
                let contactId = appt.contactId;
                if (!contactId && appt.conversationId) {
                    const conv = await prisma.conversation.findUnique({
                        where: { id: appt.conversationId },
                        select: { contactId: true }
                    });
                    contactId = conv?.contactId;
                }

                // 2. WhatsApp şablon gönder (tel no varsa → her zaman WA'dan da gitsin)
                if (contactId && appt.workspaceId) {
                    try {
                        // Randevu tipi: procedure varsa onu kullan, yoksa genel "randevu"
                        const procedureType = appt.procedure || appt.title || 'randevu';
                        // Doktor/Bölüm bilgisi tek satırda
                        const extraInfo = [
                            appt.doctorName ? `Doktor: ${appt.doctorName}` : '',
                            appt.branch ? `Bölüm: ${appt.branch}` : ''
                        ].filter(Boolean).join(' | ') || '';

                        const { notifyAllChannels } = await import('./crossChannelNotifier.service.js');
                        await notifyAllChannels(contactId, appt.workspaceId, 'APPOINTMENT_REMINDER', {
                            templateName: REMINDER_TEMPLATE_NAME,
                            templateParams: [
                                appt.contactName || '',
                                reminderTime,
                                procedureType,
                                extraInfo
                            ],
                        }, { channels: ['whatsapp'] });
                        console.log(`📲 [Reminder] WhatsApp şablon gönderildi: ${appt.contactName} (${appt.contactPhone || 'tel yok'})`);
                    } catch (waErr) {
                        console.warn(`⚠️ [Reminder] WhatsApp gönderilemedi: ${waErr.message}`);
                    }
                }

                // 3. Konuşmada da kayıt bırak (geçmişte görünsün)
                if (appt.conversationId) {
                    await prisma.message.create({
                        data: {
                            conversationId: appt.conversationId,
                            content: `🔔 Randevu Hatırlatması\n\n${reminderMsg}`,
                            messageType: 'TEXT',
                            isFromContact: false,
                            status: 'SENT'
                        }
                    });

                    await prisma.conversation.update({
                        where: { id: appt.conversationId },
                        data: { lastMessageAt: new Date() }
                    });

                    try {
                        const { emitToWorkspace } = await import('../socket.js');
                        emitToWorkspace(appt.workspaceId, 'new_message', { conversationId: appt.conversationId });
                    } catch (_) {}
                }

                // 4. reminderSent = true
                await prisma.appointment.update({
                    where: { id: appt.id },
                    data: { reminderSent: true }
                });

                console.log(`✅ [Reminder] Hatırlatma gönderildi: ${appt.id} → ${appt.contactName} (ws: ${appt.workspaceId?.slice(0, 8)})`);
            } catch (innerErr) {
                console.error(`❌ [Reminder] Hatırlatma hatası (${appt.id}):`, innerErr.message);
            }
        }

        return { sent: appointments.length };
    } catch (err) {
        console.error('❌ [Reminder] checkAndSendReminders error:', err);
        return { sent: 0, error: err.message };
    }
}

// ─── DISPATCHER — Fonksiyon adına göre çağır ──────────────────

/**
 * executeAppointmentFunction
 * AI bot veya Retell tarafından çağrılır
 */
export async function executeAppointmentFunction(functionName, workspaceId, params = {}) {
    switch (functionName) {
        case 'check_availability':
            return await checkAvailability(workspaceId, params);
        case 'list_services':
            return await listServices(workspaceId, params);

        case 'book_appointment':
            return await bookAppointment(workspaceId, params);
        case 'cancel_appointment':
            return await cancelAppointment(workspaceId, params);
        case 'list_appointments':
            return await listAppointments(workspaceId, params);
        default:
            return { success: false, error: `Bilinmeyen fonksiyon: ${functionName}` };
    }
}

// ─── Yardımcı ────────────────────────────────────────────────

function tryParseJSON(str) {
    if (!str) return null;
    if (typeof str === 'object') return str;
    try { return JSON.parse(str); } catch { return null; }
}

// ═══════════════════════════════════════════════════════════════
// INSTOMER NATIVE RANDEVU ARAÇLARI (sohbet botu için)
// ═══════════════════════════════════════════════════════════════
//
// Probel (Metropol Hastanesi) ile KARIŞTIRMA:
//   appointmentBot.service.js       → Probel'e özel (hasta_token, brans_kodu)
//   appointmentFunctions.service.js → BU DOSYA, Instomer'ın kendi verisi
//
// Daha önce botType === 'APPOINTMENT' olan HER bot Probel araçlarını
// alıyordu. Probel'i olmayan firmalarda o araçlar hiç çalışamıyor, model de
// boşluğu doldurmak için bilgi uyduruyordu.

/**
 * Firmanın hizmet listesi (Product tablosu).
 * "Hangi konuda randevu istiyorsunuz?" sorusunun seçeneklerini üretir.
 */
export async function listServices(workspaceId, params = {}) {
    try {
        const products = await prisma.product.findMany({
            where: { workspaceId, isActive: true, isGroup: false },
            select: {
                id: true, name: true, description: true, price: true,
                unit: true, aiContext: true,
                category: { select: { name: true } }
            },
            orderBy: { name: 'asc' },
            take: 50
        });

        if (products.length === 0) {
            return {
                success: true, services: [], count: 0,
                message: 'Tanımlı hizmet bulunamadı. Müşteriye ne için randevu istediğini serbest metin olarak sor.'
            };
        }

        const q = (params.query || '').trim().toLowerCase();
        const filtered = q
            ? products.filter(p =>
                p.name.toLowerCase().includes(q) ||
                (p.category?.name || '').toLowerCase().includes(q))
            : products;

        return {
            success: true,
            count: filtered.length,
            services: (filtered.length ? filtered : products).map(p => ({
                name: p.name,
                category: p.category?.name || null,
                // Fiyat KASITLI OLARAK yok — bkz. baseKnowledge.service.js
                description: p.description || p.aiContext || null
            })),
            message: 'Bu listedeki hizmetleri müşteriye sun. Listede OLMAYAN bir hizmet UYDURMA. Fiyat sorulursa rakam verme, yetkiliye aktar.'
        };
    } catch (err) {
        console.error('❌ [AppointmentFn] listServices error:', err.message);
        return { success: false, error: 'Hizmet listesi alınamadı.' };
    }
}

/**
 * Gemini function-calling formatında native araç tanımları.
 * `required` alanları KASITLI OLARAK geniş: model düzyazı talimatları
 * atlayabiliyor ama şema zorunluluklarına çok daha güvenilir uyuyor.
 */
export function getNativeAppointmentToolDeclarations() {
    return [
        {
            name: 'list_services',
            description: 'Firmanın randevu verilebilecek hizmet/ürün listesini getirir. Müşteri randevu istediğinde İLK BU ÇAĞRILIR; hangi hizmet olduğu netleşmeden randevu oluşturulmaz.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Müşterinin bahsettiği hizmet adı (opsiyonel filtre)' }
                },
                required: []
            }
        },
        {
            name: 'check_availability',
            description: 'Belirtilen tarih aralığında uygun randevu saatlerini getirir.',
            parameters: {
                type: 'object',
                properties: {
                    date: { type: 'string', description: 'Başlangıç tarihi (YYYY-MM-DD)' },
                    date_range: { type: 'number', description: 'Kaç günlük aralığa bakılacak (varsayılan 3)' },
                    person_id: { type: 'string', description: 'Belirli bir kişi/kaynak için (opsiyonel)' }
                },
                required: ['date']
            }
        },
        {
            name: 'book_appointment',
            description: 'Randevuyu kaydeder. SADECE şu dördü de netleştikten sonra çağrılır: hizmet, ad soyad, telefon, tarih+saat. Eksik olan varsa ÖNCE onu sor, bu fonksiyonu çağırma.',
            parameters: {
                type: 'object',
                properties: {
                    service: { type: 'string', description: 'Randevu konusu — list_services listesinden seçilen hizmet adı' },
                    customer_name: { type: 'string', description: 'Müşterinin ad soyadı' },
                    customer_phone: { type: 'string', description: 'Müşterinin telefon numarası' },
                    date: { type: 'string', description: 'Randevu tarihi (YYYY-MM-DD)' },
                    start_time: { type: 'string', description: 'Randevu saati (HH:MM)' },
                    duration: { type: 'number', description: 'Süre (dakika, varsayılan 30)' },
                    notes: { type: 'string', description: 'Ek not (opsiyonel)' }
                },
                required: ['service', 'customer_name', 'customer_phone', 'date', 'start_time']
            }
        },
        {
            name: 'list_appointments',
            description: 'Müşterinin mevcut randevularını listeler.',
            parameters: {
                type: 'object',
                properties: {
                    customer_phone: { type: 'string', description: 'Müşteri telefonu' }
                },
                required: []
            }
        },
        {
            name: 'cancel_appointment',
            description: 'Mevcut bir randevuyu iptal eder.',
            parameters: {
                type: 'object',
                properties: {
                    appointment_id: { type: 'string', description: 'İptal edilecek randevunun kimliği' },
                    customer_phone: { type: 'string', description: 'Doğrulama için müşteri telefonu' }
                },
                required: ['appointment_id']
            }
        }
    ];
}
