/**
 * One-time script: Tüm workspace'lerden "Randevu Veriliyor" funnel stage'ini siler.
 * 
 * Sunucuda çalıştır:
 *   node scripts/delete_randevu_veriliyor.js
 */

import prisma from '../lib/prisma.js';

async function main() {
    console.log('🔍 "Randevu Veriliyor" stage\'leri aranıyor...');

    const stages = await prisma.funnelStage.findMany({
        where: { name: 'Randevu Veriliyor' },
        include: {
            funnel: { select: { name: true, workspaceId: true } }
        }
    });

    if (stages.length === 0) {
        console.log('✅ Silinecek kayıt yok.');
        return;
    }

    console.log(`\n📋 Silinecek ${stages.length} kayıt:\n`);
    stages.forEach(s => {
        console.log(`  - Workspace: ${s.funnel.workspaceId} | Funnel: "${s.funnel.name}" | Stage: "${s.name}" (id: ${s.id})`);
    });

    console.log('\n🗑️  Siliniyor...');

    const result = await prisma.funnelStage.deleteMany({
        where: { name: 'Randevu Veriliyor' }
    });

    console.log(`✅ ${result.count} kayıt silindi.`);
}

main()
    .catch(err => {
        console.error('❌ Hata:', err.message);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
