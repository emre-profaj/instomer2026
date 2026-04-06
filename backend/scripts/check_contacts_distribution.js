import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkDistribution() {
  const wsId = 'd91029d6-8b1f-4265-a385-4a40eafc0ac9';
  console.log(`\n--- KIŞI (CONTACT) DURUM VE KATEGORİ DAĞILIMI ---\n`);

  // Group by status
  const statusGrouping = await prisma.contact.groupBy({
    by: ['status'],
    where: { workspaceId: wsId },
    _count: { status: true }
  });

  console.log(`Duruma (Status) Göre Dağılım:`);
  statusGrouping.sort((a, b) => b._count.status - a._count.status).forEach(item => {
    console.log(`- ${item.status || 'BOŞ'}: ${item._count.status}`);
  });

  console.log(`\n-------------------------------------\n`);

  // Group by category
  const categoryGrouping = await prisma.contact.groupBy({
    by: ['category'],
    where: { workspaceId: wsId },
    _count: { category: true }
  });

  console.log(`Kategoriye (Category) Göre Dağılım:`);
  categoryGrouping.sort((a, b) => b._count.category - a._count.category).forEach(item => {
    console.log(`- ${item.category || 'BOŞ'}: ${item._count.category}`);
  });

  console.log(`\n-------------------------------------\n`);

  // Count those that have both as 'HOT_OPPORTUNITY' as a specific check
  const bothHot = await prisma.contact.count({
    where: {
      workspaceId: wsId,
      status: 'HOT_OPPORTUNITY',
      category: 'HOT_OPPORTUNITY'
    }
  });

  // Calculate real total unique Hot Opportunities (status OR category is HOT_OPPORTUNITY)
  const realHot = await prisma.contact.count({
    where: {
      workspaceId: wsId,
      OR: [
        { status: 'HOT_OPPORTUNITY' },
        { category: 'HOT_OPPORTUNITY' }
      ]
    }
  });

  // Calculate real total unique Opportunities (status OR category is OPPORTUNITY)
  const realOpp = await prisma.contact.count({
    where: {
      workspaceId: wsId,
      OR: [
        { status: 'OPPORTUNITY' },
        { category: 'OPPORTUNITY' }
      ]
    }
  });

  console.log(`💡 Özet Analiz:`);
  console.log(`- Sisteminizde (statü veya kategori faketmez) TOPLAM 'Sıcak Fırsat': ${realHot}`);
  console.log(`- Sisteminizde (statü veya kategori faketmez) TOPLAM 'Fırsat': ${realOpp}`);
  console.log(`(Huni sistemine tamamen geçtiğinizde eski ekrandaki gibi sadece ${statusGrouping.find(s=>s.status === 'HOT_OPPORTUNITY')?._count?.status || 0} tane deği, gerçek sayı olan ${realHot} tane göreceksiniz.)\n`);

  await prisma.$disconnect();
}

checkDistribution().catch(e => {
  console.error(e);
  process.exit(1);
});
