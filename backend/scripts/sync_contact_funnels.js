import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const prisma = new PrismaClient();

async function syncContactFunnels() {
    console.log("Starting DB Sync for Contact.funnelStageId and funnelType...");
    const wsId = 'd91029d6-8b1f-4265-a385-4a40eafc0ac9';
    
    // Find all contacts without a funnelStageId
    const contacts = await prisma.contact.findMany({
        where: { 
            workspaceId: wsId,
        },
        include: {
            conversations: {
                orderBy: { lastMessageAt: 'desc' },
                take: 1
            }
        }
    });

    let updated = 0;
    
    for (const contact of contacts) {
        if (contact.conversations && contact.conversations.length > 0) {
            const latestConv = contact.conversations[0];
            
            // If the latest conversation has a funnel stage, we map it to the Contact
            let newFunnelStageId = contact.funnelStageId;
            let newFunnelType = contact.funnelType;
            let changed = false;

            if (latestConv.funnelStageId && contact.funnelStageId !== latestConv.funnelStageId) {
                newFunnelStageId = latestConv.funnelStageId;
                changed = true;
            }
            if (latestConv.funnelType && contact.funnelType !== latestConv.funnelType) {
                newFunnelType = latestConv.funnelType;
                changed = true;
            }

            if (changed) {
                // Determine if we should also update status fallback
                // E.g., if we know the UUID of 'Sıcak Fırsat' we could map it back to HOT_OPPORTUNITY, but not needed since frontend prefers funnelStageId
                console.log(`Updating Contact ${contact.id} (${contact.name}) to funnelStageId: ${newFunnelStageId}`);
                await prisma.contact.update({
                    where: { id: contact.id },
                    data: {
                        funnelStageId: newFunnelStageId,
                        funnelType: newFunnelType
                    }
                });
                updated++;
            }
        }
    }

    console.log(`Sync complete. Migrated ${updated} contacts with their latest conversation funnel stage.`);
}

syncContactFunnels()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
