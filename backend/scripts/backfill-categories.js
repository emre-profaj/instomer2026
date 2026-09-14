import prisma from '../lib/prisma.js';
import { matchCategoryFromConversation } from '../services/categoryMatcher.service.js';

async function main() {
    console.log('🚀 [BackfillCategories] Starting category backfill for unassigned conversations and cases...');

    const conversations = await prisma.conversation.findMany({
        where: {
            topicCategoryId: null
        },
        select: {
            id: true,
            workspaceId: true,
            channel: true,
            aiTopic: true
        }
    });

    console.log(`Found ${conversations.length} conversations without topicCategoryId`);

    let matchedCount = 0;
    for (let i = 0; i < conversations.length; i++) {
        const conv = conversations[i];
        try {
            const match = await matchCategoryFromConversation(conv.workspaceId, conv.id);
            if (match?.categoryId) {
                matchedCount++;
                console.log(`[${i + 1}/${conversations.length}] Matched: conv ${conv.id} (${conv.channel}) -> ${match.matchedTerm} (${match.categoryId})`);
            }
        } catch (err) {
            console.error(`Error on conv ${conv.id}:`, err.message);
        }
    }

    console.log(`✅ [BackfillCategories] Finished! Matched and updated ${matchedCount}/${conversations.length} conversations and their cases.`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
