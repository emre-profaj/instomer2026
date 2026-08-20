/**
 * Migration Script: SALES_PHONE_CALL rule'u tüm mevcut workspace'lere ekler.
 * 
 * Kullanım: node seed_auto_call_rule.js
 * 
 * Bu script idempotent'tır — var olan kuralları değiştirmez.
 */
import prisma from './lib/prisma.js';

async function seedAutoCallRuleForAllWorkspaces() {
    console.log('🚀 Starting SALES_PHONE_CALL rule migration for all workspaces...\n');

    const workspaces = await prisma.workspace.findMany({
        select: { id: true, name: true }
    });

    console.log(`Found ${workspaces.length} workspaces.\n`);

    let created = 0;
    let skipped = 0;

    for (const ws of workspaces) {
        try {
            // SALES_PHONE_CALL
            const result = await prisma.workspaceRule.upsert({
                where: {
                    workspaceId_ruleType: { workspaceId: ws.id, ruleType: 'SALES_PHONE_CALL' }
                },
                create: {
                    workspaceId: ws.id,
                    ruleType: 'SALES_PHONE_CALL',
                    isActive: true,
                    config: JSON.stringify({
                        callDelayMinutes: 15,
                        assignDirectly: false
                    })
                },
                update: {} // Mevcut kuralı değiştirme
            });

            // PHONE_CAPTURE
            await prisma.workspaceRule.upsert({
                where: {
                    workspaceId_ruleType: { workspaceId: ws.id, ruleType: 'PHONE_CAPTURE' }
                },
                create: {
                    workspaceId: ws.id,
                    ruleType: 'PHONE_CAPTURE',
                    isActive: true,
                    config: '{}'
                },
                update: {}
            });

            // APPOINTMENT_AUTO_PLAN
            await prisma.workspaceRule.upsert({
                where: {
                    workspaceId_ruleType: { workspaceId: ws.id, ruleType: 'APPOINTMENT_AUTO_PLAN' }
                },
                create: {
                    workspaceId: ws.id,
                    ruleType: 'APPOINTMENT_AUTO_PLAN',
                    isActive: true,
                    config: JSON.stringify({ teamId: null })
                },
                update: {}
            });

            // Check if it was newly created (createdAt ~ now)
            const isNew = (new Date() - new Date(result.createdAt)) < 5000;
            if (isNew) {
                console.log('  ✅ ' + ws.name + ' (' + ws.id + ') — SALES_PHONE_CALL rule oluşturuldu');
                created++;
            } else {
                console.log('  ⏭️  ' + ws.name + ' (' + ws.id + ') — zaten var, atlandı');
                skipped++;
            }
        } catch (err) {
            console.error('  ❌ ' + ws.name + ' (' + ws.id + ') — hata: ' + err.message);
        }
    }

    console.log('\n✅ Migration tamamlandı: ' + created + ' yeni, ' + skipped + ' atlandı (toplam: ' + workspaces.length + ')');
    await prisma.$disconnect();
}

seedAutoCallRuleForAllWorkspaces().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
