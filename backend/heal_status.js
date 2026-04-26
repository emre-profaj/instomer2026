import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function healContactStatuses() {
    const workspaceId = 'd91029d6-8b1f-4265-a385-4a40eafc0ac9';
    console.log('🔄 Veritabanı Kişi Durumları Senkronizasyonu Başlıyor...');

    const stages = await prisma.funnelStage.findMany();
    const stageMap = {};
    stages.forEach(s => stageMap[s.id] = s.name);

    const conversations = await prisma.conversation.findMany({
        where: { workspaceId, funnelStageId: { not: null } },
        include: { contact: true }
    });

    let updated = 0;
    for (const conv of conversations) {
        if (!conv.funnelStageId || !conv.contact) continue;
        const stageName = stageMap[conv.funnelStageId];
        if (!stageName) continue;

        let expectedStatus = 'OPPORTUNITY';
        if (stageName === 'Yeni Başvuru') expectedStatus = 'NEW';
        else if (stageName === 'Fırsat') expectedStatus = 'OPPORTUNITY';
        else if (stageName === 'Sıcak Fırsat') expectedStatus = 'HOT_OPPORTUNITY';
        else if (stageName === 'Satış') expectedStatus = 'SALE_COMPLETED';
        else if (stageName === 'Kayıp') expectedStatus = 'LOST';
        else if (stageName === 'İlgisiz') expectedStatus = 'NOT_INTERESTED';
        else if (stageName === 'Ulaşılamadı') expectedStatus = 'UNREACHABLE';
        else if (stageName === 'Tekrar Ara') expectedStatus = 'CALLBACK';
        else if (stageName === 'Teklif Verildi') expectedStatus = 'OFFER_GIVEN';
        else if (stageName === 'Pazarlık') expectedStatus = 'NEGOTIATION';
        else if (stageName === 'Sözleşme') expectedStatus = 'CONTRACT';
        else if (stageName === 'Randevu Planlandı') expectedStatus = 'APPOINTMENT';
        else if (stageName === 'Bilgi Verildi') expectedStatus = 'INFO_GIVEN';

        if (conv.contact.status !== expectedStatus) {
            await prisma.contact.update({
                where: { id: conv.contact.id },
                data: { status: expectedStatus }
            });
            updated++;
            console.log(`✅ Kişi ${conv.contact.name || ''} durumu -> '${expectedStatus}' (Aşama: ${stageName}) güncellendi.`);
        }
    }

    console.log(`\n🎉 Bitti! Toplam ${updated} kişinin durumu süper bir şekilde senkronize edildi.`);
    await prisma.$disconnect();
}

healContactStatuses().catch(e => { console.error(e); process.exit(1); });
