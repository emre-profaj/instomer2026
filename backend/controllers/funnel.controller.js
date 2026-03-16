import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Default stages for Fırsat/Satış funnel
const DEFAULT_SALES_STAGES = JSON.stringify([
    { value: 'NEW_APPLICATION', label: 'Yeni Başvuru', color: '#3b82f6' },
    { value: 'OPPORTUNITY', label: 'Fırsat', color: '#f59e0b' },
    { value: 'HOT_OPPORTUNITY', label: 'Sıcak Fırsat', color: '#ef4444' },
    { value: 'UNREACHABLE', label: 'Ulaşılamadı', color: '#64748b' },
    { value: 'CALLBACK', label: 'Tekrar Ara', color: '#0ea5e9' },
    { value: 'OFFER_GIVEN', label: 'Teklif Verildi', color: '#8b5cf6' },
    { value: 'NEGOTIATION', label: 'Pazarlık', color: '#f97316' },
    { value: 'CONTRACT', label: 'Sözleşme', color: '#06b6d4' },
    { value: 'SALE_COMPLETED', label: 'Satış', color: '#10b981' },
    { value: 'LOST', label: 'Kayıp', color: '#1f2937' },
    { value: 'NOT_INTERESTED', label: 'İlgisiz', color: '#9ca3af' },
]);

const DEFAULT_JOB_STAGES = JSON.stringify([
    { value: 'CV_RECEIVED', label: 'CV Alındı', color: '#3b82f6' },
    { value: 'INFO_GIVEN', label: 'Bilgi Verildi', color: '#8b5cf6' },
    { value: 'INTERVIEW_SCHEDULED', label: 'Mülakat Planlandı', color: '#f59e0b' },
    { value: 'INTERVIEWED', label: 'Mülakat Yapıldı', color: '#f97316' },
    { value: 'OFFER_GIVEN', label: 'Teklif Verildi', color: '#06b6d4' },
    { value: 'HIRED', label: 'İşe Alındı', color: '#10b981' },
    { value: 'REJECTED', label: 'Reddedildi', color: '#ef4444' },
]);

const DEFAULT_SUPPORT_STAGES = JSON.stringify([
    { value: 'NEW_TICKET', label: 'Yeni Talep', color: '#3b82f6' },
    { value: 'IN_PROGRESS', label: 'İşleniyor', color: '#f59e0b' },
    { value: 'WAITING_CUSTOMER', label: 'Müşteri Bekleniyor', color: '#8b5cf6' },
    { value: 'ESCALATED', label: 'Eskalasyon', color: '#ef4444' },
    { value: 'RESOLVED', label: 'Çözüldü', color: '#10b981' },
    { value: 'CLOSED', label: 'Kapatıldı', color: '#6b7280' },
]);

// Helper to parse funnel stages safely
const parseFunnelStages = (funnel) => {
    if (!funnel) return null;
    try {
        return funnel.stages ? JSON.parse(funnel.stages) : null;
    } catch { return null; }
};

// GET /funnels/:workspaceId
export const getFunnels = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const funnels = await prisma.funnel.findMany({
            where: { workspaceId },
            orderBy: { order: 'asc' }
        });
        // Parse stages for each funnel
        const result = funnels.map(f => ({
            ...f,
            stages: parseFunnelStages(f)
        }));
        res.json({ funnels: result });
    } catch (error) {
        console.error('Get funnels error:', error);
        res.status(500).json({ error: 'Funnellar alınamadı' });
    }
};

// POST /funnels/:workspaceId
export const createFunnel = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { name, color, icon, stages } = req.body;

        if (!name?.trim()) {
            return res.status(400).json({ error: 'Funnel adı zorunludur' });
        }

        const maxOrder = await prisma.funnel.aggregate({
            where: { workspaceId },
            _max: { order: true }
        });
        const nextOrder = (maxOrder._max.order || 0) + 1;

        // Auto-assign default stages based on funnel name keywords if none provided
        let stagesJson = stages ? JSON.stringify(stages) : null;
        if (!stagesJson) {
            const nameLower = name.toLowerCase();
            if (nameLower.includes('iş baş') || nameLower.includes('is bas') || nameLower.includes('kariyer')) {
                stagesJson = DEFAULT_JOB_STAGES;
            } else if (nameLower.includes('destek') || nameLower.includes('şikayet') || nameLower.includes('sikayet') || nameLower.includes('support')) {
                stagesJson = DEFAULT_SUPPORT_STAGES;
            } else {
                stagesJson = DEFAULT_SALES_STAGES; // default: sales funnel
            }
        }

        const funnel = await prisma.funnel.create({
            data: {
                workspaceId,
                name: name.trim(),
                color: color || '#3b82f6',
                icon: icon || '📁',
                stages: stagesJson,
                order: nextOrder
            }
        });

        res.status(201).json({
            funnel: { ...funnel, stages: parseFunnelStages(funnel) }
        });
    } catch (error) {
        console.error('Create funnel error:', error);
        res.status(500).json({ error: 'Funnel oluşturulamadı' });
    }
};

// PUT /funnels/:workspaceId/:funnelId
export const updateFunnel = async (req, res) => {
    try {
        const { workspaceId, funnelId } = req.params;
        const { name, color, icon, order, stages } = req.body;

        const existing = await prisma.funnel.findFirst({ where: { id: funnelId, workspaceId } });
        if (!existing) return res.status(404).json({ error: 'Funnel bulunamadı' });

        const funnel = await prisma.funnel.update({
            where: { id: funnelId },
            data: {
                ...(name && { name: name.trim() }),
                ...(color && { color }),
                ...(icon && { icon }),
                ...(order !== undefined && { order }),
                ...(stages !== undefined && { stages: stages ? JSON.stringify(stages) : null })
            }
        });
        res.json({ funnel: { ...funnel, stages: parseFunnelStages(funnel) } });
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
