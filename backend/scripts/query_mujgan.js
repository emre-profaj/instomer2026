import { PrismaClient } from '@prisma/client';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

async function checkMujgan() {
    console.log('--- DIAGNOSING MÜJGAN AKSOY ---');
    try {
        const mujgan = await prisma.contact.findFirst({
            where: { name: { contains: 'Müjgan' } },
            include: {
                funnelStage: { include: { funnel: true } },
                conversations: {
                    include: { funnelStage: { include: { funnel: true } } },
                    orderBy: { createdAt: 'desc' }
                }
            }
        });

        if (!mujgan) {
            console.log('Mujgan not found.');
            return;
        }

        console.log(`\nContact Name: ${mujgan.name}`);
        console.log(`Contact ID: ${mujgan.id}`);
        console.log(`Workspace ID: ${mujgan.workspaceId}`);
        console.log(`OVERALL CONTACT FUNNEL: ${mujgan.funnelStage?.name} (Funnel: ${mujgan.funnelStage?.funnel?.name}) [UUID: ${mujgan.funnelStageId}]`);
        console.log(`Legacy Status Field: ${mujgan.status}`);

        console.log('\n--- CONVERSATIONS ---');
        mujgan.conversations.forEach((conv, index) => {
            console.log(`\n[${index}] Conversation ID: ${conv.id}`);
            console.log(`   Status: ${conv.status}`);
            console.log(`   Created: ${conv.createdAt}`);
            console.log(`   Last Message At: ${conv.lastMessageAt}`);
            console.log(`   Funnel Stage: ${conv.funnelStage?.name} (Funnel: ${conv.funnelStage?.funnel?.name}) [UUID: ${conv.funnelStageId}]`);
        });

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

checkMujgan();
