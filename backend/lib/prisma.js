import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Eagerly establish DB connection pool to prevent cold-start failures
prisma.$connect().catch(err => console.error('❌ Prisma connection error:', err.message));

// Legacy middleware that automatically promoted contacts with phone numbers to HOT_OPPORTUNITY
// has been removed. This logic is incompatible with the dynamic Funnel Stage ID architecture.
// (See Bot-1770 and Bot-1564 issues)

export default prisma;
