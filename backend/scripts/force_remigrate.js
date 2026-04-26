import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const CATEGORY_MAP = {
  'NEW': 'Yeni Başvuru',
  'NEW_APPLICATION': 'Yeni Başvuru',
  'NOT_INTERESTED': 'İlgilenmiyor',
  'INFO_GIVEN': 'Bilgi Verildi',
  'INFO_PROVIDED': 'Bilgi Dönüşü',
  'CUSTOMER': 'Müşteri',
  'OPPORTUNITY': 'Fırsat',
  'HOT_OPPORTUNITY': 'Sıcak Fırsat',
  'COMPLAINT': 'Şikayet / Destek',
  'LOST': 'Kayıp',
  'VIP': 'VIP',
  'PARTNER': 'İş Ortağı',
  'SPAM': 'Spam',
  'BLACKLIST': 'Kara Liste'
};

async function forceRemigrate() {
  console.log('Starting FORCE Contact Funnel Migration...');
  const workspaces = await prisma.workspace.findMany();
  
  for (const ws of workspaces) {
    console.log(`Processing Workspace ${ws.id} - ${ws.name}`);

    const funnels = await prisma.funnel.findMany({
      where: { workspaceId: ws.id },
      include: { stages: true }
    });

    let defaultFunnel = funnels.find(f => f.name === 'Genel CRM (Otomatik İşlem)' || f.name === 'CRM / Müşteriler' || f.name === 'Satış' || f.name === 'Default');
    let targetFunnelId = defaultFunnel?.id || null;
    let fallbackStages = {};

    if (defaultFunnel) {
      defaultFunnel.stages.forEach(s => {
        fallbackStages[s.name] = s.id;
      });
    }

    // DİKKAT: funnelType: null kontrolünü kaldırdık. BÜTÜN KAYITLARI tekrar tarayıp ezecek!
    const contacts = await prisma.contact.findMany({
      where: { workspaceId: ws.id }
    });

    if (contacts.length === 0) continue;

    if (!defaultFunnel) {
       console.log(`  Creating default CRM Funnel for workspace: ${ws.name}`);
       defaultFunnel = await prisma.funnel.create({
         data: {
           workspaceId: ws.id,
           name: 'Genel CRM (Otomatik İşlem)',
           stages: {
             create: Object.values(CATEGORY_MAP).map((value, idx) => ({
                 name: value,
                 color: '#3b82f6',
                 order: idx
             }))
           }
         },
         include: { stages: true }
       });
       targetFunnelId = defaultFunnel.id;
       defaultFunnel.stages.forEach(s => fallbackStages[s.name] = s.id);
    }

    let updated = 0;
    for (const c of contacts) {
       // Sırasıyla kategori veya statüye bak, yoksa NEW kabul et.
       let targetName = CATEGORY_MAP[c.category] || CATEGORY_MAP[c.status] || CATEGORY_MAP['NEW'];
       let targetStageId = fallbackStages[targetName] || null;

       // Sadece eğer bulunmuşsa ve mevcut olandan farklıysa (veya mecburi) ez!
       if(targetStageId) {
         await prisma.contact.update({
           where: { id: c.id },
           data: {
             funnelType: targetFunnelId,
             funnelStageId: targetStageId
           }
         });
         updated++;
       }
    }

    console.log(`  Force Migrated & Fixed ${updated} contacts.`);
  }
}

forceRemigrate().catch(e => {
  console.error(e);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
