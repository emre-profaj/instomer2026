import nodemailer from 'nodemailer';
import prisma from '../lib/prisma.js';
import { google } from 'googleapis';

/**
 * Send email via SMTP or Gmail OAuth
 * @param {string} emailChannelId - The email channel ID
 * @param {string} to - Recipient email
 * @param {string} subject - Email subject
 * @param {string} body - Email body (HTML or plain text)
 * @param {object} options - Additional options (isHtml, cc, bcc)
 */
export const sendEmailViaChannel = async (emailChannelId, to, subject, body, options = {}) => {
    const channel = await prisma.emailChannel.findUnique({
        where: { id: emailChannelId }
    });

    if (!channel) {
        throw new Error('Email channel not found');
    }

    if (channel.provider === 'SMTP') {
        // Use custom SMTP
        return await sendViaSMTP(channel, to, subject, body, options);
    } else {
        // Use Gmail OAuth
        return await sendViaGmail(channel, to, subject, body, options);
    }
};

/**
 * Send email via custom SMTP
 */
const sendViaSMTP = async (channel, to, subject, body, options = {}) => {
    const { isHtml = false, cc, bcc } = options;

    const transporter = nodemailer.createTransport({
        host: channel.smtpHost,
        port: channel.smtpPort || 587,
        secure: channel.smtpSecure,
        auth: {
            user: channel.smtpUser,
            pass: channel.smtpPass
        }
    });

    const mailOptions = {
        from: channel.email,
        to,
        subject,
        [isHtml ? 'html' : 'text']: body
    };

    if (cc) mailOptions.cc = cc;
    if (bcc) mailOptions.bcc = bcc;

    const result = await transporter.sendMail(mailOptions);
    console.log(`✅ [SMTP Email] Sent to ${to}: ${subject}`);
    return result;
};

/**
 * Send email via Gmail OAuth
 */
const sendViaGmail = async (channel, to, subject, body, options = {}) => {
    const { isHtml = false, cc, bcc } = options;

    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5001/api/email/google/callback'
    );

    oauth2Client.setCredentials({
        access_token: channel.accessToken,
        refresh_token: channel.refreshToken,
        expiry_date: channel.expiryDate ? Number(channel.expiryDate) : null
    });

    // Handle token refresh
    oauth2Client.on('tokens', async (tokens) => {
        await prisma.emailChannel.update({
            where: { id: channel.id },
            data: {
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token || channel.refreshToken,
                expiryDate: tokens.expiry_date ? BigInt(tokens.expiry_date) : undefined
            }
        });
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Build email message
    const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
    const contentType = isHtml ? 'text/html' : 'text/plain';

    const messageParts = [
        `From: ${channel.email}`,
        `To: ${to}`,
    ];

    if (cc) messageParts.push(`Cc: ${cc}`);
    if (bcc) messageParts.push(`Bcc: ${bcc}`);

    messageParts.push(
        `Content-Type: ${contentType}; charset=utf-8`,
        `MIME-Version: 1.0`,
        `Subject: ${utf8Subject}`,
        '',
        body
    );

    const message = messageParts.join('\n');
    const encodedMessage = Buffer.from(message)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

    await gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw: encodedMessage }
    });

    console.log(`✅ [Gmail] Sent to ${to}: ${subject}`);
};

/**
 * Replace dynamic placeholders in email content
 * @param {string} content - Email content with placeholders
 * @param {object} data - Data to replace placeholders (name, phone, email, etc.)
 * @returns {string} - Content with replaced placeholders
 */
export const replacePlaceholders = (content, data) => {
    if (!content) return content;

    let result = content;

    // Replace common placeholders
    if (data.name) result = result.replace(/\{\{name\}\}/gi, data.name);
    if (data.phone) result = result.replace(/\{\{phone\}\}/gi, data.phone);
    if (data.email) result = result.replace(/\{\{email\}\}/gi, data.email);

    // Replace any additional fields
    for (const [key, value] of Object.entries(data)) {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'gi');
        result = result.replace(regex, value || '');
    }

    return result;
};
