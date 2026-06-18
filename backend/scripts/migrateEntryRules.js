/**
 * Migration Script: Mevcut Satış Akışı Funnel'larına Default Kuralları Ekle
 * 
 * Bu script:
 * 1. Tüm workspace'lerdeki funnel'ları bulur
 * 2. "Satış" içeren funnel'ların stage'lerine defaultSalesRules'tan kuralları atar
 * 3. Sadece henüz kuralı OLMAYAN stage'lere yazar (mevcut kurallar korunur)
 * 
 * Kullanım: node scripts/migrateEntryRules.js
 */

import { PrismaClient } from '@prisma/client';
import { DEFAULT_SALES_RULES } from '../services/defaultSalesRules.js';

const prisma = new PrismaClient();

async function migrate() {
    console.log('🔄 Entry Rules Migration başlıyor...\n');

    // Tüm funnel'ları stage'leriyle birlikte getir
    const funnels = await prisma.funnel.findMany({
        include: {
            stages: {
                orderBy: { order: 'asc' }
            }
        }
    });

    console.log(`📊 Toplam ${funnels.length} funnel bulundu.\n`);

    let totalUpdated = 0;
    let totalSkipped = 0;

    for (const funnel of funnels) {
        // Sadece "Satış" kelimesini içeren funnel'lara uygula
        const isSalesFunnel = funnel.name.toLowerCase().includes('satış') || 
                               funnel.name.toLowerCase().includes('satis') ||
                               funnel.name.toLowerCase().includes('sales');

        if (!isSalesFunnel) {
            console.log(`⏭️  "${funnel.name}" (${funnel.id}) — Satış akışı değil, atlanıyor`);
            continue;
        }

        console.log(`\n🔧 "${funnel.name}" (${funnel.id}) — ${funnel.stages.length} aşama`);

        for (const stage of funnel.stages) {
            // Zaten kuralı varsa atla
            if (stage.entryRules) {
                console.log(`  ⏭️  "${stage.name}" — zaten kuralı var, atlanıyor`);
                totalSkipped++;
                continue;
            }

            const defaultRules = DEFAULT_SALES_RULES[stage.name];
            if (!defaultRules) {
                console.log(`  ℹ️  "${stage.name}" — varsayılan kural yok (manuel aşama)`);
                continue;
            }

            // Kuralı ata
            await prisma.funnelStage.update({
                where: { id: stage.id },
                data: {
                    entryRules: JSON.stringify(defaultRules),
                    entryPriority: stage.order
                }
            });

            console.log(`  ✅ "${stage.name}" — kural atandı: ${defaultRules.matchType}, ${defaultRules.rules.length} kural`);
            totalUpdated++;
        }
    }

    console.log(`\n${'═'.repeat(50)}`);
    console.log(`✅ Migration tamamlandı!`);
    console.log(`   Güncellenen: ${totalUpdated} aşama`);
    console.log(`   Atlanan (zaten kuralı var): ${totalSkipped} aşama`);
    console.log(`${'═'.repeat(50)}\n`);

    await prisma.$disconnect();
}

migrate().catch(err => {
    console.error('❌ Migration hatası:', err);
    process.exit(1);
});
