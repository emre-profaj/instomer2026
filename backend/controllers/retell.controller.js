import prisma from '../lib/prisma.js';
import Retell from 'retell-sdk';
import { createNotification } from './notification.controller.js';
import { normalizePhone } from '../utils/phoneNormalizer.js';
import { emitToWorkspace } from '../socket.js';
import { assignDefaultFunnel } from '../services/conversationRouting.service.js';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import { executeRule } from '../services/ruleEngine.service.js';

// ─── Turkey Timezone Helpers (UTC+3) ───────────────────────────
const TZ_OFFSET_MS = 3 * 60 * 60 * 1000;
function parseDateStartTR(dateStr) {
    const dateOnly = String(dateStr).includes('T') ? String(dateStr).split('T')[0] : dateStr;
    const d = new Date(dateOnly + 'T00:00:00.000Z');
    if (isNaN(d.getTime())) return new Date();
    return new Date(d.getTime() - TZ_OFFSET_MS);
}
function parseDateEndTR(dateStr) {
    const dateOnly = String(dateStr).includes('T') ? String(dateStr).split('T')[0] : dateStr;
    const d = new Date(dateOnly + 'T00:00:00.000Z');
    if (isNaN(d.getTime())) return new Date();
    return new Date(d.getTime() - TZ_OFFSET_MS + 24 * 60 * 60 * 1000 - 1);
}

// Helper to find the team that a Retell agent belongs to
async function resolveAgentTeamId(workspaceId, agentId) {
    if (!agentId) return null;
    try {
        const member = await prisma.teamMember.findFirst({
            where: {
                retellAgentId: agentId,
                team: {
                    workspaceId: workspaceId
                }
            },
            select: { teamId: true }
        });
        return member?.teamId || null;
    } catch (e) {
        console.error('❌ [Retell] Error resolving agent team ID:', e.message);
        return null;
    }
}

// Helper to find the team-specific Retell agent ID for a contact or conversation
async function getTeamAgentIdForContactOrConversation(workspaceId, contactId, conversationId) {
    let teamId = null;

    if (conversationId) {
        const conv = await prisma.conversation.findUnique({
            where: { id: conversationId },
            select: { assignedTeamId: true }
        });
        if (conv?.assignedTeamId) {
            teamId = conv.assignedTeamId;
        }
    }

    if (!teamId && contactId) {
        // Fallback: get the most recent conversation for this contact
        const conv = await prisma.conversation.findFirst({
            where: { contactId, workspaceId },
            orderBy: { lastMessageAt: 'desc' },
            select: { assignedTeamId: true }
        });
        if (conv?.assignedTeamId) {
            teamId = conv.assignedTeamId;
        }
    }

    if (teamId) {
        // Find if this team has a Retell Agent member
        const member = await prisma.teamMember.findFirst({
            where: {
                teamId,
                retellAgentId: { not: null }
            },
            select: { retellAgentId: true }
        });
        if (member?.retellAgentId) {
            console.log(`🎯 [Retell Agent Resolution] Resolved agent ${member.retellAgentId} for team ${teamId}`);
            return member.retellAgentId;
        }
    }

    return null;
}



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
                retellAutoCallSchedule: true,
                aiFallbackEnabled: true,
                aiFallbackDelayMinutes: true,
                aiFallbackPoolEnabled: true,
                retellMaxOverdueDays: true,
                retellScheduledCallTimeoutHours: true
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
            retellAutoCallSchedule: workspace?.retellAutoCallSchedule || { start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5] },
            // AI Devralma
            aiFallbackEnabled: workspace?.aiFallbackEnabled || false,
            aiFallbackDelayMinutes: workspace?.aiFallbackDelayMinutes ?? 60,
            aiFallbackPoolEnabled: workspace?.aiFallbackPoolEnabled || false,
            retellMaxOverdueDays: workspace?.retellMaxOverdueDays ?? 3,
            retellScheduledCallTimeoutHours: workspace?.retellScheduledCallTimeoutHours ?? 2
        });
    } catch (error) {
        console.error('❌ [Retell] Get settings error:', error);
        res.status(500).json({ error: 'AI Arama ayarları alınamadı' });
    }
};

// Save Retell settings
export const saveSettings = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { retellApiKey, retellAgentId, retellFromNumber,
            retellAutoCallEnabled, retellAutoCallTriggers, retellAutoCallDelay, retellAutoCallSchedule,
            aiFallbackEnabled, aiFallbackDelayMinutes, aiFallbackPoolEnabled } = req.body;

        const updateData = {};
        if (retellApiKey !== undefined) updateData.retellApiKey = retellApiKey;
        if (retellAgentId !== undefined) updateData.retellAgentId = retellAgentId;
        if (retellFromNumber !== undefined) updateData.retellFromNumber = retellFromNumber;
        if (retellAutoCallEnabled !== undefined) updateData.retellAutoCallEnabled = retellAutoCallEnabled;
        if (retellAutoCallTriggers !== undefined) updateData.retellAutoCallTriggers = retellAutoCallTriggers;
        if (retellAutoCallDelay !== undefined) updateData.retellAutoCallDelay = retellAutoCallDelay;
        if (retellAutoCallSchedule !== undefined) updateData.retellAutoCallSchedule = retellAutoCallSchedule;
        // AI Devralma
        if (aiFallbackEnabled !== undefined) updateData.aiFallbackEnabled = aiFallbackEnabled;
        if (aiFallbackDelayMinutes !== undefined) updateData.aiFallbackDelayMinutes = parseInt(aiFallbackDelayMinutes) || 60;
        if (aiFallbackPoolEnabled !== undefined) updateData.aiFallbackPoolEnabled = aiFallbackPoolEnabled;
        // Max overdue days
        const { retellMaxOverdueDays } = req.body;
        if (retellMaxOverdueDays !== undefined) updateData.retellMaxOverdueDays = parseInt(retellMaxOverdueDays) || 3;
        const { retellScheduledCallTimeoutHours } = req.body;
        if (retellScheduledCallTimeoutHours !== undefined) updateData.retellScheduledCallTimeoutHours = parseInt(retellScheduledCallTimeoutHours) || 2;

        await prisma.workspace.update({
            where: { id: workspaceId },
            data: updateData
        });

        // If auto-call was just turned OFF, cancel all pending scheduled calls
        if (retellAutoCallEnabled === false) {
            const cancelled = await prisma.scheduledCall.updateMany({
                where: { workspaceId, status: 'PENDING' },
                data: { status: 'CANCELLED', errorMessage: 'Otomatik arama kapatıldı' }
            });
            if (cancelled.count > 0) {
                console.log(`🛑 [Retell] Cancelled ${cancelled.count} pending scheduled calls (auto-call disabled)`);
            }
        }

        console.log(`✅ [Retell] Settings updated for workspace ${workspaceId}`);
        res.json({ success: true, message: 'AI Arama ayarları kaydedildi' });
    } catch (error) {
        console.error('❌ [Retell] Save settings error:', error);
        res.status(500).json({ error: 'AI Arama ayarları kaydedilemedi' });
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
export const triggerAutoCall = async (workspaceId, phoneNumber, contactId, contactName, triggerSource, messageContent = null, baseDate = new Date(), explicitPreferredWindow = null, extraDynamicVariables = null) => {
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
                retellAutoCallSchedule: true,
                companyName: true,
                defaultLanguage: true
            }
        });

        // Check if auto-call is enabled and configured
        if (!workspace?.retellAutoCallEnabled) return;
        if (!workspace.retellApiKey || !workspace.retellAgentId || !workspace.retellFromNumber) {
            console.log(`⏭️ [AutoCall] Skipping: workspace ${workspaceId} not fully configured`);
            return;
        }

        // System triggers → config'de tanımlıysa onu kullan, yoksa workspace defaults (asla skip etme)
        const BYPASS_TRIGGER_CONFIG = ['CHAT_REQUEST', 'STAGE_ACTION', 'STAGE_AUTOMATION', 'LEAD', 'FORM'];
        let triggerConfig;
        const triggers = workspace.retellAutoCallTriggers || {};

        if (BYPASS_TRIGGER_CONFIG.includes(triggerSource)) {
            if (!workspace.retellApiKey || !workspace.retellAgentId || !workspace.retellFromNumber) {
                console.log(`⏭️ [AutoCall] ${triggerSource}: workspace not fully configured`);
                return;
            }
            // Config'de tanımlıysa o ayarları kullan (agent, delay vb.)
            const configuredTrigger = triggers[triggerSource] || triggers['ALL'];
            if (configuredTrigger?.enabled) {
                triggerConfig = configuredTrigger;
                console.log(`🔄 [AutoCall] System trigger "${triggerSource}" — config bulundu, config ayarları kullanılıyor`);
            } else {
                // Config'de yok veya kapalı → workspace defaults ile çalış
                triggerConfig = { enabled: true, delay: 0, agentId: workspace.retellAgentId };
                console.log(`🔄 [AutoCall] System trigger "${triggerSource}" — config yok, workspace defaults kullanılıyor`);
            }
        } else {
            // Normal trigger → config'de tanımlı olmalı
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
        
        let ruleAgentId = await getTeamAgentIdForContactOrConversation(workspaceId, contactId, null);
        if (!ruleAgentId) {
            ruleAgentId = triggerConfig.agentId || workspace.retellAgentId;
        }

        if (!ruleAgentId) {
            console.log(`⏭️ [AutoCall] Skipping: no agent ID configured for trigger ${triggerSource}`);
            return;
        }

        // ─── AGENT CONFIG KONTROLÜ (triggerAutoCall) ─────────────────────────
        const agentConfigs = workspace.retellAutoCallTriggers?.agentConfigs || {};
        const agentCfg = agentConfigs[ruleAgentId];
        if (agentCfg) {
            // Agent pasifse arama yapma
            if (agentCfg.active === false) {
                console.log(`⏸️ [AutoCall] Agent ${ruleAgentId} pasif — arama planlanmayacak`);
                return;
            }
        }
        // Agent config'den takım bilgisi (triggerAutoCall'un alt kısmında kullanılacak)
        const agentTeamId = agentCfg?.teamId || null;

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
            // No explicit customer request → check for preferred time window
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

            if (preferredWindow) {
                // Müşteri saat tercihi belirtmiş → o pencereye göre planla
                const ruleSchedule = (triggerConfig.callStart && triggerConfig.callEnd) ? {
                    start: triggerConfig.callStart,
                    end: triggerConfig.callEnd,
                    days: workspace.retellAutoCallSchedule?.days || [0, 1, 2, 3, 4, 5, 6]
                } : workspace.retellAutoCallSchedule;
                scheduledAt = calculateScheduledAt(preferredWindow, ruleSchedule, baseDate);
                console.log(`🕐 [AutoCall] Preferred time window → ${scheduledAt.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}`);
            } else {
                // Tercih yok → ŞİMDİ planla, processScheduledCalls mesai kontrolünü zaten yapıyor (10:00-21:00)
                // Gece/mesai dışı gelen lead'ler DB'de bekler, cron ilk mesai saatinde otomatik arar
                scheduledAt = new Date(baseDate);
                console.log(`📞 [AutoCall] No time preference — scheduling NOW (processScheduledCalls handles business hours)`);
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

        // ─── BUILD DYNAMIC VARIABLES ────────────────────────────────────────────
        // Collect contact context to inject into the AI voice agent's prompt
        const dynamicVars = { ...(extraDynamicVariables || {}) };
        if (contactName) dynamicVars.customer_name = contactName;
        dynamicVars.trigger_source = triggerSource || 'AUTO';

        // Enrich from contact record
        if (contactId) {
            try {
                const contactRecord = await prisma.contact.findUnique({
                    where: { id: contactId },
                    select: { name: true, email: true, phone: true, status: true, category: true, tags: true, notes: true, source: true }
                });
                if (contactRecord) {
                    if (!dynamicVars.customer_name && contactRecord.name) dynamicVars.customer_name = contactRecord.name;
                    if (contactRecord.email) dynamicVars.customer_email = contactRecord.email;
                    if (contactRecord.source) dynamicVars.lead_source = contactRecord.source;
                    // Parse tags for interest topic
                    try {
                        const tags = JSON.parse(contactRecord.tags || '[]');
                        if (tags.length > 0) dynamicVars.customer_tags = tags.join(', ');
                    } catch (_) {}
                    if (contactRecord.notes) dynamicVars.customer_notes = contactRecord.notes.substring(0, 500);
                }
            } catch (e) { console.warn('⚠️ [AutoCall] Failed to enrich contact:', e.message); }
        }

        // Enrich from latest conversation (form data, topic, classification)
        if (contactId) {
            try {
                const latestConv = await prisma.conversation.findFirst({
                    where: { contactId, workspaceId },
                    orderBy: { lastMessageAt: 'desc' },
                    select: {
                        aiTopic: true,
                        classificationData: true,
                        channel: true,
                        messages: { orderBy: { createdAt: 'desc' }, take: 5, select: { content: true, isFromContact: true } }
                    }
                });
                if (latestConv) {
                    if (latestConv.aiTopic) dynamicVars.interest_topic = latestConv.aiTopic;
                    if (latestConv.channel) dynamicVars.contact_channel = latestConv.channel;
                    // Extract classification data for topic
                    if (latestConv.classificationData) {
                        try {
                            const classData = JSON.parse(latestConv.classificationData);
                            if (classData.extractedData?.topic && !dynamicVars.interest_topic) {
                                dynamicVars.interest_topic = classData.extractedData.topic;
                            }
                            if (classData.classification) dynamicVars.classification = classData.classification;
                        } catch (_) {}
                    }
                    // Last customer message as context
                    const lastCustomerMsg = latestConv.messages?.find(m => m.isFromContact);
                    if (lastCustomerMsg?.content) {
                        dynamicVars.last_customer_message = lastCustomerMsg.content.substring(0, 300);
                    }
                }
            } catch (e) { console.warn('⚠️ [AutoCall] Failed to enrich conversation:', e.message); }
        }

        // Enrich from form submission (if trigger is FORM or LEAD)
        if ((triggerSource === 'FORM' || triggerSource === 'LEAD') && contactId) {
            try {
                const formSub = await prisma.formSubmission.findFirst({
                    where: { contactId },
                    orderBy: { createdAt: 'desc' },
                    select: { formData: true }
                });
                if (formSub?.formData) {
                    try {
                        const formData = typeof formSub.formData === 'string' ? JSON.parse(formSub.formData) : formSub.formData;
                        // Common form field mappings
                        const topicFields = ['ilgi_alani', 'konu', 'subject', 'interest', 'hizmet', 'service', 'topic'];
                        for (const field of topicFields) {
                            if (formData[field] && !dynamicVars.interest_topic) {
                                dynamicVars.interest_topic = formData[field];
                            }
                        }
                        // Store raw form data summary
                        const formSummary = Object.entries(formData)
                            .filter(([k, v]) => v && !['token', 'csrf', 'captcha'].includes(k.toLowerCase()))
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(', ')
                            .substring(0, 500);
                        if (formSummary) dynamicVars.form_data = formSummary;
                    } catch (_) {}
                }
            } catch (e) { console.warn('⚠️ [AutoCall] Failed to enrich form data:', e.message); }
        }

        // Add workspace company name
        if (workspace.companyName) dynamicVars.company_name = workspace.companyName;

        // If no interest_topic found, use messageContent as fallback
        if (!dynamicVars.interest_topic && messageContent) {
            dynamicVars.interest_topic = messageContent.substring(0, 200);
        }

        const dynamicVarsJson = Object.keys(dynamicVars).length > 0 ? JSON.stringify(dynamicVars) : null;
        console.log(`🏷️ [AutoCall] Dynamic variables:`, JSON.stringify(dynamicVars, null, 2));
        // ────────────────────────────────────────────────────────────────────────────

        // ─── CHAT_REQUEST: Müşteri "beni arayın" dedi → Direkt AI arar ──────────
        if (triggerSource === 'CHAT_REQUEST') {
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
                        createdById: 'auto_chat_request',
                        dynamicVariables: dynamicVarsJson
                    }
                });
                console.log(`📅 [AutoCall] CHAT_REQUEST → ScheduledCall at ${scheduledAt.toLocaleString('tr-TR')}`);
            } else {
                setTimeout(async () => {
                    try {
                        await executeScheduledCall(workspaceId, formattedPhone, ruleAgentId, contactId, contactName, triggerSource, '', dynamicVars);
                    } catch (callErr) {
                        console.error(`❌ [AutoCall] CHAT_REQUEST call failed ${formattedPhone}:`, callErr.message);
                    }
                }, Math.max(0, delayMs));
            }
            return;
        }

        // ─── DİĞER TRİGGER'LAR: Takım/Kişiye görev ata → Sürede yapılmazsa AI devralır ──
        // Sohbetin atandığı takım/kişiyi bul
        let assignedTeamId = null;
        let assignedToId = null;
        let conversationId = null;
        let conversationChannel = null;

        if (contactId) {
            try {
                const latestConv = await prisma.conversation.findFirst({
                    where: { contactId, workspaceId },
                    orderBy: { lastMessageAt: 'desc' },
                    select: { id: true, assignedTeamId: true, assignedToId: true, channel: true }
                });
                if (latestConv) {
                    conversationId = latestConv.id;
                    assignedTeamId = latestConv.assignedTeamId || null;
                    assignedToId = latestConv.assignedToId || null;
                    conversationChannel = latestConv.channel || null;
                }
            } catch (e) { console.warn('⚠️ [AutoCall] Failed to find conversation:', e.message); }
        }

        // ─── FALLBACK: Sohbette takım/kişi yoksa kanal routing'den veya varsayılan takımdan bul ───
        if (!assignedTeamId && !assignedToId) {
            // 0. Agent config'den takım varsa önce onu kullan
            if (agentTeamId) {
                assignedTeamId = agentTeamId;
                console.log(`📋 [AutoCall] Takım agent config'den alındı: ${agentTeamId}`);
            }
            if (!assignedTeamId) {
            console.log(`📋 [AutoCall] Sohbette takım/kişi yok. Fallback aranıyor... (channel: ${conversationChannel}, trigger: ${triggerSource})`);
            try {
                // 1. Kanal routing'den takım bul (ChannelRouting tablosu)
                // Hem conversation.channel hem de triggerSource ile dene
                const channelsToTry = [conversationChannel, triggerSource].filter(Boolean);
                for (const ch of channelsToTry) {
                    if (assignedTeamId) break;
                    const channelRouting = await prisma.channelRouting.findFirst({
                        where: {
                            workspaceId,
                            channel: ch,
                            isActive: true
                        },
                        select: { teamId: true, team: { select: { name: true } } }
                    });
                    if (channelRouting?.teamId) {
                        assignedTeamId = channelRouting.teamId;
                        console.log(`📋 [AutoCall] Takım ChannelRouting'den bulundu: ${channelRouting.team?.name} (${assignedTeamId}) (kanal: ${ch})`);
                    }
                }

                // 2. Hâlâ takım yoksa, workspace'teki ilk takımı kullan
                if (!assignedTeamId) {
                    const defaultTeam = await prisma.team.findFirst({
                        where: { workspaceId },
                        orderBy: { createdAt: 'asc' },
                        select: { id: true, name: true }
                    });
                    if (defaultTeam) {
                        assignedTeamId = defaultTeam.id;
                        console.log(`📋 [AutoCall] Varsayılan takım kullanıldı: ${defaultTeam.name} (${defaultTeam.id})`);
                    } else {
                        console.log(`⚠️ [AutoCall] Workspace'te hiç takım bulunamadı`);
                    }
                }
            } catch (e) { console.warn('⚠️ [AutoCall] Fallback team resolution error:', e.message); }
            } // end if(!assignedTeamId)
        } else {
            console.log(`📋 [AutoCall] Sohbetten takım bulundu: teamId=${assignedTeamId}, assignedToId=${assignedToId}`);
        }

        // Workspace/Team fallback delay ayarı
        let fallbackDelayMinutes = 60; // default
        if (assignedTeamId) {
            try {
                const team = await prisma.team.findUnique({
                    where: { id: assignedTeamId },
                    select: { aiFallbackDelayMinutes: true }
                });
                if (team?.aiFallbackDelayMinutes) fallbackDelayMinutes = team.aiFallbackDelayMinutes;
            } catch (_) {}
        }

        // ─── AGENT SCOPE KONTROLÜ (triggerAutoCall) ──────────────────────
        // Agent kartındaki checkbox'lara göre bu arama türünde çalışıp çalışmayacağını kontrol et
        if (triggerSource !== 'CHAT_REQUEST' && agentCfg) {
            if (!assignedTeamId && !assignedToId) {
                // Kimseye atanmamış → handleUnassigned kontrolü
                if (!agentCfg.handleUnassigned) {
                    console.log(`⏭️ [AutoCall] Agent ${ruleAgentId} handleUnassigned kapalı — atanmamış sohbet atlanıyor`);
                    return;
                }
            } else if (assignedTeamId && !assignedToId) {
                // Takım havuzunda → handlePool kontrolü
                if (!agentCfg.handlePool) {
                    console.log(`⏭️ [AutoCall] Agent ${ruleAgentId} handlePool kapalı — havuzdaki sohbet atlanıyor`);
                    return;
                }
            }
            // assignedToId varsa → zaten birine atanmış, handleTeamFallback checkOverdueAgentCalls'da kontrol edilir
        }
        // ─────────────────────────────────────────────────────────────────

        // Mevcut PLANNED arama aktivitesi var mı kontrol et (dedup)
        const existingActivity = await prisma.contactActivity.findFirst({
            where: {
                contactId: contactId,
                workspaceId,
                type: 'CALL',
                status: 'PLANNED',
                aiFallbackTriggered: false
            }
        });
        if (existingActivity) {
            console.log(`⏭️ [AutoCall] Skipping: PLANNED call activity already exists for contact ${contactId} (activity: ${existingActivity.id})`);
            return;
        }

        // Contact'ın aktif case'ini bul → görev cascade ataması için
        let autoCallCaseId = null;
        try {
            const activeCase = await prisma.case.findFirst({
                where: { contactId, workspaceId, status: 'ACTIVE' },
                orderBy: { updatedAt: 'desc' },
                select: { id: true }
            });
            autoCallCaseId = activeCase?.id || null;
        } catch (_) {}

        // ContactActivity oluştur — takım/kişiye görev olarak ata
        const activity = await prisma.contactActivity.create({
            data: {
                contactId: contactId,
                workspaceId,
                type: 'CALL',
                title: `Arama: ${contactName || formattedPhone}`,
                description: dynamicVars.interest_topic
                    ? `Konu: ${dynamicVars.interest_topic}\nKaynak: ${triggerSource}\nNumara: ${formattedPhone}`
                    : `Kaynak: ${triggerSource}\nNumara: ${formattedPhone}`,
                dueDate: scheduledAt,
                status: 'PLANNED',
                source: 'AUTOMATION',
                priority: 'NORMAL',
                assignedToId: assignedToId,
                teamId: assignedTeamId,
                callTopic: dynamicVars.interest_topic || null,
                // aiAgentId SADECE şu durumlarda set edilir:
                // 1. Kimseye atanmamış (pool/sahipsiz) → bot direkt alsın
                // 2. immediateCall=true → bot hemen arasın
                // 3. assignedToId varsa SET ETMEYİZ → önce insan denesin, fallback süresi dolunca HUMAN_TIMEOUT devreye girer
                aiAgentId: (!assignedToId || agentCfg?.immediateCall) ? ruleAgentId : null,
                fallbackToAi: true,
                fallbackDelayMinutes: fallbackDelayMinutes,
                aiFallbackTriggered: false,
                ...(autoCallCaseId ? { caseId: autoCallCaseId } : {})
            }
        });

        const assignLabel = assignedToId ? `Kişi: ${assignedToId}` : assignedTeamId ? `Takım: ${assignedTeamId}` : 'Direkt AI (sahipsiz)';
        console.log(`📋 [AutoCall] ContactActivity oluşturuldu: ${activity.id} → ${assignLabel} | Due: ${scheduledAt.toLocaleString('tr-TR')} | Fallback: ${fallbackDelayMinutes}dk`);

        // ─── HEMEN ARA: Agent'ın immediateCall ayarı açıksa cron beklemeden direkt çağır ──
        const shouldCallImmediately = agentCfg?.immediateCall === true;
        const isWithinBusinessHours = (() => {
            const trNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
            const currentDay = trNow.getDay();
            const h = trNow.getHours();
            const m = trNow.getMinutes();
            const currentMins = h * 60 + m;

            if (agentCfg?.schedule && agentCfg.schedule[currentDay]) {
                const ds = agentCfg.schedule[currentDay];
                if (ds.active === false) return false;
                const [sH, sM] = (ds.start || '10:00').split(':').map(Number);
                const [eH, eM] = (ds.end || '18:00').split(':').map(Number);
                return currentMins >= sH * 60 + sM && currentMins < eH * 60 + eM;
            } else if (agentCfg?.schedule) {
                // schedule var ama bu gün tanımlı değil → kapalı
                return false;
            } else if (agentCfg?.days || agentCfg?.callStart || agentCfg?.callEnd) {
                // Eski format
                const agentDays = agentCfg.days || [0,1,2,3,4,5,6];
                if (!agentDays.includes(currentDay)) return false;
                const [sH, sM] = (agentCfg.callStart || '10:00').split(':').map(Number);
                const [eH, eM] = (agentCfg.callEnd || '21:00').split(':').map(Number);
                return currentMins >= sH * 60 + sM && currentMins < eH * 60 + eM;
            }
            // agentCfg yok → genel default
            return h >= 10 && h < 21;
        })();

        if (shouldCallImmediately && isWithinBusinessHours) {
            console.log(`🚀 [AutoCall] immediateCall=true → cron beklemeden direkt arama başlatılıyor!`);
            try {
                const retrySteps = agentCfg?.retrySteps || [{ delay: 60 }, { delay: 240 }, { delay: 1440 }];
                await prisma.scheduledCall.create({
                    data: {
                        workspaceId,
                        contactId: contactId,
                        contactName: contactName || 'Müşteri',
                        toNumber: formattedPhone,
                        agentId: ruleAgentId,
                        scheduledAt: new Date(), // ŞİMDİ
                        status: 'PENDING',
                        createdById: `activity_${activity.id}`,
                        dynamicVariables: dynamicVarsJson,
                        maxAttempts: retrySteps.length + 1,
                        retryDelayMin: retrySteps[0]?.delay || 60,
                        attemptNumber: 1
                    }
                });
                // Activity'yi de hemen triggered olarak işaretle
                await prisma.contactActivity.update({
                    where: { id: activity.id },
                    data: { aiFallbackTriggered: true }
                });
                console.log(`🚀 [AutoCall] ScheduledCall oluşturuldu — bir sonraki cron döngüsünde aranacak (max ${60}sn)`);
            } catch (immErr) {
                console.error(`⚠️ [AutoCall] immediateCall ScheduledCall oluşturulamadı:`, immErr.message);
                // Activity zaten var, cron normal şekilde alır
            }
        }

    } catch (error) {
        console.error('❌ [AutoCall] triggerAutoCall error:', error.message);
    }
};

// Helper to build dynamic variables for Retell LLM
async function buildRetellDynamicVariables(workspaceId, contactId, contactName, initialVars = {}) {
    const dynVars = { ...(initialVars || {}) };
    
    if (contactName && !dynVars.customer_name) {
        dynVars.customer_name = contactName;
        const nameParts = contactName.trim().split(/\s+/);
        if (nameParts.length > 0) {
            dynVars.customer_first_name = nameParts[0];
            dynVars.customer_last_name = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
        }
    }

    if (contactId) {
        try {
            const contact = await prisma.contact.findUnique({
                where: { id: contactId },
                select: { name: true, email: true, tags: true, notes: true, source: true }
            });
            if (contact) {
                if (contact.name && !dynVars.customer_name) {
                    dynVars.customer_name = contact.name;
                    const nameParts = contact.name.trim().split(/\s+/);
                    if (nameParts.length > 0) {
                        dynVars.customer_first_name = nameParts[0];
                        dynVars.customer_last_name = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
                    }
                }
                if (contact.email) dynVars.customer_email = contact.email;
                if (contact.source) dynVars.lead_source = contact.source;
                try {
                    const tags = JSON.parse(contact.tags || '[]');
                    if (tags.length > 0) dynVars.customer_tags = tags.join(', ');
                } catch (_) {}
            }
            
            // Get the active Case (if any) to use as topic
            const activeCase = await prisma.case.findFirst({
                where: { contactId, workspaceId, status: 'ACTIVE' },
                orderBy: { createdAt: 'desc' },
                select: { title: true }
            });
            
            if (activeCase?.title) {
                dynVars.interest_topic = activeCase.title;
            } else {
                // Fallback to conversation topic
                const latestConv = await prisma.conversation.findFirst({
                    where: { contactId, workspaceId },
                    orderBy: { lastMessageAt: 'desc' },
                    select: { aiTopic: true, channel: true }
                });
                if (latestConv?.aiTopic) dynVars.interest_topic = latestConv.aiTopic;
                if (latestConv?.channel) dynVars.contact_channel = latestConv.channel;
            }
        } catch (e) { console.warn('⚠️ [Call] Failed to build dynamic vars:', e.message); }
    }
    return dynVars;
}

// Execute a phone call via Retell API (used by both immediate & scheduled calls)
async function executeScheduledCall(workspaceId, toNumber, agentId, contactId, contactName, triggerSource = 'AUTO', createdById = '', dynamicVariables = null) {
    const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { retellApiKey: true, retellFromNumber: true, retellAgentId: true, companyName: true, defaultLanguage: true }
    });
    if (!workspace?.retellApiKey) throw new Error('No AI Call API key');
    
    // Check if there is a team-specific agent first if agentId is not passed
    let effectiveAgentId = agentId;
    if (!effectiveAgentId) {
        const teamAgentId = await getTeamAgentIdForContactOrConversation(workspaceId, contactId, null);
        effectiveAgentId = teamAgentId || workspace.retellAgentId;
    }
    
    if (!effectiveAgentId) throw new Error('No AI Call Agent ID configured/provided');

    const client = new Retell({ apiKey: workspace.retellApiKey });
    const formattedFrom = normalizePhone(workspace.retellFromNumber);

    // Build dynamic variables for the AI agent
    let dynVars = { ...(dynamicVariables || {}) };
    if (workspace.companyName && !dynVars.company_name) dynVars.company_name = workspace.companyName;
    
    dynVars = await buildRetellDynamicVariables(workspaceId, contactId, contactName, dynVars);

    const callParams = {
        from_number: formattedFrom,
        to_number: toNumber,
        override_agent_id: effectiveAgentId,
        metadata: { 
            workspaceId, 
            contactId: contactId || null, 
            contactName: contactName || null, 
            autoCallTrigger: triggerSource,
            createdById: createdById || null
        }
    };

    // Inject dynamic variables into the AI agent
    if (Object.keys(dynVars).length > 0) {
        callParams.retell_llm_dynamic_variables = dynVars;
        console.log(`🏷️ [Call] Injecting ${Object.keys(dynVars).length} dynamic variables:`, Object.keys(dynVars).join(', '));
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
            createdById: createdById || ''
        }
    });
    emitToWorkspace(workspaceId, 'auto_call_started', { callId: callResponse.call_id, toNumber, contactName, trigger: triggerSource });
    console.log(`✅ [AutoCall] Call started: ${callResponse.call_id} → ${toNumber} (trigger: ${triggerSource})`);
    return callResponse;
}

// Helper to automatically scan call activities and route to AI agent when appropriate
// Handles 3 scenarios:
//   1. DIRECT AI: Activity has aiAgentId set (no human assigned) → AI calls immediately when due
//   2. POOL FALLBACK: No one assigned, team has AI agent → AI picks up from pool when overdue
//   3. HUMAN TIMEOUT: Human assigned but didn't act within fallbackDelayMinutes → AI takes over
async function checkOverdueAgentCalls() {
    try {
        const now = new Date();

        // 1. Find workspaces with Retell configured + either retellAutoCallEnabled OR aiFallbackEnabled
        //    retellAutoCallEnabled → eski triggerAutoCall sistemi
        //    aiFallbackEnabled → SALES_PHONE_CALL toggle'ından gelen AI fallback
        const workspaces = await prisma.workspace.findMany({
            where: {
                retellApiKey: { not: null },
                retellAgentId: { not: null },
                retellFromNumber: { not: null }
            },
            select: {
                id: true,
                retellAgentId: true,
                retellAutoCallEnabled: true,
                aiFallbackEnabled: true,
                aiFallbackDelayMinutes: true,
                aiFallbackPoolEnabled: true,
                retellAutoCallTriggers: true,
                retellMaxOverdueDays: true
            }
        });

        if (workspaces.length === 0) return;

        // ─── MESAI KONTROLÜ: Workspace seviyesinde yapılmaz. ──
        // Ajan bazlı mesai kontrolü processScheduledCalls'da (scheduledCall işlenirken) yapılıyor.
        // Burada tüm workspace'leri geçiriyoruz, çünkü her ajanın farklı çalışma saati olabilir.
        const workspaceIds = workspaces.map(w => w.id);
        const salesRules = await prisma.workspaceRule.findMany({
            where: { workspaceId: { in: workspaceIds }, ruleType: 'SALES_PHONE_CALL' }
        });
        const salesRuleMap = {};
        salesRules.forEach(r => {
            try { salesRuleMap[r.workspaceId] = typeof r.config === 'string' ? JSON.parse(r.config) : (r.config || {}); }
            catch { salesRuleMap[r.workspaceId] = {}; }
        });

        const activeWorkspaces = workspaces;
        const activeWorkspaceIds = workspaceIds;

        // Her workspace için max overdue tarihini hesapla (en eski tarihi kullan)
        const oldestMaxOverdueDays = Math.max(...activeWorkspaces.map(w => w.retellMaxOverdueDays ?? 3));
        const maxOverdueCutoff = new Date(now.getTime() - oldestMaxOverdueDays * 24 * 60 * 60 * 1000);

        // Load team fallback settings for resolution
        const teams = await prisma.team.findMany({
            where: { workspaceId: { in: activeWorkspaceIds } },
            select: { id: true, workspaceId: true, aiFallbackEnabled: true, aiFallbackDelayMinutes: true }
        });
        const teamMap = new Map(teams.map(t => [t.id, t]));

        // Helper: resolve effective fallback setting (activity > agentConfig > SALES_PHONE_CALL config > team > workspace)
        const resolveSettings = (activity, resolvedAgentId = null) => {
            const ws = activeWorkspaces.find(w => w.id === activity.workspaceId);
            const team = activity.teamId ? teamMap.get(activity.teamId) : null;
            const salesCfg = salesRuleMap[activity.workspaceId] || {};

            // Agent config delay (from UI card)
            const agentConfigs = ws?.retellAutoCallTriggers?.agentConfigs || {};
            const agentCfgDelay = resolvedAgentId ? agentConfigs[resolvedAgentId]?.fallbackDelayMinutes : null;

            // Enabled: activity.fallbackToAi > Agent Config > SALES_PHONE_CALL config > team > workspace
            const agentCfgFallbackToAi = resolvedAgentId ? agentConfigs[resolvedAgentId]?.fallbackToAi : null;
            let enabled;
            if (activity.fallbackToAi !== undefined && activity.fallbackToAi !== null) {
                enabled = activity.fallbackToAi;
            } else if (agentCfgFallbackToAi !== undefined && agentCfgFallbackToAi !== null) {
                enabled = agentCfgFallbackToAi;
            } else if (salesCfg.aiFallbackEnabled !== undefined) {
                enabled = salesCfg.aiFallbackEnabled;
            } else if (team?.aiFallbackEnabled !== null && team?.aiFallbackEnabled !== undefined) {
                enabled = team.aiFallbackEnabled;
            } else {
                enabled = ws?.aiFallbackEnabled || false;
            }

            // Delay: agentConfig > SALES_PHONE_CALL config > activity > team > workspace
            let delayMinutes;
            if (agentCfgDelay != null) {
                delayMinutes = agentCfgDelay;
            } else if (salesCfg.aiFallbackDelayMinutes != null) {
                delayMinutes = salesCfg.aiFallbackDelayMinutes;
            } else if (activity.fallbackDelayMinutes !== null && activity.fallbackDelayMinutes !== undefined) {
                delayMinutes = activity.fallbackDelayMinutes;
            } else if (team?.aiFallbackDelayMinutes != null) {
                delayMinutes = team.aiFallbackDelayMinutes;
            } else {
                delayMinutes = ws?.aiFallbackDelayMinutes || 1;
            }

            return { enabled, delayMinutes, poolEnabled: ws?.aiFallbackPoolEnabled || false };
        };

        // ─── SCENARIO 1: Direct AI Assignment ──────────────────────
        // Activity'ye açıkça aiAgentId atanmış → sadece retellAutoCallEnabled workspace'lerde
        const retellEnabledIds = activeWorkspaces.filter(w => w.retellAutoCallEnabled).map(w => w.id);

        const directAiActivities = retellEnabledIds.length > 0 ? await prisma.contactActivity.findMany({
            where: {
                workspaceId: { in: retellEnabledIds },
                type: 'CALL',
                status: 'PLANNED',
                dueDate: { lte: now, gte: maxOverdueCutoff },
                aiAgentId: { not: null },
                aiFallbackTriggered: false,
                retellExcluded: { not: true },
                contact: { phone: { not: null } }
            },
            include: { contact: true }
        }) : [];

        // ─── SCENARIO 2: Pool / Sahipsiz Görevler ──
        // SADECE retellAutoCallEnabled: true olan workspace'lerde çalışır.
        // aiFallbackEnabled workspace'lerde POOL ÇALIŞMAZ — insana şans verilir.
        const poolActivities = retellEnabledIds.length > 0 ? await prisma.contactActivity.findMany({
            where: {
                workspaceId: { in: retellEnabledIds },
                type: 'CALL',
                status: 'PLANNED',
                dueDate: { lte: now, gte: maxOverdueCutoff },
                assignedToId: null,
                aiAgentId: null,
                aiFallbackTriggered: false,
                retellExcluded: { not: true },
                contact: { phone: { not: null } }
            },
            include: { contact: true }
        }) : [];

        // ─── SCENARIO 3: Human Timeout Fallback ───────────
        // İnsana/takıma atanmış, aiAgentId yok, süresinde yapılmamış → AI devralır
        // Kişi atanmış VEYA takım atanmış ama kimse üstlenmemiş → aynı mantık
        const humanFallbackCandidates = await prisma.contactActivity.findMany({
            where: {
                workspaceId: { in: activeWorkspaceIds },
                type: 'CALL',
                status: 'PLANNED',
                aiFallbackTriggered: false,
                aiAgentId: null,
                dueDate: { not: null },
                retellExcluded: { not: true },
                contact: { phone: { not: null } }
            },
            include: { contact: true }
        });

        // Let the loop handle settings and delays asynchronously
        const humanTimeoutActivities = humanFallbackCandidates;

        const allActivities = [
            ...directAiActivities.map(a => ({ ...a, _scenario: 'DIRECT_AI' })),
            ...poolActivities.map(a => ({ ...a, _scenario: 'POOL' })),
            ...humanTimeoutActivities.map(a => ({ ...a, _scenario: 'HUMAN_TIMEOUT' }))
        ];

        if (allActivities.length === 0) return;

        console.log(`📅 [CallRouter] Found ${allActivities.length} call activities to route to AI:`);
        console.log(`   Direct AI: ${directAiActivities.length}, Pool: ${poolActivities.length}, Human timeout: ${humanTimeoutActivities.length}`);

        // Find existing scheduled calls to avoid duplicates
        const existingScheduledCalls = await prisma.scheduledCall.findMany({
            where: { createdById: { startsWith: 'activity_' } },
            select: { createdById: true }
        });
        const scheduledActivityIds = new Set(
            existingScheduledCalls.map(sc => sc.createdById.replace('activity_', ''))
        );

        for (const activity of allActivities) {
            const phone = activity.contact?.phone?.trim();
            if (!phone || scheduledActivityIds.has(activity.id)) continue;

            // Check Marketing Consent for aiCall
            if (activity.contact?.consentChannels) {
                try {
                    const consent = JSON.parse(activity.contact.consentChannels);
                    if (consent.aiCall === false) {
                        console.log(`⏭️ [CallRouter] Contact ${activity.contact.id} opted out of aiCall, skipping activity ${activity.id}`);
                        continue;
                    }
                } catch (e) {}
            }

            // Determine which AI agent to use
            let agentId = activity.aiAgentId; // Direct assignment takes priority

            if (!agentId) {
                // Try team's AI agent
                agentId = await getTeamAgentIdForContactOrConversation(activity.workspaceId, activity.contactId, null);
            }

            if (!agentId) {
                // Workspace default
                const wsConfig = activeWorkspaces.find(w => w.id === activity.workspaceId);
                agentId = wsConfig?.retellAgentId || null;
            }

            if (!agentId) {
                console.log(`⏭️ [CallRouter] No AI agent found for activity ${activity.id}, skipping`);
                continue;
            }

            // ─── DİNAMİK AYAR KONTROLÜ (HUMAN_TIMEOUT İÇİN) ───
            if (activity._scenario === 'HUMAN_TIMEOUT') {
                const settings = resolveSettings(activity, agentId);
                if (!settings.enabled) {
                    console.log(`⏭️ [CallRouter] Agent ${agentId} AI Fallback kapalı — timeout görev atlanıyor (activity: ${activity.id})`);
                    continue;
                }
                const dueTime = new Date(activity.dueDate).getTime();
                const fallbackMs = settings.delayMinutes * 60 * 1000;
                if (now.getTime() < dueTime + fallbackMs) {
                    // Henüz vakti gelmemiş
                    continue;
                }
                activity.fallbackDelayMinutes = settings.delayMinutes; // Log için kaydet
            }

            // ─── AGENT SCOPE KONTROLÜ ────────────────────────────────────────
            // Agent kartındaki checkbox'lara göre bu senaryoda çalışıp çalışmayacağını kontrol et
            const wsConfig = activeWorkspaces.find(w => w.id === activity.workspaceId);
            const agentConfigs = wsConfig?.retellAutoCallTriggers?.agentConfigs || {};
            const agentCfg = agentConfigs[agentId];

            // ─── AGENT AKTİF KONTROLÜ ────────────────────────────────────────
            if (agentCfg && agentCfg.active === false) {
                continue; // Pasif agent, atla
            }

            // taskScope → eski flag'lere dönüştür (geriye uyumluluk)
            if (agentCfg && agentCfg.taskScope && !('handlePool' in agentCfg)) {
                const scopeMap = {
                    'all':           { handlePool: true,  handleUnassigned: true,  handleTeamFallback: true },
                    'team_all':      { handlePool: true,  handleUnassigned: false, handleTeamFallback: true },
                    'team_pool':     { handlePool: true,  handleUnassigned: false, handleTeamFallback: false },
                    'assigned_only': { handlePool: false, handleUnassigned: false, handleTeamFallback: false }
                };
                Object.assign(agentCfg, scopeMap[agentCfg.taskScope] || scopeMap['all']);
            }

            if (agentCfg && activity._scenario !== 'DIRECT_AI') {
                if (activity._scenario === 'POOL') {
                    // Havuzdaki/atanmamış sohbetler
                    const hasTeam = !!activity.teamId;
                    if (hasTeam && !agentCfg.handlePool) {
                        console.log(`⏭️ [CallRouter] Agent ${agentId} handlePool kapalı — havuzdaki görev atlanıyor (activity: ${activity.id})`);
                        continue;
                    }
                    if (!hasTeam && !agentCfg.handleUnassigned) {
                        console.log(`⏭️ [CallRouter] Agent ${agentId} handleUnassigned kapalı — atanmamış görev atlanıyor (activity: ${activity.id})`);
                        continue;
                    }
                }

                if (activity._scenario === 'HUMAN_TIMEOUT' && !agentCfg.handleTeamFallback) {
                    console.log(`⏭️ [CallRouter] Agent ${agentId} handleTeamFallback kapalı — timeout görev atlanıyor (activity: ${activity.id})`);
                    continue;
                }
            }
            // ─────────────────────────────────────────────────────────────────

            // ─── AGENT BAZLI MAX OVERDUE KONTROLÜ ─────────────────────────────
            // Agent'ın kendi maxOverdueDays ayarı varsa onu kullan, yoksa workspace default
            const agentMaxDays = agentCfg?.maxOverdueDays ?? wsConfig?.retellMaxOverdueDays ?? 3;
            if (activity.dueDate) {
                const activityAge = now.getTime() - new Date(activity.dueDate).getTime();
                const maxAgeMs = agentMaxDays * 24 * 60 * 60 * 1000;
                if (activityAge > maxAgeMs) {
                    console.log(`⏭️ [CallRouter] Activity ${activity.id} is ${Math.round(activityAge / 86400000)}d old > agent limit ${agentMaxDays}d — skipping`);
                    continue;
                }
            }

            // Build dynamic variables with call topic
            const dynVars = {
                customer_name: activity.contact.name || activity.contact.fullName || 'Müşteri',
                trigger_source: activity._scenario
            };
            if (activity.callTopic) dynVars.interest_topic = activity.callTopic;
            if (activity.title) dynVars.call_title = activity.title;
            if (activity.description) dynVars.call_description = activity.description.substring(0, 500);

            try {
                // retrySteps'tan maxAttempts ve ilk gecikmeyi belirle
                const retrySteps = agentCfg?.retrySteps || [{ delay: 60 }, { delay: 240 }, { delay: 1440 }];
                const maxAttempts = retrySteps.length + 1; // 1 asıl + N retry
                const firstRetryDelay = retrySteps[0]?.delay || 60;

                await prisma.scheduledCall.create({
                    data: {
                        workspaceId: activity.workspaceId,
                        contactId: activity.contactId,
                        contactName: activity.contact.name || activity.contact.fullName || "Müşteri",
                        toNumber: phone,
                        agentId: agentId,
                        scheduledAt: now,
                        status: 'PENDING',
                        createdById: `activity_${activity.id}`,
                        dynamicVariables: JSON.stringify(dynVars),
                        maxAttempts: maxAttempts,
                        retryDelayMin: firstRetryDelay,
                        attemptNumber: 1
                    }
                });

                // Mark activity as AI-triggered
                await prisma.contactActivity.update({
                    where: { id: activity.id },
                    data: {
                        aiFallbackTriggered: true,
                        ...(activity._scenario === 'HUMAN_TIMEOUT' && {
                            result: `⏰ İnsan agent ${activity.fallbackDelayMinutes} dk içinde aramadı — AI devreye girdi`
                        })
                    }
                });

                const scenarioLabel = {
                    'DIRECT_AI': '🤖 Doğrudan AI',
                    'POOL': '🏊 Havuzdan AI',
                    'HUMAN_TIMEOUT': '⏰ İnsan timeout → AI'
                }[activity._scenario];

                console.log(`📅 [CallRouter] ${scenarioLabel}: ${phone} (Activity: ${activity.id}, Agent: ${agentId})`);
            } catch (err) {
                console.error(`❌ [CallRouter] Failed for activity ${activity.id}:`, err.message);
            }
        }
    } catch (e) {
        console.error('❌ [CallRouter] checkOverdueAgentCalls error:', e.message);
    }
}

// Cron: process due ScheduledCalls every 60 seconds (persistent across restarts)
export const processScheduledCalls = async () => {
    try {
        // AI Fallback kontrolü aktif:
        await checkOverdueAgentCalls();

        const dueCalls = await prisma.scheduledCall.findMany({
            where: { status: 'PENDING', scheduledAt: { lte: new Date() } },
            take: 20
        });
        if (dueCalls.length > 0) console.log(`📅 [ScheduledCall] Processing ${dueCalls.length} due call(s)`);
        for (const sc of dueCalls) {
            try {
                // Auto-cancel if overdue > X hours (workspace parametrik)
                // AMA: mesai dışı saatte planlanan aramalar muaf — gece gelen lead'ler sabah aranacak
                const overdueMs = Date.now() - new Date(sc.scheduledAt).getTime();
                // Agent bazlı mesai saatlerini kontrol et (hardcoded 10-21 yerine)
                const scheduledTR = new Date(new Date(sc.scheduledAt).toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
                const scheduledHour = scheduledTR.getHours();
                const scheduledMinute = scheduledTR.getMinutes();
                const scheduledDayOfWeek = scheduledTR.getDay();
                let wasScheduledOutsideBusinessHours = false;
                try {
                    const wsSchedule = await prisma.workspace.findUnique({
                        where: { id: sc.workspaceId },
                        select: { retellAutoCallTriggers: true }
                    });
                    const schAgentConfigs = wsSchedule?.retellAutoCallTriggers?.agentConfigs || {};
                    const schAgentCfg = sc.agentId ? schAgentConfigs[sc.agentId] : null;
                    if (schAgentCfg?.schedule && schAgentCfg.schedule[scheduledDayOfWeek]) {
                        const ds = schAgentCfg.schedule[scheduledDayOfWeek];
                        if (ds.active === false) {
                            wasScheduledOutsideBusinessHours = true;
                        } else {
                            const [sH, sM] = (ds.start || '10:00').split(':').map(Number);
                            const [eH, eM] = (ds.end || '18:00').split(':').map(Number);
                            const schMins = scheduledHour * 60 + scheduledMinute;
                            wasScheduledOutsideBusinessHours = schMins < (sH * 60 + sM) || schMins >= (eH * 60 + eM);
                        }
                    } else if (schAgentCfg?.schedule) {
                        wasScheduledOutsideBusinessHours = true; // Bu gün tanımsız
                    } else {
                        // Default fallback: 10:00-21:00
                        wasScheduledOutsideBusinessHours = scheduledHour < 10 || scheduledHour >= 21;
                    }
                } catch (_) {
                    wasScheduledOutsideBusinessHours = scheduledHour < 10 || scheduledHour >= 21;
                }

                // Agent config > Workspace default > hardcoded 2 saat
                let timeoutHours = 2;
                try {
                    const wsTimeout = await prisma.workspace.findUnique({
                        where: { id: sc.workspaceId },
                        select: { retellScheduledCallTimeoutHours: true, retellAutoCallTriggers: true }
                    });
                    // Önce agent config'den bak
                    const agentCfgs = wsTimeout?.retellAutoCallTriggers?.agentConfigs || {};
                    const agentCfg = sc.agentId ? agentCfgs[sc.agentId] : null;
                    timeoutHours = agentCfg?.scheduledCallTimeoutHours
                        ?? wsTimeout?.retellScheduledCallTimeoutHours
                        ?? 2;
                } catch (_) {}
                const timeoutMs = timeoutHours * 60 * 60 * 1000;

                if (overdueMs > timeoutMs && !wasScheduledOutsideBusinessHours) {
                    await prisma.scheduledCall.update({ where: { id: sc.id }, data: { status: 'CANCELLED', errorMessage: `Missed window (>${timeoutHours}h overdue)` } });
                    console.log(`📅 [ScheduledCall] Auto-cancelled overdue call for ${sc.toNumber} (>${timeoutHours}h)`);
                    continue;
                } else if (overdueMs > timeoutMs && wasScheduledOutsideBusinessHours) {
                    console.log(`📅 [ScheduledCall] Overdue but was scheduled outside business hours — executing now for ${sc.toNumber}`);
                }
                // ─── BAŞARILI GEÇMİŞ KONUŞMA KONTROLÜ ───────────────────────────
                // Bu numara ile daha önce başarılı AI konuşması olmuş mu?
                if (sc.contactId) {
                    const successfulPastCall = await prisma.retellCall.findFirst({
                        where: {
                            workspaceId: sc.workspaceId,
                            toNumber: sc.toNumber,
                            callSuccessful: true,
                            duration: { gte: 15 } // 15 saniyeden uzun = gerçek konuşma (29sn gibi kısa görüşmeler de sayılsın)
                        }
                    });
                    if (successfulPastCall) {
                        await prisma.scheduledCall.update({ where: { id: sc.id }, data: { status: 'CANCELLED', errorMessage: 'Daha önce başarılı AI konuşması yapılmış' } });
                        console.log(`📅 [ScheduledCall] Cancelled for ${sc.toNumber} — başarılı geçmiş konuşma mevcut (${successfulPastCall.callId})`);
                        continue;
                    }
                    // Aynı numara şu anda başka bir scheduledCall tarafından aranıyor mu?
                    const inProgressCall = await prisma.scheduledCall.findFirst({
                        where: {
                            toNumber: sc.toNumber,
                            workspaceId: sc.workspaceId,
                            status: 'COMPLETED', // COMPLETED = arama başlatıldı ("in progress")
                            updatedAt: { gte: new Date(Date.now() - 10 * 60 * 1000) } // son 10dk
                        }
                    });
                    if (inProgressCall && inProgressCall.id !== sc.id) {
                        console.log(`📅 [ScheduledCall] Skipping ${sc.toNumber} — başka bir arama zaten devam ediyor (sc: ${inProgressCall.id})`);
                        continue; // Bu tur atla, PENDING kalır, sonraki cron döngüsünde tekrar kontrol edilir
                    }
                }

                // ─── DEDUP: Retry zinciri hariç, 24h içinde aranmışsa atla ────────
                if (!sc.parentCallId) {
                    // İlk çağrı (retry değil) → standart dedup uygula
                    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
                    const recentCall = await prisma.retellCall.findFirst({
                        where: { workspaceId: sc.workspaceId, toNumber: sc.toNumber, createdAt: { gte: since24h } }
                    });
                    if (recentCall) {
                        await prisma.scheduledCall.update({ where: { id: sc.id }, data: { status: 'CANCELLED', errorMessage: 'Dedup: already called in last 24h' } });
                        console.log(`📅 [ScheduledCall] Cancelled (dedup) for ${sc.toNumber} — already called`);
                        continue;
                    }
                } else {
                    console.log(`🔄 [ScheduledCall] Retry ${sc.attemptNumber}/${sc.maxAttempts} for ${sc.toNumber} — dedup bypassed`);
                }
                // If it is an activity-bound call, check if the activity is still valid for calling
                if (sc.createdById && sc.createdById.startsWith('activity_')) {
                    const activityId = sc.createdById.replace('activity_', '');
                    const activity = await prisma.contactActivity.findUnique({
                        where: { id: activityId }
                    });
                    // If activity is deleted, completed, or cancelled → do NOT dial
                    // If assignedToId is set BUT aiFallbackTriggered is true → this is a HUMAN_TIMEOUT
                    // scenario where AI intentionally took over, so ALLOW the call to proceed
                    if (!activity || activity.status === 'COMPLETED' || activity.status === 'CANCELLED') {
                        await prisma.scheduledCall.update({
                            where: { id: sc.id },
                            data: {
                                status: 'CANCELLED',
                                errorMessage: !activity ? 'Activity deleted' : `Activity status: ${activity.status}`
                            }
                        });
                        console.log(`📅 [ScheduledCall] Cancelled scheduled call ${sc.id} — activity ${!activity ? 'deleted' : activity.status}`);
                        continue;
                    }
                    // If a human agent claimed this task AFTER AI fallback was triggered,
                    // and the activity was NOT yet marked as AI-triggered, cancel the AI call
                    if (activity.assignedToId && !activity.aiFallbackTriggered) {
                        await prisma.scheduledCall.update({
                            where: { id: sc.id },
                            data: {
                                status: 'CANCELLED',
                                errorMessage: 'Claimed by agent before AI fallback'
                            }
                        });
                        console.log(`📅 [ScheduledCall] Cancelled scheduled call ${sc.id} — claimed by agent (no AI fallback)`);
                        continue;
                    }
                    // aiFallbackTriggered=true + assignedToId set → HUMAN_TIMEOUT, AI takes over → proceed
                    if (activity.assignedToId && activity.aiFallbackTriggered) {
                        console.log(`📅 [ScheduledCall] Proceeding with call ${sc.id} — AI fallback triggered (human timeout)`);
                    }
                }

                // ─── AGENT MESAİ KONTROLÜ (LOCK'TAN ÖNCE) ──────────────────────────
                // Mesai dışındaki aramaları LOCK'lamadan önce kontrol et
                // Bu sayede mesai dışında hiçbir arama COMPLETED'a geçmez
                const wsPreCheck = await prisma.workspace.findUnique({ where: { id: sc.workspaceId }, select: { retellAgentId: true, retellAutoCallTriggers: true } });
                const preCheckAgentId = sc.agentId || wsPreCheck?.retellAgentId;
                const preCheckConfigs = wsPreCheck?.retellAutoCallTriggers?.agentConfigs || {};
                const preCheckCfg = preCheckConfigs[preCheckAgentId];
                
                if (preCheckCfg) {
                    // Aktif/Pasif kontrolü
                    if (preCheckCfg.active === false) {
                        console.log(`⏸️ [ScheduledCall] Agent ${preCheckAgentId} pasif — call ${sc.id} PENDING kalacak`);
                        continue;
                    }

                    // Çalışma günü ve saati kontrolü
                    const nowTRPre = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
                    const currentDayPre = nowTRPre.getDay();
                    
                    let dayActivePre = true;
                    let agentStartPre = '10:00';
                    let agentEndPre = '21:00';
                    
                    if (preCheckCfg.schedule && preCheckCfg.schedule[currentDayPre]) {
                        const daySchedulePre = preCheckCfg.schedule[currentDayPre];
                        dayActivePre = daySchedulePre.active !== false;
                        agentStartPre = daySchedulePre.start || '10:00';
                        agentEndPre = daySchedulePre.end || '18:00';
                    } else if (preCheckCfg.schedule) {
                        dayActivePre = false;
                    } else {
                        const agentDaysPre = preCheckCfg.days || [0,1,2,3,4,5,6];
                        dayActivePre = agentDaysPre.includes(currentDayPre);
                        agentStartPre = preCheckCfg.callStart || '10:00';
                        agentEndPre = preCheckCfg.callEnd || '21:00';
                    }
                    
                    if (!dayActivePre) {
                        console.log(`⏸️ [ScheduledCall] Agent ${preCheckAgentId} bugün çalışmıyor (gün: ${currentDayPre}) — call ${sc.id} PENDING kalacak`);
                        continue;
                    }
                    
                    const [startHPre, startMPre] = agentStartPre.split(':').map(Number);
                    const [endHPre, endMPre] = agentEndPre.split(':').map(Number);
                    const currentMinutesPre = nowTRPre.getHours() * 60 + nowTRPre.getMinutes();
                    const startMinutesPre = startHPre * 60 + startMPre;
                    const endMinutesPre = endHPre * 60 + endMPre;
                    
                    if (currentMinutesPre < startMinutesPre || currentMinutesPre >= endMinutesPre) {
                        console.log(`⏸️ [ScheduledCall] Agent ${preCheckAgentId} mesai dışı (${agentStartPre}-${agentEndPre}, şimdi: ${nowTRPre.getHours()}:${String(nowTRPre.getMinutes()).padStart(2,'0')}) — call ${sc.id} PENDING kalacak`);
                        continue;
                    }
                } else {
                    // Agent config yok — workspace default mesai kontrolü
                    const nowTRFbPre = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
                    const fbHourPre = nowTRFbPre.getHours();
                    const fbMinPre = nowTRFbPre.getMinutes();
                    let fbStartPre = 10, fbEndPre = 21;
                    try {
                        const salesRulePre = await prisma.workspaceRule.findUnique({
                            where: { workspaceId_ruleType: { workspaceId: sc.workspaceId, ruleType: 'SALES_PHONE_CALL' } }
                        });
                        if (salesRulePre?.config) {
                            const cfgPre = typeof salesRulePre.config === 'string' ? JSON.parse(salesRulePre.config) : salesRulePre.config;
                            fbStartPre = cfgPre.businessHourStart ?? 10;
                            fbEndPre = cfgPre.businessHourEnd ?? 21;
                        }
                    } catch (_) {}
                    
                    const curMinsPre = fbHourPre * 60 + fbMinPre;
                    if (curMinsPre < fbStartPre * 60 || curMinsPre >= fbEndPre * 60) {
                        console.log(`⏸️ [ScheduledCall] agentCfg bulunamadı, mesai dışı (${fbStartPre}:00-${fbEndPre}:00, şimdi: ${fbHourPre}:${String(fbMinPre).padStart(2,'0')}) — call ${sc.id} PENDING kalacak`);
                        continue;
                    }
                }
                // ─── MESAİ KONTROLÜ BİTTİ ───────────────────────────────────────

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
                const ws = await prisma.workspace.findUnique({ where: { id: sc.workspaceId }, select: { retellAgentId: true, retellAutoCallTriggers: true } });
                const effectiveAgentId = sc.agentId || ws?.retellAgentId;
                // ─────────────────────────────────────────────────────────────────

                // Parse dynamic variables from DB if available
                let scDynVars = null;
                if (sc.dynamicVariables) {
                    try { scDynVars = JSON.parse(sc.dynamicVariables); } catch (_) {}
                }
                const callResponse = await executeScheduledCall(sc.workspaceId, sc.toNumber, effectiveAgentId, sc.contactId, sc.contactName, 'SCHEDULED', sc.createdById, scDynVars);
                
                if (callResponse?.call_id) {
                    await prisma.scheduledCall.update({
                        where: { id: sc.id },
                        data: { retellCallId: callResponse.call_id }
                    });
                }
            } catch (err) {
                console.error(`❌ [ScheduledCall] Failed for ${sc.toNumber}:`, err.message);
                await prisma.scheduledCall.update({ where: { id: sc.id }, data: { status: 'FAILED', errorMessage: err.message } }).catch(() => {});
            }
        }

    } catch (e) {
        console.error('❌ [ScheduledCall] Processor error:', e.message);
    }
};

// ═══════════════════════════════════════════════════════════════
// PUSH: Açık arama görevlerini hemen işle veya AI agent'a ata
// POST /:workspaceId/push-calls
// Body: {
//   teamId?: string,         — belirli takım
//   contactId?: string,      — belirli kişi
//   activityIds?: string[],  — belirli görev ID'leri
//   dueBefore?: string,      — bu tarihten ÖNCE gecikmiş
//   dueAfter?: string,       — bu tarihten SONRA oluşmuş
//   mode?: 'call' | 'assign' — 'call': hemen ara, 'assign': AI agent ata (cron arar)
//   limit?: number           — max görev sayısı (default: 50)
// }
// ═══════════════════════════════════════════════════════════════
export const pushCallTasks = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { teamId, contactId, activityIds, dueBefore, dueAfter, mode = 'call', limit = 50, agentId: requestAgentId } = req.body || {};

        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { retellApiKey: true, retellAgentId: true, retellFromNumber: true }
        });

        if (!workspace?.retellApiKey || !workspace?.retellAgentId || !workspace?.retellFromNumber) {
            return res.status(400).json({ error: 'AI Arama yapılandırması eksik' });
        }

        // Filtre oluştur
        const where = {
            workspaceId,
            type: 'CALL',
            status: 'PLANNED',
            retellExcluded: { not: true },
            contact: { phone: { not: null } }
        };
        if (teamId) where.teamId = teamId;
        if (contactId) where.contactId = contactId;
        if (activityIds?.length > 0) where.id = { in: activityIds };
        if (dueBefore || dueAfter) {
            where.dueDate = {};
            if (dueBefore) where.dueDate.lte = new Date(dueBefore);
            if (dueAfter) where.dueDate.gte = new Date(dueAfter);
        }

        const openTasks = await prisma.contactActivity.findMany({
            where,
            include: { contact: true },
            take: Math.min(limit, 100),
            orderBy: { dueDate: 'asc' }
        });

        if (openTasks.length === 0) {
            return res.json({ message: 'Açık arama görevi bulunamadı', processed: 0, total: 0 });
        }

        // ═══ MODE: ASSIGN — sadece aiAgentId ata, cron arasın ═══
        if (mode === 'assign') {
            let assigned = 0;
            for (const task of openTasks) {
                if (!task.aiAgentId || task.aiFallbackTriggered) {
                    await prisma.contactActivity.update({
                        where: { id: task.id },
                        data: {
                            aiAgentId: requestAgentId || workspace.retellAgentId,
                            fallbackToAi: true,
                            aiFallbackTriggered: false, // Cron tekrar alsın
                            dueDate: task.dueDate || new Date()
                        }
                    });
                    assigned++;
                }
            }
            console.log(`🔄 [Push/Assign] ${assigned} görev AI agent'a atandı — cron alacak`);
            return res.json({
                message: `${assigned} görev AI agent'a atandı, cron 60s içinde arayacak`,
                assigned,
                total: openTasks.length,
                mode: 'assign'
            });
        }

        // ═══ MODE: CALL — hemen ara ═══
        let processed = 0;
        let skipped = 0;
        const results = [];

        for (const task of openTasks) {
            try {
                // Dedup: Son 24 saatte bu kişiye başarılı arama yapılmış mı?
                const recentCall = await prisma.retellCall.findFirst({
                    where: {
                        workspaceId,
                        contactId: task.contactId,
                        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
                        status: { in: ['ended', 'completed'] }
                    }
                });
                if (recentCall) {
                    skipped++;
                    results.push({ contactId: task.contactId, name: task.contact?.name, status: 'skipped', reason: 'Son 24h aranmış' });
                    continue;
                }

                // Zaten PENDING ScheduledCall var mı?
                const existingSC = await prisma.scheduledCall.findFirst({
                    where: { workspaceId, contactId: task.contactId, status: 'PENDING' }
                });
                if (existingSC) {
                    skipped++;
                    results.push({ contactId: task.contactId, name: task.contact?.name, status: 'skipped', reason: 'Zaten planlanmış' });
                    continue;
                }

                const effectiveAgentId = requestAgentId || task.aiAgentId || workspace.retellAgentId;

                const sc = await prisma.scheduledCall.create({
                    data: {
                        workspaceId,
                        toNumber: task.contact.phone,
                        contactId: task.contactId,
                        contactName: task.contact.firstName || task.contact.name || 'Müşteri',
                        agentId: effectiveAgentId,
                        scheduledAt: new Date(),
                        status: 'PENDING',
                        source: 'PUSH',
                        createdById: `activity_${task.id}`,
                    }
                });

                await prisma.contactActivity.update({
                    where: { id: task.id },
                    data: { aiFallbackTriggered: true, aiAgentId: effectiveAgentId }
                });

                // Hemen ara
                const callResponse = await executeScheduledCall(
                    workspaceId, task.contact.phone, effectiveAgentId,
                    task.contactId, task.contact.firstName || task.contact.name || 'Müşteri',
                    'PUSH', `activity_${task.id}`, {}
                );

                if (callResponse?.call_id) {
                    await prisma.scheduledCall.update({
                        where: { id: sc.id },
                        data: { status: 'COMPLETED', retellCallId: callResponse.call_id }
                    });
                }

                processed++;
                results.push({ contactId: task.contactId, name: task.contact?.name, status: 'called', callId: callResponse?.call_id });
                console.log(`🚀 [Push] ${task.contact.phone} arandı (task: ${task.id})`);

            } catch (taskErr) {
                results.push({ contactId: task.contactId, name: task.contact?.name, status: 'error', error: taskErr.message });
                console.error(`❌ [Push] ${task.contactId} hatası:`, taskErr.message);
            }
        }

        return res.json({
            message: `${processed} görev arandı, ${skipped} atlandı`,
            processed,
            skipped,
            total: openTasks.length,
            mode: 'call',
            results
        });

    } catch (error) {
        console.error('❌ [Push] Error:', error.message);
        return res.status(500).json({ error: error.message });
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
            return res.status(400).json({ error: 'AI Arama API anahtarı yapılandırılmamış' });
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
        res.status(500).json({ error: 'AI Arama agentları getirilemedi' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /retell/:workspaceId/call/bulk
// Create a BulkCallBatch and start calling contacts in background
// Body: { contactIds, agentId, agentName }  OR  { selectAll, filters, agentId, agentName }
// ─────────────────────────────────────────────────────────────────────────────
export const bulkCall = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { contactIds, selectAll, filters = {}, agentId, agentName } = req.body;
        const userId = req.user?.id || '';

        if (!agentId) return res.status(400).json({ error: 'Agent seçilmedi' });
        if (!selectAll && !contactIds?.length) return res.status(400).json({ error: 'Kişi seçilmedi' });

        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { retellApiKey: true, retellFromNumber: true }
        });
        if (!workspace?.retellApiKey)  return res.status(400).json({ error: 'Retell API key eksik' });
        if (!workspace.retellFromNumber) return res.status(400).json({ error: 'Arama numarası yapılandırılmamış' });

        // Build contact query
        let where = { workspaceId, isDeleted: false, phone: { not: null } };
        if (selectAll) {
            const { search = '', status = '', source = '' } = filters;
            if (search) where.OR = [
                { name:     { contains: search, mode: 'insensitive' } },
                { fullName: { contains: search, mode: 'insensitive' } },
                { phone:    { contains: search } },
            ];
            if (status) where.status = status;
            if (source) where.source = source;
        } else {
            where.id = { in: contactIds };
        }

        const contacts = await prisma.contact.findMany({
            where,
            select: { id: true, name: true, fullName: true, phone: true }
        });

        if (!contacts.length) return res.status(400).json({ error: 'Geçerli kişi bulunamadı' });

        // Create batch with targets
        const targets = contacts.map(c => ({
            contactId: c.id,
            name: c.fullName || c.name || c.phone,
            phone: c.phone,
            status: 'queued'
        }));

        const batch = await prisma.bulkCallBatch.create({
            data: {
                workspaceId,
                agentId,
                agentName: agentName || agentId,
                targets: JSON.stringify(targets),
                totalTarget: contacts.length,
                totalCalled: 0,
                totalFailed: 0,
            }
        });

        // Respond immediately
        res.json({
            success: true,
            batchId: batch.id,
            queued: contacts.length,
            message: `${contacts.length} kişilik arama başlatıldı`
        });

        // Background call loop
        setImmediate(async () => {
            const client = new Retell({ apiKey: workspace.retellApiKey });
            let called = 0, failed = 0;

            for (let i = 0; i < contacts.length; i++) {
                const c = contacts[i];
                try {
                    let phone = (c.phone || '').replace(/[\s\+\-\(\)]/g, '');
                    if (phone.startsWith('0')) phone = '90' + phone.substring(1);
                    else if (!phone.startsWith('90') && phone.length === 10) phone = '90' + phone;

                    const callResponse = await client.call.createPhoneCall({
                        from_number: normalizePhone(workspace.retellFromNumber),
                        to_number: phone,
                        override_agent_id: agentId,
                        metadata: { workspaceId, contactId: c.id, contactName: c.fullName || c.name, bulkBatchId: batch.id, createdById: userId }
                    });

                    await prisma.retellCall.create({
                        data: {
                            workspace: { connect: { id: workspaceId } },
                            contactId: c.id,
                            callId: callResponse.call_id,
                            agentId,
                            fromNumber: workspace.retellFromNumber,
                            toNumber: phone,
                            direction: 'outbound',
                            status: callResponse.call_status || 'registered',
                            bulkBatchId: batch.id,
                            createdById: userId,
                        }
                    });

                    // Update target status in batch
                    const updTargets = JSON.parse((await prisma.bulkCallBatch.findUnique({ where: { id: batch.id }, select: { targets: true } })).targets);
                    const idx = updTargets.findIndex(t => t.contactId === c.id);
                    if (idx >= 0) updTargets[idx].status = 'called';
                    called++;
                    await prisma.bulkCallBatch.update({ where: { id: batch.id }, data: { targets: JSON.stringify(updTargets), totalCalled: called, totalFailed: failed } });

                } catch (err) {
                    failed++;
                    console.error(`❌ [bulkCall] Failed for ${c.phone}:`, err.message);
                    // Mark as failed in targets
                    try {
                        const batchData = await prisma.bulkCallBatch.findUnique({ where: { id: batch.id }, select: { targets: true } });
                        const updTargets = JSON.parse(batchData.targets);
                        const idx = updTargets.findIndex(t => t.contactId === c.id);
                        if (idx >= 0) updTargets[idx].status = 'failed';
                        await prisma.bulkCallBatch.update({ where: { id: batch.id }, data: { targets: JSON.stringify(updTargets), totalFailed: failed } });
                    } catch {}
                }
                // Rate limit delay (800ms)
                if (i < contacts.length - 1) await new Promise(r => setTimeout(r, 800));
            }
            console.log(`📞 [bulkCall] Batch ${batch.id}: ${called} called, ${failed} failed`);
        });

    } catch (error) {
        console.error('❌ [bulkCall]', error);
        res.status(500).json({ error: error.message || 'Toplu arama başlatılamadı' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /retell/:workspaceId/bulk-batches
// ─────────────────────────────────────────────────────────────────────────────
export const getBulkCallBatches = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { limit = 20, offset = 0 } = req.query;

        const [batches, total] = await Promise.all([
            prisma.bulkCallBatch.findMany({
                where: { workspaceId },
                orderBy: { createdAt: 'desc' },
                take: parseInt(limit),
                skip: parseInt(offset),
                select: { id: true, agentName: true, totalTarget: true, totalCalled: true, totalFailed: true, createdAt: true }
            }),
            prisma.bulkCallBatch.count({ where: { workspaceId } })
        ]);

        res.json({ batches, total });
    } catch (e) {
        console.error('❌ [getBulkCallBatches]', e);
        res.status(500).json({ error: 'Batch listesi alınamadı' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /retell/:workspaceId/bulk-batches/:batchId
// ─────────────────────────────────────────────────────────────────────────────
export const getBulkCallBatch = async (req, res) => {
    try {
        const { workspaceId, batchId } = req.params;

        const batch = await prisma.bulkCallBatch.findFirst({
            where: { id: batchId, workspaceId },
            include: { calls: { select: { id: true, contactId: true, toNumber: true, status: true, duration: true, sentiment: true, cost: true, createdAt: true } } }
        });

        if (!batch) return res.status(404).json({ error: 'Batch bulunamadı' });

        const targets = JSON.parse(batch.targets || '[]');
        // Enrich targets with call data
        const enriched = targets.map(t => {
            const call = batch.calls.find(c => c.contactId === t.contactId);
            return { ...t, call: call || null };
        });

        res.json({ ...batch, targets: enriched });
    } catch (e) {
        console.error('❌ [getBulkCallBatch]', e);
        res.status(500).json({ error: 'Batch detayı alınamadı' });
    }
};

// Make an outbound call
export const makeCall = async (req, res) => {
    try {
        console.log(`🚨 [DEBUG-MAKE-CALL] makeCall API CALLED for ${req.body.toNumber} by user ${req.user?.id} from IP ${req.ip} !! THIS MEANS AN HTTP REQUEST WAS MADE (Likely old frontend code)`);
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
            return res.status(400).json({ error: 'AI Arama ayarları yapılandırılmamış (Agent ID eksik)' });
        }

        if (!workspace.retellFromNumber) {
            return res.status(400).json({ error: 'Arama yapılacak numara yapılandırılmamış' });
        }

        const client = new Retell({ apiKey: workspace.retellApiKey });
        const formattedTo = normalizePhone(toNumber);
        const teamAgentId = await getTeamAgentIdForContactOrConversation(workspaceId, contactId, sourceConversationId);
        const effectiveAgentId = agentId || teamAgentId || workspace.retellAgentId;

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

        const dynVars = await buildRetellDynamicVariables(workspaceId, contactId, contactName);
        if (Object.keys(dynVars).length > 0) {
            callParams.retell_llm_dynamic_variables = dynVars;
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
        const { contactId, search, status, sentiment, callSuccessful, direction, startDate, endDate, limit = 20, offset = 0 } = req.query;

        const where = { workspaceId };
        if (contactId) where.contactId = contactId;
        if (status) where.status = status;
        if (sentiment) where.sentiment = sentiment;
        if (direction) where.direction = direction;
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
            return res.status(400).json({ error: 'AI Arama ayarları eksik' });
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

                const dynVars = await buildRetellDynamicVariables(workspaceId, call.contactId, null);
                
                const callParams = {
                    from_number: workspace.retellFromNumber,
                    to_number: formattedTo,
                    override_agent_id: workspace.retellAgentId,
                    metadata: {
                        workspaceId,
                        contactId: call.contactId || null,
                        contactName: null,
                        createdById: userId,
                        retryOf: call.id
                    }
                };
                
                if (Object.keys(dynVars).length > 0) {
                    callParams.retell_llm_dynamic_variables = dynVars;
                }

                const callResponse = await client.call.createPhoneCall(callParams);

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
            // 24-SAAT BİRLEŞTİRME: Son 24 saat içinde bu kişi ile mevcut conversation varsa yeniden kullan
            const isInboundCall = call.direction === 'inbound';
            const mergeWindow = isInboundCall ? 86400000 : 120000; // Gelen: 24 saat, Giden: 2dk

            const recentConv = await prisma.conversation.findFirst({
                where: {
                    workspaceId,
                    contactId,
                    ...(isInboundCall
                        ? { lastMessageAt: { gte: new Date(Date.now() - mergeWindow) } }
                        : { channel: 'PHONE', createdAt: { gte: new Date(Date.now() - mergeWindow) } }
                    )
                },
                orderBy: { lastMessageAt: 'desc' }
            });
            if (recentConv) {
                // Mevcut conversation'ı kullan, RetellCall'ı bağla
                try {
                    await prisma.retellCall.update({
                        where: { callId: call.call_id },
                        data: { conversationId: recentConv.id }
                    });
                } catch (_) {}

                // ── Mevcut yazışmaya "Gelen Arama" mesajı düşür (giden aramadaki gibi) ──
                const mergeMsg = await prisma.message.create({
                    data: {
                        content: `📲 Gelen Arama (devam ediyor)\n${fromNumber}`,
                        conversationId: recentConv.id,
                        isFromContact: true,
                        messageType: 'CALL_TRANSCRIPT',
                        status: 'SENT'
                    }
                });

                // Conversation'ı güncelle: lastMessageAt + kapalıysa yeniden aç
                await prisma.conversation.update({
                    where: { id: recentConv.id },
                    data: {
                        lastMessageAt: new Date(),
                        ...(recentConv.status === 'CLOSED' ? { status: 'OPEN' } : {})
                    }
                });

                // Real-time: mesaj ve conversation güncelleme bildir
                emitToWorkspace(workspaceId, 'new_message', {
                    workspaceId,
                    conversationId: recentConv.id,
                    message: mergeMsg
                });

                console.log(`📞 [Retell] ${isInboundCall ? '24H-MERGE' : 'DEDUP'}: Reusing conversation ${recentConv.id} (${recentConv.channel}) for ${call.call_id}, message created`);
                return;
            }
                const assignedTeamId = await resolveAgentTeamId(workspaceId, call.agent_id);
                const conversation = await prisma.conversation.create({
                    data: {
                        workspaceId,
                        contactId,
                        channel: 'PHONE',
                        status: 'OPEN',
                        lastMessageAt: new Date(),
                        assignedTeamId
                    }
                });

                // Varsayılan akış ataması (merkezi)
                assignDefaultFunnel(workspaceId, conversation.id).catch(e => console.error('❌ [AutoFunnel] Retell error:', e.message));

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
                                        data: {
                                            status: 'ended',
                                            duration: checked.duration_ms ? Math.round(checked.duration_ms / 1000) : null,
                                            recordingUrl: checked.recording_url || null
                                        }
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
                                            
                                            // Her durumda analysis datasını DB'ye kaydet
                                            await prisma.retellCall.update({
                                                where: { id: rec.id },
                                                data: {
                                                    transcript: analyzed.transcript || null,
                                                    recordingUrl: analyzed.recording_url || null,
                                                    summary: analyzed.call_analysis?.call_summary || null,
                                                    sentiment: analyzed.call_analysis?.user_sentiment || null,
                                                    callSuccessful: analyzed.call_analysis?.call_successful ?? null
                                                }
                                            });

                                            // Özet ve kaydı Tamamlandı mesajına ekle (webhook kaçırmış olabilir)
                                            if (analyzed.call_analysis?.call_summary || analyzed.recording_url) {
                                                await handleCallAnalyzed(analyzed);
                                            }

                                            // Sadece transcript varsa chat ekranına uzun uzun mesajları at
                                            if (analyzed.transcript) {
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
            // No existing record — CREATE one (e.g. inbound call where call_started webhook was missed)
            console.log(`📞 [Retell] call_ended: no existing record for ${call.call_id}, creating new record`);

            // Determine workspace from agent_id or phone numbers
            let workspaceId = call.metadata?.workspaceId || null;
            if (!workspaceId) {
                const ws = await prisma.workspace.findFirst({
                    where: {
                        OR: [
                            ...(call.agent_id ? [{ retellAgentId: call.agent_id }] : []),
                            ...(toNumber ? [{ retellFromNumber: toNumber }] : []),
                            ...(fromNumber ? [{ retellFromNumber: fromNumber }] : [])
                        ]
                    },
                    select: { id: true, retellFromNumber: true }
                });
                workspaceId = ws?.id;
            }

            if (workspaceId) {
                // Detect direction: if toNumber matches workspace's retellFromNumber → inbound
                const wsInfo = await prisma.workspace.findUnique({
                    where: { id: workspaceId },
                    select: { retellFromNumber: true }
                });
                const isInbound = call.direction === 'inbound' ||
                    (wsInfo?.retellFromNumber && normalizePhone(toNumber) === normalizePhone(wsInfo.retellFromNumber));

                // Try to find contact
                let contactId = null;
                const lookupPhone = isInbound ? fromNumber : toNumber;
                if (lookupPhone) {
                    const normalized = normalizePhone(lookupPhone);
                    const contact = await prisma.contact.findFirst({
                        where: {
                            workspaceId,
                            OR: [
                                { phone: normalized },
                                { phone: lookupPhone },
                                { phone: lookupPhone.replace(/\D/g, '') }
                            ]
                        },
                        select: { id: true }
                    });
                    contactId = contact?.id || null;
                }

                // Create new contact for unknown inbound callers
                if (!contactId && isInbound && fromNumber) {
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
                    console.log(`📞 [Retell] call_ended fallback: created new contact ${contactId} for ${fromNumber}`);
                }

                callRecord = await prisma.retellCall.create({
                    data: {
                        workspaceId,
                        callId: call.call_id,
                        agentId: call.agent_id || '',
                        fromNumber,
                        toNumber,
                        direction: isInbound ? 'inbound' : (call.direction || 'outbound'),
                        status: 'ended',
                        duration,
                        transcript: call.transcript || null,
                        recordingUrl: call.recording_url || null,
                        endedReason: call.disconnection_reason || null,
                        cost: call.call_cost?.combined_cost ?? null,
                        contactId,
                        createdById: '',
                        ...(call.start_timestamp ? { createdAt: new Date(call.start_timestamp) } : {})
                    }
                });
                console.log(`📞 [Retell] call_ended: created missing record ${callRecord.id} for ${call.call_id} (${isInbound ? 'inbound' : 'outbound'})`);
            } else {
                console.warn(`📞 [Retell] call_ended: no workspace found for orphan call ${call.call_id}`);
            }
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
            // createdById can be a real userId, 'activity_xxx', 'auto_chat_request', or '' — only notify real users
            const isRealUserId = callRecord.createdById
                && !callRecord.createdById.startsWith('activity_')
                && !callRecord.createdById.startsWith('auto_')
                && callRecord.createdById.length > 10; // CUID/UUID are long strings
            if (isRealUserId) {
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
                        const assignedTeamId = await resolveAgentTeamId(callRecord.workspaceId, callRecord.agentId || call.agent_id);
                        if (conversation && assignedTeamId && !conversation.assignedTeamId) {
                            conversation = await prisma.conversation.update({
                                where: { id: conversation.id },
                                data: { assignedTeamId }
                            });
                        }
                        if (!conversation) {
                            conversation = await prisma.conversation.create({
                                data: {
                                    workspaceId: callRecord.workspaceId,
                                    contactId: callRecord.contactId,
                                    channel: 'PHONE',
                                    status: 'OPEN',
                                    lastMessageAt: new Date(),
                                    assignedTeamId
                                }
                            });

                            // Varsayılan akış ataması (merkezi)
                            assignDefaultFunnel(callRecord.workspaceId, conversation.id).catch(e => console.error('❌ [AutoFunnel] Retell error:', e.message));

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

            // ─── BAŞARISIZ ÇAĞRI RETRY MANTİĞİ ──────────────────────────────────
            // Açılmayan, meşgul, sesli mesaj veya çok kısa (<10sn) çağrılar başarısız sayılır
            const failedReasons = ['no_answer', 'busy', 'voicemail_reached', 'machine_detected', 'dial_failed', 'dial_no_answer'];
            const disconnectReason = call.disconnection_reason || '';
            const isFailedCall = failedReasons.some(r => disconnectReason.toLowerCase().includes(r)) || (duration !== null && duration < 10);

            // 🤖 Otomasyon Hook'ları — Arama sonucu
            try {
              if (callRecord && callRecord.contactId) {
                if (isFailedCall) {
                  executeRule(callRecord.workspaceId, 'CALL_FAILED_NOTIFY', { contactId: callRecord.contactId }).catch(e => console.error('[AutoHook] CALL_FAILED_NOTIFY error:', e.message));
                  executeRule(callRecord.workspaceId, 'MISSED_CALL_NOTIFY', { contactId: callRecord.contactId }).catch(e => console.error('[AutoHook] MISSED_CALL_NOTIFY error:', e.message));
                } else {
                  executeRule(callRecord.workspaceId, 'CALL_SUCCESS_NOTIFY', { contactId: callRecord.contactId }).catch(e => console.error('[AutoHook] CALL_SUCCESS_NOTIFY error:', e.message));
                }
              }
            } catch (hookErr) {
              console.error('[AutoHook] Retell call hooks error:', hookErr.message);
            }

            if (isFailedCall && callRecord.createdById) {
                // Bu çağrının ScheduledCall kaydını bul (retry bilgisi için)
                const scheduledCall = await prisma.scheduledCall.findFirst({
                    where: { retellCallId: call.call_id }
                });

                if (scheduledCall && scheduledCall.attemptNumber < scheduledCall.maxAttempts) {
                    // ─── AKILLI KADEME: Agent config'den retrySteps al ──────────
                    let retryDelay = scheduledCall.retryDelayMin || 60;
                    const currentAttempt = scheduledCall.attemptNumber;

                    // Agent config'den kademeli gecikme sürelerini oku
                    let retrySteps = null;
                    try {
                        const ws = await prisma.workspace.findUnique({
                            where: { id: scheduledCall.workspaceId },
                            select: { retellAutoCallTriggers: true }
                        });
                        const agentConfigs = ws?.retellAutoCallTriggers?.agentConfigs || {};
                        const agentCfg = agentConfigs[scheduledCall.agentId];
                        retrySteps = agentCfg?.retrySteps;

                        if (retrySteps && retrySteps.length > 0) {
                            const stepIdx = Math.min(currentAttempt - 1, retrySteps.length - 1);
                            retryDelay = retrySteps[stepIdx]?.delay || retryDelay;
                            console.log(`🔄 [Retry] Kademe ${currentAttempt}/${retrySteps.length}: ${retryDelay}dk sonra tekrar aranacak`);
                        }
                    } catch (_) {}

                    // agentCfg bulunamadıysa makul default kullan (10dk değil)
                    if (!retrySteps) {
                        retrySteps = [{ delay: 60 }, { delay: 240 }, { delay: 1440 }];
                        const stepIdx = Math.min(currentAttempt - 1, retrySteps.length - 1);
                        retryDelay = retrySteps[stepIdx]?.delay || 60;
                        console.log(`⚠️ [Retry] agentCfg bulunamadı — default kademe kullanılıyor: ${retryDelay}dk`);
                    }

                    const nextAttemptAt = new Date(Date.now() + retryDelay * 60 * 1000);
                    const nextAttempt = scheduledCall.attemptNumber + 1;
                    const retryDelayLabel = retryDelay >= 1440 ? `${Math.round(retryDelay / 1440)} gün` : retryDelay >= 60 ? `${Math.round(retryDelay / 60)} saat` : `${retryDelay} dk`;

                    // 1. GÖREVİ AÇIK BIRAK — Sadece notu güncelle, kapatma
                    if (scheduledCall.createdById?.startsWith('activity_')) {
                        const activityId = scheduledCall.createdById.replace('activity_', '');
                        try {
                            await prisma.contactActivity.update({
                                where: { id: activityId },
                                data: {
                                    result: `📞 Deneme ${currentAttempt}/${scheduledCall.maxAttempts}: Ulaşılamadı (${disconnectReason || 'Bilinmiyor'}). ${retryDelayLabel} sonra tekrar aranacak.`,
                                    dueDate: nextAttemptAt
                                }
                            });
                            console.log(`📋 [Retry] Görev açık bırakıldı, not güncellendi: ${activityId} — Deneme ${currentAttempt}/${scheduledCall.maxAttempts}`);
                        } catch (_) {}
                    }

                    // 2. YENİ ScheduledCall oluştur (aynı activity üzerinden)
                    await prisma.scheduledCall.create({
                        data: {
                            workspaceId: scheduledCall.workspaceId,
                            contactId: scheduledCall.contactId,
                            contactName: scheduledCall.contactName,
                            toNumber: scheduledCall.toNumber,
                            agentId: scheduledCall.agentId,
                            scheduledAt: nextAttemptAt,
                            status: 'PENDING',
                            createdById: scheduledCall.createdById,
                            dynamicVariables: scheduledCall.dynamicVariables,
                            attemptNumber: nextAttempt,
                            maxAttempts: scheduledCall.maxAttempts,
                            retryDelayMin: retryDelay,
                            parentCallId: scheduledCall.parentCallId || scheduledCall.id,
                            conversationId: scheduledCall.conversationId
                        }
                    });
                    console.log(`🔄 [Retry] Deneme ${nextAttempt}/${scheduledCall.maxAttempts} planlandı: ${nextAttemptAt.toLocaleString('tr-TR')} (+${retryDelayLabel}) | Numara: ${scheduledCall.toNumber}`);

                } else if (scheduledCall && scheduledCall.attemptNumber >= scheduledCall.maxAttempts) {
                    // Tüm denemeler tükendi — görevi ULAŞILAMADI olarak kapat
                    console.log(`❌ [Retry] Tüm denemeler tükendi (${scheduledCall.attemptNumber}/${scheduledCall.maxAttempts}) | Numara: ${scheduledCall.toNumber}`);
                    if (scheduledCall.createdById?.startsWith('activity_')) {
                        const activityId = scheduledCall.createdById.replace('activity_', '');
                        try {
                            await prisma.contactActivity.update({
                                where: { id: activityId },
                                data: {
                                    status: 'CANCELLED',
                                    isCompleted: true,
                                    completedAt: new Date(),
                                    result: `❌ ${scheduledCall.maxAttempts} kere arandı, ulaşılamadı. Son sebep: ${disconnectReason || 'Bilinmiyor'}`,
                                    source: 'AI_CALL'
                                }
                            });
                        } catch (_) {}
                    }
                }
            }

            // Başarılı çağrı → Activity'yi tamamla + aynı numaraya tüm bekleyen aramaları iptal et
            if (!isFailedCall && callRecord.createdById && callRecord.createdById.startsWith('activity_')) {
                const activityId = callRecord.createdById.replace('activity_', '');
                try {
                    const durationText = duration ? `${duration} saniye` : 'Bilinmiyor';
                    await prisma.contactActivity.update({
                        where: { id: activityId },
                        data: {
                            status: 'COMPLETED',
                            isCompleted: true,
                            completedAt: new Date(),
                            result: `AI araması tamamlandı. Süre: ${durationText}.`,
                            source: 'AI_CALL'
                        }
                    });
                    console.log(`✅ [Retell Webhook] Completed activity ${activityId} via call_ended`);
                } catch (actErr) {
                    console.error(`❌ [Retell Webhook] Failed to update activity ${activityId} in call_ended:`, actErr.message);
                }

                // ─── BAŞARILI ARAMA SONRASI TÜM PENDING ARAMALARI İPTAL ET ────────
                // Aynı numara + aynı workspace için bekleyen TÜM scheduledCall'ları iptal et
                // Bu, farklı activity'lerden oluşan duplicate zincirlerini de temizler
                try {
                    const cancelledCalls = await prisma.scheduledCall.updateMany({
                        where: {
                            workspaceId: callRecord.workspaceId,
                            toNumber: callRecord.toNumber,
                            status: 'PENDING'
                        },
                        data: {
                            status: 'CANCELLED',
                            errorMessage: `Başarılı arama yapıldı (${durationText}) — kalan denemeler iptal edildi`
                        }
                    });
                    if (cancelledCalls.count > 0) {
                        console.log(`🧹 [Retell Webhook] ${cancelledCalls.count} bekleyen arama iptal edildi (${callRecord.toNumber} — başarılı konuşma sonrası)`);
                    }
                } catch (cancelErr) {
                    console.error(`⚠️ [Retell Webhook] Pending çağrılar iptal edilemedi:`, cancelErr.message);
                }

                // Aynı kişi için diğer PLANNED CALL activity'lerini de tamamla
                // (formWebhook + intentStage ikisi birden activity oluşturmuş olabilir)
                if (callRecord.contactId) {
                    try {
                        const otherActivities = await prisma.contactActivity.updateMany({
                            where: {
                                contactId: callRecord.contactId,
                                workspaceId: callRecord.workspaceId,
                                type: 'CALL',
                                status: 'PLANNED',
                                id: { not: activityId }
                            },
                            data: {
                                status: 'COMPLETED',
                                isCompleted: true,
                                completedAt: new Date(),
                                result: `Başka bir AI aramasıyla tamamlandı (${durationText}).`
                            }
                        });
                        if (otherActivities.count > 0) {
                            console.log(`🧹 [Retell Webhook] ${otherActivities.count} duplicate CALL activity de tamamlandı (${callRecord.contactId})`);
                        }
                    } catch (_) {}
                }
            }

            // ── AUTO-CASE: Arama bittiğinde açık case yoksa otomatik oluştur ──
            try {
                const caseContactId = callRecord.contactId;
                const caseWorkspaceId = callRecord.workspaceId;
                if (caseContactId && caseWorkspaceId) {
                    // Bu kişinin aktif case'i var mı?
                    const existingCase = await prisma.case.findFirst({
                        where: {
                            contactId: caseContactId,
                            workspaceId: caseWorkspaceId,
                            status: { in: ['ACTIVE', 'PENDING', 'IN_PROGRESS'] }
                        }
                    });
                    if (!existingCase) {
                        // 24-SAAT CASE BİRLEŞTİRME: Son 24 saatte kapatılmış case varsa yeniden aç
                        const recentClosedCase = await prisma.case.findFirst({
                            where: {
                                contactId: caseContactId,
                                workspaceId: caseWorkspaceId,
                                status: { in: ['RESOLVED', 'CLOSED', 'COMPLETED'] },
                                updatedAt: { gte: new Date(Date.now() - 86400000) }
                            },
                            orderBy: { updatedAt: 'desc' }
                        });

                        if (recentClosedCase) {
                            // Mevcut case'i yeniden aç
                            await prisma.case.update({
                                where: { id: recentClosedCase.id },
                                data: { status: 'ACTIVE' }
                            });

                            if (callRecord.conversationId) {
                                await prisma.conversation.update({
                                    where: { id: callRecord.conversationId },
                                    data: { caseId: recentClosedCase.id }
                                });
                            }

                            console.log(`📦 [AutoCase] 24H-MERGE: Reopened case "${recentClosedCase.caseNumber}" for inbound call from contact ${caseContactId}`);
                        } else {
                            // Yeni case oluştur
                        // Case numarası oluştur
                        const year = new Date().getFullYear();
                        const prefix = 'CSE';
                        const lastCase = await prisma.case.findFirst({
                            where: { workspaceId: caseWorkspaceId, caseNumber: { startsWith: `${prefix}-${year}` } },
                            orderBy: { createdAt: 'desc' }
                        });
                        let nextNum = 1;
                        if (lastCase?.caseNumber) {
                            const parts = lastCase.caseNumber.split('-');
                            if (parts[2]) nextNum = parseInt(parts[2], 10) + 1;
                        }
                        const caseNumber = `${prefix}-${year}-${String(nextNum).padStart(4, '0')}`;

                        const phoneLabel = callRecord.direction === 'inbound'
                            ? `Gelen Arama: ${callRecord.fromNumber}`
                            : `Yapılan Arama: ${callRecord.toNumber}`;

                        const newCase = await prisma.case.create({
                            data: {
                                workspaceId: caseWorkspaceId,
                                contactId: caseContactId,
                                caseNumber,
                                title: phoneLabel,
                                priority: 'NORMAL'
                            }
                        });

                        // Conversation varsa case'e bağla
                        if (callRecord.conversationId) {
                            await prisma.conversation.update({
                                where: { id: callRecord.conversationId },
                                data: { caseId: newCase.id }
                            });
                        }

                        console.log(`📦 [AutoCase] Phone call → auto-created case "${caseNumber}" for contact ${caseContactId}`);
                        }
                    }
                }
            } catch (caseErr) {
                console.error(`⚠️ [AutoCase] Failed in handleCallEnded:`, caseErr.message);
            }
            // ── AUTO-CASE END ──
        }

        console.log(`📞 [Retell] Call ended: ${call.call_id}, duration: ${duration}s, reason: ${call.disconnection_reason || 'N/A'}, hasTranscript: ${!!call.transcript}`);
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

    const assignedTeamId = await resolveAgentTeamId(workspaceId, callRecord.agentId || call.agent_id);
    if (conversation && assignedTeamId && !conversation.assignedTeamId) {
        conversation = await prisma.conversation.update({
            where: { id: conversation.id },
            data: { assignedTeamId }
        });
    }
    if (!conversation) {
        conversation = await prisma.conversation.create({
            data: {
                workspaceId,
                contactId,
                channel: 'PHONE',
                status: 'OPEN',
                lastMessageAt: new Date(),
                assignedTeamId
            }
        });

        // Varsayılan akış ataması (merkezi)
        assignDefaultFunnel(workspaceId, conversation.id).catch(e => console.error('❌ [AutoFunnel] Retell error:', e.message));

        console.log(`📞 [Retell] Created new PHONE conversation ${conversation.id} for ${direction || 'outbound'} call (no prior conversation found)`);
    }

    const conversationId = conversation.id;
    const durationText = duration ? `${Math.floor(duration / 60)}dk ${duration % 60}sn` : '0sn';
    const createdMessages = [];

    // 2. Create call header message (direction-aware)
    const isInbound = direction === 'inbound';
    const displayNumber = isInbound ? (callRecord.fromNumber || toNumber) : toNumber;
    const dirHeaderLabel = isInbound ? '📲 Gelen Arama' : '📞 Giden Arama';
    const headerMsg = await prisma.message.create({
        data: {
            content: `${dirHeaderLabel} Tamamlandı\n${displayNumber} • ${durationText}`,
            conversationId,
            isFromContact: isInbound,
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

    // 4. Create call footer message (direction-aware)
    const sentiment = callRecord.sentiment || '';
    const sentimentEmoji = sentiment === 'Positive' ? '😊' : sentiment === 'Negative' ? '😞' : '😐';
    const dirFooterLabel = isInbound ? '📲 Gelen Arama Sona Erdi' : '📞 Arama Sona Erdi';
    const footerMsg = await prisma.message.create({
        data: {
            content: `${dirFooterLabel} • ${durationText}${sentiment ? ` • ${sentimentEmoji} ${sentiment}` : ''}`,
            conversationId,
            isFromContact: isInbound,
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

    // Madde 0: Pipeline post-processing
    try {
        const { runChannelPostProcessing } = await import('./inbox.controller.js');
        runChannelPostProcessing(workspaceId, conversationId, contactId, call.transcript || '', 'RETELL').catch(() => {});
    } catch (e) { /* pipeline opsiyonel */ }

    console.log(`📞 [Retell] Injected ${createdMessages.length} transcript messages into conversation ${conversationId}`);
}

async function handleCallAnalyzed(call) {
    try {
        const analysis = call.call_analysis || {};

        // Save transcript and recording URL too — call_ended may have arrived before these were ready
        const analyzedUpdateData = {
            summary: analysis.call_summary || null,
            sentiment: analysis.user_sentiment || null,
            callSuccessful: analysis.call_successful ?? null
        };
        if (call.transcript) analyzedUpdateData.transcript = call.transcript;
        if (call.recording_url) analyzedUpdateData.recordingUrl = call.recording_url;

        await prisma.retellCall.updateMany({
            where: { callId: call.call_id },
            data: analyzedUpdateData
        });

        // Update conversation message with summary + recording URL
        if (analysis.call_summary || call.recording_url) {
            try {
                const analyzedCallRec = await prisma.retellCall.findUnique({ where: { callId: call.call_id } });
                if (analyzedCallRec?.conversationId) {
                    const callMsg = await prisma.message.findFirst({
                        where: {
                            conversationId: analyzedCallRec.conversationId,
                            messageType: 'CALL_TRANSCRIPT',
                            OR: [
                                { content: { contains: 'Arama Tamamlandı' } },
                                { content: { contains: 'Arama Sona Erdi' } }
                            ]
                        },
                        orderBy: { createdAt: 'desc' }
                    });
                    if (callMsg) {
                        let updatedContent = callMsg.content;
                        if (analysis.call_summary && !callMsg.content.includes('📋')) {
                            updatedContent += '\n\n📋 ' + analysis.call_summary;
                        }
                        if (call.recording_url && !callMsg.content.includes('[recording:')) {
                            updatedContent += '\n[recording:' + call.recording_url + ']';
                        }
                        await prisma.message.update({
                            where: { id: callMsg.id },
                            data: { content: updatedContent }
                        });
                        // Also save recording URL to RetellCall record
                        if (call.recording_url) {
                            await prisma.retellCall.updateMany({
                                where: { callId: call.call_id },
                                data: { recordingUrl: call.recording_url }
                            });
                        }
                        emitToWorkspace(analyzedCallRec.workspaceId, 'new_message', {
                            workspaceId: analyzedCallRec.workspaceId,
                            conversationId: analyzedCallRec.conversationId,
                            message: { type: 'call_analyzed' }
                        });
                    }
                }
            } catch (sumErr) {
                console.error('⚠️ [Retell] Summary/recording inject error (non-fatal):', sumErr.message);
            }
        }

        // Fallback: inject transcript if it wasn't injected during call_ended
        const callRecord = await prisma.retellCall.findUnique({
            where: { callId: call.call_id }
        });

        if (callRecord?.contactId && (callRecord.transcript || call.transcript)) {
            // Check if full transcript was already injected (check both old and new header formats)
            const existingTranscript = await prisma.message.findFirst({
                where: {
                    conversationId: callRecord.conversationId || undefined,
                    messageType: 'CALL_TRANSCRIPT',
                    content: { contains: 'Sona Erdi' }
                }
            });

            if (!existingTranscript) {
                try {
                    const duration = callRecord.duration || 0;
                    const transcriptText = callRecord.transcript || call.transcript;
                    await injectTranscriptToChat(callRecord, {
                        ...call,
                        transcript: transcriptText
                    }, duration);
                    console.log(`📞 [Retell] Transcript injected via call_analyzed fallback for ${call.call_id}`);
                } catch (injErr) {
                    console.error('❌ [Retell] Fallback transcript injection error:', injErr.message);
                }
            }
        }

        console.log(`📞 [Retell] Call analyzed: ${call.call_id}, sentiment: ${analysis.user_sentiment}, success: ${analysis.call_successful}`);

        // If this call was initiated from an agent's overdue call activity, update the result with the call summary
        if (callRecord && callRecord.createdById && callRecord.createdById.startsWith('activity_')) {
            const activityId = callRecord.createdById.replace('activity_', '');
            try {
                const durationText = callRecord.duration ? `${callRecord.duration} saniye` : 'Bilinmiyor';
                const summaryText = analysis.call_summary || '';
                await prisma.contactActivity.update({
                    where: { id: activityId },
                    data: {
                        status: 'COMPLETED',
                        isCompleted: true,
                        completedAt: new Date(),
                        result: `AI araması tamamlandı. Süre: ${durationText}.${summaryText ? '\nÖzet: ' + summaryText : ''}`,
                        source: 'AI_CALL'
                    }
                });
                console.log(`✅ [Retell Webhook] Updated activity ${activityId} with summary via call_analyzed`);
            } catch (actErr) {
                console.error(`❌ [Retell Webhook] Failed to update activity ${activityId} in call_analyzed:`, actErr.message);
            }
        }

        // === TRIGGER AUTOMATION ===
        if (callRecord) {
            try {
                const { executeRetellAutomation } = await import('./automation.controller.js');
                await executeRetellAutomation(callRecord.workspaceId, callRecord);
            } catch (autoErr) {
                console.error('❌ [Retell] Automation trigger error:', autoErr.message);
            }

            // 🎯 TRANSKRİPT ANALİZİ — Arama/ziyaret talepleri çıkar
            try {
                if (callRecord.transcript && callRecord.contactId) {
                    const { analyzeTranscript } = await import('../services/universalClassifier.service.js');
                    const transcriptResult = await analyzeTranscript(
                        callRecord.transcript,
                        analysis.call_summary || callRecord.summary,
                        callRecord.workspaceId
                    );

                    if (transcriptResult.requestedAction && transcriptResult.requestedAction !== 'null') {
                        console.log(`🎯 [Retell Transcript] Action: ${transcriptResult.requestedAction}, Date: ${transcriptResult.requestedDate}, HumanTransfer: ${transcriptResult.wantsHumanTransfer}`);

                        const contact = await prisma.contact.findUnique({
                            where: { id: callRecord.contactId },
                            select: { name: true }
                        });

                        const isHumanTransfer = transcriptResult.requestedAction === 'HUMAN_TRANSFER' || transcriptResult.wantsHumanTransfer === true;

                        const actType = isHumanTransfer ? 'CALL'
                            : transcriptResult.requestedAction === 'VISIT' ? 'VISIT'
                            : transcriptResult.requestedAction === 'MEETING' ? 'MEETING'
                            : 'CALL';

                        const dueDate = transcriptResult.requestedDate
                            ? new Date(transcriptResult.requestedDate)
                            : new Date(Date.now() + 24 * 60 * 60 * 1000); // Yarın

                        // Duplicate check
                        const nowTR = new Date(Date.now() + TZ_OFFSET_MS);
                        const todayStart = new Date(Date.UTC(nowTR.getUTCFullYear(), nowTR.getUTCMonth(), nowTR.getUTCDate()) - TZ_OFFSET_MS);
                        const todayEnd = new Date(Date.UTC(nowTR.getUTCFullYear(), nowTR.getUTCMonth(), nowTR.getUTCDate()) - TZ_OFFSET_MS + 24*60*60*1000 - 1);
                        const existing = await prisma.contactActivity.findFirst({
                            where: {
                                contactId: callRecord.contactId,
                                type: actType,
                                status: 'PLANNED',
                                dueDate: { gte: todayStart }
                            }
                        });

                        if (!existing) {
                            // Case miras al
                            let transcriptCaseId = null;
                            try {
                                const ac = await prisma.case.findFirst({
                                    where: { contactId: callRecord.contactId, workspaceId: callRecord.workspaceId, status: 'ACTIVE' },
                                    orderBy: { updatedAt: 'desc' },
                                    select: { id: true }
                                });
                                transcriptCaseId = ac?.id || null;
                            } catch (_) {}

                            // ─── HUMAN_TRANSFER: Satış takımından birine ata ──────────────
                            let assignedToId = null;
                            let assignedTeamId = null;

                            if (isHumanTransfer) {
                                try {
                                    // 1. Conversation'ın atandığı takımı bul
                                    const conv = await prisma.conversation.findFirst({
                                        where: { contactId: callRecord.contactId, workspaceId: callRecord.workspaceId },
                                        orderBy: { lastMessageAt: 'desc' },
                                        select: { assignedTeamId: true, assignedToId: true }
                                    });

                                    // 2. Takım varsa → takımdaki üyelerden birine ata
                                    const teamId = conv?.assignedTeamId;
                                    if (teamId) {
                                        assignedTeamId = teamId;
                                        const members = await prisma.teamMember.findMany({
                                            where: { teamId },
                                            select: { userId: true }
                                        });
                                        if (members.length > 0) {
                                            // Round-robin: en az görevi olan üyeye ata
                                            const memberIds = members.map(m => m.userId);
                                            const taskCounts = await prisma.contactActivity.groupBy({
                                                by: ['assignedToId'],
                                                where: {
                                                    assignedToId: { in: memberIds },
                                                    status: 'PLANNED',
                                                    workspaceId: callRecord.workspaceId
                                                },
                                                _count: true
                                            });
                                            const countMap = new Map(taskCounts.map(t => [t.assignedToId, t._count]));
                                            // En az görevi olan üye
                                            assignedToId = memberIds.reduce((best, id) =>
                                                (countMap.get(id) || 0) < (countMap.get(best) || 0) ? id : best
                                            , memberIds[0]);
                                        }
                                    }

                                    // 3. Takım yoksa → workspace'teki herhangi bir takımın üyesini bul
                                    if (!assignedToId) {
                                        const firstTeam = await prisma.team.findFirst({
                                            where: { workspaceId: callRecord.workspaceId },
                                            include: { members: { select: { userId: true }, take: 5 } }
                                        });
                                        if (firstTeam?.members?.length > 0) {
                                            assignedTeamId = firstTeam.id;
                                            assignedToId = firstTeam.members[Math.floor(Math.random() * firstTeam.members.length)].userId;
                                        }
                                    }

                                    console.log(`👤 [Retell Transcript] HUMAN_TRANSFER → assignedTo: ${assignedToId || 'YOK'}, team: ${assignedTeamId || 'YOK'}`);
                                } catch (teamErr) {
                                    console.error('⚠️ [Retell Transcript] Takım atama hatası:', teamErr.message);
                                }
                            }

                            const typeLabels = { CALL: 'Tekrar Arama', VISIT: 'Ziyaret', MEETING: 'Görüşme' };
                            const title = isHumanTransfer
                                ? `📞 Yönetici Araması: ${contact?.name || callRecord.toNumber}`
                                : `${typeLabels[actType]}: ${contact?.name || callRecord.toNumber}`;

                            const description = isHumanTransfer
                                ? `Müşteri AI görüşmesinde gerçek bir kişiyle/yöneticiyle konuşmak istedi.\n"${transcriptResult.rawRequest || ''}"`
                                : `AI görüşmesinden: "${transcriptResult.rawRequest || ''}"`;

                            await prisma.contactActivity.create({
                                data: {
                                    type: actType,
                                    status: 'PLANNED',
                                    priority: isHumanTransfer ? 'HIGH' : 'NORMAL',
                                    title,
                                    description,
                                    dueDate,
                                    contactId: callRecord.contactId,
                                    workspaceId: callRecord.workspaceId,
                                    source: isHumanTransfer ? 'AI_CALL' : 'HUMAN_REQUESTED',
                                    // HUMAN_TRANSFER → gerçek kişiye ata, AI aramasın
                                    // CALL (sonra arayın) → AI tekrar arasın
                                    ...(isHumanTransfer && assignedToId ? { assignedToId } : {}),
                                    ...(assignedTeamId ? { teamId: assignedTeamId } : {}),
                                    ...(isHumanTransfer ? {
                                        retellExcluded: true,   // AI bu görevi almasın
                                        fallbackToAi: false     // AI fallback kapalı
                                    } : {
                                        retellExcluded: false,   // AI arasın
                                        fallbackToAi: true       // AI devralabilir
                                    }),
                                    ...(transcriptCaseId ? { caseId: transcriptCaseId } : {}),
                                }
                            });

                            if (isHumanTransfer) {
                                console.log(`✅ [Retell Transcript] YÖNETİCİ ARAMA görevi oluşturuldu → ${assignedToId || 'atanmadı'}`);
                            } else {
                                console.log(`✅ [Retell Transcript] Otomatik ${actType} aktivitesi oluşturuldu`);
                            }

                            // Rule engine tetikle — takım ataması ve bildirimler için
                            if (actType === 'MEETING' || actType === 'VISIT') {
                                try {
                                    const { executeAppointmentPlanning } = await import('./rules.controller.js');
                                    executeAppointmentPlanning(callRecord.workspaceId, callRecord.contactId, 'RETELL_CALL', {
                                        topic: transcriptResult.rawRequest || 'AI Arama — Randevu Talebi',
                                        dateTime: dueDate
                                    }).catch(e => console.error('⚠️ [Retell] Appointment planning error:', e.message));
                                } catch(e) {}
                            } else if (actType === 'CALL' && !isHumanTransfer) {
                                try {
                                    const { executeAutoCallPlanning } = await import('./rules.controller.js');
                                    executeAutoCallPlanning(callRecord.workspaceId, callRecord.contactId, 'RETELL_CALL').catch(e =>
                                        console.error('⚠️ [Retell] Auto call planning error:', e.message)
                                    );
                                } catch(e) {}
                            }
                        }
                    }
                }
            } catch (transcriptErr) {
                console.error('⚠️ [Retell Transcript] Non-fatal analysis error:', transcriptErr.message);
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

        const teamAgentId = await getTeamAgentIdForContactOrConversation(workspaceId, contactId, null);
        const effectiveAgentId = agentId || teamAgentId || null;

        const scheduled = await prisma.scheduledCall.create({
            data: {
                workspaceId,
                contactId: contactId || null,
                contactName: contactName || null,
                toNumber: normalizePhone(toNumber),
                agentId: effectiveAgentId,
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
                status: 'PENDING'
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

                const dynVars = await buildRetellDynamicVariables(workspace.id, sc.contactId, sc.contactName);
                
                const callParams = {
                    from_number: workspace.retellFromNumber,
                    to_number: formattedTo,
                    override_agent_id: workspace.retellAgentId,
                    metadata: {
                        workspaceId: sc.workspaceId,
                        contactId: sc.contactId || null,
                        contactName: sc.contactName || null,
                        createdById: sc.createdById,
                        scheduledCallId: sc.id
                    }
                };
                
                if (Object.keys(dynVars).length > 0) {
                    callParams.retell_llm_dynamic_variables = dynVars;
                }

                const callResponse = await client.call.createPhoneCall(callParams);

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

                    // Varsayılan akış ataması (merkezi)
                    assignDefaultFunnel(workspaceId, conversation.id).catch(e => console.error('❌ [AutoFunnel] Retell error:', e.message));
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
            return res.status(400).json({ error: 'AI Arama API anahtarı yapılandırılmamış' });
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
                            // Always update direction from Retell source of truth
                            direction:     data.direction,
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

// Tek bir call_id'yi Retell'den çekip sisteme ekle
export const syncSingleCall = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { callId } = req.body;

        if (!callId) return res.status(400).json({ error: 'callId gerekli' });

        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { retellApiKey: true }
        });
        if (!workspace?.retellApiKey) return res.status(400).json({ error: 'AI Arama API anahtarı yapılandırılmamış' });

        const client = new Retell({ apiKey: workspace.retellApiKey });
        const call = await client.call.retrieve(callId);

        if (!call) return res.status(404).json({ error: 'Bu arama bulunamadı' });

        console.log(`🔄 [SingleSync] call_id=${callId} from=${call.from_number} to=${call.to_number}`);

        // Mevcut kaydı kontrol et
        const existing = await prisma.retellCall.findUnique({ where: { callId } });

        const fromNumber = call.from_number || '';
        const toNumber   = call.to_number || '';
        const duration   = call.duration_ms ? Math.round(call.duration_ms / 1000) : null;
        const isInbound  = call.direction === 'inbound';
        const lookupPhone = isInbound ? fromNumber : toNumber;

        // Kişiyi eşleştir
        let contactId = existing?.contactId || null;
        if (!contactId && lookupPhone) {
            const normalized = normalizePhone(lookupPhone);
            const contact = await prisma.contact.findFirst({
                where: {
                    workspaceId,
                    OR: [{ phone: normalized }, { phone: lookupPhone }, { phone: lookupPhone.replace(/\D/g, '') }]
                },
                select: { id: true }
            });
            if (contact) contactId = contact.id;
        }

        if (!contactId && lookupPhone) {
            const normalized = normalizePhone(lookupPhone) || lookupPhone;
            const newContact = await prisma.contact.create({
                data: { workspaceId, name: `Arayan: ${lookupPhone}`, phone: normalized, status: 'NEW_APPLICATION', category: 'NEW_APPLICATION' }
            });
            contactId = newContact.id;
            console.log(`📞 [SingleSync] Yeni kişi oluşturuldu: ${contactId}`);
        }

        const data = {
            workspaceId,
            callId,
            agentId: call.agent_id || '',
            fromNumber,
            toNumber,
            direction: call.direction || 'inbound',
            status: call.call_status === 'ended' ? 'ended' : call.call_status || 'ended',
            duration,
            transcript: call.transcript || null,
            recordingUrl: call.recording_url || null,
            summary: call.call_analysis?.call_summary || null,
            sentiment: call.call_analysis?.user_sentiment || null,
            callSuccessful: call.call_analysis?.call_successful ?? null,
            endedReason: call.disconnection_reason || null,
            cost: call.call_cost?.combined_cost ?? null,
            ...(contactId ? { contactId } : {}),
            ...(call.start_timestamp ? { createdAt: new Date(call.start_timestamp) } : {})
        };

        if (!existing) {
            await prisma.retellCall.create({ data: { ...data, createdById: '' } });
        } else {
            await prisma.retellCall.update({ where: { callId }, data: {
                status: data.status, duration, transcript: data.transcript,
                recordingUrl: data.recordingUrl, summary: data.summary, sentiment: data.sentiment,
                callSuccessful: data.callSuccessful, endedReason: data.endedReason, cost: data.cost,
                ...(contactId && !existing.contactId ? { contactId } : {})
            }});
        }

        // Konuşma ve transkript ekle
        await handleCallEnded(call).catch(e => console.error('[SingleSync] handleCallEnded:', e.message));
        if (call.call_analysis) {
            await handleCallAnalyzed(call).catch(e => console.error('[SingleSync] handleCallAnalyzed:', e.message));
        }

        console.log(`✅ [SingleSync] ${callId} başarıyla eklendi`);
        res.json({ success: true, callId, contactId, duration });
    } catch (err) {
        console.error('❌ [SingleSync] Hata:', err.message);
        res.status(500).json({ error: err.message });
    }
};

// ─── Agent Management ────────────────────────────────────────────────────────

/**
 * GET /:workspaceId/agents/:agentId
 * Tek agent'ın tüm detaylarını + LLM prompt'unu çek
 */
export const getAgent = async (req, res) => {
    try {
        const { workspaceId, agentId } = req.params;
        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { retellApiKey: true }
        });
        if (!workspace?.retellApiKey) return res.status(400).json({ error: 'AI Arama API anahtarı yapılandırılmamış' });

        const client = new Retell({ apiKey: workspace.retellApiKey });
        const agent = await client.agent.retrieve(agentId);

        // LLM bilgisini de çek (prompt için)
        let llm = null;
        if (agent.response_engine?.type === 'retell-llm' && agent.response_engine?.llm_id) {
            try {
                llm = await client.llm.retrieve(agent.response_engine.llm_id);
            } catch (e) {
                console.warn(`[RetellAgent] LLM retrieve failed: ${e.message}`);
            }
        }

        res.json({ agent, llm });
    } catch (error) {
        console.error('❌ [RetellAgent] getAgent error:', error.message);
        res.status(500).json({ error: error.message || 'Agent bilgisi alınamadı' });
    }
};

/**
 * PATCH /:workspaceId/agents/:agentId/prompt
 * Agent'ın LLM prompt'unu Instomer'dan güncelle → Retell'e push et
 */
export const updateAgentPrompt = async (req, res) => {
    try {
        const { workspaceId, agentId } = req.params;
        const {
            // LLM/Prompt
            generalPrompt, beginMessage,
            // Agent identity
            agentName,
            // Voice
            voiceId, voiceModel, fallbackVoiceIds,
            // Language
            language,
            // Behavior
            ambientSound, ambientSoundVolume,
            responsiveness,
            interruptionSensitivity,
            enableBackchannel, backchannelFrequency, backchannelWords,
            // Reminder
            reminderTriggerMs, reminderMaxCount,
            // Keywords
            boostedKeywords,
            // Call settings
            endCallAfterSilenceMs, maxCallDurationMs,
            beginMessageDelayMs,
            // Webhook
            webhookUrl, webhookEvents, webhookTimeoutMs,
            // Pronunciation
            pronunciationDictionary,
            // Post-call analysis
            postCallAnalysisData
        } = req.body;

        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { retellApiKey: true }
        });
        if (!workspace?.retellApiKey) return res.status(400).json({ error: 'AI Arama API anahtarı yapılandırılmamış' });

        const client = new Retell({ apiKey: workspace.retellApiKey });

        // ── Agent seviyesindeki güncelleme ──
        const agentUpdateData = {};

        // Identity
        if (agentName !== undefined) agentUpdateData.agent_name = agentName;

        // Voice
        if (voiceId !== undefined) agentUpdateData.voice_id = voiceId;
        if (voiceModel !== undefined) agentUpdateData.voice_model = voiceModel;
        if (fallbackVoiceIds !== undefined) agentUpdateData.fallback_voice_ids = fallbackVoiceIds;

        // Language
        if (language !== undefined) agentUpdateData.language = language;

        // Behavior
        if (ambientSound !== undefined) agentUpdateData.ambient_sound = ambientSound;
        if (ambientSoundVolume !== undefined) agentUpdateData.ambient_sound_volume = ambientSoundVolume;
        if (responsiveness !== undefined) agentUpdateData.responsiveness = responsiveness;
        if (interruptionSensitivity !== undefined) agentUpdateData.interruption_sensitivity = interruptionSensitivity;
        if (enableBackchannel !== undefined) agentUpdateData.enable_backchannel = enableBackchannel;
        if (backchannelFrequency !== undefined) agentUpdateData.backchannel_frequency = backchannelFrequency;
        if (backchannelWords !== undefined) agentUpdateData.backchannel_words = backchannelWords;

        // Reminder
        if (reminderTriggerMs !== undefined) agentUpdateData.reminder_trigger_ms = reminderTriggerMs;
        if (reminderMaxCount !== undefined) agentUpdateData.reminder_max_count = reminderMaxCount;

        // Keywords
        if (boostedKeywords !== undefined) agentUpdateData.boosted_keywords = boostedKeywords;

        // Call settings
        if (endCallAfterSilenceMs !== undefined) agentUpdateData.end_call_after_silence_ms = endCallAfterSilenceMs;
        if (maxCallDurationMs !== undefined) agentUpdateData.max_call_duration_ms = maxCallDurationMs;
        if (beginMessageDelayMs !== undefined) agentUpdateData.begin_message_delay_ms = beginMessageDelayMs;

        // Webhook
        if (webhookUrl !== undefined) agentUpdateData.webhook_url = webhookUrl;
        if (webhookEvents !== undefined) agentUpdateData.webhook_events = webhookEvents;
        if (webhookTimeoutMs !== undefined) agentUpdateData.webhook_timeout_ms = webhookTimeoutMs;

        // Pronunciation
        if (pronunciationDictionary !== undefined) agentUpdateData.pronunciation_dictionary = pronunciationDictionary;

        // Post-call analysis
        if (postCallAnalysisData !== undefined) agentUpdateData.post_call_analysis_data = postCallAnalysisData;

        let updatedAgent = null;
        if (Object.keys(agentUpdateData).length > 0) {
            updatedAgent = await client.agent.update(agentId, agentUpdateData);
        } else {
            updatedAgent = await client.agent.retrieve(agentId);
        }

        // ── LLM prompt güncellemesi ──
        let updatedLlm = null;
        if ((generalPrompt !== undefined || beginMessage !== undefined) &&
            updatedAgent.response_engine?.type === 'retell-llm' &&
            updatedAgent.response_engine?.llm_id) {

            const llmUpdateData = {};
            if (generalPrompt !== undefined) llmUpdateData.general_prompt = generalPrompt;
            if (beginMessage !== undefined) llmUpdateData.begin_message = beginMessage;

            updatedLlm = await client.llm.update(updatedAgent.response_engine.llm_id, llmUpdateData);
            console.log(`✅ [RetellAgent] LLM prompt updated for agent ${agentId}`);
        }

        console.log(`✅ [RetellAgent] Agent ${agentId} updated with ${Object.keys(agentUpdateData).length} params`);

        res.json({
            success: true,
            agent: updatedAgent,
            llm: updatedLlm,
            message: 'Agent başarıyla güncellendi'
        });
    } catch (error) {
        console.error('❌ [RetellAgent] updateAgentPrompt error:', error.message);
        res.status(500).json({ error: error.message || 'Agent güncellenemedi' });
    }
};

/**
 * GET /:workspaceId/knowledge-bases
 * Retell'deki mevcut KB listesi
 */
export const listKnowledgeBases = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { retellApiKey: true, retellKnowledgeBaseId: true }
        });
        if (!workspace?.retellApiKey) return res.status(400).json({ error: 'AI Arama API anahtarı yapılandırılmamış' });

        const client = new Retell({ apiKey: workspace.retellApiKey });
        const knowledgeBases = await client.knowledgeBase.list();

        let syncedKbText = '';
        if (workspace.retellKnowledgeBaseId) {
            try {
                const kb = await client.knowledgeBase.retrieve(workspace.retellKnowledgeBaseId);
                const source = kb.knowledge_base_sources?.[0];
                if (source && source.type === 'text' && source.content_url) {
                    const axios = (await import('axios')).default;
                    const result = await axios.get(source.content_url);
                    syncedKbText = typeof result.data === 'string' ? result.data : JSON.stringify(result.data);
                }
            } catch (e) {
                console.warn('⚠️ [RetellKB] KB text fetch failed (may be deleted):', e.message);
            }
        }

        res.json({
            knowledgeBases: knowledgeBases || [],
            syncedKbId: workspace.retellKnowledgeBaseId,
            syncedKbText
        });
    } catch (error) {
        console.error('❌ [RetellKB] listKnowledgeBases error:', error.message);
        res.status(500).json({ error: error.message || 'KB listesi alınamadı' });
    }
};

/**
 * POST /:workspaceId/knowledge-bases/sync
 * Instomer KB içeriklerini → Retell KB olarak push et
 * body: { agentId, instomerKbIds: ['kb_id1', 'kb_id2', ...] }
 *
 * Strateji (B): İlk sync → yeni KB oluştur, ID'yi workspace'e kaydet.
 * Sonraki sync → mevcut KB'nin kaynaklarını sil, yeniden ekle.
 */
export const syncKnowledgeBase = async (req, res) => {
    try {
        console.log('🔥 [RetellKB] === SYNC v3 START ===');
        const { workspaceId } = req.params;
        const { agentId, instomerKbIds = [] } = req.body;

        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { retellApiKey: true, retellKnowledgeBaseId: true, retellAgentId: true }
        });
        if (!workspace?.retellApiKey) return res.status(400).json({ error: 'AI Arama API anahtarı yapılandırılmamış' });

        const effectiveAgentId = agentId || workspace.retellAgentId;
        const apiKey = workspace.retellApiKey;

        // 1. Instomer KB içeriklerini çek
        const kbEntries = await prisma.knowledgeBase.findMany({
            where: {
                workspaceId,
                ...(instomerKbIds.length > 0 ? { id: { in: instomerKbIds } } : {})
            }
        });
        console.log(`📋 [RetellKB] Found ${kbEntries.length} KB entries`);

        if (kbEntries.length === 0) {
            return res.status(400).json({ error: 'Seçili bilgi bankası bulunamadı veya içerik yok' });
        }

        // 2. Her bilgiyi ayrı kaynak olarak hazırla
        const textsToAdd = kbEntries.map(kb => ({
            title: kb.title || 'Başlıksız',
            text: kb.content || ''
        })).filter(t => t.text.trim());
        console.log(`📋 [RetellKB] textsToAdd: ${textsToAdd.length} items`);

        if (textsToAdd.length === 0) {
            return res.status(400).json({ error: 'Bilgi bankasında içerik bulunamadı' });
        }

        let retellKbId = workspace.retellKnowledgeBaseId;

        // 3. Eski KB'yi sil (varsa)
        if (retellKbId) {
            try {
                console.log(`🗑️ [RetellKB] Step 3: Deleting old KB ${retellKbId}`);
                const delRes = await fetch(`https://api.retellai.com/delete-knowledge-base/${retellKbId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${apiKey}` }
                });
                console.log(`🗑️ [RetellKB] Delete status: ${delRes.status}`);
            } catch (e) {
                console.warn(`⚠️ [RetellKB] Delete failed: ${e.message}`);
            }
        }

        // 4+5. KB oluştur VE kaynakları birlikte ekle (Retell boş KB oluşturmaya izin vermiyor)
        console.log(`🆕 [RetellKB] Step 4+5: Creating KB with ${textsToAdd.length} sources...`);
        const form = new FormData();
        form.append('knowledge_base_name', 'Instomer KB');
        form.append('knowledge_base_texts', JSON.stringify(textsToAdd));

        const createRes = await fetch('https://api.retellai.com/create-knowledge-base', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}` },
            body: form
        });
        if (!createRes.ok) {
            const errText = await createRes.text();
            throw new Error(`KB create failed: ${createRes.status} ${errText}`);
        }
        const newKb = await createRes.json();
        retellKbId = newKb.knowledge_base_id;
        console.log(`✅ [RetellKB] Created KB ${retellKbId} with ${textsToAdd.length} sources`);

        // 6. KB id'sini workspace'e kaydet
        await prisma.workspace.update({
            where: { id: workspaceId },
            data: { retellKnowledgeBaseId: retellKbId }
        });

        // 7. Agent'a bağla
        if (effectiveAgentId) {
            try {
                const client = new Retell({ apiKey });
                const agent = await client.agent.retrieve(effectiveAgentId);
                const existingKbIds = agent.knowledge_base_ids || [];
                const updatedKbIds = [...new Set([...existingKbIds, retellKbId])];
                await client.agent.update(effectiveAgentId, { knowledge_base_ids: updatedKbIds });
                console.log(`✅ [RetellKB] KB linked to agent`);
            } catch (agentErr) {
                console.warn(`⚠️ [RetellKB] Agent link failed: ${agentErr.message}`);
            }
        }

        console.log('🔥 [RetellKB] === SYNC v3 COMPLETE ===');
        res.json({
            success: true,
            knowledgeBaseId: retellKbId,
            sourceCount: textsToAdd.length,
            message: `${textsToAdd.length} bilgi ayrı ayrı Retell'e sync edildi`
        });
    } catch (error) {
        console.error('❌ [RetellKB] syncKnowledgeBase error:', error.message);
        res.status(500).json({ error: error.message || 'KB sync başarısız' });
    }
};

/**
 * PATCH /:workspaceId/agents/:agentId/knowledge-bases
 * Agent'a belirli Retell KB ID'lerini bağla
 */
export const updateAgentKnowledgeBases = async (req, res) => {
    try {
        const { workspaceId, agentId } = req.params;
        const { knowledgeBaseIds = [] } = req.body;

        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { retellApiKey: true }
        });
        if (!workspace?.retellApiKey) return res.status(400).json({ error: 'AI Arama API anahtarı yapılandırılmamış' });

        const client = new Retell({ apiKey: workspace.retellApiKey });
        const updated = await client.agent.update(agentId, {
            knowledge_base_ids: knowledgeBaseIds
        });

        res.json({ success: true, agent: updated });
    } catch (error) {
        console.error('❌ [RetellKB] updateAgentKnowledgeBases error:', error.message);
        res.status(500).json({ error: error.message || 'KB bağlantısı güncellenemedi' });
    }
};

/**
 * GET /:workspaceId/knowledge-bases/instomer
 * Instomer KB'lerini retellKbId'leriyle listele (Agent Manager'da Instomer kaynaklı KB'leri göstermek için)
 */
export const listInstomerKnowledgeBases = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const entries = await prisma.knowledgeBase.findMany({
            where: { workspaceId },
            select: { id: true, title: true, sourceType: true, retellKbId: true, updatedAt: true },
            orderBy: { createdAt: 'desc' }
        });
        res.json({ entries });
    } catch (error) {
        console.error('listInstomerKnowledgeBases error:', error.message);
        res.status(500).json({ error: 'Bilgi bankası listesi alınamadı' });
    }
};

/**
 * GET /:workspaceId/voices
 * Kullanılabilir seslerin tam listesi
 */
export const listVoices = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { retellApiKey: true }
        });
        if (!workspace?.retellApiKey) return res.status(400).json({ error: 'API key yapılandırılmamış' });

        const client = new Retell({ apiKey: workspace.retellApiKey });
        const voices = await client.voice.list();

        // Sesleri kategorize et
        const categorized = {
            turkish: [],
            english: [],
            other: []
        };

        for (const voice of voices || []) {
            const v = {
                voice_id: voice.voice_id,
                voice_name: voice.voice_name,
                gender: voice.gender,
                provider: voice.provider,
                accent: voice.accent || null,
                age: voice.age || null,
                preview_audio_url: voice.preview_audio_url || null
            };
            
            // Türkçe sesleri öne al
            if (voice.accent?.toLowerCase().includes('turk') || 
                voice.voice_name?.toLowerCase().includes('turk') ||
                voice.voice_id?.toLowerCase().includes('turk')) {
                categorized.turkish.push(v);
            } else if (voice.accent?.toLowerCase().includes('english') || 
                       voice.accent?.toLowerCase().includes('american') ||
                       voice.accent?.toLowerCase().includes('british')) {
                categorized.english.push(v);
            } else {
                categorized.other.push(v);
            }
        }

        res.json({
            total: (voices || []).length,
            voices: voices || [],
            categorized
        });
    } catch (error) {
        console.error('❌ [Voice] listVoices error:', error.message);
        res.status(500).json({ error: error.message || 'Sesler listelenemedi' });
    }
};

/**
 * GET /:workspaceId/voices/search
 * Ses sağlayıcılarından topluluk sesleri ara
 */
export const searchVoices = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { provider = 'elevenlabs', query } = req.query;

        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { retellApiKey: true }
        });
        if (!workspace?.retellApiKey) return res.status(400).json({ error: 'API key yapılandırılmamış' });

        const client = new Retell({ apiKey: workspace.retellApiKey });
        const result = await client.voice.search({ voice_provider: provider });

        // Eğer query varsa filtrele
        let voices = result?.voices || result || [];
        if (query && Array.isArray(voices)) {
            const q = query.toLowerCase();
            voices = voices.filter(v => 
                v.voice_name?.toLowerCase().includes(q) ||
                v.accent?.toLowerCase().includes(q) ||
                v.provider_voice_id?.toLowerCase().includes(q)
            );
        }

        res.json({ voices: Array.isArray(voices) ? voices.slice(0, 50) : [] });
    } catch (error) {
        console.error('❌ [Voice] searchVoices error:', error.message);
        res.status(500).json({ error: error.message || 'Ses araması başarısız' });
    }
};

// ─── Agent Create / Delete ───────────────────────────────────────────────────

/**
 * POST /:workspaceId/agents
 * Yeni agent oluştur
 */
export const createAgent = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const {
            agentName, voiceId, language = 'tr-TR',
            generalPrompt, beginMessage,
            ambientSound, responsiveness = 0.5,
            webhookUrl
        } = req.body;

        if (!voiceId) return res.status(400).json({ error: 'Ses seçimi (voiceId) gerekli' });

        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { retellApiKey: true }
        });
        if (!workspace?.retellApiKey) return res.status(400).json({ error: 'API key yapılandırılmamış' });

        const client = new Retell({ apiKey: workspace.retellApiKey });

        // 1. LLM oluştur
        const llm = await client.llm.create({
            general_prompt: generalPrompt || 'Sen yardımcı bir asistansın.',
            begin_message: beginMessage || 'Merhaba, size nasıl yardımcı olabilirim?'
        });

        // 2. Agent oluştur
        const agentData = {
            agent_name: agentName || 'Yeni AI Ses Agent',
            voice_id: voiceId,
            language,
            response_engine: {
                type: 'retell-llm',
                llm_id: llm.llm_id
            },
            responsiveness
        };
        if (ambientSound) agentData.ambient_sound = ambientSound;
        if (webhookUrl) agentData.webhook_url = webhookUrl;

        const agent = await client.agent.create(agentData);

        // Yeni agent'a workspace'in tüm mevcut KB'lerini otomatik bağla
        try {
            const existingKbs = await prisma.knowledgeBase.findMany({
                where: { workspaceId, retellKbId: { not: null } },
                select: { retellKbId: true }
            });
            const kbIds = existingKbs.map(kb => kb.retellKbId).filter(Boolean);
            if (kbIds.length > 0) {
                await client.agent.update(agent.agent_id, {
                    knowledge_base_ids: kbIds
                });
                console.log(`🔗 [Agent] Auto-bound ${kbIds.length} KBs to new agent ${agent.agent_id}`);
            }
        } catch (kbErr) {
            console.warn(`⚠️ [Agent] Could not auto-bind KBs to new agent:`, kbErr.message);
        }

        console.log(`✅ [Agent] Created new agent: ${agent.agent_id} (${agentName})`);

        res.json({
            success: true,
            agent,
            llm,
            message: `AI Ses Agent "${agentName}" başarıyla oluşturuldu`
        });
    } catch (error) {
        console.error('❌ [Agent] createAgent error:', error.message);
        res.status(500).json({ error: error.message || 'Agent oluşturulamadı' });
    }
};

/**
 * DELETE /:workspaceId/agents/:agentId
 * Agent'ı sil
 */
export const deleteAgent = async (req, res) => {
    try {
        const { workspaceId, agentId } = req.params;

        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { retellApiKey: true, retellAgentId: true }
        });
        if (!workspace?.retellApiKey) return res.status(400).json({ error: 'API key yapılandırılmamış' });

        // Varsayılan agent silinmesin
        if (workspace.retellAgentId === agentId) {
            return res.status(400).json({ error: 'Varsayılan agent silinemez. Önce başka bir agent\'ı varsayılan yapın.' });
        }

        const client = new Retell({ apiKey: workspace.retellApiKey });
        await client.agent.delete(agentId);

        console.log(`🗑️ [Agent] Deleted agent: ${agentId}`);
        res.json({ success: true, message: 'Agent silindi' });
    } catch (error) {
        console.error('❌ [Agent] deleteAgent error:', error.message);
        res.status(500).json({ error: error.message || 'Agent silinemedi' });
    }
};

/**
 * GET /:workspaceId/knowledge-bases/retell
 * Retell'deki tüm KB'leri dosyalarıyla listele
 */
export const listRetellKnowledgeBases = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { retellApiKey: true }
        });
        if (!workspace?.retellApiKey) return res.status(400).json({ error: 'AI Arama API anahtarı yapılandırılmamış' });

        const client = new Retell({ apiKey: workspace.retellApiKey });
        const kbList = await client.knowledgeBase.list();

        const kbsWithSources = await Promise.all((kbList || []).map(async (kb) => {
            try {
                const detail = await client.knowledgeBase.retrieve(kb.knowledge_base_id);
                return {
                    knowledge_base_id: kb.knowledge_base_id,
                    knowledge_base_name: kb.knowledge_base_name,
                    created_at: kb.created_at,
                    sources: detail.knowledge_base_sources || []
                };
            } catch {
                return {
                    knowledge_base_id: kb.knowledge_base_id,
                    knowledge_base_name: kb.knowledge_base_name,
                    created_at: kb.created_at,
                    sources: []
                };
            }
        }));

        res.json({ knowledgeBases: kbsWithSources });
    } catch (error) {
        console.error('❌ [RetellKB] listRetellKnowledgeBases error:', error.message);
        res.status(500).json({ error: error.message || 'KB listesi alınamadı' });
    }
};

/**
 * POST /:workspaceId/knowledge-bases/retell
 * Yeni KB oluştur — body: { name }
 */
export const createRetellKnowledgeBase = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { name } = req.body;
        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { retellApiKey: true }
        });
        if (!workspace?.retellApiKey) return res.status(400).json({ error: 'API key yapılandırılmamış' });

        const client = new Retell({ apiKey: workspace.retellApiKey });
        const kb = await client.knowledgeBase.create({
            knowledge_base_name: name || `KB — ${new Date().toLocaleDateString('tr-TR')}`
        });
        res.json({ success: true, knowledgeBase: kb });
    } catch (error) {
        console.error('❌ [RetellKB] createRetellKnowledgeBase error:', error.message);
        res.status(500).json({ error: error.message || 'KB oluşturulamadı' });
    }
};

/**
 * DELETE /:workspaceId/knowledge-bases/retell/:kbId
 * KB sil
 */
export const deleteRetellKnowledgeBase = async (req, res) => {
    try {
        const { workspaceId, kbId } = req.params;
        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { retellApiKey: true }
        });
        if (!workspace?.retellApiKey) return res.status(400).json({ error: 'API key yapılandırılmamış' });

        const client = new Retell({ apiKey: workspace.retellApiKey });
        await client.knowledgeBase.delete(kbId);
        res.json({ success: true });
    } catch (error) {
        console.error('❌ [RetellKB] deleteRetellKnowledgeBase error:', error.message);
        res.status(500).json({ error: error.message || 'KB silinemedi' });
    }
};

/**
 * POST /:workspaceId/knowledge-bases/retell/:kbId/sources
 * KB'ye metin veya URL kaynağı ekle — body: { type, title?, text?, url? }
 * Retell API multipart/form-data istiyor
 */
export const addRetellKBSource = async (req, res) => {
    try {
        const { workspaceId, kbId } = req.params;
        const { type = 'text', title, text, url } = req.body;
        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { retellApiKey: true }
        });
        if (!workspace?.retellApiKey) return res.status(400).json({ error: 'API key yapılandırılmamış' });

        const form = new FormData();
        if (type === 'text') {
            form.append('knowledge_base_texts', JSON.stringify([{ title: title || 'Metin', text: text || '' }]));
        } else if (type === 'url') {
            form.append('knowledge_base_urls', JSON.stringify([url]));
        }

        const axios = (await import('axios')).default;
        const response = await axios.post(
            `https://api.retellai.com/add-knowledge-base-sources/${kbId}`,
            form,
            {
                headers: {
                    'Authorization': `Bearer ${workspace.retellApiKey}`,
                    ...form.getHeaders?.() || {}
                }
            }
        );
        res.json({ success: true, knowledgeBase: response.data });
    } catch (error) {
        const respData = error.response?.data;
        const errMsg = respData?.message || respData?.error || error.message || 'Kaynak eklenemedi';
        console.error('❌ [RetellKB] addRetellKBSource error:', errMsg, 'data:', JSON.stringify(respData));
        res.status(error.response?.status || 500).json({ error: errMsg });
    }
};

/**
 * POST /:workspaceId/knowledge-bases/retell/:kbId/upload
 * KB'ye dosya yükle — Retell API multipart/form-data bekliyor
 * Desteklenen: .txt .md .csv .pdf .docx .doc
 */
export const uploadRetellKBFile = async (req, res) => {
    try {
        const { workspaceId, kbId } = req.params;
        const file = req.file;
        if (!file) return res.status(400).json({ error: 'Dosya bulunamadı' });

        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { retellApiKey: true }
        });
        if (!workspace?.retellApiKey) return res.status(400).json({ error: 'API key yapılandırılmamış' });

        const originalName = file.originalname || 'file';
        const ext = originalName.split('.').pop().toLowerCase();
        const mime = file.mimetype || 'application/octet-stream';

        let textContent = '';

        if (ext === 'pdf' || mime === 'application/pdf') {
            try {
                const parser = new PDFParse({ data: file.buffer });
                const result = await parser.getText();
                textContent = result.text || '';
                await parser.destroy();
                if (!textContent.trim()) return res.status(400).json({ error: 'PDF içeriği boş veya okunamadı' });
            } catch (e) {
                return res.status(400).json({ error: `PDF okunamadı: ${e.message}` });
            }
        } else if (['docx', 'doc'].includes(ext) || mime.includes('wordprocessingml') || mime.includes('msword')) {
            try {
                const result = await mammoth.extractRawText({ buffer: file.buffer });
                textContent = result.value || '';
                if (!textContent.trim()) return res.status(400).json({ error: 'DOCX içeriği boş veya okunamadı' });
            } catch (e) {
                return res.status(400).json({ error: `DOCX okunamadı: ${e.message}` });
            }
        } else {
            textContent = file.buffer.toString('utf-8');
            if (!textContent.trim()) return res.status(400).json({ error: 'Dosya içeriği boş' });
        }

        // Retell API multipart/form-data istiyor (cURL --form ile)
        const form = new FormData();
        form.append('knowledge_base_texts', JSON.stringify([{ title: originalName, text: textContent }]));

        const axios = (await import('axios')).default;
        const response = await axios.post(
            `https://api.retellai.com/add-knowledge-base-sources/${kbId}`,
            form,
            {
                headers: {
                    'Authorization': `Bearer ${workspace.retellApiKey}`,
                    ...form.getHeaders?.() || {}
                }
            }
        );

        console.log(`✅ [RetellKB] Uploaded "${originalName}" to KB ${kbId}`);
        res.json({ success: true, knowledgeBase: response.data, fileName: originalName });
    } catch (error) {
        const respData = error.response?.data;
        const errMsg = respData?.message || respData?.error || respData?.error_message || error.message || 'Dosya yüklenemedi';
        console.error('❌ [RetellKB] uploadRetellKBFile error:', errMsg, 'status:', error.response?.status, 'data:', JSON.stringify(respData));
        res.status(error.response?.status || 500).json({ error: errMsg });
    }
};

/**
 * DELETE /:workspaceId/knowledge-bases/retell/:kbId/sources/:sourceId
 * KB'den belirli kaynağı sil
 */
export const deleteRetellKBSource = async (req, res) => {
    try {
        const { workspaceId, kbId, sourceId } = req.params;
        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { retellApiKey: true }
        });
        if (!workspace?.retellApiKey) return res.status(400).json({ error: 'API key yapılandırılmamış' });

        const client = new Retell({ apiKey: workspace.retellApiKey });
        // SDK v5: deleteSource(sourceId, { knowledge_base_id: kbId })
        await client.knowledgeBase.deleteSource(sourceId, { knowledge_base_id: kbId });
        res.json({ success: true });
    } catch (error) {
        console.error('❌ [RetellKB] deleteRetellKBSource error:', error.message);
        res.status(500).json({ error: error.message || 'Kaynak silinemedi' });
    }
};
