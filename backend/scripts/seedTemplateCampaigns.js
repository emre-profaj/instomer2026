/**
 * Mevcut workspace'lere şablon kampanya oluşturma migration script'i
 * 
 * Kullanım (sunucuda):
 *   node backend/scripts/seedTemplateCampaigns.js
 * 
 * Bu script:
 * 1. Tüm workspace'leri çeker
 * 2. Her workspace için isSystemTemplate kampanya var mı kontrol eder
 * 3. Yoksa DEFAULT_CAMPAIGN_TEMPLATES'den oluşturur
 * 4. İdempotent — tekrar çalıştırılabilir
 */

import prisma from '../lib/prisma.js';
import { DEFAULT_CAMPAIGN_TEMPLATES } from '../utils/universalDefaults.js';

async function seedExistingWorkspaces() {
    console.log('🚀 Mevcut workspace\'lere şablon kampanya oluşturma başlıyor...\n');

    const workspaces = await prisma.workspace.findMany({
        select: { id: true, name: true }
    });

    console.log(`📦 ${workspaces.length} workspace bulundu\n`);

    let created = 0;
    let skipped = 0;

    for (const ws of workspaces) {
        // Bu workspace'te zaten şablon kampanya var mı?
        const existing = await prisma.marketingCampaign.count({
            where: { workspaceId: ws.id, isSystemTemplate: true }
        });

        if (existing > 0) {
            console.log(`⏭️  [${ws.name}] — Zaten ${existing} şablon kampanya var, atlanıyor`);
            skipped++;
            continue;
        }

        console.log(`📣 [${ws.name}] — Şablon kampanyalar oluşturuluyor...`);

        for (const tpl of DEFAULT_CAMPAIGN_TEMPLATES) {
            try {
                const campaign = await prisma.marketingCampaign.create({
                    data: {
                        workspaceId: ws.id,
                        name: tpl.name,
                        type: tpl.type,
                        status: 'DRAFT',
                        triggerType: tpl.triggerType,
                        triggerConfig: tpl.triggerConfig ? JSON.stringify(tpl.triggerConfig) : null,
                        isSystemTemplate: true,
                        description: tpl.description || '',
                        totalRecipients: 0,
                        sentCount: 0,
                        deliveredCount: 0,
                        readCount: 0,
                        repliedCount: 0,
                        failedCount: 0,
                    }
                });

                // Gruplar
                if (tpl.groups?.length) {
                    for (const g of tpl.groups) {
                        await prisma.campaignGroup.create({
                            data: {
                                campaignId: campaign.id,
                                name: g.name,
                                delayDays: g.delayDays ?? 0,
                                sortOrder: g.sortOrder ?? 0,
                                totalRecipients: 0,
                                sentCount: 0,
                                deliveredCount: 0,
                                readCount: 0,
                                repliedCount: 0,
                                failedCount: 0,
                            }
                        });
                    }
                }

                console.log(`   ✅ ${tpl.name} (${tpl.groups?.length || 0} grup)`);
                created++;
            } catch (err) {
                console.error(`   ❌ ${tpl.name}: ${err.message}`);
            }
        }
    }

    console.log(`\n✅ Tamamlandı!`);
    console.log(`   Oluşturulan: ${created} kampanya`);
    console.log(`   Atlanan: ${skipped} workspace (zaten var)`);

    await prisma.$disconnect();
}

seedExistingWorkspaces().catch(err => {
    console.error('❌ Migration hatası:', err);
    process.exit(1);
});
