// One-time script: Sync funnelType/funnelStageId from conversations to contacts
// Run with: node scripts/syncContactFunnels.js

import prisma from '../lib/prisma.js';

async function syncContactFunnels() {
    console.log('🔄 Starting contact funnel sync...');

    // Find all conversations that have funnelType + funnelStageId + contactId
    const conversations = await prisma.conversation.findMany({
        where: {
            funnelType: { not: null },
            funnelStageId: { not: null },
            contactId: { not: null }
        },
        select: {
            id: true,
            contactId: true,
            funnelType: true,
            funnelStageId: true,
            lastMessageAt: true
        },
        orderBy: { lastMessageAt: 'desc' }
    });

    console.log(`📊 Found ${conversations.length} conversations with funnel data`);

    // Group by contactId, keeping the latest conversation per contact
    const latestByContact = {};
    for (const conv of conversations) {
        if (!latestByContact[conv.contactId]) {
            latestByContact[conv.contactId] = conv;
        }
    }

    const contactIds = Object.keys(latestByContact);
    console.log(`👤 Unique contacts to check: ${contactIds.length}`);

    let updated = 0;
    let skipped = 0;

    for (const contactId of contactIds) {
        const conv = latestByContact[contactId];

        // Check current contact state
        const contact = await prisma.contact.findUnique({
            where: { id: contactId },
            select: { funnelType: true, funnelStageId: true }
        });

        if (!contact) {
            skipped++;
            continue;
        }

        // Only update if contact is missing funnel data
        if (!contact.funnelType || !contact.funnelStageId) {
            await prisma.contact.update({
                where: { id: contactId },
                data: {
                    funnelType: conv.funnelType,
                    funnelStageId: conv.funnelStageId
                }
            });
            updated++;
        } else {
            skipped++;
        }
    }

    console.log(`✅ Sync complete! Updated: ${updated}, Skipped: ${skipped}`);
    await prisma.$disconnect();
}

syncContactFunnels().catch(err => {
    console.error('❌ Sync error:', err);
    process.exit(1);
});
