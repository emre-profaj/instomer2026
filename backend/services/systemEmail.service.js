import nodemailer from 'nodemailer';
import axios from 'axios';
import prisma from '../lib/prisma.js';
import { decrypt } from '../utils/encryption.js';

const BREVO_API = 'https://api.brevo.com/v3';

// ─── Mükerrer gönderim koruması ──────────────────────────────
// Bildirimler kullanıcı bazlı üretiliyor ve bu doğru: her kullanıcının
// kendi alıcı listesi olabilir. Ama iki kullanıcı AYNI adresi yazdıysa
// o adres aynı olay için iki özdeş mail alıyordu (Rotowash'ta iki OWNER
// da teklif@ yazmıştı). Kişi bazlı gönderimi bozmadan, aynı olay için
// aynı adrese ikinci kopyayı atlıyoruz.
const GONDERIM_IZLERI = new Map();   // "olayAnahtari|adres" -> zaman
const IZ_OMRU_MS = 3 * 60 * 1000;

function izleriTemizle() {
    const simdi = Date.now();
    for (const [k, t] of GONDERIM_IZLERI) {
        if (simdi - t > IZ_OMRU_MS) GONDERIM_IZLERI.delete(k);
    }
}

// Sistem e-postası göndericisi.
// Kaynak sırası: önce veritabanı (süper admin paneli), sonra .env.
// Panelden girilebilmesinin sebebi: sunucuda SYSTEM_EMAIL_* hiç tanımlı
// değildi ve her bildirim denemesi sessizce düşüyordu (binlerce kez).
let systemTransporter = null;
let sonAyarImzasi = null;

/** Panelde kayıtlı ayarı okur; yoksa .env'e düşer. */
export const getSystemEmailConfig = async () => {
    let db = null;
    try {
        db = await prisma.globalSettings.findUnique({ where: { id: 'singleton' } });
    } catch (err) {
        console.error('[SystemEmail] Ayar okunamadı:', err.message);
    }

    // Brevo API modu: SMTP yerine HTTP. Tek anahtar + gönderen adı/adresi.
    const dbApiKey = db?.systemEmailApiKey ? (decrypt(db.systemEmailApiKey) || null) : null;
    if (db?.systemEmailProvider === 'BREVO_API' && dbApiKey && db?.systemEmailUser) {
        return {
            kaynak: 'panel',
            yontem: 'BREVO_API',
            apiKey: dbApiKey,
            senderEmail: db.systemEmailUser,
            senderName: db.systemEmailSenderName || 'Instomer',
            user: db.systemEmailUser
        };
    }

    const dbPass = db?.systemEmailPass ? (decrypt(db.systemEmailPass) || null) : null;
    if (db?.systemEmailHost && db?.systemEmailUser && dbPass) {
        return {
            kaynak: 'panel',
            yontem: 'SMTP',
            host: db.systemEmailHost,
            port: db.systemEmailPort || 587,
            user: db.systemEmailUser,
            pass: dbPass,
            from: db.systemEmailFrom || db.systemEmailUser
        };
    }

    const host = process.env.SYSTEM_EMAIL_HOST;
    const user = process.env.SYSTEM_EMAIL_USER;
    const pass = process.env.SYSTEM_EMAIL_PASS;
    if (host && user && pass) {
        return {
            kaynak: 'env',
            yontem: 'SMTP',
            host,
            port: parseInt(process.env.SYSTEM_EMAIL_PORT) || 587,
            user,
            pass,
            from: process.env.SYSTEM_EMAIL_FROM || user
        };
    }
    return null;
};

/** Ayar değiştiğinde bağlantıyı yeniden kurmak için. */
export const resetSystemTransporter = () => {
    systemTransporter = null;
    sonAyarImzasi = null;
};

const getSystemTransporter = async () => {
    const cfg = await getSystemEmailConfig();
    if (cfg?.yontem === 'BREVO_API') return null;   // SMTP bağlantısı kurulmaz
    if (!cfg) {
        console.error('❌ System email not configured. Süper admin panelinden veya SYSTEM_EMAIL_* ile tanımlayın.');
        return null;
    }

    // Ayar değiştiyse eski bağlantıyı bırak
    const imza = `${cfg.host}|${cfg.port}|${cfg.user}|${cfg.pass.length}`;
    if (systemTransporter && imza === sonAyarImzasi) return systemTransporter;

    systemTransporter = nodemailer.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.port === 465,
        auth: { user: cfg.user, pass: cfg.pass }
    });
    sonAyarImzasi = imza;

    console.log(`✅ System email transporter created (${cfg.kaynak}):`, cfg.user);
    return systemTransporter;
};

/**
 * Send system email
 * @param {string|string[]} to - Recipient email(s)
 * @param {string} subject - Email subject
 * @param {string} body - Email body (HTML supported)
 * @param {Object} options - Additional options
 */
export const sendSystemEmail = async (to, subject, body, options = {}) => {
    const cfgOn = await getSystemEmailConfig();

    // Aynı olay için aynı adrese ikinci kez gönderme
    let aliciListesi = Array.isArray(to) ? to.slice() : String(to || '').split(/[,;]+/);
    aliciListesi = aliciListesi.map(e => String(e).trim()).filter(e => e.includes('@'));

    if (options.dedupeKey) {
        izleriTemizle();
        const kalan = [];
        const atlanan = [];
        for (const adres of aliciListesi) {
            const anahtar = `${options.dedupeKey}|${adres.toLowerCase()}`;
            if (GONDERIM_IZLERI.has(anahtar)) atlanan.push(adres);
            else { GONDERIM_IZLERI.set(anahtar, Date.now()); kalan.push(adres); }
        }
        if (atlanan.length > 0) {
            console.log(`↩️ [SystemEmail] Mükerrer atlandı (${subject}): ${atlanan.join(', ')}`);
        }
        if (kalan.length === 0) return null;
        aliciListesi = kalan;
    }
    to = aliciListesi;

    // ── Brevo API (HTTP) ──
    if (cfgOn?.yontem === 'BREVO_API') {
        const aliciDizi = (Array.isArray(to) ? to : String(to).split(/[,;]+/))
            .map(e => String(e).trim())
            .filter(e => e.includes('@'))
            .map(email => ({ email }));
        if (aliciDizi.length === 0) throw new Error('Geçerli alıcı adresi yok.');

        try {
            const res = await axios.post(`${BREVO_API}/smtp/email`, {
                sender: { name: cfgOn.senderName, email: cfgOn.senderEmail },
                to: aliciDizi,
                subject,
                htmlContent: body
            }, {
                headers: { 'api-key': cfgOn.apiKey, accept: 'application/json', 'content-type': 'application/json' },
                timeout: 20000
            });
            console.log(`📧 [SystemEmail/Brevo] ${subject} | alıcı: ${aliciDizi.map(a => a.email).join(', ')}`
                + ` | messageId: ${res.data?.messageId || '-'}`);
            return res.data;
        } catch (error) {
            // Brevo hatayı gövdede açıklıyor; "İstek başarısız" demek yetmiyor.
            const detay = error.response?.data?.message || error.response?.data?.code || error.message;
            console.error('❌ [SystemEmail/Brevo] Gönderilemedi:', detay);
            throw new Error(detay);
        }
    }

    const transporter = await getSystemTransporter();
    if (!transporter) {
        throw new Error('System email not configured');
    }

    const cfg = cfgOn;
    // "Görünen gönderici" alanına yalnızca isim yazılabiliyor ("Instomer
    // Bildirim"). İçinde adres yoksa geçerli bir From başlığı olmaz;
    // sunucular ya reddeder ya sessizce kendi adresiyle değiştirir.
    let fromAddress = cfg?.from || cfg?.user;
    if (fromAddress && !fromAddress.includes('@')) {
        fromAddress = `"${fromAddress.replace(/"/g, '')}" <${cfg.user}>`;
    }
    const recipients = Array.isArray(to) ? to.join(', ') : to;

    const mailOptions = {
        from: fromAddress,
        to: recipients,
        subject,
        html: body,
        ...options
    };

    try {
        const result = await transporter.sendMail(mailOptions);
        // Sunucunun yanıtını da yazıyoruz: "gönderildi" demek yetmiyor,
        // kabul edilen/reddedilen alıcıyı ve SMTP cevabını görmek gerekiyor.
        console.log(
            `📧 [SystemEmail] ${subject} | kabul: ${(result.accepted || []).join(', ') || '-'}`
            + ` | ret: ${(result.rejected || []).join(', ') || '-'}`
            + ` | sunucu: ${result.response || '-'}`
        );
        return result;
    } catch (error) {
        console.error('❌ [SystemEmail] Send error:', error);
        throw error;
    }
};

/**
 * Send email to all workspace owners
 * @param {Object} prisma - Prisma client
 * @param {string} subject - Email subject  
 * @param {string} body - Email body (HTML)
 * @param {Object} options - Filter options (e.g., specific workspaceIds)
 */
export const sendToAllWorkspaces = async (prisma, subject, body, options = {}) => {
    try {
        // Get all workspace owners
        const workspaces = await prisma.workspace.findMany({
            where: options.workspaceIds ? { id: { in: options.workspaceIds } } : {},
            include: {
                members: {
                    where: { role: 'OWNER' },
                    include: {
                        user: { select: { email: true, name: true } }
                    }
                }
            }
        });

        const results = [];
        for (const workspace of workspaces) {
            for (const member of workspace.members) {
                if (member.user?.email) {
                    try {
                        // Replace placeholders
                        const personalizedBody = body
                            .replace(/\{\{name\}\}/g, member.user.name || '')
                            .replace(/\{\{workspace\}\}/g, workspace.name || '')
                            .replace(/\{\{email\}\}/g, member.user.email || '');

                        await sendSystemEmail(member.user.email, subject, personalizedBody);
                        results.push({ email: member.user.email, success: true });
                    } catch (err) {
                        results.push({ email: member.user.email, success: false, error: err.message });
                    }
                }
            }
        }

        console.log(`📧 [SystemEmail] Sent to ${results.filter(r => r.success).length}/${results.length} workspaces`);
        return results;
    } catch (error) {
        console.error('❌ [SystemEmail] Bulk send error:', error);
        throw error;
    }
};

/**
 * Verify system email configuration
 */
export const verifySystemEmail = async () => {
    const cfg = await getSystemEmailConfig();
    if (!cfg) {
        return { configured: false, error: 'Gönderici tanımlı değil. Süper admin panelinden girin.' };
    }

    if (cfg.yontem === 'BREVO_API') {
        try {
            const res = await axios.get(`${BREVO_API}/account`, {
                headers: { 'api-key': cfg.apiKey, accept: 'application/json' },
                timeout: 15000
            });
            return {
                configured: true,
                email: cfg.senderEmail,
                from: `${cfg.senderName} <${cfg.senderEmail}>`,
                kaynak: cfg.kaynak,
                yontem: 'Brevo API',
                hesap: res.data?.companyName || res.data?.email || null
            };
        } catch (error) {
            const detay = error.response?.status === 401
                ? 'API anahtarı kabul edilmedi.'
                : (error.response?.data?.message || error.message);
            return { configured: false, email: cfg.senderEmail, yontem: 'Brevo API', error: detay };
        }
    }
    const transporter = await getSystemTransporter();
    if (!transporter) {
        return { configured: false, error: 'Bağlantı kurulamadı.' };
    }

    try {
        await transporter.verify();
        return { configured: true, email: cfg.user, from: cfg.from, kaynak: cfg.kaynak };
    } catch (error) {
        return { configured: false, email: cfg.user, kaynak: cfg.kaynak, error: error.message };
    }
};
