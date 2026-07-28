/**
 * Migration: Product → TopicCategory Eşleştirme
 * 
 * Bu script:
 * 1. Mevcut Product.groupName değerlerini TopicCategory.name/keywords ile eşleştirir
 * 2. Eşleşen ürünlere categoryId atar
 * 3. Mevcut Deal.products JSON'larını productId, groupName, categoryId ile zenginleştirir
 * 
 * Kullanım: node scripts/migrate-product-categories.js
 */

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function migrateProductCategories() {
    console.log('🔄 Product → Category eşleştirme başlıyor...\n');

    // Tüm workspace'leri al
    const workspaces = await prisma.workspace.findMany({ select: { id: true, name: true } });

    for (const ws of workspaces) {
        console.log(`\n📦 Workspace: ${ws.name} (${ws.id})`);

        // Bu workspace'in kategorilerini al
        const categories = await prisma.topicCategory.findMany({
            where: { workspaceId: ws.id },
            select: { id: true, name: true, keywords: true }
        });

        if (categories.length === 0) {
            console.log('  ⚠️ Kategori yok, atlıyor...');
            continue;
        }

        // Kategori eşleştirme fonksiyonu
        const categoriesWithKeywords = categories.map(tc => {
            let kw = [];
            try { kw = tc.keywords ? JSON.parse(tc.keywords) : []; } catch { kw = []; }
            return { ...tc, kwList: kw.map(k => k.toLocaleLowerCase('tr-TR').trim()) };
        });

        const matchCategory = (text) => {
            if (!text) return null;
            const lower = text.toLocaleLowerCase('tr-TR').trim();
            let match = categoriesWithKeywords.find(tc => tc.name.toLocaleLowerCase('tr-TR') === lower);
            if (match) return match;
            match = categoriesWithKeywords.find(tc => lower.includes(tc.name.toLocaleLowerCase('tr-TR')));
            if (match) return match;
            match = categoriesWithKeywords.find(tc => tc.name.toLocaleLowerCase('tr-TR').includes(lower));
            if (match) return match;
            match = categoriesWithKeywords.find(tc =>
                tc.kwList.some(kw => kw && (lower.includes(kw) || kw.includes(lower)))
            );
            return match || null;
        };

        // === 1. Product.groupName → categoryId eşleştirme ===
        const products = await prisma.product.findMany({
            where: { workspaceId: ws.id, categoryId: null },
            select: { id: true, name: true, groupName: true }
        });

        let productMatched = 0;
        for (const p of products) {
            const cat = matchCategory(p.groupName) || matchCategory(p.name);
            if (cat) {
                await prisma.product.update({
                    where: { id: p.id },
                    data: { categoryId: cat.id }
                });
                productMatched++;
                console.log(`  ✅ ${p.name} → ${cat.name}`);
            } else {
                console.log(`  ❓ ${p.name} (grup: ${p.groupName || '-'}) → eşleşme bulunamadı`);
            }
        }
        console.log(`  📊 ${productMatched}/${products.length} ürün kategorize edildi`);

        // === 2. Deal.products JSON zenginleştirme ===
        const allProducts = await prisma.product.findMany({
            where: { workspaceId: ws.id },
            select: { id: true, name: true, groupName: true, categoryId: true }
        });
        const productByName = {};
        for (const p of allProducts) {
            productByName[p.name.toLocaleLowerCase('tr-TR').trim()] = p;
        }

        const deals = await prisma.deal.findMany({
            where: { workspaceId: ws.id },
            select: { id: true, products: true }
        });

        let dealUpdated = 0;
        for (const deal of deals) {
            try {
                const items = typeof deal.products === 'string' ? JSON.parse(deal.products || '[]') : (deal.products || []);
                if (!Array.isArray(items) || items.length === 0) continue;

                let changed = false;
                const enriched = items.map(item => {
                    if (item.productId && item.groupName && item.categoryId) return item;
                    const found = item.name ? productByName[item.name.toLocaleLowerCase('tr-TR').trim()] : null;
                    if (found) {
                        changed = true;
                        return {
                            ...item,
                            productId: item.productId || found.id,
                            groupName: item.groupName || found.groupName || null,
                            categoryId: item.categoryId || found.categoryId || null
                        };
                    }
                    return item;
                });

                if (changed) {
                    await prisma.deal.update({
                        where: { id: deal.id },
                        data: { products: JSON.stringify(enriched) }
                    });
                    dealUpdated++;
                }
            } catch { /* JSON parse error, skip */ }
        }
        console.log(`  📊 ${dealUpdated}/${deals.length} deal ürün bilgisi zenginleştirildi`);
    }

    console.log('\n✅ Migration tamamlandı!');
}

migrateProductCategories()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
