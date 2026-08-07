import prisma from '../lib/prisma.js';

// ─── Tüm ürünleri listele ───────────────────────────────────────
export const getProducts = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { groupName, isActive, search, page = 1, limit = 50 } = req.query;

        const where = { workspaceId };

        if (groupName) where.groupName = groupName;
        if (isActive !== undefined) where.isActive = isActive === 'true';
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } }
            ];
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [products, total] = await Promise.all([
            prisma.product.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: parseInt(limit)
            }),
            prisma.product.count({ where })
        ]);

        res.json({
            success: true,
            products,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('getProducts error:', error);
        res.status(500).json({ success: false, error: 'Ürünler yüklenirken hata oluştu' });
    }
};

// ─── Tek ürün getir ─────────────────────────────────────────────
export const getProduct = async (req, res) => {
    try {
        const { workspaceId, productId } = req.params;

        const product = await prisma.product.findFirst({
            where: { id: productId, workspaceId },
            include: {
                features: true,
                media: true
            }
        });

        if (!product) {
            return res.status(404).json({ success: false, error: 'Ürün bulunamadı' });
        }

        res.json({ success: true, data: product });
    } catch (error) {
        console.error('getProduct error:', error);
        res.status(500).json({ success: false, error: 'Ürün yüklenirken hata oluştu' });
    }
};

// ─── Yeni ürün oluştur ──────────────────────────────────────────
export const createProduct = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const {
            name, description, groupName, categoryId, unit,
            price, priceUSD, priceEUR, priceGBP,
            discountedPrice, tax1Type, tax1Rate,
            tax2Type, tax2Rate, isActive, aiContext, features
        } = req.body;

        if (!name) {
            return res.status(400).json({ success: false, error: 'Ürün adı zorunludur' });
        }

        const product = await prisma.product.create({
            data: {
                workspaceId,
                name,
                description: description || null,
                groupName: groupName || null,
                categoryId: categoryId || null,
                unit: unit || null,
                price: price ? parseFloat(price) : 0,
                priceUSD: priceUSD ? parseFloat(priceUSD) : null,
                priceEUR: priceEUR ? parseFloat(priceEUR) : null,
                priceGBP: priceGBP ? parseFloat(priceGBP) : null,
                discountedPrice: discountedPrice ? parseFloat(discountedPrice) : null,
                tax1Type: tax1Type || null,
                tax1Rate: tax1Rate ? parseFloat(tax1Rate) : 0,
                tax2Type: tax2Type || null,
                tax2Rate: tax2Rate ? parseFloat(tax2Rate) : 0,
                isActive: isActive !== undefined ? isActive : true,
                aiContext: aiContext || null,
                ...(features && Array.isArray(features) && features.length > 0 && {
                    features: {
                        create: features.map(f => ({
                            featureKey: f.featureKey,
                            featureValue: f.featureValue
                        }))
                    }
                })
            },
            include: {
                features: true
            }
        });

        res.status(201).json({ success: true, data: product });
    } catch (error) {
        console.error('createProduct error:', error);
        res.status(500).json({ success: false, error: 'Ürün oluşturulurken hata oluştu' });
    }
};

// ─── Ürün güncelle ──────────────────────────────────────────────
export const updateProduct = async (req, res) => {
    try {
        const { workspaceId, productId } = req.params;

        // Ürünün varlığını kontrol et
        const existing = await prisma.product.findFirst({
            where: { id: productId, workspaceId }
        });

        if (!existing) {
            return res.status(404).json({ success: false, error: 'Ürün bulunamadı' });
        }

        const updateData = {};
        const fields = [
            'name', 'description', 'groupName', 'categoryId', 'unit',
            'tax1Type', 'tax2Type', 'isActive', 'aiContext'
        ];
        const floatFields = [
            'price', 'priceUSD', 'priceEUR', 'priceGBP',
            'discountedPrice', 'tax1Rate', 'tax2Rate'
        ];

        fields.forEach(field => {
            if (req.body[field] !== undefined) updateData[field] = req.body[field];
        });
        floatFields.forEach(field => {
            if (req.body[field] !== undefined) {
                updateData[field] = req.body[field] !== null ? parseFloat(req.body[field]) : null;
            }
        });

        const product = await prisma.product.update({
            where: { id: productId },
            data: updateData
        });

        // Update features if provided
        if (req.body.features && Array.isArray(req.body.features)) {
            // First delete existing
            await prisma.productFeature.deleteMany({
                where: { productId }
            });
            
            // Then create new ones
            if (req.body.features.length > 0) {
                await prisma.productFeature.createMany({
                    data: req.body.features.map(f => ({
                        productId,
                        featureKey: f.featureKey,
                        featureValue: f.featureValue
                    }))
                });
            }
        }

        // Fetch updated product with relations
        const updatedProduct = await prisma.product.findFirst({
            where: { id: productId },
            include: { features: true, media: true }
        });

        res.json({ success: true, data: updatedProduct });
    } catch (error) {
        console.error('updateProduct error:', error);
        res.status(500).json({ success: false, error: 'Ürün güncellenirken hata oluştu' });
    }
};

// ─── Ürün sil ───────────────────────────────────────────────────
export const deleteProduct = async (req, res) => {
    try {
        const { workspaceId, productId } = req.params;

        const existing = await prisma.product.findFirst({
            where: { id: productId, workspaceId }
        });

        if (!existing) {
            return res.status(404).json({ success: false, error: 'Ürün bulunamadı' });
        }

        await prisma.product.delete({ where: { id: productId } });

        res.json({ success: true, message: 'Ürün silindi' });
    } catch (error) {
        console.error('deleteProduct error:', error);
        res.status(500).json({ success: false, error: 'Ürün silinirken hata oluştu' });
    }
};

// ─── Ürün gruplarını listele ────────────────────────────────────
export const getProductGroups = async (req, res) => {
    try {
        const { workspaceId } = req.params;

        const groups = await prisma.product.groupBy({
            by: ['groupName'],
            where: {
                workspaceId,
                groupName: { not: null }
            },
            _count: { id: true },
            orderBy: { groupName: 'asc' }
        });

        const result = groups.map(g => ({
            groupName: g.groupName,
            count: g._count.id
        }));

        res.json({ success: true, groups: result });
    } catch (error) {
        console.error('getProductGroups error:', error);
        res.status(500).json({ success: false, error: 'Ürün grupları yüklenirken hata oluştu' });
    }
};
