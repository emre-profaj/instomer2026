import { PrismaClient } from '@prisma/client';
import { invalidateBillingCache, generateMonthlyInvoice } from '../services/usageTracking.service.js';
const prisma = new PrismaClient();

// ==================== ADMIN ENDPOINTS ====================

// GET /api/admin/billing/overview — Genel bakış
export const getBillingOverview = async (req, res) => {
    try {
        const now = new Date();
        const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        
        // Toplam gelir (ödenmiş faturalar)
        const totalRevenue = await prisma.payment.aggregate({ _sum: { amount: true } });
        
        // Bu ayki tüketim
        const monthlyUsage = await prisma.usageRecord.aggregate({
            where: { createdAt: { gte: startOfMonth } },
            _sum: { costUsd: true, priceUsd: true }
        });
        
        // Ödenmemiş faturalar
        const unpaidInvoices = await prisma.invoice.aggregate({
            where: { status: { in: ['SENT', 'OVERDUE'] } },
            _sum: { totalAmount: true, paidAmount: true }
        });
        
        // Aktif müşteri sayısı
        const activeCompanies = await prisma.companyBilling.count();
        
        res.json({
            totalRevenue: totalRevenue._sum.amount || 0,
            monthlyUsageCost: monthlyUsage._sum.costUsd || 0,
            monthlyUsagePrice: monthlyUsage._sum.priceUsd || 0,
            unpaidTotal: (unpaidInvoices._sum.totalAmount || 0) - (unpaidInvoices._sum.paidAmount || 0),
            activeCompanies,
            currentPeriod
        });
    } catch (error) {
        console.error('❌ getBillingOverview error:', error);
        res.status(500).json({ error: error.message });
    }
};

// GET /api/admin/billing/plans — Paketleri listele
export const getPlans = async (req, res) => {
    try {
        const plans = await prisma.billingPlan.findMany({
            orderBy: { sortOrder: 'asc' },
            include: { _count: { select: { companies: true } } }
        });
        res.json({ plans });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// POST /api/admin/billing/plans — Paket oluştur
export const createPlan = async (req, res) => {
    try {
        const { name, description, monthlyPrice, includedAiCredits, includedCallMins, costMultiplier, features } = req.body;
        const plan = await prisma.billingPlan.create({
            data: {
                name,
                description,
                monthlyPrice: monthlyPrice || 0,
                includedAiCredits: includedAiCredits || 0,
                includedCallMins: includedCallMins || 0,
                costMultiplier: costMultiplier || 2.0,
                features: features ? JSON.stringify(features) : null
            }
        });
        res.json({ plan });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// PUT /api/admin/billing/plans/:id — Paket güncelle
export const updatePlan = async (req, res) => {
    try {
        const { id } = req.params;
        const data = {};
        const allowed = ['name', 'description', 'monthlyPrice', 'includedAiCredits', 'includedCallMins', 'costMultiplier', 'features', 'isActive', 'sortOrder'];
        for (const key of allowed) {
            if (req.body[key] !== undefined) {
                data[key] = key === 'features' && typeof req.body[key] === 'object' ? JSON.stringify(req.body[key]) : req.body[key];
            }
        }
        const plan = await prisma.billingPlan.update({ where: { id }, data });
        res.json({ plan });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// GET /api/admin/billing/companies — Tüm şirketlerin fatura durumu
export const getBillingCompanies = async (req, res) => {
    try {
        const companies = await prisma.company.findMany({
            include: {
                billing: { include: { plan: true } },
                workspaces: { select: { id: true, name: true } },
                _count: { select: { workspaces: true } }
            },
            orderBy: { name: 'asc' }
        });
        
        // Her şirket için bu ayki tüketim
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        
        const companiesWithUsage = await Promise.all(companies.map(async (company) => {
            const usage = await prisma.usageRecord.aggregate({
                where: { companyId: company.id, createdAt: { gte: startOfMonth } },
                _sum: { costUsd: true, priceUsd: true }
            });
            
            const unpaid = await prisma.invoice.aggregate({
                where: {
                    companyBilling: { companyId: company.id },
                    status: { in: ['SENT', 'OVERDUE'] }
                },
                _sum: { totalAmount: true, paidAmount: true }
            });
            
            return {
                ...company,
                monthlyUsageCost: usage._sum.costUsd || 0,
                monthlyUsagePrice: usage._sum.priceUsd || 0,
                unpaidAmount: (unpaid._sum.totalAmount || 0) - (unpaid._sum.paidAmount || 0)
            };
        }));
        
        res.json({ companies: companiesWithUsage });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// GET /api/admin/billing/companies/:companyId — Şirket detay
export const getCompanyBillingDetail = async (req, res) => {
    try {
        const { companyId } = req.params;
        
        const company = await prisma.company.findUnique({
            where: { id: companyId },
            include: {
                billing: { include: { plan: true, invoices: { orderBy: { createdAt: 'desc' }, take: 12 }, payments: { orderBy: { createdAt: 'desc' }, take: 20 } } },
                workspaces: { select: { id: true, name: true } }
            }
        });
        
        if (!company) return res.status(404).json({ error: 'Şirket bulunamadı' });
        
        // Bu ayki workspace bazlı tüketim
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        
        const usageByWorkspace = await prisma.usageRecord.groupBy({
            by: ['workspaceId', 'type'],
            where: { companyId, createdAt: { gte: startOfMonth } },
            _sum: { quantity: true, costUsd: true, priceUsd: true },
            _count: true
        });
        
        // Toplam tüketim (bu ay)
        const totalUsage = await prisma.usageRecord.aggregate({
            where: { companyId, createdAt: { gte: startOfMonth } },
            _sum: { costUsd: true, priceUsd: true }
        });
        
        res.json({
            company,
            usageByWorkspace,
            totalUsage: {
                cost: totalUsage._sum.costUsd || 0,
                price: totalUsage._sum.priceUsd || 0
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// PUT /api/admin/billing/companies/:companyId — Plan ata, çarpan ayarla
export const updateCompanyBilling = async (req, res) => {
    try {
        const { companyId } = req.params;
        const { planId, billingType, costMultiplier, billingEmail, billingName, taxNumber, taxOffice, notes } = req.body;
        
        const data = {};
        if (planId !== undefined) data.planId = planId || null;
        if (billingType) data.billingType = billingType;
        if (costMultiplier !== undefined) data.costMultiplier = costMultiplier;
        if (billingEmail !== undefined) data.billingEmail = billingEmail;
        if (billingName !== undefined) data.billingName = billingName;
        if (taxNumber !== undefined) data.taxNumber = taxNumber;
        if (taxOffice !== undefined) data.taxOffice = taxOffice;
        if (notes !== undefined) data.notes = notes;
        
        const billing = await prisma.companyBilling.upsert({
            where: { companyId },
            update: data,
            create: { companyId, ...data },
            include: { plan: true }
        });
        
        invalidateBillingCache(companyId);
        res.json({ billing });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// POST /api/admin/billing/companies/:companyId/credit — Kredi ekle
export const addCredit = async (req, res) => {
    try {
        const { companyId } = req.params;
        const { amount, notes } = req.body;
        
        if (!amount || amount <= 0) return res.status(400).json({ error: 'Geçerli bir tutar girin' });
        
        const billing = await prisma.companyBilling.upsert({
            where: { companyId },
            update: { creditBalance: { increment: amount } },
            create: { companyId, creditBalance: amount, billingType: 'PREPAID' }
        });
        
        // Ödeme kaydı oluştur
        await prisma.payment.create({
            data: {
                companyBillingId: billing.id,
                amount,
                method: 'CREDIT_ADD',
                notes: notes || `Kredi eklendi: $${amount}`
            }
        });
        
        invalidateBillingCache(companyId);
        console.log(`💰 [BILLING] $${amount} credit added to company ${companyId}`);
        res.json({ billing, newBalance: billing.creditBalance });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// POST /api/admin/billing/companies/:companyId/invoice — Fatura oluştur
export const createInvoice = async (req, res) => {
    try {
        const { companyId } = req.params;
        const { period } = req.body;
        
        const now = new Date();
        const targetPeriod = period || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        
        const invoice = await generateMonthlyInvoice(companyId, targetPeriod);
        if (!invoice) return res.status(400).json({ error: 'Fatura oluşturulamadı (billing kaydı yok)' });
        
        res.json({ invoice });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// PUT /api/admin/billing/invoices/:id — Fatura güncelle
export const updateInvoice = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, paidAmount, notes, dueDate } = req.body;
        
        const data = {};
        if (status) data.status = status;
        if (paidAmount !== undefined) data.paidAmount = paidAmount;
        if (notes !== undefined) data.notes = notes;
        if (dueDate) data.dueDate = new Date(dueDate);
        
        // PAID olarak işaretlenirse paidAmount = totalAmount
        if (status === 'PAID') {
            const inv = await prisma.invoice.findUnique({ where: { id } });
            if (inv) data.paidAmount = inv.totalAmount;
        }
        
        const invoice = await prisma.invoice.update({ where: { id }, data });
        res.json({ invoice });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// POST /api/admin/billing/payments — Ödeme kaydet
export const createPayment = async (req, res) => {
    try {
        const { companyId, amount, method, reference, invoiceId, notes } = req.body;
        
        const billing = await prisma.companyBilling.findUnique({ where: { companyId } });
        if (!billing) return res.status(404).json({ error: 'Billing kaydı bulunamadı' });
        
        const payment = await prisma.payment.create({
            data: {
                companyBillingId: billing.id,
                amount,
                method: method || 'BANK_TRANSFER',
                reference,
                invoiceId,
                notes
            }
        });
        
        // Faturaya ödeme uygula
        if (invoiceId) {
            const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
            if (invoice) {
                const newPaid = (invoice.paidAmount || 0) + amount;
                await prisma.invoice.update({
                    where: { id: invoiceId },
                    data: {
                        paidAmount: newPaid,
                        status: newPaid >= invoice.totalAmount ? 'PAID' : invoice.status
                    }
                });
            }
        }
        
        res.json({ payment });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// DELETE /api/admin/billing/plans/:id
export const deletePlan = async (req, res) => {
    try {
        const { id } = req.params;
        // Kullanımda olan plan silinmesin
        const inUse = await prisma.companyBilling.count({ where: { planId: id } });
        if (inUse > 0) return res.status(400).json({ error: `Bu plan ${inUse} şirket tarafından kullanılıyor` });
        
        await prisma.billingPlan.delete({ where: { id } });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};


// ==================== MÜŞTERİ ENDPOINTS ====================

// GET /api/billing/my — Kendi fatura bilgileri + bakiye
export const getMyBilling = async (req, res) => {
    try {
        // Kullanıcının company'lerini bul
        const companies = await prisma.company.findMany({
            where: { ownerId: req.user.id },
            include: {
                billing: { include: { plan: true } },
                workspaces: { select: { id: true, name: true } }
            }
        });
        
        if (companies.length === 0) return res.json({ billing: null, companies: [] });
        
        res.json({ companies });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// GET /api/billing/my/usage — Bu ayki kullanım detayı
export const getMyUsage = async (req, res) => {
    try {
        const { companyId } = req.query;
        
        // Yetki kontrolü
        const company = await prisma.company.findFirst({
            where: { id: companyId, ownerId: req.user.id }
        });
        if (!company) return res.status(403).json({ error: 'Yetkisiz' });
        
        const now = new Date();
        const period = req.query.period || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const [year, month] = period.split('-').map(Number);
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 1);
        
        // Tüketim (tip bazlı)
        const usageByType = await prisma.usageRecord.groupBy({
            by: ['type'],
            where: { companyId, createdAt: { gte: startDate, lt: endDate } },
            _sum: { quantity: true, priceUsd: true },
            _count: true
        });
        
        // Workspace bazlı
        const usageByWorkspace = await prisma.usageRecord.groupBy({
            by: ['workspaceId', 'type'],
            where: { companyId, createdAt: { gte: startDate, lt: endDate } },
            _sum: { quantity: true, priceUsd: true },
            _count: true
        });
        
        // Toplam
        const total = await prisma.usageRecord.aggregate({
            where: { companyId, createdAt: { gte: startDate, lt: endDate } },
            _sum: { priceUsd: true }
        });
        
        // Workspace isimleri
        const workspaces = await prisma.workspace.findMany({
            where: { companyId },
            select: { id: true, name: true }
        });
        
        res.json({
            period,
            usageByType,
            usageByWorkspace,
            total: total._sum.priceUsd || 0,
            workspaces
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// GET /api/billing/my/invoices — Fatura geçmişi
export const getMyInvoices = async (req, res) => {
    try {
        const { companyId } = req.query;
        
        const company = await prisma.company.findFirst({
            where: { id: companyId, ownerId: req.user.id }
        });
        if (!company) return res.status(403).json({ error: 'Yetkisiz' });
        
        const billing = await prisma.companyBilling.findUnique({ where: { companyId } });
        if (!billing) return res.json({ invoices: [] });
        
        const invoices = await prisma.invoice.findMany({
            where: { companyBillingId: billing.id },
            orderBy: { createdAt: 'desc' },
            take: 24
        });
        
        res.json({ invoices });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// GET /api/billing/my/payments — Ödeme geçmişi
export const getMyPayments = async (req, res) => {
    try {
        const { companyId } = req.query;
        
        const company = await prisma.company.findFirst({
            where: { id: companyId, ownerId: req.user.id }
        });
        if (!company) return res.status(403).json({ error: 'Yetkisiz' });
        
        const billing = await prisma.companyBilling.findUnique({ where: { companyId } });
        if (!billing) return res.json({ payments: [] });
        
        const payments = await prisma.payment.findMany({
            where: { companyBillingId: billing.id },
            orderBy: { createdAt: 'desc' },
            take: 50
        });
        
        res.json({ payments });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
