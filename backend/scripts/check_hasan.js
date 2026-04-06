import { PrismaClient } from '@prisma/client';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

async function checkHasan() {
    try {
        const hasan = await prisma.contact.findFirst({
            where: { name: { contains: 'Hasan Cihan' } }
        });
        console.log(`Hasan's FunnelStageId: ${hasan.funnelStageId}`);
        
        if (hasan.funnelStageId) {
            const stage = await prisma.funnelStage.findUnique({
                where: { id: hasan.funnelStageId },
                include: { funnel: true }
            });
            console.log(`Hasan is in Stage: ${stage.name} (UUID: ${stage.id}) under Funnel: ${stage.funnel.name} (${stage.funnel.workspaceId === 'd91029d6-8b1f-4265-a385-4a40eafc0ac9' ? 'Gürkayalar' : 'Diğer'})`);
        }

        const counts = await prisma.contact.groupBy({
            by: ['funnelStageId'],
            where: { workspaceId: 'd91029d6-8b1f-4265-a385-4a40eafc0ac9' },
            _count: { funnelStageId: true }
        });

        console.log('\nTop FunnelStageIds for Gürkayalar Contacts:');
        for (const c of counts) {
            if (c.funnelStageId) {
                const s = await prisma.funnelStage.findUnique({ where: { id: c.funnelStageId }, include: { funnel: true } });
                console.log(`- ${s?.name} (${s?.funnel?.name}): ${c._count.funnelStageId} contacts (UUID: ${c.funnelStageId})`);
            } else {
                console.log(`- NULL: ${c._count.funnelStageId} contacts`);
            }
        }
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}
checkHasan();
