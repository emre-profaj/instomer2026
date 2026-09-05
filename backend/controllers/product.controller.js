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
                include: {
                    category: true,
                    parent: true,
                    children: true,
                    productBranches: true
                },
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
                category: true,
                parent: true,
                children: true,
                productBranches: true,
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
            tax2Type, tax2Rate, isActive, aiContext, features,
            parentId, isGroup
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
                parentId: parentId || null,
                isGroup: isGroup || false,
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
            'tax1Type', 'tax2Type', 'isActive', 'aiContext', 'parentId'
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
        if (req.body.isGroup !== undefined) updateData.isGroup = req.body.isGroup;

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

        // Update product branches if provided
        if (req.body.productBranches && Array.isArray(req.body.productBranches)) {
            // First delete existing
            await prisma.productBranch.deleteMany({
                where: { productId }
            });
            
            // Then create new ones
            if (req.body.productBranches.length > 0) {
                await prisma.productBranch.createMany({
                    data: req.body.productBranches.map(pb => ({
                        productId,
                        branchId: pb.branchId,
                        price: pb.price !== undefined && pb.price !== null ? parseFloat(pb.price) : null,
                        isAvailable: pb.isAvailable !== undefined ? pb.isAvailable : true
                    }))
                });
            }
        }

        // Fetch updated product with relations
        const updatedProduct = await prisma.product.findFirst({
            where: { id: productId },
            include: { features: true, media: true, category: true, parent: true, children: true, productBranches: true }
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

        const groups = await prisma.product.findMany({
            where: {
                workspaceId,
                isGroup: true
            },
            include: {
                category: true,
                children: true
            },
            orderBy: { name: 'asc' }
        });

        const groupedByCategory = groups.reduce((acc, product) => {
            const catId = product.categoryId || 'uncategorized';
            if (!acc[catId]) {
                acc[catId] = {
                    categoryId: catId,
                    categoryName: product.category?.name || 'Kategorisiz',
                    products: []
                };
            }
            acc[catId].products.push(product);
            return acc;
        }, {});

        res.json({ success: true, groups: Object.values(groupedByCategory) });
    } catch (error) {
        console.error('getProductGroups error:', error);
        res.status(500).json({ success: false, error: 'Ürün grupları yüklenirken hata oluştu' });
    }
};

// ─── Şubeye özel ürün listesi ──────────────────────────────────
export const getProductsByBranch = async (req, res) => {
    try {
        const { workspaceId, branchId } = req.params;

        const products = await prisma.product.findMany({
            where: { workspaceId },
            include: {
                category: true,
                productBranches: {
                    where: { branchId }
                }
            }
        });

        const productsWithPricing = products.map(product => {
            const branchPricing = product.productBranches[0];
            return {
                ...product,
                branchPrice: branchPricing?.price ?? product.price,
                isAvailableInBranch: branchPricing?.isAvailable ?? true
            };
        });

        res.json({ success: true, data: productsWithPricing });
    } catch (error) {
        console.error('getProductsByBranch error:', error);
        res.status(500).json({ success: false, error: 'Şube ürünleri yüklenirken hata oluştu' });
    }
};
