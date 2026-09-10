/**
 * NetGSM SMS Service — REST v2 API
 * ──────────────────────────────────
 * NetGSM REST v2 API üzerinden SMS gönderir.
 * 
 * Workspace config: { username, password, msgHeader, enabled }
 * Auth: HTTP Basic (Base64)
 * 
 * Endpoints:
 *   POST https://api.netgsm.com.tr/sms/rest/v2/send  → Standart/toplu SMS
 *   POST https://api.netgsm.com.tr/sms/rest/v2/otp   → OTP/tek SMS
 * 
 * Yanıt: { code: '00', jobid: '...', description: 'Success' }
 * 
 * Hata Kodları:
 *   00 = Başarılı     30 = Geçersiz kimlik   40 = Başlık tanımsız
 *   50 = Abonelik hata  70 = Parametre hata   80 = Rate limit
 *   85 = Mükerrer koruma
 */

const BASE_URL = 'https://api.netgsm.com.tr';

// ─── Auth Header ───────────────────────────────────────────
function getAuthHeader(config) {
    const token = Buffer.from(`${config.username}:${config.password}`).toString('base64');
    return `Basic ${token}`;
}

// ─── Tek SMS Gönder ────────────────────────────────────────
export async function sendSms(config, phone, message, options = {}) {
    if (!config?.username || !config?.password) {
        throw new Error('NetGSM config eksik (username/password)');
    }
    if (!config.enabled) {
        console.log('ℹ️ [NETGSM] SMS gönderim kapalı');
        return { success: false, reason: 'disabled' };
    }

    const cleanPhone = normalizePhone(phone);
    if (!cleanPhone) {
        throw new Error(`Geçersiz telefon numarası: ${phone}`);
    }

    // OTP modu — hızlı tek SMS (doğrulama kodu vb.)
    if (options.isOtp) {
        return sendOtp(config, cleanPhone, message);
    }

    const body = {
        msgheader: config.msgHeader || 'INSTOMER',
        messages: [{ no: cleanPhone, msg: message }],
        encoding: 'TR',
        iysfilter: '0', // Bilgilendirme mesajı
    };

    try {
        const res = await fetch(`${BASE_URL}/sms/rest/v2/send`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': getAuthHeader(config),
            },
            body: JSON.stringify(body),
        });

        const data = await res.json();

        if (data.code === '00') {
            console.log(`✅ [NETGSM] SMS gönderildi → ${cleanPhone} (jobId: ${data.jobid})`);
            return { success: true, jobId: data.jobid, code: data.code };
        }

        const errorMsg = getErrorMessage(data.code);
        console.error(`❌ [NETGSM] SMS hatası → ${cleanPhone}: ${errorMsg} (${data.description})`);
        return { success: false, code: data.code, error: errorMsg, description: data.description };

    } catch (err) {
        console.error(`❌ [NETGSM] Network hatası:`, err.message);
        throw err;
    }
}

// ─── OTP (Hızlı Tek SMS) ──────────────────────────────────
async function sendOtp(config, phone, message) {
    const body = {
        msgheader: config.msgHeader || 'INSTOMER',
        msg: message,
        no: phone,
    };

    const res = await fetch(`${BASE_URL}/sms/rest/v2/otp`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': getAuthHeader(config),
        },
        body: JSON.stringify(body),
    });

    const data = await res.json();

    if (data.code === '00') {
        console.log(`✅ [NETGSM] OTP SMS gönderildi → ${phone} (jobId: ${data.jobid})`);
        return { success: true, jobId: data.jobid, code: data.code };
    }

    throw new Error(`NetGSM OTP hatası [${data.code}]: ${data.description}`);
}

// ─── Toplu SMS Gönder ──────────────────────────────────────
export async function sendBulkSms(config, recipients, message) {
    if (!config?.enabled) {
        return { success: false, reason: 'disabled' };
    }
    if (!config?.username || !config?.password) {
        throw new Error('NetGSM config eksik');
    }

    // REST v2 tek request'te toplu gönderim destekler
    // Rate limit: 60 req/dakika — batch'lere bölüyoruz
    const batchSize = 500; // Tek request'te max alıcı
    const results = [];

    for (let i = 0; i < recipients.length; i += batchSize) {
        const batch = recipients.slice(i, i + batchSize);
        const messages = batch
            .map(r => {
                const phone = normalizePhone(r.phone || r);
                return phone ? { no: phone, msg: message } : null;
            })
            .filter(Boolean);

        if (messages.length === 0) continue;

        try {
            const res = await fetch(`${BASE_URL}/sms/rest/v2/send`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': getAuthHeader(config),
                },
                body: JSON.stringify({
                    msgheader: config.msgHeader || 'INSTOMER',
                    messages,
                    encoding: 'TR',
                    iysfilter: '0',
                }),
            });

            const data = await res.json();
            results.push({
                batch: Math.floor(i / batchSize) + 1,
                count: messages.length,
                success: data.code === '00',
                code: data.code,
                jobId: data.jobid,
            });
        } catch (err) {
            results.push({
                batch: Math.floor(i / batchSize) + 1,
                count: messages.length,
                success: false,
                error: err.message,
            });
        }

        // Rate limit koruma — batch arası 1sn bekle
        if (i + batchSize < recipients.length) {
            await new Promise(r => setTimeout(r, 1000));
        }
    }

    const totalSent = results.filter(r => r.success).reduce((sum, r) => sum + r.count, 0);
    console.log(`📱 [NETGSM] Toplu SMS: ${totalSent}/${recipients.length} başarılı`);

    return { success: true, totalSent, totalFailed: recipients.length - totalSent, results };
}

// ─── Bakiye Sorgula ────────────────────────────────────────
export async function checkBalance(config) {
    if (!config?.username || !config?.password) {
        throw new Error('NetGSM config eksik');
    }

    try {
        const params = new URLSearchParams({
            usercode: config.username,
            password: config.password,
            stip: '1', // SMS bakiye
        });

        const res = await fetch(`https://api.netgsm.com.tr/balance/list/get?${params.toString()}`);
        const body = await res.text();
        const parts = body.trim().split(' ');

        if (parts[0] === '00') {
            return { success: true, balance: parseFloat(parts[1]) || 0 };
        }

        return { success: false, error: body.trim() };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

// ─── Hata Mesajları ────────────────────────────────────────
function getErrorMessage(code) {
    const messages = {
        '20': 'Geçersiz mesaj metni veya uzunluk aşımı',
        '30': 'Geçersiz kullanıcı/şifre veya API erişim izni yok',
        '40': 'Mesaj başlığı (msgheader) tanımlı değil',
        '50': 'Geçersiz tarih formatı veya İYS engeli',
        '51': 'Yetkisiz işlem veya yetersiz bakiye',
        '60': 'Mesaj metni boş',
        '70': 'Hatalı veya eksik parametreler',
        '80': 'Rate limit aşıldı (max 60 istek/dakika)',
        '85': 'Mükerrer gönderim koruması (aynı numaraya 1 saat içinde aynı mesaj)'
    };
    return messages[code] || `Bilinmeyen hata (kod: ${code})`;
}

// ─── Telefon Numarası Normalizasyon ────────────────────────
function normalizePhone(phone) {
    if (!phone) return null;
    let digits = phone.replace(/[^0-9]/g, '');

    // Türkiye numaraları
    if (digits.startsWith('90') && digits.length === 12) {
        return digits.slice(2); // 905551234567 → 5551234567 (NetGSM 10 hane ister)
    }
    if (digits.startsWith('0') && digits.length === 11) {
        return digits.slice(1); // 05551234567 → 5551234567
    }
    if (digits.length === 10 && digits.startsWith('5')) {
        return digits; // 5551234567 — doğru format
    }

    // Uluslararası: 00 prefix ile
    if (digits.length >= 10) {
        if (!digits.startsWith('00') && !digits.startsWith('5')) {
            return '00' + digits;
        }
        return digits;
    }

    return null;
}

export default { sendSms, sendBulkSms, checkBalance };
