import { PrismaClient } from '@prisma/client';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

async function verify() {
    // List all workspaces
    const workspaces = await prisma.workspace.findMany({
        select: { id: true, name: true }
    });
    console.log('━━━ ALL WORKSPACES ━━━');
    workspaces.forEach(ws => console.log(`  ${ws.name}: ${ws.id}`));

    // For each workspace, show funnelStageId coverage
    console.log('\n━━━ FUNNEL STAGE COVERAGE ━━━');
    for (const ws of workspaces) {
        const total = await prisma.contact.count({ where: { workspaceId: ws.id, isArchived: false } });
        const withStage = await prisma.contact.count({ where: { workspaceId: ws.id, isArchived: false, funnelStageId: { not: null } } });
        const withoutStage = total - withStage;
        const pct = total > 0 ? Math.round((withStage / total) * 100) : 0;
        
        if (total > 0) {
            console.log(`\n  📊 ${ws.name} (${total} contacts)`);
            console.log(`     ✅ With funnelStageId: ${withStage} (${pct}%)`);
            console.log(`     ❌ Without funnelStageId: ${withoutStage}`);
            
            if (withoutStage > 0) {
                // Show status breakdown of contacts without funnelStageId
                const orphans = await prisma.contact.groupBy({
                    by: ['status'],
                    where: { workspaceId: ws.id, isArchived: false, funnelStageId: null },
                    _count: true
                });
                orphans.forEach(o => console.log(`        status="${o.status}": ${o._count}`));
            }
        }
    }

    await prisma.$disconnect();
}

verify().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
