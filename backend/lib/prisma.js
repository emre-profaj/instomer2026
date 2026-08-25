import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Eagerly establish DB connection pool to prevent cold-start failures
prisma.$connect()
    .then(async () => {
        // 1) Eksik kuralları oluştur (mevcut olanlara dokunma, varsayılan: AÇIK)
        const workspaces = await prisma.workspace.findMany({ select: { id: true } });
        const rules = workspaces.flatMap(ws => [
            { workspaceId: ws.id, ruleType: 'SALES_PHONE_CALL', isActive: true, config: JSON.stringify({ callDelayMinutes: 15, assignDirectly: false }) },
            { workspaceId: ws.id, ruleType: 'APPOINTMENT_AUTO_PLAN', isActive: true, config: JSON.stringify({ teamId: null }) },
            { workspaceId: ws.id, ruleType: 'PHONE_CAPTURE', isActive: true, config: '{}' }
        ]);
        const { count: created } = await prisma.workspaceRule.createMany({ data: rules, skipDuplicates: true });
        if (created > 0) console.log(`✅ [Startup] ${created} eksik niyet algılama kuralı oluşturuldu (varsayılan: açık)`);

        // 2) Eski seed'den kapalı kalanları BİR KERE aç (sadece hiç elle dokunulmamışlar)
        const migrated = await prisma.$executeRaw`
            UPDATE "workspace_rules"
            SET "isActive" = true, "updatedAt" = NOW()
            WHERE "ruleType" IN ('SALES_PHONE_CALL', 'APPOINTMENT_AUTO_PLAN', 'PHONE_CAPTURE')
              AND "isActive" = false
              AND "updatedAt" = "createdAt"
        `;
        if (migrated > 0) console.log(`🔄 [Startup] ${migrated} eski kapalı kural aktifleştirildi (tek seferlik)`);




        // ⚠️ Eski PENDING ScheduledCall kayıtlarını temizle (restart sonrası eskiler çalışmasın)
        const cleared = await prisma.$executeRaw`
            UPDATE "scheduled_calls"
            SET "status" = 'CANCELLED'
            WHERE "status" = 'PENDING'
        `;
        if (cleared > 0) console.log(`🧹 [Startup] ${cleared} eski PENDING arama iptal edildi`);
    })
    .catch(err => console.error('❌ Prisma connection error:', err.message));



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

// ─── AUTO-CALL PLANNING MIDDLEWARE KALDIRILDI ──────────────────
// executeAutoCallPlanning Prisma hook'tan ÇAĞRILMAZ.
// Arama planlaması artık TEK MERKEZDEN yapılır:
// → executeSalesPhoneCallRule (mesaj handler'lardan çağrılır)
// Eski middleware çift aktivite oluşturuyordu.

export default prisma;
