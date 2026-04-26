/**
 * Migration Script: Move import tags to importGroup field
 * 
 * This script finds ALL contacts that have meaningful tags
 * and copies the first meaningful tag to importGroup.
 * It is NOT limited to source='IMPORT' contacts.
 * 
 * Run: node scripts/migrate-import-groups.js
 */

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log('🔄 Starting importGroup migration...\n');

    // Step 1: Add importGroup column if not exists
    try {
        await prisma.$executeRawUnsafe(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS "importGroup" TEXT`);
        console.log('✅ importGroup column ensured');
    } catch (err) {
        console.log('ℹ️ importGroup column already exists or error:', err.message);
    }

    // Junk tags to ignore
    const junkTags = ['whatsapp', 'form', 'facebook', 'instagram', 'email', 'widget'];

    // Step 2: Find ALL contacts that have tags but no importGroup yet
    const contacts = await prisma.contact.findMany({
        where: {
            importGroup: null,
            tags: { not: '[]' }
        },
        select: { id: true, tags: true, name: true }
    });

    console.log(`\n📋 Found ${contacts.length} contacts with tags but no importGroup\n`);

    let updated = 0;
    let skipped = 0;

    for (const contact of contacts) {
        try {
            const tags = JSON.parse(contact.tags || '[]');
            // Find the first meaningful tag (not a visitor ID, not a system tag)
            const importTag = tags.find(t =>
                t &&
                !t.startsWith('v_') &&
                t.length > 2 &&
                !junkTags.includes(t.toLowerCase())
            );

            if (importTag) {
                await prisma.contact.update({
                    where: { id: contact.id },
                    data: { importGroup: importTag }
                });
                updated++;
                if (updated % 100 === 0) console.log(`   ...${updated} updated`);
            } else {
                skipped++;
            }
        } catch (err) {
            console.error(`❌ Error updating ${contact.name}:`, err.message);
            skipped++;
        }
    }

    console.log(`\n✅ Migration complete!`);
    console.log(`   📦 Updated: ${updated} contacts`);
    console.log(`   ⏭️  Skipped: ${skipped} contacts (no meaningful tag found)`);

    await prisma.$disconnect();
}

main().catch(err => {
    console.error('Migration failed:', err);
    prisma.$disconnect();
    process.exit(1);
});
