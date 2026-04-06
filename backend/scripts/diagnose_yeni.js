import { PrismaClient } from '@prisma/client';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

async function checkDesync() {
    console.log('--- DIAGNOSTIC SCRIPT (ALL STATUSES) ---');
    try {
        const wsId = 'd91029d6-8b1f-4265-a385-4a40eafc0ac9'; // Gürkayalar
        
        // Find Yeni Başvuru
        const stage = await prisma.funnelStage.findFirst({
            where: { name: 'Yeni Başvuru', funnel: { workspaceId: wsId } } // Just in case there are multiple
        });
        
        if (!stage) {
            console.log('Stage not found');
            return;
        }

        console.log(`Analyzing Stage: ${stage.name} (${stage.id})`);

        // Find ALL conversations in Yeni Başvuru (Open, Pending, Resolved)
        const allConvos = await prisma.conversation.findMany({
            where: { workspaceId: wsId, funnelStageId: stage.id },
            include: { contact: true }
        });

        console.log(`\nFound ${allConvos.length} TOTAL conversations (Open + Resolved) under ${stage.name}.`);
        console.log(`Let's see why only 1 Contact shows up in the Contacts list:\n`);
        
        let shouldShowUpCount = 0;

        for (const c of allConvos) {
            let contactStageName = 'NULL';
            if (c.contact?.funnelStageId) {
                const s = await prisma.funnelStage.findUnique({ where: { id: c.contact.funnelStageId }});
                contactStageName = s ? s.name : 'UNKNOWN_STAGE';
            }
            
            // Analyze the parent Contact's conversations
            const contactAllConvos = await prisma.conversation.findMany({
                where: { contactId: c.contactId },
                orderBy: { createdAt: 'desc' }
            });

            // Replicate our sync_v2 logic manually to see why it assigned what it assigned
            let activeConv = contactAllConvos.find(conv => conv.status === 'OPEN' || conv.status === 'PENDING');
            if (!activeConv && contactAllConvos.length > 0) {
                activeConv = contactAllConvos[0];
            }

            let syncStageName = 'Null';
            if (activeConv && activeConv.funnelStageId) {
                 const st = await prisma.funnelStage.findUnique({ where: { id: activeConv.funnelStageId } });
                 syncStageName = st ? st.name : 'Unknown Stage';
            }

            let syncWouldAssign = activeConv ? (activeConv.funnelStageId === stage.id ? 'Yeni Başvuru' : syncStageName) : 'Nothing';
            
            if (syncWouldAssign === 'Yeni Başvuru') {
                shouldShowUpCount++;
            }

            console.log(`- Conv ID: ${c.id} (Status: ${c.status})`);
            console.log(`  Contact Name: ${c.contact?.name}`);
            console.log(`  Sync Logic evaluated their primary state as: ${syncWouldAssign}`);
        }

        console.log(`\nSUMMARY: Out of ${allConvos.length} total deals in 'Yeni Başvuru', only ${shouldShowUpCount} contacts actually have 'Yeni Başvuru' as their primary active state!`);

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

checkDesync();
