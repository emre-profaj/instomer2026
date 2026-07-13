import prisma from '../lib/prisma.js';
import { emitToWorkspace } from '../socket.js';
import { executeHotOpportunityEmailRule } from './rules.controller.js';
import { normalizePhone } from '../utils/phoneNormalizer.js';
import { ensureCaseForConversation } from './case.controller.js';
import { evaluateAndApplyRules } from '../services/stageRuleEngine.service.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

// ─── AI Topic Classification Cache ─────────────────────────────
// Cache key: workspaceId + hash of topic list, expires in 10 minutes
const topicClassificationCache = new Map();
const TOPIC_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

/**
 * AI-powered topic classification: takes raw aiTopic strings and groups semantically similar ones
 * Returns a mapping: { "raw topic" => "canonical category name" }
 * Has a 5-second timeout to prevent blocking the analytics response.
 */
async function classifyTopicsWithAI(workspaceId, rawTopics) {
    if (!rawTopics || rawTopics.length === 0) return null;
    
    // Create a cache key from sorted topic list
    const sortedTopics = [...rawTopics].sort();
    const cacheKey = workspaceId + ':' + sortedTopics.join('|').substring(0, 500);
    const cached = topicClassificationCache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
        return cached.data;
    }

    // Wrap AI call in a 5-second timeout — if it takes longer, return null
    // and let the background job cache it for next time
    try {
        const result = await Promise.race([
            _doClassifyTopics(workspaceId, rawTopics, cacheKey),
            new Promise((_, reject) => setTimeout(() => reject(new Error('AI_TIMEOUT')), 5000))
        ]);
        return result;
    } catch (e) {
        if (e.message === 'AI_TIMEOUT') {
            console.warn('⏱️ [TopicAI] Classification timed out (5s), returning raw topics. Will cache in background.');
            // Fire-and-forget: let it finish in background for next request
            _doClassifyTopics(workspaceId, rawTopics, cacheKey).catch(() => {});
        } else {
            console.error('AI topic classification error (non-fatal):', e.message);
        }
        return null;
    }
}

async function _doClassifyTopics(workspaceId, rawTopics, cacheKey) {
    // Get AI API key for workspace
    const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { aiApiKey: true }
    });
    let aiApiKey = workspace?.aiApiKey;
    if (!aiApiKey) {
        const globalSettings = await prisma.globalSettings.findUnique({ where: { id: 'singleton' } });
        aiApiKey = globalSettings?.globalAiApiKey;
    }
    if (!aiApiKey) return null;

    const genAI = new GoogleGenerativeAI(aiApiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const topicListText = rawTopics.map((t, i) => `${i + 1}. ${t}`).join('\n');

    const prompt = `Sen bir müşteri talep sınıflandırma uzmanısın. Aşağıda bir CRM sistemindeki müşteri taleplerinin konu başlıkları var. 
Bunların birçoğu aslında aynı konuyu farklı şekillerde ifade ediyor.

GÖREV: Her konu başlığını standart bir kategori adıyla eşleştir. Semantik olarak aynı anlama gelen konuları aynı kategoriye koy.

KURALLAR:
- Kategori adları kısa ve net olsun (2-4 kelime). 
- Türkçe karakter kullan.
- "talebi", "bilgisi", "hakkında bilgi", "randevusu" gibi ekleri kaldırarak özünü yakala.
- "Merhaba", "Bilgi", "İletişim" gibi genel/belirsiz konuları "Genel Bilgi Talebi" kategorisine koy.
- Sonucu SADECE JSON formatında döndür, başka bir şey yazma.

KONU BAŞLIKLARI:
${topicListText}

ÇIKTI FORMATI (sadece JSON):
{"mapping": {"orijinal konu 1": "Kategori Adı", "orijinal konu 2": "Kategori Adı", ...}}`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    
    // Parse JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    
    const parsed = JSON.parse(jsonMatch[0]);
    const mapping = parsed.mapping || parsed;

    // Cache the result
    topicClassificationCache.set(cacheKey, { data: mapping, expiry: Date.now() + TOPIC_CACHE_TTL });
    console.log(`🤖 [TopicAI] Classified ${rawTopics.length} topics into ${new Set(Object.values(mapping)).size} categories for workspace ${workspaceId}`);
    
    return mapping;
}

// ─── Turkey Timezone Helpers (UTC+3) ───────────────────────────
const TZ_OFFSET_MS = 3 * 60 * 60 * 1000; // Turkey is UTC+3

/** Parse "YYYY-MM-DD" or ISO timestamp → start of that day in Turkey timezone (as UTC Date) */
function parseDateStartTR(dateStr) {
    // Handle ISO timestamp format (e.g., "2026-06-15T14:14:00.017Z") — extract date part only
    const dateOnly = String(dateStr).includes('T') ? String(dateStr).split('T')[0] : dateStr;
    const d = new Date(dateOnly + 'T00:00:00.000Z');
    if (isNaN(d.getTime())) return new Date(); // fallback to now if invalid
    return new Date(d.getTime() - TZ_OFFSET_MS);
}

/** Parse "YYYY-MM-DD" or ISO timestamp → end of that day (23:59:59.999) in Turkey timezone (as UTC Date) */
function parseDateEndTR(dateStr) {
    const dateOnly = String(dateStr).includes('T') ? String(dateStr).split('T')[0] : dateStr;
    const d = new Date(dateOnly + 'T00:00:00.000Z');
    if (isNaN(d.getTime())) return new Date(); // fallback to now if invalid
    return new Date(d.getTime() - TZ_OFFSET_MS + 24 * 60 * 60 * 1000 - 1);
}

// ─── Team Filter Helper ───────────────────────────────────────
/**
 * Get user IDs for a given team. Returns null if no teamId provided.
 * Used to filter analytics/performance data by team membership.
 */
async function getTeamUserIds(teamId) {
    if (!teamId) return null;
    const members = await prisma.teamMember.findMany({
        where: { teamId, userId: { not: null } },
        select: { userId: true }
    });
    return members.map(m => m.userId);
}

// ─── Legacy status → funnel stage migration ───────────────────
// Maps old contact.status values to stage names in "Satış Akışı" funnel
const STATUS_TO_STAGE_NAME = {
    'OPPORTUNITY':            'Fırsat',
    'HOT_OPPORTUNITY':        'Sıcak Fırsat',
    'UNREACHABLE':            'Ulaşılamadı',
    'OFFER_GIVEN':            'Teklif Aşaması',
    'NEGOTIATION':            'Teklif Aşaması',
    'APPOINTMENT_SCHEDULED':  'Görüşme Planlandı',
    'CALLBACK':               'Fırsat',
    'CONTRACT':               'Teklif Aşaması',
    'SALE_COMPLETED':         'Satış',
    'LOST':                   'Kayıp',
    'NOT_INTERESTED':         'Kayıp',
    'NEW':                    'Yeni Başvuru',
    'INFO_GIVEN':             'Bilgi Verildi',
};
const migratedWorkspaces = new Set();

async function migrateStatusToFunnelStage(workspaceId) {
    if (migratedWorkspaces.has(workspaceId)) return;
    migratedWorkspaces.add(workspaceId);

    try {
        // Find the "Satış Akışı" funnel with stages
        const satisAkisi = await prisma.funnel.findFirst({
            where: { workspaceId, name: 'Satış Akışı' },
            include: { stages: true }
        });

        if (!satisAkisi || !satisAkisi.stages?.length) {
            console.log(`⚠️ [Migration] No "Satış Akışı" funnel found for workspace ${workspaceId}`);
            return;
        }

        // Collect all valid stage IDs across ALL funnels in this workspace
        const allFunnels = await prisma.funnel.findMany({
            where: { workspaceId },
            include: { stages: { select: { id: true } } }
        });
        const allValidStageIds = new Set();
        for (const f of allFunnels) {
            for (const s of (f.stages || [])) {
                allValidStageIds.add(s.id);
            }
        }

        // --- CASE 1: Contacts with no funnelStageId (use status to assign) ---
        const noStageContacts = await prisma.contact.findMany({
            where: {
                workspaceId,
                funnelStageId: null,
                status: { not: 'NEW' }  // NEW is default, only migrate meaningful statuses
            },
            select: { id: true, status: true, name: true }
        });

        // --- CASE 2: Contacts with orphaned funnelStageId (stage was deleted) ---
        const allContactsWithStage = await prisma.contact.findMany({
            where: {
                workspaceId,
                funnelStageId: { not: null }
            },
            select: { id: true, status: true, name: true, funnelStageId: true }
        });
        const orphanedContacts = allContactsWithStage.filter(c => !allValidStageIds.has(c.funnelStageId));

        const totalToFix = noStageContacts.length + orphanedContacts.length;
        if (totalToFix === 0) return;

        console.log(`🔄 [Migration] Found ${noStageContacts.length} contacts without stage, ${orphanedContacts.length} with orphaned stage (workspace: ${workspaceId})`);

        let migratedCount = 0;

        // Fix both cases
        const allToFix = [
            ...noStageContacts.map(c => ({ ...c, reason: 'no_stage' })),
            ...orphanedContacts.map(c => ({ ...c, reason: 'orphaned' }))
        ];

        for (const contact of allToFix) {
            const targetStageName = STATUS_TO_STAGE_NAME[contact.status];
            // Default to "Fırsat" if status doesn't map
            const stage = satisAkisi.stages.find(s => s.name === (targetStageName || 'Fırsat'));
            if (!stage) continue;

            await prisma.contact.update({
                where: { id: contact.id },
                data: { funnelStageId: stage.id }
            });
            migratedCount++;
        }

        if (migratedCount > 0) {
            console.log(`✅ [Migration] Migrated ${migratedCount}/${totalToFix} contacts to funnel stages`);
        }
    } catch (err) {
        console.error('⚠️ [Migration] Status→FunnelStage migration error:', err.message);
    }
}

// Get all contacts in a workspace
export const getContacts = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { search, status, source, category, tag, contactInfo, importGroup, callStatus, showArchived, funnelType, funnelTypes, funnelStageId, assignmentFilter, sortField = 'createdAt', sortDir = 'desc', limit = 50, offset = 0, dateFilter, dateFrom, dateTo, onlyOpenCases, tzOffset } = req.query;
        const { role } = req.workspaceMember;

        // Auto-migrate legacy status → funnel stage (runs once per workspace)
        migrateStatusToFunnelStage(workspaceId).catch(() => {});

        console.log(`🔍 [Get Contacts] START - Workspace: ${workspaceId}, Role: ${role}, Status: ${status || 'ALL'}, Source: ${source || 'ALL'}, Category: ${category || 'ALL'}, Tag: ${tag || 'ALL'}, ShowArchived: ${showArchived || 'false'}`);

        // Build base conversation filter for this workspace
        let conversationFilter = { workspaceId: workspaceId };

        // AGENT role: only see contacts from their assigned conversations + team pool
        if (role === 'AGENT') {
            // Get agent's team IDs
            const userTeams = await prisma.teamMember.findMany({
                where: { userId: req.user.id },
                select: { teamId: true }
            });
            const myTeamIds = userTeams.map(t => t.teamId);

            // Filter: assigned to me OR (in my team AND not assigned to anyone)
            conversationFilter = {
                workspaceId: workspaceId,
                OR: [
                    { assignedToId: req.user.id },
                    ...myTeamIds.map(tid => ({
                        AND: [
                            { teamIds: { contains: `"${tid}"` } },
                            { assignedToId: null }
                        ]
                    }))
                ]
            };
            console.log(`   AGENT filter applied - User: ${req.user.id}, Teams: ${myTeamIds.length}`);
        }

        // Build where clause based on role
        let where;
        if (role === 'AGENT') {
            // AGENT: only see contacts that have conversations assigned to them or their teams
            where = {
                conversations: {
                    some: conversationFilter
                }
            };
        } else {
            // ADMIN/OWNER: see all contacts - either via conversations or directly assigned to workspace
            where = {
                OR: [
                    {
                        conversations: {
                            some: conversationFilter
                        }
                    },
                    {
                        workspaceId: workspaceId
                    }
                ]
            };
        }

        // If source filter is MANUAL, only show contacts without conversations
        if (source === 'MANUAL') {
            where = {
                workspaceId: workspaceId,
                conversations: {
                    none: {}
                }
            };
        }

        // Add status filter if provided
        if (status && status !== 'ALL') {
            where = {
                AND: [
                    where,
                    { status: status }
                ]
            };
        }

        // Add category filter if provided
        if (category && category !== 'ALL') {
            where = {
                AND: [
                    where,
                    { category: category }
                ]
            };
        }

        // Add tag filter if provided
        if (tag && tag !== 'ALL') {
            where = {
                AND: [
                    where,
                    { tags: { contains: tag } }
                ]
            };
        }

        // Add importGroup filter if provided
        if (importGroup && importGroup !== 'ALL') {
            where = {
                AND: [
                    where,
                    { importGroup: importGroup }
                ]
            };
        }


        // Add funnel/stage filter — filter directly on Contact model
        if (funnelStageId && funnelStageId !== 'ALL') {
            where = { 
                AND: [
                    where, 
                    { funnelStageId: funnelStageId }
                ] 
            };
        } else if (funnelTypes && funnelTypes !== 'ALL') {
            // Multi-funnel: comma-separated IDs → OR filter
            const ids = funnelTypes.split(',').map(id => id.trim()).filter(Boolean);
            const funnels = await prisma.funnel.findMany({
                where: { id: { in: ids } }
            });
            const names = funnels.map(f => f.name).filter(Boolean);
            const allTerms = [...ids, ...names];
            if (allTerms.length > 0) {
                where = { AND: [where, { OR: allTerms.map(term => ({ funnelType: term })) }] };
            }
        } else if (funnelType && funnelType !== 'ALL') {
            const funnel = await prisma.funnel.findFirst({
                where: { id: funnelType }
            });
            const names = funnel ? [funnelType, funnel.name] : [funnelType];
            where = { 
                AND: [
                    where, 
                    { OR: names.map(term => ({ funnelType: term })) }
                ] 
            };
        }

        // Add date filter (createdAt) — use client timezone offset
        if (dateFilter && dateFilter !== 'ALL') {
            // tzOffset = minutes from UTC (e.g. -180 for UTC+3)
            const offsetMs = tzOffset ? parseInt(tzOffset, 10) * 60 * 1000 : 0;
            // "now" in user's local timezone
            const nowLocal = new Date(Date.now() - offsetMs);
            let gte, lte;
            if (dateFilter === 'TODAY') {
                gte = new Date(Date.UTC(nowLocal.getUTCFullYear(), nowLocal.getUTCMonth(), nowLocal.getUTCDate()));
                gte = new Date(gte.getTime() + offsetMs);
                lte = new Date(gte.getTime() + 24 * 60 * 60 * 1000 - 1);
            } else if (dateFilter === 'YESTERDAY') {
                gte = new Date(Date.UTC(nowLocal.getUTCFullYear(), nowLocal.getUTCMonth(), nowLocal.getUTCDate() - 1));
                gte = new Date(gte.getTime() + offsetMs);
                lte = new Date(gte.getTime() + 24 * 60 * 60 * 1000 - 1);
            } else if (dateFilter === 'WEEK') {
                // Monday to Sunday (ISO week) in user's timezone
                const day = nowLocal.getUTCDay(); // 0=Sun, 1=Mon, ...
                const diffToMonday = day === 0 ? 6 : day - 1;
                gte = new Date(Date.UTC(nowLocal.getUTCFullYear(), nowLocal.getUTCMonth(), nowLocal.getUTCDate() - diffToMonday));
                gte = new Date(gte.getTime() + offsetMs);
                lte = new Date(gte.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
            } else if (dateFilter === 'MONTH') {
                gte = new Date(Date.UTC(nowLocal.getUTCFullYear(), nowLocal.getUTCMonth(), 1));
                gte = new Date(gte.getTime() + offsetMs);
                const lastDay = new Date(Date.UTC(nowLocal.getUTCFullYear(), nowLocal.getUTCMonth() + 1, 0));
                lte = new Date(lastDay.getTime() + offsetMs + 24 * 60 * 60 * 1000 - 1);
            } else if (dateFilter === 'LAST_WEEK') {
                const day = nowLocal.getUTCDay();
                const diffToMonday = day === 0 ? 6 : day - 1;
                const thisMonday = new Date(Date.UTC(nowLocal.getUTCFullYear(), nowLocal.getUTCMonth(), nowLocal.getUTCDate() - diffToMonday));
                gte = new Date(thisMonday.getTime() - 7 * 24 * 60 * 60 * 1000);
                gte = new Date(gte.getTime() + offsetMs);
                lte = new Date(gte.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
            } else if (dateFilter === 'LAST_MONTH') {
                gte = new Date(Date.UTC(nowLocal.getUTCFullYear(), nowLocal.getUTCMonth() - 1, 1));
                gte = new Date(gte.getTime() + offsetMs);
                const lastDay = new Date(Date.UTC(nowLocal.getUTCFullYear(), nowLocal.getUTCMonth(), 0));
                lte = new Date(lastDay.getTime() + offsetMs + 24 * 60 * 60 * 1000 - 1);
            } else if (dateFilter === 'YEAR') {
                gte = new Date(Date.UTC(nowLocal.getUTCFullYear(), 0, 1));
                gte = new Date(gte.getTime() + offsetMs);
                lte = new Date(Date.UTC(nowLocal.getUTCFullYear(), 11, 31));
                lte = new Date(lte.getTime() + offsetMs + 24 * 60 * 60 * 1000 - 1);
            } else if (dateFilter === 'LAST_YEAR') {
                gte = new Date(Date.UTC(nowLocal.getUTCFullYear() - 1, 0, 1));
                gte = new Date(gte.getTime() + offsetMs);
                lte = new Date(Date.UTC(nowLocal.getUTCFullYear() - 1, 11, 31));
                lte = new Date(lte.getTime() + offsetMs + 24 * 60 * 60 * 1000 - 1);
            } else if (dateFilter === 'CUSTOM') {
                if (dateFrom) { gte = parseDateStartTR(dateFrom); }
                if (dateTo)   { lte = parseDateEndTR(dateTo); }
            }
            if (gte || lte) {
                const createdAtFilter = {};
                if (gte) createdAtFilter.gte = gte;
                if (lte) createdAtFilter.lte = lte;
                where = { AND: [where, { createdAt: createdAtFilter }] };
                console.log(`   DateFilter '${dateFilter}' applied: ${gte?.toISOString()} → ${lte?.toISOString()}`);
            }
        }

        // Assignment filter (pool/mine/unassigned/team_ID/user_ID) — filters by conversation assignment
        if (assignmentFilter && assignmentFilter !== 'all') {
            // Get user's team IDs for pool filter
            const userTeams = await prisma.teamMember.findMany({
                where: { userId: req.user.id },
                select: { teamId: true }
            });
            const myTeamIds = userTeams.map(t => t.teamId);

            if (assignmentFilter === 'mine') {
                // Contacts with conversations assigned to me
                where = {
                    AND: [
                        where,
                        {
                            conversations: {
                                some: {
                                    workspaceId,
                                    assignedToId: req.user.id
                                }
                            }
                        }
                    ]
                };
                console.log(`   AssignmentFilter: MINE (userId: ${req.user.id})`);
            } else if (assignmentFilter === 'unassigned') {
                // Contacts with conversations that have no assignedToId AND no team
                where = {
                    AND: [
                        where,
                        {
                            conversations: {
                                some: {
                                    workspaceId,
                                    assignedToId: null
                                }
                            }
                        }
                    ]
                };
                console.log(`   AssignmentFilter: UNASSIGNED`);
            } else if (assignmentFilter === 'pool') {
                // Contacts in my teams + unassigned + assigned to me
                const teamConditions = myTeamIds.map(tid => ({
                    teamIds: { contains: `"${tid}"` }
                }));

                where = {
                    AND: [
                        where,
                        {
                            conversations: {
                                some: {
                                    workspaceId,
                                    OR: [
                                        { assignedToId: req.user.id },
                                        { assignedToId: null },
                                        ...teamConditions
                                    ]
                                }
                            }
                        }
                    ]
                };
                console.log(`   AssignmentFilter: POOL (teams: ${myTeamIds.length})`);
            } else if (assignmentFilter.startsWith('team_')) {
                // Filter by specific team: show contacts assigned to this team (pool + all members)
                const teamId = assignmentFilter.replace('team_', '');
                // Get all member userIds of this team
                const teamMembers = await prisma.teamMember.findMany({
                    where: { teamId },
                    select: { userId: true }
                });
                const memberUserIds = teamMembers.map(m => m.userId).filter(Boolean);

                const orConditions = [
                    // Conversations assigned to this team (pool)
                    { teamIds: { contains: `"${teamId}"` } },
                    { assignedTeamId: teamId }
                ];
                // Also include conversations assigned to any member of this team
                if (memberUserIds.length > 0) {
                    orConditions.push({ assignedToId: { in: memberUserIds } });
                }

                where = {
                    AND: [
                        where,
                        {
                            conversations: {
                                some: {
                                    workspaceId,
                                    OR: orConditions
                                }
                            }
                        }
                    ]
                };
                console.log(`   AssignmentFilter: TEAM (teamId: ${teamId}, members: ${memberUserIds.length})`);
            } else if (assignmentFilter.startsWith('user_')) {
                // Filter by specific user
                const userId = assignmentFilter.replace('user_', '');
                where = {
                    AND: [
                        where,
                        {
                            conversations: {
                                some: {
                                    workspaceId,
                                    assignedToId: userId
                                }
                            }
                        }
                    ]
                };
                console.log(`   AssignmentFilter: USER (userId: ${userId})`);
            }
        }

        // Add search filter if provided
        if (search) {
            where = {
                AND: [
                    where,
                    {
                        OR: [
                            { name: { contains: search, mode: 'insensitive' } },
                            { phone: { contains: search } },
                            { email: { contains: search, mode: 'insensitive' } }
                        ]
                    }
                ]
            };
        }

        // Filter by archived status - hide archived by default
        if (showArchived !== 'true') {
            where = {
                AND: [
                    where,
                    { isArchived: false }
                ]
            };
        }

        // Always hide soft-deleted contacts
        where = {
            AND: [
                where,
                { isDeleted: false }
            ]
        };

        // ── "Sadece Aktifleri Göster" / onlyOpenCases filter ──
        // Exclude contacts whose funnelStageId is a closing stage (isClosing=true or has statusType)
        // This must be applied BEFORE the statsWhere snapshot so pill counts match the visible list.
        if (onlyOpenCases === 'true' || onlyOpenCases === undefined) {
            // Fetch all closing stage IDs for this workspace
            const closingStages = await prisma.funnelStage.findMany({
                where: {
                    funnel: { workspaceId },
                    OR: [
                        { isClosing: true },
                        { statusType: { not: null } }
                    ]
                },
                select: { id: true }
            });
            const closingStageIds = closingStages.map(s => s.id);
            if (closingStageIds.length > 0) {
                where = {
                    AND: [
                        where,
                        {
                            OR: [
                                { funnelStageId: null },
                                { funnelStageId: { notIn: closingStageIds } }
                            ]
                        }
                    ]
                };
            }
        }

        // ── Snapshot for Quick Stats: captures all filters EXCEPT contactInfo & callStatus ──
        // Deep clone that preserves Date objects (JSON.parse/stringify breaks Dates,
        // and direct reference fails because Prisma may mutate the where during query execution)
        function deepCloneWhere(obj) {
            if (obj === null || typeof obj !== 'object') return obj;
            if (obj instanceof Date) return new Date(obj.getTime());
            if (Array.isArray(obj)) return obj.map(deepCloneWhere);
            const result = {};
            for (const key of Object.keys(obj)) {
                result[key] = deepCloneWhere(obj[key]);
            }
            return result;
        }
        const statsWhere = deepCloneWhere(where);

        // Add contactInfo filter (phone/email presence) — applied AFTER statsWhere snapshot
        if (contactInfo && contactInfo !== 'ALL') {
            if (contactInfo === 'HAS_PHONE') {
                where = {
                    AND: [
                        where,
                        { phone: { not: null } },
                        { NOT: { phone: '' } }
                    ]
                };
            } else if (contactInfo === 'HAS_EMAIL') {
                where = {
                    AND: [
                        where,
                        { email: { not: null } },
                        { NOT: { email: '' } }
                    ]
                };
            } else if (contactInfo === 'HAS_BOTH') {
                where = {
                    AND: [
                        where,
                        { phone: { not: null } },
                        { NOT: { phone: '' } },
                        { email: { not: null } },
                        { NOT: { email: '' } }
                    ]
                };
            } else if (contactInfo === 'NO_PHONE') {
                where = {
                    AND: [
                        where,
                        { OR: [{ phone: null }, { phone: '' }] }
                    ]
                };
            } else if (contactInfo === 'NO_EMAIL') {
                where = {
                    AND: [
                        where,
                        { OR: [{ email: null }, { email: '' }] }
                    ]
                };
            }
        }

        // Filter by call status
        if (callStatus && callStatus !== 'ALL') {
            if (callStatus === 'ended') {
                // Agent Aramaları: contacts with phone numbers who have human calls
                const humanCalledActivities = await prisma.contactActivity.findMany({
                    where: {
                        workspaceId,
                        type: 'CALL',
                        status: 'COMPLETED',
                        contact: {
                            phone: { not: '' },
                            NOT: { phone: null },
                            isDeleted: false,
                            isArchived: false
                        }
                    },
                    select: { contactId: true },
                    distinct: ['contactId']
                });
                const matchedIds = humanCalledActivities.map(a => a.contactId).filter(Boolean);
                where = {
                    AND: [
                        where,
                        { id: { in: matchedIds } }
                    ]
                };
            } else if (callStatus === 'ai_called') {
                // AI Aramaları: contacts with phone numbers who have AI calls
                const contactsWithPhone = await prisma.contact.findMany({
                    where: {
                        workspaceId,
                        phone: { not: '' },
                        NOT: { phone: null },
                        isDeleted: false,
                        isArchived: false
                    },
                    select: { id: true }
                });
                const contactIdsWithPhone = contactsWithPhone.map(c => c.id);

                const aiCalls = await prisma.retellCall.findMany({
                    where: {
                        workspaceId,
                        contactId: { in: contactIdsWithPhone }
                    },
                    select: { contactId: true },
                    distinct: ['contactId']
                });
                const matchedIds = aiCalls.map(c => c.contactId).filter(Boolean);
                where = {
                    AND: [
                        where,
                        { id: { in: matchedIds } }
                    ]
                };
            } else if (callStatus === 'no_call') {
                // İletişim Yok: contacts with phone numbers who have NOT been called by humans
                const humanCalledActivities = await prisma.contactActivity.findMany({
                    where: {
                        workspaceId,
                        type: 'CALL',
                        status: 'COMPLETED'
                    },
                    select: { contactId: true },
                    distinct: ['contactId']
                });
                const calledIds = humanCalledActivities.map(a => a.contactId).filter(Boolean);
                where = {
                    AND: [
                        where,
                        { phone: { not: '' }, NOT: { phone: null } },
                        { id: { notIn: calledIds } }
                    ]
                };
            } else {
                // Handle fallback retellCall status if needed (e.g. not_connected, positive, negative)
                let callWhere = { workspaceId };
                if (callStatus === 'not_connected') {
                    callWhere.status = 'not_connected';
                } else if (callStatus === 'positive') {
                    callWhere.sentiment = 'Positive';
                } else if (callStatus === 'negative') {
                    callWhere.sentiment = 'Negative';
                }

                const matchingCalls = await prisma.retellCall.findMany({
                    where: callWhere,
                    select: { contactId: true },
                    distinct: ['contactId']
                });
                const matchedIds = matchingCalls.map(c => c.contactId).filter(Boolean);

                if (matchedIds.length === 0) {
                    return res.json({ contacts: [], total: 0, allImportGroups: [], allTags: [] });
                }

                where = {
                    AND: [
                        where,
                        { id: { in: matchedIds } }
                    ]
                };
            }
            console.log(`   CallStatus filter '${callStatus}' applied`);
        }

        // Helper function to add source field and message dates
        const enrichContactWithSource = (contact) => {
            const channels = contact.conversations?.map(c => c.channel) || [];
            // DB'deki source sadece anlamlı bir değerse kullan
            // MANUAL veya null ise → en eski conversation channel'ını tercih et
            const MEANINGFUL_SOURCES = ['FACEBOOK_LEAD', 'WEB_FORM', 'FORM', 'WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'EMAIL', 'WIDGET', 'LEAD'];
            const dbSource = contact.source || null;
            const hasMeaningfulSource = dbSource && MEANINGFUL_SOURCES.includes(dbSource.toUpperCase());
            let contactSource = hasMeaningfulSource ? dbSource : null;

            let firstMessageAt = null;
            let lastMessageAt = null;

            if (contact.conversations?.length > 0) {
                const createdDates = contact.conversations
                    .map(c => c.createdAt)
                    .filter(d => d != null);
                if (createdDates.length > 0) {
                    firstMessageAt = new Date(Math.min(...createdDates.map(d => new Date(d).getTime())));
                }

                const lastMsgDates = contact.conversations
                    .map(c => c.lastMessageAt || c.createdAt)
                    .filter(d => d != null);
                if (lastMsgDates.length > 0) {
                    lastMessageAt = new Date(Math.max(...lastMsgDates.map(d => new Date(d).getTime())));
                }

                // Anlamlı DB source yoksa → en eski conversation'ın channel'ını kullan
                if (!contactSource) {
                    const sortedByCreated = [...contact.conversations].sort(
                        (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
                    );
                    contactSource = sortedByCreated[0]?.channel || 'MANUAL';
                }
            }

            if (!contactSource) contactSource = 'MANUAL';

            // Get topic: prioritize last active case title, fallback to conversation aiTopic
            const lastActiveCase = contact.cases
                ?.filter(c => c.status === 'ACTIVE')
                ?.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
                ?.[0];
            const GENERIC_CASE_TITLES = ['💬 WhatsApp', '💬 Facebook', '💬 Instagram', '📧 E-posta', '📞 Telefon', '🌐 Web Widget', '📝 Form', 'Yeni İletişim', 'Yeni Case', 'LEAD'];
            const rawCaseTopic = lastActiveCase?.title || null;
            // Generic kanal etiketi case title'larını atla
            const caseTopic = (rawCaseTopic && !GENERIC_CASE_TITLES.includes(rawCaseTopic.trim()) && rawCaseTopic.trim().toUpperCase() !== 'LEAD') ? rawCaseTopic : null;
            // Generic source labels that should NOT be used as topic
            const GENERIC_LABELS = ['form', 'web widget', 'web_widget', 'whatsapp', 'instagram', 'facebook', 'messenger', 'email', 'manual', 'lead'];
            let rawConvAiTopic = contact.conversations
                ?.filter(c => c.aiTopic)
                ?.sort((a, b) => new Date(b.lastMessageAt || b.createdAt) - new Date(a.lastMessageAt || a.createdAt))
                ?.[0]?.aiTopic || null;
            // If aiTopic is a generic source label, treat it as null
            const convAiTopic = (rawConvAiTopic && GENERIC_LABELS.includes(rawConvAiTopic.trim().toLowerCase())) ? null : rawConvAiTopic;
            // Fallback: extract topic from classificationData if aiTopic is missing
            let classificationTopic = null;
            if (!convAiTopic) {
                const sortedConvs = contact.conversations
                    ?.filter(c => c.classificationData)
                    ?.sort((a, b) => new Date(b.lastMessageAt || b.createdAt) - new Date(a.lastMessageAt || a.createdAt));
                if (sortedConvs?.length > 0) {
                    try {
                        const classData = JSON.parse(sortedConvs[0].classificationData);
                        classificationTopic = classData?.extractedData?.topic || classData?.topic || null;
                    } catch (e) { /* ignore parse error */ }
                }
            }
            // Fallback: use first customer message content from the earliest conversation
            let firstMessageTopic = null;
            if (!caseTopic && !convAiTopic && !classificationTopic) {
                const sortedConvsForMsg = contact.conversations
                    ?.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
                for (const conv of (sortedConvsForMsg || [])) {
                    const firstMsg = conv.messages?.[0];
                    if (firstMsg?.content) {
                        // Truncate long messages to 60 chars
                        firstMessageTopic = firstMsg.content.length > 60
                            ? firstMsg.content.substring(0, 60) + '...'
                            : firstMsg.content;
                        break;
                    }
                }
            }
            const aiTopic = caseTopic || convAiTopic || classificationTopic || firstMessageTopic;

            // Build lastNote from: 1) Planned activity, 2) Last completed activity, 3) Last manual note
            let lastNote = null;
            let lastNoteType = null;

            // 1) Check for planned activities (upcoming calls, meetings)
            const plannedActivity = contact.activities?.find(a => a.status === 'PLANNED');
            if (plannedActivity) {
                const typeLabels = { CALL: '📞 Arama', MEETING: '🤝 Toplantı', VISIT: '📍 Ziyaret', TASK: '📋 Görev', REMINDER: '⏰ Hatırlatıcı' };
                const typeLabel = typeLabels[plannedActivity.type] || '📌 Planlı';
                const dateStr = plannedActivity.dueDate ? new Date(plannedActivity.dueDate).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) : '';
                lastNote = `${typeLabel}: ${plannedActivity.title || plannedActivity.description || ''} ${dateStr}`.trim();
                lastNoteType = 'planned';
            }

            // 2) If no planned, get last completed activity
            if (!lastNote) {
                const completedActivity = contact.activities?.find(a => a.status !== 'PLANNED');
                if (completedActivity) {
                    const typeLabels = { CALL: '📞', MEETING: '🤝', VISIT: '📍', NOTE: '📝', TASK: '✅', REMINDER: '⏰' };
                    const icon = typeLabels[completedActivity.type] || '📌';
                    lastNote = `${icon} ${completedActivity.result || completedActivity.title || completedActivity.description || ''}`.trim();
                    lastNoteType = 'activity';
                }
            }

            // 3) If no activity, fall back to manual notes
            if (!lastNote && contact.notes) {
                try {
                    const notesArray = JSON.parse(contact.notes);
                    if (Array.isArray(notesArray) && notesArray.length > 0) {
                        const latest = notesArray[notesArray.length - 1];
                        lastNote = `📝 ${latest.title ? latest.title + ': ' : ''}${latest.content || ''}`;
                        lastNoteType = 'note';
                    }
                } catch {
                    lastNote = `📝 ${contact.notes}`;
                    lastNoteType = 'note';
                }
            }

            // Build active case info for display
            // Case'de atama yoksa, bağlı konuşmadan atama bilgisini çek
            let caseAssignedToId = lastActiveCase?.assignedToId || null;
            let caseAssignedTeamId = lastActiveCase?.assignedTeamId || null;
            let caseAssignedToName = lastActiveCase?.assignedTo?.name || null;

            if (lastActiveCase && !caseAssignedToId && !caseAssignedTeamId) {
                // Case'e bağlı konuşmayı bul
                const caseConv = (contact.conversations || []).find(cv => cv.caseId === lastActiveCase.id);
                if (caseConv) {
                    caseAssignedToId = caseConv.assignedToId || null;
                    caseAssignedTeamId = caseConv.assignedTeamId || (() => {
                        try { return JSON.parse(caseConv.teamIds || '[]')[0] || null; } catch { return null; }
                    })();
                    caseAssignedToName = caseConv.assignedTo?.name || null;
                } else if (contact.conversations?.length > 0) {
                    // Case'e bağlı konuşma bulunamazsa en son konuşmayı kullan
                    const lastConv = [...contact.conversations].sort((a, b) =>
                        new Date(b.lastMessageAt || b.createdAt) - new Date(a.lastMessageAt || a.createdAt)
                    )[0];
                    caseAssignedToId = lastConv.assignedToId || null;
                    caseAssignedTeamId = lastConv.assignedTeamId || (() => {
                        try { return JSON.parse(lastConv.teamIds || '[]')[0] || null; } catch { return null; }
                    })();
                    caseAssignedToName = lastConv.assignedTo?.name || null;
                }
            }
            // Funnel: Case'den, yoksa conversation'dan
            let caseFunnelStageId = lastActiveCase?.funnelStageId || null;
            let caseFunnelType = lastActiveCase?.funnelType || null;

            if (lastActiveCase && !caseFunnelStageId) {
                const caseConvForFunnel = (contact.conversations || []).find(cv => cv.caseId === lastActiveCase.id);
                if (caseConvForFunnel) {
                    caseFunnelStageId = caseConvForFunnel.funnelStageId || null;
                    caseFunnelType = caseConvForFunnel.funnelType || caseFunnelType;
                }
            }

            const activeCase = lastActiveCase ? {
                id: lastActiveCase.id,
                caseNumber: lastActiveCase.caseNumber || null,
                title: lastActiveCase.title || null,
                status: lastActiveCase.status || null,
                funnelStageId: caseFunnelStageId,
                funnelType: caseFunnelType,
                assignedToId: caseAssignedToId,
                assignedTeamId: caseAssignedTeamId,
                assignedToName: caseAssignedToName,
                assignedTo: lastActiveCase.assignedTo || null
            } : null;

            // DEBUG: activeCase veri izleme (TÜM kişiler)
            if (lastActiveCase) {
                console.log(`🔍 [CASE-DEBUG] ${contact.name} → case#${lastActiveCase.caseNumber}, assignedTo: ${JSON.stringify(lastActiveCase.assignedTo)}, assignedToId: ${lastActiveCase.assignedToId}, assignedTeamId: ${lastActiveCase.assignedTeamId}, caseAssignedToName: ${caseAssignedToName}, funnelStageId: ${lastActiveCase.funnelStageId}`);
            }

            return {
                ...contact,
                source: contactSource,
                channels: [...new Set(channels)],
                firstMessageAt,
                lastMessageAt,
                aiTopic,
                activeCase,
                lastNote: lastNote ? (lastNote.length > 80 ? lastNote.substring(0, 80) + '...' : lastNote) : null,
                lastNoteType
            };
        };

        // Check if source filter is applied (not 'ALL')
        const hasSourceFilter = source && source !== 'ALL';

        let finalContacts = [];
        let totalCount = 0;

        // Check if Case and ContactActivity models exist in Prisma client to avoid 500 errors
        const hasCasesModel = !!prisma.case;
        const hasActivitiesModel = !!prisma.contactActivity;

        if (hasSourceFilter) {
            // SOURCE FILTER ACTIVE: Fetch ALL contacts, filter by source, then paginate at app level
            // This ensures consistent page sizes (e.g., always 15 per page)
            const allContacts = await prisma.contact.findMany({
                where,
                include: {
                    _count: {
                        select: { conversations: true }
                    },
                    conversations: {
                        where: { workspaceId: workspaceId },
                        select: {
                            id: true,
                            channel: true,
                            createdAt: true,
                            lastMessageAt: true,
                            aiTopic: true,
                            classificationData: true,
                            teamIds: true,
                            assignedTeamId: true,
                            assignedToId: true,
                            caseId: true,
                            funnelStageId: true,
                            funnelType: true,
                            assignedTo: {
                                select: {
                                    id: true,
                                    name: true
                                }
                            },
                            messages: {
                                where: { isFromContact: true },
                                select: { content: true },
                                orderBy: { createdAt: 'asc' },
                                take: 1
                            }
                        },
                        orderBy: { createdAt: 'asc' }
                    },
                    ...(hasCasesModel ? {
                        cases: {
                            where: { workspaceId: workspaceId },
                            select: {
                                id: true,
                                caseNumber: true,
                                title: true,
                                status: true,
                                funnelStageId: true,
                                funnelType: true,
                                createdAt: true,
                                updatedAt: true,
                                assignedToId: true,
                                assignedTeamId: true,
                                assignedTo: {
                                    select: {
                                        id: true,
                                        name: true
                                    }
                                }
                            },
                            orderBy: { updatedAt: 'desc' },
                            take: 3
                        }
                    } : {}),
                    ...(hasActivitiesModel ? {
                        activities: {
                            where: { workspaceId: workspaceId },
                            orderBy: { createdAt: 'desc' },
                            take: 5,
                            select: {
                                type: true,
                                title: true,
                                description: true,
                                result: true,
                                status: true,
                                dueDate: true,
                                createdAt: true,
                                assignedByType: true,
                                source: true,
                                assignee: { select: { name: true } },
                                creator: { select: { name: true } }
                            }
                        }
                    } : {})
                },
                orderBy: ['name', 'company', 'status', 'createdAt'].includes(sortField)
                    ? { [sortField]: sortDir }
                    : { createdAt: 'desc' }
                // NO take/skip here - we get all and paginate after filtering
            });

            // Enrich with source info
            const allContactsWithSource = allContacts.map(enrichContactWithSource);

            // Apply source filter
            let filteredContacts;
            if (source === 'MANUAL') {
                filteredContacts = allContactsWithSource.filter(c =>
                    c.source === 'MANUAL' || c.channels.length === 0
                );
            } else {
                filteredContacts = allContactsWithSource.filter(c =>
                    c.source === source
                );
            }

            // Sort by computed fields if needed
            if (['firstMessageAt', 'lastMessageAt'].includes(sortField)) {
                filteredContacts.sort((a, b) => {
                    const aVal = a[sortField] ? new Date(a[sortField]).getTime() : 0;
                    const bVal = b[sortField] ? new Date(b[sortField]).getTime() : 0;
                    return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
                });
            }

            // Get total BEFORE pagination
            totalCount = filteredContacts.length;

            // Apply pagination at application level
            const parsedLimit = parseInt(limit);
            const parsedOffset = parseInt(offset);
            finalContacts = filteredContacts.slice(parsedOffset, parsedOffset + parsedLimit);

            console.log(`✅ [Get Contacts] Source filter '${source}' -> ${totalCount} total, showing ${finalContacts.length} (offset: ${parsedOffset})`);
        } else {
            // NO SOURCE FILTER: Use normal DB pagination
            const contacts = await prisma.contact.findMany({
                where,
                include: {
                    _count: {
                        select: { conversations: true }
                    },
                    conversations: {
                        where: { workspaceId: workspaceId },
                        select: {
                            id: true,
                            channel: true,
                            createdAt: true,
                            lastMessageAt: true,
                            aiTopic: true,
                            classificationData: true,
                            teamIds: true,
                            assignedTeamId: true,
                            assignedToId: true,
                            caseId: true,
                            funnelStageId: true,
                            funnelType: true,
                            assignedTo: {
                                select: {
                                    id: true,
                                    name: true
                                }
                            },
                            messages: {
                                where: { isFromContact: true },
                                select: { content: true },
                                orderBy: { createdAt: 'asc' },
                                take: 1
                            }
                        },
                        orderBy: { createdAt: 'asc' }
                    },
                    ...(hasCasesModel ? {
                        cases: {
                            where: { workspaceId: workspaceId },
                            select: {
                                id: true,
                                caseNumber: true,
                                title: true,
                                status: true,
                                funnelStageId: true,
                                funnelType: true,
                                createdAt: true,
                                updatedAt: true,
                                assignedToId: true,
                                assignedTeamId: true,
                                assignedTo: {
                                    select: {
                                        id: true,
                                        name: true
                                    }
                                }
                            },
                            orderBy: { updatedAt: 'desc' },
                            take: 3
                        }
                    } : {}),
                    ...(hasActivitiesModel ? {
                        activities: {
                            where: { workspaceId: workspaceId },
                            orderBy: { createdAt: 'desc' },
                            take: 5,
                            select: {
                                type: true,
                                title: true,
                                description: true,
                                result: true,
                                status: true,
                                dueDate: true,
                                createdAt: true,
                                assignedByType: true,
                                source: true,
                                assignee: { select: { name: true } },
                                creator: { select: { name: true } }
                            }
                        }
                    } : {})
                },
                orderBy: ['name', 'company', 'status', 'createdAt'].includes(sortField)
                    ? { [sortField]: sortDir }
                    : { createdAt: 'desc' },
                take: ['firstMessageAt', 'lastMessageAt'].includes(sortField) ? undefined : parseInt(limit),
                skip: ['firstMessageAt', 'lastMessageAt'].includes(sortField) ? undefined : parseInt(offset)
            });

            finalContacts = contacts.map(enrichContactWithSource);

            // Sort by computed fields if needed (firstMessageAt / lastMessageAt)
            if (['firstMessageAt', 'lastMessageAt'].includes(sortField)) {
                finalContacts.sort((a, b) => {
                    const aVal = a[sortField] ? new Date(a[sortField]).getTime() : 0;
                    const bVal = b[sortField] ? new Date(b[sortField]).getTime() : 0;
                    return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
                });
                // Manual pagination since we fetched all
                totalCount = finalContacts.length;
                const parsedLimit = parseInt(limit);
                const parsedOffset = parseInt(offset);
                finalContacts = finalContacts.slice(parsedOffset, parsedOffset + parsedLimit);
            } else {
                totalCount = await prisma.contact.count({ where });
            }

            console.log(`✅ [Get Contacts] No source filter -> ${totalCount} total, showing ${finalContacts.length}`);
        }

        // Fetch all distinct import groups
        const allContactsForGroups = await prisma.contact.findMany({
            where: { workspaceId, isArchived: false, importGroup: { not: null } },
            select: { importGroup: true },
            distinct: ['importGroup']
        });
        const allImportGroups = allContactsForGroups
            .map(c => c.importGroup)
            .filter(Boolean)
            .sort();

        // Fetch all distinct tags (filtered)
        const allContactsForTags = await prisma.contact.findMany({
            where: { workspaceId, isArchived: false },
            select: { tags: true }
        });
        const allTags = new Set();
        allContactsForTags.forEach(c => {
            try {
                const tags = JSON.parse(c.tags || '[]');
                tags.forEach(t => {
                    if (t && !t.startsWith('v_') && t.length > 2) allTags.add(t);
                });
            } catch { }
        });

        // ── Quick Stats (uses statsWhere which inherits ALL active filters except contactInfo & callStatus) ──

        // Fetch contacts matching statsWhere + has phone to query their calls/activities
        const matchingContacts = await prisma.contact.findMany({
            where: {
                AND: [
                    statsWhere,
                    { phone: { not: '' } },
                    { NOT: { phone: null } }
                ]
            },
            select: { id: true }
        });
        const contactIdsWithPhone = matchingContacts.map(c => c.id);

        const retellCallWhere = {
            workspaceId,
            contactId: { in: contactIdsWithPhone }
        };
        const humanCallWhere = {
            workspaceId,
            type: 'CALL',
            status: 'COMPLETED',
            contactId: { in: contactIdsWithPhone }
        };

        const hasRetellModel = !!prisma.retellCall;
        const [periodCount, withPhoneCount, retellCalledIds, humanCalledIds, totalAllTime, funnelCountsRaw, noPhoneCount] = await Promise.all([
            prisma.contact.count({ where: statsWhere }),
            prisma.contact.count({ where: { AND: [statsWhere, { phone: { not: '' } }, { NOT: { phone: null } }] } }),
            // 1) Retell AI calls — distinct contacts
            hasRetellModel && contactIdsWithPhone.length > 0 ? prisma.retellCall.findMany({
                where: retellCallWhere,
                select: { contactId: true },
                distinct: ['contactId']
            }) : Promise.resolve([]),
            // 2) Human / manual completed calls (ContactActivity type=CALL)
            hasActivitiesModel && contactIdsWithPhone.length > 0 ? prisma.contactActivity.findMany({
                where: humanCallWhere,
                select: { contactId: true },
                distinct: ['contactId']
            }) : Promise.resolve([]),
            // totalAllTime
            prisma.contact.count({ where: statsWhere }),
            prisma.contact.groupBy({
                by: ['funnelType'],
                where: statsWhere,
                _count: {
                    _all: true
                }
            }),
            // "Numarasız Başvurular" count — contacts without a phone number
            prisma.contact.count({
                where: {
                    AND: [
                        statsWhere,
                        { OR: [{ phone: null }, { phone: '' }] }
                    ]
                }
            })
        ]);
        // Deduplicate: each contact counted at most once
        const uniqueHumanCalledSet = new Set(humanCalledIds.map(r => r.contactId).filter(Boolean));
        const uniqueAiCalledSet = new Set(retellCalledIds.map(r => r.contactId).filter(Boolean));
        const agentCalledCount = uniqueHumanCalledSet.size;
        const aiCalledCount = uniqueAiCalledSet.size;
        // noActivityCount = contacts with phone numbers that have never been called by agents (human)
        const noActivityCount = Math.max(0, withPhoneCount - agentCalledCount);

        const funnelCounts = {};
        let nullOrGenelCount = 0;

        // Resolve all funnelType values to actual funnel records for proper ID/name mapping
        const uniqueFunnelTypes = funnelCountsRaw.map(item => item.funnelType).filter(Boolean);
        let funnelLookup = {};
        if (uniqueFunnelTypes.length > 0) {
            const funnelRecords = await prisma.funnel.findMany({
                where: {
                    workspaceId,
                    OR: [
                        { id: { in: uniqueFunnelTypes } },
                        { name: { in: uniqueFunnelTypes } }
                    ]
                }
            });
            funnelRecords.forEach(f => {
                funnelLookup[f.id] = f;
                funnelLookup[f.name] = f;
            });
        }

        funnelCountsRaw.forEach(item => {
            const fType = item.funnelType;
            const count = item._count?._all || 0;
            if (!fType || fType === 'Genel') {
                nullOrGenelCount += count;
            } else {
                const resolved = funnelLookup[fType];
                if (resolved) {
                    funnelCounts[resolved.id] = (funnelCounts[resolved.id] || 0) + count;
                    funnelCounts[resolved.name] = (funnelCounts[resolved.name] || 0) + count;
                } else {
                    nullOrGenelCount += count;
                }
            }
        });
        funnelCounts['Genel'] = nullOrGenelCount;

        // Stage-level counts (grouped by funnelStageId)
        const funnelStageCountsRaw = await prisma.contact.groupBy({
            by: ['funnelStageId'],
            where: statsWhere,
            _count: { _all: true }
        });
        const funnelStageCounts = {};
        funnelStageCountsRaw.forEach(item => {
            if (item.funnelStageId) {
                funnelStageCounts[item.funnelStageId] = item._count?._all || 0;
            }
        });




        res.json({ contacts: finalContacts, total: totalCount, allImportGroups, allTags: Array.from(allTags).sort(), quickStats: { periodCount, withPhoneCount, agentCalledCount, aiCalledCount, noActivityCount, totalAllTime, funnelCounts, funnelStageCounts, noPhoneCount } });
    } catch (error) {
        console.error('Get contacts error:', error?.message || error);
        console.error('Get contacts error stack:', error?.stack);
        // Fallback: try a minimal query without optional relations
        try {
            const { workspaceId } = req.params;
            const limit = req.query.limit || 100;
            const offset = req.query.offset || 0;
            console.log('⚠️ [Get Contacts] Attempting fallback query without cases/activities...');
            const contacts = await prisma.contact.findMany({
                where: { workspaceId, isArchived: false, isDeleted: false },
                include: {
                    _count: { select: { conversations: true } },
                    conversations: {
                        where: { workspaceId },
                        select: {
                            id: true,
                            channel: true,
                            createdAt: true,
                            lastMessageAt: true,
                            aiTopic: true,
                            classificationData: true,
                            teamIds: true,
                            assignedTeamId: true,
                            assignedTo: { select: { id: true, name: true } },
                            messages: {
                                where: { isFromContact: true },
                                select: { content: true },
                                orderBy: { createdAt: 'asc' },
                                take: 1
                            }
                        },
                        orderBy: { createdAt: 'asc' }
                    }
                },
                orderBy: { createdAt: 'desc' },
                take: parseInt(limit),
                skip: parseInt(offset)
            });
            const totalCount = await prisma.contact.count({ where: { workspaceId, isArchived: false, isDeleted: false } });
            const withPhoneCount = await prisma.contact.count({ where: { workspaceId, isArchived: false, isDeleted: false, AND: [{ phone: { not: null } }, { phone: { not: '' } }] } });

            const GENERIC_LABELS = ['form', 'web widget', 'web_widget', 'whatsapp', 'instagram', 'facebook', 'messenger', 'email', 'manual'];
            const finalContacts = contacts.map(c => {
                // Source
                const source = c.conversations?.length > 0
                    ? (c.conversations[0].channel === 'WHATSAPP' ? 'WHATSAPP'
                        : c.conversations[0].channel === 'INSTAGRAM' ? 'INSTAGRAM'
                        : c.conversations[0].channel === 'FACEBOOK' ? 'FACEBOOK'
                        : c.conversations[0].channel === 'EMAIL' ? 'EMAIL'
                        : c.conversations[0].channel === 'WIDGET' ? 'WIDGET'
                        : 'MANUAL')
                    : 'MANUAL';

                // Topic extraction (same logic as enrichContactWithSource)
                let rawConvAiTopic = c.conversations
                    ?.filter(cv => cv.aiTopic)
                    ?.sort((a, b) => new Date(b.lastMessageAt || b.createdAt) - new Date(a.lastMessageAt || a.createdAt))
                    ?.[0]?.aiTopic || null;
                const convAiTopic = (rawConvAiTopic && GENERIC_LABELS.includes(rawConvAiTopic.trim().toLowerCase())) ? null : rawConvAiTopic;

                let classificationTopic = null;
                if (!convAiTopic) {
                    const sortedConvs = c.conversations
                        ?.filter(cv => cv.classificationData)
                        ?.sort((a, b) => new Date(b.lastMessageAt || b.createdAt) - new Date(a.lastMessageAt || a.createdAt));
                    if (sortedConvs?.length > 0) {
                        try {
                            const classData = JSON.parse(sortedConvs[0].classificationData);
                            classificationTopic = classData?.extractedData?.topic || classData?.topic || null;
                        } catch (e) { /* ignore */ }
                    }
                }

                let firstMessageTopic = null;
                if (!convAiTopic && !classificationTopic) {
                    const sortedConvsForMsg = c.conversations
                        ?.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
                    for (const conv of (sortedConvsForMsg || [])) {
                        const firstMsg = conv.messages?.[0];
                        if (firstMsg?.content) {
                            firstMessageTopic = firstMsg.content.length > 60
                                ? firstMsg.content.substring(0, 60) + '...'
                                : firstMsg.content;
                            break;
                        }
                    }
                }

                return {
                    ...c,
                    source,
                    channels: [...new Set((c.conversations || []).map(conv => conv.channel).filter(Boolean))],
                    conversationCount: c._count?.conversations || 0,
                    aiTopic: convAiTopic || classificationTopic || firstMessageTopic,
                    lastNote: null,
                    lastNoteType: null,
                    activeCase: null
                };
            });
            console.log(`✅ [Get Contacts] Fallback query succeeded -> ${totalCount} total, showing ${finalContacts.length}`);
            return res.json({ contacts: finalContacts, total: totalCount, allImportGroups: [], allTags: [], quickStats: { periodCount: totalCount, withPhoneCount, agentCalledCount: 0, aiCalledCount: 0, noActivityCount: totalCount, totalAllTime: totalCount } });
        } catch (fallbackError) {
            console.error('Get contacts fallback error:', fallbackError);
            return res.status(500).json({ error: 'Failed to fetch contacts' });
        }
    }
};

// Get single contact details
export const getContactById = async (req, res) => {
    try {
        const { id } = req.params;
        const contact = await prisma.contact.findUnique({
            where: { id },
            include: {
                conversations: {
                    orderBy: { updatedAt: 'desc' },
                    take: 5
                }
            }
        });

        if (!contact) return res.status(404).json({ error: 'Contact not found' });

        res.json({ contact });
    } catch (error) {
        console.error('Get contact error:', error);
        res.status(500).json({ error: 'Failed to fetch contact' });
    }
};

// Update contact
export const updateContact = async (req, res) => {
    try {
        const { workspaceId, id } = req.params;
        const { name, fullName, phone, email, notes, tags, status, company, category, funnelType, funnelStageId, language, country, city } = req.body;

        // Verify contact belongs to this workspace (either directly or via conversation)
        const existing = await prisma.contact.findFirst({
            where: {
                id,
                OR: [
                    { workspaceId: workspaceId },
                    { conversations: { some: { workspaceId: workspaceId } } }
                ]
            }
        });
        if (!existing) {
            return res.status(404).json({ error: 'Contact not found' });
        }

        // Build update data dynamically - only include fields that are provided
        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (fullName !== undefined) updateData.fullName = fullName;
        if (phone !== undefined) updateData.phone = normalizePhone(phone);
        if (email !== undefined) updateData.email = email;
        if (company !== undefined) updateData.company = company;
        if (notes !== undefined) updateData.notes = notes;
        if (status !== undefined) updateData.status = status;
        if (category !== undefined) updateData.category = category;
        if (funnelType !== undefined) updateData.funnelType = funnelType;
        if (funnelStageId !== undefined) updateData.funnelStageId = funnelStageId;
        if (language !== undefined) updateData.language = language;
        if (country !== undefined) updateData.country = country;
        if (city !== undefined) updateData.city = city;
        if (tags !== undefined) {
            updateData.tags = typeof tags === 'string' ? tags : JSON.stringify(tags);
        }

        // Handle phones and emails arrays
        const { phones, emails } = req.body;
        if (phones !== undefined) {
            const phonesArr = typeof phones === 'string' ? JSON.parse(phones) : phones;
            updateData.phones = JSON.stringify(phonesArr.map(p => normalizePhone(p)));
        }
        if (emails !== undefined) {
            updateData.emails = typeof emails === 'string' ? emails : JSON.stringify(emails);
        }

        // Auto-upgrade status to OPPORTUNITY if phone is being added and current status is NEW
        const newPhone = phone !== undefined ? phone : existing.phone;
        const currentStatus = status !== undefined ? status : existing.status;
        if (newPhone && newPhone.trim() && currentStatus === 'NEW' && status === undefined) {
            updateData.status = 'OPPORTUNITY';
            console.log(`📱 [Contact] Auto-upgrading status to OPPORTUNITY (phone added): ${id}`);
        }

        const contact = await prisma.contact.update({
            where: { id },
            data: updateData
        });

        // ── Auto-update Case status based on stage's statusType ──
        if (funnelStageId !== undefined && funnelStageId !== existing.funnelStageId) {
            try {
                // Look up the new stage to check its statusType
                const newStage = funnelStageId ? await prisma.funnelStage.findUnique({
                    where: { id: funnelStageId }
                }) : null;

                if (newStage?.statusType) {
                    // Find active cases for this contact in this workspace
                    const activeCases = await prisma.case.findMany({
                        where: { workspaceId, contactId: id, status: 'ACTIVE' }
                    });

                    const now = new Date();
                    for (const activeCase of activeCases) {
                        const caseUpdateData = {
                            status: newStage.statusType,
                            funnelStageId: funnelStageId,
                            funnelType: updateData.funnelType || activeCase.funnelType
                        };

                        if (newStage.statusType === 'WON') {
                            caseUpdateData.wonAt = now;
                            caseUpdateData.closedAt = now;
                        } else if (newStage.statusType === 'LOST') {
                            caseUpdateData.lostAt = now;
                            caseUpdateData.closedAt = now;
                        } else if (newStage.statusType === 'CLOSED') {
                            caseUpdateData.closedAt = now;
                        }

                        await prisma.case.update({
                            where: { id: activeCase.id },
                            data: caseUpdateData
                        });
                        console.log(`🏷️ [Case] Auto-updated case ${activeCase.caseNumber || activeCase.id} → ${newStage.statusType} (stage: ${newStage.name})`);
                    }
                } else if (newStage && !newStage.isClosing) {
                    // Moving to an open (non-closing) stage — reopen closed cases
                    const closedCases = await prisma.case.findMany({
                        where: { workspaceId, contactId: id, status: { in: ['WON', 'LOST', 'CLOSED'] } },
                        orderBy: { updatedAt: 'desc' },
                        take: 1
                    });

                    for (const closedCase of closedCases) {
                        await prisma.case.update({
                            where: { id: closedCase.id },
                            data: {
                                status: 'ACTIVE',
                                funnelStageId: funnelStageId,
                                funnelType: updateData.funnelType || closedCase.funnelType,
                                closedAt: null,
                                wonAt: null,
                                lostAt: null,
                                lostReason: null
                            }
                        });
                        console.log(`🔄 [Case] Reopened case ${closedCase.caseNumber || closedCase.id} → ACTIVE (stage: ${newStage.name})`);
                    }
                }
            } catch (caseErr) {
                console.error('⚠️ [Case] Auto-status update error:', caseErr.message);
            }
        }

        // Emit socket event for real-time update (workspace-specific)
        // Find workspaces this contact belongs to
        const conversations = await prisma.conversation.findMany({
            where: { contactId: id },
            select: { workspaceId: true },
            distinct: ['workspaceId']
        });

        for (const conv of conversations) {
            if (conv.workspaceId) {
                emitToWorkspace(conv.workspaceId, 'contact_updated', {
                    workspaceId: conv.workspaceId,
                    contactId: id,
                    updatedFields: { name, phone, email, notes, tags, category, status, funnelStageId: updateData.funnelStageId, funnelType: updateData.funnelType }
                });
            }
        }

        // 🔥 Rule 3: HOT_OPPORT_EMAIL - trigger email to team if category became HOT_OPPORTUNITY
        if (category === 'HOT_OPPORTUNITY' && existing.category !== 'HOT_OPPORTUNITY') {
            const contactWorkspaceId = workspaceId ||
                (await prisma.conversation.findFirst({ where: { contactId: id }, select: { workspaceId: true } }))?.workspaceId;
            if (contactWorkspaceId) {
                executeHotOpportunityEmailRule(contactWorkspaceId, id).catch(e =>
                    console.error('❌ [RULE:HOT_OPPORT_EMAIL] async error:', e.message)
                );
            }
        }

        // 🔥 HAS_PHONE Flow Trigger: fire when phone is newly added
        const hadPhone = !!(existing.phone && existing.phone.trim());
        const nowHasPhone = !!(contact.phone && contact.phone.trim());
        if (!hadPhone && nowHasPhone) {
            const contactWorkspaceId = workspaceId ||
                (await prisma.conversation.findFirst({ where: { contactId: id }, select: { workspaceId: true } }))?.workspaceId;
            if (contactWorkspaceId) {
                const { executeFlowsByTrigger } = await import('./flow.controller.js');
                executeFlowsByTrigger(contactWorkspaceId, 'HAS_PHONE', {
                    contact,
                    conversation: null
                }).catch(e => console.error('❌ [FLOW:HAS_PHONE] error:', e.message));
                console.log(`📞 [FLOW:HAS_PHONE] Triggered for contact ${id}`);

                // Auto call planning when phone is newly added
                const { executeAutoCallPlanning } = await import('./rules.controller.js');
                executeAutoCallPlanning(contactWorkspaceId, id, 'TELEFON_EKLENDI').catch(e =>
                    console.error('❌ [RULE:AUTO_CALL] Phone added error:', e.message)
                );

                // Koşullu dağıtım tetikle — telefon eklendi
                try {
                    const { checkAndDistributeByTrigger } = await import('../services/teamAssignment.service.js');
                    const convs = await prisma.conversation.findMany({ where: { contactId: id, workspaceId: contactWorkspaceId, assignedToId: null, status: 'OPEN' } });
                    for (const c of convs) {
                        await checkAndDistributeByTrigger(c.id, 'PHONE');
                    }
                } catch (triggerErr) { console.error('Conditional distribution trigger error:', triggerErr); }
            }
        }

        // 🔥 EMAIL Koşullu dağıtım tetikleyicisi: e-posta yeni eklendiğinde
        const hadEmail = !!(existing.email && existing.email.trim());
        const nowHasEmail = !!(contact.email && contact.email.trim());
        if (!hadEmail && nowHasEmail) {
            const emailWorkspaceId = workspaceId ||
                (await prisma.conversation.findFirst({ where: { contactId: id }, select: { workspaceId: true } }))?.workspaceId;
            if (emailWorkspaceId) {
                // Koşullu dağıtım tetikle — email eklendi
                try {
                    const { checkAndDistributeByTrigger } = await import('../services/teamAssignment.service.js');
                    const convs = await prisma.conversation.findMany({ where: { contactId: id, workspaceId: emailWorkspaceId, assignedToId: null, status: 'OPEN' } });
                    for (const c of convs) {
                        await checkAndDistributeByTrigger(c.id, 'EMAIL');
                    }
                } catch (triggerErr) { console.error('Conditional distribution trigger error:', triggerErr); }
            }
        }

        res.json({ contact });

        // Entry Rules: Contact bilgileri güncellendi → aşama kurallarını değerlendir
        const evalWorkspaceId = workspaceId || contact.workspaceId;
        if (evalWorkspaceId) {
            evaluateAndApplyRules(id, evalWorkspaceId).catch(err =>
                console.error('⚠️ [UpdateContact] Entry rules hatası:', err.message)
            );
        }
    } catch (error) {
        console.error('Update contact error:', error);
        res.status(500).json({ error: 'Failed to update contact' });
    }
};


// Create contact manually
export const createContact = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { name, phone: rawPhone, email, notes, company, funnelType, funnelStageId } = req.body;
        const phone = normalizePhone(rawPhone);

        // Validation
        if (!name || (!phone && !email)) {
            return res.status(400).json({
                error: 'İsim ve en az bir iletişim bilgisi (telefon veya e-posta) gereklidir'
            });
        }

        // Check if contact already exists with same phone or email IN THIS WORKSPACE
        const existingContact = await prisma.contact.findFirst({
            where: {
                workspaceId: workspaceId,
                OR: [
                    phone ? { phone } : {},
                    email ? { email } : {}
                ].filter(obj => Object.keys(obj).length > 0)
            }
        });

        if (existingContact) {
            return res.status(400).json({
                error: 'Bu telefon veya e-posta ile kayıtlı bir müşteri zaten mevcut'
            });
        }

        // Determine initial status - OPPORTUNITY if phone exists, otherwise NEW
        const initialStatus = phone && phone.trim() ? 'OPPORTUNITY' : 'NEW';

        // Handle phones and emails arrays
        const { phones, emails } = req.body;

        // Create contact with workspaceId
        const contact = await prisma.contact.create({
            data: {
                workspaceId: workspaceId,
                name,
                phone,
                email,
                phones: phones ? JSON.stringify(phones.map(p => normalizePhone(p))) : '[]',
                emails: emails ? JSON.stringify(emails) : '[]',
                company,
                status: initialStatus,
                funnelType: funnelType || null,
                funnelStageId: funnelStageId || null,
                tags: '[]'
            }
        });

        console.log(`✅ [Create Contact] SUCCESS - ID: ${contact.id}, Name: ${name}, Status: ${initialStatus}`);

        // --- CREATE LEAD CONVERSATION (so AGENT users can see this contact) ---
        let conversation = null;
        try {
            // Determine the team of the creating user (for teamIds on conversation)
            let teamIds = '[]';
            let assignedTeamId = null;
            if (req.user?.id) {
                const userTeams = await prisma.teamMember.findMany({
                    where: { userId: req.user.id },
                    select: { teamId: true }
                });
                if (userTeams.length > 0) {
                    teamIds = JSON.stringify(userTeams.map(t => t.teamId));
                    assignedTeamId = userTeams[0].teamId;
                }
            }

            conversation = await prisma.conversation.create({
                data: {
                    workspaceId,
                    contactId: contact.id,
                    channel: 'LEAD',
                    status: 'OPEN',
                    assignedToId: req.user?.id || null,
                    assignedTeamId: assignedTeamId,
                    teamIds: teamIds,
                    botEnabled: false,
                    aiTopic: `Manuel Kayıt - ${name}`,
                    lastMessageAt: new Date(),
                    assignedByType: 'USER',
                    assignedAt: new Date()
                }
            });
            console.log(`📋 [Create Contact] LEAD conversation created: ${conversation.id}, assigned to: ${req.user?.id || 'none'}`);

            // Auto-create a case for this conversation
            ensureCaseForConversation(workspaceId, conversation.id).catch(err =>
                console.error('⚠️ [Create Contact] Auto-case creation error:', err.message)
            );
        } catch (convErr) {
            console.error('⚠️ [Create Contact] Conversation creation error:', convErr.message);
        }
        // --- LEAD CONVERSATION END ---

        // Emit socket event for real-time update (workspace-specific)
        emitToWorkspace(workspaceId, 'contact_updated', {
            workspaceId,
            contactId: contact.id,
            action: 'created'
        });

        // --- AUTO CALL PLANNING (Manuel Ekleme) ---
        if (phone && phone.trim()) {
            try {
                const { executeAutoCallPlanning } = await import('./rules.controller.js');
                executeAutoCallPlanning(workspaceId, contact.id, 'MANUEL').catch(e =>
                    console.error('❌ [RULE:AUTO_CALL] Manual create error:', e.message)
                );
            } catch (ruleErr) {
                console.error('❌ [RULES] Manual create error:', ruleErr.message);
            }
        }
        // --- AUTO CALL PLANNING END ---

        res.status(201).json({ contact });

        // Entry Rules: Yeni contact oluşturuldu → aşama kurallarını değerlendir
        evaluateAndApplyRules(contact.id, workspaceId).catch(err =>
            console.error('⚠️ [CreateContact] Entry rules hatası:', err.message)
        );
    } catch (error) {
        console.error('Create contact error:', error);
        res.status(500).json({ error: 'Müşteri oluşturulurken hata oluştu' });
    }
};

// Bulk import contacts (Excel import)
export const bulkImportContacts = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { contacts, tag } = req.body;

        if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
            return res.status(400).json({ error: 'İçe aktarılacak kişi bulunamadı' });
        }

        let imported = 0;
        let skipped = 0;
        const errors = [];

        for (const row of contacts) {
            try {
                const name = (row.name || '').trim();
                const phone = normalizePhone(row.phone);
                const email = (row.email || '').trim();
                const notes = (row.notes || '').trim();
                const originalDate = row.createdAt ? new Date(row.createdAt) : new Date();
                // Validate date
                const contactDate = isNaN(originalDate.getTime()) ? new Date() : originalDate;

                if (!name || (!phone && !email)) {
                    skipped++;
                    continue;
                }

                // Check duplicate by phone or email
                const orConditions = [];
                if (phone) orConditions.push({ phone });
                if (email) orConditions.push({ email });

                const existing = await prisma.contact.findFirst({
                    where: {
                        workspaceId,
                        OR: orConditions
                    }
                });

                if (existing) {
                    if (tag) {
                        let existingTags = [];
                        try { existingTags = JSON.parse(existing.tags || '[]'); } catch(e){}
                        if (!existingTags.includes(tag)) {
                            existingTags.push(tag);
                            await prisma.contact.update({
                                where: { id: existing.id },
                                data: { tags: JSON.stringify(existingTags) }
                            });
                        }
                    }
                    skipped++;
                    continue;
                }

                const initialStatus = phone && phone.trim() ? 'OPPORTUNITY' : 'NEW';

                // Build notes as JSON array
                let notesJson = null;
                if (notes) {
                    notesJson = JSON.stringify([{
                        id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                        text: notes,
                        createdAt: new Date().toISOString(),
                        createdBy: 'Excel İçe Aktarma'
                    }]);
                }

                const tagsArray = tag ? [tag] : [];
                const contact = await prisma.contact.create({
                    data: {
                        workspaceId,
                        name,
                        phone: phone || null,
                        email: email || null,
                        notes: notesJson,
                        tags: JSON.stringify(tagsArray),
                        status: initialStatus,
                        source: 'IMPORT',
                        createdAt: contactDate
                    }
                });

                // Create a LEAD conversation so the contact appears in Inbox
                const conversation = await prisma.conversation.create({
                    data: {
                        workspaceId,
                        contactId: contact.id,
                        channel: 'LEAD',
                        status: 'OPEN',
                        lastMessageAt: contactDate,
                        createdAt: contactDate
                    }
                });

                imported++;
            } catch (rowErr) {
                errors.push(rowErr.message);
            }
        }

        console.log(`📥 [Import] ${imported} imported, ${skipped} skipped for workspace ${workspaceId}`);

        // Emit socket event
        emitToWorkspace(workspaceId, 'contact_updated', {
            workspaceId,
            action: 'bulk_import',
            imported,
            skipped
        });

        res.json({ imported, skipped, errors: errors.slice(0, 5), total: contacts.length });
    } catch (error) {
        console.error('Bulk import error:', error);
        res.status(500).json({ error: 'İçe aktarma sırasında hata oluştu' });
    }
};

// Get analytics for contacts
export const getContactAnalytics = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { startDate, endDate, funnelId, teamId } = req.query;

        console.log(`📊 [Analytics] Getting contact analytics for workspace: ${workspaceId}${funnelId ? ` (Funnel: ${funnelId})` : ''}${teamId ? ` (Team: ${teamId})` : ''}`);

        // Resolve team member user IDs (null = no team filter)
        const teamUserIds = await getTeamUserIds(teamId);

        // Build date filter
        let dateFilter = {};
        if (startDate || endDate) {
            dateFilter.createdAt = {};
            if (startDate) dateFilter.createdAt.gte = parseDateStartTR(startDate);
            if (endDate) dateFilter.createdAt.lte = parseDateEndTR(endDate);
        }

        // Base contact where clause
        const contactWhere = {
            isDeleted: false,
            conversations: { some: { workspaceId, ...(teamUserIds ? { assignedToId: { in: teamUserIds } } : {}) } },
            ...dateFilter
        };

        let activeFunnel = null;
        if (funnelId) {
            activeFunnel = await prisma.funnel.findUnique({
                where: { id: funnelId },
                include: { stages: { orderBy: { order: 'asc' } } }
            });

            if (activeFunnel) {
                // Filter by either funnelStageId OR funnelType (for legacy/inbox consistency)
                contactWhere.OR = [
                    { funnelStageId: { in: activeFunnel.stages.map(s => s.id) } },
                    { funnelType: activeFunnel.name }
                ];
            }
        }

        // Get all contacts
        const contacts = await prisma.contact.findMany({
            where: contactWhere,
            select: {
                id: true,
                phone: true,
                status: true,
                funnelType: true,
                funnelStageId: true,
                createdAt: true,
                conversations: {
                    where: { workspaceId },
                    select: { channel: true, id: true }
                }
            }
        });

        // Message metrics (Human vs AI)
        const messageFilter = { conversation: { workspaceId, ...(teamUserIds ? { assignedToId: { in: teamUserIds } } : {}) } };
        if (startDate || endDate) messageFilter.createdAt = dateFilter.createdAt;

        const [totalMessages, totalAiMessages, totalHumanMessages] = await Promise.all([
            prisma.message.count({ where: messageFilter }),
            prisma.message.count({ 
                where: { 
                    ...messageFilter, 
                    isFromContact: false, 
                    senderId: null 
                } 
            }),
            prisma.message.count({ 
                where: { 
                    ...messageFilter, 
                    isFromContact: false, 
                    senderId: teamUserIds ? { in: teamUserIds } : { not: null }
                } 
            })
        ]);

        // Conversation metrics
        const conversationFilter = { workspaceId, ...(teamUserIds ? { assignedToId: { in: teamUserIds } } : {}) };
        if (startDate || endDate) conversationFilter.createdAt = dateFilter.createdAt;

        const [totalConversations, botLedConversations, handoffConversations] = await Promise.all([
            prisma.conversation.count({ where: conversationFilter }),
            prisma.conversation.count({ 
                where: { 
                    ...conversationFilter, 
                    assignedBotId: { not: null } 
                } 
            }),
            prisma.conversation.count({ 
                where: { 
                    ...conversationFilter, 
                    assignedBotId: { not: null },
                    botEnabled: false 
                } 
            })
        ]);

        // Channel Distribution
        const channelCounts = {};
        contacts.forEach(contact => {
            contact.conversations.forEach(conv => {
                const channel = conv.channel || 'UNKNOWN';
                channelCounts[channel] = (channelCounts[channel] || 0) + 1;
            });
        });

        // Status / Stage Data
        let statusData = [];
        if (activeFunnel) {
            statusData = activeFunnel.stages.map(stage => {
                const count = contacts.filter(c => {
                    // Check direct ID match
                    if (c.funnelStageId === stage.id) return true;
                    
                    // Check name match if contact is in this funnel type but has no stage ID
                    if (c.funnelType === activeFunnel.name) {
                        // Map global status to stage name if applicable
                        const statusToNameMap = {
                            'NEW': 'Yeni Başvuru',
                            'OPPORTUNITY': 'Fırsat',
                            'HOT_OPPORTUNITY': 'Sıcak Fırsat',
                            'PROPOSAL': 'Teklif Aşaması',
                            'CONVERTED': 'Satış'
                        };
                        const mappedName = statusToNameMap[c.status] || c.status;
                        return mappedName === stage.name;
                    }
                    return false;
                }).length;

                return {
                    status: stage.id,
                    label: stage.name,
                    count: count,
                    color: stage.color
                };
            });
        } else {
            // Use global status
            const statusCounts = {
                NEW: 0, OPPORTUNITY: 0, HOT_OPPORTUNITY: 0, INFORMED: 0,
                MEETING_PLANNED: 0, PROPOSAL: 0, CONVERTED: 0, UNREACHABLE: 0, LOST: 0
            };
            const statusLabels = {
                NEW: 'Yeni Başvuru', OPPORTUNITY: 'Fırsat', HOT_OPPORTUNITY: 'Sıcak Fırsat',
                INFORMED: 'Bilgi Verildi', MEETING_PLANNED: 'Görüşme Planlandı',
                PROPOSAL: 'Teklif Aşaması', CONVERTED: 'Satış', UNREACHABLE: 'Ulaşılamadı', LOST: 'Kayıp'
            };

            contacts.forEach(contact => {
                const s = contact.status || 'NEW';
                if (statusCounts.hasOwnProperty(s)) statusCounts[s]++;
            });

            statusData = Object.entries(statusCounts).map(([key, value]) => ({
                status: key,
                label: statusLabels[key] || key,
                count: value
            }));
        }

        const totalContacts = contacts.length;
        const withPhoneCount = contacts.filter(c => c.phone && c.phone.trim() !== '').length;
        const convertedCount = funnelId ? 0 : (contacts.filter(c => c.status === 'CONVERTED').length);
        const conversionRate = totalContacts > 0 ? ((convertedCount / totalContacts) * 100).toFixed(1) : 0;

        // Monthly data (ignoring short-term dateFilter but applying workspace/team/funnel filters)
        const monthlyContactWhere = {
            conversations: { some: { workspaceId, ...(teamUserIds ? { assignedToId: { in: teamUserIds } } : {}) } }
        };
        if (funnelId && activeFunnel) {
            monthlyContactWhere.OR = [
                { funnelStageId: { in: activeFunnel.stages.map(s => s.id) } },
                { funnelType: activeFunnel.name }
            ];
        }

        // Limit to last 6 months (5 months ago 1st day to now)
        const nowForMonthly = endDate ? new Date(parseDateEndTR(endDate)) : new Date();
        const sixMonthsAgo = new Date(nowForMonthly.getFullYear(), nowForMonthly.getMonth() - 5, 1);
        monthlyContactWhere.createdAt = { gte: sixMonthsAgo };

        const monthlyContacts = await prisma.contact.findMany({
            where: monthlyContactWhere,
            select: { createdAt: true }
        });

        const monthlyData = [];
        for (let i = 5; i >= 0; i--) {
            const mStart = new Date(nowForMonthly.getFullYear(), nowForMonthly.getMonth() - i, 1);
            const mEndNext = new Date(nowForMonthly.getFullYear(), nowForMonthly.getMonth() - i + 1, 1);
            const mName = mStart.toLocaleString('tr-TR', { month: 'short' });
            const count = monthlyContacts.filter(c => {
                const d = new Date(c.createdAt);
                return d >= mStart && d < mEndNext;
            }).length;
            monthlyData.push({ month: mName, count });
        }

        // Funnel Summary — tüm kişiler, date filter yok (mevcut durumu gösterir)
        const allFunnels = await prisma.funnel.findMany({
            where: { workspaceId },
            include: { stages: { select: { id: true, name: true, color: true, order: true }, orderBy: { order: 'asc' } } },
            orderBy: { order: 'asc' }
        });

        // Build stage lookup for topic analysis
        const stageLookup = {};
        for (const f of allFunnels) {
            for (const s of f.stages) {
                stageLookup[s.id] = { name: s.name, color: s.color, funnelName: f.name };
            }
        }

        // Tarih filtresi: Seçilen aralığa göre dinamik recentCount
        const recentDateFilter = {};
        if (startDate) recentDateFilter.gte = parseDateStartTR(startDate);
        else {
            // 7 gün önce, Türkiye saatiyle gece yarısı
            const nowTR = new Date(Date.now() + TZ_OFFSET_MS);
            const sevenDaysAgoTR = new Date(Date.UTC(nowTR.getUTCFullYear(), nowTR.getUTCMonth(), nowTR.getUTCDate() - 7));
            recentDateFilter.gte = new Date(sevenDaysAgoTR.getTime() - TZ_OFFSET_MS);
        }
        if (endDate) recentDateFilter.lte = parseDateEndTR(endDate);

        // Tarih etiketi: frontend'e kaç günlük filtre olduğunu gönder
        const filterDays = Math.ceil((new Date(endDate || Date.now()) - new Date(recentDateFilter.gte)) / (1000 * 60 * 60 * 24));
        const filterLabel = filterDays <= 1 ? '1g' : filterDays <= 7 ? '7g' : filterDays <= 30 ? '30g' : `${filterDays}g`;

        const funnelSummary = await Promise.all(allFunnels.map(async (f) => {
            const stageIds = f.stages.map(s => s.id);
            const funnelWhere = {
                conversations: { some: { workspaceId } },
                OR: [
                    ...(stageIds.length > 0 ? [{ funnelStageId: { in: stageIds } }] : []),
                    { funnelType: f.name }
                ]
            };
            const [count, recentCount, conversationCount] = await Promise.all([
                prisma.contact.count({ where: funnelWhere }),
                prisma.contact.count({ where: { ...funnelWhere, createdAt: recentDateFilter } }),
                // Yazışma sayısı: bu akıştaki kişilerin toplam yazışma sayısı
                prisma.conversation.count({
                    where: {
                        workspaceId,
                        contact: {
                            OR: [
                                ...(stageIds.length > 0 ? [{ funnelStageId: { in: stageIds } }] : []),
                                { funnelType: f.name }
                            ]
                        }
                    }
                })
            ]);

            // Aşama bazlı kişi sayıları + yazışma sayıları
            const stages = await Promise.all(f.stages.map(async (s) => {
                const stageWhere = {
                    conversations: { some: { workspaceId } },
                    funnelStageId: s.id
                };
                const [stageCount, stageRecentCount, stageConvCount] = await Promise.all([
                    prisma.contact.count({ where: stageWhere }),
                    prisma.contact.count({ where: { ...stageWhere, createdAt: recentDateFilter } }),
                    prisma.conversation.count({
                        where: { workspaceId, contact: { funnelStageId: s.id } }
                    })
                ]);
                return { id: s.id, name: s.name, color: s.color, count: stageCount, recentCount: stageRecentCount, conversationCount: stageConvCount };
            }));

            return { id: f.id, name: f.name, count, recentCount, conversationCount, color: f.color, icon: f.icon, stages, filterLabel };
        }));

        // "Genel" funnel'ı — hiçbir funnel'a atanmamış kişiler
        if (!funnelSummary.some(f => f.name.toLowerCase() === 'genel')) {
            const allStageIds = allFunnels.flatMap(f => f.stages.map(s => s.id));
            const allFunnelNames = allFunnels.map(f => f.name);
            const generalWhere = {
                conversations: { some: { workspaceId } },
                funnelStageId: allStageIds.length > 0 ? { notIn: allStageIds } : undefined,
                OR: [
                    { funnelType: null },
                    { funnelType: 'Genel' },
                    ...(allFunnelNames.length > 0 ? [] : [])
                ]
            };
            const [generalCount, generalRecent, generalConvCount] = await Promise.all([
                prisma.contact.count({ where: generalWhere }),
                prisma.contact.count({ where: { ...generalWhere, createdAt: recentDateFilter } }),
                prisma.conversation.count({
                    where: {
                        workspaceId,
                        contact: {
                            funnelStageId: allStageIds.length > 0 ? { notIn: allStageIds } : undefined,
                            OR: [{ funnelType: null }, { funnelType: 'Genel' }]
                        }
                    }
                })
            ]);
            funnelSummary.unshift({ id: 'genel', name: 'Genel', count: generalCount, recentCount: generalRecent, conversationCount: generalConvCount, color: '#64748b', icon: '📋', stages: [], filterLabel });
        }


        // Appointment Statistics
        const appointmentFilter = { workspaceId, ...(teamUserIds ? { OR: [{ assignedToId: { in: teamUserIds } }, { createdById: { in: teamUserIds } }] } : {}) };
        if (startDate || endDate) appointmentFilter.createdAt = dateFilter.createdAt;

        const [
            totalAppointments,
            botAppointments,
            agentAppointments,
            scheduledAppointments,
            completedAppointments,
            cancelledAppointments,
            overdueAppointments
        ] = await Promise.all([
            prisma.appointment.count({ where: appointmentFilter }),
            prisma.appointment.count({ where: { ...appointmentFilter, createdByBotId: { not: null } } }),
            prisma.appointment.count({ where: { ...appointmentFilter, createdByBotId: null } }),
            prisma.appointment.count({ where: { ...appointmentFilter, status: 'SCHEDULED' } }),
            prisma.appointment.count({ where: { ...appointmentFilter, status: 'COMPLETED' } }),
            prisma.appointment.count({ where: { ...appointmentFilter, status: 'CANCELLED' } }),
            prisma.appointment.count({ where: { ...appointmentFilter, status: 'SCHEDULED', startTime: { lt: new Date() } } })
        ]);

        // Agent'ların "Randevu" aşamasına taşıdığı kişiler (STAGE_CHANGED event'leri)
        let stageBasedAppointments = 0;
        try {
            const eventDateFilter = {};
            if (startDate || endDate) {
                eventDateFilter.createdAt = {};
                if (startDate) eventDateFilter.createdAt.gte = parseDateStartTR(startDate);
                if (endDate) eventDateFilter.createdAt.lte = parseDateEndTR(endDate);
            }
            stageBasedAppointments = await prisma.conversationEvent.count({
                where: {
                    workspaceId,
                    eventType: 'STAGE_CHANGED',
                    actorType: 'USER',
                    title: { contains: 'Randevu' },
                    ...eventDateFilter
                }
            });
        } catch (e) {
            // ConversationEvent tablosu yoksa sessizce devam et
        }

        // Real resolution rate from conversations
        const resolvedConvs = await prisma.conversation.count({ where: { ...conversationFilter, status: 'RESOLVED' } });
        const realResolutionRate = totalConversations > 0
            ? ((resolvedConvs / totalConversations) * 100).toFixed(1)
            : 0;

        // ── Call Tracking Stats ──
        // Build date filter for contacts (same range as activities)
        const contactDateFilter = {};
        if (startDate || endDate) {
            contactDateFilter.createdAt = {};
            if (startDate) contactDateFilter.createdAt.gte = parseDateStartTR(startDate);
            if (endDate) contactDateFilter.createdAt.lte = parseDateEndTR(endDate);
        }

        // Telefon numarası olan kişiler (seçili tarih aralığında oluşturulanlar)
        // getDailyContactStats ile aynı filtre: OR workspaceId + conversations
        const phoneContactWhere = {
            OR: [
                { workspaceId },
                { conversations: { some: { workspaceId } } }
            ],
            isDeleted: false,
            phone: { not: null },
            NOT: { phone: '' },
            ...contactDateFilter
        };
        const contactsWithPhone = await prisma.contact.count({ where: phoneContactWhere });

        // CALL aktivitesi olan unique kişi sayısı
        const activityDateFilter = {};
        if (startDate || endDate) {
            activityDateFilter.createdAt = {};
            if (startDate) activityDateFilter.createdAt.gte = parseDateStartTR(startDate);
            if (endDate) activityDateFilter.createdAt.lte = parseDateEndTR(endDate);
        }

        const callActivities = await prisma.contactActivity.findMany({
            where: {
                workspaceId,
                type: 'CALL',
                ...activityDateFilter,
                ...(teamUserIds ? { OR: [{ assignedToId: { in: teamUserIds } }, { createdBy: { in: teamUserIds } }] } : {})
            },
            select: {
                id: true,
                contactId: true,
                status: true,
                title: true,
                description: true,
                result: true,
                dueDate: true,
                createdAt: true,
                completedAt: true,
                assignedToId: true,
                callSentiment: true,
                contact: { 
                    select: { 
                        id: true, 
                        name: true, 
                        phone: true, 
                        source: true, 
                        status: true,
                        funnelStageId: true,
                        conversations: {
                            orderBy: { createdAt: 'desc' },
                            select: { aiTopic: true, assignedTo: { select: { id: true, name: true } } },
                            take: 1
                        }
                    } 
                },
                assignee: { select: { id: true, name: true } }
            }
        });

        const calledContactIds = new Set(callActivities.filter(a => a.status === 'COMPLETED').map(a => a.contactId));
        const completedCallActivities = callActivities.filter(a => a.status === 'COMPLETED');
        const totalCallCount = completedCallActivities.length; // Sadece tamamlanmış aramalar sayılır

        // Kişi bazlı arama detayları (tablo için)
        const callDetailMap = {};
        for (const a of callActivities) {
            if (!callDetailMap[a.contactId]) {
                callDetailMap[a.contactId] = {
                    contactId: a.contactId,
                    contactName: a.contact?.name || 'Bilinmiyor',
                    phone: a.contact?.phone || '',
                    totalCalls: 0,
                    completedCalls: 0,
                    plannedCalls: 0,
                    lastCallDate: null,
                    assigneeName: null
                };
            }
            const d = callDetailMap[a.contactId];
            d.totalCalls++;
            if (a.status === 'COMPLETED') d.completedCalls++;
            if (a.status === 'PLANNED') d.plannedCalls++;
            const dateToCheck = a.dueDate || a.createdAt;
            if (!d.lastCallDate || new Date(dateToCheck) > new Date(d.lastCallDate)) {
                d.lastCallDate = dateToCheck;
            }
            if (a.assignee) d.assigneeName = a.assignee.name;
        }
        // Numaralı tüm kişilerin listesi (popup için) — aynı filtre
        const allContactsWithPhone = await prisma.contact.findMany({
            where: phoneContactWhere,
            select: {
                id: true,
                name: true,
                phone: true,
                status: true,
                funnelStageId: true,
                company: true,
                createdAt: true,
                conversations: {
                    orderBy: { createdAt: 'desc' },
                    select: { aiTopic: true, assignedTo: { select: { id: true, name: true } } },
                    take: 1
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        const phoneContactsList = allContactsWithPhone.map(c => {
            const detail = callDetailMap[c.id];
            return {
                contactId: c.id,
                name: c.name || 'İsimsiz',
                phone: c.phone,
                status: c.status,
                funnelStageId: c.funnelStageId,
                company: c.company,
                createdAt: c.createdAt,
                wasCalled: !!(detail && detail.completedCalls > 0),
                totalCalls: detail?.totalCalls || 0,
                completedCalls: detail?.completedCalls || 0,
                plannedCalls: detail?.plannedCalls || 0,
                lastCallDate: detail?.lastCallDate || null,
                assigneeName: detail?.assigneeName || null,
                aiTopic: c.conversations?.[0]?.aiTopic || null,
                activeAssigneeName: c.conversations?.[0]?.assignedTo?.name || null
            };
        });

        // Arama Kapatma Notları — tarih filtresi OLMADAN tüm notlar (en son 100)
        const closureNotes = await prisma.contactActivity.findMany({
            where: {
                workspaceId,
                type: 'CALL',
                status: 'COMPLETED',
                result: { not: null }
            },
            select: {
                id: true,
                contactId: true,
                result: true,
                completedAt: true,
                createdAt: true,
                contact: { select: { id: true, name: true } },
                assignee: { select: { id: true, name: true } }
            },
            orderBy: { completedAt: 'desc' },
            take: 100
        });
        // Filter out empty results
        const filteredClosureNotes = closureNotes.filter(a => a.result && a.result.trim() !== '');

        // Gecikmiş aramalar — tarih filtresi OLMADAN, dueDate geçmiş PLANNED aramalar
        const overdueWhere = {
            workspaceId,
            type: 'CALL',
            status: 'PLANNED',
            dueDate: { lt: new Date() },
            ...(teamUserIds ? { OR: [{ assignedToId: { in: teamUserIds } }, { createdBy: { in: teamUserIds } }] } : {})
        };
        const [overdueCalls, overdueCount] = await Promise.all([
            prisma.contactActivity.findMany({
                where: overdueWhere,
                select: {
                    id: true,
                    contactId: true,
                    title: true,
                    dueDate: true,
                    createdAt: true,
                    assignedToId: true,
                    contact: { select: { id: true, name: true, phone: true, source: true } },
                    assignee: { select: { id: true, name: true } }
                },
                orderBy: { dueDate: 'asc' }
            }),
            prisma.contactActivity.count({ where: overdueWhere })
        ]);

        // Numaralı kişilerin ID set'i (kesişim için)
        const phoneContactIdSet = new Set(allContactsWithPhone.map(c => c.id));

        // Kaçı arandı = numaralı kişilerden kaçında arama kaydı var (maks 1 per kişi)
        const calledAmongPhoned = new Set([...calledContactIds].filter(id => phoneContactIdSet.has(id)));

        const callTrackingStats = {
            totalWithPhone: contactsWithPhone,
            totalCalled: calledAmongPhoned.size,           // Numaralı kişilerden kaçı arandı (unique)
            totalCallCount,                                 // Her arama ayrı sayılır (toplam arama sayısı)
            totalCompleted: totalCallCount,                 // Toplam arama = tüm CALL aktiviteleri
            totalNotCalled: contactsWithPhone - calledAmongPhoned.size,  // Numaralı - Kaçı Arandı
            callRate: contactsWithPhone > 0 ? ((calledAmongPhoned.size / contactsWithPhone) * 100).toFixed(1) : 0,
            details: Object.values(callDetailMap).sort((a, b) => new Date(b.lastCallDate) - new Date(a.lastCallDate)),
            phoneContactsList,
            activities: callActivities,
            closureNotes: filteredClosureNotes,
            overdueCalls,
            overdueCount
        };

        // ── Deal/Sales Stats (CEO Dashboard) ──
        // Tüm stage'ler aynı tarih alanı (createdAt) ile filtrelenir — Siparişler/Teklifler/Faturalar sayfalarıyla tutarlı
        let dealStats = { totalDeals: 0, totalQuotes: 0, totalOrders: 0, totalInvoices: 0, wonCount: 0, lostCount: 0, openCount: 0, totalAmount: 0, wonAmount: 0, orderAmount: 0, quoteAmount: 0, invoiceAmount: 0, recentDeals: [] };
        try {
            const hasDateFilter = startDate || endDate;
            const dateGte = startDate ? parseDateStartTR(startDate) : undefined;
            const dateLte = endDate ? parseDateEndTR(endDate) : undefined;

            // Tüm stage'ler için aynı createdAt filtresi (deal.controller.js getDeals ile aynı)
            const buildCreatedAtFilter = () => {
                if (!hasDateFilter) return {};
                const f = { createdAt: {} };
                if (dateGte) f.createdAt.gte = dateGte;
                if (dateLte) f.createdAt.lte = dateLte;
                return f;
            };

            const dateFilter = buildCreatedAtFilter();

            const teamDealFilter = teamUserIds ? { assignedToId: { in: teamUserIds } } : {};
            const quoteWhere = { workspaceId, stage: 'QUOTE', ...dateFilter, ...teamDealFilter };
            const orderWhere = { workspaceId, stage: 'ORDER', ...dateFilter, ...teamDealFilter };
            const invoiceWhere = { workspaceId, stage: 'INVOICE', ...dateFilter, ...teamDealFilter };

            // Tüm deal'lar için genel tarih filtresi (recentDeals ve total için)
            const generalDateFilter = {};
            if (hasDateFilter) {
                generalDateFilter.createdAt = {};
                if (dateGte) generalDateFilter.createdAt.gte = dateGte;
                if (dateLte) generalDateFilter.createdAt.lte = dateLte;
            }

            const [
                quoteStats, orderStats, invoiceStats,
                quoteStatusStats, orderStatusStats, invoiceStatusStats,
                recentDeals
            ] = await Promise.all([
                // Stage-specific counts and amounts
                prisma.deal.aggregate({ where: quoteWhere, _count: true, _sum: { amount: true } }),
                prisma.deal.aggregate({ where: orderWhere, _count: true, _sum: { amount: true } }),
                prisma.deal.aggregate({ where: invoiceWhere, _count: true, _sum: { amount: true } }),
                // Status breakdowns per stage
                prisma.deal.groupBy({ by: ['status'], where: quoteWhere, _count: true, _sum: { amount: true } }),
                prisma.deal.groupBy({ by: ['status'], where: orderWhere, _count: true, _sum: { amount: true } }),
                prisma.deal.groupBy({ by: ['status'], where: invoiceWhere, _count: true, _sum: { amount: true } }),
                // Recent deals (general)
                prisma.deal.findMany({
                    where: { workspaceId, ...generalDateFilter, ...teamDealFilter },
                    select: {
                        id: true, title: true, stage: true, status: true, amount: true, currency: true,
                        createdAt: true,
                        contact: { select: { id: true, name: true, phone: true, source: true } },
                        assignedTo: { select: { id: true, name: true } }
                    },
                    orderBy: { createdAt: 'desc' }
                })
            ]);

            const getCount = (agg) => typeof agg._count === 'number' ? agg._count : (agg._count?._all || 0);
            const dTotalQuotes = getCount(quoteStats);
            const dTotalOrders = getCount(orderStats);
            const dTotalInvoices = getCount(invoiceStats);
            const dQuoteAmount = quoteStats._sum?.amount || 0;
            const dOrderAmount = orderStats._sum?.amount || 0;
            const dInvoiceAmount = invoiceStats._sum?.amount || 0;

            // Status breakdowns across all stages
            let dWonCount = 0, dLostCount = 0, dOpenCount = 0, dWonAmount = 0;
            for (const statusGroup of [...quoteStatusStats, ...orderStatusStats, ...invoiceStatusStats]) {
                const cnt = typeof statusGroup._count === 'number' ? statusGroup._count : (statusGroup._count?._all || 0);
                const amt = statusGroup._sum?.amount || 0;
                if (statusGroup.status === 'WON') { dWonCount += cnt; dWonAmount += amt; }
                if (statusGroup.status === 'LOST') dLostCount += cnt;
                if (statusGroup.status === 'OPEN') dOpenCount += cnt;
            }

            dealStats = {
                totalDeals: dTotalQuotes + dTotalOrders + dTotalInvoices,
                totalQuotes: dTotalQuotes,
                totalOrders: dTotalOrders,
                totalInvoices: dTotalInvoices,
                quoteAmount: dQuoteAmount,
                orderAmount: dOrderAmount,
                invoiceAmount: dInvoiceAmount,
                wonCount: dWonCount,
                lostCount: dLostCount,
                openCount: dOpenCount,
                totalAmount: dQuoteAmount + dOrderAmount + dInvoiceAmount,
                wonAmount: dWonAmount,
                recentDeals
            };
        } catch (e) {
            console.error('Deal stats error (non-fatal):', e.message);
        }

        // ── Activity Stats (CEO Dashboard) ──
        let activityStats = { totalActivities: 0, plannedCount: 0, completedCount: 0, inProgressCount: 0, cancelledCount: 0, overdueCount: 0, callCount: 0, meetingCount: 0, taskCount: 0, noteCount: 0 };
        try {
            const actDateFilter = {};
            if (startDate || endDate) {
                actDateFilter.createdAt = {};
                if (startDate) actDateFilter.createdAt.gte = parseDateStartTR(startDate);
                if (endDate) actDateFilter.createdAt.lte = parseDateEndTR(endDate);
            }

            const teamActFilter = teamUserIds ? { OR: [{ assignedToId: { in: teamUserIds } }, { createdBy: { in: teamUserIds } }] } : {};
            const [actByStatus, actByType, actOverdue] = await Promise.all([
                prisma.contactActivity.groupBy({
                    by: ['status'],
                    where: { workspaceId, ...actDateFilter, ...teamActFilter },
                    _count: true
                }),
                prisma.contactActivity.groupBy({
                    by: ['type'],
                    where: { workspaceId, ...actDateFilter, ...teamActFilter },
                    _count: true
                }),
                prisma.contactActivity.count({
                    where: {
                        workspaceId,
                        status: 'PLANNED',
                        dueDate: { lt: new Date() },
                        ...teamActFilter
                    }
                })
            ]);

            const getCount = (obj) => typeof obj?._count === 'number' ? obj._count : (obj?._count?._all || 0);

            activityStats = {
                totalActivities: actByStatus.reduce((sum, a) => sum + getCount(a), 0),
                plannedCount: getCount(actByStatus.find(a => a.status === 'PLANNED')),
                completedCount: getCount(actByStatus.find(a => a.status === 'COMPLETED')),
                inProgressCount: getCount(actByStatus.find(a => a.status === 'IN_PROGRESS')),
                cancelledCount: getCount(actByStatus.find(a => a.status === 'CANCELLED')),
                overdueCount: actOverdue,
                callCount: getCount(actByType.find(a => a.type === 'CALL')),
                meetingCount: getCount(actByType.find(a => a.type === 'MEETING')),
                taskCount: getCount(actByType.find(a => a.type === 'TASK')),
                noteCount: getCount(actByType.find(a => a.type === 'NOTE')),
                visitCount: getCount(actByType.find(a => a.type === 'VISIT'))
            };
        } catch (e) {
            console.error('Activity stats error (non-fatal):', e.message);
        }

        // ── Meeting Stats (CEO Dashboard — Görüşmeler kırılımı) ──
        let meetingStats = { total: 0, planned: 0, completed: 0, overdue: 0, cancelled: 0 };
        try {
            const meetActDateFilter = {};
            if (startDate || endDate) {
                meetActDateFilter.createdAt = {};
                if (startDate) meetActDateFilter.createdAt.gte = parseDateStartTR(startDate);
                if (endDate) meetActDateFilter.createdAt.lte = parseDateEndTR(endDate);
            }
            const teamMeetFilter = teamUserIds ? { OR: [{ assignedToId: { in: teamUserIds } }, { createdBy: { in: teamUserIds } }] } : {};
            const [meetByStatus, meetOverdue] = await Promise.all([
                prisma.contactActivity.groupBy({
                    by: ['status'],
                    where: { workspaceId, type: 'MEETING', ...meetActDateFilter, ...teamMeetFilter },
                    _count: true
                }),
                prisma.contactActivity.count({
                    where: {
                        workspaceId,
                        type: 'MEETING',
                        status: 'PLANNED',
                        dueDate: { lt: new Date() },
                        ...teamMeetFilter
                    }
                })
            ]);
            const getMC = (obj) => typeof obj?._count === 'number' ? obj._count : (obj?._count?._all || 0);
            meetingStats = {
                total: meetByStatus.reduce((sum, a) => sum + getMC(a), 0),
                planned: getMC(meetByStatus.find(a => a.status === 'PLANNED')),
                completed: getMC(meetByStatus.find(a => a.status === 'COMPLETED')),
                overdue: meetOverdue,
                cancelled: getMC(meetByStatus.find(a => a.status === 'CANCELLED'))
            };
        } catch (e) {
            console.error('Meeting stats error (non-fatal):', e.message);
        }

        // ── Gelen Talep Analizi (aiTopic bazlı + AI sınıflandırma) ──
        let requestAnalysis = { topics: [], totalRequests: 0, withPhoneCount: 0, calledCount: 0, relevantCount: 0 };
        try {
            // Seçili tarih aralığında oluşturulan kişilerin konuşmalarından aiTopic çek
            const topicConversations = await prisma.conversation.findMany({
                where: {
                    workspaceId,
                    aiTopic: { not: null },
                    ...(startDate || endDate ? {
                        createdAt: {
                            ...(startDate ? { gte: parseDateStartTR(startDate) } : {}),
                            ...(endDate ? { lte: parseDateEndTR(endDate) } : {})
                        }
                    } : {})
                },
                select: {
                    id: true,
                    aiTopic: true,
                    contactId: true,
                    contact: {
                        select: {
                            id: true,
                            phone: true,
                            status: true,
                            funnelStageId: true
                        }
                    }
                }
            });

            // Step 1: Topic bazlı ham gruplama
            const topicMap = {};
            const seenContactsByTopic = {};
            for (const conv of topicConversations) {
                const topic = conv.aiTopic?.trim();
                if (!topic) continue;
                if (!topicMap[topic]) {
                    topicMap[topic] = { topic, count: 0, withPhone: 0, called: 0, relevant: 0, contactIds: new Set(), stageDist: {} };
                    seenContactsByTopic[topic] = new Set();
                }
                // Aynı kişi birden fazla konuşma açmış olabilir, unique say
                if (seenContactsByTopic[topic].has(conv.contactId)) continue;
                seenContactsByTopic[topic].add(conv.contactId);

                const t = topicMap[topic];
                t.count++;
                t.contactIds.add(conv.contactId);
                if (conv.contact?.phone && conv.contact.phone.trim()) {
                    t.withPhone++;
                }
                // Aranan mı? calledContactIds set'ini kullan (yukarıda zaten hesaplanmış)
                if (calledContactIds.has(conv.contactId)) {
                    t.called++;
                }
                // İlgili mi? (status OPPORTUNITY, HOT_OPPORTUNITY, MEETING_PLANNED, PROPOSAL, CONVERTED ise ilgili say)
                const relevantStatuses = ['OPPORTUNITY', 'HOT_OPPORTUNITY', 'MEETING_PLANNED', 'PROPOSAL', 'CONVERTED'];
                if (relevantStatuses.includes(conv.contact?.status)) {
                    t.relevant++;
                }
                // Track stage distribution
                const stageId = conv.contact?.funnelStageId;
                if (stageId && stageLookup[stageId]) {
                    const sName = stageLookup[stageId].name;
                    if (!t.stageDist[sName]) t.stageDist[sName] = { count: 0, color: stageLookup[stageId].color };
                    t.stageDist[sName].count++;
                } else {
                    if (!t.stageDist['Atanmamış']) t.stageDist['Atanmamış'] = { count: 0, color: '#94a3b8' };
                    t.stageDist['Atanmamış'].count++;
                }
            }

            const rawTopics = Object.keys(topicMap);

            // Step 2: AI sınıflandırma — benzer konuları birleştir
            let topicsArray;
            const aiMapping = rawTopics.length > 2 ? await classifyTopicsWithAI(workspaceId, rawTopics) : null;
            
            if (aiMapping && Object.keys(aiMapping).length > 0) {
                // AI sınıflandırma başarılı — kategorilere göre birleştir
                const categoryMap = {};
                for (const [rawTopic, rawData] of Object.entries(topicMap)) {
                    const category = aiMapping[rawTopic] || rawTopic; // fallback to raw if not mapped
                    if (!categoryMap[category]) {
                        categoryMap[category] = { topic: category, count: 0, withPhone: 0, called: 0, relevant: 0, mergedTopics: [], contactIds: new Set(), stageDist: {} };
                    }
                    const cat = categoryMap[category];
                    cat.count += rawData.count;
                    cat.withPhone += rawData.withPhone;
                    cat.called += rawData.called;
                    cat.relevant += rawData.relevant;
                    cat.mergedTopics.push(rawTopic);
                    rawData.contactIds.forEach(id => cat.contactIds.add(id));
                    // Merge stage distribution
                    for (const [sName, sData] of Object.entries(rawData.stageDist || {})) {
                        if (!cat.stageDist[sName]) cat.stageDist[sName] = { count: 0, color: sData.color };
                        cat.stageDist[sName].count += sData.count;
                    }
                }
                topicsArray = Object.values(categoryMap)
                    .map(t => ({ topic: t.topic, count: t.count, withPhone: t.withPhone, called: t.called, relevant: t.relevant, mergedTopics: t.mergedTopics, stageDist: t.stageDist }))
                    .sort((a, b) => b.count - a.count);
                console.log(`🤖 [TopicAI] ${rawTopics.length} raw topics → ${topicsArray.length} categories`);
            } else {
                // AI kullanılamadı — ham topicler olduğu gibi
                topicsArray = Object.values(topicMap)
                    .map(t => ({ topic: t.topic, count: t.count, withPhone: t.withPhone, called: t.called, relevant: t.relevant, stageDist: t.stageDist }))
                    .sort((a, b) => b.count - a.count);
            }

            const recentConvList = await prisma.conversation.findMany({
                where: {
                    workspaceId,
                    aiTopic: { not: null }
                },
                take: 5,
                orderBy: { createdAt: 'desc' },
                include: {
                    contact: {
                        select: {
                            id: true,
                            name: true,
                            phone: true,
                            status: true
                        }
                    }
                }
            });

            const recentRequests = recentConvList.map(c => ({
                id: c.id,
                topic: c.aiTopic,
                createdAt: c.createdAt,
                contactName: c.contact?.name || 'Bilinmeyen Müşteri',
                phone: c.contact?.phone || '—',
                status: c.contact?.status || 'NEW'
            }));

            requestAnalysis = {
                topics: topicsArray,
                totalRequests: topicsArray.reduce((s, t) => s + t.count, 0),
                withPhoneCount: topicsArray.reduce((s, t) => s + t.withPhone, 0),
                calledCount: topicsArray.reduce((s, t) => s + t.called, 0),
                relevantCount: topicsArray.reduce((s, t) => s + t.relevant, 0),
                aiClassified: !!(aiMapping && Object.keys(aiMapping).length > 0),
                recentRequests,
                stageDistribution: (() => {
                    const overallStageDist = {};
                    for (const t of topicsArray) {
                        for (const [sName, sData] of Object.entries(t.stageDist || {})) {
                            if (!overallStageDist[sName]) overallStageDist[sName] = { count: 0, color: sData.color };
                            overallStageDist[sName].count += sData.count;
                        }
                    }
                    return overallStageDist;
                })()
            };
        } catch (e) {
            console.error('Request analysis error (non-fatal):', e.message);
        }

        // ── Previous Period Comparison ──
        let previousPeriod = null;
        const { comparePrevious } = req.query;
        if (comparePrevious === 'true' && startDate && endDate) {
            try {
                const sDate = new Date(startDate + 'T00:00:00Z');
                const eDate = new Date(endDate + 'T00:00:00Z');
                const durationMs = eDate.getTime() - sDate.getTime() + 86400000; // include end day
                const prevEnd = new Date(sDate.getTime() - 86400000); // day before start
                const prevStart = new Date(prevEnd.getTime() - durationMs + 86400000);
                const toStr = (d) => d.toISOString().slice(0, 10);
                const prevDateFilter = {
                    createdAt: {
                        gte: parseDateStartTR(toStr(prevStart)),
                        lte: parseDateEndTR(toStr(prevEnd))
                    }
                };
                const prevContactWhere = {
                    isDeleted: false,
                    conversations: { some: { workspaceId, ...(teamUserIds ? { assignedToId: { in: teamUserIds } } : {}) } },
                    ...prevDateFilter
                };
                if (funnelId && activeFunnel) {
                    const stageIds = activeFunnel.stages.map(s => s.id);
                    prevContactWhere.funnelStageId = { in: stageIds };
                }

                // Phone contact where for previous period
                const prevPhoneContactWhere = {
                    OR: [
                        { workspaceId },
                        { conversations: { some: { workspaceId, ...(teamUserIds ? { assignedToId: { in: teamUserIds } } : {}) } } }
                    ],
                    isDeleted: false,
                    phone: { not: null },
                    NOT: { phone: '' },
                    createdAt: prevDateFilter.createdAt
                };

                // Completed calls in previous period
                const prevCallActivities = await prisma.contactActivity.findMany({
                    where: {
                        workspaceId,
                        type: 'CALL',
                        status: 'COMPLETED',
                        createdAt: prevDateFilter.createdAt,
                        ...(teamUserIds ? { OR: [{ assignedToId: { in: teamUserIds } }, { createdBy: { in: teamUserIds } }] } : {})
                    },
                    select: { contactId: true }
                });
                const prevCalledContactIds = new Set(prevCallActivities.map(a => a.contactId));

                const [prevContacts, prevMsgs, prevPhoneContactsList, prevOrdersAgg] = await Promise.all([
                    prisma.contact.count({ where: prevContactWhere }),
                    prisma.message.count({ 
                        where: { 
                            conversation: { workspaceId, ...(teamUserIds ? { assignedToId: { in: teamUserIds } } : {}) }, 
                            ...prevDateFilter 
                        } 
                    }),
                    prisma.contact.findMany({
                        where: prevPhoneContactWhere,
                        select: { id: true }
                    }),
                    prisma.deal.aggregate({
                        where: {
                            workspaceId,
                            stage: 'ORDER',
                            createdAt: prevDateFilter.createdAt,
                            ...(teamUserIds ? { assignedToId: { in: teamUserIds } } : {})
                        },
                        _count: true,
                        _sum: { amount: true }
                    })
                ]);

                const prevCalledCount = prevPhoneContactsList.filter(c => prevCalledContactIds.has(c.id)).length;

                previousPeriod = {
                    totalContacts: prevContacts,
                    totalMessages: prevMsgs,
                    totalCalled: prevCalledCount,
                    totalOrders: prevOrdersAgg._count || 0,
                    orderAmount: prevOrdersAgg._sum?.amount || 0
                };
            } catch (prevErr) {
                console.error('Previous period comparison error (non-fatal):', prevErr.message);
            }
        }

        // ── AI Call Stats (RetellCall) ──
        let aiCallStats = {
            totalCalls: 0,
            successfulCount: 0,
            totalCost: 0,
            totalDuration: 0,
            avgDuration: 0,
            successRate: 0,
            statusBreakdown: {},
            sentimentBreakdown: {}
        };
        try {
            const aiCallDateFilter = {};
            if (startDate || endDate) {
                aiCallDateFilter.createdAt = {};
                if (startDate) aiCallDateFilter.createdAt.gte = parseDateStartTR(startDate);
                if (endDate) aiCallDateFilter.createdAt.lte = parseDateEndTR(endDate);
            }
            const aiCallWhere = { workspaceId, ...aiCallDateFilter };

            const callsList = await prisma.retellCall.findMany({
                where: aiCallWhere,
                select: {
                    status: true,
                    sentiment: true,
                    duration: true,
                    cost: true,
                    callSuccessful: true
                }
            });

            const totalCalls = callsList.length;
            const totalDuration = callsList.reduce((sum, c) => sum + (c.duration || 0), 0);
            const avgDuration = totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0;
            const successfulCount = callsList.filter(c => c.callSuccessful).length;
            const successRate = totalCalls > 0 ? Math.round((successfulCount / totalCalls) * 100) : 0;
            const totalCost = callsList.reduce((sum, c) => sum + ((c.cost || 0) / 100), 0);

            const statusBreakdown = {};
            callsList.forEach(c => {
                const s = c.status || 'unknown';
                statusBreakdown[s] = (statusBreakdown[s] || 0) + 1;
            });

            const sentimentBreakdown = {};
            callsList.forEach(c => {
                if (c.sentiment) {
                    const s = c.sentiment.toLowerCase();
                    const normalized = s === 'positive' ? 'positive' : s === 'negative' ? 'negative' : 'neutral';
                    sentimentBreakdown[normalized] = (sentimentBreakdown[normalized] || 0) + 1;
                }
            });

            aiCallStats = {
                totalCalls,
                successfulCount,
                totalCost,
                totalDuration,
                avgDuration,
                successRate,
                statusBreakdown,
                sentimentBreakdown
            };
        } catch (aiErr) {
            console.error('AI Call stats error (non-fatal):', aiErr.message);
        }

        // ── Heatmap Data (from messages — database-level aggregation for high performance) ──
        let heatmapData = Array.from({ length: 7 }, () => Array(24).fill(0));
        try {
            let query = `
                SELECT 
                    EXTRACT(DOW FROM m."createdAt" + interval '3 hours')::integer AS dow,
                    EXTRACT(HOUR FROM m."createdAt" + interval '3 hours')::integer AS hour,
                    COUNT(*)::integer AS count
                FROM messages m
                INNER JOIN conversations c ON m."conversationId" = c.id
                WHERE c."workspaceId" = $1
            `;
            const params = [workspaceId];
            
            if (startDate) {
                params.push(parseDateStartTR(startDate));
                query += ` AND m."createdAt" >= $${params.length}`;
            }
            if (endDate) {
                params.push(parseDateEndTR(endDate));
                query += ` AND m."createdAt" <= $${params.length}`;
            }
            
            query += ` GROUP BY dow, hour`;
            
            const rawHeatmap = await prisma.$queryRawUnsafe(query, ...params);
            for (const row of rawHeatmap) {
                const day = row.dow; // 0-6 (0=Sun)
                const hr = row.hour; // 0-23
                if (day >= 0 && day < 7 && hr >= 0 && hr < 24) {
                    heatmapData[day][hr] = row.count || 0;
                }
            }
        } catch (hmErr) {
            console.error('Heatmap data error (non-fatal):', hmErr.message);
        }

        res.json({
            totalContacts,
            withPhoneCount,
            totalMessages,
            totalAiMessages,
            totalHumanMessages,
            totalConversations,
            botLedConversations,
            handoffConversations,
            handoffRate: botLedConversations > 0 ? ((handoffConversations / botLedConversations) * 100).toFixed(1) : 0,
            conversionRate: parseFloat(conversionRate),
            resolutionRate: parseFloat(realResolutionRate),
            resolvedCount: resolvedConvs,
            statusData,
            funnelSummary,
            channelData: Object.entries(channelCounts).map(([k, v]) => ({ channel: k, count: v })),
            monthlyData,
            appointmentStats: {
                total: totalAppointments + stageBasedAppointments,
                byBot: botAppointments,
                byAgent: agentAppointments + stageBasedAppointments,
                scheduled: scheduledAppointments,
                completed: completedAppointments,
                cancelled: cancelledAppointments,
                overdue: overdueAppointments
            },
            meetingStats,
            callTrackingStats,
            dealStats,
            activityStats,
            requestAnalysis,
            aiCallStats,
            heatmapData,
            previousPeriod
        });
    } catch (error) {
        console.error('Analytics error:', error);
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
};



// Get agent performance metrics
export const getAgentPerformance = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { startDate, endDate, teamId } = req.query;

        console.log(`📊 [Agent Performance] Getting metrics for workspace: ${workspaceId}${teamId ? ` (Team: ${teamId})` : ''}`);

        // Resolve team member user IDs (null = no team filter)
        const teamUserIds = await getTeamUserIds(teamId);

        // Build date filter — use Turkey timezone (UTC+3)
        let dateFilter = {};
        if (startDate || endDate) {
            dateFilter.createdAt = {};
            if (startDate) dateFilter.createdAt.gte = parseDateStartTR(startDate);
            if (endDate) dateFilter.createdAt.lte = parseDateEndTR(endDate);
        }

        // Get workspace members (agents) — filtered by team if teamId provided
        let workspaceMembers = await prisma.workspaceMember.findMany({
            where: { workspaceId },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        avatar: true
                    }
                }
            }
        });

        // Filter to team members only when teamId is provided
        if (teamUserIds) {
            workspaceMembers = workspaceMembers.filter(m => teamUserIds.includes(m.user.id));
        }

        const teamMemberships = await prisma.teamMember.findMany({
            where: {
                team: { workspaceId }
            },
            select: {
                userId: true,
                team: {
                    select: {
                        id: true,
                        name: true,
                        color: true
                    }
                }
            }
        });

        const agentMetrics = [];

        // Build activity date filter (separate from conversation dateFilter)
        const activityDateFilter = {};
        if (startDate || endDate) {
            activityDateFilter.createdAt = {};
            if (startDate) activityDateFilter.createdAt.gte = parseDateStartTR(startDate);
            if (endDate) activityDateFilter.createdAt.lte = parseDateEndTR(endDate);
        }

        for (const member of workspaceMembers) {
            const userId = member.user.id;

            // Toplam işlem: agent'ın atandığı VEYA çözdüğü konuşmalar (unique)
            // Prisma'da OR + distinct desteklenmiyor, 2 sorgu alıp birleştiriyoruz
            const [assignedConvIds, resolvedConvIds] = await Promise.all([
                prisma.conversation.findMany({
                    where: { workspaceId, assignedToId: userId, ...dateFilter },
                    select: { id: true }
                }),
                prisma.conversation.findMany({
                    where: { workspaceId, resolvedById: userId, status: 'RESOLVED', ...dateFilter },
                    select: { id: true }
                })
            ]);
            const uniqueConvIds = [...new Set([
                ...assignedConvIds.map(c => c.id),
                ...resolvedConvIds.map(c => c.id)
            ])];
            const totalConversations = uniqueConvIds.length;

            // Çözülen konuşmalar (bu agent'ın çözdükleri)
            const resolvedConversations = resolvedConvIds.length;

            // Get open conversations (assigned to this user)
            const openConversations = await prisma.conversation.count({
                where: {
                    workspaceId,
                    assignedToId: userId,
                    status: 'OPEN',
                    ...dateFilter
                }
            });

            // Get total messages sent by this agent
            const messagesSent = await prisma.message.count({
                where: {
                    senderId: userId,
                    isFromContact: false,
                    conversation: {
                        workspaceId
                    },
                    ...dateFilter
                }
            });

            // Calculate average response time using all conversations this agent was involved in
            const conversationsWithMessages = await prisma.conversation.findMany({
                where: {
                    workspaceId,
                    id: { in: uniqueConvIds }
                },
                include: {
                    messages: {
                        orderBy: { createdAt: 'asc' },
                        select: {
                            id: true,
                            isFromContact: true,
                            senderId: true,
                            createdAt: true
                        }
                    }
                }
            });

            let totalResponseTime = 0;
            let responseCount = 0;

            for (const conv of conversationsWithMessages) {
                const messages = conv.messages;

                for (let i = 0; i < messages.length - 1; i++) {
                    const currentMsg = messages[i];
                    const nextMsg = messages[i + 1];

                    // If customer message followed by agent response
                    if (currentMsg.isFromContact && !nextMsg.isFromContact && nextMsg.senderId === userId) {
                        const responseTime = new Date(nextMsg.createdAt) - new Date(currentMsg.createdAt);
                        totalResponseTime += responseTime;
                        responseCount++;
                    }
                }
            }

            // Calculate average response time in minutes
            const avgResponseTimeMs = responseCount > 0 ? totalResponseTime / responseCount : 0;
            const avgResponseTimeMinutes = Math.round(avgResponseTimeMs / (1000 * 60));

            // Calculate average resolution time (from conversation creation to resolvedAt)
            // Use resolvedById to track who actually resolved it
            const resolvedConversationsWithTime = await prisma.conversation.findMany({
                where: {
                    workspaceId,
                    resolvedById: userId,
                    status: 'RESOLVED',
                    resolvedAt: { not: null },
                    ...dateFilter
                },
                select: {
                    createdAt: true,
                    resolvedAt: true
                }
            });

            let totalResolutionTime = 0;
            for (const conv of resolvedConversationsWithTime) {
                if (conv.resolvedAt) {
                    totalResolutionTime += new Date(conv.resolvedAt) - new Date(conv.createdAt);
                }
            }
            const avgResolutionTimeMs = resolvedConversationsWithTime.length > 0
                ? totalResolutionTime / resolvedConversationsWithTime.length
                : 0;
            const avgResolutionTimeMinutes = Math.round(avgResolutionTimeMs / (1000 * 60));

            // Calculate resolution rate
            const resolutionRate = totalConversations > 0
                ? Math.round((resolvedConversations / totalConversations) * 100)
                : 0;

            // ── Activity Metrics per Agent ──
            const agentActivities = await prisma.contactActivity.groupBy({
                by: ['type'],
                where: {
                    workspaceId,
                    OR: [
                        { assignedToId: userId },
                        { createdBy: userId }
                    ],
                    ...activityDateFilter
                },
                _count: { id: true }
            });

            const activityCounts = {};
            for (const a of agentActivities) {
                activityCounts[a.type] = a._count.id;
            }

            // ── Deal Metrics per Agent ──
            const agentDeals = await prisma.deal.groupBy({
                by: ['stage', 'status'],
                where: {
                    workspaceId,
                    assignedToId: userId,
                    ...dateFilter
                },
                _count: { id: true },
                _sum: { amount: true }
            });

            let dealQuotes = 0, dealOrders = 0, dealInvoices = 0;
            let dealWon = 0, dealLost = 0, dealOpen = 0;
            let dealTotalAmount = 0, dealWonAmount = 0;
            for (const d of agentDeals) {
                const count = d._count.id;
                const amount = d._sum.amount || 0;
                if (d.stage === 'QUOTE') dealQuotes += count;
                if (d.stage === 'ORDER') dealOrders += count;
                if (d.stage === 'INVOICE') dealInvoices += count;
                if (d.status === 'WON') { dealWon += count; dealWonAmount += amount; }
                if (d.status === 'LOST') dealLost += count;
                if (d.status === 'OPEN') dealOpen += count;
                dealTotalAmount += amount;
            }

            // Group WON deals by product/topic
            const wonDeals = await prisma.deal.findMany({
                where: {
                    workspaceId,
                    assignedToId: userId,
                    status: 'WON',
                    ...dateFilter
                },
                select: {
                    title: true,
                    products: true,
                    amount: true
                }
            });

            const salesByProduct = {};
            const normalizeProductName = (rawName) => {
                let name = (rawName || 'Bilinmeyen Ürün').trim().toLocaleUpperCase('tr-TR');
                const dogumVariants = ['DOGUM PAKETİ', 'DOGUM PAKETI', 'DOĞUM', 'DOĞUM PAKET', 'DOGUM PAKET', 'DOGUM'];
                if (dogumVariants.includes(name)) return 'DOĞUM PAKETİ';
                // Remove trailing dashes or spaces
                return name.replace(/\s*-\s*$/, '');
            };

            for (const d of wonDeals) {
                let parsedProducts = [];
                try {
                    parsedProducts = JSON.parse(d.products || '[]');
                } catch (e) {}

                if (parsedProducts.length > 0) {
                    for (const p of parsedProducts) {
                        const name = normalizeProductName(p.name);
                        if (!salesByProduct[name]) salesByProduct[name] = { count: 0, amount: 0 };
                        salesByProduct[name].count += (p.quantity || 1);
                        salesByProduct[name].amount += (p.total || (p.unitPrice * (p.quantity || 1)) || 0);
                    }
                } else {
                    // Fallback to title if no products attached
                    const name = normalizeProductName(d.title);
                    if (!salesByProduct[name]) salesByProduct[name] = { count: 0, amount: 0 };
                    salesByProduct[name].count += 1;
                    salesByProduct[name].amount += (d.amount || 0);
                }
            }

            // ── Randevu Sayısı (appointment tablosu + aşama değişikliği) ──
            const appointmentFromTable = await prisma.appointment.count({
                where: {
                    workspaceId,
                    OR: [
                        { assignedToId: userId },
                        { createdById: userId }
                    ],
                    ...activityDateFilter
                }
            });

            // Agent'ın "Randevu" aşamasına taşıdığı kişiler (STAGE_CHANGED event'leri)
            let appointmentFromStage = 0;
            try {
                const stageEvents = await prisma.conversationEvent.count({
                    where: {
                        workspaceId,
                        eventType: 'STAGE_CHANGED',
                        actorId: userId,
                        title: { contains: 'Randevu' },
                        ...activityDateFilter
                    }
                });
                appointmentFromStage = stageEvents;
            } catch (e) {
                // ConversationEvent tablosu yoksa sessizce devam et
            }

            const appointmentCount = appointmentFromTable + appointmentFromStage;

            // ── AI Arama Sayısı (RetellCall) ──
            const retellCallCount = await prisma.retellCall.count({
                where: {
                    workspaceId,
                    createdById: userId,
                    ...activityDateFilter
                }
            });

            const myTeams = teamMemberships
                .filter(tm => tm.userId === userId)
                .map(tm => tm.team);

            // ── Topic Breakdown per Agent ──
            const agentTopicConvs = await prisma.conversation.findMany({
                where: { workspaceId, assignedToId: userId, aiTopic: { not: null }, ...dateFilter },
                select: {
                    aiTopic: true,
                    contactId: true,
                    contact: { select: { funnelStageId: true, status: true } }
                }
            });

            const topicBreakdown = {};
            const seenTopicContacts = {};
            for (const c of agentTopicConvs) {
                const t = c.aiTopic.trim();
                if (!topicBreakdown[t]) {
                    topicBreakdown[t] = { count: 0, converted: 0, opportunity: 0, stages: {} };
                    seenTopicContacts[t] = new Set();
                }
                if (seenTopicContacts[t].has(c.contactId)) continue;
                seenTopicContacts[t].add(c.contactId);
                topicBreakdown[t].count++;
                const status = c.contact?.status;
                if (status === 'CONVERTED') topicBreakdown[t].converted++;
                if (['OPPORTUNITY', 'HOT_OPPORTUNITY', 'MEETING_PLANNED', 'PROPOSAL'].includes(status)) topicBreakdown[t].opportunity++;
            }

            // Match WON deals to topics via contact's aiTopic
            const agentWonDealContacts = await prisma.deal.findMany({
                where: { workspaceId, assignedToId: userId, status: 'WON', ...dateFilter },
                select: {
                    amount: true,
                    contact: {
                        select: {
                            conversations: {
                                where: { workspaceId, aiTopic: { not: null } },
                                select: { aiTopic: true },
                                take: 1,
                                orderBy: { createdAt: 'desc' }
                            }
                        }
                    }
                }
            });

            for (const deal of agentWonDealContacts) {
                const aiTopic = deal.contact?.conversations?.[0]?.aiTopic?.trim();
                if (aiTopic && topicBreakdown[aiTopic]) {
                    if (!topicBreakdown[aiTopic].wonAmount) topicBreakdown[aiTopic].wonAmount = 0;
                    if (!topicBreakdown[aiTopic].wonCount) topicBreakdown[aiTopic].wonCount = 0;
                    topicBreakdown[aiTopic].wonAmount += (deal.amount || 0);
                    topicBreakdown[aiTopic].wonCount++;
                }
            }

            agentMetrics.push({
                userId: member.user.id,
                name: member.user.name,
                email: member.user.email,
                avatar: member.user.avatar,
                role: member.role,
                totalConversations,
                resolvedConversations,
                openConversations,
                messagesSent,
                avgResponseTimeMinutes,
                avgResolutionTimeMinutes,
                resolutionRate: Math.min(resolutionRate, 100),
                // Activity metrics
                callCount: (activityCounts['CALL'] || 0) + retellCallCount,
                retellCallCount,
                meetingCount: activityCounts['MEETING'] || 0,
                // Deal metrics
                dealQuotes,
                dealOrders,
                dealInvoices,
                dealWon,
                dealLost,
                dealOpen,
                dealTotalAmount,
                dealWonAmount,
                salesByProduct,
                topicBreakdown,
                // Randevu
                appointmentCount,
                teams: myTeams
            });
        }

        // Sort by total conversations (most active first)
        agentMetrics.sort((a, b) => b.totalConversations - a.totalConversations);

        // ========== BOT PERFORMANCE ==========
        // Get all bots in this workspace
        const bots = await prisma.aIBot.findMany({
            where: { workspaceId },
            select: { id: true, name: true, role: true, isActive: true }
        });

        const botTeamMemberships = await prisma.teamMember.findMany({
            where: {
                team: { workspaceId },
                botId: { not: null }
            },
            select: {
                botId: true,
                team: {
                    select: {
                        id: true,
                        name: true,
                        color: true
                    }
                }
            }
        });

        const botMetrics = [];

        for (const bot of bots) {
            // Get messages sent by this bot (senderId is null but has assigned bot reference in conversation)
            // Bot messages are tracked via conversation's assignedBotId
            const botMessages = await prisma.message.count({
                where: {
                    isFromContact: false,
                    senderId: null, // Bot mesajları - kullanıcı olmadan gönderilen
                    conversation: {
                        workspaceId,
                        assignedBotId: bot.id
                    },
                    ...dateFilter
                }
            });

            // Alternative: Count all bot messages (senderId null) in workspace
            // This is a fallback if assignedBotId is not set
            const allBotMessagesInWorkspace = await prisma.message.count({
                where: {
                    isFromContact: false,
                    senderId: null,
                    conversation: {
                        workspaceId
                    },
                    ...dateFilter
                }
            });

            const totalBotConversations = await prisma.conversation.count({
                where: {
                    workspaceId,
                    OR: [
                        { assignedBotId: bot.id },
                        { whatsappPhoneNumber: { assignedBotId: bot.id } },
                        { facebookPage: { assignedBotId: bot.id } },
                        { facebookPage: { instagramBotId: bot.id } }
                    ],
                    ...dateFilter
                }
            });

            const myBotTeams = botTeamMemberships
                .filter(tm => tm.botId === bot.id)
                .map(tm => tm.team);

            botMetrics.push({
                botId: bot.id,
                name: bot.name,
                role: bot.role,
                isActive: bot.isActive,
                isBot: true,
                messagesSent: botMessages || 0,
                totalConversations: totalBotConversations,
                // Bots don't "resolve" - they assist
                resolvedConversations: 0,
                openConversations: totalBotConversations,
                teams: myBotTeams
            });
        }

        // If there are bot messages but no specific bot assignment found, show total
        const totalBotMessages = await prisma.message.count({
            where: {
                isFromContact: false,
                senderId: null,
                conversation: { workspaceId },
                ...dateFilter
            }
        });

        // Sort bots by messages sent
        botMetrics.sort((a, b) => b.messagesSent - a.messagesSent);

        // Calculate team totals
        const agentsWithResponseTime = agentMetrics.filter(a => a.avgResponseTimeMinutes > 0);
        const agentsWithResolutionTime = agentMetrics.filter(a => a.avgResolutionTimeMinutes > 0);

        const teamTotals = {
            totalConversations: agentMetrics.reduce((sum, a) => sum + a.totalConversations, 0),
            resolvedConversations: agentMetrics.reduce((sum, a) => sum + a.resolvedConversations, 0),
            openConversations: agentMetrics.reduce((sum, a) => sum + a.openConversations, 0),
            totalMessages: agentMetrics.reduce((sum, a) => sum + a.messagesSent, 0),
            avgResponseTime: agentsWithResponseTime.length > 0
                ? Math.round(agentsWithResponseTime.reduce((sum, a) => sum + a.avgResponseTimeMinutes, 0) / agentsWithResponseTime.length)
                : 0,
            avgResolutionTime: agentsWithResolutionTime.length > 0
                ? Math.round(agentsWithResolutionTime.reduce((sum, a) => sum + a.avgResolutionTimeMinutes, 0) / agentsWithResolutionTime.length)
                : 0,
            avgResolutionRate: agentMetrics.length > 0
                ? Math.round(agentMetrics.reduce((sum, a) => sum + a.resolutionRate, 0) / agentMetrics.length)
                : 0,
            // Bot totals
            totalBotMessages
        };

        // Retrieve teams in the workspace and their conversation counts
        const teamList = await prisma.team.findMany({
            where: { workspaceId },
            include: {
                members: {
                    select: {
                        userId: true,
                        botId: true
                    }
                }
            }
        });

        const teamsMetrics = [];
        for (const t of teamList) {
            const memberUserIds = t.members.filter(m => m.userId).map(m => m.userId);
            const conversationCount = await prisma.conversation.count({
                where: {
                    workspaceId,
                    OR: [
                        { assignedTeamId: t.id },
                        ...(memberUserIds.length > 0 ? [{ assignedToId: { in: memberUserIds } }] : [])
                    ],
                    ...dateFilter
                }
            });

            teamsMetrics.push({
                id: t.id,
                name: t.name,
                color: t.color,
                description: t.description,
                agentCount: memberUserIds.length,
                botCount: t.members.filter(m => m.botId).length,
                conversationCount
            });
        }

        console.log(`✅ [Agent Performance] Found ${agentMetrics.length} agents, ${botMetrics.length} bots, ${teamsMetrics.length} teams`);

        res.json({
            agents: agentMetrics,
            bots: botMetrics,
            teamTotals,
            teams: teamsMetrics
        });
    } catch (error) {
        console.error('Agent performance error:', error);
        res.status(500).json({ error: 'Failed to fetch agent performance metrics' });
    }
};

// Daily contact stats - shows how many contacts came per day with phone/no-phone breakdown
export const getDailyContactStats = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { days = 30, startDate: qStart, endDate: qEnd, teamId } = req.query;

        // Resolve team member user IDs (null = no team filter)
        const teamUserIds = await getTeamUserIds(teamId);

        let startDate, endDate;
        if (qStart) {
            startDate = parseDateStartTR(qStart);
            endDate = qEnd ? parseDateEndTR(qEnd) : new Date();
        } else {
            const daysCount = Math.min(parseInt(days) || 30, 90);
            // Calculate "daysCount ago at 00:00 Turkey time"
            const nowTR = new Date(Date.now() + TZ_OFFSET_MS);
            const startTR = new Date(Date.UTC(nowTR.getUTCFullYear(), nowTR.getUTCMonth(), nowTR.getUTCDate() - daysCount));
            startDate = new Date(startTR.getTime() - TZ_OFFSET_MS);
            endDate = new Date();
        }

        const daysCount = Math.max(1, Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)));

        // Get all contacts created in the date range for this workspace
        const contactsWhere = {
            createdAt: { gte: startDate, lte: endDate },
            isDeleted: false,
        };
        if (teamUserIds) {
            // When team filter is active, only get contacts with conversations assigned to team members
            contactsWhere.conversations = { some: { workspaceId, assignedToId: { in: teamUserIds } } };
        } else {
            contactsWhere.OR = [
                { workspaceId },
                { conversations: { some: { workspaceId } } }
            ];
        }
        const contacts = await prisma.contact.findMany({
            where: contactsWhere,
            select: {
                id: true,
                phone: true,
                createdAt: true
            }
        });

        // Build daily stats map — use Turkey timezone for date keys
        const dailyMap = {};
        for (let i = 0; i < daysCount; i++) {
            const d = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
            const trDate = new Date(d.getTime() + TZ_OFFSET_MS);
            const key = trDate.toISOString().split('T')[0]; // YYYY-MM-DD in Turkey time
            dailyMap[key] = { date: key, total: 0, withPhone: 0, withoutPhone: 0 };
        }

        for (const contact of contacts) {
            const trDate = new Date(contact.createdAt.getTime() + TZ_OFFSET_MS);
            const key = trDate.toISOString().split('T')[0]; // Turkey date
            if (dailyMap[key]) {
                dailyMap[key].total++;
                if (contact.phone && contact.phone.trim() !== '') {
                    dailyMap[key].withPhone++;
                } else {
                    dailyMap[key].withoutPhone++;
                }
            }
        }

        const dailyStats = Object.values(dailyMap);
        const totals = {
            total: contacts.length,
            withPhone: contacts.filter(c => c.phone && c.phone.trim() !== '').length,
            withoutPhone: contacts.filter(c => !c.phone || c.phone.trim() === '').length
        };

        res.json({ dailyStats, totals, days: daysCount });
    } catch (error) {
        console.error('Daily contact stats error:', error);
        res.status(500).json({ error: 'Günlük istatistikler alınamadı' });
    }
};

// Delete contact (soft delete - marks as deleted but keeps in database)
// Only SUPER_ADMIN can delete contacts
export const deleteContact = async (req, res) => {
    try {
        const { workspaceId, id } = req.params;

        // Only SUPER_ADMIN can delete contacts
        if (req.user.role !== 'SUPER_ADMIN') {
            return res.status(403).json({ error: 'Sadece SuperAdmin kişi silebilir.' });
        }

        console.log(`🗑️ [Delete Contact] START (hard delete) - ID: ${id}`);

        // Verify contact belongs to this workspace
        const existing = await prisma.contact.findFirst({
            where: {
                id,
                OR: [
                    { workspaceId: workspaceId },
                    { conversations: { some: { workspaceId: workspaceId } } }
                ]
            },
            include: {
                conversations: { select: { id: true } }
            }
        });
        if (!existing) {
            return res.status(404).json({ error: 'Contact not found' });
        }

        // 1. Tüm sohbetlerin mesajlarını, notlarını ve transferlerini sil
        const convIds = existing.conversations.map(c => c.id);
        if (convIds.length > 0) {
            const msgDeleted = await prisma.message.deleteMany({
                where: { conversationId: { in: convIds } }
            });
            console.log(` - Deleted ${msgDeleted.count} messages`);

            const notesDeleted = await prisma.internalNote.deleteMany({
                where: { conversationId: { in: convIds } }
            });
            console.log(` - Deleted ${notesDeleted.count} internal notes`);

            const transfersDeleted = await prisma.conversationTransfer.deleteMany({
                where: { conversationId: { in: convIds } }
            });
            console.log(` - Deleted ${transfersDeleted.count} transfers`);

            // RetellCall conversationId temizle
            await prisma.retellCall.updateMany({
                where: { conversationId: { in: convIds } },
                data: { conversationId: null }
            });
        }

        // 2. Sohbetleri sil
        const convDeleted = await prisma.conversation.deleteMany({
            where: { contactId: id }
        });
        console.log(` - Deleted ${convDeleted.count} conversations`);

        // 3. Bağlı kayıtları sil
        const activitiesDeleted = await prisma.contactActivity.deleteMany({
            where: { contactId: id }
        });
        console.log(` - Deleted ${activitiesDeleted.count} activities`);

        const retellDeleted = await prisma.retellCall.deleteMany({
            where: { contactId: id }
        });
        console.log(` - Deleted ${retellDeleted.count} retell calls`);

        const formsDeleted = await prisma.formSubmission.deleteMany({
            where: { contactId: id }
        });
        console.log(` - Deleted ${formsDeleted.count} form submissions`);

        const dealsDeleted = await prisma.deal.deleteMany({
            where: { contactId: id }
        });
        console.log(` - Deleted ${dealsDeleted.count} deals`);

        const scheduledDeleted = await prisma.scheduledCall.deleteMany({
            where: { contactId: id }
        });
        console.log(` - Deleted ${scheduledDeleted.count} scheduled calls`);

        // 4. Lead kaydını sil (varsa)
        if (existing.facebookId?.startsWith('lead_')) {
            const leadId = existing.facebookId.replace('lead_', '');
            await prisma.facebookLead.deleteMany({ where: { leadId } }).catch(() => {});
        }

        // 5. Kişiyi tamamen sil
        await prisma.contact.delete({
            where: { id }
        });

        // Emit socket event so UI updates in real-time
        emitToWorkspace(workspaceId, 'contact_deleted', {
            contactId: id,
            isDeleted: true
        });

        console.log(`✅ [Delete Contact] SUCCESS (hard delete) - ID: ${id}`);
        res.json({ message: 'Kişi ve tüm verileri tamamen silindi.' });
    } catch (error) {
        console.error('Delete contact error:', error);
        res.status(500).json({ error: 'Failed to delete contact' });
    }
};

// Block a contact
export const blockContact = async (req, res) => {
    try {
        const { workspaceId, id } = req.params;
        const { reason } = req.body;

        console.log(`🚫 [Block Contact] START - Workspace: ${workspaceId}, Contact: ${id}`);

        // Check if contact exists
        const contact = await prisma.contact.findFirst({
            where: {
                id,
                OR: [
                    { workspaceId },
                    { conversations: { some: { workspaceId } } }
                ]
            }
        });

        if (!contact) {
            return res.status(404).json({ error: 'Contact not found' });
        }

        // Update contact to blocked
        const updatedContact = await prisma.contact.update({
            where: { id },
            data: {
                isBlocked: true,
                blockedAt: new Date(),
                blockedReason: reason || null
            }
        });

        // Close all open conversations for this contact in this workspace
        await prisma.conversation.updateMany({
            where: {
                contactId: id,
                workspaceId,
                status: { not: 'CLOSED' }
            },
            data: {
                status: 'CLOSED'
            }
        });

        // Emit socket event
        emitToWorkspace(workspaceId, 'contact_blocked', {
            contactId: id,
            isBlocked: true
        });

        console.log(`✅ [Block Contact] SUCCESS - ID: ${id}`);
        res.json({
            success: true,
            message: 'Kişi engellendi',
            contact: updatedContact
        });
    } catch (error) {
        console.error('Block contact error:', error);
        res.status(500).json({ error: 'Kişi engellenirken hata oluştu' });
    }
};

// Unblock a contact
export const unblockContact = async (req, res) => {
    try {
        const { workspaceId, id } = req.params;

        console.log(`✅ [Unblock Contact] START - Workspace: ${workspaceId}, Contact: ${id}`);

        // Check if contact exists
        const contact = await prisma.contact.findFirst({
            where: {
                id,
                OR: [
                    { workspaceId },
                    { conversations: { some: { workspaceId } } }
                ]
            }
        });

        if (!contact) {
            return res.status(404).json({ error: 'Contact not found' });
        }

        // Update contact to unblocked
        const updatedContact = await prisma.contact.update({
            where: { id },
            data: {
                isBlocked: false,
                blockedAt: null,
                blockedReason: null
            }
        });

        // Emit socket event
        emitToWorkspace(workspaceId, 'contact_unblocked', {
            contactId: id,
            isBlocked: false
        });

        console.log(`✅ [Unblock Contact] SUCCESS - ID: ${id}`);
        res.json({
            success: true,
            message: 'Kişinin engeli kaldırıldı',
            contact: updatedContact
        });
    } catch (error) {
        console.error('Unblock contact error:', error);
        res.status(500).json({ error: 'Engel kaldırılırken hata oluştu' });
    }
};

// Archive contact
export const archiveContact = async (req, res) => {
    try {
        const { workspaceId, id } = req.params;

        // Verify contact belongs to this workspace
        const existing = await prisma.contact.findFirst({
            where: {
                id,
                OR: [
                    { workspaceId: workspaceId },
                    { conversations: { some: { workspaceId: workspaceId } } }
                ]
            }
        });

        if (!existing) {
            return res.status(404).json({ error: 'Kişi bulunamadı' });
        }

        const updatedContact = await prisma.contact.update({
            where: { id },
            data: {
                isArchived: true,
                archivedAt: new Date()
            }
        });

        // Emit socket event
        emitToWorkspace(workspaceId, 'contact_archived', {
            contactId: id,
            isArchived: true
        });

        console.log(`📦 [Archive Contact] SUCCESS - ID: ${id}`);
        res.json({
            success: true,
            message: 'Kişi arşivlendi',
            contact: updatedContact
        });
    } catch (error) {
        console.error('Archive contact error:', error);
        res.status(500).json({ error: 'Arşivleme sırasında hata oluştu' });
    }
};

// Unarchive contact
export const unarchiveContact = async (req, res) => {
    try {
        const { workspaceId, id } = req.params;

        // Verify contact belongs to this workspace
        const existing = await prisma.contact.findFirst({
            where: {
                id,
                OR: [
                    { workspaceId: workspaceId },
                    { conversations: { some: { workspaceId: workspaceId } } }
                ]
            }
        });

        if (!existing) {
            return res.status(404).json({ error: 'Kişi bulunamadı' });
        }

        const updatedContact = await prisma.contact.update({
            where: { id },
            data: {
                isArchived: false,
                archivedAt: null
            }
        });

        // Emit socket event
        emitToWorkspace(workspaceId, 'contact_unarchived', {
            contactId: id,
            isArchived: false
        });

        console.log(`📤 [Unarchive Contact] SUCCESS - ID: ${id}`);
        res.json({
            success: true,
            message: 'Kişi arşivden çıkarıldı',
            contact: updatedContact
        });
    } catch (error) {
        console.error('Unarchive contact error:', error);
        res.status(500).json({ error: 'Arşivden çıkarılırken hata oluştu' });
    }
};

// Add note to conversation (creates conversation if needed)
export const addNoteToConversation = async (req, res) => {
    try {
        const { workspaceId, id } = req.params;
        const { note } = req.body;

        if (!note || !note.trim()) {
            return res.status(400).json({ error: 'Not içeriği gerekli' });
        }

        console.log(`📝 [Add Note] Contact: ${id}, Workspace: ${workspaceId}`);

        // Check contact exists
        const contact = await prisma.contact.findFirst({
            where: {
                id,
                OR: [
                    { workspaceId },
                    { conversations: { some: { workspaceId } } }
                ]
            }
        });

        if (!contact) {
            return res.status(404).json({ error: 'Kişi bulunamadı' });
        }

        // Find or create an INTERNAL conversation for this contact
        let conversation = await prisma.conversation.findFirst({
            where: {
                contactId: id,
                workspaceId,
                channel: 'INTERNAL'
            }
        });

        if (!conversation) {
            conversation = await prisma.conversation.create({
                data: {
                    contactId: id,
                    workspaceId,
                    channel: 'INTERNAL',
                    status: 'OPEN'
                }
            });
            console.log(`📝 [Add Note] Created new INTERNAL conversation: ${conversation.id}`);
        }

        // Add note as internal message
        const message = await prisma.message.create({
            data: {
                conversationId: conversation.id,
                content: note,
                isFromContact: false,
                messageType: 'NOTE'
            }
        });

        // Update conversation lastMessageAt
        await prisma.conversation.update({
            where: { id: conversation.id },
            data: { lastMessageAt: new Date() }
        });

        // Mevcut notları koru — JSON array'e append et (üzerine yazma!)
        const contactRecord = await prisma.contact.findUnique({ where: { id }, select: { notes: true } });
        let existingNotes = [];
        try {
            if (contactRecord?.notes) {
                const parsed = JSON.parse(contactRecord.notes);
                existingNotes = Array.isArray(parsed) ? parsed : [];
            }
        } catch { existingNotes = []; }

        const newNoteEntry = {
            timestamp: new Date().toISOString(),
            title: '',
            content: note
        };
        const updatedNotes = JSON.stringify([newNoteEntry, ...existingNotes]);

        await prisma.contact.update({
            where: { id },
            data: { notes: updatedNotes }
        });

        // Emit socket events
        emitToWorkspace(workspaceId, 'new_message', {
            workspaceId,
            conversationId: conversation.id,
            message,
            channel: 'INTERNAL'
        });

        console.log(`✅ [Add Note] SUCCESS - Message: ${message.id}`);
        res.json({
            success: true,
            conversationId: conversation.id,
            message
        });
    } catch (error) {
        console.error('Add note to conversation error:', error);
        res.status(500).json({ error: 'Not eklenirken hata oluştu' });
    }
};

// ─── Peak Hours Analysis ─────────────────────────────────
export const getPeakHours = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { startDate, endDate, funnelId } = req.query;

        // Use OR pattern to match contacts either by direct workspaceId or via conversations
        const contactsWhere = {
            isDeleted: false,
            OR: [
                { workspaceId },
                { conversations: { some: { workspaceId } } }
            ]
        };

        // Add date filter
        if (startDate || endDate) {
            contactsWhere.createdAt = {};
            if (startDate) contactsWhere.createdAt.gte = parseDateStartTR(startDate);
            if (endDate) contactsWhere.createdAt.lte = parseDateEndTR(endDate);
        }

        if (funnelId) contactsWhere.funnelStageId = { not: null };

        // Get all contacts with createdAt
        const contacts = await prisma.contact.findMany({
            where: contactsWhere,
            select: { createdAt: true }
        });

        // Build hourly distribution (0-23) and daily distribution (0=Sunday, 1=Monday,...6=Saturday)
        const hourly = Array(24).fill(0);
        const daily = Array(7).fill(0); // 0=Paz, 1=Pzt, 2=Sal, 3=Çar, 4=Per, 5=Cum, 6=Cmt
        // Build heatmap: 7 days x 24 hours
        const heatmap = Array.from({ length: 7 }, () => Array(24).fill(0));

        for (const c of contacts) {
            // Convert to Turkey timezone (UTC+3)
            const d = new Date(c.createdAt);
            const trTime = new Date(d.getTime() + TZ_OFFSET_MS);
            const hour = trTime.getUTCHours();
            const day = trTime.getUTCDay();
            hourly[hour]++;
            daily[day]++;
            heatmap[day][hour]++;
        }

        res.json({ hourly, daily, heatmap, totalContacts: contacts.length });
    } catch (error) {
        console.error('Peak hours error:', error);
        res.status(500).json({ error: 'Peak hours analizi başarısız' });
    }
};

// Generate AI summary interpretation for CEO report
export const getAiAnalyticsSummary = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { analyticsData, dateFilter } = req.body;

        if (!analyticsData) {
            return res.status(400).json({ error: 'Rapor verisi bulunamadı' });
        }

        // Get AI API key for workspace
        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { aiApiKey: true }
        });
        let aiApiKey = workspace?.aiApiKey;
        if (!aiApiKey) {
            const globalSettings = await prisma.globalSettings.findUnique({ where: { id: 'singleton' } });
            aiApiKey = globalSettings?.globalAiApiKey;
        }
        if (!aiApiKey) {
            aiApiKey = process.env.GEMINI_API_KEY;
        }
        if (!aiApiKey) {
            return res.status(400).json({ error: 'Gemini API anahtarı bulunamadı. Lütfen ayarlardan veya .env dosyasına ekleyin.' });
        }

        const genAI = new GoogleGenerativeAI(aiApiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        const prompt = `Sen kıdemli bir iş analisti ve Instomer CRM sisteminin CEO raporlama asistanısın.
Aşağıda şirketin belirli bir döneme (${dateFilter || 'seçilen dönem'}) ait performans verileri yer almaktadır:

- Toplam Müşteri İletişimi: ${analyticsData.totalContacts || 0}
- Toplam Mesaj Sayısı: ${analyticsData.totalMessages || 0}
- AI (Yapay Zeka) Tarafından Atılan Mesaj: ${analyticsData.totalAiMessages || 0}
- Temsilciler Tarafından Atılan Mesaj: ${analyticsData.totalHumanMessages || 0}
- Toplam Sohbet Sayısı: ${analyticsData.totalConversations || 0}
- Yapay Zekanın Başlattığı Görüşmeler: ${analyticsData.botLedConversations || 0}
- Canlı Desteğe Aktarılan Sohbetler: ${analyticsData.handoffConversations || 0}
- Tamamen AI Tarafından Yanıtlanan & Çözülen Sohbetler: ${analyticsData.handledByBotConversations || 0}
- Sipariş Sayısı: ${analyticsData.dealStats?.orderCount || 0}
- Satış Tutarı (Ciro): ₺${analyticsData.dealStats?.orderAmount?.toLocaleString('tr-TR') || 0}
- AI Arama (Sesli) Sayısı: ${analyticsData.aiCallStats?.totalCalls || 0}
- AI Arama Başarı Oranı: %${analyticsData.aiCallStats?.successRate || 0}
- AI Arama Maliyeti: $${analyticsData.aiCallStats?.totalCost || 0}
- Randevu Sayısı: ${analyticsData.appointmentStats?.totalAppointments || 0}

GÖREV: Bu verileri analiz et ve CEO için 3-4 paragraflık, profesyonel, yapıcı ve doğrudan aksiyona yönelik Türkçe bir performans özeti yaz.
Yazında şunlara değin:
1. Genel durum değerlendirmesi (satışlar, müşteri trafiği, yapay zekanın katma değeri).
2. Yapay zekanın (mesajlaşma ve sesli arama) performansı, başarı oranları ve verimliliğe etkisi.
3. İyileştirilmesi veya odaklanılması gereken kritik alanlar (örneğin canlı desteğe aktarım oranları, başarısız aramalar veya düşük ciro vb.).

ÖNEMLİ KURALLAR:
- SADECE Türkçe yaz.
- Profesyonel, ciddi, yönetici özeti formatında bir üslup kullan.
- Markdown formatında döndür (bold kelimeler, bullet point'ler kullanabilirsin).
- Yorumunun en başına "### 🤖 Yapay Zeka Rapor Analizi" başlığını ekle.`;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();

        res.json({ summary: responseText });
    } catch (error) {
        console.error('❌ [AiAnalyticsSummary] Error:', error);
        res.status(500).json({ error: error.message || 'Yorum oluşturulurken bir hata oluştu' });
    }
};

export const getTopicContacts = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { topic, startDate, endDate } = req.query;

        if (!topic) return res.status(400).json({ error: 'topic parametresi gerekli' });

        let dateFilter = {};
        if (startDate || endDate) {
            dateFilter.createdAt = {};
            if (startDate) dateFilter.createdAt.gte = parseDateStartTR(startDate);
            if (endDate) dateFilter.createdAt.lte = parseDateEndTR(endDate);
        }

        const conversations = await prisma.conversation.findMany({
            where: {
                workspaceId,
                aiTopic: topic,
                ...dateFilter
            },
            select: {
                id: true,
                aiTopic: true,
                createdAt: true,
                channel: true,
                contact: {
                    select: {
                        id: true,
                        name: true,
                        phone: true,
                        email: true,
                        status: true,
                        funnelStageId: true,
                        company: true,
                        source: true,
                        createdAt: true
                    }
                },
                assignedTo: {
                    select: { id: true, name: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        // Get all funnels for stage name lookup
        const allFunnels = await prisma.funnel.findMany({
            where: { workspaceId },
            include: { stages: { select: { id: true, name: true, color: true } } }
        });
        const stageLookup = {};
        for (const f of allFunnels) {
            for (const s of f.stages) {
                stageLookup[s.id] = { name: s.name, color: s.color };
            }
        }

        // Deduplicate by contactId (keep first/latest conversation)
        const seenContacts = new Set();
        const contacts = [];
        for (const conv of conversations) {
            if (!conv.contact || seenContacts.has(conv.contact.id)) continue;
            seenContacts.add(conv.contact.id);
            const stageInfo = conv.contact.funnelStageId ? stageLookup[conv.contact.funnelStageId] : null;
            contacts.push({
                id: conv.contact.id,
                name: conv.contact.name || 'İsimsiz',
                phone: conv.contact.phone || '',
                email: conv.contact.email || '',
                status: conv.contact.status || 'NEW',
                stageName: stageInfo?.name || null,
                stageColor: stageInfo?.color || null,
                company: conv.contact.company || '',
                source: conv.contact.source || '',
                channel: conv.channel || '',
                assigneeName: conv.assignedTo?.name || null,
                contactCreatedAt: conv.contact.createdAt,
                conversationCreatedAt: conv.createdAt
            });
        }

        res.json({ topic, totalCount: contacts.length, contacts });
    } catch (error) {
        console.error('Topic contacts error:', error);
        res.status(500).json({ error: error.message });
    }
};
