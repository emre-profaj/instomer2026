import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

/**
 * Tüketim kayıt servisi
 * Her AI çağrısı, arama, şablon gönderimi vb. için UsageRecord oluşturur.
 * Prepaid müşterilerde krediden otomatik düşer.
 */

// Company billing bilgisini getir (cache ile)
const billingCache = new Map();
const CACHE_TTL = 60000; // 1 dakika

export async function getCompanyBilling(companyId) {
    if (!companyId) return null;
    
    const cached = billingCache.get(companyId);
    if (cached && Date.now() - cached.time < CACHE_TTL) {
        return cached.data;
    }
    
    const billing = await prisma.companyBilling.findUnique({
        where: { companyId },
        include: { plan: true }
    });
    
    billingCache.set(companyId, { data: billing, time: Date.now() });
    return billing;
}

// Cache temizle (güncelleme sonrası)
export function invalidateBillingCache(companyId) {
    billingCache.delete(companyId);
}

/**
 * Tüketim kaydı oluştur
 * @param {Object} params
 * @param {string} params.companyId - Firma ID
 * @param {string} params.workspaceId - Workspace ID
 * @param {string} params.type - AI_CHAT | AI_CALL | WHATSAPP_TEMPLATE | SMS | EMAIL
 * @param {number} params.quantity - Miktar (token, dakika, adet)
 * @param {string} params.unit - token | minute | message
 * @param {number} params.costUsd - Gerçek maliyet (USD)
 * @param {Object} [params.metadata] - Ek bilgi (model, service, callId vb.)
 */
export async function recordUsage({ companyId, workspaceId, type, quantity, unit, costUsd, metadata }) {
    try {
        if (!companyId || !workspaceId) return;
        
        const billing = await getCompanyBilling(companyId);
        const multiplier = billing?.costMultiplier || 2.0;
        const priceUsd = parseFloat((costUsd * multiplier).toFixed(6));
        
        // UsageRecord oluştur
        await prisma.usageRecord.create({
            data: {
                companyId,
                workspaceId,
                type,
                quantity,
                unit,
                costUsd,
                priceUsd,
                metadata: metadata ? JSON.stringify(metadata) : null
            }
        });
        
        // Prepaid ise krediden düş
        if (billing?.billingType === 'PREPAID' && priceUsd > 0) {
            await prisma.companyBilling.update({
                where: { companyId },
                data: { creditBalance: { decrement: priceUsd } }
            });
            invalidateBillingCache(companyId);
            
            const newBalance = (billing.creditBalance || 0) - priceUsd;
            if (newBalance <= 0) {
                console.warn(`⚠️ [BILLING] Company ${companyId} kredi bitti! Bakiye: $${newBalance.toFixed(2)}`);
            } else if (newBalance < 5) {
                console.warn(`⚠️ [BILLING] Company ${companyId} kredi düşük! Bakiye: $${newBalance.toFixed(2)}`);
            }
        }
    } catch (error) {
        // Tüketim kaydı hatası asıl işlemi engellemez
        console.error('❌ [BILLING] recordUsage error:', error.message);
    }
}

/**
 * Workspace'in company bilgisini bul
 */
export async function getWorkspaceCompanyId(workspaceId) {
    try {
        const ws = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { companyId: true }
        });
        return ws?.companyId || null;
    } catch {
        return null;
    }
}

/**
 * Aylık fatura oluştur
 */
export async function generateMonthlyInvoice(companyId, period) {
    const billing = await prisma.companyBilling.findUnique({
        where: { companyId },
        include: { plan: true }
    });
    
    if (!billing) return null;
    
    // Bu dönem için zaten fatura var mı?
    const existing = await prisma.invoice.findFirst({
        where: { companyBillingId: billing.id, period }
    });
    if (existing) return existing;
    
    // Tüketim toplamı
    const [year, month] = period.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 1);
    
    const usageAgg = await prisma.usageRecord.aggregate({
        where: {
            companyId,
            invoiceId: null,
            createdAt: { gte: startDate, lt: endDate }
        },
        _sum: { costUsd: true, priceUsd: true }
    });
    
    // Tüketim detay
    const usageByType = await prisma.usageRecord.groupBy({
        by: ['type'],
        where: {
            companyId,
            invoiceId: null,
            createdAt: { gte: startDate, lt: endDate }
        },
        _sum: { quantity: true, costUsd: true, priceUsd: true },
        _count: true
    });
    
    const planAmount = billing.plan?.monthlyPrice || 0;
    const usageAmount = usageAgg._sum.priceUsd || 0;
    const totalAmount = planAmount + usageAmount;
    
    // Fatura numarası oluştur
    const invoiceCount = await prisma.invoice.count();
    const invoiceNumber = `INS-${year}-${String(invoiceCount + 1).padStart(3, '0')}`;
    
    // Fatura kalemleri
    const items = [];
    if (planAmount > 0) {
        items.push({ type: 'PLAN', name: billing.plan?.name || 'Paket', amount: planAmount });
    }
    const typeLabels = {
        AI_CHAT: '🤖 AI Yazışma',
        AI_CALL: '☎️ AI Arama',
        WHATSAPP_TEMPLATE: '📨 WhatsApp Şablon',
        SMS: '💬 SMS',
        EMAIL: '📧 E-posta'
    };
    for (const u of usageByType) {
        items.push({
            type: u.type,
            name: typeLabels[u.type] || u.type,
            quantity: u._sum.quantity,
            cost: u._sum.costUsd,
            amount: u._sum.priceUsd,
            count: u._count
        });
    }
    
    // Fatura oluştur
    const invoice = await prisma.invoice.create({
        data: {
            companyBillingId: billing.id,
            invoiceNumber,
            period,
            planAmount,
            usageAmount,
            subtotal: totalAmount,
            totalAmount,
            status: 'DRAFT',
            dueDate: new Date(year, month, 15),
            items: JSON.stringify(items)
        }
    });
    
    // UsageRecord'ları faturaya bağla
    await prisma.usageRecord.updateMany({
        where: {
            companyId,
            invoiceId: null,
            createdAt: { gte: startDate, lt: endDate }
        },
        data: { invoiceId: invoice.id }
    });
    
    console.log(`🧾 [BILLING] Invoice ${invoiceNumber} created for company ${companyId}: $${totalAmount.toFixed(2)}`);
    return invoice;
}
