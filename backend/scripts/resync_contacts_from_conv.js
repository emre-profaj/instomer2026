import { PrismaClient } from '@prisma/client';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

/**
 * Re-sync contact.funnelStageId from their LATEST conversation.
 * Priority: most recent OPEN/PENDING conversation, then most recent RESOLVED.
 * This corrects contacts that are stuck on an old stage because the CUID bug
 * prevented conversation stage updates from being saved.
 */
async function resyncContacts() {
    console.log('🔄 Re-syncing Contact funnelStageId from latest conversations...\n');

    const contacts = await prisma.contact.findMany({
        where: { isArchived: false },
        select: { id: true, name: true, workspaceId: true, funnelStageId: true }
    });

    let updated = 0;
    let unchanged = 0;
    let noConv = 0;

    for (const contact of contacts) {
        // Find latest conversation: prefer OPEN/PENDING, fallback to most recent
        let latestConv = await prisma.conversation.findFirst({
            where: { contactId: contact.id, status: { in: ['OPEN', 'PENDING'] } },
            orderBy: { lastMessageAt: 'desc' },
            select: { funnelStageId: true, funnelType: true }
        });

        if (!latestConv) {
            latestConv = await prisma.conversation.findFirst({
                where: { contactId: contact.id },
                orderBy: { lastMessageAt: 'desc' },
                select: { funnelStageId: true, funnelType: true }
            });
        }

        if (!latestConv || !latestConv.funnelStageId) {
            noConv++;
            continue;
        }

        if (contact.funnelStageId !== latestConv.funnelStageId) {
            await prisma.contact.update({
                where: { id: contact.id },
                data: {
                    funnelStageId: latestConv.funnelStageId,
                    funnelType: latestConv.funnelType || undefined
                }
            });
            updated++;
        } else {
            unchanged++;
        }
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🏁 RE-SYNC COMPLETE');
    console.log(`   Updated: ${updated}`);
    console.log(`   Already correct: ${unchanged}`);
    console.log(`   No conversation/stage: ${noConv}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    await prisma.$disconnect();
}

resyncContacts().catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
});
