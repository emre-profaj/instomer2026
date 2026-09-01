import { PrismaClient } from '@prisma/client';

function getDatabaseUrl() {
    const raw = process.env.DATABASE_URL;
    if (!raw) return undefined;
    try {
        const u = new URL(raw);
        if (!u.searchParams.has('connection_limit')) {
            u.searchParams.set('connection_limit', '30');
        }
        if (!u.searchParams.has('pool_timeout')) {
            u.searchParams.set('pool_timeout', '20');
        }
        return u.toString();
    } catch {
        return undefined;
    }
}

const dbUrl = getDatabaseUrl();
const prisma = new PrismaClient({
    ...(dbUrl ? { datasources: { db: { url: dbUrl } } } : {}),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error']
});

// Eagerly establish DB connection pool to prevent cold-start failures
prisma.$connect()
    .then(async () => {
        try {
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
        } catch (initErr) {
            console.error('⚠️ [Startup Init] Non-fatal init error:', initErr.message);
        }
    })
    .catch(err => console.error('❌ Prisma connection error:', err.message));

export default prisma;

