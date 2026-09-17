/**
 * workspaces.companyScheduleEnabled sütununu ekler.
 *
 * `prisma db push` KULLANMIYORUZ: şema ile canlı veritabanı arasında
 * başka farklar var, push onları da uygulamaya kalkar. Tek sütunu
 * cerrahi biçimde ekliyoruz.
 *
 * Varsayılan true — 44 çalışma alanının davranışı değişmesin. Yalnızca
 * anahtarı kapatan (ör. Fes Spa) etkilenir.
 *
 * DİKKAT: Bu script kodu göndermeden ÖNCE çalıştırılmalı. Sütun yokken
 * onu select eden kod Prisma hatası verir ve AI cevapları tamamen durur.
 *
 *   node scripts/add-schedule-toggle-column.js
 */
import prisma from '../lib/prisma.js';

async function main() {
    await prisma.$executeRawUnsafe(
        `ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "companyScheduleEnabled" BOOLEAN NOT NULL DEFAULT true`
    );

    const [row] = await prisma.$queryRawUnsafe(
        `SELECT column_name, data_type, column_default, is_nullable
           FROM information_schema.columns
          WHERE table_name = 'workspaces' AND column_name = 'companyScheduleEnabled'`
    );
    if (!row) throw new Error('Sütun eklenemedi');
    console.log('✅ Sütun hazır:', row);

    const counts = await prisma.$queryRawUnsafe(
        `SELECT "companyScheduleEnabled" AS deger, COUNT(*)::int AS adet
           FROM "workspaces" GROUP BY 1 ORDER BY 1`
    );
    console.log('📊 Çalışma alanı dağılımı:', counts);
}

main()
    .catch((e) => { console.error('❌', e.message); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
