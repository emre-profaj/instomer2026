import prisma from '../lib/prisma.js';

/**
 * 1. Match category from products
 * Looks up Product.groupName for the given products and finds matching TopicCategory
 */
export const matchCategoryFromProducts = async (workspaceId, productsText) => {
    try {
        let products = [];
        if (typeof productsText === 'string') {
            products = JSON.parse(productsText || '[]');
        } else if (Array.isArray(productsText)) {
            products = productsText;
        }

        if (!products || products.length === 0) return null;

        // Take the first product to determine category, or try them until a match is found
        for (const item of products) {
            if (!item.name) continue;

            const product = await prisma.product.findFirst({
                where: { 
                    workspaceId,
                    name: item.name
                }
            });

            if (product && product.groupName) {
                const category = await prisma.topicCategory.findFirst({
                    where: {
                        workspaceId,
                        name: product.groupName
                    }
                });

                if (category) {
                    return category.id;
                }
            }
        }

        return null;
    } catch (error) {
        console.error('Kategori eşleştirme hatası (matchCategoryFromProducts):', error.message);
        return null;
    }
};

/**
 * 2. Assign category to case
 */
export const assignCategoryToCase = async (caseId, categoryId) => {
    try {
        if (!caseId || !categoryId) return null;

        return await prisma.case.update({
            where: { id: caseId },
            data: { categoryId }
        });
    } catch (error) {
        console.error('Case kategori atama hatası (assignCategoryToCase):', error.message);
        return null;
    }
};

/**
 * 3. Sync deal to case
 * Takes a deal's products and assigns them to the contact's active case
 */
export const syncDealToCase = async (dealId, workspaceId) => {
    try {
        const deal = await prisma.deal.findUnique({
            where: { id: dealId }
        });

        if (!deal || !deal.contactId || deal.workspaceId !== workspaceId) return null;

        // Aktif Case'i bul
        const activeCase = await prisma.case.findFirst({
            where: {
                workspaceId,
                contactId: deal.contactId,
                status: 'ACTIVE'
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        if (!activeCase) {
            console.log('Aktif case bulunamadı, ürün senkronizasyonu atlandı.');
            return null;
        }

        // Kategori ID'yi ürünlerden bul
        const categoryId = await matchCategoryFromProducts(workspaceId, deal.products);

        // Case update
        const updateData = {};
        if (deal.products) {
            updateData.products = deal.products;
        }
        if (categoryId) {
            updateData.categoryId = categoryId;
        }

        if (Object.keys(updateData).length > 0) {
            const updatedCase = await prisma.case.update({
                where: { id: activeCase.id },
                data: updateData
            });
            console.log(`Case ${activeCase.id} başarıyla Deal ürünleri/kategorisi ile güncellendi.`);
            return updatedCase;
        }

        return activeCase;
    } catch (error) {
        console.error('Deal to Case senkronizasyon hatası (syncDealToCase):', error.message);
        return null;
    }
};
