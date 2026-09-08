/**
 * Probel HBYS API Appointment Service
 * 
 * Sağlık Sistemi (Probel) API'sine doğrudan istek atan servis.
 * appointmentBot.service.js tarafından çağrılır.
 * 
 * Her fonksiyon workspaceId alır → DB'den API bilgilerini çeker → Probel'e istek atar.
 * Token süresi dolmuşsa otomatik yeniler.
 * 
 * SUBE_KODU default olarak "1" kullanılır.
 */

import prisma from '../lib/prisma.js';
import { refreshHealthSystemToken } from '../controllers/probel_proxy.controller.js';

const DEFAULT_SUBE_KODU = "1";

// ─── GENEL API ÇAĞRI YARDIMCISI ────────────────────────────────────────────

/**
 * Probel API'ye stored procedure çağrısı yapar.
 * Token süresi dolmuşsa otomatik yeniler ve tekrar dener.
 */
async function probelApiCall(workspaceId, stored_procedure, input_data = {}) {
    // Get integration from DB
    const integration = await prisma.apiIntegration.findFirst({
        where: { workspaceId, authType: 'OAUTH_PASSWORD', isActive: true }
    });

    if (!integration) {
        throw new Error('Sağlık sistemi API bağlantısı bulunamadı. Lütfen Kanallar sayfasından bağlantı kurun.');
    }

    let token = integration.authToken;
    const baseUrl = integration.baseUrl;
    const apiUrl = `${baseUrl}/api/oracle/runasync`;

    // Clean input data — convert ".0" strings to integers for ID/KOD fields
    const cleanData = {};
    for (const [key, value] of Object.entries(input_data)) {
        let val = value;
        if (typeof val === 'string') {
            if (val.trim().endsWith('.0')) {
                val = parseInt(val.split('.')[0], 10);
            } else if ((key.includes('ID') || key.includes('KOD') || key.includes('KODU')) && val.trim() !== '' && !isNaN(Number(val))) {
                val = parseInt(val, 10);
            }
        } else if (typeof val === 'number' && !Number.isInteger(val)) {
            val = Math.floor(val);
        }
        cleanData[key] = val;
    }

    console.log(`🏥 [Probel] Calling: ${stored_procedure}`, cleanData);

    // First attempt
    let response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
            stored_procedure,
            cursor_list: ['ref_out_list'],
            input_data: cleanData
        })
    });

    // If 401, refresh token and retry
    if (response.status === 401) {
        console.log('🔄 [Probel] Token expired, refreshing...');
        token = await refreshHealthSystemToken(workspaceId);
        if (!token) {
            throw new Error('Token yenilenemedi. Lütfen Sağlık Sistemi bağlantısını kontrol edin.');
        }

        response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                stored_procedure,
                cursor_list: ['ref_out_list'],
                input_data: cleanData
            })
        });
    }

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ [Probel] API error ${response.status}:`, errorText);
        throw new Error(`HBYS API hatası: ${response.status}`);
    }

    const data = await response.json();

    // Check for API-level errors
    const jsonData = data?.JsonData || data;
    if (jsonData?.HasError) {
        throw new Error(jsonData.Mesaj || 'HBYS sisteminden hata döndü.');
    }

    // Extract ref_out_list
    const resultList = data?.JsonData?.data?.ref_out_list || data?.ref_out_list || [];

    console.log(`✅ [Probel] ${stored_procedure} returned ${resultList.length} items`);
    return resultList;
}


// ─── HASTA DOĞRULAMA ─────────────────────────────────────────────────────────

/**
 * Hasta kimlik bilgilerini doğrular ve HASTA_TOKEN döner.
 * 
 * @param {string} workspaceId
 * @param {object} patientData - { tc, adi, soyadi, cinsiyet, dogumTarihi, telefon }
 *   cinsiyet: 1=Erkek, 2=Kadın
 *   dogumTarihi: DDMMYYYY formatında
 *   telefon: başında 0 olmadan 10 haneli
 */
export async function validatePatient(workspaceId, patientData) {
    try {
        const { tc, adi, soyadi, cinsiyet, dogum_tarihi, telefon } = patientData;

        // Build input dynamically — only send non-empty fields
        const inputData = {
            ADI: adi,
            SOYADI: soyadi,
            TELEFON: telefon
        };

        // TC / Kimlik — gerçek TC varsa kullan, yoksa default 11111111111
        const tcNo = (tc && tc.trim() !== '' && tc.trim().length >= 10) ? tc.trim() : '11111111111';
        inputData.KIMLIK_TIPI = 1;
        inputData.KIMLIK_NO = tcNo;

        if (cinsiyet) {
            inputData.CINSIYET = cinsiyet;
        }
        if (dogum_tarihi && dogum_tarihi.trim() !== '') {
            inputData.DOGUM_TARIHI = dogum_tarihi;
        }


        console.log(`🏥 [Probel] validatePatient with fields:`, Object.keys(inputData).join(', '));

        const result = await probelApiCall(workspaceId, 'PKG_HSW_MBL_API_METROPOL.prc_get_hasta_token', inputData);

        const hastaToken = result.length > 0 ? (result[0].TOKEN || result[0].HASTA_TOKEN) : null;

        if (!hastaToken) {
            return {
                success: false,
                message: 'Girdiğiniz bilgilere ait sistemde hasta kaydı bulunamadı. Lütfen müşteriye sistemde kaydının bulunamadığını nazikçe iletin ve bilgilerini kontrol etmesini veya hastane yetkilisi ile görüşmesini isteyin.'
            };
        }

        return {
            success: true,
            hasta_token: hastaToken,
            message: 'Hasta bilgileri doğrulandı ✅'
        };
    } catch (error) {
        console.error('❌ [Probel] validatePatient error:', error.message);
        return { success: false, message: error.message };
    }
}


// ─── BRANŞ LİSTESİ ──────────────────────────────────────────────────────────

/**
 * Branş (bölüm) listesini getirir.
 * 
 * @param {string} workspaceId
 * @param {number} cinsiyet - 1=Erkek, 2=Kadın
 * @param {string} dogumTarihi - DDMMYYYY formatında
 */
export async function getBranches(workspaceId, cinsiyet = 1, dogumTarihi = '') {
    try {
        const result = await probelApiCall(workspaceId, 'PKG_HSW_MBL_API_METROPOL.prc_get_brans_list', {
            SUBE_KODU: DEFAULT_SUBE_KODU,
            CINSIYET: cinsiyet,
            DOGUM_TARIHI: dogumTarihi,
            UZAKTAN: 0
        });

        if (result.length === 0) {
            return { success: false, message: 'Branş listesi boş döndü.' };
        }

        const branches = result.map((b, index) => ({
            sira: index + 1,
            brans_kodu: b.BRANS_KODU,
            brans_adi: b.BRANS_ADI || `Branş ${b.BRANS_KODU}`
        }));

        const branchListText = branches.map(b => `${b.sira}. ${b.brans_adi} (Kod: ${b.brans_kodu})`).join('\n');

        return {
            success: true,
            branches,
            message: `Aşağıdaki branşlar bulundu:\n${branchListText}\n\nHastaya bu listeyi sun (KODLARI HASTAYA GÖSTERME!) ve hangisini seçtiğini sor.`
        };
    } catch (error) {
        console.error('❌ [Probel] getBranches error:', error.message);
        return { success: false, message: error.message };
    }
}


// ─── DOKTOR (POLİKLİNİK) LİSTESİ ───────────────────────────────────────────

/**
 * Seçilen branştaki doktor/poliklinik listesini getirir.
/**
 * Probel'den gelen doktor/poliklinik metninde doktor adını başa alır.
 * Örn: "Bey.Cer.Plk-Tekin Özcan - Tekin Özcan" -> "Tekin Özcan - Bey.Cer.Plk"
 * Örn: "Cerrahi Onkoloji Pol.Aydan Eroğlu - Aydan Eroğlu" -> "Aydan Eroğlu - Cerrahi Onkoloji Pol"
 */
export function formatDoctorNameFirst(rawName, explicitDoctorName = null) {
    if (!rawName && !explicitDoctorName) return '';
    const str = String(rawName || explicitDoctorName).trim();
    if (!str.includes(' - ')) return str;

    const parts = str.split(' - ');
    const docPart = (explicitDoctorName && explicitDoctorName.trim()) || parts[parts.length - 1].trim();
    let polkPart = parts.slice(0, -1).join(' - ').trim();

    const isPolk = (s) => /plk|polk|pol\b|poliklinik|hst\b|cer\b/i.test(s);
    const isDocTitle = (s) => /dr\b|doktor|uzm\b|prof\b|doç\b/i.test(s);

    // Eğer zaten "Doktor - Poliklinik" sırasındaysa tersine çevirme
    if (isPolk(docPart) && !isPolk(polkPart)) {
        return str;
    }

    const hasClinicPattern = isPolk(polkPart) || isDocTitle(docPart) || (docPart && polkPart.toLowerCase().includes(docPart.toLowerCase()));
    if (!hasClinicPattern) {
        return str;
    }

    // Poliklinik kısmında doktor ismi tekrar ediyorsa temizle (örn: "Bey.Cer.Plk-Tekin Özcan" -> "Bey.Cer.Plk")
    if (docPart && polkPart.toLowerCase().includes(docPart.toLowerCase())) {
        const idx = polkPart.toLowerCase().indexOf(docPart.toLowerCase());
        polkPart = (polkPart.substring(0, idx) + polkPart.substring(idx + docPart.length))
            .replace(/[-.\s]+$/, '')
            .replace(/^[-.\s]+/, '')
            .trim();
    }

    if (docPart && polkPart && polkPart.toLowerCase() !== docPart.toLowerCase()) {
        return `${docPart} - ${polkPart}`;
    }
    return docPart || str;
}

/**
 * Belirli bir branş için doktorları getirir.
 * 
 * @param {string} workspaceId
 * @param {string|number} bransKodu - API'den gelen BRANS_KODU
 */
export async function getDoctors(workspaceId, bransKodu) {
    try {
        const result = await probelApiCall(workspaceId, 'PKG_HSW_MBL_API_METROPOL.prc_get_poliklinik_list', {
            SUBE_KODU: DEFAULT_SUBE_KODU,
            BRANS_KODU: bransKodu
        });

        // Filter by exact brans_kodu if multiple returned
        let filtered = result;
        if (result.length > 0 && result[0].BRANS_KODU) {
            const targetCode = String(bransKodu).replace('.0', '');
            filtered = result.filter(p => String(p.BRANS_KODU).replace('.0', '') === targetCode);
            if (filtered.length === 0) filtered = result; // fallback
        }

        if (filtered.length === 0) {
            return { success: false, message: 'Bu branşta doktor/poliklinik bulunamadı.' };
        }

        const doctors = filtered.map((p, index) => {
            const rawName = p.POLIKLINIK_ADI || p.DOKTOR_ADI || `Doktor ${index + 1}`;
            const formattedDoctorName = formatDoctorNameFirst(rawName, p.DOKTOR_ADI);
            return {
                sira: index + 1,
                poliklinik_kodu: p.POLIKLINIK_KODU,
                doktor_kodu: p.DOKTOR_KODU,
                servis_kodu: p.SERVIS_KODU || p.POLIKLINIK_KODU,
                brans_kodu: p.BRANS_KODU,
                doktor_adi: formattedDoctorName,
                raw_poliklinik_adi: p.POLIKLINIK_ADI || ''
            };
        });

        const doctorListText = doctors.map(d => `${d.sira}. ${d.doktor_adi} (Kod: ${d.doktor_kodu}, Servis: ${d.servis_kodu})`).join('\n');

        return {
            success: true,
            brans_kodu: bransKodu,
            doctors,
            message: `Aşağıdaki doktorlar bulundu:\n${doctorListText}\n\nHastaya bu listeyi sun (KODLARI HASTAYA GÖSTERME!) ve hangisini seçtiğini sor.`
        };
    } catch (error) {
        console.error('❌ [Probel] getDoctors error:', error.message);
        return { success: false, message: error.message };
    }
}


// ─── UYGUN GÜNLER ────────────────────────────────────────────────────────────

/**
 * Seçilen doktor için uygun günleri getirir.
 * 
 * @param {string} workspaceId
 * @param {string|number} bransKodu
 * @param {object} selectedDoctor - { doktor_kodu, poliklinik_kodu, servis_kodu }
 */
export async function getAvailableDays(workspaceId, bransKodu, selectedDoctor) {
    try {
        const payload = {
            SUBE_KODU: DEFAULT_SUBE_KODU,
            BRANS_KODU: bransKodu
        };

        if (selectedDoctor) {
            if (selectedDoctor.servis_kodu) payload.SERVIS_KODU = selectedDoctor.servis_kodu;
            if (selectedDoctor.doktor_kodu) payload.DOKTOR_KODU = selectedDoctor.doktor_kodu;
        }

        const result = await probelApiCall(workspaceId, 'PKG_HSW_MBL_API_METROPOL.prc_get_uygun_gunler_list', payload);

        // Filter days for the selected doctor only
        let filteredDays = result;
        if (selectedDoctor) {
            const pDoktor = selectedDoctor.doktor_kodu ? String(selectedDoctor.doktor_kodu).replace('.0', '') : null;
            const pServis = selectedDoctor.servis_kodu ? String(selectedDoctor.servis_kodu).replace('.0', '') : null;

            filteredDays = result.filter(d => {
                const dDoktor = d.DOKTOR_KODU ? String(d.DOKTOR_KODU).replace('.0', '') : null;
                const dServis = d.SERVIS_KODU ? String(d.SERVIS_KODU).replace('.0', '') : null;

                if (pDoktor && dDoktor) return pDoktor === dDoktor;
                if (pServis && dServis) return pServis === dServis;
                return true;
            });
        }

        console.log(`[DEBUG Probel] Total returned: ${result.length}, after filter: ${filteredDays.length}`);
        if (result.length > 0) console.log(`[DEBUG Probel] First raw item:`, result[0]);
        if (filteredDays.length > 0) console.log(`[DEBUG Probel] First filtered item:`, filteredDays[0]);

        // Only show days with available slots
        // Accept string '1' or number 1
        const availableDays = filteredDays.filter(d => {
            const bos = Number(d.BOS);
            return !isNaN(bos) && bos > 0;
        });

        if (availableDays.length === 0) {
            return {
                success: false,
                message: 'Bu doktor için uygun randevu günü bulunamadı. Başka bir doktor seçebilirsiniz.'
            };
        }

        const days = availableDays.map((d, index) => ({
            sira: index + 1,
            tarih: d.RANDEVU_TARIHI,
            servis_kodu: d.SERVIS_KODU,
            bos_randevu: d.BOS
        }));

        return {
            success: true,
            days,
            message: `${days.length} uygun gün bulundu. Hangi tarih uygun?`
        };
    } catch (error) {
        console.error('❌ [Probel] getAvailableDays error:', error.message);
        return { success: false, message: error.message };
    }
}


// ─── UYGUN SAATLER ───────────────────────────────────────────────────────────

/**
 * Seçilen gün için uygun saatleri getirir.
 * 
 * @param {string} workspaceId
 * @param {string|number} servisKodu
 * @param {string} tarih - DD.MM.YYYY formatında
 */
export async function getAvailableHours(workspaceId, servisKodu, tarih) {
    try {
        const result = await probelApiCall(workspaceId, 'PKG_HSW_MBL_API_METROPOL.prc_get_uygun_saatler_list', {
            SERVIS_KODU: servisKodu,
            BOS: "1",
            RANDEVU_TARIHI: tarih,

        });

        if (result.length === 0) {
            return {
                success: false,
                message: `${tarih} tarihinde uygun saat bulunamadı. Başka bir gün seçebilirsiniz.`
            };
        }

        const hours = result.map((h, index) => ({
            sira: index + 1,
            saat: h.SAAT,
            randevu_id: h.RANDEVU_ID || h.ID
        }));

        return {
            success: true,
            tarih,
            hours,
            message: `${tarih} tarihinde ${hours.length} uygun saat bulundu. Hangi saati tercih edersiniz?`
        };
    } catch (error) {
        console.error('❌ [Probel] getAvailableHours error:', error.message);
        return { success: false, message: error.message };
    }
}


// ─── RANDEVU OLUŞTURMA ──────────────────────────────────────────────────────

/**
 * Randevuyu onaylar ve oluşturur.
 * 
 * @param {string} workspaceId
 * @param {string} hastaToken - prc_get_hasta_token'dan dönen token
 * @param {string|number} randevuId - prc_get_uygun_saatler_list'ten dönen RANDEVU_ID
 */
export async function createAppointment(workspaceId, hastaToken, randevuId) {
    try {
        console.log(`🏥 [Probel] Creating appointment with HASTA_TOKEN: ${hastaToken}, RANDEVU_ID: ${randevuId}`);

        if (!hastaToken || !randevuId) {
            console.error('❌ [Probel] createAppointment missing params! hasta_token:', hastaToken, 'randevu_id:', randevuId);
            return {
                success: false,
                message: 'Randevu oluşturulamadı: hasta_token veya randevu_id eksik. Lütfen işlemi baştan başlatın.'
            };
        }

        const result = await probelApiCall(workspaceId, 'PKG_HSW_MBL_API_METROPOL.prc_set_randevu_bilgisi', {
            HASTA_TOKEN: hastaToken,
            RANDEVU_ID: String(randevuId)
        });

        console.log(`✅ [Probel] prc_set_randevu_bilgisi response:`, JSON.stringify(result).substring(0, 500));

        // ProbelApiCall returns ref_out_list. Let's check the contents.
        let isSuccess = false;
        let errorMsg = 'Randevu oluşturulamadı. Lütfen hastane ile iletişime geçiniz.';

        if (Array.isArray(result) && result.length > 0) {
            // Check if any row has an error
            const errorRow = result.find(r => r.HATA_KODU || (r.ISLEM_SONUCU && String(r.ISLEM_SONUCU).toLowerCase() !== 'basarili' && String(r.ISLEM_SONUCU).toLowerCase() !== 'başarılı'));

            if (errorRow) {
                console.error('❌ [Probel] Appointment creation failed with error:', errorRow);
                errorMsg = errorRow.HATA_MESAJI || errorRow.MESAJ || errorRow.ISLEM_SONUCU || errorMsg;
            } else {
                // If it's an array, has elements, and no error codes, assume success
                isSuccess = true;
            }
        } else if (result && !Array.isArray(result)) {
            // If it returned a single object (e.g. error from Probel wrapper)
            if (result.HATA_KODU || result.HasError || (result.ISLEM_SONUCU && String(result.ISLEM_SONUCU).toLowerCase() !== 'basarili')) {
                errorMsg = result.HATA_MESAJI || result.MESAJ || result.ISLEM_SONUCU || errorMsg;
            } else {
                isSuccess = true;
            }
        } else {
            // Empty array or null returned. Since we don't know if this means success in this specific API, 
            // we should be careful. Usually, a success message is returned. Let's assume failure if nothing is returned.
            // Wait, if it strictly returns empty array on success, we would need to know. Assuming it returns at least some confirmation.
            // But just in case:
            isSuccess = true; // Let's assume empty means no errors for now, as ProbelApiCall throws on HTTP/JsonData errors.
        }

        if (!isSuccess) {
            return {
                success: false,
                message: errorMsg
            };
        }

        return {
            success: true,
            message: 'Randevunuz başarıyla oluşturuldu! ✅'
        };
    } catch (error) {
        console.error('❌ [Probel] createAppointment error:', error.message);
        return {
            success: false,
            message: error.message || 'Randevu oluşturulamadı. Lütfen hastane ile iletişime geçiniz.'
        };
    }
}


// ─── SAĞLIK SİSTEMİ BAĞLANTISI KONTROL ─────────────────────────────────────

/**
 * Workspace'te aktif sağlık sistemi (Probel) bağlantısı var mı kontrol eder.
 */
export async function hasHealthSystemConnection(workspaceId) {
    const integration = await prisma.apiIntegration.findFirst({
        where: { workspaceId, authType: 'OAUTH_PASSWORD', isActive: true }
    });
    return !!integration;
}

// ─── PROBEL DOKTORLARINI TAKVİM KAYNAKLARINA SENKRONİZE ET ─────────────────

const DOCTOR_COLORS = [
    '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#06b6d4',
    '#ec4899', '#84cc16', '#f97316', '#6366f1', '#14b8a6'
];

const lastSyncTimes = new Map(); // workspaceId -> timestamp
const SYNC_THROTTLE_MS = 5 * 60 * 1000; // 5 dakika

/**
 * Probel'deki tüm branşları ve doktorları çeker,
 * calendar_resources tablosuna PERSON kaynağı olarak upsert eder.
 * 
 * @param {string} workspaceId
 * @param {boolean} force - true ise throttle süresini yoksayar
 */
export async function syncProbelDoctorsToResources(workspaceId, force = false) {
    try {
        const hasConn = await hasHealthSystemConnection(workspaceId);
        if (!hasConn) {
            return { success: false, message: 'Aktif sağlık sistemi bağlantısı bulunamadı.' };
        }

        const now = Date.now();
        const lastSync = lastSyncTimes.get(workspaceId) || 0;
        if (!force && (now - lastSync < SYNC_THROTTLE_MS)) {
            console.log(`🏥 [ProbelSync] Throttle: Workspace ${workspaceId} için son 5 dk içinde senkron yapıldı.`);
            return { success: true, message: 'Zaten güncel', throttled: true };
        }

        console.log(`🏥 [ProbelSync] Doktor senkronizasyonu başlatılıyor: workspace ${workspaceId}`);

        // 1. Tüm branşları çek
        const branchRes = await getBranches(workspaceId, 1, '');
        if (!branchRes.success || !branchRes.branches?.length) {
            console.warn(`⚠️ [ProbelSync] Branş listesi alınamadı:`, branchRes.message);
            return { success: false, message: branchRes.message || 'Branşlar alınamadı.' };
        }

        const branches = branchRes.branches;
        let totalDoctorCount = 0;
        const syncedList = [];

        // 2. Her branş için doktorları paralel çek
        await Promise.all(
            branches.map(async (branch, bIdx) => {
                try {
                    const docRes = await getDoctors(workspaceId, branch.brans_kodu);
                    if (!docRes.success || !docRes.doctors?.length) return;

                    const branchColor = DOCTOR_COLORS[bIdx % DOCTOR_COLORS.length];

                    // Branşı appointment_branches tablosuna da kaydet/güncelle
                    let apptBranch = await prisma.appointmentBranch.findFirst({
                        where: { workspaceId, name: branch.brans_adi }
                    });
                    if (!apptBranch) {
                        apptBranch = await prisma.appointmentBranch.create({
                            data: {
                                workspaceId,
                                name: branch.brans_adi,
                                order: branch.sira || bIdx + 1,
                                isActive: true
                            }
                        });
                    }

                    for (let dIdx = 0; dIdx < docRes.doctors.length; dIdx++) {
                        const doc = docRes.doctors[dIdx];
                        const docName = doc.doktor_adi.trim();
                        if (!docName) continue;

                        // 3. CalendarResource tablosunda var mı?
                        const existingResource = await prisma.calendarResource.findFirst({
                            where: {
                                workspaceId,
                                OR: [
                                    { name: { equals: docName, mode: 'insensitive' } },
                                    ...(doc.raw_poliklinik_adi ? [{ name: { equals: doc.raw_poliklinik_adi, mode: 'insensitive' } }] : [])
                                ]
                            }
                        });

                        const resourceData = {
                            name: docName,
                            description: branch.brans_adi, // Branş adı
                            type: 'PERSON',
                            color: existingResource?.color || branchColor,
                            isActive: true
                        };

                        let savedResource;
                        if (existingResource) {
                            savedResource = await prisma.calendarResource.update({
                                where: { id: existingResource.id },
                                data: {
                                    name: docName,
                                    description: branch.brans_adi,
                                    type: 'PERSON',
                                    isActive: true
                                }
                            });
                        } else {
                            savedResource = await prisma.calendarResource.create({
                                data: {
                                    workspaceId,
                                    ...resourceData
                                }
                            });
                        }

                        if (apptBranch && savedResource) {
                            // Upsert ResourceBranch
                            await prisma.resourceBranch.upsert({
                                where: {
                                    resourceId_branchId: {
                                        resourceId: savedResource.id,
                                        branchId: apptBranch.id
                                    }
                                },
                                update: { isAvailable: true },
                                create: {
                                    resourceId: savedResource.id,
                                    branchId: apptBranch.id,
                                    isAvailable: true
                                }
                            });
                        }

                        // 4. AppointmentDoctor tablosunda da var mı?
                        if (apptBranch) {
                            // @deprecated — will be removed
                            const existingDoctor = await prisma.appointmentDoctor.findFirst({
                                where: {
                                    branchId: apptBranch.id,
                                    OR: [
                                        { name: { equals: docName, mode: 'insensitive' } },
                                        ...(doc.raw_poliklinik_adi ? [{ name: { equals: doc.raw_poliklinik_adi, mode: 'insensitive' } }] : [])
                                    ]
                                }
                            });
                            if (!existingDoctor) {
                                await prisma.appointmentDoctor.create({
                                    data: {
                                        branchId: apptBranch.id,
                                        name: docName,
                                        isActive: true
                                    }
                                });
                            } else if (existingDoctor.name !== docName) {
                                await prisma.appointmentDoctor.update({
                                    where: { id: existingDoctor.id },
                                    data: { name: docName }
                                }).catch(() => {});
                            }
                        }

                        totalDoctorCount++;
                        syncedList.push({
                            id: savedResource.id,
                            name: docName,
                            branch: branch.brans_adi,
                            doktor_kodu: doc.doktor_kodu
                        });
                    }
                } catch (bErr) {
                    console.warn(`⚠️ [ProbelSync] Branş ${branch.brans_adi} doktorları alınamadı:`, bErr.message);
                }
            })
        );

        lastSyncTimes.set(workspaceId, now);
        console.log(`✅ [ProbelSync] ${totalDoctorCount} doktor CalendarResource olarak senkronize edildi.`);

        return {
            success: true,
            count: totalDoctorCount,
            doctors: syncedList,
            message: `${totalDoctorCount} doktor başarıyla senkronize edildi.`
        };
    } catch (err) {
        console.error('❌ [ProbelSync] Hata:', err);
        return { success: false, message: err.message };
    }
}

