/**
 * Migration: appointmentEnabled alanını workspaces tablosuna ekler
 * ve iki workspace için randevu modülünü kapatır.
 * 
 * Kullanım (sunucuda backend klasöründe):
 *   node run_appointment_migration.js
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const WS_TO_DISABLE = [
    'df8b1a97-1ae8-4709-a8fc-1f778bee7380',
    '4fecbe62-aaf9-4499-acb0-80c2b0b58765'
];

async function main() {
    console.log('🚀 Migration başlıyor...\n');

    // ADIM 1: Kolonu ekle (zaten varsa hata vermez)
    try {
        await prisma.$executeRawUnsafe(`
            ALTER TABLE workspaces 
            ADD COLUMN IF NOT EXISTS "appointmentEnabled" BOOLEAN NOT NULL DEFAULT TRUE
        `);
        console.log('✅ ADIM 1: "appointmentEnabled" kolonu eklendi (veya zaten vardı)');
    } catch (err) {
        console.error('❌ ADIM 1 hata:', err.message);
        process.exit(1);
    }

    // ADIM 2: İki workspace için randevuyu kapat
    try {
        const result = await prisma.workspace.updateMany({
            where: {
                id: { in: WS_TO_DISABLE }
            },
            data: {
                appointmentEnabled: false
            }
        });
        console.log(`✅ ADIM 2: ${result.count} workspace için randevu modülü kapatıldı`);
    } catch (err) {
        console.error('❌ ADIM 2 hata:', err.message);
        process.exit(1);
    }

    // ADIM 3: Doğrula
    try {
        const workspaces = await prisma.workspace.findMany({
            where: { id: { in: WS_TO_DISABLE } },
            select: { id: true, name: true, appointmentEnabled: true }
        });

        console.log('\n📋 Sonuç:');
        workspaces.forEach(ws => {
            const icon = ws.appointmentEnabled ? '🟢' : '🔴';
            console.log(`  ${icon} ${ws.name} (${ws.id.slice(0, 8)}...) → appointmentEnabled: ${ws.appointmentEnabled}`);
        });

        if (workspaces.length < WS_TO_DISABLE.length) {
            const found = workspaces.map(w => w.id);
            const notFound = WS_TO_DISABLE.filter(id => !found.includes(id));
            console.warn('\n⚠️  Bulunamayan workspace ID\'ler:', notFound);
        }
    } catch (err) {
        console.warn('⚠️  Doğrulama hatası (non-critical):', err.message);
    }

    console.log('\n✅ Migration tamamlandı!');
    console.log('💡 Sunucuyu yeniden başlatmayı unutmayın: pm2 restart all');
}

main()
    .catch(err => {
        console.error('❌ Kritik hata:', err);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
