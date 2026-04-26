/**
 * Randevu Asistanı — Appointment Bot Service
 * 
 * Gemini Function Calling ile çalışan randevu akışı.
 * 
 * İKİ MOD:
 * A) Sağlık Sistemi API bağlı → Probel HBYS üzerinden gerçek randevu (probel_appointment.service.js)
 * B) Bağlı değil → Yerel DB üzerinden randevu (AppointmentBranch/Doctor tabloları)
 * 
 * AKIŞ (Sağlık Sistemi modu):
 * 1. validate_patient → Hasta TC, ad, soyad, cinsiyet, doğum tarihi, telefon doğrulama
 * 2. get_branches → Branş/bölüm listesi (API'den canlı)
 * 3. get_doctors → Seçilen branştaki doktorlar (API'den canlı)
 * 4. get_available_days → Seçilen doktorun müsait günleri
 * 5. get_available_hours → Seçilen günün müsait saatleri
 * 6. create_appointment → Randevu oluşturma (HASTA_TOKEN + RANDEVU_ID)
 * 7. handoff_to_human → Sorun olursa gerçek insana aktarma
 */

import prisma from '../lib/prisma.js';

// ─── TURKISH DATE PARSER ────────────────────────────────────────────────────
/**
 * Her türlü Türkçe tarih formatını DDMMYYYY'ye dönüştürür.
 * Desteklenen formatlar:
 *   "06.05.1984", "6.5.1984", "06/05/1984", "06-05-1984"
 *   "6 mayıs 1984", "6 Mayıs 1984", "mayıs 6, 1984"
 *   "1984-05-06" (ISO), "06051984" (zaten düz)
 *   "6 may 1984", "6 ağu 1984" (kısaltmalar)
 */
function parseTurkishDate(raw) {
    if (!raw || raw.trim() === '') return '';
    
    let input = raw.trim().toLowerCase();
    
    // Zaten DDMMYYYY formatındaysa (8 haneli sayı)
    if (/^\d{8}$/.test(input)) {
        return input;
    }
    
    // Türkçe ay isimleri → ay numarası
    const turkishMonths = {
        'ocak': '01', 'oca': '01',
        'şubat': '02', 'şub': '02',
        'mart': '03', 'mar': '03',
        'nisan': '04', 'nis': '04',
        'mayıs': '05', 'may': '05',
        'haziran': '06', 'haz': '06',
        'temmuz': '07', 'tem': '07',
        'ağustos': '08', 'ağu': '08',
        'eylül': '09', 'eyl': '09',
        'ekim': '10', 'eki': '10',
        'kasım': '11', 'kas': '11',
        'aralık': '12', 'ara': '12'
    };
    
    // Türkçe ay ismi içeriyor mu kontrol et
    for (const [monthName, monthNum] of Object.entries(turkishMonths)) {
        if (input.includes(monthName)) {
            // "6 mayıs 1984" veya "mayıs 6, 1984" veya "6 mayıs, 1984"
            const numbers = input.match(/\d+/g);
            if (numbers && numbers.length >= 2) {
                let day, year;
                if (numbers[0].length === 4) {
                    // "1984 mayıs 6" formatı
                    year = numbers[0];
                    day = numbers[1];
                } else {
                    day = numbers[0];
                    year = numbers.find(n => n.length === 4) || numbers[numbers.length - 1];
                }
                return String(day).padStart(2, '0') + monthNum + year;
            }
        }
    }
    
    // Ayırıcılı formatlar: "06.05.1984", "06/05/1984", "06-05-1984"
    const separatorMatch = input.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
    if (separatorMatch) {
        const day = separatorMatch[1].padStart(2, '0');
        const month = separatorMatch[2].padStart(2, '0');
        const year = separatorMatch[3];
        return day + month + year;
    }
    
    // ISO format: "1984-05-06"
    const isoMatch = input.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$/);
    if (isoMatch) {
        const year = isoMatch[1];
        const month = isoMatch[2].padStart(2, '0');
        const day = isoMatch[3].padStart(2, '0');
        return day + month + year;
    }
    
    // Son çare: noktaları ve ayırıcıları sil
    const cleaned = input.replace(/[.\-/\s]/g, '');
    if (/^\d{8}$/.test(cleaned)) {
        return cleaned;
    }
    
    // Hiçbir format eşleşmediyse olduğu gibi döndür (AI'ın verdiğini Probel'e gönder)
    console.warn(`⚠️ [AppointmentBot] Could not parse date: "${raw}", sending as-is`);
    return raw.replace(/[.\-/\s]/g, '');
}

// ─── DEFAULT APPOINTMENT PROMPT ─────────────────────────────────────────────

export const DEFAULT_APPOINTMENT_PROMPT = `Sen nazik ve profesyonel bir hastane randevu asistanısın. Görevin müşterilerden bilgileri tek tek toplayarak randevu oluşturmaktır.

📋 RANDEVU AKIŞI (ÇOK ÖNEMLİ KURALLAR):
Aşağıdaki 5 temel bilgiyi HASTA İÇİN eksiksiz olarak toplamalısın:
- TC Kimlik Numarası (11 haneli)
- Telefon Numarası
- Ad Soyad (HASTANIN adı — sohbet eden kişi ile aynı olmayabilir!)
- Cinsiyet (Erkek/Kadın)
- Doğum Tarihi (GG.AA.YYYY formatında)

ÖNEMLİ KURALLAR:
1. ÖNCELİKLE "Randevu kendiniz için mi yoksa başka biri için mi?" diye sor. Eğer kendisi içinse ve sistemde ad/telefon bilgisi varsa onları kullan. Eğer başkası içinse, hastanın ad soyad ve telefon bilgisini ayrıca sor.
2. Eksik bilgileri TEKER TEKER sor. Aynı anda birden fazla soru sorma.
3. Cinsiyet bilgisi: Eğer HASTANIN isminden veya hitap şeklinden (Bey/Hanım) cinsiyeti zaten anlaşılıyorsa CİNSİYETİ SORMA! Kendin "Erkek" veya "Kadın" olarak belirle.
4. Bu 5 bilginin TAMAMI (TC, Telefon, Ad Soyad, Cinsiyet, Doğum Tarihi) tamamlandığında, HİÇBİR ŞEY YAZMADAN doğrudan 'validate_patient' fonksiyonunu ÇAĞIR. "Lütfen bekleyin", "İşleminizi tamamlıyorum" gibi metinler YAZMA! Sadece fonksiyonu çağır!

7. 'validate_patient' işleminden BAŞARILI yanıt geldiğinde, yanıtın içinde branş listesi de otomatik olarak gelecektir. get_branches fonksiyonunu AYRICA ÇAĞIRMA! Gelen branşları hastaya numaralı liste olarak sun (kodları gösterme) ve hangisini istediğini sor.

8. Hastanın seçtiği branşı önceki listeden bularak, o branşın yanındaki 'Kod' (brans_kodu) değerini doğrudan 'get_doctors' fonksiyonuna parametre olarak gönder. DİKKAT: Kafandan branş kodları UYDURMA! Sadece sana verilen listedeki kodu kullan.

9. Hastanın seçtiği doktoru önceki listeden bularak, o doktorun 'brans_kodu', 'doktor_kodu' ve 'servis_kodu' değerlerini doğrudan 'get_available_days' fonksiyonuna gönder. METİN YAZMA, DİREKT FONKSİYONU ÇAĞIR!

10. Hastanın seçtiği günü önceki listeden bularak, o günün 'tarih' ve 'servis_kodu' değerlerini doğrudan 'get_available_hours' fonksiyonuna gönder. METİN YAZMA, DİREKT FONKSİYONU ÇAĞIR!

11. Hasta bir saat seçtiğinde, işlemi onaylatmak için şu formatta bir özet sun:
Bölüm: [Bölüm Adı]
Doktor: [Doktor Adı]
Tarih: [Tarih] [Saat]

"Onaylıyor musunuz?" diye sor.

12. Hasta "evet" diyerek onaylarsa, önceki işlem adımlarından elde ettiğin 'hasta_token' ve 'randevu_id' değerlerini kullanarak 'create_appointment' fonksiyonunu çağır ve randevuyu oluştur.

⚠️ KRİTİK KURALLAR:
- ASLA "lütfen bekleyin", "işleminizi tamamlıyorum", "kontrol ediyorum" gibi bekleme metinleri YAZMA! Fonksiyon çağırman gereken yerde SADECE fonksiyonu çağır, metin üretme!
- Fonksiyonlara parametre gönderirken sana verilen listedeki KOD değerlerini BİREBİR KULLAN.
- Doğum tarihi örneği olarak 01.01.1990 kullan, hastanın tarihini tahmin etme.
- Müşteri randevu dışında bir şey sorarsa, kibarca randevu konusuna yönlendir.
- Türkçe yanıt ver ve emojiler kullanarak samimi bir iletişim kur.`;


// ─── BUILT-IN FUNCTION DECLARATIONS FOR GEMINI ─────────────────────────────

export function getAppointmentToolDeclarations() {
    return [
        {
            name: 'validate_patient',
            description: 'Hasta bilgilerini doğrular ve sisteme kaydeder. Tüm hasta bilgileri toplandıktan sonra çağrılmalıdır.',
            parameters: {
                type: 'object',
                properties: {
                    tc: { type: 'string', description: 'TC Kimlik Numarası (11 haneli)' },
                    ad_soyad: { type: 'string', description: 'Hasta ad ve soyadı' },
                    cinsiyet: { type: 'string', description: 'Erkek veya Kadın' },
                    telefon: { type: 'string', description: 'Telefon numarası' },
                    dogum_tarihi: { type: 'string', description: 'GG.AA.YYYY formatında doğum tarihi' }
                },
                required: ['tc', 'ad_soyad', 'cinsiyet', 'telefon', 'dogum_tarihi']
            }
        },
        {
            name: 'get_branches',
            description: 'Mevcut randevu branşlarını/bölümlerini listeler. Hasta doğrulandıktan sonra çağır. Cinsiyet ve doğum tarihi bilgisi vererek uygun branşları getirir.',
            parameters: {
                type: 'object',
                properties: {
                    cinsiyet: { type: 'number', description: 'Hastanın cinsiyeti: 1=Erkek, 2=Kadın' },
                    dogum_tarihi: { type: 'string', description: 'Hastanın doğum tarihi DDMMYYYY formatında' }
                },
                required: []
            }
        },
        {
            name: 'get_doctors',
            description: 'Belirli bir branştaki doktorları/poliklinikleri listeler. brans_kodu parametresi branş listesinden alınan gerçek kod olmalıdır (sıra numarası DEĞİL).',
            parameters: {
                type: 'object',
                properties: {
                    brans_adi: {
                        type: 'string',
                        description: 'Kullanıcının seçtiği branşın TAM ADI (JSON listesinden bulunacak. Örn: Dermatoloji)'
                    },
                    brans_kodu: {
                        type: 'string',
                        description: 'Kullanıcının seçtiği branşın KODU (JSON listesindeki brans_kodu değeri. Örn: 1700. Asla sıra numarası değil!)'
                    }
                },
                required: ['brans_adi', 'brans_kodu']
            }
        },
        {
            name: 'get_available_days',
            description: 'Seçilen doktor için müsait randevu günlerini listeler.',
            parameters: {
                type: 'object',
                properties: {
                    brans_kodu: { type: 'string', description: 'Branş kodu' },
                    doktor_kodu: { type: 'string', description: 'Doktor kodu (get_doctors sonucundan)' },
                    servis_kodu: { type: 'string', description: 'Servis kodu (get_doctors sonucundan)' }
                },
                required: ['brans_kodu', 'doktor_kodu', 'servis_kodu']
            }
        },
        {
            name: 'get_available_hours',
            description: 'Seçilen gün için müsait randevu saatlerini listeler.',
            parameters: {
                type: 'object',
                properties: {
                    servis_kodu: { type: 'string', description: 'Servis kodu (get_available_days sonucundan)' },
                    tarih: { type: 'string', description: 'Randevu tarihi DD.MM.YYYY formatında (örn: 28.04.2026)' }
                },
                required: ['servis_kodu', 'tarih']
            }
        },
        {
            name: 'create_appointment',
            description: 'Tüm bilgiler toplandıktan ve müşteri onay verdikten sonra randevuyu oluşturur.',
            parameters: {
                type: 'object',
                properties: {
                    hasta_token: { type: 'string', description: 'validate_patient sonucundan gelen hasta_token' },
                    randevu_id: { type: 'string', description: 'get_available_hours sonucundan gelen randevu_id' },
                    // Özet bilgiler (yerel DB kaydı için)
                    patient_name: { type: 'string', description: 'Hasta adı soyadı' },
                    patient_phone: { type: 'string', description: 'Hasta telefon numarası' },
                    branch: { type: 'string', description: 'Branş adı' },
                    doctor_name: { type: 'string', description: 'Doktor adı' },
                    date: { type: 'string', description: 'Randevu tarihi' },
                    time: { type: 'string', description: 'Randevu saati' }
                },
                required: ['hasta_token', 'randevu_id']
            }
        },
        {
            name: 'handoff_to_human',
            description: 'Randevu akışında sorun oluştuğunda veya müşteri farklı bir konuda yardım istediğinde gerçek bir insana aktarır.',
            parameters: {
                type: 'object',
                properties: {
                    reason: {
                        type: 'string',
                        description: 'Aktarma nedeni'
                    }
                },
                required: ['reason']
            }
        }
    ];
}


// ─── FUNCTION EXECUTORS ────────────────────────────────────────────────────

/**
 * validate_patient — Hasta bilgilerini doğrular
 */
async function executeValidatePatient(workspaceId, conversationId, args) {
    const hasConnection = await checkHealthConnection(workspaceId);
    
    if (hasConnection) {
        // Split ad_soyad into adi and soyadi safely
        const parts = (args.ad_soyad || '').trim().split(' ');
        let adi = args.ad_soyad;
        let soyadi = '';
        if (parts.length > 1) {
            soyadi = parts.pop();
            adi = parts.join(' ');
        }
        // Auto-detect gender from Turkish first name if AI didn't provide it
        const firstName = (adi || '').toLowerCase().trim();
        if (!args.cinsiyet || args.cinsiyet.trim() === '') {
            const maleNames = ['gökhan','mehmet','mustafa','ahmet','ali','hasan','hüseyin','ibrahim','murat','ömer','emre','burak','serkan','cem','oğuz','fatih','selim','kadir','osman','yusuf','uğur','volkan','erhan','kemal','halil','barış','onur','ümit','cengiz','taner','tolga','sinan','ercan','bülent','engin','ilhan','metin','recep','süleyman','eren','adem','bayram','ismail','ramazan','yasin','levent','orhan','soner','şahin','tayyip','koray','ferhat','hikmet','deniz'];
            const femaleNames = ['ayşe','fatma','emine','hatice','zeynep','elif','merve','büşra','esra','seda','gamze','derya','özlem','pınar','serpil','gül','sevgi','sibel','nilgün','hülya','sultan','leyla','ece','laman','dilek','filiz','nurcan','gülşen','burcu','canan','defne','ebru','serap','tuba','yasemin','zehra','aslı','bahar','berna','betül','cansu','damla','duygu','melek','mine','nalan','neslihan','sema','şeyma','tuğba','yağmur','deniz'];
            
            if (maleNames.includes(firstName)) {
                args.cinsiyet = 'Erkek';
                console.log(`🔍 [AppointmentBot] Auto-detected gender: Erkek (from name: ${firstName})`);
            } else if (femaleNames.includes(firstName)) {
                args.cinsiyet = 'Kadın';
                console.log(`🔍 [AppointmentBot] Auto-detected gender: Kadın (from name: ${firstName})`);
            } else {
                args.cinsiyet = 'Erkek'; // Default fallback
                console.log(`⚠️ [AppointmentBot] Could not detect gender from name "${firstName}", defaulting to Erkek`);
            }
        }
        
        // Map 'Erkek' -> 1, 'Kadın' -> 2
        let mappedCinsiyet = 1;
        if (args.cinsiyet && args.cinsiyet.toLowerCase().includes('kadın')) {
            mappedCinsiyet = 2;
        }

        // Smart date parser — her formattan DDMMYYYY'ye dönüştür
        let mappedDogumTarihi = parseTurkishDate(args.dogum_tarihi || '');
        console.log(`📅 [AppointmentBot] Date parsed: "${args.dogum_tarihi}" → "${mappedDogumTarihi}"`);

        const { validatePatient, getBranches } = await import('./probel_appointment.service.js');
        const res = await validatePatient(workspaceId, {
            ...args,
            adi,
            soyadi,
            cinsiyet: mappedCinsiyet,
            dogum_tarihi: mappedDogumTarihi
        });
        
        if (res.success && res.hasta_token) {
            await updateAppointmentState(conversationId, { hasta_token: res.hasta_token });
            
            // ✅ Otomatik olarak branş listesini de çek ve yanıta ekle
            try {
                const branchRes = await getBranches(workspaceId, mappedCinsiyet, mappedDogumTarihi);
                if (branchRes.success && branchRes.branches) {
                    await updateAppointmentState(conversationId, { branches: branchRes.branches });
                    res.branches = branchRes.branches;
                    res.message = (res.message || 'Hasta bilgileri doğrulandı ✅') + 
                        '\n\n📋 Branş listesi de hazır! Aşağıdaki branşları hastaya numaralı liste olarak sun ve hangisini istediğini sor:\n' + 
                        branchRes.branches.map(b => `${b.sira}. ${b.brans_adi} (Kod: ${b.brans_kodu})`).join('\n') +
                        '\n\nKODLARI HASTAYA GÖSTERME, sadece numaralı branş isimlerini sun!';
                }
            } catch (branchErr) {
                console.error('⚠️ [AppointmentBot] Auto-fetch branches failed:', branchErr.message);
            }
        }
        return res;
    }

    // Fallback: no health system — just store info
    await updateAppointmentState(conversationId, { hasta_token: 'LOCAL_' + Date.now() });
    return {
        success: true,
        hasta_token: 'LOCAL_' + Date.now(),
        message: 'Hasta bilgileri alındı ✅'
    };
}

/**
 * get_branches — Branş listesi
 */
async function executeGetBranches(workspaceId, conversationId, args) {
    const hasConnection = await checkHealthConnection(workspaceId);
    
    if (hasConnection) {
        const { getBranches } = await import('./probel_appointment.service.js');
        const res = await getBranches(workspaceId, args?.cinsiyet || 1, args?.dogum_tarihi || '');
        if (res.success && res.branches) {
            await updateAppointmentState(conversationId, { branches: res.branches });
        }
        return res;
    }

    // Fallback: Local DB
    try {
        const branches = await prisma.appointmentBranch.findMany({
            where: { workspaceId, isActive: true },
            orderBy: { order: 'asc' },
            select: { name: true }
        });

        if (branches.length === 0) {
            return { success: false, message: 'Henüz branş tanımlanmamış. Lütfen yöneticiyle iletişime geçin.' };
        }

        return {
            success: true,
            branches: branches.map((b, i) => ({ sira: i + 1, brans_kodu: b.name, brans_adi: b.name })),
            message: `Mevcut branşlar: ${branches.map(b => b.name).join(', ')}`
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * get_doctors — Doktor listesi
 */
async function executeGetDoctors(workspaceId, conversationId, args) {
    const hasConnection = await checkHealthConnection(workspaceId);
    
    if (hasConnection) {
        // State'den doğru brans_kodu çek
        let realBransKodu = args.brans_kodu;
        
        if (conversationId) {
            try {
                const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
                if (conv?.appointmentState) {
                    const state = JSON.parse(conv.appointmentState);
                    if (state.branches && state.branches.length > 0) {
                        // AI'ın gönderdiği brans_kodu ile eşleştir
                        let selectedBranch = state.branches.find(b => 
                            String(b.brans_kodu) === String(args.brans_kodu)
                        );
                        
                        // Eşleşme bulunamazsa, branş adıyla dene
                        if (!selectedBranch && args.brans_adi) {
                            selectedBranch = state.branches.find(b => 
                                b.brans_adi.toLowerCase().includes(args.brans_adi.toLowerCase())
                            );
                        }
                        
                        // Hâlâ bulunamazsa sıra numarası ile dene
                        if (!selectedBranch) {
                            const branchIndex = parseInt(args.brans_kodu) - 1;
                            if (!isNaN(branchIndex) && branchIndex >= 0 && branchIndex < state.branches.length) {
                                selectedBranch = state.branches[branchIndex];
                            }
                        }
                        
                        if (selectedBranch) {
                            realBransKodu = selectedBranch.brans_kodu;
                            console.log(`🔄 [AppointmentBot] Overriding AI brans_kodu with state — brans: ${realBransKodu} (${selectedBranch.brans_adi})`);
                        } else {
                            console.warn(`⚠️ [AppointmentBot] AI sent brans_kodu ${args.brans_kodu}, no match found in state`);
                        }
                    }
                }
            } catch (e) {
                console.error('⚠️ [AppointmentBot] Error reading state for get_doctors:', e.message);
            }
        }
        
        const { getDoctors } = await import('./probel_appointment.service.js');
        const res = await getDoctors(workspaceId, realBransKodu);
        if (res.success && res.doctors) {
            await updateAppointmentState(conversationId, { doctors: res.doctors });
        }
        return res;
    }

    // Fallback: Local DB
    try {
        const branch = await prisma.appointmentBranch.findFirst({
            where: {
                workspaceId,
                name: { contains: args.brans_kodu || args.branch_name, mode: 'insensitive' },
                isActive: true
            },
            include: {
                doctors: {
                    where: { isActive: true },
                    orderBy: { name: 'asc' }
                }
            }
        });

        if (!branch || branch.doctors.length === 0) {
            return { success: false, message: 'Bu branşta doktor bulunamadı.' };
        }

        return {
            success: true,
            doctors: branch.doctors.map((d, i) => ({
                sira: i + 1,
                doktor_kodu: d.id,
                servis_kodu: d.id,
                doktor_adi: `${d.title || ''} ${d.name}`.trim()
            })),
            message: `${branch.doctors.length} doktor bulundu.`
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * get_available_days — Uygun günler
 * AI'ın gönderdiği kodlara GÜVENMİYORUZ. Kaydedilmiş state'den doğru kodları çekiyoruz.
 */
async function executeGetAvailableDays(workspaceId, conversationId, args) {
    const hasConnection = await checkHealthConnection(workspaceId);
    
    if (hasConnection) {
        // State'den doğru doktor bilgilerini çek
        let realDoktorKodu = args.doktor_kodu;
        let realServisKodu = args.servis_kodu;
        let realBransKodu = args.brans_kodu;
        
        if (conversationId) {
            try {
                const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
                if (conv?.appointmentState) {
                    const state = JSON.parse(conv.appointmentState);
                    if (state.doctors && state.doctors.length > 0) {
                        // Doktor seçimini bul — sıra numarasına veya isme göre eşleştir
                        let selectedDoctor = null;
                        
                        // Tek doktor varsa direkt onu al
                        if (state.doctors.length === 1) {
                            selectedDoctor = state.doctors[0];
                        } else {
                            // AI'ın gönderdiği doktor_kodu ile eşleştirmeye çalış
                            selectedDoctor = state.doctors.find(d => 
                                String(d.doktor_kodu) === String(args.doktor_kodu)
                            );
                            // Eşleşme bulunamazsa ilk doktoru al (en yaygın senaryo)
                            if (!selectedDoctor) {
                                selectedDoctor = state.doctors[0];
                                console.warn(`⚠️ [AppointmentBot] AI sent wrong doktor_kodu ${args.doktor_kodu}, falling back to first doctor`);
                            }
                        }
                        
                        if (selectedDoctor) {
                            realDoktorKodu = selectedDoctor.doktor_kodu;
                            realServisKodu = selectedDoctor.servis_kodu;
                            realBransKodu = selectedDoctor.brans_kodu || realBransKodu;
                            console.log(`🔄 [AppointmentBot] Overriding AI codes with state — doktor: ${realDoktorKodu}, servis: ${realServisKodu}, brans: ${realBransKodu}`);
                        }
                    }
                }
            } catch (e) {
                console.error('⚠️ [AppointmentBot] Error reading state for get_available_days:', e.message);
            }
        }
        
        const { getAvailableDays } = await import('./probel_appointment.service.js');
        const res = await getAvailableDays(workspaceId, realBransKodu, {
            doktor_kodu: realDoktorKodu,
            servis_kodu: realServisKodu
        });
        if (res.success && res.days) {
            await updateAppointmentState(conversationId, { days: res.days });
        }
        return res;
    }

    // Fallback: Local — check_availability equivalent
    return { success: false, message: 'Sağlık sistemi bağlantısı olmadan uygun günler sorgulanamıyor.' };
}

/**
 * get_available_hours — Uygun saatler
 * AI'ın gönderdiği kodlara GÜVENMİYORUZ. State'den doğru servis_kodu çekiyoruz.
 */
async function executeGetAvailableHours(workspaceId, conversationId, args) {
    const hasConnection = await checkHealthConnection(workspaceId);
    
    if (hasConnection) {
        let realServisKodu = args.servis_kodu;
        let realTarih = args.tarih;
        
        if (conversationId) {
            try {
                const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
                if (conv?.appointmentState) {
                    const state = JSON.parse(conv.appointmentState);
                    
                    // Days listesinden doğru servis_kodu'nu çek
                    if (state.days && state.days.length > 0) {
                        // AI'ın gönderdiği tarihe göre eşleştir
                        let selectedDay = state.days.find(d => d.tarih === args.tarih);
                        
                        // Tarihe göre bulunamazsa, sıra numarasıyla dene
                        if (!selectedDay) {
                            const dayIndex = parseInt(args.tarih) - 1;
                            if (!isNaN(dayIndex) && dayIndex >= 0 && dayIndex < state.days.length) {
                                selectedDay = state.days[dayIndex];
                            }
                        }
                        
                        // Hâlâ bulunamazsa ilk günü al
                        if (!selectedDay) {
                            selectedDay = state.days[0];
                            console.warn(`⚠️ [AppointmentBot] Could not match day, falling back to first day`);
                        }
                        
                        if (selectedDay) {
                            realServisKodu = selectedDay.servis_kodu || realServisKodu;
                            realTarih = selectedDay.tarih || realTarih;
                            console.log(`🔄 [AppointmentBot] Overriding AI codes for hours — servis: ${realServisKodu}, tarih: ${realTarih}`);
                        }
                    }
                    
                    // Ayrıca doctors'tan da servis_kodu çekilebilir (fallback)
                    if (!realServisKodu && state.doctors && state.doctors.length > 0) {
                        realServisKodu = state.doctors[0].servis_kodu;
                        console.log(`🔄 [AppointmentBot] Using doctor's servis_kodu as fallback: ${realServisKodu}`);
                    }
                }
            } catch (e) {
                console.error('⚠️ [AppointmentBot] Error reading state for get_available_hours:', e.message);
            }
        }
        
        const { getAvailableHours } = await import('./probel_appointment.service.js');
        const res = await getAvailableHours(workspaceId, realServisKodu, realTarih);
        if (res.success && res.hours) {
            await updateAppointmentState(conversationId, { hours: res.hours });
        }
        return res;
    }

    return { success: false, message: 'Sağlık sistemi bağlantısı olmadan uygun saatler sorgulanamıyor.' };
}

/**
 * create_appointment — Randevu oluştur
 */
async function executeCreateAppointment(workspaceId, args, conversationId, botId) {
    const hasConnection = await checkHealthConnection(workspaceId);
    
    if (hasConnection) {
        // AI'ın gönderdiği token/id'lere GÜVENMİYORUZ. MUTLAKA state'den çekiyoruz.
        let hastaToken = null;
        let randevuId = null;
        
        if (conversationId) {
            try {
                const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
                if (conv?.appointmentState) {
                    const state = JSON.parse(conv.appointmentState);
                    
                    // hasta_token'ı state'den çek
                    hastaToken = state.hasta_token;
                    console.log(`🔄 [AppointmentBot] hasta_token from state: ${hastaToken}`);
                    
                    // randevu_id'yi seçilen saate göre hours listesinden çek
                    if (state.hours && state.hours.length > 0) {
                        let selectedHour = null;
                        
                        // AI'ın gönderdiği saat ile eşleştir
                        if (args.time) {
                            selectedHour = state.hours.find(h => h.saat === args.time);
                        }
                        
                        // Saat ile bulunamazsa sıra numarasıyla dene
                        if (!selectedHour && args.randevu_id) {
                            const hourIndex = parseInt(args.randevu_id) - 1;
                            if (!isNaN(hourIndex) && hourIndex >= 0 && hourIndex < state.hours.length) {
                                selectedHour = state.hours[hourIndex];
                            }
                        }
                        
                        // Hâlâ bulunamazsa ilk saati al
                        if (!selectedHour) {
                            selectedHour = state.hours[0];
                            console.warn(`⚠️ [AppointmentBot] Could not match hour, falling back to first hour`);
                        }
                        
                        if (selectedHour) {
                            randevuId = selectedHour.randevu_id;
                            console.log(`🔄 [AppointmentBot] randevu_id from state: ${randevuId} (saat: ${selectedHour.saat})`);
                        }
                    }
                }
            } catch (e) {
                console.error('⚠️ [AppointmentBot] Error reading state for create_appointment:', e.message);
            }
        }
        
        console.log(`📋 [AppointmentBot] FINAL create_appointment params — hasta_token: ${hastaToken}, randevu_id: ${randevuId}`);
        
        const { createAppointment } = await import('./probel_appointment.service.js');
        const result = await createAppointment(workspaceId, hastaToken, randevuId);

        // Also save to local DB for tracking
        if (result.success) {
            try {
                const admin = await prisma.workspaceMember.findFirst({
                    where: { workspaceId },
                    include: { user: { select: { id: true } } }
                });

                await prisma.appointment.create({
                    data: {
                        workspaceId,
                        title: `${args.branch || 'Randevu'} - ${args.patient_name || 'Hasta'}`,
                        description: `HBYS üzerinden alınan randevu`,
                        startTime: new Date(),
                        endTime: new Date(Date.now() + 30 * 60000),
                        contactName: args.patient_name || '',
                        contactPhone: args.patient_phone || '',
                        branch: args.branch || '',
                        doctorName: args.doctor_name || '',
                        createdById: admin?.user?.id || 'system',
                        createdByBotId: botId || null,
                        conversationId: conversationId || null,
                        status: 'SCHEDULED',
                        color: '#7c3aed',
                        notes: `HBYS Randevu | Tarih: ${args.date || ''} Saat: ${args.time || ''}`
                    }
                });
            } catch (dbErr) {
                console.warn('⚠️ [AppointmentBot] Local DB save failed (non-critical):', dbErr.message);
            }

            result.message = `Randevunuz başarıyla oluşturuldu! ✅\n\n📋 Randevu Detayları:\n👤 Hasta: ${args.patient_name || ''}\n🏥 Branş: ${args.branch || ''}\n👨‍⚕️ Doktor: ${args.doctor_name || ''}\n📅 Tarih: ${args.date || ''}\n🕐 Saat: ${args.time || ''}\n\nRandevunuz onaylanmıştır. İyi günler dileriz! 🙏`;
        }

        return result;
    }

    // Fallback: Local DB appointment
    try {
        const { patient_name, patient_phone, branch, procedure, doctor_name, date, time } = args;

        const [dayStr, monthStr, yearStr] = (date || '').includes('.') ? date.split('.') : date.split('-');
        const [hour, minute] = (time || '09:00').split(':').map(Number);

        const startTime = new Date(yearStr, monthStr - 1, dayStr, hour, minute, 0);
        const endTime = new Date(startTime);
        endTime.setMinutes(endTime.getMinutes() + 30);

        const admin = await prisma.workspaceMember.findFirst({
            where: { workspaceId },
            include: { user: { select: { id: true } } }
        });

        const appointment = await prisma.appointment.create({
            data: {
                workspaceId,
                title: `${branch || 'Randevu'} - ${patient_name}`,
                description: procedure || `${branch} randevusu`,
                startTime,
                endTime,
                contactName: patient_name,
                contactPhone: patient_phone,
                branch: branch || '',
                procedure: procedure || null,
                doctorName: doctor_name,
                createdById: admin?.user?.id || 'system',
                createdByBotId: botId || null,
                conversationId: conversationId || null,
                status: 'SCHEDULED',
                color: '#10b981'
            }
        });

        if (conversationId) {
            await prisma.conversation.update({
                where: { id: conversationId },
                data: { appointmentState: JSON.stringify({ step: 'COMPLETED', appointmentId: appointment.id }) }
            });
        }

        return {
            success: true,
            appointmentId: appointment.id,
            message: `Randevunuz başarıyla oluşturuldu! ✅\n\n📋 Randevu Detayları:\n👤 Hasta: ${patient_name}\n📱 Telefon: ${patient_phone}\n🏥 Branş: ${branch}\n👨‍⚕️ Doktor: ${doctor_name}\n📅 Tarih: ${date}\n🕐 Saat: ${time}\n\nRandevunuz onaylanmıştır. İyi günler dileriz! 🙏`
        };
    } catch (error) {
        console.error('❌ [AppointmentBot] create_appointment error:', error.message);
        return { success: false, error: 'Randevu oluşturulurken bir hata oluştu.' };
    }
}

/**
 * handoff_to_human — Gerçek insana aktar
 */
async function executeHandoffToHuman(workspaceId, conversationId, reason) {
    try {
        if (conversationId) {
            await prisma.conversation.update({
                where: { id: conversationId },
                data: {
                    appointmentState: null,
                    handoffPending: true
                }
            });
        }

        console.log(`🔄 [AppointmentBot] Handoff requested: ${reason}`);

        return {
            success: true,
            message: `Sizi müşteri temsilcimize aktarıyorum. Nedeni: ${reason}. Kısa süre içinde size yardımcı olunacaktır. 🙏`
        };
    } catch (error) {
        console.error('❌ [AppointmentBot] handoff error:', error.message);
        return { success: false, error: error.message };
    }
}


// ─── HELPER ─────────────────────────────────────────────────────────────────

async function checkHealthConnection(workspaceId) {
    try {
        const integration = await prisma.apiIntegration.findFirst({
            where: { workspaceId, authType: 'OAUTH_PASSWORD', isActive: true }
        });
        return !!integration;
    } catch {
        return false;
    }
}

async function updateAppointmentState(conversationId, partialState) {
    if (!conversationId) return;
    try {
        const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
        if (!conversation) return;
        
        let currentState = {};
        if (conversation.appointmentState) {
            try { currentState = JSON.parse(conversation.appointmentState); } catch (e) {}
        }
        
        const newState = { ...currentState, ...partialState };
        await prisma.conversation.update({
            where: { id: conversationId },
            data: { appointmentState: JSON.stringify(newState) }
        });
        console.log(`💾 [AppointmentBot] Saved state for ${conversationId}:`, newState);
    } catch (error) {
        console.error(`❌ [AppointmentBot] Error saving state:`, error.message);
    }
}


// ─── MAIN EXECUTOR — Called by AI Controller ───────────────────────────────

/**
 * Appointment bot function call'larını execute eder.
 * AI controller'daki tryGenerate fonksiyonundan çağrılır.
 */
export async function executeAppointmentFunction(functionName, args, workspaceId, conversationId, botId) {
    console.log(`⚙️ [AppointmentBot] Executing: ${functionName}`, args);

    switch (functionName) {
        case 'validate_patient':
            return await executeValidatePatient(workspaceId, conversationId, args);

        case 'get_branches':
            return await executeGetBranches(workspaceId, conversationId, args);

        case 'get_doctors':
            return await executeGetDoctors(workspaceId, conversationId, args);

        case 'get_available_days':
            return await executeGetAvailableDays(workspaceId, conversationId, args);

        case 'get_available_hours':
            return await executeGetAvailableHours(workspaceId, conversationId, args);

        case 'create_appointment':
            return await executeCreateAppointment(workspaceId, args, conversationId, botId);

        case 'handoff_to_human':
            return await executeHandoffToHuman(workspaceId, conversationId, args.reason);

        default:
            console.warn(`⚠️ [AppointmentBot] Unknown function: ${functionName}`);
            return { success: false, error: `Bilinmeyen fonksiyon: ${functionName}` };
    }
}
