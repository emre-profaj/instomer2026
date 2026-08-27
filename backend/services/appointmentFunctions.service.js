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

function setTime(date, timeStr) {
    const t = parseTime(timeStr);
    if (!t) return date;
    const d = new Date(date);
    d.setHours(t.hours, t.minutes, 0, 0);
    return d;
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
            // ISO format
            startTime = new Date(params.start_time);
        } else if (params.date && params.start_time) {
            // date + HH:MM
            startTime = setTime(new Date(params.date), params.start_time);
        } else if (params.date) {
            // Sadece tarih — varsayılan 09:00
            startTime = setTime(new Date(params.date), '09:00');
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

        // ── Randevu oluştur ──
        const appointment = await prisma.appointment.create({
            data: {
                workspaceId,
                title: params.title || `${params.customer_name} - Randevu`,
                description: params.notes || null,
                startTime,
                endTime,
                assignedToId,
                contactId,
                contactName: params.customer_name,
                contactPhone: normalizedPhone,
                contactEmail: params.customer_email || null,
                status: 'SCHEDULED',
                notes: params.notes || null,
                createdById,
                createdByBotId: params.bot_id || null,
                conversationId: params.conversation_id || null,
                branch: params.branch || null,
                procedure: params.procedure || null,
                doctorName
            }
        });

        console.log(`✅ [AppointmentFn] Randevu oluşturuldu: ${appointment.id} | ${providerName} | ${formatDate(startTime)} ${formatTime(startTime)}`);

        // ── Socket ile bildir ──
        try {
            const { emitToWorkspace } = await import('../socket.js');
            emitToWorkspace(workspaceId, 'appointment_created', {
                appointment,
                provider: providerName
            });
        } catch (_) {}

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

        for (const appt of appointments) {
            try {
                // WhatsApp mesajı gönder (conversation üzerinden)
                if (appt.conversationId) {
                    await prisma.message.create({
                        data: {
                            conversationId: appt.conversationId,
                            content: `🔔 Randevu Hatırlatması\n\n` +
                                `Merhaba ${appt.contactName || ''},\n` +
                                `Yarın ${formatTime(new Date(appt.startTime))} saatindeki randevunuzu hatırlatmak isteriz.\n` +
                                `${appt.doctorName ? `Doktor: ${appt.doctorName}\n` : ''}` +
                                `${appt.branch ? `Bölüm: ${appt.branch}\n` : ''}` +
                                `\nSorularınız için bize yazabilirsiniz. İyi günler! 🙏`,
                            messageType: 'TEXT',
                            isFromContact: false,
                            status: 'SENT'
                        }
                    });

                    // Conversation'ı güncelle
                    await prisma.conversation.update({
                        where: { id: appt.conversationId },
                        data: { lastMessageAt: new Date() }
                    });

                    try {
                        const { emitToWorkspace } = await import('../socket.js');
                        emitToWorkspace(appt.workspaceId, 'new_message', { conversationId: appt.conversationId });
                    } catch (_) {}
                }

                // reminderSent = true
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
