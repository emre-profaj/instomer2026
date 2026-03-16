import { PrismaClient } from '@prisma/client';
import Retell from 'retell-sdk';
import { createNotification } from './notification.controller.js';
import { normalizePhone } from '../utils/phoneNormalizer.js';
import { emitToWorkspace } from '../socket.js';

const prisma = new PrismaClient();

// Get Retell settings for a workspace
export const getSettings = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: {
                retellApiKey: true,
                retellAgentId: true,
                retellFromNumber: true,
                retellAutoCallEnabled: true,
                retellAutoCallTriggers: true,
                retellAutoCallDelay: true,
                retellAutoCallSchedule: true
            }
        });

        res.json({
            retellApiKey: workspace?.retellApiKey ? '••••••••' + workspace.retellApiKey.slice(-4) : null,
            retellAgentId: workspace?.retellAgentId || null,
            retellFromNumber: workspace?.retellFromNumber || null,
            isConfigured: !!(workspace?.retellApiKey && workspace?.retellAgentId),
            retellAutoCallEnabled: workspace?.retellAutoCallEnabled || false,
            retellAutoCallTriggers: workspace?.retellAutoCallTriggers || {},
            retellAutoCallDelay: workspace?.retellAutoCallDelay ?? 30,
            retellAutoCallSchedule: workspace?.retellAutoCallSchedule || { start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5] }
        });
    } catch (error) {
        console.error('❌ [Retell] Get settings error:', error);
        res.status(500).json({ error: 'Failed to get Retell settings' });
    }
};

// Save Retell settings
export const saveSettings = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { retellApiKey, retellAgentId, retellFromNumber,
            retellAutoCallEnabled, retellAutoCallTriggers, retellAutoCallDelay, retellAutoCallSchedule } = req.body;

        const updateData = {};
        if (retellApiKey !== undefined) updateData.retellApiKey = retellApiKey;
        if (retellAgentId !== undefined) updateData.retellAgentId = retellAgentId;
        if (retellFromNumber !== undefined) updateData.retellFromNumber = retellFromNumber;
        if (retellAutoCallEnabled !== undefined) updateData.retellAutoCallEnabled = retellAutoCallEnabled;
        if (retellAutoCallTriggers !== undefined) updateData.retellAutoCallTriggers = retellAutoCallTriggers;
        if (retellAutoCallDelay !== undefined) updateData.retellAutoCallDelay = retellAutoCallDelay;
        if (retellAutoCallSchedule !== undefined) updateData.retellAutoCallSchedule = retellAutoCallSchedule;

        await prisma.workspace.update({
            where: { id: workspaceId },
            data: updateData
        });

        console.log(`✅ [Retell] Settings updated for workspace ${workspaceId}`);
        res.json({ success: true, message: 'Retell ayarları kaydedildi' });
    } catch (error) {
        console.error('❌ [Retell] Save settings error:', error);
        res.status(500).json({ error: 'Failed to save Retell settings' });
    }
};

// Deduplication: prevent calling same number within 5 minutes
const recentAutoCallNumbers = new Map(); // phone -> timestamp

/**
 * Parse preferred contact date+time from message content.
 * Detects:
 *   - Time ranges: "15:00-18:00", "saat 15-18 arası"
 *   - Specific dates: "12.03.2026", "12 Mart", "yarın", "bugün"
 *   - Single times: "15:00'te arayın", "saat 14'te"
 * Returns { startHour, startMinute, endHour, endMinute, targetDate? } or null
 */
/**
 * detectCallRequestInMessage
 * Detects if a customer message requests a call (immediate or scheduled).
 * Returns:
 *   { type: 'immediate' }    → call now
 *   { type: 'scheduled', scheduledAt: Date }  → call at specific time
 *   null → no call request
 */
export function detectCallRequestInMessage(text) {
    if (!text || typeof text !== 'string') return null;
    const t = text.toLowerCase().trim();
    const now = new Date();
    let scheduledAt = null;


    // === CHECK FOR SPECIFIC TIME FIRST ===
    // "10:55 de", "saat 15:00", "15.30'da", "10 55", "11:00'de" etc.
    const timeMatch = t.match(/(?:saat\s+)?(\d{1,2})[:\.](\d{2})(?:\s*(?:de|da|te|ta|'de|'da|'te|'ta))?/);
    if (timeMatch) {
        const h = parseInt(timeMatch[1]);
        const m = parseInt(timeMatch[2]);
        if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
            const target = new Date();
            target.setHours(h, m, 0, 0);
            if (target <= now) target.setDate(target.getDate() + 1);
            if (/yarın/.test(t)) target.setDate(now.getDate() + 1);
            scheduledAt = target;
        }
    }

    // "saat 15'te" / "saat 3'te" (hour only, no minutes)
    if (!scheduledAt) {
        const hourOnly = t.match(/(?:saat\s+)(\d{1,2})(?:'[a-zçğıöşü]+|\s+de|\s+da|\s+te|\s+ta)/);
        if (hourOnly) {
            const h = parseInt(hourOnly[1]);
            if (h >= 0 && h <= 23) {
                const target = new Date();
                target.setHours(h, 0, 0, 0);
                if (target <= now) target.setDate(target.getDate() + 1);
                if (/yarın/.test(t)) target.setDate(now.getDate() + 1);
                scheduledAt = target;
            }
        }
    }

    // If we found a specific time AND a call-related verb → schedule for that time
    const hasCallVerb = /\bara\b|\barayın\b|\barayabilir\b|\barar\b|\bcall\b|\btelefon\b|\biletişim\b|\bgörüş\b/.test(t);
    if (scheduledAt && hasCallVerb) return { type: 'scheduled', scheduledAt };

    // === NO TIME FOUND → check for immediate call keywords ===
    const immediatePatterns = [
        // Türkçe - temel
        /\bbeni\s+ara\b/, /\bbeni\s+arayın\b/, /\bbeni\s+arar\s+mısınız\b/,
        /\bbeni\s+arar\s+mısın\b/, /\bbeni\s+arayabilir\s+misin\b/, /\bbeni\s+arayabilir\s+misiniz\b/,
        /\bhemen\s+ara\b/, /\bhemen\s+arayın\b/, /\bşimdi\s+ara\b/, /\bşimdi\s+arayın\b/,
        /\blütfen\s+ara\b/, /\blütfen\s+arayın\b/, /\blütfen\s+arar\s+mısınız\b/,
        /\barayın\b/, /\barayabilir\s+misiniz\b/, /\barayabilir\s+misin\b/,
        /\barar\s+mısınız\b/, /\barar\s+mısın\b/, /\barar\s+misiniz\b/,
        /\barayabilir\b/, /\baramı\s+bekle\b/, /\baramı\s+bekleyin\b/,
        /\btelefon\s+et\b/, /\btelefon\s+eder\s+misiniz\b/, /\btelefon\s+eder\s+misin\b/,
        /\btelefon\s+açar\s+mısınız\b/, /\btelefon\s+açar\s+mısın\b/,
        /\btelefonla\s+ara\b/, /\btelefonla\s+arayın\b/,
        /\bsizi\s+arayın\b/, /\bsizi\s+arasın\b/,
        /\biletişime\s+geç\b/, /\biletişime\s+geçin\b/,
        /\bsöyleşelim\b/, /\bgörüşelim\b/, /\bkonuşalım\b/,
        // İngilizce
        /\bcall\s+me\b/, /\bcall\s+now\b/, /\bplease\s+call\b/, /\bgive\s+me\s+a\s+call\b/,
        /\bcan\s+you\s+call\b/, /\bcould\s+you\s+call\b/, /\bwould\s+you\s+call\b/,
        /\breach\s+out\b/, /\bcontact\s+me\b/, /\bphone\s+me\b/, /\bring\s+me\b/,
    ];

    for (const p of immediatePatterns) {
        if (p.test(t)) return { type: 'immediate' };
    }

    return null;
}


function parsePreferredTime(messageContent) {

    if (!messageContent || typeof messageContent !== 'string') return null;

    const text = messageContent.toLowerCase();

    // ⚠️ GUARD: Only parse preferred time if message contains a call-related verb.
    // Without this check, form metadata timestamps (e.g. "13.03.2026 14:15") would be
    // misinterpreted as customer-requested call times, causing next-day scheduling.
    const hasCallIntent = /\bara\b|\barayın\b|\barayabilir\b|\barar\b|\bcall\b|\btelefon\b|\biletişim\b|\bgörüş\b|\bulaşın\b|\bulaşabilir\b/.test(text);
    if (!hasCallIntent) return null;
    let result = null;

    // === TIME PARSING ===

    // Pattern 1: "15:00-18:00" or "15.00-18.00" or "15:00 - 18:00"
    const rangeMatch = text.match(/(\d{1,2})[:\.](\d{2})\s*[-–]\s*(\d{1,2})[:\.](\d{2})/);
    if (rangeMatch) {
        const [, sh, sm, eh, em] = rangeMatch;
        const startH = parseInt(sh), startM = parseInt(sm), endH = parseInt(eh), endM = parseInt(em);
        if (startH >= 0 && startH <= 23 && endH >= 0 && endH <= 23) {
            result = { startHour: startH, startMinute: startM, endHour: endH, endMinute: endM };
        }
    }

    // Pattern 2: "saat 15-18" or "15-18 arası" (hour only)
    if (!result) {
        const hourRangeMatch = text.match(/(?:saat|aras[ıi]|ulaş|zaman|dilim)[^0-9]*(\d{1,2})\s*[-–]\s*(\d{1,2})/);
        if (hourRangeMatch) {
            const startH = parseInt(hourRangeMatch[1]), endH = parseInt(hourRangeMatch[2]);
            if (startH >= 6 && startH <= 23 && endH >= 6 && endH <= 23) {
                result = { startHour: startH, startMinute: 0, endHour: endH, endMinute: 0 };
            }
        }
    }

    // Pattern 3: standalone "15-18 arası" or "15-18 saat"
    if (!result) {
        const standAloneRange = text.match(/(\d{1,2})\s*[-–]\s*(\d{1,2})\s*(?:arası|arasi|saat)/);
        if (standAloneRange) {
            const startH = parseInt(standAloneRange[1]), endH = parseInt(standAloneRange[2]);
            if (startH >= 6 && startH <= 23 && endH >= 6 && endH <= 23) {
                result = { startHour: startH, startMinute: 0, endHour: endH, endMinute: 0 };
            }
        }
    }

    // Pattern 4: Single time - "15:00'te arayın", "saat 14'te", "14:30'da"
    if (!result) {
        const singleTimeMatch = text.match(/(?:saat\s*)?(\d{1,2})[:\.]?(\d{2})?\s*['']?\s*(?:te|da|de|'te|'da)/);
        if (singleTimeMatch) {
            const h = parseInt(singleTimeMatch[1]);
            const m = parseInt(singleTimeMatch[2] || '0');
            if (h >= 6 && h <= 23) {
                // Single time → create a 1-hour window starting from that time
                result = { startHour: h, startMinute: m, endHour: Math.min(h + 1, 23), endMinute: m };
            }
        }
    }

    if (!result) return null;

    // === DATE PARSING ===
    const turkishMonths = {
        'ocak': 0, 'şubat': 1, 'mart': 2, 'nisan': 3, 'mayıs': 4, 'haziran': 5,
        'temmuz': 6, 'ağustos': 7, 'eylül': 8, 'ekim': 9, 'kasım': 10, 'aralık': 11,
        'subat': 1, 'mayis': 4, 'agustos': 7, 'eylul': 8, 'kasim': 10, 'aralik': 11
    };

    const now = new Date();

    // Pattern A: "12.03.2026" or "12/03/2026" or "12-03-2026"
    const fullDateMatch = text.match(/(\d{1,2})[\.\/\-](\d{1,2})[\.\/\-](\d{4})/);
    if (fullDateMatch) {
        const day = parseInt(fullDateMatch[1]);
        const month = parseInt(fullDateMatch[2]) - 1; // 0-indexed
        const year = parseInt(fullDateMatch[3]);
        const target = new Date(year, month, day);
        if (target >= now || target.toDateString() === now.toDateString()) {
            result.targetDate = target;
            console.log(`📅 [AutoCall] Parsed specific date: ${day}.${month + 1}.${year}`);
        }
    }

    // Pattern B: "12 Mart" or "12 mart"
    if (!result.targetDate) {
        for (const [monthName, monthIndex] of Object.entries(turkishMonths)) {
            const datePattern = new RegExp(`(\\d{1,2})\\s+${monthName}`);
            const match = text.match(datePattern);
            if (match) {
                const day = parseInt(match[1]);
                let year = now.getFullYear();
                let target = new Date(year, monthIndex, day);
                // If the date is in the past, assume next year
                if (target < now && target.toDateString() !== now.toDateString()) {
                    target = new Date(year + 1, monthIndex, day);
                }
                result.targetDate = target;
                console.log(`📅 [AutoCall] Parsed date: ${day} ${monthName} ${target.getFullYear()}`);
                break;
            }
        }
    }

    // Pattern C: "yarın" (tomorrow) or "bugün" (today)
    if (!result.targetDate) {
        if (text.includes('yarın') || text.includes('yarin')) {
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            result.targetDate = tomorrow;
            console.log(`📅 [AutoCall] Parsed: yarın (tomorrow)`);
        } else if (text.includes('bugün') || text.includes('bugun')) {
            result.targetDate = new Date(now);
            console.log(`📅 [AutoCall] Parsed: bugün (today)`);
        }
    }

    // Pattern D: Turkish day names - "pazartesi", "salı" etc.
    if (!result.targetDate) {
        const dayNames = {
            'pazartesi': 1, 'salı': 2, 'sali': 2, 'çarşamba': 3, 'carsamba': 3,
            'perşembe': 4, 'persembe': 4, 'cuma': 5, 'cumartesi': 6, 'pazar': 0
        };
        for (const [dayName, dayIndex] of Object.entries(dayNames)) {
            if (text.includes(dayName)) {
                const today = now.getDay();
                let daysAhead = dayIndex - today;
                if (daysAhead <= 0) daysAhead += 7; // Next week
                const target = new Date(now);
                target.setDate(target.getDate() + daysAhead);
                result.targetDate = target;
                console.log(`📅 [AutoCall] Parsed day name: ${dayName} (${daysAhead} days ahead)`);
                break;
            }
        }
    }

    console.log(`🕐 [AutoCall] Parsed preferred time: ${result.startHour}:${String(result.startMinute).padStart(2, '0')}-${result.endHour}:${String(result.endMinute).padStart(2, '0')}${result.targetDate ? ` on ${result.targetDate.toLocaleDateString('tr-TR')}` : ''}`);
    return result;
}

/**
 * Calculate milliseconds until next valid call window.
 *
 * Scenarios:
 *  - insideWindowDelayMs > 0 and currently INSIDE window → apply that delay (e.g. 5 min)
 *  - currently OUTSIDE window (or wrong day) → delay until start of next business window
 *  - no schedule → return 0 (call now)
 *
 * @param {Object|null} preferredTime - { startHour, startMinute, endHour, endMinute, targetDate? }
 * @param {Object|null} schedule - { start: '09:00', end: '18:00', days: [0..6] }
 * @param {number} insideWindowDelayMs - extra ms to add when INSIDE the window (default 0)
 * @returns {number} delay in ms (0 = call now)
 */
function calculateCallDelay(preferredTime, schedule, insideWindowDelayMs = 0) {
    const now = new Date();

    // === PRIORITY 1: Preferred time from message (with optional specific date) ===
    if (preferredTime) {
        const { startHour, startMinute, endHour, endMinute, targetDate } = preferredTime;

        if (targetDate) {
            const target = new Date(targetDate);
            target.setHours(startHour, startMinute, 0, 0);
            if (target <= now) {
                const endToday = new Date(targetDate);
                endToday.setHours(endHour, endMinute, 0, 0);
                if (endToday > now) {
                    console.log(`🕐 [AutoCall] Specific date+time: within window, calling now`);
                    return 0;
                }
                target.setDate(target.getDate() + 1);
                target.setHours(startHour, startMinute, 0, 0);
            }
            const delayMs = target.getTime() - now.getTime();
            console.log(`🕐 [AutoCall] Scheduling for specific date: ${target.toLocaleString('tr-TR')} (delay: ${Math.round(delayMs / 1000)}s)`);
            return Math.max(0, delayMs);
        }

        const currentTotalMinutes = now.getHours() * 60 + now.getMinutes();
        const startTotal = startHour * 60 + startMinute;
        const endTotal = endHour * 60 + endMinute;

        if (currentTotalMinutes >= startTotal && currentTotalMinutes < endTotal) {
            return 0;
        }

        const target = new Date(now);
        if (currentTotalMinutes < startTotal) {
            target.setHours(startHour, startMinute, 0, 0);
        } else {
            target.setDate(target.getDate() + 1);
            target.setHours(startHour, startMinute, 0, 0);
        }
        const delayMs = target.getTime() - now.getTime();
        console.log(`🕐 [AutoCall] Preferred time window: scheduling for ${target.toLocaleString('tr-TR')}`);
        return Math.max(0, delayMs);
    }

    // === PRIORITY 2: Rule schedule (callStart/callEnd) ===
    if (!schedule) {
        // No schedule defined → call after insideWindowDelayMs (or immediately)
        return insideWindowDelayMs;
    }

    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentDay = now.getDay();

    const [sH, sM] = (schedule.start || '09:00').split(':').map(Number);
    const [eH, eM] = (schedule.end || '18:00').split(':').map(Number);
    const startHour = sH, startMinute = sM || 0;
    const endHour = eH, endMinute = eM || 0;

    // Check if current day is allowed
    if (schedule.days && Array.isArray(schedule.days) && schedule.days.length > 0) {
        if (!schedule.days.includes(currentDay)) {
            let daysToWait = 1;
            for (let i = 1; i <= 7; i++) {
                const nextDay = (currentDay + i) % 7;
                if (schedule.days.includes(nextDay)) {
                    daysToWait = i;
                    break;
                }
            }
            const target = new Date(now);
            target.setDate(target.getDate() + daysToWait);
            target.setHours(startHour, startMinute, 0, 0);
            const delayMs = target.getTime() - now.getTime();
            console.log(`🕐 [AutoCall] Day not allowed (${currentDay}), scheduling for ${daysToWait} day(s) later at ${target.toLocaleString('tr-TR')}`);
            return Math.max(0, delayMs);
        }
    }

    const currentTotal = currentHour * 60 + currentMinute;
    const startTotal = startHour * 60 + startMinute;
    const endTotal = endHour * 60 + endMinute;

    if (currentTotal >= startTotal && currentTotal < endTotal) {
        // ✅ INSIDE business hours → apply 5-minute (or configured) delay
        console.log(`🕐 [AutoCall] Inside business hours window. Applying inside-window delay: ${Math.round(insideWindowDelayMs / 1000)}s`);
        return insideWindowDelayMs;
    }

    // ❌ OUTSIDE business hours → schedule for start of NEXT valid window
    const target = new Date(now);
    if (currentTotal < startTotal) {
        // Before today's window starts
        target.setHours(startHour, startMinute, 0, 0);
    } else {
        // After today's window ended — next day (or next valid day)
        target.setDate(target.getDate() + 1);
        // If days filter exists, advance to next allowed day
        if (schedule.days && Array.isArray(schedule.days) && schedule.days.length > 0) {
            for (let i = 0; i < 7; i++) {
                const testDay = new Date(target);
                testDay.setDate(testDay.getDate() + i);
                if (schedule.days.includes(testDay.getDay())) {
                    target.setDate(testDay.getDate());
                    break;
                }
            }
        }
        target.setHours(startHour, startMinute, 0, 0);
    }

    const delayMs = target.getTime() - now.getTime();
    console.log(`🕐 [AutoCall] OUTSIDE business hours (${startHour}:${String(startMinute).padStart(2,'0')}–${endHour}:${String(endMinute).padStart(2,'0')}). Next window: ${target.toLocaleString('tr-TR')}`);
    return Math.max(0, delayMs);
}

/**
 * Trigger an automatic call based on workspace settings
 * Called internally from webhook controllers
 * @param {string} workspaceId
 * @param {string} phoneNumber - Phone number to call
 * @param {string|null} contactId - Optional contact ID
 * @param {string} contactName - Contact name for personalization
 * @param {string} triggerSource - One of: onNewLead, onWhatsApp, onMessenger, onWebForm, onMissedChat
 * @param {string|null} messageContent - Optional message content to parse for preferred time
 */
export const triggerAutoCall = async (workspaceId, phoneNumber, contactId, contactName, triggerSource, messageContent = null) => {
    try {
        if (!phoneNumber || !workspaceId) return;

        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: {
                retellApiKey: true,
                retellAgentId: true,
                retellFromNumber: true,
                retellAutoCallEnabled: true,
                retellAutoCallTriggers: true,
                retellAutoCallDelay: true,
                retellAutoCallSchedule: true
            }
        });

        // Check if auto-call is enabled and configured
        if (!workspace?.retellAutoCallEnabled) return;
        if (!workspace.retellApiKey || !workspace.retellAgentId || !workspace.retellFromNumber) {
            console.log(`⏭️ [AutoCall] Skipping: workspace ${workspaceId} not fully configured`);
            return;
        }

        // CHAT_REQUEST: user asked to be called from chat → bypass trigger config, use workspace defaults
        let triggerConfig;
        if (triggerSource === 'CHAT_REQUEST') {
            if (!workspace.retellApiKey || !workspace.retellAgentId || !workspace.retellFromNumber) {
                console.log(`⏭️ [AutoCall] CHAT_REQUEST: workspace not fully configured`);
                return;
            }
            // Synthetic config: call immediately with no delay, no status filter
            triggerConfig = { enabled: true, delay: 0, agentId: workspace.retellAgentId };
        } else {
            // Check if this trigger source is enabled (specific channel OR 'ALL' catch-all)
            const triggers = workspace.retellAutoCallTriggers || {};
            triggerConfig = triggers[triggerSource] || triggers['ALL'];
            if (!triggerConfig || !triggerConfig.enabled) {
                console.log(`⏭️ [AutoCall] Skipping: trigger "${triggerSource}" (and ALL) disabled for workspace ${workspaceId}`);
                return;
            }
        }


        // Normalize phone number
        const formattedPhone = normalizePhone(phoneNumber);
        if (!formattedPhone || formattedPhone.length < 10) {
            console.log(`⏭️ [AutoCall] Skipping: invalid phone "${phoneNumber}"`);
            return;
        }

        // Status filter: if rule has a status requirement, check contact's status
        if (triggerConfig.status && contactId) {
            const contactRecord = await prisma.contact.findUnique({
                where: { id: contactId },
                select: { status: true }
            });
            if (contactRecord && contactRecord.status !== triggerConfig.status) {
                console.log(`⏭️ [AutoCall] Skipping: contact status "${contactRecord.status}" does not match rule requirement "${triggerConfig.status}"`);
                return;
            }
        }

        // Deduplication: don't auto-call the same number more than once in 24 hours
        const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const recentCall = await prisma.retellCall.findFirst({
            where: {
                workspaceId,
                toNumber: formattedPhone,
                createdAt: { gte: since24h }
            }
        });

        if (recentCall) {
            console.log(`⏭️ [AutoCall] Skipping: ${formattedPhone} was already auto-called in the last 24h. Manual calls unaffected.`);
            return;
        }

        // Extract rule-specific config
        const ruleDelay = triggerConfig.delay !== undefined ? triggerConfig.delay : workspace.retellAutoCallDelay;
        const ruleAgentId = triggerConfig.agentId || workspace.retellAgentId;

        if (!ruleAgentId) {
            console.log(`⏭️ [AutoCall] Skipping: no agent ID configured for trigger ${triggerSource}`);
            return;
        }

        // 🕐 SMART SCHEDULING
        // 1. detectCallRequestInMessage: does the customer explicitly ask to be called?
        //    - type:'immediate' ("hemen ara", "beni arayın" etc.) → bypass schedule, call NOW
        //    - type:'scheduled' (e.g. "saat 15:00'te arayın")   → use that scheduledAt time
        //    - null → fall through to business-hours logic
        // 2. parsePreferredTime: does the message contain a preferred time window?
        //    (e.g. "15:00-18:00 arası arayın") → schedule to that window
        // 3. Business hours: inside → 5min delay, outside → wait until next window start
        const INSIDE_WINDOW_DELAY_MS = 5 * 60 * 1000; // 5 minutes

        const callDetect = detectCallRequestInMessage(messageContent);

        let scheduleDelay;

        if (callDetect?.type === 'immediate') {
            // Customer explicitly said "hemen ara", "beni arayın" etc. → ignore schedule
            scheduleDelay = 0;
            console.log(`📞 [AutoCall] Customer requested IMMEDIATE call — bypassing business hours`);

        } else if (callDetect?.type === 'scheduled' && callDetect.scheduledAt) {
            // Customer said "saat 15:00'te ara" → schedule for that exact time
            const delayMs = callDetect.scheduledAt.getTime() - Date.now();
            scheduleDelay = Math.max(0, delayMs);
            console.log(`📞 [AutoCall] Customer requested call at ${callDetect.scheduledAt.toLocaleString('tr-TR')}. Delay: ${Math.round(scheduleDelay / 1000)}s`);

        } else {
            // No explicit customer request → apply business hours logic
            const preferredTime = parsePreferredTime(messageContent); // time-window preference
            const ruleSchedule = (triggerConfig.callStart && triggerConfig.callEnd) ? {
                start: triggerConfig.callStart,
                end: triggerConfig.callEnd,
                days: workspace.retellAutoCallSchedule?.days || [0, 1, 2, 3, 4, 5, 6]
            } : workspace.retellAutoCallSchedule;

            // Inside window → 5min delay, outside window → wait until start of next window
            scheduleDelay = calculateCallDelay(preferredTime, ruleSchedule, INSIDE_WINDOW_DELAY_MS);

            if (preferredTime) {
                console.log(`📞 [AutoCall] Preferred time window from message. Delay: ${Math.round(scheduleDelay / 1000)}s`);
            } else if (scheduleDelay >= INSIDE_WINDOW_DELAY_MS && scheduleDelay < 2 * INSIDE_WINDOW_DELAY_MS) {
                console.log(`📞 [AutoCall] Inside business hours — 5-minute delay applied`);
            } else if (scheduleDelay > 0) {
                console.log(`📞 [AutoCall] Outside business hours — waiting until next window (${Math.round(scheduleDelay / 1000 / 60)} min)`);
            }
        }



        const ruleDelayMs = (ruleDelay || 0) * 1000;
        // Use the LARGER of schedule-based or per-rule fixed delay
        const totalDelay = Math.max(scheduleDelay, ruleDelayMs);

        const scheduledAt = new Date(Date.now() + totalDelay);
        console.log(`📅 [AutoCall] Scheduling call to ${formattedPhone} at ${scheduledAt.toLocaleString('tr-TR')} (delay: ${Math.round(totalDelay / 1000)}s)`);

        if (totalDelay > 2 * 60 * 1000) {
            // Stagger: if other calls already scheduled near the same time, offset by 1 min each
            const existingNearby = await prisma.scheduledCall.count({
                where: {
                    workspaceId,
                    status: 'PENDING',
                    scheduledAt: {
                        gte: scheduledAt,
                        lt: new Date(scheduledAt.getTime() + 60 * 60 * 1000) // within 1 hour window
                    }
                }
            });
            const staggeredAt = new Date(scheduledAt.getTime() + existingNearby * 60 * 1000);
            if (existingNearby > 0) {
                console.log(`📅 [AutoCall] Staggering: ${existingNearby} call(s) already queued near ${scheduledAt.toLocaleTimeString('tr-TR')}, offsetting by ${existingNearby} min → ${staggeredAt.toLocaleString('tr-TR')}`);
            }
            await prisma.scheduledCall.create({
                data: {
                    workspaceId,
                    contactId: contactId || null,
                    contactName: contactName || null,
                    toNumber: formattedPhone,
                    scheduledAt: staggeredAt,
                    status: 'PENDING',
                    createdById: 'auto'
                }
            });
            console.log(`📅 [AutoCall] Saved ScheduledCall to DB for ${staggeredAt.toLocaleString('tr-TR')}`);

        } else {
            setTimeout(async () => {
                try {
                    await executeScheduledCall(workspaceId, formattedPhone, ruleAgentId, contactId, contactName, triggerSource);
                } catch (callErr) {
                    console.error(`❌ [AutoCall] Failed to call ${formattedPhone}:`, callErr.message);
                }
            }, totalDelay);
        }

    } catch (error) {
        console.error('❌ [AutoCall] triggerAutoCall error:', error.message);
    }
};

// Execute a phone call via Retell API (used by both immediate & scheduled calls)
async function executeScheduledCall(workspaceId, toNumber, agentId, contactId, contactName, triggerSource = 'AUTO') {
    const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { retellApiKey: true, retellFromNumber: true, retellAgentId: true }
    });
    if (!workspace?.retellApiKey) throw new Error('No Retell API key');
    const ruleAgentId = agentId || workspace.retellAgentId;
    const client = new Retell({ apiKey: workspace.retellApiKey });
    const callResponse = await client.call.createPhoneCall({
        from_number: workspace.retellFromNumber,
        to_number: toNumber,
        override_agent_id: ruleAgentId,
        metadata: { workspaceId, contactId: contactId || null, contactName: contactName || null, autoCallTrigger: triggerSource },
        retell_llm_dynamic_variables: { customer_name: contactName || 'Müşteri' }
    });
    await prisma.retellCall.create({
        data: {
            workspace: { connect: { id: workspaceId } },
            contactId: contactId || null,
            callId: callResponse.call_id,
            agentId: ruleAgentId,
            fromNumber: workspace.retellFromNumber,
            toNumber,
            direction: 'outbound',
            status: callResponse.call_status || 'registered',
            createdById: ''
        }
    });
    emitToWorkspace(workspaceId, 'auto_call_started', { callId: callResponse.call_id, toNumber, contactName, trigger: triggerSource });
    console.log(`✅ [AutoCall] Call started: ${callResponse.call_id} → ${toNumber} (trigger: ${triggerSource})`);
}

// Cron: process due ScheduledCalls every 60 seconds (persistent across restarts)
export const processScheduledCalls = async () => {
    try {
        const dueCalls = await prisma.scheduledCall.findMany({
            where: { status: 'PENDING', scheduledAt: { lte: new Date() } },
            take: 20
        });
        if (dueCalls.length > 0) console.log(`📅 [ScheduledCall] Processing ${dueCalls.length} due call(s)`);
        for (const sc of dueCalls) {
            try {
                // Auto-cancel if overdue > 2 hours (missed window)
                const overdueMs = Date.now() - new Date(sc.scheduledAt).getTime();
                if (overdueMs > 2 * 60 * 60 * 1000) {
                    await prisma.scheduledCall.update({ where: { id: sc.id }, data: { status: 'CANCELLED', errorMessage: 'Missed window (>2h overdue)' } });
                    console.log(`📅 [ScheduledCall] Auto-cancelled overdue call for ${sc.toNumber}`);
                    continue;
                }
                // Dedup: skip if already called this number in last 24h
                const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
                const recentCall = await prisma.retellCall.findFirst({
                    where: { workspaceId: sc.workspaceId, toNumber: sc.toNumber, createdAt: { gte: since24h } }
                });
                if (recentCall) {
                    await prisma.scheduledCall.update({ where: { id: sc.id }, data: { status: 'CANCELLED', errorMessage: 'Dedup: already called in last 24h' } });
                    console.log(`📅 [ScheduledCall] Cancelled (dedup) for ${sc.toNumber} — already called`);
                    continue;
                }
                // Mark COMPLETED first to prevent duplicate execution on concurrent runs
                await prisma.scheduledCall.update({ where: { id: sc.id }, data: { status: 'COMPLETED' } });
                const ws = await prisma.workspace.findUnique({ where: { id: sc.workspaceId }, select: { retellAgentId: true } });
                await executeScheduledCall(sc.workspaceId, sc.toNumber, ws?.retellAgentId, sc.contactId, sc.contactName, 'SCHEDULED');
            } catch (err) {
                console.error(`❌ [ScheduledCall] Failed for ${sc.toNumber}:`, err.message);
                await prisma.scheduledCall.update({ where: { id: sc.id }, data: { status: 'FAILED', errorMessage: err.message } }).catch(() => {});
            }
        }

    } catch (e) {
        console.error('❌ [ScheduledCall] Processor error:', e.message);
    }
};


// Get agents from Retell
export const getAgents = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { retellApiKey: true }
        });

        if (!workspace?.retellApiKey) {
            return res.status(400).json({ error: 'Retell API key yapılandırılmamış' });
        }

        const client = new Retell({ apiKey: workspace.retellApiKey });
        const agents = await client.agent.list();

        res.json({ agents: agents || [] });
    } catch (error) {
        console.error('❌ [Retell] Get agents error:', error);
        res.status(500).json({ error: 'Failed to fetch Retell agents' });
    }
};

// Make an outbound call
export const makeCall = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { toNumber, contactId, contactName, conversationId: sourceConversationId } = req.body;
        const userId = req.user.id;

        if (!toNumber) {
            return res.status(400).json({ error: 'Telefon numarası gerekli' });
        }

        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { retellApiKey: true, retellAgentId: true, retellFromNumber: true }
        });

        if (!workspace?.retellApiKey || !workspace?.retellAgentId) {
            return res.status(400).json({ error: 'Retell ayarları yapılandırılmamış' });
        }

        if (!workspace.retellFromNumber) {
            return res.status(400).json({ error: 'Arama yapılacak numara yapılandırılmamış' });
        }

        const client = new Retell({ apiKey: workspace.retellApiKey });

        // Format phone number with proper normalization
        const formattedTo = normalizePhone(toNumber);

        const callResponse = await client.call.createPhoneCall({
            from_number: workspace.retellFromNumber,
            to_number: formattedTo,
            override_agent_id: workspace.retellAgentId,
            metadata: {
                workspaceId,
                contactId: contactId || null,
                contactName: contactName || null,
                createdById: userId
            },
            retell_llm_dynamic_variables: {
                customer_name: contactName || 'Müşteri'
            }
        });

        // Save call record
        const callRecord = await prisma.retellCall.create({
            data: {
                workspace: { connect: { id: workspaceId } },
                contactId: contactId || null,
                callId: callResponse.call_id,
                agentId: workspace.retellAgentId,
                fromNumber: workspace.retellFromNumber,
                toNumber: formattedTo,
                direction: 'outbound',
                status: callResponse.call_status || 'registered',
                createdById: userId,
                conversationId: sourceConversationId || null
            }
        });

        console.log(`📞 [Retell] Outbound call started: ${callResponse.call_id} -> ${formattedTo}`);
        res.json({
            success: true,
            callId: callResponse.call_id,
            status: callResponse.call_status,
            record: callRecord
        });
    } catch (error) {
        console.error('❌ [Retell] Make call error:', error);
        res.status(500).json({ error: error.message || 'Arama başlatılamadı' });
    }
};

// Get call history
export const getCallHistory = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { contactId, search, status, sentiment, callSuccessful, startDate, endDate, limit = 20, offset = 0 } = req.query;

        const where = { workspaceId };
        if (contactId) where.contactId = contactId;
        if (status) where.status = status;
        if (sentiment) where.sentiment = sentiment;
        if (callSuccessful === 'true') where.callSuccessful = true;
        if (callSuccessful === 'false') where.callSuccessful = false;

        if (startDate && endDate) {
            where.createdAt = {
                gte: new Date(startDate),
                lte: new Date(endDate)
            };
        }

        if (search) {
            where.OR = [
                { toNumber: { contains: search } },
                { fromNumber: { contains: search } }
            ];
        }

        const [calls, total] = await Promise.all([
            prisma.retellCall.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                take: parseInt(limit),
                skip: parseInt(offset)
            }),
            prisma.retellCall.count({ where })
        ]);

        res.json({ calls, total });
    } catch (error) {
        console.error('❌ [Retell] Get call history error:', error);
        res.status(500).json({ error: 'Failed to fetch call history' });
    }
};

// Bulk retry calls
export const bulkRetryCall = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { callIds } = req.body;
        const userId = req.user.id;

        if (!callIds || !Array.isArray(callIds) || callIds.length === 0) {
            return res.status(400).json({ error: 'Aranacak arama ID listesi gerekli' });
        }

        if (callIds.length > 100) {
            return res.status(400).json({ error: 'Tek seferde en fazla 100 arama yapılabilir' });
        }

        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { retellApiKey: true, retellAgentId: true, retellFromNumber: true }
        });

        if (!workspace?.retellApiKey || !workspace?.retellAgentId || !workspace?.retellFromNumber) {
            return res.status(400).json({ error: 'Retell ayarları eksik' });
        }

        // Get original calls to find phone numbers
        const originalCalls = await prisma.retellCall.findMany({
            where: { id: { in: callIds }, workspaceId }
        });

        if (originalCalls.length === 0) {
            return res.status(404).json({ error: 'Arama bulunamadı' });
        }

        const client = new Retell({ apiKey: workspace.retellApiKey });
        const results = { success: 0, failed: 0, errors: [] };

        for (const call of originalCalls) {
            try {
                const formattedTo = normalizePhone(call.toNumber);

                const callResponse = await client.call.createPhoneCall({
                    from_number: workspace.retellFromNumber,
                    to_number: formattedTo,
                    override_agent_id: workspace.retellAgentId,
                    metadata: {
                        workspaceId,
                        contactId: call.contactId || null,
                        contactName: null,
                        createdById: userId,
                        retryOf: call.id
                    },
                    retell_llm_dynamic_variables: {
                        customer_name: 'Müşteri'
                    }
                });

                await prisma.retellCall.create({
                    data: {
                        workspace: { connect: { id: workspaceId } },
                        contactId: call.contactId || null,
                        callId: callResponse.call_id,
                        agentId: workspace.retellAgentId,
                        fromNumber: workspace.retellFromNumber,
                        toNumber: formattedTo,
                        direction: 'outbound',
                        status: callResponse.call_status || 'registered',
                        createdById: userId
                    }
                });

                results.success++;
                console.log(`📞 [Retell] Retry call: ${formattedTo}`);

                // 1 second delay between calls to avoid rate limiting
                if (originalCalls.indexOf(call) < originalCalls.length - 1) {
                    await new Promise(r => setTimeout(r, 1000));
                }
            } catch (err) {
                results.failed++;
                results.errors.push({ number: call.toNumber, error: err.message });
                console.error(`❌ [Retell] Retry failed for ${call.toNumber}:`, err.message);
            }
        }

        console.log(`📞 [Retell] Bulk retry: ${results.success} success, ${results.failed} failed`);
        res.json(results);
    } catch (error) {
        console.error('❌ [Retell] Bulk retry error:', error);
        res.status(500).json({ error: error.message || 'Toplu arama başlatılamadı' });
    }
};

// Get call analytics for dashboard
export const getCallAnalytics = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { startDate, endDate } = req.query;

        const where = { workspaceId };
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = new Date(startDate);
            if (endDate) where.createdAt.lte = new Date(endDate);
        }

        const calls = await prisma.retellCall.findMany({
            where,
            orderBy: { createdAt: 'desc' }
        });

        const totalCalls = calls.length;
        const totalDuration = calls.reduce((sum, c) => sum + (c.duration || 0), 0);
        const avgDuration = totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0;
        const callsWithSentiment = calls.filter(c => c.sentiment);
        const positiveCalls = callsWithSentiment.filter(c => c.sentiment.toLowerCase() === 'positive').length;
        const successRate = callsWithSentiment.length > 0 ? Math.round((positiveCalls / callsWithSentiment.length) * 100) : 0;

        // Status breakdown
        const statusBreakdown = {};
        calls.forEach(c => {
            const s = c.status || 'unknown';
            statusBreakdown[s] = (statusBreakdown[s] || 0) + 1;
        });

        // Sentiment breakdown (normalized)
        const sentimentBreakdown = {};
        calls.forEach(c => {
            if (c.sentiment) {
                const s = c.sentiment.toLowerCase();
                const normalized = s === 'positive' ? 'positive' : s === 'negative' ? 'negative' : 'neutral';
                sentimentBreakdown[normalized] = (sentimentBreakdown[normalized] || 0) + 1;
            }
        });

        // Daily breakdown (last 30 days)
        const dailyBreakdown = {};
        calls.forEach(c => {
            const day = c.createdAt.toISOString().split('T')[0];
            dailyBreakdown[day] = (dailyBreakdown[day] || 0) + 1;
        });

        // Compute totalCost from filtered DB calls (same set as table rows)
        // DB stores cost in cents (Retell combined_cost unit) → divide by 100 for dollars
        const totalCost = calls.reduce((sum, c) => sum + ((c.cost || 0) / 100), 0);

        res.json({
            totalCalls,
            totalDuration,
            avgDuration,
            successRate,
            totalCost,
            statusBreakdown,
            sentimentBreakdown,
            dailyBreakdown
        });
    } catch (error) {
        console.error('❌ [Retell] Get call analytics error:', error);
        res.status(500).json({ error: 'Failed to fetch call analytics' });
    }
};

// Webhook handler (public endpoint — no auth)
export const handleWebhook = async (req, res) => {
    try {
        const body = req.body;
        const event = body.event;
        console.log(`📡 [Retell Webhook RAW] event=${event}, keys=${Object.keys(body).join(',')}`);
        // Retell sends call data under different keys depending on event type
        const call = body.call || body.call_inbound || body.call_started || body.call_ended || body.call_analyzed;

        // Case 1: Standard Retell event webhook (call_started / call_ended / call_analyzed / call_inbound)
        if (event && call) {
            console.log(`📞 [Retell Webhook] Event: ${event}, Call: ${call.call_id}`);

            switch (event) {
                case 'call_started':
                    await handleCallStarted(call);
                    break;
                case 'call_ended':
                    await handleCallEnded(call);
                    break;
                case 'call_analyzed':
                    await handleCallAnalyzed(call);
                    break;
                case 'call_inbound': {
                    console.log(`📞 [Retell] call_inbound FULL PAYLOAD:`, JSON.stringify(body).substring(0, 500));
                    console.log(`📞 [Retell] call_inbound from ${call.from_number} to ${call.to_number}`);
                    // Generate temp call_id if not provided (Retell may not include it in call_inbound)
                    const inboundCallId = call.call_id || body.call_id || `retell_inbound_${Date.now()}`;
                    handleCallStarted({
                        ...call,
                        call_id: inboundCallId,
                        direction: 'inbound',
                        from_number: call.from_number,
                        to_number: call.to_number,
                        agent_id: call.agent_id,
                    }).catch(e => console.error('❌ [Retell] call_inbound handler error:', e.message));
                    // Respond 200 immediately so Retell proceeds with the configured agent
                    return res.status(200).json({});
                }
                default:
                    console.log(`📞 [Retell Webhook] Unhandled event: ${event}`);
            }
            return res.status(204).send();
        }

        // Case 2: Inbound call routing webhook (phone number "Add an inbound webhook")
        // Retell sends call info and expects agent config in response
        // Fields: call_id, agent_id, from_number, to_number, direction, metadata
        if (body.call_id && body.direction === 'inbound') {
            console.log(`📞 [Retell] Inbound routing webhook: call ${body.call_id} from ${body.from_number}`);

            // Process in background (don't hold up the response)
            handleCallStarted({ ...body, call_id: body.call_id }).catch(e =>
                console.error('❌ [Retell] Inbound routing handler error:', e.message)
            );

            // Respond with 200 (no override needed — phone number already has agent configured)
            return res.status(200).json({});
        }

        // Unknown format — log and ignore
        console.warn('⚠️ [Retell Webhook] Unknown payload format:', JSON.stringify(body).substring(0, 200));
        return res.status(200).send();
    } catch (error) {
        console.error('❌ [Retell Webhook] Error:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
};

// Internal handlers
async function handleCallStarted(call) {
    try {
        const isInbound = call.direction === 'inbound';

        if (isInbound) {
            // Inbound call: find the workspace via agent_id, create DB record + Inbox conversation
            const fromNumber = call.from_number || call.from || '';
            const toNumber = call.to_number || call.to || '';

            // Find workspace by agent or from_number
            const workspace = await prisma.workspace.findFirst({
                where: {
                    OR: [
                        { retellAgentId: call.agent_id },
                        { retellFromNumber: toNumber }
                    ]
                },
                select: { id: true }
            });

            if (!workspace) {
                console.warn(`📞 [Retell] Inbound call ${call.call_id}: workspace not found for agent ${call.agent_id}`);
                return;
            }

            const workspaceId = workspace.id;

            // Try to match caller to an existing contact
            let contactId = null;
            if (fromNumber) {
                const normalized = normalizePhone(fromNumber);
                const contact = await prisma.contact.findFirst({
                    where: {
                        workspaceId,
                        OR: [
                            { phone: normalized },
                            { phone: fromNumber },
                            { phone: fromNumber.replace(/\D/g, '') }
                        ]
                    },
                    select: { id: true }
                });
                contactId = contact?.id || null;
            }

            // Create new contact if not found (unknown caller)
            if (!contactId && fromNumber) {
                const normalized = normalizePhone(fromNumber) || fromNumber;
                const newContact = await prisma.contact.create({
                    data: {
                        workspaceId,
                        name: `Arayan: ${fromNumber}`,
                        phone: normalized,
                        status: 'NEW_APPLICATION',
                        category: 'NEW_APPLICATION'
                    }
                });
                contactId = newContact.id;
                console.log(`📞 [Retell] Inbound: created new contact ${contactId} for ${fromNumber}`);
            }

            // Create/upsert call record
            const existing = await prisma.retellCall.findUnique({ where: { callId: call.call_id } });
            if (!existing) {
                await prisma.retellCall.create({
                    data: {
                        workspace: { connect: { id: workspaceId } },
                        callId: call.call_id,
                        agentId: call.agent_id || '',
                        fromNumber,
                        toNumber,
                        direction: 'inbound',
                        status: 'ongoing',
                        contactId,
                        createdById: ''
                    }
                });
            } else {
                await prisma.retellCall.update({
                    where: { callId: call.call_id },
                    data: { status: 'ongoing', ...(contactId && !existing.contactId ? { contactId } : {}) }
                });
            }

            // For OUTBOUND calls with an existing conversationId → link to that conversation
            // For INBOUND calls (or outbound without a linked conversation) → create new PHONE conversation
            const outboundWithExistingConv = existing?.conversationId && existing?.direction === 'outbound';

            // Create a NEW conversation for this call ONLY if not linked to an existing one
            if (contactId && !outboundWithExistingConv) {
                const conversation = await prisma.conversation.create({
                    data: {
                        workspaceId,
                        contactId,
                        channel: 'PHONE',
                        status: 'OPEN',
                        lastMessageAt: new Date()
                    }
                });

                // Opening message
                const msg = await prisma.message.create({
                    data: {
                        content: `📞 Gelen Arama (devam ediyor)\n${fromNumber}`,
                        conversationId: conversation.id,
                        isFromContact: true,
                        messageType: 'CALL_TRANSCRIPT',
                        status: 'SENT'
                    }
                });

                // Best-effort: store conversationId so call_ended can reuse this conversation
                // (may fail if db push not yet run — that's ok, call_ended will create a new one)
                try {
                    await prisma.retellCall.update({
                        where: { callId: call.call_id },
                        data: { conversationId: conversation.id }
                    });
                } catch (_) { /* conversationId column may not exist yet, non-fatal */ }

                // Fetch full conversation with contact for real-time display
                const fullConversation = await prisma.conversation.findUnique({
                    where: { id: conversation.id },
                    include: {
                        contact: true,
                        messages: { take: 1, orderBy: { createdAt: 'desc' } }
                    }
                });

                emitToWorkspace(workspaceId, 'new_message', { workspaceId, conversationId: conversation.id, message: msg });
                emitToWorkspace(workspaceId, 'new_conversation', { workspaceId, conversation: fullConversation || conversation });
                console.log(`📞 [Retell] Inbound: new conversation ${conversation.id} created for ${fromNumber}`);

                const convId = conversation.id;
                const tempCallId = call.call_id;
                (async () => {
                    try {
                        const ws2 = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { retellApiKey: true } });
                        if (!ws2?.retellApiKey) return;
                        const retellClient = new Retell({ apiKey: ws2.retellApiKey });

                        // Step 1: wait 10s then get real call_id by matching phone numbers
                        await new Promise(r => setTimeout(r, 10000));
                        const recentCalls = await retellClient.call.list({ limit: 10 }) || [];
                        const realCall = recentCalls.find(c =>
                            (c.from_number === fromNumber || c.to_number === fromNumber) &&
                            (c.call_status === 'ongoing' || c.call_status === 'registered' || c.call_status === 'ended')
                        );
                        if (!realCall) {
                            console.log(`📞 [Watcher] Could not find real call for ${fromNumber}`);
                            return;
                        }
                        const realCallId = realCall.call_id;
                        console.log(`📞 [Watcher] Got real call_id: ${realCallId} for ${fromNumber}`);

                        // Update temp record with real call_id
                        const tempRec = await prisma.retellCall.findUnique({ where: { callId: tempCallId } });
                        if (tempRec) {
                            await prisma.retellCall.update({ where: { id: tempRec.id }, data: { callId: realCallId } });
                        }

                        // Step 2: check every 30s until call ends (max 20 checks = ~10 min)
                        for (let i = 0; i < 20; i++) {
                            await new Promise(r => setTimeout(r, 30000));
                            const checked = await retellClient.call.retrieve(realCallId);
                            if (checked.call_status === 'ended' || checked.call_status === 'error') {
                                // Update DB
                                const rec = await prisma.retellCall.findUnique({ where: { callId: realCallId } });
                                if (rec) {
                                    await prisma.retellCall.update({
                                        where: { id: rec.id },
                                        data: { status: 'ended', duration: checked.duration_ms ? Math.round(checked.duration_ms / 1000) : null }
                                    });
                                }
                                // Update "devam ediyor" message
                                const devamMsg = await prisma.message.findFirst({ where: { conversationId: convId, content: { contains: 'devam ediyor' } } });
                                const dur = checked.duration_ms ? Math.round(checked.duration_ms / 1000) : 0;
                                const dText = `${Math.floor(dur / 60)}dk ${dur % 60}sn`;
                                if (devamMsg) {
                                    await prisma.message.update({ where: { id: devamMsg.id }, data: { content: `📲 Gelen Arama Tamamlandı\n${fromNumber} • ${dText}` } });
                                    await prisma.conversation.update({ where: { id: convId }, data: { lastMessageAt: new Date() } });
                                    emitToWorkspace(workspaceId, 'new_message', { workspaceId, conversationId: convId, message: { type: 'call_ended' } });
                                    console.log(`📞 [Watcher] Call ended — updated conversation ${convId}`);
                                }
                                // Inject transcript: wait 30s for Retell to finish analysis, then re-fetch
                                if (rec) {
                                    setTimeout(async () => {
                                        try {
                                            const analyzed = await retellClient.call.retrieve(realCallId);
                                            if (analyzed.transcript) {
                                                await prisma.retellCall.update({ where: { id: rec.id }, data: { transcript: analyzed.transcript } });
                                                await injectTranscriptToChat(
                                                    { ...rec, conversationId: convId },
                                                    analyzed,
                                                    dur
                                                );
                                                emitToWorkspace(workspaceId, 'new_message', { workspaceId, conversationId: convId, message: { type: 'transcript_ready' } });
                                                console.log(`📞 [Watcher] Transcript injected for ${convId}`);
                                            }
                                        } catch (te) { console.error('📞 [Watcher] Transcript inject error:', te.message); }
                                    }, 30000);
                                }

                                break; // stop watching
                            }
                            console.log(`📞 [Watcher] Check ${i + 1}/20: ${checked.call_status}`);
                        }
                    } catch (e) {
                        console.error('📞 [Watcher] Error:', e.message);
                    }
                })();


            }
        } else {
            // Outbound: just update status
            await prisma.retellCall.updateMany({
                where: { callId: call.call_id },
                data: { status: 'ongoing' }
            });
        }

        console.log(`📞 [Retell] Call started: ${call.call_id} (${call.direction || 'outbound'})`);
    } catch (err) {
        console.error('❌ [Retell] handleCallStarted error:', err.message);
    }
}

async function handleCallEnded(call) {
    try {
        const duration = call.duration_ms ? Math.round(call.duration_ms / 1000) : null;
        const fromNumber = call.from_number || call.from || '';
        const toNumber = call.to_number || call.to || '';

        // Try to find by call_id first
        let callRecord = await prisma.retellCall.findUnique({
            where: { callId: call.call_id }
        });

        // Fallback: find by phone numbers + ongoing status (for temp IDs from call_inbound)
        if (!callRecord && (fromNumber || toNumber)) {
            callRecord = await prisma.retellCall.findFirst({
                where: {
                    status: 'ongoing',
                    OR: [
                        { fromNumber, toNumber },
                        { fromNumber: toNumber, toNumber: fromNumber }
                    ]
                },
                orderBy: { createdAt: 'desc' }
            });
            if (callRecord) {
                console.log(`📞 [Retell] call_ended: matched by phone fallback (temp ID: ${callRecord.callId} → real ID: ${call.call_id})`);
                // Update to real call_id
                await prisma.retellCall.update({
                    where: { id: callRecord.id },
                    data: { callId: call.call_id }
                });
            }
        }

        // Update call record
        if (callRecord) {
            await prisma.retellCall.update({
                where: { id: callRecord.id },
                data: {
                    status: 'ended',
                    callId: call.call_id,
                    duration,
                    transcript: call.transcript || null,
                    recordingUrl: call.recording_url || null,
                    endedReason: call.disconnection_reason || null,
                    cost: call.call_cost?.combined_cost ?? null
                }
            });
        } else {
            // No existing record — create one
            await prisma.retellCall.updateMany({
                where: { callId: call.call_id },
                data: {
                    status: 'ended',
                    duration,
                    transcript: call.transcript || null,
                    recordingUrl: call.recording_url || null,
                    endedReason: call.disconnection_reason || null,
                    cost: call.call_cost?.combined_cost ?? null
                }
            });
            callRecord = await prisma.retellCall.findUnique({
                where: { callId: call.call_id }
            });
        }

        if (callRecord) {
            // === CONTACT LINKING FALLBACK ===
            // If contactId is null (e.g. auto-call timing issue), try to find contact by phone number
            if (!callRecord.contactId && callRecord.workspaceId) {
                try {
                    const lookupPhone = callRecord.direction === 'inbound' ? callRecord.fromNumber : callRecord.toNumber;
                    if (lookupPhone) {
                        const normalized = normalizePhone(lookupPhone);
                        const matchedContact = await prisma.contact.findFirst({
                            where: {
                                workspaceId: callRecord.workspaceId,
                                OR: [
                                    { phone: normalized },
                                    { phone: lookupPhone },
                                    { phone: lookupPhone.replace(/\D/g, '') }
                                ]
                            },
                            select: { id: true }
                        });
                        if (matchedContact) {
                            await prisma.retellCall.update({
                                where: { callId: call.call_id },
                                data: { contactId: matchedContact.id }
                            });
                            callRecord = { ...callRecord, contactId: matchedContact.id };
                            console.log(`📞 [Retell] Contact linked by phone fallback: ${matchedContact.id} for ${lookupPhone}`);
                        }
                    }
                } catch (linkErr) {
                    console.error('⚠️ [Retell] Contact link fallback error (non-fatal):', linkErr.message);
                }
            }

            // Send notification only for outbound calls where we know who initiated
            if (callRecord.createdById) {
                try {
                    await createNotification(
                        callRecord.workspaceId,
                        callRecord.createdById,
                        'CALL_ENDED',
                        `📞 Arama Tamamlandı`,
                        `${callRecord.toNumber} ile ${duration || 0}sn arama sona erdi.`,
                        { callId: callRecord.id, retellCallId: call.call_id }
                    );
                } catch (notifErr) {
                    console.error('❌ [Retell] Notification error (non-fatal):', notifErr.message);
                }
            }

            // === TRANSCRIPT → CHAT MESSAGES ===
            if (callRecord.contactId) {
                if (call.transcript) {
                    try {
                        await injectTranscriptToChat(callRecord, call, duration);
                    } catch (transcriptErr) {
                        console.error('❌ [Retell] Transcript injection error:', transcriptErr.message);
                    }
                } else {
                    // No transcript yet — create a NEW conversation per call (or reuse if already created at call_started)
                    try {
                        let conversation;
                        if (callRecord.conversationId) {
                            conversation = await prisma.conversation.findUnique({ where: { id: callRecord.conversationId } });
                        }
                        if (!conversation) {
                            // Look for an existing conversation for this contact first
                            conversation = await prisma.conversation.findFirst({
                                where: { contactId: callRecord.contactId, workspaceId: callRecord.workspaceId },
                                orderBy: { lastMessageAt: 'desc' }
                            });
                            if (conversation) {
                                console.log(`📞 [Retell] Reusing existing ${conversation.channel} conversation ${conversation.id} for call (no-transcript path)`);
                                await prisma.retellCall.update({
                                    where: { callId: callRecord.callId },
                                    data: { conversationId: conversation.id }
                                });
                            }
                        }
                        if (!conversation) {
                            conversation = await prisma.conversation.create({
                                data: {
                                    workspaceId: callRecord.workspaceId,
                                    contactId: callRecord.contactId,
                                    channel: 'PHONE',
                                    status: 'OPEN',
                                    lastMessageAt: new Date()
                                }
                            });
                            await prisma.retellCall.update({
                                where: { callId: callRecord.callId },
                                data: { conversationId: conversation.id }
                            });
                        }

                        const isInbound = callRecord.direction === 'inbound';
                        const durationText = duration ? `${Math.floor(duration / 60)}dk ${duration % 60}sn` : '0sn';
                        const displayNumber = isInbound ? callRecord.fromNumber : callRecord.toNumber;
                        const dirLabel = isInbound ? '📲 Gelen Arama' : '📞 Giden Arama';

                        await prisma.message.create({
                            data: {
                                content: `${dirLabel} Tamamlandı\n${displayNumber} • ${durationText}`,
                                conversationId: conversation.id,
                                isFromContact: isInbound,
                                messageType: 'CALL_TRANSCRIPT',
                                status: 'SENT'
                            }
                        });

                        await prisma.conversation.update({
                            where: { id: conversation.id },
                            data: { lastMessageAt: new Date() }
                        });

                        console.log(`📞 [Retell] Placeholder conversation ${conversation.id} ready for call ${callRecord.callId}`);
                    } catch (placeholderErr) {
                        console.error('❌ [Retell] Placeholder conversation error:', placeholderErr.message);
                    }
                }
            }

            // Call transcript is already injected into chat messages above — no need to duplicate in contact notes

            // Update "devam ediyor" message to "tamamlandı" and emit socket events for real-time UI update
            if (callRecord.conversationId) {
                const existingMsg = await prisma.message.findFirst({
                    where: {
                        conversationId: callRecord.conversationId,
                        content: { contains: 'devam ediyor' }
                    }
                });
                if (existingMsg) {
                    const durationText = duration ? `${Math.floor(duration / 60)}dk ${duration % 60}sn` : '0sn';
                    const isInbound = callRecord.direction === 'inbound';
                    const displayNumber = isInbound ? callRecord.fromNumber : callRecord.toNumber;
                    const dirLabel = isInbound ? '📲 Gelen Arama' : '📞 Giden Arama';
                    await prisma.message.update({
                        where: { id: existingMsg.id },
                        data: { content: `${dirLabel} Tamamlandı\n${displayNumber} • ${durationText}` }
                    });
                }
                // Emit socket event so frontend refreshes the conversation
                emitToWorkspace(callRecord.workspaceId, 'new_message', {
                    workspaceId: callRecord.workspaceId,
                    conversationId: callRecord.conversationId,
                    message: { type: 'call_ended', callId: call.call_id }
                });
            }
        }

        console.log(`📞 [Retell] Call ended: ${call.call_id}, duration: ${duration}s, hasTranscript: ${!!call.transcript}`);
    } catch (err) {
        console.error('❌ [Retell] handleCallEnded error:', err.message);
    }
}

/**
 * Inject call transcript lines as individual messages into the conversation.
 */
async function injectTranscriptToChat(callRecord, call, duration) {
    const { workspaceId, contactId, toNumber, direction } = callRecord;

    // 1. Reuse the source conversation if one was provided (e.g. call initiated from an existing chat)
    //    Otherwise create a new PHONE conversation
    let conversation;
    if (callRecord.conversationId) {
        conversation = await prisma.conversation.findUnique({ where: { id: callRecord.conversationId } });
        if (conversation) {
            console.log(`📞 [Retell] Reusing existing conversation ${conversation.id} for call transcript`);
        }
    }

    if (!conversation) {
        // Look for an existing conversation for this contact (any channel) — reuse instead of creating a new PHONE one
        if (contactId) {
            conversation = await prisma.conversation.findFirst({
                where: { contactId, workspaceId },
                orderBy: { lastMessageAt: 'desc' }
            });
            if (conversation) {
                console.log(`📞 [Retell] Reusing existing ${conversation.channel} conversation ${conversation.id} for call transcript`);
                // Keep track of it on the call record
                await prisma.retellCall.updateMany({
                    where: { callId: callRecord.callId },
                    data: { conversationId: conversation.id }
                });
            }
        }
    }

    if (!conversation) {
        conversation = await prisma.conversation.create({
            data: {
                workspaceId,
                contactId,
                channel: 'PHONE',
                status: 'OPEN',
                lastMessageAt: new Date()
            }
        });
        console.log(`📞 [Retell] Created new PHONE conversation ${conversation.id} for ${direction || 'outbound'} call (no prior conversation found)`);
    }

    const conversationId = conversation.id;
    const durationText = duration ? `${Math.floor(duration / 60)}dk ${duration % 60}sn` : '0sn';
    const createdMessages = [];

    // 2. Create call header message
    const headerMsg = await prisma.message.create({
        data: {
            content: `📞 Sesli Arama Başladı\n${toNumber} • ${durationText}`,
            conversationId,
            isFromContact: false,
            messageType: 'CALL_TRANSCRIPT',
            status: 'SENT'
        }
    });
    createdMessages.push(headerMsg);

    // 3. Parse transcript and create individual messages
    const lines = call.transcript.split('\n').filter(l => l.trim());
    let msgIndex = 0;

    for (const line of lines) {
        const isAgent = line.startsWith('Agent:') || line.startsWith('AI:');
        const text = line.replace(/^(Agent:|AI:|User:|Customer:)\s*/i, '').trim();
        if (!text) continue;

        // Small time offset per message so they sort correctly
        const msgTime = new Date(Date.now() + msgIndex * 10);
        msgIndex++;

        const msg = await prisma.message.create({
            data: {
                content: text,
                conversationId,
                isFromContact: !isAgent,
                messageType: 'CALL_TRANSCRIPT',
                status: 'SENT',
                createdAt: msgTime
            }
        });
        createdMessages.push(msg);
    }

    // 4. Create call footer message
    const sentiment = callRecord.sentiment || '';
    const sentimentEmoji = sentiment === 'Positive' ? '😊' : sentiment === 'Negative' ? '😞' : '😐';
    const footerMsg = await prisma.message.create({
        data: {
            content: `📞 Arama Sona Erdi • ${durationText}${sentiment ? ` • ${sentimentEmoji} ${sentiment}` : ''}`,
            conversationId,
            isFromContact: false,
            messageType: 'CALL_TRANSCRIPT',
            status: 'SENT',
            createdAt: new Date(Date.now() + msgIndex * 10 + 10)
        }
    });
    createdMessages.push(footerMsg);

    // 5. Update conversation lastMessageAt
    await prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() }
    });

    // 6. Emit real-time events for each message
    for (const msg of createdMessages) {
        emitToWorkspace(workspaceId, 'newMessage', {
            conversationId,
            message: msg
        });
    }

    console.log(`📞 [Retell] Injected ${createdMessages.length} transcript messages into conversation ${conversationId}`);
}

async function handleCallAnalyzed(call) {
    try {
        const analysis = call.call_analysis || {};

        await prisma.retellCall.updateMany({
            where: { callId: call.call_id },
            data: {
                summary: analysis.call_summary || null,
                sentiment: analysis.user_sentiment || null,
                callSuccessful: analysis.call_successful ?? null
            }
        });

        // Fallback: inject transcript if it wasn't injected during call_ended
        const callRecord = await prisma.retellCall.findUnique({
            where: { callId: call.call_id }
        });

        if (callRecord?.contactId && callRecord.transcript) {
            // Check if full transcript was already injected
            const existingTranscript = await prisma.message.findFirst({
                where: {
                    conversation: {
                        workspaceId: callRecord.workspaceId,
                        contactId: callRecord.contactId
                    },
                    messageType: 'CALL_TRANSCRIPT',
                    content: { contains: 'Sesli Arama Başladı' }
                }
            });

            if (!existingTranscript) {
                try {
                    const duration = callRecord.duration || 0;
                    await injectTranscriptToChat(callRecord, {
                        ...call,
                        transcript: callRecord.transcript
                    }, duration);
                    console.log(`📞 [Retell] Transcript injected via call_analyzed fallback for ${call.call_id}`);
                } catch (injErr) {
                    console.error('❌ [Retell] Fallback transcript injection error:', injErr.message);
                }
            }
        }

        console.log(`📞 [Retell] Call analyzed: ${call.call_id}, sentiment: ${analysis.user_sentiment}`);
    } catch (err) {
        console.error('❌ [Retell] handleCallAnalyzed error:', err.message);
    }
}

// Schedule a call for later
export const scheduleCall = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { toNumber, contactId, contactName, scheduledAt } = req.body;
        const userId = req.user.id;

        if (!toNumber) {
            return res.status(400).json({ error: 'Telefon numarası gerekli' });
        }
        if (!scheduledAt) {
            return res.status(400).json({ error: 'Planlanan tarih/saat gerekli' });
        }

        const scheduledDate = new Date(scheduledAt);
        if (scheduledDate <= new Date()) {
            return res.status(400).json({ error: 'Planlanan saat gelecekte olmalı' });
        }

        // Stagger: offset by 1 min per existing PENDING call near same time (same workspace)
        const existingNearby = await prisma.scheduledCall.count({
            where: {
                workspaceId,
                status: 'PENDING',
                scheduledAt: {
                    gte: scheduledDate,
                    lt: new Date(scheduledDate.getTime() + 60 * 60 * 1000)
                }
            }
        });
        const staggeredDate = new Date(scheduledDate.getTime() + existingNearby * 60 * 1000);
        if (existingNearby > 0) {
            console.log(`📅 [Retell] Staggering manual schedule: ${existingNearby} call(s) already queued, offsetting by ${existingNearby} min → ${staggeredDate.toLocaleString('tr-TR')}`);
        }

        const scheduled = await prisma.scheduledCall.create({
            data: {
                workspaceId,
                contactId: contactId || null,
                contactName: contactName || null,
                toNumber: normalizePhone(toNumber),
                scheduledAt: staggeredDate,
                createdById: userId
            }
        });

        console.log(`📅 [Retell] Call scheduled: ${toNumber} at ${staggeredDate.toISOString()}`);
        res.json({ success: true, scheduledCall: scheduled });

    } catch (error) {
        console.error('❌ [Retell] Schedule call error:', error);
        res.status(500).json({ error: 'Arama planlanamadı' });
    }
};

// Get scheduled calls for a workspace
export const getScheduledCalls = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const now = new Date();
        const calls = await prisma.scheduledCall.findMany({
            where: {
                workspaceId,
                status: 'PENDING',
                scheduledAt: { gte: now } // only show future pending calls
            },
            orderBy: { scheduledAt: 'asc' }
        });
        res.json({ scheduledCalls: calls });
    } catch (error) {
        console.error('❌ [Retell] Get scheduled calls error:', error);
        res.status(500).json({ error: 'Failed to fetch scheduled calls' });
    }
};

// Cancel a scheduled call
export const cancelScheduledCall = async (req, res) => {
    try {
        const { workspaceId, id } = req.params;

        const call = await prisma.scheduledCall.findFirst({
            where: { id, workspaceId, status: 'PENDING' }
        });

        if (!call) {
            return res.status(404).json({ error: 'Planlanmış arama bulunamadı' });
        }

        await prisma.scheduledCall.update({
            where: { id },
            data: { status: 'CANCELLED' }
        });

        console.log(`❌ [Retell] Scheduled call cancelled: ${id}`);
        res.json({ success: true });
    } catch (error) {
        console.error('❌ [Retell] Cancel scheduled call error:', error);
        res.status(500).json({ error: 'İptal başarısız' });
    }
};

// Auto-execute scheduled calls (called by server interval)
export const executeScheduledCalls = async () => {
    try {
        const now = new Date();

        // Find all PENDING calls where scheduledAt <= now
        const dueCalls = await prisma.scheduledCall.findMany({
            where: {
                status: 'PENDING',
                scheduledAt: { lte: now }
            }
        });

        if (dueCalls.length === 0) return;

        console.log(`📅 [Retell] Executing ${dueCalls.length} scheduled call(s)...`);

        for (const sc of dueCalls) {
            try {
                const workspace = await prisma.workspace.findUnique({
                    where: { id: sc.workspaceId },
                    select: { retellApiKey: true, retellAgentId: true, retellFromNumber: true }
                });

                if (!workspace?.retellApiKey || !workspace?.retellAgentId || !workspace?.retellFromNumber) {
                    await prisma.scheduledCall.update({
                        where: { id: sc.id },
                        data: { status: 'FAILED', errorMessage: 'AI Call ayarları yapılandırılmamış' }
                    });
                    continue;
                }

                const client = new Retell({ apiKey: workspace.retellApiKey });
                const formattedTo = sc.toNumber.startsWith('+') ? sc.toNumber : `+${sc.toNumber}`;

                const callResponse = await client.call.createPhoneCall({
                    from_number: workspace.retellFromNumber,
                    to_number: formattedTo,
                    override_agent_id: workspace.retellAgentId,
                    metadata: {
                        workspaceId: sc.workspaceId,
                        contactId: sc.contactId || null,
                        contactName: sc.contactName || null,
                        createdById: sc.createdById,
                        scheduledCallId: sc.id
                    },
                    retell_llm_dynamic_variables: {
                        customer_name: sc.contactName || 'Müşteri'
                    }
                });

                // Save call record
                await prisma.retellCall.create({
                    data: {
                        workspaceId: sc.workspaceId,
                        contactId: sc.contactId || null,
                        callId: callResponse.call_id,
                        agentId: workspace.retellAgentId,
                        fromNumber: workspace.retellFromNumber,
                        toNumber: formattedTo,
                        direction: 'outbound',
                        status: callResponse.call_status || 'registered',
                        createdById: sc.createdById
                    }
                });

                // Mark as completed
                await prisma.scheduledCall.update({
                    where: { id: sc.id },
                    data: { status: 'COMPLETED', retellCallId: callResponse.call_id }
                });

                console.log(`✅ [Retell] Scheduled call executed: ${sc.id} -> ${formattedTo}`);
            } catch (callErr) {
                console.error(`❌ [Retell] Scheduled call ${sc.id} failed:`, callErr.message);
                await prisma.scheduledCall.update({
                    where: { id: sc.id },
                    data: { status: 'FAILED', errorMessage: callErr.message?.substring(0, 191) }
                });
            }
        }
    } catch (error) {
        console.error('❌ [Retell] executeScheduledCalls error:', error);
    }
};

// One-time recovery: create conversations for past calls that don't have them
export const recoverCallConversations = async (req, res) => {
    try {
        const { workspaceId } = req.params;

        // Find all calls with contactId in this workspace
        const calls = await prisma.retellCall.findMany({
            where: {
                workspaceId,
                contactId: { not: null },
                status: 'ended'
            },
            orderBy: { createdAt: 'asc' }
        });

        let created = 0;
        let skipped = 0;
        let errors = 0;

        for (const callRecord of calls) {
            try {
                // Check if conversation already exists for this contact
                const existingConv = await prisma.conversation.findFirst({
                    where: {
                        workspaceId,
                        contactId: callRecord.contactId
                    }
                });

                if (existingConv) {
                    // Check if this call already has messages in the conversation
                    const existingMsg = await prisma.message.findFirst({
                        where: {
                            conversationId: existingConv.id,
                            messageType: 'CALL_TRANSCRIPT'
                        }
                    });

                    if (existingMsg) {
                        skipped++;
                        continue;
                    }
                }

                // Create conversation if needed
                let conversation = existingConv;
                if (!conversation) {
                    conversation = await prisma.conversation.create({
                        data: {
                            workspaceId,
                            contactId: callRecord.contactId,
                            channel: 'PHONE',
                            status: 'OPEN',
                            lastMessageAt: callRecord.createdAt || new Date()
                        }
                    });
                }

                const duration = callRecord.duration || 0;
                const durationText = duration ? `${Math.floor(duration / 60)}dk ${duration % 60}sn` : '0sn';

                if (callRecord.transcript) {
                    // Inject full transcript
                    await injectTranscriptToChat(callRecord, {
                        transcript: callRecord.transcript,
                        call_id: callRecord.callId
                    }, duration);
                } else {
                    // Create placeholder message
                    await prisma.message.create({
                        data: {
                            content: `📞 Sesli Arama Tamamlandı\n${callRecord.toNumber} • ${durationText}`,
                            conversationId: conversation.id,
                            isFromContact: false,
                            messageType: 'CALL_TRANSCRIPT',
                            status: 'SENT',
                            createdAt: callRecord.createdAt || new Date()
                        }
                    });

                    await prisma.conversation.update({
                        where: { id: conversation.id },
                        data: { lastMessageAt: callRecord.createdAt || new Date() }
                    });
                }

                created++;
            } catch (err) {
                errors++;
                console.error(`❌ [Recovery] Error for call ${callRecord.callId}:`, err.message);
            }
        }

        console.log(`🔄 [Recovery] ${created} conversations created, ${skipped} skipped, ${errors} errors`);
        res.json({ total: calls.length, created, skipped, errors });
    } catch (error) {
        console.error('❌ [Recovery] Error:', error);
        res.status(500).json({ error: 'Kurtarma işlemi sırasında hata oluştu' });
    }
};

// Sync historical calls from Retell API → DB → Inbox
export const syncRetellCalls = async (req, res) => {
    try {
        const { workspaceId } = req.params;

        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { retellApiKey: true, retellAgentId: true, retellFromNumber: true }
        });

        if (!workspace?.retellApiKey) {
            return res.status(400).json({ error: 'Retell API key yapılandırılmamış' });
        }

        const client = new Retell({ apiKey: workspace.retellApiKey });

        // Fetch calls from Retell API (paginated, up to 1000)
        let allCalls = [];
        let paginationKey = null;
        const PAGE_LIMIT = 100;
        let pageCount = 0;

        do {
            const params = { limit: PAGE_LIMIT };
            if (paginationKey) params.pagination_key = paginationKey;
            const calls = await client.call.list(params) || [];
            allCalls = allCalls.concat(calls);
            paginationKey = calls.length === PAGE_LIMIT ? calls[calls.length - 1].call_id : null;
            pageCount++;
        } while (paginationKey && pageCount < 10);

        console.log(`📋 [Sync] Fetched ${allCalls.length} calls from Retell API`);

        let newCalls = 0;
        let updatedCalls = 0;
        let inboxed = 0;
        let errors = 0;

        for (const call of allCalls) {
            try {
                const toNumber = call.to_number || call.to || '';
                const fromNumber = call.from_number || call.from || '';
                const duration = call.duration_ms ? Math.round(call.duration_ms / 1000) : null;

                // Try to match contact by phone number (check both toNumber and fromNumber for inbound/outbound)
                let contactId = null;
                const phonesToCheck = [toNumber, fromNumber].filter(Boolean);
                for (const phone of phonesToCheck) {
                    const normalized = normalizePhone(phone);
                    // Skip our own number
                    if (normalized === normalizePhone(workspace.retellFromNumber || '')) continue;
                    const contact = await prisma.contact.findFirst({
                        where: {
                            workspaceId,
                            OR: [
                                { phone: normalized },
                                { phone: phone },
                                { phone: phone.replace(/\D/g, '') }
                            ]
                        },
                        select: { id: true }
                    });
                    if (contact) {
                        contactId = contact.id;
                        break;
                    }
                }

                // Upsert into RetellCall table
                // Check for a temp-ID "devam ediyor" record created by call_inbound webhook
                // If found, update it with real data instead of creating duplicate
                let tempRecord = null;
                if (call.call_status === 'ended' || call.call_status === 'registered') {
                    tempRecord = await prisma.retellCall.findFirst({
                        where: {
                            workspaceId,
                            callId: { startsWith: 'retell_inbound_' },
                            status: 'ongoing',
                            OR: [
                                { fromNumber, toNumber },
                                { fromNumber: toNumber, toNumber: fromNumber }
                            ]
                        },
                        orderBy: { createdAt: 'desc' }
                    });
                }

                const existing = tempRecord || await prisma.retellCall.findUnique({ where: { callId: call.call_id } });

                const upsertData = {
                    workspaceId,
                    callId: call.call_id,
                    agentId: call.agent_id || workspace.retellAgentId || '',
                    fromNumber: fromNumber || workspace.retellFromNumber || '',
                    toNumber,
                    direction: call.direction || 'outbound',
                    status: call.call_status || 'ended',
                    duration,
                    transcript: call.transcript || null,
                    recordingUrl: call.recording_url || null,
                    endedReason: call.disconnection_reason || null,
                    ...(contactId ? { contactId } : {})
                };

                if (!existing) {
                    await prisma.retellCall.create({ data: upsertData });
                    newCalls++;
                } else {
                    await prisma.retellCall.update({
                        where: { id: existing.id },
                        data: {
                            callId: call.call_id,
                            status: upsertData.status,
                            duration: upsertData.duration,
                            transcript: upsertData.transcript,
                            recordingUrl: upsertData.recordingUrl,
                            endedReason: upsertData.endedReason,
                            ...(contactId && !existing.contactId ? { contactId } : {})
                        }
                    });
                    updatedCalls++;

                    // If this was a temp "devam ediyor" record, close it in the Inbox
                    if (tempRecord) {
                        try {
                            const durationText = duration ? `${Math.floor(duration / 60)}dk ${duration % 60}sn` : '0sn';
                            const isInbound = (call.direction || 'inbound') === 'inbound';
                            const displayNumber = isInbound ? fromNumber : toNumber;
                            const closedContent = `${isInbound ? '📲 Gelen Arama' : '📞 Giden Arama'} Tamamlandı\n${displayNumber} • ${durationText}`;

                            let convId = tempRecord.conversationId;
                            if (!convId && (tempRecord.contactId || contactId)) {
                                const phoneConv = await prisma.conversation.findFirst({
                                    where: { workspaceId, channel: 'PHONE', contactId: tempRecord.contactId || contactId },
                                    orderBy: { createdAt: 'desc' }
                                });
                                convId = phoneConv?.id || null;
                            }
                            if (!convId) {
                                const phoneMsg = await prisma.message.findFirst({
                                    where: { content: { contains: 'devam ediyor' }, conversation: { workspaceId, channel: 'PHONE' } },
                                    orderBy: { createdAt: 'desc' }
                                });
                                convId = phoneMsg?.conversationId || null;
                            }
                            if (convId) {
                                const devamMsg = await prisma.message.findFirst({
                                    where: { conversationId: convId, content: { contains: 'devam ediyor' } }
                                });
                                if (devamMsg) {
                                    await prisma.message.update({ where: { id: devamMsg.id }, data: { content: closedContent } });
                                    await prisma.conversation.update({ where: { id: convId }, data: { lastMessageAt: new Date() } });
                                    emitToWorkspace(workspaceId, 'new_message', { workspaceId, conversationId: convId, message: { type: 'call_ended', callId: call.call_id } });
                                    console.log(`📞 [Sync] Closed devam ediyor for conversation ${convId}`);
                                }
                            } else {
                                console.log(`⚠️ [Sync] No conversation found for temp record ${tempRecord.id}`);
                            }
                        } catch (closeErr) {
                            console.error('⚠️ [Sync] Could not close devam ediyor:', closeErr.message);
                        }
                    }
                }
                // If no contact matched, create one from the customer phone number
                if (!contactId) {
                    const customerPhone = phonesToCheck.find(p => {
                        const normalized = normalizePhone(p);
                        return normalized !== normalizePhone(workspace.retellFromNumber || '');
                    });
                    if (customerPhone) {
                        const normalized = normalizePhone(customerPhone) || customerPhone;
                        const newContact = await prisma.contact.create({
                            data: {
                                workspaceId,
                                name: `Arayan: ${customerPhone}`,
                                phone: normalized,
                                status: 'NEW_APPLICATION',
                                category: 'NEW_APPLICATION'
                            }
                        });
                        contactId = newContact.id;
                        // Update the retellCall record with the new contact
                        await prisma.retellCall.update({
                            where: { callId: call.call_id },
                            data: { contactId }
                        }).catch(() => {});
                        console.log(`📞 [Sync] Created new contact ${contactId} for ${customerPhone}`);
                    }
                }

                // Inject ended calls into Inbox
                const effContactId = contactId || existing?.contactId;
                console.log(`📋 [Sync] Call ${call.call_id}: status=${call.call_status}, effContactId=${effContactId}, contactId=${contactId}, from=${fromNumber}, to=${toNumber}, phonesToCheck=${JSON.stringify(phonesToCheck)}, retellFromNumber=${workspace.retellFromNumber}`);
                if (effContactId && (call.call_status === 'ended' || call.call_status === 'registered')) {
                    const callRecord = await prisma.retellCall.findUnique({ where: { callId: call.call_id } });

                    // Find or create PHONE conversation
                    let conversation = await prisma.conversation.findFirst({
                        where: { workspaceId, contactId: effContactId, channel: 'PHONE' },
                        orderBy: { lastMessageAt: 'desc' }
                    });

                    if (!conversation) {
                        conversation = await prisma.conversation.create({
                            data: {
                                workspaceId,
                                contactId: effContactId,
                                channel: 'PHONE',
                                status: 'OPEN',
                                lastMessageAt: callRecord?.createdAt || new Date()
                            }
                        });
                    }

                    // Check for existing message (by call_id in content)
                    const existingMsg = await prisma.message.findFirst({
                        where: { conversationId: conversation.id, content: { contains: call.call_id } }
                    });

                    if (!existingMsg) {
                        if (call.transcript && callRecord) {
                            await injectTranscriptToChat(callRecord, call, duration);
                        } else {
                            const durationText = duration ? `${Math.floor(duration / 60)}dk ${duration % 60}sn` : '0sn';
                            await prisma.message.create({
                                data: {
                                    content: `📞 Sesli Arama\n${toNumber} • ${durationText}\n_ID: ${call.call_id}_`,
                                    conversationId: conversation.id,
                                    isFromContact: false,
                                    messageType: 'CALL_TRANSCRIPT',
                                    status: 'SENT',
                                    createdAt: callRecord?.createdAt || new Date()
                                }
                            });
                            await prisma.conversation.update({
                                where: { id: conversation.id },
                                data: { lastMessageAt: callRecord?.createdAt || new Date() }
                            });
                        }
                        inboxed++;
                    }
                }
            } catch (callErr) {
                errors++;
                console.error(`❌ [Sync] Error for call ${call.call_id}:`, callErr.message);
            }
        }

        console.log(`✅ [Sync] Done: ${newCalls} new, ${updatedCalls} updated, ${inboxed} inboxed, ${errors} errors`);
        res.json({ total: allCalls.length, newCalls, updatedCalls, inboxed, errors });
    } catch (error) {
        console.error('❌ [Sync] Error:', error);
        res.status(500).json({ error: 'Senkronizasyon sırasında hata oluştu: ' + error.message });
    }
};
