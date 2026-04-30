import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function mergeFunnels() {
    console.log("Starting funnel merge script...");
    
    const workspaces = await prisma.workspace.findMany();
    
    for (const workspace of workspaces) {
        console.log(`\nProcessing Workspace: ${workspace.name} (${workspace.id})`);
        
        // Find all funnels in this workspace
        const funnels = await prisma.funnel.findMany({
            where: { workspaceId: workspace.id },
            include: { stages: true }
        });
        
        const targetNames = ['genel', 'genel crm', 'genel crm (otomatik i̇şlem)', 'genel crm (otomatik işlem)'];
        
        const funnelsToMerge = funnels.filter(f => targetNames.includes(f.name.toLowerCase().trim()));
        
        if (funnelsToMerge.length <= 1) {
            console.log(`  No need to merge, found ${funnelsToMerge.length} target funnels.`);
            continue;
        }
        
        console.log(`  Found ${funnelsToMerge.length} funnels to merge:`, funnelsToMerge.map(f => f.name).join(', '));
        
        // Let's find or designate the primary "Genel" funnel
        let primaryFunnel = funnelsToMerge.find(f => f.name.toLowerCase().trim() === 'genel');
        if (!primaryFunnel) {
            // If there's no exact "Genel", rename the first one to "Genel"
            primaryFunnel = funnelsToMerge[0];
            await prisma.funnel.update({
                where: { id: primaryFunnel.id },
                data: { name: 'Genel', color: '#3b82f6', icon: '📁' }
            });
            console.log(`  Renamed "${primaryFunnel.name}" to "Genel" as primary.`);
        } else {
            console.log(`  Primary funnel selected: "${primaryFunnel.name}" (${primaryFunnel.id})`);
        }
        
        // Move stages from other funnels to the primary funnel
        const otherFunnels = funnelsToMerge.filter(f => f.id !== primaryFunnel.id);
        
        let maxOrder = primaryFunnel.stages.reduce((max, s) => Math.max(max, s.order), 0);
        
        for (const oldFunnel of otherFunnels) {
            console.log(`  Moving stages from "${oldFunnel.name}" (${oldFunnel.id})...`);
            
            for (const stage of oldFunnel.stages) {
                // Check if a stage with the same name already exists in the primary funnel
                const existingStage = await prisma.funnelStage.findFirst({
                    where: { funnelId: primaryFunnel.id, name: stage.name }
                });
                
                if (existingStage) {
                    console.log(`    Stage "${stage.name}" already exists in primary. Migrating contacts...`);
                    // Migrate contacts from old stage to existing stage
                    await prisma.contact.updateMany({
                        where: { funnelStageId: stage.id },
                        data: { funnelStageId: existingStage.id }
                    });
                    
                    // Delete the old duplicate stage
                    await prisma.funnelStage.delete({ where: { id: stage.id } });
                } else {
                    console.log(`    Moving stage "${stage.name}" to primary funnel...`);
                    maxOrder++;
                    await prisma.funnelStage.update({
                        where: { id: stage.id },
                        data: { funnelId: primaryFunnel.id, order: maxOrder }
                    });
                }
            }
            
            // Delete the old funnel
            console.log(`  Deleting empty funnel "${oldFunnel.name}" (${oldFunnel.id})...`);
            await prisma.funnel.delete({ where: { id: oldFunnel.id } });
        }
        console.log(`  Merge completed for workspace ${workspace.name}.`);
    }
    
    console.log("\nAll done.");
    await prisma.$disconnect();
}

mergeFunnels().catch(e => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
});
