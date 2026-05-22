import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Eagerly establish DB connection pool to prevent cold-start failures
prisma.$connect().catch(err => console.error('❌ Prisma connection error:', err.message));

// Legacy middleware that automatically promoted contacts with phone numbers to HOT_OPPORTUNITY
// has been removed. This logic is incompatible with the dynamic Funnel Stage ID architecture.
// (See Bot-1770 and Bot-1564 issues)

// Auto-restore soft-deleted contacts when they send a new message
prisma.$use(async (params, next) => {
    const result = await next(params);

    // Only trigger on Message creation where it's from the contact
    if (params.model === 'Message' && params.action === 'create' && params.args?.data?.isFromContact === true) {
        const conversationId = params.args.data.conversationId;
        if (conversationId) {
            try {
                const conversation = await prisma.conversation.findUnique({
                    where: { id: conversationId },
                    select: { contactId: true }
                });
                if (conversation?.contactId) {
                    const contact = await prisma.contact.findUnique({
                        where: { id: conversation.contactId },
                        select: { isDeleted: true }
                    });
                    if (contact?.isDeleted) {
                        await prisma.contact.update({
                            where: { id: conversation.contactId },
                            data: { isDeleted: false, deletedAt: null }
                        });
                        console.log(`♻️ [AutoRestore] Contact ${conversation.contactId} restored (was soft-deleted, sent new message)`);
                    }
                }
            } catch (err) {
                // Non-fatal — don't block message creation
                console.error('⚠️ [AutoRestore] Error:', err.message);
            }
        }
    }

    return result;
});

export default prisma;
