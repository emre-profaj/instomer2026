/**
 * Google Calendar Sync Service
 * 
 * Randevu oluşturulduğunda Google Calendar'a event ekler.
 * OAuth 2.0 Service Account veya API Key ile çalışır.
 * 
 * Kullanım:
 *   1. Google Cloud Console'da Calendar API'yi etkinleştir
 *   2. Service Account oluştur ve JSON key indir
 *   3. .env'ye GOOGLE_CALENDAR_KEY_FILE ve GOOGLE_CALENDAR_ID ekle
 *   4. Randevu oluşturulduğunda syncToGoogleCalendar() çağrılır
 */

import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let calendarClient = null;

/**
 * Google Calendar client'ı başlat
 */
async function getCalendarClient() {
    if (calendarClient) return calendarClient;

    const keyFile = process.env.GOOGLE_CALENDAR_KEY_FILE;
    if (!keyFile) {
        console.log('⚠️ [GoogleCalendar] GOOGLE_CALENDAR_KEY_FILE not configured, sync disabled');
        return null;
    }

    try {
        const keyFilePath = path.isAbsolute(keyFile) ? keyFile : path.join(__dirname, '..', keyFile);
        
        if (!fs.existsSync(keyFilePath)) {
            console.error(`❌ [GoogleCalendar] Key file not found: ${keyFilePath}`);
            return null;
        }

        const auth = new google.auth.GoogleAuth({
            keyFile: keyFilePath,
            scopes: ['https://www.googleapis.com/auth/calendar']
        });

        calendarClient = google.calendar({ version: 'v3', auth });
        console.log('✅ [GoogleCalendar] Client initialized successfully');
        return calendarClient;
    } catch (error) {
        console.error('❌ [GoogleCalendar] Failed to initialize:', error.message);
        return null;
    }
}

/**
 * Randevuyu Google Calendar'a sync et
 */
export async function syncToGoogleCalendar(appointment) {
    const client = await getCalendarClient();
    if (!client) return null;

    const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';

    try {
        const event = {
            summary: appointment.title,
            description: buildEventDescription(appointment),
            start: {
                dateTime: appointment.startTime.toISOString(),
                timeZone: 'Europe/Istanbul'
            },
            end: {
                dateTime: appointment.endTime.toISOString(),
                timeZone: 'Europe/Istanbul'
            },
            colorId: getGoogleCalendarColorId(appointment.color),
            reminders: {
                useDefault: false,
                overrides: [
                    { method: 'popup', minutes: 30 },
                    { method: 'popup', minutes: 10 }
                ]
            }
        };

        // Add attendee email if available
        if (appointment.contactEmail) {
            event.attendees = [{ email: appointment.contactEmail }];
        }

        const result = await client.events.insert({
            calendarId,
            resource: event,
            sendUpdates: appointment.contactEmail ? 'all' : 'none'
        });

        console.log(`✅ [GoogleCalendar] Event created: ${result.data.id} — ${appointment.title}`);
        return result.data;
    } catch (error) {
        console.error('❌ [GoogleCalendar] Failed to create event:', error.message);
        return null;
    }
}

/**
 * Google Calendar'dan event sil
 */
export async function deleteFromGoogleCalendar(googleEventId) {
    const client = await getCalendarClient();
    if (!client || !googleEventId) return;

    const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';

    try {
        await client.events.delete({
            calendarId,
            eventId: googleEventId
        });
        console.log(`✅ [GoogleCalendar] Event deleted: ${googleEventId}`);
    } catch (error) {
        console.error('❌ [GoogleCalendar] Failed to delete event:', error.message);
    }
}

/**
 * Google Calendar'dan belirli gün için etkinlikleri çek (availability check için)
 */
export async function getCalendarEventsForDate(date) {
    const client = await getCalendarClient();
    if (!client) return [];

    const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';

    try {
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);

        const result = await client.events.list({
            calendarId,
            timeMin: startOfDay.toISOString(),
            timeMax: endOfDay.toISOString(),
            singleEvents: true,
            orderBy: 'startTime'
        });

        return (result.data.items || []).map(event => ({
            id: event.id,
            summary: event.summary,
            start: new Date(event.start.dateTime || event.start.date),
            end: new Date(event.end.dateTime || event.end.date)
        }));
    } catch (error) {
        console.error('❌ [GoogleCalendar] Failed to fetch events:', error.message);
        return [];
    }
}

// ─── HELPERS ────────────────────────────────────────────────────────────────

function buildEventDescription(appointment) {
    const parts = [];
    if (appointment.contactName) parts.push(`👤 Hasta: ${appointment.contactName}`);
    if (appointment.contactPhone) parts.push(`📱 Telefon: ${appointment.contactPhone}`);
    if (appointment.branch) parts.push(`🏥 Branş: ${appointment.branch}`);
    if (appointment.procedure) parts.push(`📝 İşlem: ${appointment.procedure}`);
    if (appointment.doctorName) parts.push(`👨‍⚕️ Doktor: ${appointment.doctorName}`);
    if (appointment.description) parts.push(`\n${appointment.description}`);
    if (appointment.createdByBotId) parts.push(`\n🤖 Bot tarafından oluşturuldu`);
    return parts.join('\n');
}

function getGoogleCalendarColorId(hexColor) {
    // Google Calendar color IDs (1-11)
    const colorMap = {
        '#7986cb': '1',  // Lavender
        '#33b679': '2',  // Sage
        '#8e24aa': '3',  // Grape
        '#e67c73': '4',  // Flamingo
        '#f6bf26': '5',  // Banana
        '#f4511e': '6',  // Tangerine
        '#039be5': '7',  // Peacock
        '#616161': '8',  // Graphite
        '#3f51b5': '9',  // Blueberry
        '#0b8043': '10', // Basil
        '#d50000': '11', // Tomato
    };

    // Default mappings for common app colors
    if (hexColor === '#10b981' || hexColor === '#059669') return '2'; // Green → Sage
    if (hexColor === '#3b82f6') return '7'; // Blue → Peacock
    if (hexColor === '#ef4444') return '11'; // Red → Tomato
    if (hexColor === '#f59e0b') return '5'; // Yellow → Banana

    return colorMap[hexColor] || '7'; // Default to Peacock (blue)
}
