import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function migrate() {
    console.log('🚀 Starting channel migration...');

    const conversations = await prisma.conversation.findMany();
    let updatedCount = 0;

    for (const conv of conversations) {
        let channel = 'UNKNOWN';

        if (conv.whatsappPhoneNumberId) {
            channel = 'WHATSAPP';
        } else if (conv.instagramBusinessId) {
            channel = 'INSTAGRAM';
        } else if (conv.facebookPageId) {
            channel = 'FACEBOOK';
        } else {
            // If none of social IDs are present, it's likely a WIDGET chat (from our recent implementation)
            // or an old chat that we want to keep hidden from the main list anyway.
            channel = 'WIDGET';
        }

        if (conv.channel !== channel) {
            await prisma.conversation.update({
                where: { id: conv.id },
                data: { channel }
            });
            updatedCount++;
            console.log(`✅ Updated conversation ${conv.id} -> ${channel}`);
        }
    }

    console.log(`\n✨ Migration complete. Updated ${updatedCount} conversations.`);
    process.exit(0);
}

migrate().catch(err => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
});
