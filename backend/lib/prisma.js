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

// ─── UNIVERSAL AUTO-CALL PLANNING ──────────────────────────────
// Contact'a telefon numarası eklendiğinde (create veya update) otomatik arama planla.
// Bu middleware sayesinde hangi kanaldan gelirse gelsin (Facebook, WhatsApp, Widget,
// Email, Lead Form, Manuel, vs.) tek bir noktadan arama planlanır.
prisma.$use(async (params, next) => {
    const result = await next(params);

    if (params.model !== 'Contact') return result;
    if (params.action !== 'create' && params.action !== 'update') return result;

    try {
        const newPhone = result?.phone?.trim();
        if (!newPhone) return result;

        // UPDATE ise: eski telefon var mıydı kontrol et (sadece yeni eklenen numaralar için tetikle)
        if (params.action === 'update') {
            // Prisma update args'ta `where` ile contact id gelir
            // Eğer phone alanı değişmediyse (args.data.phone yoksa) skip
            if (!params.args?.data?.phone) return result;
        }

        const contactId = result.id;
        const workspaceId = result.workspaceId;
        if (!contactId || !workspaceId) return result;

        // Async fire-and-forget: arama planla (mevcut dedup kontrolleri fonksiyon içinde var)
        setImmediate(async () => {
            try {
                const { executeAutoCallPlanning } = await import('../controllers/rules.controller.js');
                await executeAutoCallPlanning(workspaceId, contactId, 'AUTO_HOOK');
            } catch (err) {
                // Non-fatal — don't block contact operations
                console.error('⚠️ [AutoCallHook] Error:', err.message);
            }
        });
    } catch (err) {
        // Non-fatal
        console.error('⚠️ [AutoCallHook] Middleware error:', err.message);
    }

    return result;
});

export default prisma;
