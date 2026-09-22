import prisma from '../lib/prisma.js';
import { emitToWorkspace } from '../socket.js';
import { executeHotOpportunityEmailRule } from './rules.controller.js';
import { normalizePhone, normalizePhonesArray } from '../utils/phoneNormalizer.js';
import { mergeContacts } from '../services/contactMerge.service.js';
import { ensureCaseForConversation } from './case.controller.js';
import { evaluateAndApplyRules } from '../services/stageRuleEngine.service.js';
import { executeRule } from '../services/ruleEngine.service.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getDescendantFunnelKeys } from '../utils/funnelHierarchy.js';

// ─── AI Topic Classification Cache ─────────────────────────────
// Cache key: workspaceId + hash of topic list, expires in 30 minutes
const topicClassificationCache = new Map();
const TOPIC_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// ─── Phase 1: Aggressive text-based pre-normalization ──────────
// Strips common Turkish suffixes/patterns to group duplicates before AI
const TOPIC_SUFFIXES = [
    // Long phrases first
    'hakkında genel bilgi', 'hakkında bilgi almak istiyorum', 'hakkında bilgi almak',
    'hakkında bilgi', 'ile ilgili bilgi', 'ile ilgili',
    'için bilgi almak', 'için randevu', 'için',
    'nasıl yapılır', 'nasıl uygulanır', 'ne demek', 'nedir',
    // Randevu variants
    'randevu talebi', 'randevu almak', 'randevusu', 'randevu',
    // Ameliyat/cerrahi variants
    'ameliyatı talebi', 'ameliyati talebi', 'ameliyatı', 'ameliyati', 'ameliyat',
    'cerrahisi talebi', 'cerrahisi', 'cerrahi',
    // Tedavi/muayene
    'tedavisi talebi', 'tedavisi', 'tedavi',
    'muayenesi', 'muayene',
    'konsültasyonu', 'konsültasyon',
    'ön değerlendirme', 'değerlendirmesi', 'değerlendirme',
    // Enjeksiyon/operasyon
    'enjeksiyonu', 'enjeksiyon', 'operasyonu', 'operasyon', 'prosedürü', 'prosedür',
    'uygulaması', 'uygulama',
    // Bilgi/fiyat/ücret
    'bilgi talebi', 'bilgisi', 'bilgi almak', 'bilgi',
    'fiyat sorgulama', 'fiyat talebi', 'fiyatlandırma', 'fiyatı', 'fiyati', 'fiyat',
    'ücret bilgisi', 'ücretleri', 'ücreti', 'ucretleri', 'ucreti', 'ücret',
    'maliyet bilgisi', 'maliyeti', 'maliyet',
    // Genel ekler
    'sorgulama', 'sorgusu', 'talebi', 'talep',
    'kliniği', 'klinigi', 'merkezi',
    'hakkında', 'sonrası', 'öncesi',
    'programı', 'paketi', 'planı',
].sort((a, b) => b.length - a.length); // longest first

// Turkish plural/possessive endings to normalize
const TR_ENDINGS = [
    // Plural possessives: paketleri, hizmetleri
    { pattern: /leri$/i, replace: '' },
    { pattern: /ları$/i, replace: '' },
    // Plurals: paketler, hizmetler
    { pattern: /ler$/i, replace: '' },
    { pattern: /lar$/i, replace: '' },
];

function normalizeTopicText(topic) {
    let t = (topic || '').toLowerCase().trim()
        .replace(/\s+/g, ' ')
        .replace(/[""''""«»]/g, '')
        .replace(/[.!?,;:]+$/, '')
        .replace(/^\d+[\.\)\-]\s*/, ''); // strip leading numbers "1. " "2) "
    
    // Multi-pass suffix removal — keep stripping until no more matches
    let changed = true;
    let iterations = 0;
    while (changed && iterations < 5) {
        changed = false;
        iterations++;
        for (const suffix of TOPIC_SUFFIXES) {
            if (t.endsWith(suffix) && t.length > suffix.length + 1) {
                t = t.slice(0, -suffix.length).trim();
                changed = true;
                break;
            }
        }
    }
    
    // Turkish plural/possessive normalization (only if word is long enough)
    t = t.replace(/\s+/g, ' ').trim();
    if (t.length > 5) {
        for (const ending of TR_ENDINGS) {
            if (ending.pattern.test(t)) {
                const stripped = t.replace(ending.pattern, ending.replace).trim();
                if (stripped.length >= 3) { // don't strip too short
                    t = stripped;
                    break;
                }
            }
        }
    }
    
    t = t.replace(/\s+/g, ' ').trim();
    
    // Empty/too-short guard
    if (!t || t.length < 2) return (topic || '').trim();
    
    // Capitalize first letter
    return t.charAt(0).toUpperCase() + t.slice(1);
}

// Hard cap: if more than MAX_TOPICS after normalization, merge tail into "Diğer Talepler"
const MAX_DISPLAY_TOPICS = 150;


/**
 * 2-Phase topic classification:
 * Phase 1: Text normalization groups obvious duplicates (1400 → ~150)
 * Phase 2: AI semantic grouping merges remaining similar ones (~150 → ~40)
 * Returns a mapping: { "raw topic" => "canonical category name" }
 */
async function classifyTopicsWithAI(workspaceId, rawTopics) {
    if (!rawTopics || rawTopics.length === 0) return null;
    
    // Create a stable cache key
    const topicCount = rawTopics.length;
    const sampleKey = [...rawTopics].sort().slice(0, 20).join('|');
    const cacheKey = `${workspaceId}:${topicCount}:${sampleKey.substring(0, 300)}`;
    const cached = topicClassificationCache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
        return cached.data;
    }

    // ── Phase 1: Text normalization ──
    // Group raw topics by their normalized form
    const normGroups = {}; // normalized → [raw1, raw2, ...]
    for (const raw of rawTopics) {
        const norm = normalizeTopicText(raw);
        if (!normGroups[norm]) normGroups[norm] = [];
        normGroups[norm].push(raw);
    }
    
    const uniqueNorms = Object.keys(normGroups);
    console.log(`📋 [TopicNorm] Phase 1: ${rawTopics.length} raw → ${uniqueNorms.length} normalized groups`);

    // Build phase-1 mapping (raw → normalized)
    const phase1Mapping = {};
    for (const [norm, raws] of Object.entries(normGroups)) {
        for (const raw of raws) {
            phase1Mapping[raw] = norm;
        }
    }

    // If very few unique groups, skip AI
    if (uniqueNorms.length <= 3) {
        topicClassificationCache.set(cacheKey, { data: phase1Mapping, expiry: Date.now() + TOPIC_CACHE_TTL });
        return phase1Mapping;
    }

    // ── Phase 2: AI semantic grouping on reduced set ──
    try {
        const result = await Promise.race([
            _doClassifyTopics(workspaceId, uniqueNorms, cacheKey, phase1Mapping, rawTopics),
            new Promise((_, reject) => setTimeout(() => reject(new Error('AI_TIMEOUT')), 15000))
        ]);
        return result;
    } catch (e) {
        if (e.message === 'AI_TIMEOUT') {
            console.warn('⏱️ [TopicAI] Phase 2 timed out (15s). Using Phase 1 normalization only. Caching AI in background.');
            // Cache phase-1 result immediately so user sees grouped data
            topicClassificationCache.set(cacheKey, { data: phase1Mapping, expiry: Date.now() + TOPIC_CACHE_TTL });
            // Fire-and-forget: let AI finish in background for next request
            _doClassifyTopics(workspaceId, uniqueNorms, cacheKey, phase1Mapping, rawTopics).catch(() => {});
        } else {
            console.error('AI topic classification error (non-fatal):', e.message);
            // Still cache phase-1 result
            topicClassificationCache.set(cacheKey, { data: phase1Mapping, expiry: Date.now() + TOPIC_CACHE_TTL });
        }
        return phase1Mapping;
    }
}

async function _doClassifyTopics(workspaceId, uniqueNorms, cacheKey, phase1Mapping, rawTopics) {
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
    if (!aiApiKey) return phase1Mapping;

    const genAI = new GoogleGenerativeAI(aiApiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });

    // If still too many, batch — send max 200 at a time
    const BATCH_SIZE = 200;
    let aiMapping = {};

    for (let i = 0; i < uniqueNorms.length; i += BATCH_SIZE) {
        const batch = uniqueNorms.slice(i, i + BATCH_SIZE);
        const topicListText = batch.map((t, idx) => `${idx + 1}. ${t}`).join('\n');

        const prompt = `Sen bir müşteri talep sınıflandırma uzmanısın. Aşağıda normalize edilmiş müşteri talep konuları var.
Bunların birçoğu aslında aynı konuyu farklı şekillerde ifade ediyor.

GÖREV: Her konuyu standart bir kategori adıyla eşleştir. Semantik olarak aynı/çok benzer konuları aynı kategoriye koy.

KURALLAR:
- Kategori adları kısa ve net olsun (2-4 kelime).
- Türkçe karakter kullan.
- AYNI prosedür/hizmeti farklı ifade edenleri BİRLEŞTİR. Örnekler:
  * "Obezite", "Mide küçültme", "Sleeve gastrektomi", "Tüp mide", "Bariatrik" → "Obezite Cerrahisi"
  * "Burun eğritliği", "Burun", "Rinoplasti", "Septoplasti" → "Burun Estetiği"
  * "Diz protezi", "Diz protez" → "Diz Protezi"
  * "Botoks", "Botox" → "Botoks"
  * "Fiyat", "Ücret", "Maliyet" → "Fiyat Bilgisi"
  * "Genel", "Merhaba", "Bilgi", "İletişim", "Teşekkür" → "Genel Bilgi"
  * "Annelik estetiği", "Mommy makeover" → "Annelik Estetiği"
- Emin olmadığın konuları olduğu gibi bırak, yanlış birleştirme yapma.
- Sonucu SADECE JSON formatında döndür, başka bir şey yazma.

KONULAR:
${topicListText}

ÇIKTI (sadece JSON):
{"mapping": {"konu1": "Kategori", "konu2": "Kategori", ...}}`;

        try {
            const result = await model.generateContent(prompt);
            const responseText = result.response.text();
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                const batchMapping = parsed.mapping || parsed;
                Object.assign(aiMapping, batchMapping);
            }
        } catch (batchErr) {
            console.error(`AI batch ${i / BATCH_SIZE + 1} error:`, batchErr.message);
            // For failed batches, keep normalized names as-is
            for (const t of batch) {
                aiMapping[t] = t;
            }
        }
    }

    // Build final mapping: raw topic → AI category
    // Chain: raw → phase1(normalized) → phase2(AI category)
    const finalMapping = {};
    for (const raw of rawTopics) {
        const normalized = phase1Mapping[raw] || raw;
        const aiCategory = aiMapping[normalized] || normalized;
        finalMapping[raw] = aiCategory;
    }

    // Cache the final result
    topicClassificationCache.set(cacheKey, { data: finalMapping, expiry: Date.now() + TOPIC_CACHE_TTL });
    const categoryCount = new Set(Object.values(finalMapping)).size;
    console.log(`🤖 [TopicAI] Phase 2 complete: ${uniqueNorms.length} normalized → ${categoryCount} categories for workspace ${workspaceId}`);
    
    return finalMapping;
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

// Helper to get all call contact IDs (both human call activities and Retell AI calls)
export const getWorkspaceCallSets = async (workspaceId) => {
    // 1) Human call activities (ContactActivity type=CALL)
    let humanCalledIds = new Set();
    if (prisma.contactActivity) {
        try {
            const humanCallActs = await prisma.contactActivity.findMany({
                where: {
                    workspaceId,
                    type: 'CALL',
                    OR: [
                        { status: 'COMPLETED' },
                        { status: 'DONE' },
                        { isCompleted: true },
                        { result: { not: null } },
                        { callSuccessful: { not: null } }
                    ]
                },
                select: { contactId: true }
            });
            humanCalledIds = new Set(humanCallActs.map(a => a.contactId).filter(Boolean));
        } catch (err) {
            console.warn('⚠️ Error fetching human call activities:', err.message);
        }
    }

    // 2) AI calls (RetellCall)
    const aiCalledIds = new Set();
    if (prisma.retellCall) {
        try {
            const retellCalls = await prisma.retellCall.findMany({
                where: { workspaceId },
                select: { id: true, contactId: true, toNumber: true }
            });
            const unlinkedCallPhones = new Set();
            retellCalls.forEach(rc => {
                if (rc.contactId) {
                    aiCalledIds.add(rc.contactId);
                } else if (rc.toNumber) {
                    const raw = rc.toNumber.replace(/\D/g, '').slice(-10);
                    if (raw.length >= 10) unlinkedCallPhones.add(raw);
                }
            });

            if (unlinkedCallPhones.size > 0) {
                const contactsWithPhones = await prisma.contact.findMany({
                    where: {
                        workspaceId,
                        isDeleted: false,
                        phone: { not: '' },
                        NOT: { phone: null }
                    },
                    select: { id: true, phone: true }
                });
                const phoneMap = {};
                contactsWithPhones.forEach(c => {
                    if (c.phone) {
                        const raw = c.phone.replace(/\D/g, '').slice(-10);
                        if (raw.length >= 10) phoneMap[raw] = c.id;
                    }
                });

                unlinkedCallPhones.forEach(p => {
                    const cid = phoneMap[p];
                    if (cid) aiCalledIds.add(cid);
                });
            }
        } catch (err) {
            console.warn('⚠️ Error fetching retell calls in getWorkspaceCallSets:', err.message);
        }
    }

    const allCalledIds = new Set([...humanCalledIds, ...aiCalledIds]);
    return { humanCalledIds, aiCalledIds, allCalledIds };
};

// Helper to extract all distinct tags across workspace contacts
export const getWorkspaceTags = async (workspaceId) => {
    const allTags = new Set();
    try {
        const contactsWithTags = await prisma.contact.findMany({
            where: {
                workspaceId,
                isArchived: false,
                isDeleted: false,
                // tags nullable DEĞİL (String @default("[]")). Eskiden burada
                // NOT: [{ tags: null }, { tags: '' }] vardı; Prisma null'ı
                // "argüman verilmedi" sayıp sorguyu reddediyordu. Hata catch'e
                // düşüp boş dizi dönüyor, etiket süzgeci yalnızca o sayfadaki
                // kişilerin etiketlerini gösteriyordu.
                tags: { notIn: ['[]', ''] }
            },
            select: { tags: true }
        });
        contactsWithTags.forEach(c => {
            if (!c.tags) return;
            let raw = c.tags;
            let parsed = [];
            if (Array.isArray(raw)) {
                parsed = raw;
            } else if (typeof raw === 'string') {
                const trimmed = raw.trim();
                if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
                    try {
                        const arr = JSON.parse(trimmed);
                        if (Array.isArray(arr)) parsed = arr;
                    } catch {
                        parsed = trimmed.slice(1, -1).split(',').map(s => s.replace(/['"`]/g, '').trim());
                    }
                } else {
                    parsed = trimmed.split(',').map(s => s.replace(/['"`]/g, '').trim());
                }
            }
            parsed.forEach(t => {
                if (t && typeof t === 'string') {
                    const clean = t.trim();
                    if (clean && !clean.startsWith('v_')) {
                        allTags.add(clean);
                    }
                }
            });
        });
    } catch (err) {
        console.warn('⚠️ Error fetching workspace tags:', err.message);
    }
    return Array.from(allTags).sort();
};

// Get all contacts in a workspace
export const getContacts = async (req, res) => {
    // catch bloğundaki yedek sorgu da bu filtreyi kullanıyor. try içinde
    // bildirilince catch onu göremiyor, "where is not defined" ile yedek
    // sorgu da düşüyordu — bildirim dışarı alındı.
    let where;
    try {
        const { workspaceId } = req.params;
        const { search, status, source, category, tag, contactInfo, importGroup, callStatus, showArchived, funnelType, funnelTypes, funnelStageId, assignmentFilter, sortField = 'createdAt', sortDir = 'desc', limit = 50, offset = 0, dateFilter, dateFrom, dateTo, onlyOpenCases, tzOffset, topicCategoryId, hasSales } = req.query;
        const { role } = req.workspaceMember;

        // Auto-migrate legacy status → funnel stage (runs once per workspace)
        migrateStatusToFunnelStage(workspaceId).catch(() => {});

        console.log(`🔍 [Get Contacts] START - Workspace: ${workspaceId}, Role: ${role}, Status: ${status || 'ALL'}, Source: ${source || 'ALL'}, Category: ${category || 'ALL'}, Tag: ${tag || 'ALL'}, ShowArchived: ${showArchived || 'false'}`);

        // Build base conversation filter for this workspace
        let conversationFilter = { workspaceId: workspaceId };

        // AGENT role: only see contacts from their assigned conversations + team pool
        let myTeamIds = [];
        if (role === 'AGENT') {
            // Get agent's team IDs
            const userTeams = await prisma.teamMember.findMany({
                where: { userId: req.user.id },
                select: { teamId: true }
            });
            myTeamIds = userTeams.map(t => t.teamId).filter(Boolean);

            // Filter: assigned to me OR (in my team AND not assigned to anyone)
            conversationFilter = {
                workspaceId: workspaceId,
                channel: { notIn: ['FACEBOOK_COMMENT', 'INSTAGRAM_COMMENT'] },
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
        if (role === 'AGENT') {
            // AGENT: see contacts that have conversations OR active cases assigned to them or their teams
            const caseOrConditions = [{ assignedToId: req.user.id }];
            if (myTeamIds.length > 0) {
                caseOrConditions.push({ assignedTeamId: { in: myTeamIds } });
            }
            where = {
                OR: [
                    { conversations: { some: conversationFilter } },
                    { cases: { some: { workspaceId, status: 'ACTIVE', OR: caseOrConditions } } }
                ]
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
                    {
                        OR: [
                            { tags: { contains: `"${tag}"`, mode: 'insensitive' } },
                            { tags: { contains: tag, mode: 'insensitive' } }
                        ]
                    }
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

        // Add topicCategory filter — filter contacts that have a conversation with this topicCategoryId
        if (topicCategoryId && topicCategoryId !== 'ALL') {
            where = {
                AND: [
                    where,
                    {
                        conversations: {
                            some: { topicCategoryId: topicCategoryId }
                        }
                    }
                ]
            };
        }

        // Add hasSales filter — filter contacts that have at least one WON deal
        if (hasSales === 'true') {
            where = {
                AND: [
                    where,
                    { deals: { some: { status: 'WON' } } }
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
            // Multi-funnel: comma-separated IDs → match by stageId or funnelType
            const ids = funnelTypes.split(',').map(id => id.trim()).filter(Boolean);
            const funnels = await prisma.funnel.findMany({
                where: { id: { in: ids } },
                include: { stages: { select: { id: true } } }
            }).catch(() => []);
            const names = funnels.map(f => f.name).filter(Boolean);
            const stageIds = funnels.flatMap(f => (f.stages || []).map(s => s.id));
            const allTerms = [...ids, ...names];
            const orConditions = [
                ...(stageIds.length > 0 ? [{ funnelStageId: { in: stageIds } }] : []),
                ...(allTerms.length > 0 ? allTerms.map(term => ({ funnelType: term })) : [])
            ];
            if (orConditions.length > 0) {
                where = { AND: [where, { OR: orConditions }] };
            }
        } else if (funnelType && funnelType !== 'ALL') {
            const funnels = await prisma.funnel.findMany({
                where: {
                    workspaceId,
                    OR: [
                        { id: funnelType },
                        { name: funnelType }
                    ]
                },
                include: { stages: { select: { id: true } } }
            }).catch(() => []);
            const descendantKeys = await getDescendantFunnelKeys(workspaceId, funnelType).catch(() => []);
            const stageIds = funnels.flatMap(f => (f.stages || []).map(s => s.id));
            const allTerms = [...new Set([...descendantKeys, funnelType])];
            const orConditions = [
                ...(stageIds.length > 0 ? [{ funnelStageId: { in: stageIds } }] : []),
                ...(allTerms.length > 0 ? allTerms.map(term => ({ funnelType: term })) : [])
            ];
            if (orConditions.length > 0) {
                where = { AND: [where, { OR: orConditions }] };
            }
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
            const myTeamIds = userTeams.map(t => t.teamId).filter(Boolean);

            if (assignmentFilter === 'mine') {
                // Contacts with active case assigned to me OR (no active case AND conversation assigned to me)
                where = {
                    AND: [
                        where,
                        {
                            OR: [
                                {
                                    cases: {
                                        some: { workspaceId, status: 'ACTIVE', assignedToId: req.user.id }
                                    }
                                },
                                {
                                    AND: [
                                        { cases: { none: { workspaceId, status: 'ACTIVE' } } },
                                        { conversations: { some: { workspaceId, assignedToId: req.user.id } } }
                                    ]
                                }
                            ]
                        }
                    ]
                };
                console.log(`   AssignmentFilter: MINE (userId: ${req.user.id})`);
            } else if (assignmentFilter === 'unassigned') {
                // Contacts with unassigned active case OR (no active case AND unassigned conversation)
                where = {
                    AND: [
                        where,
                        {
                            OR: [
                                {
                                    cases: {
                                        some: { workspaceId, status: 'ACTIVE', assignedToId: null, assignedTeamId: null }
                                    }
                                },
                                {
                                    AND: [
                                        { cases: { none: { workspaceId, status: 'ACTIVE' } } },
                                        {
                                            conversations: {
                                                some: {
                                                    workspaceId,
                                                    assignedToId: null,
                                                    OR: [{ teamIds: '[]' }, { teamIds: null }]
                                                }
                                            }
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                };
                console.log(`   AssignmentFilter: UNASSIGNED`);
            } else if (assignmentFilter === 'pool') {
                // Contacts in my teams + unassigned + assigned to me
                const teamConditions = myTeamIds.map(tid => ({
                    teamIds: { contains: `"${tid}"` }
                }));

                const poolCaseOr = [
                    { assignedToId: req.user.id },
                    { assignedToId: null }
                ];
                if (myTeamIds.length > 0) {
                    poolCaseOr.push({ assignedTeamId: { in: myTeamIds } });
                }

                where = {
                    AND: [
                        where,
                        {
                            OR: [
                                {
                                    cases: {
                                        some: {
                                            workspaceId,
                                            status: 'ACTIVE',
                                            OR: poolCaseOr
                                        }
                                    }
                                },
                                {
                                    AND: [
                                        { cases: { none: { workspaceId, status: 'ACTIVE' } } },
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
                                }
                            ]
                        }
                    ]
                };
                console.log(`   AssignmentFilter: POOL (teams: ${myTeamIds.length})`);
            } else if (assignmentFilter.startsWith('team_')) {
                // Filter by specific team
                const teamId = assignmentFilter.replace('team_', '');

                const orConditions = [
                    // Conversations assigned to this team
                    { teamIds: { contains: `"${teamId}"` } },
                    { assignedTeamId: teamId }
                ];

                where = {
                    AND: [
                        where,
                        {
                            OR: [
                                {
                                    cases: {
                                        some: { workspaceId, status: 'ACTIVE', assignedTeamId: teamId }
                                    }
                                },
                                {
                                    AND: [
                                        { cases: { none: { workspaceId, status: 'ACTIVE' } } },
                                        {
                                            conversations: {
                                                some: {
                                                    workspaceId,
                                                    OR: orConditions
                                                }
                                            }
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                };
                console.log(`   AssignmentFilter: TEAM (teamId: ${teamId})`);
            } else if (assignmentFilter.startsWith('user_')) {
                // Filter by specific user
                const userId = assignmentFilter.replace('user_', '');
                where = {
                    AND: [
                        where,
                        {
                            OR: [
                                {
                                    cases: {
                                        some: { workspaceId, status: 'ACTIVE', assignedToId: userId }
                                    }
                                },
                                {
                                    AND: [
                                        { cases: { none: { workspaceId, status: 'ACTIVE' } } },
                                        { conversations: { some: { workspaceId, assignedToId: userId } } }
                                    ]
                                }
                            ]
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
        // Exclude contacts whose effective stage (contact.funnelStageId OR their cases' stages) is a
        // closing stage (isClosing=true or has statusType), OR whose cases are all LOST/WON/CLOSED.
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
                            // Contact must NOT be in a closing stage themselves
                            OR: [
                                { funnelStageId: null },
                                { funnelStageId: { notIn: closingStageIds } }
                            ]
                        },
                        {
                            // AND must not have ALL their cases closed/lost/won
                            // i.e., must have at least one ACTIVE case OR no cases at all
                            OR: [
                                // Has at least one active case that is NOT in a closing stage
                                {
                                    cases: {
                                        some: {
                                            workspaceId,
                                            status: 'ACTIVE',
                                            OR: [
                                                { funnelStageId: null },
                                                { funnelStageId: { notIn: closingStageIds } }
                                            ]
                                        }
                                    }
                                },
                                // Has no cases at all (fresh contact)
                                {
                                    cases: {
                                        none: { workspaceId }
                                    }
                                }
                            ]
                        }
                    ]
                };
            } else {
                // No closing stages defined — still exclude contacts whose ALL cases are LOST/WON/CLOSED
                where = {
                    AND: [
                        where,
                        {
                            OR: [
                                // Has at least one ACTIVE case
                                {
                                    cases: {
                                        some: {
                                            workspaceId,
                                            status: 'ACTIVE'
                                        }
                                    }
                                },
                                // Has no cases at all
                                {
                                    cases: {
                                        none: { workspaceId }
                                    }
                                }
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
        let cachedCallSets = null;
        if (callStatus && callStatus !== 'ALL') {
            cachedCallSets = await getWorkspaceCallSets(workspaceId);
            const { humanCalledIds, aiCalledIds, allCalledIds } = cachedCallSets;

            if (callStatus === 'ended' || callStatus === 'called' || callStatus === 'arananlar') {
                // Arananlar: contacts with phone numbers who have been called (human or AI)
                const matchedIds = Array.from(allCalledIds);
                where = {
                    AND: [
                        where,
                        { id: { in: matchedIds.length > 0 ? matchedIds : ['__no_matching_called_contact__'] } }
                    ]
                };
            } else if (callStatus === 'ai_called') {
                // AI Aramaları: contacts with phone numbers who have AI calls
                const matchedIds = Array.from(aiCalledIds);
                where = {
                    AND: [
                        where,
                        { id: { in: matchedIds.length > 0 ? matchedIds : ['__no_matching_ai_call_contact__'] } }
                    ]
                };
            } else if (callStatus === 'agent_called') {
                // Temsilci Aramaları: contacts with human call activities
                const matchedIds = Array.from(humanCalledIds);
                where = {
                    AND: [
                        where,
                        { id: { in: matchedIds.length > 0 ? matchedIds : ['__no_matching_agent_call_contact__'] } }
                    ]
                };
            } else if (callStatus === 'no_call') {
                // Aranmayanlar: contacts with phone numbers who have NOT been called by anyone
                const calledIds = Array.from(allCalledIds);
                where = {
                    AND: [
                        where,
                        { phone: { not: '' }, NOT: { phone: null } },
                        ...(calledIds.length > 0 ? [{ id: { notIn: calledIds } }] : [])
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

                where = {
                    AND: [
                        where,
                        { id: { in: matchedIds.length > 0 ? matchedIds : ['__no_matching_status_call__'] } }
                    ]
                };
            }
            console.log(`   CallStatus filter '${callStatus}' applied`);
        }

        // Smart Segment filter
        if (req.query.segment && req.query.segment !== 'ALL') {
            const { buildSegmentWhere } = await import('../services/smartSegment.service.js');
            const segResult = await buildSegmentWhere(req.query.segment, workspaceId);
            if (segResult.contactIds) {
                where.id = where.id ? { ...where.id, in: segResult.contactIds } : { in: segResult.contactIds };
            } else if (segResult.where) {
                Object.assign(where, segResult.where);
            }
        }

        // Helper function to fetch Retell AI call records for a contact batch
        const fetchRetellCallsMap = async (contactList) => {
            const map = {};
            if (!prisma.retellCall || !contactList || contactList.length === 0) return map;
            try {
                const contactIds = contactList.map(c => c.id).filter(Boolean);
                const phoneMap = {};
                contactList.forEach(c => {
                    if (c.phone) {
                        const raw = c.phone.replace(/\D/g, '').slice(-10);
                        if (raw.length >= 7) phoneMap[raw] = c.id;
                    }
                });
                const rawPhones = Object.keys(phoneMap);

                const retellCalls = await prisma.retellCall.findMany({
                    where: {
                        workspaceId,
                        OR: [
                            { contactId: { in: contactIds } },
                            ...(rawPhones.length > 0 ? [{ toNumber: { in: contactList.map(c => c.phone).filter(Boolean) } }] : [])
                        ]
                    },
                    orderBy: { createdAt: 'desc' },
                    select: {
                        id: true,
                        callId: true,
                        contactId: true,
                        toNumber: true,
                        direction: true,
                        status: true,
                        duration: true,
                        summary: true,
                        sentiment: true,
                        callSuccessful: true,
                        // callTopic RetellCall modelinde YOK (ContactActivity'de var).
                        // Seçilince Prisma tüm sorguyu reddediyordu: logda sürekli
                        // "Error fetching retellCallsMap" çıkıyor ve kişi kartında
                        // AI arama geçmişi hiç görünmüyordu.
                        caseId: true,
                        createdAt: true
                    }
                });

                retellCalls.forEach(rc => {
                    let targetContactId = rc.contactId;
                    if (!targetContactId && rc.toNumber) {
                        const rawTo = rc.toNumber.replace(/\D/g, '').slice(-10);
                        targetContactId = phoneMap[rawTo] || null;
                    }
                    if (targetContactId) {
                        if (!map[targetContactId]) map[targetContactId] = [];
                        map[targetContactId].push(rc);
                    }
                });
            } catch (err) {
                console.error('Error fetching retellCallsMap:', err.message);
            }
            return map;
        };

        // Helper function to add source field and message dates
        const enrichContactWithSource = (contact, retellCallsMap = {}) => {
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

            // Merge retell calls for this contact if available
            const contactRetellCalls = (retellCallsMap && retellCallsMap[contact.id]) ? retellCallsMap[contact.id] : [];
            const mergedActivities = [...(contact.activities || [])];

            contactRetellCalls.forEach(rc => {
                const rcTime = new Date(rc.createdAt).getTime();
                const existing = mergedActivities.find(a => {
                    const aTime = new Date(a.completedAt || a.createdAt || a.dueDate).getTime();
                    return Math.abs(aTime - rcTime) < 5 * 60 * 1000;
                });

                if (existing) {
                    if (rc.summary && (!existing.result || !existing.result.includes(rc.summary))) {
                        existing.result = existing.result ? `${existing.result}\nÖzet: ${rc.summary}` : rc.summary;
                    }
                    if (rc.summary && !existing.description) existing.description = rc.summary;
                    if (rc.summary && !existing.summary) existing.summary = rc.summary;
                    if (rc.duration && !existing.duration) existing.duration = rc.duration;
                    if (rc.sentiment && !existing.callSentiment) existing.callSentiment = rc.sentiment;
                    if (rc.callSuccessful !== null && rc.callSuccessful !== undefined) existing.callSuccessful = rc.callSuccessful;
                    existing.assignedByType = 'AI';
                    existing.source = 'RETELL';
                } else {
                    const isInbound = rc.direction === 'inbound';
                    const durationText = rc.duration ? `${rc.duration} sn` : null;
                    let resultText = '';
                    if (rc.summary) {
                        resultText = durationText ? `${durationText} · ${rc.summary}` : rc.summary;
                    } else if (rc.callSuccessful) {
                        resultText = durationText ? `Görüşüldü (${durationText})` : 'Ulaşıldı';
                    } else {
                        resultText = 'Ulaşılamadı';
                    }

                    mergedActivities.push({
                        id: rc.id || rc.callId,
                        type: 'CALL',
                        source: 'RETELL',
                        assignedByType: 'AI',
                        title: isInbound ? 'Gelen AI Arama' : 'AI Arama (Retell)',
                        description: rc.summary || (isInbound ? 'Müşteri geri aradı' : 'AI sesli arama'),
                        result: resultText,
                        summary: rc.summary || null,
                        status: rc.status === 'completed' || rc.callSuccessful ? 'COMPLETED' : 'CANCELLED',
                        callSuccessful: rc.callSuccessful,
                        callSentiment: rc.sentiment,
                        duration: rc.duration,
                        createdAt: rc.createdAt,
                        completedAt: rc.createdAt,
                        caseId: rc.caseId || null,
                        _isRetell: true
                    });
                }
            });

            mergedActivities.sort((a, b) => new Date(b.createdAt || b.completedAt || 0) - new Date(a.createdAt || a.completedAt || 0));

            // Build lastNote from: 1) Planned activity, 2) Last completed activity (including AI calls), 3) Last manual note
            let lastNote = null;
            let lastNoteType = null;

            // 1) Check for planned activities (upcoming calls, meetings)
            const plannedActivity = mergedActivities.find(a => a.status === 'PLANNED');
            if (plannedActivity) {
                const typeLabels = { CALL: '📞 Arama', MEETING: '🤝 Toplantı', VISIT: '📍 Ziyaret', TASK: '📋 Görev', REMINDER: '⏰ Hatırlatıcı' };
                const typeLabel = typeLabels[plannedActivity.type] || '📌 Planlı';
                const dateStr = plannedActivity.dueDate ? new Date(plannedActivity.dueDate).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) : '';
                lastNote = `${typeLabel}: ${plannedActivity.title || plannedActivity.description || ''} ${dateStr}`.trim();
                lastNoteType = 'planned';
            }

            // 2) If no planned, get last completed activity
            if (!lastNote) {
                const completedActivity = mergedActivities.find(a => a.status !== 'PLANNED');
                if (completedActivity) {
                    const isAi = completedActivity.assignedByType === 'AI' || completedActivity.source === 'RETELL';
                    if (isAi) {
                        const dur = completedActivity.duration ? `${completedActivity.duration}sn ` : '';
                        lastNote = `🤖 AI Arama: ${dur}${completedActivity.summary || completedActivity.result || completedActivity.description || 'Görüşüldü'}`.trim();
                    } else {
                        const typeLabels = { CALL: '📞', MEETING: '🤝', VISIT: '📍', NOTE: '📝', TASK: '✅', REMINDER: '⏰' };
                        const icon = typeLabels[completedActivity.type] || '📌';
                        lastNote = `${icon} ${completedActivity.result || completedActivity.title || completedActivity.description || ''}`.trim();
                    }
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

            // Extract channel details and campaign/ad info
            const attr = contact.attributions?.[0] || null;
            const conv = contact.conversations?.[0] || null;
            const campaignOrAd = attr?.fb_ad_name || attr?.fb_campaign_name || attr?.utm_campaign || conv?.utmCampaign || contact.leadSourceDetail || null;
            const formName = attr?.meta_lead_form_name || attr?.form_name || null;
            const pageName = conv?.facebookPage?.pageName || null;

            return {
                ...contact,
                source: contactSource,
                channels: [...new Set(channels)],
                firstMessageAt,
                lastMessageAt,
                aiTopic,
                activeCase,
                campaignOrAd,
                formName,
                pageName,
                attribution: attr,
                activities: mergedActivities,
                retellCalls: contactRetellCalls,
                lastNote: lastNote ? (lastNote.length > 120 ? lastNote.substring(0, 120) + '...' : lastNote) : null,
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
                            // Şube = gayrimenkulde PROJE. Dışa aktarmadaki
                            // "Proje / Şube" kolonu buradan besleniyor.
                            branchId: true,
                            branch: { select: { id: true, name: true } },
                            utmSource: true,
                            utmMedium: true,
                            utmCampaign: true,
                            utmContent: true,
                            facebookPageId: true,
                            facebookPage: { select: { id: true, pageName: true } },
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
                                type: true,
                                caseTypeId: true,
                                caseType: { select: { id: true, name: true, color: true, icon: true } },
                                funnelStageId: true,
                                funnelType: true,
                                branchId: true,
                                branch: { select: { id: true, name: true } },
                                createdAt: true,
                                updatedAt: true,
                                assignedToId: true,
                                assignedTeamId: true,
                                leadScore: true,
                                leadTemperature: true,
                                source: true,
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
                            orderBy: { createdAt: 'desc' },
                            take: 25,
                            select: {
                                id: true,
                                type: true,
                                title: true,
                                description: true,
                                result: true,
                                status: true,
                                dueDate: true,
                                createdAt: true,
                                completedAt: true,
                                assignedByType: true,
                                source: true,
                                caseId: true,
                                callSuccessful: true,
                                callSentiment: true,
                                callTopic: true,
                                assignee: { select: { name: true } },
                                creator: { select: { name: true } }
                            }
                        }
                    } : {}),
                    ...(prisma.contactAttribution ? {
                        attributions: {
                            where: { workspaceId: workspaceId },
                            orderBy: { id: 'desc' },
                            take: 1,
                            select: {
                                utm_source: true,
                                utm_medium: true,
                                utm_campaign: true,
                                utm_content: true,
                                fb_ad_name: true,
                                fb_campaign_name: true,
                                meta_lead_form_name: true,
                                wa_referral_headline: true,
                                channel: true,
                                landing_page: true
                            }
                        }
                    } : {})
                },
                orderBy: ['name', 'company', 'status', 'createdAt'].includes(sortField)
                    ? { [sortField]: sortDir }
                    : { createdAt: 'desc' }
                // NO take/skip here - we get all and paginate after filtering
            });

            // Enrich with basic source info first to filter by source
            const allContactsWithSource = allContacts.map(c => enrichContactWithSource(c, {}));

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
            const pagedContacts = filteredContacts.slice(parsedOffset, parsedOffset + parsedLimit);

            // Fetch Retell AI calls for paged contacts and enrich them fully
            const retellCallsMap = await fetchRetellCallsMap(pagedContacts);
            finalContacts = pagedContacts.map(c => enrichContactWithSource(c, retellCallsMap));

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
                            // Şube = gayrimenkulde PROJE. Dışa aktarmadaki
                            // "Proje / Şube" kolonu buradan besleniyor.
                            branchId: true,
                            branch: { select: { id: true, name: true } },
                            utmSource: true,
                            utmMedium: true,
                            utmCampaign: true,
                            utmContent: true,
                            facebookPageId: true,
                            facebookPage: { select: { id: true, pageName: true } },
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
                                type: true,
                                caseTypeId: true,
                                caseType: { select: { id: true, name: true, color: true, icon: true } },
                                funnelStageId: true,
                                funnelType: true,
                                branchId: true,
                                branch: { select: { id: true, name: true } },
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
                            orderBy: { createdAt: 'desc' },
                            take: 25,
                            select: {
                                id: true,
                                type: true,
                                title: true,
                                description: true,
                                result: true,
                                status: true,
                                dueDate: true,
                                createdAt: true,
                                completedAt: true,
                                assignedByType: true,
                                source: true,
                                caseId: true,
                                callSuccessful: true,
                                callSentiment: true,
                                callTopic: true,
                                assignee: { select: { name: true } },
                                creator: { select: { name: true } }
                            }
                        }
                    } : {}),
                    ...(prisma.contactAttribution ? {
                        attributions: {
                            where: { workspaceId: workspaceId },
                            orderBy: { id: 'desc' },
                            take: 1,
                            select: {
                                utm_source: true,
                                utm_medium: true,
                                utm_campaign: true,
                                utm_content: true,
                                fb_ad_name: true,
                                fb_campaign_name: true,
                                meta_lead_form_name: true,
                                wa_referral_headline: true,
                                channel: true,
                                landing_page: true
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

            // Sort by computed fields if needed (firstMessageAt / lastMessageAt)
            if (['firstMessageAt', 'lastMessageAt'].includes(sortField)) {
                const enrichedAll = contacts.map(c => enrichContactWithSource(c, {}));
                enrichedAll.sort((a, b) => {
                    const aVal = a[sortField] ? new Date(a[sortField]).getTime() : 0;
                    const bVal = b[sortField] ? new Date(b[sortField]).getTime() : 0;
                    return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
                });
                // Manual pagination since we fetched all
                totalCount = enrichedAll.length;
                const parsedLimit = parseInt(limit);
                const parsedOffset = parseInt(offset);
                const pagedContacts = enrichedAll.slice(parsedOffset, parsedOffset + parsedLimit);
                const retellCallsMap = await fetchRetellCallsMap(pagedContacts);
                finalContacts = pagedContacts.map(c => enrichContactWithSource(c, retellCallsMap));
            } else {
                totalCount = await prisma.contact.count({ where });
                const retellCallsMap = await fetchRetellCallsMap(contacts);
                finalContacts = contacts.map(c => enrichContactWithSource(c, retellCallsMap));
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

        // Fetch all distinct tags
        const allTags = await getWorkspaceTags(workspaceId);

        // ── Quick Stats (uses statsWhere which inherits ALL active filters except contactInfo & callStatus) ──
        let periodCount = 0;
        let withPhoneCount = 0;
        let totalAllTime = 0;
        let funnelCountsRaw = [];
        let noPhoneCount = 0;
        try {
            [periodCount, withPhoneCount, totalAllTime, funnelCountsRaw, noPhoneCount] = await Promise.all([
                prisma.contact.count({ where: statsWhere }),
                prisma.contact.count({ where: { AND: [statsWhere, { phone: { not: '' } }, { NOT: { phone: null } }] } }),
                prisma.contact.count({ where: statsWhere }),
                prisma.contact.groupBy({
                    by: ['funnelType'],
                    where: statsWhere,
                    _count: { _all: true }
                }).catch(() => []),
                prisma.contact.count({
                    where: {
                        AND: [
                            statsWhere,
                            { OR: [{ phone: null }, { phone: '' }] }
                        ]
                    }
                }).catch(() => 0)
            ]);
        } catch (err) {
            console.warn('⚠️ Error in count queries:', err.message);
            periodCount = await prisma.contact.count({ where: { workspaceId, isArchived: false, isDeleted: false } }).catch(() => 0);
            withPhoneCount = await prisma.contact.count({ where: { workspaceId, isArchived: false, isDeleted: false, phone: { not: '' }, NOT: { phone: null } } }).catch(() => 0);
            noPhoneCount = Math.max(0, periodCount - withPhoneCount);
            totalAllTime = periodCount;
        }

        if (noPhoneCount === 0 && periodCount > withPhoneCount) {
            noPhoneCount = Math.max(0, periodCount - withPhoneCount);
        }

        const matchingContactsWithPhone = await prisma.contact.findMany({
            where: {
                AND: [
                    statsWhere,
                    { phone: { not: '' } },
                    { NOT: { phone: null } }
                ]
            },
            select: { id: true }
        }).catch(() => []);

        const activeCallSets = cachedCallSets || await getWorkspaceCallSets(workspaceId);
        let agentCalledCount = 0;
        let aiCalledCount = 0;
        matchingContactsWithPhone.forEach(c => {
            if (activeCallSets.allCalledIds.has(c.id)) agentCalledCount++;
            if (activeCallSets.aiCalledIds.has(c.id)) aiCalledCount++;
        });
        const noActivityCount = Math.max(0, withPhoneCount - agentCalledCount);

        // Stage-level counts (grouped by funnelStageId)
        let funnelStageCountsRaw = [];
        try {
            funnelStageCountsRaw = await prisma.contact.groupBy({
                by: ['funnelStageId'],
                where: statsWhere,
                _count: { _all: true }
            });
        } catch (e) {
            console.warn('⚠️ Error in funnelStageId groupBy:', e.message);
        }
        const funnelStageCounts = {};
        funnelStageCountsRaw.forEach(item => {
            if (item.funnelStageId) {
                funnelStageCounts[item.funnelStageId] = item._count?._all || 0;
            }
        });

        const funnelCounts = {};
        let nullOrGenelCount = 0;

        // Fetch all funnels for this workspace and their stages to properly calculate funnelCounts
        const allWorkspaceFunnels = await prisma.funnel.findMany({
            where: { workspaceId },
            include: {
                stages: { select: { id: true } }
            }
        }).catch(() => []);

        for (const f of allWorkspaceFunnels) {
            let count = 0;
            const stageIds = (f.stages || []).map(s => s.id);
            if (stageIds.length > 0) {
                stageIds.forEach(sid => {
                    count += (funnelStageCounts[sid] || 0);
                });
            }
            const directTypeCount = funnelCountsRaw.find(item => item.funnelType === f.id || item.funnelType === f.name)?._count?._all || 0;
            let totalFunnel = Math.max(count, directTypeCount);
            if (totalFunnel === 0 && stageIds.length > 0) {
                totalFunnel = await prisma.contact.count({
                    where: {
                        AND: [
                            statsWhere,
                            {
                                OR: [
                                    { funnelStageId: { in: stageIds } },
                                    { funnelType: f.name },
                                    { funnelType: f.id }
                                ]
                            }
                        ]
                    }
                }).catch(() => 0);
            }
            funnelCounts[f.id] = totalFunnel;
            funnelCounts[f.name] = totalFunnel;
        }

        funnelCountsRaw.forEach(item => {
            const fType = item.funnelType;
            const count = item._count?._all || 0;
            if (!fType || fType === 'Genel') {
                nullOrGenelCount += count;
            }
        });
        funnelCounts['Genel'] = nullOrGenelCount;




        // Sales count — contacts with at least one WON deal
        const salesCount = await prisma.contact.count({
            where: {
                ...statsWhere,
                deals: { some: { status: 'WON' } }
            }
        });

        res.json({ contacts: finalContacts, total: totalCount, allImportGroups, allTags: Array.from(allTags).sort(), quickStats: { periodCount, withPhoneCount, agentCalledCount, aiCalledCount, noActivityCount, totalAllTime, funnelCounts, funnelStageCounts, noPhoneCount, salesCount } });
    } catch (error) {
        console.error('Get contacts error:', error?.message || error);
        console.error('Get contacts error stack:', error?.stack);
        // Fallback: try a minimal query without optional relations
        try {
            const { workspaceId } = req.params;
            const limit = req.query.limit || 100;
            const offset = req.query.offset || 0;
            console.log('⚠️ [Get Contacts] Attempting fallback query without cases/activities...');
            const fallbackWhere = where || { workspaceId, isArchived: false, isDeleted: false };
            const contacts = await prisma.contact.findMany({
                where: fallbackWhere,
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
            const totalCount = await prisma.contact.count({ where: fallbackWhere });
            const withPhoneCount = await prisma.contact.count({ where: { AND: [fallbackWhere, { phone: { not: null } }, { phone: { not: '' } }] } });

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
            const fbTags = await getWorkspaceTags(workspaceId);
            const { allCalledIds: fbCalledIds, aiCalledIds: fbAiIds } = await getWorkspaceCallSets(workspaceId);
            const fbFunnels = await prisma.funnel.findMany({
                where: { workspaceId },
                include: { stages: { select: { id: true } } }
            }).catch(() => []);
            const fbFunnelCounts = {};
            fbFunnels.forEach(f => {
                fbFunnelCounts[f.id] = totalCount;
                fbFunnelCounts[f.name] = totalCount;
            });
            return res.json({
                contacts: finalContacts,
                total: totalCount,
                allImportGroups: [],
                allTags: fbTags,
                quickStats: {
                    periodCount: totalCount,
                    withPhoneCount,
                    noPhoneCount: Math.max(0, totalCount - withPhoneCount),
                    agentCalledCount: fbCalledIds.size,
                    aiCalledCount: fbAiIds.size,
                    noActivityCount: Math.max(0, withPhoneCount - fbCalledIds.size),
                    totalAllTime: totalCount,
                    funnelCounts: fbFunnelCounts,
                    funnelStageCounts: {},
                    salesCount: 0
                }
            });
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
        const { name, fullName, phone, email, notes, tags, status, company, category, funnelType, funnelStageId, language, country, city, marketingOptOut, marketingOptOutAt, consentChannels, leadSource, leadSourceDetail, birthDate } = req.body;

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

        // ── İLK BAŞVURU KAYNAĞI KORUMASI ────────────────────────────────
        // Kişideki kaynak "ilk temas"tır ve kalıcı olmalıdır. Önceden bu alan
        // herkesin açılır listeden serbestçe değiştirebildiği, hiçbir yere
        // kaydedilmeyen bir alandı; temsilci referans kaydını sessizce
        // Instagram'a çevirebiliyordu.
        // Kural: boşken herkes doldurabilir; DOLU bir değeri değiştirmek
        // yönetici yetkisi ister ve kişi zaman tüneline not düşülür.
        const changingSource =
            leadSource !== undefined &&
            leadSource !== null &&
            String(leadSource) !== String(existing.leadSource || '') &&
            !!existing.leadSource;

        if (changingSource) {
            const role = req.workspaceMember?.role;
            const canOverride = ['SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER'].includes(role);
            if (!canOverride) {
                return res.status(403).json({
                    error: 'Kişinin ilk başvuru kaynağı değiştirilemez. Değişiklik için yönetici yetkisi gerekir.',
                    field: 'leadSource',
                    current: existing.leadSource
                });
            }
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
        if (funnelStageId !== undefined) {
            if (funnelStageId && typeof funnelStageId === 'string' && funnelStageId.length < 20) {
                // Prevent foreign key constraint failure for static statuses like "HOT_OPPORTUNITY"
                if (status === undefined) {
                    updateData.status = funnelStageId;
                }
            } else {
                updateData.funnelStageId = funnelStageId;
            }
        }
        if (language !== undefined) updateData.language = language;
        if (country !== undefined) updateData.country = country;
        if (city !== undefined) updateData.city = city;
        if (birthDate !== undefined) updateData.birthDate = birthDate ? new Date(birthDate) : null;
        if (tags !== undefined) {
            updateData.tags = typeof tags === 'string' ? tags : JSON.stringify(tags);
        }
        if (marketingOptOut !== undefined) updateData.marketingOptOut = marketingOptOut;
        if (marketingOptOutAt !== undefined) updateData.marketingOptOutAt = marketingOptOutAt;
        if (consentChannels !== undefined) {
            updateData.consentChannels = typeof consentChannels === 'string' ? consentChannels : JSON.stringify(consentChannels);
        }
        if (leadSource !== undefined) updateData.leadSource = leadSource;
        if (leadSourceDetail !== undefined) updateData.leadSourceDetail = leadSourceDetail;

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

        let contact = null;

        // ── Auto Merge Logic if phone changes ──
        if (newPhone && newPhone !== existing.phone) {
            const normalizedNewPhone = normalizePhone(newPhone);
            const phoneVariants = [...new Set([newPhone, normalizedNewPhone])];
            
            if (newPhone.startsWith('90') && newPhone.length === 12) {
                phoneVariants.push('+' + newPhone, '0' + newPhone.slice(2));
            }
            if (normalizedNewPhone.startsWith('+90')) {
                phoneVariants.push(normalizedNewPhone.slice(1), '0' + normalizedNewPhone.slice(3));
            }

            const duplicateContact = await prisma.contact.findFirst({
                where: {
                    workspaceId,
                    id: { not: existing.id },
                    OR: phoneVariants.map(p => ({ phone: p }))
                }
            });

            if (duplicateContact) {
                // Merge current (existing) contact into the duplicateContact
                console.log(`🔗 [Auto-Merge] Contact phone update triggered merge. Target: ${duplicateContact.id}, Source: ${existing.id}`);
                // Before merging, apply the requested updates to duplicateContact
                await prisma.contact.update({
                    where: { id: duplicateContact.id },
                    data: updateData // Apply the updates the user just made
                });
                contact = await mergeContacts(duplicateContact.id, existing.id);
            }
        }

        if (!contact) {
            contact = await prisma.contact.update({
                where: { id },
                data: updateData
            });
        }

        // Kaynak değişikliği iz bırakır — kim, ne zaman, neyi neye çevirdi
        if (changingSource) {
            const { LEAD_SOURCE_LABELS } = await import('../utils/leadSource.js');
            const lbl = (v) => LEAD_SOURCE_LABELS[String(v || '').toUpperCase()] || v || '(boş)';
            await prisma.contactActivity.create({
                data: {
                    workspaceId,
                    contactId: id,
                    type: 'NOTE',
                    title: '📍 İlk başvuru kaynağı değiştirildi',
                    description: `${lbl(existing.leadSource)} → ${lbl(leadSource)}\nDeğiştiren: ${req.user?.name || req.user?.email || 'bilinmiyor'}`,
                    status: 'COMPLETED',
                    source: 'MANUAL',
                    createdBy: req.user?.id || null
                }
            }).catch(e => console.error('[Contact] Kaynak değişikliği notu yazılamadı:', e.message));
            console.log(`📍 [Contact] ${id} kaynağı değişti: ${existing.leadSource} → ${leadSource} (${req.user?.id})`);
        }

        // ── Auto-update Case status based on stage's statusType ──
        if (funnelStageId !== undefined) {
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
                    // Moving to an open (non-closing) stage — reopen closed cases and update active ones
                    const activeCases = await prisma.case.findMany({
                        where: { workspaceId, contactId: id, status: 'ACTIVE' }
                    });
                    for (const activeCase of activeCases) {
                        await prisma.case.update({
                            where: { id: activeCase.id },
                            data: { funnelStageId: funnelStageId, funnelType: updateData.funnelType || activeCase.funnelType }
                        });
                        console.log(`🏷️ [Case] Auto-updated active case ${activeCase.caseNumber || activeCase.id} → stage: ${newStage.name}`);
                    }

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
                } else if (!newStage) {
                    // Stage is a short string or null (e.g. HOT_OPPORTUNITY)
                    // Clear the funnelStageId on active cases so UI falls back to contact.status
                    const activeCases = await prisma.case.findMany({
                        where: { workspaceId, contactId: id, status: 'ACTIVE' }
                    });
                    for (const activeCase of activeCases) {
                        await prisma.case.update({
                            where: { id: activeCase.id },
                            data: { 
                                funnelStageId: funnelStageId === null ? null : (funnelStageId.length < 20 ? null : funnelStageId), 
                                funnelType: updateData.funnelType || activeCase.funnelType 
                            }
                        });
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

        // 🤖 Otomasyon Hook: Aşama değişikliği bildirimi
        if (funnelStageId !== undefined && existing.funnelStageId !== funnelStageId) {
            const stageWsId = workspaceId || existing.workspaceId;
            if (stageWsId) {
                executeRule(stageWsId, 'FUNNEL_STAGE_NOTIFY', {
                    contactId: id,
                    notificationMessage: `📊 Aşama değişikliği: ${existing.funnelStageId || 'Yok'} → ${funnelStageId || 'Yok'}`
                }).catch(e => console.error('[AutoHook] FUNNEL_STAGE_NOTIFY error:', e.message));
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

        // Son Durum / Not / Skor Güncellemesi: Contact güncellendiğinde skorları anlık yeniden hesapla
        if (id) {
            import('../services/leadScoring.service.js').then(({ updateLeadScore }) => {
                updateLeadScore(id).catch(err =>
                    console.error('⚠️ [UpdateContact] Lead score update error:', err.message)
                );
            });
        }

        // Entry Rules: Contact bilgileri güncellendi → aşama kurallarını değerlendir
        const evalWorkspaceId = workspaceId || contact.workspaceId;
        if (evalWorkspaceId) {
            evaluateAndApplyRules(id, evalWorkspaceId).catch(err =>
                console.error('⚠️ [UpdateContact] Entry rules hatası:', err.message)
            );
        }

        // Madde 4: Not analizi — notes güncellendiğinde AI analiz tetikle
        if (notes !== undefined && notes && evalWorkspaceId) {
            try {
                const { analyzeNote } = await import('../services/noteAnalyzer.service.js');
                analyzeNote(evalWorkspaceId, id, notes).catch(err =>
                    console.error('⚠️ [NoteAnalyzer] Analiz hatası:', err.message)
                );
            } catch (e) { /* opsiyonel — servis yoksa sessiz geç */ }
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
        const { name, phone: rawPhone, email, notes, company, funnelType, funnelStageId, leadSource, leadSourceDetail } = req.body;
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
                leadSource: leadSource || null,
                leadSourceDetail: leadSourceDetail || null,
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

            // Create initial system message so conversation isn't empty
            const contactInfo = [
                `📋 Yeni kayıt: ${name}`,
                phone ? `📞 ${phone}` : null,
                email ? `✉️ ${email}` : null,
                company ? `🏢 ${company}` : null,
                `👤 Ekleyen: ${req.user?.name || req.user?.email || 'Sistem'}`
            ].filter(Boolean).join('\n');

            await prisma.message.create({
                data: {
                    conversationId: conversation.id,
                    content: contactInfo,
                    sender: 'SYSTEM',
                    type: 'SYSTEM',
                    createdAt: new Date()
                }
            });

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

        // 🤖 Otomasyon Hook'ları — Yeni lead/kişi oluşturuldu
        try {
            // Talep alındı bildirimi
            executeRule(workspaceId, 'REQUEST_RECEIVED_NOTIFY', { contactId: contact.id }).catch(e => console.error('[AutoHook] REQUEST_RECEIVED_NOTIFY error:', e.message));
            // Hoşgeldin mesajı
            executeRule(workspaceId, 'LEAD_WELCOME', { contactId: contact.id }).catch(e => console.error('[AutoHook] LEAD_WELCOME error:', e.message));
            // Otomatik lead atama (round-robin)
            executeRule(workspaceId, 'LEAD_AUTO_ASSIGN', { contactId: contact.id }).catch(e => console.error('[AutoHook] LEAD_AUTO_ASSIGN error:', e.message));
            // Takıma yeni lead bildirimi
            executeRule(workspaceId, 'NEW_LEAD_NOTIFY', {
                contactId: contact.id,
                notificationMessage: `🎯 Yeni lead: ${name} ${phone || ''}`
            }).catch(e => console.error('[AutoHook] NEW_LEAD_NOTIFY error:', e.message));
            // Lead puanlama başlat
            executeRule(workspaceId, 'LEAD_SCORING', { contactId: contact.id }).catch(e => console.error('[AutoHook] LEAD_SCORING error:', e.message));
        } catch (hookErr) {
            console.error('[AutoHook] Contact creation hooks error:', hookErr.message);
        }

        res.status(201).json({ contact });

        // ── Madde 0+8: Manual entry → Inbox'a düşür ──────────
        try {
            const { normalizeManualEntry } = await import('../adapters/manual.adapter.js');
            const { processIncoming } = await import('./inbox.controller.js');
            const normalized = normalizeManualEntry(workspaceId, contact, {
                note: notes,
                createdByName: req.user?.name || req.user?.email || 'Sistem',
            });
            // Async çalışsın — response zaten döndü
            processIncoming(normalized).catch(err =>
                console.error('⚠️ [CreateContact] Inbox integration error:', err.message)
            );
        } catch (inboxErr) {
            console.error('⚠️ [CreateContact] Inbox adapter error:', inboxErr.message);
        }

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

                // Create initial system message so conversation isn't empty
                const importInfo = [
                    `📥 Yeni lead: ${name}`,
                    phone ? `📞 ${phone}` : null,
                    email ? `✉️ ${email}` : null,
                    notes ? `📝 ${notes}` : null,
                    tag ? `🏷️ Etiket: ${tag}` : null,
                    `📥 Kaynak: İçe Aktarma`
                ].filter(Boolean).join('\n');

                await prisma.message.create({
                    data: {
                        conversationId: conversation.id,
                        content: importInfo,
                        sender: 'SYSTEM',
                        type: 'SYSTEM',
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


        // Appointment Statistics — startTime ile filtrele (randevunun tarihi, oluşturulma tarihi değil!)
        const appointmentFilter = { workspaceId, ...(teamUserIds ? { OR: [{ assignedToId: { in: teamUserIds } }, { createdById: { in: teamUserIds } }] } : {}) };
        if (startDate || endDate) {
            appointmentFilter.startTime = {};
            if (startDate) appointmentFilter.startTime.gte = parseDateStartTR(startDate);
            if (endDate) appointmentFilter.startTime.lte = parseDateEndTR(endDate);
        }

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

        // ── Gelen Talep Analizi (topicCategory bazlı — yeni kategori sistemi) ──
        let requestAnalysis = { topics: [], totalRequests: 0, withPhoneCount: 0, calledCount: 0, relevantCount: 0 };
        try {
            // topicCategory atanmış konuşmaları çek
            const topicConversations = await prisma.conversation.findMany({
                where: {
                    workspaceId,
                    OR: [
                        { topicCategoryId: { not: null } },
                        { aiTopic: { not: null } }
                    ],
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
                    topicCategoryId: true,
                    topicCategory: {
                        select: { id: true, name: true, icon: true, color: true }
                    },
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

            // Kategori bazlı gruplama — topicCategory varsa onu kullan, yoksa aiTopic
            const topicMap = {};
            const seenContactsByTopic = {};
            for (const conv of topicConversations) {
                const catName = conv.topicCategory?.name || conv.aiTopic?.trim();
                if (!catName) continue;

                const key = catName;
                if (!topicMap[key]) {
                    topicMap[key] = {
                        topic: catName,
                        icon: conv.topicCategory?.icon || null,
                        color: conv.topicCategory?.color || null,
                        categoryId: conv.topicCategoryId || null,
                        count: 0, withPhone: 0, called: 0, relevant: 0,
                        wonCount: 0, wonAmount: 0,
                        contactIds: new Set(),
                        stageDist: {}
                    };
                    seenContactsByTopic[key] = new Set();
                }

                // Aynı kişi birden fazla konuşma açmış olabilir, unique say
                if (seenContactsByTopic[key].has(conv.contactId)) continue;
                seenContactsByTopic[key].add(conv.contactId);

                const t = topicMap[key];
                t.count++;
                t.contactIds.add(conv.contactId);
                if (conv.contact?.phone && conv.contact.phone.trim()) {
                    t.withPhone++;
                }
                if (calledContactIds.has(conv.contactId)) {
                    t.called++;
                }
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

            // WON deal'leri topic'lere bağla
            const topicContactIds = new Set();
            for (const t of Object.values(topicMap)) {
                t.contactIds.forEach(id => topicContactIds.add(id));
            }
            if (topicContactIds.size > 0) {
                const wonDealsForTopics = await prisma.deal.findMany({
                    where: {
                        workspaceId,
                        status: 'WON',
                        contactId: { in: Array.from(topicContactIds) }
                    },
                    select: { contactId: true, amount: true }
                });
                const contactToTopics = {};
                for (const [topicName, tData] of Object.entries(topicMap)) {
                    tData.contactIds.forEach(cid => {
                        if (!contactToTopics[cid]) contactToTopics[cid] = [];
                        contactToTopics[cid].push(topicName);
                    });
                }
                for (const deal of wonDealsForTopics) {
                    const topics = contactToTopics[deal.contactId] || [];
                    for (const tn of topics) {
                        topicMap[tn].wonCount++;
                        topicMap[tn].wonAmount += (deal.amount || 0);
                    }
                }
            }

            const topicsArray = Object.values(topicMap)
                .map(t => ({
                    topic: t.topic,
                    icon: t.icon,
                    color: t.color,
                    categoryId: t.categoryId,
                    count: t.count,
                    withPhone: t.withPhone,
                    called: t.called,
                    relevant: t.relevant,
                    wonCount: t.wonCount || 0,
                    wonAmount: t.wonAmount || 0,
                    stageDist: t.stageDist
                }))
                .sort((a, b) => b.count - a.count);

            const recentConvList = await prisma.conversation.findMany({
                where: {
                    workspaceId,
                    OR: [
                        { topicCategoryId: { not: null } },
                        { aiTopic: { not: null } }
                    ]
                },
                take: 5,
                orderBy: { createdAt: 'desc' },
                include: {
                    topicCategory: { select: { name: true, icon: true } },
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
                topic: c.topicCategory?.name || c.aiTopic,
                icon: c.topicCategory?.icon || null,
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
                aiClassified: false,
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
            // startTime ile filtrele — randevunun planlandığı tarih, oluşturulma tarihi değil
            const appointmentTimeFilter = {};
            if (startDate || endDate) {
                appointmentTimeFilter.startTime = {};
                if (startDate) appointmentTimeFilter.startTime.gte = parseDateStartTR(startDate);
                if (endDate) appointmentTimeFilter.startTime.lte = parseDateEndTR(endDate);
            }
            const appointmentFromTable = await prisma.appointment.count({
                where: {
                    workspaceId,
                    OR: [
                        { assignedToId: userId },
                        { createdById: userId }
                    ],
                    ...appointmentTimeFilter
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
                where: { workspaceId, assignedToId: userId, OR: [{ aiTopic: { not: null } }, { topicCategoryId: { not: null } }], ...dateFilter },
                select: {
                    aiTopic: true,
                    topicCategoryId: true,
                    topicCategory: { select: { name: true, icon: true } },
                    contactId: true,
                    contact: { select: { funnelStageId: true, status: true } }
                }
            });

            const topicBreakdown = {};
            const seenTopicContacts = {};
            for (const c of agentTopicConvs) {
                // Kategori varsa onu kullan, yoksa aiTopic'e düş
                const t = c.topicCategory?.name || (c.aiTopic || '').trim();
                if (!t) continue;
                if (!topicBreakdown[t]) {
                    topicBreakdown[t] = { count: 0, converted: 0, opportunity: 0, stages: {}, icon: c.topicCategory?.icon || null };
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
            channel: 'INTERNAL',
            assignedToId: conversation.assignedToId || null,
            assignedTeamId: conversation.assignedTeamId || null
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
        const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });

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

        // Hem topicCategory.name hem aiTopic ile ara
        const conversations = await prisma.conversation.findMany({
            where: {
                workspaceId,
                OR: [
                    { topicCategory: { name: topic } },
                    { aiTopic: topic }
                ],
                ...dateFilter
            },
            select: {
                id: true,
                aiTopic: true,
                topicCategoryId: true,
                topicCategory: { select: { name: true, icon: true } },
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

export const getAnalysisReport = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { startDate, endDate, agentId, topic, stageId } = req.query;

        // Date filter
        let dateFilter = {};
        if (startDate || endDate) {
            dateFilter.createdAt = {};
            if (startDate) dateFilter.createdAt.gte = parseDateStartTR(startDate);
            if (endDate) dateFilter.createdAt.lte = parseDateEndTR(endDate);
        }

        // Get all funnels for stage lookup
        const allFunnels = await prisma.funnel.findMany({
            where: { workspaceId },
            include: { stages: { select: { id: true, name: true, color: true }, orderBy: { order: 'asc' } } }
        });
        const stageLookup = {};
        const allStageNames = new Set();
        for (const f of allFunnels) {
            for (const s of f.stages) {
                stageLookup[s.id] = { name: s.name, color: s.color };
                allStageNames.add(s.name);
            }
        }

        // Get workspace members
        const members = await prisma.workspaceMember.findMany({
            where: { workspaceId },
            include: { user: { select: { id: true, name: true } } }
        });
        const agentLookup = {};
        for (const m of members) {
            agentLookup[m.user.id] = m.user.name;
        }

        // Build conversation query
        const convWhere = {
            workspaceId,
            ...dateFilter
        };
        if (agentId) convWhere.assignedToId = agentId;
        if (topic) {
            convWhere.OR = [
                { aiTopic: topic },
                { topicCategory: { name: topic } }
            ];
        } else {
            convWhere.OR = [
                { aiTopic: { not: null } },
                { topicCategoryId: { not: null } }
            ];
        }

        // Fetch conversations
        const conversations = await prisma.conversation.findMany({
            where: convWhere,
            select: {
                id: true,
                aiTopic: true,
                topicCategoryId: true,
                topicCategory: { select: { name: true, icon: true } },
                assignedToId: true,
                channel: true,
                createdAt: true,
                contactId: true,
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
                assignedTo: { select: { id: true, name: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        // Apply stageId filter if provided
        let filteredConvs = conversations;
        if (stageId) {
            filteredConvs = conversations.filter(c => c.contact?.funnelStageId === stageId);
        }

        // Build pivot: agent × topic × stage
        const pivotMap = {}; // key: agentId|topic
        const topicSet = new Set();
        const agentSet = new Set();
        const seenContacts = new Map(); // contactId -> conv (for dedup in contact list)

        for (const conv of filteredConvs) {
            const aId = conv.assignedToId || '__unassigned';
            const aName = conv.assignedTo?.name || 'Atanmamış';
            const t = conv.topicCategory?.name || (conv.aiTopic || '').trim();
            if (!t) continue;

            topicSet.add(t);
            agentSet.add(aId);

            const key = `${aId}|||${t}`;
            if (!pivotMap[key]) {
                pivotMap[key] = {
                    agentId: aId,
                    agentName: aName,
                    topic: t,
                    count: 0,
                    stages: {},
                    contactIds: new Set()
                };
            }

            const p = pivotMap[key];
            // Dedup by contactId
            if (p.contactIds.has(conv.contactId)) continue;
            p.contactIds.add(conv.contactId);
            p.count++;

            // Stage tracking
            const sId = conv.contact?.funnelStageId;
            const sInfo = sId ? stageLookup[sId] : null;
            const sName = sInfo ? sInfo.name : 'Atanmamış';
            const sColor = sInfo ? sInfo.color : '#94a3b8';
            if (!p.stages[sName]) p.stages[sName] = { count: 0, color: sColor };
            p.stages[sName].count++;

            // Contact list dedup
            if (!seenContacts.has(conv.contactId)) {
                seenContacts.set(conv.contactId, conv);
            }
        }

        // Build pivot array sorted by agent then count desc
        const pivotData = Object.values(pivotMap)
            .map(p => ({
                agentId: p.agentId,
                agentName: p.agentName,
                topic: p.topic,
                count: p.count,
                stages: p.stages,
                wonCount: 0,
                wonAmount: 0
            }))
            .sort((a, b) => {
                if (a.agentName !== b.agentName) return a.agentName.localeCompare(b.agentName, 'tr');
                return b.count - a.count;
            });

        // ── Deal / Sales data (tüm deal'lar = satış) ──
        const dealWhere = { workspaceId, ...dateFilter };
        if (agentId) dealWhere.assignedToId = agentId;
        const wonDeals = await prisma.deal.findMany({
            where: dealWhere,
            select: {
                id: true,
                amount: true,
                title: true,
                status: true,
                createdAt: true,
                wonAt: true,
                assignedToId: true,
                assignedTo: { select: { name: true } },
                contact: {
                    select: {
                        id: true,
                        name: true,
                        phone: true,
                        email: true,
                        status: true,
                        funnelStageId: true,
                        conversations: {
                            where: { workspaceId, aiTopic: { not: null } },
                            select: { aiTopic: true },
                            take: 1,
                            orderBy: { createdAt: 'desc' }
                        }
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        // Match deals to pivot rows + build sales list
        let totalWonCount = 0, totalWonAmount = 0;
        const salesList = [];
        for (const deal of wonDeals) {
            const dealAgentId = deal.assignedToId || '__unassigned';
            const dealTopic = deal.contact?.conversations?.[0]?.aiTopic?.trim() || null;
            
            // Apply topic filter to sales list too
            if (topic && dealTopic !== topic) continue;
            
            totalWonCount++;
            totalWonAmount += (deal.amount || 0);
            if (dealTopic) {
                const pivotRow = pivotData.find(p => p.agentId === dealAgentId && p.topic === dealTopic);
                if (pivotRow) {
                    pivotRow.wonCount++;
                    pivotRow.wonAmount += (deal.amount || 0);
                }
            }
            
            // Build sales list entry
            const sInfo = deal.contact?.funnelStageId ? stageLookup[deal.contact.funnelStageId] : null;
            salesList.push({
                dealId: deal.id,
                title: deal.title || '',
                amount: deal.amount || 0,
                dealStatus: deal.status,
                contactId: deal.contact?.id,
                contactName: deal.contact?.name || 'İsimsiz',
                phone: deal.contact?.phone || '',
                email: deal.contact?.email || '',
                topic: dealTopic,
                stageName: sInfo?.name || null,
                stageColor: sInfo?.color || null,
                agentName: deal.assignedTo?.name || 'Atanmamış',
                agentId: dealAgentId,
                createdAt: deal.createdAt,
                closedAt: deal.wonAt
            });
        }

        // Agent summaries
        const agentSummaries = {};
        for (const p of pivotData) {
            if (!agentSummaries[p.agentId]) {
                agentSummaries[p.agentId] = { agentId: p.agentId, agentName: p.agentName, totalCount: 0, topicCount: 0, stages: {} };
            }
            const as = agentSummaries[p.agentId];
            as.totalCount += p.count;
            as.topicCount++;
            as.wonCount = (as.wonCount || 0) + (p.wonCount || 0);
            as.wonAmount = (as.wonAmount || 0) + (p.wonAmount || 0);
            for (const [sName, sData] of Object.entries(p.stages)) {
                if (!as.stages[sName]) as.stages[sName] = { count: 0, color: sData.color };
                as.stages[sName].count += sData.count;
            }
        }

        // ── Build contact deal map (all deals, not just WON) ──
        const allDeals = await prisma.deal.findMany({
            where: { workspaceId, ...dateFilter },
            select: {
                id: true, amount: true, status: true, title: true,
                contactId: true, assignedToId: true, createdAt: true
            }
        });
        const contactDealMap = {};
        for (const deal of allDeals) {
            if (!deal.contactId) continue;
            if (!contactDealMap[deal.contactId]) {
                contactDealMap[deal.contactId] = { wonAmount: 0, wonCount: 0, totalDeals: 0, latestDealStatus: null, latestDealTitle: null };
            }
            const cd = contactDealMap[deal.contactId];
            cd.totalDeals++;
            cd.wonCount++;
            cd.wonAmount += (deal.amount || 0);
            cd.latestDealStatus = deal.status;
            cd.latestDealTitle = deal.title;
        }

        // Contact list (limited to 500 for performance)
        const contacts = [];
        let allWithPhone = 0, allInterested = 0, allConverted = 0;
        const relevantStatuses = ['OPPORTUNITY', 'HOT_OPPORTUNITY', 'MEETING_PLANNED', 'PROPOSAL', 'CONVERTED'];
        for (const [cId, conv] of seenContacts) {
            const sInfo = conv.contact?.funnelStageId ? stageLookup[conv.contact.funnelStageId] : null;
            const phone = conv.contact?.phone || '';
            const status = conv.contact?.status || 'NEW';
            if (phone && phone.trim()) allWithPhone++;
            if (relevantStatuses.includes(status)) allInterested++;
            if (status === 'CONVERTED') allConverted++;
            const contactId = conv.contact?.id || cId;
            const dealInfo = contactDealMap[contactId] || null;
            if (contacts.length < 500) {
                contacts.push({
                    id: contactId,
                    name: conv.contact?.name || 'İsimsiz',
                    phone: phone,
                    email: conv.contact?.email || '',
                    status: status,
                    stageName: sInfo?.name || null,
                    stageColor: sInfo?.color || null,
                    company: conv.contact?.company || '',
                    source: conv.contact?.source || '',
                    topic: conv.aiTopic,
                    channel: conv.channel || '',
                    assigneeName: conv.assignedTo?.name || null,
                    assigneeId: conv.assignedToId,
                    createdAt: conv.contact?.createdAt,
                    conversationDate: conv.createdAt,
                    dealWonAmount: dealInfo?.wonAmount || 0,
                    dealWonCount: dealInfo?.wonCount || 0,
                    dealTotal: dealInfo?.totalDeals || 0,
                    dealStatus: dealInfo?.latestDealStatus || null,
                    dealTitle: dealInfo?.latestDealTitle || null
                });
            }
        }

        // Summary KPIs
        const totalCount = seenContacts.size;
        const contactsWithDeal = contacts.filter(c => c.dealWonCount > 0).length;

        // Available filter options
        const availableAgents = Object.values(agentSummaries).map(a => ({ id: a.agentId, name: a.agentName })).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
        const availableTopics = [...topicSet].sort((a, b) => a.localeCompare(b, 'tr'));
        const availableStages = allFunnels.flatMap(f => f.stages.map(s => ({ id: s.id, name: s.name, color: s.color })));

        res.json({
            summary: { totalCount, withPhone: allWithPhone, interested: allInterested, converted: allConverted, wonCount: totalWonCount, wonAmount: totalWonAmount, contactsWithDeal },
            pivotData,
            agentSummaries: Object.values(agentSummaries).sort((a, b) => b.totalCount - a.totalCount),
            contacts,
            salesList,
            filters: { agents: availableAgents, topics: availableTopics, stages: availableStages }
        });
    } catch (error) {
        console.error('Analysis report error:', error);
        res.status(500).json({ error: error.message });
    }
};

// ── Kaynak ismi formatlama ──
const SOURCE_LABELS = {
    'FACEBOOK': 'Facebook',
    'FACEBOOK_LEAD': 'Facebook Lead Form',
    'INSTAGRAM': 'Instagram',
    'WHATSAPP': 'WhatsApp',
    'WIDGET': 'Web Widget',
    'EMAIL': 'E-posta',
    'WEB_FORM': 'Web Form',
    'FORM': 'Form',
    'LEAD': 'Lead',
    'MANUAL': 'Manuel',
    'API': 'API',
    'IMPORT': 'İçe Aktarma',
};
const formatSourceName = (raw) => SOURCE_LABELS[raw] || raw || 'Bilinmeyen';

// ── Satış Raporu (Yeni — topicCategory bazlı) ──
export const getSalesReport = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { startDate, endDate } = req.query;

        let dateFilter = {};
        if (startDate || endDate) {
            dateFilter.createdAt = {};
            if (startDate) dateFilter.createdAt.gte = parseDateStartTR(startDate);
            if (endDate) dateFilter.createdAt.lte = parseDateEndTR(endDate);
        }

        // WON deal'ları çek — conversation üzerinden topicCategory bilgisiyle
        const deals = await prisma.deal.findMany({
            where: {
                workspaceId,
                status: 'WON',
                ...dateFilter
            },
            select: {
                id: true,
                title: true,
                amount: true,
                currency: true,
                stage: true,
                products: true, // JSON array — ürün bilgisi (kategori eşleşmesi için)
                createdAt: true,
                assignedToId: true,
                assignedTo: { select: { id: true, name: true, avatar: true } },
                contactId: true,
                contact: {
                    select: {
                        id: true,
                        name: true,
                        phone: true,
                        email: true,
                        source: true
                    }
                },
                conversationId: true,
                conversation: {
                    select: {
                        topicCategoryId: true,
                        topicCategory: { select: { id: true, name: true, icon: true, color: true } },
                        aiTopic: true // AI tarafından atanan serbest metin konu (fallback için)
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        // Workspace'in tüm TopicCategory'lerini keywords dahil önceden çek
        const allTopicCategories = await prisma.topicCategory.findMany({
            where: { workspaceId },
            select: { id: true, name: true, icon: true, color: true, keywords: true }
        });

        // Her kategorinin keywords dizisini parse et
        const categoriesWithKeywords = allTopicCategories.map(tc => {
            let kw = [];
            try { kw = tc.keywords ? JSON.parse(tc.keywords) : []; } catch { kw = []; }
            return { ...tc, kwList: kw.map(k => k.toLocaleLowerCase('tr-TR').trim()) };
        });

        // Metin → TopicCategory eşleştirici
        // Öncelik sırası: tam isim → isim içerme → keywords eşleşmesi
        const matchTopicByText = (text) => {
            if (!text) return null;
            const lower = text.toLocaleLowerCase('tr-TR').trim();
            // 1) Tam isim eşleşmesi
            let match = categoriesWithKeywords.find(tc => tc.name.toLocaleLowerCase('tr-TR') === lower);
            if (match) return match;
            // 2) Metin, kategori adını içeriyor mu?
            match = categoriesWithKeywords.find(tc => lower.includes(tc.name.toLocaleLowerCase('tr-TR')));
            if (match) return match;
            // 3) Kategori adı, metni içeriyor mu?
            match = categoriesWithKeywords.find(tc => tc.name.toLocaleLowerCase('tr-TR').includes(lower));
            if (match) return match;
            // 4) Keywords eşleşmesi — en geniş kapsam
            match = categoriesWithKeywords.find(tc =>
                tc.kwList.some(kw => kw && (lower.includes(kw) || kw.includes(lower)))
            );
            return match || null;
        };

        // Workspace'in tüm ürünlerini categoryId ile birlikte önceden çek
        const allProducts = await prisma.product.findMany({
            where: { workspaceId },
            select: { id: true, name: true, groupName: true, categoryId: true, category: { select: { id: true, name: true, icon: true, color: true } } }
        });
        // Ürün adı → product haritası (hızlı lookup için)
        const productByName = {};
        const productById = {};
        for (const p of allProducts) {
            productByName[p.name.toLocaleLowerCase('tr-TR').trim()] = p;
            productById[p.id] = p;
        }

        // Deal'ın ürünlerinden kategori bul
        const getCategoryFromProducts = (deal) => {
            try {
                const products = typeof deal.products === 'string' ? JSON.parse(deal.products || '[]') : (deal.products || []);
                for (const item of products) {
                    // 1. productId varsa direkt bul
                    if (item.productId && productById[item.productId]?.category) {
                        return productById[item.productId].category;
                    }
                    // 2. categoryId varsa direkt bul
                    if (item.categoryId) {
                        const cat = allTopicCategories.find(tc => tc.id === item.categoryId);
                        if (cat) return cat;
                    }
                    // 3. Ürün adından eşleştir
                    if (item.name) {
                        const found = productByName[item.name.toLocaleLowerCase('tr-TR').trim()];
                        if (found?.category) return found.category;
                        // 4. groupName'den eşleştir
                        if (found?.groupName) {
                            const catFromGroup = matchTopicByText(found.groupName);
                            if (catFromGroup) return catFromGroup;
                        }
                    }
                }
            } catch { /* JSON parse error */ }
            return null;
        };

        // Her deal'a topicCategory ekle
        const salesList = await Promise.all(deals.map(async (d) => {
            // 1. Ürünün kategorisi (en doğru kaynak — satılan şey üründür)
            let topicCat = getCategoryFromProducts(d);

            // 2. Deal'ın kendi conversation'ının yapılandırılmış topicCategory'si
            if (!topicCat) {
                topicCat = d.conversation?.topicCategory || null;
            }

            // 3. Conversation'da topicCategoryId yoksa, aiTopic metnini mevcut kategorilerle eşleştir.
            if (!topicCat && d.conversation?.aiTopic) {
                topicCat = matchTopicByText(d.conversation.aiTopic);
            }

            // 4. Deal başlığını kategori isimleriyle eşleştirmeyi dene.
            if (!topicCat && d.title) {
                topicCat = matchTopicByText(d.title);
            }

            // 5. Son çare: deal ürünlerinin groupName'lerini text eşleştir
            if (!topicCat) {
                try {
                    const products = typeof d.products === 'string' ? JSON.parse(d.products || '[]') : (d.products || []);
                    for (const item of products) {
                        if (item.name) {
                            topicCat = matchTopicByText(item.name);
                            if (topicCat) break;
                        }
                    }
                } catch { /* ignore */ }
            }

            return {
                id: d.id,
                title: d.title,
                amount: d.amount || 0,
                currency: d.currency || 'TRY',
                stage: d.stage,
                createdAt: d.createdAt,
                agentId: d.assignedToId,
                agentName: d.assignedTo?.name || 'Atanmamış',
                agentAvatar: d.assignedTo?.avatar || null,
                contactName: d.contact?.name || 'Bilinmeyen',
                contactPhone: d.contact?.phone || '',
                contactEmail: d.contact?.email || '',
                source: d.contact?.source ? formatSourceName(d.contact.source) : null,
                categoryId: topicCat?.id || null,
                categoryName: topicCat?.name || 'Kategorisiz',
                categoryIcon: topicCat?.icon || null,
                categoryColor: topicCat?.color || null
            };
        }));

        // Toplam
        const totalCount = salesList.length;
        const totalAmount = salesList.reduce((s, d) => s + d.amount, 0);

        // Konuya göre gruplama
        const byTopic = {};
        for (const s of salesList) {
            const key = s.categoryName;
            if (!byTopic[key]) {
                byTopic[key] = {
                    name: key,
                    icon: s.categoryIcon,
                    color: s.categoryColor,
                    count: 0,
                    amount: 0,
                    agents: {}
                };
            }
            byTopic[key].count++;
            byTopic[key].amount += s.amount;
            // Agent alt grubu
            const aKey = s.agentName;
            if (!byTopic[key].agents[aKey]) {
                byTopic[key].agents[aKey] = { name: aKey, count: 0, amount: 0 };
            }
            byTopic[key].agents[aKey].count++;
            byTopic[key].agents[aKey].amount += s.amount;
        }
        const topicGroups = Object.values(byTopic)
            .map(g => ({
                ...g,
                agents: Object.values(g.agents).sort((a, b) => b.amount - a.amount)
            }))
            .sort((a, b) => b.amount - a.amount);

        // Temsilciye göre gruplama
        const byAgent = {};
        for (const s of salesList) {
            const key = s.agentName;
            if (!byAgent[key]) {
                byAgent[key] = {
                    name: key,
                    agentId: s.agentId,
                    avatar: s.agentAvatar,
                    count: 0,
                    amount: 0,
                    topics: {}
                };
            }
            byAgent[key].count++;
            byAgent[key].amount += s.amount;
            // Topic alt grubu
            const tKey = s.categoryName;
            if (!byAgent[key].topics[tKey]) {
                byAgent[key].topics[tKey] = { name: tKey, icon: s.categoryIcon, color: s.categoryColor, count: 0, amount: 0 };
            }
            byAgent[key].topics[tKey].count++;
            byAgent[key].topics[tKey].amount += s.amount;
        }
        const agentGroups = Object.values(byAgent)
            .map(g => ({
                ...g,
                topics: Object.values(g.topics).sort((a, b) => b.amount - a.amount)
            }))
            .sort((a, b) => b.amount - a.amount);
        // Kaynağa göre gruplama
        const bySource = {};
        for (const s of salesList) {
            const key = s.source || 'Bilinmeyen';
            if (!bySource[key]) {
                bySource[key] = { name: key, count: 0, amount: 0, agents: {} };
            }
            bySource[key].count++;
            bySource[key].amount += s.amount;
            // Agent alt grubu
            const aKey = s.agentName;
            if (!bySource[key].agents[aKey]) {
                bySource[key].agents[aKey] = { name: aKey, count: 0, amount: 0 };
            }
            bySource[key].agents[aKey].count++;
            bySource[key].agents[aKey].amount += s.amount;
        }
        const sourceGroups = Object.values(bySource)
            .map(g => ({
                ...g,
                agents: Object.values(g.agents).sort((a, b) => b.amount - a.amount)
            }))
            .sort((a, b) => b.amount - a.amount);

        res.json({
            totalCount,
            totalAmount,
            topicGroups,
            agentGroups,
            sourceGroups,
            salesList
        });
    } catch (error) {
        console.error('Sales report error:', error);
        res.status(500).json({ error: error.message });
    }
};

// ── Talep Raporu (Case + Deal bazlı — tablo formatı) ──
export const getRequestReport = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { startDate, endDate } = req.query;

        const dateFilter = (startDate || endDate) ? {
            createdAt: {
                ...(startDate ? { gte: parseDateStartTR(startDate) } : {}),
                ...(endDate ? { lte: parseDateEndTR(endDate) } : {})
            }
        } : {};

        // 1. Case'ler
        const cases = await prisma.case.findMany({
            where: { workspaceId, ...dateFilter },
            select: {
                id: true, title: true, status: true, funnelType: true, funnelStageId: true,
                assignedToId: true, assignedTo: { select: { id: true, name: true } },
                contactId: true,
                contact: { select: { id: true, phone: true, source: true } },
                conversations: {
                    select: {
                        topicCategoryId: true,
                        topicCategory: { select: { id: true, name: true, icon: true, color: true } },
                        aiTopic: true, assignedToId: true, contactId: true,
                        _count: { select: { messages: true } }
                    },
                    take: 1, orderBy: { lastMessageAt: 'desc' }
                },
                activities: { select: { type: true, assignedToId: true } }
            }
        });

        // 2. Deal'lar — conversation ve aiTopic dahil (konu eşleştirmesi için)
        const deals = await prisma.deal.findMany({
            where: { workspaceId, ...dateFilter },
            select: {
                id: true, title: true, status: true, stage: true, amount: true,
                assignedToId: true, assignedTo: { select: { id: true, name: true } },
                contactId: true,
                contact: { select: { id: true, phone: true, source: true } },
                conversationId: true,
                conversation: {
                    select: {
                        topicCategoryId: true,
                        topicCategory: { select: { id: true, name: true, icon: true, color: true } },
                        aiTopic: true
                    }
                }
            }
        });

        // Konu eşleştirme için tüm kategori + keywords'leri önceden çek
        const reqReportCategories = await prisma.topicCategory.findMany({
            where: { workspaceId },
            select: { id: true, name: true, icon: true, color: true, keywords: true }
        });
        const reqReportCatsWithKw = reqReportCategories.map(tc => {
            let kw = [];
            try { kw = tc.keywords ? JSON.parse(tc.keywords) : []; } catch { kw = []; }
            return { ...tc, kwList: kw.map(k => k.toLocaleLowerCase('tr-TR').trim()) };
        });
        const matchDealTopic = (text) => {
            if (!text) return null;
            const lower = text.toLocaleLowerCase('tr-TR').trim();
            return reqReportCatsWithKw.find(tc => tc.name.toLocaleLowerCase('tr-TR') === lower)
                || reqReportCatsWithKw.find(tc => lower.includes(tc.name.toLocaleLowerCase('tr-TR')))
                || reqReportCatsWithKw.find(tc => tc.name.toLocaleLowerCase('tr-TR').includes(lower))
                || reqReportCatsWithKw.find(tc => tc.kwList.some(kw => kw && (lower.includes(kw) || kw.includes(lower))))
                || null;
        };
        // Her deal için topicCategory belirle
        const dealTopicMap = new Map();
        for (const d of deals) {
            let topicCat = d.conversation?.topicCategory || null;
            if (!topicCat && d.conversation?.aiTopic) topicCat = matchDealTopic(d.conversation.aiTopic);
            if (!topicCat && d.title) topicCat = matchDealTopic(d.title);
            dealTopicMap.set(d.id, topicCat);
        }

        // 3. FunnelStage lookup
        const allFunnels = await prisma.funnel.findMany({
            where: { workspaceId },
            include: { stages: { select: { id: true, name: true, color: true }, orderBy: { order: 'asc' } } }
        });
        const stageLookup = {};
        for (const f of allFunnels) {
            for (const s of f.stages) {
                stageLookup[s.id] = { name: s.name, color: s.color, funnelName: f.name, funnelId: f.id };
            }
        }

        // 4. Randevular (Appointment tablosundan) — startTime ile filtrele
        const appointmentTimeFilter = (startDate || endDate) ? {
            startTime: {
                ...(startDate ? { gte: parseDateStartTR(startDate) } : {}),
                ...(endDate ? { lte: parseDateEndTR(endDate) } : {})
            }
        } : {};
        const appointments = await prisma.appointment.findMany({
            where: { workspaceId, ...appointmentTimeFilter },
            select: { assignedToId: true, createdById: true, contactId: true }
        });
        // Agent bazlı randevu sayısı
        const appointmentsByAgent = {};
        for (const apt of appointments) {
            const key = apt.assignedToId || apt.createdById || '__unassigned__';
            appointmentsByAgent[key] = (appointmentsByAgent[key] || 0) + 1;
        }
        // Contact → Topic eşleştirmesi (randevuları konulara dağıtmak için)
        const contactToTopic = {};
        for (const c of cases) {
            if (c.contactId && !contactToTopic[c.contactId]) {
                const conv = c.conversations?.[0];
                contactToTopic[c.contactId] = conv?.topicCategory?.name || 'Kategorisiz';
            }
        }

        // ── Temsilci bazlı tablo verisi ──
        const agentMap = {};
        const getAgent = (id, name) => {
            const key = id || '__unassigned__';
            if (!agentMap[key]) {
                agentMap[key] = {
                    agentId: id, agentName: name || 'Atanmamış',
                    caseCount: 0, contactIds: new Set(),
                    calls: 0, meetings: 0, appointments: 0, proposals: 0, orders: 0,
                    dealQuotes: 0, dealOrders: 0, dealInvoices: 0,
                    wonCount: 0, wonAmount: 0,
                    messageCount: 0, hasPhoneCount: 0,
                    topicBreakdown: {}
                };
            }
            return agentMap[key];
        };

        // Case'lerden temsilci verisi
        for (const c of cases) {
            const ag = getAgent(c.assignedToId, c.assignedTo?.name);
            ag.caseCount++;
            ag.contactIds.add(c.contactId);
            if (c.contact?.phone?.trim()) ag.hasPhoneCount++;

            // Aktiviteler
            for (const act of (c.activities || [])) {
                if (act.type === 'CALL') ag.calls++;
                else if (act.type === 'MEETING') ag.meetings++;
                else if (act.type === 'PROPOSAL') ag.proposals++;
                else if (act.type === 'ORDER') ag.orders++;
            }

            // Mesaj sayısı
            const conv = c.conversations?.[0];
            if (conv?._count?.messages) ag.messageCount += conv._count.messages;

            // Konu (sadece topicCategory kullan, aiTopic/title kirli veri)
            const catName = conv?.topicCategory?.name || 'Kategorisiz';
            if (!ag.topicBreakdown[catName]) {
                ag.topicBreakdown[catName] = { count: 0, wonCount: 0, wonAmount: 0 };
            }
            ag.topicBreakdown[catName].count++;

            // WON
            if (c.status === 'WON') {
                ag.wonCount++;
                ag.topicBreakdown[catName].wonCount++;
            }
        }

        // Deal'lardan temsilci verisi
        for (const d of deals) {
            const ag = getAgent(d.assignedToId, d.assignedTo?.name);
            ag.contactIds.add(d.contactId);
            if (d.contact?.phone?.trim()) ag.hasPhoneCount++;

            if (d.stage === 'QUOTE') ag.dealQuotes++;
            else if (d.stage === 'ORDER') ag.dealOrders++;
            else if (d.stage === 'INVOICE') ag.dealInvoices++;

            const dealCat = dealTopicMap.get(d.id);
            const catName = dealCat?.name || 'Manuel Satış';
            if (!ag.topicBreakdown[catName]) {
                ag.topicBreakdown[catName] = { count: 0, wonCount: 0, wonAmount: 0 };
            }
            ag.topicBreakdown[catName].count++;

            if (d.status === 'WON') {
                ag.wonCount++;
                ag.wonAmount += (d.amount || 0);
                ag.topicBreakdown[catName].wonCount++;
                ag.topicBreakdown[catName].wonAmount += (d.amount || 0);
            }
        }

        // Randevu sayılarını agent'lara uygula (Appointment tablosundan)
        for (const [key, count] of Object.entries(appointmentsByAgent)) {
            if (agentMap[key]) {
                agentMap[key].appointments = count;
            } else {
                // Agent henüz map'te yoksa oluştur
                const ag = getAgent(key, null);
                ag.appointments = count;
            }
        }

        // agentTable array'i oluştur
        const agentTable = Object.values(agentMap).map(ag => ({
            agentId: ag.agentId,
            agentName: ag.agentName,
            caseCount: ag.caseCount,
            contactCount: ag.contactIds.size,
            messageCount: ag.messageCount,
            calls: ag.calls,
            meetings: ag.meetings,
            appointments: ag.appointments,
            proposals: ag.proposals,
            orders: ag.orders + ag.dealOrders,
            dealQuotes: ag.dealQuotes,
            dealOrders: ag.dealOrders,
            dealInvoices: ag.dealInvoices,
            wonCount: ag.wonCount,
            wonAmount: ag.wonAmount,
            hasPhoneCount: ag.hasPhoneCount,
            topicBreakdown: ag.topicBreakdown
        })).sort((a, b) => b.wonAmount - a.wonAmount || b.caseCount - a.caseCount);

        // ── Toplam KPI'lar ──
        const totalCount = cases.length + deals.length;
        const totalCases = cases.length;
        const totalDeals = deals.length;
        const totalCalls = agentTable.reduce((s, a) => s + a.calls, 0);
        const totalMeetings = agentTable.reduce((s, a) => s + a.meetings, 0);
        const totalAppointments = agentTable.reduce((s, a) => s + a.appointments, 0);
        const totalProposals = agentTable.reduce((s, a) => s + a.proposals, 0);
        const totalOrders = agentTable.reduce((s, a) => s + a.orders, 0);
        const totalWonCount = agentTable.reduce((s, a) => s + a.wonCount, 0);
        const totalWonAmount = agentTable.reduce((s, a) => s + a.wonAmount, 0);
        const withPhoneCount = [...new Set([...cases.map(c => c.contactId), ...deals.map(d => d.contactId)])].length;

        // ── Talep Değerlendirme: Olumlu / Olumsuz / Devam Eden ──
        const totalLostCount = cases.filter(c => c.status === 'LOST').length + deals.filter(d => d.status === 'LOST').length;
        const totalActiveCount = cases.filter(c => c.status === 'ACTIVE' || c.status === 'PENDING' || c.status === 'IN_PROGRESS').length + deals.filter(d => d.status === 'OPEN' || d.status === 'DRAFT').length;
        const totalClosedCount = cases.filter(c => c.status === 'CLOSED').length;
        const conversionRate = totalCount > 0 ? Math.round((totalWonCount / totalCount) * 1000) / 10 : 0;
        const lostRate = totalCount > 0 ? Math.round((totalLostCount / totalCount) * 1000) / 10 : 0;

        // Konu Bazlı (case + deal birleşik)
        const byTopic = {};
        // Case'lerden
        for (const c of cases) {
            const conv = c.conversations?.[0];
            const catName = conv?.topicCategory?.name || 'Kategorisiz';
            if (!byTopic[catName]) {
                byTopic[catName] = {
                    name: catName,
                    icon: conv?.topicCategory?.icon || null,
                    color: conv?.topicCategory?.color || null,
                    count: 0, calls: 0, meetings: 0, appointments: 0, proposals: 0, orders: 0,
                    wonCount: 0, wonAmount: 0,
                    sources: {}
                };
            }
            const g = byTopic[catName];
            g.count++;
            const contactSource = formatSourceName(c.contact?.source);
            if (!g.sources[contactSource]) g.sources[contactSource] = { name: contactSource, count: 0, wonCount: 0, wonAmount: 0 };
            g.sources[contactSource].count++;
            for (const act of (c.activities || [])) {
                if (act.type === 'CALL') g.calls++;
                else if (act.type === 'MEETING') g.meetings++;
                else if (act.type === 'PROPOSAL') g.proposals++;
                else if (act.type === 'ORDER') g.orders++;
            }
            if (c.status === 'WON') {
                g.wonCount++;
                if (g.sources[contactSource]) g.sources[contactSource].wonCount++;
            }
        }
        // Deal'lerden — doğru konu kategorisine yaz, eşleşmezse 'Manuel Satış'
        for (const d of deals) {
            const dealCat = dealTopicMap.get(d.id);
            const catName = dealCat?.name || 'Manuel Satış';
            if (!byTopic[catName]) {
                byTopic[catName] = {
                    name: catName,
                    icon: dealCat?.icon || null,
                    color: dealCat?.color || null,
                    count: 0, calls: 0, meetings: 0, appointments: 0, proposals: 0, orders: 0,
                    wonCount: 0, wonAmount: 0,
                    sources: {}
                };
            }
            const g = byTopic[catName];
            g.count++;
            const dealSource = formatSourceName(d.contact?.source);
            if (!g.sources[dealSource]) g.sources[dealSource] = { name: dealSource, count: 0, wonCount: 0, wonAmount: 0 };
            g.sources[dealSource].count++;
            if (d.status === 'WON') {
                g.wonCount++; g.wonAmount += (d.amount || 0);
                if (g.sources[dealSource]) { g.sources[dealSource].wonCount++; g.sources[dealSource].wonAmount += (d.amount || 0); }
            }
            if (d.stage === 'ORDER') g.orders++;
        }
        // Randevuları konulara dağıt (contact → topic eşleştirmesi ile)
        for (const apt of appointments) {
            const topicName = (apt.contactId && contactToTopic[apt.contactId]) || 'Kategorisiz';
            if (!byTopic[topicName]) {
                byTopic[topicName] = {
                    name: topicName, icon: null, color: null,
                    count: 0, calls: 0, meetings: 0, appointments: 0, proposals: 0, orders: 0,
                    wonCount: 0, wonAmount: 0
                };
            }
            byTopic[topicName].appointments++;
        }
        const topicGroups = Object.values(byTopic).map(g => ({ ...g, sources: Object.values(g.sources).sort((a, b) => b.count - a.count) })).sort((a, b) => b.count - a.count);

        // Akış Bazlı (sadece case'ler)
        const byFunnel = {};
        for (const c of cases) {
            const stageInfo = c.funnelStageId ? stageLookup[c.funnelStageId] : null;
            const fName = stageInfo?.funnelName || 'Akış Yok';
            if (!byFunnel[fName]) {
                byFunnel[fName] = { name: fName, funnelId: stageInfo?.funnelId || null, count: 0, wonCount: 0, wonAmount: 0, stages: {} };
            }
            const g = byFunnel[fName];
            g.count++;
            if (c.status === 'WON') g.wonCount++;
            const sName = stageInfo?.name || 'Atanmamış';
            if (!g.stages[sName]) g.stages[sName] = { name: sName, color: stageInfo?.color || '#94a3b8', count: 0 };
            g.stages[sName].count++;
        }
        const funnelGroups = Object.values(byFunnel)
            .map(g => ({ ...g, stages: Object.values(g.stages).sort((a, b) => b.count - a.count) }))
            .sort((a, b) => b.count - a.count);

        // Kaynak Bazlı Talep Analizi
        const bySource = {};
        for (const c of cases) {
            const src = formatSourceName(c.contact?.source);
            if (!bySource[src]) {
                bySource[src] = { name: src, count: 0, calls: 0, meetings: 0, appointments: 0, proposals: 0, orders: 0, wonCount: 0, wonAmount: 0 };
            }
            const sg = bySource[src];
            sg.count++;
            for (const act of (c.activities || [])) {
                if (act.type === 'CALL') sg.calls++;
                else if (act.type === 'MEETING') sg.meetings++;
                else if (act.type === 'PROPOSAL') sg.proposals++;
                else if (act.type === 'ORDER') sg.orders++;
            }
            if (c.status === 'WON') sg.wonCount++;
        }
        for (const d of deals) {
            const src = formatSourceName(d.contact?.source);
            if (!bySource[src]) {
                bySource[src] = { name: src, count: 0, calls: 0, meetings: 0, appointments: 0, proposals: 0, orders: 0, wonCount: 0, wonAmount: 0 };
            }
            const sg = bySource[src];
            sg.count++;
            if (d.status === 'WON') { sg.wonCount++; sg.wonAmount += (d.amount || 0); }
            if (d.stage === 'ORDER') sg.orders++;
        }
        const sourceGroups = Object.values(bySource).sort((a, b) => b.count - a.count);

        res.json({
            totalCount, totalCases, totalDeals,
            withPhoneCount,
            totalWonCount, totalWonAmount,
            totalLostCount, totalActiveCount, totalClosedCount,
            conversionRate, lostRate,
            totalCalls, totalMeetings, totalAppointments, totalProposals, totalOrders,
            agentTable,
            topicGroups,
            funnelGroups,
            sourceGroups
        });
    } catch (error) {
        console.error('Request report error:', error);
        res.status(500).json({ error: error.message });
    }
};

// ── Madde 3: Lead Puanlama API ──────────────────────────
export const recalculateContactScore = async (req, res) => {
    try {
        const { contactId } = req.params;
        const { updateLeadScore } = await import('../services/leadScoring.service.js');
        const result = await updateLeadScore(contactId);
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('❌ [recalculateContactScore]', error);
        res.status(500).json({ error: 'Skor hesaplanamadı' });
    }
};

export const recalculateAllScores = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { recalculateAllScores: recalcAll } = await import('../services/leadScoring.service.js');
        // Non-blocking
        recalcAll(workspaceId).catch(e => console.error('Recalc error:', e));
        res.json({ success: true, message: 'Skor hesaplaması başlatıldı' });
    } catch (error) {
        console.error('❌ [recalculateAllScores]', error);
        res.status(500).json({ error: 'Toplu skor hesaplanamadı' });
    }
};

export const getContactAttributions = async (req, res) => {
    try {
        const { workspaceId, contactId } = req.params;
        const attributions = await prisma.contactAttribution.findMany({
            where: { contactId, workspaceId },
            orderBy: { createdAt: 'desc' },
            take: 10
        });
        res.json({ attributions });
    } catch (error) {
        console.error('❌ [getContactAttributions]', error);
        res.json({ attributions: [] });
    }
};

export const getAttributionReport = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        
        // Kaynak bazlı lead sayıları
        const attributions = await prisma.contactAttribution.groupBy({
            by: ['channel', 'utm_source', 'utm_medium', 'utm_campaign'],
            where: { workspaceId },
            _count: { id: true },
            orderBy: { _count: { id: 'desc' } }
        });
        
        // Her kaynak için deal/sipariş dönüşümü
        const report = [];
        for (const attr of attributions) {
            const contacts = await prisma.contactAttribution.findMany({
                where: {
                    workspaceId,
                    channel: attr.channel,
                    utm_source: attr.utm_source
                },
                select: { contactId: true }
            });
            const contactIds = contacts.map(c => c.contactId).filter(Boolean);
            
            const deals = contactIds.length > 0 ? await prisma.deal.count({
                where: {
                    workspaceId,
                    contactId: { in: contactIds },
                    stage: { in: ['ORDER', 'INVOICE'] }
                }
            }) : 0;
            
            const totalRevenue = contactIds.length > 0 ? await prisma.deal.aggregate({
                where: {
                    workspaceId,
                    contactId: { in: contactIds },
                    stage: { in: ['ORDER', 'INVOICE'] }
                },
                _sum: { amount: true }
            }) : { _sum: { amount: 0 } };
            
            report.push({
                channel: attr.channel,
                utm_source: attr.utm_source,
                utm_medium: attr.utm_medium,
                utm_campaign: attr.utm_campaign,
                leadCount: attr._count.id,
                dealCount: deals,
                totalRevenue: totalRevenue._sum?.amount || 0,
                conversionRate: contactIds.length > 0 ? ((deals / contactIds.length) * 100).toFixed(1) : 0
            });
        }
        
        res.json({ report });
    } catch (error) {
        console.error('Attribution report error:', error);
        res.status(500).json({ error: 'Rapor oluşturulamadı' });
    }
};

// ── Call & Demand Report (Dışa Aktar 2 — Kim hangi talep ile görüştü + Arama Notu) ──
export const getCallDemandReport = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { startDate, endDate, search, limit = 5000 } = req.query;

        // 1. Funnel Stages Lookup
        const allFunnels = await prisma.funnel.findMany({
            where: { workspaceId },
            include: { stages: { select: { id: true, name: true, color: true }, orderBy: { order: 'asc' } } }
        });
        const stageLookup = {};
        for (const f of allFunnels) {
            for (const s of f.stages) {
                stageLookup[s.id] = { name: s.name, color: s.color, funnelName: f.name, funnelId: f.id };
            }
        }

        // 2. Activity Date Filter
        const actDateFilter = (startDate || endDate) ? {
            OR: [
                {
                    completedAt: {
                        ...(startDate ? { gte: parseDateStartTR(startDate) } : {}),
                        ...(endDate ? { lte: parseDateEndTR(endDate) } : {})
                    }
                },
                {
                    dueDate: {
                        ...(startDate ? { gte: parseDateStartTR(startDate) } : {}),
                        ...(endDate ? { lte: parseDateEndTR(endDate) } : {})
                    }
                },
                {
                    createdAt: {
                        ...(startDate ? { gte: parseDateStartTR(startDate) } : {}),
                        ...(endDate ? { lte: parseDateEndTR(endDate) } : {})
                    }
                }
            ]
        } : {};

        // Fetch ContactActivities
        const activities = await prisma.contactActivity.findMany({
            where: {
                workspaceId,
                ...actDateFilter
            },
            include: {
                contact: {
                    select: {
                        id: true,
                        name: true,
                        fullName: true,
                        phone: true,
                        email: true,
                        company: true,
                        source: true,
                        funnelStageId: true,
                        status: true,
                        notes: true,
                        cases: {
                            where: { workspaceId },
                            select: {
                                id: true,
                                caseNumber: true,
                                title: true,
                                status: true,
                                funnelStageId: true,
                                caseType: { select: { name: true } },
                                category: { select: { name: true } },
                                assignedTo: { select: { id: true, name: true } }
                            },
                            orderBy: { updatedAt: 'desc' },
                            take: 3
                        },
                        conversations: {
                            where: { workspaceId },
                            select: {
                                id: true,
                                channel: true,
                                aiTopic: true,
                                topicCategory: { select: { name: true } },
                                assignedTo: { select: { name: true } }
                            },
                            orderBy: { lastMessageAt: 'desc' },
                            take: 1
                        }
                    }
                },
                case: {
                    select: {
                        id: true,
                        caseNumber: true,
                        title: true,
                        status: true,
                        funnelStageId: true,
                        caseType: { select: { name: true } },
                        category: { select: { name: true } },
                        assignedTo: { select: { id: true, name: true } }
                    }
                },
                assignee: { select: { id: true, name: true, email: true } },
                creator: { select: { id: true, name: true, email: true } },
                team: { select: { id: true, name: true } }
            },
            orderBy: [
                { completedAt: 'desc' },
                { dueDate: 'desc' },
                { createdAt: 'desc' }
            ],
            take: parseInt(limit) || 5000
        });

        // 3. Fetch Retell Calls
        const retellDateFilter = (startDate || endDate) ? {
            createdAt: {
                ...(startDate ? { gte: parseDateStartTR(startDate) } : {}),
                ...(endDate ? { lte: parseDateEndTR(endDate) } : {})
            }
        } : {};

        const retellCalls = await prisma.retellCall.findMany({
            where: {
                workspaceId,
                ...retellDateFilter
            },
            orderBy: { createdAt: 'desc' },
            take: 1000
        });

        const retellContactIds = retellCalls.map(c => c.contactId).filter(Boolean);
        const retellContacts = retellContactIds.length > 0 ? await prisma.contact.findMany({
            where: { id: { in: retellContactIds } },
            select: {
                id: true, name: true, fullName: true, phone: true, email: true, company: true, source: true, funnelStageId: true, status: true,
                cases: {
                    where: { workspaceId },
                    select: { id: true, caseNumber: true, title: true, status: true, funnelStageId: true },
                    take: 1
                }
            }
        }) : [];
        const retellContactMap = new Map(retellContacts.map(c => [c.id, c]));

        // 4. Transform into unified rows
        const rows = [];
        const typeLabels = {
            CALL: '📞 Telefon Araması',
            MEETING: '🤝 Görüşme / Toplantı',
            NOTE: '📝 Görüşme Notu',
            TASK: '📋 Görev',
            VISIT: '📍 Ziyaret',
            REMINDER: '⏰ Hatırlatıcı'
        };

        for (const act of activities) {
            const contact = act.contact;
            const linkedCase = act.case || contact?.cases?.[0] || null;
            const activeConv = contact?.conversations?.[0] || null;

            // Representative / Görüşen
            let agentName = act.assignee?.name || act.creator?.name || '';
            if (!agentName) {
                if (act.source === 'AI_CALL' || act.source === 'RETELL' || act.assignedByType === 'AI') {
                    agentName = '🤖 AI Bot';
                } else if (linkedCase?.assignedTo?.name) {
                    agentName = linkedCase.assignedTo.name;
                } else if (activeConv?.assignedTo?.name) {
                    agentName = activeConv.assignedTo.name;
                } else {
                    agentName = '---';
                }
            }

            // Customer info
            const customerName = contact?.fullName || contact?.name || 'İsimsiz';
            const phone = contact?.phone || '---';
            const email = contact?.email || '---';
            const company = contact?.company || '---';
            const source = contact?.source || activeConv?.channel || 'MANUAL';

            // Demand / Talep info
            const caseNumber = linkedCase?.caseNumber || (linkedCase?.id ? `CSE-${linkedCase.id.slice(0, 6)}` : '---');
            const caseTitle = linkedCase?.title || linkedCase?.caseType?.name || linkedCase?.category?.name || act.callTopic || activeConv?.topicCategory?.name || activeConv?.aiTopic || 'Genel Talep';

            // Stage info
            const stageId = linkedCase?.funnelStageId || contact?.funnelStageId;
            const stageInfo = stageId ? stageLookup[stageId] : null;
            const stageName = stageInfo?.name || linkedCase?.status || contact?.status || 'Yeni';
            const stageColor = stageInfo?.color || '#64748b';

            // Activity Type
            const activityType = typeLabels[act.type] || act.type || 'Aktivite';

            // Date
            const callDate = act.completedAt || act.dueDate || act.createdAt;
            const formattedDate = callDate ? new Date(callDate).toLocaleDateString('tr-TR', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            }) : '---';

            // Call Status / Outcome
            let callStatus = '---';
            let statusBadgeColor = '#64748b';
            if (act.callSuccessful === true) {
                callStatus = '✅ Ulaşıldı (Başarılı)';
                statusBadgeColor = '#16a34a';
            } else if (act.callSuccessful === false) {
                callStatus = '📵 Ulaşılamadı';
                statusBadgeColor = '#dc2626';
            } else if (act.status === 'COMPLETED') {
                callStatus = '✅ Tamamlandı';
                statusBadgeColor = '#16a34a';
            } else if (act.status === 'PLANNED') {
                callStatus = '⏳ Planlandı / Bekliyor';
                statusBadgeColor = '#f59e0b';
            } else if (act.status === 'CANCELLED') {
                callStatus = '❌ İptal Edildi';
                statusBadgeColor = '#94a3b8';
            } else {
                callStatus = act.status;
            }

            // Sentiment
            const sentimentMap = { Positive: '😊 Pozitif', Negative: '🙁 Negatif', Neutral: '😐 Nötr' };
            const sentiment = act.callSentiment ? (sentimentMap[act.callSentiment] || act.callSentiment) : '---';

            // Call Note / Outcome
            const callNote = act.result || act.description || act.title || '';

            rows.push({
                id: act.id,
                contactId: contact?.id || null,
                agentName,
                teamName: act.team?.name || '---',
                customerName,
                phone,
                email,
                company,
                source,
                caseNumber,
                caseTitle,
                stageName,
                stageColor,
                activityType,
                callDate,
                formattedDate,
                callStatus,
                statusBadgeColor,
                callSuccessful: act.callSuccessful,
                sentiment,
                callNote
            });
        }

        // Add Retell AI Voice Calls
        for (const rc of retellCalls) {
            const contact = rc.contactId ? retellContactMap.get(rc.contactId) : null;
            const linkedCase = contact?.cases?.[0] || null;

            const agentName = '🤖 Retell AI';
            const customerName = contact?.fullName || contact?.name || rc.toNumber || 'İsimsiz';
            const phone = rc.toNumber || contact?.phone || '---';
            const email = contact?.email || '---';
            const company = contact?.company || '---';
            const source = 'AI_CALL';

            const caseNumber = linkedCase?.caseNumber || '---';
            const caseTitle = linkedCase?.title || 'AI Sesli Görüşme';
            const stageId = linkedCase?.funnelStageId || contact?.funnelStageId;
            const stageInfo = stageId ? stageLookup[stageId] : null;
            const stageName = stageInfo?.name || '---';
            const stageColor = stageInfo?.color || '#64748b';

            const activityType = '🤖 AI Sesli Arama';
            const callDate = rc.startedAt || rc.createdAt;
            const formattedDate = callDate ? new Date(callDate).toLocaleDateString('tr-TR', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            }) : '---';

            let callStatus = '---';
            let statusBadgeColor = '#64748b';
            if (rc.callSuccessful === true) {
                callStatus = '✅ Ulaşıldı (Başarılı)';
                statusBadgeColor = '#16a34a';
            } else if (rc.status === 'not_connected') {
                callStatus = '📵 Ulaşılamadı';
                statusBadgeColor = '#dc2626';
            } else {
                callStatus = rc.status || 'Tamamlandı';
            }

            const sentimentMap = { Positive: '😊 Pozitif', Negative: '🙁 Negatif', Neutral: '😐 Nötr' };
            const sentiment = rc.sentiment ? (sentimentMap[rc.sentiment] || rc.sentiment) : '---';
            const durationStr = rc.duration ? ` [${rc.duration} sn]` : '';
            const callNote = (rc.summary ? rc.summary : (rc.transcript ? rc.transcript.slice(0, 300) : '')) + durationStr;

            rows.push({
                id: rc.id,
                contactId: contact?.id || null,
                agentName,
                teamName: 'AI Voice',
                customerName,
                phone,
                email,
                company,
                source,
                caseNumber,
                caseTitle,
                stageName,
                stageColor,
                activityType,
                callDate,
                formattedDate,
                callStatus,
                statusBadgeColor,
                callSuccessful: rc.callSuccessful,
                sentiment,
                callNote
            });
        }

        // Sort rows by callDate descending
        rows.sort((a, b) => new Date(b.callDate || 0) - new Date(a.callDate || 0));

        // Search filtering if requested in query
        let filteredRows = rows;
        if (search) {
            const s = search.toLowerCase();
            filteredRows = rows.filter(r =>
                (r.agentName && r.agentName.toLowerCase().includes(s)) ||
                (r.customerName && r.customerName.toLowerCase().includes(s)) ||
                (r.phone && r.phone.toLowerCase().includes(s)) ||
                (r.caseTitle && r.caseTitle.toLowerCase().includes(s)) ||
                (r.caseNumber && r.caseNumber.toLowerCase().includes(s)) ||
                (r.callNote && r.callNote.toLowerCase().includes(s))
            );
        }

        // Summary stats
        const total = filteredRows.length;
        const reachedCount = filteredRows.filter(r => r.callSuccessful === true || r.callStatus.includes('Ulaşıldı') || r.callStatus.includes('Tamamlandı')).length;
        const unreachedCount = filteredRows.filter(r => r.callSuccessful === false || r.callStatus.includes('Ulaşılamadı')).length;
        const agentCount = new Set(filteredRows.map(r => r.agentName).filter(Boolean)).size;

        res.json({
            success: true,
            total,
            stats: {
                total,
                reachedCount,
                unreachedCount,
                agentCount
            },
            report: filteredRows
        });
    } catch (error) {
        console.error('Call demand report error:', error);
        res.status(500).json({ error: 'Rapor oluşturulamadı: ' + error.message });
    }
};

