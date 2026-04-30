import prisma from '../lib/prisma.js';
import Retell from 'retell-sdk';
import { createNotification } from './notification.controller.js';
import { normalizePhone } from '../utils/phoneNormalizer.js';
import { emitToWorkspace } from '../socket.js';


// In-memory lock to prevent duplicate concurrent calls for the same number
// Key: "workspaceId:normalizedPhone" — held for 30s then auto-released
const autoCallLocks = new Set();

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
 * AUTO-CALL SCHEDULING FUNCTIONS
 * detectCallRequestInMessage, parsePreferredTime, calculateScheduledAt
 */

// =====================================================================
// TURKEY TIMEZONE HELPER
// =====================================================================
const TR_OFFSET_MS = 3 * 60 * 60 * 1000; // UTC+3

/**
 * Get current time in Turkey as { hours, minutes, day, date }
 */
function getTurkeyNow(baseDate = new Date()) {
    const utc = new Date(baseDate).getTime();
    const tr = new Date(utc + TR_OFFSET_MS);
    return {
        hours: tr.getUTCHours(),
        minutes: tr.getUTCMinutes(),
        day: tr.getUTCDay(),
        date: tr.getUTCDate(),
        month: tr.getUTCMonth(),
        year: tr.getUTCFullYear(),
        totalMinutes: tr.getUTCHours() * 60 + tr.getUTCMinutes(),
        _utcEpoch: utc
    };
}

/**
 * Create a Date (UTC) that represents a specific Turkey local time on a given day.
 * E.g., createTRDate(baseDate, 15, 0) → returns UTC Date for 15:00 TR on same day as baseDate.
 */
function createTRDate(baseDate, hours, minutes, dayOffset = 0) {
    const utc = new Date(baseDate).getTime();
    const tr = new Date(utc + TR_OFFSET_MS);
    tr.setUTCHours(hours, minutes, 0, 0);
    if (dayOffset) tr.setUTCDate(tr.getUTCDate() + dayOffset);
    // Convert back to UTC
    return new Date(tr.getTime() - TR_OFFSET_MS);
}

// =====================================================================
// detectCallRequestInMessage
// =====================================================================
/**
 * Detects if a customer message explicitly requests a phone call.
 *
 * Returns:
 *   { type: 'immediate' }                    → call right now
 *   { type: 'scheduled', scheduledAt: Date }  → call at specific time
 *   null                                      → no call request detected
 *
 * RULES:
 *   - Time matching ONLY with colon separator (HH:MM), never dot
 *   - "saat" prefix is REQUIRED to match a specific time
 *   - A call-verb ("ara", "arayın", "telefon" etc.) is REQUIRED for scheduled
 *   - Dates like "17.03.2026" and project codes like "9.03.26" are NEVER matched
 */
export function detectCallRequestInMessage(text) {
    if (!text || typeof text !== 'string') return null;
    const t = text.toLowerCase().trim();
    const trNow = getTurkeyNow();
    let scheduledAt = null;

    // === CHECK FOR SPECIFIC TIME (requires "saat" prefix) ===
    // Matches: "saat 15:00", "saat 15:30'da", "saat 15:00'te"
    const timeMatch = t.match(/saat\s+(\d{1,2}):(\d{2})(?:\s*(?:de|da|te|ta|'de|'da|'te|'ta))?/);
    if (timeMatch) {
        const h = parseInt(timeMatch[1]);
        const m = parseInt(timeMatch[2]);
        if (h >= 6 && h <= 23 && m >= 0 && m <= 59) {
            // Schedule at this time today (Turkey), or tomorrow if already passed
            const dayOffset = (h * 60 + m <= trNow.totalMinutes) ? 1 : 0;
            scheduledAt = createTRDate(new Date(), h, m, dayOffset);
        }
    }

    // "saat 15'te" / "saat 3'te" (hour only, no minutes)
    if (!scheduledAt) {
        const hourOnly = t.match(/saat\s+(\d{1,2})(?:'[a-zçğıöşü]+|\s+de|\s+da|\s+te|\s+ta)/);
        if (hourOnly) {
            const h = parseInt(hourOnly[1]);
            if (h >= 6 && h <= 23) {
                const dayOffset = (h * 60 <= trNow.totalMinutes) ? 1 : 0;
                scheduledAt = createTRDate(new Date(), h, 0, dayOffset);
            }
        }
    }

    // Specific time found → require a call-related verb
    const hasCallVerb = /\bara\b|\barayın\b|\barayabilir\b|\barar\b|\bcall\b|\btelefon\b|\bgörüşelim\b|\bkonuşalım\b/.test(t);
    if (scheduledAt && hasCallVerb) return { type: 'scheduled', scheduledAt };

    // === NO TIME FOUND → check for immediate call keywords ===
    const immediatePatterns = [
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
        /\bcall\s+me\b/, /\bcall\s+now\b/, /\bplease\s+call\b/, /\bgive\s+me\s+a\s+call\b/,
        /\bcan\s+you\s+call\b/, /\bcould\s+you\s+call\b/, /\bwould\s+you\s+call\b/,
        /\breach\s+out\b/, /\bcontact\s+me\b/, /\bphone\s+me\b/, /\bring\s+me\b/,
    ];

    for (const p of immediatePatterns) {
        if (p.test(t)) return { type: 'immediate' };
    }

    return null;
}

// =====================================================================
// parsePreferredTime
// =====================================================================
/**
 * Parse a customer's preferred callback time WINDOW from message content.
 *
 * ONLY matches these formats:
 *   1. "HH:MM-HH:MM"  (colon required, e.g. "15:00-18:00")
 *   2. "saat X-Y arası" or "saat X-Y" (context keyword required)
 *
 * NEVER matches:
 *   - Dates like "17.03.2026" or project codes like "9.03.26"
 *   - Phone numbers like "+905554443322"
 *   - Random digit-dash-digit patterns without time context
 *
 * @returns {{ startHour, startMinute, endHour, endMinute }|null}
 */
function parsePreferredTime(messageContent) {
    if (!messageContent || typeof messageContent !== 'string') return null;
    const text = messageContent.toLowerCase();

    // Pattern 1: "15:00-18:00" or "15:00 - 18:00" (strict HH:MM-HH:MM with colon)
    const rangeHHMM = text.match(/(\d{1,2}):(\d{2})\s*[-\u2013]\s*(\d{1,2}):(\d{2})/);
    if (rangeHHMM) {
        const startH = parseInt(rangeHHMM[1]), startM = parseInt(rangeHHMM[2]);
        const endH   = parseInt(rangeHHMM[3]), endM   = parseInt(rangeHHMM[4]);
        if (startH >= 6 && endH > startH && endH <= 23) {
            console.log(`🔍 [parsePreferredTime] Matched HH:MM range: ${startH}:${String(startM).padStart(2,'0')}-${endH}:${String(endM).padStart(2,'0')}`);
            return { startHour: startH, startMinute: startM, endHour: endH, endMinute: endM };
        }
    }

    // Pattern 2: "saat 15-18 arası" or "saat 15-18" (requires "saat" AND/OR "arası" context)
    // This guards against matching random digit-dash-digit patterns from dates/codes
    const rangeWithContext = text.match(/saat\s*(\d{1,2})\s*[-\u2013]\s*(\d{1,2})(?:\s*(?:aras[ıi]|saat))?/);
    if (rangeWithContext) {
        const startH = parseInt(rangeWithContext[1]), endH = parseInt(rangeWithContext[2]);
        if (startH >= 6 && endH > startH && endH <= 23 && endH - startH <= 8) {
            console.log(`🔍 [parsePreferredTime] Matched "saat X-Y" range: ${startH}-${endH}`);
            return { startHour: startH, startMinute: 0, endHour: endH, endMinute: 0 };
        }
    }

    // Pattern 2b: "15-18 arası" (requires "arası" suffix, no "saat" prefix)
    const rangeWithArasi = text.match(/(\d{1,2})\s*[-\u2013]\s*(\d{1,2})\s+aras[ıi]/);
    if (rangeWithArasi) {
        const startH = parseInt(rangeWithArasi[1]), endH = parseInt(rangeWithArasi[2]);
        if (startH >= 6 && endH > startH && endH <= 23 && endH - startH <= 8) {
            console.log(`🔍 [parsePreferredTime] Matched "X-Y arası" range: ${startH}-${endH}`);
            return { startHour: startH, startMinute: 0, endHour: endH, endMinute: 0 };
        }
    }

    console.log(`🔍 [parsePreferredTime] No preferred time found in message`);
    return null;
}

// =====================================================================
// calculateScheduledAt
// =====================================================================
/**
 * Calculate the EXACT Date (UTC) when the call should be made.
 * All time comparisons use Turkey timezone (UTC+3).
 *
 *  A) preferredWindow provided:
 *     - Window hasn't started yet today  → schedule at window start today
 *     - Currently inside window          → call immediately
 *     - Window already passed today      → schedule at window start tomorrow
 *
 *  B) No preferredWindow → use business hours (same logic as A)
 *
 * @returns {Date} UTC Date for when to schedule the call
 */
function calculateScheduledAt(preferredWindow, schedule, baseDate = new Date()) {
    const tr = getTurkeyNow(baseDate);
    const nowMin = tr.totalMinutes;

    if (preferredWindow) {
        const { startHour, startMinute, endHour, endMinute } = preferredWindow;
        const windowStartMin = startHour * 60 + startMinute;
        const windowEndMin   = endHour * 60 + endMinute;

        if (nowMin < windowStartMin) {
            console.log(`🕐 [AutoCall] Preferred window: scheduling at ${startHour}:${String(startMinute).padStart(2,'0')} today (TR)`);
            return createTRDate(baseDate, startHour, startMinute);
        } else if (nowMin < windowEndMin) {
            console.log(`🕐 [AutoCall] Preferred window: currently inside — calling immediately`);
            return new Date(baseDate);
        } else {
            console.log(`🕐 [AutoCall] Preferred window passed — scheduling at ${startHour}:${String(startMinute).padStart(2,'0')} tomorrow (TR)`);
            return createTRDate(baseDate, startHour, startMinute, 1);
        }
    }

    // No preferred window — use business hours
    const bizStart = schedule?.start || '09:00';
    const bizEnd   = schedule?.end   || '18:00';
    const [bizSH, bizSM] = bizStart.split(':').map(Number);
    const [bizEH, bizEM] = bizEnd.split(':').map(Number);
    const bizStartMin = bizSH * 60 + bizSM;
    const bizEndMin   = bizEH * 60 + bizEM;

    // Check if today is an allowed day
    const allowedDays = (schedule?.days && schedule.days.length > 0) ? schedule.days : null;
    const isAllowedDay = !allowedDays || allowedDays.includes(tr.day);

    if (isAllowedDay && nowMin >= bizStartMin && nowMin < bizEndMin) {
        console.log(`🕐 [AutoCall] Inside business hours (${bizStart}-${bizEnd}) — calling immediately`);
        return new Date(baseDate);
    }

    if (isAllowedDay && nowMin < bizStartMin) {
        console.log(`🕐 [AutoCall] Before business hours — scheduling at ${bizStart} today (TR)`);
        return createTRDate(baseDate, bizSH, bizSM);
    }

    // Business hours passed or today not allowed — find next valid day
    for (let offset = 1; offset <= 7; offset++) {
        const futureDate = createTRDate(baseDate, bizSH, bizSM, offset);
        const futureTR = getTurkeyNow(futureDate);
        if (!allowedDays || allowedDays.includes(futureTR.day)) {
            console.log(`🕐 [AutoCall] Outside business hours — scheduling at ${bizStart} in ${offset} day(s) (TR: ${futureDate.toISOString()})`);
            return futureDate;
        }
    }

    // Fallback: next day at business start
    console.log(`🕐 [AutoCall] Fallback — scheduling at ${bizSH}:${String(bizSM).padStart(2,'0')} tomorrow (TR)`);
    return createTRDate(baseDate, bizSH, bizSM, 1);
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
 * @param {Date} baseDate - The timestamp the event occurred to build schedules from
 * @param {{ startHour, startMinute, endHour, endMinute }|null} explicitPreferredWindow - Directly parsed
 *   preferred call window from structured lead form data. When provided, bypasses messageContent
 *   parsing entirely. Use this for LEAD/FORM triggers so that customer time preferences are honoured
 *   without risking false positives from date strings inside system-generated message content.
 */
export const triggerAutoCall = async (workspaceId, phoneNumber, contactId, contactName, triggerSource, messageContent = null, baseDate = new Date(), explicitPreferredWindow = null) => {
    // ─── CONCURRENCY LOCK ───────────────────────────────────────────────────────
    // Prevent race condition: multiple triggers firing in parallel for the same
    // phone create multiple ScheduledCall rows because they all pass the PENDING
    // check simultaneously. Only the first caller gets through.
    const rawPhone = phoneNumber ? String(phoneNumber).replace(/\s/g, '') : '';
    const lockKey = `${workspaceId}:${rawPhone}`;
    if (autoCallLocks.has(lockKey)) {
        console.log(`🔒 [AutoCall] Lock active for ${lockKey} (trigger: ${triggerSource}) — skipping duplicate`);
        return;
    }
    autoCallLocks.add(lockKey);
    // Auto-release lock after 30 s so future legitimate retries can proceed
    setTimeout(() => autoCallLocks.delete(lockKey), 30_000);
    // ────────────────────────────────────────────────────────────────────────────

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

        // Deduplication: don't create ANOTHER scheduled call if one is already PENDING for this number
        const existingPendingCall = await prisma.scheduledCall.findFirst({
            where: {
                workspaceId,
                toNumber: formattedPhone,
                status: 'PENDING'
            }
        });

        if (existingPendingCall) {
            console.log(`⏭️ [AutoCall] Skipping: a PENDING scheduled call already exists for ${formattedPhone} (scheduledAt: ${existingPendingCall.scheduledAt?.toLocaleString('tr-TR')})`);
            return;
        }

        // Extract rule-specific config
        const ruleDelay = triggerConfig.delay !== undefined ? triggerConfig.delay : workspace.retellAutoCallDelay;
        const ruleAgentId = triggerConfig.agentId || workspace.retellAgentId;

        if (!ruleAgentId) {
            console.log(`⏭️ [AutoCall] Skipping: no agent ID configured for trigger ${triggerSource}`);
            return;
        }

        // 🛡️ SAFETY: System-generated triggers (LEAD, FORM, FLOW) should NEVER have their
        // message content parsed for time preferences — they contain auto-formatted strings
        // like dates ("23.03.2026") that can be misinterpreted as times ("23:03").
        // NOTE: explicitPreferredWindow (structured data from form fields) is intentionally
        // preserved — it comes from validated fieldData, not free-form text, so it is safe.
        const SYSTEM_TRIGGERS = ['LEAD', 'FORM', 'FLOW_TRIGGER', 'FLOW_RETRY'];
        if (SYSTEM_TRIGGERS.includes(triggerSource)) {
            messageContent = null;
            console.log(`🛡️ [AutoCall] System trigger "${triggerSource}" — message parsing skipped${explicitPreferredWindow ? ` (explicit preferredWindow retained: ${explicitPreferredWindow.startHour}:${String(explicitPreferredWindow.startMinute).padStart(2,'0')}-${explicitPreferredWindow.endHour}:${String(explicitPreferredWindow.endMinute).padStart(2,'0')})` : ''}`);
        }

        // 🕐 SMART SCHEDULING
        // 1. detectCallRequestInMessage: does the customer explicitly ask to be called?
        //    - type:'immediate' ("hemen ara", "beni arayın" etc.) → bypass schedule, call NOW
        //    - type:'scheduled' (e.g. "saat 15:00'te arayın")   → use that scheduledAt time
        //    - null → fall through to business-hours logic
        // 2. parsePreferredTime: does the message contain a preferred time window?
        //    (e.g. "15:00-18:00 arası arayın") → schedule to that window
        // 3. Business hours: inside → call now+1min, outside → wait until next window start
        const callDetect = detectCallRequestInMessage(messageContent);
        console.log(`🔍 [AutoCall] detectCallRequestInMessage result:`, JSON.stringify(callDetect));
        console.log(`🔍 [AutoCall] messageContent (first 200):`, messageContent?.substring(0, 200));
        console.log(`🔍 [AutoCall] baseDate:`, baseDate?.toISOString?.() || baseDate);

        let scheduledAt;

        if (callDetect?.type === 'immediate') {
            // Customer explicitly said "hemen ara", "beni arayın" etc. → call immediately
            scheduledAt = new Date(baseDate);
            console.log(`📞 [AutoCall] Customer requested IMMEDIATE call — scheduling immediately`);

        } else if (callDetect?.type === 'scheduled' && callDetect.scheduledAt) {
            // Customer said "saat 15:00'te ara" → use that exact time
            scheduledAt = callDetect.scheduledAt;
            console.log(`📞 [AutoCall] Customer requested call at ${scheduledAt.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}`);

        } else {
            // No explicit customer request → apply business hours / preferred window logic
            // Priority: explicitPreferredWindow (structured lead field) > parsePreferredTime (free-text)
            let preferredWindow = explicitPreferredWindow || parsePreferredTime(messageContent);
            if (explicitPreferredWindow) {
                console.log(`🕐 [AutoCall] Using explicitPreferredWindow from lead form: ${explicitPreferredWindow.startHour}:${String(explicitPreferredWindow.startMinute).padStart(2,'0')}-${explicitPreferredWindow.endHour}:${String(explicitPreferredWindow.endMinute).padStart(2,'0')}`);
            }

            // Fallback: if no preferred time found in the trigger message,
            // scan recent conversation messages (e.g., the "EK BİLGİLER" block may be in a different message)
            if (!preferredWindow && contactId) {
                try {
                    const recentConversation = await prisma.conversation.findFirst({
                        where: { contactId, workspaceId },
                        orderBy: { lastMessageAt: 'desc' },
                        select: { id: true }
                    });
                    if (recentConversation) {
                        const recentMessages = await prisma.message.findMany({
                            where: { conversationId: recentConversation.id },
                            orderBy: { createdAt: 'desc' },
                            take: 15,
                            select: { content: true }
                        });
                        for (const msg of recentMessages) {
                            preferredWindow = parsePreferredTime(msg.content);
                            if (preferredWindow) {
                                console.log(`📞 [AutoCall] Found preferred time window in conversation history: ${msg.content?.substring(0, 80)}`);
                                break;
                            }
                        }
                    }
                } catch (scanErr) {
                    console.warn(`⚠️ [AutoCall] Failed to scan conversation for preferred time:`, scanErr.message);
                }
            }

            const ruleSchedule = (triggerConfig.callStart && triggerConfig.callEnd) ? {
                start: triggerConfig.callStart,
                end: triggerConfig.callEnd,
                days: workspace.retellAutoCallSchedule?.days || [0, 1, 2, 3, 4, 5, 6]
            } : workspace.retellAutoCallSchedule;

            scheduledAt = calculateScheduledAt(preferredWindow, ruleSchedule, baseDate);

            console.log(`🔍 [AutoCall] parsePreferredTime result:`, JSON.stringify(preferredWindow));
            if (preferredWindow) {
                console.log(`📞 [AutoCall] Preferred time window → ${scheduledAt.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}`);
            } else {
                console.log(`📞 [AutoCall] Business hours logic → ${scheduledAt.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}`);
            }
        }

        console.log(`📅 [AutoCall] Final schedule: ${formattedPhone} → ${scheduledAt.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })} (UTC: ${scheduledAt.toISOString()})`);

        // Duplicate prevention: check for existing PENDING calls for this phone within 24 hours
        const existingCall = await prisma.scheduledCall.findFirst({
            where: {
                workspaceId,
                toNumber: formattedPhone,
                status: 'PENDING',
                scheduledAt: {
                    gte: new Date(scheduledAt.getTime() - 24 * 60 * 60 * 1000),
                    lte: new Date(scheduledAt.getTime() + 24 * 60 * 60 * 1000)
                }
            }
        });
        if (existingCall) {
            console.log(`⏭️ [AutoCall] Skipping duplicate: already have PENDING call for ${formattedPhone} at ${existingCall.scheduledAt.toLocaleString('tr-TR')}`);
            return;
        }

        const delayMs = scheduledAt.getTime() - Date.now();
        if (delayMs > 2 * 60 * 1000) {
            await prisma.scheduledCall.create({
                data: {
                    workspaceId,
                    contactId: contactId || null,
                    contactName: contactName || null,
                    toNumber: formattedPhone,
                    agentId: ruleAgentId || null,
                    scheduledAt: scheduledAt,
                    status: 'PENDING',
                    createdById: 'auto'
                }
            });
            console.log(`📅 [AutoCall] Saved ScheduledCall to DB for ${scheduledAt.toLocaleString('tr-TR')}`);

        } else {
            setTimeout(async () => {
                try {
                    await executeScheduledCall(workspaceId, formattedPhone, ruleAgentId, contactId, contactName, triggerSource);
                } catch (callErr) {
                    console.error(`❌ [AutoCall] Failed to call ${formattedPhone}:`, callErr.message);
                }
            }, Math.max(0, delayMs));
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
    
    // Use provided agentId, otherwise fall back to workspace default
    const effectiveAgentId = agentId || workspace.retellAgentId;
    
    if (!effectiveAgentId) throw new Error('No Retell Agent ID configured/provided');

    const client = new Retell({ apiKey: workspace.retellApiKey });
    const formattedFrom = normalizePhone(workspace.retellFromNumber);

    const callParams = {
        from_number: formattedFrom,
        to_number: toNumber,
        override_agent_id: effectiveAgentId,
        metadata: { workspaceId, contactId: contactId || null, contactName: contactName || null, autoCallTrigger: triggerSource }
    };

    // Only add dynamic variables if we have a contact name
    if (contactName) {
        callParams.retell_llm_dynamic_variables = {
            customer_name: contactName
        };
    }

    const callResponse = await client.call.createPhoneCall(callParams);
    await prisma.retellCall.create({
        data: {
            workspace: { connect: { id: workspaceId } },
            contactId: contactId || null,
            callId: callResponse.call_id,
            agentId: effectiveAgentId,
            fromNumber: formattedFrom,
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
                // 🔒 ATOMIC LOCK: Mark COMPLETED first using updateMany (returns count).
                // If count=0, another runner already picked this up — skip to avoid duplicate calls.
                const locked = await prisma.scheduledCall.updateMany({
                    where: { id: sc.id, status: 'PENDING' },
                    data: { status: 'COMPLETED' }
                });
                if (locked.count === 0) {
                    console.log(`⏭️ [ScheduledCall] Skipping ${sc.id} — already picked up by another runner`);
                    continue;
                }
                const ws = await prisma.workspace.findUnique({ where: { id: sc.workspaceId }, select: { retellAgentId: true } });
                await executeScheduledCall(sc.workspaceId, sc.toNumber, sc.agentId || ws?.retellAgentId, sc.contactId, sc.contactName, 'SCHEDULED');
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

        // Unique by agent_id, prioritizing latest version and published state
        const uniqueAgentsMap = new Map();
        
        // Sort by timestamp newest first to help pick the latest
        const sortedAgents = (agents || []).sort((a, b) => 
            (b.last_modification_timestamp || 0) - (a.last_modification_timestamp || 0)
        );

        sortedAgents.forEach(a => {
            if (!uniqueAgentsMap.has(a.agent_id)) {
                uniqueAgentsMap.set(a.agent_id, a);
            } else {
                // If we already have it, but this one is published and existing is not, prefer this
                const existing = uniqueAgentsMap.get(a.agent_id);
                if (a.is_published && !existing.is_published) {
                    uniqueAgentsMap.set(a.agent_id, a);
                }
            }
        });

        let uniqueAgents = Array.from(uniqueAgentsMap.values());
        
        // If still too many (phantom agents), prioritize published ones only
        if (uniqueAgents.length > 10) {
            const publishedOnly = uniqueAgents.filter(a => a.is_published);
            if (publishedOnly.length > 0) uniqueAgents = publishedOnly;
        }

        res.json({ agents: uniqueAgents });
    } catch (error) {
        console.error('❌ [Retell] Get agents error:', error);
        res.status(500).json({ error: 'Failed to fetch Retell agents' });
    }
};

// Make an outbound call
export const makeCall = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { toNumber, contactId, contactName, conversationId: sourceConversationId, agentId } = req.body;
        const userId = req.user.id;

        if (!toNumber) {
            return res.status(400).json({ error: 'Telefon numarası gerekli' });
        }

        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { retellApiKey: true, retellAgentId: true, retellFromNumber: true }
        });

        // Allow progress if either a specific agentId is provided OR workspace has a default
        if (!workspace?.retellApiKey || (!agentId && !workspace?.retellAgentId)) {
            return res.status(400).json({ error: 'Retell ayarları yapılandırılmamış (Agent ID eksik)' });
        }

        if (!workspace.retellFromNumber) {
            return res.status(400).json({ error: 'Arama yapılacak numara yapılandırılmamış' });
        }

        const client = new Retell({ apiKey: workspace.retellApiKey });
        const formattedTo = normalizePhone(toNumber);
        const effectiveAgentId = agentId || workspace.retellAgentId;

        const formattedFrom = normalizePhone(workspace.retellFromNumber);

        const callParams = {
            from_number: formattedFrom,
            to_number: formattedTo,
            override_agent_id: effectiveAgentId,
            metadata: {
                workspaceId,
                contactId: contactId || null,
                contactName: contactName || null,
                createdById: userId
            }
        };

        if (contactName) {
            callParams.retell_llm_dynamic_variables = {
                customer_name: contactName
            };
        }

        const callResponse = await client.call.createPhoneCall(callParams);

        // Save call record
        const callRecord = await prisma.retellCall.create({
            data: {
                workspace: { connect: { id: workspaceId } },
                contactId: contactId || null,
                callId: callResponse.call_id,
                agentId: effectiveAgentId,
                fromNumber: formattedFrom,
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
                            const existingReal = await prisma.retellCall.findUnique({ where: { callId: realCallId } });
                            if (existingReal) {
                                await prisma.retellCall.delete({ where: { id: tempRec.id } });
                                console.log(`📞 [Watcher] Webhook already created real call ${realCallId}. Deleted temp record.`);
                            } else {
                                await prisma.retellCall.update({ where: { id: tempRec.id }, data: { callId: realCallId } });
                            }
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
                    cost: call.call_cost?.combined_cost ?? null,
                    // Retell'den gelen gerçek başlangıcç zamanını kaydet (yoksa mevcut değer korun)
                    ...(call.start_timestamp ? { createdAt: new Date(call.start_timestamp) } : {})
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

        console.log(`📞 [Retell] Call analyzed: ${call.call_id}, sentiment: ${analysis.user_sentiment}, success: ${analysis.call_successful}`);

        // === TRIGGER AUTOMATION ===
        if (callRecord) {
            try {
                const { executeRetellAutomation } = await import('./automation.controller.js');
                await executeRetellAutomation(callRecord.workspaceId, callRecord);
            } catch (autoErr) {
                console.error('❌ [Retell] Automation trigger error:', autoErr.message);
            }
        }
    } catch (err) {
        console.error('❌ [Retell] handleCallAnalyzed error:', err.message);
    }
}

// Schedule a call for later
export const scheduleCall = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { toNumber, contactId, contactName, scheduledAt, agentId } = req.body;
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

        const scheduled = await prisma.scheduledCall.create({
            data: {
                workspaceId,
                contactId: contactId || null,
                contactName: contactName || null,
                toNumber: normalizePhone(toNumber),
                agentId: agentId || null,
                scheduledAt: scheduledDate,
                createdById: userId
            }
        });

        console.log(`📅 [Retell] Call scheduled: ${toNumber} at ${scheduledDate.toISOString()}`);
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

// Update (reschedule) a scheduled call
export const updateScheduledCall = async (req, res) => {
    try {
        const { workspaceId, id } = req.params;
        const { scheduledAt } = req.body;

        if (!scheduledAt) {
            return res.status(400).json({ error: 'Yeni tarih/saat gerekli' });
        }

        const newDate = new Date(scheduledAt);
        if (newDate <= new Date()) {
            return res.status(400).json({ error: 'Planlanan saat gelecekte olmalı' });
        }

        const call = await prisma.scheduledCall.findFirst({
            where: { id, workspaceId, status: 'PENDING' }
        });

        if (!call) {
            return res.status(404).json({ error: 'Planlanmış arama bulunamadı' });
        }

        const updated = await prisma.scheduledCall.update({
            where: { id },
            data: { scheduledAt: newDate }
        });

        console.log(`📅 [Retell] Scheduled call rescheduled: ${id} → ${newDate.toISOString()}`);
        res.json({ success: true, scheduledCall: updated });
    } catch (error) {
        console.error('❌ [Retell] Update scheduled call error:', error);
        res.status(500).json({ error: 'Arama güncellenemedi' });
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

                // 🔒 ATOMIC LOCK: Mark as PROCESSING first to prevent duplicate execution
                // by the other scheduler (processScheduledCalls). If already picked up,
                // the update will affect 0 rows and we skip.
                const locked = await prisma.scheduledCall.updateMany({
                    where: { id: sc.id, status: 'PENDING' },
                    data: { status: 'COMPLETED' }
                });
                if (locked.count === 0) {
                    console.log(`⏭️ [executeScheduledCalls] Skipping ${sc.id} — already picked up by another runner`);
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

                // Update retellCallId reference
                await prisma.scheduledCall.update({
                    where: { id: sc.id },
                    data: { retellCallId: callResponse.call_id }
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

// Sync historical calls from Retell API → DB (Retell = tek kaynak of truth)
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

        // ── 1. Retell'den tüm aramaları çek (sayfalı, maks 1000) ──
        let allCalls = [];
        let paginationKey = null;
        const PAGE_LIMIT = 100;
        let pageCount = 0;

        do {
            const params = { limit: PAGE_LIMIT };
            if (paginationKey) params.pagination_key = paginationKey;
            const page = await client.call.list(params) || [];
            allCalls = allCalls.concat(page);
            paginationKey = page.length === PAGE_LIMIT ? page[page.length - 1].call_id : null;
            pageCount++;
        } while (paginationKey && pageCount < 10);

        console.log(`📋 [Sync] Retell'den ${allCalls.length} arama çekildi`);

        // ── 2. Retell'de OLMAYAN DB kayıtlarını sil (birebir eşleşme) ──
        const retellIds = new Set(allCalls.map(c => c.call_id));
        const deleted = await prisma.retellCall.deleteMany({
            where: {
                workspaceId,
                callId: { notIn: Array.from(retellIds) }
            }
        });
        console.log(`🗑️ [Sync] ${deleted.count} kayıt silindi (Retell'de yok)`);

        // ── 3. Her Retell aramasını DB'ye yaz (upsert) ──
        let created = 0;
        let updated = 0;
        let errors = 0;

        for (const call of allCalls) {
            try {
                const toNumber   = call.to_number   || call.to   || '';
                const fromNumber = call.from_number || call.from || '';
                const duration   = call.duration_ms ? Math.round(call.duration_ms / 1000) : null;
                const callTime   = call.start_timestamp ? new Date(call.start_timestamp) : null;

                // Contact eşleştir (kendi numaramızı atla)
                let contactId = null;
                for (const phone of [toNumber, fromNumber].filter(Boolean)) {
                    const norm = normalizePhone(phone);
                    if (norm === normalizePhone(workspace.retellFromNumber || '')) continue;
                    const contact = await prisma.contact.findFirst({
                        where: {
                            workspaceId,
                            OR: [
                                { phone: norm },
                                { phone },
                                { phone: phone.replace(/\D/g, '') }
                            ]
                        },
                        select: { id: true }
                    });
                    if (contact) { contactId = contact.id; break; }
                }

                // Mevcut kaydı bul
                const existing = await prisma.retellCall.findUnique({
                    where: { callId: call.call_id }
                });

                const data = {
                    workspaceId,
                    callId:        call.call_id,
                    agentId:       call.agent_id || workspace.retellAgentId || '',
                    fromNumber:    fromNumber || workspace.retellFromNumber || '',
                    toNumber,
                    direction:     call.direction || 'outbound',
                    status:        call.call_status || 'ended',
                    duration,
                    transcript:    call.transcript || null,
                    recordingUrl:  call.recording_url || null,
                    summary:       call.call_analysis?.call_summary || null,
                    sentiment:     call.call_analysis?.user_sentiment || null,
                    callSuccessful: call.call_analysis?.call_successful ?? null,
                    endedReason:   call.disconnection_reason || null,
                    cost:          call.call_cost?.combined_cost ?? null,
                    ...(callTime ? { createdAt: callTime } : {}),
                    ...(contactId ? { contactId } : {})
                };

                if (!existing) {
                    await prisma.retellCall.create({ data: { ...data, createdById: '' } });
                    created++;
                    
                    // --- WEBHOOK RECOVERY TRIGGER ---
                    if (data.status === 'ended' || data.status === 'error') {
                        console.log(`🔄 [Sync] Missed webhook recovered for newly inserted call ${call.call_id}`);
                        await handleCallEnded(call).catch(e => console.error(`❌ [Sync Recovery] call_ended error:`, e.message));
                        if (call.call_analysis) {
                            await handleCallAnalyzed(call).catch(e => console.error(`❌ [Sync Recovery] call_analyzed error:`, e.message));
                        }
                    }
                } else {
                    await prisma.retellCall.update({
                        where: { id: existing.id },
                        data: {
                            status:        data.status,
                            duration:      data.duration,
                            transcript:    data.transcript,
                            recordingUrl:  data.recordingUrl,
                            summary:       data.summary,
                            sentiment:     data.sentiment,
                            callSuccessful: data.callSuccessful,
                            endedReason:   data.endedReason,
                            cost:          data.cost,
                            ...(data.toNumber   && !existing.toNumber   ? { toNumber: data.toNumber }     : {}),
                            ...(data.fromNumber && !existing.fromNumber ? { fromNumber: data.fromNumber } : {}),
                            ...(callTime ? { createdAt: callTime } : {}),
                            ...(contactId && !existing.contactId ? { contactId } : {})
                        }
                    });
                    updated++;
                    
                    // --- WEBHOOK RECOVERY TRIGGER ---
                    const missedStatus = existing.status !== 'ended' && existing.status !== 'error';
                    const isNowEnded = data.status === 'ended' || data.status === 'error';
                    
                    if (missedStatus && isNowEnded) {
                        console.log(`🔄 [Sync] Missed webhook recovered for existing call ${call.call_id} (Status: ${existing.status} -> ${data.status})`);
                        await handleCallEnded(call).catch(e => console.error(`❌ [Sync Recovery] call_ended error:`, e.message));
                        if (call.call_analysis) {
                            await handleCallAnalyzed(call).catch(e => console.error(`❌ [Sync Recovery] call_analyzed error:`, e.message));
                        }
                    }
                }
            } catch (err) {
                errors++;
                console.error(`❌ [Sync] ${call.call_id}:`, err.message);
            }
        }

        console.log(`✅ [Sync] ${created} yeni, ${updated} güncellendi, ${deleted.count} silindi, ${errors} hata`);
        res.json({
            total:   allCalls.length,
            created,
            updated,
            deleted: deleted.count,
            errors
        });
    } catch (error) {
        console.error('❌ [Sync] Hata:', error);
        res.status(500).json({ error: 'Senkronizasyon hatası: ' + error.message });
    }
};
