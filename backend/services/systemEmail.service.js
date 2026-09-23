import nodemailer from 'nodemailer';
import prisma from '../lib/prisma.js';
import { decrypt } from '../utils/encryption.js';

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

    const dbPass = db?.systemEmailPass ? (decrypt(db.systemEmailPass) || null) : null;
    if (db?.systemEmailHost && db?.systemEmailUser && dbPass) {
        return {
            kaynak: 'panel',
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
    const transporter = await getSystemTransporter();
    if (!transporter) {
        throw new Error('System email not configured');
    }

    const cfg = await getSystemEmailConfig();
    const fromAddress = cfg?.from;
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
        console.log(`📧 [SystemEmail] Sent to ${recipients}: ${subject}`);
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
