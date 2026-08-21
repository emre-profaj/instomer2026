import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Eagerly establish DB connection pool to prevent cold-start failures
prisma.$connect()
    .then(async () => {
        // Eksik kuralları oluştur (mevcut olanlara dokunma, varsayılan: KAPALI)
        const workspaces = await prisma.workspace.findMany({ select: { id: true } });
        const rules = workspaces.flatMap(ws => [
            { workspaceId: ws.id, ruleType: 'SALES_PHONE_CALL', isActive: false, config: JSON.stringify({ callDelayMinutes: 15, assignDirectly: false }) },
            { workspaceId: ws.id, ruleType: 'APPOINTMENT_AUTO_PLAN', isActive: false, config: JSON.stringify({ teamId: null }) },
            { workspaceId: ws.id, ruleType: 'PHONE_CAPTURE', isActive: false, config: '{}' }
        ]);
        const { count: created } = await prisma.workspaceRule.createMany({ data: rules, skipDuplicates: true });
        if (created > 0) console.log(`✅ [Startup] ${created} eksik niyet algılama kuralı oluşturuldu (varsayılan: kapalı)`);

        // ⚠️ Eski auto-enable SQL kaldırıldı — kullanıcı toggle'ı ne ayarladıysa o kalır
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

// ─── UNIVERSAL AUTO-CALL PLANNING ──────────────────────────────
// Contact'a telefon numarası eklendiğinde (create veya update) otomatik arama planla.
// Bu middleware SADECE lead form'dan gelen kişiler için arama planlar.
// Manuel oluşturulan, toplu mesaj gönderilen vb. kişiler için arama PLANLANMAZ.
prisma.$use(async (params, next) => {
    const result = await next(params);

    if (params.model !== 'Contact') return result;
    if (params.action !== 'create' && params.action !== 'update') return result;

    try {
        const newPhone = result?.phone?.trim();
        if (!newPhone) return result;

        // UPDATE ise: eski telefon var mıydı kontrol et (sadece yeni eklenen numaralar için tetikle)
        if (params.action === 'update') {
            if (!params.args?.data?.phone) return result;
        }

        // SADECE lead form kaynaklı kişiler için otomatik arama planla
        // Manuel, toplu mesaj, WhatsApp vb. kaynaklar için arama PLANLANMAZ
        const LEAD_SOURCES = ['FACEBOOK_LEAD', 'LEAD', 'FORM', 'WEB_FORM'];
        if (!LEAD_SOURCES.includes(result.source)) {
            return result;
        }

        const contactId = result.id;
        const workspaceId = result.workspaceId;
        if (!contactId || !workspaceId) return result;

        // Async fire-and-forget: arama planla (mevcut dedup kontrolleri fonksiyon içinde var)
        setImmediate(async () => {
            try {
                const { executeAutoCallPlanning } = await import('../controllers/rules.controller.js');
                const hookSource = 'LEAD_FORM';
                await executeAutoCallPlanning(workspaceId, contactId, hookSource);
            } catch (err) {
                console.error('⚠️ [AutoCallHook] Error:', err.message);
            }
        });
    } catch (err) {
        console.error('⚠️ [AutoCallHook] Middleware error:', err.message);
    }

    return result;
});

export default prisma;
