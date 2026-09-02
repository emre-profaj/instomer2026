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
    if (!hasLimit) params.push('connection_limit=15');
    if (!hasTimeout) params.push('pool_timeout=15');

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

// Establish DB connection
prisma.$connect()
    .then(() => {
        console.log(`🗄️ [Database] PostgreSQL connected successfully [instance: ${process.env.NODE_APP_INSTANCE ?? 'default'}]`);
    })
    .catch(err => {
        console.error('❌ [Database] PostgreSQL connection error:', err.message);
    });

export default prisma;

