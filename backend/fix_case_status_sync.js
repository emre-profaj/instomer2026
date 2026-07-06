/**
 * fix_case_status_sync.js
 * 
 * Eski verilerdeki tutarsızlığı düzeltir:
 * - FunnelStage.isClosing = true olan bir aşamadayken Case.status hâlâ ACTIVE olan case'leri bulur
 * - Bu case'lerin statusunu FunnelStage.statusType'a göre günceller (WON, LOST, CLOSED)
 * - Bağlı conversation'ların statusunu da RESOLVED yapar
 * 
 * Kullanım: node fix_case_status_sync.js [--dry-run]
 *   --dry-run: Sadece kaç kayıt etkileneceğini gösterir, güncelleme yapmaz
 */

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const isDryRun = process.argv.includes('--dry-run');

async function main() {
    console.log(`\n🔧 Case Status Sync Script ${isDryRun ? '(DRY RUN - değişiklik yapılmayacak)' : ''}`);
    console.log('='.repeat(60));

    // 1. Tüm kapanış aşamalarını bul
    const closingStages = await prisma.funnelStage.findMany({
        where: { isClosing: true },
        include: { funnel: { select: { id: true, name: true, workspaceId: true } } }
    });

    console.log(`\n📋 Toplam ${closingStages.length} kapanış aşaması bulundu:`);
    for (const stage of closingStages) {
        console.log(`   - ${stage.name} (${stage.id}) → statusType: ${stage.statusType || 'CLOSED'} | Funnel: ${stage.funnel.name}`);
    }

    const closingStageIds = closingStages.map(s => s.id);
    if (closingStageIds.length === 0) {
        console.log('\n✅ Hiç kapanış aşaması yok, çıkılıyor.');
        return;
    }

    // 2. Bu aşamalarda olup status'u hâlâ ACTIVE olan case'leri bul
    const mismatchedCases = await prisma.case.findMany({
        where: {
            status: 'ACTIVE',
            funnelStageId: { in: closingStageIds }
        },
        include: {
            conversations: { select: { id: true, status: true } },
            contact: { select: { id: true, name: true } }
        }
    });

    console.log(`\n🔍 ${mismatchedCases.length} tutarsız case bulundu (aşama=kapalı, status=ACTIVE)`);

    if (mismatchedCases.length === 0) {
        console.log('\n✅ Tüm case\'ler senkronize, düzeltme gerekmiyor.');
        return;
    }

    // Stage ID → statusType mapping
    const stageStatusMap = {};
    for (const stage of closingStages) {
        stageStatusMap[stage.id] = stage.statusType || 'CLOSED';
    }

    let updatedCases = 0;
    let updatedConversations = 0;

    for (const c of mismatchedCases) {
        const newStatus = stageStatusMap[c.funnelStageId] || 'CLOSED';
        const stageName = closingStages.find(s => s.id === c.funnelStageId)?.name || c.funnelStageId;

        console.log(`\n   📌 Case: ${c.caseNumber || c.id}`);
        console.log(`      Kişi: ${c.contact?.name || 'Bilinmiyor'}`);
        console.log(`      Aşama: ${stageName}`);
        console.log(`      Mevcut Status: ACTIVE → Yeni Status: ${newStatus}`);
        console.log(`      Bağlı ${c.conversations.length} conversation`);

        if (!isDryRun) {
            // Case statusunu güncelle
            await prisma.case.update({
                where: { id: c.id },
                data: {
                    status: newStatus,
                    closedAt: newStatus === 'CLOSED' ? new Date() : undefined,
                    wonAt: newStatus === 'WON' ? new Date() : undefined,
                    lostAt: newStatus === 'LOST' ? new Date() : undefined
                }
            });
            updatedCases++;

            // Bağlı OPEN conversation'ları RESOLVED yap
            for (const conv of c.conversations) {
                if (conv.status === 'OPEN') {
                    await prisma.conversation.update({
                        where: { id: conv.id },
                        data: { status: 'RESOLVED' }
                    });
                    updatedConversations++;
                    console.log(`      ✓ Conversation ${conv.id} → RESOLVED`);
                }
            }
        }
    }

    console.log('\n' + '='.repeat(60));
    if (isDryRun) {
        console.log(`📊 DRY RUN Sonuç: ${mismatchedCases.length} case ve bağlı conversation'lar güncellenmeli`);
        console.log('   Gerçek güncelleme için: node fix_case_status_sync.js');
    } else {
        console.log(`✅ Güncelleme tamamlandı:`);
        console.log(`   - ${updatedCases} case güncellendi`);
        console.log(`   - ${updatedConversations} conversation RESOLVED yapıldı`);
    }
}

main()
    .catch(e => {
        console.error('❌ Script hatası:', e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
