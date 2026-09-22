import prisma from '../lib/prisma.js';

// Default case types to seed for new workspaces with their target funnel associations
export const DEFAULT_CASE_TYPES = [
    { name: 'Fırsat',                 systemCode: 'FIRSAT',       color: '#eab308', icon: '💰', targetFunnelKeywords: ['satış', 'fırsat', 'sales'], order: 0 },
    { name: 'İş Ortaklığı Başvurusu', systemCode: 'PARTNER',      color: '#10b981', icon: '🤝', targetFunnelKeywords: ['iş', 'taşeron', 'başvuru', 'ik', 'kariyer'],  order: 1 },
    { name: 'İş Başvurusu',           systemCode: 'IS_BASVURUSU', color: '#6d28d9', icon: '💼', targetFunnelKeywords: ['iş', 'taşeron', 'ik', 'kariyer', 'başvuru'], order: 2 },
    { name: 'Destek',                 systemCode: 'DESTEK',       color: '#0369a1', icon: '🛠️', targetFunnelKeywords: ['destek', 'genel', 'support'], order: 3 },
    { name: 'Şikayet',                systemCode: 'SIKAYET',      color: '#dc2626', icon: '⚠️', targetFunnelKeywords: ['destek', 'genel', 'şikayet'], order: 4 },
    { name: 'İptal - İade',           systemCode: 'IPTAL_IADE',   color: '#f97316', icon: '🔄', targetFunnelKeywords: ['destek', 'genel', 'iade'],    order: 5 },
    { name: 'Randevu',                systemCode: 'RANDEVU',      color: '#1d4ed8', icon: '📅', targetFunnelKeywords: ['randevu', 'appointment'],    order: 6 },
    { name: 'Genel',                  systemCode: 'GENEL',        color: '#6b7280', icon: '📁', targetFunnelKeywords: ['genel', 'triyaj'],           order: 7 },
];

/**
 * Workspace için Funnel listesini ve hedef anahtar kelimelere göre en uygun akışı bulan yardımcı fonksiyon
 */
export const findMatchingFunnel = (funnels, keywords = []) => {
    if (!funnels || funnels.length === 0) return null;
    for (const kw of keywords) {
        const match = funnels.find(f => f.name.toLocaleLowerCase('tr-TR').includes(kw.toLocaleLowerCase('tr-TR')));
        if (match) return match;
    }
    // Fallback: isDefault olan akış veya ilk akış
    return funnels.find(f => f.isDefault) || funnels[0] || null;
};

/**
 * Workspace'in default case type'larını eksiksiz sağlar ve funnel'lara bağlar
 */
export const ensureDefaultCaseTypes = async (workspaceId) => {
    try {
        const funnels = await prisma.funnel.findMany({
            where: { workspaceId },
            select: { id: true, name: true, isDefault: true }
        });

        const existingCaseTypes = await prisma.caseType.findMany({
            where: { workspaceId }
        });

        const existingCodes = new Set(existingCaseTypes.map(c => c.systemCode || c.name));

        // 1. Eksik default case type'ları oluştur
        for (const def of DEFAULT_CASE_TYPES) {
            const alreadyExists = existingCaseTypes.some(
                c => (c.systemCode && c.systemCode === def.systemCode) || c.name.toLocaleLowerCase('tr-TR') === def.name.toLocaleLowerCase('tr-TR')
            );

            if (!alreadyExists) {
                const matchedFunnel = findMatchingFunnel(funnels, def.targetFunnelKeywords);
                try {
                    await prisma.caseType.create({
                        data: {
                            workspaceId,
                            name: def.name,
                            systemCode: def.systemCode,
                            color: def.color,
                            icon: def.icon,
                            order: def.order,
                            funnelId: matchedFunnel ? matchedFunnel.id : null
                        }
                    });
                    console.log(`🌱 [CaseType] Created default case type "${def.name}" -> Funnel: "${matchedFunnel?.name || 'Yok'}"`);
                } catch {
                    // Fallback without funnelId if column doesn't exist yet
                    await prisma.caseType.create({
                        data: {
                            workspaceId,
                            name: def.name,
                            systemCode: def.systemCode,
                            color: def.color,
                            icon: def.icon,
                            order: def.order
                        }
                    }).catch(() => {});
                }
            }
        }

        // 2. Mevcut olup funnelId'si boş olan case type'ların funnelId'lerini bağla
        for (const ct of existingCaseTypes) {
            if (!ct.funnelId) {
                const def = DEFAULT_CASE_TYPES.find(d => d.systemCode === ct.systemCode || d.name.toLocaleLowerCase('tr-TR') === ct.name.toLocaleLowerCase('tr-TR'));
                if (def) {
                    const matchedFunnel = findMatchingFunnel(funnels, def.targetFunnelKeywords);
                    if (matchedFunnel) {
                        try {
                            await prisma.caseType.update({
                                where: { id: ct.id },
                                data: { funnelId: matchedFunnel.id }
                            });
                            console.log(`🔗 [CaseType] Linked existing case type "${ct.name}" -> Funnel: "${matchedFunnel.name}"`);
                        } catch (_) {}
                    }
                }
            }
        }
    } catch (err) {
        console.error('⚠️ [CaseType] ensureDefaultCaseTypes error:', err.message);
    }
};

// Get all case types for a workspace (auto-seeds defaults if empty)
export const getCaseTypes = async (req, res) => {
    try {
        const { workspaceId } = req.params;

        // Auto-seed: workspace'te default case type'ları kontrol et ve eksikleri tamamla
        await ensureDefaultCaseTypes(workspaceId);

        let caseTypes;
        try {
            caseTypes = await prisma.caseType.findMany({
                where: { workspaceId },
                include: {
                    funnel: {
                        select: { id: true, name: true, color: true, icon: true }
                    }
                },
                orderBy: { order: 'asc' }
            });
        } catch (findErr) {
            console.warn('⚠️ [CaseType] findMany with funnel relation failed, falling back:', findErr.message);
            caseTypes = await prisma.caseType.findMany({
                where: { workspaceId },
                orderBy: { order: 'asc' }
            });
        }

        res.json({ success: true, data: caseTypes });
    } catch (error) {
        console.error('Error in getCaseTypes:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası', error: error.message });
    }
};

// Create case type
export const createCaseType = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { name, systemCode, color, icon, isActive, order, funnelId } = req.body;

        let data;
        try {
            data = await prisma.caseType.create({
                data: {
                    workspaceId,
                    name,
                    systemCode,
                    color: color || '#eab308',
                    icon,
                    isActive: isActive ?? true,
                    order: order || 0,
                    funnelId: funnelId || null
                },
                include: {
                    funnel: {
                        select: { id: true, name: true, color: true, icon: true }
                    }
                }
            });
        } catch (createErr) {
            console.warn('⚠️ [CaseType] create with funnelId failed, falling back:', createErr.message);
            data = await prisma.caseType.create({
                data: {
                    workspaceId,
                    name,
                    systemCode,
                    color: color || '#eab308',
                    icon,
                    isActive: isActive ?? true,
                    order: order || 0
                }
            });
        }
        res.json({ success: true, data });
    } catch (error) {
        console.error('Error in createCaseType:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası', error: error.message });
    }
};

// Update case type
export const updateCaseType = async (req, res) => {
    try {
        const { workspaceId, id } = req.params;
        const { name, systemCode, color, icon, isActive, order, funnelId } = req.body;

        const updatePayload = {};
        if (name !== undefined) updatePayload.name = name;
        if (systemCode !== undefined) updatePayload.systemCode = systemCode;
        if (color !== undefined) updatePayload.color = color;
        if (icon !== undefined) updatePayload.icon = icon;
        if (isActive !== undefined) updatePayload.isActive = isActive;
        if (order !== undefined) updatePayload.order = order;
        if (funnelId !== undefined) updatePayload.funnelId = funnelId || null;

        let data;
        try {
            data = await prisma.caseType.update({
                where: { id, workspaceId },
                data: updatePayload,
                include: {
                    funnel: {
                        select: { id: true, name: true, color: true, icon: true }
                    }
                }
            });
        } catch (updateErr) {
            console.warn('⚠️ [CaseType] update with funnel relation failed, falling back:', updateErr.message);
            delete updatePayload.funnelId;
            data = await prisma.caseType.update({
                where: { id, workspaceId },
                data: updatePayload
            });
        }
        res.json({ success: true, data });
    } catch (error) {
        console.error('Error in updateCaseType:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası', error: error.message });
    }
};

// Delete case type
export const deleteCaseType = async (req, res) => {
    try {
        const { workspaceId, id } = req.params;
        await prisma.caseType.delete({
            where: { id, workspaceId }
        });
        res.json({ success: true, message: 'Deleted successfully' });
    } catch (error) {
        console.error('Error in deleteCaseType:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası', error: error.message });
    }
};
