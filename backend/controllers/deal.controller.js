import prisma from '../lib/prisma.js';
import { isAgentRole, buildAgentDealFilter } from '../utils/rbac.helper.js';

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

// Helper: OVERDUE durumunu otomatik hesapla
const computeEffectiveStatus = (deal) => {
    if (deal.status === 'WON' || deal.status === 'LOST') return deal.status;
    if (deal.stage === 'INVOICE' && deal.dueDate && new Date(deal.dueDate) < new Date()) {
        return 'OVERDUE';
    }
    return deal.status;
};

// Tüm deal'ları listele (stage filtresi ile)
export const getDeals = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { stage, status, contactId, assignedToId, dateFrom, dateTo, page = 1, limit = 50 } = req.query;

        const where = { workspaceId };
        if (stage) where.stage = stage;
        if (status && status !== 'OVERDUE') where.status = status;
        if (contactId) where.contactId = contactId;
        if (assignedToId) where.assignedToId = assignedToId;
        if (dateFrom || dateTo) {
            where.createdAt = {};
            if (dateFrom) where.createdAt.gte = parseDateStartTR(dateFrom);
            if (dateTo) where.createdAt.lte = parseDateEndTR(dateTo);
        }

        // AGENT RBAC: Kendi + havuz deal'lar
        if (isAgentRole(req)) {
            // Agent'ın görebileceği deal'lar (kendi + havuz)
            const agentFilter = buildAgentDealFilter(req.user.id);
            // Eğer query'den assignedToId filtresi geldiyse, RBAC ile birleştir
            if (where.assignedToId) {
                // Agent yalnızca kendi deal'larını veya havuzu görebilir
                // Eğer başka birine ait olanları istiyorsa boş dönsün
                const requestedId = where.assignedToId;
                delete where.assignedToId;
                where.AND = [
                    agentFilter,
                    { assignedToId: requestedId }
                ];
            } else {
                Object.assign(where, agentFilter);
            }
        }

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

        // Products JSON'ı parse et, OVERDUE hesapla
        let parsedDeals = deals.map(deal => ({
            ...deal,
            products: JSON.parse(deal.products || '[]'),
            effectiveStatus: computeEffectiveStatus(deal)
        }));

        // OVERDUE filtresi uygulanmışsa frontend'de filtrele
        if (status === 'OVERDUE') {
            parsedDeals = parsedDeals.filter(d => d.effectiveStatus === 'OVERDUE');
        }

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
                },
                conversation: {
                    select: { id: true, channel: true, status: true, lastMessageAt: true }
                }
            }
        });

        if (!deal) {
            return res.status(404).json({ error: 'Deal not found' });
        }

        res.json({
            deal: {
                ...deal,
                products: JSON.parse(deal.products || '[]'),
                effectiveStatus: computeEffectiveStatus(deal)
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
        let {
            contactId,
            title,
            description,
            amount,
            currency = 'TRY',
            stage = 'QUOTE',
            products = [],
            assignedToId,
            notes,
            // Yeni ödeme alanları
            dueDate,
            vatRate = 0,
            paidAmount = 0,
            paymentDate,
            // Yeni kaynak alanları
            conversationId,
            channel,
            sourceNote,
            // Protokol No
            protocolNo
        } = req.body;

        if (!contactId || !title) {
            return res.status(400).json({ error: 'Contact and title are required' });
        }

        // conversationId varsa ama channel yoksa, konuşmadan kanalı al
        if (conversationId && !channel) {
            const conv = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { channel: true } });
            if (conv) channel = conv.channel;
        }

        // Ürün bilgisini zenginleştir: productId, groupName, categoryId ekle
        let enrichedProducts = products;
        if (Array.isArray(products) && products.length > 0) {
            const productNames = products.map(p => p.name).filter(Boolean);
            if (productNames.length > 0) {
                const dbProducts = await prisma.product.findMany({
                    where: { workspaceId, name: { in: productNames } },
                    select: { id: true, name: true, groupName: true, categoryId: true }
                });
                const productMap = {};
                for (const p of dbProducts) { productMap[p.name.toLocaleLowerCase('tr-TR').trim()] = p; }

                enrichedProducts = products.map(item => {
                    const found = item.name ? productMap[item.name.toLocaleLowerCase('tr-TR').trim()] : null;
                    return {
                        ...item,
                        productId: item.productId || found?.id || null,
                        groupName: item.groupName || found?.groupName || null,
                        categoryId: item.categoryId || found?.categoryId || null
                    };
                });
            }
        }

        // Ürünlerin KDV dahil toplamını hesapla
        const baseAmount = parseFloat(amount) || 0;
        const vatAmount = baseAmount * (parseFloat(vatRate) / 100);
        const totalAmount = baseAmount + vatAmount;

        // Stage'e göre numara üret
        const dealData = {
            workspaceId,
            contactId,
            title,
            description,
            amount: totalAmount,
            currency,
            stage,
            products: JSON.stringify(enrichedProducts),
            assignedToId: assignedToId || null,
            notes,
            vatRate: parseFloat(vatRate) || 0,
            paidAmount: parseFloat(paidAmount) || 0,
            dueDate: dueDate ? new Date(dueDate) : null,
            paymentDate: paymentDate ? new Date(paymentDate) : null,
            conversationId: conversationId || null,
            channel: channel || null,
            sourceNote: sourceNote || null,
            protocolNo: protocolNo || null
        };

        // assignedToId varsa atayan bilgisini ekle
        if (assignedToId) {
            dealData.assignedById = req.user?.id;
            dealData.assignedByType = 'USER';
        }

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

        try {
            const { syncDealToCase } = await import('../services/categoryMatcher.service.js');
            syncDealToCase(deal.id, workspaceId).catch(err => console.error('Kategori senkronizasyon hatası:', err.message));
        } catch(e) { 
            console.error('Kategori import hatası:', e.message); 
        }

        // Madde 4.2: Sipariş → Case kapatma önerisi
        if (['ORDER', 'INVOICE'].includes(stage)) {
            try {
                const { suggestCaseCloseOnDeal } = await import('../services/noteAnalyzer.service.js');
                suggestCaseCloseOnDeal(workspaceId, deal.contactId, deal.id).catch(err =>
                    console.error('⚠️ [Deal] Case close suggestion error:', err.message)
                );
            } catch (e) { /* opsiyonel */ }
        }

        res.status(201).json({
            deal: {
                ...deal,
                products: JSON.parse(deal.products),
                effectiveStatus: computeEffectiveStatus(deal)
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
            invoiceNumber,
            // Yeni ödeme alanları
            dueDate,
            vatRate,
            paidAmount,
            paymentDate,
            // Kaynak notu
            sourceNote,
            // Protokol No
            protocolNo
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
        if (products !== undefined) {
            // Ürün bilgisini zenginleştir: productId, groupName, categoryId ekle
            let enrichedProducts = products;
            if (Array.isArray(products) && products.length > 0) {
                const productNames = products.map(p => p.name).filter(Boolean);
                if (productNames.length > 0) {
                    const dbProducts = await prisma.product.findMany({
                        where: { workspaceId, name: { in: productNames } },
                        select: { id: true, name: true, groupName: true, categoryId: true }
                    });
                    const productMap = {};
                    for (const p of dbProducts) { productMap[p.name.toLocaleLowerCase('tr-TR').trim()] = p; }

                    enrichedProducts = products.map(item => {
                        const found = item.name ? productMap[item.name.toLocaleLowerCase('tr-TR').trim()] : null;
                        return {
                            ...item,
                            productId: item.productId || found?.id || null,
                            groupName: item.groupName || found?.groupName || null,
                            categoryId: item.categoryId || found?.categoryId || null
                        };
                    });
                }
            }
            updateData.products = JSON.stringify(enrichedProducts);
        }
        if (assignedToId !== undefined) {
            updateData.assignedToId = assignedToId || null;
            // Atayan değiştiyse atayan bilgisini güncelle
            if (assignedToId !== existing.assignedToId) {
                updateData.assignedById = req.user?.id;
                updateData.assignedByType = 'USER';
            }
        }
        if (notes !== undefined) updateData.notes = notes;
        if (sourceNote !== undefined) updateData.sourceNote = sourceNote;
        if (protocolNo !== undefined) updateData.protocolNo = protocolNo || null;
        if (quoteNumber !== undefined) updateData.quoteNumber = quoteNumber;
        if (orderNumber !== undefined) updateData.orderNumber = orderNumber;
        if (invoiceNumber !== undefined) updateData.invoiceNumber = invoiceNumber;
        // Ödeme alanları
        if (vatRate !== undefined) updateData.vatRate = parseFloat(vatRate) || 0;
        if (paidAmount !== undefined) updateData.paidAmount = parseFloat(paidAmount) || 0;
        if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null;
        if (paymentDate !== undefined) updateData.paymentDate = paymentDate ? new Date(paymentDate) : null;

        // Status değişikliği
        if (status && status !== existing.status) {
            updateData.status = status;
            if (status === 'WON') {
                updateData.wonAt = new Date();
                updateData.lostAt = null;
                updateData.lostReason = null;
                // Ödeme tarihi otomatik set et
                if (!updateData.paymentDate && !existing.paymentDate) {
                    updateData.paymentDate = new Date();
                }
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

        try {
            const { syncDealToCase } = await import('../services/categoryMatcher.service.js');
            syncDealToCase(deal.id, workspaceId).catch(err => console.error('Kategori senkronizasyon hatası:', err.message));
        } catch(e) { 
            console.error('Kategori import hatası:', e.message); 
        }

        // Madde 4.2: Sipariş → Case kapatma önerisi
        if (['ORDER', 'INVOICE'].includes(deal.stage)) {
            try {
                const { suggestCaseCloseOnDeal } = await import('../services/noteAnalyzer.service.js');
                suggestCaseCloseOnDeal(workspaceId, deal.contactId, deal.id).catch(err =>
                    console.error('⚠️ [Deal] Case close suggestion error:', err.message)
                );
            } catch (e) { /* opsiyonel */ }
        }

        res.json({
            deal: {
                ...deal,
                products: JSON.parse(deal.products),
                effectiveStatus: computeEffectiveStatus(deal)
            }
        });
    } catch (error) {
        console.error('Update Deal Error:', error);
        res.status(500).json({ error: 'Failed to update deal' });
    }
};

// Ödeme kaydet (kısmi veya tam ödeme)
export const recordPayment = async (req, res) => {
    try {
        const { workspaceId, dealId } = req.params;
        const { paidAmount, paymentDate, notes } = req.body;

        const existing = await prisma.deal.findFirst({
            where: { id: dealId, workspaceId }
        });

        if (!existing) {
            return res.status(404).json({ error: 'Deal not found' });
        }

        const newPaidAmount = parseFloat(paidAmount) || 0;
        const totalAmount = existing.amount;

        // Tam ödendi mi?
        const isFullyPaid = newPaidAmount >= totalAmount;

        const updateData = {
            paidAmount: newPaidAmount,
            paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
        };

        if (isFullyPaid) {
            updateData.status = 'WON'; // WON = Ödendi
            updateData.wonAt = new Date();
            if (notes) updateData.notes = existing.notes ? `${existing.notes}\n${notes}` : notes;
        } else if (notes) {
            updateData.notes = existing.notes ? `${existing.notes}\n${notes}` : notes;
        }

        const deal = await prisma.deal.update({
            where: { id: dealId },
            data: updateData,
            include: {
                contact: {
                    select: { id: true, name: true, fullName: true, email: true, phone: true }
                }
            }
        });

        console.log(`💰 [Deal] Payment recorded: ${deal.invoiceNumber} — ${newPaidAmount}/${totalAmount} ${deal.currency}`);

        res.json({
            deal: {
                ...deal,
                products: JSON.parse(deal.products),
                effectiveStatus: computeEffectiveStatus(deal)
            },
            isFullyPaid,
            remainingAmount: Math.max(0, totalAmount - newPaidAmount)
        });
    } catch (error) {
        console.error('Record Payment Error:', error);
        res.status(500).json({ error: 'Failed to record payment' });
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

        // Madde 4.2: Sipariş → Case kapatma önerisi
        if (['ORDER', 'INVOICE'].includes(deal.stage)) {
            try {
                const { suggestCaseCloseOnDeal } = await import('../services/noteAnalyzer.service.js');
                suggestCaseCloseOnDeal(workspaceId, deal.contactId, deal.id).catch(err =>
                    console.error('⚠️ [Deal] Case close suggestion error:', err.message)
                );
            } catch (e) { /* opsiyonel */ }
        }

        res.json({
            deal: {
                ...deal,
                products: JSON.parse(deal.products),
                effectiveStatus: computeEffectiveStatus(deal)
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

        // AGENT RBAC: baseWhere ile tüm sorgulara agent filtresi uygula
        let baseWhere = { workspaceId };
        if (isAgentRole(req)) {
            const agentFilter = buildAgentDealFilter(req.user.id);
            Object.assign(baseWhere, agentFilter);
        }

        // Stage bazlı istatistikler
        const stageStats = await prisma.deal.groupBy({
            by: ['stage'],
            where: baseWhere,
            _count: { id: true },
            _sum: { amount: true }
        });

        // Status bazlı istatistikler
        const statusStats = await prisma.deal.groupBy({
            by: ['status'],
            where: baseWhere,
            _count: { id: true },
            _sum: { amount: true }
        });

        // Dönüşüm oranları
        const quotes = await prisma.deal.count({ where: baseWhere });
        const orders = await prisma.deal.count({ where: { ...baseWhere, orderCreatedAt: { not: null } } });
        const invoices = await prisma.deal.count({ where: { ...baseWhere, invoiceCreatedAt: { not: null } } });

        // Gecikmiş faturalar (vadesi geçmiş + ödenmemiş)
        const overdueInvoices = await prisma.deal.findMany({
            where: {
                ...baseWhere,
                stage: 'INVOICE',
                status: 'OPEN',
                dueDate: { lt: new Date() }
            },
            select: { id: true, amount: true, paidAmount: true }
        });
        const overdueCount = overdueInvoices.length;
        const overdueAmount = overdueInvoices.reduce((sum, d) => sum + Math.max(0, d.amount - (d.paidAmount || 0)), 0);

        // Ödenen toplam (WON faturalar)
        const paidStats = await prisma.deal.aggregate({
            where: { ...baseWhere, stage: 'INVOICE', status: 'WON' },
            _sum: { paidAmount: true, amount: true }
        });

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
            totals: { quotes, orders, invoices },
            overdueCount,
            overdueAmount,
            paidTotal: paidStats._sum.paidAmount || paidStats._sum.amount || 0
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
                products: JSON.parse(d.products || '[]'),
                effectiveStatus: computeEffectiveStatus(d)
            }))
        });
    } catch (error) {
        console.error('Get Contact Deals Error:', error);
        res.status(500).json({ error: 'Failed to get contact deals' });
    }
};
