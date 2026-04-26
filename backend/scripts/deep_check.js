import { PrismaClient } from '@prisma/client';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

async function deepCheck() {
    console.log('--- DEEP FILTER CHECK ---');
    try {
        const wsId = 'd91029d6-8b1f-4265-a385-4a40eafc0ac9'; // Gürkayalar
        
        const openYeniConvs = await prisma.conversation.findMany({
            where: {
                workspaceId: wsId,
                status: 'OPEN',
                funnelStage: { name: 'Yeni Başvuru' }
            },
            include: { funnelStage: true, contact: { select: { name: true, funnelStageId: true } } }
        });

        console.log(`\nThere are exactly ${openYeniConvs.length} OPEN conversations under 'Yeni Başvuru' in Gürkayalar.`);
        
        let badContacts = 0;
        openYeniConvs.forEach(conv => {
            if (conv.contact.funnelStageId !== conv.funnelStageId) {
                badContacts++;
            }
        });
        
        console.log(`${badContacts} out of ${openYeniConvs.length} Contacts have a MISMATCHED funnelStageId.`);

        if (openYeniConvs.length > 0) {
            console.log('\nExample Mismatched Contact:');
            const ex = openYeniConvs.find(c => c.contact.funnelStageId !== c.funnelStageId) || openYeniConvs[0];
            console.log(`- Conv UUID: ${ex.id}`);
            console.log(`- Contact: ${ex.contact.name}`);
            console.log(`- Contact's current Stage UUID: ${ex.contact.funnelStageId}`);
            console.log(`- Conv's Stage UUID: ${ex.funnelStageId} (Should match!)`);
        }

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

deepCheck();
