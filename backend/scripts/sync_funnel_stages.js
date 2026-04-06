import { PrismaClient } from '@prisma/client';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

/**
 * Sync funnelStageId between Conversations and Contacts.
 * 
 * Strategy:
 * 1. For each conversation WITH a funnelStageId → propagate to the parent contact
 * 2. For each contact WITH a funnelStageId but conversations WITHOUT → propagate to conversations
 * 3. Report stats
 */
async function syncFunnelStages() {
    console.log('🔄 Starting Global FunnelStageId Sync...\n');

    let convToContact = 0;
    let contactToConv = 0;
    let alreadySynced = 0;
    let orphanedStages = 0;

    // Get all valid stage IDs from the database
    const allStages = await prisma.funnelStage.findMany({ select: { id: true } });
    const validStageIds = new Set(allStages.map(s => s.id));
    console.log(`📋 Found ${validStageIds.size} valid FunnelStage IDs in database\n`);

    // PHASE 1: Conversation → Contact sync
    console.log('━━━ PHASE 1: Conversation → Contact ━━━');
    const conversations = await prisma.conversation.findMany({
        where: { funnelStageId: { not: null } },
        select: { id: true, contactId: true, funnelStageId: true, funnelType: true, status: true },
        orderBy: { lastMessageAt: 'desc' }
    });

    // Group by contactId, prefer most recent (already sorted by lastMessageAt desc)
    const contactStageMap = new Map();
    for (const conv of conversations) {
        if (!contactStageMap.has(conv.contactId)) {
            contactStageMap.set(conv.contactId, {
                funnelStageId: conv.funnelStageId,
                funnelType: conv.funnelType
            });
        }
    }

    for (const [contactId, { funnelStageId, funnelType }] of contactStageMap) {
        // Verify stage still exists
        if (!validStageIds.has(funnelStageId)) {
            orphanedStages++;
            continue;
        }

        const contact = await prisma.contact.findUnique({
            where: { id: contactId },
            select: { id: true, funnelStageId: true, funnelType: true, name: true }
        });

        if (!contact) continue;

        if (contact.funnelStageId !== funnelStageId) {
            await prisma.contact.update({
                where: { id: contactId },
                data: { funnelStageId, funnelType: funnelType || contact.funnelType }
            });
            convToContact++;
            console.log(`  ✅ Contact "${contact.name}" (${contactId}) ← stage ${funnelStageId}`);
        } else {
            alreadySynced++;
        }
    }

    console.log(`\n📊 Phase 1: ${convToContact} contacts updated, ${alreadySynced} already synced, ${orphanedStages} orphaned stages skipped\n`);

    // PHASE 2: Contact → Conversation sync  
    console.log('━━━ PHASE 2: Contact → Conversation ━━━');
    const contactsWithStage = await prisma.contact.findMany({
        where: { funnelStageId: { not: null } },
        select: { id: true, funnelStageId: true, funnelType: true, name: true }
    });

    for (const contact of contactsWithStage) {
        if (!validStageIds.has(contact.funnelStageId)) continue;

        // Find conversations for this contact that are missing funnelStageId
        const convsMissing = await prisma.conversation.findMany({
            where: {
                contactId: contact.id,
                funnelStageId: null,
                status: { in: ['OPEN', 'PENDING'] }
            },
            select: { id: true }
        });

        for (const conv of convsMissing) {
            await prisma.conversation.update({
                where: { id: conv.id },
                data: {
                    funnelStageId: contact.funnelStageId,
                    funnelType: contact.funnelType
                }
            });
            contactToConv++;
            console.log(`  ✅ Conversation ${conv.id} ← stage ${contact.funnelStageId} (from "${contact.name}")`);
        }
    }

    console.log(`\n📊 Phase 2: ${contactToConv} conversations updated\n`);

    // FINAL REPORT
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🏁 SYNC COMPLETE');
    console.log(`   Conversation → Contact: ${convToContact} updated`);
    console.log(`   Contact → Conversation: ${contactToConv} updated`);
    console.log(`   Already synced: ${alreadySynced}`);
    console.log(`   Orphaned stages skipped: ${orphanedStages}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    await prisma.$disconnect();
}

syncFunnelStages().catch(err => {
    console.error('❌ Sync failed:', err);
    process.exit(1);
});
