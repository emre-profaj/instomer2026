import { PrismaClient } from '@prisma/client';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

async function syncContactFunnels() {
    console.log(`Starting DB Sync for ALL Workspaces (Global Restore)`);

    try {
        let updated = 0;
        let skipped = 0;

        // ALL Contacts
        const contacts = await prisma.contact.findMany({
            include: {
                conversations: {
                    orderBy: {
                        createdAt: 'desc'
                    }
                }
            }
        });

        for (const contact of contacts) {
            let activeConv = contact.conversations.find(c => c.status === 'OPEN' || c.status === 'PENDING');
            
            if (!activeConv && contact.conversations.length > 0) {
                activeConv = contact.conversations[0];
            }

            if (activeConv) {
                const { funnelStageId, funnelType } = activeConv;
                
                if (contact.funnelStageId !== funnelStageId || contact.funnelType !== funnelType) {
                    await prisma.contact.update({
                        where: { id: contact.id },
                        data: {
                            funnelStageId: funnelStageId || null,
                            funnelType: funnelType || null
                        }
                    });
                    console.log(`Updated Contact ${contact.id} (${contact.name}) to stage UUID: ${funnelStageId}`);
                    updated++;
                } else {
                    skipped++;
                }
            } else {
                skipped++;
            }
        }

        console.log('-----------------------------------');
        console.log(`SYNC COMPLETE FOR GÜRKAYALAR!`);
        console.log(`Updated Contracts: ${updated}`);
        console.log(`Already synced / Skipped: ${skipped}`);
        console.log('-----------------------------------');
        
    } catch (e) {
        console.error('Migration failed:', e);
    } finally {
        await prisma.$disconnect();
    }
}

syncContactFunnels();
