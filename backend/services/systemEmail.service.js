import nodemailer from 'nodemailer';

// System email transporter using environment variables
let systemTransporter = null;

/**
 * Get or create the system email transporter
 */
const getSystemTransporter = () => {
    if (systemTransporter) return systemTransporter;

    const host = process.env.SYSTEM_EMAIL_HOST;
    const port = parseInt(process.env.SYSTEM_EMAIL_PORT) || 587;
    const user = process.env.SYSTEM_EMAIL_USER;
    const pass = process.env.SYSTEM_EMAIL_PASS;

    if (!host || !user || !pass) {
        console.error('❌ System email not configured. Missing SYSTEM_EMAIL_* environment variables.');
        return null;
    }

    systemTransporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass }
    });

    console.log('✅ System email transporter created:', user);
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
    const transporter = getSystemTransporter();
    if (!transporter) {
        throw new Error('System email not configured');
    }

    const fromAddress = process.env.SYSTEM_EMAIL_FROM || process.env.SYSTEM_EMAIL_USER;
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
    const transporter = getSystemTransporter();
    if (!transporter) {
        return { configured: false, error: 'Missing environment variables' };
    }

    try {
        await transporter.verify();
        return { configured: true, email: process.env.SYSTEM_EMAIL_USER };
    } catch (error) {
        return { configured: false, error: error.message };
    }
};
