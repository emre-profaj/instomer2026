import { google } from 'googleapis';
import prisma from '../lib/prisma.js';

const SCOPES = [
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile'
];

/**
 * Otomatik Yönlendirme (Redirect) URI hesaplar
 */
export function getRedirectUri(req = null, customUri = null) {
    if (customUri) return customUri;
    if (process.env.GOOGLE_CALENDAR_REDIRECT_URI) return process.env.GOOGLE_CALENDAR_REDIRECT_URI;

    if (req) {
        let proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
        const host = req.headers['x-forwarded-host'] || req.get('host');
        if (host) {
            // Google OAuth public domainlerde http kabul etmez, daima https olmalıdır
            if (!host.includes('localhost') && !host.includes('127.0.0.1')) {
                proto = 'https';
            }
            return `${proto}://${host}/api/calendar/google/callback`;
        }
    }

    const backendUrl = process.env.BACKEND_URL || 'https://app.instomer.com';
    return `${backendUrl}/api/calendar/google/callback`;
}

/**
 * Workspace veya ortam değişkenlerinden Google OAuth Client kimlik bilgilerini çözer
 */
export async function getWorkspaceGoogleCredentials(workspaceId) {
    if (workspaceId) {
        const ws = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { googleClientId: true, googleClientSecret: true }
        });
        if (ws?.googleClientId && ws?.googleClientSecret) {
            return {
                clientId: ws.googleClientId.trim(),
                clientSecret: ws.googleClientSecret.trim(),
                source: 'workspace'
            };
        }
    }

    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
        return {
            clientId: process.env.GOOGLE_CLIENT_ID.trim(),
            clientSecret: process.env.GOOGLE_CLIENT_SECRET.trim(),
            source: 'platform'
        };
    }

    return null;
}

/**
 * Google OAuth2 Client üretir
 */
export async function getOAuth2Client({ workspaceId = null, redirectUri = null, req = null } = {}) {
    if (!workspaceId) {
        throw new Error('Workspace bilgisi belirtilmedi.');
    }
    const creds = await getWorkspaceGoogleCredentials(workspaceId);
    if (!creds) {
        throw new Error('Google Takvim entegrasyonu henüz yapılandırılmamış.');
    }

    const callbackUrl = getRedirectUri(req, redirectUri);
    return new google.auth.OAuth2(creds.clientId, creds.clientSecret, callbackUrl);
}

/**
 * Temsilci için Google OAuth onay linki üretir
 */
export async function getAuthUrl(workspaceId, userId, req = null) {
    const oauth2Client = await getOAuth2Client({ workspaceId, req });
    const state = Buffer.from(JSON.stringify({ workspaceId, userId })).toString('base64');

    return oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        state,
        prompt: 'consent' // Refresh token gelmesini garanti eder
    });
}

/**
 * OAuth Callback kodunu işler ve token'ları kullanıcıya bağlar
 */
export async function handleOAuthCallback(code, stateStr, req = null) {
    if (!code) throw new Error('Auth code bulunamadı');

    let stateObj = {};
    try {
        stateObj = JSON.parse(Buffer.from(stateStr, 'base64').toString('utf-8'));
    } catch {
        throw new Error('Geçersiz state parametresi');
    }

    const { workspaceId, userId } = stateObj;
    if (!userId || !workspaceId) throw new Error('Kullanıcı veya Workspace bilgisi eksik');

    const oauth2Client = await getOAuth2Client({ workspaceId, req });
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Google kullanıcı profilinden e-posta adresini al
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    const googleEmail = userInfo.data?.email || '';

    // Veritabanına kaydet/güncelle (workspace bazlı, çoklu hesap destekli)
    await prisma.userGoogleCalendar.upsert({
        where: {
            userId_workspaceId_googleEmail: { userId, workspaceId, googleEmail }
        },
        update: {
            accessToken: tokens.access_token,
            ...(tokens.refresh_token && { refreshToken: tokens.refresh_token }),
            expiryDate: tokens.expiry_date ? BigInt(tokens.expiry_date) : undefined,
            isActive: true
        },
        create: {
            userId,
            workspaceId,
            googleEmail,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token || null,
            expiryDate: tokens.expiry_date ? BigInt(tokens.expiry_date) : undefined,
            calendarId: 'primary',
            isActive: true
        }
    });

    console.log(`✅ [GoogleCalendar] Connected for user ${userId} (${googleEmail}) in workspace ${workspaceId}`);
    return { userEmail: googleEmail, workspaceId };
}

/**
 * İlgili kullanıcının kimlik doğrulamasını yapmış Google Calendar API istemcisi döner
 */
export async function getCalendarClientForUser(userId, workspaceId, googleEmail = null) {
    if (!userId || !workspaceId) return null;

    try {
        let calRecord = null;
        if (googleEmail) {
            calRecord = await prisma.userGoogleCalendar.findFirst({
                where: { userId, workspaceId, googleEmail, isActive: true }
            });
        } else {
            calRecord = await prisma.userGoogleCalendar.findFirst({
                where: { userId, workspaceId, isActive: true },
                orderBy: { createdAt: 'asc' }
            });
        }

        if (!calRecord || !calRecord.accessToken || !calRecord.isActive) return null;

        const oauth2Client = await getOAuth2Client({ workspaceId });
        oauth2Client.setCredentials({
            access_token: calRecord.accessToken,
            refresh_token: calRecord.refreshToken || undefined,
            expiry_date: calRecord.expiryDate ? Number(calRecord.expiryDate) : undefined
        });

        // Token yenilendiğinde DB'ye kaydet
        oauth2Client.on('tokens', async (newTokens) => {
            try {
                const updateData = { accessToken: newTokens.access_token };
                if (newTokens.refresh_token) updateData.refreshToken = newTokens.refresh_token;
                if (newTokens.expiry_date) updateData.expiryDate = BigInt(newTokens.expiry_date);
                await prisma.userGoogleCalendar.update({
                    where: { id: calRecord.id },
                    data: updateData
                });
            } catch (err) {
                console.error('⚠️ [GoogleCalendar] Token save error:', err.message);
            }
        });

        return google.calendar({ version: 'v3', auth: oauth2Client });
    } catch (err) {
        console.error('⚠️ [GoogleCalendar] Client init error:', err.message);
        return null;
    }
}

/**
 * Randevuyu temsilcinin Google Takvimine etkinlik olarak ekler
 */
export async function syncAppointmentToGoogle(appointmentId, targetUserId = null) {
    try {
        const appointment = await prisma.appointment.findUnique({
            where: { id: appointmentId }
        });

        if (!appointment || !appointment.workspaceId) return null;

        const effectiveUserId = targetUserId || appointment.assignedToId || appointment.createdById;
        if (!effectiveUserId) return null;

        const calendar = await getCalendarClientForUser(effectiveUserId, appointment.workspaceId);
        if (!calendar) return null;

        const descriptionParts = [];
        if (appointment.contactName) descriptionParts.push(`👤 Müşteri/Hasta: ${appointment.contactName}`);
        if (appointment.contactPhone) descriptionParts.push(`📞 Telefon: ${appointment.contactPhone}`);
        if (appointment.contactEmail) descriptionParts.push(`✉️ E-posta: ${appointment.contactEmail}`);
        if (appointment.branch) descriptionParts.push(`🏥 Branş: ${appointment.branch}`);
        if (appointment.doctorName) descriptionParts.push(`👨‍⚕️ Uzman: ${appointment.doctorName}`);
        if (appointment.procedure) descriptionParts.push(`📋 İşlem: ${appointment.procedure}`);
        if (appointment.notes) descriptionParts.push(`\n📝 Notlar:\n${appointment.notes}`);
        if (appointment.description) descriptionParts.push(`\nℹ️ Açıklama:\n${appointment.description}`);

        const requestBody = {
            summary: appointment.title,
            description: descriptionParts.join('\n'),
            start: {
                dateTime: new Date(appointment.startTime).toISOString(),
                timeZone: 'Europe/Istanbul'
            },
            end: {
                dateTime: new Date(appointment.endTime).toISOString(),
                timeZone: 'Europe/Istanbul'
            },
            attendees: appointment.contactEmail ? [{ email: appointment.contactEmail }] : [],
            conferenceData: {
                createRequest: {
                    requestId: `meet-${appointment.id}-${Date.now()}`,
                    conferenceSolutionKey: {
                        type: 'hangoutsMeet'
                    }
                }
            },
            reminders: {
                useDefault: false,
                overrides: [
                    { method: 'popup', minutes: 30 },
                    { method: 'popup', minutes: 10 }
                ]
            }
        };

        const res = await calendar.events.insert({
            calendarId: 'primary',
            conferenceDataVersion: 1,
            requestBody
        });

        const meetLink = res.data?.hangoutLink ||
            res.data?.conferenceData?.entryPoints?.find(ep => ep.entryPointType === 'video')?.uri ||
            null;

        if (res.data?.id) {
            await prisma.appointment.update({
                where: { id: appointment.id },
                data: {
                    googleEventId: res.data.id,
                    googleMeetLink: meetLink,
                    ...(!appointment.assignedToId && { assignedToId: effectiveUserId })
                }
            });
            console.log(`📅 [GoogleCalendar] Event created: ${res.data.id} with Meet link: ${meetLink} for appointment ${appointment.id}`);
            return res.data;
        }

        return null;
    } catch (error) {
        console.error('❌ [GoogleCalendar] Sync error:', error.message);
        return null;
    }
}

/**
 * Randevu güncellendiğinde Google Takvim etkinliğini günceller
 */
export async function updateGoogleEvent(appointmentId) {
    try {
        const appointment = await prisma.appointment.findUnique({
            where: { id: appointmentId }
        });

        if (!appointment || !appointment.assignedToId || !appointment.workspaceId) return null;

        // Henüz Google etkinliği yoksa yeni oluştur
        if (!appointment.googleEventId) {
            return syncAppointmentToGoogle(appointmentId);
        }

        const calendar = await getCalendarClientForUser(appointment.assignedToId, appointment.workspaceId);
        if (!calendar) return null;

        const descriptionParts = [];
        if (appointment.contactName) descriptionParts.push(`👤 Müşteri/Hasta: ${appointment.contactName}`);
        if (appointment.contactPhone) descriptionParts.push(`📞 Telefon: ${appointment.contactPhone}`);
        if (appointment.contactEmail) descriptionParts.push(`✉️ E-posta: ${appointment.contactEmail}`);
        if (appointment.branch) descriptionParts.push(`🏥 Branş: ${appointment.branch}`);
        if (appointment.doctorName) descriptionParts.push(`👨‍⚕️ Uzman: ${appointment.doctorName}`);
        if (appointment.procedure) descriptionParts.push(`📋 İşlem: ${appointment.procedure}`);
        if (appointment.notes) descriptionParts.push(`\n📝 Notlar:\n${appointment.notes}`);
        if (appointment.description) descriptionParts.push(`\nℹ️ Açıklama:\n${appointment.description}`);

        const requestBody = {
            summary: appointment.title,
            description: descriptionParts.join('\n'),
            start: {
                dateTime: new Date(appointment.startTime).toISOString(),
                timeZone: 'Europe/Istanbul'
            },
            end: {
                dateTime: new Date(appointment.endTime).toISOString(),
                timeZone: 'Europe/Istanbul'
            },
            attendees: appointment.contactEmail ? [{ email: appointment.contactEmail }] : []
        };

        const res = await calendar.events.update({
            calendarId: 'primary',
            eventId: appointment.googleEventId,
            conferenceDataVersion: 1,
            requestBody
        });

        const meetLink = res.data?.hangoutLink ||
            res.data?.conferenceData?.entryPoints?.find(ep => ep.entryPointType === 'video')?.uri ||
            null;

        if (meetLink && meetLink !== appointment.googleMeetLink) {
            await prisma.appointment.update({
                where: { id: appointment.id },
                data: { googleMeetLink: meetLink }
            });
        }

        console.log(`📅 [GoogleCalendar] Event updated: ${appointment.googleEventId}`);
        return res.data;
    } catch (error) {
        // Eğer etkinlik Google tarafında silinmişse (404), yeniden oluşturmayı dene
        if (error.code === 404) {
            console.log(`⚠️ [GoogleCalendar] Event ${appointmentId} was deleted on Google, recreating...`);
            await prisma.appointment.update({
                where: { id: appointmentId },
                data: { googleEventId: null }
            });
            return syncAppointmentToGoogle(appointmentId);
        }
        console.error('❌ [GoogleCalendar] Update error:', error.message);
        return null;
    }
}

/**
 * Randevu silindiğinde veya iptal edildiğinde Google Takvim etkinliğini siler
 */
export async function deleteGoogleEvent(appointmentId, assignedToId = null, googleEventId = null, workspaceId = null) {
    try {
        let eventId = googleEventId;
        let userId = assignedToId;
        let wsId = workspaceId;

        if (!eventId || !userId || !wsId) {
            const appointment = await prisma.appointment.findUnique({
                where: { id: appointmentId },
                select: { googleEventId: true, assignedToId: true, workspaceId: true }
            });
            eventId = eventId || appointment?.googleEventId;
            userId = userId || appointment?.assignedToId;
            wsId = wsId || appointment?.workspaceId;
        }

        if (!eventId || !userId || !wsId) return false;

        const calendar = await getCalendarClientForUser(userId, wsId);
        if (!calendar) return false;

        await calendar.events.delete({
            calendarId: 'primary',
            eventId
        });

        console.log(`🗑️ [GoogleCalendar] Event deleted: ${eventId}`);
        return true;
    } catch (error) {
        if (error.code === 404 || error.code === 410) {
            return true; // Zaten silinmiş
        }
        console.error('❌ [GoogleCalendar] Delete error:', error.message);
        return false;
    }
}

/**
 * Kullanıcının belirli bir çalışma alanındaki Google Takvim bağlantı durumunu getirir
 */
export async function getUserGoogleCalendarStatus(userId, workspaceId) {
    if (!userId || !workspaceId) return { isConnected: false, isWorkspaceConfigured: false, accounts: [], email: null, isExpired: false };

    const creds = await getWorkspaceGoogleCredentials(workspaceId);
    const isWorkspaceConfigured = !!creds;

    const cals = await prisma.userGoogleCalendar.findMany({
        where: { userId, workspaceId, isActive: true },
        select: { id: true, googleEmail: true, isActive: true, updatedAt: true, refreshToken: true, expiryDate: true },
        orderBy: { createdAt: 'asc' }
    });

    const accounts = cals.map(cal => {
        const isExpired = !!(!cal.refreshToken && cal.expiryDate && Number(cal.expiryDate) < Date.now());
        return {
            id: cal.id,
            email: cal.googleEmail,
            isExpired,
            updatedAt: cal.updatedAt
        };
    });

    const activeAccounts = accounts.filter(a => !a.isExpired);

    return {
        isWorkspaceConfigured,
        isConnected: activeAccounts.length > 0,
        accounts,
        email: activeAccounts[0]?.email || accounts[0]?.email || null,
        isExpired: accounts.length > 0 && activeAccounts.length === 0,
        updatedAt: accounts[0]?.updatedAt || null
    };
}

/**
 * Kullanıcının belirli bir çalışma alanındaki Google Takvim bağlantısını keser (seçilen hesabı veya tümünü)
 */
export async function disconnectCalendar(userId, workspaceId, googleEmail = null) {
    if (!userId || !workspaceId) return false;

    const where = { userId, workspaceId };
    if (googleEmail) {
        where.googleEmail = googleEmail;
    }

    await prisma.userGoogleCalendar.deleteMany({ where });

    console.log(`🔌 [GoogleCalendar] Disconnected for user ${userId} (${googleEmail || 'all'}) in workspace ${workspaceId}`);
    return true;
}

/**
 * Workspace için Google Takvim ayarlarını ve durumunu getirir
 */
export async function getWorkspaceGoogleConfig(workspaceId, req = null) {
    const ws = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { googleClientId: true, googleClientSecret: true }
    });

    const hasCustomCreds = !!(ws?.googleClientId && ws?.googleClientSecret);
    const hasPlatformCreds = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
    const isConfigured = hasCustomCreds || hasPlatformCreds;

    // Sadece bu workspace'e bağlı temsilcileri listele
    const connectedUsers = await prisma.userGoogleCalendar.findMany({
        where: { workspaceId, isActive: true },
        include: {
            user: { select: { id: true, name: true, email: true, avatar: true } }
        }
    });

    const redirectUri = getRedirectUri(req);

    return {
        isConfigured,
        isPlatformDefault: !hasCustomCreds && hasPlatformCreds,
        source: hasCustomCreds ? 'custom' : hasPlatformCreds ? 'platform' : 'none',
        hasCustomCredentials: hasCustomCreds,
        clientId: ws?.googleClientId || '',
        redirectUri,
        connectedUsersCount: connectedUsers.length,
        connectedUsers: connectedUsers.map(c => ({
            id: c.id,
            userId: c.userId,
            userName: c.user?.name || 'Kullanıcı',
            userEmail: c.user?.email || '',
            googleEmail: c.googleEmail,
            connectedAt: c.createdAt
        }))
    };
}

/**
 * Workspace için Google Takvim ayarlarını kaydeder
 */
export async function saveWorkspaceGoogleConfig(workspaceId, { clientId, clientSecret }) {
    if (!clientId || !clientSecret) {
        throw new Error('Client ID ve Client Secret alanları zorunludur');
    }

    await prisma.workspace.update({
        where: { id: workspaceId },
        data: {
            googleClientId: clientId.trim(),
            googleClientSecret: clientSecret.trim()
        }
    });

    return { success: true, message: 'Google Takvim ayarları başarıyla kaydedildi.' };
}

/**
 * Workspace için Google Takvim ayarlarını kaldırır
 */
export async function deleteWorkspaceGoogleConfig(workspaceId) {
    await prisma.workspace.update({
        where: { id: workspaceId },
        data: {
            googleClientId: null,
            googleClientSecret: null
        }
    });

    // Bu workspace'e bağlı temsilcilerin takvim bağlantılarını da temizle
    await prisma.userGoogleCalendar.deleteMany({
        where: { workspaceId }
    });

    return { success: true, message: 'Google Takvim yapılandırması kaldırıldı.' };
}

/**
 * Temsilcinin Google Takvimindeki etkinlikleri çeker (Instomer Takviminde göstermek için)
 */
export async function getGoogleCalendarEvents(userIdInput, workspaceId, { startDate, endDate } = {}) {
    if (!userIdInput || !workspaceId) return { events: [], tokenExpired: false };

    try {
        let userIds = [];
        if (Array.isArray(userIdInput)) {
            userIds = userIdInput;
        } else if (typeof userIdInput === 'string') {
            if (userIdInput === 'all') {
                const allActive = await prisma.userGoogleCalendar.findMany({
                    where: { workspaceId, isActive: true },
                    select: { userId: true }
                });
                userIds = allActive.map(u => u.userId);
            } else if (userIdInput.includes(',')) {
                userIds = userIdInput.split(',').map(s => s.trim()).filter(Boolean);
            } else if (userIdInput.trim()) {
                userIds = [userIdInput.trim()];
            }
        }

        if (userIds.length === 0) return { events: [], tokenExpired: false };

        // Bu workspace'te daha önce oluşturulmuş randevuların googleEventId'lerini al (çift gösterimi önlemek için)
        const existingApts = await prisma.appointment.findMany({
            where: {
                workspaceId,
                googleEventId: { not: null }
            },
            select: { googleEventId: true }
        });
        const existingGoogleEventIds = new Set(existingApts.map(a => a.googleEventId));

        const timeMin = startDate ? new Date(startDate).toISOString() : new Date().toISOString();
        const timeMax = endDate ? new Date(endDate).toISOString() : undefined;

        // İlgili temsilcilerin bağlantı ve kullanıcı bilgilerini al
        const connectedUsers = await prisma.userGoogleCalendar.findMany({
            where: {
                workspaceId,
                userId: { in: userIds },
                isActive: true
            },
            include: {
                user: { select: { id: true, name: true, email: true } }
            }
        });

        const allEvents = [];
        let hasTokenExpired = false;

        for (const conn of connectedUsers) {
            try {
                // Token süresi dolmuş ve refresh token yoksa tespit et
                if (!conn.refreshToken && conn.expiryDate && Number(conn.expiryDate) < Date.now()) {
                    console.warn(`⚠️ [GoogleCalendar] User ${conn.userId} access token expired without a refresh token.`);
                    hasTokenExpired = true;
                    continue;
                }

                const calendar = await getCalendarClientForUser(conn.userId, workspaceId, conn.googleEmail);
                if (!calendar) continue;

                const response = await calendar.events.list({
                    calendarId: 'primary',
                    timeMin,
                    timeMax,
                    singleEvents: true,
                    orderBy: 'startTime',
                    maxResults: 250
                });

                const items = response.data?.items || [];
                const externalEvents = items.filter(ev => ev.id && !existingGoogleEventIds.has(ev.id));

                for (const ev of externalEvents) {
                    const start = ev.start?.dateTime || ev.start?.date;
                    const end = ev.end?.dateTime || ev.end?.date;
                    const isAllDay = !ev.start?.dateTime;

                    allEvents.push({
                        id: `google-${ev.id}`,
                        googleEventId: ev.id,
                        title: ev.summary || '(Google Etkinliği)',
                        description: ev.description || '',
                        startTime: start,
                        endTime: end,
                        isAllDay,
                        googleMeetLink: ev.hangoutLink || null,
                        htmlLink: ev.htmlLink || null,
                        isGoogleEvent: true,
                        googleEmail: conn.googleEmail,
                        status: 'SCHEDULED',
                        color: '#4285F4',
                        contactName: ev.attendees?.map(a => a.displayName || a.email).join(', ') || '',
                        notes: ev.description || '',
                        location: ev.location || null,
                        assignedToId: conn.userId,
                        assignedTo: conn.user ? {
                            id: conn.user.id,
                            name: `${conn.user.name} (${conn.googleEmail})`,
                            email: conn.googleEmail
                        } : { id: conn.userId, name: conn.googleEmail, email: conn.googleEmail }
                    });
                }
            } catch (err) {
                console.error(`⚠️ [GoogleCalendar] User ${conn.userId} events fetch error:`, err.message);
                if (err.message?.includes('invalid_grant') || err.message?.includes('No refresh token') || err.status === 401 || err.code === 401) {
                    hasTokenExpired = true;
                }
            }
        }

        allEvents.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
        return { events: allEvents, tokenExpired: hasTokenExpired };
    } catch (error) {
        console.error('❌ [GoogleCalendar] getGoogleCalendarEvents error:', error.message);
        return { events: [], tokenExpired: false, error: error.message };
    }
}

