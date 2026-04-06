import prisma from '../lib/prisma.js';

// Predefined stages per funnel name (case-insensitive match)
const FUNNEL_STAGE_PRESETS = {
    'fırsat': [
        { name: 'Yeni Başvuru',       color: '#3b82f6', order: 0 },
        { name: 'Bilgi Verildi',      color: '#06b6d4', order: 1 },
        { name: 'Fırsat',             color: '#8b5cf6', order: 2 },
        { name: 'Sıcak Fırsat',       color: '#f97316', order: 3 },
        { name: 'Ulaşılamadı',        color: '#94a3b8', order: 4 },
        { name: 'Tekrar Ara',         color: '#f59e0b', order: 5 },
        { name: 'Teklif Verildi',     color: '#ec4899', order: 6 },
        { name: 'Randevu Planlandı',  color: '#14b8a6', order: 7 },
        { name: 'Pazarlık',           color: '#a855f7', order: 8 },
        { name: 'Sözleşme',           color: '#14b8a6', order: 9 },
        { name: 'Satış',              color: '#10b981', order: 10 },
        { name: 'Kayıp',              color: '#ef4444', order: 11 },
        { name: 'İlgisiz',            color: '#64748b', order: 12 }
    ],
    'iş başvurusu': [
        { name: 'CV Alındı',              color: '#3b82f6', order: 0 },
        { name: 'CV İnceleniyor',         color: '#06b6d4', order: 1 },
        { name: 'Ön Görüşme',             color: '#8b5cf6', order: 2 },
        { name: 'Mülakat',                color: '#f59e0b', order: 3 },
        { name: 'Teknik Değerlendirme',   color: '#f97316', order: 4 },
        { name: 'Referans Kontrolü',      color: '#ec4899', order: 5 },
        { name: 'Teklif Yapıldı',         color: '#0ea5e9', order: 6 },
        { name: 'İşe Alındı',             color: '#10b981', order: 7 },
        { name: 'Reddedildi',             color: '#ef4444', order: 8 },
        { name: 'Vazgeçti',               color: '#94a3b8', order: 9 }
    ],
    'destek': [
        { name: 'Yeni Talep',   color: '#3b82f6', order: 0 },
        { name: 'İnceleniyor',  color: '#f59e0b', order: 1 },
        { name: 'İşlemde',      color: '#8b5cf6', order: 2 },
        { name: 'Yanıt Bekleniyor', color: '#f97316', order: 3 },
        { name: 'Çözüldü',      color: '#10b981', order: 4 },
        { name: 'Kapatıldı',    color: '#64748b', order: 5 }
    ],
    'şikayet': [
        { name: 'Yeni Şikayet', color: '#ef4444', order: 0 },
        { name: 'İnceleniyor',  color: '#f59e0b', order: 1 },
        { name: 'İşlemde',      color: '#8b5cf6', order: 2 },
        { name: 'Yanıt Verildi',color: '#06b6d4', order: 3 },
        { name: 'Çözüldü',      color: '#10b981', order: 4 },
        { name: 'Kapatıldı',    color: '#64748b', order: 5 }
    ]
};

const DEFAULT_STAGES = [
    { name: 'Yeni',     color: '#3b82f6', order: 0 },
    { name: 'İşlemde',  color: '#f59e0b', order: 1 },
    { name: 'Kapandı',  color: '#10b981', order: 2 }
];

// Normalize Turkish characters to ASCII for reliable comparison
const normalizeTR = (s) => (s || '').toLowerCase()
    .replace(/\u0130/g, 'i').replace(/\u0131/g, 'i').replace(/i\u0307/g, 'i') // İ, ı, i+combining dot
    .replace(/\u015f/g, 's').replace(/\u0015f/g, 's') // ş
    .replace(/\u011f/g, 'g') // ğ
    .replace(/\u00fc/g, 'u') // ü
    .replace(/\u00f6/g, 'o') // ö
    .replace(/\u00e7/g, 'c') // ç
    .trim();

// Get the appropriate stage list for a funnel based on its name
const getStagesForFunnel = (funnelName) => {
    const normalized = normalizeTR(funnelName);
    // Check each preset key (also normalized)
    for (const [key, stages] of Object.entries(FUNNEL_STAGE_PRESETS)) {
        if (normalized.includes(normalizeTR(key))) return stages;
    }
    return DEFAULT_STAGES;
};

// 3 default funnels auto-seeded for every workspace on first visit
const DEFAULT_FUNNELS = [
    { name: 'Fırsat',           color: '#3b82f6', icon: '💰', order: 0 },
    { name: 'İş Başvurusu',     color: '#10b981', icon: '👔', order: 1 },
    { name: 'Destek / Şikayet', color: '#f59e0b', icon: '🎧', order: 2 }
];

// GET /funnels/:workspaceId
export const getFunnels = async (req, res) => {
    try {
        const { workspaceId } = req.params;

        // Try loading with stages; fall back to without if table doesn't exist yet
        let funnels;
        try {
            funnels = await prisma.funnel.findMany({
                where: { workspaceId },
                orderBy: { order: 'asc' },
                include: { stages: { orderBy: { order: 'asc' } } }
            });

            // ── AUTO-SEED: if workspace has NO funnels, create the 3 defaults ──
            if (funnels.length === 0) {
                console.log(`🌱 [Funnels] Seeding default funnels for workspace ${workspaceId}`);
                for (const def of DEFAULT_FUNNELS) {
                    const stages = getStagesForFunnel(def.name);
                    await prisma.funnel.create({
                        data: {
                            workspaceId,
                            name: def.name,
                            color: def.color,
                            icon: def.icon,
                            order: def.order,
                            stages: { create: stages }
                        }
                    });
                }
                funnels = await prisma.funnel.findMany({
                    where: { workspaceId },
                    orderBy: { order: 'asc' },
                    include: { stages: { orderBy: { order: 'asc' } } }
                });
                console.log(`✅ [Funnels] Seeded ${funnels.length} default funnels`);
            }

            // ── MIGRATE: rename 'Satış Akışı' → 'Fırsat' in existing workspaces ──
            const satisFunnel = funnels.find(f => f.name === 'Satış Akışı');
            if (satisFunnel) {
                await prisma.funnel.update({
                    where: { id: satisFunnel.id },
                    data: { name: 'Fırsat' }
                });
                // Delete existing stages so the re-seed loop below can create the correct 12
                await prisma.funnelStage.deleteMany({ where: { funnelId: satisFunnel.id } });
                // Refresh list so subsequent loops see the updated name & empty stages
                funnels = await prisma.funnel.findMany({
                    where: { workspaceId },
                    orderBy: { order: 'asc' },
                    include: { stages: { orderBy: { order: 'asc' } } }
                });
                console.log(`🔄 [Funnels] Renamed 'Satış Akışı' → 'Fırsat' for workspace ${workspaceId}`);
            }

            // Auto-seed stages: if a funnel exists but has wrong stage count, re-seed
            let needsRefresh = false;
            for (const funnel of funnels) {
                const expectedStages = getStagesForFunnel(funnel.name);
                const needsReset = funnel.stages.length === 0 || funnel.stages.length !== expectedStages.length;
                if (needsReset) {
                    if (funnel.stages.length > 0) {
                        await prisma.funnelStage.deleteMany({ where: { funnelId: funnel.id } });
                    }
                    await prisma.funnelStage.createMany({
                        data: expectedStages.map(s => ({ ...s, funnelId: funnel.id }))
                    });
                    needsRefresh = true;
                }
            }
            if (needsRefresh) {
                funnels = await prisma.funnel.findMany({
                    where: { workspaceId },
                    orderBy: { order: 'asc' },
                    include: { stages: { orderBy: { order: 'asc' } } }
                });
            }
        } catch (stageErr) {
            // funnel_stages table may not exist yet — load without stages
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
        res.status(500).json({ error: 'Funnellar alınamadı' });
    }
};

// POST /funnels/:workspaceId
export const createFunnel = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { name, color, icon } = req.body;
        if (!name?.trim()) return res.status(400).json({ error: 'Funnel adı zorunludur' });

        const maxOrder = await prisma.funnel.aggregate({ where: { workspaceId }, _max: { order: true } });
        const nextOrder = (maxOrder._max.order || 0) + 1;

        let funnel;
        try {
            funnel = await prisma.funnel.create({
                data: {
                    workspaceId,
                    name: name.trim(),
                    color: color || '#3b82f6',
                    icon: icon || '📁',
                    order: nextOrder,
                    stages: { create: getStagesForFunnel(name) }
                },
                include: { stages: { orderBy: { order: 'asc' } } }
            });
        } catch {
            // stages table may not exist — create without stages
            funnel = await prisma.funnel.create({
                data: {
                    workspaceId,
                    name: name.trim(),
                    color: color || '#3b82f6',
                    icon: icon || '📁',
                    order: nextOrder
                }
            });
            funnel.stages = [];
        }
        res.status(201).json({ funnel });
    } catch (error) {
        console.error('Create funnel error:', error);
        res.status(500).json({ error: 'Funnel oluşturulamadı' });
    }
};

// PUT /funnels/:workspaceId/:funnelId
export const updateFunnel = async (req, res) => {
    try {
        const { workspaceId, funnelId } = req.params;
        const { name, color, icon, order } = req.body;
        const existing = await prisma.funnel.findFirst({ where: { id: funnelId, workspaceId } });
        if (!existing) return res.status(404).json({ error: 'Funnel bulunamadı' });

        const updateData = {
            ...(name && { name: name.trim() }),
            ...(color && { color }),
            ...(icon && { icon }),
            ...(order !== undefined && { order })
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
        res.status(500).json({ error: 'Funnel güncellenemedi' });
    }
};

// DELETE /funnels/:workspaceId/:funnelId
export const deleteFunnel = async (req, res) => {
    try {
        const { workspaceId, funnelId } = req.params;
        const existing = await prisma.funnel.findFirst({ where: { id: funnelId, workspaceId } });
        if (!existing) return res.status(404).json({ error: 'Funnel bulunamadı' });
        await prisma.funnel.delete({ where: { id: funnelId } });
        res.json({ success: true });
    } catch (error) {
        console.error('Delete funnel error:', error);
        res.status(500).json({ error: 'Funnel silinemedi' });
    }
};

// ── Stage CRUD ──

// POST /funnels/:workspaceId/:funnelId/stages
export const createStage = async (req, res) => {
    try {
        const { workspaceId, funnelId } = req.params;
        const { name, color } = req.body;
        if (!name?.trim()) return res.status(400).json({ error: 'Durum adı zorunludur' });

        const funnel = await prisma.funnel.findFirst({ where: { id: funnelId, workspaceId } });
        if (!funnel) return res.status(404).json({ error: 'Funnel bulunamadı' });

        const maxOrder = await prisma.funnelStage.aggregate({ where: { funnelId }, _max: { order: true } });
        const nextOrder = (maxOrder._max.order ?? -1) + 1;

        const stage = await prisma.funnelStage.create({
            data: { funnelId, name: name.trim(), color: color || '#6b7280', order: nextOrder }
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
        const { name, color, order } = req.body;

        const funnel = await prisma.funnel.findFirst({ where: { id: funnelId, workspaceId } });
        if (!funnel) return res.status(404).json({ error: 'Funnel bulunamadı' });

        const existing = await prisma.funnelStage.findFirst({ where: { id: stageId, funnelId } });
        if (!existing) return res.status(404).json({ error: 'Durum bulunamadı' });

        const stage = await prisma.funnelStage.update({
            where: { id: stageId },
            data: {
                ...(name && { name: name.trim() }),
                ...(color && { color }),
                ...(order !== undefined && { order })
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
        if (!funnel) return res.status(404).json({ error: 'Funnel bulunamadı' });

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

// ── Helper: auto-assign the Fırsat funnel to a new conversation ──
// Call fire-and-forget from webhook handlers: autoAssignDefaultFunnel(workspaceId, conversationId)
export const autoAssignDefaultFunnel = async (workspaceId, conversationId) => {
    try {
        // Skip if already has a funnel
        const conv = await prisma.conversation.findUnique({
            where: { id: conversationId },
            select: { funnelType: true }
        });
        if (!conv || conv.funnelType) return; // already set

        // Find the 'Fırsat' funnel for this workspace
        const fursatFunnel = await prisma.funnel.findFirst({
            where: { workspaceId, name: 'Fırsat' }
        });
        if (!fursatFunnel) return;

        await prisma.conversation.update({
            where: { id: conversationId },
            data: { funnelType: fursatFunnel.id }
        });
        console.log(`✅ [AutoFunnel] Assigned Fırsat funnel to conversation ${conversationId}`);
    } catch (err) {
        console.error('❌ [AutoFunnel] Error:', err.message);
    }
};
