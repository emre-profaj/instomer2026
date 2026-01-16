import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Helper: Otomatik numara üret
const generateNumber = async (workspaceId, prefix) => {
    const year = new Date().getFullYear();
    const prefixes = { QUOTE: 'TEK', ORDER: 'SIP', INVOICE: 'FAT' };
    const pre = prefixes[prefix] || prefix;

    // Son numarayı bul
    const lastDeal = await prisma.deal.findFirst({
        where: {
            workspaceId,
            [`${prefix.toLowerCase()}Number`]: { startsWith: `${pre}-${year}` }
        },
        orderBy: { createdAt: 'desc' }
    });

    let nextNum = 1;
    if (lastDeal) {
        const lastNumber = lastDeal[`${prefix.toLowerCase()}Number`];
        const parts = lastNumber?.split('-');
        if (parts && parts[2]) {
            nextNum = parseInt(parts[2], 10) + 1;
        }
    }

    return `${pre}-${year}-${String(nextNum).padStart(4, '0')}`;
};

// Tüm deal'ları listele (stage filtresi ile)
export const getDeals = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { stage, status, contactId, page = 1, limit = 50 } = req.query;

        const where = { workspaceId };
        if (stage) where.stage = stage;
        if (status) where.status = status;
        if (contactId) where.contactId = contactId;

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [deals, total] = await Promise.all([
            prisma.deal.findMany({
                where,
                include: {
                    contact: {
                        select: { id: true, name: true, fullName: true, email: true, phone: true, avatar: true }
                    },
                    assignedTo: {
                        select: { id: true, name: true, avatar: true }
                    }
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: parseInt(limit)
            }),
            prisma.deal.count({ where })
        ]);

        // Products JSON'ı parse et
        const parsedDeals = deals.map(deal => ({
            ...deal,
            products: JSON.parse(deal.products || '[]')
        }));

        res.json({ deals: parsedDeals, total, page: parseInt(page), limit: parseInt(limit) });
    } catch (error) {
        console.error('Get Deals Error:', error);
        res.status(500).json({ error: 'Failed to get deals' });
    }
};

// Tekil deal detayı
export const getDeal = async (req, res) => {
    try {
        const { workspaceId, dealId } = req.params;

        const deal = await prisma.deal.findFirst({
            where: { id: dealId, workspaceId },
            include: {
                contact: true,
                assignedTo: {
                    select: { id: true, name: true, avatar: true }
                }
            }
        });

        if (!deal) {
            return res.status(404).json({ error: 'Deal not found' });
        }

        res.json({
            deal: {
                ...deal,
                products: JSON.parse(deal.products || '[]')
            }
        });
    } catch (error) {
        console.error('Get Deal Error:', error);
        res.status(500).json({ error: 'Failed to get deal' });
    }
};

// Yeni deal oluştur
export const createDeal = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const {
            contactId,
            title,
            description,
            amount,
            currency = 'TRY',
            stage = 'QUOTE',
            products = [],
            assignedToId,
            notes
        } = req.body;

        if (!contactId || !title) {
            return res.status(400).json({ error: 'Contact and title are required' });
        }

        // Stage'e göre numara üret
        const dealData = {
            workspaceId,
            contactId,
            title,
            description,
            amount: parseFloat(amount) || 0,
            currency,
            stage,
            products: JSON.stringify(products),
            assignedToId: assignedToId || null,
            notes
        };

        // Stage'e göre numara ve tarih ata
        if (stage === 'QUOTE') {
            dealData.quoteNumber = await generateNumber(workspaceId, 'QUOTE');
            dealData.quoteCreatedAt = new Date();
        } else if (stage === 'ORDER') {
            dealData.orderNumber = await generateNumber(workspaceId, 'ORDER');
            dealData.orderCreatedAt = new Date();
        } else if (stage === 'INVOICE') {
            dealData.invoiceNumber = await generateNumber(workspaceId, 'INVOICE');
            dealData.invoiceCreatedAt = new Date();
        }

        const deal = await prisma.deal.create({
            data: dealData,
            include: {
                contact: {
                    select: { id: true, name: true, fullName: true, email: true, phone: true }
                },
                assignedTo: {
                    select: { id: true, name: true }
                }
            }
        });

        console.log(`✅ [Deal] Created: ${deal.quoteNumber || deal.orderNumber || deal.invoiceNumber} (${stage}) for contact ${contactId}`);

        res.status(201).json({
            deal: {
                ...deal,
                products: JSON.parse(deal.products)
            }
        });
    } catch (error) {
        console.error('Create Deal Error:', error);
        res.status(500).json({ error: 'Failed to create deal' });
    }
};

// Deal güncelle
export const updateDeal = async (req, res) => {
    try {
        const { workspaceId, dealId } = req.params;
        const {
            title,
            description,
            amount,
            currency,
            products,
            assignedToId,
            notes,
            status,
            lostReason,
            quoteNumber,
            orderNumber,
            invoiceNumber
        } = req.body;

        // Mevcut deal'ı kontrol et
        const existing = await prisma.deal.findFirst({
            where: { id: dealId, workspaceId }
        });

        if (!existing) {
            return res.status(404).json({ error: 'Deal not found' });
        }

        const updateData = {};
        if (title !== undefined) updateData.title = title;
        if (description !== undefined) updateData.description = description;
        if (amount !== undefined) updateData.amount = parseFloat(amount);
        if (currency !== undefined) updateData.currency = currency;
        if (products !== undefined) updateData.products = JSON.stringify(products);
        if (assignedToId !== undefined) updateData.assignedToId = assignedToId || null;
        if (notes !== undefined) updateData.notes = notes;
        if (quoteNumber !== undefined) updateData.quoteNumber = quoteNumber;
        if (orderNumber !== undefined) updateData.orderNumber = orderNumber;
        if (invoiceNumber !== undefined) updateData.invoiceNumber = invoiceNumber;

        // Status değişikliği
        if (status && status !== existing.status) {
            updateData.status = status;
            if (status === 'WON') {
                updateData.wonAt = new Date();
                updateData.lostAt = null;
                updateData.lostReason = null;
            } else if (status === 'LOST') {
                updateData.lostAt = new Date();
                updateData.lostReason = lostReason || null;
                updateData.wonAt = null;
            } else {
                updateData.wonAt = null;
                updateData.lostAt = null;
                updateData.lostReason = null;
            }
        }

        const deal = await prisma.deal.update({
            where: { id: dealId },
            data: updateData,
            include: {
                contact: {
                    select: { id: true, name: true, fullName: true, email: true, phone: true }
                },
                assignedTo: {
                    select: { id: true, name: true }
                }
            }
        });

        res.json({
            deal: {
                ...deal,
                products: JSON.parse(deal.products)
            }
        });
    } catch (error) {
        console.error('Update Deal Error:', error);
        res.status(500).json({ error: 'Failed to update deal' });
    }
};

// Deal sil
export const deleteDeal = async (req, res) => {
    try {
        const { workspaceId, dealId } = req.params;

        const existing = await prisma.deal.findFirst({
            where: { id: dealId, workspaceId }
        });

        if (!existing) {
            return res.status(404).json({ error: 'Deal not found' });
        }

        await prisma.deal.delete({ where: { id: dealId } });

        console.log(`🗑️ [Deal] Deleted: ${dealId}`);
        res.json({ success: true });
    } catch (error) {
        console.error('Delete Deal Error:', error);
        res.status(500).json({ error: 'Failed to delete deal' });
    }
};

// Stage dönüşümü (QUOTE → ORDER → INVOICE)
export const convertDeal = async (req, res) => {
    try {
        const { workspaceId, dealId } = req.params;
        const { targetStage } = req.body;

        const validTransitions = {
            'QUOTE': ['ORDER'],
            'ORDER': ['INVOICE'],
            'INVOICE': []
        };

        const existing = await prisma.deal.findFirst({
            where: { id: dealId, workspaceId }
        });

        if (!existing) {
            return res.status(404).json({ error: 'Deal not found' });
        }

        if (!validTransitions[existing.stage]?.includes(targetStage)) {
            return res.status(400).json({
                error: `Cannot convert from ${existing.stage} to ${targetStage}`
            });
        }

        const updateData = { stage: targetStage };

        // Yeni numara üret ve tarih ayarla
        if (targetStage === 'ORDER') {
            updateData.orderNumber = await generateNumber(workspaceId, 'ORDER');
            updateData.orderCreatedAt = new Date();
        } else if (targetStage === 'INVOICE') {
            updateData.invoiceNumber = await generateNumber(workspaceId, 'INVOICE');
            updateData.invoiceCreatedAt = new Date();
        }

        const deal = await prisma.deal.update({
            where: { id: dealId },
            data: updateData,
            include: {
                contact: {
                    select: { id: true, name: true, fullName: true }
                }
            }
        });

        console.log(`🔄 [Deal] Converted ${dealId}: ${existing.stage} → ${targetStage}`);

        res.json({
            deal: {
                ...deal,
                products: JSON.parse(deal.products)
            }
        });
    } catch (error) {
        console.error('Convert Deal Error:', error);
        res.status(500).json({ error: 'Failed to convert deal' });
    }
};

// İstatistikler
export const getDealStats = async (req, res) => {
    try {
        const { workspaceId } = req.params;

        // Stage bazlı istatistikler
        const stageStats = await prisma.deal.groupBy({
            by: ['stage'],
            where: { workspaceId },
            _count: { id: true },
            _sum: { amount: true }
        });

        // Status bazlı istatistikler
        const statusStats = await prisma.deal.groupBy({
            by: ['status'],
            where: { workspaceId },
            _count: { id: true },
            _sum: { amount: true }
        });

        // Dönüşüm oranları
        const quotes = await prisma.deal.count({ where: { workspaceId } });
        const orders = await prisma.deal.count({ where: { workspaceId, orderCreatedAt: { not: null } } });
        const invoices = await prisma.deal.count({ where: { workspaceId, invoiceCreatedAt: { not: null } } });

        const conversionRates = {
            quoteToOrder: quotes > 0 ? ((orders / quotes) * 100).toFixed(1) : 0,
            orderToInvoice: orders > 0 ? ((invoices / orders) * 100).toFixed(1) : 0
        };

        res.json({
            stageStats: stageStats.map(s => ({
                stage: s.stage,
                count: s._count.id,
                totalAmount: s._sum.amount || 0
            })),
            statusStats: statusStats.map(s => ({
                status: s.status,
                count: s._count.id,
                totalAmount: s._sum.amount || 0
            })),
            conversionRates,
            totals: { quotes, orders, invoices }
        });
    } catch (error) {
        console.error('Get Deal Stats Error:', error);
        res.status(500).json({ error: 'Failed to get deal stats' });
    }
};

// Kişiye ait deal'lar
export const getContactDeals = async (req, res) => {
    try {
        const { workspaceId, contactId } = req.params;

        const deals = await prisma.deal.findMany({
            where: { workspaceId, contactId },
            orderBy: { createdAt: 'desc' },
            take: 10
        });

        res.json({
            deals: deals.map(d => ({
                ...d,
                products: JSON.parse(d.products || '[]')
            }))
        });
    } catch (error) {
        console.error('Get Contact Deals Error:', error);
        res.status(500).json({ error: 'Failed to get contact deals' });
    }
};
