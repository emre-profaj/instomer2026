import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const workspaceId = 'd91029d6-8b1f-4265-a385-4a40eafc0ac9';
    
    const funnels = await prisma.funnel.findMany({
        where: { workspaceId },
        include: { stages: { orderBy: { order: 'asc' } } }
    });

    for (const f of funnels) {
        console.log(`\n📂 Funnel: "${f.name}" (ID: ${f.id})`);
        for (const s of f.stages) {
            const match = s.name.toLowerCase() === f.name.toLowerCase() ? ' ✅ MATCH' : '';
            const convCount = await prisma.conversation.count({
                where: { workspaceId, funnelStageId: s.id }
            });
            console.log(`   ↳ "${s.name}" (ID: ${s.id}) | Konuşma: ${convCount}${match}`);
        }
    }
    
    await prisma.$disconnect();
}

main().catch(console.error);
