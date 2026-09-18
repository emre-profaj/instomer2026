/**
 * Pazarlama v3: 4 Kampanya Türü, Tekrarlı Gönderim, Olay/Gün Tetikleyicileri ve Auto-Retry Sütunları
 *
 * `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` ile cerrahi ve geriye uyumlu ekleme yapar.
 *
 * Çalıştırma:
 *   node scripts/add-marketing-v3-columns.js
import 'dotenv/config';
import prisma from '../lib/prisma.js';

async function main() {
    console.log('🚀 Pazarlama v3 sütunları ekleniyor...');

    // 1. marketing_campaigns
    await prisma.$executeRawUnsafe(`
        ALTER TABLE "marketing_campaigns" 
        ADD COLUMN IF NOT EXISTS "campaignType" TEXT NOT NULL DEFAULT 'ONE_TIME',
        ADD COLUMN IF NOT EXISTS "recurringFrequency" TEXT,
        ADD COLUMN IF NOT EXISTS "recurringDayOfWeek" INTEGER,
        ADD COLUMN IF NOT EXISTS "recurringDayOfMonth" INTEGER,
        ADD COLUMN IF NOT EXISTS "recurringTime" TEXT,
        ADD COLUMN IF NOT EXISTS "lastRunAt" TIMESTAMP(3),
        ADD COLUMN IF NOT EXISTS "nextRunAt" TIMESTAMP(3),
        ADD COLUMN IF NOT EXISTS "eventTrigger" TEXT,
        ADD COLUMN IF NOT EXISTS "eventConfig" TEXT,
        ADD COLUMN IF NOT EXISTS "dayTrigger" TEXT,
        ADD COLUMN IF NOT EXISTS "dayConfig" TEXT,
        ADD COLUMN IF NOT EXISTS "autoRetry" BOOLEAN NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS "maxRetries" INTEGER NOT NULL DEFAULT 3,
        ADD COLUMN IF NOT EXISTS "retryIntervalMinutes" INTEGER NOT NULL DEFAULT 15;
    `);
    console.log('✅ marketing_campaigns sütunları eklendi.');

    // 2. campaign_groups
    await prisma.$executeRawUnsafe(`
        ALTER TABLE "campaign_groups"
        ADD COLUMN IF NOT EXISTS "targetMilestone" TEXT;
    `);
    console.log('✅ campaign_groups sütunları eklendi.');

    // 3. marketing_recipients
    await prisma.$executeRawUnsafe(`
        ALTER TABLE "marketing_recipients"
        ADD COLUMN IF NOT EXISTS "retryCount" INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "lastRetryAt" TIMESTAMP(3),
        ADD COLUMN IF NOT EXISTS "autoRetried" BOOLEAN NOT NULL DEFAULT false;
    `);
    console.log('✅ marketing_recipients sütunları eklendi.');

    console.log('🎉 Tüm Pazarlama v3 sütunları başarıyla hazırlandı.');
}

main()
    .catch((e) => {
        console.error('❌ Migration hatası:', e.message);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
