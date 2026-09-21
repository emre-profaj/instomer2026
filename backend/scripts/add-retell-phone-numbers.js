/**
 * retell_phone_numbers tablosunu ve conversations.retellPhoneNumberId
 * sütununu oluşturur; mevcut varsayılan numarayı kanal olarak kaydeder.
 *
 * NEDEN: AI Call'da tek bir arama numarası vardı
 * (workspaces.retellFromNumber). Numara aslında bir KANAL: o numaraya
 * gelen ve o numaradan çıkan aramalar birlikte durmalı — tıpkı WhatsApp
 * numaraları gibi (whatsapp_phone_numbers + conversations.whatsappPhoneNumberId).
 *
 * Numara agent'tan BAĞIMSIZDIR. Agent konuşma metnidir; hangi numaradan
 * hangi agent'la arama yapılacağı çağrı anında ayrı ayrı seçilir.
 *
 * `prisma db push` KULLANMIYORUZ: şema ile canlı veritabanı arasında
 * başka farklar var, push onları da uygulamaya kalkar.
 *
 * DİKKAT: Kod gönderilmeden ÖNCE çalıştırılmalı. Tekrar çalıştırılabilir.
 *
 *   node scripts/add-retell-phone-numbers.js
 */
import prisma from '../lib/prisma.js';

async function main() {
    await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "retell_phone_numbers" (
            "id"          TEXT NOT NULL,
            "workspaceId" TEXT NOT NULL,
            "number"      TEXT NOT NULL,
            "label"       TEXT,
            "isActive"    BOOLEAN NOT NULL DEFAULT true,
            "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "retell_phone_numbers_pkey" PRIMARY KEY ("id")
        )
    `);
    await prisma.$executeRawUnsafe(
        `CREATE UNIQUE INDEX IF NOT EXISTS "retell_phone_numbers_workspaceId_number_key"
            ON "retell_phone_numbers" ("workspaceId", "number")`
    );
    await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "retell_phone_numbers_number_idx"
            ON "retell_phone_numbers" ("number")`
    );
    await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "retell_phone_numbers_workspaceId_idx"
            ON "retell_phone_numbers" ("workspaceId")`
    );
    await prisma.$executeRawUnsafe(`
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.table_constraints
                 WHERE constraint_name = 'retell_phone_numbers_workspaceId_fkey'
            ) THEN
                ALTER TABLE "retell_phone_numbers"
                  ADD CONSTRAINT "retell_phone_numbers_workspaceId_fkey"
                  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id")
                  ON DELETE CASCADE ON UPDATE CASCADE;
            END IF;
        END $$;
    `);
    console.log('✅ Tablo hazır: retell_phone_numbers');

    // ── Konuşma ↔ numara bağı ───────────────────────────────────────
    // Numara silinirse konuşma silinmez, bağ kopar (SET NULL).
    await prisma.$executeRawUnsafe(
        `ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "retellPhoneNumberId" TEXT`
    );
    await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "conversations_retellPhoneNumberId_idx"
            ON "conversations" ("retellPhoneNumberId")`
    );
    await prisma.$executeRawUnsafe(`
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.table_constraints
                 WHERE constraint_name = 'conversations_retellPhoneNumberId_fkey'
            ) THEN
                ALTER TABLE "conversations"
                  ADD CONSTRAINT "conversations_retellPhoneNumberId_fkey"
                  FOREIGN KEY ("retellPhoneNumberId") REFERENCES "retell_phone_numbers"("id")
                  ON DELETE SET NULL ON UPDATE CASCADE;
            END IF;
        END $$;
    `);
    console.log('✅ Sütun hazır: conversations.retellPhoneNumberId');

    // ── Mevcut varsayılan numaraları kanal olarak kaydet ────────────
    const workspaces = await prisma.workspace.findMany({
        where: { retellFromNumber: { not: null } },
        select: { id: true, name: true, retellFromNumber: true }
    });

    let eklenen = 0;
    for (const ws of workspaces) {
        const numara = (ws.retellFromNumber || '').trim();
        if (!numara) continue; // boş string'ler kanal olmamalı
        const varMi = await prisma.retellPhoneNumber.findUnique({
            where: { workspaceId_number: { workspaceId: ws.id, number: numara } }
        });
        if (varMi) continue;
        await prisma.retellPhoneNumber.create({
            data: { workspaceId: ws.id, number: numara, label: 'Varsayılan hat' }
        });
        eklenen++;
        console.log(`   + ${ws.name}: ${numara}`);
    }
    console.log(`✅ Kanal olarak kaydedildi: ${eklenen} numara`);
}

main()
    .catch((e) => {
        console.error('❌ Hata:', e.message);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
