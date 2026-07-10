import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function fixTeklifAsamasiRules() {
    const stages = await prisma.funnelStage.findMany({
        where: { name: 'Teklif Aşaması' }
    });

    let updated = 0;
    for (const stage of stages) {
        if (stage.entryRules) {
            try {
                const rulesObj = JSON.parse(stage.entryRules);
                if (rulesObj && rulesObj.rules) {
                    const hasDealExists = rulesObj.rules.some(r => r.type === 'DEAL_EXISTS');
                    if (hasDealExists) {
                        rulesObj.rules = rulesObj.rules.filter(r => r.type !== 'DEAL_EXISTS');
                        const newRules = rulesObj.rules.length > 0 ? JSON.stringify(rulesObj) : null;
                        
                        await prisma.funnelStage.update({
                            where: { id: stage.id },
                            data: { entryRules: newRules }
                        });
                        updated++;
                        console.log(`✅ Fixed rules for stage ${stage.id} in workspace ${stage.workspaceId}`);
                    }
                }
            } catch (e) {
                console.error(`Failed to parse rules for stage ${stage.id}: ${e.message}`);
            }
        }
    }
    
    console.log(`\n🎉 Done! Fixed ${updated} 'Teklif Aşaması' stages.`);
    await prisma.$disconnect();
}

fixTeklifAsamasiRules().catch(e => {
    console.error(e);
    process.exit(1);
});
