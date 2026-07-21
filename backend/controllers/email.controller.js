import { google } from 'googleapis';
import prisma from '../lib/prisma.js';
import { assignDefaultFunnel } from '../services/conversationRouting.service.js';


// Helper function to decode HTML entities
const decodeHtmlEntities = (text) => {
    if (!text) return '';

    let decoded = text;

    // Replace common named entities
    decoded = decoded.replace(/&amp;/gi, '&');
    decoded = decoded.replace(/&lt;/gi, '<');
    decoded = decoded.replace(/&gt;/gi, '>');
    decoded = decoded.replace(/&quot;/gi, '"');
    decoded = decoded.replace(/&apos;/gi, "'");
    decoded = decoded.replace(/&nbsp;/gi, ' ');
    decoded = decoded.replace(/&hellip;/gi, '...');
    decoded = decoded.replace(/&mdash;/gi, '-');
    decoded = decoded.replace(/&ndash;/gi, '-');
    decoded = decoded.replace(/&bull;/gi, '*');

    // Replace numeric entities (&#34; &#123; etc.)
    decoded = decoded.replace(/&#(\d+);/g, function (match, num) {
        return String.fromCharCode(parseInt(num, 10));
    });

    // Replace hex entities (&#x22; etc.)
    decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, function (match, hex) {
        return String.fromCharCode(parseInt(hex, 16));
    });

    return decoded;
};

// Helper function to convert HTML to clean text
const htmlToText = (html) => {
    if (!html) return '';

    let text = html;

    // Replace <br>, <p>, <div> with newlines
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<\/p>/gi, '\n\n');
    text = text.replace(/<\/div>/gi, '\n');
    text = text.replace(/<\/li>/gi, '\n');
    text = text.replace(/<li[^>]*>/gi, '• ');

    // Remove style and script content
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');

    // Remove all HTML tags
    text = text.replace(/<[^>]*>/g, '');

    // Decode HTML entities
    text = decodeHtmlEntities(text);

    // Normalize whitespace
    text = text.replace(/[ \t]+/g, ' '); // Multiple spaces/tabs to single space
    text = text.replace(/\n\s*\n\s*\n/g, '\n\n'); // Max 2 consecutive newlines

    return text.trim();
};

// Helper function to extract email body from Gmail payload
// Returns { html: string, text: string } - prefer HTML for display, text for preview
const extractEmailBody = (payload) => {
    let htmlBody = '';
    let textBody = '';

    // Check if the email has parts (multipart)
    if (payload.parts) {
        for (const part of payload.parts) {
            if (part.mimeType === 'text/plain' && part.body?.data) {
                textBody = Buffer.from(part.body.data, 'base64').toString('utf-8');
            } else if (part.mimeType === 'text/html' && part.body?.data) {
                htmlBody = Buffer.from(part.body.data, 'base64').toString('utf-8');
            } else if (part.parts) {
                // Nested multipart
                const nested = extractEmailBody(part);
                if (nested.html) htmlBody = nested.html;
                if (nested.text) textBody = nested.text;
            }
        }
    } else if (payload.body?.data) {
        // Simple email without parts
        const content = Buffer.from(payload.body.data, 'base64').toString('utf-8');

        if (payload.mimeType === 'text/html') {
            htmlBody = content;
        } else {
            textBody = content;
        }
    }

    // If we have HTML, use it; otherwise use text
    // Return HTML for proper display, with text fallback
    if (htmlBody) {
        return { html: htmlBody, text: textBody || htmlToText(htmlBody) };
    }

    return { html: '', text: decodeHtmlEntities(textBody) };
};

// Helper function to clean email body - remove footers and signatures
const cleanEmailBody = (body) => {
    if (!body) return '';

    // Common footer/signature patterns to remove
    const footerPatterns = [
        // English patterns
        /This email may be confidential[\s\S]*$/i,
        /This e-mail may be confidential[\s\S]*$/i,
        /This message is intended only[\s\S]*$/i,
        /CONFIDENTIALITY NOTICE[\s\S]*$/i,
        /DISCLAIMER[\s\S]*$/i,
        /This email and any attachments[\s\S]*$/i,
        /If you received this email in error[\s\S]*$/i,
        /If you are not the intended recipient[\s\S]*$/i,
        // Turkish patterns
        /Bu e-posta gizli veya özel olabilir[\s\S]*$/i,
        /Bu e-posta ve ekleri[\s\S]*$/i,
        /Bu mesaj yalnızca[\s\S]*$/i,
        /Gizlilik Bildirimi[\s\S]*$/i,
        /Bu ileti ve ekleri[\s\S]*$/i,
        // Common separators before signatures
        /^--\s*$/m,
        /^___+\s*$/m,
        /^---+\s*$/m,
        // "Sent from" patterns
        /Sent from my iPhone[\s\S]*$/i,
        /Sent from my Android[\s\S]*$/i,
        /Sent from Mail for Windows[\s\S]*$/i,
        // Quote patterns (previous messages)
        /^On .+ wrote:[\s\S]*$/m,
        /^>.*$/gm, // Quote lines starting with >
    ];

    let cleanedBody = body;

    for (const pattern of footerPatterns) {
        cleanedBody = cleanedBody.replace(pattern, '');
    }

    // Trim and normalize whitespace
    cleanedBody = cleanedBody.trim();

    // Remove excessive newlines
    cleanedBody = cleanedBody.replace(/\n{3,}/g, '\n\n');

    return cleanedBody;
};

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5001/api/email/google/callback'
);

// Scopes for Gmail access
const SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile'
];

export const googleConnect = async (req, res) => {
    try {
        const { workspaceId } = req.query;
        if (!workspaceId) {
            return res.status(400).json({ error: 'workspaceId is required' });
        }

        const url = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES,
            state: workspaceId,
            prompt: 'consent' // Force to get refresh token
        });

        res.json({ url });
    } catch (error) {
        console.error('Error generating Google OAuth URL:', error);
        res.status(500).json({ error: 'Failed to generate OAuth URL' });
    }
};

export const googleCallback = async (req, res) => {
    try {
        const { code, state: workspaceId } = req.query;

        if (!code) {
            return res.status(400).json({ error: 'Code is required' });
        }

        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        // Get user profile to get email address
        const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
        const userInfo = await oauth2.userinfo.get();
        const userEmail = userInfo.data.email;

        // Save or update EmailChannel
        // Set lastSyncAt to now so we don't fetch old emails (both create and update)
        const emailChannel = await prisma.emailChannel.upsert({
            where: { email: userEmail },
            update: {
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token || undefined,
                expiryDate: tokens.expiry_date ? BigInt(tokens.expiry_date) : undefined,
                isActive: true,
                workspaceId: workspaceId,
                lastSyncAt: new Date() // Reset sync time on reconnect - don't fetch old emails
            },
            create: {
                email: userEmail,
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token,
                expiryDate: tokens.expiry_date ? BigInt(tokens.expiry_date) : undefined,
                workspaceId: workspaceId,
                provider: 'GMAIL',
                lastSyncAt: new Date() // Set to now - don't fetch old emails
            }
        });

        // Redirect back to frontend
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        res.redirect(`${frontendUrl}/channels?success=true&channel=email&email=${userEmail}`);
    } catch (error) {
        console.error('Error in Google OAuth Callback:', error);
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        res.redirect(`${frontendUrl}/channels?success=false&error=oauth_failed`);
    }
};

export const listEmailChannels = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const channels = await prisma.emailChannel.findMany({
            where: { workspaceId },
            select: {
                id: true,
                email: true,
                provider: true,
                isActive: true,
                lastSyncAt: true,
                assignedBotId: true
            }
        });
        res.json({ emailChannels: channels });
    } catch (error) {
        res.status(500).json({ error: 'Failed to list email channels' });
    }
};

export const updateEmailBot = async (req, res) => {
    try {
        const { id } = req.params;
        const { assignedBotId } = req.body;

        console.log(`📧 [updateEmailBot] ID: ${id}, BotId: ${assignedBotId}`);

        // Verify the email channel exists
        const existingChannel = await prisma.emailChannel.findUnique({
            where: { id }
        });

        if (!existingChannel) {
            console.error(`❌ [updateEmailBot] Channel not found: ${id}`);
            return res.status(404).json({ error: 'E-posta kanalı bulunamadı' });
        }

        // If botId is provided, verify it exists and belongs to the same workspace
        if (assignedBotId) {
            const bot = await prisma.aIBot.findUnique({
                where: { id: assignedBotId }
            });
            if (!bot) {
                console.error(`❌ [updateEmailBot] Bot not found: ${assignedBotId}`);
                return res.status(404).json({ error: 'Bot bulunamadı' });
            }
            // Verify bot and channel are in the same workspace
            if (bot.workspaceId !== existingChannel.workspaceId) {
                console.error(`❌ [updateEmailBot] Workspace mismatch - Bot: ${bot.workspaceId}, Channel: ${existingChannel.workspaceId}`);
                return res.status(400).json({ error: 'Bot farklı bir workspace\'e ait' });
            }

            // Automatically activate the bot when assigned
            await prisma.aIBot.update({
                where: { id: assignedBotId },
                data: { isActive: true }
            });
            console.log(`✅ Bot ${assignedBotId} automatically activated (assigned to Email channel)`);
        }

        const channel = await prisma.emailChannel.update({
            where: { id },
            data: { assignedBotId: assignedBotId || null }
        });

        // Propagation: Update all OPEN conversations for this email channel
        await prisma.conversation.updateMany({
            where: {
                emailChannelId: channel.id,
                status: 'OPEN'
            },
            data: {
                assignedBotId: assignedBotId || null
            }
        });

        console.log(`✅ [updateEmailBot] Success - Channel: ${channel.email}, Bot: ${assignedBotId || 'null'}`);

        // Convert BigInt to string for JSON serialization
        const responseChannel = {
            ...channel,
            expiryDate: channel.expiryDate ? channel.expiryDate.toString() : null
        };
        res.json({ emailChannel: responseChannel });
    } catch (error) {
        console.error('❌ [updateEmailBot] Error:', error);
        res.status(500).json({ error: 'Bot atanamadı: ' + error.message });
    }
};

const getGmailClient = async (emailChannelId) => {
    const channel = await prisma.emailChannel.findUnique({
        where: { id: emailChannelId }
    });

    if (!channel) throw new Error('Channel not found');

    const auth = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5001/api/email/google/callback'
    );

    auth.setCredentials({
        access_token: channel.accessToken,
        refresh_token: channel.refreshToken,
        expiry_date: channel.expiryDate ? Number(channel.expiryDate) : null
    });

    // Handle token refresh automatically
    auth.on('tokens', async (tokens) => {
        if (tokens.refresh_token) {
            await prisma.emailChannel.update({
                where: { id: channel.id },
                data: {
                    accessToken: tokens.access_token,
                    refreshToken: tokens.refresh_token,
                    expiryDate: tokens.expiry_date ? BigInt(tokens.expiry_date) : undefined
                }
            });
        } else {
            await prisma.emailChannel.update({
                where: { id: channel.id },
                data: {
                    accessToken: tokens.access_token,
                    expiryDate: tokens.expiry_date ? BigInt(tokens.expiry_date) : undefined
                }
            });
        }
    });

    return google.gmail({ version: 'v1', auth });
};

// Internal sync function (called by polling, no req/res)
export const syncEmailsInternal = async (channelId) => {
    try {
        const gmail = await getGmailClient(channelId);
        const channel = await prisma.emailChannel.findUnique({ where: { id: channelId } });

        if (!channel) {
            console.log(`⚠️ [Email Sync] Channel ${channelId} not found`);
            return { success: false, error: 'Channel not found' };
        }

        // Calculate time filter - only get emails from last sync time
        let afterDate;
        if (channel.lastSyncAt) {
            afterDate = Math.floor(new Date(channel.lastSyncAt).getTime() / 1000);
        } else {
            afterDate = Math.floor(Date.now() / 1000);
            await prisma.emailChannel.update({
                where: { id: channelId },
                data: { lastSyncAt: new Date() }
            });
        }

        // Fetch only new messages from inbox
        const response = await gmail.users.messages.list({
            userId: 'me',
            maxResults: 20,
            q: `label:INBOX after:${afterDate}`
        });

        const messages = response.data.messages || [];

        if (messages.length > 0) {
            console.log(`📧 [${channel.email}] Found ${messages.length} new emails`);
        }

        let newCount = 0;
        const { emitToWorkspace } = await import('../socket.js');

        for (const msg of messages) {
            // Check if we already have this message
            const existingMsg = await prisma.message.findUnique({
                where: { emailMessageId: msg.id }
            });
            if (existingMsg) continue;

            // Get full message details
            const detail = await gmail.users.messages.get({
                userId: 'me',
                id: msg.id
            });

            const headers = detail.data.payload.headers;
            const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
            const from = headers.find(h => h.name === 'From')?.value || '';
            const fromEmail = from.match(/<(.+)>/)?.[1] || from;
            const fromName = from.split('<')[0].trim().replace(/"/g, '') || fromEmail;

            // Get email body content
            const emailBody = extractEmailBody(detail.data.payload);
            let body = emailBody.html || cleanEmailBody(emailBody.text);

            // Avatar fallback
            const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(fromName)}&background=ef4444&color=fff&size=150`;

            // 1. Find or create Contact for this workspace
            let contact = await prisma.contact.findFirst({
                where: {
                    email: fromEmail,
                    workspaceId: channel.workspaceId
                }
            });
            if (!contact) {
                contact = await prisma.contact.create({
                    data: {
                        workspaceId: channel.workspaceId,
                        email: fromEmail,
                        name: fromName,
                        avatar: avatarUrl
                    }
                });
            } else if (!contact.avatar) {
                // Update avatar if missing
                await prisma.contact.update({
                    where: { id: contact.id },
                    data: { avatar: avatarUrl }
                });
            }

            // 2. Find or create Conversation
            let conversation = await prisma.conversation.findFirst({
                where: {
                    contactId: contact.id,
                    emailChannelId: channelId
                },
                orderBy: { lastMessageAt: 'desc' }
            });

            // 24 saat birleştirme: Aynı contact için herhangi bir kanaldan son 24 saatte açık konuşma ara
            if (!conversation) {
                const mergeWindow = new Date(Date.now() - 24 * 60 * 60 * 1000);
                conversation = await prisma.conversation.findFirst({
                    where: {
                        contactId: contact.id,
                        workspaceId: channel.workspaceId,
                        lastMessageAt: { gte: mergeWindow },
                        status: { not: 'RESOLVED' }
                    },
                    orderBy: { lastMessageAt: 'desc' }
                });
                if (conversation) {
                    console.log(`🔗 [Email Merge] Reusing existing ${conversation.channel} conversation ${conversation.id} (within 24h)`);
                    // Email bilgilerini güncelle
                    if (!conversation.emailChannelId) {
                        conversation = await prisma.conversation.update({
                            where: { id: conversation.id },
                            data: { emailChannelId: channelId }
                        });
                    }
                }
            }

            if (!conversation) {
                conversation = await prisma.conversation.create({
                    data: {
                        contactId: contact.id,
                        workspaceId: channel.workspaceId,
                        emailChannelId: channelId,
                        channel: 'EMAIL',
                        status: 'OPEN',
                        assignedBotId: channel.assignedBotId
                    }
                });
                assignDefaultFunnel(channel.workspaceId, conversation.id).catch(e => console.error('❌ [AutoFunnel] Email error:', e.message));
            } else if (conversation.status === 'RESOLVED') {
                conversation = await prisma.conversation.update({
                    where: { id: conversation.id },
                    data: { status: 'OPEN' }
                });
            }

            // 3. Create Message
            const newMessage = await prisma.message.create({
                data: {
                    content: body,
                    conversationId: conversation.id,
                    isFromContact: true,
                    emailMessageId: msg.id,
                    emailSubject: subject
                }
            });

            // Update conversation
            await prisma.conversation.update({
                where: { id: conversation.id },
                data: {
                    lastMessageAt: new Date(),
                    unreadCount: { increment: 1 }
                }
            });

            newCount++;
            console.log(`✅ [Email] New: "${subject}" from ${fromName}`);

            // Emit socket event for real-time update (workspace-specific)
            emitToWorkspace(channel.workspaceId, 'new_message', {
                workspaceId: channel.workspaceId,
                conversationId: conversation.id,
                message: newMessage,
                contact: contact,
                channel: 'EMAIL'
            });

            // --- AUTOMATION RULES (same as WhatsApp/Facebook/Instagram/Widget) ---
            try {
                const cleanBody = cleanEmailBody(emailBody.text || body || '');
                if (cleanBody) {
                    const { executePhoneCaptureRule, executeHotKeywordRule, executeSalesPhoneCallRule } = await import('./rules.controller.js');
                    await executePhoneCaptureRule(channel.workspaceId, conversation.id, cleanBody);
                    executeHotKeywordRule(channel.workspaceId, conversation.id, cleanBody).catch(e =>
                        console.error('❌ [RULE:HOT_KEYWORD] Email async error:', e.message)
                    );
                    executeSalesPhoneCallRule(channel.workspaceId, conversation.id, cleanBody).catch(e =>
                        console.error('❌ [RULE:SALES_PHONE_CALL] Email async error:', e.message)
                    );
                    if (contact?.id) {
                        // DEVRE DIŞI:                         await executeAutoCallPlanning(channel.workspaceId, contact.id, 'EMAIL').catch(e =>
                            console.error('❌ [RULE:AUTO_CALL] Email async error:', e.message)
                        );
                    }
                }
            } catch (ruleErr) {
                console.error('❌ [RULES] Email error:', ruleErr.message);
            }

            // Auto extract
            try {
                const { autoExtractFromConversation } = await import('./ai.controller.js');
                autoExtractFromConversation(channel.workspaceId, conversation.id);

                // 📦 AUTO-CASE: Conversation için case yoksa oluştur
                const { ensureCaseForConversation } = await import('./case.controller.js');
                ensureCaseForConversation(channel.workspaceId, conversation.id).catch(e =>
                    console.error('⚠️ [AutoCase] Email error:', e.message)
                );
            } catch (extractError) {
                // Silent fail
            }
        }

        // Update sync time
        await prisma.emailChannel.update({
            where: { id: channelId },
            data: { lastSyncAt: new Date() }
        });

        return { success: true, newEmails: newCount };
    } catch (error) {
        console.error(`❌ [Email Sync] ${channelId}:`, error.message);
        return { success: false, error: error.message };
    }
};

// API endpoint wrapper
export const syncEmails = async (req, res) => {
    try {
        const { id: channelId } = req.params;
        const result = await syncEmailsInternal(channelId);

        if (result.success) {
            res.json({ success: true, newEmails: result.newEmails });
        } else {
            res.status(500).json({ error: result.error || 'Failed to sync emails' });
        }
    } catch (error) {
        console.error('Error syncing emails:', error);
        res.status(500).json({ error: 'Failed to sync emails' });
    }
};

export const sendEmailReply = async (emailChannelId, to, subject, body, options = {}) => {
    const channel = await prisma.emailChannel.findUnique({
        where: { id: emailChannelId }
    });

    if (!channel) throw new Error('Email channel not found');

    const { cc, bcc } = options;

    // Check provider type
    if (channel.provider === 'GMAIL') {
        // Use Gmail API
        const gmail = await getGmailClient(emailChannelId);

        const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
        const messageParts = [
            `From: me`,
            `To: ${to}`,
        ];

        // Add CC if provided
        if (cc && cc.trim()) {
            messageParts.push(`Cc: ${cc}`);
        }

        // Add BCC if provided
        if (bcc && bcc.trim()) {
            messageParts.push(`Bcc: ${bcc}`);
        }

        messageParts.push(
            `Content-Type: text/html; charset=utf-8`,
            `MIME-Version: 1.0`,
            `Subject: ${utf8Subject}`,
            '',
            body,
        );
        const message = messageParts.join('\n');

        // The body needs to be base64url encoded.
        const encodedMessage = Buffer.from(message)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

        await gmail.users.messages.send({
            userId: 'me',
            requestBody: {
                raw: encodedMessage,
            },
        });
    } else {
        // Use SMTP (for IMAP providers like Yandex, Outlook, etc.)
        const nodemailer = await import('nodemailer');

        const transporter = nodemailer.default.createTransport({
            host: channel.smtpHost,
            port: channel.smtpPort,
            secure: channel.smtpSecure,
            auth: {
                user: channel.smtpUser,
                pass: channel.smtpPass
            }
        });

        const mailOptions = {
            from: channel.email,
            to: to,
            subject: subject,
            html: body
        };

        // Add CC if provided
        if (cc && cc.trim()) {
            mailOptions.cc = cc;
        }

        // Add BCC if provided
        if (bcc && bcc.trim()) {
            mailOptions.bcc = bcc;
        }

        await transporter.sendMail(mailOptions);
    }
};

// Send a new email (not a reply)
export const sendNewEmail = async (req, res) => {
    try {
        const { id: channelId } = req.params;
        const { to, subject, body, cc, bcc } = req.body;

        if (!to || !body) {
            return res.status(400).json({ error: 'Alıcı ve mesaj alanları zorunludur' });
        }

        const channel = await prisma.emailChannel.findUnique({
            where: { id: channelId }
        });

        if (!channel) {
            return res.status(404).json({ error: 'E-posta kanalı bulunamadı' });
        }

        // Send the email with CC/BCC support
        await sendEmailReply(channelId, to, subject || '(Konu yok)', body, { cc, bcc });

        // Find or create contact for this workspace
        let contact = await prisma.contact.findFirst({
            where: {
                email: to,
                workspaceId: channel.workspaceId
            }
        });

        if (!contact) {
            contact = await prisma.contact.create({
                data: {
                    workspaceId: channel.workspaceId,
                    email: to,
                    name: to.split('@')[0]
                }
            });
        }

        // 24 saat birleştirme: Mevcut açık konuşma ara
        const mergeWindow = new Date(Date.now() - 24 * 60 * 60 * 1000);
        let conversation = await prisma.conversation.findFirst({
            where: {
                contactId: contact.id,
                workspaceId: channel.workspaceId,
                lastMessageAt: { gte: mergeWindow },
                status: { not: 'RESOLVED' }
            },
            orderBy: { lastMessageAt: 'desc' }
        });

        if (conversation) {
            console.log(`🔗 [Email Send Merge] Reusing existing ${conversation.channel} conversation ${conversation.id} (within 24h)`);
            if (!conversation.emailChannelId) {
                conversation = await prisma.conversation.update({
                    where: { id: conversation.id },
                    data: { emailChannelId: channelId }
                });
            }
        } else {
            conversation = await prisma.conversation.create({
                data: {
                    contactId: contact.id,
                    workspaceId: channel.workspaceId,
                    emailChannelId: channelId,
                    channel: 'EMAIL',
                    status: 'OPEN'
                }
            });
            assignDefaultFunnel(channel.workspaceId, conversation.id).catch(e => console.error('❌ [AutoFunnel] Email error:', e.message));
        }

        // Create sent message
        await prisma.message.create({
            data: {
                content: body,
                conversationId: conversation.id,
                senderId: req.user.id,
                isFromContact: false,
                emailSubject: subject || '(Konu yok)'
            }
        });

        // Update conversation lastMessageAt
        await prisma.conversation.update({
            where: { id: conversation.id },
            data: { lastMessageAt: new Date() }
        });

        console.log(`✅ New email sent to ${to}`);
        res.json({ success: true, conversationId: conversation.id });
    } catch (error) {
        console.error('Send new email error:', error);
        res.status(500).json({ error: 'E-posta gönderilemedi' });
    }
};

// Setup Gmail Push Notifications (Watch)
export const setupGmailWatch = async (req, res) => {
    try {
        const { id: channelId } = req.params;
        const gmail = await getGmailClient(channelId);
        const channel = await prisma.emailChannel.findUnique({ where: { id: channelId } });

        if (!channel) {
            return res.status(404).json({ error: 'E-posta kanalı bulunamadı' });
        }

        // Topic name from environment
        const topicName = process.env.GOOGLE_PUBSUB_TOPIC || 'projects/YOUR_PROJECT_ID/topics/gmail-notifications';

        // Setup watch on the mailbox
        const response = await gmail.users.watch({
            userId: 'me',
            requestBody: {
                topicName: topicName,
                labelIds: ['INBOX']
            }
        });

        // Save watch expiration
        await prisma.emailChannel.update({
            where: { id: channelId },
            data: {
                watchExpiration: new Date(parseInt(response.data.expiration)),
                historyId: response.data.historyId
            }
        });

        console.log(`✅ Gmail watch setup for ${channel.email}:`, response.data);
        res.json({
            success: true,
            expiration: response.data.expiration,
            historyId: response.data.historyId
        });
    } catch (error) {
        console.error('Setup Gmail watch error:', error);
        res.status(500).json({ error: 'Gmail watch kurulumu başarısız' });
    }
};

// Stop Gmail Watch
export const stopGmailWatch = async (req, res) => {
    try {
        const { id: channelId } = req.params;
        const gmail = await getGmailClient(channelId);

        await gmail.users.stop({ userId: 'me' });

        await prisma.emailChannel.update({
            where: { id: channelId },
            data: {
                watchExpiration: null,
                historyId: null
            }
        });

        console.log('✅ Gmail watch stopped');
        res.json({ success: true });
    } catch (error) {
        console.error('Stop Gmail watch error:', error);
        res.status(500).json({ error: 'Gmail watch durdurma başarısız' });
    }
};

// Pub/Sub Webhook - receives push notifications from Gmail
export const pubsubWebhook = async (req, res) => {
    try {
        // Acknowledge immediately to prevent retries
        res.status(200).send('OK');

        const message = req.body.message;
        if (!message || !message.data) {
            console.log('⚠️ No message data in webhook');
            return;
        }

        // Decode base64 message
        const data = JSON.parse(Buffer.from(message.data, 'base64').toString());
        console.log('📧 Gmail Push Notification:', data);

        const { emailAddress, historyId } = data;

        // Find the email channel
        const channel = await prisma.emailChannel.findFirst({
            where: { email: emailAddress }
        });

        if (!channel) {
            console.log(`⚠️ No channel found for ${emailAddress}`);
            return;
        }

        // Sync new emails using history
        await syncEmailsFromHistory(channel.id, historyId);

        // Emit socket event for real-time update
        // Emit to specific workspace
        const { emitToWorkspace } = await import('../socket.js');
        emitToWorkspace(channel.workspaceId, 'new_email', {
            workspaceId: channel.workspaceId,
            channelId: channel.id,
            email: emailAddress,
            channel: 'EMAIL'
        });

    } catch (error) {
        console.error('Pub/Sub webhook error:', error);
    }
};

// Sync emails from history (for incremental updates)
const syncEmailsFromHistory = async (channelId, newHistoryId) => {
    try {
        const gmail = await getGmailClient(channelId);
        const channel = await prisma.emailChannel.findUnique({ where: { id: channelId } });

        if (!channel || !channel.historyId) {
            console.log('No history ID, doing full sync');
            // Fall back to regular sync
            return;
        }

        // Get history since last known historyId
        const historyResponse = await gmail.users.history.list({
            userId: 'me',
            startHistoryId: channel.historyId,
            historyTypes: ['messageAdded']
        });

        const history = historyResponse.data.history || [];
        console.log(`📬 Found ${history.length} history records`);

        for (const record of history) {
            const messagesAdded = record.messagesAdded || [];
            for (const msgData of messagesAdded) {
                const msgId = msgData.message.id;

                // Check if we already have this message
                const existingMsg = await prisma.message.findUnique({
                    where: { emailMessageId: msgId }
                });
                if (existingMsg) continue;

                // Get full message details
                const detail = await gmail.users.messages.get({
                    userId: 'me',
                    id: msgId
                });

                const headers = detail.data.payload.headers;
                const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
                const from = headers.find(h => h.name === 'From')?.value || '';
                const fromEmail = from.match(/<(.+)>/)?.[1] || from;
                const fromName = from.split('<')[0].trim() || fromEmail;

                // Get email body - now returns { html, text }
                const emailBody = extractEmailBody(detail.data.payload);
                let body = emailBody.html || cleanEmailBody(emailBody.text);

                // Find or create Contact for this workspace
                let contact = await prisma.contact.findFirst({
                    where: {
                        email: fromEmail,
                        workspaceId: channel.workspaceId
                    }
                });
                if (!contact) {
                    contact = await prisma.contact.create({
                        data: {
                            workspaceId: channel.workspaceId,
                            email: fromEmail,
                            name: fromName
                        }
                    });
                }

                // Find or create Conversation - always use existing for same contact+channel
                let conversation = await prisma.conversation.findFirst({
                    where: {
                        contactId: contact.id,
                        emailChannelId: channelId
                    },
                    orderBy: { lastMessageAt: 'desc' }
                });

                if (!conversation) {
                    conversation = await prisma.conversation.create({
                        data: {
                            contactId: contact.id,
                            workspaceId: channel.workspaceId,
                            emailChannelId: channelId,
                            channel: 'EMAIL',
                            status: 'OPEN',
                            assignedBotId: channel.assignedBotId
                        }
                    });
                    assignDefaultFunnel(channel.workspaceId, conversation.id).catch(e => console.error('❌ [AutoFunnel] Email error:', e.message));
                } else if (conversation.status === 'RESOLVED') {
                    // Reopen if resolved
                    conversation = await prisma.conversation.update({
                        where: { id: conversation.id },
                        data: { status: 'OPEN' }
                    });
                }

                // Create Message
                await prisma.message.create({
                    data: {
                        content: body,
                        conversationId: conversation.id,
                        isFromContact: true,
                        emailMessageId: msgId,
                        emailSubject: subject
                    }
                });

                // Update conversation
                await prisma.conversation.update({
                    where: { id: conversation.id },
                    data: {
                        lastMessageAt: new Date(),
                        unreadCount: { increment: 1 }
                    }
                });

                console.log(`✅ New email synced: ${subject}`);

                // --- AUTOMATION RULES (same as polling sync path) ---
                try {
                    const cleanBody = cleanEmailBody(body || '');
                    if (cleanBody && conversation?.id) {
                        const { executePhoneCaptureRule, executeHotKeywordRule, executeSalesPhoneCallRule } = await import('./rules.controller.js');
                        await executePhoneCaptureRule(channel.workspaceId, conversation.id, cleanBody);
                        executeHotKeywordRule(channel.workspaceId, conversation.id, cleanBody).catch(e =>
                            console.error('❌ [RULE:HOT_KEYWORD] Email history error:', e.message)
                        );
                        executeSalesPhoneCallRule(channel.workspaceId, conversation.id, cleanBody).catch(e =>
                            console.error('❌ [RULE:SALES_PHONE_CALL] Email history error:', e.message)
                        );
                        if (contact?.id) {
                        // DEVRE DIŞI:                             await executeAutoCallPlanning(channel.workspaceId, contact.id, 'EMAIL').catch(e =>
                                console.error('❌ [RULE:AUTO_CALL] Email history error:', e.message)
                            );
                        }
                    }
                } catch (ruleErr) {
                    console.error('❌ [RULES] Email history error:', ruleErr.message);
                }
            }
        }

        // Update historyId
        await prisma.emailChannel.update({
            where: { id: channelId },
            data: { historyId: newHistoryId }
        });

    } catch (error) {
        console.error('Sync from history error:', error);
    }
};

export const deleteEmailChannel = async (req, res) => {
    try {
        const { id } = req.params;

        console.log(`🗑️ [Delete Email Channel] START - ID: ${id}`);

        // 1. Find all conversations linked to this email channel
        const conversations = await prisma.conversation.findMany({
            where: { emailChannelId: id },
            select: { id: true, contactId: true }
        });

        const conversationIds = conversations.map(c => c.id);
        const contactIds = [...new Set(conversations.map(c => c.contactId))]; // Unique contact IDs
        console.log(` - Found ${conversationIds.length} conversations to delete`);

        let deletedContacts = 0;

        if (conversationIds.length > 0) {
            // 2. Delete all messages in these conversations
            const msgDeleted = await prisma.message.deleteMany({
                where: { conversationId: { in: conversationIds } }
            });
            console.log(` - Deleted ${msgDeleted.count} messages`);

            // 3. Delete all internal notes in these conversations
            const notesDeleted = await prisma.internalNote.deleteMany({
                where: { conversationId: { in: conversationIds } }
            });
            console.log(` - Deleted ${notesDeleted.count} internal notes`);

            // 4. Delete all transfers in these conversations
            const transfersDeleted = await prisma.conversationTransfer.deleteMany({
                where: { conversationId: { in: conversationIds } }
            });
            console.log(` - Deleted ${transfersDeleted.count} transfers`);

            // 5. Delete all conversations
            const convsDeleted = await prisma.conversation.deleteMany({
                where: { emailChannelId: id }
            });
            console.log(` - Deleted ${convsDeleted.count} conversations`);

            // 6. Delete orphan contacts (contacts with no other conversations)
            for (const contactId of contactIds) {
                const otherConvs = await prisma.conversation.count({ where: { contactId } });
                if (otherConvs === 0) {
                    await prisma.contact.delete({ where: { id: contactId } }).catch(() => { });
                    deletedContacts++;
                }
            }
            console.log(` - Deleted ${deletedContacts} orphan contacts`);
        }

        // 7. Finally delete the email channel
        await prisma.emailChannel.delete({ where: { id } });

        console.log(`✅ [Delete Email Channel] SUCCESS - ID: ${id}`);
        res.json({
            message: 'Email channel and all related data deleted successfully',
            deletedConversations: conversationIds.length,
            deletedContacts: deletedContacts
        });
    } catch (error) {
        console.error('Delete email channel error:', error);
        res.status(500).json({ error: 'Failed to delete email channel' });
    }
};

// ============================================
// IMAP/SMTP Support (Yandex, Webmail, Outlook)
// ============================================

// Common IMAP/SMTP presets
export const EMAIL_PRESETS = {
    yandex: {
        name: 'Yandex',
        imapHost: 'imap.yandex.com',
        imapPort: 993,
        smtpHost: 'smtp.yandex.com',
        smtpPort: 465,
        secure: true
    },
    outlook: {
        name: 'Outlook / Hotmail',
        imapHost: 'outlook.office365.com',
        imapPort: 993,
        smtpHost: 'smtp.office365.com',
        smtpPort: 587,
        secure: false // Uses STARTTLS
    },
    custom: {
        name: 'Custom / Webmail',
        imapHost: '',
        imapPort: 993,
        smtpHost: '',
        smtpPort: 465,
        secure: true
    }
};

// Get available presets
export const getEmailPresets = (req, res) => {
    res.json({ presets: EMAIL_PRESETS });
};

// Connect IMAP/SMTP email account
export const connectImapSmtp = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const {
            email,
            password,
            preset,
            imapHost,
            imapPort,
            smtpHost,
            smtpPort,
            secure = true
        } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email ve şifre gereklidir' });
        }

        // Get preset values or use custom values
        let finalImapHost = imapHost;
        let finalImapPort = imapPort || 993;
        let finalSmtpHost = smtpHost;
        let finalSmtpPort = smtpPort || 465;
        let finalSecure = secure;

        if (preset && EMAIL_PRESETS[preset]) {
            const p = EMAIL_PRESETS[preset];
            finalImapHost = finalImapHost || p.imapHost;
            finalImapPort = finalImapPort || p.imapPort;
            finalSmtpHost = finalSmtpHost || p.smtpHost;
            finalSmtpPort = finalSmtpPort || p.smtpPort;
            finalSecure = p.secure;
        }

        if (!finalImapHost || !finalSmtpHost) {
            return res.status(400).json({ error: 'IMAP ve SMTP host adresleri gereklidir' });
        }

        console.log(`📧 [IMAP Connect] Testing connection for ${email}...`);
        console.log(`   IMAP: ${finalImapHost}:${finalImapPort}, SMTP: ${finalSmtpHost}:${finalSmtpPort}`);

        // Test IMAP connection
        const Imap = (await import('imap')).default;

        const imapTestPromise = new Promise((resolve, reject) => {
            const imap = new Imap({
                user: email,
                password: password,
                host: finalImapHost,
                port: finalImapPort,
                tls: finalSecure,
                tlsOptions: { rejectUnauthorized: false },
                connTimeout: 10000,
                authTimeout: 10000
            });

            imap.once('ready', () => {
                console.log('✅ [IMAP Connect] Connection successful');
                imap.end();
                resolve(true);
            });

            imap.once('error', (err) => {
                console.error('❌ [IMAP Connect] Error:', err.message);
                reject(new Error(`IMAP bağlantı hatası: ${err.message}`));
            });

            imap.once('end', () => {
                // Connection ended
            });

            imap.connect();
        });

        await imapTestPromise;

        // Test SMTP connection
        const nodemailer = (await import('nodemailer')).default;

        const transporter = nodemailer.createTransport({
            host: finalSmtpHost,
            port: finalSmtpPort,
            secure: finalSecure,
            auth: {
                user: email,
                pass: password
            },
            tls: {
                rejectUnauthorized: false
            }
        });

        await transporter.verify();
        console.log('✅ [SMTP Connect] Connection successful');

        // Save channel to database
        const emailChannel = await prisma.emailChannel.upsert({
            where: { email },
            update: {
                provider: 'IMAP',
                imapHost: finalImapHost,
                imapPort: finalImapPort,
                imapUser: email,
                imapPass: password,
                imapSecure: finalSecure,
                smtpHost: finalSmtpHost,
                smtpPort: finalSmtpPort,
                smtpUser: email,
                smtpPass: password,
                smtpSecure: finalSecure,
                workspaceId,
                isActive: true,
                lastSyncAt: new Date()
            },
            create: {
                email,
                provider: 'IMAP',
                imapHost: finalImapHost,
                imapPort: finalImapPort,
                imapUser: email,
                imapPass: password,
                imapSecure: finalSecure,
                smtpHost: finalSmtpHost,
                smtpPort: finalSmtpPort,
                smtpUser: email,
                smtpPass: password,
                smtpSecure: finalSecure,
                workspaceId,
                lastSyncAt: new Date()
            }
        });

        console.log(`✅ [IMAP/SMTP] Channel created: ${email}`);

        res.json({
            success: true,
            emailChannel: {
                id: emailChannel.id,
                email: emailChannel.email,
                provider: emailChannel.provider,
                isActive: emailChannel.isActive
            },
            message: 'Email hesabı başarıyla bağlandı'
        });

    } catch (error) {
        console.error('❌ [IMAP/SMTP Connect] Error:', error.message);
        res.status(500).json({
            error: error.message || 'Bağlantı başarısız',
            details: 'Email veya şifre hatalı olabilir. Yandex için uygulama şifresi kullanın.'
        });
    }
};

// Sync emails via IMAP (for non-Gmail providers)
export const syncEmailsImap = async (channelId) => {
    try {
        const channel = await prisma.emailChannel.findUnique({ where: { id: channelId } });

        if (!channel || channel.provider !== 'IMAP') {
            return { success: false, error: 'IMAP kanalı bulunamadı' };
        }

        console.log(`📧 [IMAP Sync] Starting sync for ${channel.email}...`);

        const Imap = (await import('imap')).default;
        const { simpleParser } = await import('mailparser');
        const { emitToWorkspace } = await import('../socket.js');

        return new Promise((resolve, reject) => {
            const imap = new Imap({
                user: channel.imapUser,
                password: channel.imapPass,
                host: channel.imapHost,
                port: channel.imapPort || 993,
                tls: channel.imapSecure !== false,
                tlsOptions: { rejectUnauthorized: false },
                connTimeout: 15000,
                authTimeout: 15000
            });

            let newCount = 0;

            imap.once('ready', async () => {
                imap.openBox('INBOX', true, async (err, box) => {
                    if (err) {
                        imap.end();
                        return reject(err);
                    }

                    // Calculate search criteria based on last sync
                    let searchCriteria;
                    if (channel.lastSyncAt) {
                        // IMAP SINCE requires Date object
                        const since = new Date(channel.lastSyncAt);
                        searchCriteria = [['SINCE', since]];
                    } else {
                        // First sync - get last 10 emails
                        searchCriteria = ['ALL'];
                    }

                    imap.search(searchCriteria, async (err, results) => {
                        if (err) {
                            imap.end();
                            return reject(err);
                        }

                        if (!results || results.length === 0) {
                            imap.end();
                            await prisma.emailChannel.update({
                                where: { id: channelId },
                                data: { lastSyncAt: new Date() }
                            });
                            return resolve({ success: true, newEmails: 0 });
                        }

                        // Limit to last 20 for performance
                        const emailIds = results.slice(-20);
                        console.log(`📧 [IMAP Sync] Found ${emailIds.length} emails to check`);

                        const fetch = imap.fetch(emailIds, { bodies: '' });
                        const emailPromises = [];

                        fetch.on('message', (msg, seqno) => {
                            const emailPromise = new Promise((resolveEmail) => {
                                let buffer = '';

                                msg.on('body', (stream) => {
                                    stream.on('data', (chunk) => {
                                        buffer += chunk.toString('utf8');
                                    });
                                });

                                msg.once('end', async () => {
                                    try {
                                        const parsed = await simpleParser(buffer);

                                        const messageId = parsed.messageId || `imap-${seqno}-${Date.now()}`;

                                        // Check if already exists
                                        const existing = await prisma.message.findFirst({
                                            where: { emailMessageId: messageId }
                                        });

                                        if (existing) {
                                            resolveEmail(null);
                                            return;
                                        }

                                        const fromEmail = parsed.from?.value?.[0]?.address || '';
                                        const fromName = parsed.from?.value?.[0]?.name || fromEmail.split('@')[0];
                                        const subject = parsed.subject || 'No Subject';
                                        const body = parsed.html || parsed.textAsHtml || parsed.text || '';

                                        // Skip own outgoing emails
                                        if (fromEmail.toLowerCase() === channel.email.toLowerCase()) {
                                            resolveEmail(null);
                                            return;
                                        }

                                        const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(fromName)}&background=ef4444&color=fff&size=150`;

                                        // Find or create contact
                                        let contact = await prisma.contact.findFirst({
                                            where: { email: fromEmail, workspaceId: channel.workspaceId }
                                        });

                                        if (!contact) {
                                            contact = await prisma.contact.create({
                                                data: {
                                                    workspaceId: channel.workspaceId,
                                                    email: fromEmail,
                                                    name: fromName,
                                                    avatar: avatarUrl
                                                }
                                            });
                                        }

                                        // Find or create conversation
                                        let conversation = await prisma.conversation.findFirst({
                                            where: { contactId: contact.id, emailChannelId: channelId },
                                            orderBy: { lastMessageAt: 'desc' }
                                        });

                                        if (!conversation) {
                                            conversation = await prisma.conversation.create({
                                                data: {
                                                    contactId: contact.id,
                                                    workspaceId: channel.workspaceId,
                                                    emailChannelId: channelId,
                                                    channel: 'EMAIL',
                                                    status: 'OPEN',
                                                    assignedBotId: channel.assignedBotId
                                                }
                                            });
                                            assignDefaultFunnel(channel.workspaceId, conversation.id).catch(e => console.error('❌ [AutoFunnel] Email error:', e.message));
                                        } else if (conversation.status === 'RESOLVED') {
                                            await prisma.conversation.update({
                                                where: { id: conversation.id },
                                                data: { status: 'OPEN' }
                                            });
                                        }

                                        // Create message
                                        const newMessage = await prisma.message.create({
                                            data: {
                                                content: body,
                                                conversationId: conversation.id,
                                                isFromContact: true,
                                                emailMessageId: messageId,
                                                emailSubject: subject
                                            }
                                        });

                                        await prisma.conversation.update({
                                            where: { id: conversation.id },
                                            data: {
                                                lastMessageAt: new Date(),
                                                unreadCount: { increment: 1 }
                                            }
                                        });

                                        console.log(`✅ [IMAP] New: "${subject}" from ${fromName}`);
                                        newCount++;

                                        emitToWorkspace(channel.workspaceId, 'new_message', {
                                            workspaceId: channel.workspaceId,
                                            conversationId: conversation.id,
                                            message: newMessage,
                                            contact: contact,
                                            channel: 'EMAIL'
                                        });

                                        // --- AUTOMATION RULES (same as other channels) ---
                                        try {
                                            const cleanBody = cleanEmailBody(body || '');
                                            if (cleanBody && conversation?.id) {
                                                const { executePhoneCaptureRule, executeHotKeywordRule, executeSalesPhoneCallRule } = await import('./rules.controller.js');
                                                await executePhoneCaptureRule(channel.workspaceId, conversation.id, cleanBody);
                                                executeHotKeywordRule(channel.workspaceId, conversation.id, cleanBody).catch(e =>
                                                    console.error('❌ [RULE:HOT_KEYWORD] IMAP error:', e.message)
                                                );
                                                executeSalesPhoneCallRule(channel.workspaceId, conversation.id, cleanBody).catch(e =>
                                                    console.error('❌ [RULE:SALES_PHONE_CALL] IMAP error:', e.message)
                                                );
                                                if (contact?.id) {
                        // DEVRE DIŞI:                                                     await executeAutoCallPlanning(channel.workspaceId, contact.id, 'EMAIL').catch(e =>
                                                        console.error('❌ [RULE:AUTO_CALL] IMAP error:', e.message)
                                                    );
                                                }
                                            }
                                        } catch (ruleErr) {
                                            console.error('❌ [RULES] IMAP error:', ruleErr.message);
                                        }

                                        resolveEmail(newMessage);
                                    } catch (parseError) {
                                        console.error('Email parse error:', parseError.message);
                                        resolveEmail(null);
                                    }
                                });
                            });

                            emailPromises.push(emailPromise);
                        });

                        fetch.once('error', (err) => {
                            console.error('IMAP fetch error:', err);
                        });

                        fetch.once('end', async () => {
                            await Promise.all(emailPromises);

                            await prisma.emailChannel.update({
                                where: { id: channelId },
                                data: { lastSyncAt: new Date() }
                            });

                            imap.end();
                            resolve({ success: true, newEmails: newCount });
                        });
                    });
                });
            });

            imap.once('error', (err) => {
                console.error('IMAP connection error:', err.message);
                reject(err);
            });

            imap.connect();
        });

    } catch (error) {
        console.error(`❌ [IMAP Sync] Error:`, error.message);
        return { success: false, error: error.message };
    }
};

// Send email via SMTP (for non-Gmail providers)
export const sendEmailSmtp = async (channelId, to, subject, body, options = {}) => {
    const channel = await prisma.emailChannel.findUnique({ where: { id: channelId } });

    if (!channel || channel.provider !== 'IMAP') {
        throw new Error('SMTP kanalı bulunamadı');
    }

    const nodemailer = (await import('nodemailer')).default;

    const transporter = nodemailer.createTransport({
        host: channel.smtpHost,
        port: channel.smtpPort || 465,
        secure: channel.smtpSecure !== false,
        auth: {
            user: channel.smtpUser,
            pass: channel.smtpPass
        },
        tls: {
            rejectUnauthorized: false
        }
    });

    const mailOptions = {
        from: channel.email,
        to: to,
        subject: subject,
        html: body
    };

    if (options.cc) mailOptions.cc = options.cc;
    if (options.bcc) mailOptions.bcc = options.bcc;

    const result = await transporter.sendMail(mailOptions);
    console.log(`✅ [SMTP] Email sent to ${to}:`, result.messageId);

    return result;
};

// Universal sync function - works for both Gmail and IMAP
export const syncEmailsUniversal = async (channelId) => {
    const channel = await prisma.emailChannel.findUnique({ where: { id: channelId } });

    if (!channel) {
        return { success: false, error: 'Kanal bulunamadı' };
    }

    if (channel.provider === 'GMAIL') {
        return syncEmailsInternal(channelId);
    } else if (channel.provider === 'IMAP') {
        return syncEmailsImap(channelId);
    }

    return { success: false, error: 'Bilinmeyen provider' };
};

// Universal send function - works for both Gmail and SMTP
export const sendEmailUniversal = async (channelId, to, subject, body, options = {}) => {
    const channel = await prisma.emailChannel.findUnique({ where: { id: channelId } });

    if (!channel) {
        throw new Error('Kanal bulunamadı');
    }

    if (channel.provider === 'GMAIL') {
        return sendEmailReply(channelId, to, subject, body, options);
    } else if (channel.provider === 'IMAP') {
        return sendEmailSmtp(channelId, to, subject, body, options);
    }

    throw new Error('Bilinmeyen provider');
};
