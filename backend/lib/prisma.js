import { PrismaClient } from '@prisma/client';

function getDatabaseUrl() {
    let raw = (process.env.DATABASE_URL || '').trim();
    if (!raw) return undefined;
    // Strip wrapping quotes if any
    raw = raw.replace(/^["']|["']$/g, '');

    const hasLimit = /connection_limit=\d+/.test(raw);
    const hasTimeout = /pool_timeout=\d+/.test(raw);

    const separator = raw.includes('?') ? '&' : '?';
    const params = [];
    if (!hasLimit) params.push('connection_limit=30');
    if (!hasTimeout) params.push('pool_timeout=20');

    if (params.length > 0) {
        raw = `${raw}${separator}${params.join('&')}`;
    }
    return raw;
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

            // 4) NULL boolean alanları varsayılan false yap (görünürlük sorunlarını önler)
            await prisma.$executeRaw`
                UPDATE "conversations"
                SET "isInternalChat" = false
                WHERE "isInternalChat" IS NULL
            `;
            await prisma.$executeRaw`
                UPDATE "conversations"
                SET "isArchived" = false
                WHERE "isArchived" IS NULL
            `;
            await prisma.$executeRaw`
                UPDATE "contacts"
                SET "isDeleted" = false
                WHERE "isDeleted" IS NULL
            `;
        } catch (initErr) {
            console.error('⚠️ [Startup Init] Non-fatal init error:', initErr.message);
        }
    })
    .catch(err => console.error('❌ Prisma connection error:', err.message));

export default prisma;

