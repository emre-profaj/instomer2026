import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkFunnels() {
  const workspaceId = 'd91029d6-8b1f-4265-a385-4a40eafc0ac9';
  console.log(`\n--- Workspace Funnel / Stage İstatistikleri ---`);
  console.log(`Workspace ID: ${workspaceId}\n`);

  const funnels = await prisma.funnel.findMany({
    where: { workspaceId },
    include: {
      stages: true,
      contacts: true
    }
  });

  if (funnels.length === 0) {
    console.log("Bu workspace'e ait henüz tanımlanmış bir Funnel (Huni) yok.");
    process.exit(0);
    return;
  }

  console.log(`Toplam Funnel Sayısı: ${funnels.length}\n`);

  let totalContactsWithFunnel = 0;

  for (const f of funnels) {
    console.log(`\n📌 HUNİ: ${f.name}`);
    console.log(`-------------------------------------`);
    
    // Sort stages by order
    const sortedStages = f.stages.sort((a, b) => a.order - b.order);
    
    let totalFunnelContacts = 0;

    for (const s of sortedStages) {
      const contactCount = await prisma.contact.count({
        where: { funnelStageId: s.id }
      });
      totalFunnelContacts += contactCount;
      console.log(`  - AŞAMA: ${s.name} (${contactCount} kişi)`);
    }

    console.log(`-------------------------------------`);
    console.log(`  Toplam '${f.name}' içindeki kişi: ${totalFunnelContacts}\n`);
    totalContactsWithFunnel += totalFunnelContacts;
  }

  // Find contacts without any funnel configuration
  const noFunnelContactsCount = await prisma.contact.count({
    where: { workspaceId, funnelStageId: null }
  });

  console.log(`Genel İstatistikler:`);
  console.log(`- Funnel sisteminde kayıtlı toplam kişi: ${totalContactsWithFunnel}`);
  console.log(`- Henüz huniye BAĞLANMAMIŞ kişi: ${noFunnelContactsCount}\n`);

  await prisma.$disconnect();
}

checkFunnels().catch(console.error);
