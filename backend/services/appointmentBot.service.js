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
import { createAppointment, APPOINTMENT_SOURCE, APPOINTMENT_RESULT } from './domain/appointment.domain.js';

// ─── APPOINTMENT DATE/TIME PARSER ──────────────────────────────────────────
/**
 * args.date ("12.05.2026", "12-05-2026", "2026-05-12") ve
 * args.time ("10:00", "10:00:00") değerlerinden Türkiye saatine (UTC+3)
 * göre doğru startTime ve endTime üretir.
 *
 * Sunucu UTC'de çalışsa bile randevu saati Türkiye yerel saatine göre
 * doğru şekilde kaydedilir.
 */
function parseAppointmentDateTime(dateStr, timeStr, durationMinutes = 30) {
    try {
        if (!dateStr) throw new Error('No date');

        let day, month, year;

        // "12.05.2026" veya "12-05-2026"
        const dmyMatch = dateStr.match(/^(\d{1,2})[.\-](\d{1,2})[.\-](\d{4})$/);
        if (dmyMatch) {
            day   = parseInt(dmyMatch[1]);
            month = parseInt(dmyMatch[2]);
            year  = parseInt(dmyMatch[3]);
        } else {
            // "2026-05-12" (ISO)
            const isoMatch = dateStr.match(/^(\d{4})[.\-](\d{1,2})[.\-](\d{1,2})$/);
            if (isoMatch) {
                year  = parseInt(isoMatch[1]);
                month = parseInt(isoMatch[2]);
                day   = parseInt(isoMatch[3]);
            } else {
                throw new Error(`Unrecognised date format: ${dateStr}`);
            }
        }

        const [hour = 9, minute = 0] = (timeStr || '09:00')
            .split(':')
            .map(Number);

        // Türkiye saatine (UTC+3) göre ISO string oluştur → timezone-aware Date
        const pad = (n) => String(n).padStart(2, '0');
        const isoWithTZ = `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00+03:00`;
        const startTime = new Date(isoWithTZ);

        if (isNaN(startTime.getTime())) throw new Error(`Invalid date: ${isoWithTZ}`);

        const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);

        console.log(`📅 [parseAppointmentDateTime] "${dateStr} ${timeStr}" → startTime: ${startTime.toISOString()} (TR: ${startTime.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })})`);
        return { startTime, endTime };
    } catch (err) {
        console.warn(`⚠️ [parseAppointmentDateTime] Parse failed ("${dateStr}" "${timeStr}"), falling back to NOW:`, err.message);
        const startTime = new Date();
        const endTime   = new Date(startTime.getTime() + durationMinutes * 60 * 1000);
        return { startTime, endTime };
    }
}

// ─── TURKISH DATE PARSER ─────────────────────────────────────────────────────
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

export const DEFAULT_APPOINTMENT_PROMPT = `Sen nazik ve profesyonel bir hastane randevu asistanısın. Görevin müşterilerle sohbet ederek randevu oluşturmaktır.

🚨 KRİTİK BAŞLANGIÇ KURALI:
1. Müşteri "randevu" kelimesini kullandığında, hemen nazikçe "Hangi bölümden randevu almak istiyorsunuz?" diye sor.
2. İlk aşamada 'get_branches' fonksiyonunu DİREKT ÇAĞIRMA! Sadece soruyu sor.
3. Eğer müşteri "bilmiyorum", "liste var mı?", "bölümleri göster" gibi bir şey söylerse, o zaman 'get_branches' fonksiyonunu çağır (cinsiyet: 1, dogum_tarihi: "" varsayılan değerleriyle) ve gelen listeyi numaralandırarak sun.
4. Eğer müşteri direkt bir bölüm ismi verirse (örn. "Kardiyoloji"), o zaman 'get_branches' çağırarak arka planda bölüm listesini al ve müşterinin istediği bölüme uygun olanı seçerek Doktor adımına (Adım 2) geç.

📋 RANDEVU AKIŞI:
ÖNCE randevu detaylarını belirle (branş, doktor, gün, saat), SONRA hasta bilgilerini al.

🔹 ADIM 1 — BRANŞ SEÇİMİ:
Müşteri mesajında "randevu" kelimesi AÇIKÇA geçiyorsa, HEMEN "Hangi bölümden randevu almak istiyorsunuz?" diye sor. get_branches FONKSİYONUNU ÇAĞIRMA!
- Eğer müşteri direkt bölüm adı verirse (örn: "Kardiyoloji"), o zaman arka planda get_branches çağır ve doğrudan Doktor adımına (Adım 2) geç.
- Eğer müşteri "bilmiyorum", "seçenekler neler?", "liste göster" gibi bir şey söylerse, o zaman get_branches çağır ve listeyi sun.

🔹 ADIM 2 — DOKTOR SEÇİMİ:
Müşteri branş seçtiğinde, o branşın kodunu kullanarak 'get_doctors' fonksiyonunu çağır. METİN YAZMA, DİREKT FONKSİYONU ÇAĞIR!
Doktorları listele ve seçim yaptır.

🔹 ADIM 3 — GÜN SEÇİMİ:
Doktor seçildikten sonra 'get_available_days' fonksiyonunu çağır. METİN YAZMA, DİREKT FONKSİYONU ÇAĞIR!
Fonksiyon günleri döndürdüğünde sadece kısa bir soru ekle ("Hangi gün uygun?"). Listeyi TEKRAR YAZMA — zaten gösterildi.

🔹 ADIM 4 — SAAT SEÇİMİ:
Gün seçildiğinde 'get_available_hours' fonksiyonunu çağır. METİN YAZMA, DİREKT FONKSİYONU ÇAĞIR!
Fonksiyon saatleri döndürdüğünde sadece kısa bir soru ekle ("Hangi saat uygun?"). Listeyi TEKRAR YAZMA — zaten gösterildi.
Müşteri numara ile seçim yaparsa (örn: "3" → 3. saat) listeyi tekrar göstermeden o saati onayla ve devam et.

🔹 ADIM 5 — HASTA BİLGİLERİ (saat seçildikten SONRA):
Randevu detayları tamamen belirlendikten sonra hasta bilgilerini topla. Sırasıyla şunları sor (TEKER TEKER, aynı anda birden fazla soru sorma):
1. Ad Soyad
2. Telefon Numarası
3. Doğum Tarihi ("Doğum tarihinizi öğrenebilir miyim? Örnek format: 15.08.1985")
Bu üç bilgi alındıktan sonra HİÇBİR ŞEY SORMADAN doğrudan 'validate_patient' fonksiyonunu çağır.

TC Kimlik GEREKSİZDİR, KESİNLİKLE SORMA!
NOT: Cinsiyet bilgisini isimden otomatik belirle, SORMA! (Erkek isimleri: Gökhan, Mehmet, Ali vb. → "Erkek" / Kadın isimleri: Ayşe, Fatma vb. → "Kadın")


🔹 ADIM 6 — DOĞRULAMA VE RANDEVU OLUŞTURMA:
Tüm bilgiler toplandığında 'validate_patient' fonksiyonunu çağır. METİN YAZMA, DİREKT FONKSİYONU ÇAĞIR!
Doğrulama başarılı olursa, özet göster ve onay al:
  Bölüm: [Bölüm Adı]
  Doktor: [Doktor Adı]
  Tarih: [Tarih] [Saat]
  Hasta: [Ad Soyad]
Müşteri onaylarsa 'create_appointment' fonksiyonunu çağır.

⚠️ KRİTİK KURALLAR:
- ASLA "lütfen bekleyin", "kontrol ediyorum" gibi bekleme metinleri YAZMA! Fonksiyon çağırman gereken yerde SADECE fonksiyonu çağır.
- Fonksiyonlara parametre gönderirken sana verilen listedeki KOD değerlerini BİREBİR KULLAN, kafandan uydurma!
- Müşteri branş adı söylerse (örn: "dermatoloji"), listede eşleştirip doğrudan get_doctors çağır.
- Müşteri doktor adı söylerse, listede eşleştirip doğrudan get_available_days çağır.
- Doğum tarihi örneği olarak **/**/****  kullan, gerçek tarih gösterme.
- Türkçe yanıt ver ve samimi bir iletişim kur.
- Müşteri randevu dışında bir şey sorarsa, kibarca randevu konusuna yönlendir.
- 🔢 NUMARA SEÇİMİ: Müşteri bir liste sunulduğunda sadece numara yazarsa ("1", "2", "3" vb.), o numaradaki seçeneği seçmiş sayılır. Tekrar sormadan o seçeneğe göre devam et. Örn: saatler listesinde "3" yazarsa = 3. saati seçmiş demektir, o saatin randevu_id'sini kullan.
- ✅ HASTA DOĞRULAMA: validate_patient her zaman success döner. Success geldiğinde direkt özet göster ve onay al, TEKRAR bilgi SORMA!

🕐 GÖRECELİ ZAMAN KURALLARI (ÇOK ÖNEMLİ):
Sana sistemin GÜNCEL TARİH VE SAAT bilgisi verilmektedir. Müşteri göreceli zaman ifadesi kullandığında MUTLAKA bu bilgiyi referans alarak gerçek tarihi hesapla:
- "yarın" → sistem tarihine +1 gün ekle (Örn: bugün 11 Mayıs ise yarın = 12 Mayıs 2026)
- "öbür gün" / "2 gün sonra" → +2 gün
- "bu hafta Perşembe" → en yakın gelecekteki o gün (geçmişe gitme!)
- "gelecek hafta" → +7 gün baz alarak hesapla
- "2 saat sonra" → sistem saatine +2 saat ekle, o saati hedef saat olarak kullan
- "öğleden sonra" → 13:00-17:00 arasındaki ilk müsait slotu tercih et
- "sabah erken" / "sabah" → 08:00-11:00 arasındaki ilk müsait slotu tercih et
- "akşam" → 17:00 ve sonrası
- "öğlen" / "öğle vakti" → 12:00-13:00 arası

Hesapladığın tarihi kullanıcıya MUTLAKA teyit et, örneğin:
"12 Mayıs Salı için uygun saatlere bakıyorum..." gibi söyle.

Eğer hesapladığın tarih/saat için müsait slot bulunamazsa:
- Saat bulunamazsa: müsait saatleri listele ve "Bu saat müsait değil, şu saatler boş: ..." de
- Gün bulunamazsa: müsait günleri listele ve "O gün için boş slot yok, şu günler müsait: ..." de
- Asla yanlış slot kaydetme, her zaman müşteriyle teyit et!`;



// ─── BUILT-IN FUNCTION DECLARATIONS FOR GEMINI ─────────────────────────────

export function getAppointmentToolDeclarations() {
    return [
        {
            name: 'validate_patient',
            description: 'Hasta bilgilerini doğrular ve sisteme kaydeder. Ad soyad ve telefon yeterlidir. TC ve doğum tarihi artık kullanılmamaktadır.',
            parameters: {
                type: 'object',
                properties: {
                    tc: { type: 'string', description: 'Kullanımdan kaldırıldı, boş bırakın' },
                    ad_soyad: { type: 'string', description: 'Hasta ad ve soyadı' },
                    cinsiyet: { type: 'string', description: 'Erkek veya Kadın' },
                    telefon: { type: 'string', description: 'Telefon numarası' },
                    dogum_tarihi: { type: 'string', description: 'Hastanın doğum tarihi. "15.08.1985", "15 Ağustos 1985", "1985-08-15" gibi formatlarda alınabilir.' }
                },
                required: ['ad_soyad', 'telefon']
            }
        },
        {
            name: 'get_branches',
            description: 'Mevcut randevu branşlarını/bölümlerini listeler. YALNIZCA müşteri mesajında "randevu" kelimesi AÇIKÇA geçiyorsa çağrılır. "randevu" kelimesi geçmiyorsa KESİNLİKLE çağrılmaz. Parametresiz çağrılabilir.',
            parameters: {
                type: 'object',
                properties: {
                    cinsiyet: { type: 'number', description: 'Hastanın cinsiyeti: 1=Erkek, 2=Kadın (varsayılan: 1)' },
                    dogum_tarihi: { type: 'string', description: 'Hastanın doğum tarihi DDMMYYYY formatında (opsiyonel)' }
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
        
        // Turkish upper case for Oracle DB matching
        const trUpper = (str) => {
            if (!str) return '';
            return str.replace(/i/g, 'İ').replace(/ı/g, 'I').toLocaleUpperCase('tr-TR');
        };
        
        const safeAdi = trUpper(adi);
        const safeSoyadi = trUpper(soyadi);

        // Map 'Erkek' -> 1, 'Kadın' -> 2
        let mappedCinsiyet = 1;
        if (args.cinsiyet && args.cinsiyet.toLowerCase().includes('kadın')) {
            mappedCinsiyet = 2;
        }

        // Smart date parser
        let mappedDogumTarihi = parseTurkishDate(args.dogum_tarihi || '');
        console.log(`📅 [AppointmentBot] Date parsed: "${args.dogum_tarihi}" → "${mappedDogumTarihi}"`);

        // Phone normalization
        let cleanPhone = (args.telefon || '').replace(/[\s\-\(\)]/g, '');
        if (cleanPhone.startsWith('+90')) cleanPhone = cleanPhone.substring(3);
        if (cleanPhone.startsWith('90') && cleanPhone.length === 12) cleanPhone = cleanPhone.substring(2);
        
        let phoneWithZero = cleanPhone;
        let phoneWithoutZero = cleanPhone;
        
        if (cleanPhone.startsWith('0') && cleanPhone.length === 11) {
            phoneWithoutZero = cleanPhone.substring(1);
        } else if (!cleanPhone.startsWith('0') && cleanPhone.length === 10) {
            phoneWithZero = '0' + cleanPhone;
        }

        console.log(`📱 [AppointmentBot] Phone variations: "${phoneWithZero}" or "${phoneWithoutZero}"`);

        const { validatePatient } = await import('./probel_appointment.service.js');
        
        // Try with 10-digit phone first
        let res = await validatePatient(workspaceId, {
            ...args,
            adi: safeAdi,
            soyadi: safeSoyadi,
            cinsiyet: mappedCinsiyet,
            dogum_tarihi: mappedDogumTarihi,
            telefon: phoneWithoutZero
        });
        
        // If it failed and we didn't provide a TC, try with 11-digit phone
        if (!res.success && (!args.tc || args.tc.trim() === '')) {
            console.log(`🔄 [AppointmentBot] 10-digit phone failed, trying 11-digit phone...`);
            res = await validatePatient(workspaceId, {
                ...args,
                adi: safeAdi,
                soyadi: safeSoyadi,
                cinsiyet: mappedCinsiyet,
                dogum_tarihi: mappedDogumTarihi,
                telefon: phoneWithZero
            });
        }
        
        if (res.success && res.hasta_token) {
            // Probel'de hasta bulundu — gerçek token kaydediliyor
            await updateAppointmentState(conversationId, { hasta_token: res.hasta_token });
            return res;
        } else {
            // Probel'de bulunamadı → LOCAL_ token ile devam et (local DB randevu)
            // Bu sayede Gemini create_appointment'ı çağırmaya devam eder
            const localToken = 'LOCAL_' + Date.now();
            await updateAppointmentState(conversationId, { hasta_token: localToken });
            console.log(`⚠️ [AppointmentBot] Probel'de hasta bulunamadı, LOCAL_ token ile devam ediliyor`);
            return {
                success: true,
                hasta_token: localToken,
                probel_found: false,
                message: 'Hasta bilgileri alındı ✅ Randevunuz oluşturulacak.'
            };
        }
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
            await updateAppointmentState(conversationId, { branches: res.branches, doctors: null, days: null, hours: null, patient_name: null });
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
            await updateAppointmentState(conversationId, { doctors: res.doctors, days: null, hours: null, patient_name: null });
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
            await updateAppointmentState(conversationId, { days: res.days, hours: null, patient_name: null });
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
                        
                        // Tarihe göre bulunamazsa, tarih normalizasyonuyla dene (nokta/tire farklılığı)
                        if (!selectedDay && args.tarih) {
                            const normDate = (d) => (d || '').replace(/[.\-\/]/g, '');
                            selectedDay = state.days.find(d => normDate(d.tarih) === normDate(args.tarih));
                        }

                        // Hâlâ bulunamazsa, sıra numarasıyla dene
                        if (!selectedDay) {
                            const dayIndex = parseInt(args.tarih) - 1;
                            if (!isNaN(dayIndex) && dayIndex >= 0 && dayIndex < state.days.length) {
                                selectedDay = state.days[dayIndex];
                            }
                        }
                        
                        // Yine bulunamazsa — yanlış güne düşme, müsait günleri döndür
                        if (!selectedDay) {
                            const availableDates = state.days.map(d => d.tarih).join(', ');
                            console.warn(`⚠️ [AppointmentBot] Requested date "${args.tarih}" not found in available days: ${availableDates}`);
                            return {
                                success: false,
                                requested_date: args.tarih,
                                message: `Üzgünüm, ${args.tarih} tarihi için müsait randevu slotu bulunmuyor. Aşağıdaki günler müsaittir: ${availableDates}\n\nHangi günü tercih edersiniz?`
                            };
                        }
                        
                        realServisKodu = selectedDay.servis_kodu || realServisKodu;
                        realTarih = selectedDay.tarih || realTarih;
                        console.log(`🔄 [AppointmentBot] Overriding AI codes for hours — servis: ${realServisKodu}, tarih: ${realTarih}`);
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
    // ── ÖN ADIM: State'i fonksiyon başında oku (ADIM 1 üzerine yazmadan önce) ──
    // ADIM 1 appointmentState'i overwrite eder — bu yüzden hasta_token ve
    // randevu_id'yi şimdi okuyup dışarıdaki değişkenlere alıyoruz.
    let probelHastaToken = null;
    let probelRandevuId = null;
    if (conversationId) {
        try {
            const preConv = await prisma.conversation.findUnique({ where: { id: conversationId } });
            if (preConv?.appointmentState) {
                const preState = JSON.parse(preConv.appointmentState);
                probelHastaToken = preState.hasta_token || null;
                if (preState.hours?.length > 0 && args.time) {
                    const match = preState.hours.find(h => h.saat === args.time || h.saat.startsWith(args.time));
                    if (match) {
                        probelRandevuId = match.randevu_id;
                        console.log(`✅ [AppointmentBot] Ön-okuma: saat "${args.time}" → randevu_id: ${probelRandevuId}`);
                    } else {
                        console.warn(`⚠️ [AppointmentBot] Ön-okuma: saat eşleşmedi! args.time="${args.time}", kayıtlı:`, preState.hours.map(h => h.saat));
                    }
                }
                console.log(`🔑 [AppointmentBot] Ön-okuma: hasta_token=${probelHastaToken || 'YOK'}, randevu_id=${probelRandevuId || 'YOK'}`);
            }
        } catch (preErr) {
            console.warn('⚠️ [AppointmentBot] Ön-okuma hatası (non-critical):', preErr.message);
        }
    }

    // ── ADIM 1: HER ZAMAN Instomer DB'ye kaydet ─────────────────────────────
    // Probel bağlantısı veya token beklenmez. Randevu önce Instomer'e yazılır.
    let localAppointmentId = null;
    try {
        let { patient_name, patient_phone, branch, procedure, doctor_name, date, time } = args;


        // Eksik bilgileri conversation/contact'tan tamamla
        let contactId = null;
        if (conversationId) {
            try {
                const convData = await prisma.conversation.findUnique({
                    where: { id: conversationId },
                    select: {
                        contactId: true,
                        contact: { select: { id: true, name: true, phone: true } }
                    }
                });
                if (convData?.contact?.id) {
                    contactId = convData.contact.id;
                }
                if (!patient_name) patient_name = convData?.contact?.name || 'Müşteri';
                if (!patient_phone) patient_phone = convData?.contact?.phone || '';
            } catch (e) {
                console.warn('⚠️ [AppointmentBot] Contact lookup failed:', e.message);
            }
        }

        // contactId hâlâ bulunamadıysa telefon numarasıyla ara
        if (!contactId && patient_phone) {
            try {
                const normalizedPhone = patient_phone.replace(/\D/g, '');
                const existingContact = await prisma.contact.findFirst({
                    where: {
                        workspaceId,
                        OR: [
                            { phone: { contains: normalizedPhone.slice(-10) } },
                            { phone: normalizedPhone }
                        ]
                    },
                    select: { id: true }
                });
                if (existingContact) {
                    contactId = existingContact.id;
                }
            } catch (e) {
                console.warn('⚠️ [AppointmentBot] Phone-based contact lookup failed:', e.message);
            }
        }

        // Göreceli tarih desteği ("yarın", "bugün", "pazartesi" vb.)
        if (date) {
            const dateLower = date.toLowerCase().trim();
            const trNow = new Date(Date.now() + 3 * 60 * 60 * 1000);
            const pad = n => String(n).padStart(2, '0');
            const TR_DAYS = { 'pazartesi': 1, 'sali': 2, 'salı': 2, 'carsamba': 3, 'çarşamba': 3, 'persembe': 4, 'perşembe': 4, 'cuma': 5, 'cumartesi': 6, 'pazar': 0 };

            let resolvedDate = null;
            if (dateLower === 'yarın' || dateLower === 'yarin') {
                resolvedDate = new Date(trNow.getTime() + 24 * 60 * 60 * 1000);
            } else if (dateLower === 'bugün' || dateLower === 'bugun') {
                resolvedDate = new Date(trNow);
            } else {
                for (const [dayName, dayNum] of Object.entries(TR_DAYS)) {
                    if (dateLower.includes(dayName)) {
                        const today = trNow.getUTCDay();
                        let daysUntil = dayNum - today;
                        if (daysUntil <= 0) daysUntil += 7;
                        resolvedDate = new Date(trNow.getTime() + daysUntil * 24 * 60 * 60 * 1000);
                        break;
                    }
                }
            }
            if (resolvedDate) {
                date = `${pad(resolvedDate.getUTCDate())}.${pad(resolvedDate.getUTCMonth() + 1)}.${resolvedDate.getUTCFullYear()}`;
                console.log(`📅 [AppointmentBot] Göreceli tarih çözümlendi: "${args.date}" → "${date}"`);
            }
        }

        // Eksik doktor veya branş bilgisini preState'ten tamamla
        if (conversationId) {
            try {
                const convCheck = await prisma.conversation.findUnique({ where: { id: conversationId } });
                if (convCheck?.appointmentState) {
                    const stateObj = JSON.parse(convCheck.appointmentState);
                    if (!doctor_name) {
                        doctor_name = stateObj.doctor_name || stateObj.doktor_adi || '';
                        if (!doctor_name && stateObj.doctors?.length === 1) {
                            doctor_name = stateObj.doctors[0].doktor_adi || '';
                        } else if (!doctor_name && stateObj.doktor_kodu && stateObj.doctors?.length) {
                            const foundDoc = stateObj.doctors.find(d => String(d.doktor_kodu) === String(stateObj.doktor_kodu));
                            if (foundDoc) doctor_name = foundDoc.doktor_adi;
                        }
                    }
                    if (!branch) {
                        branch = stateObj.branch || stateObj.brans_adi || '';
                        if (!branch && stateObj.branches?.length === 1) {
                            branch = stateObj.branches[0].brans_adi || '';
                        } else if (!branch && stateObj.brans_kodu && stateObj.branches?.length) {
                            const foundBranch = stateObj.branches.find(b => String(b.brans_kodu) === String(stateObj.brans_kodu));
                            if (foundBranch) branch = foundBranch.brans_adi;
                        }
                    }
                }
            } catch (stErr) {
                console.warn('⚠️ [AppointmentBot] State parsing error for doctor/branch:', stErr.message);
            }
        }

        // CalendarResource eşleştirmesi
        let resolvedResourceId = null;
        if (doctor_name || branch) {
            try {
                if (doctor_name) {
                    const matchedRes = await prisma.calendarResource.findFirst({
                        where: {
                            workspaceId,
                            name: { contains: doctor_name.trim(), mode: 'insensitive' }
                        }
                    });
                    if (matchedRes) {
                        resolvedResourceId = matchedRes.id;
                    }
                }
                if (!resolvedResourceId && branch) {
                    const matchedBranchRes = await prisma.calendarResource.findFirst({
                        where: {
                            workspaceId,
                            description: { contains: branch.trim(), mode: 'insensitive' }
                        }
                    });
                    if (matchedBranchRes) {
                        resolvedResourceId = matchedBranchRes.id;
                        if (!doctor_name && matchedBranchRes.type === 'PERSON') {
                            doctor_name = matchedBranchRes.name;
                        }
                    }
                }
            } catch (resErr) {
                console.warn('⚠️ [AppointmentBot] Resource match error:', resErr.message);
            }
        }

        const { startTime, endTime } = parseAppointmentDateTime(date, time);

        const admin = await prisma.workspaceMember.findFirst({
            where: { workspaceId },
            include: { user: { select: { id: true } } }
        });

        // ── TEK KAPI: izin kapısı + çakışma + google sync + socket + bildirim ──
        const outcome = await createAppointment({
            workspaceId,
            source: APPOINTMENT_SOURCE.CHAT_BOT,
            title:          `${branch || 'Randevu'} — ${patient_name || 'Müşteri'}`,
            description:    procedure || `${branch || 'Randevu'} randevusu`,
            startTime,
            endTime,
            contactId:      contactId || null,
            contactName:    patient_name  || '',
            contactPhone:   patient_phone || '',
            branch:         branch        || '',
            procedure:      procedure     || null,
            doctorName:     doctor_name   || '',
            resourceId:     resolvedResourceId || null,
            createdById:    admin?.user?.id || 'system',
            createdByBotId: botId || null,
            conversationId: conversationId || null,
            color:          '#10b981',
            notes:          `Tarih: ${date || '?'} | Saat: ${time || '?'}`,
        });

        if (!outcome.ok) {
            // Bu mesaj bota geri verilir, bot da müşteriye iletir.
            if (outcome.result === APPOINTMENT_RESULT.DISABLED) {
                console.log('🚫 [AppointmentBot] "Randevu Talebi Algılama" kapalı — randevu oluşturulmadı');
                return {
                    success: false,
                    reason: outcome.result,
                    message: 'Şu anda sistem üzerinden randevu oluşturamıyorum. Talebinizi ilgili ekibe iletiyorum, en kısa sürede size dönüş yapılacak.'
                };
            }
            if (outcome.result === APPOINTMENT_RESULT.CONFLICT) {
                console.log('⛔ [AppointmentBot] Seçilen saat dolu — randevu oluşturulmadı');
                return {
                    success: false,
                    reason: outcome.result,
                    message: 'Seçtiğiniz saat maalesef dolu. Başka bir gün veya saat önerebilir misiniz?'
                };
            }
            console.warn(`⚠️ [AppointmentBot] Randevu oluşturulamadı (${outcome.result}): ${outcome.message || ''}`);
            return {
                success: false,
                reason: outcome.result,
                message: 'Randevu oluştururken teknik bir sorun yaşadım. Kısa süre sonra tekrar deneyebilir miyiz?'
            };
        }

        const appointment = outcome.appointment;
        localAppointmentId = appointment.id;

        if (conversationId) {
            await prisma.conversation.update({
                where: { id: conversationId },
                data: { appointmentState: JSON.stringify({ step: 'COMPLETED', appointmentId: appointment.id }) }
            }).catch(() => {});
        }

    } catch (localErr) {
        console.error('❌ [AppointmentBot] Instomer DB kayıt hatası:', localErr.message);
    }

    // ── ADIM 2: Probel bağlıysa VE gerekli tokenlar varsa → Probel'e de gönder ──
    // probelHastaToken ve probelRandevuId fonksiyon başında (ADIM 1 öncesi) okundu.
    try {
        const hasConnection = await checkHealthConnection(workspaceId);
        if (hasConnection) {
            console.log(`🔑 [AppointmentBot] ADIM 2 — hasta_token: ${probelHastaToken || 'YOK'}, randevu_id: ${probelRandevuId || 'YOK'}`);

            // LOCAL_ token = hasta Probel'de kayıtlı değil → Probel'e gönderme
            const isRealProbelToken = probelHastaToken && !String(probelHastaToken).startsWith('LOCAL_');

            if (isRealProbelToken && probelRandevuId) {
                const { createAppointment } = await import('./probel_appointment.service.js');
                const probelResult = await createAppointment(workspaceId, probelHastaToken, probelRandevuId);
                if (probelResult.success) {
                    console.log('✅ [AppointmentBot] Probel HBYS randevusu da oluşturuldu');
                } else {
                    console.warn('⚠️ [AppointmentBot] Probel HBYS başarısız (non-critical):', probelResult.message);
                }
            } else if (!isRealProbelToken) {
                console.warn(`⚠️ [AppointmentBot] Probel atlandı — hasta sistemde kayıtlı değil (LOCAL token). Sadece Instomer DB'ye kaydedildi.`);
            } else {
                console.warn(`⚠️ [AppointmentBot] Probel atlandı — randevu_id: ${probelRandevuId || 'YOK'}`);
            }
        }
    } catch (probelErr) {
        console.warn('⚠️ [AppointmentBot] Probel adımı atlandı (non-critical):', probelErr.message);
    }


    // Her durumda success döndür — local DB kaydı yapıldı (veya hata loglandı)
    return {
        success: true,
        appointmentId: localAppointmentId,
        message: `Randevunuz başarıyla oluşturuldu! ✅\n\n📋 Randevu Detayları:\n👤 Hasta: ${args.patient_name || ''}\n🏥 Branş: ${args.branch || ''}\n👨‍⚕️ Doktor: ${args.doctor_name || ''}\n📅 Tarih: ${args.date || ''}\n🕐 Saat: ${args.time || ''}\n\nRandevunuz onaylanmıştır. İyi günler dileriz! 🙏`
    };
}



async function executeHandoffToHuman(workspaceId, conversationId, reason) {
    try {
        let targetAgentId = null;
        let contactName = 'Müşteri';

        if (conversationId) {
            // 1. Konuşmaya zaten atanmış agent var mı? (round-robin'den gelmişse bunu önce kullan)
            const conv = await prisma.conversation.findUnique({
                where: { id: conversationId },
                select: {
                    assignedToId: true,
                    teamIds: true,
                    contact: { select: { name: true } }
                }
            });
            targetAgentId = conv?.assignedToId || null;
            contactName   = conv?.contact?.name || 'Müşteri';

            // 2. Atanmış agent yoksa çevrimiiçi agent ara
            if (!targetAgentId) {
                const onlineMember = await prisma.workspaceMember.findFirst({
                    where: { workspaceId, user: { isOnline: true } },
                    include: { user: { select: { id: true } } }
                });
                targetAgentId = onlineMember?.user?.id || null;
            }

            // 3. Bot'u KAPAT ve handoff'u tamamla
            await prisma.conversation.update({
                where: { id: conversationId },
                data: {
                    appointmentState: null,
                    handoffPending: false,       // ai.controller tekrar işlemesin
                    botEnabled: false,           // Bot artık cevap vermesin
                    ...(targetAgentId && { assignedToId: targetAgentId })
                }
            });

            // 4. Agent'a veya takıma bildirim gönder
            try {
                const { createNotification, createTeamNotifications } = await import('../controllers/notification.controller.js');
                const notifTitle = `${contactName} — Devralma Gerekiyor`;
                const notifBody  = `Randevu botu yardım edemedi: ${reason}`;

                if (targetAgentId) {
                    await createNotification(workspaceId, targetAgentId, 'HANDOFF_NEEDED', notifTitle, notifBody, { conversationId });
                } else if (conv?.teamIds) {
                    const teamIds = JSON.parse(conv.teamIds || '[]');
                    if (teamIds.length > 0) {
                        await createTeamNotifications(workspaceId, teamIds[0], 'HANDOFF_NEEDED', notifTitle, notifBody, { conversationId });
                    }
                }
            } catch (notifErr) {
                console.warn('⚠️ [AppointmentBot] Handoff bildirimi gönderilemedi:', notifErr.message);
            }

            // 5. Socket: Inbox'ta konuşmayı güncelle
            try {
                const { emitToWorkspace } = await import('../socket.js');
                emitToWorkspace(workspaceId, 'bot_handoff', {
                    conversationId,
                    workspaceId,
                    assignedToId: targetAgentId,
                    reason,
                    botName: 'Randevu Asistanı'
                });
                emitToWorkspace(workspaceId, 'conversation_updated', { conversationId });
            } catch (socketErr) {
                console.warn('⚠️ [AppointmentBot] Socket emit hatası:', socketErr.message);
            }
        }

        console.log(`🔄 [AppointmentBot] Handoff tamamlandı: ${reason} | targetAgent: ${targetAgentId || 'yok'}`);

        const agentMsg = targetAgentId
            ? 'Müşteri temsilcimiz en kısa sürede size yardımcı olacaktır.'
            : 'Şu anda müsait temsilcimiz bulunmuyor, en kısa sürede dönüş yapacağız.';

        return {
            success: true,
            message: `${agentMsg} 🙏`
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
