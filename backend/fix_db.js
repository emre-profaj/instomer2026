import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const prisma = new PrismaClient();

async function main() {
    console.log("Starting DB audit...");
    const conversations = await prisma.conversation.findMany({
        select: {
            id: true,
            funnelStageId: true,
            contactId: true,
            contact: {
                select: {
                    id: true,
                    status: true
                }
            }
        },
        where: {
            NOT: {
                funnelStageId: null
            }
        }
    });

    let nonUuidCount = 0;
    let mismatchCount = 0;
    const mismatches = [];
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    for (const conv of conversations) {
        if (!conv.funnelStageId) continue;
        
        const isUuid = uuidRegex.test(conv.funnelStageId);
        if (!isUuid) {
            nonUuidCount++;
            if (conv.funnelStageId !== conv.contact?.status) {
                mismatchCount++;
                mismatches.push(`ConvID: ${conv.id} | funnelStageId: ${conv.funnelStageId} | contact.status: ${conv.contact?.status}`);
            }
            
            // Fix the database directly
            // If the funnelStageId is NOT a UUID it's invalid data. 
            // In our system, if it's a string like 'HOT_OPPORTUNITY', it should ONLY be in contact.status
            // Let's ensure contact.status is preserved or takes priority, and funnelStageId is cleared.
            await prisma.conversation.update({
                where: { id: conv.id },
                data: { funnelStageId: null }
            });
            
            // If contact.status differs or is missing, but funnelStageId had a value (say 'HOT_OPPORTUNITY'), 
            // maybe we want to sync it to contact.status... but wait, contact.status is the source of truth!
            // The problem was contact.status was newer. So just nullifying funnelStageId is perfect.
        }
    }

    console.log(`Verified ${conversations.length} records with a funnelStageId.`);
    console.log(`Found ${nonUuidCount} invalid string statuses in funnelStageId (converting them to NULL so contact.status takes over).`);
    console.log(`Found ${mismatchCount} actual mismatches.`);
    if (mismatches.length > 0) {
        console.log("Sample of mismatches:");
        console.log(mismatches.slice(0, 10).join('\n'));
    }
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
