import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkFinalStats() {
  const wsId = 'd91029d6-8b1f-4265-a385-4a40eafc0ac9';
  console.log(`\n=================================================`);
  console.log(`📊 GÜRKAYALAR WORKSPACE İSTATİSTİKLERİ`);
  console.log(`=================================================\n`);

  // 1. SOHBET (CONVERSATION) İSTATİSTİKLERİ
  const openCount = await prisma.conversation.count({ where: { workspaceId: wsId, status: 'OPEN' } });
  const pendingCount = await prisma.conversation.count({ where: { workspaceId: wsId, status: 'PENDING' } });
  const resolvedCount = await prisma.conversation.count({ where: { workspaceId: wsId, status: 'RESOLVED' } });
  const totalConvo = openCount + pendingCount + resolvedCount;

  console.log(`💬 SOHBET (MESAJAŞMA) SAYILARI:`);
  console.log(` - Açık (OPEN): ${openCount}`);
  console.log(` - Beklemede (PENDING): ${pendingCount}`);
  console.log(` - Çözüldü/Kapatıldı (RESOLVED): ${resolvedCount}`);
  console.log(` 👉 TOPLAM SOHBET: ${totalConvo}\n`);
  console.log(`-------------------------------------------------`);

  // 2. KİŞİ/MÜŞTERİ (CONTACT) VE HUNİ DAĞILIMI
  const contacts = await prisma.contact.findMany({
    where: { workspaceId: wsId },
    include: { funnelStage: true }
  });

  const stageCounts = {};
  let totalContacts = 0;
  let noFunnelCount = 0;

  contacts.forEach(c => {
    totalContacts++;
    if (c.funnelStage && c.funnelStage.name) {
      const sName = c.funnelStage.name;
      stageCounts[sName] = (stageCounts[sName] || 0) + 1;
    } else {
      noFunnelCount++;
    }
  });

  console.log(`\n🎯 KİŞİ (MÜŞTERİ) HUNİ DAĞILIMI (Güncel Hali):`);
  console.log(`Sistemde kayıtlı toplam Kişi sayısı: ${totalContacts}`);
  console.log(`\nHuni Aşabalarına Göre Dağılım:`);
  
  // Sort stages by highest count
  const sortedStages = Object.entries(stageCounts).sort((a, b) => b[1] - a[1]);
  
  sortedStages.forEach(([stageName, count]) => {
    // Özel vurgular
    if (stageName === 'Sıcak Fırsat' || stageName === 'HOT_OPPORTUNITY') console.log(` 🔥 ${stageName}: ${count}`);
    else if (stageName === 'Fırsat' || stageName === 'OPPORTUNITY') console.log(` 💡 ${stageName}: ${count}`);
    else if (stageName === 'Yeni Başvuru' || stageName === 'NEW_APPLICATION') console.log(` 🆕 ${stageName}: ${count}`);
    else console.log(` - ${stageName}: ${count}`);
  });

  if (noFunnelCount > 0) {
    console.log(` - Henüz hunisi olmayan/eski kalan: ${noFunnelCount}`);
  }

  console.log(`\n=================================================\n`);
  
  await prisma.$disconnect();
}

checkFinalStats().catch(console.error);
