/**
 * 1 Seferlik Veri Düzeltme Script'i
 * 
 * Bu script şunları yapar:
 * 1) funnelType var ama funnelStageId yok → funnelType temizlenir (Genel'e düşer)
 * 2) funnelStageId var ama funnelType yok → stage'in parent funnel'ı atanır
 * 3) Silinmiş stage'e bağlı kişiler → temizlenir
 * 4) Tüm kişi ve konuşmalar akışlarının İLK aşamasına resetlenir
 * 
 * Çalıştırma: node scripts/fix-funnel-data.js
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dir, '..', '.env') });

import prisma from '../lib/prisma.js';

async function fixFunnelData() {
    console.log('🔧 Funnel veri düzeltme başlıyor...\n');

    // ── ADIM 1: funnelType var, funnelStageId yok → funnelType temizle ──
    console.log('── Adım 1: funnelType var ama stage yok ──');
    
    const orphanContacts = await prisma.contact.updateMany({
        where: { funnelType: { not: null }, funnelStageId: null },
        data: { funnelType: null }
    });
    console.log(`   Contacts: ${orphanContacts.count} kişinin funnelType'ı temizlendi`);

    const orphanConvs = await prisma.conversation.updateMany({
        where: { funnelType: { not: null }, funnelStageId: null },
        data: { funnelType: null }
    });
    console.log(`   Conversations: ${orphanConvs.count} konuşmanın funnelType'ı temizlendi`);

    // ── ADIM 2: funnelStageId var, funnelType yok → parent funnel'dan çöz ──
    console.log('\n── Adım 2: Stage var ama funnelType yok ──');

    const stageOrphanContacts = await prisma.contact.findMany({
        where: { funnelStageId: { not: null }, funnelType: null },
        select: { id: true, funnelStageId: true }
    });

    let fixedContacts = 0;
    let clearedContacts = 0;
    for (const c of stageOrphanContacts) {
        const stage = await prisma.funnelStage.findUnique({
            where: { id: c.funnelStageId },
            select: { funnelId: true }
        }).catch(() => null);

        if (stage?.funnelId) {
            await prisma.contact.update({
                where: { id: c.id },
                data: { funnelType: stage.funnelId }
            });
            fixedContacts++;
        } else {
            await prisma.contact.update({
                where: { id: c.id },
                data: { funnelStageId: null }
            });
            clearedContacts++;
        }
    }
    console.log(`   ${fixedContacts} kişiye funnelType atandı, ${clearedContacts} kişinin geçersiz stage'i temizlendi`);

    // Conversations için de aynısı
    const stageOrphanConvs = await prisma.conversation.findMany({
        where: { funnelStageId: { not: null }, funnelType: null },
        select: { id: true, funnelStageId: true }
    });

    let fixedConvs = 0;
    let clearedConvs = 0;
    for (const c of stageOrphanConvs) {
        const stage = await prisma.funnelStage.findUnique({
            where: { id: c.funnelStageId },
            select: { funnelId: true }
        }).catch(() => null);

        if (stage?.funnelId) {
            await prisma.conversation.update({
                where: { id: c.id },
                data: { funnelType: stage.funnelId }
            });
            fixedConvs++;
        } else {
            await prisma.conversation.update({
                where: { id: c.id },
                data: { funnelStageId: null }
            });
            clearedConvs++;
        }
    }
    console.log(`   ${fixedConvs} konuşmaya funnelType atandı, ${clearedConvs} konuşmanın geçersiz stage'i temizlendi`);

    // ── ADIM 3: Herkesi akışının İLK aşamasına resetle ──
    console.log('\n── Adım 3: Tüm kişileri akışlarının ilk aşamasına resetle ──');

    const allFunnels = await prisma.funnel.findMany({
        include: { stages: { orderBy: { order: 'asc' }, take: 1 } }
    });

    let totalContactReset = 0;
    let totalConvReset = 0;

    for (const funnel of allFunnels) {
        const firstStage = funnel.stages[0];
        if (!firstStage) {
            console.log(`   ⚠️ "${funnel.name}" akışının stage'i yok — atlanıyor`);
            continue;
        }

        const contactResult = await prisma.contact.updateMany({
            where: {
                funnelType: funnel.id,
                funnelStageId: { not: firstStage.id }
            },
            data: { funnelStageId: firstStage.id }
        });

        const convResult = await prisma.conversation.updateMany({
            where: {
                funnelType: funnel.id,
                funnelStageId: { not: firstStage.id }
            },
            data: { funnelStageId: firstStage.id }
        });

        if (contactResult.count > 0 || convResult.count > 0) {
            console.log(`   "${funnel.name}" → "${firstStage.name}": ${contactResult.count} kişi, ${convResult.count} konuşma resetlendi`);
        }

        totalContactReset += contactResult.count;
        totalConvReset += convResult.count;
    }

    console.log(`\n   Toplam: ${totalContactReset} kişi, ${totalConvReset} konuşma ilk aşamaya taşındı`);

    // ── ÖZET ──
    console.log('\n════════════════════════════════════');
    console.log('✅ Veri düzeltme tamamlandı!');
    console.log('════════════════════════════════════\n');

    await prisma.$disconnect();
}

fixFunnelData().catch(e => {
    console.error('❌ Script hatası:', e);
    prisma.$disconnect();
    process.exit(1);
});
