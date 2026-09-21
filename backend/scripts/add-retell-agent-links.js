/**
 * retell_agent_links tablosunu oluşturur ve mevcut kurulumları taşır.
 *
 * NEDEN: Bir workspace'e tek bir Retell agent'ı bağlanabiliyordu
 * (workspaces.retellAgentId). Retell hesabında birden çok agent olsa bile
 * yalnızca biri "bağlı" sayılıyordu ve bunun sessiz bir bedeli vardı:
 * bağlı olmayan bir agent'a GELEN arama, numara da eşleşmezse
 * "workspace not found" deyip düşüyordu — çağrı Instomer'a hiç girmiyordu.
 *
 * Bu tablo bağlı agent'ların tamamını tutar. workspaces.retellAgentId
 * kalır ve artık "varsayılan agent" anlamına gelir: açıkça agent
 * verilmeyen giden aramalarda kullanılır.
 *
 * `prisma db push` KULLANMIYORUZ: şema ile canlı veritabanı arasında
 * başka farklar var (ör. contacts.widgetVisitorId), push onları da
 * uygulamaya kalkar. Tek tabloyu cerrahi biçimde açıyoruz.
 *
 * DİKKAT: Bu script kodu göndermeden ÖNCE çalıştırılmalı. Tablo yokken
 * onu okuyan kod Prisma hatası verir.
 *
 *   node scripts/add-retell-agent-links.js
 */
import prisma from '../lib/prisma.js';

async function main() {
    await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "retell_agent_links" (
            "id"          TEXT NOT NULL,
            "workspaceId" TEXT NOT NULL,
            "agentId"     TEXT NOT NULL,
            "label"       TEXT,
            "isActive"    BOOLEAN NOT NULL DEFAULT true,
            "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "retell_agent_links_pkey" PRIMARY KEY ("id")
        )
    `);

    await prisma.$executeRawUnsafe(
        `CREATE UNIQUE INDEX IF NOT EXISTS "retell_agent_links_workspaceId_agentId_key"
            ON "retell_agent_links" ("workspaceId", "agentId")`
    );
    await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "retell_agent_links_workspaceId_idx"
            ON "retell_agent_links" ("workspaceId")`
    );
    // Gelen aramada agent_id -> workspace çözümlemesi bu indeksten geçer.
    await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "retell_agent_links_agentId_idx"
            ON "retell_agent_links" ("agentId")`
    );

    // Yabancı anahtar: workspace silinince bağlantılar da gitsin.
    // Zaten varsa hata vermesin diye kontrollü ekleniyor.
    await prisma.$executeRawUnsafe(`
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.table_constraints
                 WHERE constraint_name = 'retell_agent_links_workspaceId_fkey'
            ) THEN
                ALTER TABLE "retell_agent_links"
                  ADD CONSTRAINT "retell_agent_links_workspaceId_fkey"
                  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id")
                  ON DELETE CASCADE ON UPDATE CASCADE;
            END IF;
        END $$;
    `);

    // Sonradan eklenen sütun: her agent'ın kendi arama numarası.
    // Tabloyu daha önce oluşturmuş kurulumlarda da çalışsın diye ayrı.
    await prisma.$executeRawUnsafe(
        `ALTER TABLE "retell_agent_links" ADD COLUMN IF NOT EXISTS "fromNumber" TEXT`
    );
    await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "retell_agent_links_fromNumber_idx"
            ON "retell_agent_links" ("fromNumber")`
    );

    console.log('✅ Tablo hazır: retell_agent_links');

    // ── Mevcut kurulumları taşı ─────────────────────────────────────
    // Bugün bağlı olan tek agent, bağlı agent listesinin ilk üyesi olur.
    // Böylece taşımadan sonra hiçbir workspace'in davranışı değişmez.
    const workspaces = await prisma.workspace.findMany({
        where: { retellAgentId: { not: null } },
        select: { id: true, name: true, retellAgentId: true, retellFromNumber: true }
    });

    let eklenen = 0;
    for (const ws of workspaces) {
        const varMi = await prisma.retellAgentLink.findUnique({
            where: { workspaceId_agentId: { workspaceId: ws.id, agentId: ws.retellAgentId } }
        });
        if (varMi) continue;
        await prisma.retellAgentLink.create({
            data: { workspaceId: ws.id, agentId: ws.retellAgentId, fromNumber: ws.retellFromNumber || null }
        });
        eklenen++;
        console.log(`   + ${ws.name}: ${ws.retellAgentId}`);
    }

    console.log(`✅ Taşındı: ${eklenen} bağlantı (${workspaces.length} workspace'te agent tanımlı)`);

    // fromNumber sonradan eklendiği için, daha önce oluşmuş bağlantılarda
    // boş kalmış olabilir. Varsayılan agent'ın satırına workspace numarasını
    // yaz — böylece taşımadan sonra o agent aynı numaradan aramaya devam eder.
    let numaraDolduruldu = 0;
    for (const ws of workspaces) {
        if (!ws.retellFromNumber) continue;
        const r = await prisma.retellAgentLink.updateMany({
            where: { workspaceId: ws.id, agentId: ws.retellAgentId, fromNumber: null },
            data: { fromNumber: ws.retellFromNumber }
        });
        numaraDolduruldu += r.count;
    }
    console.log(`✅ Numara yazıldı: ${numaraDolduruldu} bağlantı`);
}

main()
    .catch((e) => {
        console.error('❌ Hata:', e.message);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
