import prisma from '../lib/prisma.js';

// ────────────────────────────────────────────────────────────────────────────
// DEFAULT FUNNELS & STAGES (her yeni workspace için otomatik oluşturulur)
// ────────────────────────────────────────────────────────────────────────────

const DEFAULT_FUNNELS = [
    {
        name: 'Randevu',
        color: '#06b6d4',
        icon: '📅',
        order: 1,
        stages: [
            { name: 'Yeni Başvuru',         color: '#3b82f6', order: 0 },
            { name: 'Randevu Veriliyor',    color: '#f59e0b', order: 1 },
            { name: 'Randevu Verildi',      color: '#8b5cf6', order: 2 },
            { name: 'Randevu Tamamlandı',   color: '#10b981', order: 3 },
            { name: 'Randevu İptal',        color: '#ef4444', order: 4 }
        ]
    },
    {
        name: 'Satış Akışı',
        color: '#3b82f6',
        icon: '💰',
        order: 2,
        stages: [
            { name: 'Yeni Başvuru',         color: '#3b82f6', order: 0 },
            { name: 'Fırsat',               color: '#8b5cf6', order: 1 },
            { name: 'Bilgi Verildi',        color: '#06b6d4', order: 2 },
            { name: 'Sıcak Fırsat',         color: '#f97316', order: 3 },
            { name: 'Görüşme Planlandı',    color: '#14b8a6', order: 4 },
            { name: 'Teklif Aşaması',       color: '#ec4899', order: 5 },
            { name: 'Satış',                color: '#10b981', order: 6 },
            { name: 'Ulaşılamadı',          color: '#94a3b8', order: 7 },
            { name: 'Kayıp',                color: '#ef4444', order: 8 }
        ]
    },
    {
        name: 'İş ve Taşeron',
        color: '#10b981',
        icon: '👔',
        order: 3,
        stages: [
            { name: 'Yeni Başvuru',         color: '#3b82f6', order: 0 },
            { name: 'Değerlendirmede',      color: '#f59e0b', order: 1 },
            { name: 'Aday Havuzunda',       color: '#8b5cf6', order: 2 },
            { name: 'Kabul',                color: '#10b981', order: 3 },
            { name: 'Red',                  color: '#ef4444', order: 4 }
        ]
    },
    {
        name: 'Destek',
        color: '#f59e0b',
        icon: '🎧',
        order: 4,
        stages: [
            { name: 'Yeni Başvuru',    color: '#3b82f6', order: 0 },
            { name: 'Değerlendirme',   color: '#f59e0b', order: 1 },
            { name: 'İşlemde',         color: '#8b5cf6', order: 2 },
            { name: 'Çözüldü',        color: '#10b981', order: 3 },
            { name: 'Kapandı',         color: '#64748b', order: 4 }
        ]
    },
    {
        name: 'Kurumsal Satış',
        color: '#a855f7',
        icon: '🏢',
        order: 5,
        stages: [
            { name: 'Yeni Başvuru',        color: '#3b82f6', order: 0 },
            { name: 'Görüşme Aşaması',     color: '#f59e0b', order: 1 },
            { name: 'Kazanıldı',           color: '#10b981', order: 2 },
            { name: 'Kayıp',               color: '#ef4444', order: 3 }
        ]
    }
];

// ── Stage isim eşleştirmesi: eski akış preset'leri → yeni default stages
const STAGE_PRESETS = {};
for (const f of DEFAULT_FUNNELS) {
    STAGE_PRESETS[f.name.toLowerCase()] = f.stages;
}

// ────────────────────────────────────────────────────────────────────────────
// MIGRASYON: Eski aşama isimlerini yenilerine taşı
// ────────────────────────────────────────────────────────────────────────────

// Aşama bazlı rename map: { eskiAd → yeniAd }
const STAGE_RENAME_MAP = {
    'Pazarlık':           'Teklif Aşaması',
    'Sözleşme':           'Teklif Aşaması',
    'İlgisiz':            'Kayıp',
    'Randevu Planlandı':  'Görüşme Planlandı',
    'Tekrar Ara':         'Fırsat',
    'Teklif Verildi':     'Teklif Aşaması'
};

// Funnel ismi rename map: { eskiFunnelAdı → yeniFunnelAdı }
const FUNNEL_RENAME_MAP = {
    'Fırsat':              'Satış Akışı',
    'İş Başvurusu':        'İş ve Taşeron',
    'Destek / Şikayet':    'Destek'
};

// Normalize Turkish characters for comparison
const normalizeTR = (s) => (s || '').toLowerCase()
    .replace(/\u0130/g, 'i').replace(/\u0131/g, 'i').replace(/i\u0307/g, 'i')
    .replace(/\u015f/g, 's').replace(/\u015e/g, 's')
    .replace(/\u011f/g, 'g').replace(/\u011e/g, 'g')
    .replace(/\u00fc/g, 'u').replace(/\u00dc/g, 'u')
    .replace(/\u00f6/g, 'o').replace(/\u00d6/g, 'o')
    .replace(/\u00e7/g, 'c').replace(/\u00c7/g, 'c')
    .trim();

// ────────────────────────────────────────────────────────────────────────────
// migrateStageName: DB'deki eski aşama isimlerini yenilerine taşır
// ────────────────────────────────────────────────────────────────────────────
const migrateStageNames = async (funnelId) => {
    const stages = await prisma.funnelStage.findMany({ where: { funnelId } });
    for (const stage of stages) {
        const newName = STAGE_RENAME_MAP[stage.name];
        if (newName) {
            // Eğer hedef aşama zaten varsa, conversation/contact referanslarını taşı ve eski aşamayı sil
            const targetStage = stages.find(s => s.name === newName && s.id !== stage.id);
            if (targetStage) {
                // Conversation'ları hedef aşamaya taşı
                await prisma.conversation.updateMany({
                    where: { funnelStageId: stage.id },
                    data: { funnelStageId: targetStage.id }
                });
                // Contact'ları hedef aşamaya taşı
                await prisma.contact.updateMany({
                    where: { funnelStageId: stage.id },
                    data: { funnelStageId: targetStage.id }
                });
                // Eski aşamayı sil
                await prisma.funnelStage.delete({ where: { id: stage.id } });
                console.log(`🔄 [Migration] Stage "${stage.name}" → merged into "${newName}" (funnel ${funnelId})`);
            } else {
                // Hedef yoksa sadece aşama adını değiştir
                await prisma.funnelStage.update({
                    where: { id: stage.id },
                    data: { name: newName }
                });
                console.log(`🔄 [Migration] Stage "${stage.name}" → renamed to "${newName}" (funnel ${funnelId})`);
            }
        }
    }
};

// ────────────────────────────────────────────────────────────────────────────
// ensureDefaultFunnels: Workspace'in eksik default akışlarını oluşturur
// ────────────────────────────────────────────────────────────────────────────
const ensureDefaultFunnels = async (workspaceId, existingFunnels) => {
    const existingNames = existingFunnels.map(f => normalizeTR(f.name));
    let created = false;

    for (const def of DEFAULT_FUNNELS) {
        const defNormalized = normalizeTR(def.name);
        if (!existingNames.includes(defNormalized)) {
            await prisma.funnel.create({
                data: {
                    workspaceId,
                    name: def.name,
                    color: def.color,
                    icon: def.icon,
                    order: def.order,
                    stages: { create: def.stages }
                }
            });
            console.log(`🌱 [Funnels] Created default funnel "${def.name}" for workspace ${workspaceId}`);
            created = true;
        }
    }

    return created;
};

// ────────────────────────────────────────────────────────────────────────────
// migrateFunnelNames: Eski funnel isimlerini yeni isimlere taşır
// ────────────────────────────────────────────────────────────────────────────
const migrateFunnelNames = async (workspaceId) => {
    let migrated = false;

    for (const [oldName, newName] of Object.entries(FUNNEL_RENAME_MAP)) {
        const oldFunnel = await prisma.funnel.findFirst({
            where: { workspaceId, name: oldName }
        });
        if (oldFunnel) {
            // Yeni ad zaten varsa çakışma olmasın diye kontrol et
            const newExists = await prisma.funnel.findFirst({
                where: { workspaceId, name: newName }
            });
            if (!newExists) {
                await prisma.funnel.update({
                    where: { id: oldFunnel.id },
                    data: { name: newName }
                });
                console.log(`🔄 [Funnels] Renamed "${oldName}" → "${newName}" for workspace ${workspaceId}`);
                migrated = true;
            }
        }
    }

    return migrated;
};

// ────────────────────────────────────────────────────────────────────────────
// ensureCorrectStages: Akışların doğru aşamalara sahip olduğunu kontrol eder
// Eksik aşamaları ekler ama mevcut verileri silmez
// ────────────────────────────────────────────────────────────────────────────
const ensureCorrectStages = async (funnel) => {
    const normalizedName = normalizeTR(funnel.name);
    const matchingDefault = DEFAULT_FUNNELS.find(d => normalizeTR(d.name) === normalizedName);
    if (!matchingDefault) return false;

    const currentStages = funnel.stages || [];
    const currentNames = currentStages.map(s => normalizeTR(s.name));
    let added = false;

    for (const expectedStage of matchingDefault.stages) {
        if (!currentNames.includes(normalizeTR(expectedStage.name))) {
            await prisma.funnelStage.create({
                data: {
                    funnelId: funnel.id,
                    name: expectedStage.name,
                    color: expectedStage.color,
                    order: expectedStage.order
                }
            });
            console.log(`➕ [Funnels] Added missing stage "${expectedStage.name}" to funnel "${funnel.name}"`);
            added = true;
        }
    }

    return added;
};

// ════════════════════════════════════════════════════════════════════════════
// ────────────────────────────────────────────────────────────────────────────
// deduplicateStages: Aynı funnel içinde aynı isimde birden fazla stage varsa
// referansları ilk kayda taşıyıp diğerlerini siler
// ────────────────────────────────────────────────────────────────────────────
const deduplicateStages = async (funnelId) => {
    const stages = await prisma.funnelStage.findMany({ where: { funnelId }, orderBy: { order: 'asc' } });
    const seen = {};
    let cleaned = false;

    for (const stage of stages) {
        const normalized = normalizeTR(stage.name);
        if (seen[normalized]) {
            // Bu isimde zaten bir stage var — referansları taşı ve bu duplicate'ı sil
            const keepId = seen[normalized];
            await prisma.conversation.updateMany({
                where: { funnelStageId: stage.id },
                data: { funnelStageId: keepId }
            });
            await prisma.contact.updateMany({
                where: { funnelStageId: stage.id },
                data: { funnelStageId: keepId }
            });
            await prisma.funnelStage.delete({ where: { id: stage.id } });
            console.log(`🧹 [Dedup] Removed duplicate stage "${stage.name}" from funnel ${funnelId}`);
            cleaned = true;
        } else {
            seen[normalized] = stage.id;
        }
    }
    return cleaned;
};

// ────────────────────────────────────────────────────────────────────────────
// reorderStages: Default tanımına göre stage sıralamasını düzeltir
// ────────────────────────────────────────────────────────────────────────────
const reorderStages = async (funnel) => {
    const normalizedName = normalizeTR(funnel.name);
    const matchingDefault = DEFAULT_FUNNELS.find(d => normalizeTR(d.name) === normalizedName);
    if (!matchingDefault) return false;

    const currentStages = await prisma.funnelStage.findMany({ where: { funnelId: funnel.id } });
    let reordered = false;

    for (const stage of currentStages) {
        const defaultMatch = matchingDefault.stages.find(d => normalizeTR(d.name) === normalizeTR(stage.name));
        if (defaultMatch && stage.order !== defaultMatch.order) {
            await prisma.funnelStage.update({
                where: { id: stage.id },
                data: { order: defaultMatch.order, color: defaultMatch.color }
            });
            reordered = true;
        }
    }
    return reordered;
};

// ════════════════════════════════════════════════════════════════════════════
// CONTROLLERS
// ════════════════════════════════════════════════════════════════════════════

// GET /funnels/:workspaceId
export const getFunnels = async (req, res) => {
    try {
        const { workspaceId } = req.params;

        let funnels;
        try {
            funnels = await prisma.funnel.findMany({
                where: { workspaceId },
                orderBy: { order: 'asc' },
                include: { stages: { orderBy: { order: 'asc' } } }
            });

            // ── 1) Migrate eski funnel isimlerini ──
            const didRenameFunnels = await migrateFunnelNames(workspaceId);

            // ── 2) Migrate eski aşama isimlerini ──
            if (funnels.length > 0) {
                for (const funnel of funnels) {
                    await migrateStageNames(funnel.id);
                }
            }

            // ── 3) Duplicate stage'leri temizle ──
            let didDedup = false;
            for (const funnel of funnels) {
                const cleaned = await deduplicateStages(funnel.id);
                if (cleaned) didDedup = true;
            }

            // ── 4) Yeniden yükle (rename/dedup sonrasında) ──
            if (didRenameFunnels || didDedup) {
                funnels = await prisma.funnel.findMany({
                    where: { workspaceId },
                    orderBy: { order: 'asc' },
                    include: { stages: { orderBy: { order: 'asc' } } }
                });
            }

            // ── 5) AUTO-SEED: eksik default akışları oluştur ──
            const didCreate = await ensureDefaultFunnels(workspaceId, funnels);

            // ── 6) Eksik aşamaları ekle ──
            let didAddStages = false;
            for (const funnel of funnels) {
                const added = await ensureCorrectStages(funnel);
                if (added) didAddStages = true;
            }

            // ── 7) Stage sıralamasını düzelt ──
            let didReorder = false;
            for (const funnel of funnels) {
                const reordered = await reorderStages(funnel);
                if (reordered) didReorder = true;
            }

            // ── 8) Son hali yükle ──
            if (didCreate || didAddStages || didRenameFunnels || didDedup || didReorder) {
                funnels = await prisma.funnel.findMany({
                    where: { workspaceId },
                    orderBy: { order: 'asc' },
                    include: { stages: { orderBy: { order: 'asc' } } }
                });
            }

        } catch (stageErr) {
            console.warn('⚠️ FunnelStage table not available, loading funnels without stages:', stageErr.message);
            funnels = await prisma.funnel.findMany({
                where: { workspaceId },
                orderBy: { order: 'asc' }
            });
            funnels = funnels.map(f => ({ ...f, stages: [] }));
        }

        res.json({ funnels });
    } catch (error) {
        console.error('Get funnels error:', error);
        res.status(500).json({ error: 'Akışlar alınamadı' });
    }
};

// POST /funnels/:workspaceId
export const createFunnel = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { name, color, icon, assignedUserId, assignedTeamId } = req.body;
        if (!name?.trim()) return res.status(400).json({ error: 'Akış adı zorunludur' });

        const maxOrder = await prisma.funnel.aggregate({ where: { workspaceId }, _max: { order: true } });
        const nextOrder = (maxOrder._max.order || 0) + 1;

        // Eşleşen default preset varsa onun aşamalarını kullan
        const normalizedName = normalizeTR(name);
        const matchingDefault = DEFAULT_FUNNELS.find(d => normalizeTR(d.name) === normalizedName);
        const stages = matchingDefault ? matchingDefault.stages : [
            { name: 'Yeni',     color: '#3b82f6', order: 0 },
            { name: 'İşlemde',  color: '#f59e0b', order: 1 },
            { name: 'Kapandı',  color: '#10b981', order: 2 }
        ];

        let funnel;
        try {
            funnel = await prisma.funnel.create({
                data: {
                    workspaceId,
                    name: name.trim(),
                    color: color || '#3b82f6',
                    icon: icon || '📁',
                    order: nextOrder,
                    assignedUserId: assignedUserId || null,
                    assignedTeamId: assignedTeamId || null,
                    stages: { create: stages }
                },
                include: { stages: { orderBy: { order: 'asc' } } }
            });
        } catch {
            funnel = await prisma.funnel.create({
                data: {
                    workspaceId,
                    name: name.trim(),
                    color: color || '#3b82f6',
                    icon: icon || '📁',
                    order: nextOrder,
                    assignedUserId: assignedUserId || null,
                    assignedTeamId: assignedTeamId || null
                }
            });
            funnel.stages = [];
        }
        res.status(201).json({ funnel });
    } catch (error) {
        console.error('Create funnel error:', error);
        res.status(500).json({ error: 'Akış oluşturulamadı' });
    }
};

// PUT /funnels/:workspaceId/:funnelId
export const updateFunnel = async (req, res) => {
    try {
        const { workspaceId, funnelId } = req.params;
        const { name, color, icon, order, assignedUserId, assignedTeamId } = req.body;
        const existing = await prisma.funnel.findFirst({ where: { id: funnelId, workspaceId } });
        if (!existing) return res.status(404).json({ error: 'Akış bulunamadı' });

        const updateData = {
            ...(name && { name: name.trim() }),
            ...(color && { color }),
            ...(icon && { icon }),
            ...(order !== undefined && { order }),
            ...(assignedUserId !== undefined && { assignedUserId }),
            ...(assignedTeamId !== undefined && { assignedTeamId })
        };

        let funnel;
        try {
            funnel = await prisma.funnel.update({
                where: { id: funnelId },
                data: updateData,
                include: { stages: { orderBy: { order: 'asc' } } }
            });
        } catch {
            funnel = await prisma.funnel.update({
                where: { id: funnelId },
                data: updateData
            });
            funnel.stages = [];
        }
        res.json({ funnel });
    } catch (error) {
        console.error('Update funnel error:', error);
        res.status(500).json({ error: 'Akış güncellenemedi' });
    }
};

// DELETE /funnels/:workspaceId/:funnelId
export const deleteFunnel = async (req, res) => {
    try {
        const { workspaceId, funnelId } = req.params;
        const existing = await prisma.funnel.findFirst({ where: { id: funnelId, workspaceId } });
        if (!existing) return res.status(404).json({ error: 'Akış bulunamadı' });
        await prisma.funnel.delete({ where: { id: funnelId } });
        res.json({ success: true });
    } catch (error) {
        console.error('Delete funnel error:', error);
        res.status(500).json({ error: 'Akış silinemedi' });
    }
};

// ── Stage CRUD ──

// POST /funnels/:workspaceId/:funnelId/stages
export const createStage = async (req, res) => {
    try {
        const { workspaceId, funnelId } = req.params;
        const { name, color, assignedUserId, assignedTeamId } = req.body;
        if (!name?.trim()) return res.status(400).json({ error: 'Durum adı zorunludur' });

        const funnel = await prisma.funnel.findFirst({ where: { id: funnelId, workspaceId } });
        if (!funnel) return res.status(404).json({ error: 'Akış bulunamadı' });

        const maxOrder = await prisma.funnelStage.aggregate({ where: { funnelId }, _max: { order: true } });
        const nextOrder = (maxOrder._max.order ?? -1) + 1;

        const stage = await prisma.funnelStage.create({
            data: { 
                funnelId, 
                name: name.trim(), 
                color: color || '#6b7280', 
                order: nextOrder,
                assignedUserId: assignedUserId || null,
                assignedTeamId: assignedTeamId || null
            }
        });
        res.status(201).json({ stage });
    } catch (error) {
        console.error('Create stage error:', error);
        res.status(500).json({ error: 'Durum oluşturulamadı' });
    }
};

// PUT /funnels/:workspaceId/:funnelId/stages/:stageId
export const updateStage = async (req, res) => {
    try {
        const { workspaceId, funnelId, stageId } = req.params;
        const { name, color, order, assignedUserId, assignedTeamId } = req.body;

        const funnel = await prisma.funnel.findFirst({ where: { id: funnelId, workspaceId } });
        if (!funnel) return res.status(404).json({ error: 'Akış bulunamadı' });

        const existing = await prisma.funnelStage.findFirst({ where: { id: stageId, funnelId } });
        if (!existing) return res.status(404).json({ error: 'Durum bulunamadı' });

        const stage = await prisma.funnelStage.update({
            where: { id: stageId },
            data: {
                ...(name && { name: name.trim() }),
                ...(color && { color }),
                ...(order !== undefined && { order }),
                ...(assignedUserId !== undefined && { assignedUserId }),
                ...(assignedTeamId !== undefined && { assignedTeamId })
            }
        });
        res.json({ stage });
    } catch (error) {
        console.error('Update stage error:', error);
        res.status(500).json({ error: 'Durum güncellenemedi' });
    }
};

// DELETE /funnels/:workspaceId/:funnelId/stages/:stageId
export const deleteStage = async (req, res) => {
    try {
        const { workspaceId, funnelId, stageId } = req.params;

        const funnel = await prisma.funnel.findFirst({ where: { id: funnelId, workspaceId } });
        if (!funnel) return res.status(404).json({ error: 'Akış bulunamadı' });

        const existing = await prisma.funnelStage.findFirst({ where: { id: stageId, funnelId } });
        if (!existing) return res.status(404).json({ error: 'Durum bulunamadı' });

        // Clear funnelStageId from conversations using this stage
        await prisma.conversation.updateMany({
            where: { funnelStageId: stageId },
            data: { funnelStageId: null }
        });

        await prisma.funnelStage.delete({ where: { id: stageId } });
        res.json({ success: true });
    } catch (error) {
        console.error('Delete stage error:', error);
        res.status(500).json({ error: 'Durum silinemedi' });
    }
};

// ── Helper: auto-assign the Satış Akışı funnel to a new conversation ──
export const autoAssignDefaultFunnel = async (workspaceId, conversationId) => {
    try {
        const conv = await prisma.conversation.findUnique({
            where: { id: conversationId },
            select: { funnelType: true }
        });
        if (!conv || conv.funnelType) return;

        // Önce "Satış Akışı", yoksa "Genel CRM (Otomatik İşlem)" akışını bul
        let defaultFunnel = await prisma.funnel.findFirst({
            where: { workspaceId, name: 'Satış Akışı' }
        });
        if (!defaultFunnel) {
            defaultFunnel = await prisma.funnel.findFirst({
                where: { workspaceId, name: 'Genel CRM (Otomatik İşlem)' }
            });
        }
        if (!defaultFunnel) {
            defaultFunnel = await prisma.funnel.findFirst({
                where: { workspaceId }
            });
        }
        if (!defaultFunnel) return;

        await prisma.conversation.update({
            where: { id: conversationId },
            data: { funnelType: defaultFunnel.id }
        });
        console.log(`✅ [AutoFunnel] Assigned "${defaultFunnel.name}" funnel to conversation ${conversationId}`);
    } catch (err) {
        console.error('❌ [AutoFunnel] Error:', err.message);
    }
};
