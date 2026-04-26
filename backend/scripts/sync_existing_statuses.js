import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function sync() {
  try {
    console.log('🚀 Starting global Contact Status synchronization...');

    // Find all conversations that have a funnelStageId
    const conversations = await prisma.conversation.findMany({
      where: {
        funnelStageId: { not: null },
        contactId: { not: null }
      },
      include: {
        funnelStage: true
      }
    });

    console.log(`📦 Found ${conversations.length} conversations with funnel stages.`);

    let updatedCount = 0;
    for (const conv of conversations) {
      if (!conv.funnelStage || !conv.contactId) continue;

      const stageName = conv.funnelStage.name;
      let newStatus = 'OPPORTUNITY';

      // Mapping logic (same as in controller)
      if (stageName === 'Yeni Başvuru') newStatus = 'NEW';
      else if (stageName === 'Fırsat') newStatus = 'OPPORTUNITY';
      else if (stageName === 'Sıcak Fırsat') newStatus = 'HOT_OPPORTUNITY';
      else if (stageName === 'Satış') newStatus = 'SALE_COMPLETED';
      else if (stageName === 'Kayıp') newStatus = 'LOST';
      else if (stageName === 'İlgisiz') newStatus = 'NOT_INTERESTED';
      else if (stageName === 'Ulaşılamadı') newStatus = 'UNREACHABLE';
      else if (stageName === 'Tekrar Ara') newStatus = 'CALLBACK';
      else if (stageName === 'Teklif Verildi') newStatus = 'OFFER_GIVEN';
      else if (stageName === 'Pazarlık') newStatus = 'NEGOTIATION';
      else if (stageName === 'Sözleşme') newStatus = 'CONTRACT';
      else if (stageName === 'Randevu Planlandı') newStatus = 'APPOINTMENT';
      else if (stageName === 'Bilgi Verildi') newStatus = 'INFO_GIVEN';

      // Update the contact
      await prisma.contact.update({
        where: { id: conv.contactId },
        data: { status: newStatus }
      });
      updatedCount++;
    }

    console.log(`✅ Synchronization complete! Updated ${updatedCount} contact statuses.`);
  } catch (e) {
    console.error('❌ Sync error:', e);
  } finally {
    await prisma.$disconnect();
  }
}

sync();
